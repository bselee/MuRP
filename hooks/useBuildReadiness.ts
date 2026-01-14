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
      // Fetch from mrp_buildability_summary view
      const { data: buildability, error: buildError } = await supabase
        .from('mrp_buildability_summary')
        .select('*')
        .order('days_of_coverage', { ascending: true });

      if (buildError) throw buildError;

      // For each item, get component shortfalls
      const readinessItems: BuildReadinessItem[] = [];

      for (const item of buildability || []) {
        // Get component details from mrp_bom_intelligence
        const { data: components } = await supabase
          .from('mrp_bom_intelligence')
          .select('*')
          .eq('parent_sku', item.parent_sku);

        // Calculate shortages
        const shortComponents: ShortComponent[] = [];
        let limitingComponent: ShortComponent | null = null;

        for (const comp of components || []) {
          const available = comp.component_stock || 0;
          const qtyPer = comp.qty_per_parent || 1;

          // Calculate how many we need for 30 days of builds
          const dailyDemand = item.daily_demand || 0;
          const requiredFor30Days = Math.ceil(dailyDemand * 30 * qtyPer);
          const shortage = Math.max(0, requiredFor30Days - available);

          if (shortage > 0) {
            const shortComp: ShortComponent = {
              sku: comp.component_sku,
              description: comp.component_description || comp.component_sku,
              required: requiredFor30Days,
              available,
              shortage,
              vendor: comp.vendor_name || null,
              leadTime: comp.lead_time_days || 14,
            };
            shortComponents.push(shortComp);
          }

          // Track limiting component
          if (comp.component_sku === item.limiting_component_sku) {
            limitingComponent = {
              sku: comp.component_sku,
              description: comp.component_description || comp.component_sku,
              required: qtyPer,
              available,
              shortage: 0,
              vendor: comp.vendor_name || null,
              leadTime: comp.lead_time_days || 14,
            };
          }
        }

        readinessItems.push({
          sku: item.parent_sku,
          description: item.parent_description || item.parent_sku,
          category: item.parent_category || 'Unknown',
          canBuild: item.buildable_units > 0,
          maxBuildQty: item.buildable_units || 0,
          finishedStock: item.finished_stock || 0,
          dailyDemand: item.daily_demand || 0,
          daysOfCoverage: item.days_of_coverage || 999,
          shortComponents: shortComponents.sort((a, b) => b.shortage - a.shortage),
          limitingComponent,
          buildAction: item.build_action as BuildReadinessItem['buildAction'],
          componentCount: item.total_components || 0,
          totalComponentCost: item.avg_component_cost || 0,
        });
      }

      setData(readinessItems);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
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
