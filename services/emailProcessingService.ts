/**
 * Email Processing Service
 *
 * Provides agent-callable functions for processing emails from configured Gmail inboxes.
 * This service wraps the email-inbox-poller edge function and emailInboxManager
 * to provide real email processing capabilities for the Email Tracking Specialist agent.
 *
 * Supports two inbox types:
 * - Purchasing: Vendor communications, PO updates, tracking numbers
 * - Accounting (AP): Invoices, payment confirmations, financial docs
 */

import { supabase } from '../lib/supabase/client';
import {
  getActiveInboxes,
  getThreadsRequiringAttention,
  getOpenAlerts,
  getAlertSummary,
  correlateEmailToPO,
  findOrCreateThread,
  addMessageToThread,
  createAlert,
  type EmailInboxConfig,
  type ProcessingResult,
} from './emailInboxManager';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface EmailProcessingStats {
  inboxesProcessed: number;
  emailsFetched: number;
  emailsProcessed: number;
  threadsCreated: number;
  posCorrelated: number;
  trackingNumbersFound: number;
  alertsGenerated: number;
  errors: string[];
}

export interface ParsedEmailContent {
  threadId: string;
  messageId: string;
  subject: string;
  from: string;
  to: string;
  bodyPreview: string;
  trackingNumber: string | null;
  carrier: string | null;
  eta: string | null;
  poId: string | null;
  correlationConfidence: number;
  correlationMethod: string;
  alertType: string | null;
  direction: 'inbound' | 'outbound';
}

