/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📦 INVENTORY GUARDIAN AGENT - Proactive Stock Level Management
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This agent monitors stock levels and predicts shortages before they occur.
 *
 * Key Behaviors:
 * 1. Monitors all SKU stock levels against reorder points
 * 2. Predicts shortages based on consumption velocity
 * 3. Triggers reorder alerts before stockouts occur
 * 4. Adjusts reorder points based on demand patterns
 *
 * Example:
 * - SKU BOTTLE-16OZ has 500 units, consumes 50/day
 * - Agent calculates 10 days of stock remaining
 * - Lead time is 14 days
 * - Agent flags CRITICAL: "Order now or stockout in 10 days"
 *
 * @module services/inventoryGuardianAgent
 */

import { supabase } from '../lib/supabase/client';
import {
  getItemClassification,
  shouldIncludeInStockIntel,
  shouldTriggerReorderAlerts,
  logAgentAction,
  getCriticalRules,
  type ItemClassificationContext,
} from './classificationContextService';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Types
// ═══════════════════════════════════════════════════════════════════════════

export interface InventoryGuardianConfig {
  reorder_threshold: number; // Multiplier for safety stock (e.g., 0.2 = 20% buffer)
  check_interval: number; // Seconds between checks
  critical_days_threshold: number; // Days of stock considered critical
  alert_on_velocity_change: boolean; // Alert if consumption spikes
  velocity_change_threshold: number; // % change to trigger alert
}

export interface StockLevelAlert {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  sku: string;
  product_name: string;
  current_stock: number;
  reorder_point: number;
  days_of_stock: number;
  daily_consumption: number;
  lead_time_days: number;
  message: string;
  recommended_action: string;
  recommended_order_qty: number;
  estimated_cost: number;
  order_by_date: Date | null;
}

export interface StockHealthSummary {
  total_skus: number;
  healthy_skus: number;
  warning_skus: number;
  critical_skus: number;
  out_of_stock_skus: number;
  total_inventory_value: number;
  at_risk_value: number;
  alerts: StockLevelAlert[];
}

export interface VelocityAnalysis {
  sku: string;
  product_name: string;
  avg_daily_30d: number;
  avg_daily_7d: number;
  velocity_change_pct: number;
  trend: 'ACCELERATING' | 'STABLE' | 'DECELERATING';
  alert_reason: string | null;
}

const DEFAULT_CONFIG: InventoryGuardianConfig = {
  reorder_threshold: 0.2,
  check_interval: 3600,
  critical_days_threshold: 7,
  alert_on_velocity_change: true,
  velocity_change_threshold: 50,
};

// ═══════════════════════════════════════════════════════════════════════════
// 📊 Core Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run full inventory health check
 * Returns summary with all alerts
 */
export async function runInventoryHealthCheck(
  config: Partial<InventoryGuardianConfig> = {}
): Promise<StockHealthSummary> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const alerts: StockLevelAlert[] = [];

  try {
    // Get all items visible in Stock Intelligence (respects classification rules)
    // Uses stock_intelligence_items view which pre-filters:
    // - Dropship items (excluded)
    // - Consignment items (excluded)
    // - Made-to-order items (excluded)
    // - Discontinued items (excluded)
    // - Manually excluded items (excluded)
    // - Items with stock_intel_override that are included
    const { data: inventory, error } = await supabase
      .from('stock_intelligence_items')  // USE VIEW - respects all classification rules
      .select(`
        id,
        sku,
        product_name,
        name,
        available_quantity,
        quantity_on_hand,
        reorder_point,
        max_stock_level,
        unit_cost,
        cost,
        avg_daily_consumption,
        lead_time_days,
        item_flow_type,
        stock_intel_exclude,
        is_dropship
      `)
      .order('available_quantity', { ascending: true });

    if (error) {
      // Fallback: If view doesn't exist yet, use old query with basic filters
      console.warn('[InventoryGuardian] stock_intelligence_items view not available, using fallback');
      const { data: fallbackInventory, error: fallbackError } = await supabase
        .from('inventory_items')
        .select(`
          id, sku, product_name, name, available_quantity, quantity_on_hand,
          reorder_point, max_stock_level, unit_cost, cost, avg_daily_consumption, lead_time_days
        `)
        .eq('is_active', true)
        .or('is_dropship.is.null,is_dropship.eq.false')
        .or('item_flow_type.is.null,item_flow_type.eq.standard')
        .or('stock_intel_exclude.is.null,stock_intel_exclude.eq.false');

      if (fallbackError) throw fallbackError;
      if (!fallbackInventory) return getEmptySummary();

      // Process fallback inventory
      return processInventoryForHealthCheck(fallbackInventory, cfg);
    }

    if (!inventory) return getEmptySummary();

    // Log agent action for SOP tracking
    await logAgentAction(
      'inventory-guardian',
      null,
      'health_check_started',
      'Only processing items visible in Stock Intelligence',
      null,
      { items_to_process: inventory.length }
    );

    return processInventoryForHealthCheck(inventory, cfg);
  } catch (error) {
    console.error('[InventoryGuardian] Health check failed:', error);
    return getEmptySummary();
  }
}

