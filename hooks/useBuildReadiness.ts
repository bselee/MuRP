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

export function useBuildReadiness(): UseBuildReadinessReturn {
  const [data, setData] = useState<BuildReadinessItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchBuildReadiness = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Single query to get buildability summary - no N+1 queries
      const { data: buildability, error: buildError } = await supabase
        .from('mrp_buildability_summary')
        .select('*')
        .order('days_of_coverage', { ascending: true })
        .limit(50); // Limit to prevent overload

      if (buildError) {
        // If view doesn't exist, return empty data gracefully
        if (buildError.code === '42P01' || buildError.message?.includes('does not exist')) {
          console.warn('MRP views not yet created - showing empty build metrics');
          setData([]);
          return;
        }
        throw buildError;
      }

      // Transform to BuildReadinessItem without extra queries
      const readinessItems: BuildReadinessItem[] = (buildability || []).map(item => ({
        sku: item.parent_sku,
        description: item.parent_description || item.parent_sku,
        category: item.parent_category || 'Unknown',
        canBuild: (item.buildable_units || 0) > 0,
        maxBuildQty: item.buildable_units || 0,
        finishedStock: item.finished_stock || 0,
        dailyDemand: item.daily_demand || 0,
        daysOfCoverage: item.days_of_coverage || 999,
        shortComponents: [], // Skip detailed component queries for performance
        limitingComponent: item.limiting_component_sku ? {
          sku: item.limiting_component_sku,
          description: item.limiting_component_name || item.limiting_component_sku,
          required: 0,
          available: item.limiting_component_builds || 0,
          shortage: 0,
          vendor: null,
          leadTime: 14,
        } : null,
        buildAction: (item.build_action || 'NO_DEMAND') as BuildReadinessItem['buildAction'],
        componentCount: item.total_components || 0,
        totalComponentCost: item.avg_component_cost || 0,
      }));

      setData(readinessItems);
    } catch (err) {
      console.error('Build readiness fetch error:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setData([]); // Set empty data on error to prevent re-fetching loop
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBuildReadiness();
  }, [fetchBuildReadiness]);

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
