/**
 * Stockout Prevention Agent
 * AI-driven proactive monitoring to prevent stockouts and production blocking
 *
 * Key Responsibilities:
 * - Monitor critical stock levels across all SKUs
 * - Identify BOM-blocking scenarios (missing components for builds)
 * - Track lead time variances and adjust reorder points dynamically
 * - Predict stockouts based on consumption velocity changes
 * - Generate proactive purchase recommendations
 * - Alert on vendor performance issues affecting supply
 *
 * IMPORTANT: This agent respects item classification context.
 * - Dropship items: NOT processed (have separate vendor workflow)
 * - Consignment items: NOT processed (vendor manages stock)
 * - Made-to-order items: NOT processed (no inventory to reorder)
 * - Discontinued items: NOT processed (no reorders)
 * - Standard items: PROCESSED (normal reorder alerts)
 * - Special order items: Processed only if shouldTriggerReorderAlerts is true
 */

import { supabase } from '@/lib/supabase/client';
import {
  getReorderAnalytics,
  getProductReorderAnalytics,
  calculateOptimalOrderQuantity
} from './reorderIntelligenceService';

export interface StockoutAlert {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  sku: string;
  product_name: string;
  issue_type: 'OUT_OF_STOCK' | 'IMMINENT_STOCKOUT' | 'BOM_BLOCKING' | 'LEAD_TIME_VARIANCE' | 'CONSUMPTION_SPIKE';
  message: string;
  current_stock: number;
  days_until_stockout: number;
  recommended_action: string;
  recommended_order_qty: number;
  estimated_cost: number;
  blocking_builds?: string[]; // Build orders that will be blocked
  consumption_change_pct?: number; // % change in consumption rate
  lead_time_variance_days?: number; // Days longer than expected
}

export interface BOMBlockingAnalysis {
  build_order_id: string;
  build_order_name: string;
  target_quantity: number;
  blocked: boolean;
  missing_components: {
    sku: string;
    product_name: string;
    required_qty: number;
    available_qty: number;
    shortage_qty: number;
    days_until_available: number | null;
  }[];
  estimated_delay_days: number;
}

export interface LeadTimeIntelligence {
  sku: string;
  product_name: string;
  vendor_name: string;
  historical_avg_days: number;
  recent_avg_days: number; // Last 3 orders
  variance_pct: number;
  trend: 'IMPROVING' | 'STABLE' | 'DEGRADING';
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendation: string;
}

export interface PurchaseRecommendation {
  sku: string;
  product_name: string;
  reason: string;
  urgency: 'IMMEDIATE' | 'THIS_WEEK' | 'THIS_MONTH';
  recommended_qty: number;
  estimated_cost: number;
  preferred_vendor: string;
  expected_lead_time_days: number;
  order_by_date: Date; // Latest date to place order
  notes: string[];
}

/**
 * Get all critical stockout alerts requiring immediate attention
 */
export async function getCriticalStockoutAlerts(): Promise<StockoutAlert[]> {
  const alerts: StockoutAlert[] = [];

  // Get all products with reorder status indicating issues
  const criticalProducts = await getReorderAnalytics(['OUT_OF_STOCK', 'CRITICAL', 'REORDER_NOW']);

  for (const product of criticalProducts) {
    const alert: StockoutAlert = {
      severity: product.reorder_status === 'OUT_OF_STOCK' ? 'CRITICAL' :
                product.reorder_status === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
      sku: product.sku,
      product_name: product.product_name,
      issue_type: product.reorder_status === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK' : 'IMMINENT_STOCKOUT',
      message: generateAlertMessage(product),
      current_stock: product.available_quantity,
      days_until_stockout: product.days_of_stock_remaining,
      recommended_action: generateRecommendedAction(product),
      recommended_order_qty: Math.ceil(calculateOptimalOrderQuantity(product)),
      estimated_cost: Math.ceil(calculateOptimalOrderQuantity(product)) * product.avg_unit_cost,
    };
    alerts.push(alert);
  }

  // Check for consumption spikes
  const consumptionSpikes = await detectConsumptionSpikes();
  alerts.push(...consumptionSpikes);

  // Check for lead time variances
  const leadTimeAlerts = await detectLeadTimeVariances();
  alerts.push(...leadTimeAlerts);

  return alerts.sort((a, b) => {
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return a.days_until_stockout - b.days_until_stockout;
  });
}

