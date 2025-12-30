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
  // Legacy ref-based credentials (deprecated)
  gmail_client_id: string | null;
  gmail_client_secret_ref: string | null;
  gmail_refresh_token_ref: string | null;
  // New OAuth-based credentials (preferred)
  gmail_refresh_token: string | null;
  gmail_user: string;
  last_history_id: string | null;
  ai_parsing_enabled: boolean;
  ai_confidence_threshold: number;
  keyword_filters: string[];
  max_daily_ai_cost_usd: number;
  daily_ai_cost_usd: number;
  poll_interval_minutes: number;
  total_emails_processed: number;
  total_pos_correlated: number;
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
  engagementsRecorded: number;
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
      engagements_recorded: results.reduce((sum, r) => sum + r.engagementsRecorded, 0),
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
    engagementsRecorded: 0,
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
        if (processResult.engagementRecorded) result.engagementsRecorded++;
      } catch (msgError) {
        console.error(`[email-inbox-poller] Error processing message ${message.id}:`, msgError);
      }
    }

    // Update inbox config with new history ID and stats
    const now = new Date().toISOString();
    const pollIntervalMs = (inbox.poll_interval_minutes || 5) * 60 * 1000;
    await supabase
      .from('email_inbox_configs')
      .update({
        last_history_id: newHistoryId,
        last_poll_at: now,
        last_sync_at: now, // Also update last_sync_at for UI display
        next_poll_at: new Date(Date.now() + pollIntervalMs).toISOString(),
        total_emails_processed: (inbox.total_emails_processed || 0) + result.emailsProcessed,
        total_pos_correlated: (inbox.total_pos_correlated || 0) + result.posCorrelated,
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
  // First, try the new OAuth-based flow with stored refresh token
  // Client ID and Secret come from environment variables
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  // Prefer the directly-stored refresh token (from OAuth flow)
  let refreshToken = inbox.gmail_refresh_token;

  // Fall back to legacy ref-based token if no direct token
  if (!refreshToken && inbox.gmail_refresh_token_ref) {
    refreshToken = resolveSecretRef(inbox.gmail_refresh_token_ref);
  }

  // Use the inbox email address for Gmail API, or 'me' as fallback
  const user = inbox.email_address || inbox.gmail_user || 'me';

  if (!clientId || !clientSecret) {
    console.error(`[email-inbox-poller] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars`);
    return null;
  }

  if (!refreshToken) {
    console.error(`[email-inbox-poller] No refresh token available for ${inbox.inbox_name}`);
    return null;
  }

  console.log(`[email-inbox-poller] Resolved credentials for ${inbox.email_address}`);
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
  const messages: GmailMessage[] = [];
  const seenIds = new Set<string>();

  // CRITICAL: Fetch from multiple sources with PO LABEL AS PRIMARY
  // User requirement: "always look for specific PO label"
  // Only concerned with POs within 1 month, not received
  //
  // Priority order:
  // 1. label:PO - PRIMARY SOURCE (emails filed under PO label, may be marked read)
  // 2. subject:PO newer_than:30d - backup for emails with PO in subject
  // 3. INBOX - regular incoming emails (lowest priority)

  const sources = [
    { type: 'query', value: 'label:PO newer_than:30d', description: 'PO Label (30 days)', priority: 1, maxResults: maxResults },
    { type: 'query', value: 'subject:PO newer_than:30d', description: 'PO in subject (30 days)', priority: 2, maxResults: Math.ceil(maxResults / 2) },
    { type: 'label', value: 'INBOX', description: 'Inbox', priority: 3, maxResults: Math.ceil(maxResults / 3) },
  ];

  for (const source of sources) {
    try {
      // Use source-specific max results for priority weighting
      const sourceMaxResults = (source as any).maxResults || Math.ceil(maxResults / 2);
      const params = new URLSearchParams({ maxResults: String(sourceMaxResults) });

      if (source.type === 'label') {
        params.set('labelIds', source.value);
      } else {
        params.set('q', source.value);
      }

      const listResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(user)}/messages?${params}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (listResponse.ok) {
        const listData = await listResponse.json();
        const count = (listData.messages || []).length;
        console.log(`[email-inbox-poller] Found ${count} messages from ${source.description}`);

        for (const item of listData.messages || []) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            const message = await fetchMessage(accessToken, user, item.id);
            if (message) {
              messages.push(message);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[email-inbox-poller] Error fetching from ${source.description}:`, err);
    }
  }

  console.log(`[email-inbox-poller] Total unique messages found: ${messages.length}`);

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
// Vendor Engagement Recording
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record vendor engagement event for scoring
 * User requirement: "correlate vendor score with time sent to response,
 * response to shipping/tracking to actual reception"
 */
async function recordVendorEngagement(
  finalePoId: string | null,
  eventType: 'vendor_acknowledged' | 'vendor_confirmed' | 'tracking_provided',
  source: 'email' | 'aftership' | 'manual' = 'email',
  metadata: Record<string, any> = {}
): Promise<void> {
  if (!finalePoId) return;

  try {
    // Get vendor_id from finale_purchase_orders
    const { data: po } = await supabase
      .from('finale_purchase_orders')
      .select('vendor_id')
      .eq('id', finalePoId)
      .single();

    if (!po?.vendor_id) return;

    // Call the engagement recording function from migration 134
    await supabase.rpc('record_vendor_engagement', {
      p_vendor_id: po.vendor_id,
      p_finale_po_id: finalePoId,
      p_event_type: eventType,
      p_source: source,
      p_was_proactive: false, // Could enhance to detect proactive communication
      p_was_automated: false,
      p_metadata: metadata,
    });

    console.log(`[email-inbox-poller] ✅ Recorded vendor engagement: ${eventType} for PO ${finalePoId}`);
  } catch (error) {
    // Don't fail message processing if engagement recording fails
    console.error('[email-inbox-poller] Failed to record vendor engagement:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Message Processing
// ═══════════════════════════════════════════════════════════════════════════

interface ProcessResult {
  threadCreated: boolean;
  poCorrelated: boolean;
  trackingFound: boolean;
  alertGenerated: boolean;
  engagementRecorded: boolean;
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
    engagementRecorded: false,
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
    // Determine if this is a Finale PO or custom PO
    const isFinale = correlation.poSource === 'finale';
    console.log(`[email-inbox-poller] Correlating thread ${threadId} to ${isFinale ? 'Finale' : 'custom'} PO ${correlation.poId} (${correlation.method}, ${correlation.confidence})`);

    // Update email_threads directly with correct column
    const updateData: Record<string, unknown> = {
      correlation_confidence: correlation.confidence,
      correlation_method: correlation.method,
      correlation_details: {
        correlated_at: new Date().toISOString(),
        method: correlation.method,
        confidence: correlation.confidence,
        po_source: isFinale ? 'finale' : 'custom',
      },
      updated_at: new Date().toISOString(),
    };

    // Use the correct FK column based on PO source
    if (isFinale) {
      updateData.finale_po_id = correlation.poId;
    } else {
      updateData.po_id = correlation.poId;
    }

    const { error: updateError } = await supabase
      .from('email_threads')
      .update(updateData)
      .eq('id', threadId);

    if (updateError) {
      console.error(`[email-inbox-poller] Failed to correlate thread: ${updateError.message}`);
    } else {
      result.poCorrelated = true;
      console.log(`[email-inbox-poller] ✅ Thread correlated to PO`);
    }

    // Learn vendor domain
    if (direction === 'inbound' && correlation.method !== 'sender_domain') {
      const vendorTable = isFinale ? 'finale_purchase_orders' : 'purchase_orders';
      const { data: po } = await supabase
        .from(vendorTable)
        .select('vendor_id')
        .eq('id', correlation.poId)
        .single();

      if (po?.vendor_id) {
        try {
          await supabase.rpc('learn_vendor_email_domain', {
            p_sender_email: from,
            p_vendor_id: po.vendor_id,
            p_confidence: 0.85,
          });
        } catch (e) {
          // Ignore RPC errors for learning - it's optional
        }
      }
    }
  }

  // Extract tracking info (basic pattern matching)
  const trackingInfo = extractTrackingInfo(subject, bodyText);
  if (trackingInfo.trackingNumber) {
    result.trackingFound = true;

    // Get PO number for AfterShip registration
    let poNumber: string | null = null;
    if (correlation.poId) {
      const { data: po } = await supabase
        .from('purchase_orders')
        .select('order_id')
        .eq('id', correlation.poId)
        .single();
      poNumber = po?.order_id || null;
    }

    // AUTO-REGISTER in tracking cache for tracking updates
    await registerTrackingInCache(
      trackingInfo.trackingNumber,
      trackingInfo.carrier,
      correlation.poId,
      poNumber
    );
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

    // Record vendor engagement for scoring
    // Only record if we have a correlated Finale PO
    if (correlation.poId && correlation.poSource === 'finale') {
      // Determine event type based on email content
      let eventType: 'vendor_acknowledged' | 'vendor_confirmed' | 'tracking_provided' = 'vendor_acknowledged';

      if (trackingInfo.trackingNumber) {
        eventType = 'tracking_provided';
      } else {
        // Check for confirmation keywords
        const confirmKeywords = ['confirm', 'shipped', 'shipping', 'order received', 'processing', 'scheduled'];
        const hasConfirmation = confirmKeywords.some(kw =>
          subject.toLowerCase().includes(kw) || bodyText.toLowerCase().includes(kw)
        );
        if (hasConfirmation) {
          eventType = 'vendor_confirmed';
        }
      }

      await recordVendorEngagement(
        correlation.poId,
        eventType,
        'email',
        {
          subject,
          from,
          tracking: trackingInfo.trackingNumber || null,
          message_id: message.id,
        }
      );
      result.engagementRecorded = true;
    }
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
): Promise<{ poId: string | null; confidence: number; method: string; poSource: 'finale' | 'custom' | null }> {
  // CRITICAL FILTER: Only concerned with POs within 1 month, none if received
  // User requirement: "we have all vendor scores, etc. Only concerned with POs within 1 month, none if received"
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

  // Excluded statuses - Received/Completed/Fulfilled POs don't need email tracking
  const excludedStatuses = ['Received', 'RECEIVED', 'Fulfilled', 'FULFILLED', 'Completed', 'COMPLETED', 'closed'];

  // Check if thread already correlated
  const { data: existingThread } = await supabase
    .from('email_threads')
    .select('po_id, finale_po_id')
    .eq('gmail_thread_id', gmailThreadId)
    .single();

  if (existingThread?.finale_po_id) {
    return { poId: existingThread.finale_po_id, confidence: 0.95, method: 'thread_history', poSource: 'finale' };
  }
  if (existingThread?.po_id) {
    return { poId: existingThread.po_id, confidence: 0.95, method: 'thread_history', poSource: 'custom' };
  }

  // Subject line match - extract PO number (Finale uses just the number, not "PO-123")
  const subjectMatch = subject.match(/PO[-\s#]*(\d{4,})/i);
  if (subjectMatch) {
    const poNumber = subjectMatch[1]; // Just the number, no prefix
    console.log(`[email-inbox-poller] Found PO number in subject: ${poNumber}`);

    // Try finale_purchase_orders first (primary source)
    // FILTER: Within 30 days AND not received
    const { data: finalePO } = await supabase
      .from('finale_purchase_orders')
      .select('id, status, order_date')
      .eq('order_id', poNumber)
      .gte('order_date', thirtyDaysAgoISO)
      .not('status', 'in', `(${excludedStatuses.join(',')})`)
      .single();

    if (finalePO) {
      console.log(`[email-inbox-poller] ✅ Matched to finale_purchase_orders: ${finalePO.id} (status: ${finalePO.status})`);
      return { poId: finalePO.id, confidence: 0.90, method: 'subject_match', poSource: 'finale' };
    }

    // Check if PO exists but is received (log it but don't correlate)
    const { data: receivedPO } = await supabase
      .from('finale_purchase_orders')
      .select('id, status')
      .eq('order_id', poNumber)
      .single();

    if (receivedPO) {
      console.log(`[email-inbox-poller] ⏭️ Skipping PO ${poNumber} - status: ${receivedPO.status} (already received or too old)`);
    }

    // Fallback to purchase_orders with various formats
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('id')
      .or(`order_id.eq.${poNumber},order_id.eq.PO-${poNumber},order_id.ilike.%${poNumber}%`)
      .gte('created_at', thirtyDaysAgoISO)
      .not('status', 'in', `(${excludedStatuses.map(s => s.toLowerCase()).join(',')})`)
      .limit(1)
      .single();

    if (po) {
      return { poId: po.id, confidence: 0.90, method: 'subject_match', poSource: 'custom' };
    }
  }

  // Sender domain lookup
  const { data: vendorLookup } = await supabase.rpc('lookup_vendor_by_email_domain', {
    p_sender_email: senderEmail,
  });

  if (vendorLookup && vendorLookup.length > 0) {
    const vendorId = vendorLookup[0].vendor_id;
    // Check finale_purchase_orders for recent POs from this vendor
    // FILTER: Within 30 days AND active status only
    const { data: recentPO } = await supabase
      .from('finale_purchase_orders')
      .select('id, order_id, status')
      .eq('vendor_id', vendorId)
      .gte('order_date', thirtyDaysAgoISO)
      .not('status', 'in', `(${excludedStatuses.join(',')})`)
      .order('order_date', { ascending: false })
      .limit(1)
      .single();

    if (recentPO) {
      console.log(`[email-inbox-poller] ✅ Matched via vendor domain to PO ${recentPO.order_id} (status: ${recentPO.status})`);
      return {
        poId: recentPO.id,
        confidence: Math.min(vendorLookup[0].confidence * 0.8, 0.75),
        method: 'sender_domain',
        poSource: 'finale',
      };
    }
  }

  // Body match
  const bodyMatch = bodyText.match(/PO[-\s#]*(\d{4,})/i);
  if (bodyMatch) {
    const poNumber = bodyMatch[1]; // Just the number
    console.log(`[email-inbox-poller] Found PO number in body: ${poNumber}`);

    // Try finale_purchase_orders first
    // FILTER: Within 30 days AND not received
    const { data: finalePO } = await supabase
      .from('finale_purchase_orders')
      .select('id, status')
      .eq('order_id', poNumber)
      .gte('order_date', thirtyDaysAgoISO)
      .not('status', 'in', `(${excludedStatuses.join(',')})`)
      .single();

    if (finalePO) {
      console.log(`[email-inbox-poller] ✅ Matched body PO to finale_purchase_orders: ${finalePO.id}`);
      return { poId: finalePO.id, confidence: 0.80, method: 'body_match', poSource: 'finale' };
    }

    const { data: po } = await supabase
      .from('purchase_orders')
      .select('id')
      .or(`order_id.eq.${poNumber},order_id.eq.PO-${poNumber}`)
      .gte('created_at', thirtyDaysAgoISO)
      .not('status', 'in', `(${excludedStatuses.map(s => s.toLowerCase()).join(',')})`)
      .limit(1)
      .single();

    if (po) {
      return { poId: po.id, confidence: 0.80, method: 'body_match', poSource: 'custom' };
    }
  }

  return { poId: null, confidence: 0, method: 'none', poSource: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tracking Cache - Store tracking info for local caching
// ═══════════════════════════════════════════════════════════════════════════

async function registerTrackingInCache(
  trackingNumber: string,
  carrier: string | null,
  poId: string | null,
  poNumber: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if already registered
    const { data: existing } = await supabase
      .from('tracking_cache')
      .select('id')
      .eq('tracking_number', trackingNumber)
      .single();

    if (existing) {
      console.log(`[email-inbox-poller] Tracking ${trackingNumber} already in cache`);
      return { success: true };
    }

    // Map carrier name to standard slug
    const slugMap: Record<string, string> = {
      UPS: 'ups',
      FedEx: 'fedex',
      USPS: 'usps',
      DHL: 'dhl',
    };
    const slug = carrier ? slugMap[carrier] || carrier.toLowerCase() : 'unknown';

    // Store in tracking cache
    await supabase.from('tracking_cache').insert({
      tracking_number: trackingNumber,
      carrier: slug,
      status: 'Pending',
      status_description: 'Awaiting carrier update',
      source: 'email',
      confidence: 0.8,
      last_update: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Update PO with tracking info
    if (poId) {
      await supabase
        .from('purchase_orders')
        .update({
          tracking_number: trackingNumber,
          tracking_carrier: carrier || slug.toUpperCase(),
          tracking_status: 'processing',
          tracking_last_checked_at: new Date().toISOString(),
        })
        .eq('id', poId);

      // Also update finale_purchase_orders if applicable
      await supabase
        .from('finale_purchase_orders')
        .update({
          tracking_number: trackingNumber,
          tracking_carrier: carrier || slug.toUpperCase(),
          tracking_status: 'processing',
        })
        .eq('id', poId);
    }

    console.log(`[email-inbox-poller] ✅ Registered tracking ${trackingNumber} in cache`);
    return { success: true };

  } catch (error) {
    console.error('[email-inbox-poller] Tracking cache registration failed:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkForAlerts(
  threadId: string,
  poId: string | null,
  subject: string,
  bodyText: string,
  trackingInfo: { trackingNumber: string | null; carrier: string | null; eta: string | null }
): Promise<boolean> {
  const combined = `${subject}\n${bodyText}`.toLowerCase();

  // Check for dispute responses first
  const disputeProcessed = await processDisputeResponse(threadId, poId, subject, bodyText, trackingInfo);
  if (disputeProcessed) {
    return true;
  }

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

// ═══════════════════════════════════════════════════════════════════════════
// Dispute Response Processing
// Parses vendor replies to dispute emails and updates dispute status
// ═══════════════════════════════════════════════════════════════════════════

async function processDisputeResponse(
  threadId: string,
  poId: string | null,
  subject: string,
  bodyText: string,
  trackingInfo: { trackingNumber: string | null; carrier: string | null; eta: string | null }
): Promise<boolean> {
  const combined = `${subject}\n${bodyText}`.toLowerCase();

  // Check if this is a dispute-related email
  const isDisputeReply =
    subject.toLowerCase().includes('invoice discrepancy') ||
    subject.toLowerCase().includes('credit request') ||
    combined.includes('dispute-') ||
    combined.includes('credit memo') ||
    combined.includes('dispute reference');

  if (!isDisputeReply) {
    return false;
  }

  // Try to extract dispute ID from body or subject
  const disputeIdMatch = combined.match(/dispute[-\s]?([a-f0-9]{8})/i);
  let disputeId: string | null = null;

  if (disputeIdMatch) {
    // Look up full dispute ID by prefix
    const { data: dispute } = await supabase
      .from('invoice_disputes')
      .select('id, po_id, status')
      .ilike('id', `${disputeIdMatch[1]}%`)
      .single();

    if (dispute) {
      disputeId = dispute.id;
      poId = dispute.po_id;
    }
  }

  // If no dispute ID found, try to find by PO
  if (!disputeId && poId) {
    const { data: dispute } = await supabase
      .from('invoice_disputes')
      .select('id, status')
      .eq('po_id', poId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (dispute) {
      disputeId = dispute.id;
    }
  }

  if (!disputeId) {
    console.log('[email-inbox-poller] Dispute-like email but no matching dispute found');
    return false;
  }

  // Parse vendor response type
  const responseType = parseDisputeResponseType(combined, trackingInfo.trackingNumber);

  console.log(`[email-inbox-poller] Dispute response detected: ${responseType} for dispute ${disputeId}`);

  // Update dispute status based on response
  const now = new Date().toISOString();

  switch (responseType) {
    case 'credit_issued':
      await supabase
        .from('invoice_disputes')
        .update({
          status: 'resolved',
          resolution_type: 'credit',
          resolution_details: extractCreditDetails(bodyText),
          resolved_at: now,
          vendor_response_at: now,
          vendor_response_type: 'credit_issued',
          notes: `Auto-resolved: Vendor issued credit. ${bodyText.slice(0, 500)}`,
        })
        .eq('id', disputeId);

      // Log success for trust score improvement
      await recordDisputeResolution(disputeId, poId, 'credit_issued', true);
      break;

    case 'shipping_items':
      await supabase
        .from('invoice_disputes')
        .update({
          status: 'resolved',
          resolution_type: 'reshipped',
          resolution_details: {
            trackingNumber: trackingInfo.trackingNumber,
            carrier: trackingInfo.carrier,
          },
          resolved_at: now,
          vendor_response_at: now,
          vendor_response_type: 'shipping_items',
          notes: `Auto-resolved: Vendor shipping missing items. Tracking: ${trackingInfo.trackingNumber || 'pending'}`,
        })
        .eq('id', disputeId);

      // Register tracking if found
      if (trackingInfo.trackingNumber && poId) {
        await registerTrackingInCache(
          trackingInfo.trackingNumber,
          trackingInfo.carrier,
          poId,
          null
        );
      }

      await recordDisputeResolution(disputeId, poId, 'shipping_items', true);
      break;

    case 'vendor_disputes':
      await supabase
        .from('invoice_disputes')
        .update({
          status: 'escalated',
          escalated_at: now,
          vendor_response_at: now,
          vendor_response_type: 'vendor_disputes',
          requires_human: true,
          notes: `Vendor disputes claim. Human review required. Response: ${bodyText.slice(0, 500)}`,
        })
        .eq('id', disputeId);

      // Create alert for human review
      await supabase.rpc('create_email_tracking_alert', {
        p_alert_type: 'dispute_escalated',
        p_severity: 'high',
        p_title: 'Vendor Disputes Credit Claim',
        p_description: `Vendor is disputing our shortage claim. Manual review required.`,
        p_thread_id: threadId,
        p_po_id: poId,
        p_requires_human: true,
        p_route_to_agent: 'vendor_watchdog',
        p_metadata: { disputeId },
      });

      await recordDisputeResolution(disputeId, poId, 'vendor_disputes', false);
      break;

    case 'needs_clarification':
      await supabase
        .from('invoice_disputes')
        .update({
          vendor_response_at: now,
          vendor_response_type: 'needs_clarification',
          notes: `Vendor needs more information. Response: ${bodyText.slice(0, 500)}`,
        })
        .eq('id', disputeId);

      // Increment follow-up stage
      await supabase
        .from('invoice_disputes')
        .update({
          follow_up_count: supabase.sql`follow_up_count + 1`,
          next_follow_up_due_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', disputeId);
      break;

    default:
      // Unknown response - flag for human review
      await supabase
        .from('invoice_disputes')
        .update({
          vendor_response_at: now,
          notes: `Vendor response received but unclear. Response: ${bodyText.slice(0, 500)}`,
          requires_human: true,
        })
        .eq('id', disputeId);
  }

  // Log the parsed response
  await supabase.from('po_vendor_communications').insert({
    po_id: poId,
    communication_type: 'dispute_response',
    direction: 'inbound',
    gmail_thread_id: threadId,
    subject,
    body_preview: bodyText.slice(0, 800),
    sent_at: now,
    metadata: {
      disputeId,
      responseType,
      parsed: true,
    },
  });

  return true;
}

function parseDisputeResponseType(
  text: string,
  trackingNumber: string | null
): 'credit_issued' | 'shipping_items' | 'vendor_disputes' | 'needs_clarification' | 'unknown' {
  const lower = text.toLowerCase();

  // Credit issued indicators
  const creditIndicators = [
    'credit memo',
    'credit issued',
    'credit applied',
    'issuing credit',
    'credit number',
    'will credit',
    'credited your account',
    'credit note',
    'refund',
  ];

  for (const indicator of creditIndicators) {
    if (lower.includes(indicator)) {
      return 'credit_issued';
    }
  }

  // Shipping items indicators
  const shippingIndicators = [
    'shipping',
    'will ship',
    'sending',
    'replacement',
    'resending',
    'new shipment',
    'dispatching',
    'tracking number',
    'tracking:',
  ];

  if (trackingNumber || shippingIndicators.some(i => lower.includes(i))) {
    return 'shipping_items';
  }

  // Vendor disputes indicators
  const disputeIndicators = [
    'disagree',
    'we shipped',
    'items were shipped',
    'delivered',
    'proof of delivery',
    'pod attached',
    'signed for',
    'confirmed delivery',
    'dispute your claim',
    'reject',
  ];

  for (const indicator of disputeIndicators) {
    if (lower.includes(indicator)) {
      return 'vendor_disputes';
    }
  }

  // Needs clarification indicators
  const clarificationIndicators = [
    'need more',
    'please provide',
    'can you send',
    'clarify',
    'which items',
    'please specify',
    'more details',
    'unclear',
  ];

  for (const indicator of clarificationIndicators) {
    if (lower.includes(indicator)) {
      return 'needs_clarification';
    }
  }

  return 'unknown';
}

function extractCreditDetails(text: string): Record<string, any> {
  const details: Record<string, any> = {};

  // Try to extract credit amount
  const amountMatch = text.match(/\$([0-9,]+\.?\d*)/);
  if (amountMatch) {
    details.creditAmount = parseFloat(amountMatch[1].replace(',', ''));
  }

  // Try to extract credit memo number
  const memoMatch = text.match(/(?:credit|memo|reference)[:\s#]*([A-Z0-9-]+)/i);
  if (memoMatch) {
    details.creditMemoNumber = memoMatch[1];
  }

  return details;
}

async function recordDisputeResolution(
  disputeId: string,
  poId: string | null,
  responseType: string,
  successful: boolean
): Promise<void> {
  // Get dispute details for trust score update
  const { data: dispute } = await supabase
    .from('invoice_disputes')
    .select('vendor_id, disputed_amount')
    .eq('id', disputeId)
    .single();

  if (!dispute?.vendor_id) return;

  // Update vendor trust metrics
  const column = successful ? 'disputes_resolved' : 'disputes_escalated';
  await supabase.rpc('increment_vendor_metric', {
    p_vendor_id: dispute.vendor_id,
    p_metric_name: column,
    p_increment: 1,
  });

  // Log for trust score calculation
  await supabase.from('vendor_trust_events').insert({
    vendor_id: dispute.vendor_id,
    event_type: 'dispute_resolution',
    outcome: successful ? 'positive' : 'negative',
    details: {
      disputeId,
      poId,
      responseType,
      amount: dispute.disputed_amount,
    },
    trust_impact: successful ? 0.02 : -0.05, // Small positive for resolution, larger negative for escalation
  });
}
