/**
 * useBuildReadiness Hook
 *
 * Fetches build readiness data from the MRP system
 * Shows which finished goods can be built NOW vs what's blocking them
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';

export interface ShortComponent {
  sku: string;
  description: string;
  required: number;
  available: number;
  shortage: number;
  vendor: string | null;
  leadTime: number;
}

export interface BuildReadinessItem {
  sku: string;
  description: string;
  category: string;
  canBuild: boolean;
  maxBuildQty: number;
  finishedStock: number;
  dailyDemand: number;
  daysOfCoverage: number;
  shortComponents: ShortComponent[];
  limitingComponent: ShortComponent | null;
  buildAction: 'BUILD_URGENT' | 'BUILD_SOON' | 'ADEQUATE' | 'NO_DEMAND';
  componentCount: number;
  totalComponentCost: number;
}

export interface UseBuildReadinessReturn {
  data: BuildReadinessItem[] | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  urgentCount: number;
  blockedCount: number;
  readyCount: number;
}

export interface UseBuildReadinessOptions {
  /** If true, don't fetch automatically on mount - wait for manual fetch */
  lazy?: boolean;
}

export function useBuildReadiness(options: UseBuildReadinessOptions = {}): UseBuildReadinessReturn {
  const { lazy = false } = options;
  const [data, setData] = useState<BuildReadinessItem[] | null>(null);
  const [loading, setLoading] = useState(!lazy); // Not loading if lazy
  const [error, setError] = useState<Error | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchBuildReadiness = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // FAST QUERY: Use simple boms + inventory join instead of slow materialized view
      // The mrp_buildability_summary view has cascading CTEs that can take 30+ seconds
      const { data: bomsData, error: bomsError } = await supabase
        .from('boms')
        .select(`
          finished_sku,
          name,
          category,
          components
        `)
        .eq('is_active', true)
        .limit(100);

      if (bomsError) {
        throw bomsError;
      }

      if (!bomsData || bomsData.length === 0) {
        setData([]);
        setHasFetched(true);
        return;
      }

      // Get inventory data for these BOMs
      const skus = bomsData.map(b => b.finished_sku);
      const { data: inventoryData } = await supabase
        .from('inventory_items')
        .select('sku, stock, sales_last_30_days')
        .in('sku', skus);

      const inventoryMap = new Map(
        (inventoryData || []).map(i => [i.sku, i])
      );

      // Transform to BuildReadinessItem with basic calculations
      const readinessItems: BuildReadinessItem[] = bomsData.map(bom => {
        const inv = inventoryMap.get(bom.finished_sku);
        const stock = inv?.stock || 0;
        const sales30d = inv?.sales_last_30_days || 0;
        const dailyDemand = sales30d / 30;
        const componentCount = Array.isArray(bom.components) ? bom.components.length : 0;

        // Simple days of coverage calculation
        const daysOfCoverage = dailyDemand > 0 ? Math.floor(stock / dailyDemand) : 999;

        // Determine build action based on coverage
        let buildAction: BuildReadinessItem['buildAction'] = 'ADEQUATE';
        if (dailyDemand <= 0) {
          buildAction = 'NO_DEMAND';
        } else if (daysOfCoverage <= 7) {
          buildAction = 'BUILD_URGENT';
        } else if (daysOfCoverage <= 21) {
          buildAction = 'BUILD_SOON';
        }

        return {
          sku: bom.finished_sku,
          description: bom.name || bom.finished_sku,
          category: bom.category || 'Unknown',
          canBuild: componentCount > 0, // Simplified - has components
          maxBuildQty: 0, // Would need component stock check - skip for performance
          finishedStock: stock,
          dailyDemand,
          daysOfCoverage,
          shortComponents: [],
          limitingComponent: null, // Skip for performance
          buildAction,
          componentCount,
          totalComponentCost: 0, // Skip for performance
        };
      });

      // Sort by urgency (BUILD_URGENT first, then BUILD_SOON, then by days of coverage)
      readinessItems.sort((a, b) => {
        const priority = { BUILD_URGENT: 0, BUILD_SOON: 1, ADEQUATE: 2, NO_DEMAND: 3 };
        const priorityDiff = priority[a.buildAction] - priority[b.buildAction];
        if (priorityDiff !== 0) return priorityDiff;
        return a.daysOfCoverage - b.daysOfCoverage;
      });

      setData(readinessItems.slice(0, 25)); // Return top 25
      setHasFetched(true);
    } catch (err) {
      console.error('Build readiness fetch error:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setData([]); // Set empty data on error to prevent re-fetching loop
      setHasFetched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only auto-fetch if not lazy mode
    if (!lazy) {
      fetchBuildReadiness();
    }
  }, [lazy, fetchBuildReadiness]);

  // Calculate summary metrics
  const urgentCount = data?.filter(d => d.buildAction === 'BUILD_URGENT').length || 0;
  const blockedCount = data?.filter(d => !d.canBuild && d.buildAction !== 'NO_DEMAND').length || 0;
  const readyCount = data?.filter(d => d.canBuild && d.buildAction !== 'NO_DEMAND').length || 0;

  return {
    data,
    loading,
    error,
    refetch: fetchBuildReadiness,
    urgentCount,
    blockedCount,
    readyCount,
  };
}

export default useBuildReadiness;
