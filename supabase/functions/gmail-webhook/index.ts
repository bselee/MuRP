import { createShipment, createTrackingEvent } from './shipmentTrackingService.ts';

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

type VendorResponseStatus =
  | 'pending_response'
  | 'vendor_responded'
  | 'verified_confirmed'
  | 'verified_with_issues'
  | 'requires_clarification'
  | 'vendor_non_responsive'
  | 'cancelled';

interface VendorEmailAIConfig {
  enabled: boolean;
  maxEmailsPerHour: number;
  maxDailyCostUsd: number;
  minConfidence: number;
  keywordFilters: string[];
  maxBodyCharacters: number;
}

const DEFAULT_VENDOR_EMAIL_AI_CONFIG: VendorEmailAIConfig = {
  enabled: true,
  maxEmailsPerHour: 60,
  maxDailyCostUsd: 1.5,
  minConfidence: 0.65,
  keywordFilters: ['tracking', 'shipped', 'delivery', 'invoice', 'confirm'],
  maxBodyCharacters: 16000,
};

const AI_PRICING = { input: 0.8, output: 4.0 }; // $ per million tokens (Anthropic Haiku)
const AI_COST_SERVICE = 'vendor_email_parsing';
let cachedVendorAIConfig: { config: VendorEmailAIConfig; expiresAt: number } | null = null;

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

    const subjectHeader = getHeader(gmailMessage, 'Subject') ?? '';
    const fromHeader = getHeader(gmailMessage, 'From') ?? '';
    const toHeader = getHeader(gmailMessage, 'To') ?? '';
    const receivedAt = new Date().toISOString();
    const { bodyText, attachmentsText, attachments } = await extractMessageContent(gmailMessage, accessToken);
    const combinedText = `${bodyText}\n\n${attachmentsText}`.trim();
    const invoiceSignal = detectInvoiceSignal({
      subject: subjectHeader,
      from: fromHeader,
      bodyText,
      attachmentsText,
      attachments,
    });

    let vendorResponseStatus: VendorResponseStatus = invoiceSignal?.detected ? 'requires_clarification' : 'vendor_responded';
    let vendorResponseSummary: any = invoiceSignal?.detected ? invoiceSignal : null;

    // Check if AI detected invoice data
    const hasInvoiceData = parsed?.invoiceData && parsed.status === 'invoice_received';

    if (hasInvoiceData) {
      vendorResponseStatus = 'requires_clarification';
      vendorResponseSummary = {
        ...vendorResponseSummary,
        invoice_data: parsed.invoiceData,
        extracted_by: 'ai'
      };
    }

    if ((invoiceSignal?.detected || hasInvoiceData) && poRecord.invoice_gmail_message_id !== messageId) {
      await recordInvoiceReceipt(poRecord, messageId, invoiceSignal, hasInvoiceData ? parsed?.invoiceData : undefined);
    }

    const correlationConfidence = threadId ? 0.95 : 0.7;
    const communicationMetadata: Record<string, any> = {
      labelIds: gmailMessage.labelIds ?? [],
      invoiceSignal,
    };

    await recordVendorCommunication({
      poId: poRecord.id,
      communicationType: invoiceSignal?.detected ? 'vendor_invoice' : 'vendor_reply',
      direction: 'inbound',
      gmailMessageId: messageId,
      gmailThreadId: threadId,
      subject: subjectHeader || 'Purchase Order Update',
      bodyPreview: combinedText.slice(0, 800),
      senderEmail: fromHeader || null,
      recipientEmail: toHeader || null,
      receivedAt,
      attachments,
      metadata: communicationMetadata,
      correlationConfidence,
    });

    if (!combinedText) {
      communicationMetadata.aiDecision = 'no-text';
      await annotateVendorCommunication(messageId, { metadata: communicationMetadata });
      await markFollowUpResponse(poRecord.id, {
        vendorStatus: vendorResponseStatus,
        summary: vendorResponseSummary,
        messageId,
        threadId,
        receivedAt,
      });
      console.log('[gmail-webhook] No textual content found for message', messageId);
      return new Response(JSON.stringify({ success: true, updated: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiConfig = await getVendorEmailAIConfig();
    const aiEligibility = await shouldProcessEmailWithAI(aiConfig, {
      subject: subjectHeader,
      body: combinedText,
    });

    if (!aiEligibility.allowed) {
      communicationMetadata.aiDecision = aiEligibility.reason ?? 'skipped';
      await annotateVendorCommunication(messageId, { metadata: communicationMetadata });
      await markFollowUpResponse(poRecord.id, {
        vendorStatus: vendorResponseStatus,
        summary: vendorResponseSummary,
        messageId,
        threadId,
        receivedAt,
      });
      return new Response(JSON.stringify({ success: true, updated: false, reason: aiEligibility.reason ?? 'skipped' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiInput = combinedText.slice(0, aiConfig.maxBodyCharacters);
    const aiAnalysis = await analyzeEmailWithAI(
      {
        subject: subjectHeader,
        vendor: poRecord.vendor_name,
        to: toHeader,
        from: fromHeader,
        content: aiInput,
      },
      aiConfig,
    );

    if (!aiAnalysis) {
      communicationMetadata.aiDecision = 'no-parse';
      await annotateVendorCommunication(messageId, { metadata: communicationMetadata });
      await markFollowUpResponse(poRecord.id, {
        vendorStatus: vendorResponseStatus,
        summary: vendorResponseSummary,
        messageId,
        threadId,
        receivedAt,
      });
      return new Response(JSON.stringify({ success: true, updated: false, reason: 'no-parse' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await recordAICost({
      costUsd: aiAnalysis.costUsd,
      inputTokens: aiAnalysis.inputTokens,
      outputTokens: aiAnalysis.outputTokens,
    });

    const parsed = aiAnalysis.parsed;
    if (!parsed) {
      communicationMetadata.aiDecision = 'empty-response';
      await annotateVendorCommunication(messageId, { metadata: communicationMetadata });
      await markFollowUpResponse(poRecord.id, {
        vendorStatus: vendorResponseStatus,
        summary: vendorResponseSummary,
        messageId,
        threadId,
        receivedAt,
      });
      return new Response(JSON.stringify({ success: true, updated: false, reason: 'empty-response' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (typeof parsed.confidence === 'number' && parsed.confidence < aiConfig.minConfidence) {
      communicationMetadata.aiDecision = 'low-confidence';
      communicationMetadata.aiConfidence = parsed.confidence;
      await annotateVendorCommunication(messageId, { metadata: communicationMetadata });
      await markFollowUpResponse(poRecord.id, {
        vendorStatus: vendorResponseStatus,
        summary: vendorResponseSummary,
        messageId,
        threadId,
        receivedAt,
      });
      return new Response(JSON.stringify({ success: true, updated: false, reason: 'low-confidence' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    vendorResponseStatus = deriveVendorResponseStatus(parsed);
    vendorResponseSummary = parsed;

    communicationMetadata.aiDecision = 'parsed';
    communicationMetadata.aiConfidence = parsed.confidence ?? null;
    communicationMetadata.aiCostUsd = aiAnalysis.costUsd;

    // Annotate with workbench fields for response queue
    await annotateVendorCommunication(messageId, {
      metadata: communicationMetadata,
      extracted_data: parsed,
      ai_confidence: parsed.confidence ?? null,
      ai_cost_usd: aiAnalysis.costUsd,
      ai_extracted: true,
      // Response workbench fields
      response_category: parsed.responseCategory ?? 'other',
      suggested_action: parsed.suggestedAction ?? 'review_required',
      action_reasoning: parsed.actionReasoning ?? null,
      requires_user_action: parsed.requiresUserResponse ?? true,
    });

    await applyTrackingUpdate(poRecord.id, parsed);
    await markFollowUpResponse(poRecord.id, {
      vendorStatus: vendorResponseStatus,
      summary: vendorResponseSummary,
      messageId,
      threadId,
      receivedAt,
    });

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
        .select('id, order_id, vendor_name, invoice_gmail_message_id')
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
      .select('id, order_id, vendor_name, invoice_gmail_message_id')
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

interface AttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
}

async function extractMessageContent(message: any, accessToken: string) {
  const bodyTextParts: string[] = [];
  const attachmentTextParts: string[] = [];
  const attachmentsMeta: AttachmentMeta[] = [];

  const traverseParts = async (part: any) => {
    if (!part) return;

    if (part.mimeType === 'text/plain' && part.body?.data) {
      bodyTextParts.push(decodeBase64(part.body.data));
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      const text = decodeBase64(part.body.data).replace(/<[^>]*>/g, ' ');
      bodyTextParts.push(text);
    } else if (part.filename && part.body?.attachmentId) {
      attachmentsMeta.push({
        filename: part.filename,
        mimeType: part.mimeType ?? 'application/octet-stream',
        size: part.body?.size ?? 0,
      });
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
    attachments: attachmentsMeta,
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

function getHeader(message: any, name: string): string | null {
  const target = name.toLowerCase();
  return (
    message?.payload?.headers?.find(
      (header: any) => typeof header?.name === 'string' && header.name.toLowerCase() === target,
    )?.value ?? null
  );
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

async function getVendorEmailAIConfig(): Promise<VendorEmailAIConfig> {
  if (cachedVendorAIConfig && cachedVendorAIConfig.expiresAt > Date.now()) {
    return cachedVendorAIConfig.config;
  }

  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'vendor_email_ai_config')
    .maybeSingle();

  const config = {
    ...DEFAULT_VENDOR_EMAIL_AI_CONFIG,
    ...(error ? {} : (data?.setting_value as VendorEmailAIConfig | null) ?? {}),
  };

  cachedVendorAIConfig = {
    config,
    expiresAt: Date.now() + 60_000,
  };

  return config;
}

async function ensureAiBudget(config: VendorEmailAIConfig): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (config.maxEmailsPerHour > 0) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from('po_vendor_communications')
        .select('id', { head: true, count: 'exact' })
        .eq('ai_extracted', true)
        .gte('created_at', oneHourAgo);
      if (!error && (count ?? 0) >= config.maxEmailsPerHour) {
        return { ok: false, reason: 'rate_limited' };
      }
    }

    if (config.maxDailyCostUsd > 0) {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('ai_purchasing_costs')
        .select('cost_usd')
        .eq('service_name', AI_COST_SERVICE)
        .eq('date', today);
      if (!error) {
        const spent = (data || []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
        if (spent >= config.maxDailyCostUsd) {
          return { ok: false, reason: 'budget_exceeded' };
        }
      }
    }

    return { ok: true };
  } catch (error) {
    console.error('[gmail-webhook] Budget check failed', error);
    return { ok: true };
  }
}

async function shouldProcessEmailWithAI(
  config: VendorEmailAIConfig,
  payload: { subject: string; body: string },
): Promise<{ allowed: boolean; reason?: string }> {
  if (!config.enabled) return { allowed: false, reason: 'disabled' };
  if (!payload.body.trim()) return { allowed: false, reason: 'empty' };

  const haystack = `${payload.subject}\n${payload.body}`.toLowerCase();
  const keywordMatched = config.keywordFilters.some((keyword) => haystack.includes(keyword.toLowerCase()));
  if (!keywordMatched) {
    return { allowed: false, reason: 'keyword_filter' };
  }

  const budget = await ensureAiBudget(config);
  if (!budget.ok) {
    return { allowed: false, reason: budget.reason };
  }

  return { allowed: true };
}

async function recordVendorCommunication(entry: {
  poId: string;
  communicationType: string;
  direction: 'inbound' | 'outbound';
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  subject?: string | null;
  bodyPreview?: string | null;
  senderEmail?: string | null;
  recipientEmail?: string | null;
  sentAt?: string | null;
  receivedAt?: string | null;
  attachments?: AttachmentMeta[] | null;
  metadata?: Record<string, any> | null;
  correlationConfidence?: number | null;
}) {
  const payload = {
    po_id: entry.poId,
    communication_type: entry.communicationType,
    direction: entry.direction,
    gmail_message_id: entry.gmailMessageId ?? null,
    gmail_thread_id: entry.gmailThreadId ?? null,
    subject: entry.subject ?? null,
    body_preview: entry.bodyPreview ?? null,
    sender_email: entry.senderEmail ?? null,
    recipient_email: entry.recipientEmail ?? null,
    sent_at: entry.sentAt ?? null,
    received_at: entry.receivedAt ?? null,
    attachments: entry.attachments ?? null,
    metadata: entry.metadata ?? null,
    correlation_confidence: entry.correlationConfidence ?? null,
  };

  if (entry.gmailMessageId) {
    await supabase.from('po_vendor_communications').upsert(payload, { onConflict: 'gmail_message_id' });
  } else {
    await supabase.from('po_vendor_communications').insert(payload);
  }
}

async function annotateVendorCommunication(gmailMessageId: string | null, updates: Record<string, any>) {
  if (!gmailMessageId) return;
  await supabase
    .from('po_vendor_communications')
    .update(updates)
    .eq('gmail_message_id', gmailMessageId);
}

function deriveVendorResponseStatus(parsed: ParsedTrackingResult | null): VendorResponseStatus {
  if (!parsed?.status) return 'vendor_responded';
  const normalized = parsed.status.toLowerCase();
  if (normalized === 'delivered') return 'verified_confirmed';
  if (normalized === 'exception' || normalized === 'cancelled') return 'verified_with_issues';
  return 'vendor_responded';
}

async function recordAICost(details: { costUsd: number; inputTokens: number; outputTokens: number }) {
  try {
    await supabase.from('ai_purchasing_costs').insert({
      date: new Date().toISOString().split('T')[0],
      service_name: AI_COST_SERVICE,
      model_name: 'claude-3-5-haiku-20241022',
      provider: 'anthropic',
      input_tokens: details.inputTokens,
      output_tokens: details.outputTokens,
      total_tokens: details.inputTokens + details.outputTokens,
      cost_usd: details.costUsd,
      calls_count: 1,
      execution_time_ms: 0,
      success: true,
    });
  } catch (error) {
    console.error('[gmail-webhook] Failed to record AI cost', error);
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

// Response category types for the workbench
type VendorResponseCategory =
  | 'shipment_confirmation'
  | 'delivery_update'
  | 'delivery_exception'
  | 'price_change'
  | 'out_of_stock'
  | 'substitution_offer'
  | 'invoice_attached'
  | 'order_confirmation'
  | 'lead_time_update'
  | 'general_inquiry'
  | 'thank_you'
  | 'other';

type VendorSuggestedAction =
  | 'acknowledge_receipt'
  | 'confirm_acceptance'
  | 'request_clarification'
  | 'approve_pricing'
  | 'reject_pricing'
  | 'update_inventory'
  | 'escalate_to_manager'
  | 'forward_to_ap'
  | 'update_po_tracking'
  | 'create_backorder'
  | 'no_action_required'
  | 'review_required';

interface ParsedTrackingResult {
  trackingNumber?: string | null;
  carrier?: string | null;
  status?: string;
  expectedDelivery?: string | null;
  notes?: string | null;
  action?: string;
  confidence?: number | null;
  invoiceData?: any;
  // Enhanced fields for response workbench
  responseCategory?: VendorResponseCategory;
  suggestedAction?: VendorSuggestedAction;
  actionReasoning?: string;
  requiresUserResponse?: boolean;
  pricingData?: any;
  stockData?: any;
  extractedDetails?: {
    keyPoints?: string[];
    datesMentioned?: string[];
    amountsMentioned?: { value: number; context: string }[];
    actionItems?: string[];
    urgency?: 'low' | 'medium' | 'high';
  };
}

interface AIAnalysisResult {
  parsed: ParsedTrackingResult | null;
  rawText: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

async function analyzeEmailWithAI(
  context: {
    subject: string;
    vendor: string;
    to: string;
    from: string;
    content: string;
  },
  aiConfig: VendorEmailAIConfig,
): Promise<AIAnalysisResult | null> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[gmail-webhook] ANTHROPIC_API_KEY not configured, skipping AI parsing');
    return null;
  }

  const prompt = `
You are an intelligent assistant that analyzes vendor emails for purchase order management. Your job is to:
1. Classify the email into a response category
2. Extract relevant data (tracking, pricing, stock status, etc.)
3. Recommend an action for the purchasing team
4. Assess if this requires a human response

Subject: ${context.subject}
From: ${context.from}
To: ${context.to}
Vendor: ${context.vendor}
Body + Attachments:
"""
${context.content.slice(0, 12000)}
"""

Analyze this email and return JSON with this structure:
{
  "response_category": "shipment_confirmation" | "delivery_update" | "delivery_exception" | "price_change" | "out_of_stock" | "substitution_offer" | "invoice_attached" | "order_confirmation" | "lead_time_update" | "general_inquiry" | "thank_you" | "other",
  
  "suggested_action": "acknowledge_receipt" | "confirm_acceptance" | "request_clarification" | "approve_pricing" | "reject_pricing" | "update_inventory" | "escalate_to_manager" | "forward_to_ap" | "update_po_tracking" | "create_backorder" | "no_action_required" | "review_required",
  
  "action_reasoning": "Brief explanation of why this action is recommended",
  
  "requires_user_response": true | false,
  
  "is_invoice": true | false,
  "invoice_data": {
    "invoice_number": "INV-12345" | null,
    "invoice_date": "YYYY-MM-DD" | null,
    "due_date": "YYYY-MM-DD" | null,
    "total_amount": 290.40 | null,
    "line_items": [{"sku": "SKU", "description": "desc", "quantity": 10, "unit_price": 25.50}] | null
  } | null,
  
  "tracking_data": {
    "trackingNumber": "1Z123" | null,
    "carrier": "UPS" | "FedEx" | "USPS" | "DHL" | null,
    "status": "shipped" | "in_transit" | "out_for_delivery" | "delivered" | "exception" | null,
    "expectedDelivery": "YYYY-MM-DD" | null
  } | null,
  
  "pricing_data": {
    "type": "increase" | "decrease" | "quote" | null,
    "items": [{"sku": "SKU", "old_price": 25.00, "new_price": 27.50}] | null,
    "effective_date": "YYYY-MM-DD" | null,
    "reason": "explanation" | null
  } | null,
  
  "stock_data": {
    "type": "out_of_stock" | "low_stock" | "back_in_stock" | "discontinued" | null,
    "items": [{"sku": "SKU", "status": "out_of_stock", "available_date": "YYYY-MM-DD" | null}] | null,
    "alternatives_offered": true | false
  } | null,
  
  "extracted_details": {
    "key_points": ["Main point 1", "Main point 2"],
    "dates_mentioned": ["YYYY-MM-DD"],
    "amounts_mentioned": [{"value": 100.00, "context": "shipping cost"}],
    "action_items": ["What vendor expects from us"],
    "urgency": "low" | "medium" | "high"
  },
  
  "confidence": 0.95
}

Guidelines:
- requires_user_response should be TRUE for: price changes needing approval, stock issues requiring decisions, questions, exceptions, anything ambiguous
- requires_user_response should be FALSE for: simple confirmations, tracking updates, thank you messages
- suggested_action should match the most appropriate next step
- Extract ALL relevant structured data even if category is "other"

Return ONLY valid JSON, no other text.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2000,
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
    const parsed = JSON.parse(json);
    const inputTokens = Math.round((context.content.length + 400) / 4);
    const outputTokens = Math.max(1, Math.round(raw.length / 4));
    const costUsd = ((inputTokens * AI_PRICING.input) + (outputTokens * AI_PRICING.output)) / 1_000_000;

    // Normalize the response to match expected interface with enhanced workbench fields
    let normalizedParsed: ParsedTrackingResult = {
      // Response workbench fields (always present)
      responseCategory: parsed.response_category || 'other',
      suggestedAction: parsed.suggested_action || 'review_required',
      actionReasoning: parsed.action_reasoning || null,
      requiresUserResponse: parsed.requires_user_response ?? true,
      confidence: parsed.confidence || 0.5,
      extractedDetails: parsed.extracted_details || null,
    };

    // Handle invoice data
    if (parsed.is_invoice && parsed.invoice_data) {
      normalizedParsed = {
        ...normalizedParsed,
        trackingNumber: null,
        carrier: null,
        status: 'invoice_received',
        expectedDelivery: null,
        notes: `Invoice ${parsed.invoice_data.invoice_number || 'detected'} - Total: $${parsed.invoice_data.total_amount || 0}`,
        action: 'invoice_received',
        invoiceData: parsed.invoice_data,
        responseCategory: 'invoice_attached',
        suggestedAction: 'forward_to_ap',
      };
    }
    
    // Handle tracking data
    if (parsed.tracking_data) {
      normalizedParsed = {
        ...normalizedParsed,
        trackingNumber: parsed.tracking_data.trackingNumber,
        carrier: parsed.tracking_data.carrier,
        status: parsed.tracking_data.status,
        expectedDelivery: parsed.tracking_data.expectedDelivery,
      };
    }

    // Handle pricing data
    if (parsed.pricing_data) {
      normalizedParsed.pricingData = parsed.pricing_data;
    }

    // Handle stock data
    if (parsed.stock_data) {
      normalizedParsed.stockData = parsed.stock_data;
    }

    return {
      parsed: normalizedParsed,
      rawText: raw,
      inputTokens,
      outputTokens,
      costUsd,
    };
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

  // Check if this is invoice data
  if (parsed.invoiceData) {
    // Handle invoice processing (existing logic)
    await recordInvoiceReceipt(poRecord, messageId, null, parsed.invoiceData);
    return;
  }

  // Check if this contains shipment/tracking data
  if (parsed.trackingNumber || carrier || parsed.status) {
    // Create shipment record
    const shipmentData = {
      poId,
      trackingNumbers: parsed.trackingNumber ? [parsed.trackingNumber] : [],
      carrier: carrier || undefined,
      carrierConfidence: parsed.confidence || 0.5,
      shipDate: parsed.expectedDelivery ? new Date().toISOString().split('T')[0] : undefined, // Assume ship date is today if we have delivery date
      estimatedDeliveryDate: parsed.expectedDelivery || undefined,
      aiConfidence: parsed.confidence || 0.5,
      aiExtraction: parsed,
      gmailMessageId: messageId,
      gmailThreadId: threadId,
      requiresReview: (parsed.confidence || 0) < 0.8, // Require review for low confidence
      reviewReason: (parsed.confidence || 0) < 0.8 ? 'Low AI confidence in extracted data' : undefined
    };

    try {
      const shipment = await createShipment(shipmentData);

      // Create tracking event
      await createTrackingEvent({
        shipmentId: shipment.id,
        eventType: 'status_update',
        status: status,
        description: parsed.notes || parsed.action || 'Shipment detected from vendor email',
        carrier: carrier || undefined,
        trackingNumber: parsed.trackingNumber || undefined,
        source: 'email',
        sourceId: messageId,
        aiConfidence: parsed.confidence || 0.5,
        rawData: parsed
      });

      // Update PO tracking columns for backward compatibility
      await supabase
        .from('purchase_orders')
        .update({
          tracking_status: status,
          tracking_carrier: carrier,
          tracking_number: parsed.trackingNumber,
          tracking_estimated_delivery: parsed.expectedDelivery,
          tracking_last_checked_at: new Date().toISOString()
        })
        .eq('id', poId);

      console.log(`[gmail-webhook] Created shipment ${shipment.id} for PO ${poId}`);
    } catch (error) {
      console.error('[gmail-webhook] Failed to create shipment:', error);
    }

    return;
  }

  // Fallback to legacy tracking update
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

async function calculateAndStoreVariances(poId: string, invoiceDataId: string, invoiceData: any) {
  try {
    // Call the database function to calculate variances
    const { data: variances, error } = await supabase
      .rpc('calculate_invoice_variances', {
        p_po_id: poId,
        p_invoice_data: invoiceData
      });

    if (error) {
      console.error('[gmail-webhook] Failed to calculate variances:', error);
      return;
    }

    if (!variances || variances.length === 0) {
      console.log('[gmail-webhook] No variances detected');
      return;
    }

    // Store each variance
    for (const variance of variances) {
      const varianceRecord = {
        po_id: poId,
        invoice_data_id: invoiceDataId,
        variance_type: variance.variance_type,
        severity: variance.severity,
        po_amount: variance.po_amount,
        invoice_amount: variance.invoice_amount,
        variance_amount: variance.variance_amount,
        variance_percentage: variance.variance_percentage,
        threshold_percentage: variance.threshold_percentage,
        threshold_amount: variance.threshold_amount,
        status: 'pending'
      };

      await supabase
        .from('po_invoice_variances')
        .insert(varianceRecord);
    }

    console.log(`[gmail-webhook] Stored ${variances.length} variances for PO ${poId}`);

  } catch (error) {
    console.error('[gmail-webhook] Error calculating/storing variances:', error);
  }
}

interface InvoiceSignal {
  detected: boolean;
  subject: string;
  reason: string;
  attachmentName?: string;
  amount?: string;
  dueDate?: string;
}

function detectInvoiceSignal(input: {
  subject: string;
  from: string;
  bodyText: string;
  attachmentsText: string;
  attachments: AttachmentMeta[];
}): InvoiceSignal | null {
  const combinedLower = `${input.subject}\n${input.bodyText}\n${input.attachmentsText}`.toLowerCase();
  let score = 0;
  if (combinedLower.includes('invoice')) score += 2;
  if (combinedLower.includes('amount due') || combinedLower.includes('balance due')) score += 1;
  if (combinedLower.includes('net 30') || combinedLower.includes('payment terms')) score += 0.5;

  const invoiceAttachment = input.attachments.find(att => /invoice|inv|bill/i.test(att.filename));
  if (invoiceAttachment) score += 2;
  if (input.attachments.some(att => att.mimeType === 'application/pdf')) score += 0.5;

  if (score < 2) {
    return null;
  }

  const amountMatch = (input.subject + '\n' + input.bodyText).match(/\$?\s?\d{2,3}(?:[,\d]{3})*(?:\.\d{2})/);
  const dueMatch = (input.bodyText + '\n' + input.attachmentsText).match(/(?:due|pay by)\s+(?:on\s+)?([A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2})/i);

  return {
    detected: true,
    subject: input.subject,
    reason: invoiceAttachment ? 'Attachment filename suggests invoice' : 'Invoice language detected',
    attachmentName: invoiceAttachment?.filename,
    amount: amountMatch ? amountMatch[0].trim() : undefined,
    dueDate: dueMatch ? dueMatch[1] : undefined,
  };
}

async function calculateAndStoreVariances(poId: string, invoiceDataId: string, invoiceData: any) {
  try {
    // Call the database function to calculate variances
    const { data: variances, error } = await supabase
      .rpc('calculate_invoice_variances', {
        p_po_id: poId,
        p_invoice_data: invoiceData
      });

    if (error) {
      console.error('[gmail-webhook] Failed to calculate variances:', error);
      return;
    }

    if (!variances || variances.length === 0) {
      console.log('[gmail-webhook] No variances detected');
      return;
    }

    // Store each variance
    for (const variance of variances) {
      const varianceRecord = {
        po_id: poId,
        invoice_data_id: invoiceDataId,
        variance_type: variance.variance_type,
        severity: variance.severity,
        po_amount: variance.po_amount,
        invoice_amount: variance.invoice_amount,
        variance_amount: variance.variance_amount,
        variance_percentage: variance.variance_percentage,
        threshold_percentage: variance.threshold_percentage,
        threshold_amount: variance.threshold_amount,
        status: 'pending'
      };

      await supabase
        .from('po_invoice_variances')
        .insert(varianceRecord);
    }

    console.log(`[gmail-webhook] Stored ${variances.length} variances for PO ${poId}`);

  } catch (error) {
    console.error('[gmail-webhook] Error calculating/storing variances:', error);
  }
}

async function markFollowUpResponse(
  poId: string,
  options?: {
    vendorStatus?: VendorResponseStatus;
    summary?: any;
    messageId?: string | null;
    threadId?: string | null;
    receivedAt?: string | null;
  },
) {
  const { data: event } = await supabase
    .from('vendor_followup_events')
    .select('id, sent_at')
    .eq('po_id', poId)
    .is('responded_at', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!event) return;

  const respondedAt = new Date().toISOString();
  const latencySeconds = Math.max(
    1,
    Math.round((new Date(respondedAt).getTime() - new Date(event.sent_at).getTime()) / 1000),
  );

  await supabase
    .from('vendor_followup_events')
    .update({
      responded_at: respondedAt,
      response_latency: `${latencySeconds} seconds`,
    })
    .eq('id', event.id);

  await supabase
    .from('purchase_orders')
    .update({
      follow_up_status: options?.vendorStatus ?? 'vendor_responded',
      vendor_response_status: options?.vendorStatus ?? 'vendor_responded',
      vendor_response_received_at: options?.receivedAt ?? respondedAt,
      vendor_response_email_id: options?.messageId ?? null,
      vendor_response_thread_id: options?.threadId ?? null,
      vendor_response_summary: options?.summary ?? null,
      verification_required: (options?.vendorStatus ?? 'vendor_responded') !== 'verified_confirmed',
      next_follow_up_due_at: null,
    })
    .eq('id', poId);
}
