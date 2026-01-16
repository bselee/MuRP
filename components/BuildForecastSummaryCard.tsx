/**
 * BuildForecastSummaryCard
 *
 * ACTIONABLE production planning card showing:
 * - Component shortages blocking builds
 * - What needs to be ordered NOW
 * - Quick access to Build Forecast page for details
 */

import React, { useState, useEffect } from 'react';
import { useTheme } from './ThemeProvider';
import {
  WrenchScrewdriverIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowRightIcon,
  PackageIcon,
  TruckIcon,
} from './icons';
import { supabase } from '../lib/supabase/client';

interface ShortageInfo {
  componentSku: string;
  componentName: string;
  shortageQty: number;
  blocksBuilds: number;
  vendorName: string | null;
  leadTimeDays: number;
  urgency: 'CRITICAL' | 'SHORTAGE' | 'COVERED';
}

interface BuildReadiness {
  totalBuildsPlanned: number;
  buildsReady: number;
  buildsBlocked: number;
  criticalShortages: number;
  totalShortages: number;
  topShortages: ShortageInfo[];
  calendarBuilds: number;
}

interface BuildForecastSummaryCardProps {
  onNavigateToBOMs?: () => void;
  onNavigateToBuilds?: () => void;
  onNavigateToShortages?: () => void;
  expanded?: boolean;
}