/**
 * Analyze which build orders are blocked by missing components
 */
export async function analyzeBOMBlocking(): Promise<BOMBlockingAnalysis[]> {
  const analyses: BOMBlockingAnalysis[] = [];

  // Get active/pending build orders
  const { data: buildOrders } = await supabase
    .from('build_orders')
    .select('id, name, target_quantity, status, bom_id')
    .in('status', ['pending', 'in_progress', 'approved'])
    .order('created_at', { ascending: false });

  if (!buildOrders) return [];

  for (const build of buildOrders) {
    // Get BOM components
    const { data: bomComponents } = await supabase
      .from('bom_components')
      .select('sku, quantity, inventory_items(name, units_available)')
      .eq('bom_id', build.bom_id);

    if (!bomComponents) continue;

    const missing_components = [];
    let blocked = false;

    for (const component of bomComponents) {
      const required = component.quantity * build.target_quantity;
      const available = component.inventory_items?.units_available || 0;

      if (available < required) {
        blocked = true;
        
        // Check when this component might be available
        const analytics = await getProductReorderAnalytics(component.sku);
        const daysUntilAvailable = analytics ? 
          (analytics.avg_lead_time_days + 2) : // Lead time + 2 day buffer
          null;

        missing_components.push({
          sku: component.sku,
          product_name: component.inventory_items?.name || 'Unknown',
          required_qty: required,
          available_qty: available,
          shortage_qty: required - available,
          days_until_available: daysUntilAvailable,
        });
      }
    }

    if (blocked) {
      const maxDelay = Math.max(...missing_components.map(c => c.days_until_available || 0));
      analyses.push({
        build_order_id: build.id,
        build_order_name: build.name,
        target_quantity: build.target_quantity,
        blocked,
        missing_components,
        estimated_delay_days: maxDelay,
      });
    }
  }

  return analyses;
}

/**
 * Analyze vendor lead time trends and variances
 */
export async function analyzeLeadTimeTrends(): Promise<LeadTimeIntelligence[]> {
  const intelligence: LeadTimeIntelligence[] = [];

  // Get purchase log with vendor and lead times
  const { data: purchases } = await supabase
    .from('product_purchase_log')
    .select(`
      sku,
      product_name,
      vendor_name,
      lead_time_days,
      received_at
    `)
    .not('lead_time_days', 'is', null)
    .order('received_at', { ascending: false });

  if (!purchases) return [];

  // Group by SKU
  const skuGroups = purchases.reduce((acc, p) => {
    if (!acc[p.sku]) acc[p.sku] = [];
    acc[p.sku].push(p);
    return acc;
  }, {} as Record<string, typeof purchases>);

  for (const [sku, records] of Object.entries(skuGroups)) {
    if (records.length < 3) continue; // Need at least 3 data points

    const allLeadTimes = records.map(r => r.lead_time_days!);
    const recentLeadTimes = records.slice(0, 3).map(r => r.lead_time_days!);

    const historicalAvg = allLeadTimes.reduce((a, b) => a + b, 0) / allLeadTimes.length;
    const recentAvg = recentLeadTimes.reduce((a, b) => a + b, 0) / recentLeadTimes.length;
    
    const variancePct = ((recentAvg - historicalAvg) / historicalAvg) * 100;

    const trend: LeadTimeIntelligence['trend'] = 
      variancePct < -10 ? 'IMPROVING' :
      variancePct > 10 ? 'DEGRADING' :
      'STABLE';

    const riskLevel: LeadTimeIntelligence['risk_level'] = 
      variancePct > 30 ? 'HIGH' :
      variancePct > 15 ? 'MEDIUM' :
      'LOW';

    if (riskLevel !== 'LOW') {
      intelligence.push({
        sku,
        product_name: records[0].product_name,
        vendor_name: records[0].vendor_name,
        historical_avg_days: Math.round(historicalAvg),
        recent_avg_days: Math.round(recentAvg),
        variance_pct: Math.round(variancePct),
        trend,
        risk_level: riskLevel,
        recommendation: generateLeadTimeRecommendation(trend, variancePct, historicalAvg, recentAvg),
      });
    }
  }

  return intelligence.sort((a, b) => {
    const riskOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return riskOrder[a.risk_level] - riskOrder[b.risk_level];
  });
}

