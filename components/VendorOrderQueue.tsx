/**
 * Vendor Order Queue
 *
 * Consolidated view of what to order from each vendor
 * Part of the MRP cascade system
 */

import { useState, useMemo } from 'react';
import {
  usePurchaseRecommendations,
  type PurchaseRecommendation,
} from '../hooks/usePurchaseRecommendations';
import { cn } from '../lib/utils';
import { useTheme } from './ThemeProvider';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Package,
  RefreshCw,
  ShoppingCart,
  Truck,
  Clock,
  DollarSign,
} from 'lucide-react';

interface VendorOrderQueueProps {
  onGeneratePO?: (vendorName: string, items: PurchaseRecommendation[]) => void;
  maxVendors?: number;
  showOnlyCritical?: boolean;
}

export function VendorOrderQueue({
  onGeneratePO,
  maxVendors,
  showOnlyCritical = false,
}: VendorOrderQueueProps) {
  const { isDark } = useTheme();
  const {
    data,
    byVendor,
    loading,
    error,
    refetch,
    totalPOValue,
    criticalCount,
    vendorCount,
  } = usePurchaseRecommendations();
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());

  const toggleVendor = (vendor: string) => {
    setExpandedVendors(prev => {
      const next = new Set(prev);
      if (next.has(vendor)) {
        next.delete(vendor);
      } else {
        next.add(vendor);
      }
      return next;
    });
  };

  // Filter and sort vendors
  const sortedVendors = useMemo(() => {
    let vendors = Object.entries(byVendor);

    // Filter by critical if requested
    if (showOnlyCritical) {
      vendors = vendors.filter(([, items]) =>
        items.some(i =>
          i.purchase_priority === 'P1_ORDER_TODAY' ||
          i.purchase_priority === 'P1_OVERDUE'
        )
      );
    }

    // Sort by most urgent (lowest urgency score = most urgent)
    vendors.sort((a, b) => {
      const aUrgency = Math.min(...a[1].map(i => i.urgency_score));
      const bUrgency = Math.min(...b[1].map(i => i.urgency_score));
      return aUrgency - bUrgency;
    });

    // Apply limit
    if (maxVendors) {
      vendors = vendors.slice(0, maxVendors);
    }

    return vendors;
  }, [byVendor, showOnlyCritical, maxVendors]);

  if (loading) {
    return (
      <div className={cn(
        "flex items-center justify-center p-8 rounded-lg border",
        isDark ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-200"
      )}>
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mr-2" />
        <span className={isDark ? "text-gray-300" : "text-gray-600"}>
          Loading order recommendations...
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
        <span>Error loading recommendations: {error.message}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with summary */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h3 className={cn(
            "text-lg font-semibold",
            isDark ? "text-white" : "text-gray-900"
          )}>
            Vendor Order Queue
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

        {/* Summary metrics */}
        <div className="flex gap-4">
          <SummaryMetric
            icon={<DollarSign className="w-4 h-4" />}
            value={`$${totalPOValue.toLocaleString()}`}
            label="Total Value"
            isDark={isDark}
          />
          <SummaryMetric
            icon={<AlertCircle className="w-4 h-4" />}
            value={criticalCount.toString()}
            label="Critical"
            isDark={isDark}
            variant="danger"
          />
          <SummaryMetric
            icon={<Truck className="w-4 h-4" />}
            value={vendorCount.toString()}
            label="Vendors"
            isDark={isDark}
          />
        </div>
      </div>

      {/* Vendor accordion */}
      <div className="space-y-2">
        {sortedVendors.map(([vendor, items]) => {
          const totalValue = items.reduce((sum, i) => sum + (i.estimated_po_value || 0), 0);
          const criticalItems = items.filter(i =>
            i.purchase_priority === 'P1_ORDER_TODAY' ||
            i.purchase_priority === 'P1_OVERDUE'
          );
          const isExpanded = expandedVendors.has(vendor);

          return (
            <div
              key={vendor}
              className={cn(
                "rounded-lg border overflow-hidden",
                isDark ? "border-gray-700" : "border-gray-200"
              )}
            >
              {/* Vendor header */}
              <button
                onClick={() => toggleVendor(vendor)}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3 transition-colors",
                  isDark
                    ? "bg-gray-800 hover:bg-gray-700"
                    : "bg-gray-50 hover:bg-gray-100"
                )}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className={cn("w-5 h-5", isDark ? "text-gray-400" : "text-gray-500")} />
                  ) : (
                    <ChevronRight className={cn("w-5 h-5", isDark ? "text-gray-400" : "text-gray-500")} />
                  )}
                  <span className={cn(
                    "font-semibold",
                    isDark ? "text-white" : "text-gray-900"
                  )}>
                    {vendor}
                  </span>
                  {criticalItems.length > 0 && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      {criticalItems.length} Critical
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className={cn(
                    "font-mono font-medium",
                    isDark ? "text-green-400" : "text-green-600"
                  )}>
                    ${totalValue.toLocaleString()}
                  </span>
                  <span className={cn(
                    "text-sm",
                    isDark ? "text-gray-400" : "text-gray-500"
                  )}>
                    ({items.length} items)
                  </span>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className={cn(
                  "border-t",
                  isDark ? "border-gray-700" : "border-gray-200"
                )}>
                  <div className="p-4 space-y-2">
                    {items.map(item => (
                      <ItemRow key={item.component_sku} item={item} isDark={isDark} />
                    ))}
                  </div>

                  {/* Generate PO button */}
                  {onGeneratePO && (
                    <div className={cn(
                      "px-4 pb-4",
                      isDark ? "border-gray-700" : "border-gray-200"
                    )}>
                      <button
                        onClick={() => onGeneratePO(vendor, items)}
                        className={cn(
                          "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                          "bg-blue-500 hover:bg-blue-600 text-white"
                        )}
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Generate PO for {vendor}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {sortedVendors.length === 0 && (
          <div className={cn(
            "text-center py-8 rounded-lg border",
            isDark
              ? "bg-gray-800/50 border-gray-700 text-gray-400"
              : "bg-gray-50 border-gray-200 text-gray-500"
          )}>
            No purchase recommendations at this time.
          </div>
        )}
      </div>
    </div>
  );
}

// Summary metric component
function SummaryMetric({
  icon,
  value,
  label,
  isDark,
  variant = 'default',
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  isDark: boolean;
  variant?: 'default' | 'danger';
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn(
        variant === 'danger'
          ? (isDark ? "text-red-400" : "text-red-600")
          : (isDark ? "text-gray-400" : "text-gray-500")
      )}>
        {icon}
      </span>
      <div className="text-sm">
        <span className={cn(
          "font-semibold",
          variant === 'danger'
            ? (isDark ? "text-red-400" : "text-red-600")
            : (isDark ? "text-white" : "text-gray-900")
        )}>
          {value}
        </span>
        <span className={cn(
          "ml-1",
          isDark ? "text-gray-400" : "text-gray-500"
        )}>
          {label}
        </span>
      </div>
    </div>
  );
}

// Item row component
function ItemRow({
  item,
  isDark,
}: {
  item: PurchaseRecommendation;
  isDark: boolean;
}) {
  const getPriorityBadge = () => {
    const priority = item.purchase_priority;
    if (priority === 'P1_ORDER_TODAY' || priority === 'P1_OVERDUE') {
      return (
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {priority === 'P1_OVERDUE' ? 'OVERDUE' : 'ORDER TODAY'}
        </span>
      );
    }
    if (priority === 'P2_CRITICAL_PATH') {
      return (
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          CRITICAL PATH
        </span>
      );
    }
    if (priority === 'P3_SOON') {
      return (
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          SOON
        </span>
      );
    }
    return (
      <span className={cn(
        "px-2 py-0.5 text-xs font-medium rounded-full",
        isDark ? "bg-gray-700 text-gray-400" : "bg-gray-100 text-gray-500"
      )}>
        PLANNED
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
  };

  return (
    <div className={cn(
      "flex items-center justify-between p-3 rounded-lg",
      isDark ? "bg-gray-900/50" : "bg-gray-50"
    )}>
      <div className="flex-1 min-w-0">
        <p className={cn(
          "font-medium truncate",
          isDark ? "text-white" : "text-gray-900"
        )}>
          {item.component_description}
        </p>
        <div className={cn(
          "flex items-center gap-2 text-sm",
          isDark ? "text-gray-400" : "text-gray-500"
        )}>
          <span>{item.component_sku}</span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Need by {formatDate(item.earliest_need_date)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4 ml-4">
        <div className="text-right">
          <p className={cn(
            "font-mono",
            isDark ? "text-gray-200" : "text-gray-800"
          )}>
            {item.suggested_order_qty} × ${item.unit_cost?.toFixed(2) || '0.00'}
          </p>
          <p className={cn(
            "text-sm font-mono",
            isDark ? "text-green-400" : "text-green-600"
          )}>
            ${(item.estimated_po_value || 0).toLocaleString()}
          </p>
        </div>
        {getPriorityBadge()}
      </div>
    </div>
  );
}

export default VendorOrderQueue;
