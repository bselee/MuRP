/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INVENTORY KPI SERVICE - Comprehensive Stock Intelligence Metrics
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Calculates all key inventory KPIs for stock intelligence:
 *
 * STOCKOUT RISK METRICS:
 * - CLTR: Coverage-to-Lead-Time Ratio (runway / lead_time)
 * - Projected Stockout Date: Time-phased PAB analysis
 *
 * DEMAND METRICS:
 * - CV (Coefficient of Variation): demand_std_dev / demand_mean
 *
 * SUPPLIER METRICS:
 * - Past Due PO Lines: Count of overdue purchase orders
 * - Lead Time Bias: Actual vs planned lead time variance
 *
 * INVENTORY HEALTH:
 * - Excess Inventory $: Stock above 90-day runway × unit cost
 * - ABC Classification: A/B/C by $ usage (80/15/5 split)
 * - XYZ Classification: X/Y/Z by demand variability (CV thresholds)
 * - Safety Stock Attainment: Current stock vs calculated safety stock
 *
 * @module services/inventoryKPIService
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ABCClass = 'A' | 'B' | 'C';
export type XYZClass = 'X' | 'Y' | 'Z';
export type CLTRStatus = 'CRITICAL' | 'AT_RISK' | 'ADEQUATE' | 'HEALTHY';

export interface InventoryKPIs {
  sku: string;
  product_name: string;

  // Stockout Risk
  cltr: number;                    // Coverage-to-Lead-Time Ratio
  cltr_status: CLTRStatus;         // CRITICAL/AT_RISK/ADEQUATE/HEALTHY
  runway_days: number;             // Days of stock on hand
  projected_stockout_date: Date | null;  // When will we run out?
  days_until_stockout: number | null;    // Days until projected stockout

  // Demand Metrics
  cv: number;                      // Coefficient of Variation
  demand_mean: number;             // Mean daily demand
  demand_std_dev: number;          // Demand standard deviation

  // Supplier Metrics
  lead_time_planned: number;       // Planned lead time (days)
  lead_time_actual: number | null; // Actual avg lead time (days)
  lead_time_bias: number | null;   // Actual - Planned (positive = late)

  // Inventory Health
  safety_stock_target: number;     // Calculated safety stock
  safety_stock_attainment: number; // Current stock / safety stock (%)
  excess_inventory_value: number;  // $ above 90-day runway

  // Classification
  abc_class: ABCClass;             // A/B/C by $ usage
  xyz_class: XYZClass;             // X/Y/Z by variability
  abc_xyz_combined: string;        // Combined classification (AX, BY, CZ, etc.)

  // Context
  current_stock: number;
  on_order: number;
  unit_cost: number;
  annual_usage_value: number;      // For ABC calculation
}

export interface PastDuePOLine {
  po_id: string;
  po_number: string;
  vendor_name: string;
  sku: string;
  product_name: string;
  expected_date: Date;
  days_overdue: number;
  quantity: number;
  value: number;
}

export interface KPISummary {
  // Stockout Risk
  items_critical_cltr: number;     // CLTR < 0.5
  items_at_risk_cltr: number;      // CLTR 0.5-1.0
  avg_cltr: number;

  // Demand
  items_high_variability: number;  // CV > 1.0
  items_medium_variability: number; // CV 0.5-1.0
  avg_cv: number;

  // Supplier
  total_past_due_lines: number;
  past_due_value: number;
  avg_lead_time_bias: number;      // Days (positive = vendors late)

  // Inventory Health
  total_excess_value: number;
  safety_stock_shortfall_items: number;  // Items below SS target
  avg_safety_stock_attainment: number;

  // Classification Distribution
  abc_distribution: { A: number; B: number; C: number };
  xyz_distribution: { X: number; Y: number; Z: number };