/**
 * Generate comprehensive purchase recommendations
 */
export async function generatePurchaseRecommendations(): Promise<PurchaseRecommendation[]> {
  const recommendations: PurchaseRecommendation[] = [];
  const products = await getReorderAnalytics(['OUT_OF_STOCK', 'CRITICAL', 'REORDER_NOW']);

  for (const product of products) {
    const urgency: PurchaseRecommendation['urgency'] =
      product.reorder_status === 'OUT_OF_STOCK' ? 'IMMEDIATE' :
      product.days_of_stock_remaining < 7 ? 'IMMEDIATE' :
      product.days_of_stock_remaining < 14 ? 'THIS_WEEK' :
      'THIS_MONTH';

    const recommendedQty = Math.ceil(calculateOptimalOrderQuantity(product));
    const daysUntilOrderNeeded = Math.max(0,
      product.days_of_stock_remaining - product.avg_lead_time_days - 2
    );
    const orderByDate = new Date();
    orderByDate.setDate(orderByDate.getDate() + daysUntilOrderNeeded);

    const notes: string[] = [];
    if (product.reorder_status === 'OUT_OF_STOCK') {
      notes.push('⚠️ CURRENTLY OUT OF STOCK - Production may be blocked');
    }
    if (product.days_of_stock_remaining < product.avg_lead_time_days) {
      notes.push('⏰ Stock will run out before typical delivery');
    }
    if (product.daily_consumption_rate > product.consumed_last_30_days / 30 * 1.5) {
      notes.push('📈 Consumption rate increasing - consider ordering extra buffer');
    }

    recommendations.push({
      sku: product.sku,
      product_name: product.product_name,
      reason: generatePurchaseReason(product),
      urgency,
      recommended_qty: recommendedQty,
      estimated_cost: recommendedQty * product.avg_unit_cost,
      preferred_vendor: product.last_vendor_name || 'TBD',
      expected_lead_time_days: Math.ceil(product.avg_lead_time_days),
      order_by_date: orderByDate,
      notes,
    });
  }

  return recommendations.sort((a, b) => {
    const urgencyOrder = { IMMEDIATE: 0, THIS_WEEK: 1, THIS_MONTH: 2 };
    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
  });
}

/**
 * Detect consumption spikes (sudden increases in usage)
 */
