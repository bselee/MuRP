import React, { useState } from 'react';
import { useTheme } from './ThemeProvider';
import RiskActionMenu from './RiskActionMenu';

export interface StockoutItem {
  sku: string;
  product_name: string;
  pending_demand?: number;
  last_sale_date?: Date | null;
  restock_eta?: Date | null;
  restock_po_number?: string | null;
  restock_quantity?: number;
  alternatives?: AlternativeItem[];
}

export interface AlternativeItem {
  sku: string;
  product_name: string;
  current_stock: number;
  similarity_reason?: string; // "Same vendor", "Same category", etc.
}

interface StockoutContingencyCardProps {
  items: StockoutItem[];
  loading?: boolean;
  onNavigateToSku?: (sku: string) => void;
  onNavigateToPO?: (poNumber: string) => void;
  onCreatePO?: (sku: string, qty: number) => void;
  onAdjustROP?: (sku: string) => void;
  onMarkForReview?: (sku: string) => void;
}

export default function StockoutContingencyCard({
  items,
  loading = false,
  onNavigateToSku,
  onNavigateToPO,
  onCreatePO,
  onAdjustROP,
  onMarkForReview,
}: StockoutContingencyCardProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  if (loading) {
    return (
      <div className={`rounded-xl border p-6 ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'}`}>
        <div className="animate-pulse">
          <div className={`h-5 rounded w-40 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <div className={`h-4 rounded w-32 mt-2 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <div className="space-y-3 mt-4">
            {[1, 2].map(i => (
              <div key={i} className={`h-24 rounded ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Only show if there are stockout items
  if (items.length === 0) {
    return null;
  }

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return null;
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getDaysUntil = (date: Date | null | undefined) => {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diffTime = d.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-red-900/20 border-red-500/30' : 'bg-red-50 border-red-200'}`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b flex items-center gap-3 ${isDark ? 'border-red-500/30' : 'border-red-200'}`}>
        <div className="p-2 rounded-lg bg-red-500/20">
          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div>
          <h3 className={`font-semibold ${isDark ? 'text-red-300' : 'text-red-700'}`}>
            Out of Stock ({items.length} item{items.length !== 1 ? 's' : ''})
          </h3>
          <p className={`text-sm ${isDark ? 'text-red-400/70' : 'text-red-600/70'}`}>
            Items with zero inventory requiring immediate attention
          </p>
        </div>
      </div>

      {/* Stockout Items */}
      <div className={`divide-y ${isDark ? 'divide-red-500/20' : 'divide-red-200'}`}>
        {items.map((item) => {
          const isExpanded = expandedItem === item.sku;
          const restockDays = getDaysUntil(item.restock_eta);
          const hasAlternatives = item.alternatives && item.alternatives.length > 0;

          return (
            <div key={item.sku} className="px-6 py-4">
              {/* Main row */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* SKU and name */}
                  <div className="flex items-center gap-2">
                    {onNavigateToSku ? (
                      <button
                        onClick={() => onNavigateToSku(item.sku)}
                        className="font-mono text-sm font-semibold text-blue-400 hover:text-blue-300 hover:underline"
                      >
                        {item.sku}
                      </button>
                    ) : (
                      <span className={`font-mono text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {item.sku}
                      </span>
                    )}
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/30 text-red-400 ring-1 ring-red-500/50">
                      OUT
                    </span>
                  </div>

                  <div className={`text-sm truncate mt-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    {item.product_name}
                  </div>

                  {/* Restock info and pending demand */}
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
                    {/* Restock ETA */}
                    {item.restock_eta && (
                      <div className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        <span className={isDark ? 'text-green-400' : 'text-green-600'}>
                          Restock: {formatDate(item.restock_eta)}
                          {restockDays !== null && ` (${restockDays}d)`}
                        </span>
                      </div>
                    )}

                    {/* PO reference */}
                    {item.restock_po_number && (
                      <div className="flex items-center gap-1">
                        <span className={isDark ? 'text-slate-500' : 'text-gray-500'}>PO:</span>
                        {onNavigateToPO ? (
                          <button
                            onClick={() => onNavigateToPO(item.restock_po_number!)}
                            className="font-mono text-blue-400 hover:text-blue-300 hover:underline"
                          >
                            {item.restock_po_number}
                          </button>
                        ) : (
                          <span className={isDark ? 'text-slate-300' : 'text-gray-700'}>
                            {item.restock_po_number}
                          </span>
                        )}
                        {item.restock_quantity && (
                          <span className={isDark ? 'text-slate-400' : 'text-gray-500'}>
                            ({item.restock_quantity} units)
                          </span>
                        )}
                      </div>
                    )}

                    {/* Pending demand */}
                    {item.pending_demand !== undefined && item.pending_demand > 0 && (
                      <div className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className={isDark ? 'text-amber-400' : 'text-amber-600'}>
                          {item.pending_demand} units pending
                        </span>
                      </div>
                    )}

                    {/* No restock info */}
                    {!item.restock_eta && !item.restock_po_number && (
                      <span className={`italic ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                        No restock scheduled
                      </span>
                    )}
                  </div>

                  {/* Alternatives toggle */}
                  {hasAlternatives && (
                    <button
                      onClick={() => setExpandedItem(isExpanded ? null : item.sku)}
                      className={`mt-2 flex items-center gap-1 text-xs ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-500'}`}
                    >
                      <svg
                        className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {isExpanded ? 'Hide' : 'Show'} {item.alternatives!.length} alternative{item.alternatives!.length !== 1 ? 's' : ''}
                    </button>
                  )}
                </div>

                {/* Action Menu */}
                <RiskActionMenu
                  sku={item.sku}
                  productName={item.product_name}
                  recommendedQty={item.pending_demand || 100}
                  onCreatePO={onCreatePO}
                  onAdjustROP={onAdjustROP}
                  onMarkForReview={onMarkForReview}
                />
              </div>

              {/* Expanded alternatives */}
              {isExpanded && hasAlternatives && (
                <div className={`mt-3 ml-4 pl-3 border-l-2 ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
                  <div className={`text-xs font-medium mb-2 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                    Alternative Items in Stock:
                  </div>
                  <div className="space-y-2">
                    {item.alternatives!.map((alt) => (
                      <div
                        key={alt.sku}
                        className={`flex items-center justify-between p-2 rounded ${isDark ? 'bg-slate-800/50' : 'bg-white'}`}
                      >
                        <div className="flex items-center gap-2">
                          {onNavigateToSku ? (
                            <button
                              onClick={() => onNavigateToSku(alt.sku)}
                              className="font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline"
                            >
                              {alt.sku}
                            </button>
                          ) : (
                            <span className={`font-mono text-xs ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {alt.sku}
                            </span>
                          )}
                          {alt.similarity_reason && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-gray-100 text-gray-500'}`}>
                              {alt.similarity_reason}
                            </span>
                          )}
                        </div>
                        <span className={`text-xs font-medium ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                          {alt.current_stock} in stock
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
