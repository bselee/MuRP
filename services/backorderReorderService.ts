/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BACKORDER REORDER SERVICE - Intelligent Follow-Up PO Creation
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Automatically creates follow-up POs for shortages when:
 * 1. Partial receipt detected (received < ordered)
 * 2. Shortage will cause stockout (needs analysis)
 * 3. Vendor did NOT invoice for missing items (else: dispute)
 *
 * Key Decision Logic:
 * - Shortage + Vendor charged for missing = DISPUTE (not reorder)
 * - Shortage + Vendor didn't charge = BACKORDER (create follow-up PO)
 * - Shortage + No invoice yet = WAIT (need invoice data first)
 *
 * @module services/backorderReorderService
 */

import { supabase } from '../lib/supabase/client';
import { performThreeWayMatch, assessShortageImpact, type ThreeWayMatchResult } from './threeWayMatchService';
import { sendPOEmail, type POEmailResult } from './autonomousPOEmailService';
import { getGoogleGmailService } from './googleGmailService';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface BackorderAnalysis {
  poId: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  shortages: ShortageItem[];
  totalShortageValue: number;
  recommendation: BackorderRecommendation;
  readyForAutoReorder: boolean;
  blockers: string[];
}

export interface ShortageItem {
  sku: string;
  itemName: string;
  orderedQty: number;
  receivedQty: number;
  shortageQty: number;
  unitCost: number;
  shortageValue: number;
  vendorInvoicedForMissing: boolean | null; // null = unknown
  willCauseStockout: boolean;
  daysUntilStockout: number;
  recommendAction: 'backorder' | 'dispute' | 'wait' | 'ignore';
}

export type BackorderRecommendation =
  | 'create_backorder_po'    // All shortages clear for reorder
  | 'dispute_invoice'        // Vendor charged for items not shipped
  | 'wait_for_invoice'       // Need invoice to determine action
  | 'partial_backorder'      // Some items reorder, some dispute
  | 'no_action_needed';      // Shortage won't cause stockout

