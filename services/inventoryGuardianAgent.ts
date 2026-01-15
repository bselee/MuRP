/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📦 INVENTORY GUARDIAN AGENT - Proactive Stock Level Management
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This agent monitors stock levels and predicts shortages before they occur.
 * Uses runway-based calculations to ensure proactive ordering.
 *
 * Key Concepts:
 * - RUNWAY: Days of stock on hand = stock / daily_consumption
 * - TARGET: 30 days of stock minimum (1 month buffer)
 * - LEAD TIME: Days until order arrives
 *
 * Status Levels:
 * - COOKED (0 units): Out of stock - emergency action needed
 * - CRITICAL (<14 days OR runway < lead_time): Order immediately
 * - WARNING (14-30 days): Plan order this week
 * - HEALTHY (>30 days): No action needed
 *
 * Velocity Analysis (Fine-grained):
 * - SURGING: >100% increase (7d vs 30d)
 * - ACCELERATING: 50-100% increase
 * - WARMING: 20-50% increase
 * - STABLE: -20% to +20%
 * - COOLING: 20-50% decrease
 * - SLOWING: 50-100% decrease
 * - STALLED: >100% decrease
 *
 * Item Types:
 * - PURCHASED: Standard inventory items ordered from vendors
 * - MANUFACTURED (BOM): Finished goods built from components
 *   - For BOMs: Check component availability, not just finished stock
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
import {
  getKPISummary,
  calculateInventoryKPIs,
  getPastDuePOLines,
  type KPISummary,
  type InventoryKPIs,
  type PastDuePOLine,
} from './inventoryKPIService';
import {
  analyzeSupplyChainRisks,
  formatRiskSummaryForAgent,
  type SupplyChainRiskSummary,
} from './supplyChainRiskService';
import {
  canExecuteAutonomously,
  logAutonomyCheck,
  type AutonomyCheck,
  type AutonomyCheckResult,
} from './agentAutonomyGate';
import {
  triggerAutoPOGeneration,
  type AutoPOResult,
} from './autoPOGenerationService';
import {
  sendStockoutNotification,
  sendAgentActionNotification,
} from './slackService';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Types
// ═══════════════════════════════════════════════════════════════════════════

export interface InventoryGuardianConfig {
  target_days_of_stock: number; // Target runway (default 30 days)
  critical_runway_days: number; // Runway below this is CRITICAL (default 14)
  check_interval: number; // Seconds between checks
  safety_buffer_pct: number; // Safety stock multiplier (e.g., 0.2 = 20% buffer)
}

// Fine-grained velocity trends
export type VelocityTrend =
  | 'SURGING'      // >100% increase
  | 'ACCELERATING' // 50-100% increase
  | 'WARMING'      // 20-50% increase
  | 'STABLE'       // -20% to +20%
  | 'COOLING'      // 20-50% decrease
  | 'SLOWING'      // 50-100% decrease
  | 'STALLED';     // >100% decrease (or no sales)

// Stock status levels
export type StockStatus =
  | 'COOKED'    // 0 units - out of stock
  | 'CRITICAL'  // <14 days OR runway < lead_time
  | 'WARNING'   // 14-30 days
  | 'HEALTHY';  // >30 days

// Item types for different handling
export type ItemCategory =
  | 'PURCHASED'     // Standard vendor-ordered items
  | 'MANUFACTURED'; // BOM/finished goods (need to be built)

export interface StockLevelAlert {
  severity: StockStatus;
  sku: string;
  product_name: string;
  item_category: ItemCategory;
  current_stock: number;
  reorder_point: number;
  runway_days: number; // Days of stock on hand
  target_runway: number; // Target days (30)
  daily_consumption: number;
  lead_time_days: number;
  velocity_trend: VelocityTrend;
  seasonal_factor: number; // Multiplier for seasonal adjustment
  message: string;
  recommended_action: string;
  recommended_order_qty: number;
  estimated_cost: number;
  order_by_date: Date | null;
  // BOM-specific fields
  buildable_qty?: number; // How many can be built from components
  missing_components?: Array<{ sku: string; name: string; short_qty: number }>;
}

export interface StockHealthSummary {
  total_skus: number;
  healthy_skus: number;
  warning_skus: number;
  critical_skus: number;
  cooked_skus: number; // Out of stock
  purchased_items: number;
  manufactured_items: number;
  total_inventory_value: number;
  at_risk_value: number;
  alerts: StockLevelAlert[];
  bom_alerts: StockLevelAlert[]; // Separate list for BOMs needing builds
  // Extended KPIs
  kpi_summary?: KPISummary;
  // Supply Chain Risk Analysis (PAB-based)
  supply_chain_risks?: SupplyChainRiskSummary;
}

