import React, { useState } from 'react';
import { useTheme } from './ThemeProvider';

export interface SeasonalFactor {
  sku: string;
  product_name: string;
  annual_value?: number;
  // Monthly factors (1.0 = average, >1.0 = above average)
  monthly_factors: number[];
}

interface SeasonalHeatmapProps {
  items: SeasonalFactor[];
  loading?: boolean;
  maxItems?: number;
  onNavigateToSku?: (sku: string) => void;
}

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_FULL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Get intensity level for a seasonal factor
 * - High (>1.2): Peak demand period
 * - Medium (0.8-1.2): Normal demand
 * - Low (<0.8): Below average demand
 */
function getIntensity(factor: number): 'high' | 'medium' | 'low' {
  if (factor >= 1.2) return 'high';
  if (factor >= 0.8) return 'medium';
  return 'low';
}

/**
 * Get cell style based on intensity and theme
 */
function getCellStyle(intensity: 'high' | 'medium' | 'low', isDark: boolean, isCurrentMonth: boolean) {
  const baseStyles = {
    high: isDark
      ? 'bg-purple-500/60 text-purple-100'
      : 'bg-purple-500/40 text-purple-900',
    medium: isDark
      ? 'bg-slate-600/50 text-slate-300'
      : 'bg-gray-200 text-gray-700',
    low: isDark
      ? 'bg-slate-800/50 text-slate-500'
      : 'bg-gray-100 text-gray-400',
  };

  const currentMonthRing = isCurrentMonth
    ? (isDark ? 'ring-2 ring-blue-400' : 'ring-2 ring-blue-500')
    : '';

  return `${baseStyles[intensity]} ${currentMonthRing}`;
}

