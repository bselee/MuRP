/**
 * Finished Goods Forecast Hooks
 *
 * Data fetching hooks for build forecasts and component requirements.
 * Powers the Build Forecast page with MRP intelligence data.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface FinishedGoodsForecast {
  id: string;
  product_id: string;
  forecast_period: string;
  base_forecast: number;
  sales_order_demand: number;
  safety_stock_target: number;
  promotional_lift: number;
  gross_requirement: number;
  seasonal_index: number;
  forecast_confidence: 'high' | 'medium' | 'low';
  forecast_method: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BuildForecastWithDetails extends FinishedGoodsForecast {
  // BOM details
  bom_name?: string;
  bom_category?: string;
  // Inventory details
  current_stock?: number;
  // Buildability
  buildable_units?: number;
  days_of_coverage?: number;
  build_action?: 'BUILD_URGENT' | 'BUILD_SOON' | 'ADEQUATE' | 'NO_DEMAND';
  limiting_component?: string;
  // Component shortage count
  shortage_count?: number;
  critical_shortage_count?: number;
}

export interface ComponentRequirement {
  id: string;
  parent_sku: string;
  parent_name: string;
  component_sku: string;
  component_name: string;
  required_qty: number;
  available_qty: number;
  shortage_qty: number;
  surplus_qty: number;
  days_until_needed: number;
  lead_time_days: number;
  status: 'CRITICAL' | 'SHORTAGE' | 'COVERED' | 'EXCESS';
  vendor_name?: string;
  unit_cost?: number;
  on_order_qty?: number;
}

export interface PurchaseRecommendation {
  id: string;
  component_sku: string;
  component_name: string;
  vendor_name: string;
  vendor_id?: string;
  urgency_score: number;
  purchase_priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  suggested_order_qty: number;
  unit_cost: number;
  total_cost: number;
  lead_time_days: number;
  blocks_critical_builds: boolean;
  parent_count: number;
  notes?: string;
}

export interface UseFinishedGoodsForecastResult {
  data: BuildForecastWithDetails[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UseComponentRequirementsResult {
  data: ComponentRequirement[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UsePurchaseRecommendationsResult {
  data: PurchaseRecommendation[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Fetch finished goods forecasts with BOM and buildability details
 */
