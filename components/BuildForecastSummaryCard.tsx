/**
 * BuildForecastSummaryCard
 *
 * Displays a summary of upcoming build forecasts with sync health status.
 * Used on Dashboard and BOMs page to show planned builds at a glance.
 */

import React, { useState, useEffect } from 'react';
import { useTheme } from './ThemeProvider';
import { CalendarIcon, ChevronDownIcon, ChevronUpIcon, AlertTriangleIcon, CheckCircleIcon, ClockIcon, ExclamationCircleIcon, ArrowPathIcon } from './icons';
import { supabase } from '../lib/supabase/client';

interface ForecastSummary {
  totalForecasts: number;
  totalQuantity: number;
  weeklyBreakdown: Array<{
    week: string;
    quantity: number;
    productCount: number;
  }>;
  topProducts: Array<{
    sku: string;
    name: string;
    quantity: number;
  }>;
  sourceBreakdown: Array<{
    source: string;
    label: string;
    quantity: number;
    productCount: number;
  }>;
}

interface SyncHealth {
  lastSyncAt: string | null;
  syncStatus: 'healthy' | 'warning' | 'error' | 'unknown';
  invalidSkuCount: number;
  recentSyncs: number;
}

interface BuildForecastSummaryCardProps {
  onNavigateToBOMs?: () => void;
  onNavigateToBuilds?: () => void;
  expanded?: boolean;
  showSyncHealth?: boolean;
}

