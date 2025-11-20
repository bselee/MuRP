import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import pdfjsLib from 'npm:pdfjs-dist/legacy/build/pdf.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GMAIL_CLIENT_ID = Deno.env.get('GMAIL_WEBHOOK_CLIENT_ID')!;
const GMAIL_CLIENT_SECRET = Deno.env.get('GMAIL_WEBHOOK_CLIENT_SECRET')!;
const GMAIL_REFRESH_TOKEN = Deno.env.get('GMAIL_WEBHOOK_REFRESH_TOKEN')!;
const GMAIL_WEBHOOK_USER = Deno.env.get('GMAIL_WEBHOOK_USER') || 'me';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

(pdfjsLib as any).GlobalWorkerOptions.workerSrc =
  'https://esm.sh/pdfjs-dist@4.3.136/legacy/build/pdf.worker.js';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return new Response(req.headers.get('X-Goog-Resource-State') ?? 'ok', {
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();
    const pushMessage = body?.message;
    const encodedData = pushMessage?.data;

    if (!encodedData) {
      console.warn('[gmail-webhook] Missing message data');
      return new Response(JSON.stringify({ success: false, reason: 'no-data' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const decoded = decodeBase64(encodedData);
    let notification: any = {};
    try {
      notification = JSON.parse(decoded);
    } catch (error) {
      console.error('[gmail-webhook] Failed to parse notification payload:', error);
    }

    const attributes = pushMessage?.attributes || {};

    const messageId =
      notification?.messageId ||
      attributes?.messageId ||
      notification?.emailMessageId ||
      notification?.id;

    if (!messageId) {
      console.warn('[gmail-webhook] No messageId found in notification:', notification);
      return new Response(JSON.stringify({ success: false, reason: 'no-message-id' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getGmailAccessToken();
    const gmailMessage = await fetchGmailMessage(messageId, accessToken);

    if (!gmailMessage) {
      console.warn('[gmail-webhook] Gmail message not found for id', messageId);
      return new Response(JSON.stringify({ success: false, reason: 'message-not-found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const threadId = gmailMessage.threadId;
    const poRecord = await resolvePurchaseOrder(gmailMessage, threadId);

    if (!poRecord) {
      console.warn('[gmail-webhook] No matching PO for message', messageId);
      return new Response(JSON.stringify({ success: false, reason: 'po-not-found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await updateEmailTrackingRecord(poRecord.id, {
      gmailHistoryId: notification?.historyId || attributes?.historyId || null,
      lastReplyAt: new Date().toISOString(),
      lastReplyMessageId: messageId,
      gmailThreadId: threadId,
      labelIds: gmailMessage.labelIds ?? [],
    });

    const { bodyText, attachmentsText } = await extractMessageContent(gmailMessage, accessToken);
    const combinedText = `${bodyText}\n\n${attachmentsText}`.trim();

    if (!combinedText) {
      console.log('[gmail-webhook] No textual content found for message', messageId);
      return new Response(JSON.stringify({ success: true, updated: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parseResult = await analyzeEmailWithAI({
      subject: gmailMessage.payload?.headers?.find((h: any) => h.name === 'Subject')?.value ?? '',
      vendor: poRecord.vendor_name,
      to: gmailMessage.payload?.headers?.find((h: any) => h.name === 'To')?.value ?? '',
      from: gmailMessage.payload?.headers?.find((h: any) => h.name === 'From')?.value ?? '',
      content: combinedText,
    });

    if (!parseResult) {
      return new Response(JSON.stringify({ success: true, updated: false, reason: 'no-parse' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await applyTrackingUpdate(poRecord.id, parseResult);

    return new Response(JSON.stringify({ success: true, updated: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[gmail-webhook] Unexpected error', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

async function getGmailAccessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh Gmail token: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function fetchGmailMessage(messageId: string, accessToken: string) {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(GMAIL_WEBHOOK_USER)}/messages/${messageId}?format=full`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    console.error('[gmail-webhook] Failed to fetch message', messageId, await response.text());
    return null;
  }

  return await response.json();
}

function decodeBase64(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = normalized + (pad ? '='.repeat(4 - pad) : '');
  const decoded = atob(padded);
  return decoded;
}

async function resolvePurchaseOrder(message: any, threadId?: string) {
  if (threadId) {
    const { data } = await supabase
      .from('po_email_tracking')
      .select('po_id')
      .eq('gmail_thread_id', threadId)
      .maybeSingle();

    if (data?.po_id) {
      const { data: po } = await supabase
        .from('purchase_orders')
        .select('id, order_id, vendor_name')
        .eq('id', data.po_id)
        .maybeSingle();
      if (po) return po;
    }
  }

  const subject =
    message?.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '';
  const poMatch = subject.match(/PO[-\s#]*(\d{4,})/i);

  if (poMatch?.[1]) {
    const identifier = `PO-${poMatch[1]}`;
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('id, order_id, vendor_name')
      .eq('order_id', identifier)
      .maybeSingle();
    if (po) return po;
  }

  return null;
}

async function updateEmailTrackingRecord(
  poId: string,
  data: { gmailHistoryId?: string | null; lastReplyAt?: string; lastReplyMessageId?: string; gmailThreadId?: string | null; labelIds?: string[] },
) {
  const updates: Record<string, any> = {
    last_reply_at: data.lastReplyAt ?? new Date().toISOString(),
    last_reply_message_id: data.lastReplyMessageId ?? null,
    gmail_history_id: data.gmailHistoryId ?? null,
    metadata: { labelIds: data.labelIds ?? [] },
  };

  if (data.gmailThreadId) {
    updates.gmail_thread_id = data.gmailThreadId;
  }

  const query = supabase.from('po_email_tracking').update(updates);
  if (data.gmailThreadId) {
    query.eq('gmail_thread_id', data.gmailThreadId);
  } else {
    query.eq('po_id', poId);
  }
  await query;
}

async function extractMessageContent(message: any, accessToken: string) {
  const bodyTextParts: string[] = [];
  const attachmentTextParts: string[] = [];

  const traverseParts = async (part: any) => {
    if (!part) return;

    if (part.mimeType === 'text/plain' && part.body?.data) {
      bodyTextParts.push(decodeBase64(part.body.data));
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      const text = decodeBase64(part.body.data).replace(/<[^>]*>/g, ' ');
      bodyTextParts.push(text);
    } else if (part.filename && part.body?.attachmentId) {
      const attachmentData = await fetchAttachment(message.id, part.body.attachmentId, accessToken);
      if (!attachmentData) return;

      if (part.mimeType === 'application/pdf') {
        const text = await extractTextFromPdf(attachmentData);
        attachmentTextParts.push(`Attachment: ${part.filename}\n${text}`);
      }
    }

    if (part.parts && Array.isArray(part.parts)) {
      for (const nestedPart of part.parts) {
        await traverseParts(nestedPart);
      }
    }
  };

  await traverseParts(message.payload);

  const fallbackSnippet = message.snippet ? `${message.snippet}` : '';

  return {
    bodyText: (bodyTextParts.join('\n').trim() || fallbackSnippet).slice(0, 15000),
    attachmentsText: attachmentTextParts.join('\n').slice(0, 15000),
  };
}

async function fetchAttachment(messageId: string, attachmentId: string, accessToken: string) {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(GMAIL_WEBHOOK_USER)}/messages/${messageId}/attachments/${attachmentId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    console.warn('[gmail-webhook] Failed to fetch attachment', attachmentId, await response.text());
    return null;
  }

  const data = await response.json();
  if (!data?.data) return null;

  return base64ToUint8Array(data.data);
}

async function extractTextFromPdf(pdfBytes: Uint8Array): Promise<string> {
  try {
    const loadingTask = (pdfjsLib as any).getDocument({ data: pdfBytes });
    const pdf = await loadingTask.promise;
    let text = '';
    const maxPages = Math.min(pdf.numPages, 8);

    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const strings = content.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ');
      text += strings + '\n';
    }

    if (pdf.numPages > maxPages) {
      text += `\n[Truncated ${pdf.numPages - maxPages} additional page(s)]`;
    }

    return text;
  } catch (error) {
    console.error('[gmail-webhook] Failed to extract PDF text', error);
    return '';
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  const decoded = decodeBase64(base64);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return bytes;
}

interface ParsedTrackingResult {
  trackingNumber?: string | null;
  carrier?: string | null;
  status?: string;
  expectedDelivery?: string | null;
  notes?: string | null;
  action?: string;
}

async function analyzeEmailWithAI(context: {
  subject: string;
  vendor: string;
  to: string;
  from: string;
  content: string;
}): Promise<ParsedTrackingResult | null> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[gmail-webhook] ANTHROPIC_API_KEY not configured, skipping AI parsing');
    return null;
  }

  const prompt = `
You are an assistant that extracts purchase order tracking updates from vendor emails.

Subject: ${context.subject}
From: ${context.from}
To: ${context.to}
Body + Attachments:
"""
${context.content.slice(0, 12000)}
"""

Return ONLY JSON with this shape:
{
  "trackingNumber": "1Z123" | null,
  "carrier": "UPS" | null,
  "status": "awaiting_confirmation" | "confirmed" | "processing" | "shipped" | "in_transit" | "out_for_delivery" | "delivered" | "exception" | "cancelled",
  "expectedDelivery": "YYYY-MM-DD" | null,
  "notes": "Any additional details",
  "action": "confirmation" | "tracking_update" | "exception" | "other"
}

If the email simply confirms receipt without tracking, set status to "confirmed".
`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 800,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error('[gmail-webhook] Anthropic API error', response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const raw = data?.content?.[0]?.text ?? '';
  const json = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(json);
  } catch (error) {
    console.error('[gmail-webhook] Failed to parse AI response', error, json);
    return null;
  }
}

function normalizeStatus(input?: string | null) {
  if (!input) return 'processing';
  const normalized = input.toLowerCase();
  const map: Record<string, string> = {
    awaiting_confirmation: 'awaiting_confirmation',
    confirmed: 'confirmed',
    processing: 'processing',
    shipped: 'shipped',
    'in transit': 'in_transit',
    in_transit: 'in_transit',
    out_for_delivery: 'out_for_delivery',
    delivered: 'delivered',
    exception: 'exception',
    cancelled: 'cancelled',
  };

  return (map[normalized] ?? 'processing') as any;
}

function normalizeCarrier(input?: string | null) {
  if (!input) return null;
  const key = input.toLowerCase();
  if (key.includes('ups')) return 'ups';
  if (key.includes('fedex')) return 'fedex';
  if (key.includes('usps') || key.includes('postal')) return 'usps';
  if (key.includes('dhl')) return 'dhl';
  return input;
}

async function applyTrackingUpdate(poId: string, parsed: ParsedTrackingResult) {
  const status = normalizeStatus(parsed.status);
  const carrier = normalizeCarrier(parsed.carrier);

  const updates: Record<string, any> = {
    tracking_status: status,
    tracking_last_checked_at: new Date().toISOString(),
  };

  if (parsed.trackingNumber) {
    updates.tracking_number = parsed.trackingNumber;
  }
  if (carrier) {
    updates.tracking_carrier = carrier;
  }
  if (parsed.expectedDelivery) {
    updates.tracking_estimated_delivery = parsed.expectedDelivery;
  }
  if (status === 'delivered') {
    updates.actual_receive_date = parsed.expectedDelivery ?? new Date().toISOString().split('T')[0];
    updates.received_at = new Date().toISOString();
  }

  await supabase
    .from('purchase_orders')
    .update(updates)
    .eq('id', poId);

  await supabase.from('po_tracking_events').insert({
    po_id: poId,
    status,
    carrier,
    tracking_number: parsed.trackingNumber ?? null,
    description: parsed.notes ?? parsed.action ?? 'Vendor update',
    raw_payload: parsed,
  });
}
