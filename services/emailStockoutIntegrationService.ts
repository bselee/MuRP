/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EMAIL → STOCKOUT INTEGRATION SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Phase 4: Connects Email Tracking Agent intelligence to Stockout Prevention.
 *
 * This service bridges the gap between:
 * - Email-derived ETAs, tracking, and delays from email_threads
 * - Stock level predictions and stockout alerts
 *
 * Key capabilities:
 * 1. Email-enhanced arrival predictions (better than PO expected_date alone)
 * 2. Early warning signals from vendor emails (delays, backorders)
 * 3. Stock coverage calculation with email-derived ETAs
 * 4. Proactive stockout prevention based on email intelligence
 *
 * Goal: NEVER BE OUT OF STOCK!
 *
 * @module services/emailStockoutIntegrationService
 */

import { supabase } from '../lib/supabase/client';
import { getArrivalPredictions, POArrivalPrediction, getPesterAlerts, PesterAlert } from './poIntelligenceAgent';
import { getCriticalStockoutAlerts, StockoutAlert, analyzeBOMBlocking, BOMBlockingAnalysis } from './stockoutPreventionAgent';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface EmailEnhancedPrediction extends POArrivalPrediction {
  // Email-derived intelligence (overrides or supplements PO data)
  email_eta: string | null;
  email_eta_confidence: 'high' | 'medium' | 'low' | null;
  email_tracking_status: string | null;
  email_tracking_numbers: string[];
  email_carriers: string[];

  // Email signals
  has_delay_notice: boolean;
  has_backorder_notice: boolean;
  delay_reason: string | null;
  expected_delay_days: number | null;

  // Thread info
  thread_id: string | null;
  thread_subject: string | null;
  last_vendor_message_at: string | null;
  days_since_vendor_update: number | null;

  // Enhanced prediction
  adjusted_eta: string | null;
  adjusted_days_until_arrival: number;
  eta_source: 'email' | 'po' | 'calculated';

  // Risk assessment
  email_risk_score: number; // 0-100, higher = more risk
  risk_factors: string[];
}

export interface EmailStockoutSignal {
  signal_type: 'delay_notice' | 'backorder' | 'no_response' | 'tracking_exception' | 'eta_slipped';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  po_id: string;
  po_number: string;
  vendor_name: string;
  message: string;
  detected_at: string;
  thread_id: string | null;
  items_at_risk: string[];
  estimated_impact_days: number;
  recommended_action: string;
}

export interface EmailDrivenStockoutRisk {
  sku: string;
  product_name: string;
  current_stock: number;
  daily_consumption: number;
  days_of_stock_remaining: number;

  // Email-aware coverage
  pos_in_transit: EmailEnhancedPrediction[];
  earliest_email_eta: string | null;
  days_until_email_eta: number | null;

  // Risk analysis
  will_stockout_before_arrival: boolean;
  gap_days: number; // Days between stockout and arrival (negative = good)
  risk_level: 'SAFE' | 'AT_RISK' | 'WILL_STOCKOUT';

  // Email signals affecting this SKU
  signals: EmailStockoutSignal[];

  // Recommendation
  action_required: 'none' | 'monitor' | 'expedite' | 'emergency_order';
  action_reason: string;
}

export interface EmailIntelligenceDashboard {
  summary: {
    total_active_threads: number;
    threads_with_eta: number;
    threads_with_delays: number;
    threads_awaiting_response: number;
    avg_vendor_response_days: number;
  };
  signals: EmailStockoutSignal[];
  enhanced_predictions: EmailEnhancedPrediction[];
  at_risk_skus: EmailDrivenStockoutRisk[];

  // Aggregated stats
  pos_with_email_tracking: number;
  pos_without_tracking: number;
  avg_email_eta_accuracy: number | null; // % of email ETAs that were accurate
}

// ═══════════════════════════════════════════════════════════════════════════
// Core Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get email-enhanced arrival predictions
 * Combines PO data with email thread intelligence for more accurate ETAs
 */
