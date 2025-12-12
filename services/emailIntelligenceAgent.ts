/**
 * Email Intelligence Agent
 *
 * Monitors vendor email communications to:
 * - Extract PO numbers, tracking info, and dates
 * - Analyze tone and sentiment
 * - Parse PDF attachments
 * - Draft professional responses
 * - Link conversations to purchase orders
 */

import { createClient } from '@supabase/supabase-js';

// Types
export interface EmailMessage {
  messageId: string;
  threadId: string;
  from: { email: string; name?: string };
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  receivedAt: Date;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content?: Buffer | string; // Base64 or Buffer
}

export interface ExtractedData {
  type: 'po_number' | 'tracking_number' | 'eta_date' | 'promised_date' | 'quantity' | 'price';
  value: string;
  normalizedValue?: string;
  context: string;
  confidence: number;
}

export interface EmailAnalysis {
  tone: 'professional' | 'urgent' | 'casual' | 'frustrated' | 'positive' | 'apologetic';
  sentiment: number; // -1.0 to 1.0
  requiresResponse: boolean;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  extractedData: ExtractedData[];
  suggestedAction?: string;
}

export interface DraftedEmail {
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

// Initialize Supabase client (use service role for agent operations)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Process an incoming email message
 */
export async function processIncomingEmail(
  email: EmailMessage
): Promise<{ success: boolean; emailId?: string; error?: string }> {
  try {
    // 1. Get or create thread
    const thread = await getOrCreateThread(email);

    // 2. Analyze the email content
    const analysis = await analyzeEmail(email);

    // 3. Store the email communication
    const { data: emailRecord, error: emailError } = await supabase
      .from('email_communications')
      .insert({
        thread_id: thread.id,
        message_id: email.messageId,
        direction: 'inbound',
        from_email: email.from.email,
        from_name: email.from.name,
        to_emails: email.to.map(t => t.email),
        cc_emails: email.cc?.map(c => c.email) || [],
        subject: email.subject,
        body_text: email.bodyText,
        body_html: email.bodyHtml,
        received_at: email.receivedAt,
        processed_at: new Date(),
        has_attachments: (email.attachments?.length || 0) > 0,
        attachment_count: email.attachments?.length || 0,
        tone: analysis.tone,
        sentiment_score: analysis.sentiment,
        requires_response: analysis.requiresResponse,
        response_urgency: analysis.urgency,
        confidence_score: calculateOverallConfidence(analysis.extractedData),
      })
      .select()
      .single();

    if (emailError) throw emailError;

    // 4. Store extracted data
    for (const extracted of analysis.extractedData) {
      await storeExtractedData(emailRecord.id, extracted);
    }

    // 5. Process attachments if any
    if (email.attachments && email.attachments.length > 0) {
      await processAttachments(emailRecord.id, email.attachments);
    }

    // 6. Update thread metadata
    await updateThreadMetadata(thread.id);

    // 7. Draft response if needed
    if (analysis.requiresResponse && analysis.urgency !== 'low') {
      await draftEmailResponse(emailRecord.id, thread.id, email, analysis);
    }

    // 8. Record performance metrics
    await recordDailyMetrics('emails_processed', 1);

    return { success: true, emailId: emailRecord.id };
  } catch (error) {
    console.error('Error processing email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Analyze email content for tone, sentiment, and data extraction
 */
async function analyzeEmail(email: EmailMessage): Promise<EmailAnalysis> {
  const text = email.bodyText.toLowerCase();
  const subject = email.subject.toLowerCase();

  // Extract data points
  const extractedData = await extractStructuredData(email.bodyText, email.subject);

  // Analyze tone
  const tone = detectTone(text);

  // Calculate sentiment (-1.0 to 1.0)
  const sentiment = calculateSentiment(text);

  // Determine if response is needed
  const requiresResponse = detectResponseNeeded(text, subject);

  // Determine urgency
  const urgency = determineUrgency(text, subject, extractedData);

  return {
    tone,
    sentiment,
    requiresResponse,
    urgency,
    extractedData,
    suggestedAction: determineSuggestedAction(extractedData, tone, urgency),
  };
}

/**
 * Extract structured data from email text
 */
async function extractStructuredData(
  bodyText: string,
  subject: string
): Promise<ExtractedData[]> {
  const extracted: ExtractedData[] = [];
  const fullText = `${subject} ${bodyText}`;

  // Extract PO numbers
  const poPatterns = [
    /(?:PO|P\.O\.|Purchase Order|Order)[\s#:]*([A-Z0-9\-]+)/gi,
    /(?:order|ref|reference)[\s#:]*([A-Z0-9\-]{4,})/gi,
  ];

  for (const pattern of poPatterns) {
    const matches = fullText.matchAll(pattern);
    for (const match of matches) {
      const value = match[1].trim();
      const contextStart = Math.max(0, match.index! - 50);
      const contextEnd = Math.min(fullText.length, match.index! + match[0].length + 50);
      const context = fullText.substring(contextStart, contextEnd);

      extracted.push({
        type: 'po_number',
        value,
        normalizedValue: value.toUpperCase(),
        context,
        confidence: calculatePOConfidence(match[0]),
      });
    }
  }

  // Extract tracking numbers
  const trackingPatterns = [
    // FedEx (12 digits)
    /\b(\d{12})\b/g,
    // UPS (1Z + 16 chars)
    /\b(1Z[A-Z0-9]{16})\b/gi,
    // USPS (20-22 digits)
    /\b(\d{20,22})\b/g,
    // General tracking
    /(?:tracking|track|shipment)[\s#:]*([A-Z0-9]{8,})/gi,
  ];

  for (const pattern of trackingPatterns) {
    const matches = fullText.matchAll(pattern);
    for (const match of matches) {
      const value = match[1].trim();
      const contextStart = Math.max(0, match.index! - 50);
      const contextEnd = Math.min(fullText.length, match.index! + match[0].length + 50);
      const context = fullText.substring(contextStart, contextEnd);

      extracted.push({
        type: 'tracking_number',
        value,
        normalizedValue: value.toUpperCase(),
        context,
        confidence: calculateTrackingConfidence(match[0], value),
      });
    }
  }

  // Extract dates
  const datePatterns = [
    /(?:ETA|estimated|arrival|delivery|ship)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
    /(?:ETA|estimated|arrival|delivery|ship)[\s:]*(\w+\s+\d{1,2},?\s+\d{4})/gi,
  ];

  for (const pattern of datePatterns) {
    const matches = fullText.matchAll(pattern);
    for (const match of matches) {
      const value = match[1].trim();
      const contextStart = Math.max(0, match.index! - 50);
      const contextEnd = Math.min(fullText.length, match.index! + match[0].length + 50);
      const context = fullText.substring(contextStart, contextEnd);

      extracted.push({
        type: 'eta_date',
        value,
        normalizedValue: normalizeDate(value),
        context,
        confidence: 0.75,
      });
    }
  }

  return extracted;
}

/**
 * Detect email tone
 */
function detectTone(text: string): EmailAnalysis['tone'] {
  // Urgent indicators
  if (
    /urgent|asap|immediately|critical|emergency/i.test(text) ||
    text.includes('!!') ||
    text.includes('URGENT')
  ) {
    return 'urgent';
  }

  // Frustrated indicators
  if (
    /disappointed|unacceptable|frustrated|concerned|issue|problem|delay/i.test(text) &&
    !/apolog|sorry|understand/i.test(text)
  ) {
    return 'frustrated';
  }

  // Apologetic indicators
  if (/apolog|sorry|regret|unfortunate|delay/i.test(text)) {
    return 'apologetic';
  }

  // Positive indicators
  if (/thank|great|excellent|appreciate|pleasure|confirm/i.test(text)) {
    return 'positive';
  }

  // Casual indicators
  if (/hey|hi there|thanks|cheers/i.test(text)) {
    return 'casual';
  }

  return 'professional';
}

/**
 * Calculate sentiment score (-1.0 to 1.0)
 */
function calculateSentiment(text: string): number {
  let score = 0;

  // Positive words
  const positiveWords = [
    'thank', 'great', 'excellent', 'perfect', 'appreciate', 'pleased',
    'confirm', 'ready', 'available', 'shipped', 'completed',
  ];
  positiveWords.forEach(word => {
    if (new RegExp(word, 'i').test(text)) score += 0.1;
  });

  // Negative words
  const negativeWords = [
    'delay', 'problem', 'issue', 'concerned', 'disappointed', 'unacceptable',
    'frustrated', 'late', 'missing', 'error', 'mistake',
  ];
  negativeWords.forEach(word => {
    if (new RegExp(word, 'i').test(text)) score -= 0.1;
  });

  // Clamp between -1.0 and 1.0
  return Math.max(-1.0, Math.min(1.0, score));
}

/**
 * Detect if email requires a response
 */
function detectResponseNeeded(text: string, subject: string): boolean {
  const questionMarks = (text.match(/\?/g) || []).length;
  const hasQuestion = questionMarks > 0;

  const requestPatterns = [
    /please\s+(confirm|advise|provide|send|update)/i,
    /can\s+you/i,
    /could\s+you/i,
    /would\s+you/i,
    /need\s+(to\s+)?know/i,
    /when\s+(will|can)/i,
    /status\s+update/i,
  ];

  const hasRequest = requestPatterns.some(pattern => pattern.test(text));

  return hasQuestion || hasRequest;
}

/**
 * Determine response urgency
 */
function determineUrgency(
  text: string,
  subject: string,
  extractedData: ExtractedData[]
): EmailAnalysis['urgency'] {
  const fullText = `${subject} ${text}`.toLowerCase();

  // Critical urgency
  if (
    /urgent|asap|critical|emergency|immediately/i.test(fullText) ||
    /stockout|out of stock/i.test(fullText)
  ) {
    return 'critical';
  }

  // High urgency
  if (
    /important|priority|soon|delay/i.test(fullText) ||
    extractedData.some(d => d.type === 'tracking_number')
  ) {
    return 'high';
  }

  // Medium urgency
  if (
    /please|confirm|update/i.test(fullText) ||
    extractedData.some(d => d.type === 'eta_date')
  ) {
    return 'medium';
  }

  return 'low';
}

/**
 * Draft an email response
 */
async function draftEmailResponse(
  emailId: string,
  threadId: string,
  originalEmail: EmailMessage,
  analysis: EmailAnalysis
): Promise<void> {
  const drafted = await generateResponseDraft(originalEmail, analysis);

  await supabase.from('email_drafts').insert({
    in_reply_to_id: emailId,
    thread_id: threadId,
    to_emails: [originalEmail.from.email],
    subject: `Re: ${originalEmail.subject}`,
    body_text: drafted.bodyText,
    body_html: drafted.bodyHtml,
    draft_reason: drafted.reason,
    suggested_action: analysis.suggestedAction,
    priority: drafted.priority,
    status: 'pending',
  });

  await recordDailyMetrics('drafts_created', 1);
}

/**
 * Generate email response draft
 */
async function generateResponseDraft(
  email: EmailMessage,
  analysis: EmailAnalysis
): Promise<DraftedEmail> {
  const poNumbers = analysis.extractedData
    .filter(d => d.type === 'po_number')
    .map(d => d.normalizedValue);

  const trackingNumbers = analysis.extractedData
    .filter(d => d.type === 'tracking_number')
    .map(d => d.normalizedValue);

  let bodyText = '';
  let reason = '';

  // Request tracking if PO confirmed but no tracking
  if (poNumbers.length > 0 && trackingNumbers.length === 0) {
    const poList = poNumbers.join(', ');
    bodyText = `Thank you for your email regarding ${poList}.\n\n`;
    bodyText += `Could you please provide the tracking number(s) for this shipment? `;
    bodyText += `This will help us ensure timely receipt and inventory planning.\n\n`;
    bodyText += `Best regards`;
    reason = 'Requesting tracking information for confirmed PO';
  }
  // Acknowledge tracking received
  else if (trackingNumbers.length > 0) {
    bodyText = `Thank you for providing the tracking information.\n\n`;
    bodyText += `We have updated our system with tracking number(s): ${trackingNumbers.join(', ')}.\n\n`;
    bodyText += `We'll monitor the shipment and reach out if any issues arise.\n\n`;
    bodyText += `Best regards`;
    reason = 'Acknowledging receipt of tracking information';
  }
  // General acknowledgment
  else {
    bodyText = `Thank you for your email.\n\n`;
    bodyText += `We have received your message and will review it shortly. `;
    bodyText += `We'll follow up if we need any additional information.\n\n`;
    bodyText += `Best regards`;
    reason = 'General acknowledgment of vendor communication';
  }

  return {
    to: [email.from.email],
    subject: `Re: ${email.subject}`,
    bodyText,
    reason,
    priority: analysis.urgency,
  };
}

/**
 * Process email attachments (parse PDFs)
 */
async function processAttachments(
  emailId: string,
  attachments: EmailAttachment[]
): Promise<void> {
  for (const attachment of attachments) {
    try {
      // Store attachment metadata
      const { data: attachmentRecord } = await supabase
        .from('email_attachments')
        .insert({
          email_id: emailId,
          filename: attachment.filename,
          content_type: attachment.contentType,
          file_size_bytes: attachment.size,
          is_parsed: false,
        })
        .select()
        .single();

      // Parse PDF if applicable
      if (attachment.contentType === 'application/pdf' && attachmentRecord) {
        await parsePDFAttachment(attachmentRecord.id, attachment);
      }

      await recordDailyMetrics('attachments_parsed', 1);
    } catch (error) {
      console.error('Error processing attachment:', error);
    }
  }
}

/**
 * Parse PDF attachment (placeholder - requires PDF parsing library)
 */
async function parsePDFAttachment(
  attachmentId: string,
  attachment: EmailAttachment
): Promise<void> {
  try {
    // TODO: Integrate PDF parsing library (pdf-parse, pdfjs-dist, etc.)
    // For now, mark as needing parsing
    await supabase
      .from('email_attachments')
      .update({
        is_parsed: false,
        parse_error: 'PDF parsing not yet implemented - requires pdf-parse library',
      })
      .eq('id', attachmentId);
  } catch (error) {
    await supabase
      .from('email_attachments')
      .update({
        parse_error: error.message,
      })
      .eq('id', attachmentId);
  }
}

/**
 * Store extracted data
 */
async function storeExtractedData(
  emailId: string,
  extracted: ExtractedData
): Promise<void> {
  // Try to link to purchase order if PO number
  let purchaseOrderId: string | undefined;
  let vendorId: string | undefined;

  if (extracted.type === 'po_number' && extracted.normalizedValue) {
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('id, vendor_id')
      .eq('order_number', extracted.normalizedValue)
      .single();

    if (po) {
      purchaseOrderId = po.id;
      vendorId = po.vendor_id;
    }
  }

  await supabase.from('email_extracted_data').insert({
    email_id: emailId,
    data_type: extracted.type,
    extracted_value: extracted.value,
    normalized_value: extracted.normalizedValue,
    context: extracted.context,
    confidence_score: extracted.confidence,
    purchase_order_id: purchaseOrderId,
    vendor_id: vendorId,
    verified: extracted.confidence >= 0.9, // Auto-verify high confidence
  });

  // Update metrics
  await recordDailyMetrics('data_points_extracted', 1);
  if (extracted.type === 'po_number') {
    await recordDailyMetrics('po_numbers_found', 1);
  } else if (extracted.type === 'tracking_number') {
    await recordDailyMetrics('tracking_numbers_found', 1);
  } else if (extracted.type === 'eta_date') {
    await recordDailyMetrics('dates_extracted', 1);
  }
}

/**
 * Get or create email thread
 */
async function getOrCreateThread(email: EmailMessage): Promise<any> {
  // Check if thread exists
  let { data: thread } = await supabase
    .from('email_threads')
    .select('*')
    .eq('thread_id', email.threadId)
    .single();

  if (!thread) {
    // Create new thread
    const { data: newThread } = await supabase
      .from('email_threads')
      .insert({
        thread_id: email.threadId,
        subject: email.subject,
        first_message_at: email.receivedAt,
        last_message_at: email.receivedAt,
        message_count: 1,
        status: 'active',
      })
      .select()
      .single();

    thread = newThread;
  }

  return thread;
}

/**
 * Update thread metadata
 */
async function updateThreadMetadata(threadId: string): Promise<void> {
  const { data: messages } = await supabase
    .from('email_communications')
    .select('sentiment_score, received_at')
    .eq('thread_id', threadId)
    .order('received_at', { ascending: true });

  if (messages && messages.length > 0) {
    const avgSentiment =
      messages.reduce((sum, m) => sum + (m.sentiment_score || 0), 0) / messages.length;

    await supabase
      .from('email_threads')
      .update({
        message_count: messages.length,
        last_message_at: messages[messages.length - 1].received_at,
        sentiment_score: avgSentiment,
      })
      .eq('id', threadId);
  }
}

/**
 * Helper functions
 */
function calculatePOConfidence(matchedText: string): number {
  if (/^PO#?\s*[A-Z0-9]/i.test(matchedText)) return 0.95;
  if (/Purchase Order/i.test(matchedText)) return 0.90;
  if (/Order/i.test(matchedText)) return 0.70;
  return 0.60;
}

function calculateTrackingConfidence(matchedText: string, value: string): number {
  if (/tracking|shipment/i.test(matchedText)) return 0.85;
  if (/^1Z[A-Z0-9]{16}$/.test(value)) return 0.95; // UPS format
  if (/^\d{12}$/.test(value)) return 0.80; // FedEx format
  if (/^\d{20,22}$/.test(value)) return 0.80; // USPS format
  return 0.60;
}

function normalizeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  } catch {
    return dateStr;
  }
}

function calculateOverallConfidence(extractedData: ExtractedData[]): number {
  if (extractedData.length === 0) return 0.5;
  const avg = extractedData.reduce((sum, d) => sum + d.confidence, 0) / extractedData.length;
  return Math.round(avg * 100) / 100;
}

function determineSuggestedAction(
  extractedData: ExtractedData[],
  tone: string,
  urgency: string
): string {
  const hasPO = extractedData.some(d => d.type === 'po_number');
  const hasTracking = extractedData.some(d => d.type === 'tracking_number');

  if (hasPO && !hasTracking) return 'request_tracking';
  if (hasTracking) return 'acknowledge_tracking';
  if (urgency === 'critical') return 'escalate_to_human';
  if (tone === 'frustrated') return 'escalate_to_human';
  return 'acknowledge_receipt';
}

async function recordDailyMetrics(metric: string, increment: number = 1): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const { data: existing } = await supabase
    .from('email_agent_performance')
    .select('*')
    .eq('period_date', today)
    .single();

  if (existing) {
    await supabase
      .from('email_agent_performance')
      .update({
        [metric]: (existing[metric] || 0) + increment,
      })
      .eq('period_date', today);
  } else {
    await supabase.from('email_agent_performance').insert({
      period_date: today,
      [metric]: increment,
    });
  }
}

/**
 * Public API: Get pending email drafts for review
 */
export async function getPendingDrafts(): Promise<any[]> {
  const { data } = await supabase
    .from('email_drafts')
    .select(
      `
      *,
      in_reply_to:email_communications!in_reply_to_id(
        from_email,
        subject,
        body_text,
        received_at
      ),
      thread:email_threads!thread_id(
        subject,
        vendor:vendors(name)
      )
    `
    )
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true });

  return data || [];
}

/**
 * Public API: Approve and send draft
 */
export async function approveDraft(
  draftId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('email_drafts')
      .update({
        status: 'approved',
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', draftId);

    if (error) throw error;

    await recordDailyMetrics('drafts_approved', 1);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Public API: Reject draft
 */
export async function rejectDraft(
  draftId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('email_drafts')
      .update({
        status: 'rejected',
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', draftId);

    if (error) throw error;

    await recordDailyMetrics('drafts_rejected', 1);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Public API: Get agent performance report
 */
export async function getPerformanceReport(days: number = 7): Promise<any> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data } = await supabase
    .from('email_agent_performance')
    .select('*')
    .gte('period_date', startDate.toISOString().split('T')[0])
    .order('period_date', { ascending: false });

  if (!data || data.length === 0) {
    return {
      totalEmailsProcessed: 0,
      totalAttachmentsParsed: 0,
      totalDataExtracted: 0,
      extractionAccuracy: 0,
      draftApprovalRate: 0,
      avgResponseTimeMinutes: 0,
    };
  }

  const totals = data.reduce(
    (acc, day) => ({
      emailsProcessed: acc.emailsProcessed + (day.emails_processed || 0),
      attachmentsParsed: acc.attachmentsParsed + (day.attachments_parsed || 0),
      dataExtracted: acc.dataExtracted + (day.data_points_extracted || 0),
      extractionsVerified: acc.extractionsVerified + (day.extractions_verified || 0),
      extractionsCorrected: acc.extractionsCorrected + (day.extractions_corrected || 0),
      draftsCreated: acc.draftsCreated + (day.drafts_created || 0),
      draftsApproved: acc.draftsApproved + (day.drafts_approved || 0),
    }),
    {
      emailsProcessed: 0,
      attachmentsParsed: 0,
      dataExtracted: 0,
      extractionsVerified: 0,
      extractionsCorrected: 0,
      draftsCreated: 0,
      draftsApproved: 0,
    }
  );

  const extractionAccuracy =
    totals.extractionsVerified + totals.extractionsCorrected > 0
      ? (totals.extractionsVerified / (totals.extractionsVerified + totals.extractionsCorrected)) *
        100
      : 0;

  const draftApprovalRate =
    totals.draftsCreated > 0 ? (totals.draftsApproved / totals.draftsCreated) * 100 : 0;

  return {
    totalEmailsProcessed: totals.emailsProcessed,
    totalAttachmentsParsed: totals.attachmentsParsed,
    totalDataExtracted: totals.dataExtracted,
    extractionAccuracy: Math.round(extractionAccuracy * 10) / 10,
    draftApprovalRate: Math.round(draftApprovalRate * 10) / 10,
    dailyBreakdown: data,
  };
}

export default {
  processIncomingEmail,
  getPendingDrafts,
  approveDraft,
  rejectDraft,
  getPerformanceReport,
};
