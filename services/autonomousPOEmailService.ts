/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTONOMOUS PO EMAIL SERVICE - Trust-Gated Email Sending
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sends PO emails to vendors with trust score gating:
 * - High trust (≥0.85): Auto-send immediately
 * - Medium trust (0.70-0.85): Queue for quick approval
 * - Low trust (<0.70): Draft only, requires manual review
 *
 * Features:
 * - Trust score-based autonomous sending
 * - Email template generation
 * - PDF attachment support
 * - Audit trail logging
 * - Progressive autonomy (trust builds over time)
 *
 * @module services/autonomousPOEmailService
 */

import { supabase } from '../lib/supabase/client';
import { getGoogleGmailService, type GmailSendOptions, type GmailSendResult } from './googleGmailService';
import { TrustThresholds, getAgentPerformanceStats, calculateTrustScore } from './trustScoreCalculator';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface POEmailRequest {
  poId: string;
  templateType: 'new_order' | 'follow_up' | 'revision' | 'confirmation_request';
  customMessage?: string;
  attachPdf?: boolean;
  urgency?: 'normal' | 'high' | 'urgent';
}

export interface POEmailResult {
  success: boolean;
  action: 'sent' | 'queued' | 'drafted' | 'failed';
  reason: string;
  emailId?: string;
  threadId?: string;
  trustScore?: number;
  error?: string;
}

export interface POEmailDraft {
  poId: string;
  poNumber: string;
  vendorName: string;
  vendorEmail: string;
  subject: string;
  body: string;
  attachments?: { filename: string; mimeType: string }[];
  createdAt: string;
  expiresAt: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'expired';
}

// Trust thresholds for email sending
const EMAIL_TRUST_THRESHOLDS = {
  AUTO_SEND: 0.85,      // ≥85%: Send immediately
  QUICK_APPROVE: 0.70,  // 70-85%: Queue for approval
  DRAFT_ONLY: 0.0,      // <70%: Create draft only
};

const PO_EMAIL_AGENT_ID = 'po_email_sender';

// ═══════════════════════════════════════════════════════════════════════════
// Main Service Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send PO email with trust score gating
 */
export async function sendPOEmail(request: POEmailRequest): Promise<POEmailResult> {
  try {
    // 1. Get PO details
    const po = await getPODetails(request.poId);
    if (!po) {
      return { success: false, action: 'failed', reason: 'PO not found', error: 'PO not found' };
    }

    // 2. Check vendor email
    if (!po.vendor_email) {
      return { success: false, action: 'failed', reason: 'Vendor email not configured', error: 'No vendor email' };
    }

    // 3. Get agent trust score
    const trustScore = await getEmailAgentTrustScore();

    // 4. Build email content
    const emailContent = await buildPOEmail(po, request);

    // 5. Decision based on trust score
    if (trustScore >= EMAIL_TRUST_THRESHOLDS.AUTO_SEND) {
      // HIGH TRUST: Auto-send immediately
      return await executeAutoSend(po, emailContent, trustScore);
    } else if (trustScore >= EMAIL_TRUST_THRESHOLDS.QUICK_APPROVE) {
      // MEDIUM TRUST: Queue for quick approval
      return await queueForApproval(po, emailContent, trustScore);
    } else {
      // LOW TRUST: Draft only
      return await createDraftOnly(po, emailContent, trustScore);
    }

  } catch (error: any) {
    console.error('[autonomousPOEmailService] Send failed:', error);
    return {
      success: false,
      action: 'failed',
      reason: 'Unexpected error',
      error: error.message,
    };
  }
}

/**
 * Approve and send a queued email
 */