export interface BackorderResult {
  success: boolean;
  action: 'backorder_created' | 'dispute_filed' | 'queued_for_review' | 'no_action';
  backorderPoId?: string;
  backorderPoNumber?: string;
  disputeId?: string;
  reason: string;
  details?: BackorderAnalysis;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Service Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze a PO for backorder needs
 */
export async function analyzeBackorderNeeds(poId: string): Promise<BackorderAnalysis> {
  // 1. Get PO with items
  const { data: po, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      purchase_order_items (
        inventory_sku,
        item_name,
        quantity_ordered,
        quantity_received,
        unit_cost,
        line_total
      )
    `)
    .eq('id', poId)
    .single();

  if (error || !po) {
    throw new Error(`PO not found: ${poId}`);
  }

  // 2. Perform three-way match to get invoice data
  let matchResult: ThreeWayMatchResult | null = null;
  try {
    matchResult = await performThreeWayMatch(poId);
  } catch (e) {
    console.warn('[backorderReorderService] Three-way match failed:', e);
  }

  // 3. Analyze each shortage item
  const shortages: ShortageItem[] = [];

  for (const item of po.purchase_order_items || []) {
    const shortageQty = item.quantity_ordered - (item.quantity_received || 0);

    if (shortageQty <= 0) continue; // No shortage

    // Check if vendor invoiced for missing items
    const invoicedForMissing = matchResult
      ? checkIfInvoicedForMissing(item.inventory_sku, matchResult)
      : null;

    // Assess stock impact
    const stockImpact = await assessShortageImpact(item.inventory_sku, shortageQty);

    // Determine recommended action
    let recommendAction: ShortageItem['recommendAction'] = 'wait';

    if (invoicedForMissing === true) {
      // Vendor charged for items they didn't ship - dispute!
      recommendAction = 'dispute';
    } else if (invoicedForMissing === false) {
      // Vendor correctly only charged for shipped items
      recommendAction = stockImpact.recommendBackorder ? 'backorder' : 'ignore';
    } else {
      // No invoice yet - wait
      recommendAction = 'wait';
    }

    shortages.push({
      sku: item.inventory_sku,
      itemName: item.item_name,
      orderedQty: item.quantity_ordered,
      receivedQty: item.quantity_received || 0,
      shortageQty,
      unitCost: item.unit_cost,
      shortageValue: shortageQty * item.unit_cost,
      vendorInvoicedForMissing: invoicedForMissing,
      willCauseStockout: stockImpact.willCauseStockout,
      daysUntilStockout: stockImpact.daysUntilStockout,
      recommendAction,
    });
  }

  // 4. Determine overall recommendation
  const { recommendation, readyForAutoReorder, blockers } = determineRecommendation(shortages);

  return {
    poId,
    poNumber: po.order_id,
    vendorId: po.vendor_id,
    vendorName: po.supplier_name,
    shortages,
    totalShortageValue: shortages.reduce((sum, s) => sum + s.shortageValue, 0),
    recommendation,
    readyForAutoReorder,
    blockers,
  };
}

/**
 * Process backorder for a PO (create follow-up PO or file dispute)
 */
export async function processBackorder(poId: string): Promise<BackorderResult> {
  try {
    const analysis = await analyzeBackorderNeeds(poId);

    // Check if any action is needed
    if (analysis.shortages.length === 0) {
      return {
        success: true,
        action: 'no_action',
        reason: 'No shortages detected',
      };
    }

    if (analysis.recommendation === 'no_action_needed') {
      return {
        success: true,
        action: 'no_action',
        reason: 'Shortages will not cause stockout - no action needed',
        details: analysis,
      };
    }

    if (analysis.recommendation === 'wait_for_invoice') {
      // Queue for review when invoice arrives
      await queueForInvoiceReview(analysis);
      return {
        success: true,
        action: 'queued_for_review',
        reason: 'Waiting for invoice data to determine action',
        details: analysis,
      };
    }

    if (analysis.recommendation === 'dispute_invoice') {
      // Create dispute
      const disputeId = await createInvoiceDispute(analysis);
      return {
        success: true,
        action: 'dispute_filed',
        disputeId,
        reason: 'Vendor invoiced for unshipped items - dispute filed',
        details: analysis,
      };
    }

    if (analysis.recommendation === 'create_backorder_po' && analysis.readyForAutoReorder) {
      // Create backorder PO
      const { poId: newPoId, poNumber } = await createBackorderPO(analysis);
      return {
        success: true,
        action: 'backorder_created',
        backorderPoId: newPoId,
        backorderPoNumber: poNumber,
        reason: 'Follow-up PO created for shortage items',
        details: analysis,
      };
    }

    // Partial or complex case - queue for human review
    await queueForHumanReview(analysis);
    return {
      success: true,
      action: 'queued_for_review',
      reason: `Complex case requiring review: ${analysis.blockers.join(', ')}`,
      details: analysis,
    };

  } catch (error: any) {
    console.error('[backorderReorderService] Process failed:', error);
    return {
      success: false,
      action: 'no_action',
      reason: error.message,
    };
  }
}

/**
 * Batch process all POs with partial receipts
 */
export async function processAllPartialReceipts(): Promise<{
  processed: number;
  backordersCreated: number;
  disputesFiled: number;
  queuedForReview: number;
  noActionNeeded: number;
}> {
  // Find POs with partial receipts
  const { data: partialPOs, error } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('status', 'partial')
    .is('backorder_processed', null)
    .limit(20);

  if (error || !partialPOs) {
    return { processed: 0, backordersCreated: 0, disputesFiled: 0, queuedForReview: 0, noActionNeeded: 0 };
  }

  const results = {
    processed: 0,
    backordersCreated: 0,
    disputesFiled: 0,
    queuedForReview: 0,
    noActionNeeded: 0,
  };

  for (const po of partialPOs) {
    const result = await processBackorder(po.id);
    results.processed++;

    switch (result.action) {
      case 'backorder_created': results.backordersCreated++; break;
      case 'dispute_filed': results.disputesFiled++; break;
      case 'queued_for_review': results.queuedForReview++; break;
      case 'no_action': results.noActionNeeded++; break;
    }

    // Mark as processed
    await supabase
      .from('purchase_orders')
      .update({ backorder_processed: true, backorder_processed_at: new Date().toISOString() })
      .eq('id', po.id);
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

function checkIfInvoicedForMissing(sku: string, matchResult: ThreeWayMatchResult): boolean | null {
  const lineItem = matchResult.lineItems.find(li => li.sku.toLowerCase() === sku.toLowerCase());

  if (!lineItem || lineItem.invoicedQuantity === null) {
    return null; // No invoice data
  }

  // If invoiced qty > received qty, vendor charged for items not shipped
  return lineItem.invoicedQuantity > lineItem.receivedQuantity;
}

function determineRecommendation(shortages: ShortageItem[]): {
  recommendation: BackorderRecommendation;
  readyForAutoReorder: boolean;
  blockers: string[];
} {
  if (shortages.length === 0) {
    return { recommendation: 'no_action_needed', readyForAutoReorder: false, blockers: [] };
  }

  const blockers: string[] = [];

  // Check for waiting items
  const waitingItems = shortages.filter(s => s.recommendAction === 'wait');
  if (waitingItems.length > 0) {
    blockers.push(`${waitingItems.length} item(s) waiting for invoice`);
  }

  // Check for dispute items
  const disputeItems = shortages.filter(s => s.recommendAction === 'dispute');
  if (disputeItems.length > 0) {
    blockers.push(`${disputeItems.length} item(s) need invoice dispute`);
  }

  // Check for backorder items
  const backorderItems = shortages.filter(s => s.recommendAction === 'backorder');
  const ignoreItems = shortages.filter(s => s.recommendAction === 'ignore');

  // Determine recommendation
  if (waitingItems.length === shortages.length) {
    return { recommendation: 'wait_for_invoice', readyForAutoReorder: false, blockers };
  }

  if (disputeItems.length === shortages.length) {
    return { recommendation: 'dispute_invoice', readyForAutoReorder: false, blockers };
  }

  if (backorderItems.length === shortages.length) {
    return { recommendation: 'create_backorder_po', readyForAutoReorder: true, blockers: [] };
  }

  if (ignoreItems.length === shortages.length) {
    return { recommendation: 'no_action_needed', readyForAutoReorder: false, blockers: [] };
  }

  // Mixed case
  if (backorderItems.length > 0 && disputeItems.length > 0) {
    return { recommendation: 'partial_backorder', readyForAutoReorder: false, blockers };
  }

  if (backorderItems.length > 0) {
    return { recommendation: 'create_backorder_po', readyForAutoReorder: waitingItems.length === 0, blockers };
  }

  return { recommendation: 'no_action_needed', readyForAutoReorder: false, blockers };
}

async function createBackorderPO(analysis: BackorderAnalysis): Promise<{ poId: string; poNumber: string }> {
  const backorderItems = analysis.shortages.filter(s => s.recommendAction === 'backorder');

  if (backorderItems.length === 0) {
    throw new Error('No items eligible for backorder');
  }

  // Generate backorder PO number
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const poNumber = `PO-${dateStr}-B${analysis.poNumber.split('-').pop()}`;

  // Create PO header
  const { data: newPO, error: poError } = await supabase
    .from('purchase_orders')
    .insert({
      order_id: poNumber,
      vendor_id: analysis.vendorId,
      supplier_name: analysis.vendorName,
      status: 'draft',
      order_date: new Date().toISOString(),
      source: 'backorder',
      auto_generated: true,
      internal_notes: `Backorder for shortage on ${analysis.poNumber}`,
      parent_po_id: analysis.poId,
    } as any)
    .select('id')
    .single();

  if (poError) throw poError;

  // Create line items
  const lineItems = backorderItems.map((item, idx) => ({
    po_id: newPO.id,
    inventory_sku: item.sku,
    item_name: item.itemName,
    quantity_ordered: item.shortageQty,
    unit_cost: item.unitCost,
    line_number: idx + 1,
    line_status: 'pending',
    reorder_reason: 'backorder_shortage',
  }));

  await supabase.from('purchase_order_items').insert(lineItems);

  // Record in backorders table
  for (const item of backorderItems) {
    await supabase.from('po_backorders').insert({
      original_po_id: analysis.poId,
      backorder_po_id: newPO.id,
      sku: item.sku,
      item_name: item.itemName,
      shortage_quantity: item.shortageQty,
      shortage_value: item.shortageValue,
      status: 'backorder_created',
      will_cause_stockout: item.willCauseStockout,
      days_until_stockout: item.daysUntilStockout,
      vendor_invoiced_shortage: item.vendorInvoicedForMissing,
      decision: 'create_backorder',
      decided_at: new Date().toISOString(),
    });
  }

  return { poId: newPO.id, poNumber };
}

async function createInvoiceDispute(analysis: BackorderAnalysis): Promise<string> {
  const disputeItems = analysis.shortages.filter(s => s.recommendAction === 'dispute');
  const disputeValue = disputeItems.reduce((sum, item) => sum + item.shortageValue, 0);

  // Create dispute record
  const { data: dispute, error } = await supabase
    .from('invoice_disputes')
    .insert({
      po_id: analysis.poId,
      vendor_id: analysis.vendorId,
      dispute_type: 'unshipped_items_charged',
      dispute_amount: disputeValue,
      status: 'email_pending',
      items: disputeItems.map(i => ({
        sku: i.sku,
        item_name: i.itemName,
        shortage_qty: i.shortageQty,
        charged_amount: i.shortageValue,
      })),
      description: `Vendor invoiced for ${disputeItems.length} items that were not shipped. Total overcharge: $${disputeValue.toFixed(2)}`,
    })
    .select('id')
    .single();

  if (error) throw error;

  // Record in backorders table
  for (const item of disputeItems) {
    await supabase.from('po_backorders').insert({
      original_po_id: analysis.poId,
      sku: item.sku,
      item_name: item.itemName,
      shortage_quantity: item.shortageQty,
      shortage_value: item.shortageValue,
      status: 'pending_review',
      vendor_invoiced_shortage: true,
      decision: 'dispute_invoice',
      decision_reason: 'Vendor charged for unshipped items',
      decided_at: new Date().toISOString(),
    });
  }

  // AUTONOMOUS: Send dispute email to vendor
  const emailResult = await sendDisputeEmail(analysis, disputeItems, disputeValue, dispute.id);

  // Update dispute with email status
  await supabase
    .from('invoice_disputes')
    .update({
      status: emailResult.sent ? 'email_sent' : 'email_queued',
      email_sent_at: emailResult.sent ? new Date().toISOString() : null,
      email_id: emailResult.emailId,
      thread_id: emailResult.threadId,
    })
    .eq('id', dispute.id);

  return dispute.id;
}

/**
 * Send autonomous dispute email to vendor
 */
async function sendDisputeEmail(
  analysis: BackorderAnalysis,
  disputeItems: ShortageItem[],
  disputeValue: number,
  disputeId: string
): Promise<{ sent: boolean; emailId?: string; threadId?: string }> {
  // Get vendor email
  const { data: vendor } = await supabase
    .from('vendors')
    .select('email, contact_name, name')
    .eq('id', analysis.vendorId)
    .single();

  if (!vendor?.email) {
    console.warn('[backorderReorderService] No vendor email for dispute');
    return { sent: false };
  }

  // Build dispute email content
  const itemList = disputeItems.map(item =>
    `  • ${item.itemName} (${item.sku}): Ordered ${item.orderedQty}, Received ${item.receivedQty}, Invoiced ${item.orderedQty} - Overcharge: $${item.shortageValue.toFixed(2)}`
  ).join('\n');

  const subject = `Invoice Discrepancy - PO ${analysis.poNumber} - Credit Request $${disputeValue.toFixed(2)}`;

  const body = `Dear ${vendor.contact_name || 'Accounts Receivable Team'},

We have identified a discrepancy on the invoice for Purchase Order ${analysis.poNumber}.

ISSUE: We were invoiced for items that were not shipped.

DETAILS:
${itemList}

TOTAL OVERCHARGE: $${disputeValue.toFixed(2)}

Our records show:
- Items ordered: ${disputeItems.reduce((s, i) => s + i.orderedQty, 0)} units
- Items received: ${disputeItems.reduce((s, i) => s + i.receivedQty, 0)} units
- Items invoiced: ${disputeItems.reduce((s, i) => s + i.orderedQty, 0)} units (incorrect)

REQUESTED ACTION:
Please issue a credit memo for $${disputeValue.toFixed(2)} or advise when the missing items will ship.

If the items are being shipped separately, please provide tracking information.

Please respond to this email within 5 business days.

Reference: Dispute #${disputeId.slice(0, 8).toUpperCase()}

Thank you for your prompt attention.

Best regards,
MuRP Accounts Payable`;

  // Store draft and attempt send via autonomous service
  const { data: draft } = await supabase
    .from('po_email_drafts')
    .insert({
      po_id: analysis.poId,
      po_number: analysis.poNumber,
      vendor_name: analysis.vendorName,
      vendor_email: vendor.email,
      subject,
      body,
      status: 'pending_approval',
      requires_review: false, // Disputes can auto-send at high trust
    })
    .select('id')
    .single();

  // Try to send via Gmail (uses trust score gating)
  try {
    const gmailService = getGoogleGmailService();

    // Get existing thread if we have one for this PO
    const { data: existingThread } = await supabase
      .from('po_vendor_communications')
      .select('gmail_thread_id')
      .eq('po_id', analysis.poId)
      .not('gmail_thread_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const result = await gmailService.sendEmail({
      to: vendor.email,
      subject,
      body,
      threadId: existingThread?.gmail_thread_id,
    });

    // Record communication
    await supabase.from('po_vendor_communications').insert({
      po_id: analysis.poId,
      communication_type: 'invoice_dispute',
      direction: 'outbound',
      stage: 'dispute_sent',
      gmail_message_id: result.id,
      gmail_thread_id: result.threadId,
      subject,
      body_preview: body.substring(0, 500),
      recipient_email: vendor.email,
      sent_at: new Date().toISOString(),
      metadata: { dispute_id: disputeId, dispute_amount: disputeValue },
    });

    // Update draft as sent
    if (draft) {
      await supabase
        .from('po_email_drafts')
        .update({ status: 'approved', sent_at: new Date().toISOString() })
        .eq('id', draft.id);
    }

    return { sent: true, emailId: result.id, threadId: result.threadId };

  } catch (err) {
    console.error('[backorderReorderService] Dispute email send failed:', err);

    // Queue for manual approval
    await supabase.from('pending_actions_queue').insert({
      action_type: 'send_dispute_email',
      agent: 'backorder_reorder_agent',
      entity_type: 'invoice_dispute',
      entity_id: disputeId,
      payload: { draftId: draft?.id, vendorEmail: vendor.email, subject, disputeValue },
      priority: 'high',
      status: 'pending',
    });

    return { sent: false };
  }
}

async function queueForInvoiceReview(analysis: BackorderAnalysis): Promise<void> {
  // Record items waiting for invoice
  for (const item of analysis.shortages.filter(s => s.recommendAction === 'wait')) {
    await supabase.from('po_backorders').upsert({
      original_po_id: analysis.poId,
      sku: item.sku,
      item_name: item.itemName,
      shortage_quantity: item.shortageQty,
      shortage_value: item.shortageValue,
      status: 'identified',
      will_cause_stockout: item.willCauseStockout,
      days_until_stockout: item.daysUntilStockout,
      vendor_invoiced_shortage: null,
    }, {
      onConflict: 'original_po_id,sku',
    });
  }
}

async function queueForHumanReview(analysis: BackorderAnalysis): Promise<void> {
  await supabase.from('pending_actions_queue').insert({
    action_type: 'review_backorder',
    agent: 'backorder_reorder_agent',
    entity_type: 'purchase_order',
    entity_id: analysis.poId,
    payload: { analysis },
    priority: analysis.shortages.some(s => s.willCauseStockout) ? 'high' : 'medium',
    status: 'pending',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

export default {
  analyzeBackorderNeeds,
  processBackorder,
  processAllPartialReceipts,
};
