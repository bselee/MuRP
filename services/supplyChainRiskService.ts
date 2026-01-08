/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SUPPLY CHAIN RISK SERVICE - Time-Phased PAB Analysis
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This service implements rigorous supply chain risk analysis using
 * Projected Available Balance (PAB) calculations with BOM explosion.
 *
 * KEY CONCEPTS:
 * - PAB: Projected Available Balance = Beginning + Receipts - Demand
 * - BOM Explosion: Converting finished goods forecast to component requirements
 * - Runout Detection: Finding when PAB goes negative
 * - Safety Stock Breach: When PAB drops below safety threshold
 *
 * CALCULATION FLOW:
 * 1. Load inventory positions (stock + on-order)
 * 2. Load open POs with expected dates
 * 3. Load BOM structures for component explosion
 * 4. For each day in horizon, calculate:
 *    - Independent demand (direct sales)
 *    - Dependent demand (from BOM explosion)
 *    - Scheduled receipts (from POs)
 *    - PAB = Prior PAB + Receipts - Demand
 * 5. Find first day PAB < 0 (runout) or PAB < SS (breach)
 *
 * OUTPUT FORMAT:
 * Each risk item returns:
 * - Risk statement: "SKU X will breach safety stock on DATE (Y days)"
 * - Action statement: "ACTION: [specific action with quantity and urgency]"
 *
 * @module services/supplyChainRiskService
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type RiskSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type RiskType = 'STOCKOUT' | 'SS_BREACH' | 'COMPONENT_SHORT' | 'PO_LATE';

export interface ScheduledReceipt {
  date: Date;
  quantity: number;
  po_number: string;
  vendor_name: string;
}

export interface DailyPAB {
  date: Date;
  beginning_balance: number;
  scheduled_receipts: number;
  independent_demand: number;
  dependent_demand: number;  // From BOM explosion
  total_demand: number;
  ending_balance: number;    // PAB = beginning + receipts - demand
  safety_stock: number;
  is_below_ss: boolean;
  is_stockout: boolean;
}

export interface BOMComponent {
  component_sku: string;
  component_name: string;
  quantity_per: number;
  finished_sku: string;
  finished_name: string;
}

export interface SupplyChainRisk {
  sku: string;
  product_name: string;
  risk_type: RiskType;
  severity: RiskSeverity;

  // Risk details
  runout_date: Date | null;
  days_until_runout: number | null;
  breach_date: Date | null;        // Date when PAB < SS
  days_until_breach: number | null;

  // Current position
  current_stock: number;
  current_on_order: number;
  safety_stock: number;
  daily_demand: number;

  // Dependent demand (BOM)
  dependent_demand_daily: number;  // From finished goods builds
  parent_skus: string[];           // Which finished goods drive demand

  // Calculations
  pab_at_horizon: number;          // PAB at end of horizon
  min_pab_in_horizon: number;      // Lowest PAB value
  min_pab_date: Date | null;       // Date of lowest PAB

  // Time-phased data
  daily_pab: DailyPAB[];
  scheduled_receipts: ScheduledReceipt[];

  // Output statements
  risk_statement: string;
  action_statement: string;

  // For ordering priority
  priority_score: number;          // Lower = more urgent
}

export interface SupplyChainRiskSummary {
  analysis_date: Date;
  horizon_days: number;

  // Risk counts
  stockout_risks: number;
  ss_breach_risks: number;
  component_risks: number;
  po_late_risks: number;

  // Top risks
  critical_risks: SupplyChainRisk[];
  high_risks: SupplyChainRisk[];

  // Aggregate metrics
  total_at_risk_value: number;
  items_needing_action: number;

  // All risks sorted by priority
  all_risks: SupplyChainRisk[];
}

export interface SupplyChainRiskConfig {
  horizon_days: number;        // Days to project forward (default 60)
  safety_stock_days: number;   // Days of SS buffer (default 14)
  include_bom_explosion: boolean;  // Include dependent demand
  min_daily_demand: number;    // Minimum demand to include (filter noise)
}

