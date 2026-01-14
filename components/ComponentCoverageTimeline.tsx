/**
 * Component Coverage Timeline
 *
 * Visual timeline showing when components run out over 13 weeks
 * Part of the MRP cascade system
 */

import { useState, useMemo } from 'react';
import { useComponentCoverage, type ComponentCoverageItem, type CoverageStatus } from '../hooks/useComponentCoverage';
import { cn } from '../lib/utils';
import { useTheme } from './ThemeProvider';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Filter,
  Download,
} from 'lucide-react';

interface ComponentCoverageTimelineProps {
  maxItems?: number;
  showOnlyShortages?: boolean;
  categoryFilter?: string;
  vendorFilter?: string;
}

/**
 * Add weeks to a date
 */
function addWeeks(date: Date, weeks: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + weeks * 7);
  return result;
}

/**
 * Format date as M/d
 */
function formatDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
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

export function ComponentCoverageTimeline({
  maxItems,
  showOnlyShortages = false,
  categoryFilter,
  vendorFilter,
}: ComponentCoverageTimelineProps) {
  const { isDark } = useTheme();
  const { data, loading, error, refetch, shortageCount, warningCount, coveredCount } = useComponentCoverage();
  const [sortBy, setSortBy] = useState<'coverage' | 'name' | 'vendor'>('coverage');
  const [showFilters, setShowFilters] = useState(false);

  // Generate weeks array
  const weeks = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 13 }, (_, i) => addWeeks(today, i));
  }, []);

  // Filter and sort data
  const filteredData = useMemo(() => {
    let items = data || [];

    // Apply filters
    if (showOnlyShortages) {
      items = items.filter(c => c.weeksUntilShortage !== null && c.weeksUntilShortage <= 8);
    }
    if (categoryFilter) {
      items = items.filter(c => c.category === categoryFilter);
    }
    if (vendorFilter) {
      items = items.filter(c => c.vendor === vendorFilter);
    }

    // Sort
    switch (sortBy) {
      case 'name':
        items = [...items].sort((a, b) => a.description.localeCompare(b.description));
        break;
      case 'vendor':
        items = [...items].sort((a, b) => (a.vendor || 'zzz').localeCompare(b.vendor || 'zzz'));
        break;
      default:
        items = [...items].sort((a, b) => a.daysOfCoverage - b.daysOfCoverage);
    }

    // Apply limit
    if (maxItems) {
      items = items.slice(0, maxItems);
    }

    return items;
  }, [data, showOnlyShortages, categoryFilter, vendorFilter, sortBy, maxItems]);

  // Get unique categories and vendors for filters
  const categories = useMemo(() => {
    const cats = new Set(data?.map(d => d.category) || []);
    return Array.from(cats).sort();
  }, [data]);

  const vendors = useMemo(() => {
    const vendorSet = new Set(data?.map(d => d.vendor).filter(Boolean) as string[]);
    return Array.from(vendorSet).sort();
  }, [data]);

  if (loading) {
    return (
      <div className={cn(
        "flex items-center justify-center p-8 rounded-lg border",
        isDark ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-200"
      )}>
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mr-2" />
        <span className={isDark ? "text-gray-300" : "text-gray-600"}>
          Loading coverage timeline...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(
        "flex items-center p-4 rounded-lg border",
        isDark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"
      )}>
        <AlertCircle className="w-5 h-5 mr-2" />
        <span>Error loading coverage: {error.message}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h3 className={cn(
            "text-lg font-semibold",
            isDark ? "text-white" : "text-gray-900"
          )}>
            Component Coverage Timeline
          </h3>
          <button
            onClick={() => refetch()}
            className={cn(
              "p-2 rounded-lg transition-colors",
              isDark
                ? "hover:bg-gray-700 text-gray-400 hover:text-white"
                : "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
            )}
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Summary badges */}
        <div className="flex gap-3">
          <SummaryBadge
            count={shortageCount}
            label="Shortage"
            variant="danger"
            isDark={isDark}
          />
          <SummaryBadge
            count={warningCount}
            label="Warning"
            variant="warning"
            isDark={isDark}
          />
          <SummaryBadge
            count={coveredCount}
            label="Covered"
            variant="success"
            isDark={isDark}
          />
        </div>
      </div>

      {/* Legend */}
      <div className={cn(
        "flex items-center gap-4 px-4 py-2 rounded-lg text-sm",
        isDark ? "bg-gray-800/50" : "bg-gray-50"
      )}>
        <span className={isDark ? "text-gray-400" : "text-gray-600"}>Legend:</span>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-green-500/30 flex items-center justify-center text-xs">✓</span>
          <span className={isDark ? "text-gray-400" : "text-gray-600"}>Covered</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-amber-500/30 flex items-center justify-center text-xs">⏰</span>
          <span className={isDark ? "text-gray-400" : "text-gray-600"}>Warning</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-red-500/30 flex items-center justify-center text-xs">⚠️</span>
          <span className={isDark ? "text-gray-400" : "text-gray-600"}>Shortage</span>
        </div>
      </div>

      {/* Timeline table */}
      <div className={cn(
        "rounded-lg border overflow-hidden",
        isDark ? "border-gray-700" : "border-gray-200"
      )}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={isDark ? "bg-gray-800" : "bg-gray-50"}>
                <th className={cn(
                  "sticky left-0 z-10 px-4 py-3 text-left text-sm font-medium",
                  isDark ? "bg-gray-800 text-gray-300" : "bg-gray-50 text-gray-700"
                )}>
                  <button
                    onClick={() => setSortBy(sortBy === 'name' ? 'coverage' : 'name')}
                    className="flex items-center gap-1 hover:underline"
                  >
                    Component
                    {sortBy === 'name' && <ChevronDown className="w-3 h-3" />}
                  </button>
                </th>
                {weeks.map(week => (
                  <th
                    key={week.toISOString()}
                    className={cn(
                      "px-2 py-3 text-center text-xs font-medium whitespace-nowrap",
                      isDark ? "text-gray-400" : "text-gray-500"
                    )}
                  >
                    {formatDate(week)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((comp, idx) => (
                <tr
                  key={comp.sku}
                  className={cn(
                    "border-t",
                    isDark ? "border-gray-700" : "border-gray-200",
                    idx % 2 === 0
                      ? (isDark ? "bg-gray-900/30" : "bg-white")
                      : (isDark ? "bg-gray-800/30" : "bg-gray-50/50")
                  )}
                >
                  <td className={cn(
                    "sticky left-0 z-10 px-4 py-2",
                    idx % 2 === 0
                      ? (isDark ? "bg-gray-900/95" : "bg-white")
                      : (isDark ? "bg-gray-800/95" : "bg-gray-50")
                  )}>
                    <div className="max-w-[200px]">
                      <p className={cn(
                        "font-medium text-sm truncate",
                        isDark ? "text-gray-200" : "text-gray-900"
                      )}>
                        {comp.description}
                      </p>
                      <p className={cn(
                        "text-xs truncate",
                        isDark ? "text-gray-500" : "text-gray-400"
                      )}>
                        {comp.sku}
                        {comp.vendor && ` · ${comp.vendor}`}
                      </p>
                    </div>
                  </td>
                  {weeks.map(week => {
                    const weekKey = getWeekString(week);
                    const status = comp.weeklyStatus[weekKey];
                    return (
                      <td
                        key={week.toISOString()}
                        className={cn(
                          "px-2 py-2 text-center",
                          getCellBackground(status, isDark)
                        )}
                      >
                        {getStatusIcon(status)}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {filteredData.length === 0 && (
                <tr>
                  <td
                    colSpan={14}
                    className={cn(
                      "px-4 py-8 text-center",
                      isDark ? "text-gray-400" : "text-gray-500"
                    )}
                  >
                    No components with demand found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Export option */}
      <div className="flex justify-end">
        <button
          onClick={() => exportToCsv(filteredData, weeks)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors",
            isDark
              ? "text-gray-400 hover:text-white hover:bg-gray-700"
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          )}
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>
    </div>
  );
}

// Helper components and functions

function SummaryBadge({
  count,
  label,
  variant,
  isDark,
}: {
  count: number;
  label: string;
  variant: 'danger' | 'warning' | 'success';
  isDark: boolean;
}) {
  const variants = {
    danger: isDark
      ? "bg-red-900/30 text-red-400 border-red-800"
      : "bg-red-50 text-red-700 border-red-200",
    warning: isDark
      ? "bg-amber-900/30 text-amber-400 border-amber-800"
      : "bg-amber-50 text-amber-700 border-amber-200",
    success: isDark
      ? "bg-green-900/30 text-green-400 border-green-800"
      : "bg-green-50 text-green-700 border-green-200",
  };

  return (
    <div className={cn(
      "px-3 py-1 rounded-full border text-sm font-medium",
      variants[variant]
    )}>
      {count} {label}
    </div>
  );
}

function getCellBackground(status: CoverageStatus | undefined, isDark: boolean): string {
  switch (status) {
    case 'covered':
      return isDark ? "bg-green-900/30" : "bg-green-100";
    case 'warning':
      return isDark ? "bg-amber-900/30" : "bg-amber-100";
    case 'shortage':
      return isDark ? "bg-red-900/30" : "bg-red-100";
    default:
      return isDark ? "bg-gray-800/30" : "bg-gray-50";
  }
}

function getStatusIcon(status: CoverageStatus | undefined): string {
  switch (status) {
    case 'covered':
      return '✓';
    case 'warning':
      return '⏰';
    case 'shortage':
      return '⚠️';
    default:
      return '';
  }
}

function exportToCsv(data: ComponentCoverageItem[], weeks: Date[]) {
  // Build CSV header
  const headers = ['SKU', 'Description', 'Vendor', 'Days Coverage', 'Runout Date'];
  weeks.forEach(w => headers.push(formatDate(w)));

  // Build rows
  const rows = data.map(comp => {
    const row = [
      comp.sku,
      comp.description,
      comp.vendor || '',
      comp.daysOfCoverage.toString(),
      comp.runoutDate || '',
    ];
    weeks.forEach(w => {
      const status = comp.weeklyStatus[getWeekString(w)];
      row.push(status || '');
    });
    return row;
  });

  // Create CSV content
  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  // Download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `component-coverage-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default ComponentCoverageTimeline;
