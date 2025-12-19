/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EMAIL INBOX POLLER - Proactive Email Monitoring Edge Function
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Scheduled edge function that proactively polls configured email inboxes
 * for new messages. Complements the gmail-webhook for:
 * - Catching missed webhook notifications
 * - Initial sync of existing emails
 * - Recovery after downtime
 *
 * Schedule: Every 5 minutes via pg_cron or external scheduler
 *
 * Mission: NEVER BE OUT OF STOCK
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface InboxConfig {
  id: string;
  inbox_name: string;
  email_address: string;
  gmail_client_id: string | null;
  gmail_client_secret_ref: string | null;
  gmail_refresh_token_ref: string | null;
  gmail_user: string;
  last_history_id: string | null;
  ai_parsing_enabled: boolean;
  ai_confidence_threshold: number;
  keyword_filters: string[];
  max_daily_ai_cost_usd: number;
  daily_ai_cost_usd: number;
}

interface PollResult {
  inboxId: string;
  inboxName: string;
  success: boolean;
  emailsFetched: number;
  emailsProcessed: number;
  threadsCreated: number;
  posCorrelated: number;
  trackingFound: number;
  alertsGenerated: number;
  newHistoryId: string | null;
  error?: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    mimeType?: string;
    body?: { data?: string };
    parts?: any[];
  };
  internalDate?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Handler
