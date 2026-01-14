/**
 * Build Readiness Matrix
 *
 * Shows which finished goods can be built NOW vs what's blocking them
 * Part of the MRP cascade system
 */

import { useState } from 'react';
import { useBuildReadiness, type BuildReadinessItem } from '../hooks/useBuildReadiness';
import { cn } from '../lib/utils';
import { useTheme } from './ThemeProvider';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Package,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Truck,
  Factory,
} from 'lucide-react';

interface BuildReadinessMatrixProps {
  showOnlyUrgent?: boolean;
  maxItems?: number;
  onScheduleBuild?: (sku: string, quantity: number) => void;
}

export function BuildReadinessMatrix({
  showOnlyUrgent = false,
  maxItems,
  onScheduleBuild,
}: BuildReadinessMatrixProps) {
  const { isDark } = useTheme();
  const { data, loading, error, refetch, urgentCount, blockedCount, readyCount } = useBuildReadiness();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'urgent' | 'blocked' | 'ready'>('all');

  const toggleExpanded = (sku: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(sku)) {
        next.delete(sku);
      } else {
        next.add(sku);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className={cn(
        "flex items-center justify-center p-8 rounded-lg border",
        isDark ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-200"
      )}>
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mr-2" />
        <span className={isDark ? "text-gray-300" : "text-gray-600"}>
          Loading build readiness...
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
        <span>Error loading build readiness: {error.message}</span>
      </div>
    );
  }

  // Filter data
  let filteredData = data || [];
  if (showOnlyUrgent) {
    filteredData = filteredData.filter(d => d.buildAction === 'BUILD_URGENT' || d.buildAction === 'BUILD_SOON');
  }
  switch (filter) {
    case 'urgent':
      filteredData = filteredData.filter(d => d.buildAction === 'BUILD_URGENT');
      break;
    case 'blocked':
      filteredData = filteredData.filter(d => !d.canBuild && d.buildAction !== 'NO_DEMAND');
      break;
    case 'ready':
      filteredData = filteredData.filter(d => d.canBuild && d.buildAction !== 'NO_DEMAND');
      break;
  }

  if (maxItems) {
    filteredData = filteredData.slice(0, maxItems);
  }

  return (
    <div className="space-y-4">
      {/* Header with metrics */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h3 className={cn(
            "text-lg font-semibold",
            isDark ? "text-white" : "text-gray-900"
          )}>
            Build Readiness
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

        {/* Filter buttons */}
        <div className="flex gap-2">
          <FilterButton
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            isDark={isDark}
          >
            All ({data?.length || 0})
          </FilterButton>
          <FilterButton
            active={filter === 'urgent'}
            onClick={() => setFilter('urgent')}
            isDark={isDark}
            variant="danger"
          >
            Urgent ({urgentCount})
          </FilterButton>
          <FilterButton
            active={filter === 'blocked'}
            onClick={() => setFilter('blocked')}
            isDark={isDark}
            variant="warning"
          >
            Blocked ({blockedCount})
          </FilterButton>
          <FilterButton
            active={filter === 'ready'}
            onClick={() => setFilter('ready')}
            isDark={isDark}
            variant="success"
          >
            Ready ({readyCount})
          </FilterButton>
        </div>
      </div>

      {/* Grid of items */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredData.map(product => (
          <BuildReadinessCard
            key={product.sku}
            product={product}
            isDark={isDark}
            expanded={expandedItems.has(product.sku)}
            onToggle={() => toggleExpanded(product.sku)}
            onScheduleBuild={onScheduleBuild}
          />
        ))}

        {filteredData.length === 0 && (
          <div className={cn(
            "col-span-full text-center py-8",
            isDark ? "text-gray-400" : "text-gray-500"
          )}>
            No items match the selected filter.
          </div>
        )}
      </div>
    </div>
  );
}

// Filter button component
function FilterButton({
  active,
  onClick,
  isDark,
  variant = 'default',
  children,
}: {
  active: boolean;
  onClick: () => void;
  isDark: boolean;
  variant?: 'default' | 'danger' | 'warning' | 'success';
  children: React.ReactNode;
}) {
  const variantClasses = {
    default: active
      ? (isDark ? "bg-gray-600 text-white" : "bg-gray-200 text-gray-900")
      : (isDark ? "bg-gray-800 text-gray-400 hover:bg-gray-700" : "bg-white text-gray-600 hover:bg-gray-50"),
    danger: active
      ? "bg-red-500 text-white"
      : (isDark ? "bg-gray-800 text-red-400 hover:bg-red-900/30" : "bg-white text-red-600 hover:bg-red-50"),
    warning: active
      ? "bg-amber-500 text-white"
      : (isDark ? "bg-gray-800 text-amber-400 hover:bg-amber-900/30" : "bg-white text-amber-600 hover:bg-amber-50"),
    success: active
      ? "bg-green-500 text-white"
      : (isDark ? "bg-gray-800 text-green-400 hover:bg-green-900/30" : "bg-white text-green-600 hover:bg-green-50"),
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors",
        isDark ? "border-gray-700" : "border-gray-200",
        variantClasses[variant]
      )}
    >
      {children}
    </button>
  );
}

