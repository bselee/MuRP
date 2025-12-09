/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📊 TRUST SCORE AGENT - Measure Autonomous System Performance
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tracks the Agent's performance toward "No Human Intervention" goal.
 *
 * Key Metrics:
 * 1. Stockout Prevention: Did agent order before run-out date? (Target: 100%)
 * 2. Touchless POs: % of POs sent without human editing (Target: >95%)
 * 3. ETA Accuracy: How close was predicted arrival to actual? (Target: ±1 day)
 * 4. Capital Efficiency: Preventing over-buying (Target: Steady/Decreasing DSI)
 *
 * @module services/trustScoreAgent
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Types
// ═══════════════════════════════════════════════════════════════════════════

export interface TrustScoreReport {
  period: string;
  overall_trust_score: number;
  metrics: {
    stockout_prevention_rate: number;
    touchless_po_rate: number;
    eta_accuracy_rate: number;
    capital_efficiency_score: number;
  };
  progress_toward_autonomy: number; // 0-100%
  recommendations: string[];
}

export interface DailyPerformance {
  date: string;
  stockouts_prevented: number;
  actual_stockouts: number;
  ai_pos_created: number;
  human_edited_pos: number;
  deliveries_on_time: number;
  total_deliveries: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 Core Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record daily agent performance
 * Called by nightly cron job
 */
export async function recordDailyPerformance(): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Calculate stockout prevention
    const { data: stockoutData } = await supabase
      .from('reorder_queue')
      .select('status, urgency')
      .eq('status', 'resolved')
      .gte('identified_at', today)
      .lt('identified_at', new Date(Date.now() + 86400000).toISOString());

    const predictedStockouts = stockoutData?.filter(r => r.urgency === 'critical').length || 0;

    const { data: actualStockouts } = await supabase
      .from('inventory_items')
      .select('sku')
      .eq('stock', 0)
      .gte('record_last_updated', today);

    const actualStockoutCount = actualStockouts?.length || 0;

    // 2. Calculate touchless PO rate
    const { data: posToday } = await supabase
      .from('purchase_orders')
      .select('auto_generated, ai_confidence_score, updated_by')
      .gte('record_created', today);

    const aiPOs = posToday?.filter(po => po.auto_generated).length || 0;
    const editedPOs = posToday?.filter(po => po.auto_generated && po.updated_by).length || 0;

    // 3. Calculate ETA accuracy
    const { data: deliveriesToday } = await supabase
      .from('po_delivery_performance')
      .select('actual_delivery_date, expected_date')
      .eq('actual_delivery_date', today);

    const deliveriesWithin1Day = deliveriesToday?.filter(d => {
      const expected = new Date(d.expected_date);
      const actual = new Date(d.actual_delivery_date);
      const diff = Math.abs(actual.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 1;
    }).length || 0;

    const totalDeliveries = deliveriesToday?.length || 0;

    // 4. Calculate capital efficiency (Days Sales of Inventory)
    const { data: inventoryValue } = await supabase
      .from('inventory_items')
      .select('stock, unit_cost, sales_last_30_days');

    const totalValue = inventoryValue?.reduce((sum, item) =>
      sum + (item.stock * item.unit_cost), 0) || 0;

    const totalSales30d = inventoryValue?.reduce((sum, item) =>
      sum + (item.sales_last_30_days || 0), 0) || 1;

    const daysInventory = totalValue / (totalSales30d / 30);

    // Record performance
    await supabase.from('agent_performance_log').insert({
      period_date: today,
      total_skus_monitored: inventoryValue?.length || 0,
      predicted_stockouts: predictedStockouts,
      actual_stockouts: actualStockoutCount,
      stockouts_prevented: Math.max(0, predictedStockouts - actualStockoutCount),
      total_pos_created: posToday?.length || 0,
      ai_generated_pos: aiPOs,
      human_edited_pos: editedPOs,
      total_deliveries: totalDeliveries,
      deliveries_within_1day: deliveriesWithin1Day,
      total_inventory_value_usd: totalValue,
      days_sales_of_inventory: daysInventory,
      overall_trust_score: calculateOverallTrustScore({
        stockout_prevention_rate: predictedStockouts > 0
          ? ((predictedStockouts - actualStockoutCount) / predictedStockouts) * 100
          : 100,
        touchless_po_rate: aiPOs > 0 ? ((aiPOs - editedPOs) / aiPOs) * 100 : 0,
        eta_accuracy_rate: totalDeliveries > 0 ? (deliveriesWithin1Day / totalDeliveries) * 100 : 0,
        capital_efficiency: daysInventory < 30 ? 100 : Math.max(0, 100 - (daysInventory - 30)),
      }),
    });
  } catch (error) {
    console.error('Error recording daily performance:', error);
  }
}

/**
 * Get trust score report for date range
 */