// ═══════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const results: PollResult[] = [];
  let runId: string | null = null;

  try {
    console.log('[email-inbox-poller] Starting inbox poll cycle...');

    // Start agent run
    const { data: runData } = await supabase
      .from('email_tracking_runs')
      .insert({
        run_type: 'poll',
        status: 'running',
      })
      .select('id')
      .single();
    runId = runData?.id;

    // Get active inbox configurations
    const { data: inboxes, error: inboxError } = await supabase
      .from('email_inbox_configs')
      .select('*')
      .eq('is_active', true)
      .eq('poll_enabled', true)
      .in('status', ['active', 'error']);

    if (inboxError) {
      throw new Error(`Failed to fetch inbox configs: ${inboxError.message}`);
    }

    if (!inboxes || inboxes.length === 0) {
      console.log('[email-inbox-poller] No active inboxes to poll');
      return new Response(
        JSON.stringify({ success: true, message: 'No active inboxes', results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[email-inbox-poller] Found ${inboxes.length} active inbox(es)`);

    // Process each inbox
    for (const inbox of inboxes) {
      const result = await pollInbox(inbox);
      results.push(result);
    }

    // Aggregate stats
    const totalStats = {
      emails_fetched: results.reduce((sum, r) => sum + r.emailsFetched, 0),
      emails_processed: results.reduce((sum, r) => sum + r.emailsProcessed, 0),
      threads_created: results.reduce((sum, r) => sum + r.threadsCreated, 0),
      pos_correlated: results.reduce((sum, r) => sum + r.posCorrelated, 0),
      tracking_numbers_found: results.reduce((sum, r) => sum + r.trackingFound, 0),
      alerts_generated: results.reduce((sum, r) => sum + r.alertsGenerated, 0),
    };

    // Complete agent run
    if (runId) {
      await supabase
        .from('email_tracking_runs')
        .update({
          ...totalStats,
          status: results.every(r => r.success) ? 'completed' : 'partial',
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        })
        .eq('id', runId);
    }

    console.log(`[email-inbox-poller] Completed in ${Date.now() - startTime}ms`);
    console.log(`[email-inbox-poller] Stats:`, totalStats);

    return new Response(
      JSON.stringify({
        success: true,
        duration_ms: Date.now() - startTime,
        inboxes_polled: inboxes.length,
        ...totalStats,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[email-inbox-poller] Fatal error:', error);

    // Mark run as failed
    if (runId) {
      await supabase
        .from('email_tracking_runs')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : String(error),
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        })
        .eq('id', runId);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        results,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Poll Single Inbox
// ═══════════════════════════════════════════════════════════════════════════

async function pollInbox(inbox: InboxConfig): Promise<PollResult> {
  const result: PollResult = {
    inboxId: inbox.id,
    inboxName: inbox.inbox_name,
    success: false,
    emailsFetched: 0,
    emailsProcessed: 0,
    threadsCreated: 0,
    posCorrelated: 0,
    trackingFound: 0,
    alertsGenerated: 0,
    newHistoryId: null,
  };

  try {
    console.log(`[email-inbox-poller] Polling inbox: ${inbox.inbox_name} (${inbox.email_address})`);

    // Get Gmail credentials
    const credentials = await resolveGmailCredentials(inbox);
    if (!credentials) {
      throw new Error('Could not resolve Gmail credentials');
    }

    // Get access token
    const accessToken = await getGmailAccessToken(credentials);

    // Fetch new messages using history API if we have a history ID
    // Otherwise do an initial sync
    let messages: GmailMessage[] = [];
    let newHistoryId: string | null = null;

    if (inbox.last_history_id) {
      // Incremental sync using history
      const historyResult = await fetchHistoryChanges(
        accessToken,
        credentials.user,
        inbox.last_history_id
      );
      messages = historyResult.messages;
      newHistoryId = historyResult.historyId;
    } else {
      // Initial sync - fetch recent messages
      const syncResult = await fetchRecentMessages(accessToken, credentials.user, 50);
      messages = syncResult.messages;
      newHistoryId = syncResult.historyId;
    }

    result.emailsFetched = messages.length;
    result.newHistoryId = newHistoryId;

    console.log(`[email-inbox-poller] Fetched ${messages.length} messages for ${inbox.inbox_name}`);

    // Process each message
    for (const message of messages) {
      try {
        const processResult = await processMessage(inbox, message, accessToken, credentials.user);
        result.emailsProcessed++;

        if (processResult.threadCreated) result.threadsCreated++;
        if (processResult.poCorrelated) result.posCorrelated++;
        if (processResult.trackingFound) result.trackingFound++;
        if (processResult.alertGenerated) result.alertsGenerated++;
      } catch (msgError) {
        console.error(`[email-inbox-poller] Error processing message ${message.id}:`, msgError);
      }
    }

    // Update inbox config with new history ID and stats
    await supabase
      .from('email_inbox_configs')
      .update({
        last_history_id: newHistoryId,
        last_poll_at: new Date().toISOString(),
        next_poll_at: new Date(Date.now() + inbox.poll_interval_minutes * 60 * 1000).toISOString(),
        total_emails_processed: inbox.total_emails_processed + result.emailsProcessed,
        total_pos_correlated: inbox.total_pos_correlated + result.posCorrelated,
        status: 'active',
        last_error: null,
        consecutive_errors: 0,
      })
      .eq('id', inbox.id);

    result.success = true;
    console.log(`[email-inbox-poller] Successfully polled ${inbox.inbox_name}`);

  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`[email-inbox-poller] Error polling ${inbox.inbox_name}:`, error);

    // Update inbox with error
    const { data: currentInbox } = await supabase
      .from('email_inbox_configs')
      .select('consecutive_errors')
      .eq('id', inbox.id)
      .single();

    const consecutiveErrors = (currentInbox?.consecutive_errors || 0) + 1;

    await supabase
      .from('email_inbox_configs')
      .update({
        status: consecutiveErrors >= 5 ? 'error' : 'active',
        last_error: result.error,
        last_error_at: new Date().toISOString(),
        consecutive_errors: consecutiveErrors,
        last_poll_at: new Date().toISOString(),
        next_poll_at: new Date(Date.now() + inbox.poll_interval_minutes * 60 * 1000).toISOString(),
      })
      .eq('id', inbox.id);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Gmail API Functions
// ═══════════════════════════════════════════════════════════════════════════

async function resolveGmailCredentials(inbox: InboxConfig): Promise<{
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  user: string;
} | null> {
  // Resolve credentials from refs (env vars or vault)
  const clientId = resolveSecretRef(inbox.gmail_client_id);
  const clientSecret = resolveSecretRef(inbox.gmail_client_secret_ref);
  const refreshToken = resolveSecretRef(inbox.gmail_refresh_token_ref);
  const user = inbox.gmail_user || 'me';

  if (!clientId || !clientSecret || !refreshToken) {
    console.error(`[email-inbox-poller] Missing credentials for ${inbox.inbox_name}`);
    return null;
  }

  return { clientId, clientSecret, refreshToken, user };
}

function resolveSecretRef(ref: string | null): string | null {
  if (!ref) return null;

  // Handle env: prefix
  if (ref.startsWith('env:')) {
    const envVar = ref.substring(4);
    return Deno.env.get(envVar) || null;
  }

  // Handle vault: prefix (future implementation)
  if (ref.startsWith('vault:')) {
    // TODO: Implement vault lookup
    return null;
  }

  // Return as-is if no prefix
  return ref;
}

async function getGmailAccessToken(credentials: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
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

async function fetchHistoryChanges(
  accessToken: string,
  user: string,
  startHistoryId: string
): Promise<{ messages: GmailMessage[]; historyId: string }> {
  const messages: GmailMessage[] = [];

  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(user)}/history?` +
      `startHistoryId=${startHistoryId}&historyTypes=messageAdded`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      // If history ID is invalid, fall back to recent messages
      if (response.status === 404) {
        console.log('[email-inbox-poller] History ID expired, falling back to recent messages');
        return fetchRecentMessages(accessToken, user, 50);
      }
      throw new Error(`History API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract message IDs from history
    const messageIds = new Set<string>();
    for (const record of data.history || []) {
      for (const added of record.messagesAdded || []) {
        if (added.message?.id) {
          messageIds.add(added.message.id);
        }
      }
    }

    // Fetch full message details
    for (const messageId of messageIds) {
      const message = await fetchMessage(accessToken, user, messageId);
      if (message) {
        messages.push(message);
      }
    }

    return {
      messages,
      historyId: data.historyId || startHistoryId,
    };
  } catch (error) {
    console.error('[email-inbox-poller] History fetch error:', error);
    // Fall back to recent messages
    return fetchRecentMessages(accessToken, user, 50);
  }
}

async function fetchRecentMessages(
  accessToken: string,
  user: string,
  maxResults: number
): Promise<{ messages: GmailMessage[]; historyId: string }> {
  // Get list of message IDs
  const listResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(user)}/messages?` +
    `maxResults=${maxResults}&labelIds=INBOX`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!listResponse.ok) {
    throw new Error(`Failed to list messages: ${listResponse.status}`);
  }

  const listData = await listResponse.json();
  const messages: GmailMessage[] = [];

  // Fetch each message
  for (const item of listData.messages || []) {
    const message = await fetchMessage(accessToken, user, item.id);
    if (message) {
      messages.push(message);
    }
  }

  // Get current history ID from profile
  const profileResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(user)}/profile`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  let historyId = '';
  if (profileResponse.ok) {
    const profile = await profileResponse.json();
    historyId = profile.historyId;
  }

  return { messages, historyId };
}

async function fetchMessage(
  accessToken: string,
  user: string,
  messageId: string
): Promise<GmailMessage | null> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(user)}/messages/${messageId}?format=full`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    console.error(`[email-inbox-poller] Failed to fetch message ${messageId}`);
    return null;
  }

  return await response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// Message Processing
// ═══════════════════════════════════════════════════════════════════════════

interface ProcessResult {
  threadCreated: boolean;
  poCorrelated: boolean;
  trackingFound: boolean;
  alertGenerated: boolean;
}

async function processMessage(
  inbox: InboxConfig,
  message: GmailMessage,
  accessToken: string,
  user: string
): Promise<ProcessResult> {
  const result: ProcessResult = {
    threadCreated: false,
    poCorrelated: false,
    trackingFound: false,
    alertGenerated: false,
  };

  // Check if message already processed
  const { data: existing } = await supabase
    .from('email_thread_messages')
    .select('id')
    .eq('gmail_message_id', message.id)
    .single();

  if (existing) {
    console.log(`[email-inbox-poller] Message ${message.id} already processed, skipping`);
    return result;
  }

  // Extract headers
  const headers = message.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  const subject = getHeader('Subject');
  const from = getHeader('From');
  const to = getHeader('To');
  const date = getHeader('Date');

  // Extract body text
  const bodyText = extractBodyText(message);

  // Determine direction (inbound = from vendor, outbound = from us)
  const direction = determineDirection(inbox.email_address, from, to);

  // Find or create thread
  const { data: thread, error: threadError } = await supabase
    .rpc('find_or_create_email_thread', {
      p_gmail_thread_id: message.threadId,
      p_inbox_config_id: inbox.id,
      p_subject: subject,
    });

  if (threadError) {
    console.error('[email-inbox-poller] Failed to find/create thread:', threadError);
    return result;
  }

  const threadId = thread;
  result.threadCreated = true; // May be existing, but we'll count it

  // Try to correlate to PO
  const correlation = await correlateEmailToPO(message.threadId, from, subject, bodyText);

  if (correlation.poId && correlation.confidence >= 0.7) {
    await supabase.rpc('correlate_thread_to_po', {
      p_thread_id: threadId,
      p_po_id: correlation.poId,
      p_confidence: correlation.confidence,
      p_method: correlation.method,
    });
    result.poCorrelated = true;

    // Learn vendor domain
    if (direction === 'inbound' && correlation.method !== 'sender_domain') {
      const { data: po } = await supabase
        .from('purchase_orders')
        .select('vendor_id')
        .eq('id', correlation.poId)
        .single();

      if (po?.vendor_id) {
        await supabase.rpc('learn_vendor_email_domain', {
          p_sender_email: from,
          p_vendor_id: po.vendor_id,
          p_confidence: 0.85,
        });
      }
    }
  }

  // Extract tracking info (basic pattern matching)
  const trackingInfo = extractTrackingInfo(subject, bodyText);
  if (trackingInfo.trackingNumber) {
    result.trackingFound = true;
  }

  // Add message to thread
  await supabase.from('email_thread_messages').insert({
    thread_id: threadId,
    gmail_message_id: message.id,
    direction,
    sender_email: from,
    recipient_emails: to.split(',').map(e => e.trim()),
    subject,
    body_preview: bodyText.slice(0, 500),
    sent_at: date ? new Date(date).toISOString() : null,
    received_at: new Date().toISOString(),
    has_attachments: hasAttachments(message),
    extracted_tracking_number: trackingInfo.trackingNumber,
    extracted_carrier: trackingInfo.carrier,
    extracted_eta: trackingInfo.eta,
    processing_status: 'processed',
  });

  // Add timeline event
  await supabase.rpc('add_thread_timeline_event', {
    p_thread_id: threadId,
    p_event: direction === 'inbound' ? 'vendor_reply' : 'outbound_sent',
    p_message_id: message.id,
    p_details: {
      subject,
      tracking: trackingInfo.trackingNumber ? trackingInfo : null,
      correlated: result.poCorrelated,
    },
  });

  // Check for alerts (delay notices, backorders, etc.)
  if (direction === 'inbound') {
    const alertResult = await checkForAlerts(
      threadId,
      correlation.poId,
      subject,
      bodyText,
      trackingInfo
    );
    result.alertGenerated = alertResult;
  }

  return result;
}

function extractBodyText(message: GmailMessage): string {
  const parts: string[] = [];

  const traverseParts = (part: any) => {
    if (!part) return;

    if (part.mimeType === 'text/plain' && part.body?.data) {
      parts.push(decodeBase64(part.body.data));
    } else if (part.mimeType === 'text/html' && part.body?.data && parts.length === 0) {
      // Only use HTML if no plain text
      const html = decodeBase64(part.body.data);
      parts.push(html.replace(/<[^>]*>/g, ' '));
    }

    if (part.parts) {
      for (const nested of part.parts) {
        traverseParts(nested);
      }
    }
  };

  traverseParts(message.payload);

  return parts.join('\n').slice(0, 10000);
}

function decodeBase64(input: string): string {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4;
    const padded = normalized + (pad ? '='.repeat(4 - pad) : '');
    return atob(padded);
  } catch {
    return '';
  }
}

function determineDirection(
  inboxEmail: string,
  from: string,
  to: string
): 'inbound' | 'outbound' {
  const normalizedInbox = inboxEmail.toLowerCase();
  const normalizedFrom = from.toLowerCase();

  if (normalizedFrom.includes(normalizedInbox)) {
    return 'outbound';
  }
  return 'inbound';
}

function hasAttachments(message: GmailMessage): boolean {
  const checkParts = (part: any): boolean => {
    if (!part) return false;
    if (part.filename && part.filename.length > 0) return true;
    if (part.parts) {
      return part.parts.some(checkParts);
    }
    return false;
  };

  return checkParts(message.payload);
}

function extractTrackingInfo(subject: string, bodyText: string): {
  trackingNumber: string | null;
  carrier: string | null;
  eta: string | null;
} {
  const combined = `${subject}\n${bodyText}`.toLowerCase();

  // Carrier detection
  let carrier: string | null = null;
  if (combined.includes('ups') || combined.includes('1z')) carrier = 'UPS';
  else if (combined.includes('fedex') || combined.includes('fed ex')) carrier = 'FedEx';
  else if (combined.includes('usps') || combined.includes('postal')) carrier = 'USPS';
  else if (combined.includes('dhl')) carrier = 'DHL';

  // Tracking number patterns
  const patterns = [
    /1Z[A-Z0-9]{16}/i,                           // UPS
    /\b[0-9]{12,22}\b/,                          // FedEx/USPS
    /\b[0-9]{10}\b/,                             // DHL
    /tracking[:\s#]*([A-Z0-9]{10,30})/i,         // Generic "tracking: XXXX"
  ];

  let trackingNumber: string | null = null;
  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (match) {
      trackingNumber = match[1] || match[0];
      break;
    }
  }

  // ETA extraction
  let eta: string | null = null;
  const etaPatterns = [
    /(?:deliver|arrival|eta|expected).*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}).*?(?:deliver|arrival)/i,
  ];

  for (const pattern of etaPatterns) {
    const match = combined.match(pattern);
    if (match) {
      eta = match[1];
      break;
    }
  }

  return { trackingNumber, carrier, eta };
}

