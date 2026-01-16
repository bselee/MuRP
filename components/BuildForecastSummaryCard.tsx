/**
 * BuildForecastSummaryCard
 *
 * Production planning dashboard card showing:
 * - RUNOUT FORECASTS - when components will run out
 * - Calendar sync status (MFG/Soil calendar imports)
 * - Build readiness (what can we build vs what's blocked)
 * - Top component shortages with one-click ordering
 * - Quick navigation to Build Forecast page
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
  CalendarIcon,
  ClockIcon,
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
  daysUntilNeeded: number;
  runsOutDate: string | null;
}

interface CalendarSyncInfo {
  lastSyncAt: string | null;
  buildsImported: number;
  calendarType: string | null;
  syncStatus: 'success' | 'partial' | 'failed' | 'unknown';
}

interface BuildReadiness {
  totalBuildsPlanned: number;
  totalQuantity: number;
  buildsReady: number;
  buildsBlocked: number;
  criticalShortages: number;
  totalShortages: number;
  topShortages: ShortageInfo[];
  calendarBuilds: number;
  calendarSync: CalendarSyncInfo | null;
  weeklyBreakdown: Array<{ week: string; quantity: number; productCount: number }>;
  soonestRunout: { days: number; componentName: string; date: string } | null;
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
        const today = new Date();
        const fourWeeksOut = new Date(today);
        fourWeeksOut.setDate(fourWeeksOut.getDate() + 28);

        // 1. Get forecast data with quantities
        const { data: forecasts, error: forecastError } = await supabase
          .from('finished_goods_forecast')
          .select('product_id, base_forecast, forecast_method, forecast_period')
          .gte('forecast_period', today.toISOString().split('T')[0])
          .lte('forecast_period', fourWeeksOut.toISOString().split('T')[0]);

        if (forecastError) {
          console.error('[BuildForecastSummaryCard] Forecast query error:', forecastError);
        }

        // Calculate totals and weekly breakdown
        const forecastProducts = new Set((forecasts || []).map(f => f.product_id));
        const totalQuantity = (forecasts || []).reduce((sum, f) => sum + (f.base_forecast || 0), 0);
        const calendarBuilds = (forecasts || []).filter(f =>
          f.forecast_method?.includes('google_calendar')
        ).length;

        // Group by week
        const weekMap = new Map<string, { quantity: number; products: Set<string> }>();
        (forecasts || []).forEach(f => {
          const date = new Date(f.forecast_period);
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          const weekKey = weekStart.toISOString().split('T')[0];

          if (!weekMap.has(weekKey)) {
            weekMap.set(weekKey, { quantity: 0, products: new Set() });
          }
          const week = weekMap.get(weekKey)!;
          week.quantity += f.base_forecast || 0;
          week.products.add(f.product_id);
        });

        const weeklyBreakdown = Array.from(weekMap.entries())
          .map(([week, data]) => ({
            week,
            quantity: data.quantity,
            productCount: data.products.size,
          }))
          .sort((a, b) => a.week.localeCompare(b.week))
          .slice(0, 4);

        // 2. Get latest calendar sync info
        const { data: syncEvent } = await supabase
          .from('calendar_sync_events')
          .select('completed_at, builds_imported, calendar_type, sync_status')
          .order('completed_at', { ascending: false })
          .limit(1)
          .single();

        const calendarSync: CalendarSyncInfo | null = syncEvent ? {
          lastSyncAt: syncEvent.completed_at,
          buildsImported: syncEvent.builds_imported || 0,
          calendarType: syncEvent.calendar_type,
          syncStatus: syncEvent.sync_status as any || 'unknown',
        } : null;

        // 3. Get buildability summary
        const { data: buildability, error: buildError } = await supabase
          .from('mrp_buildability_summary')
          .select('parent_sku, buildable_units, build_action, limiting_component_sku, limiting_component_name')
          .in('parent_sku', Array.from(forecastProducts));

        if (buildError) {
          console.warn('[BuildForecastSummaryCard] Buildability query error:', buildError.message);
        }

        // 4. Get component shortages with runout info from purchasing action summary
        const { data: shortages, error: shortageError } = await supabase
          .from('mrp_purchasing_action_summary')
          .select('component_sku, component_description, total_shortage, vendor_name, lead_time_days, soonest_need_days, action_required, all_consuming_parents')
          .in('action_required', ['ORDER NOW', 'PLAN ORDER'])
          .gt('total_shortage', 0)
          .order('soonest_need_days', { ascending: true })
          .limit(10);

        if (shortageError) {
          console.warn('[BuildForecastSummaryCard] Shortage query error:', shortageError.message);
        }

        // Calculate readiness
        const buildsReady = (buildability || []).filter(b =>
          b.build_action === 'ADEQUATE' || (b.buildable_units && b.buildable_units > 0)
        ).length;

        const buildsBlocked = (buildability || []).filter(b =>
          b.build_action === 'BUILD_URGENT' || b.buildable_units === 0
        ).length;

        // Process shortages with runout dates
        const topShortages: ShortageInfo[] = (shortages || []).slice(0, 5).map(s => {
          const daysUntil = s.soonest_need_days || 0;
          const runoutDate = new Date();
          runoutDate.setDate(runoutDate.getDate() + daysUntil);

          return {
            componentSku: s.component_sku,
            componentName: s.component_description || s.component_sku,
            shortageQty: s.total_shortage || 0,
            blocksBuilds: Array.isArray(s.all_consuming_parents) ? s.all_consuming_parents.length : 1,
            vendorName: s.vendor_name,
            leadTimeDays: s.lead_time_days || 14,
            urgency: s.action_required === 'ORDER NOW' ? 'CRITICAL' : 'SHORTAGE',
            daysUntilNeeded: daysUntil,
            runsOutDate: runoutDate.toISOString().split('T')[0],
          };
        });

        const criticalShortages = topShortages.filter(s => s.urgency === 'CRITICAL').length;

        // Find soonest runout
        let soonestRunout: BuildReadiness['soonestRunout'] = null;
        if (topShortages.length > 0) {
          const soonest = topShortages.reduce((min, s) =>
            s.daysUntilNeeded < min.daysUntilNeeded ? s : min
          );
          soonestRunout = {
            days: soonest.daysUntilNeeded,
            componentName: soonest.componentName,
            date: soonest.runsOutDate || '',
          };
        }

        setReadiness({
          totalBuildsPlanned: forecastProducts.size,
          totalQuantity,
          buildsReady,
          buildsBlocked,
          criticalShortages,
          totalShortages: topShortages.length,
          topShortages,
          calendarBuilds,
          calendarSync,
          weeklyBreakdown,
          soonestRunout,
        });
      } catch (error) {
        console.error('[BuildForecastSummaryCard] Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Format relative time
  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  // Format runout time
  const formatRunoutDays = (days: number) => {
    if (days <= 0) return 'OVERDUE';
    if (days === 1) return 'Tomorrow';
    if (days <= 7) return `${days} days`;
    if (days <= 14) return `${Math.ceil(days / 7)} week${days > 7 ? 's' : ''}`;
    return `${Math.ceil(days / 7)} weeks`;
  };

  // Format date nicely
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const cardClass = isDark
    ? 'bg-gray-800/50 border-gray-700'
    : 'bg-white border-gray-200 shadow-sm';

  // Determine overall status
  const getStatus = () => {
    if (!readiness) return { color: 'gray', label: 'Loading...' };
    if (readiness.criticalShortages > 0) return { color: 'red', label: 'Critical' };
    if (readiness.totalShortages > 0) return { color: 'amber', label: 'Shortages' };
    if (readiness.totalBuildsPlanned === 0) return { color: 'gray', label: 'No Builds' };
    return { color: 'emerald', label: 'Ready' };
  };

  const status = getStatus();

  if (loading) {
    return (
      <div className={`rounded-xl border ${cardClass} p-4`}>
        <div className="animate-pulse flex items-center gap-4">
          <div className={`w-12 h-12 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
          <div className="flex-1">
            <div className={`h-4 w-40 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className={`h-3 w-56 rounded mt-2 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
          </div>
          <div className="flex gap-2">
            <div className={`h-8 w-20 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className={`h-8 w-20 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
          </div>
        </div>
      </div>
    );
  }

  if (!readiness || readiness.totalBuildsPlanned === 0) {
    return (
      <div className={`rounded-xl border ${cardClass} p-4`}>
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <WrenchScrewdriverIcon className={`w-6 h-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          </div>
          <div className="flex-1">
            <h3 className={`text-base font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              Production Forecast
            </h3>
            <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              No builds scheduled for next 4 weeks
            </p>
          </div>
          {onNavigateToBuilds && (
            <button
              onClick={onNavigateToBuilds}
              className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                isDark
                  ? 'text-purple-400 hover:bg-purple-500/10'
                  : 'text-purple-600 hover:bg-purple-50'
              }`}
            >
              View Forecast
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${cardClass} overflow-hidden`}>
      {/* Collapsed Header - Always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`w-full p-4 flex items-center gap-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors`}
      >
        {/* Status Icon */}
        <div className={`p-3 rounded-lg ${
          status.color === 'red' ? isDark ? 'bg-red-900/30' : 'bg-red-100' :
          status.color === 'amber' ? isDark ? 'bg-amber-900/30' : 'bg-amber-100' :
          status.color === 'emerald' ? isDark ? 'bg-emerald-900/30' : 'bg-emerald-100' :
          isDark ? 'bg-gray-700' : 'bg-gray-100'
        }`}>
          {status.color === 'red' ? (
            <ExclamationCircleIcon className="w-6 h-6 text-red-500" />
          ) : status.color === 'amber' ? (
            <AlertTriangleIcon className="w-6 h-6 text-amber-500" />
          ) : status.color === 'emerald' ? (
            <CheckCircleIcon className="w-6 h-6 text-emerald-500" />
          ) : (
            <WrenchScrewdriverIcon className="w-6 h-6 text-gray-400" />
          )}
        </div>

        {/* Main Info */}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <h3 className={`text-base font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
              Production Forecast
            </h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              status.color === 'red' ? 'bg-red-500/20 text-red-400' :
              status.color === 'amber' ? 'bg-amber-500/20 text-amber-400' :
              status.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400' :
              'bg-gray-500/20 text-gray-400'
            }`}>
              {status.label}
            </span>
          </div>
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {readiness.totalQuantity.toLocaleString()} units across {readiness.totalBuildsPlanned} products
            {readiness.soonestRunout && readiness.soonestRunout.days <= 14 && (
              <span className={readiness.soonestRunout.days <= 7 ? 'text-red-400 font-medium' : 'text-amber-400'}>
                {' '}• First shortage in {formatRunoutDays(readiness.soonestRunout.days)}
              </span>
            )}
          </p>
        </div>

        {/* Quick Stats - Show soonest runout prominently */}
        <div className="hidden sm:flex items-center gap-3">
          {readiness.soonestRunout && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md ${
              readiness.soonestRunout.days <= 7
                ? isDark ? 'bg-red-900/40 ring-1 ring-red-500/50' : 'bg-red-100 ring-1 ring-red-300'
                : isDark ? 'bg-amber-900/30' : 'bg-amber-50'
            }`}>
              <ClockIcon className={`w-4 h-4 ${
                readiness.soonestRunout.days <= 7 ? 'text-red-400' : 'text-amber-400'
              }`} />
              <span className={`text-xs font-bold ${
                readiness.soonestRunout.days <= 7
                  ? isDark ? 'text-red-300' : 'text-red-700'
                  : isDark ? 'text-amber-300' : 'text-amber-700'
              }`}>
                {readiness.soonestRunout.days <= 0 ? 'OVERDUE' : `${readiness.soonestRunout.days}d`}
              </span>
            </div>
          )}
          {readiness.calendarSync && readiness.calendarBuilds > 0 && (
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${
              isDark ? 'bg-purple-900/30' : 'bg-purple-50'
            }`}>
              <CalendarIcon className="w-4 h-4 text-purple-400" />
              <span className={`text-xs font-medium ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
                {readiness.calendarBuilds} synced
              </span>
            </div>
          )}
        </div>

        {/* Expand/Collapse */}
        <div className={`p-1 rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
          {expanded ? (
            <ChevronUpIcon className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          ) : (
            <ChevronDownIcon className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          {/* Stats Row */}
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-px ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
            <div className={`p-4 ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
              <div className={`text-2xl font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                {readiness.buildsReady}
              </div>
              <div className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Ready to Build
              </div>
            </div>
            <div className={`p-4 ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
              <div className={`text-2xl font-bold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                {readiness.buildsBlocked}
              </div>
              <div className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Blocked by Stock
              </div>
            </div>
            <div className={`p-4 ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
              <div className={`text-2xl font-bold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                {readiness.totalShortages}
              </div>
              <div className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Components Short
              </div>
            </div>
            <div className={`p-4 ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
              {readiness.soonestRunout ? (
                <>
                  <div className={`text-2xl font-bold ${
                    readiness.soonestRunout.days <= 7
                      ? isDark ? 'text-red-400' : 'text-red-600'
                      : isDark ? 'text-amber-400' : 'text-amber-600'
                  }`}>
                    {readiness.soonestRunout.days <= 0 ? '!' : readiness.soonestRunout.days}
                  </div>
                  <div className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {readiness.soonestRunout.days <= 0 ? 'Overdue' : 'Days to First Runout'}
                  </div>
                </>
              ) : (
                <>
                  <div className={`text-2xl font-bold ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                    {readiness.calendarBuilds}
                  </div>
                  <div className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    From Calendar
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Calendar Sync Status */}
          {readiness.calendarSync && (
            <div className={`px-4 py-3 flex items-center justify-between ${
              isDark ? 'bg-purple-900/20 border-b border-gray-700' : 'bg-purple-50 border-b border-gray-200'
            }`}>
              <div className="flex items-center gap-2">
                <CalendarIcon className={`w-4 h-4 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                <span className={`text-sm ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
                  Google Calendar Sync
                </span>
                {readiness.calendarSync.calendarType && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    isDark ? 'bg-purple-800/50 text-purple-300' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {readiness.calendarSync.calendarType.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs ${isDark ? 'text-purple-400/70' : 'text-purple-600/70'}`}>
                  {readiness.calendarSync.buildsImported} builds imported
                </span>
                <span className={`flex items-center gap-1 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  <ClockIcon className="w-3 h-3" />
                  {formatRelativeTime(readiness.calendarSync.lastSyncAt)}
                </span>
              </div>
            </div>
          )}

          {/* Weekly Breakdown */}
          {readiness.weeklyBreakdown.length > 0 && (
            <div className={`px-4 py-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className={`text-xs font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Upcoming 4 Weeks
              </div>
              <div className="flex gap-2">
                {readiness.weeklyBreakdown.map((week, i) => (
                  <div
                    key={week.week}
                    className={`flex-1 p-2 rounded-lg text-center ${
                      isDark ? 'bg-gray-700/50' : 'bg-gray-100'
                    }`}
                  >
                    <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      Week {i + 1}
                    </div>
                    <div className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                      {week.quantity.toLocaleString()}
                    </div>
                    <div className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      {week.productCount} SKU{week.productCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Component Shortages with Runout Dates */}
          {readiness.topShortages.length > 0 && (
            <div className="p-4">
              <div className={`flex items-center gap-2 mb-3`}>
                <TruckIcon className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                <span className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Components to Order
                </span>
              </div>
              <div className="space-y-2">
                {readiness.topShortages.map((shortage) => (
                  <div
                    key={shortage.componentSku}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      shortage.urgency === 'CRITICAL'
                        ? isDark ? 'bg-red-900/30 ring-1 ring-red-500/30' : 'bg-red-50 ring-1 ring-red-200'
                        : isDark ? 'bg-gray-700/50' : 'bg-gray-50'
                    }`}
                  >
                    {/* Urgency indicator */}
                    <div className={`w-1 h-12 rounded-full ${
                      shortage.urgency === 'CRITICAL' ? 'bg-red-500' : 'bg-amber-500'
                    }`} />

                    {/* Component info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {shortage.urgency === 'CRITICAL' && (
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                            isDark ? 'bg-red-700 text-red-100' : 'bg-red-600 text-white'
                          }`}>
                            ORDER NOW
                          </span>
                        )}
                        <span className={`text-sm font-medium truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                          {shortage.componentName}
                        </span>
                      </div>
                      <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} flex items-center gap-2 flex-wrap`}>
                        <span>{shortage.componentSku}</span>
                        {shortage.vendorName && (
                          <>
                            <span>•</span>
                            <span>{shortage.vendorName}</span>
                          </>
                        )}
                        {shortage.leadTimeDays > 0 && (
                          <>
                            <span>•</span>
                            <span>{shortage.leadTimeDays}d lead</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Runout Date - PROMINENT */}
                    <div className={`text-center px-3 py-1.5 rounded-md ${
                      shortage.daysUntilNeeded <= 7
                        ? isDark ? 'bg-red-800/50' : 'bg-red-100'
                        : isDark ? 'bg-amber-800/30' : 'bg-amber-100'
                    }`}>
                      <div className={`text-xs font-bold ${
                        shortage.daysUntilNeeded <= 7
                          ? isDark ? 'text-red-300' : 'text-red-700'
                          : isDark ? 'text-amber-300' : 'text-amber-700'
                      }`}>
                        {shortage.daysUntilNeeded <= 0 ? 'OVERDUE' : `${shortage.daysUntilNeeded}d`}
                      </div>
                      <div className={`text-[10px] ${
                        shortage.daysUntilNeeded <= 7
                          ? isDark ? 'text-red-400/70' : 'text-red-600/70'
                          : isDark ? 'text-amber-400/70' : 'text-amber-600/70'
                      }`}>
                        {shortage.runsOutDate ? formatDate(shortage.runsOutDate) : 'runout'}
                      </div>
                    </div>

                    {/* Shortage qty and impact */}
                    <div className="text-right">
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
          <div className={`p-4 pt-2 flex gap-2 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            {onNavigateToBuilds && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateToBuilds();
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isDark
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                }`}
              >
                <PackageIcon className="w-4 h-4" />
                View Build Forecast
              </button>
            )}
            {readiness.totalShortages > 0 && onNavigateToBOMs && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateToBOMs();
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isDark
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-amber-500 hover:bg-amber-600 text-white'
                }`}
              >
                <TruckIcon className="w-4 h-4" />
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