export interface VelocityAnalysis {
  sku: string;
  product_name: string;
  avg_daily_30d: number;
  avg_daily_7d: number;
  avg_daily_90d: number; // Added for seasonal comparison
  velocity_change_pct: number;
  trend: VelocityTrend;
  seasonal_variance: number; // % difference from 90-day average
  alert_reason: string | null;
  runway_impact: string; // How velocity affects runway
}

const DEFAULT_CONFIG: InventoryGuardianConfig = {
  target_days_of_stock: 30, // 1 month buffer
  critical_runway_days: 14, // 2 weeks is critical
  check_interval: 3600,
  safety_buffer_pct: 0.2,
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 Helper Functions - Velocity & Status
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine fine-grained velocity trend from percentage change
 */
function getVelocityTrend(changePct: number): VelocityTrend {
  if (changePct > 100) return 'SURGING';
  if (changePct > 50) return 'ACCELERATING';
  if (changePct > 20) return 'WARMING';
  if (changePct >= -20) return 'STABLE';
  if (changePct >= -50) return 'COOLING';
  if (changePct >= -100) return 'SLOWING';
  return 'STALLED';
}

/**
 * Get velocity trend description for UI
 */
function getVelocityDescription(trend: VelocityTrend, changePct: number): string {
  const pct = Math.abs(changePct).toFixed(0);
  switch (trend) {
    case 'SURGING': return `Demand surging +${pct}% - runway shrinking fast`;
    case 'ACCELERATING': return `Demand accelerating +${pct}% - monitor closely`;
    case 'WARMING': return `Demand warming +${pct}% - slight uptick`;
    case 'STABLE': return 'Demand stable';
    case 'COOLING': return `Demand cooling -${pct}% - may extend runway`;
    case 'SLOWING': return `Demand slowing -${pct}% - consider reducing orders`;
    case 'STALLED': return 'Demand stalled - minimal movement';
  }
}

/**
 * Determine stock status based on runway and lead time
 */
function getStockStatus(
  stock: number,
  runwayDays: number,
  leadTimeDays: number,
  criticalThreshold: number,
  targetDays: number
): StockStatus {
  if (stock === 0) return 'COOKED';
  if (runwayDays < criticalThreshold || runwayDays < leadTimeDays) return 'CRITICAL';
  if (runwayDays < targetDays) return 'WARNING';
  return 'HEALTHY';
}

/**
 * Get status message based on stock status
 */
function getStatusMessage(
  status: StockStatus,
  productName: string,
  sku: string,
  runwayDays: number,
  leadTimeDays: number,
  itemCategory: ItemCategory
): string {
  const itemType = itemCategory === 'MANUFACTURED' ? 'BOM' : 'item';

  switch (status) {
    case 'COOKED':
      return `COOKED: ${productName} (${sku}) - Zero stock, ${itemCategory === 'MANUFACTURED' ? 'build needed' : 'order immediately'}`;
    case 'CRITICAL':
      if (runwayDays < leadTimeDays) {
        return `CRITICAL: ${productName} - ${runwayDays}d runway < ${leadTimeDays}d lead time. Will stockout before delivery.`;
      }
      return `CRITICAL: ${productName} - Only ${runwayDays} days of stock. ${itemCategory === 'MANUFACTURED' ? 'Schedule build now' : 'Order now'}.`;
    case 'WARNING':
      return `WARNING: ${productName} - ${runwayDays} days runway, below 30d target. Plan ${itemCategory === 'MANUFACTURED' ? 'build' : 'order'} this week.`;
    case 'HEALTHY':
      return `OK: ${productName} - ${runwayDays} days runway`;
  }
}

/**
 * Get recommended action based on status and item type
 */
function getRecommendedAction(
  status: StockStatus,
  itemCategory: ItemCategory,
  runwayDays: number,
  leadTimeDays: number
): string {
  if (itemCategory === 'MANUFACTURED') {
    switch (status) {
      case 'COOKED': return 'Schedule emergency build - check component availability';
      case 'CRITICAL':
        return runwayDays < leadTimeDays
          ? 'Build ASAP - will stockout during production lead time'
          : 'Schedule build this week';
      case 'WARNING': return 'Plan production run within 2 weeks';
      case 'HEALTHY': return 'No action needed - monitor velocity';
    }
  } else {
    switch (status) {
      case 'COOKED': return 'Place emergency order immediately - contact vendor';
      case 'CRITICAL':
        return runwayDays < leadTimeDays
          ? 'URGENT: Order now or stockout guaranteed. Consider expedited shipping.'
          : 'Order now to maintain 30-day buffer';
      case 'WARNING': return 'Plan order this week to maintain inventory buffer';
      case 'HEALTHY': return 'No action needed';
    }
  }
}

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
    // Uses correct column names from inventory_items schema
    const { data: inventory, error } = await supabase
      .from('inventory_items')
      .select(`
        id,
        sku,
        name,
        category,
        stock,
        on_order,
        reorder_point,
        unit_cost,
        sales_last_30_days,
        item_flow_type,
        stock_intel_exclude,
        is_dropship,
        status
      `)
      .eq('status', 'active')
      .or('is_dropship.is.null,is_dropship.eq.false')
      .or('item_flow_type.is.null,item_flow_type.eq.standard')
      .or('stock_intel_exclude.is.null,stock_intel_exclude.eq.false')
      .order('stock', { ascending: true });

    if (error) {
      console.error('[InventoryGuardian] Query failed:', error);
      throw error;
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
 * Analyze consumption velocity changes with fine-grained trends
 * Detects sudden spikes or drops in demand with seasonal context
 */
export async function analyzeVelocityChanges(
  config: Partial<InventoryGuardianConfig> = {}
): Promise<VelocityAnalysis[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const analyses: VelocityAnalysis[] = [];

  try {
    // Get consumption data for last 90 days (for seasonal comparison)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get ACTIVE inventory items with stock info
    const { data: inventory } = await supabase
      .from('inventory_items')
      .select('sku, name, stock, sales_last_30_days')
      .eq('status', 'active');

    if (!inventory) return [];

    // Get consumption logs for 90 days
    const { data: consumptionLogs } = await supabase
      .from('sku_consumption_log')
      .select('sku, quantity_consumed, consumed_at')
      .gte('consumed_at', ninetyDaysAgo.toISOString());

    if (!consumptionLogs) return [];

    // Calculate velocity per SKU across time periods
    const skuMap = new Map<string, { total90d: number; total30d: number; total7d: number }>();

    for (const log of consumptionLogs) {
      const logDate = new Date(log.consumed_at);
      const existing = skuMap.get(log.sku) || { total90d: 0, total30d: 0, total7d: 0 };

      existing.total90d += log.quantity_consumed || 0;

      if (logDate >= thirtyDaysAgo) {
        existing.total30d += log.quantity_consumed || 0;
      }

      if (logDate >= sevenDaysAgo) {
        existing.total7d += log.quantity_consumed || 0;
      }

      skuMap.set(log.sku, existing);
    }

    // Analyze each SKU with fine-grained velocity
    for (const item of inventory) {
      const consumption = skuMap.get(item.sku);
      if (!consumption) continue;

      const avg90d = consumption.total90d / 90;
      const avg30d = consumption.total30d / 30;
      const avg7d = consumption.total7d / 7;

      // Skip items with no meaningful consumption
      if (avg30d < 0.01 && avg7d < 0.01) continue;

      // Calculate velocity change (7d vs 30d)
      const changePct = avg30d > 0 ? ((avg7d - avg30d) / avg30d) * 100 : 0;

      // Calculate seasonal variance (30d vs 90d average)
      const seasonalVariance = avg90d > 0 ? ((avg30d - avg90d) / avg90d) * 100 : 0;

      // Get fine-grained trend
      const trend = getVelocityTrend(changePct);

      // Calculate runway impact
      const currentStock = item.stock || 0;
      const currentRunway = avg7d > 0 ? Math.floor(currentStock / avg7d) : 999;
      const historicalRunway = avg30d > 0 ? Math.floor(currentStock / avg30d) : 999;
      const runwayDiff = currentRunway - historicalRunway;

      // Build alert reason based on severity
      let alertReason: string | null = null;

      if (trend === 'SURGING' || trend === 'ACCELERATING') {
        alertReason = getVelocityDescription(trend, changePct);
      } else if (trend === 'SLOWING' || trend === 'STALLED') {
        alertReason = getVelocityDescription(trend, changePct);
      } else if (Math.abs(seasonalVariance) > 30) {
        alertReason = `Seasonal shift: ${seasonalVariance > 0 ? '+' : ''}${seasonalVariance.toFixed(0)}% vs 90d avg`;
      }

      // Build runway impact description
      let runwayImpact: string;
      if (runwayDiff < -14) {
        runwayImpact = `Runway shrinking fast: ${currentRunway}d (was ${historicalRunway}d at historical rate)`;
      } else if (runwayDiff > 14) {
        runwayImpact = `Runway extending: ${currentRunway}d (was ${historicalRunway}d at historical rate)`;
      } else {
        runwayImpact = `Runway stable: ~${currentRunway} days`;
      }

      analyses.push({
        sku: item.sku,
        product_name: item.name || item.sku,
        avg_daily_90d: avg90d,
        avg_daily_30d: avg30d,
        avg_daily_7d: avg7d,
        velocity_change_pct: changePct,
        trend,
        seasonal_variance: seasonalVariance,
        alert_reason: alertReason,
        runway_impact: runwayImpact,
      });
    }

    // Return all analyses, not just those with alerts (for complete picture)
    return analyses.sort((a, b) => {
      // Sort by trend severity
      const trendOrder: Record<VelocityTrend, number> = {
        'SURGING': 0, 'ACCELERATING': 1, 'WARMING': 2,
        'STABLE': 3, 'COOLING': 4, 'SLOWING': 5, 'STALLED': 6
      };
      return trendOrder[a.trend] - trendOrder[b.trend];
    });
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
        name,
        reorder_point,
        sales_last_30_days
      `)
      .eq('status', 'active');

    if (!inventory) return [];

    const DEFAULT_LEAD_TIME = 14;
    for (const item of inventory) {
      const dailyConsumption = (item.sales_last_30_days || 0) / 30;
      const currentROP = item.reorder_point || 0;

      if (dailyConsumption === 0) continue;

      // Recommended ROP = (Daily Consumption × Lead Time) × Safety Factor (1.2)
      const recommendedROP = Math.ceil(dailyConsumption * DEFAULT_LEAD_TIME * 1.2);

      const difference = Math.abs(recommendedROP - currentROP);
      const diffPct = currentROP > 0 ? (difference / currentROP) * 100 : 100;

      // Only recommend if difference is significant (>20%)
      if (diffPct > 20) {
        recommendations.push({
          sku: item.sku,
          product_name: item.name || item.sku,
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

export interface InventoryGuardianResult {
  success: boolean;
  summary: StockHealthSummary;
  velocity_alerts: VelocityAnalysis[];
  reorder_recommendations: Array<{ sku: string; product_name: string; current_reorder_point: number; recommended_reorder_point: number; reason: string }>;
  kpi_summary: KPISummary | null;
  supply_chain_risks: SupplyChainRiskSummary | null;
  auto_po_result?: AutoPOResult;
  autonomy_check?: AutonomyCheckResult;
  output: string[];
}

/**
 * Main agent run function - called by UI and scheduler
 * Returns detailed runway-based analysis with velocity trends and KPIs
 *
 * Autonomy Levels:
 * - monitor: Only observe and report (no PO creation)
 * - assist: Create PO drafts for human approval
 * - autonomous: Create and auto-approve POs within bounds
 */
export async function runInventoryGuardianAgent(
  config: Partial<InventoryGuardianConfig> = {},
  options: { enableAutoPO?: boolean; dryRun?: boolean; agentId?: string } = {}
): Promise<InventoryGuardianResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const output: string[] = [];

  output.push(`[${new Date().toISOString()}] Inventory Guardian starting health check...`);
  output.push(`  Target runway: ${cfg.target_days_of_stock} days | Critical threshold: ${cfg.critical_runway_days} days`);

  // Run health check, KPI calculations, and supply chain risk analysis in parallel
  const [summary, kpiSummary, supplyChainRisks] = await Promise.all([
    runInventoryHealthCheck(config),
    getKPISummary().catch(err => {
      console.error('[InventoryGuardian] KPI calculation failed:', err);
      return null;
    }),
    analyzeSupplyChainRisks({ horizon_days: 60, include_bom_explosion: true }).catch(err => {
      console.error('[InventoryGuardian] Supply chain risk analysis failed:', err);
      return null;
    })
  ]);

  // Attach KPI summary to health summary
  if (kpiSummary) {
    summary.kpi_summary = kpiSummary;
  }

  // Attach supply chain risks to health summary
  if (supplyChainRisks) {
    summary.supply_chain_risks = supplyChainRisks;
  }

  // Summary line
  output.push('');
  output.push(`=== INVENTORY HEALTH SUMMARY ===`);
  output.push(`Scanned: ${summary.total_skus} SKUs (${summary.purchased_items} purchased, ${summary.manufactured_items} BOMs)`);
  output.push('');

  // Status breakdown
  if (summary.cooked_skus > 0) {
    output.push(`COOKED (0 stock): ${summary.cooked_skus} items - IMMEDIATE ACTION REQUIRED`);
  }
  if (summary.critical_skus > 0) {
    output.push(`CRITICAL (<${cfg.critical_runway_days}d runway): ${summary.critical_skus} items`);
  }
  if (summary.warning_skus > 0) {
    output.push(`WARNING (${cfg.critical_runway_days}-${cfg.target_days_of_stock}d runway): ${summary.warning_skus} items`);
  }
  output.push(`HEALTHY (>${cfg.target_days_of_stock}d runway): ${summary.healthy_skus} items`);
  output.push('');

  // === KPI METRICS SECTION ===
  if (kpiSummary) {
    output.push(`=== KEY PERFORMANCE INDICATORS ===`);
    output.push('');

    // CLTR (Coverage-to-Lead-Time Ratio)
    output.push(`--- CLTR (Coverage-to-Lead-Time Ratio) ---`);
    output.push(`CRITICAL (CLTR < 0.5): ${kpiSummary.items_critical_cltr} items`);
    output.push(`AT RISK (CLTR 0.5-1.0): ${kpiSummary.items_at_risk_cltr} items`);
    output.push(`Average CLTR: ${kpiSummary.avg_cltr}`);
    if (kpiSummary.critical_cltr_items.length > 0) {
      output.push(`Top critical:`);
      kpiSummary.critical_cltr_items.slice(0, 3).forEach(item => {
        output.push(`  ${item.sku}: CLTR=${item.cltr}, ${item.runway_days}d runway, ${item.lead_time_planned}d LT`);
      });
    }
    output.push('');

    // Demand Variability (CV)
    output.push(`--- DEMAND VARIABILITY (CV) ---`);
    output.push(`High variability (CV > 1.0): ${kpiSummary.items_high_variability} items (Z class)`);
    output.push(`Medium variability (CV 0.5-1.0): ${kpiSummary.items_medium_variability} items (Y class)`);
    output.push(`Average CV: ${kpiSummary.avg_cv}`);
    output.push('');

    // Past Due PO Lines
    if (kpiSummary.total_past_due_lines > 0) {
      output.push(`--- PAST DUE PO LINES ---`);
      output.push(`Total past due: ${kpiSummary.total_past_due_lines} lines`);
      output.push(`Past due value: $${kpiSummary.past_due_value.toLocaleString()}`);
      if (kpiSummary.past_due_lines.length > 0) {
        output.push(`Most overdue:`);
        kpiSummary.past_due_lines.slice(0, 3).forEach(line => {
          output.push(`  PO ${line.po_number}: ${line.sku} - ${line.days_overdue}d late (${line.vendor_name})`);
        });
      }
      output.push('');
    }

    // Lead Time Bias
    if (kpiSummary.avg_lead_time_bias !== 0) {
      output.push(`--- LEAD TIME BIAS ---`);
      const biasDir = kpiSummary.avg_lead_time_bias > 0 ? 'late' : 'early';
      output.push(`Average bias: ${Math.abs(kpiSummary.avg_lead_time_bias)} days ${biasDir}`);
      output.push('');
    }

    // Safety Stock Attainment
    output.push(`--- SAFETY STOCK ATTAINMENT ---`);
    output.push(`Items below SS target: ${kpiSummary.safety_stock_shortfall_items}`);
    output.push(`Average SS attainment: ${kpiSummary.avg_safety_stock_attainment}%`);
    output.push('');

    // Excess Inventory
    if (kpiSummary.total_excess_value > 0) {
      output.push(`--- EXCESS INVENTORY ---`);
      output.push(`Total excess value: $${kpiSummary.total_excess_value.toLocaleString()}`);
      output.push(`(Stock above 90-day runway)`);
      output.push('');
    }

    // ABC/XYZ Classification
    output.push(`--- ABC/XYZ CLASSIFICATION ---`);
    output.push(`ABC: A=${kpiSummary.abc_distribution.A} | B=${kpiSummary.abc_distribution.B} | C=${kpiSummary.abc_distribution.C}`);
    output.push(`XYZ: X=${kpiSummary.xyz_distribution.X} | Y=${kpiSummary.xyz_distribution.Y} | Z=${kpiSummary.xyz_distribution.Z}`);
    output.push('');
  }

  // Top alerts for purchased items
  if (summary.alerts.length > 0) {
    output.push(`--- PURCHASED ITEMS NEEDING ACTION (${summary.alerts.length}) ---`);
    summary.alerts.slice(0, 5).forEach(alert => {
      const status = alert.severity === 'COOKED' ? 'COOKED' :
                    alert.severity === 'CRITICAL' ? 'CRIT' : 'WARN';
      output.push(`[${status}] ${alert.sku}: ${alert.runway_days}d runway, ${alert.current_stock} units`);
      output.push(`       → ${alert.recommended_action}`);
    });
    if (summary.alerts.length > 5) {
      output.push(`       ... and ${summary.alerts.length - 5} more`);
    }
    output.push('');
  }

  // BOM alerts (finished goods needing builds)
  if (summary.bom_alerts.length > 0) {
    output.push(`--- BOMS NEEDING BUILDS (${summary.bom_alerts.length}) ---`);
    summary.bom_alerts.slice(0, 5).forEach(alert => {
      const status = alert.severity === 'COOKED' ? 'COOKED' :
                    alert.severity === 'CRITICAL' ? 'CRIT' : 'WARN';
      output.push(`[${status}] ${alert.sku}: ${alert.runway_days}d runway, ${alert.current_stock} units`);
      output.push(`       → ${alert.recommended_action}`);
    });
    if (summary.bom_alerts.length > 5) {
      output.push(`       ... and ${summary.bom_alerts.length - 5} more BOMs`);
    }
    output.push('');
  }

  // Velocity analysis
  const velocityAlerts = await analyzeVelocityChanges(config);
  const significantVelocity = velocityAlerts.filter(v =>
    v.trend === 'SURGING' || v.trend === 'ACCELERATING' || v.trend === 'SLOWING' || v.trend === 'STALLED'
  );

  if (significantVelocity.length > 0) {
    output.push(`--- VELOCITY ALERTS (${significantVelocity.length}) ---`);
    significantVelocity.slice(0, 5).forEach(v => {
      output.push(`[${v.trend}] ${v.sku}: ${v.velocity_change_pct > 0 ? '+' : ''}${v.velocity_change_pct.toFixed(0)}%`);
      output.push(`       ${v.runway_impact}`);
      if (Math.abs(v.seasonal_variance) > 20) {
        output.push(`       Seasonal: ${v.seasonal_variance > 0 ? '+' : ''}${v.seasonal_variance.toFixed(0)}% vs 90d avg`);
      }
    });
    output.push('');
  }

  // Reorder point recommendations
  const recommendations = await getReorderPointRecommendations();
  if (recommendations.length > 0) {
    output.push(`--- ROP ADJUSTMENTS RECOMMENDED (${recommendations.length}) ---`);
    recommendations.slice(0, 3).forEach(r => {
      output.push(`${r.sku}: ${r.current_reorder_point} → ${r.recommended_reorder_point}`);
      output.push(`       ${r.reason}`);
    });
    output.push('');
  }

  // === SUPPLY CHAIN RISK ANALYSIS (PAB-based) ===
  if (supplyChainRisks && supplyChainRisks.items_needing_action > 0) {
    output.push('');
    const riskLines = formatRiskSummaryForAgent(supplyChainRisks);
    output.push(...riskLines);
  }

  // === AUTONOMOUS PO GENERATION ===
  let autoPOResult: AutoPOResult | undefined;
  let autonomyCheck: AutonomyCheckResult | undefined;

  // Only trigger auto-PO if enabled and there are critical/warning items
  const criticalPurchasedAlerts = summary.alerts.filter(
    a => (a.severity === 'COOKED' || a.severity === 'CRITICAL') && a.item_category === 'PURCHASED'
  );

  if (options.enableAutoPO && criticalPurchasedAlerts.length > 0) {
    output.push('');
    output.push('=== AUTONOMOUS PO GENERATION ===');

    // Estimate total PO value for autonomy check
    const estimatedValue = criticalPurchasedAlerts.reduce((sum, a) => sum + a.estimated_cost, 0);

    // Check if agent can execute autonomously
    const agentId = options.agentId || 'inventory-guardian';
    const check: AutonomyCheck = {
      agentId,
      action: 'create_po',
      targetValue: estimatedValue,
    };

    autonomyCheck = await canExecuteAutonomously(check);

    if (autonomyCheck.allowed) {
      output.push(`Autonomy check PASSED: ${autonomyCheck.reason}`);
      output.push(`  Trust score: ${(autonomyCheck.trustScore || 0).toFixed(2)}`);
      output.push(`  Estimated PO value: $${estimatedValue.toLocaleString()}`);

      if (!options.dryRun) {
        // Trigger auto-PO generation
        autoPOResult = await triggerAutoPOGeneration(agentId, {
          dryRun: false,
          maxDraftsPerRun: 10,
        });

        if (autoPOResult.success) {
          output.push('');
          output.push(`PO Drafts created: ${autoPOResult.draftsCreated}`);
          output.push(`  Auto-approved: ${autoPOResult.draftsAutoApproved}`);
          output.push(`  Pending approval: ${autoPOResult.draftsPendingApproval}`);
          output.push(`  Total value: $${autoPOResult.totalValue.toLocaleString()}`);

          // Log the autonomous action
          await logAutonomyCheck(check, autonomyCheck, true, 'success');
          await logAgentAction(
            agentId,
            null,
            'auto_po_created',
            `Created ${autoPOResult.draftsCreated} PO drafts worth $${autoPOResult.totalValue.toLocaleString()}`,
            null,
            {
              drafts_created: autoPOResult.draftsCreated,
              auto_approved: autoPOResult.draftsAutoApproved,
              pending_approval: autoPOResult.draftsPendingApproval,
              total_value: autoPOResult.totalValue,
            }
          );
        } else {
          output.push('');
          output.push(`PO generation encountered errors:`);
          autoPOResult.errors.forEach(err => output.push(`  - ${err}`));
          await logAutonomyCheck(check, autonomyCheck, true, 'failure');
        }
      } else {
        output.push('');
        output.push(`[DRY RUN] Would create PO drafts for ${criticalPurchasedAlerts.length} critical items`);
      }
    } else {
      output.push(`Autonomy check BLOCKED: ${autonomyCheck.reason}`);
      output.push(`  Requires approval level: ${autonomyCheck.requiresApproval || 'manager'}`);
      output.push(`  Agent will create draft POs for human review`);

      // Log blocked autonomy check
      await logAutonomyCheck(check, autonomyCheck, false, 'rejected');

      if (!options.dryRun) {
        // Still create drafts but they'll require approval
        autoPOResult = await triggerAutoPOGeneration(agentId, {
          dryRun: false,
          maxDraftsPerRun: 10,
        });

        if (autoPOResult.success && autoPOResult.draftsCreated > 0) {
          output.push('');
          output.push(`Draft POs created for review: ${autoPOResult.draftsCreated}`);
          output.push(`  All require approval: ${autoPOResult.draftsPendingApproval}`);
          output.push(`  Total value: $${autoPOResult.totalValue.toLocaleString()}`);
        }
      }
    }
  } else if (options.enableAutoPO) {
    output.push('');
    output.push('=== AUTONOMOUS PO GENERATION ===');
    output.push('No critical purchased items needing PO generation');
  }

  output.push('');
  output.push(`[${new Date().toISOString()}] Inventory Guardian complete`);

  // === SLACK NOTIFICATIONS ===
  // Send Slack alerts for critical items (fire-and-forget, don't block return)
  const criticalAlerts = summary.alerts.filter(a => a.severity === 'COOKED' || a.severity === 'CRITICAL');
  if (criticalAlerts.length > 0) {
    // Send top 3 critical alerts to Slack
    criticalAlerts.slice(0, 3).forEach(alert => {
      sendStockoutNotification({
        sku: alert.sku,
        itemName: alert.product_name,
        currentStock: alert.current_stock,
        daysUntilStockout: alert.runway_days,
        urgency: alert.severity === 'COOKED' ? 'critical' : 'high',
        recommendedAction: alert.recommended_action,
        vendorName: alert.vendor_name,
      }).catch(err => {
        console.error('[InventoryGuardian] Failed to send Slack notification:', err);
      });
    });

    // Also notify about agent action if POs were created
    if (autoPOResult?.draftsCreated && autoPOResult.draftsCreated > 0) {
      sendAgentActionNotification({
        agentName: 'Inventory Guardian',
        actionType: 'Auto PO Generation',
        description: `Created ${autoPOResult.draftsCreated} PO draft(s) worth $${autoPOResult.totalValue.toLocaleString()} for critical items`,
        status: autoPOResult.draftsAutoApproved > 0 ? 'executed' : 'proposed',
        affectedItems: criticalAlerts.slice(0, 5).map(a => a.sku),
        requiresApproval: autoPOResult.draftsPendingApproval > 0,
      }).catch(err => {
        console.error('[InventoryGuardian] Failed to send Slack action notification:', err);
      });
    }
  }

  return {
    success: true,
    summary,
    velocity_alerts: velocityAlerts,
    reorder_recommendations: recommendations,
    kpi_summary: kpiSummary,
    supply_chain_risks: supplyChainRisks,
    auto_po_result: autoPOResult,
    autonomy_check: autonomyCheck,
    output,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process inventory items and generate health summary with alerts
 * Uses runway-based logic with 30-day target and BOM distinction
 */
function processInventoryForHealthCheck(
  inventory: any[],
  cfg: InventoryGuardianConfig
): StockHealthSummary {
  const alerts: StockLevelAlert[] = [];
  const bomAlerts: StockLevelAlert[] = [];
  let healthyCount = 0;
  let warningCount = 0;
  let criticalCount = 0;
  let cookedCount = 0;
  let purchasedCount = 0;
  let manufacturedCount = 0;
  let totalValue = 0;
  let atRiskValue = 0;

  const DEFAULT_LEAD_TIME = 14;
  for (const item of inventory) {
    const stock = item.stock || 0;
    const reorderPoint = item.reorder_point || 0;
    const dailyConsumption = (item.sales_last_30_days || 0) / 30;
    const leadTime = DEFAULT_LEAD_TIME;
    const unitCost = item.unit_cost || 0;
    const productName = item.name || item.sku;

    // Determine if this is a manufactured item (BOM/finished good)
    const itemFlowType = item.item_flow_type || '';
    const itemType = item.item_type || '';
    const isManufactured = itemFlowType === 'manufactured' ||
                          itemType === 'Manufactured' ||
                          itemType === 'BOM' ||
                          itemType === 'Finished Good';

    const itemCategory: ItemCategory = isManufactured ? 'MANUFACTURED' : 'PURCHASED';

    if (isManufactured) {
      manufacturedCount++;
    } else {
      purchasedCount++;
    }

    // Calculate runway (days of stock on hand)
    const runwayDays = dailyConsumption > 0
      ? Math.floor(stock / dailyConsumption)
      : (stock > 0 ? 999 : 0);

    // Calculate item value
    const itemValue = stock * unitCost;
    totalValue += itemValue;

    // Get stock status using runway-based logic
    const status = getStockStatus(
      stock,
      runwayDays,
      leadTime,
      cfg.critical_runway_days,
      cfg.target_days_of_stock
    );

    // Calculate order quantity to reach 30-day target
    const orderQty = calculateOrderQty(
      cfg.target_days_of_stock,
      dailyConsumption,
      leadTime,
      cfg.safety_buffer_pct
    );

    // Calculate order-by date
    let orderByDate: Date | null = null;
    if (status !== 'HEALTHY') {
      orderByDate = new Date();
      const daysUntilAction = Math.max(0, runwayDays - leadTime);
      orderByDate.setDate(orderByDate.getDate() + daysUntilAction);
    }

    // Build alert
    const alert: StockLevelAlert = {
      severity: status,
      sku: item.sku,
      product_name: productName,
      item_category: itemCategory,
      current_stock: stock,
      reorder_point: reorderPoint,
      runway_days: runwayDays,
      target_runway: cfg.target_days_of_stock,
      daily_consumption: dailyConsumption,
      lead_time_days: leadTime,
      velocity_trend: 'STABLE', // Will be enriched later with velocity analysis
      seasonal_factor: 1.0, // Default, enriched later
      message: getStatusMessage(status, productName, item.sku, runwayDays, leadTime, itemCategory),
      recommended_action: getRecommendedAction(status, itemCategory, runwayDays, leadTime),
      recommended_order_qty: orderQty,
      estimated_cost: orderQty * unitCost,
      order_by_date: orderByDate,
    };

    // Update counts and at-risk value
    switch (status) {
      case 'COOKED':
        cookedCount++;
        atRiskValue += (cfg.target_days_of_stock * dailyConsumption * unitCost);
        if (isManufactured) {
          bomAlerts.push(alert);
        } else {
          alerts.push(alert);
        }
        break;
      case 'CRITICAL':
        criticalCount++;
        atRiskValue += itemValue;
        if (isManufactured) {
          bomAlerts.push(alert);
        } else {
          alerts.push(alert);
        }
        break;
      case 'WARNING':
        warningCount++;
        if (isManufactured) {
          bomAlerts.push(alert);
        } else {
          alerts.push(alert);
        }
        break;
      case 'HEALTHY':
        healthyCount++;
        break;
    }
  }

  // Sort alerts by severity
  const severityOrder: Record<StockStatus, number> = {
    'COOKED': 0, 'CRITICAL': 1, 'WARNING': 2, 'HEALTHY': 3
  };

  return {
    total_skus: inventory.length,
    healthy_skus: healthyCount,
    warning_skus: warningCount,
    critical_skus: criticalCount,
    cooked_skus: cookedCount,
    purchased_items: purchasedCount,
    manufactured_items: manufacturedCount,
    total_inventory_value: totalValue,
    at_risk_value: atRiskValue,
    alerts: alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]),
    bom_alerts: bomAlerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]),
  };
}

/**
 * Calculate order quantity to reach target runway (30 days)
 * Formula: (targetDays * dailyConsumption) + (leadTime * dailyConsumption * safetyBuffer)
 */
function calculateOrderQty(
  targetDays: number,
  dailyConsumption: number,
  leadTime: number,
  safetyBufferPct: number
): number {
  if (dailyConsumption <= 0) return 0;

  // Target stock = target days of runway
  const targetStock = targetDays * dailyConsumption;

  // Safety stock = lead time consumption with buffer
  const safetyStock = leadTime * dailyConsumption * safetyBufferPct;

  return Math.ceil(targetStock + safetyStock);
}

function getEmptySummary(): StockHealthSummary {
  return {
    total_skus: 0,
    healthy_skus: 0,
    warning_skus: 0,
    critical_skus: 0,
    cooked_skus: 0,
    purchased_items: 0,
    manufactured_items: 0,
    total_inventory_value: 0,
    at_risk_value: 0,
    alerts: [],
    bom_alerts: [],
  };
}

export default {
  runInventoryHealthCheck,
  analyzeVelocityChanges,
  getReorderPointRecommendations,
  runInventoryGuardianAgent,
};