export async function getEmailEnhancedPredictions(): Promise<EmailEnhancedPrediction[]> {
  // Get base predictions from PO Intelligence
  const basePredictions = await getArrivalPredictions();

  // Get email threads with ETA/tracking info
  const { data: threads, error: threadError } = await supabase
    .from('email_threads')
    .select(`
      id,
      po_id,
      subject,
      latest_eta,
      eta_confidence,
      latest_tracking_status,
      tracking_numbers,
      carriers,
      last_inbound_at,
      key_dates,
      action_items,
      urgency_level
    `)
    .not('po_id', 'is', null)
    .eq('is_resolved', false);

  if (threadError) {
    console.error('[emailStockoutIntegration] Failed to fetch threads:', threadError);
    return basePredictions.map(p => enhancePredictionWithDefaults(p));
  }

  // Get delay/backorder notices from messages
  const { data: delayMessages } = await supabase
    .from('email_thread_messages')
    .select(`
      thread_id,
      is_delay_notice,
      is_backorder_notice,
      extracted_data,
      sent_at
    `)
    .or('is_delay_notice.eq.true,is_backorder_notice.eq.true')
    .order('sent_at', { ascending: false });

  // Build thread lookup
  const threadByPo = new Map<string, any>();
  for (const thread of threads || []) {
    if (thread.po_id) {
      threadByPo.set(thread.po_id, thread);
    }
  }

  // Build delay notice lookup
  const delayByThread = new Map<string, any>();
  for (const msg of delayMessages || []) {
    if (!delayByThread.has(msg.thread_id)) {
      delayByThread.set(msg.thread_id, msg);
    }
  }

  // Enhance each prediction with email intelligence
  return basePredictions.map(pred => {
    const thread = threadByPo.get(pred.po_id);
    const delayNotice = thread ? delayByThread.get(thread.id) : null;

    return enhancePredictionWithEmail(pred, thread, delayNotice);
  });
}

/**
 * Enhance a single prediction with email intelligence
 */