export async function getTrustScoreReport(
  startDate: string,
  endDate: string
): Promise<TrustScoreReport | null> {
  try {
    const { data: performance, error } = await supabase
      .from('agent_performance_log')
      .select('*')
      .gte('period_date', startDate)
      .lte('period_date', endDate)
      .order('period_date', { ascending: false });

    if (error || !performance || performance.length === 0) {
      return null;
    }

    // Calculate averages
    const avgStockoutPrevention =
      performance.reduce((sum, p) => sum + (p.stockout_prevention_rate || 0), 0) / performance.length;
    const avgTouchlessPO =
      performance.reduce((sum, p) => sum + (p.touchless_po_rate || 0), 0) / performance.length;
    const avgETAAccuracy =
      performance.reduce((sum, p) => sum + (p.eta_accuracy_rate || 0), 0) / performance.length;

    // Calculate capital efficiency score (lower DSI is better)
    const avgDSI = performance.reduce((sum, p) => sum + (p.days_sales_of_inventory || 30), 0) / performance.length;
    const capitalEfficiencyScore = Math.max(0, 100 - (avgDSI - 20) * 2); // Optimal is 20-30 days

    const overallScore = calculateOverallTrustScore({
      stockout_prevention_rate: avgStockoutPrevention,
      touchless_po_rate: avgTouchlessPO,
      eta_accuracy_rate: avgETAAccuracy,
      capital_efficiency: capitalEfficiencyScore,
    });

    const recommendations = generateRecommendations({
      stockout_prevention_rate: avgStockoutPrevention,
      touchless_po_rate: avgTouchlessPO,
      eta_accuracy_rate: avgETAAccuracy,
      capital_efficiency: capitalEfficiencyScore,
    });

    return {
      period: `${startDate} to ${endDate}`,
      overall_trust_score: overallScore,
      metrics: {
        stockout_prevention_rate: avgStockoutPrevention,
        touchless_po_rate: avgTouchlessPO,
        eta_accuracy_rate: avgETAAccuracy,
        capital_efficiency_score: capitalEfficiencyScore,
      },
      progress_toward_autonomy: calculateAutonomyProgress({
        stockout_prevention_rate: avgStockoutPrevention,
        touchless_po_rate: avgTouchlessPO,
        eta_accuracy_rate: avgETAAccuracy,
      }),
      recommendations,
    };
  } catch (error) {
    console.error('Error getting trust score report:', error);
    return null;
  }
}

/**
 * Get today's trust score snapshot
 */
export async function getTodaysTrustScore(): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const report = await getTrustScoreReport(today, today);
  return report?.overall_trust_score || 50;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate overall trust score (0-100)
 */
function calculateOverallTrustScore(metrics: {
  stockout_prevention_rate: number;
  touchless_po_rate: number;
  eta_accuracy_rate: number;
  capital_efficiency: number;
}): number {
  const weights = {
    stockout_prevention: 0.40, // 40% - Most important
    touchless_po: 0.30,         // 30% - Autonomy indicator
    eta_accuracy: 0.20,         // 20% - Planning accuracy
    capital_efficiency: 0.10,   // 10% - Financial responsibility
  };

  const score =
    metrics.stockout_prevention_rate * weights.stockout_prevention +
    metrics.touchless_po_rate * weights.touchless_po +
    metrics.eta_accuracy_rate * weights.eta_accuracy +
    metrics.capital_efficiency * weights.capital_efficiency;

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Calculate progress toward full autonomy (0-100%)
 */
function calculateAutonomyProgress(metrics: {
  stockout_prevention_rate: number;
  touchless_po_rate: number;
  eta_accuracy_rate: number;
}): number {
  // Autonomy targets
  const targets = {
    stockout_prevention: 100,
    touchless_po: 95,
    eta_accuracy: 90,
  };

  const progress = (
    (Math.min(metrics.stockout_prevention_rate, targets.stockout_prevention) / targets.stockout_prevention) * 33.3 +
    (Math.min(metrics.touchless_po_rate, targets.touchless_po) / targets.touchless_po) * 33.3 +
    (Math.min(metrics.eta_accuracy_rate, targets.eta_accuracy) / targets.eta_accuracy) * 33.3
  );

  return Math.round(progress);
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(metrics: {
  stockout_prevention_rate: number;
  touchless_po_rate: number;
  eta_accuracy_rate: number;
  capital_efficiency: number;
}): string[] {
  const recommendations: string[] = [];

  if (metrics.stockout_prevention_rate < 95) {
    recommendations.push(
      `🎯 Stockout Prevention: ${metrics.stockout_prevention_rate.toFixed(1)}% - Review reorder points and lead times`
    );
  }

  if (metrics.touchless_po_rate < 90) {
    recommendations.push(
      `🤖 Touchless POs: ${metrics.touchless_po_rate.toFixed(1)}% - Identify why humans are editing AI-generated POs`
    );
  }

  if (metrics.eta_accuracy_rate < 85) {
    recommendations.push(
      `📅 ETA Accuracy: ${metrics.eta_accuracy_rate.toFixed(1)}% - Vendor lead times need adjustment`
    );
  }

  if (metrics.capital_efficiency < 70) {
    recommendations.push(
      `💰 Capital Efficiency: Consider reducing safety stock levels`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ All metrics are performing well! System is highly autonomous.');
  }

  return recommendations;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 Export
// ═══════════════════════════════════════════════════════════════════════════

export default {
  recordDailyPerformance,
  getTrustScoreReport,
  getTodaysTrustScore,
};