export interface InboxProcessingResult {
  inboxId: string;
  inboxName: string;
  purpose: 'purchasing' | 'accounting' | 'general';
  success: boolean;
  emails: ParsedEmailContent[];
  stats: EmailProcessingStats;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tracking Number Extraction Patterns
// ═══════════════════════════════════════════════════════════════════════════

const TRACKING_PATTERNS = {
  // UPS: 1Z followed by 16 alphanumeric chars
  UPS: /\b1Z[A-Z0-9]{16}\b/gi,
  // FedEx: 12-22 digits
  FedEx: /\b(?:96\d{20}|\d{12,22})\b/g,
  // USPS: Various formats
  USPS: /\b(?:94\d{20}|93\d{20}|92\d{20}|91\d{20}|94\d{22}|93\d{22}|92\d{22}|91\d{22})\b/g,
  // DHL: 10-11 digits or alphanumeric
  DHL: /\b(?:\d{10,11}|[A-Z]{3}\d{7,10})\b/gi,
  // Generic tracking pattern
  Generic: /\b(?:tracking|track|shipment)[:\s#]*([A-Z0-9]{10,30})\b/gi,
};

const CARRIER_KEYWORDS: Record<string, string[]> = {
  UPS: ['ups', '1z', 'united parcel'],
  FedEx: ['fedex', 'fed ex', 'federal express'],
  USPS: ['usps', 'postal', 'united states postal'],
  DHL: ['dhl'],
};

// ═══════════════════════════════════════════════════════════════════════════
// Core Processing Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Trigger the email-inbox-poller edge function to fetch and process new emails
 */
export async function triggerEmailPolling(): Promise<InboxProcessingResult[]> {
  const results: InboxProcessingResult[] = [];

  try {
    // Get active inboxes
    const inboxes = await getActiveInboxes();

    if (inboxes.length === 0) {
      return [{
        inboxId: 'none',
        inboxName: 'No Active Inboxes',
        purpose: 'general',
        success: false,
        emails: [],
        stats: createEmptyStats(),
        error: 'No active email inboxes configured. Set up inboxes in Settings → Email Monitoring.',
      }];
    }

    // Call the edge function to poll inboxes
    const { data, error } = await supabase.functions.invoke('email-inbox-poller', {
      body: { source: 'agent' },
    });

    if (error) {
      // If edge function fails, fall back to reading existing data
      console.error('Edge function call failed, falling back to database read:', error);
      return await getProcessedEmailsFromDatabase(inboxes);
    }

    // Parse the response
    if (data?.results) {
      for (const result of data.results) {
        results.push({
          inboxId: result.inboxId,
          inboxName: result.inboxName,
          purpose: await getInboxPurpose(result.inboxId),
          success: result.success,
          emails: [], // Would need to query recent messages
          stats: {
            inboxesProcessed: 1,
            emailsFetched: result.emailsFetched || 0,
            emailsProcessed: result.emailsProcessed || 0,
            threadsCreated: result.threadsCreated || 0,
            posCorrelated: result.posCorrelated || 0,
            trackingNumbersFound: result.trackingFound || 0,
            alertsGenerated: result.alertsGenerated || 0,
            errors: result.error ? [result.error] : [],
          },
          error: result.error,
        });
      }
    }

    return results;

  } catch (error) {
    console.error('Email polling failed:', error);
    return [{
      inboxId: 'error',
      inboxName: 'Error',
      purpose: 'general',
      success: false,
      emails: [],
      stats: createEmptyStats(),
      error: error instanceof Error ? error.message : 'Unknown error',
    }];
  }
}

/**
 * Get inbox purpose from config
 */
async function getInboxPurpose(inboxId: string): Promise<'purchasing' | 'accounting' | 'general'> {
  const { data } = await supabase
    .from('email_inbox_configs')
    .select('inbox_purpose')
    .eq('id', inboxId)
    .single();

  return (data?.inbox_purpose as 'purchasing' | 'accounting' | 'general') || 'general';
}

/**
 * Fallback: Get recently processed emails from the database
 */
async function getProcessedEmailsFromDatabase(
  inboxes: EmailInboxConfig[]
): Promise<InboxProcessingResult[]> {
  const results: InboxProcessingResult[] = [];
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  for (const inbox of inboxes) {
    const { data: messages } = await supabase
      .from('email_thread_messages')
      .select(`
        id,
        gmail_message_id,
        thread_id,
        subject,
        sender_email,
        recipient_emails,
        body_preview,
        extracted_tracking_number,
        extracted_carrier,
        extracted_eta,
        direction,
        received_at,
        email_threads!inner (
          id,
          po_id,
          correlation_confidence,
          correlation_method,
          inbox_config_id
        )
      `)
      .eq('email_threads.inbox_config_id', inbox.id)
      .gte('received_at', oneHourAgo)
      .order('received_at', { ascending: false })
      .limit(50);

    const emails: ParsedEmailContent[] = (messages || []).map((msg: any) => ({
      threadId: msg.thread_id,
      messageId: msg.gmail_message_id,
      subject: msg.subject || '',
      from: msg.sender_email || '',
      to: (msg.recipient_emails || []).join(', '),
      bodyPreview: msg.body_preview || '',
      trackingNumber: msg.extracted_tracking_number,
      carrier: msg.extracted_carrier,
      eta: msg.extracted_eta,
      poId: msg.email_threads?.po_id,
      correlationConfidence: msg.email_threads?.correlation_confidence || 0,
      correlationMethod: msg.email_threads?.correlation_method || 'none',
      alertType: null,
      direction: msg.direction || 'inbound',
    }));

    const purpose = (inbox as any).inbox_purpose || 'general';

    results.push({
      inboxId: inbox.id,
      inboxName: inbox.inbox_name,
      purpose: purpose as 'purchasing' | 'accounting' | 'general',
      success: true,
      emails,
      stats: {
        inboxesProcessed: 1,
        emailsFetched: emails.length,
        emailsProcessed: emails.length,
        threadsCreated: new Set(emails.map(e => e.threadId)).size,
        posCorrelated: emails.filter(e => e.poId).length,
        trackingNumbersFound: emails.filter(e => e.trackingNumber).length,
        alertsGenerated: 0,
        errors: [],
      },
    });
  }

  return results;
}

/**
 * Extract tracking numbers and carrier info from text
 */
export function extractTrackingInfo(text: string): {
  trackingNumber: string | null;
  carrier: string | null;
  eta: string | null;
} {
  const lowerText = text.toLowerCase();

  // Detect carrier from keywords
  let detectedCarrier: string | null = null;
  for (const [carrier, keywords] of Object.entries(CARRIER_KEYWORDS)) {
    if (keywords.some(kw => lowerText.includes(kw))) {
      detectedCarrier = carrier;
      break;
    }
  }

  // Extract tracking number based on detected carrier or try all patterns
  let trackingNumber: string | null = null;

  if (detectedCarrier && TRACKING_PATTERNS[detectedCarrier as keyof typeof TRACKING_PATTERNS]) {
    const pattern = TRACKING_PATTERNS[detectedCarrier as keyof typeof TRACKING_PATTERNS];
    const match = text.match(pattern);
    if (match) {
      trackingNumber = match[0].replace(/^tracking[:\s#]*/i, '');
    }
  }

  // Try all patterns if no match yet
  if (!trackingNumber) {
    for (const [carrier, pattern] of Object.entries(TRACKING_PATTERNS)) {
      const match = text.match(pattern);
      if (match) {
        trackingNumber = match[1] || match[0];
        if (!detectedCarrier) detectedCarrier = carrier;
        break;
      }
    }
  }

  // Extract ETA/delivery date
  let eta: string | null = null;
  const etaPatterns = [
    /(?:deliver|arrival|eta|expected|arriving).*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}).*?(?:deliver|arrival)/i,
    /(?:by|on)\s+([A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?)/i,
  ];

  for (const pattern of etaPatterns) {
    const match = text.match(pattern);
    if (match) {
      eta = match[1];
      break;
    }
  }

  return { trackingNumber, carrier: detectedCarrier, eta };
}

/**
 * Process a single email and correlate to PO
 */
export async function processAndCorrelateEmail(
  gmailThreadId: string,
  gmailMessageId: string,
  senderEmail: string,
  subject: string,
  bodyText: string,
  inboxConfigId?: string
): Promise<ParsedEmailContent> {
  // Find or create thread
  const thread = await findOrCreateThread(gmailThreadId, inboxConfigId, subject);

  // Correlate to PO
  const correlation = await correlateEmailToPO(gmailThreadId, senderEmail, subject, bodyText);

  // Extract tracking info
  const tracking = extractTrackingInfo(`${subject}\n${bodyText}`);

  // Determine direction
  const direction = senderEmail.includes('@') ? 'inbound' : 'outbound';

  // Check for alert-worthy content
  let alertType: string | null = null;
  const combinedLower = `${subject}\n${bodyText}`.toLowerCase();

  if (combinedLower.includes('delay') || combinedLower.includes('postpone')) {
    alertType = 'delay_detected';
  } else if (combinedLower.includes('backorder') || combinedLower.includes('out of stock')) {
    alertType = 'backorder_notice';
  } else if (combinedLower.includes('exception') || combinedLower.includes('undeliverable')) {
    alertType = 'tracking_exception';
  }

  // Create alert if needed
  if (alertType && direction === 'inbound') {
    await createAlert({
      alertType,
      severity: alertType === 'backorder_notice' ? 'critical' : 'high',
      title: `${alertType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
      description: `Detected in email: "${subject}"`,
      threadId: thread.id,
      poId: correlation.poId || undefined,
      requiresHuman: true,
    });
  }

  return {
    threadId: thread.id,
    messageId: gmailMessageId,
    subject,
    from: senderEmail,
    to: '',
    bodyPreview: bodyText.slice(0, 500),
    trackingNumber: tracking.trackingNumber,
    carrier: tracking.carrier,
    eta: tracking.eta,
    poId: correlation.poId,
    correlationConfidence: correlation.confidence,
    correlationMethod: correlation.method,
    alertType,
    direction: direction as 'inbound' | 'outbound',
  };
}

/**
 * Get emails for a specific inbox purpose
 */
export async function getEmailsByPurpose(
  purpose: 'purchasing' | 'accounting' | 'general',
  options?: { limit?: number; since?: Date }
): Promise<ParsedEmailContent[]> {
  const limit = options?.limit || 50;
  const since = options?.since || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24 hours

  const { data: inboxes } = await supabase
    .from('email_inbox_configs')
    .select('id')
    .eq('inbox_purpose', purpose)
    .eq('is_active', true);

  if (!inboxes || inboxes.length === 0) {
    return [];
  }

  const inboxIds = inboxes.map(i => i.id);

  const { data: messages } = await supabase
    .from('email_thread_messages')
    .select(`
      id,
      gmail_message_id,
      thread_id,
      subject,
      sender_email,
      recipient_emails,
      body_preview,
      extracted_tracking_number,
      extracted_carrier,
      extracted_eta,
      direction,
      received_at,
      email_threads!inner (
        id,
        po_id,
        correlation_confidence,
        correlation_method,
        inbox_config_id
      )
    `)
    .in('email_threads.inbox_config_id', inboxIds)
    .gte('received_at', since.toISOString())
    .order('received_at', { ascending: false })
    .limit(limit);

  return (messages || []).map((msg: any) => ({
    threadId: msg.thread_id,
    messageId: msg.gmail_message_id,
    subject: msg.subject || '',
    from: msg.sender_email || '',
    to: (msg.recipient_emails || []).join(', '),
    bodyPreview: msg.body_preview || '',
    trackingNumber: msg.extracted_tracking_number,
    carrier: msg.extracted_carrier,
    eta: msg.extracted_eta,
    poId: msg.email_threads?.po_id,
    correlationConfidence: msg.email_threads?.correlation_confidence || 0,
    correlationMethod: msg.email_threads?.correlation_method || 'none',
    alertType: null,
    direction: msg.direction || 'inbound',
  }));
}

/**
 * Get uncorrelated emails that need manual PO matching
 */
export async function getUncorrelatedEmails(limit: number = 20): Promise<ParsedEmailContent[]> {
  const { data: threads } = await supabase
    .from('email_threads')
    .select(`
      id,
      gmail_thread_id,
      subject,
      po_id,
      correlation_confidence,
      correlation_method,
      inbox_config_id,
      email_thread_messages (
        id,
        gmail_message_id,
        sender_email,
        body_preview,
        extracted_tracking_number,
        extracted_carrier,
        extracted_eta,
        direction
      )
    `)
    .is('po_id', null)
    .eq('is_resolved', false)
    .order('last_message_at', { ascending: false })
    .limit(limit);

  const results: ParsedEmailContent[] = [];

  for (const thread of threads || []) {
    const msg = thread.email_thread_messages?.[0];
    if (msg) {
      results.push({
        threadId: thread.id,
        messageId: msg.gmail_message_id,
        subject: thread.subject || '',
        from: msg.sender_email || '',
        to: '',
        bodyPreview: msg.body_preview || '',
        trackingNumber: msg.extracted_tracking_number,
        carrier: msg.extracted_carrier,
        eta: msg.extracted_eta,
        poId: null,
        correlationConfidence: 0,
        correlationMethod: 'none',
        alertType: null,
        direction: msg.direction || 'inbound',
      });
    }
  }

  return results;
}

/**
 * Get emails with tracking information
 */
export async function getEmailsWithTracking(limit: number = 50): Promise<ParsedEmailContent[]> {
  const { data: messages } = await supabase
    .from('email_thread_messages')
    .select(`
      id,
      gmail_message_id,
      thread_id,
      subject,
      sender_email,
      recipient_emails,
      body_preview,
      extracted_tracking_number,
      extracted_carrier,
      extracted_eta,
      direction,
      email_threads!inner (
        id,
        po_id,
        correlation_confidence,
        correlation_method
      )
    `)
    .not('extracted_tracking_number', 'is', null)
    .order('received_at', { ascending: false })
    .limit(limit);

  return (messages || []).map((msg: any) => ({
    threadId: msg.thread_id,
    messageId: msg.gmail_message_id,
    subject: msg.subject || '',
    from: msg.sender_email || '',
    to: (msg.recipient_emails || []).join(', '),
    bodyPreview: msg.body_preview || '',
    trackingNumber: msg.extracted_tracking_number,
    carrier: msg.extracted_carrier,
    eta: msg.extracted_eta,
    poId: msg.email_threads?.po_id,
    correlationConfidence: msg.email_threads?.correlation_confidence || 0,
    correlationMethod: msg.email_threads?.correlation_method || 'none',
    alertType: null,
    direction: msg.direction || 'inbound',
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

function createEmptyStats(): EmailProcessingStats {
  return {
    inboxesProcessed: 0,
    emailsFetched: 0,
    emailsProcessed: 0,
    threadsCreated: 0,
    posCorrelated: 0,
    trackingNumbersFound: 0,
    alertsGenerated: 0,
    errors: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════════════

export default {
  triggerEmailPolling,
  extractTrackingInfo,
  processAndCorrelateEmail,
  getEmailsByPurpose,
  getUncorrelatedEmails,
  getEmailsWithTracking,
};