export async function approveAndSendEmail(emailDraftId: string): Promise<POEmailResult> {
  const { data: draft, error } = await supabase
    .from('po_email_drafts')
    .select('*')
    .eq('id', emailDraftId)
    .single();

  if (error || !draft) {
    return { success: false, action: 'failed', reason: 'Draft not found' };
  }

  const gmailService = getGoogleGmailService();

  try {
    const result = await gmailService.sendEmail({
      to: draft.vendor_email,
      subject: draft.subject,
      body: draft.body,
    });

    // Update draft status
    await supabase
      .from('po_email_drafts')
      .update({ status: 'approved', sent_at: new Date().toISOString() })
      .eq('id', emailDraftId);

    // Log success for trust score improvement
    await logEmailOutcome(draft.po_id, 'success', 'approved_by_user');

    // Update PO status
    await updatePOEmailStatus(draft.po_id, 'sent', result.id);

    return {
      success: true,
      action: 'sent',
      reason: 'Email approved and sent successfully',
      emailId: result.id,
      threadId: result.threadId,
    };

  } catch (err: any) {
    await logEmailOutcome(draft.po_id, 'error', err.message);
    return {
      success: false,
      action: 'failed',
      reason: 'Failed to send email',
      error: err.message,
    };
  }
}

/**
 * Reject a queued email
 */
export async function rejectEmail(emailDraftId: string, reason?: string): Promise<void> {
  const { data: draft } = await supabase
    .from('po_email_drafts')
    .select('po_id')
    .eq('id', emailDraftId)
    .single();

  await supabase
    .from('po_email_drafts')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      rejected_at: new Date().toISOString(),
    })
    .eq('id', emailDraftId);

  if (draft) {
    // Log rejection for trust score impact
    await logEmailOutcome(draft.po_id, 'rejected', reason || 'User rejected');
  }
}

/**
 * Get pending email drafts for approval
 */
