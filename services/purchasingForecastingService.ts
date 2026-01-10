import { supabase } from '../lib/supabase/client';
import {
  SERVICE_LEVEL_Z_SCORES,
  calculateSafetyStock as calculateAdvancedSafetyStock,
  calculateReorderPoint as calculateAdvancedROP,
  type ABCClass,
} from './advancedForecastingEngine';

export interface Forecast {
    id: string;
    sku: string;
    generated_at: string;
    forecast_period_start: string;
    forecast_period_end: string;
    predicted_quantity: number;
    actual_quantity?: number;
    error_pct?: number;
    method_used: string;
}

export interface PurchasingParameter {
    sku: string;
    target_service_level: number;
    z_score: number;
    demand_std_dev: number;
    demand_mean_daily: number;
    lead_time_mean: number;
    lead_time_std_dev: number;
    calculated_safety_stock: number;
    calculated_reorder_point: number;
    is_frozen: boolean;
    last_calculated_at: string;
}

export interface SeasonalityIndex {
    id: string;
    scope_type: string;
    scope_value: string;
    month_of_year: number;
    seasonality_factor: number;
}

/**
 * Update purchasing parameters (Safety Stock, ROP) for a SKU
 * using the "Perfection" formula in the database
 */
export async function updateSkuPurchasingParameters(sku: string) {
    const { error } = await supabase.rpc('calculate_sku_purchasing_parameters', {
        p_sku: sku
    });
    if (error) throw error;
}

/**
 * Get accurate purchasing advice using inventory data directly
 * Enhanced to include: Days Remaining, Linked PO, Est Receive Date, Item Type
 * Works without sku_purchasing_parameters - calculates from sales_30_days
 */