  // Top items
  past_due_lines: PastDuePOLine[];
  critical_cltr_items: InventoryKPIs[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CLTR (Coverage-to-Lead-Time Ratio)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate CLTR = runway / (lead_time + review_period)
 *
 * CLTR Interpretation:
 * - < 0.5: CRITICAL - Will stockout before order arrives
 * - 0.5-1.0: AT_RISK - Tight coverage, order now
 * - 1.0-2.0: ADEQUATE - Healthy buffer
 * - > 2.0: HEALTHY - Excess coverage (may be over-stocked)
 */
export function calculateCLTR(
  runwayDays: number,
  leadTimeDays: number,
  reviewPeriodDays: number = 7  // Weekly review default
): { cltr: number; status: CLTRStatus } {
  const denominator = leadTimeDays + reviewPeriodDays;
  if (denominator === 0) return { cltr: 999, status: 'HEALTHY' };

  const cltr = runwayDays / denominator;

  let status: CLTRStatus;
  if (cltr < 0.5) status = 'CRITICAL';
  else if (cltr < 1.0) status = 'AT_RISK';
  else if (cltr < 2.0) status = 'ADEQUATE';
  else status = 'HEALTHY';

  return { cltr: Math.round(cltr * 100) / 100, status };
}

// ═══════════════════════════════════════════════════════════════════════════
// CV (Coefficient of Variation)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate CV = std_dev / mean
 *
 * CV Interpretation:
 * - < 0.5: X class - Low variability, predictable demand
 * - 0.5-1.0: Y class - Medium variability, seasonal patterns
 * - > 1.0: Z class - High variability, erratic demand
 */
export function calculateCV(stdDev: number, mean: number): number {
  if (mean === 0) return 0;
  return Math.round((stdDev / mean) * 100) / 100;
}

export function getXYZClass(cv: number): XYZClass {
  if (cv < 0.5) return 'X';
  if (cv < 1.0) return 'Y';
  return 'Z';
}

// ═══════════════════════════════════════════════════════════════════════════
// ABC Classification
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ABC Classification by annual $ usage:
 * - A: Top 80% of $ value (typically 20% of items)
 * - B: Next 15% of $ value
 * - C: Remaining 5% of $ value
 */
export function calculateABCClass(
  itemAnnualValue: number,
  cumulativePercentage: number
): ABCClass {
  if (cumulativePercentage <= 80) return 'A';
  if (cumulativePercentage <= 95) return 'B';
  return 'C';
}

// ═══════════════════════════════════════════════════════════════════════════
// Projected Stockout Date (PAB)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate projected stockout date using time-phased PAB
 * PAB = Beginning Inventory + Scheduled Receipts - Demand
 */
export function calculateProjectedStockoutDate(
  currentStock: number,
  onOrder: number,
  dailyDemand: number,
  scheduledReceipts: Array<{ date: Date; quantity: number }> = []
): { date: Date | null; daysUntil: number | null } {
  if (dailyDemand <= 0) {
    return { date: null, daysUntil: null };
  }

  // Simple calculation without scheduled receipts
  const totalPosition = currentStock + onOrder;
  const daysUntil = Math.floor(totalPosition / dailyDemand);

  if (daysUntil > 365) {
    return { date: null, daysUntil: null }; // More than a year out
  }

  const stockoutDate = new Date();
  stockoutDate.setDate(stockoutDate.getDate() + daysUntil);

  return { date: stockoutDate, daysUntil };
}

// ═══════════════════════════════════════════════════════════════════════════
// Lead Time Bias
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate lead time bias: Actual - Planned
 * Positive = vendors deliver late
 * Negative = vendors deliver early
 */
export function calculateLeadTimeBias(
  actualLeadTime: number | null,
  plannedLeadTime: number
): number | null {
  if (actualLeadTime === null) return null;
  return Math.round((actualLeadTime - plannedLeadTime) * 10) / 10;
}

// ═══════════════════════════════════════════════════════════════════════════
// Safety Stock Attainment
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate safety stock attainment: current_stock / safety_stock × 100
 * Values:
 * - < 50%: CRITICAL - Well below safety stock
 * - 50-100%: LOW - Below target
 * - 100-150%: OPTIMAL - At target
 * - > 150%: EXCESS - Above target
 */
export function calculateSafetyStockAttainment(
  currentStock: number,
  safetyStock: number
): number {
  if (safetyStock <= 0) return 100;
  return Math.round((currentStock / safetyStock) * 100);
}

// ═══════════════════════════════════════════════════════════════════════════
// Excess Inventory
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate excess inventory value
 * Excess = Stock above 90-day runway × unit cost
 */
export function calculateExcessInventoryValue(
  currentStock: number,
  dailyDemand: number,
  unitCost: number,
  maxRunwayDays: number = 90
): number {
  const maxStock = dailyDemand * maxRunwayDays;
  const excess = Math.max(0, currentStock - maxStock);
  return Math.round(excess * unitCost * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CALCULATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate all KPIs for inventory items
 */
export async function calculateInventoryKPIs(): Promise<InventoryKPIs[]> {
  const kpis: InventoryKPIs[] = [];

  try {
    // Get inventory items with purchasing parameters
    // Note: Using correct column names from actual schema
    const { data: inventory, error: invError } = await supabase
      .from('inventory_items')
      .select(`
        sku,
        name,
        stock,
        on_order,
        unit_cost,
        sales_last_30_days,
        sales_last_60_days,
        sales_last_90_days,
        reorder_point,
        moq,
        status,
        is_dropship
      `)
      .eq('status', 'active')
      .or('is_dropship.is.null,is_dropship.eq.false');

    if (invError) throw invError;
    if (!inventory || inventory.length === 0) return [];

    // Get purchasing parameters for demand stats
    const { data: purchParams } = await supabase
      .from('sku_purchasing_parameters')
      .select('sku, demand_mean_daily, demand_std_dev, calculated_safety_stock, lead_time_mean');

    const paramMap = new Map(purchParams?.map(p => [p.sku, p]) || []);

    // Calculate annual usage for ABC classification
    // Daily demand calculated from 30-day sales data
    const DEFAULT_LEAD_TIME = 14; // Default lead time in days if not specified
    const itemsWithValue = inventory.map(item => {
      const dailyDemand = (item.sales_last_30_days || 0) / 30;
      const unitCost = item.unit_cost || 0;
      return {
        ...item,
        annualValue: dailyDemand * 365 * unitCost,
        dailyDemand,
        unitCost,
        calculatedLeadTime: DEFAULT_LEAD_TIME
      };
    });

    // Sort by annual value for ABC classification
    const sortedByValue = [...itemsWithValue].sort((a, b) => b.annualValue - a.annualValue);
    const totalAnnualValue = sortedByValue.reduce((sum, item) => sum + item.annualValue, 0);

    let cumulativeValue = 0;
    const abcClassMap = new Map<string, { class: ABCClass; cumPct: number }>();

    for (const item of sortedByValue) {
      cumulativeValue += item.annualValue;
      const cumPct = totalAnnualValue > 0 ? (cumulativeValue / totalAnnualValue) * 100 : 100;
      abcClassMap.set(item.sku, {
        class: calculateABCClass(item.annualValue, cumPct),
        cumPct
      });
    }

    // Calculate KPIs for each item
    for (const item of itemsWithValue) {
      const params = paramMap.get(item.sku);
      const stock = item.stock || 0;
      const onOrder = item.on_order || 0;
      const leadTime = params?.lead_time_mean || item.calculatedLeadTime;

      // Demand metrics
      const demandMean = params?.demand_mean_daily || item.dailyDemand;
      const demandStdDev = params?.demand_std_dev || 0;
      const cv = calculateCV(demandStdDev, demandMean);

      // Runway
      const runway = demandMean > 0 ? Math.floor(stock / demandMean) : 999;

      // CLTR
      const { cltr, status: cltrStatus } = calculateCLTR(runway, leadTime);

      // Projected stockout
      const { date: stockoutDate, daysUntil } = calculateProjectedStockoutDate(
        stock, onOrder, demandMean
      );

      // Safety stock
      const safetyStock = params?.calculated_safety_stock ||
                          Math.ceil(demandMean * leadTime * 0.5); // 50% of lead time demand
      const ssAttainment = calculateSafetyStockAttainment(stock, safetyStock);

      // Lead time bias
      const actualLeadTime = params?.lead_time_mean || null;
      const ltBias = calculateLeadTimeBias(actualLeadTime, leadTime);

      // Excess inventory
      const excess = calculateExcessInventoryValue(stock, demandMean, item.unitCost);

      // Classification
      const abcInfo = abcClassMap.get(item.sku) || { class: 'C' as ABCClass, cumPct: 100 };
      const xyzClass = getXYZClass(cv);

      kpis.push({
        sku: item.sku,
        product_name: item.name || item.sku,

        cltr,
        cltr_status: cltrStatus,
        runway_days: runway,
        projected_stockout_date: stockoutDate,
        days_until_stockout: daysUntil,

        cv,
        demand_mean: demandMean,
        demand_std_dev: demandStdDev,

        lead_time_planned: leadTime,
        lead_time_actual: actualLeadTime,
        lead_time_bias: ltBias,

        safety_stock_target: safetyStock,
        safety_stock_attainment: ssAttainment,
        excess_inventory_value: excess,

        abc_class: abcInfo.class,
        xyz_class: xyzClass,
        abc_xyz_combined: `${abcInfo.class}${xyzClass}`,

        current_stock: stock,
        on_order: onOrder,
        unit_cost: item.unitCost,
        annual_usage_value: item.annualValue,
      });
    }

    return kpis;
  } catch (error) {
    console.error('[InventoryKPIService] Failed to calculate KPIs:', error);
    return [];
  }
}

/**
 * Get past due PO lines
 */
export async function getPastDuePOLines(): Promise<PastDuePOLine[]> {
  const today = new Date().toISOString().split('T')[0];

  try {
    const { data: overduePos, error } = await supabase
      .from('finale_purchase_orders')
      .select(`
        id,
        order_id,
        vendor_name,
        expected_date,
        line_items,
        total
      `)
      .in('status', ['Committed', 'Draft', 'SUBMITTED', 'PARTIALLY_RECEIVED'])
      .lt('expected_date', today)
      .order('expected_date', { ascending: true });

    if (error) throw error;

    const pastDueLines: PastDuePOLine[] = [];

    for (const po of overduePos || []) {
      if (!po.expected_date) continue;

      const expectedDate = new Date(po.expected_date);
      const daysOverdue = Math.floor(
        (new Date().getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      const lineItems = (po.line_items as any[]) || [];

      for (const line of lineItems) {
        pastDueLines.push({
          po_id: po.id,
          po_number: po.order_id,
          vendor_name: po.vendor_name || 'Unknown',
          sku: line.product_id || line.sku || 'Unknown',
          product_name: line.product_name || line.description || line.product_id || 'Unknown',
          expected_date: expectedDate,
          days_overdue: daysOverdue,
          quantity: line.quantity || 0,
          value: (line.quantity || 0) * (line.unit_price || line.price || 0),
        });
      }
    }

    return pastDueLines.sort((a, b) => b.days_overdue - a.days_overdue);
  } catch (error) {
    console.error('[InventoryKPIService] Failed to get past due PO lines:', error);
    return [];
  }
}

/**
 * Get lead time bias by vendor
 */
export async function getLeadTimeBiasByVendor(): Promise<Array<{
  vendor_id: string;
  vendor_name: string;
  avg_planned_lt: number;
  avg_actual_lt: number;
  bias_days: number;
  on_time_pct: number;
  pos_analyzed: number;
}>> {
  try {
    // Get completed POs with both expected and received dates
    const { data: completedPos, error } = await supabase
      .from('finale_purchase_orders')
      .select(`
        vendor_id,
        vendor_name,
        order_date,
        expected_date,
        received_date,
        tracking_delivered_date
      `)
      .in('status', ['RECEIVED', 'COMPLETED', 'Received'])
      .not('expected_date', 'is', null);

    if (error) throw error;

    // Group by vendor
    const vendorStats = new Map<string, {
      name: string;
      plannedLts: number[];
      actualLts: number[];
      onTimeCount: number;
    }>();

    for (const po of completedPos || []) {
      if (!po.vendor_id || !po.expected_date) continue;

      const orderDate = po.order_date ? new Date(po.order_date) : null;
      const expectedDate = new Date(po.expected_date);
      const actualDate = po.tracking_delivered_date ? new Date(po.tracking_delivered_date) :
                         po.received_date ? new Date(po.received_date) : null;

      if (!orderDate || !actualDate) continue;

      const plannedLt = Math.floor((expectedDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
      const actualLt = Math.floor((actualDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));

      const stats = vendorStats.get(po.vendor_id) || {
        name: po.vendor_name || 'Unknown',
        plannedLts: [],
        actualLts: [],
        onTimeCount: 0,
      };

      stats.plannedLts.push(plannedLt);
      stats.actualLts.push(actualLt);
      if (actualDate <= expectedDate) stats.onTimeCount++;

      vendorStats.set(po.vendor_id, stats);
    }

    const results: Array<{
      vendor_id: string;
      vendor_name: string;
      avg_planned_lt: number;
      avg_actual_lt: number;
      bias_days: number;
      on_time_pct: number;
      pos_analyzed: number;
    }> = [];

    for (const [vendorId, stats] of vendorStats) {
      const count = stats.plannedLts.length;
      if (count === 0) continue;

      const avgPlanned = stats.plannedLts.reduce((a, b) => a + b, 0) / count;
      const avgActual = stats.actualLts.reduce((a, b) => a + b, 0) / count;

      results.push({
        vendor_id: vendorId,
        vendor_name: stats.name,
        avg_planned_lt: Math.round(avgPlanned * 10) / 10,
        avg_actual_lt: Math.round(avgActual * 10) / 10,
        bias_days: Math.round((avgActual - avgPlanned) * 10) / 10,
        on_time_pct: Math.round((stats.onTimeCount / count) * 100),
        pos_analyzed: count,
      });
    }

    return results.sort((a, b) => b.bias_days - a.bias_days);
  } catch (error) {
    console.error('[InventoryKPIService] Failed to get lead time bias:', error);
    return [];
  }
}

/**
 * Get comprehensive KPI summary
 */
export async function getKPISummary(): Promise<KPISummary> {
  const [kpis, pastDueLines, leadTimeBias] = await Promise.all([
    calculateInventoryKPIs(),
    getPastDuePOLines(),
    getLeadTimeBiasByVendor(),
  ]);

  // Aggregate metrics
  const criticalCltr = kpis.filter(k => k.cltr_status === 'CRITICAL');
  const atRiskCltr = kpis.filter(k => k.cltr_status === 'AT_RISK');
  const highVariability = kpis.filter(k => k.cv > 1.0);
  const mediumVariability = kpis.filter(k => k.cv >= 0.5 && k.cv <= 1.0);
  const belowSS = kpis.filter(k => k.safety_stock_attainment < 100);

  const totalExcess = kpis.reduce((sum, k) => sum + k.excess_inventory_value, 0);
  const avgCltr = kpis.length > 0
    ? kpis.reduce((sum, k) => sum + k.cltr, 0) / kpis.length
    : 0;
  const avgCv = kpis.length > 0
    ? kpis.reduce((sum, k) => sum + k.cv, 0) / kpis.length
    : 0;
  const avgSsAttainment = kpis.length > 0
    ? kpis.reduce((sum, k) => sum + k.safety_stock_attainment, 0) / kpis.length
    : 100;

  // Lead time bias average
  const avgLtBias = leadTimeBias.length > 0
    ? leadTimeBias.reduce((sum, v) => sum + v.bias_days, 0) / leadTimeBias.length
    : 0;

  // ABC/XYZ distribution
  const abcDist = { A: 0, B: 0, C: 0 };
  const xyzDist = { X: 0, Y: 0, Z: 0 };
  for (const k of kpis) {
    abcDist[k.abc_class]++;
    xyzDist[k.xyz_class]++;
  }

  return {
    items_critical_cltr: criticalCltr.length,
    items_at_risk_cltr: atRiskCltr.length,
    avg_cltr: Math.round(avgCltr * 100) / 100,

    items_high_variability: highVariability.length,
    items_medium_variability: mediumVariability.length,
    avg_cv: Math.round(avgCv * 100) / 100,

    total_past_due_lines: pastDueLines.length,
    past_due_value: pastDueLines.reduce((sum, l) => sum + l.value, 0),
    avg_lead_time_bias: Math.round(avgLtBias * 10) / 10,

    total_excess_value: Math.round(totalExcess * 100) / 100,
    safety_stock_shortfall_items: belowSS.length,
    avg_safety_stock_attainment: Math.round(avgSsAttainment),

    abc_distribution: abcDist,
    xyz_distribution: xyzDist,

    past_due_lines: pastDueLines.slice(0, 10),
    critical_cltr_items: criticalCltr.slice(0, 10),
  };
}

export default {
  calculateCLTR,
  calculateCV,
  calculateABCClass,
  getXYZClass,
  calculateProjectedStockoutDate,
  calculateLeadTimeBias,
  calculateSafetyStockAttainment,
  calculateExcessInventoryValue,
  calculateInventoryKPIs,
  getPastDuePOLines,
  getLeadTimeBiasByVendor,
  getKPISummary,
};