function enhancePredictionWithEmail(
  pred: POArrivalPrediction,
  thread: any | null,
  delayNotice: any | null
): EmailEnhancedPrediction {
  const now = new Date();

  // Default enhancement
  const enhanced: EmailEnhancedPrediction = {
    ...pred,
    email_eta: null,
    email_eta_confidence: null,
    email_tracking_status: null,
    email_tracking_numbers: [],
    email_carriers: [],
    has_delay_notice: false,
    has_backorder_notice: false,
    delay_reason: null,
    expected_delay_days: null,
    thread_id: null,
    thread_subject: null,
    last_vendor_message_at: null,
    days_since_vendor_update: null,
    adjusted_eta: pred.predicted_eta,
    adjusted_days_until_arrival: pred.days_until_arrival,
    eta_source: 'po',
    email_risk_score: 0,
    risk_factors: [],
  };

  if (!thread) {
    // No email thread - flag as risk if order is important
    if (pred.items.some(i => i.is_out_of_stock)) {
      enhanced.risk_factors.push('No email thread for PO with out-of-stock items');
      enhanced.email_risk_score += 30;
    }
    return enhanced;
  }

  // Apply email thread data
  enhanced.thread_id = thread.id;
  enhanced.thread_subject = thread.subject;
  enhanced.email_eta = thread.latest_eta;
  enhanced.email_eta_confidence = thread.eta_confidence;
  enhanced.email_tracking_status = thread.latest_tracking_status;
  enhanced.email_tracking_numbers = thread.tracking_numbers || [];
  enhanced.email_carriers = thread.carriers || [];
  enhanced.last_vendor_message_at = thread.last_inbound_at;

  // Calculate days since vendor update
  if (thread.last_inbound_at) {
    const lastContact = new Date(thread.last_inbound_at);
    enhanced.days_since_vendor_update = Math.floor(
      (now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  // Handle delay notice
  if (delayNotice) {
    enhanced.has_delay_notice = delayNotice.is_delay_notice;
    enhanced.has_backorder_notice = delayNotice.is_backorder_notice;

    if (delayNotice.extracted_data) {
      enhanced.delay_reason = delayNotice.extracted_data.delay_reason || null;
      enhanced.expected_delay_days = delayNotice.extracted_data.delay_days || null;
    }
  }

  // Use email ETA if available and confidence is good
  if (thread.latest_eta && thread.eta_confidence !== 'low') {
    const emailEtaDate = new Date(thread.latest_eta);
    enhanced.adjusted_eta = thread.latest_eta;
    enhanced.adjusted_days_until_arrival = Math.ceil(
      (emailEtaDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    enhanced.eta_source = 'email';

    // Override status based on email tracking
    if (thread.latest_tracking_status === 'in_transit' ||
        thread.latest_tracking_status === 'out_for_delivery') {
      enhanced.status = 'on_time';
      enhanced.confidence = 'high';
    } else if (thread.latest_tracking_status === 'exception') {
      enhanced.status = 'delayed';
      enhanced.confidence = 'high';
    }
  }

  // Calculate risk score
  if (enhanced.has_delay_notice) {
    enhanced.risk_factors.push('Delay notice received from vendor');
    enhanced.email_risk_score += 40;
  }

  if (enhanced.has_backorder_notice) {
    enhanced.risk_factors.push('Backorder notice received');
    enhanced.email_risk_score += 60;
  }

  if (enhanced.days_since_vendor_update && enhanced.days_since_vendor_update > 7) {
    enhanced.risk_factors.push(`No vendor update in ${enhanced.days_since_vendor_update} days`);
    enhanced.email_risk_score += Math.min(30, enhanced.days_since_vendor_update * 2);
  }

  if (!enhanced.email_tracking_numbers.length && enhanced.adjusted_days_until_arrival < 7) {
    enhanced.risk_factors.push('No tracking info with imminent ETA');
    enhanced.email_risk_score += 20;
  }

  if (thread.urgency_level === 'critical') {
    enhanced.risk_factors.push('Thread marked as critical');
    enhanced.email_risk_score += 25;
  }

  // Cap risk score at 100
  enhanced.email_risk_score = Math.min(100, enhanced.email_risk_score);

  return enhanced;
}

/**
 * Default enhancement when no thread exists
 */
function enhancePredictionWithDefaults(pred: POArrivalPrediction): EmailEnhancedPrediction {
  return {
    ...pred,
    email_eta: null,
    email_eta_confidence: null,
    email_tracking_status: null,
    email_tracking_numbers: [],
    email_carriers: [],
    has_delay_notice: false,
    has_backorder_notice: false,
    delay_reason: null,
    expected_delay_days: null,
    thread_id: null,
    thread_subject: null,
    last_vendor_message_at: null,
    days_since_vendor_update: null,
    adjusted_eta: pred.predicted_eta,
    adjusted_days_until_arrival: pred.days_until_arrival,
    eta_source: 'po',
    email_risk_score: 0,
    risk_factors: [],
  };
}

/**
 * Get email-based stockout signals
 * These are early warning signals from vendor communications
 */
export async function getEmailStockoutSignals(): Promise<EmailStockoutSignal[]> {
  const signals: EmailStockoutSignal[] = [];

  // Get threads with delay/backorder/urgency
  const { data: urgentThreads, error } = await supabase
    .from('email_threads')
    .select(`
      id,
      po_id,
      subject,
      urgency_level,
      urgency_reason,
      last_inbound_at,
      requires_response,
      response_due_by,
      latest_eta,
      key_dates,
      purchase_orders (
        id,
        order_id,
        vendor_name,
        line_items
      )
    `)
    .eq('is_resolved', false)
    .or('urgency_level.in.(high,critical)');

  if (error) {
    console.error('[emailStockoutIntegration] Failed to fetch urgent threads:', error);
    return signals;
  }

  // Get delay/backorder messages
  const { data: alertMessages } = await supabase
    .from('email_thread_messages')
    .select(`
      thread_id,
      is_delay_notice,
      is_backorder_notice,
      extracted_data,
      sent_at,
      body_preview
    `)
    .or('is_delay_notice.eq.true,is_backorder_notice.eq.true')
    .order('sent_at', { ascending: false });

  // Build thread alert map
  const alertsByThread = new Map<string, any>();
  for (const msg of alertMessages || []) {
    if (!alertsByThread.has(msg.thread_id)) {
      alertsByThread.set(msg.thread_id, msg);
    }
  }

  for (const thread of urgentThreads || []) {
    const po = thread.purchase_orders;
    if (!po) continue;

    const alertMsg = alertsByThread.get(thread.id);
    const lineItems = Array.isArray(po.line_items) ? po.line_items : [];
    const itemNames = lineItems.map((i: any) => i.product_name || i.sku || 'Unknown').slice(0, 5);

    // Delay notice signal
    if (alertMsg?.is_delay_notice) {
      const delayDays = alertMsg.extracted_data?.delay_days || 7;
      signals.push({
        signal_type: 'delay_notice',
        severity: delayDays > 14 ? 'CRITICAL' : 'HIGH',
        po_id: po.id,
        po_number: po.order_id,
        vendor_name: po.vendor_name || 'Unknown',
        message: alertMsg.extracted_data?.delay_reason ||
                 `Vendor reported delay: ${alertMsg.body_preview?.slice(0, 100)}...`,
        detected_at: alertMsg.sent_at,
        thread_id: thread.id,
        items_at_risk: itemNames,
        estimated_impact_days: delayDays,
        recommended_action: delayDays > 14
          ? 'Consider emergency order from alternate supplier'
          : 'Monitor closely and prepare contingency',
      });
    }

    // Backorder signal
    if (alertMsg?.is_backorder_notice) {
      signals.push({
        signal_type: 'backorder',
        severity: 'CRITICAL',
        po_id: po.id,
        po_number: po.order_id,
        vendor_name: po.vendor_name || 'Unknown',
        message: alertMsg.extracted_data?.backorder_reason ||
                 'Vendor reported items on backorder',
        detected_at: alertMsg.sent_at,
        thread_id: thread.id,
        items_at_risk: itemNames,
        estimated_impact_days: alertMsg.extracted_data?.backorder_days || 30,
        recommended_action: 'URGENT: Source from alternate vendor immediately',
      });
    }

    // No response signal
    if (thread.requires_response && thread.response_due_by) {
      const dueDate = new Date(thread.response_due_by);
      if (dueDate < new Date()) {
        const daysPastDue = Math.floor(
          (Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        signals.push({
          signal_type: 'no_response',
          severity: daysPastDue > 5 ? 'HIGH' : 'MEDIUM',
          po_id: po.id,
          po_number: po.order_id,
          vendor_name: po.vendor_name || 'Unknown',
          message: `Vendor hasn't responded in ${daysPastDue} days past due date`,
          detected_at: new Date().toISOString(),
          thread_id: thread.id,
          items_at_risk: itemNames,
          estimated_impact_days: daysPastDue,
          recommended_action: 'Send follow-up email and consider phone call',
        });
      }
    }
  }

  // Sort by severity
  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
  return signals.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/**
 * Calculate email-driven stockout risks per SKU
 * Combines inventory levels with email-enhanced PO predictions
 */
export async function getEmailDrivenStockoutRisks(): Promise<EmailDrivenStockoutRisk[]> {
  const risks: EmailDrivenStockoutRisk[] = [];

  // Get inventory with consumption data
  const { data: inventory, error: invError } = await supabase
    .from('inventory_items')
    .select(`
      sku,
      product_name,
      name,
      available_quantity,
      avg_daily_consumption,
      reorder_point
    `)
    .gt('avg_daily_consumption', 0)
    .order('available_quantity', { ascending: true });

  if (invError || !inventory) {
    console.error('[emailStockoutIntegration] Failed to fetch inventory:', invError);
    return risks;
  }

  // Get email-enhanced predictions
  const predictions = await getEmailEnhancedPredictions();

  // Get stockout signals
  const signals = await getEmailStockoutSignals();

  // Build PO item lookup by SKU
  const posBySku = new Map<string, EmailEnhancedPrediction[]>();
  for (const pred of predictions) {
    for (const item of pred.items) {
      const sku = item.sku;
      if (!posBySku.has(sku)) {
        posBySku.set(sku, []);
      }
      posBySku.get(sku)!.push(pred);
    }
  }

  // Analyze each SKU
  for (const item of inventory) {
    const stock = item.available_quantity || 0;
    const dailyConsumption = item.avg_daily_consumption || 0;
    const daysRemaining = dailyConsumption > 0 ? stock / dailyConsumption : 999;

    const posForSku = posBySku.get(item.sku) || [];

    // Find earliest email ETA for this SKU
    let earliestEmailEta: string | null = null;
    let daysUntilEmailEta: number | null = null;

    for (const po of posForSku) {
      if (po.adjusted_eta) {
        const etaDate = new Date(po.adjusted_eta);
        if (!earliestEmailEta || etaDate < new Date(earliestEmailEta)) {
          earliestEmailEta = po.adjusted_eta;
          daysUntilEmailEta = po.adjusted_days_until_arrival;
        }
      }
    }

    // Calculate gap
    const gapDays = daysUntilEmailEta !== null
      ? daysUntilEmailEta - Math.floor(daysRemaining)
      : 999;

    // Determine risk level
    let riskLevel: 'SAFE' | 'AT_RISK' | 'WILL_STOCKOUT' = 'SAFE';
    let willStockout = false;

    if (stock === 0) {
      riskLevel = 'WILL_STOCKOUT';
      willStockout = true;
    } else if (gapDays > 0) {
      // Arrival is after stockout
      riskLevel = 'WILL_STOCKOUT';
      willStockout = true;
    } else if (gapDays > -3) {
      // Less than 3 days buffer
      riskLevel = 'AT_RISK';
    }

    // Check for signals affecting this SKU
    const skuSignals = signals.filter(s =>
      s.items_at_risk.some(i => i.toLowerCase().includes(item.sku.toLowerCase()) ||
                                item.sku.toLowerCase().includes(i.toLowerCase()))
    );

    // Escalate risk if there are signals
    if (skuSignals.some(s => s.severity === 'CRITICAL')) {
      riskLevel = 'WILL_STOCKOUT';
    } else if (skuSignals.some(s => s.severity === 'HIGH') && riskLevel === 'SAFE') {
      riskLevel = 'AT_RISK';
    }

    // Determine action
    let actionRequired: 'none' | 'monitor' | 'expedite' | 'emergency_order' = 'none';
    let actionReason = '';

    if (riskLevel === 'WILL_STOCKOUT' || stock === 0) {
      actionRequired = 'emergency_order';
      actionReason = stock === 0
        ? 'Currently out of stock'
        : `Will stockout ${Math.abs(gapDays)} days before PO arrival`;
    } else if (riskLevel === 'AT_RISK') {
      if (skuSignals.length > 0) {
        actionRequired = 'expedite';
        actionReason = 'Vendor delay/issue reported - expedite or find alternate';
      } else {
        actionRequired = 'monitor';
        actionReason = 'Low buffer - monitor closely';
      }
    }

    // Only include items that need attention
    if (riskLevel !== 'SAFE' || skuSignals.length > 0) {
      risks.push({
        sku: item.sku,
        product_name: item.product_name || item.name || item.sku,
        current_stock: stock,
        daily_consumption: dailyConsumption,
        days_of_stock_remaining: Math.floor(daysRemaining),
        pos_in_transit: posForSku,
        earliest_email_eta: earliestEmailEta,
        days_until_email_eta: daysUntilEmailEta,
        will_stockout_before_arrival: willStockout,
        gap_days: gapDays,
        risk_level: riskLevel,
        signals: skuSignals,
        action_required: actionRequired,
        action_reason: actionReason,
      });
    }
  }

  // Sort by risk level and gap
  const riskOrder = { WILL_STOCKOUT: 0, AT_RISK: 1, SAFE: 2 };
  return risks.sort((a, b) => {
    if (riskOrder[a.risk_level] !== riskOrder[b.risk_level]) {
      return riskOrder[a.risk_level] - riskOrder[b.risk_level];
    }
    return a.gap_days - b.gap_days;
  });
}

/**
 * Get comprehensive email intelligence dashboard
 * Aggregates all email-driven stockout prevention data
 */
export async function getEmailIntelligenceDashboard(): Promise<EmailIntelligenceDashboard> {
  // Get thread stats
  const { data: threadStats } = await supabase
    .from('email_threads')
    .select('id, latest_eta, urgency_level, requires_response, last_inbound_at')
    .eq('is_resolved', false);

  const threads = threadStats || [];

  // Calculate summary stats
  const threadsWithEta = threads.filter(t => t.latest_eta).length;
  const threadsWithDelays = threads.filter(t => t.urgency_level === 'high' || t.urgency_level === 'critical').length;
  const threadsAwaiting = threads.filter(t => t.requires_response).length;

  // Calculate average response time
  let totalResponseDays = 0;
  let responseCount = 0;
  for (const thread of threads) {
    if (thread.last_inbound_at) {
      const days = Math.floor(
        (Date.now() - new Date(thread.last_inbound_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      totalResponseDays += days;
      responseCount++;
    }
  }
  const avgResponseDays = responseCount > 0 ? totalResponseDays / responseCount : 0;

  // Get enhanced predictions and signals
  const predictions = await getEmailEnhancedPredictions();
  const signals = await getEmailStockoutSignals();
  const risks = await getEmailDrivenStockoutRisks();

  // Calculate tracking stats
  const posWithTracking = predictions.filter(p => p.email_tracking_numbers.length > 0).length;
  const posWithoutTracking = predictions.filter(p => p.email_tracking_numbers.length === 0).length;

  return {
    summary: {
      total_active_threads: threads.length,
      threads_with_eta: threadsWithEta,
      threads_with_delays: threadsWithDelays,
      threads_awaiting_response: threadsAwaiting,
      avg_vendor_response_days: Math.round(avgResponseDays * 10) / 10,
    },
    signals,
    enhanced_predictions: predictions,
    at_risk_skus: risks,
    pos_with_email_tracking: posWithTracking,
    pos_without_tracking: posWithoutTracking,
    avg_email_eta_accuracy: null, // TODO: Calculate historical accuracy
  };
}

/**
 * Sync email ETAs to purchase orders
 * Updates PO expected dates with vendor-provided ETAs from emails
 */
export async function syncEmailETAsToPurchaseOrders(): Promise<{
  updated: number;
  errors: string[];
}> {
  let updated = 0;
  const errors: string[] = [];

  // Get threads with high-confidence ETAs
  const { data: threads, error } = await supabase
    .from('email_threads')
    .select(`
      id,
      po_id,
      latest_eta,
      eta_confidence,
      purchase_orders (
        id,
        expected_date
      )
    `)
    .not('po_id', 'is', null)
    .not('latest_eta', 'is', null)
    .in('eta_confidence', ['high', 'medium']);

  if (error) {
    console.error('[emailStockoutIntegration] Failed to fetch threads for sync:', error);
    return { updated: 0, errors: [error.message] };
  }

  for (const thread of threads || []) {
    const po = thread.purchase_orders;
    if (!po) continue;

    // Only update if email ETA is different from PO expected date
    if (thread.latest_eta && thread.latest_eta !== po.expected_date) {
      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({
          expected_date: thread.latest_eta,
          // Store original in metadata
          metadata: supabase.sql`COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('original_expected_date', expected_date, 'eta_source', 'email')`
        })
        .eq('id', po.id);

      if (updateError) {
        errors.push(`Failed to update PO ${po.id}: ${updateError.message}`);
      } else {
        updated++;
      }
    }
  }

  console.log(`[emailStockoutIntegration] Synced ${updated} PO ETAs from email`);
  return { updated, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════════════

export default {
  getEmailEnhancedPredictions,
  getEmailStockoutSignals,
  getEmailDrivenStockoutRisks,
  getEmailIntelligenceDashboard,
  syncEmailETAsToPurchaseOrders,
};
