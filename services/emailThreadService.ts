/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EMAIL THREAD SERVICE - Thread Intelligence & Reconstruction
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Provides deep thread intelligence:
 * - Full thread reconstruction from messages
 * - AI-powered thread summarization
 * - Action item extraction
 * - Timeline generation
 * - Key dates extraction
 *
 * Part of: Email Tracking Agent Expansion - Phase 2
 * Goal: NEVER BE OUT OF STOCK
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ThreadMessage {
  id: string;
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
  ai_confidence: number | null;
  extracted_data: any;
  extracted_tracking_number: string | null;
  extracted_carrier: string | null;
  extracted_eta: string | null;
  extracted_status: string | null;
  is_confirmation: boolean;
  is_delay_notice: boolean;
  is_backorder_notice: boolean;
  response_category: string | null;
}

export interface ThreadReconstruction {
  threadId: string;
  gmailThreadId: string;
  subject: string;
  poId: string | null;
  poNumber: string | null;
  vendorId: string | null;
  vendorName: string | null;
  correlationConfidence: number | null;
  messages: ThreadMessage[];
  timeline: TimelineEvent[];
  keyDates: KeyDates;
  keyAmounts: KeyAmounts | null;
  trackingInfo: TrackingInfo;
  status: ThreadStatus;
  actionItems: ActionItem[];
  summary: string | null;
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent' | null;
}

export interface TimelineEvent {
  event: string;
  timestamp: string;
  messageId?: string;
  details?: any;
  icon?: string;
  color?: string;
}

export interface KeyDates {
  poSent: string | null;
  confirmed: string | null;
  shipped: string | null;
  eta: string | null;
  delivered: string | null;
  lastContact: string | null;
}

export interface KeyAmounts {
  subtotal: number | null;
  shipping: number | null;
  tax: number | null;
  total: number | null;
}

export interface TrackingInfo {
  trackingNumbers: string[];
  carriers: string[];
  latestStatus: string | null;
  latestEta: string | null;
  etaConfidence: 'high' | 'medium' | 'low' | null;
}

export interface ThreadStatus {
  status: 'active' | 'awaiting_response' | 'delivered' | 'resolved' | 'critical';
  daysWaiting: number | null;
  requiresResponse: boolean;
  responseDueBy: string | null;
  urgencyLevel: 'low' | 'normal' | 'high' | 'critical';
}

