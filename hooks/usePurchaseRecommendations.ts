/**
 * usePurchaseRecommendations Hook
 *
 * Fetches MRP purchase recommendations from the database
 * Returns items that need to be ordered, grouped by vendor
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase/client';

export interface PurchaseRecommendation {
  component_sku: string;
  component_description: string;
  component_category: string;
  vendor_name: string | null;
  lead_time_days: number;
  total_shortage: number;
  total_requirement: number;
  earliest_need_date: string;
  order_by_date: string;
  current_stock: number;
  on_order: number;
  min_order_qty: number | null;
  unit_cost: number;
  suggested_order_qty: number;
  estimated_po_value: number;
  blocks_critical_builds: boolean;
  consuming_boms: string[];
  bom_count: number;
  days_until_order_deadline: number;
  urgency_score: number;
  purchase_priority: string;
}

export interface VendorSummary {
  vendor_name: string;
  item_count: number;
  total_units: number;
  total_po_value: number;
  earliest_order_date: string;
  most_urgent_days: number;
  priorities: string[];
  skus_to_order: string[];
  vendor_urgency: string;
}

export interface UsePurchaseRecommendationsReturn {
  data: PurchaseRecommendation[] | null;
  byVendor: Record<string, PurchaseRecommendation[]>;
  vendorSummaries: VendorSummary[] | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  // Summary metrics
  totalPOValue: number;
  criticalCount: number;
  vendorCount: number;
}

export function usePurchaseRecommendations(): UsePurchaseRecommendationsReturn {
  const [data, setData] = useState<PurchaseRecommendation[] | null>(null);
  const [vendorSummaries, setVendorSummaries] = useState<VendorSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRecommendations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch purchase recommendations
      const { data: recommendations, error: recError } = await supabase
        .from('mrp_purchase_recommendations')
        .select('*')
        .order('urgency_score', { ascending: true });

      if (recError) throw recError;

      // Fetch vendor summaries
      const { data: summaries, error: sumError } = await supabase
        .from('mrp_vendor_po_summary')
        .select('*')
        .order('most_urgent_days', { ascending: true });

      if (sumError) throw sumError;

      setData(recommendations || []);
      setVendorSummaries(summaries || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Group by vendor
  const byVendor = useMemo(() => {
    if (!data) return {};
    return data.reduce((acc, item) => {
      const vendor = item.vendor_name || 'Unknown Vendor';
      if (!acc[vendor]) acc[vendor] = [];
      acc[vendor].push(item);
      return acc;
    }, {} as Record<string, PurchaseRecommendation[]>);
  }, [data]);

  // Calculate summary metrics
  const totalPOValue = useMemo(() =>
    data?.reduce((sum, d) => sum + (d.estimated_po_value || 0), 0) || 0,
    [data]
  );

  const criticalCount = useMemo(() =>
    data?.filter(d =>
      d.purchase_priority === 'P1_ORDER_TODAY' ||
      d.purchase_priority === 'P1_OVERDUE'
    ).length || 0,
    [data]
  );

  const vendorCount = useMemo(() =>
    Object.keys(byVendor).length,
    [byVendor]
  );

  return {
    data,
    byVendor,
    vendorSummaries,
    loading,
    error,
    refetch: fetchRecommendations,
    totalPOValue,
    criticalCount,
    vendorCount,
  };
}

export default usePurchaseRecommendations;
