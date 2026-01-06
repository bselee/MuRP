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
  // Multi-invoice document fields
  page_reference?: string;  // e.g., "page 1", "pages 2-3"
  is_part_of_statement?: boolean;  // True if from a consolidated statement
}

// Response type for multi-invoice extraction
interface ExtractionResult {
  document_type: 'single_invoice' | 'multi_invoice_statement' | 'freight_statement' | 'unknown';
  invoices: ExtractedInvoiceData[];
  statement_info?: {
    vendor_name: string;
    statement_date: string | null;
    statement_number: string | null;
    total_invoices: number;
  };
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
// Agent Activity Logging
// ═══════════════════════════════════════════════════════════════════════════

async function logAgentActivity(
  supabase: ReturnType<typeof createClient>,
  activityType: 'observation' | 'analysis' | 'decision' | 'action' | 'completion' | 'error',
  title: string,
  options: {
    description?: string;
    severity?: 'info' | 'success' | 'warning' | 'error';
    inputData?: Record<string, unknown>;
    outputData?: Record<string, unknown>;
    confidenceScore?: number;
    financialImpact?: number;
    relatedPoId?: string;
    relatedSku?: string;
  } = {}
): Promise<void> {
  try {
    await supabase.rpc('log_agent_activity', {
      p_agent_identifier: 'invoice-extractor',
      p_activity_type: activityType,
      p_title: title,
      p_description: options.description || null,
      p_severity: options.severity || 'info',
      p_reasoning: {},
      p_input_data: options.inputData || {},
      p_output_data: options.outputData || {},
      p_context: {},
      p_confidence_score: options.confidenceScore || null,
      p_risk_level: null,
      p_financial_impact: options.financialImpact || null,
      p_requires_review: false,
      p_related_po_id: options.relatedPoId || null,
      p_related_vendor_id: null,
      p_related_sku: options.relatedSku || null,
      p_execution_id: null,
    });
  } catch (err) {
    console.error('[invoice-extractor] Failed to log activity:', err);
  }
}

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

    // Log start of extraction
    await logAgentActivity(supabase, 'observation', `Processing invoice document`, {
      description: `Analyzing ${attachment?.filename || 'attachment'} for invoice extraction`,
      inputData: { invoice_id, filename: attachment?.filename },
    });

    // Extract invoice data using Claude Vision
    const mimeType = attachment?.mime_type || 'application/pdf';
    const extractionResult = await extractWithClaude(attachmentData, mimeType, anthropicKey);