const BuildForecastSummaryCard: React.FC<BuildForecastSummaryCardProps> = ({
  onNavigateToBOMs,
  onNavigateToBuilds,
  onNavigateToShortages,
  expanded: defaultExpanded = false,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState<BuildReadiness | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Get build forecasts for next 4 weeks
        const today = new Date();
        const fourWeeksOut = new Date(today);
        fourWeeksOut.setDate(fourWeeksOut.getDate() + 28);

        // 1. Get forecast counts
        const { data: forecasts, error: forecastError } = await supabase
          .from('finished_goods_forecast')
          .select('product_id, base_forecast, forecast_method')
          .gte('forecast_period', today.toISOString().split('T')[0])
          .lte('forecast_period', fourWeeksOut.toISOString().split('T')[0]);

        if (forecastError) {
          console.error('[BuildForecastSummaryCard] Forecast query error:', forecastError);
        }

        const forecastProducts = new Set((forecasts || []).map(f => f.product_id));
        const calendarBuilds = (forecasts || []).filter(f =>
          f.forecast_method?.includes('google_calendar')
        ).length;

        // 2. Get buildability summary to know what's ready vs blocked
        const { data: buildability, error: buildError } = await supabase
          .from('mrp_buildability_summary')
          .select('parent_sku, buildable_units, build_action, limiting_component_sku, limiting_component_name')
          .in('parent_sku', Array.from(forecastProducts));

        if (buildError) {
          console.warn('[BuildForecastSummaryCard] Buildability query error:', buildError.message);
        }

        // 3. Get component shortages
        const { data: shortages, error: shortageError } = await supabase
          .from('mrp_component_requirements')
          .select('component_sku, component_description, shortage_qty, status, vendor_name, lead_time_days, parent_count')
          .in('status', ['CRITICAL', 'SHORTAGE'])
          .gt('shortage_qty', 0)
          .order('shortage_qty', { ascending: false })
          .limit(10);

        if (shortageError) {
          console.warn('[BuildForecastSummaryCard] Shortage query error:', shortageError.message);
        }

        // Calculate readiness
        const buildsReady = (buildability || []).filter(b =>
          b.build_action === 'ADEQUATE' || b.buildable_units > 0
        ).length;

        const buildsBlocked = (buildability || []).filter(b =>
          b.build_action === 'BUILD_URGENT' || b.buildable_units === 0
        ).length;

        const criticalShortages = (shortages || []).filter(s => s.status === 'CRITICAL').length;

        // Aggregate shortages by component (may have duplicates across periods)
        const shortageMap = new Map<string, ShortageInfo>();
        (shortages || []).forEach(s => {
          const existing = shortageMap.get(s.component_sku);
          if (!existing || s.shortage_qty > existing.shortageQty) {
            shortageMap.set(s.component_sku, {
              componentSku: s.component_sku,
              componentName: s.component_description || s.component_sku,
              shortageQty: s.shortage_qty,
              blocksBuilds: s.parent_count || 1,
              vendorName: s.vendor_name,
              leadTimeDays: s.lead_time_days || 14,
              urgency: s.status as 'CRITICAL' | 'SHORTAGE' | 'COVERED',
            });
          }
        });

        const topShortages = Array.from(shortageMap.values())
          .sort((a, b) => {
            // Critical first, then by shortage qty
            if (a.urgency === 'CRITICAL' && b.urgency !== 'CRITICAL') return -1;
            if (b.urgency === 'CRITICAL' && a.urgency !== 'CRITICAL') return 1;
            return b.shortageQty - a.shortageQty;
          })
          .slice(0, 5);

        setReadiness({
          totalBuildsPlanned: forecastProducts.size,
          buildsReady,
          buildsBlocked,
          criticalShortages,
          totalShortages: shortageMap.size,
          topShortages,
          calendarBuilds,
        });
      } catch (error) {
        console.error('[BuildForecastSummaryCard] Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const cardClass = isDark
    ? 'bg-gray-800/50 border-gray-700'
    : 'bg-white border-gray-200 shadow-sm';

  // Determine header color based on status
  const getHeaderClass = () => {
    if (!readiness) return isDark ? 'bg-gray-700' : 'bg-gray-100';
    if (readiness.criticalShortages > 0) {
      return isDark ? 'bg-red-900/40 border-red-800/50' : 'bg-red-50 border-red-200';
    }
    if (readiness.totalShortages > 0) {
      return isDark ? 'bg-amber-900/30 border-amber-800/50' : 'bg-amber-50 border-amber-200';
    }
    return isDark ? 'bg-emerald-900/30 border-emerald-800/50' : 'bg-emerald-50 border-emerald-200';
  };

  const getStatusIcon = () => {
    if (!readiness) return <WrenchScrewdriverIcon className="w-5 h-5 text-gray-400" />;
    if (readiness.criticalShortages > 0) {
      return <ExclamationCircleIcon className="w-5 h-5 text-red-400" />;
    }
    if (readiness.totalShortages > 0) {
      return <AlertTriangleIcon className="w-5 h-5 text-amber-400" />;
    }
    return <CheckCircleIcon className="w-5 h-5 text-emerald-400" />;
  };

  const getStatusText = () => {
    if (!readiness) return 'Loading...';
    if (readiness.criticalShortages > 0) {
      return `${readiness.criticalShortages} critical shortage${readiness.criticalShortages !== 1 ? 's' : ''} - ORDER NOW`;
    }
    if (readiness.totalShortages > 0) {
      return `${readiness.totalShortages} component${readiness.totalShortages !== 1 ? 's' : ''} need ordering`;
    }
    if (readiness.totalBuildsPlanned === 0) {
      return 'No builds scheduled';
    }
    return 'All components in stock';
  };

  if (loading) {
    return (
      <div className={`rounded-xl border ${cardClass} p-4`}>
        <div className="animate-pulse flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
          <div className="flex-1">
            <div className={`h-4 w-32 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className={`h-3 w-48 rounded mt-2 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
          </div>
        </div>
      </div>
    );
  }

  if (!readiness || readiness.totalBuildsPlanned === 0) {
    return (
      <div className={`rounded-xl border ${cardClass} p-4`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <WrenchScrewdriverIcon className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          </div>
          <div className="flex-1">
            <h3 className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Production Readiness
            </h3>
            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              No builds scheduled for next 4 weeks
            </p>
          </div>
          {onNavigateToBuilds && (
            <button
              onClick={onNavigateToBuilds}
              className={`text-xs font-medium ${isDark ? 'text-purple-400 hover:text-purple-300' : 'text-purple-600 hover:text-purple-700'}`}
            >
              View Forecast →
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${cardClass} overflow-hidden`}>
      {/* Header - Always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full p-4 ${getHeaderClass()} border-b flex items-center justify-between hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isDark ? 'bg-black/20' : 'bg-white/50'}`}>
            {getStatusIcon()}
          </div>
          <div className="text-left">
            <h3 className={`text-sm font-semibold ${
              readiness.criticalShortages > 0
                ? isDark ? 'text-red-200' : 'text-red-800'
                : readiness.totalShortages > 0
                  ? isDark ? 'text-amber-200' : 'text-amber-800'
                  : isDark ? 'text-emerald-200' : 'text-emerald-800'
            }`}>
              Production Readiness
            </h3>
            <p className={`text-xs ${
              readiness.criticalShortages > 0
                ? isDark ? 'text-red-300/70' : 'text-red-600/70'
                : readiness.totalShortages > 0
                  ? isDark ? 'text-amber-300/70' : 'text-amber-600/70'
                  : isDark ? 'text-emerald-300/70' : 'text-emerald-600/70'
            }`}>
              {getStatusText()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Quick Stats */}
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              isDark ? 'bg-black/20 text-gray-300' : 'bg-white/70 text-gray-700'
            }`}>
              {readiness.totalBuildsPlanned} products
            </span>
            {readiness.calendarBuilds > 0 && (
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                isDark ? 'bg-purple-900/50 text-purple-300' : 'bg-purple-100 text-purple-700'
              }`}>
                {readiness.calendarBuilds} from calendar
              </span>
            )}
          </div>
          {expanded ? (
            <ChevronUpIcon className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`} />
          ) : (
            <ChevronDownIcon className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`} />
          )}
        </div>
      </button>

      {/* Expanded Content - Shortages */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Readiness Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className={`p-3 rounded-lg ${isDark ? 'bg-emerald-900/20' : 'bg-emerald-50'}`}>
              <div className={`text-2xl font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                {readiness.buildsReady}
              </div>
              <div className={`text-xs ${isDark ? 'text-emerald-300/70' : 'text-emerald-600/70'}`}>
                Ready to Build
              </div>
            </div>
            <div className={`p-3 rounded-lg ${isDark ? 'bg-red-900/20' : 'bg-red-50'}`}>
              <div className={`text-2xl font-bold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                {readiness.buildsBlocked}
              </div>
              <div className={`text-xs ${isDark ? 'text-red-300/70' : 'text-red-600/70'}`}>
                Blocked by Stock
              </div>
            </div>
            <div className={`p-3 rounded-lg ${isDark ? 'bg-amber-900/20' : 'bg-amber-50'}`}>
              <div className={`text-2xl font-bold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                {readiness.totalShortages}
              </div>
              <div className={`text-xs ${isDark ? 'text-amber-300/70' : 'text-amber-600/70'}`}>
                Components Short
              </div>
            </div>
          </div>

          {/* Top Shortages - What to Order */}
          {readiness.topShortages.length > 0 && (
            <div>
              <h4 className={`text-xs font-semibold mb-2 flex items-center gap-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                <TruckIcon className="w-3 h-3" />
                Components to Order
              </h4>
              <div className="space-y-2">
                {readiness.topShortages.map((shortage) => (
                  <div
                    key={shortage.componentSku}
                    className={`flex items-center justify-between p-2 rounded-lg ${
                      shortage.urgency === 'CRITICAL'
                        ? isDark ? 'bg-red-900/30 border border-red-800/50' : 'bg-red-50 border border-red-200'
                        : isDark ? 'bg-gray-700/50' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {shortage.urgency === 'CRITICAL' && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isDark ? 'bg-red-800 text-red-200' : 'bg-red-600 text-white'
                          }`}>
                            URGENT
                          </span>
                        )}
                        <span className={`text-sm font-medium truncate ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                          {shortage.componentName}
                        </span>
                      </div>
                      <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        {shortage.componentSku}
                        {shortage.vendorName && ` • ${shortage.vendorName}`}
                        {shortage.leadTimeDays > 0 && ` • ${shortage.leadTimeDays}d lead time`}
                      </div>
                    </div>
                    <div className="text-right ml-2">
                      <div className={`text-sm font-bold ${
                        shortage.urgency === 'CRITICAL'
                          ? isDark ? 'text-red-400' : 'text-red-600'
                          : isDark ? 'text-amber-400' : 'text-amber-600'
                      }`}>
                        {shortage.shortageQty.toLocaleString()} short
                      </div>
                      <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        blocks {shortage.blocksBuilds} BOM{shortage.blocksBuilds !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {onNavigateToBuilds && (
              <button
                onClick={onNavigateToBuilds}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1 ${
                  isDark
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
              >
                <PackageIcon className="w-4 h-4" />
                View Full Forecast
                <ArrowRightIcon className="w-3 h-3" />
              </button>
            )}
            {readiness.totalShortages > 0 && onNavigateToBOMs && (
              <button
                onClick={onNavigateToBOMs}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isDark
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
              >
                Order Components
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BuildForecastSummaryCard;
