/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🐕 VENDOR WATCHDOG AGENT - Learn from Vendor Behavior
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This agent observes vendor performance and automatically adjusts planning.
 *
 * Key Behaviors:
 * 1. Tracks promised vs actual lead times
 * 2. Calculates "effective lead time" for planning
 * 3. Flags vendors with declining performance
 * 4. Updates trust scores based on reliability
 *
 * Example:
 * - Vendor promises 14 days
 * - Last 5 deliveries averaged 22 days
 * - Agent silently uses 22 days in planning to prevent stockouts
 *
 * @module services/vendorWatchdogAgent
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Types
// ═══════════════════════════════════════════════════════════════════════════

export interface VendorPerformanceSnapshot {
  vendor_id: string;
  vendor_name: string;
  promised_lead_time: number;
  effective_lead_time: number; // What agent uses
  lead_time_variance: number;
  on_time_rate: number;
  quality_rate: number;
  response_rate: number;
  trust_score: number;
  trust_trend: 'improving' | 'stable' | 'declining';
  recommendation: string;
}

export interface PODeliveryRecord {
  po_id: string;
  order_id: string;
  vendor_name: string;
  promised_date: string;
  actual_date: string | null;
  days_late: number;
  was_critical: boolean;
  caused_stockout: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 Core Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record PO delivery performance
 * Called when a PO is received
 */
export async function recordPODelivery(
  poId: string,
  actualDeliveryDate: string,
  wasCritical: boolean = false,
  causedStockout: boolean = false
): Promise<{ success: boolean; effective_lead_time?: number; error?: string }> {
  try {
    // Get PO details
    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .select('order_id, order_date, vendor_id, expected_date, supplier_name')
      .eq('id', poId)
      .single();

    if (poError || !po) {
      return { success: false, error: 'PO not found' };
    }

    // Calculate actual lead time
    const orderDate = new Date(po.order_date);
    const deliveryDate = new Date(actualDeliveryDate);
    const actualLeadTimeDays = Math.floor(
      (deliveryDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Get vendor's promised lead time
    const { data: vendor } = await supabase
      .from('vendors')
      .select('lead_time_days')
      .eq('id', po.vendor_id)
      .single();

    const promisedLeadTime = vendor?.lead_time_days || 14;

    // Determine delivery status
    const variance = actualLeadTimeDays - promisedLeadTime;
    let deliveryStatus: string;
    if (variance < -1) deliveryStatus = 'early';
    else if (variance <= 1) deliveryStatus = 'on_time';
    else if (variance <= 5) deliveryStatus = 'late_minor';
    else deliveryStatus = 'late_major';

    // Record performance
    const { error: insertError } = await supabase
      .from('po_delivery_performance')
      .insert({
        po_id: poId,
        vendor_id: po.vendor_id,
        order_date: po.order_date,
        promised_date: po.expected_date,
        expected_date: po.expected_date,
        actual_delivery_date: actualDeliveryDate,
        promised_lead_time_days: promisedLeadTime,
        actual_lead_time_days: actualLeadTimeDays,
        delivery_status: deliveryStatus,
        was_critical: wasCritical,
        caused_stockout: causedStockout,
      });

    if (insertError) {
      console.error('Failed to record PO delivery:', insertError);
      return { success: false, error: insertError.message };
    }

    // Update effective lead time (agent learning)
    const { data: effectiveLeadTime, error: updateError } = await supabase
      .rpc('update_effective_lead_time', { p_vendor_id: po.vendor_id });

    if (updateError) {
      console.error('Failed to update effective lead time:', updateError);
    }

    // Update trust score
    await updateVendorTrustScore(po.vendor_id);

    return {
      success: true,
      effective_lead_time: effectiveLeadTime || promisedLeadTime,
    };
  } catch (error: any) {
    console.error('Error recording PO delivery:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get vendor performance snapshot
 * Shows agent's learned behavior vs vendor's promises
 */
export async function getVendorPerformance(
  vendorId: string
): Promise<VendorPerformanceSnapshot | null> {
  try {
    const { data, error } = await supabase
      .from('vendor_scorecard')
      .select('*')
      .eq('id', vendorId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      vendor_id: data.id,
      vendor_name: data.name,
      promised_lead_time: data.promised_lead_time || 14,
      effective_lead_time: data.effective_lead_time_days || data.promised_lead_time || 14,
      lead_time_variance: (data.effective_lead_time_days || 14) - (data.promised_lead_time || 14),
      on_time_rate: data.on_time_rate || 0,
      quality_rate: data.quality_rate || 0,
      response_rate: data.response_rate || 0,
      trust_score: data.trust_score || 50,
      trust_trend: data.trust_score_trend || 'stable',
      recommendation: data.agent_notes || 'No performance data yet',
    };
  } catch (error) {
    console.error('Error getting vendor performance:', error);
    return null;
  }
}

/**
 * Update vendor trust score based on recent performance
 */
async function updateVendorTrustScore(vendorId: string): Promise<void> {
  try {
    const { data: trustScore } = await supabase
      .rpc('calculate_vendor_trust_score', { p_vendor_id: vendorId });

    if (!trustScore) return;

    // Get current metrics record
    const { data: currentMetrics } = await supabase
      .from('vendor_performance_metrics')
      .select('trust_score')
      .eq('vendor_id', vendorId)
      .order('period_end', { ascending: false })
      .limit(1)
      .single();

    const previousScore = currentMetrics?.trust_score || 50;
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (trustScore > previousScore + 5) trend = 'improving';
    else if (trustScore < previousScore - 5) trend = 'declining';

    // Update metrics
    await supabase
      .from('vendor_performance_metrics')
      .update({
        trust_score: trustScore,
        trust_score_trend: trend,
        last_updated: new Date().toISOString(),
      })
      .eq('vendor_id', vendorId)
      .order('period_end', { ascending: false })
      .limit(1);

    // Generate agent notes if performance is declining
    if (trend === 'declining' && trustScore < 60) {
      await supabase
        .from('vendor_performance_metrics')
        .update({
          agent_notes: `⚠️ Performance declining. Consider finding alternative suppliers. Current trust score: ${trustScore}/100.`,
          recommend_for_critical_orders: false,
        })
        .eq('vendor_id', vendorId)
        .order('period_end', { ascending: false })
        .limit(1);
    }
  } catch (error) {
    console.error('Error updating vendor trust score:', error);
  }
}

/**
 * Get vendor comparison for decision making
 * Used when multiple vendors can supply the same item
 */
export async function compareVendors(
  vendorIds: string[]
): Promise<Array<VendorPerformanceSnapshot & { rank: number }>> {
  try {
    const performances = await Promise.all(
      vendorIds.map(id => getVendorPerformance(id))
    );

    const validPerformances = performances.filter(p => p !== null) as VendorPerformanceSnapshot[];

    // Rank by composite score
    const ranked = validPerformances
      .map((p, idx) => ({
        ...p,
        composite_score:
          p.trust_score * 0.4 +
          p.on_time_rate * 0.3 +
          p.quality_rate * 0.2 +
          (100 - Math.min(p.lead_time_variance * 5, 100)) * 0.1,
      }))
      .sort((a, b) => b.composite_score - a.composite_score)
      .map((p, idx) => ({
        ...p,
        rank: idx + 1,
      }));

    return ranked;
  } catch (error) {
    console.error('Error comparing vendors:', error);
    return [];
  }
}

/**
 * Get vendor recommendation for specific context
 */
export async function getVendorRecommendation(
  vendorIds: string[],
  context: {
    isCritical?: boolean;
    needsFast?: boolean;
    needsQuality?: boolean;
  }
): Promise<{
  recommended_vendor_id: string;
  reasoning: string;
  alternatives: string[];
}> {
  const comparison = await compareVendors(vendorIds);

  if (comparison.length === 0) {
    return {
      recommended_vendor_id: vendorIds[0] || '',
      reasoning: 'No performance data available',
      alternatives: [],
    };
  }

  let recommended = comparison[0];
  let reasoning = '';

  if (context.isCritical) {
    // For critical orders, prioritize reliability
    recommended = comparison.sort((a, b) => b.trust_score - a.trust_score)[0];
    reasoning = `Recommended for critical order: ${recommended.vendor_name} has highest trust score (${recommended.trust_score}/100) and ${recommended.on_time_rate.toFixed(1)}% on-time rate.`;
  } else if (context.needsFast) {
    // For fast delivery, use effective lead time
    recommended = comparison.sort((a, b) => a.effective_lead_time - b.effective_lead_time)[0];
    reasoning = `Recommended for fast delivery: ${recommended.vendor_name} has shortest effective lead time (${recommended.effective_lead_time} days vs promised ${recommended.promised_lead_time}).`;
  } else if (context.needsQuality) {
    // For quality, prioritize quality rate
    recommended = comparison.sort((a, b) => b.quality_rate - a.quality_rate)[0];
    reasoning = `Recommended for quality: ${recommended.vendor_name} has highest quality rate (${recommended.quality_rate.toFixed(1)}%) and trust score ${recommended.trust_score}/100.`;
  } else {
    // Default: best overall
    reasoning = `Recommended: ${recommended.vendor_name} ranks #1 overall with trust score ${recommended.trust_score}/100, ${recommended.on_time_rate.toFixed(1)}% on-time, effective lead time ${recommended.effective_lead_time} days.`;
  }

  return {
    recommended_vendor_id: recommended.vendor_id,
    reasoning,
    alternatives: comparison.slice(1, 3).map(v => v.vendor_id),
  };
}

/**
 * Flag vendors needing review
 * Returns vendors with declining performance
 */
export async function getFlagged Vendors(): Promise<Array<{
  vendor_id: string;
  vendor_name: string;
  issue: string;
  severity: 'high' | 'medium' | 'low';
  recommendation: string;
}>> {
  try {
    const { data: scorecards, error } = await supabase
      .from('vendor_scorecard')
      .select('*')
      .or('trust_score.lt.60,trust_score_trend.eq.declining,on_time_rate.lt.70');

    if (error || !scorecards) {
      return [];
    }

    return scorecards.map(sc => {
      let severity: 'high' | 'medium' | 'low' = 'low';
      let issue = '';
      let recommendation = '';

      if (sc.trust_score < 40) {
        severity = 'high';
        issue = `Trust score critically low (${sc.trust_score}/100)`;
        recommendation = 'Find alternative supplier immediately';
      } else if (sc.on_time_rate < 60) {
        severity = 'high';
        issue = `Poor on-time rate (${sc.on_time_rate.toFixed(1)}%)`;
        recommendation = 'Schedule performance review meeting';
      } else if (sc.trust_score_trend === 'declining') {
        severity = 'medium';
        issue = 'Performance declining';
        recommendation = 'Monitor closely and prepare backup options';
      } else if (sc.effective_lead_time_days > sc.promised_lead_time * 1.5) {
        severity = 'medium';
        issue = `Actual lead time (${sc.effective_lead_time_days}d) >> promised (${sc.promised_lead_time}d)`;
        recommendation = 'Renegotiate lead time expectations';
      } else {
        severity = 'low';
        issue = 'Minor performance concerns';
        recommendation = 'Continue monitoring';
      }

      return {
        vendor_id: sc.id,
        vendor_name: sc.name,
        issue,
        severity,
        recommendation,
      };
    });
  } catch (error) {
    console.error('Error getting flagged vendors:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 Export
// ═══════════════════════════════════════════════════════════════════════════

export default {
  recordPODelivery,
  getVendorPerformance,
  compareVendors,
  getVendorRecommendation,
  getFlaggedVendors,
};