/**
 * Analyze consumption velocity changes
 * Detects sudden spikes or drops in demand
 */
export async function analyzeVelocityChanges(
  config: Partial<InventoryGuardianConfig> = {}
): Promise<VelocityAnalysis[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const analyses: VelocityAnalysis[] = [];

  try {
    // Get consumption data for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get ACTIVE inventory items only
    const { data: inventory } = await supabase
      .from('inventory_items')
      .select('sku, product_name, name')
      .eq('is_active', true);  // CRITICAL: Only fetch active items

    if (!inventory) return [];

    // Get consumption logs
    const { data: consumptionLogs } = await supabase
      .from('sku_consumption_log')
      .select('sku, quantity_consumed, consumed_at')
      .gte('consumed_at', thirtyDaysAgo.toISOString());

    if (!consumptionLogs) return [];

    // Calculate velocity per SKU
    const skuMap = new Map<string, { total30d: number; total7d: number }>();

    for (const log of consumptionLogs) {
      const existing = skuMap.get(log.sku) || { total30d: 0, total7d: 0 };
      existing.total30d += log.quantity_consumed || 0;
      
      if (new Date(log.consumed_at) >= sevenDaysAgo) {
        existing.total7d += log.quantity_consumed || 0;
      }
      
      skuMap.set(log.sku, existing);
    }

    // Analyze each SKU
    for (const item of inventory) {
      const consumption = skuMap.get(item.sku);
      if (!consumption) continue;

      const avg30d = consumption.total30d / 30;
      const avg7d = consumption.total7d / 7;
      
      if (avg30d === 0) continue; // Skip items with no historical consumption

      const changePct = ((avg7d - avg30d) / avg30d) * 100;
      
      let trend: 'ACCELERATING' | 'STABLE' | 'DECELERATING';
      let alertReason: string | null = null;

      if (changePct > cfg.velocity_change_threshold) {
        trend = 'ACCELERATING';
        alertReason = `Consumption up ${changePct.toFixed(0)}% - may stockout sooner than expected`;
      } else if (changePct < -cfg.velocity_change_threshold) {
        trend = 'DECELERATING';
        alertReason = `Consumption down ${Math.abs(changePct).toFixed(0)}% - consider reducing order quantity`;
      } else {
        trend = 'STABLE';
      }

      analyses.push({
        sku: item.sku,
        product_name: item.product_name || item.name || item.sku,
        avg_daily_30d: avg30d,
        avg_daily_7d: avg7d,
        velocity_change_pct: changePct,
        trend,
        alert_reason: alertReason,
      });
    }

    return analyses.filter(a => a.alert_reason !== null);
  } catch (error) {
    console.error('[InventoryGuardian] Velocity analysis failed:', error);
    return [];
  }
}

/**
 * Get recommended reorder points based on actual consumption
 */