async function detectConsumptionSpikes(): Promise<StockoutAlert[]> {
  const alerts: StockoutAlert[] = [];

  // Get products with consumption in last 7 days
  const { data: recentConsumption } = await supabase
    .from('product_consumption_log')
    .select('sku, product_name, quantity_consumed, consumed_at')
    .gte('consumed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  if (!recentConsumption) return [];

  // Group by SKU
  const skuGroups = recentConsumption.reduce((acc, c) => {
    if (!acc[c.sku]) acc[c.sku] = [];
    acc[c.sku].push(c);
    return acc;
  }, {} as Record<string, typeof recentConsumption>);

  for (const [sku, records] of Object.entries(skuGroups)) {
    const analytics = await getProductReorderAnalytics(sku);
    if (!analytics) continue;

    const recentDailyRate = records.reduce((sum, r) => sum + r.quantity_consumed, 0) / 7;
    const historicalDailyRate = analytics.consumed_last_30_days / 30;

    if (recentDailyRate > historicalDailyRate * 1.5) { // 50% increase
      const changePct = ((recentDailyRate - historicalDailyRate) / historicalDailyRate) * 100;

      alerts.push({
        severity: changePct > 100 ? 'CRITICAL' : 'HIGH',
        sku,
        product_name: records[0].product_name,
        issue_type: 'CONSUMPTION_SPIKE',
        message: `Consumption increased by ${Math.round(changePct)}% in last 7 days`,
        current_stock: analytics.available_quantity,
        days_until_stockout: Math.floor(analytics.available_quantity / recentDailyRate),
        recommended_action: `Review cause of spike and consider expedited order`,
        recommended_order_qty: Math.ceil(recentDailyRate * 30), // 30 days at new rate
        estimated_cost: Math.ceil(recentDailyRate * 30) * analytics.avg_unit_cost,
        consumption_change_pct: changePct,
      });
    }
  }

  return alerts;
}

/**
 * Detect lead time variances that may affect reorder timing
 */
async function detectLeadTimeVariances(): Promise<StockoutAlert[]> {
  const alerts: StockoutAlert[] = [];
  const leadTimeIntel = await analyzeLeadTimeTrends();

  for (const intel of leadTimeIntel) {
    if (intel.risk_level === 'HIGH') {
      const analytics = await getProductReorderAnalytics(intel.sku);
      if (!analytics) continue;

      alerts.push({
        severity: 'MEDIUM',
        sku: intel.sku,
        product_name: intel.product_name,
        issue_type: 'LEAD_TIME_VARIANCE',
        message: `Lead time increased by ${intel.variance_pct}% recently`,
        current_stock: analytics.available_quantity,
        days_until_stockout: analytics.days_of_stock_remaining,
        recommended_action: `Consider ordering earlier or finding alternate vendor`,
        recommended_order_qty: Math.ceil(calculateOptimalOrderQuantity(analytics)),
        estimated_cost: Math.ceil(calculateOptimalOrderQuantity(analytics)) * analytics.avg_unit_cost,
        lead_time_variance_days: intel.recent_avg_days - intel.historical_avg_days,
      });
    }
  }

  return alerts;
}

// Helper functions
function generateAlertMessage(product: any): string {
  if (product.reorder_status === 'OUT_OF_STOCK') {
    return `${product.product_name} is OUT OF STOCK. Production may be blocked.`;
  }
  if (product.days_of_stock_remaining < 3) {
    return `${product.product_name} will run out in ${Math.ceil(product.days_of_stock_remaining)} days.`;
  }
  if (product.days_of_stock_remaining < 7) {
    return `${product.product_name} running low - only ${Math.ceil(product.days_of_stock_remaining)} days of stock remaining.`;
  }
  return `${product.product_name} needs reordering within ${Math.ceil(product.days_of_stock_remaining)} days.`;
}

function generateRecommendedAction(product: any): string {
  if (product.reorder_status === 'OUT_OF_STOCK') {
    return 'URGENT: Place emergency order immediately. Consider expedited shipping.';
  }
  if (product.days_of_stock_remaining < product.avg_lead_time_days) {
    return 'Place order immediately to avoid stockout during delivery window.';
  }
  return `Place order by ${new Date(Date.now() + (product.days_of_stock_remaining - product.avg_lead_time_days) * 24 * 60 * 60 * 1000).toLocaleDateString()}`;
}

function generatePurchaseReason(product: any): string {
  if (product.reorder_status === 'OUT_OF_STOCK') {
    return 'Out of stock - blocking production';
  }
  if (product.days_of_stock_remaining < 7) {
    return `Only ${Math.ceil(product.days_of_stock_remaining)} days of stock remaining`;
  }
  if (product.available_quantity <= product.suggested_reorder_point) {
    return 'Below reorder point threshold';
  }
  return 'Proactive reorder to maintain optimal stock levels';
}

function generateLeadTimeRecommendation(trend: string, variancePct: number, historical: number, recent: number): string {
  if (trend === 'DEGRADING') {
    return `Lead times increasing - now ${Math.round(recent)} days vs ${Math.round(historical)} day avg. Adjust reorder point buffer or seek alternate vendor.`;
  }
  if (trend === 'IMPROVING') {
    return `Lead times improving - now ${Math.round(recent)} days vs ${Math.round(historical)} day avg. May be able to reduce safety stock.`;
  }
  return 'Lead times stable - no action needed.';
}
