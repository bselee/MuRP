import { supabase } from '../lib/supabase/client';

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
 * Get accurate purchasing advice based on the new rigorous formula
 */
export async function getRigorousPurchasingAdvice() {
    // Get items where Current Stock < Calculated ROP
    // We need to join inventory_items with sku_purchasing_parameters
    // Build query with filters - exclude do_not_reorder items at DB level
    const query = supabase
        .from('inventory_items')
        .select(`
      sku,
      name,
      stock,
      on_order,
      category,
      is_dropship,
      reorder_method,
      sku_purchasing_parameters!inner (
        calculated_reorder_point,
        calculated_safety_stock,
        demand_mean_daily,
        lead_time_mean,
        z_score
      )
    `)
        .eq('status', 'active')
        .neq('category', 'Deprecating')
        .or('is_dropship.is.null,is_dropship.eq.false');

    const { data, error } = await query;

    if (error) throw error;

    // Filter in JS for now (or could create a view)
    // CRITICAL: Stock Intelligence should NEVER show dropship or do_not_reorder items
    return data
        .filter((item: any) => {
            const params = item.sku_purchasing_parameters;
            if (!params || !params.calculated_reorder_point) return false;

            // FILTER 1: Exclude dropship items (explicit flag from database)
            if (item.is_dropship === true) return false;

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

            // FILTER 6: Exclude non-reorderable categories (books, clothing, samples, etc.)
            if (['books', 'book', 'clothing', 'apparel', 'shirts', 'hats', 'merchandise', 'merch',
                 'promotional', 'promo', 'samples', 'sample', 'giveaway', 'gift cards'].includes(category)) {
                return false;
            }

            // Trigger if Available (Stock + OnOrder) < ROP
            return (item.stock + (item.on_order || 0)) < params.calculated_reorder_point;
        })
        .map((item: any) => {
            const params = item.sku_purchasing_parameters;
            const deficit = params.calculated_reorder_point - (item.stock + (item.on_order || 0));
            // Suggested Order: Bring up to Max? or just cover deficit?
            // Usually Order Qty = Max - Pos. Or EOQ.
            // For now, let's suggest ordering enough to cover the deficit + one lead time of demand
            const suggestedQty = Math.ceil(deficit + (params.demand_mean_daily * params.lead_time_mean));

            return {
                sku: item.sku,
                name: item.name,
                current_status: {
                    stock: item.stock,
                    on_order: item.on_order,
                    total_position: item.stock + (item.on_order || 0)
                },
                parameters: {
                    rop: params.calculated_reorder_point,
                    safety_stock: params.calculated_safety_stock,
                    daily_demand: params.demand_mean_daily,
                    lead_time: params.lead_time_mean,
                    service_level: params.z_score === 1.65 ? '95%' : params.z_score === 2.33 ? '99%' : 'Custom'
                },
                recommendation: {
                    action: 'Reorder',
                    quantity: suggestedQty,
                    reason: `Below ROP (${params.calculated_reorder_point.toFixed(0)}) with Service Level ${params.z_score === 1.65 ? '95%' : 'Custom'}`
                }
            };
        });
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