export function useFinishedGoodsForecast(options?: {
  weeksAhead?: number;
  confidenceFilter?: ('high' | 'medium' | 'low')[];
}): UseFinishedGoodsForecastResult {
  const [data, setData] = useState<BuildForecastWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const weeksAhead = options?.weeksAhead ?? 13;
  const confidenceFilter = options?.confidenceFilter;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Calculate date range
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + weeksAhead * 7);

      // Fetch forecasts
      let query = supabase
        .from('finished_goods_forecast')
        .select('*')
        .gte('forecast_period', today.toISOString().split('T')[0])
        .lte('forecast_period', endDate.toISOString().split('T')[0])
        .order('forecast_period', { ascending: true });

      if (confidenceFilter && confidenceFilter.length > 0) {
        query = query.in('forecast_confidence', confidenceFilter);
      }

      const { data: forecasts, error: forecastError } = await query;

      if (forecastError) throw forecastError;

      if (!forecasts || forecasts.length === 0) {
        setData([]);
        return;
      }

      // Get unique product IDs
      const productIds = [...new Set(forecasts.map(f => f.product_id))];

      // Fetch BOM details for these products
      const { data: boms } = await supabase
        .from('boms')
        .select('finished_sku, name, category')
        .in('finished_sku', productIds);

      const bomMap = new Map(boms?.map(b => [b.finished_sku, b]) || []);

      // Fetch buildability summary
      const { data: buildability } = await supabase
        .from('mrp_buildability_summary')
        .select('*')
        .in('parent_sku', productIds);

      const buildabilityMap = new Map(buildability?.map(b => [b.parent_sku, b]) || []);

      // Fetch component requirements to count shortages
      const { data: requirements } = await supabase
        .from('mrp_component_requirements')
        .select('parent_sku, status')
        .in('parent_sku', productIds);

      // Count shortages per product
      const shortageCountMap = new Map<string, { total: number; critical: number }>();
      requirements?.forEach(r => {
        const current = shortageCountMap.get(r.parent_sku) || { total: 0, critical: 0 };
        if (r.status === 'CRITICAL' || r.status === 'SHORTAGE') {
          current.total++;
          if (r.status === 'CRITICAL') current.critical++;
        }
        shortageCountMap.set(r.parent_sku, current);
      });

      // Fetch current inventory levels
      const { data: inventory } = await supabase
        .from('inventory_items')
        .select('sku, quantity_on_hand')
        .in('sku', productIds);

      const inventoryMap = new Map(inventory?.map(i => [i.sku, i.quantity_on_hand]) || []);

      // Combine all data
      const enrichedForecasts: BuildForecastWithDetails[] = forecasts.map(f => {
        const bom = bomMap.get(f.product_id);
        const build = buildabilityMap.get(f.product_id);
        const shortages = shortageCountMap.get(f.product_id);

        return {
          ...f,
          bom_name: bom?.name,
          bom_category: bom?.category,
          current_stock: inventoryMap.get(f.product_id) ?? 0,
          buildable_units: build?.buildable_units ?? 0,
          days_of_coverage: build?.days_of_coverage ?? 0,
          build_action: build?.build_action as any,
          limiting_component: build?.limiting_component_name,
          shortage_count: shortages?.total ?? 0,
          critical_shortage_count: shortages?.critical ?? 0,
        };
      });

      setData(enrichedForecasts);
    } catch (err) {
      console.error('[useFinishedGoodsForecast] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch forecasts'));
    } finally {
      setLoading(false);
    }
  }, [weeksAhead, confidenceFilter?.join(',')]);

  useEffect(() => {
    fetchData();

    // Real-time subscription
    const channel = supabase
      .channel('forecast-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'finished_goods_forecast' },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Fetch component requirements for upcoming builds (shortages)
 */
export function useComponentRequirements(options?: {
  statusFilter?: ('CRITICAL' | 'SHORTAGE' | 'COVERED' | 'EXCESS')[];
  productFilter?: string[];
}): UseComponentRequirementsResult {
  const [data, setData] = useState<ComponentRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const statusFilter = options?.statusFilter;
  const productFilter = options?.productFilter;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('mrp_component_requirements')
        .select('*')
        .order('days_until_needed', { ascending: true })
        .order('shortage_qty', { ascending: false });

      if (statusFilter && statusFilter.length > 0) {
        query = query.in('status', statusFilter);
      }

      if (productFilter && productFilter.length > 0) {
        query = query.in('parent_sku', productFilter);
      }

      const { data: requirements, error: reqError } = await query;

      if (reqError) throw reqError;

      // Get component inventory details
      const componentSkus = [...new Set(requirements?.map(r => r.component_sku) || [])];

      const { data: inventory } = await supabase
        .from('inventory_items')
        .select('sku, name, vendor, unit_cost')
        .in('sku', componentSkus);

      const inventoryMap = new Map(inventory?.map(i => [i.sku, i]) || []);

      // Get on-order quantities from reorder_queue
      const { data: onOrder } = await supabase
        .from('reorder_queue')
        .select('sku, quantity')
        .in('sku', componentSkus)
        .eq('status', 'pending');

      const onOrderMap = new Map<string, number>();
      onOrder?.forEach(o => {
        const current = onOrderMap.get(o.sku) || 0;
        onOrderMap.set(o.sku, current + o.quantity);
      });

      const enriched: ComponentRequirement[] = (requirements || []).map(r => {
        const inv = inventoryMap.get(r.component_sku);
        return {
          ...r,
          component_name: inv?.name || r.component_sku,
          vendor_name: inv?.vendor,
          unit_cost: inv?.unit_cost,
          on_order_qty: onOrderMap.get(r.component_sku) || 0,
        };
      });

      setData(enriched);
    } catch (err) {
      console.error('[useComponentRequirements] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch requirements'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter?.join(','), productFilter?.join(',')]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Fetch purchase recommendations for component shortages
 */
export function usePurchaseRecommendations(options?: {
  priorityFilter?: ('CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW')[];
  vendorFilter?: string;
}): UsePurchaseRecommendationsResult {
  const [data, setData] = useState<PurchaseRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const priorityFilter = options?.priorityFilter;
  const vendorFilter = options?.vendorFilter;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('mrp_purchase_recommendations')
        .select('*')
        .order('urgency_score', { ascending: false });

      if (priorityFilter && priorityFilter.length > 0) {
        query = query.in('purchase_priority', priorityFilter);
      }

      if (vendorFilter) {
        query = query.ilike('vendor_name', `%${vendorFilter}%`);
      }

      const { data: recommendations, error: recError } = await query;

      if (recError) throw recError;

      setData(recommendations || []);
    } catch (err) {
      console.error('[usePurchaseRecommendations] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch recommendations'));
    } finally {
      setLoading(false);
    }
  }, [priorityFilter?.join(','), vendorFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Get aggregated forecast summary for dashboard
 */
export function useForecastSummary() {
  const { data: forecasts, loading, error } = useFinishedGoodsForecast({ weeksAhead: 4 });

  const summary = useMemo(() => {
    if (!forecasts.length) return null;

    const totalGrossRequirement = forecasts.reduce((sum, f) => sum + f.gross_requirement, 0);
    const avgSeasonalIndex = forecasts.reduce((sum, f) => sum + f.seasonal_index, 0) / forecasts.length;

    const byAction = {
      BUILD_URGENT: forecasts.filter(f => f.build_action === 'BUILD_URGENT').length,
      BUILD_SOON: forecasts.filter(f => f.build_action === 'BUILD_SOON').length,
      ADEQUATE: forecasts.filter(f => f.build_action === 'ADEQUATE').length,
      NO_DEMAND: forecasts.filter(f => f.build_action === 'NO_DEMAND').length,
    };

    const byConfidence = {
      high: forecasts.filter(f => f.forecast_confidence === 'high').length,
      medium: forecasts.filter(f => f.forecast_confidence === 'medium').length,
      low: forecasts.filter(f => f.forecast_confidence === 'low').length,
    };

    const totalShortages = forecasts.reduce((sum, f) => sum + (f.shortage_count || 0), 0);
    const criticalShortages = forecasts.reduce((sum, f) => sum + (f.critical_shortage_count || 0), 0);

    return {
      totalProducts: new Set(forecasts.map(f => f.product_id)).size,
      totalGrossRequirement,
      avgSeasonalIndex: avgSeasonalIndex.toFixed(2),
      byAction,
      byConfidence,
      totalShortages,
      criticalShortages,
    };
  }, [forecasts]);

  return { summary, loading, error };
}
