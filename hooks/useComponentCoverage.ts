/**
 * useComponentCoverage Hook
 *
 * Fetches component coverage timeline data from the MRP system
 * Shows when components will run out over a 13-week horizon
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';

export type CoverageStatus = 'covered' | 'warning' | 'shortage';

export interface ComponentCoverageItem {
  sku: string;
  description: string;
  category: string;
  vendor: string | null;
  currentStock: number;
  onOrder: number;
  dailyDemand: number;
  leadTime: number;
  daysOfCoverage: number;
  runoutDate: string | null;
  weeklyStatus: Record<string, CoverageStatus>;
  // Summary metrics
  firstShortageWeek: string | null;
  weeksUntilShortage: number | null;
}

export interface UseComponentCoverageReturn {
  data: ComponentCoverageItem[] | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  shortageCount: number;
  warningCount: number;
  coveredCount: number;
}

/**
 * Get ISO week string (yyyy-ww format)
 */
function getWeekString(date: Date): string {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-${weekNum.toString().padStart(2, '0')}`;
}

/**
 * Add weeks to a date
 */
function addWeeks(date: Date, weeks: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + weeks * 7);
  return result;
}

export function useComponentCoverage(): UseComponentCoverageReturn {
  const [data, setData] = useState<ComponentCoverageItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCoverage = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch component requirements with time-phased analysis
      const { data: requirements, error: reqError } = await supabase
        .from('mrp_component_requirements')
        .select('*')
        .order('days_until_needed', { ascending: true });

      if (reqError) throw reqError;

      // Get unique components and aggregate their data
      const componentMap = new Map<string, ComponentCoverageItem>();
      const today = new Date();

      for (const req of requirements || []) {
        const existing = componentMap.get(req.component_sku);

        if (!existing) {
          // Calculate daily demand (total requirement / days until period)
          const daysUntil = req.days_until_needed || 7;
          const dailyDemand = daysUntil > 0 ? (req.total_requirement || 0) / daysUntil : 0;

          // Calculate coverage
          const currentStock = req.current_on_hand || 0;
          const onOrder = req.on_order || 0;
          const totalAvailable = currentStock + onOrder;
          const daysOfCoverage = dailyDemand > 0
            ? Math.floor(totalAvailable / dailyDemand)
            : 999;

          // Calculate runout date
          let runoutDate: string | null = null;
          if (daysOfCoverage < 999) {
            const runout = new Date(today);
            runout.setDate(runout.getDate() + daysOfCoverage);
            runoutDate = runout.toISOString().split('T')[0];
          }

          // Generate weekly status for 13 weeks
          const weeklyStatus: Record<string, CoverageStatus> = {};
          let firstShortageWeek: string | null = null;
          let weeksUntilShortage: number | null = null;
          let runningStock = totalAvailable;

          for (let w = 0; w < 13; w++) {
            const weekDate = addWeeks(today, w);
            const weekKey = getWeekString(weekDate);
            const weeklyConsumption = dailyDemand * 7;

            runningStock -= weeklyConsumption;

            if (runningStock <= 0) {
              weeklyStatus[weekKey] = 'shortage';
              if (!firstShortageWeek) {
                firstShortageWeek = weekKey;
                weeksUntilShortage = w;
              }
            } else if (runningStock < weeklyConsumption * 2) {
              weeklyStatus[weekKey] = 'warning';
            } else {
              weeklyStatus[weekKey] = 'covered';
            }
          }

          componentMap.set(req.component_sku, {
            sku: req.component_sku,
            description: req.component_description || req.component_sku,
            category: req.component_category || 'Unknown',
            vendor: req.vendor_name || null,
            currentStock,
            onOrder,
            dailyDemand,
            leadTime: req.lead_time_days || 14,
            daysOfCoverage,
            runoutDate,
            weeklyStatus,
            firstShortageWeek,
            weeksUntilShortage,
          });
        }
      }

      // Convert to array and sort by days of coverage
      const coverageItems = Array.from(componentMap.values())
        .filter(c => c.dailyDemand > 0) // Only show items with demand
        .sort((a, b) => a.daysOfCoverage - b.daysOfCoverage);

      setData(coverageItems);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoverage();
  }, [fetchCoverage]);

  // Calculate summary metrics
  const shortageCount = data?.filter(d => d.weeksUntilShortage !== null && d.weeksUntilShortage <= 4).length || 0;
  const warningCount = data?.filter(d => d.weeksUntilShortage !== null && d.weeksUntilShortage > 4 && d.weeksUntilShortage <= 8).length || 0;
  const coveredCount = data?.filter(d => d.weeksUntilShortage === null || d.weeksUntilShortage > 8).length || 0;

  return {
    data,
    loading,
    error,
    refetch: fetchCoverage,
    shortageCount,
    warningCount,
    coveredCount,
  };
}

export default useComponentCoverage;