export async function getReorderPointRecommendations(): Promise<Array<{
  sku: string;
  product_name: string;
  current_reorder_point: number;
  recommended_reorder_point: number;
  reason: string;
}>> {
  const recommendations: Array<{
    sku: string;
    product_name: string;
    current_reorder_point: number;
    recommended_reorder_point: number;
    reason: string;
  }> = [];

  try {
    // Get ACTIVE inventory items only
    const { data: inventory } = await supabase
      .from('inventory_items')
      .select(`
        sku,
        product_name,
        name,
        reorder_point,
        avg_daily_consumption,
        lead_time_days
      `)
      .eq('is_active', true);  // CRITICAL: Only fetch active items

    if (!inventory) return [];

    for (const item of inventory) {
      const dailyConsumption = item.avg_daily_consumption || 0;
      const leadTime = item.lead_time_days || 14;
      const currentROP = item.reorder_point || 0;
      
      if (dailyConsumption === 0) continue;

      // Recommended ROP = (Daily Consumption × Lead Time) × Safety Factor (1.2)
      const recommendedROP = Math.ceil(dailyConsumption * leadTime * 1.2);
      
      const difference = Math.abs(recommendedROP - currentROP);
      const diffPct = currentROP > 0 ? (difference / currentROP) * 100 : 100;

      // Only recommend if difference is significant (>20%)
      if (diffPct > 20) {
        recommendations.push({
          sku: item.sku,
          product_name: item.product_name || item.name || item.sku,
          current_reorder_point: currentROP,
          recommended_reorder_point: recommendedROP,
          reason: recommendedROP > currentROP
            ? `Current ROP too low - risk of stockout (${Math.round(diffPct)}% adjustment)`
            : `Current ROP may be excessive - optimize working capital (${Math.round(diffPct)}% reduction)`,
        });
      }
    }

    return recommendations;
  } catch (error) {
    console.error('[InventoryGuardian] Reorder point recommendations failed:', error);
    return [];
  }
}

/**
 * Main agent run function - called by UI and scheduler
 */