export default function SeasonalHeatmap({
  items,
  loading = false,
  maxItems = 20,
  onNavigateToSku,
}: SeasonalHeatmapProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [expanded, setExpanded] = useState(false);

  const currentMonth = new Date().getMonth(); // 0-11
  const displayItems = expanded ? items : items.slice(0, maxItems);
  const hasMore = items.length > maxItems;

  if (loading) {
    return (
      <div className={`rounded-xl border p-6 ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'}`}>
        <div className="animate-pulse">
          <div className={`h-5 rounded w-56 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <div className={`h-4 rounded w-40 mt-2 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <div className={`h-48 rounded mt-4 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={`rounded-xl border p-6 ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-500/20">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              No Seasonal Data Available
            </h3>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              Historical sales data needed to calculate seasonal patterns.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'}`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${isDark ? 'border-slate-700' : 'border-gray-100'}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Seasonal Demand Patterns
            </h3>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              Top {displayItems.length} SKUs by annual value
            </p>
          </div>
        </div>
      </div>

      {/* Heatmap Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={isDark ? 'bg-slate-900/50' : 'bg-gray-50'}>
              <th className={`px-4 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                SKU
              </th>
              {MONTH_LABELS.map((month, idx) => (
                <th
                  key={month}
                  className={`px-1.5 py-2 text-center font-medium text-xs ${
                    idx === currentMonth
                      ? (isDark ? 'text-blue-400' : 'text-blue-600')
                      : (isDark ? 'text-slate-500' : 'text-gray-400')
                  }`}
                  title={MONTH_FULL[idx]}
                >
                  {month}
                </th>
              ))}
              <th className={`px-3 py-2 text-center font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                Peak
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDark ? 'divide-slate-700/50' : 'divide-gray-100'}`}>
            {displayItems.map((item) => {
              // Find peak month(s)
              const maxFactor = Math.max(...item.monthly_factors);
              const peakMonths = item.monthly_factors
                .map((f, idx) => (f === maxFactor && f >= 1.2 ? MONTH_FULL[idx] : null))
                .filter(Boolean);

              return (
                <tr
                  key={item.sku}
                  className={`${isDark ? 'hover:bg-slate-700/30' : 'hover:bg-gray-50'} transition-colors`}
                >
                  {/* SKU */}
                  <td className="px-4 py-2">
                    {onNavigateToSku ? (
                      <button
                        onClick={() => onNavigateToSku(item.sku)}
                        className="font-mono text-xs font-medium text-blue-400 hover:text-blue-300 hover:underline truncate max-w-[100px] block"
                        title={item.product_name}
                      >
                        {item.sku}
                      </button>
                    ) : (
                      <span
                        className={`font-mono text-xs font-medium truncate max-w-[100px] block ${isDark ? 'text-white' : 'text-gray-900'}`}
                        title={item.product_name}
                      >
                        {item.sku}
                      </span>
                    )}
                  </td>

                  {/* Monthly cells */}
                  {item.monthly_factors.map((factor, monthIdx) => {
                    const intensity = getIntensity(factor);
                    const isCurrentMonth = monthIdx === currentMonth;

                    return (
                      <td key={monthIdx} className="px-0.5 py-1">
                        <div
                          className={`
                            w-6 h-6 mx-auto rounded flex items-center justify-center text-[9px] font-medium
                            ${getCellStyle(intensity, isDark, isCurrentMonth)}
                          `}
                          title={`${MONTH_FULL[monthIdx]}: ${(factor * 100).toFixed(0)}% of average`}
                        >
                          {intensity === 'high' ? '█' : intensity === 'medium' ? '▓' : '░'}
                        </div>
                      </td>
                    );
                  })}

                  {/* Peak indicator */}
                  <td className="px-3 py-2">
                    {peakMonths.length > 0 && (
                      <span className={`text-xs ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                        {peakMonths.join(', ')}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className={`px-6 py-3 border-t flex items-center justify-between ${isDark ? 'border-slate-700 bg-slate-800/30' : 'border-gray-100 bg-gray-50'}`}>
        <div className="flex items-center gap-4 text-xs">
          <span className={isDark ? 'text-slate-400' : 'text-gray-500'}>Legend:</span>
          <div className="flex items-center gap-1">
            <span className={`w-4 h-4 rounded flex items-center justify-center text-[9px] ${isDark ? 'bg-purple-500/60 text-purple-100' : 'bg-purple-500/40 text-purple-900'}`}>█</span>
            <span className={isDark ? 'text-slate-400' : 'text-gray-500'}>High (&gt;120%)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={`w-4 h-4 rounded flex items-center justify-center text-[9px] ${isDark ? 'bg-slate-600/50 text-slate-300' : 'bg-gray-200 text-gray-700'}`}>▓</span>
            <span className={isDark ? 'text-slate-400' : 'text-gray-500'}>Medium (80-120%)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={`w-4 h-4 rounded flex items-center justify-center text-[9px] ${isDark ? 'bg-slate-800/50 text-slate-500' : 'bg-gray-100 text-gray-400'}`}>░</span>
            <span className={isDark ? 'text-slate-400' : 'text-gray-500'}>Low (&lt;80%)</span>
          </div>
        </div>

        {/* Show more/less */}
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className={`text-sm font-medium ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-500'}`}
          >
            {expanded ? 'Show less' : `Show all ${items.length}`}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Generate mock seasonal factors for testing
 */
export function generateMockSeasonalFactors(skus: Array<{ sku: string; name: string; value?: number }>): SeasonalFactor[] {
  return skus.map(item => ({
    sku: item.sku,
    product_name: item.name,
    annual_value: item.value,
    // Generate realistic seasonal pattern
    monthly_factors: Array.from({ length: 12 }, (_, month) => {
      // Create some seasonal variation
      const base = 1.0;
      const seasonalWave = Math.sin((month - 3) * Math.PI / 6) * 0.3; // Peak in summer
      const noise = (Math.random() - 0.5) * 0.2;
      return Math.max(0.5, Math.min(1.5, base + seasonalWave + noise));
    }),
  }));
}