const DEFAULT_CONFIG: SupplyChainRiskConfig = {
  horizon_days: 60,
  safety_stock_days: 14,
  include_bom_explosion: true,
  min_daily_demand: 0.1,  // At least 1 unit per 10 days
};

// ═══════════════════════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load inventory items with current positions
 */
async function loadInventoryPositions(): Promise<Map<string, {
  sku: string;
  name: string;
  stock: number;
  on_order: number;
  daily_demand: number;
  safety_stock: number;
  lead_time_days: number;
  unit_cost: number;
}>> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select(`
      sku,
      product_name,
      name,
      available_quantity,
      quantity_on_hand,
      on_order,
      avg_daily_consumption,
      sales_last_30_days,
      reorder_point,
      lead_time_days,
      unit_cost,
      cost,
      is_active,
      is_dropship
    `)
    .eq('is_active', true)
    .or('is_dropship.is.null,is_dropship.eq.false');

  if (error) throw error;

  const map = new Map();
  for (const item of data || []) {
    const dailyDemand = item.avg_daily_consumption ||
                        (item.sales_last_30_days || 0) / 30;
    const leadTime = item.lead_time_days || 14;

    map.set(item.sku, {
      sku: item.sku,
      name: item.product_name || item.name || item.sku,
      stock: item.available_quantity || item.quantity_on_hand || 0,
      on_order: item.on_order || 0,
      daily_demand: dailyDemand,
      safety_stock: item.reorder_point || Math.ceil(dailyDemand * leadTime * 0.5),
      lead_time_days: leadTime,
      unit_cost: item.unit_cost || item.cost || 0,
    });
  }

  return map;
}

/**
 * Load open POs with expected dates for scheduled receipts
 */
async function loadScheduledReceipts(): Promise<Map<string, ScheduledReceipt[]>> {
  const { data, error } = await supabase
    .from('finale_purchase_orders')
    .select('order_id, vendor_name, expected_date, line_items')
    .in('status', ['Committed', 'Draft', 'SUBMITTED', 'PARTIALLY_RECEIVED'])
    .not('expected_date', 'is', null);

  if (error) throw error;

  const map = new Map<string, ScheduledReceipt[]>();

  for (const po of data || []) {
    const expectedDate = new Date(po.expected_date);
    const lineItems = (po.line_items as any[]) || [];

    for (const line of lineItems) {
      const sku = line.product_id || line.sku || line.productId;
      if (!sku) continue;

      const receipt: ScheduledReceipt = {
        date: expectedDate,
        quantity: line.quantity || 0,
        po_number: po.order_id,
        vendor_name: po.vendor_name || 'Unknown',
      };

      const existing = map.get(sku) || [];
      existing.push(receipt);
      map.set(sku, existing);
    }
  }

  return map;
}

/**
 * Load BOM structures for component explosion
 */
async function loadBOMStructures(): Promise<Map<string, BOMComponent[]>> {
  const { data, error } = await supabase
    .from('bom_items')
    .select(`
      sku,
      component_sku,
      quantity,
      is_finished_product
    `)
    .eq('is_finished_product', true);

  if (error) throw error;

  // Get component and finished good names
  const allSkus = new Set<string>();
  for (const bom of data || []) {
    allSkus.add(bom.sku);
    if (bom.component_sku) allSkus.add(bom.component_sku);
  }

  const { data: names } = await supabase
    .from('inventory_items')
    .select('sku, product_name, name')
    .in('sku', Array.from(allSkus));

  const nameMap = new Map(names?.map(n => [n.sku, n.product_name || n.name || n.sku]) || []);

  // Group by component SKU (what components are needed for which finished goods)
  const componentToFinished = new Map<string, BOMComponent[]>();

  for (const bom of data || []) {
    if (!bom.component_sku) continue;

    const component: BOMComponent = {
      component_sku: bom.component_sku,
      component_name: nameMap.get(bom.component_sku) || bom.component_sku,
      quantity_per: bom.quantity || 1,
      finished_sku: bom.sku,
      finished_name: nameMap.get(bom.sku) || bom.sku,
    };

    const existing = componentToFinished.get(bom.component_sku) || [];
    existing.push(component);
    componentToFinished.set(bom.component_sku, existing);
  }

  return componentToFinished;
}

