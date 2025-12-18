/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EMAIL INBOX MANAGER - Dedicated Email Monitoring Service
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Core service for the Email Tracking Agent that manages:
 * - Multiple email inbox configurations
 * - Gmail API interactions (OAuth, fetching, history sync)
 * - Thread correlation and intelligence extraction
 * - Coordination with other agents
 *
 * Mission: NEVER BE OUT OF STOCK
 *
 * @module services/emailInboxManager
 * @author MuRP Development Team
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

export interface EmailInboxConfig {
  id: string;
  inbox_name: string;
  email_address: string;
  display_name: string | null;
  description: string | null;
  gmail_client_id: string | null;
  gmail_client_secret_ref: string | null;
  gmail_refresh_token_ref: string | null;
  gmail_user: string;
  poll_enabled: boolean;
  poll_interval_minutes: number;
  last_poll_at: string | null;
  last_history_id: string | null;
  next_poll_at: string | null;
  is_active: boolean;
  ai_parsing_enabled: boolean;
  max_emails_per_hour: number;
  max_daily_ai_cost_usd: number;
  ai_confidence_threshold: number;
  keyword_filters: string[];
  exclude_senders: string[] | null;
  include_only_domains: string[] | null;
  auto_correlate_vendors: boolean;
  total_emails_processed: number;
  total_emails_matched: number;
  total_pos_correlated: number;
  correlation_success_rate: number | null;
  status: 'active' | 'paused' | 'error' | 'setup_required';
  last_error: string | null;
  daily_ai_cost_usd: number;
}

export interface EmailThread {
  id: string;
  gmail_thread_id: string;
  inbox_config_id: string | null;
  po_id: string | null;
  vendor_id: string | null;
  correlation_confidence: number | null;
  correlation_method: string | null;
  subject: string | null;
  message_count: number;
  last_message_at: string | null;
  tracking_numbers: string[] | null;
  carriers: string[] | null;
  latest_tracking_status: string | null;
  latest_eta: string | null;
  has_invoice: boolean;
  has_tracking_info: boolean;
  requires_response: boolean;
  urgency_level: 'low' | 'normal' | 'high' | 'critical';
  is_resolved: boolean;
  thread_summary: string | null;
}

export interface EmailThreadMessage {
  id: string;
  thread_id: string;
  gmail_message_id: string;
  direction: 'inbound' | 'outbound';
  sender_email: string;
  recipient_emails: string[] | null;
  subject: string | null;
  body_preview: string | null;
  sent_at: string | null;
  received_at: string | null;
  has_attachments: boolean;
  ai_extracted: boolean;
  extracted_data: any;
  extracted_tracking_number: string | null;
  extracted_carrier: string | null;
  extracted_eta: string | null;
}

export interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  user: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    mimeType: string;
    body?: { data?: string; size: number };
    parts?: any[];
  };
  internalDate: string;
}

