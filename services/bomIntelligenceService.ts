/**
 * BOM Intelligence Service
 *
 * Implements the 4-level cascade analysis:
 * 1. Finished Goods Demand →
 * 2. Build Requirements →
 * 3. Component Consumption →
 * 4. Raw Material Purchasing
 *
 * Core Philosophy: Track the multi-level cascade where finished goods demand
 * drives build requirements which drives component consumption which drives
 * raw material purchasing. Make them all talk to each other.
 */

import { supabase } from '../lib/supabase/client';
import {
  SERVICE_LEVEL_Z_SCORES,
  calculateSafetyStock,
  calculateReorderPoint,
  type ABCClass,
} from './advancedForecastingEngine';

// ============================================
// TYPES
// ============================================

export interface BOMAssembly {
  finished_sku: string;
  name: string;
  category: string;
  components: BOMComponent[];
  // Inventory data for the finished good
  finished_stock: number;
  finished_on_order: number;
  sales_last_30_days: number;
  sales_last_90_days: number;
  // Calculated metrics
  daily_demand: number;
  buildable_units: number;
  days_of_stock: number;      // Existing finished stock runway
  days_of_builds: number;     // Runway including buildable units
  limiting_component: string | null;
  abc_class: ABCClass;
}

export interface BOMComponent {
  sku: string;
  name: string;
  quantity_per: number;       // Qty needed per finished good
  // Component inventory
  component_stock: number;
  component_on_order: number;
  // Derived from parent demand
  demand_from_boms: number;   // Daily demand driven by BOM builds
  independent_demand: number; // Direct sales of this component
  total_demand: number;       // Combined demand
}

export interface ComponentIntelligence {
  sku: string;
  name: string;
  category: string;
  vendor_name: string | null;
  // Stock position
  stock: number;
  on_order: number;
  total_position: number;
  // Demand analysis
  independent_demand: number;  // Direct sales
  dependent_demand: number;    // Demand from BOMs
  total_daily_demand: number;
  // Which BOMs use this component
  used_in_boms: {
    finished_sku: string;
    finished_name: string;
    quantity_per: number;
    bom_daily_demand: number;  // Parent finished good demand
    component_consumption: number;  // qty_per * bom_daily_demand
  }[];
  // Metrics
  days_remaining: number;
  safety_stock: number;
  reorder_point: number;
  abc_class: ABCClass;
  // Recommendation
  action: 'URGENT' | 'Order Now' | 'Reorder Soon' | 'Adequate';
  suggested_qty: number;
  reason: string;
}

export interface BuildIntelligence {
  finished_sku: string;
  name: string;
  category: string;
  // Current position
  finished_stock: number;
  buildable_units: number;
  total_available: number;  // stock + buildable
  // Demand
  daily_demand: number;
  abc_class: ABCClass;
  // Runway analysis
  days_of_stock: number;
  days_of_builds: number;
  days_total: number;
  // Component analysis
  limiting_component: {
    sku: string;
    name: string;
    stock: number;
    needed_per_unit: number;
    max_builds_allowed: number;
  } | null;
  component_shortfalls: {
    sku: string;
    name: string;
    have: number;
    need: number;
    shortfall: number;
    vendor: string | null;
  }[];
  // Recommendation
  action: 'BUILD_URGENT' | 'BUILD_SOON' | 'ADEQUATE' | 'NO_DEMAND';
  suggested_build_qty: number;
  components_to_order: {
    sku: string;
    name: string;
    qty_to_order: number;
    vendor: string | null;
  }[];
  reason: string;
}