export interface ActionItem {
  action: string;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  dueDate?: string;
  assignee?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Thread Reconstruction
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get full thread reconstruction with all intelligence
 */
export async function reconstructThread(threadId: string): Promise<ThreadReconstruction | null> {
  // Fetch thread with PO and vendor info
  const { data: thread, error: threadError } = await supabase
    .from('email_threads')
    .select(`
      *,
      purchase_orders (
        id,
        order_id,
        status,
        total,
        shipping_cost,
        tax,
        sent_at
      ),
      vendors (
        id,
        name
      )
    `)
    .eq('id', threadId)
    .single();

  if (threadError || !thread) {
    console.error('[emailThreadService] Failed to fetch thread:', threadError);
    return null;
  }

  // Fetch all messages in thread
  const { data: messages, error: messagesError } = await supabase
    .from('email_thread_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true });

  if (messagesError) {
    console.error('[emailThreadService] Failed to fetch messages:', messagesError);
    return null;
  }

  const threadMessages = messages || [];

  // Build timeline from thread data and messages
  const timeline = buildTimeline(thread, threadMessages);

  // Extract key dates
  const keyDates = extractKeyDates(thread, threadMessages);

  // Extract key amounts from PO
  const keyAmounts = thread.purchase_orders
    ? {
        subtotal: thread.purchase_orders.total - (thread.purchase_orders.shipping_cost || 0) - (thread.purchase_orders.tax || 0),
        shipping: thread.purchase_orders.shipping_cost,
        tax: thread.purchase_orders.tax,
        total: thread.purchase_orders.total,
      }
    : null;

  // Build tracking info
  const trackingInfo: TrackingInfo = {
    trackingNumbers: thread.tracking_numbers || [],
    carriers: thread.carriers || [],
    latestStatus: thread.latest_tracking_status,
    latestEta: thread.latest_eta,
    etaConfidence: thread.eta_confidence,
  };

  // Determine thread status
  const status = determineThreadStatus(thread, threadMessages);

  // Extract action items
  const actionItems = extractActionItems(thread, threadMessages, status);

  return {
    threadId: thread.id,
    gmailThreadId: thread.gmail_thread_id,
    subject: thread.subject || 'No Subject',
    poId: thread.po_id,
    poNumber: thread.purchase_orders?.order_id || null,
    vendorId: thread.vendor_id,
    vendorName: thread.vendors?.name || null,
    correlationConfidence: thread.correlation_confidence,
    messages: threadMessages,
    timeline,
    keyDates,
    keyAmounts,
    trackingInfo,
    status,
    actionItems,
    summary: thread.thread_summary,
    sentiment: thread.sentiment,
  };
}

/**
 * Build timeline from thread and messages
 */
function buildTimeline(thread: any, messages: ThreadMessage[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Add stored timeline events
  if (thread.timeline && Array.isArray(thread.timeline)) {
    events.push(...thread.timeline);
  }

  // Generate events from messages if not in stored timeline
  const storedEventIds = new Set(events.map((e) => e.messageId).filter(Boolean));

  for (const msg of messages) {
    if (storedEventIds.has(msg.gmail_message_id)) continue;

    const timestamp = msg.sent_at || msg.received_at || '';
    if (!timestamp) continue;

    // Base message event
    events.push({
      event: msg.direction === 'inbound' ? 'vendor_reply' : 'outbound_sent',
      timestamp,
      messageId: msg.gmail_message_id,
      details: {
        subject: msg.subject,
        preview: msg.body_preview?.slice(0, 100),
      },
      icon: msg.direction === 'inbound' ? 'inbox' : 'send',
      color: msg.direction === 'inbound' ? 'emerald' : 'sky',
    });

    // Add special events based on message content
    if (msg.is_confirmation) {
      events.push({
        event: 'order_confirmed',
        timestamp,
        messageId: msg.gmail_message_id,
        icon: 'check',
        color: 'emerald',
      });
    }

    if (msg.extracted_tracking_number) {
      events.push({
        event: 'tracking_received',
        timestamp,
        messageId: msg.gmail_message_id,
        details: {
          trackingNumber: msg.extracted_tracking_number,
          carrier: msg.extracted_carrier,
        },
        icon: 'truck',
        color: 'sky',
      });
    }

    if (msg.is_delay_notice) {
      events.push({
        event: 'delay_notice',
        timestamp,
        messageId: msg.gmail_message_id,
        icon: 'warning',
        color: 'amber',
      });
    }

    if (msg.is_backorder_notice) {
      events.push({
        event: 'backorder_notice',
        timestamp,
        messageId: msg.gmail_message_id,
        icon: 'exclamation',
        color: 'red',
      });
    }
  }

  // Sort by timestamp
  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return events;
}

/**
 * Extract key dates from thread and messages
 */
function extractKeyDates(thread: any, messages: ThreadMessage[]): KeyDates {
  const dates: KeyDates = {
    poSent: thread.purchase_orders?.sent_at || null,
    confirmed: null,
    shipped: null,
    eta: thread.latest_eta,
    delivered: null,
    lastContact: thread.last_message_at,
  };

  // Extract from stored key_dates
  if (thread.key_dates) {
    dates.confirmed = thread.key_dates.confirmed || dates.confirmed;
    dates.shipped = thread.key_dates.shipped || dates.shipped;
    dates.eta = thread.key_dates.eta || dates.eta;
    dates.delivered = thread.key_dates.delivered || dates.delivered;
  }

  // Extract from messages if not already set
  for (const msg of messages) {
    if (!dates.confirmed && msg.is_confirmation) {
      dates.confirmed = msg.sent_at || msg.received_at || null;
    }
    if (!dates.eta && msg.extracted_eta) {
      dates.eta = msg.extracted_eta;
    }
  }

  return dates;
}

/**
 * Determine thread status
 */
function determineThreadStatus(thread: any, messages: ThreadMessage[]): ThreadStatus {
  const lastInbound = messages
    .filter((m) => m.direction === 'inbound')
    .sort((a, b) => new Date(b.sent_at || 0).getTime() - new Date(a.sent_at || 0).getTime())[0];

  const lastOutbound = messages
    .filter((m) => m.direction === 'outbound')
    .sort((a, b) => new Date(b.sent_at || 0).getTime() - new Date(a.sent_at || 0).getTime())[0];

  // Calculate days waiting
  let daysWaiting: number | null = null;
  if (lastOutbound && (!lastInbound || new Date(lastOutbound.sent_at || 0) > new Date(lastInbound.sent_at || 0))) {
    daysWaiting = Math.floor(
      (Date.now() - new Date(lastOutbound.sent_at || 0).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  // Determine status
  let status: ThreadStatus['status'] = 'active';
  if (thread.is_resolved) {
    status = 'resolved';
  } else if (thread.latest_tracking_status === 'delivered') {
    status = 'delivered';
  } else if (thread.urgency_level === 'critical') {
    status = 'critical';
  } else if (daysWaiting && daysWaiting > 2) {
    status = 'awaiting_response';
  }

  return {
    status,
    daysWaiting,
    requiresResponse: thread.requires_response || false,
    responseDueBy: thread.response_due_by,
    urgencyLevel: thread.urgency_level || 'normal',
  };
}

/**
 * Extract action items from thread
 */
function extractActionItems(thread: any, messages: ThreadMessage[], status: ThreadStatus): ActionItem[] {
  const items: ActionItem[] = [];

  // Use stored action items
  if (thread.action_items && Array.isArray(thread.action_items)) {
    items.push(...thread.action_items);
  }

  // Generate action items based on status
  if (status.status === 'awaiting_response' && status.daysWaiting && status.daysWaiting > 3) {
    items.push({
      action: 'follow_up',
      reason: `No vendor response in ${status.daysWaiting} days`,
      priority: status.daysWaiting > 7 ? 'high' : 'medium',
    });
  }

  if (status.urgencyLevel === 'critical') {
    items.push({
      action: 'escalate',
      reason: 'Critical urgency - requires immediate attention',
      priority: 'critical',
    });
  }

  // Check for missing tracking
  if (!thread.has_tracking_info && messages.some((m) => m.is_confirmation)) {
    items.push({
      action: 'request_tracking',
      reason: 'Order confirmed but no tracking info received',
      priority: 'medium',
    });
  }

  // Check for delay/backorder
  const hasDelayNotice = messages.some((m) => m.is_delay_notice);
  const hasBackorderNotice = messages.some((m) => m.is_backorder_notice);

  if (hasDelayNotice) {
    items.push({
      action: 'review_delay',
      reason: 'Delay notice received - assess impact',
      priority: 'high',
    });
  }

  if (hasBackorderNotice) {
    items.push({
      action: 'review_backorder',
      reason: 'Backorder notice received - find alternatives',
      priority: 'critical',
    });
  }

  return items;
}

// ═══════════════════════════════════════════════════════════════════════════
// Thread Queries
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get threads for a PO
 */
export async function getThreadsForPO(poId: string): Promise<ThreadReconstruction[]> {
  const { data: threads, error } = await supabase
    .from('email_threads')
    .select('id')
    .eq('po_id', poId)
    .order('last_message_at', { ascending: false });

  if (error || !threads) {
    console.error('[emailThreadService] Failed to fetch threads for PO:', error);
    return [];
  }

  const reconstructions: ThreadReconstruction[] = [];
  for (const thread of threads) {
    const reconstruction = await reconstructThread(thread.id);
    if (reconstruction) {
      reconstructions.push(reconstruction);
    }
  }

  return reconstructions;
}

/**
 * Get threads requiring attention
 */
export async function getThreadsRequiringAttention(): Promise<ThreadReconstruction[]> {
  const { data: threads, error } = await supabase
    .from('email_threads')
    .select('id')
    .eq('is_resolved', false)
    .or('urgency_level.in.(high,critical),requires_response.eq.true')
    .order('last_message_at', { ascending: false })
    .limit(20);

  if (error || !threads) {
    console.error('[emailThreadService] Failed to fetch attention threads:', error);
    return [];
  }

  const reconstructions: ThreadReconstruction[] = [];
  for (const thread of threads) {
    const reconstruction = await reconstructThread(thread.id);
    if (reconstruction) {
      reconstructions.push(reconstruction);
    }
  }

  return reconstructions;
}

/**
 * Get recent threads
 */
export async function getRecentThreads(limit: number = 10): Promise<ThreadReconstruction[]> {
  const { data: threads, error } = await supabase
    .from('email_threads')
    .select('id')
    .order('last_message_at', { ascending: false })
    .limit(limit);

  if (error || !threads) {
    console.error('[emailThreadService] Failed to fetch recent threads:', error);
    return [];
  }

  const reconstructions: ThreadReconstruction[] = [];
  for (const thread of threads) {
    const reconstruction = await reconstructThread(thread.id);
    if (reconstruction) {
      reconstructions.push(reconstruction);
    }
  }

  return reconstructions;
}

// ═══════════════════════════════════════════════════════════════════════════
// Thread Updates
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Update thread summary (after AI generates it)
 */
export async function updateThreadSummary(
  threadId: string,
  summary: string,
  sentiment?: 'positive' | 'neutral' | 'negative' | 'urgent'
): Promise<void> {
  const { error } = await supabase
    .from('email_threads')
    .update({
      thread_summary: summary,
      summary_updated_at: new Date().toISOString(),
      sentiment: sentiment || null,
    })
    .eq('id', threadId);

  if (error) {
    console.error('[emailThreadService] Failed to update summary:', error);
    throw error;
  }
}

/**
 * Update thread key dates
 */
export async function updateThreadKeyDates(threadId: string, keyDates: Partial<KeyDates>): Promise<void> {
  const { data: current, error: fetchError } = await supabase
    .from('email_threads')
    .select('key_dates')
    .eq('id', threadId)
    .single();

  if (fetchError) {
    console.error('[emailThreadService] Failed to fetch current key dates:', fetchError);
    throw fetchError;
  }

  const merged = { ...(current?.key_dates || {}), ...keyDates };

  const { error } = await supabase
    .from('email_threads')
    .update({ key_dates: merged })
    .eq('id', threadId);

  if (error) {
    console.error('[emailThreadService] Failed to update key dates:', error);
    throw error;
  }
}

/**
 * Update thread action items
 */
export async function updateThreadActionItems(threadId: string, actionItems: ActionItem[]): Promise<void> {
  const { error } = await supabase
    .from('email_threads')
    .update({ action_items: actionItems })
    .eq('id', threadId);

  if (error) {
    console.error('[emailThreadService] Failed to update action items:', error);
    throw error;
  }
}

/**
 * Mark thread as resolved
 */
export async function resolveThread(
  threadId: string,
  resolutionType: 'delivered' | 'cancelled' | 'merged' | 'no_action_needed' | 'manual_close',
  notes?: string
): Promise<void> {
  const { error } = await supabase
    .from('email_threads')
    .update({
      is_resolved: true,
      resolved_at: new Date().toISOString(),
      resolution_type: resolutionType,
      resolution_notes: notes || null,
    })
    .eq('id', threadId);

  if (error) {
    console.error('[emailThreadService] Failed to resolve thread:', error);
    throw error;
  }
}

/**
 * Set thread urgency
 */
export async function setThreadUrgency(
  threadId: string,
  urgencyLevel: 'low' | 'normal' | 'high' | 'critical',
  reason?: string
): Promise<void> {
  const { error } = await supabase
    .from('email_threads')
    .update({
      urgency_level: urgencyLevel,
      urgency_reason: reason || null,
      escalated: urgencyLevel === 'critical',
      escalated_at: urgencyLevel === 'critical' ? new Date().toISOString() : null,
    })
    .eq('id', threadId);

  if (error) {
    console.error('[emailThreadService] Failed to set urgency:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI Summarization (stub - implement with actual AI call)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate AI summary for a thread
 * This is a stub - implement with actual AI provider call
 */
export async function generateThreadSummary(threadId: string): Promise<string> {
  const reconstruction = await reconstructThread(threadId);
  if (!reconstruction) {
    throw new Error('Thread not found');
  }

  // Build context for AI
  const messagesSummary = reconstruction.messages
    .map((m) => {
      const direction = m.direction === 'inbound' ? 'Vendor' : 'Us';
      const date = m.sent_at ? new Date(m.sent_at).toLocaleDateString() : 'Unknown date';
      return `[${date}] ${direction}: ${m.body_preview || m.subject || 'No content'}`;
    })
    .join('\n');

  const context = `
PO: ${reconstruction.poNumber || 'Not linked'}
Vendor: ${reconstruction.vendorName || 'Unknown'}
Subject: ${reconstruction.subject}
Tracking: ${reconstruction.trackingInfo.trackingNumbers.join(', ') || 'None'}
ETA: ${reconstruction.keyDates.eta || 'Unknown'}

Messages:
${messagesSummary}
`;

  // TODO: Call actual AI provider
  // For now, generate a simple summary
  const messageCount = reconstruction.messages.length;
  const hasTracking = reconstruction.trackingInfo.trackingNumbers.length > 0;
  const isConfirmed = reconstruction.keyDates.confirmed !== null;

  let summary = `Thread with ${messageCount} message(s). `;

  if (isConfirmed) {
    summary += 'Order confirmed. ';
  }

  if (hasTracking) {
    summary += `Tracking received: ${reconstruction.trackingInfo.trackingNumbers[0]}. `;
    if (reconstruction.keyDates.eta) {
      summary += `ETA: ${reconstruction.keyDates.eta}. `;
    }
  } else if (isConfirmed) {
    summary += 'Awaiting tracking information. ';
  }

  if (reconstruction.status.status === 'awaiting_response') {
    summary += `Waiting for vendor response (${reconstruction.status.daysWaiting} days). `;
  }

  return summary.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════════════

export default {
  reconstructThread,
  getThreadsForPO,
  getThreadsRequiringAttention,
  getRecentThreads,
  updateThreadSummary,
  updateThreadKeyDates,
  updateThreadActionItems,
  resolveThread,
  setThreadUrgency,
  generateThreadSummary,
};