async function correlateEmailToPO(
  gmailThreadId: string,
  senderEmail: string,
  subject: string,
  bodyText: string
): Promise<{ poId: string | null; confidence: number; method: string }> {
  // Check if thread already correlated
  const { data: existingThread } = await supabase
    .from('email_threads')
    .select('po_id')
    .eq('gmail_thread_id', gmailThreadId)
    .single();

  if (existingThread?.po_id) {
    return { poId: existingThread.po_id, confidence: 0.95, method: 'thread_history' };
  }

  // Subject line match
  const subjectMatch = subject.match(/PO[-\s#]*(\d{4,})/i);
  if (subjectMatch) {
    const poNumber = `PO-${subjectMatch[1]}`;
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('order_id', poNumber)
      .single();

    if (po) {
      return { poId: po.id, confidence: 0.90, method: 'subject_match' };
    }
  }

  // Sender domain lookup
  const { data: vendorLookup } = await supabase.rpc('lookup_vendor_by_email_domain', {
    p_sender_email: senderEmail,
  });

  if (vendorLookup && vendorLookup.length > 0) {
    const vendorId = vendorLookup[0].vendor_id;
    const { data: recentPO } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('vendor_id', vendorId)
      .in('status', ['sent', 'confirmed', 'committed', 'processing'])
      .order('sent_at', { ascending: false })
      .limit(1)
      .single();

    if (recentPO) {
      return {
        poId: recentPO.id,
        confidence: Math.min(vendorLookup[0].confidence * 0.8, 0.75),
        method: 'sender_domain',
      };
    }
  }

  // Body match
  const bodyMatch = bodyText.match(/PO[-\s#]*(\d{4,})/i);
  if (bodyMatch) {
    const poNumber = `PO-${bodyMatch[1]}`;
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('order_id', poNumber)
      .single();

    if (po) {
      return { poId: po.id, confidence: 0.80, method: 'body_match' };
    }
  }

  return { poId: null, confidence: 0, method: 'none' };
}

async function checkForAlerts(
  threadId: string,
  poId: string | null,
  subject: string,
  bodyText: string,
  trackingInfo: { trackingNumber: string | null; carrier: string | null; eta: string | null }
): Promise<boolean> {
  const combined = `${subject}\n${bodyText}`.toLowerCase();

  // Check for delay notices
  if (
    combined.includes('delay') ||
    combined.includes('postpone') ||
    combined.includes('reschedule')
  ) {
    await supabase.rpc('create_email_tracking_alert', {
      p_alert_type: 'delay_detected',
      p_severity: poId ? 'high' : 'medium',
      p_title: 'Delay Notice Detected',
      p_description: `Potential delay mentioned in email: "${subject}"`,
      p_thread_id: threadId,
      p_po_id: poId,
      p_requires_human: true,
      p_route_to_agent: 'air_traffic_controller',
    });
    return true;
  }

  // Check for backorder notices
  if (
    combined.includes('backorder') ||
    combined.includes('back order') ||
    combined.includes('out of stock')
  ) {
    await supabase.rpc('create_email_tracking_alert', {
      p_alert_type: 'backorder_notice',
      p_severity: 'critical',
      p_title: 'Backorder Notice Detected',
      p_description: `Backorder/out of stock mentioned in email: "${subject}"`,
      p_thread_id: threadId,
      p_po_id: poId,
      p_requires_human: true,
      p_route_to_agent: 'vendor_watchdog',
    });
    return true;
  }

  // Check for tracking exceptions
  if (combined.includes('exception') || combined.includes('undeliverable')) {
    await supabase.rpc('create_email_tracking_alert', {
      p_alert_type: 'tracking_exception',
      p_severity: 'high',
      p_title: 'Tracking Exception Detected',
      p_description: `Shipping exception mentioned in email: "${subject}"`,
      p_thread_id: threadId,
      p_po_id: poId,
      p_requires_human: true,
      p_route_to_agent: 'air_traffic_controller',
    });
    return true;
  }

  return false;
}