export interface ProcessingResult {
  success: boolean;
  threadsCreated: number;
  threadsUpdated: number;
  messagesProcessed: number;
  posCorrelated: number;
  trackingNumbersFound: number;
  alertsGenerated: number;
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 📬 INBOX CONFIGURATION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all email inbox configurations
 */
export async function getInboxConfigs(): Promise<EmailInboxConfig[]> {
  const { data, error } = await supabase
    .from('email_inbox_configs')
    .select('*')
    .order('inbox_name');

  if (error) throw new Error(`Failed to fetch inbox configs: ${error.message}`);
  return data || [];
}

/**
 * Get active inbox configurations ready for polling
 */
export async function getActiveInboxes(): Promise<EmailInboxConfig[]> {
  const { data, error } = await supabase
    .from('email_inbox_configs')
    .select('*')
    .eq('is_active', true)
    .eq('poll_enabled', true)
    .in('status', ['active', 'error']) // Allow retrying errored inboxes
    .order('next_poll_at', { ascending: true, nullsFirst: true });

  if (error) throw new Error(`Failed to fetch active inboxes: ${error.message}`);
  return data || [];
}

/**
 * Get a single inbox configuration by ID
 */
export async function getInboxConfig(id: string): Promise<EmailInboxConfig | null> {
  const { data, error } = await supabase
    .from('email_inbox_configs')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch inbox config: ${error.message}`);
  }
  return data;
}

/**
 * Update inbox configuration
 */
export async function updateInboxConfig(
  id: string,
  updates: Partial<EmailInboxConfig>
): Promise<void> {
  const { error } = await supabase
    .from('email_inbox_configs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`Failed to update inbox config: ${error.message}`);
}

/**
 * Create a new inbox configuration
 */
export async function createInboxConfig(
  config: Partial<EmailInboxConfig>
): Promise<string> {
  const { data, error } = await supabase
    .from('email_inbox_configs')
    .insert({
      inbox_name: config.inbox_name,
      email_address: config.email_address,
      display_name: config.display_name,
      description: config.description,
      gmail_client_id: config.gmail_client_id,
      gmail_client_secret_ref: config.gmail_client_secret_ref,
      gmail_refresh_token_ref: config.gmail_refresh_token_ref,
      gmail_user: config.gmail_user || 'me',
      is_active: config.is_active ?? false,
      status: 'setup_required',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create inbox config: ${error.message}`);
  return data.id;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧵 THREAD MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find or create an email thread record
 */
export async function findOrCreateThread(
  gmailThreadId: string,
  inboxConfigId?: string,
  subject?: string
): Promise<EmailThread> {
  // Try to find existing
  const { data: existing } = await supabase
    .from('email_threads')
    .select('*')
    .eq('gmail_thread_id', gmailThreadId)
    .single();

  if (existing) return existing;

  // Create new
  const { data, error } = await supabase
    .from('email_threads')
    .insert({
      gmail_thread_id: gmailThreadId,
      inbox_config_id: inboxConfigId,
      subject,
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create thread: ${error.message}`);
  return data;
}

/**
 * Get thread by Gmail thread ID
 */
export async function getThreadByGmailId(gmailThreadId: string): Promise<EmailThread | null> {
  const { data, error } = await supabase
    .from('email_threads')
    .select('*')
    .eq('gmail_thread_id', gmailThreadId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch thread: ${error.message}`);
  }
  return data;
}

/**
 * Get threads for a PO
 */
export async function getThreadsForPO(poId: string): Promise<EmailThread[]> {
  const { data, error } = await supabase
    .from('email_threads')
    .select('*')
    .eq('po_id', poId)
    .order('last_message_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch threads for PO: ${error.message}`);
  return data || [];
}

/**
 * Get threads requiring attention
 */
export async function getThreadsRequiringAttention(): Promise<any[]> {
  const { data, error } = await supabase.rpc('get_threads_requiring_attention');

  if (error) throw new Error(`Failed to fetch threads requiring attention: ${error.message}`);
  return data || [];
}

/**
 * Correlate a thread to a PO
 */
export async function correlateThreadToPO(
  threadId: string,
  poId: string,
  confidence: number,
  method: string,
  details?: any
): Promise<void> {
  const { error } = await supabase.rpc('correlate_thread_to_po', {
    p_thread_id: threadId,
    p_po_id: poId,
    p_confidence: confidence,
    p_method: method,
    p_details: details,
  });

  if (error) throw new Error(`Failed to correlate thread to PO: ${error.message}`);
}

/**
 * Update thread intelligence
 */
export async function updateThreadIntelligence(
  threadId: string,
  updates: Partial<EmailThread>
): Promise<void> {
  const { error } = await supabase
    .from('email_threads')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', threadId);

  if (error) throw new Error(`Failed to update thread intelligence: ${error.message}`);
}

/**
 * Add a timeline event to a thread
 */
export async function addThreadTimelineEvent(
  threadId: string,
  event: string,
  messageId?: string,
  details?: any
): Promise<void> {
  const { error } = await supabase.rpc('add_thread_timeline_event', {
    p_thread_id: threadId,
    p_event: event,
    p_message_id: messageId,
    p_details: details,
  });

  if (error) throw new Error(`Failed to add timeline event: ${error.message}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 📧 MESSAGE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add a message to a thread
 */
export async function addMessageToThread(
  threadId: string,
  message: Partial<EmailThreadMessage>
): Promise<EmailThreadMessage> {
  const { data, error } = await supabase
    .from('email_thread_messages')
    .insert({
      thread_id: threadId,
      gmail_message_id: message.gmail_message_id,
      direction: message.direction,
      sender_email: message.sender_email,
      recipient_emails: message.recipient_emails,
      subject: message.subject,
      body_preview: message.body_preview,
      sent_at: message.sent_at,
      received_at: message.received_at,
      has_attachments: message.has_attachments ?? false,
      attachment_count: message.has_attachments ? 1 : 0,
      ai_extracted: message.ai_extracted ?? false,
      ai_confidence: message.ai_extracted ? 0.8 : null,
      extracted_data: message.extracted_data,
      extracted_tracking_number: message.extracted_tracking_number,
      extracted_carrier: message.extracted_carrier,
      extracted_eta: message.extracted_eta,
      processing_status: 'processed',
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to add message to thread: ${error.message}`);
  return data;
}

/**
 * Get messages for a thread
 */
export async function getThreadMessages(threadId: string): Promise<EmailThreadMessage[]> {
  const { data, error } = await supabase
    .from('email_thread_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch thread messages: ${error.message}`);
  return data || [];
}

/**
 * Check if message already exists
 */
export async function messageExists(gmailMessageId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('email_thread_messages')
    .select('id')
    .eq('gmail_message_id', gmailMessageId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to check message existence: ${error.message}`);
  }
  return !!data;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 PO CORRELATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Try to correlate an email to a PO using multiple strategies
 */
export async function correlateEmailToPO(
  gmailThreadId: string,
  senderEmail: string,
  subject: string,
  bodyText?: string
): Promise<{ poId: string | null; confidence: number; method: string }> {
  // Strategy 1: Check if thread already correlated
  const existingThread = await getThreadByGmailId(gmailThreadId);
  if (existingThread?.po_id) {
    return {
      poId: existingThread.po_id,
      confidence: 0.95,
      method: 'thread_history',
    };
  }

  // Strategy 2: Subject line PO number match
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

  // Strategy 3: Sender domain to vendor mapping
  const { data: vendorLookup } = await supabase.rpc('lookup_vendor_by_email_domain', {
    p_sender_email: senderEmail,
  });

  if (vendorLookup && vendorLookup.length > 0) {
    const vendorId = vendorLookup[0].vendor_id;
    const confidence = vendorLookup[0].confidence;

    // Find recent open PO for this vendor
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
        confidence: Math.min(confidence * 0.8, 0.75),
        method: 'sender_domain',
      };
    }
  }

  // Strategy 4: Body content search for PO number
  if (bodyText) {
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
  }

  // No correlation found
  return { poId: null, confidence: 0, method: 'none' };
}

/**
 * Learn vendor domain from successful correlation
 */
export async function learnVendorDomain(
  senderEmail: string,
  vendorId: string,
  confidence: number = 0.85
): Promise<void> {
  const { error } = await supabase.rpc('learn_vendor_email_domain', {
    p_sender_email: senderEmail,
    p_vendor_id: vendorId,
    p_confidence: confidence,
  });

  if (error) {
    console.error('Failed to learn vendor domain:', error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚨 ALERTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an email tracking alert
 */
export async function createAlert(params: {
  alertType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description?: string;
  threadId?: string;
  poId?: string;
  vendorId?: string;
  affectedSkus?: string[];
  originalEta?: string;
  newEta?: string;
  stockoutRiskDate?: string;
  requiresHuman?: boolean;
  routeToAgent?: string;
  sourceData?: any;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_email_tracking_alert', {
    p_alert_type: params.alertType,
    p_severity: params.severity,
    p_title: params.title,
    p_description: params.description,
    p_thread_id: params.threadId,
    p_po_id: params.poId,
    p_vendor_id: params.vendorId,
    p_affected_skus: params.affectedSkus,
    p_original_eta: params.originalEta,
    p_new_eta: params.newEta,
    p_stockout_risk_date: params.stockoutRiskDate,
    p_requires_human: params.requiresHuman ?? false,
    p_route_to_agent: params.routeToAgent,
    p_source_data: params.sourceData,
  });

  if (error) throw new Error(`Failed to create alert: ${error.message}`);
  return data;
}

/**
 * Get open alerts
 */
export async function getOpenAlerts(severity?: string): Promise<any[]> {
  let query = supabase
    .from('email_tracking_alerts')
    .select(`
      *,
      email_threads(subject, po_id),
      purchase_orders(order_id, supplier_name)
    `)
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  if (severity) {
    query = query.eq('severity', severity);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch alerts: ${error.message}`);
  return data || [];
}

/**
 * Get alert summary
 */
export async function getAlertSummary(): Promise<any> {
  const { data, error } = await supabase.rpc('get_email_alert_summary');

  if (error) throw new Error(`Failed to get alert summary: ${error.message}`);
  return data?.[0] || {
    total_open: 0,
    critical_count: 0,
    high_count: 0,
    medium_count: 0,
    low_count: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 AGENT RUNS & STATS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start a new agent run
 */
export async function startAgentRun(
  runType: 'poll' | 'webhook' | 'manual' | 'scheduled',
  inboxConfigId?: string
): Promise<string> {
  const { data, error } = await supabase
    .from('email_tracking_runs')
    .insert({
      run_type: runType,
      inbox_config_id: inboxConfigId,
      status: 'running',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to start agent run: ${error.message}`);
  return data.id;
}

/**
 * Complete an agent run
 */
export async function completeAgentRun(
  runId: string,
  stats: Partial<{
    emails_fetched: number;
    emails_processed: number;
    emails_skipped: number;
    emails_errored: number;
    threads_created: number;
    threads_updated: number;
    pos_correlated: number;
    tracking_numbers_found: number;
    etas_extracted: number;
    alerts_critical: number;
    alerts_high: number;
    alerts_normal: number;
    ai_calls_made: number;
    ai_tokens_used: number;
    ai_cost_usd: number;
    gmail_history_id_end: string;
  }>,
  status: 'completed' | 'failed' | 'partial' = 'completed',
  errorMessage?: string
): Promise<void> {
  const startTime = await supabase
    .from('email_tracking_runs')
    .select('started_at')
    .eq('id', runId)
    .single();

  const durationMs = startTime.data
    ? Date.now() - new Date(startTime.data.started_at).getTime()
    : 0;

  const { error } = await supabase
    .from('email_tracking_runs')
    .update({
      ...stats,
      status,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    })
    .eq('id', runId);

  if (error) throw new Error(`Failed to complete agent run: ${error.message}`);

  // Update agent stats
  await supabase
    .from('agent_configs')
    .update({
      emails_processed: supabase.rpc('increment_counter', {
        row_id: 'email_tracking',
        column_name: 'emails_processed',
        increment_by: stats.emails_processed || 0,
      }),
      updated_at: new Date().toISOString(),
    })
    .eq('agent_identifier', 'email_tracking');
}

/**
 * Get recent agent runs
 */
export async function getRecentRuns(limit: number = 10): Promise<any[]> {
  const { data, error } = await supabase
    .from('email_tracking_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch recent runs: ${error.message}`);
  return data || [];
}

/**
 * Get agent stats
 */
export async function getAgentStats(): Promise<any> {
  const { data, error } = await supabase
    .from('email_tracking_agent_stats')
    .select('*')
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch agent stats: ${error.message}`);
  }
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 Export Everything
// ═══════════════════════════════════════════════════════════════════════════

export default {
  // Inbox management
  getInboxConfigs,
  getActiveInboxes,
  getInboxConfig,
  updateInboxConfig,
  createInboxConfig,

  // Thread management
  findOrCreateThread,
  getThreadByGmailId,
  getThreadsForPO,
  getThreadsRequiringAttention,
  correlateThreadToPO,
  updateThreadIntelligence,
  addThreadTimelineEvent,

  // Message management
  addMessageToThread,
  getThreadMessages,
  messageExists,

  // PO correlation
  correlateEmailToPO,
  learnVendorDomain,

  // Alerts
  createAlert,
  getOpenAlerts,
  getAlertSummary,

  // Agent runs
  startAgentRun,
  completeAgentRun,
  getRecentRuns,
  getAgentStats,
};