    if (!extractionResult || extractionResult.invoices.length === 0) {
      await logAgentActivity(supabase, 'error', 'Invoice extraction failed', {
        description: 'AI could not parse any invoice data from document',
        severity: 'error',
        inputData: { invoice_id },
      });
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

    // Handle multi-invoice documents: create additional invoice records if needed
    const additionalInvoices: string[] = [];
    if (extractionResult.invoices.length > 1) {
      console.log(`[invoice-extractor] Multi-invoice document detected: ${extractionResult.invoices.length} invoices`);

      // First invoice updates the original record
      // Additional invoices create new records linked to same attachment
      for (let i = 1; i < extractionResult.invoices.length; i++) {
        const inv = extractionResult.invoices[i];
        const { data: newInvoice, error: insertError } = await supabase
          .from('vendor_invoice_documents')
          .insert({
            attachment_id: invoiceDoc.attachment_id,
            email_thread_id: invoiceDoc.email_thread_id,
            po_id: null, // Will need matching
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            total_amount: inv.total_amount,
            vendor_name: inv.vendor_name,
            extraction_status: 'extracted',
            extracted_data: inv,
            source_document_id: invoice_id, // Link to parent document
            page_reference: inv.page_reference,
          })
          .select('id')
          .single();

        if (!insertError && newInvoice) {
          additionalInvoices.push(newInvoice.id);
          console.log(`[invoice-extractor] Created additional invoice record: ${newInvoice.id}`);
        } else {
          console.error(`[invoice-extractor] Failed to create invoice ${i + 1}:`, insertError);
        }
      }
    }

    // Log successful extraction with details
    const firstInvoice = extractionResult.invoices[0];
    const totalAmount = firstInvoice.total_amount;

    await logAgentActivity(supabase, 'action',
      extractionResult.invoices.length > 1
        ? `Extracted ${extractionResult.invoices.length} invoices from ${extractionResult.document_type}`
        : `Extracted invoice ${firstInvoice.invoice_number || 'from document'}`,
      {
        description: firstInvoice.vendor_name
          ? `${firstInvoice.vendor_name}: $${totalAmount?.toFixed(2) || '?'}`
          : `Invoice total: $${totalAmount?.toFixed(2) || '?'}`,
        severity: 'success',
        outputData: {
          document_type: extractionResult.document_type,
          invoice_count: extractionResult.invoices.length,
          invoice_number: firstInvoice.invoice_number,
          vendor: firstInvoice.vendor_name,
          total: totalAmount,
        },
        confidenceScore: firstInvoice.confidence || 0.85,
        financialImpact: totalAmount || undefined,
      }
    );

    // For backward compatibility, return first invoice as extracted_data
    // but also include the full multi-invoice result
    return new Response(
      JSON.stringify({
        success: true,
        extracted_data: extractionResult.invoices[0], // First invoice for backward compat
        extraction_result: extractionResult, // Full result with all invoices
        additional_invoice_ids: additionalInvoices, // IDs of newly created records
        invoice_count: extractionResult.invoices.length,
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
): Promise<ExtractionResult | null> {
  const systemPrompt = `You are an expert invoice data extractor. Your task is to analyze documents and extract ALL invoices contained within.

CRITICAL: Documents may contain MULTIPLE invoices. Common multi-invoice document types include:
- Freight carrier statements (AAA Cooper, FedEx Freight, etc.) with multiple shipment invoices
- Vendor monthly statements consolidating multiple invoices
- Multi-page PDFs with separate invoices on different pages
- Batch invoice documents

FIRST, identify the document type:
1. "single_invoice" - Standard single invoice document
2. "multi_invoice_statement" - Consolidated statement with multiple invoices (e.g., vendor monthly statement)
3. "freight_statement" - Freight carrier statement with multiple shipment invoices
4. "unknown" - Cannot determine

THEN, extract EVERY invoice found in the document.

Return a JSON object with this structure:
{
  "document_type": "single_invoice" | "multi_invoice_statement" | "freight_statement" | "unknown",
  "statement_info": {
    "vendor_name": "string - main vendor/carrier name",
    "statement_date": "YYYY-MM-DD or null",
    "statement_number": "string or null",
    "total_invoices": number
  },
  "invoices": [
    {
      "invoice_number": "string or null - the invoice number/ID",
      "invoice_date": "YYYY-MM-DD or null - the invoice date",
      "due_date": "YYYY-MM-DD or null - payment due date",
      "vendor_name": "string or null - the vendor/supplier name",
      "vendor_address": "string or null - vendor address",
      "subtotal": number or null,
      "tax_amount": number or null,
      "shipping_amount": number or null,
      "total_amount": number or null,
      "currency": "USD",
      "line_items": [
        {
          "description": "string - item description",
          "quantity": number or null,
          "unit_price": number or null,
          "total": number or null,
          "sku": "string or null - item SKU/part number"
        }
      ],
      "po_reference": "string or null - PO number if mentioned",
      "page_reference": "string - which page(s) this invoice appears on, e.g., 'page 1' or 'pages 2-3'",
      "is_part_of_statement": true | false
    }
  ]
}

IMPORTANT EXTRACTION RULES:
- If a field is not visible or unclear, return null
- For amounts, extract only the numeric value (no currency symbols)
- Dates should be in YYYY-MM-DD format
- Extract ALL line items for each invoice
- Look for PO/Purchase Order references in each invoice
- For freight statements: each shipment/PRO number is typically a separate invoice
- For monthly statements: each invoice number listed is a separate invoice to extract
- ALWAYS return an array of invoices, even if there's only one
- Include page_reference to help identify where each invoice was found`;

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
                text: 'Analyze this document carefully. Determine if it contains a SINGLE invoice or MULTIPLE invoices (like a freight statement or monthly statement). Extract ALL invoices found. Return ONLY the JSON object with document_type, statement_info (if applicable), and invoices array.',
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

    // Handle both old format (single invoice) and new format (multi-invoice)
    let result: ExtractionResult;

    if (parsed.invoices && Array.isArray(parsed.invoices)) {
      // New multi-invoice format
      result = {
        document_type: parsed.document_type || 'unknown',
        invoices: parsed.invoices.map((inv: ExtractedInvoiceData) => ({
          ...inv,
          confidence: 0.85,
          extraction_method: 'ai_vision' as const,
          is_part_of_statement: parsed.document_type !== 'single_invoice',
        })),
        statement_info: parsed.statement_info,
      };
    } else {
      // Legacy single invoice format - wrap in new structure
      result = {
        document_type: 'single_invoice',
        invoices: [{
          ...parsed,
          confidence: 0.85,
          extraction_method: 'ai_vision' as const,
          is_part_of_statement: false,
        }],
      };
    }

    console.log(`[invoice-extractor] Extracted ${result.invoices.length} invoice(s) from ${result.document_type}`);
    return result;

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