/**
 * Load finished goods demand for BOM explosion
 */
async function loadFinishedGoodsDemand(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('sku, avg_daily_consumption, sales_last_30_days')
    .in('sku', (await supabase
      .from('bom_items')
      .select('sku')
      .eq('is_finished_product', true)).data?.map(b => b.sku) || []);

  if (error) throw error;

  const map = new Map<string, number>();
  for (const item of data || []) {
    const demand = item.avg_daily_consumption || (item.sales_last_30_days || 0) / 30;
    if (demand > 0) map.set(item.sku, demand);
  }

  return map;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAB CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate time-phased PAB for a single SKU
 */
function calculateDailyPAB(
  sku: string,
  currentStock: number,
  dailyDemand: number,
  dependentDemand: number,
  safetyStock: number,
  scheduledReceipts: ScheduledReceipt[],
  horizonDays: number
): DailyPAB[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dailyPAB: DailyPAB[] = [];
  let runningBalance = currentStock;

  // Sort receipts by date
  const sortedReceipts = [...scheduledReceipts].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  for (let day = 0; day < horizonDays; day++) {
    const date = new Date(today);
    date.setDate(date.getDate() + day);
    date.setHours(0, 0, 0, 0);

    const beginning = runningBalance;

    // Find receipts for this day
    const dayReceipts = sortedReceipts.filter(r => {
      const receiptDate = new Date(r.date);
      receiptDate.setHours(0, 0, 0, 0);
      return receiptDate.getTime() === date.getTime();
    });
    const receiptsQty = dayReceipts.reduce((sum, r) => sum + r.quantity, 0);

    // Total demand = independent + dependent
    const totalDemand = dailyDemand + dependentDemand;

    // Calculate ending balance
    const ending = beginning + receiptsQty - totalDemand;
    runningBalance = ending;

    dailyPAB.push({
      date,
      beginning_balance: Math.round(beginning * 100) / 100,
      scheduled_receipts: receiptsQty,
      independent_demand: Math.round(dailyDemand * 100) / 100,
      dependent_demand: Math.round(dependentDemand * 100) / 100,
      total_demand: Math.round(totalDemand * 100) / 100,
      ending_balance: Math.round(ending * 100) / 100,
      safety_stock: safetyStock,
      is_below_ss: ending < safetyStock,
      is_stockout: ending < 0,
    });
  }

  return dailyPAB;
}

/**
 * Calculate dependent demand for a component from BOM explosion
 */
function calculateDependentDemand(
  componentSku: string,
  bomStructures: Map<string, BOMComponent[]>,
  finishedDemand: Map<string, number>
): { dailyDemand: number; parentSkus: string[] } {
  const bomUsages = bomStructures.get(componentSku) || [];

  let totalDependentDemand = 0;
  const parentSkus: string[] = [];

  for (const usage of bomUsages) {
    const finishedDailyDemand = finishedDemand.get(usage.finished_sku) || 0;
    const componentDemand = finishedDailyDemand * usage.quantity_per;

    if (componentDemand > 0) {
      totalDependentDemand += componentDemand;
      parentSkus.push(usage.finished_sku);
    }
  }

  return {
    dailyDemand: totalDependentDemand,
    parentSkus,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RISK ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine risk severity based on days until event
 */
function getRiskSeverity(daysUntil: number | null): RiskSeverity {
  if (daysUntil === null) return 'LOW';
  if (daysUntil <= 0) return 'CRITICAL';
  if (daysUntil <= 7) return 'CRITICAL';
  if (daysUntil <= 14) return 'HIGH';
  if (daysUntil <= 30) return 'MEDIUM';
  return 'LOW';
}

/**
 * Calculate priority score (lower = more urgent)
 * Priority = days_until_issue * severity_multiplier
 */
function calculatePriorityScore(
  daysUntil: number | null,
  severity: RiskSeverity,
  riskType: RiskType
): number {
  const severityMultiplier: Record<RiskSeverity, number> = {
    'CRITICAL': 1,
    'HIGH': 2,
    'MEDIUM': 3,
    'LOW': 4,
  };

  const typeMultiplier: Record<RiskType, number> = {
    'STOCKOUT': 1,
    'SS_BREACH': 1.5,
    'COMPONENT_SHORT': 1.2,
    'PO_LATE': 2,
  };

  const days = daysUntil ?? 999;
  return days * severityMultiplier[severity] * typeMultiplier[riskType];
}

/**
 * Generate risk and action statements
 */
function generateRiskStatements(
  risk: Partial<SupplyChainRisk>,
  leadTimeDays: number
): { risk_statement: string; action_statement: string } {
  const sku = risk.sku || 'Unknown';
  const name = risk.product_name || sku;

  // Calculate order quantity needed
  const dailyTotal = (risk.daily_demand || 0) + (risk.dependent_demand_daily || 0);
  const targetDays = 30; // Target 30-day runway
  const orderQty = Math.ceil(dailyTotal * (targetDays + leadTimeDays));

  let riskStatement: string;
  let actionStatement: string;

  if (risk.risk_type === 'STOCKOUT') {
    if (risk.days_until_runout !== null && risk.days_until_runout <= 0) {
      riskStatement = `${sku} (${name}) is OUT OF STOCK. Lost sales occurring now.`;
      actionStatement = `ACTION: EMERGENCY ORDER ${orderQty} units immediately. Consider expedited shipping.`;
    } else {
      const dateStr = risk.runout_date?.toLocaleDateString() || 'soon';
      riskStatement = `${sku} (${name}) will stockout on ${dateStr} (${risk.days_until_runout} days).`;

      if (risk.days_until_runout! <= leadTimeDays) {
        actionStatement = `ACTION: ORDER NOW - lead time exceeds runway. Order ${orderQty} units to vendor TODAY.`;
      } else {
        const orderByDate = new Date();
        orderByDate.setDate(orderByDate.getDate() + (risk.days_until_runout! - leadTimeDays));
        actionStatement = `ACTION: Order ${orderQty} units by ${orderByDate.toLocaleDateString()} to prevent stockout.`;
      }
    }
  } else if (risk.risk_type === 'SS_BREACH') {
    const dateStr = risk.breach_date?.toLocaleDateString() || 'soon';
    riskStatement = `${sku} (${name}) will breach safety stock on ${dateStr} (${risk.days_until_breach} days).`;
    actionStatement = `ACTION: Order ${orderQty} units within ${Math.max(1, risk.days_until_breach! - leadTimeDays)} days to maintain buffer.`;
  } else if (risk.risk_type === 'COMPONENT_SHORT') {
    const parents = risk.parent_skus?.slice(0, 2).join(', ') || 'finished goods';
    riskStatement = `${sku} (${name}) is a component for ${parents} and will run short.`;
    actionStatement = `ACTION: Order ${orderQty} units to support production schedule.`;
  } else {
    riskStatement = `${sku} (${name}) has supply chain risk.`;
    actionStatement = `ACTION: Review inventory position and open orders.`;
  }

  return { risk_statement: riskStatement, action_statement: actionStatement };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ANALYSIS FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run comprehensive supply chain risk analysis
 *
 * This is the main entry point for the supply chain risk service.
 * Inventory Guardian agent calls this function for its monitoring task.
 */
export async function analyzeSupplyChainRisks(
  config: Partial<SupplyChainRiskConfig> = {}
): Promise<SupplyChainRiskSummary> {
  const cfg: SupplyChainRiskConfig = { ...DEFAULT_CONFIG, ...config };
  const analysisDate = new Date();

  try {
    // Load all required data in parallel
    const [
      inventoryPositions,
      scheduledReceipts,
      bomStructures,
      finishedDemand,
    ] = await Promise.all([
      loadInventoryPositions(),
      loadScheduledReceipts(),
      loadBOMStructures(),
      cfg.include_bom_explosion ? loadFinishedGoodsDemand() : Promise.resolve(new Map()),
    ]);

    const risks: SupplyChainRisk[] = [];

    // Analyze each inventory item
    for (const [sku, position] of inventoryPositions) {
      // Skip items with negligible demand
      const independentDemand = position.daily_demand;

      // Calculate dependent demand from BOM explosion
      const { dailyDemand: dependentDemand, parentSkus } = cfg.include_bom_explosion
        ? calculateDependentDemand(sku, bomStructures, finishedDemand)
        : { dailyDemand: 0, parentSkus: [] };

      const totalDailyDemand = independentDemand + dependentDemand;

      // Skip if total demand is below threshold
      if (totalDailyDemand < cfg.min_daily_demand) continue;

      // Get scheduled receipts for this SKU
      const receipts = scheduledReceipts.get(sku) || [];

      // Calculate time-phased PAB
      const dailyPAB = calculateDailyPAB(
        sku,
        position.stock,
        independentDemand,
        dependentDemand,
        position.safety_stock,
        receipts,
        cfg.horizon_days
      );

      // Find runout date (first day PAB < 0)
      const runoutDay = dailyPAB.find(d => d.is_stockout);
      const runoutDate = runoutDay?.date || null;
      const daysUntilRunout = runoutDay
        ? Math.floor((runoutDay.date.getTime() - analysisDate.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Find safety stock breach date (first day PAB < SS)
      const breachDay = dailyPAB.find(d => d.is_below_ss);
      const breachDate = breachDay?.date || null;
      const daysUntilBreach = breachDay
        ? Math.floor((breachDay.date.getTime() - analysisDate.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Find minimum PAB in horizon
      const minPAB = dailyPAB.reduce(
        (min, d) => d.ending_balance < min.value
          ? { value: d.ending_balance, date: d.date }
          : min,
        { value: dailyPAB[0]?.ending_balance || 0, date: dailyPAB[0]?.date || null }
      );

      // Determine risk type and severity
      let riskType: RiskType;
      let severity: RiskSeverity;

      if (runoutDate !== null) {
        riskType = 'STOCKOUT';
        severity = getRiskSeverity(daysUntilRunout);
      } else if (breachDate !== null) {
        riskType = 'SS_BREACH';
        severity = getRiskSeverity(daysUntilBreach);
      } else if (parentSkus.length > 0 && minPAB.value < position.safety_stock * 1.5) {
        riskType = 'COMPONENT_SHORT';
        severity = 'MEDIUM';
      } else {
        // No significant risk in horizon
        continue;
      }

      // Calculate priority score
      const priorityScore = calculatePriorityScore(
        daysUntilRunout ?? daysUntilBreach,
        severity,
        riskType
      );

      // Build risk object
      const risk: Partial<SupplyChainRisk> = {
        sku,
        product_name: position.name,
        risk_type: riskType,
        severity,
        runout_date: runoutDate,
        days_until_runout: daysUntilRunout,
        breach_date: breachDate,
        days_until_breach: daysUntilBreach,
        current_stock: position.stock,
        current_on_order: position.on_order,
        safety_stock: position.safety_stock,
        daily_demand: independentDemand,
        dependent_demand_daily: dependentDemand,
        parent_skus: parentSkus,
        pab_at_horizon: dailyPAB[dailyPAB.length - 1]?.ending_balance || 0,
        min_pab_in_horizon: minPAB.value,
        min_pab_date: minPAB.date,
        daily_pab: dailyPAB,
        scheduled_receipts: receipts,
        priority_score: priorityScore,
      };

      // Generate statements
      const statements = generateRiskStatements(risk, position.lead_time_days);
      risk.risk_statement = statements.risk_statement;
      risk.action_statement = statements.action_statement;

      risks.push(risk as SupplyChainRisk);
    }

    // Sort by priority score (lower = more urgent)
    risks.sort((a, b) => a.priority_score - b.priority_score);

    // Build summary
    const criticalRisks = risks.filter(r => r.severity === 'CRITICAL');
    const highRisks = risks.filter(r => r.severity === 'HIGH');

    const totalAtRiskValue = risks.reduce((sum, r) => {
      const position = inventoryPositions.get(r.sku);
      return sum + (r.current_stock * (position?.unit_cost || 0));
    }, 0);

    return {
      analysis_date: analysisDate,
      horizon_days: cfg.horizon_days,

      stockout_risks: risks.filter(r => r.risk_type === 'STOCKOUT').length,
      ss_breach_risks: risks.filter(r => r.risk_type === 'SS_BREACH').length,
      component_risks: risks.filter(r => r.risk_type === 'COMPONENT_SHORT').length,
      po_late_risks: risks.filter(r => r.risk_type === 'PO_LATE').length,

      critical_risks: criticalRisks.slice(0, 10),
      high_risks: highRisks.slice(0, 10),

      total_at_risk_value: Math.round(totalAtRiskValue * 100) / 100,
      items_needing_action: criticalRisks.length + highRisks.length,

      all_risks: risks,
    };
  } catch (error) {
    console.error('[SupplyChainRiskService] Analysis failed:', error);
    return {
      analysis_date: analysisDate,
      horizon_days: cfg.horizon_days,
      stockout_risks: 0,
      ss_breach_risks: 0,
      component_risks: 0,
      po_late_risks: 0,
      critical_risks: [],
      high_risks: [],
      total_at_risk_value: 0,
      items_needing_action: 0,
      all_risks: [],
    };
  }
}

/**
 * Get risk analysis for a single SKU
 * Useful for detail views and troubleshooting
 */
export async function getSkuRiskAnalysis(
  sku: string,
  horizonDays: number = 60
): Promise<SupplyChainRisk | null> {
  const summary = await analyzeSupplyChainRisks({ horizon_days: horizonDays });
  return summary.all_risks.find(r => r.sku === sku) || null;
}

/**
 * Get formatted output for agent display
 * Returns array of lines suitable for agent output
 */
export function formatRiskSummaryForAgent(summary: SupplyChainRiskSummary): string[] {
  const lines: string[] = [];

  lines.push(`=== SUPPLY CHAIN RISK ANALYSIS ===`);
  lines.push(`Analysis Date: ${summary.analysis_date.toLocaleDateString()}`);
  lines.push(`Horizon: ${summary.horizon_days} days`);
  lines.push('');

  // Overview
  lines.push(`--- RISK OVERVIEW ---`);
  lines.push(`Stockout Risks: ${summary.stockout_risks}`);
  lines.push(`Safety Stock Breaches: ${summary.ss_breach_risks}`);
  lines.push(`Component Shortages: ${summary.component_risks}`);
  lines.push(`At-Risk Value: $${summary.total_at_risk_value.toLocaleString()}`);
  lines.push(`Items Needing Action: ${summary.items_needing_action}`);
  lines.push('');

  // Critical risks with two-sentence format
  if (summary.critical_risks.length > 0) {
    lines.push(`--- CRITICAL RISKS (${summary.critical_risks.length}) ---`);
    for (const risk of summary.critical_risks.slice(0, 5)) {
      lines.push(risk.risk_statement);
      lines.push(risk.action_statement);
      lines.push('');
    }
    if (summary.critical_risks.length > 5) {
      lines.push(`... and ${summary.critical_risks.length - 5} more critical risks`);
      lines.push('');
    }
  }

  // High risks
  if (summary.high_risks.length > 0) {
    lines.push(`--- HIGH RISKS (${summary.high_risks.length}) ---`);
    for (const risk of summary.high_risks.slice(0, 3)) {
      lines.push(risk.risk_statement);
      lines.push(risk.action_statement);
      lines.push('');
    }
    if (summary.high_risks.length > 3) {
      lines.push(`... and ${summary.high_risks.length - 3} more high risks`);
    }
  }

  return lines;
}

export default {
  analyzeSupplyChainRisks,
  getSkuRiskAnalysis,
  formatRiskSummaryForAgent,
  calculateDependentDemand,
  calculateDailyPAB,
};