export interface CascadeAnalysis {
  timestamp: string;
  // Summary metrics
  summary: {
    total_boms: number;
    urgent_builds: number;
    components_to_order: number;
    total_component_value: number;
  };
  // The 4 cascade levels
  finished_goods: BuildIntelligence[];
  component_analysis: ComponentIntelligence[];
  // Aggregated purchasing recommendations
  purchasing_recommendations: {
    sku: string;
    name: string;
    vendor: string | null;
    qty_for_independent: number;  // Direct sales need
    qty_for_dependent: number;    // BOM build need
    total_qty: number;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    affected_boms: string[];
  }[];
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Get complete BOM Intelligence - the 4-level cascade analysis
 */
export async function getBOMIntelligence(): Promise<CascadeAnalysis> {
  // 1. Fetch all active BOMs with components
  const { data: boms, error: bomError } = await supabase
    .from('boms')
    .select('finished_sku, name, category, components, is_active')
    .eq('is_active', true);

  if (bomError) throw bomError;
  if (!boms || boms.length === 0) {
    return emptyAnalysis();
  }

  // 2. Fetch inventory data for finished goods AND components
  const allSkus = new Set<string>();
  boms.forEach(bom => {
    allSkus.add(bom.finished_sku);
    const components = bom.components as any[] || [];
    components.forEach(c => allSkus.add(c.sku));
  });

  const { data: inventory, error: invError } = await supabase
    .from('inventory_items')
    .select(`
      sku, name, category, stock, on_order,
      sales_last_30_days, sales_last_90_days,
      vendor_id, unit_cost, lead_time_days,
      reorder_point, reorder_method, is_dropship
    `)
    .in('sku', Array.from(allSkus));

  if (invError) throw invError;

  // Build inventory lookup map
  const inventoryMap = new Map(inventory?.map(i => [i.sku, i]) || []);

  // 3. Fetch vendors for names
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, name');
  const vendorMap = new Map(vendors?.map(v => [v.id, v.name]) || []);

  // 4. Calculate ABC classification for all items
  const abcClassMap = calculateABCClassification(inventory || []);

  // 5. Analyze finished goods (Level 1)
  const finishedGoodsAnalysis = analyzeFinishedGoods(boms, inventoryMap, abcClassMap);

  // 6. Analyze components (Level 2 & 3) - includes dependent demand from BOMs
  const componentAnalysis = analyzeComponents(
    boms,
    inventoryMap,
    vendorMap,
    abcClassMap,
    finishedGoodsAnalysis
  );

  // 7. Generate purchasing recommendations (Level 4)
  const purchasingRecommendations = generatePurchasingRecommendations(
    componentAnalysis,
    finishedGoodsAnalysis
  );

  // 8. Calculate summary
  const summary = {
    total_boms: boms.length,
    urgent_builds: finishedGoodsAnalysis.filter(f => f.action === 'BUILD_URGENT').length,
    components_to_order: purchasingRecommendations.filter(p => p.priority !== 'LOW').length,
    total_component_value: purchasingRecommendations.reduce((sum, p) => {
      const inv = inventoryMap.get(p.sku);
      return sum + (p.total_qty * (inv?.unit_cost || 0));
    }, 0),
  };

  return {
    timestamp: new Date().toISOString(),
    summary,
    finished_goods: finishedGoodsAnalysis,
    component_analysis: componentAnalysis,
    purchasing_recommendations: purchasingRecommendations,
  };
}

/**
 * Calculate ABC classification based on annual $ usage
 */
function calculateABCClassification(inventory: any[]): Map<string, ABCClass> {
  const itemsWithValue = inventory.map(item => {
    const dailyDemand = (item.sales_last_30_days || 0) / 30;
    const unitCost = item.unit_cost || 0;
    const annualValue = dailyDemand * 365 * unitCost;
    return { sku: item.sku, annualValue };
  });

  const sortedByValue = [...itemsWithValue].sort((a, b) => b.annualValue - a.annualValue);
  const totalAnnualValue = sortedByValue.reduce((sum, item) => sum + item.annualValue, 0);

  const abcClassMap = new Map<string, ABCClass>();
  let cumulativeValue = 0;

  for (const item of sortedByValue) {
    cumulativeValue += item.annualValue;
    const cumPct = totalAnnualValue > 0 ? (cumulativeValue / totalAnnualValue) * 100 : 100;
    if (cumPct <= 80) abcClassMap.set(item.sku, 'A');
    else if (cumPct <= 95) abcClassMap.set(item.sku, 'B');
    else abcClassMap.set(item.sku, 'C');
  }

  return abcClassMap;
}

/**
 * Level 1: Analyze Finished Goods (BOM assemblies)
 */
function analyzeFinishedGoods(
  boms: any[],
  inventoryMap: Map<string, any>,
  abcClassMap: Map<string, ABCClass>
): BuildIntelligence[] {
  return boms.map(bom => {
    const finishedInv = inventoryMap.get(bom.finished_sku);
    const components = bom.components as any[] || [];

    // Finished goods metrics
    const finishedStock = finishedInv?.stock || 0;
    const dailyDemand = (finishedInv?.sales_last_30_days || 0) / 30;
    const abcClass = abcClassMap.get(bom.finished_sku) || 'C';

    // Calculate buildable units - limited by component availability
    let buildableUnits = Infinity;
    let limitingComponent: BuildIntelligence['limiting_component'] = null;

    for (const comp of components) {
      const compInv = inventoryMap.get(comp.sku);
      const compStock = compInv?.stock || 0;
      const qtyPer = comp.quantity || 1;

      if (qtyPer > 0) {
        const maxBuilds = Math.floor(compStock / qtyPer);
        if (maxBuilds < buildableUnits) {
          buildableUnits = maxBuilds;
          limitingComponent = {
            sku: comp.sku,
            name: comp.name || comp.sku,
            stock: compStock,
            needed_per_unit: qtyPer,
            max_builds_allowed: maxBuilds,
          };
        }
      }
    }

    if (buildableUnits === Infinity) buildableUnits = 0;

    // Runway calculations
    const totalAvailable = finishedStock + buildableUnits;
    const daysOfStock = dailyDemand > 0 ? Math.floor(finishedStock / dailyDemand) : 999;
    const daysOfBuilds = dailyDemand > 0 ? Math.floor(buildableUnits / dailyDemand) : 0;
    const daysTotal = dailyDemand > 0 ? Math.floor(totalAvailable / dailyDemand) : 999;

    // Calculate component shortfalls for target build quantity
    // Target: Build enough for 30 days of demand
    const targetBuildQty = dailyDemand > 0 ? Math.ceil(dailyDemand * 30) : 0;
    const componentShortfalls: BuildIntelligence['component_shortfalls'] = [];
    const componentsToOrder: BuildIntelligence['components_to_order'] = [];

    for (const comp of components) {
      const compInv = inventoryMap.get(comp.sku);
      const compStock = compInv?.stock || 0;
      const qtyPer = comp.quantity || 1;
      const needed = targetBuildQty * qtyPer;

      if (compStock < needed) {
        const shortfall = needed - compStock;
        const vendorId = compInv?.vendor_id;
        const vendorName = vendorId ? (inventoryMap.get(vendorId) || null) : null;

        componentShortfalls.push({
          sku: comp.sku,
          name: comp.name || comp.sku,
          have: compStock,
          need: needed,
          shortfall,
          vendor: vendorName,
        });

        componentsToOrder.push({
          sku: comp.sku,
          name: comp.name || comp.sku,
          qty_to_order: Math.ceil(shortfall * 1.1), // 10% buffer
          vendor: vendorName,
        });
      }
    }

    // Determine action
    let action: BuildIntelligence['action'];
    let suggestedBuildQty = 0;
    let reason = '';

    if (dailyDemand <= 0) {
      action = 'NO_DEMAND';
      reason = 'No recent sales - no build needed';
    } else if (daysTotal <= 7) {
      action = 'BUILD_URGENT';
      suggestedBuildQty = Math.min(buildableUnits, Math.ceil(dailyDemand * 14));
      reason = `Only ${daysTotal} days of coverage - build immediately`;
    } else if (daysTotal <= 21) {
      action = 'BUILD_SOON';
      suggestedBuildQty = Math.min(buildableUnits, Math.ceil(dailyDemand * 21));
      reason = `${daysTotal} days of coverage - schedule build`;
    } else {
      action = 'ADEQUATE';
      reason = `${daysTotal} days of coverage - adequate`;
    }

    return {
      finished_sku: bom.finished_sku,
      name: bom.name,
      category: bom.category,
      finished_stock: finishedStock,
      buildable_units: buildableUnits,
      total_available: totalAvailable,
      daily_demand: dailyDemand,
      abc_class: abcClass,
      days_of_stock: daysOfStock,
      days_of_builds: daysOfBuilds,
      days_total: daysTotal,
      limiting_component: limitingComponent,
      component_shortfalls: componentShortfalls,
      action,
      suggested_build_qty: suggestedBuildQty,
      components_to_order: componentsToOrder,
      reason,
    };
  })
  .filter(b => b.daily_demand > 0) // Only show items with demand
  .sort((a, b) => a.days_total - b.days_total); // Most critical first
}

/**
 * Level 2 & 3: Analyze Components - includes dependent demand from BOMs
 */
function analyzeComponents(
  boms: any[],
  inventoryMap: Map<string, any>,
  vendorMap: Map<string, string>,
  abcClassMap: Map<string, ABCClass>,
  finishedGoods: BuildIntelligence[]
): ComponentIntelligence[] {
  // Build component -> BOM usage map
  const componentUsageMap = new Map<string, ComponentIntelligence['used_in_boms']>();

  for (const fg of finishedGoods) {
    const bom = boms.find(b => b.finished_sku === fg.finished_sku);
    if (!bom) continue;

    const components = bom.components as any[] || [];
    for (const comp of components) {
      const usage = componentUsageMap.get(comp.sku) || [];
      const componentConsumption = (comp.quantity || 1) * fg.daily_demand;

      usage.push({
        finished_sku: fg.finished_sku,
        finished_name: fg.name,
        quantity_per: comp.quantity || 1,
        bom_daily_demand: fg.daily_demand,
        component_consumption: componentConsumption,
      });

      componentUsageMap.set(comp.sku, usage);
    }
  }

  // Analyze each component
  const componentAnalysis: ComponentIntelligence[] = [];

  for (const [sku, usedInBoms] of componentUsageMap) {
    const inv = inventoryMap.get(sku);
    if (!inv) continue;

    // Skip dropship items
    if (inv.is_dropship) continue;

    // Calculate demands
    const independentDemand = (inv.sales_last_30_days || 0) / 30;
    const dependentDemand = usedInBoms.reduce((sum, u) => sum + u.component_consumption, 0);
    const totalDailyDemand = independentDemand + dependentDemand;

    // Stock position
    const stock = inv.stock || 0;
    const onOrder = inv.on_order || 0;
    const totalPosition = stock + onOrder;

    // Runway
    const daysRemaining = totalDailyDemand > 0 ? Math.floor(totalPosition / totalDailyDemand) : 999;

    // ABC class and safety stock
    const abcClass = abcClassMap.get(sku) || 'C';
    const { z: zScore, level: serviceLevel } = SERVICE_LEVEL_Z_SCORES[abcClass];
    const leadTime = inv.lead_time_days || 14;
    const leadTimeStdDev = leadTime * 0.2;
    const demandStdDev = totalDailyDemand * 0.3;

    const ssResult = calculateSafetyStock(
      abcClass,
      totalDailyDemand,
      demandStdDev,
      leadTime,
      leadTimeStdDev
    );
    const safetyStock = ssResult.safetyStock;
    const rop = calculateReorderPoint(totalDailyDemand, leadTime, safetyStock);

    // Vendor
    const vendorName = vendorMap.get(inv.vendor_id) || null;

    // Action determination
    let action: ComponentIntelligence['action'];
    let suggestedQty = 0;
    let reason = '';

    if (daysRemaining <= 0) {
      action = 'URGENT';
      suggestedQty = Math.ceil((rop - totalPosition) + (totalDailyDemand * leadTime));
      reason = `OUT OF STOCK - immediate order needed`;
    } else if (daysRemaining < 7) {
      action = 'Order Now';
      suggestedQty = Math.ceil((rop - totalPosition) + (totalDailyDemand * leadTime));
      reason = `${daysRemaining} days remaining - order now`;
    } else if (daysRemaining < 21) {
      action = 'Reorder Soon';
      suggestedQty = Math.ceil((rop - totalPosition) + (totalDailyDemand * leadTime));
      reason = `${daysRemaining} days remaining - plan reorder`;
    } else {
      action = 'Adequate';
      reason = `${daysRemaining} days of coverage`;
    }

    componentAnalysis.push({
      sku,
      name: inv.name,
      category: inv.category,
      vendor_name: vendorName,
      stock,
      on_order: onOrder,
      total_position: totalPosition,
      independent_demand: independentDemand,
      dependent_demand: dependentDemand,
      total_daily_demand: totalDailyDemand,
      used_in_boms: usedInBoms,
      days_remaining: daysRemaining,
      safety_stock: Math.round(safetyStock),
      reorder_point: Math.round(rop),
      abc_class: abcClass,
      action,
      suggested_qty: suggestedQty,
      reason,
    });
  }

  return componentAnalysis
    .filter(c => c.total_daily_demand > 0)
    .sort((a, b) => a.days_remaining - b.days_remaining);
}

/**
 * Level 4: Generate unified purchasing recommendations
 */
function generatePurchasingRecommendations(
  componentAnalysis: ComponentIntelligence[],
  finishedGoods: BuildIntelligence[]
): CascadeAnalysis['purchasing_recommendations'] {
  const recommendations: CascadeAnalysis['purchasing_recommendations'] = [];

  for (const comp of componentAnalysis) {
    if (comp.action === 'Adequate') continue;

    // Find all BOMs affected by this component
    const affectedBoms = comp.used_in_boms.map(u => u.finished_sku);

    // Calculate quantities
    const qtyForIndependent = comp.independent_demand > 0
      ? Math.ceil(comp.independent_demand * 30) // 30 days of direct sales
      : 0;

    const qtyForDependent = comp.dependent_demand > 0
      ? Math.ceil(comp.dependent_demand * 30) // 30 days of BOM builds
      : 0;

    const totalQty = Math.max(comp.suggested_qty, qtyForIndependent + qtyForDependent);

    // Priority based on action and impact
    let priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    if (comp.action === 'URGENT') {
      priority = 'CRITICAL';
    } else if (comp.action === 'Order Now') {
      priority = affectedBoms.length > 2 ? 'CRITICAL' : 'HIGH';
    } else if (comp.action === 'Reorder Soon') {
      priority = affectedBoms.length > 2 ? 'HIGH' : 'MEDIUM';
    } else {
      priority = 'LOW';
    }

    recommendations.push({
      sku: comp.sku,
      name: comp.name,
      vendor: comp.vendor_name,
      qty_for_independent: qtyForIndependent,
      qty_for_dependent: qtyForDependent,
      total_qty: totalQty,
      priority,
      affected_boms: affectedBoms,
    });
  }

  return recommendations.sort((a, b) => {
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * Empty analysis result
 */
function emptyAnalysis(): CascadeAnalysis {
  return {
    timestamp: new Date().toISOString(),
    summary: {
      total_boms: 0,
      urgent_builds: 0,
      components_to_order: 0,
      total_component_value: 0,
    },
    finished_goods: [],
    component_analysis: [],
    purchasing_recommendations: [],
  };
}

// ============================================
// DATABASE VIEW FUNCTIONS (Use optimized SQL views)
// ============================================

/**
 * Get buildability summary from optimized database view
 */
export async function getBuildabilitySummary(): Promise<any[]> {
  const { data, error } = await supabase
    .from('mrp_buildability_summary')
    .select('*')
    .order('days_of_coverage', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get purchasing action summary from database view
 */
export async function getPurchasingActionSummary(): Promise<any[]> {
  const { data, error } = await supabase
    .from('mrp_purchasing_action_summary')
    .select('*');

  if (error) throw error;
  return data || [];
}

/**
 * Get BOM intelligence from database view (component-level)
 */
export async function getBOMIntelligenceView(): Promise<any[]> {
  const { data, error } = await supabase
    .from('mrp_bom_intelligence')
    .select('*');

  if (error) throw error;
  return data || [];
}

/**
 * Get component requirements with time-phased analysis
 */
export async function getComponentRequirements(): Promise<any[]> {
  const { data, error } = await supabase
    .from('mrp_component_requirements')
    .select('*')
    .order('days_until_needed', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Regenerate forecasts for finished goods (via database function)
 */
export async function regenerateForecasts(
  horizonWeeks: number = 13,
  lookbackDays: number = 90
): Promise<number> {
  const { data, error } = await supabase.rpc('generate_finished_goods_forecast', {
    p_horizon_weeks: horizonWeeks,
    p_lookback_days: lookbackDays,
  });

  if (error) throw error;
  return data || 0;
}

/**
 * Get purchase recommendations from database view
 */
export async function getPurchaseRecommendations(): Promise<any[]> {
  const { data, error } = await supabase
    .from('mrp_purchase_recommendations')
    .select('*');

  if (error) throw error;
  return data || [];
}

/**
 * Get vendor PO consolidation summary
 */
export async function getVendorPOSummary(): Promise<any[]> {
  const { data, error } = await supabase
    .from('mrp_vendor_po_summary')
    .select('*');

  if (error) throw error;
  return data || [];
}

/**
 * Get MRP dashboard summary metrics
 */
export async function getMRPDashboardSummary(): Promise<any> {
  const { data, error } = await supabase
    .from('mrp_dashboard_summary')
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get seasonal index for a given month and category
 */
export async function getSeasonalIndex(
  month: number,
  category: string = 'default'
): Promise<number> {
  const { data, error } = await supabase
    .from('seasonal_indices')
    .select('index_value')
    .eq('month', month)
    .eq('category', category)
    .single();

  if (error) {
    // Try default category if specific not found
    const { data: defaultData } = await supabase
      .from('seasonal_indices')
      .select('index_value')
      .eq('month', month)
      .eq('category', 'default')
      .single();

    return defaultData?.index_value || 1.0;
  }

  return data?.index_value || 1.0;
}

/**
 * Update finished goods forecast with seasonal adjustments
 * Runs daily via cron or manual trigger
 */
export async function updateFinishedGoodsForecast(): Promise<{
  success: boolean;
  forecastsUpdated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let forecastsUpdated = 0;

  try {
    // 1. Get BOM finished goods with sales velocity
    const { data: boms, error: bomError } = await supabase
      .from('boms')
      .select('finished_sku, name, category')
      .eq('is_active', true);

    if (bomError) throw bomError;

    // 2. Get inventory data for velocity
    const skus = boms?.map(b => b.finished_sku) || [];
    const { data: inventory, error: invError } = await supabase
      .from('inventory_items')
      .select('sku, sales_last_30_days, sales_last_60_days, sales_last_90_days, category')
      .in('sku', skus);

    if (invError) throw invError;

    const inventoryMap = new Map(inventory?.map(i => [i.sku, i]) || []);

    // 3. Generate 13-week rolling forecast for each BOM
    const currentDate = new Date();

    for (const bom of boms || []) {
      const inv = inventoryMap.get(bom.finished_sku);
      if (!inv) continue;

      // Calculate base daily velocity
      const dailyVelocity = (inv.sales_last_30_days || 0) / 30;
      if (dailyVelocity <= 0) continue;

      const category = inv.category || bom.category || 'default';

      // Generate forecast for each week
      for (let week = 0; week < 13; week++) {
        const forecastDate = new Date(currentDate);
        forecastDate.setDate(forecastDate.getDate() + (week * 7));
        // Get start of week (Monday)
        const dayOfWeek = forecastDate.getDay();
        const diff = forecastDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        forecastDate.setDate(diff);

        const forecastMonth = forecastDate.getMonth() + 1;

        // Get seasonal index for forecast period
        const seasonalIndex = await getSeasonalIndex(forecastMonth, category);

        // Calculate adjusted forecast
        const baseForecast = Math.ceil(dailyVelocity * 7); // Weekly
        const adjustedForecast = Math.ceil(baseForecast * seasonalIndex);

        // Upsert forecast
        const { error: upsertError } = await supabase
          .from('finished_goods_forecast')
          .upsert({
            product_id: bom.finished_sku,
            forecast_period: forecastDate.toISOString().split('T')[0],
            base_forecast: adjustedForecast,
            seasonal_index: seasonalIndex,
            forecast_method: 'velocity_seasonal',
            forecast_confidence: dailyVelocity > 1 ? 'high' : dailyVelocity > 0.3 ? 'medium' : 'low',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'product_id,forecast_period' });

        if (upsertError) {
          errors.push(`Error updating forecast for ${bom.finished_sku}: ${upsertError.message}`);
        } else {
          forecastsUpdated++;
        }
      }
    }

    return {
      success: errors.length === 0,
      forecastsUpdated,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      forecastsUpdated,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

// ============================================
// QUICK ACCESS FUNCTIONS
// ============================================

/**
 * Get urgent builds only
 */
export async function getUrgentBuilds(): Promise<BuildIntelligence[]> {
  const analysis = await getBOMIntelligence();
  return analysis.finished_goods.filter(f =>
    f.action === 'BUILD_URGENT' || f.action === 'BUILD_SOON'
  );
}

/**
 * Get component shortfalls for a specific BOM
 */
export async function getBOMShortfalls(finishedSku: string): Promise<{
  bom: BuildIntelligence | null;
  shortfalls: ComponentIntelligence[];
}> {
  const analysis = await getBOMIntelligence();
  const bom = analysis.finished_goods.find(f => f.finished_sku === finishedSku) || null;

  if (!bom) return { bom: null, shortfalls: [] };

  const shortfallSkus = new Set(bom.component_shortfalls.map(s => s.sku));
  const shortfalls = analysis.component_analysis.filter(c => shortfallSkus.has(c.sku));

  return { bom, shortfalls };
}

/**
 * Get components needed across all urgent builds
 */
export async function getUrgentComponentNeeds(): Promise<CascadeAnalysis['purchasing_recommendations']> {
  const analysis = await getBOMIntelligence();
  return analysis.purchasing_recommendations.filter(p =>
    p.priority === 'CRITICAL' || p.priority === 'HIGH'
  );
}

/**
 * Get build recommendation for a single SKU
 */
export async function getBuildRecommendation(finishedSku: string): Promise<BuildIntelligence | null> {
  const analysis = await getBOMIntelligence();
  return analysis.finished_goods.find(f => f.finished_sku === finishedSku) || null;
}

// ============================================
// AUTOMATED SHORTAGE DETECTION & PO CREATION
// ============================================

export interface ShortageCheckResult {
  success: boolean;
  criticalShortages: number;
  draftPOsCreated: number;
  vendorsAlerted: string[];
  errors: string[];
}

export interface DraftPO {
  vendor_name: string;
  items: {
    sku: string;
    description: string;
    quantity: number;
    unit_cost: number;
    estimated_total: number;
    urgency: string;
  }[];
  total_value: number;
  order_by_date: string;
  priority: string;
}

/**
 * Check for critical component shortages and create draft POs
 * Runs every 4 hours via pg_cron or manual trigger
 */
export async function checkComponentShortages(): Promise<ShortageCheckResult> {
  const errors: string[] = [];
  const vendorsAlerted: string[] = [];
  let draftPOsCreated = 0;

  try {
    // 1. Get P1 priority items from purchase recommendations
    const { data: shortages, error: shortageError } = await supabase
      .from('mrp_purchase_recommendations')
      .select('*')
      .in('purchase_priority', ['P1_ORDER_TODAY', 'P1_OVERDUE'])
      .order('urgency_score', { ascending: true });

    if (shortageError) throw shortageError;

    if (!shortages || shortages.length === 0) {
      return {
        success: true,
        criticalShortages: 0,
        draftPOsCreated: 0,
        vendorsAlerted: [],
        errors: [],
      };
    }

    // 2. Group by vendor for efficient ordering
    const byVendor = groupByVendor(shortages);

    // 3. Create draft PO for each vendor with shortages
    for (const [vendorName, items] of Object.entries(byVendor)) {
      if (!vendorName || vendorName === 'null') {
        errors.push(`${items.length} items have no vendor assigned`);
        continue;
      }

      const draftPO = createDraftPOFromShortages(vendorName, items);

      // Insert draft PO into purchase_orders table
      const { error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          vendor_name: vendorName,
          status: 'DRAFT',
          po_type: 'MRP_GENERATED',
          items: draftPO.items,
          total_amount: draftPO.total_value,
          order_date: new Date().toISOString().split('T')[0],
          expected_date: draftPO.order_by_date,
          notes: `Auto-generated from MRP shortage detection. Priority: ${draftPO.priority}`,
          created_at: new Date().toISOString(),
        });

      if (poError) {
        errors.push(`Failed to create draft PO for ${vendorName}: ${poError.message}`);
      } else {
        draftPOsCreated++;
        vendorsAlerted.push(vendorName);
      }
    }

    return {
      success: errors.length === 0,
      criticalShortages: shortages.length,
      draftPOsCreated,
      vendorsAlerted,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      criticalShortages: 0,
      draftPOsCreated: 0,
      vendorsAlerted: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Group shortage items by vendor
 */
function groupByVendor(items: any[]): Record<string, any[]> {
  return items.reduce((acc, item) => {
    const vendor = item.vendor_name || 'null';
    if (!acc[vendor]) acc[vendor] = [];
    acc[vendor].push(item);
    return acc;
  }, {} as Record<string, any[]>);
}

/**
 * Create a draft PO structure from shortage items
 */
function createDraftPOFromShortages(vendorName: string, items: any[]): DraftPO {
  const poItems = items.map(item => ({
    sku: item.component_sku,
    description: item.component_description || item.component_sku,
    quantity: item.suggested_order_qty || 0,
    unit_cost: item.unit_cost || 0,
    estimated_total: (item.suggested_order_qty || 0) * (item.unit_cost || 0),
    urgency: item.purchase_priority,
  }));

  const totalValue = poItems.reduce((sum, item) => sum + item.estimated_total, 0);
  const earliestOrderDate = items.reduce((earliest, item) => {
    if (!item.order_by_date) return earliest;
    const date = new Date(item.order_by_date);
    return date < new Date(earliest) ? item.order_by_date : earliest;
  }, new Date().toISOString().split('T')[0]);

  // Determine overall priority
  const hasOverdue = items.some(i => i.purchase_priority === 'P1_OVERDUE');
  const priority = hasOverdue ? 'P1_OVERDUE' : 'P1_ORDER_TODAY';

  return {
    vendor_name: vendorName,
    items: poItems,
    total_value: totalValue,
    order_by_date: earliestOrderDate,
    priority,
  };
}

// ============================================
// BUILD FEASIBILITY CHECKING
// ============================================

export interface BuildOrder {
  product_sku: string;
  quantity: number;
  requested_date?: string;
}

export interface ComponentStatus {
  sku: string;
  name: string;
  required: number;
  available: number;
  shortage: number;
  canBuild: boolean;
  leadTime: number;
  vendor: string | null;
}

export interface BuildFeasibilityResult {
  feasible: boolean;
  componentStatus: ComponentStatus[];
  shortages: ComponentStatus[];
  earliestBuildDate: string | null;
  recommendation: string;
  totalShortageValue: number;
}

/**
 * Check if a build order is feasible given current component availability
 * Called when production schedules a build
 */
export async function checkBuildFeasibility(buildOrder: BuildOrder): Promise<BuildFeasibilityResult> {
  // 1. Explode the BOM to get components
  const { data: components, error: compError } = await supabase
    .from('mrp_bom_intelligence')
    .select('*')
    .eq('parent_sku', buildOrder.product_sku);

  if (compError) throw compError;

  if (!components || components.length === 0) {
    return {
      feasible: false,
      componentStatus: [],
      shortages: [],
      earliestBuildDate: null,
      recommendation: `No BOM found for SKU ${buildOrder.product_sku}`,
      totalShortageValue: 0,
    };
  }

  // 2. Check each component's availability
  const componentStatus: ComponentStatus[] = [];

  for (const comp of components) {
    const required = buildOrder.quantity * (comp.qty_per_parent || 1);

    // Get current inventory
    const { data: inventory } = await supabase
      .from('inventory_items')
      .select('stock, on_order, reserved_qty')
      .eq('sku', comp.component_sku)
      .single();

    const onHand = inventory?.stock || 0;
    const reserved = inventory?.reserved_qty || 0;
    const available = Math.max(0, onHand - reserved);

    componentStatus.push({
      sku: comp.component_sku,
      name: comp.component_description || comp.component_sku,
      required,
      available,
      shortage: Math.max(0, required - available),
      canBuild: available >= required,
      leadTime: comp.lead_time_days || 14,
      vendor: comp.vendor_name || null,
    });
  }

  // 3. Calculate if build is feasible
  const shortages = componentStatus.filter(c => c.shortage > 0);

  if (shortages.length > 0) {
    // Calculate earliest possible build date based on lead times
    const maxLeadTime = Math.max(...shortages.map(s => s.leadTime));
    const earliestDate = new Date();
    earliestDate.setDate(earliestDate.getDate() + maxLeadTime + 3); // +3 days buffer

    // Calculate total shortage value
    const totalShortageValue = await calculateShortageValue(shortages);

    const shortageList = shortages
      .map(s => `${s.sku}: need ${s.shortage} more`)
      .slice(0, 5)
      .join(', ');
    const moreCount = shortages.length > 5 ? ` (+${shortages.length - 5} more)` : '';

    return {
      feasible: false,
      componentStatus,
      shortages,
      earliestBuildDate: earliestDate.toISOString().split('T')[0],
      recommendation: `Cannot build ${buildOrder.quantity} units until ${formatDate(earliestDate)}. ${shortages.length} components short: ${shortageList}${moreCount}`,
      totalShortageValue,
    };
  }

  return {
    feasible: true,
    componentStatus,
    shortages: [],
    earliestBuildDate: new Date().toISOString().split('T')[0],
    recommendation: `All components available. Proceed with build of ${buildOrder.quantity} units.`,
    totalShortageValue: 0,
  };
}

/**
 * Calculate total value of shortage items
 */
async function calculateShortageValue(shortages: ComponentStatus[]): Promise<number> {
  const skus = shortages.map(s => s.sku);
  const { data: inventory } = await supabase
    .from('inventory_items')
    .select('sku, unit_cost')
    .in('sku', skus);

  const costMap = new Map(inventory?.map(i => [i.sku, i.unit_cost || 0]) || []);

  return shortages.reduce((sum, s) => sum + (s.shortage * (costMap.get(s.sku) || 0)), 0);
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Check multiple build orders at once (batch validation)
 */
export async function checkMultipleBuildsFeasibility(
  buildOrders: BuildOrder[]
): Promise<Map<string, BuildFeasibilityResult>> {
  const results = new Map<string, BuildFeasibilityResult>();

  for (const order of buildOrders) {
    const result = await checkBuildFeasibility(order);
    results.set(order.product_sku, result);
  }

  return results;
}

/**
 * Get optimal build quantity based on component constraints
 * Returns max units that can be built with current inventory
 */
export async function getOptimalBuildQuantity(productSku: string): Promise<{
  maxBuildable: number;
  limitingComponent: ComponentStatus | null;
  allComponentsStatus: ComponentStatus[];
}> {
  // Get BOM components
  const { data: components, error } = await supabase
    .from('mrp_bom_intelligence')
    .select('*')
    .eq('parent_sku', productSku);

  if (error || !components || components.length === 0) {
    return {
      maxBuildable: 0,
      limitingComponent: null,
      allComponentsStatus: [],
    };
  }

  let maxBuildable = Infinity;
  let limitingComponent: ComponentStatus | null = null;
  const allComponentsStatus: ComponentStatus[] = [];

  for (const comp of components) {
    const qtyPer = comp.qty_per_parent || 1;

    const { data: inventory } = await supabase
      .from('inventory_items')
      .select('stock, reserved_qty')
      .eq('sku', comp.component_sku)
      .single();

    const available = Math.max(0, (inventory?.stock || 0) - (inventory?.reserved_qty || 0));
    const possibleBuilds = qtyPer > 0 ? Math.floor(available / qtyPer) : 0;

    const status: ComponentStatus = {
      sku: comp.component_sku,
      name: comp.component_description || comp.component_sku,
      required: qtyPer,
      available,
      shortage: 0,
      canBuild: possibleBuilds > 0,
      leadTime: comp.lead_time_days || 14,
      vendor: comp.vendor_name || null,
    };

    allComponentsStatus.push(status);

    if (possibleBuilds < maxBuildable) {
      maxBuildable = possibleBuilds;
      limitingComponent = status;
    }
  }

  return {
    maxBuildable: maxBuildable === Infinity ? 0 : maxBuildable,
    limitingComponent,
    allComponentsStatus,
  };
}