const BuildForecastSummaryCard: React.FC<BuildForecastSummaryCardProps> = ({
  onNavigateToBOMs,
  onNavigateToBuilds,
  expanded: defaultExpanded = false,
  showSyncHealth = true,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ForecastSummary | null>(null);
  const [syncHealth, setSyncHealth] = useState<SyncHealth | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch forecast summary
        const today = new Date();
        const fourWeeksOut = new Date(today);
        fourWeeksOut.setDate(fourWeeksOut.getDate() + 28);

        const { data: forecasts, error: forecastError } = await supabase
          .from('finished_goods_forecast')
          .select('product_id, forecast_period, base_forecast, forecast_method')
          .gte('forecast_period', today.toISOString().split('T')[0])
          .lte('forecast_period', fourWeeksOut.toISOString().split('T')[0])
          .order('forecast_period', { ascending: true });

        if (forecastError) {
          console.error('[BuildForecastSummaryCard] Forecast query error:', forecastError);
          // Continue with empty data instead of throwing
        }

        // Get product names from BOMs
        const productIds = [...new Set((forecasts || []).map((f) => f.product_id))];
        const { data: boms } = await supabase
          .from('boms')
          .select('finished_sku, name')
          .in('finished_sku', productIds);

        const bomMap = new Map((boms || []).map((b) => [b.finished_sku, b.name]));

        // Calculate summary
        const totalQuantity = (forecasts || []).reduce((sum, f) => sum + (f.base_forecast || 0), 0);

        // Group by week
        const weeklyMap = new Map<string, { quantity: number; products: Set<string> }>();
        (forecasts || []).forEach((f) => {
          const week = f.forecast_period;
          if (!weeklyMap.has(week)) {
            weeklyMap.set(week, { quantity: 0, products: new Set() });
          }
          const entry = weeklyMap.get(week)!;
          entry.quantity += f.base_forecast || 0;
          entry.products.add(f.product_id);
        });

        const weeklyBreakdown = Array.from(weeklyMap.entries())
          .map(([week, data]) => ({
            week,
            quantity: data.quantity,
            productCount: data.products.size,
          }))
          .sort((a, b) => a.week.localeCompare(b.week));

        // Top products by quantity
        const productTotals = new Map<string, number>();
        (forecasts || []).forEach((f) => {
          const current = productTotals.get(f.product_id) || 0;
          productTotals.set(f.product_id, current + (f.base_forecast || 0));
        });

        const topProducts = Array.from(productTotals.entries())
          .map(([sku, quantity]) => ({
            sku,
            name: bomMap.get(sku) || sku,
            quantity,
          }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5);

        // Source breakdown (MFG, Soil, etc.)
        const sourceMap = new Map<string, { quantity: number; products: Set<string> }>();
        (forecasts || []).forEach((f: any) => {
          const method = f.forecast_method || 'other';
          if (!sourceMap.has(method)) {
            sourceMap.set(method, { quantity: 0, products: new Set() });
          }
          const entry = sourceMap.get(method)!;
          entry.quantity += f.base_forecast || 0;
          entry.products.add(f.product_id);
        });

        const getSourceLabel = (source: string): string => {
          if (source.includes('_mfg')) return 'MFG';
          if (source.includes('_soil')) return 'Soil';
          if (source.includes('google_calendar')) return 'Calendar';
          if (source === 'historical_avg') return 'Auto-Forecast';
          if (source === 'manual') return 'Manual';
          return source;
        };

        const sourceBreakdown = Array.from(sourceMap.entries())
          .map(([source, data]) => ({
            source,
            label: getSourceLabel(source),
            quantity: data.quantity,
            productCount: data.products.size,
          }))
          .sort((a, b) => b.quantity - a.quantity);

        setSummary({
          totalForecasts: (forecasts || []).length,
          totalQuantity,
          weeklyBreakdown,
          topProducts,
          sourceBreakdown,
        });

        // Fetch sync health (views may not exist yet, so handle gracefully)
        if (showSyncHealth) {
          try {
            const { data: syncData, error: syncError } = await supabase
              .from('calendar_sync_health')
              .select('*')
              .limit(1)
              .maybeSingle();

            if (syncError) {
              console.warn('[BuildForecastSummaryCard] Sync health view not available:', syncError.message);
            }

            const { data: unresolvedSkus, error: skuError } = await supabase
              .from('calendar_sync_unresolved_skus')
              .select('sku')
              .limit(100);

            if (skuError) {
              console.warn('[BuildForecastSummaryCard] Unresolved SKUs view not available:', skuError.message);
            }

            const lastSync = syncData?.last_sync_at ? new Date(syncData.last_sync_at) : null;
            const hoursSinceSync = lastSync ? (Date.now() - lastSync.getTime()) / (1000 * 60 * 60) : null;

            let syncStatus: SyncHealth['syncStatus'] = 'unknown';
            if (hoursSinceSync !== null) {
              if (hoursSinceSync < 25) {
                syncStatus = 'healthy';
              } else if (hoursSinceSync < 48) {
                syncStatus = 'warning';
              } else {
                syncStatus = 'error';
              }
            }

            setSyncHealth({
              lastSyncAt: syncData?.last_sync_at || null,
              syncStatus,
              invalidSkuCount: (unresolvedSkus || []).length,
              recentSyncs: syncData?.syncs_last_24h || 0,
            });
          } catch (syncErr) {
            console.warn('[BuildForecastSummaryCard] Could not fetch sync health:', syncErr);
          }
        }
      } catch (error) {
        console.error('[BuildForecastSummaryCard] Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [showSyncHealth]);

  const formatWeekLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getSyncStatusIcon = () => {
    if (!syncHealth) return null;
    switch (syncHealth.syncStatus) {
      case 'healthy':
        return <CheckCircleIcon className="w-4 h-4 text-emerald-400" />;
      case 'warning':
        return <ClockIcon className="w-4 h-4 text-amber-400" />;
      case 'error':
        return <ExclamationCircleIcon className="w-4 h-4 text-red-400" />;
      default:
        return <ArrowPathIcon className="w-4 h-4 text-gray-400" />;
    }
  };

  const getSyncStatusText = () => {
    if (!syncHealth?.lastSyncAt) return 'No syncs yet';
    const lastSync = new Date(syncHealth.lastSyncAt);
    const hours = Math.round((Date.now() - lastSync.getTime()) / (1000 * 60 * 60));
    if (hours < 1) return 'Synced recently';
    if (hours < 24) return `Synced ${hours}h ago`;
    const days = Math.round(hours / 24);
    return `Synced ${days}d ago`;
  };

  const cardClass = isDark
    ? 'bg-gray-800/50 border-gray-700'
    : 'bg-white border-gray-200 shadow-sm';

  const headerClass = isDark
    ? 'bg-purple-900/30 border-purple-800/50'
    : 'bg-purple-50 border-purple-200';

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

  if (!summary || summary.totalForecasts === 0) {
    return (
      <div className={`rounded-xl border ${cardClass} p-4`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <CalendarIcon className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          </div>
          <div>
            <h3 className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Build Forecast
            </h3>
            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              No upcoming builds scheduled
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${cardClass} overflow-hidden`}>
      {/* Header - Always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full p-4 ${headerClass} border-b flex items-center justify-between hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isDark ? 'bg-purple-800/50' : 'bg-purple-100'}`}>
            <CalendarIcon className={`w-5 h-5 ${isDark ? 'text-purple-300' : 'text-purple-600'}`} />
          </div>
          <div className="text-left">
            <h3 className={`text-sm font-semibold ${isDark ? 'text-purple-200' : 'text-purple-800'}`}>
              Build Forecast
            </h3>
            <p className={`text-xs ${isDark ? 'text-purple-300/70' : 'text-purple-600/70'}`}>
              {summary.totalQuantity.toLocaleString()} units across {summary.weeklyBreakdown.length} weeks
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Sync Health Indicator */}
          {showSyncHealth && syncHealth && (
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
              syncHealth.syncStatus === 'healthy'
                ? isDark ? 'bg-emerald-900/30 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
                : syncHealth.syncStatus === 'warning'
                  ? isDark ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-100 text-amber-700'
                  : isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-100 text-red-700'
            }`}>
              {getSyncStatusIcon()}
              <span>{getSyncStatusText()}</span>
            </div>
          )}
          {expanded ? (
            <ChevronUpIcon className={`w-5 h-5 ${isDark ? 'text-purple-300' : 'text-purple-600'}`} />
          ) : (
            <ChevronDownIcon className={`w-5 h-5 ${isDark ? 'text-purple-300' : 'text-purple-600'}`} />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Weekly Breakdown */}
          <div>
            <h4 className={`text-xs font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Weekly Breakdown
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {summary.weeklyBreakdown.slice(0, 4).map((week) => (
                <div
                  key={week.week}
                  className={`p-2 rounded-lg ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}
                >
                  <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Week of {formatWeekLabel(week.week)}
                  </div>
                  <div className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {week.quantity.toLocaleString()}
                  </div>
                  <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {week.productCount} products
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Source Breakdown (MFG vs Soil badges) */}
          {summary.sourceBreakdown.length > 1 && (
            <div>
              <h4 className={`text-xs font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                By Source
              </h4>
              <div className="flex flex-wrap gap-2">
                {summary.sourceBreakdown.map((source) => {
                  const colorClass = source.label === 'MFG'
                    ? isDark ? 'bg-blue-900/30 text-blue-300 border-blue-700' : 'bg-blue-100 text-blue-700 border-blue-300'
                    : source.label === 'Soil'
                      ? isDark ? 'bg-amber-900/30 text-amber-300 border-amber-700' : 'bg-amber-100 text-amber-700 border-amber-300'
                      : isDark ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-100 text-gray-600 border-gray-300';
                  return (
                    <div
                      key={source.source}
                      className={`px-3 py-1.5 rounded-lg border ${colorClass} flex items-center gap-2`}
                    >
                      <span className="text-xs font-semibold">{source.label}</span>
                      <span className="text-xs opacity-70">{source.quantity.toLocaleString()} units</span>
                      <span className="text-xs opacity-50">({source.productCount} SKUs)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Products */}
          {summary.topProducts.length > 0 && (
            <div>
              <h4 className={`text-xs font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Top Builds
              </h4>
              <div className="space-y-1">
                {summary.topProducts.map((product) => (
                  <div
                    key={product.sku}
                    className={`flex items-center justify-between p-2 rounded-lg ${isDark ? 'bg-gray-700/30' : 'bg-gray-50'}`}
                  >
                    <div className="truncate">
                      <span className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                        {product.name}
                      </span>
                      <span className={`text-xs ml-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        {product.sku}
                      </span>
                    </div>
                    <span className={`text-sm font-medium ${isDark ? 'text-purple-300' : 'text-purple-600'}`}>
                      {product.quantity.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invalid SKUs Warning */}
          {syncHealth && syncHealth.invalidSkuCount > 0 && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${isDark ? 'bg-amber-900/20 border border-amber-800/50' : 'bg-amber-50 border border-amber-200'}`}>
              <AlertTriangleIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span className={`text-xs ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                {syncHealth.invalidSkuCount} SKU{syncHealth.invalidSkuCount !== 1 ? 's' : ''} from calendar have no matching BOM
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {onNavigateToBOMs && (
              <button
                onClick={onNavigateToBOMs}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isDark
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
              >
                View BOMs
              </button>
            )}
            {onNavigateToBuilds && (
              <button
                onClick={onNavigateToBuilds}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isDark
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                Build Details
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BuildForecastSummaryCard;