// Individual card component
function BuildReadinessCard({
  product,
  isDark,
  expanded,
  onToggle,
  onScheduleBuild,
}: {
  product: BuildReadinessItem;
  isDark: boolean;
  expanded: boolean;
  onToggle: () => void;
  onScheduleBuild?: (sku: string, quantity: number) => void;
}) {
  const getBorderColor = () => {
    if (product.buildAction === 'NO_DEMAND') return isDark ? 'border-l-gray-600' : 'border-l-gray-300';
    if (product.canBuild) return 'border-l-green-500';
    if (product.buildAction === 'BUILD_URGENT') return 'border-l-red-500';
    return 'border-l-amber-500';
  };

  const getStatusBadge = () => {
    if (product.buildAction === 'NO_DEMAND') {
      return (
        <span className={cn(
          "px-2 py-1 text-xs font-medium rounded-full",
          isDark ? "bg-gray-700 text-gray-400" : "bg-gray-100 text-gray-500"
        )}>
          No Demand
        </span>
      );
    }
    if (product.canBuild) {
      return (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          Can Build {product.maxBuildQty}
        </span>
      );
    }
    return (
      <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        BLOCKED
      </span>
    );
  };

  const getActionBadge = () => {
    switch (product.buildAction) {
      case 'BUILD_URGENT':
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            URGENT
          </span>
        );
      case 'BUILD_SOON':
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Build Soon
          </span>
        );
      case 'ADEQUATE':
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Adequate
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className={cn(
      "rounded-lg border border-l-4 overflow-hidden transition-shadow hover:shadow-md",
      isDark ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-200",
      getBorderColor()
    )}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h4 className={cn(
              "font-medium truncate",
              isDark ? "text-white" : "text-gray-900"
            )}>
              {product.description}
            </h4>
            <p className={cn(
              "text-sm truncate",
              isDark ? "text-gray-400" : "text-gray-500"
            )}>
              {product.sku}
            </p>
          </div>
          {getStatusBadge()}
        </div>

        {/* Metrics row */}
        <div className="flex items-center gap-4 text-sm mb-3">
          <div className="flex items-center gap-1">
            <Package className={cn("w-4 h-4", isDark ? "text-gray-500" : "text-gray-400")} />
            <span className={isDark ? "text-gray-300" : "text-gray-600"}>
              {product.finishedStock} in stock
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className={cn("w-4 h-4", isDark ? "text-gray-500" : "text-gray-400")} />
            <span className={isDark ? "text-gray-300" : "text-gray-600"}>
              {product.daysOfCoverage === 999 ? '∞' : product.daysOfCoverage} days
            </span>
          </div>
        </div>

        {/* Action badge */}
        <div className="flex items-center justify-between">
          {getActionBadge()}
          <button
            onClick={onToggle}
            className={cn(
              "p-1 rounded transition-colors",
              isDark
                ? "hover:bg-gray-700 text-gray-400"
                : "hover:bg-gray-100 text-gray-500"
            )}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className={cn(
          "px-4 pb-4 pt-2 border-t",
          isDark ? "border-gray-700" : "border-gray-200"
        )}>
          {/* Limiting component */}
          {product.limitingComponent && (
            <div className={cn(
              "mb-3 p-2 rounded-lg text-sm",
              isDark ? "bg-gray-900/50" : "bg-gray-50"
            )}>
              <p className={cn("font-medium mb-1", isDark ? "text-gray-300" : "text-gray-700")}>
                Limiting Component:
              </p>
              <div className="flex items-center justify-between">
                <span className={isDark ? "text-gray-400" : "text-gray-600"}>
                  {product.limitingComponent.description}
                </span>
                <span className={isDark ? "text-gray-400" : "text-gray-500"}>
                  {product.limitingComponent.available} available
                </span>
              </div>
            </div>
          )}

          {/* Short components */}
          {product.shortComponents.length > 0 && (
            <div className="space-y-2">
              <p className={cn(
                "text-sm font-medium",
                isDark ? "text-red-400" : "text-red-600"
              )}>
                Missing Components ({product.shortComponents.length}):
              </p>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {product.shortComponents.slice(0, 5).map(comp => (
                  <div
                    key={comp.sku}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className={cn(
                      "truncate flex-1 mr-2",
                      isDark ? "text-gray-300" : "text-gray-700"
                    )}>
                      {comp.description}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={isDark ? "text-red-400" : "text-red-600"}>
                        -{comp.shortage}
                      </span>
                      {comp.vendor && (
                        <span className={cn(
                          "text-xs px-1.5 py-0.5 rounded",
                          isDark ? "bg-gray-700 text-gray-400" : "bg-gray-100 text-gray-500"
                        )}>
                          <Truck className="w-3 h-3 inline mr-1" />
                          {comp.vendor.substring(0, 10)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {product.shortComponents.length > 5 && (
                  <p className={cn(
                    "text-xs",
                    isDark ? "text-gray-500" : "text-gray-400"
                  )}>
                    +{product.shortComponents.length - 5} more...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Schedule build button */}
          {product.canBuild && onScheduleBuild && (
            <button
              onClick={() => onScheduleBuild(product.sku, product.maxBuildQty)}
              className={cn(
                "w-full mt-4 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2",
                "bg-green-500 hover:bg-green-600 text-white"
              )}
            >
              <Factory className="w-4 h-4" />
              Schedule Build ({product.maxBuildQty})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default BuildReadinessMatrix;