export async function runInventoryGuardianAgent(
  config: Partial<InventoryGuardianConfig> = {}
): Promise<{
  success: boolean;
  summary: StockHealthSummary;
  velocity_alerts: VelocityAnalysis[];
  reorder_recommendations: Array<{ sku: string; product_name: string; current_reorder_point: number; recommended_reorder_point: number; reason: string }>;
  output: string[];
}> {
  const output: string[] = [];
  output.push(`[${new Date().toISOString()}] Inventory Guardian starting health check...`);

  const summary = await runInventoryHealthCheck(config);
  output.push(`✓ Scanned ${summary.total_skus} SKUs`);
  output.push(`  - Healthy: ${summary.healthy_skus}`);
  output.push(`  - Warning: ${summary.warning_skus}`);
  output.push(`  - Critical: ${summary.critical_skus}`);
  output.push(`  - Out of Stock: ${summary.out_of_stock_skus}`);

  const velocityAlerts = await analyzeVelocityChanges(config);
  if (velocityAlerts.length > 0) {
    output.push(`⚠ ${velocityAlerts.length} SKUs with velocity changes detected`);
  }

  const recommendations = await getReorderPointRecommendations();
  if (recommendations.length > 0) {
    output.push(`📊 ${recommendations.length} reorder point adjustments recommended`);
  }

  output.push(`[${new Date().toISOString()}] Inventory Guardian complete`);

  return {
    success: true,
    summary,
    velocity_alerts: velocityAlerts,
    reorder_recommendations: recommendations,
    output,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process inventory items and generate health summary with alerts
 * Extracted to avoid code duplication between view and fallback queries
 */
function processInventoryForHealthCheck(
  inventory: any[],
  cfg: InventoryGuardianConfig
): StockHealthSummary {
  const alerts: StockLevelAlert[] = [];
  let healthyCount = 0;
  let warningCount = 0;
  let criticalCount = 0;
  let outOfStockCount = 0;
  let totalValue = 0;
  let atRiskValue = 0;

  for (const item of inventory) {
    const stock = item.available_quantity || item.quantity_on_hand || 0;
    const reorderPoint = item.reorder_point || 0;
    const dailyConsumption = item.avg_daily_consumption || 0;
    const leadTime = item.lead_time_days || 14;
    const unitCost = item.unit_cost || item.cost || 0;
    const productName = item.product_name || item.name || item.sku;

    // Calculate days of stock
    const daysOfStock = dailyConsumption > 0
      ? Math.floor(stock / dailyConsumption)
      : (stock > 0 ? 999 : 0);

    // Calculate item value
    const itemValue = stock * unitCost;
    totalValue += itemValue;

    // Determine status
    if (stock === 0) {
      outOfStockCount++;
      atRiskValue += (reorderPoint * unitCost); // Value needed to reach reorder point

      alerts.push({
        severity: 'CRITICAL',
        sku: item.sku,
        product_name: productName,
        current_stock: stock,
        reorder_point: reorderPoint,
        days_of_stock: 0,
        daily_consumption: dailyConsumption,
        lead_time_days: leadTime,
        message: `OUT OF STOCK: ${productName} (${item.sku})`,
        recommended_action: 'Place emergency order immediately',
        recommended_order_qty: calculateOrderQty(reorderPoint, dailyConsumption, leadTime, cfg.reorder_threshold),
        estimated_cost: calculateOrderQty(reorderPoint, dailyConsumption, leadTime, cfg.reorder_threshold) * unitCost,
        order_by_date: new Date(), // Order NOW
      });
    } else if (daysOfStock <= cfg.critical_days_threshold || stock <= reorderPoint) {
      criticalCount++;
      atRiskValue += itemValue;

      const orderByDate = new Date();
      orderByDate.setDate(orderByDate.getDate() + Math.max(0, daysOfStock - leadTime));

      alerts.push({
        severity: 'CRITICAL',
        sku: item.sku,
        product_name: productName,
        current_stock: stock,
        reorder_point: reorderPoint,
        days_of_stock: daysOfStock,
        daily_consumption: dailyConsumption,
        lead_time_days: leadTime,
        message: `CRITICAL: ${productName} has only ${daysOfStock} days of stock (${stock} units)`,
        recommended_action: daysOfStock < leadTime
          ? 'Place emergency order - will stockout before delivery'
          : 'Order now to prevent stockout',
        recommended_order_qty: calculateOrderQty(reorderPoint, dailyConsumption, leadTime, cfg.reorder_threshold),
        estimated_cost: calculateOrderQty(reorderPoint, dailyConsumption, leadTime, cfg.reorder_threshold) * unitCost,
        order_by_date: orderByDate,
      });
    } else if (daysOfStock <= leadTime * 1.5) {
      warningCount++;

      const orderByDate = new Date();
      orderByDate.setDate(orderByDate.getDate() + Math.max(0, daysOfStock - leadTime));

      alerts.push({
        severity: 'WARNING',
        sku: item.sku,
        product_name: productName,
        current_stock: stock,
        reorder_point: reorderPoint,
        days_of_stock: daysOfStock,
        daily_consumption: dailyConsumption,
        lead_time_days: leadTime,
        message: `WARNING: ${productName} approaching reorder point (${daysOfStock} days remaining)`,
        recommended_action: 'Plan reorder within the week',
        recommended_order_qty: calculateOrderQty(reorderPoint, dailyConsumption, leadTime, cfg.reorder_threshold),
        estimated_cost: calculateOrderQty(reorderPoint, dailyConsumption, leadTime, cfg.reorder_threshold) * unitCost,
        order_by_date: orderByDate,
      });
    } else {
      healthyCount++;
    }
  }

  return {
    total_skus: inventory.length,
    healthy_skus: healthyCount,
    warning_skus: warningCount,
    critical_skus: criticalCount,
    out_of_stock_skus: outOfStockCount,
    total_inventory_value: totalValue,
    at_risk_value: atRiskValue,
    alerts: alerts.sort((a, b) => {
      const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    }),
  };
}

function calculateOrderQty(
  reorderPoint: number,
  dailyConsumption: number,
  leadTime: number,
  safetyBuffer: number
): number {
  // Order enough to cover lead time + safety buffer to max stock level
  const demandDuringLeadTime = dailyConsumption * leadTime;
  const safetyStock = demandDuringLeadTime * safetyBuffer;
  const targetStock = reorderPoint + demandDuringLeadTime + safetyStock;
  return Math.ceil(targetStock);
}

function getEmptySummary(): StockHealthSummary {
  return {
    total_skus: 0,
    healthy_skus: 0,
    warning_skus: 0,
    critical_skus: 0,
    out_of_stock_skus: 0,
    total_inventory_value: 0,
    at_risk_value: 0,
    alerts: [],
  };
}

export default {
  runInventoryHealthCheck,
  analyzeVelocityChanges,
  getReorderPointRecommendations,
  runInventoryGuardianAgent,
};