export async function getPendingEmailDrafts(): Promise<POEmailDraft[]> {
  const { data, error } = await supabase
    .from('po_email_drafts')
    .select('*')
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal Functions
// ═══════════════════════════════════════════════════════════════════════════

async function getEmailAgentTrustScore(): Promise<number> {
  // Check if agent exists
  const { data: agent } = await supabase
    .from('agent_definitions')
    .select('trust_score')
    .eq('identifier', PO_EMAIL_AGENT_ID)
    .single();

  if (agent?.trust_score) {
    return agent.trust_score;
  }

  // Calculate from performance stats
  const stats = await getAgentPerformanceStats(PO_EMAIL_AGENT_ID);
  if (stats) {
    const scores = calculateTrustScore(stats);
    return scores.overall;
  }

  // Default for new agent
  return TrustThresholds.INITIAL_SCORE;
}

async function getPODetails(poId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      purchase_order_items (
        inventory_sku,
        item_name,
        quantity_ordered,
        unit_cost,
        line_total
      ),
      vendors (
        id,
        name,
        email,
        contact_name
      )
    `)
    .eq('id', poId)
    .single();

  if (error || !data) return null;

  return {
    ...data,
    vendor_email: data.vendors?.email || data.supplier_email,
    vendor_contact: data.vendors?.contact_name || data.supplier_contact,
  };
}

async function buildPOEmail(
  po: any,
  request: POEmailRequest
): Promise<{ subject: string; body: string }> {
  const items = po.purchase_order_items || [];
  const vendorName = po.supplier_name || po.vendors?.name || 'Vendor';
  const contactName = po.vendor_contact || 'Team';

  // Build item list
  const itemLines = items.map((item: any) =>
    `  - ${item.item_name} (${item.inventory_sku}): ${item.quantity_ordered} units @ $${item.unit_cost?.toFixed(2) || '0.00'}`
  ).join('\n');

  const templates: Record<string, { subject: string; body: string }> = {
    new_order: {
      subject: `New Purchase Order ${po.order_id}`,
      body: `Dear ${contactName},

Please find our new purchase order ${po.order_id} for the following items:

${itemLines}

Order Total: $${po.total_amount?.toFixed(2) || '0.00'}
Expected Delivery: ${po.expected_date ? new Date(po.expected_date).toLocaleDateString() : 'TBD'}

Please confirm receipt of this order and provide estimated shipping date.

${request.urgency === 'urgent' ? '\n⚠️ This is an URGENT order. Please prioritize.\n' : ''}
${request.customMessage ? `\nAdditional Notes:\n${request.customMessage}\n` : ''}
Thank you for your continued partnership.

Best regards,
MuRP Purchasing Team`,
    },

    follow_up: {
      subject: `Follow-up: Purchase Order ${po.order_id}`,
      body: `Dear ${contactName},

This is a follow-up regarding Purchase Order ${po.order_id} placed on ${new Date(po.order_date).toLocaleDateString()}.

We haven't received confirmation or shipping information yet. Could you please provide an update on the status of this order?

Order Summary:
${itemLines}

${request.customMessage ? `\n${request.customMessage}\n` : ''}
Thank you for your prompt attention.

Best regards,
MuRP Purchasing Team`,
    },

    revision: {
      subject: `Revised: Purchase Order ${po.order_id}`,
      body: `Dear ${contactName},

Please find the revised Purchase Order ${po.order_id} with updated quantities/items:

${itemLines}

Updated Total: $${po.total_amount?.toFixed(2) || '0.00'}

${request.customMessage ? `\nReason for revision:\n${request.customMessage}\n` : ''}
Please confirm the updated order details.

Best regards,
MuRP Purchasing Team`,
    },

    confirmation_request: {
      subject: `Confirmation Needed: Order ${po.order_id}`,
      body: `Dear ${contactName},

We need confirmation for Purchase Order ${po.order_id}:

${itemLines}

Please reply to confirm:
1. Order quantities and pricing are correct
2. Expected ship date
3. Tracking number when available

${request.customMessage || ''}

Thank you,
MuRP Purchasing Team`,
    },
  };

  return templates[request.templateType] || templates.new_order;
}

async function executeAutoSend(
  po: any,
  emailContent: { subject: string; body: string },
  trustScore: number
): Promise<POEmailResult> {
  const gmailService = getGoogleGmailService();

  try {
    const result = await gmailService.sendEmail({
      to: po.vendor_email,
      subject: emailContent.subject,
      body: emailContent.body,
    });

    // Log success
    await logEmailOutcome(po.id, 'success', 'auto_sent');

    // Update PO status
    await updatePOEmailStatus(po.id, 'sent', result.id);

    // Record in communications
    await recordCommunication(po.id, emailContent, result, 'auto');

    return {
      success: true,
      action: 'sent',
      reason: `Auto-sent (trust score: ${(trustScore * 100).toFixed(0)}%)`,
      emailId: result.id,
      threadId: result.threadId,
      trustScore,
    };

  } catch (err: any) {
    await logEmailOutcome(po.id, 'error', err.message);
    return {
      success: false,
      action: 'failed',
      reason: 'Gmail send failed',
      error: err.message,
      trustScore,
    };
  }
}

async function queueForApproval(
  po: any,
  emailContent: { subject: string; body: string },
  trustScore: number
): Promise<POEmailResult> {
  // Store draft for approval
  const { data: draft, error } = await supabase
    .from('po_email_drafts')
    .insert({
      po_id: po.id,
      po_number: po.order_id,
      vendor_name: po.supplier_name,
      vendor_email: po.vendor_email,
      subject: emailContent.subject,
      body: emailContent.body,
      status: 'pending_approval',
      trust_score_at_creation: trustScore,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h expiry
    })
    .select()
    .single();

  if (error) {
    return {
      success: false,
      action: 'failed',
      reason: 'Failed to queue email',
      error: error.message,
    };
  }

  // Create pending action for approval
  await supabase.from('pending_actions_queue').insert({
    action_type: 'approve_po_email',
    agent: PO_EMAIL_AGENT_ID,
    entity_type: 'purchase_order',
    entity_id: po.id,
    payload: { draftId: draft.id },
    priority: 'medium',
    status: 'pending',
  });

  return {
    success: true,
    action: 'queued',
    reason: `Queued for approval (trust score: ${(trustScore * 100).toFixed(0)}%)`,
    trustScore,
  };
}

async function createDraftOnly(
  po: any,
  emailContent: { subject: string; body: string },
  trustScore: number
): Promise<POEmailResult> {
  await supabase.from('po_email_drafts').insert({
    po_id: po.id,
    po_number: po.order_id,
    vendor_name: po.supplier_name,
    vendor_email: po.vendor_email,
    subject: emailContent.subject,
    body: emailContent.body,
    status: 'draft',
    trust_score_at_creation: trustScore,
    requires_review: true,
  });

  return {
    success: true,
    action: 'drafted',
    reason: `Draft created (trust score: ${(trustScore * 100).toFixed(0)}% - requires review)`,
    trustScore,
  };
}

async function updatePOEmailStatus(poId: string, status: string, emailId?: string): Promise<void> {
  await supabase
    .from('purchase_orders')
    .update({
      status: status === 'sent' ? 'sent' : undefined,
      sent_at: status === 'sent' ? new Date().toISOString() : undefined,
      last_email_id: emailId,
      last_email_sent_at: new Date().toISOString(),
    })
    .eq('id', poId);
}

async function recordCommunication(
  poId: string,
  emailContent: { subject: string; body: string },
  sendResult: GmailSendResult,
  sendType: 'auto' | 'manual'
): Promise<void> {
  await supabase.from('po_vendor_communications').insert({
    po_id: poId,
    communication_type: 'email',
    direction: 'outbound',
    stage: 'order_sent',
    gmail_message_id: sendResult.id,
    gmail_thread_id: sendResult.threadId,
    subject: emailContent.subject,
    body_preview: emailContent.body.substring(0, 500),
    sent_at: new Date().toISOString(),
    metadata: { send_type: sendType },
  });
}

async function logEmailOutcome(
  poId: string,
  outcome: 'success' | 'error' | 'rejected',
  details: string
): Promise<void> {
  // Log for trust score calculation
  await supabase.from('agent_usage_tracking').insert({
    agent_identifier: PO_EMAIL_AGENT_ID,
    execution_status: outcome === 'success' ? 'success' : 'error',
    execution_details: {
      po_id: poId,
      outcome,
      details,
      proposedCount: 1,
      executedCount: outcome === 'success' ? 1 : 0,
    },
    execution_duration_ms: 0,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Batch Processing
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process all draft POs that haven't been emailed
 */
export async function processPendingPOEmails(): Promise<{
  processed: number;
  sent: number;
  queued: number;
  drafted: number;
  errors: number;
}> {
  const { data: pendingPOs, error } = await supabase
    .from('purchase_orders')
    .select('id, order_id, status')
    .eq('status', 'draft')
    .is('last_email_sent_at', null)
    .limit(20);

  if (error || !pendingPOs) {
    return { processed: 0, sent: 0, queued: 0, drafted: 0, errors: 0 };
  }

  const results = { processed: 0, sent: 0, queued: 0, drafted: 0, errors: 0 };

  for (const po of pendingPOs) {
    const result = await sendPOEmail({
      poId: po.id,
      templateType: 'new_order',
    });

    results.processed++;
    if (result.action === 'sent') results.sent++;
    else if (result.action === 'queued') results.queued++;
    else if (result.action === 'drafted') results.drafted++;
    else results.errors++;
  }

  return results;
}

/**
 * Get email sending statistics
 */
export async function getEmailSendingStats(): Promise<{
  totalSent: number;
  autoSent: number;
  manualApproved: number;
  rejected: number;
  pending: number;
  currentTrustScore: number;
}> {
  const trustScore = await getEmailAgentTrustScore();

  const { data: stats } = await supabase
    .from('po_email_drafts')
    .select('status')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  const counts = {
    totalSent: 0,
    autoSent: 0,
    manualApproved: 0,
    rejected: 0,
    pending: 0,
  };

  for (const row of stats || []) {
    if (row.status === 'approved') counts.manualApproved++;
    else if (row.status === 'rejected') counts.rejected++;
    else if (row.status === 'pending_approval') counts.pending++;
  }

  // Get auto-sent count from communications
  const { count: autoCount } = await supabase
    .from('po_vendor_communications')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'outbound')
    .contains('metadata', { send_type: 'auto' })
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  counts.autoSent = autoCount || 0;
  counts.totalSent = counts.autoSent + counts.manualApproved;

  return { ...counts, currentTrustScore: trustScore };
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

export default {
  sendPOEmail,
  approveAndSendEmail,
  rejectEmail,
  getPendingEmailDrafts,
  processPendingPOEmails,
  getEmailSendingStats,
};
