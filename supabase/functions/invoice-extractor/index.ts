/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INVOICE EXTRACTOR EDGE FUNCTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Extracts structured data from invoice documents using AI Vision (Claude).
 * Called by invoiceExtractionService.ts when AI extraction is enabled.
 *
 * Flow:
 * 1. Receives invoice_id (vendor_invoice_documents.id)
 * 2. Downloads attachment from Supabase Storage or Gmail
 * 3. Sends to Claude Vision API for extraction
 * 4. Returns structured invoice data
 *
 * Environment Variables Required:
 * - ANTHROPIC_API_KEY: Claude API key
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for DB access
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface ExtractedInvoiceData {
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  vendor_name: string | null;
  vendor_address: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  shipping_amount: number | null;
  total_amount: number | null;
  currency: string;
  line_items: Array<{
    description: string;
    quantity: number | null;
    unit_price: number | null;
    total: number | null;
    sku?: string;
  }>;
  po_reference: string | null;
  confidence: number;
  extraction_method: 'ai_vision';
}

interface RequestBody {
  invoice_id: string;
  attachment_base64?: string; // Optional: pre-loaded attachment data
}

// ═══════════════════════════════════════════════════════════════════════════
// CORS Headers
// ═══════════════════════════════════════════════════════════════════════════

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Handler
// ═══════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { invoice_id, attachment_base64 } = await req.json() as RequestBody;

    if (!invoice_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'invoice_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get invoice document record with all related data
    const { data: invoiceDoc, error: docError } = await supabase
      .from('vendor_invoice_documents')
      .select(`
        *,
        email_attachments!attachment_id(
          id,
          gmail_attachment_id,
          filename,
          mime_type,
          storage_path,
          message_id,
          email_thread_messages!message_id(
            gmail_message_id
          )
        ),
        email_threads!email_thread_id(
          inbox_id,
          email_inbox_configs!inbox_id(
            gmail_refresh_token,
            gmail_account
          )
        )
      `)
      .eq('id', invoice_id)
      .single();

    if (docError || !invoiceDoc) {
      console.error('[invoice-extractor] Document not found:', docError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invoice document not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get attachment data
    let attachmentData: string | null = attachment_base64 || null;
    const attachment = invoiceDoc.email_attachments;

    if (!attachmentData && attachment) {
      // Try to get from Supabase Storage first
      if (attachment.storage_path) {
        const { data: storageData, error: storageError } = await supabase
          .storage
          .from('invoices')
          .download(attachment.storage_path);

        if (!storageError && storageData) {
          const arrayBuffer = await storageData.arrayBuffer();
          attachmentData = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        }
      }

      // Fall back to Gmail API if no storage path
      if (!attachmentData && attachment.gmail_attachment_id) {
        const inboxConfig = invoiceDoc.email_threads?.email_inbox_configs;
        // Get gmail_message_id from the nested relationship
        const gmailMessageId = attachment.email_thread_messages?.gmail_message_id;

        if (inboxConfig?.gmail_refresh_token && gmailMessageId) {
          attachmentData = await downloadFromGmail(
            attachment.gmail_attachment_id,
            gmailMessageId,
            inboxConfig.gmail_account,
            inboxConfig.gmail_refresh_token
          );
        }
      }
    }

    if (!attachmentData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not retrieve attachment data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if Anthropic API key is available
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      console.error('[invoice-extractor] ANTHROPIC_API_KEY not set');
      return new Response(
        JSON.stringify({ success: false, error: 'AI extraction not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract invoice data using Claude Vision
    const mimeType = attachment?.mime_type || 'application/pdf';
    const extracted = await extractWithClaude(attachmentData, mimeType, anthropicKey);

    if (!extracted) {
      return new Response(
        JSON.stringify({ success: false, error: 'AI extraction failed to parse invoice' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store attachment in Supabase Storage if not already stored
    if (!attachment?.storage_path && attachmentData) {
      const storagePath = `${invoice_id}/${attachment?.filename || 'invoice.pdf'}`;
      const binaryData = Uint8Array.from(atob(attachmentData), c => c.charCodeAt(0));

      await supabase.storage
        .from('invoices')
        .upload(storagePath, binaryData, {
          contentType: mimeType,
          upsert: true,
        });

      // Update attachment record with storage path
      if (attachment) {
        await supabase
          .from('email_attachments')
          .update({ storage_path: storagePath })
          .eq('id', invoiceDoc.attachment_id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        extracted_data: extracted,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[invoice-extractor] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Claude Vision Extraction
// ═══════════════════════════════════════════════════════════════════════════

async function extractWithClaude(
  base64Data: string,
  mimeType: string,
  apiKey: string
): Promise<ExtractedInvoiceData | null> {
  const systemPrompt = `You are an expert invoice data extractor. Extract structured data from the invoice image/PDF provided.

Return a JSON object with these fields:
{
  "invoice_number": "string or null - the invoice number/ID",
  "invoice_date": "YYYY-MM-DD or null - the invoice date",
  "due_date": "YYYY-MM-DD or null - payment due date",
  "vendor_name": "string or null - the vendor/supplier name",
  "vendor_address": "string or null - vendor address",
  "subtotal": number or null - subtotal before tax/shipping,
  "tax_amount": number or null - tax amount,
  "shipping_amount": number or null - shipping/freight amount,
  "total_amount": number or null - grand total,
  "currency": "USD" - currency code,
  "line_items": [
    {
      "description": "string - item description",
      "quantity": number or null,
      "unit_price": number or null,
      "total": number or null - line total,
      "sku": "string or null - item SKU/part number"
    }
  ],
  "po_reference": "string or null - PO number if mentioned"
}

Important:
- If a field is not visible or unclear, return null
- For amounts, extract only the numeric value (no currency symbols)
- Dates should be in YYYY-MM-DD format
- Extract ALL line items if visible
- Look for PO/Purchase Order references in the document`;

  try {
    // Determine media type for Claude
    let mediaType = mimeType;
    if (mimeType === 'application/pdf') {
      // For PDFs, Claude expects image/png or similar after conversion
      // In practice, we'll send PDFs as is and let Claude handle it
      mediaType = 'application/pdf';
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType.startsWith('image/') ? mediaType : 'image/png',
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: 'Extract all invoice data from this document. Return ONLY the JSON object, no other text.',
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[invoice-extractor] Claude API error:', errorText);
      return null;
    }

    const result = await response.json();
    const content = result.content?.[0]?.text;

    if (!content) {
      console.error('[invoice-extractor] No content in Claude response');
      return null;
    }

    // Parse JSON from response (Claude might include markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonStr.trim());

    // Add extraction metadata
    return {
      ...parsed,
      confidence: 0.85, // Claude Vision is generally high confidence
      extraction_method: 'ai_vision',
    };

  } catch (error) {
    console.error('[invoice-extractor] Claude extraction error:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Gmail Attachment Download
// ═══════════════════════════════════════════════════════════════════════════

async function downloadFromGmail(
  attachmentId: string,
  messageId: string,
  userEmail: string,
  refreshToken: string
): Promise<string | null> {
  try {
    // Exchange refresh token for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: Deno.env.get('GOOGLE_CLIENT_ID') || '',
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      console.error('[invoice-extractor] Failed to refresh Gmail token');
      return null;
    }

    const { access_token } = await tokenResponse.json();

    // Download attachment
    const attachmentUrl = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userEmail)}/messages/${messageId}/attachments/${attachmentId}`;
    const attachmentResponse = await fetch(attachmentUrl, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!attachmentResponse.ok) {
      console.error('[invoice-extractor] Failed to download Gmail attachment');
      return null;
    }

    const { data } = await attachmentResponse.json();
    // Gmail returns base64url encoded, convert to base64
    return data.replace(/-/g, '+').replace(/_/g, '/');

  } catch (error) {
    console.error('[invoice-extractor] Gmail download error:', error);
    return null;
  }
}