export async function getRigorousPurchasingAdvice() {
    // Query inventory directly - no inner join dependency
    const { data, error } = await supabase
        .from('inventory_items')
        .select(`
      sku,
      name,
      stock,
      on_order,
      category,
      is_dropship,
      reorder_method,
      vendor_id,
      sales_last_30_days,
      sales_last_90_days,
      reorder_point,
      unit_cost
    `)
        .eq('status', 'active')
        .neq('category', 'Deprecating')
        .or('is_dropship.is.null,is_dropship.eq.false');

    if (error) throw error;
    if (!data || data.length === 0) return [];

    // Fetch open POs to link SKUs to their expected delivery
    // Finale status values: Committed = open/submitted, Draft = not yet sent
    const { data: openPOs } = await supabase
        .from('finale_purchase_orders')
        .select('id, order_id, status, expected_date, line_items')
        .in('status', ['Committed', 'Draft']);

    // Build SKU -> PO mapping
    const skuToPO = new Map<string, { poId: string; poNumber: string; expectedDate: string | null }>();
    openPOs?.forEach(po => {
        const lineItems = po.line_items as any[] || [];
        lineItems.forEach(item => {
            const sku = item.product_id || item.sku || item.productId;
            if (sku && !skuToPO.has(sku)) {
                skuToPO.set(sku, {
                    poId: po.id,
                    poNumber: po.order_id,
                    expectedDate: po.expected_date
                });
            }
        });
    });

    // Fetch BOM items to determine manufactured vs purchased
    const { data: bomItems } = await supabase
        .from('bom_items')
        .select('sku')
        .eq('is_finished_product', true);

    const manufacturedSkus = new Set(bomItems?.map(b => b.sku) || []);

    // Fetch vendors for names and dropship status
    const { data: vendors } = await supabase
        .from('vendors')
        .select('id, name, is_dropship_vendor');

    const vendorMap = new Map(vendors?.map(v => [v.id, v.name]) || []);
    const dropshipVendors = new Set(vendors?.filter(v => v.is_dropship_vendor).map(v => v.id) || []);

    // Calculate ABC classification for all items based on annual $ usage
    // This determines service level z-scores for safety stock
    const itemsWithValue = data.map((item: any) => {
        const dailyDemand = (item.sales_last_30_days || 0) / 30;
        const unitCost = item.unit_cost || 0;
        const annualValue = dailyDemand * 365 * unitCost;
        return { ...item, dailyDemand, unitCost, annualValue };
    });

    // Sort by annual value for ABC classification
    const sortedByValue = [...itemsWithValue].sort((a, b) => b.annualValue - a.annualValue);
    const totalAnnualValue = sortedByValue.reduce((sum, item) => sum + item.annualValue, 0);

    // Build ABC class map: A=top 80%, B=next 15%, C=remaining 5%
    const abcClassMap = new Map<string, ABCClass>();
    let cumulativeValue = 0;
    for (const item of sortedByValue) {
        cumulativeValue += item.annualValue;
        const cumPct = totalAnnualValue > 0 ? (cumulativeValue / totalAnnualValue) * 100 : 100;
        if (cumPct <= 80) abcClassMap.set(item.sku, 'A');
        else if (cumPct <= 95) abcClassMap.set(item.sku, 'B');
        else abcClassMap.set(item.sku, 'C');
    }

    // Filter and process items
    return data
        .filter((item: any) => {
            // FILTER 1: Exclude dropship items (explicit flag from database)
            if (item.is_dropship === true) return false;

            // FILTER 1b: Exclude items from dropship vendors
            if (item.vendor_id && dropshipVendors.has(item.vendor_id)) return false;

            // FILTER 2: Exclude "Do Not Reorder" items (from Finale reorder method)
            if (item.reorder_method === 'do_not_reorder') return false;

            // FILTER 3: Exclude dropship items by category
            const category = (item.category || '').toLowerCase().trim();
            if (['dropship', 'drop ship', 'dropshipped', 'drop shipped', 'ds', 'drop-ship'].includes(category)) {
                return false;
            }

            // FILTER 4: Exclude dropship items by name pattern
            const name = (item.name || '').toLowerCase();
            if (name.includes('dropship') || name.includes('drop ship') || name.includes('drop-ship')) {
                return false;
            }

            // FILTER 5: Exclude Deprecating/Deprecated category (case-insensitive)
            if (['deprecating', 'deprecated', 'discontinued'].includes(category)) return false;

            // FILTER 6: Exclude non-reorderable categories
            if (['books', 'book', 'clothing', 'apparel', 'shirts', 'hats', 'merchandise', 'merch',
                 'promotional', 'promo', 'samples', 'sample', 'giveaway', 'gift cards'].includes(category)) {
                return false;
            }

            // Calculate daily demand from sales_last_30_days
            const dailyDemand = (item.sales_last_30_days || 0) / 30;

            // If no sales, skip (no demand = not at risk)
            if (dailyDemand <= 0) return false;

            // Calculate available stock
            const available = (item.stock || 0) + (item.on_order || 0);

            // Calculate days until stockout
            const daysRemaining = available / dailyDemand;

            // Show items with less than 30 days of stock remaining
            return daysRemaining < 30;
        })
        .map((item: any) => {
            // Calculate daily demand
            const dailyDemand = (item.sales_last_30_days || 0) / 30;
            const availableStock = (item.stock || 0) + (item.on_order || 0);
            const daysRemaining = dailyDemand > 0 ? Math.floor(availableStock / dailyDemand) : 999;

            // Get ABC class for this item (determines service level)
            const abcClass = abcClassMap.get(item.sku) || 'C';
            const { z: zScore, level: serviceLevel } = SERVICE_LEVEL_Z_SCORES[abcClass];

            // Lead time with estimated variability
            const leadTime = item.lead_time_days || 14; // Default 14 days
            const leadTimeStdDev = leadTime * 0.2; // 20% variability estimate

            // Calculate demand variability from 30 vs 90 day sales
            const sales30 = item.sales_last_30_days || 0;
            const sales90 = item.sales_last_90_days || 0;
            const daily30 = sales30 / 30;
            const daily90 = sales90 / 90;
            // Estimate demand std dev from difference between periods
            const demandStdDev = daily90 > 0 ? Math.abs(daily30 - daily90) * 1.5 : dailyDemand * 0.3;

            // Calculate safety stock using ABC-based service levels
            // Formula: SS = z × √(LT × σ_demand² + D² × σ_LT²)
            const ssResult = calculateAdvancedSafetyStock(
                abcClass,
                dailyDemand,
                demandStdDev,
                leadTime,
                leadTimeStdDev
            );
            const safetyStock = ssResult.safetyStock;

            // Calculate ROP using forecasted demand
            // Use Finale reorder_point if available, otherwise calculate
            const rop = item.reorder_point || calculateAdvancedROP(dailyDemand, leadTime, safetyStock);

            // Suggested order quantity
            const deficit = Math.max(0, rop - availableStock);
            const suggestedQty = Math.ceil(deficit + (dailyDemand * leadTime));

            // Get linked PO info
            const poInfo = skuToPO.get(item.sku);

            // Determine item type
            const itemType = manufacturedSkus.has(item.sku) ? 'Manufactured' : 'Purchased';

            // Get vendor name
            const vendorName = vendorMap.get(item.vendor_id) || 'Unknown';

            return {
                sku: item.sku,
                name: item.name,
                vendor_name: vendorName,
                vendor_id: item.vendor_id,
                item_type: itemType,
                days_remaining: daysRemaining,
                linked_po: poInfo ? {
                    po_id: poInfo.poId,
                    po_number: poInfo.poNumber,
                    expected_date: poInfo.expectedDate
                } : null,
                current_status: {
                    stock: item.stock || 0,
                    on_order: item.on_order || 0,
                    total_position: availableStock
                },
                parameters: {
                    rop: rop,
                    safety_stock: safetyStock,
                    daily_demand: dailyDemand,
                    lead_time: leadTime,
                    service_level: `${Math.round(serviceLevel * 100)}%`,
                    abc_class: abcClass,
                    z_score: zScore,
                },
                recommendation: {
                    action: daysRemaining <= 0 ? 'URGENT' : daysRemaining < 7 ? 'Order Now' : 'Reorder Soon',
                    quantity: suggestedQty,
                    reason: daysRemaining <= 0
                        ? `OUT OF STOCK - ${Math.abs(daysRemaining)} days overdue`
                        : `${daysRemaining} days remaining at current velocity`
                }
            };
        })
        // Sort by days remaining (most critical first)
        .sort((a, b) => a.days_remaining - b.days_remaining);
}


/**
 * Get Forecast Accuracy Metrics
 */
export async function getForecastAccuracyMetrics() {
    const { data, error } = await supabase
        .from('forecasts')
        .select('*')
        .not('actual_quantity', 'is', null)
        .order('forecast_period_end', { ascending: false })
        .limit(100);

    if (error) throw error;

    // Calculate MAPE globally or per category if we had category info
    // For now return raw list
    return data;
}

export default {
    updateSkuPurchasingParameters,
    getRigorousPurchasingAdvice,
    getForecastAccuracyMetrics
};
