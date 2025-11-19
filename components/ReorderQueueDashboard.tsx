/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📦 REORDER QUEUE DASHBOARD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Displays items needing reorder with intelligent recommendations.
 * Allows users to create POs directly from reorder queue.
 *
 * Features:
 * - Urgency-based sorting (critical → high → normal → low)
 * - Vendor grouping for batch PO creation
 * - Days until stockout visibility
 * - Consumption rate insights
 * - One-click PO generation
 */

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase/client';
import { ChevronDownIcon, AlertCircleIcon, CheckCircleIcon } from './icons';
import { usePermissions } from '../hooks/usePermissions';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface ReorderQueueItem {
  id: string;
  inventory_sku: string;
  item_name: string;
  vendor_id: string | null;
  vendor_name: string | null;
  current_stock: number;
  on_order: number;
  reorder_point: number;
  recommended_quantity: number;
  consumption_daily: number;
  days_until_stockout: number;
  urgency: 'critical' | 'high' | 'normal' | 'low';
  priority_score: number;
  estimated_cost: number;
  notes: string;
  identified_at: string;
}

interface ReorderQueueDashboardProps {
  onCreatePOs?: (posToCreate: { vendorId: string; items: { sku: string; name: string; quantity: number }[] }[]) => void;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

const ReorderQueueDashboard: React.FC<ReorderQueueDashboardProps> = ({ onCreatePOs, addToast }) => {
  const [items, setItems] = useState<ReorderQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(true);
  const permissions = usePermissions();
  const allowPoCreation = Boolean(onCreatePOs && permissions.canManagePurchaseOrders);

  // Fetch reorder queue items
  useEffect(() => {
    fetchReorderQueue();

    // Set up real-time subscription
    const channel = supabase
      .channel('reorder-queue-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reorder_queue',
        },
        () => {
          console.log('[ReorderQueueDashboard] Real-time update');
          fetchReorderQueue();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchReorderQueue = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('reorder_queue')
        .select('*')
        .eq('status', 'pending')
        .order('priority_score', { ascending: false });

      if (error) throw error;

      setItems(data || []);
    } catch (error) {
      console.error('[ReorderQueueDashboard] Error fetching queue:', error);
    } finally {
      setLoading(false);
    }
  };

  // Group items by urgency
  const itemsByUrgency = useMemo(() => {
    return {
      critical: items.filter(i => i.urgency === 'critical'),
      high: items.filter(i => i.urgency === 'high'),
      normal: items.filter(i => i.urgency === 'normal'),
      low: items.filter(i => i.urgency === 'low'),
    };
  }, [items]);

  // Calculate summary stats
  const summary = useMemo(() => {
    return {
      total: items.length,
      critical: itemsByUrgency.critical.length,
      high: itemsByUrgency.high.length,
      total_cost: items.reduce((sum, item) => sum + item.estimated_cost, 0),
    };
  }, [items, itemsByUrgency]);

  // Group selected items by vendor for PO creation
  const groupedForPO = useMemo(() => {
    const selected = items.filter(item => selectedItems.has(item.id));
    const grouped = new Map<string, { vendorId: string; vendorName: string; items: typeof items }>();

    selected.forEach(item => {
      const vendorId = item.vendor_id || 'unknown';
      const vendorName = item.vendor_name || 'Unknown Vendor';

      if (!grouped.has(vendorId)) {
        grouped.set(vendorId, { vendorId, vendorName, items: [] });
      }

      grouped.get(vendorId)!.items.push(item);
    });

    return Array.from(grouped.values());
  }, [items, selectedItems]);

  const handleToggleItem = (itemId: string) => {
    if (!allowPoCreation) return;
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (urgency?: 'critical' | 'high' | 'normal' | 'low') => {
    if (!allowPoCreation) return;
    const itemsToSelect = urgency ? itemsByUrgency[urgency] : items;
    setSelectedItems(new Set(itemsToSelect.map(i => i.id)));
  };

  const handleClearSelection = () => {
    if (!allowPoCreation) return;
    setSelectedItems(new Set());
  };

  const handleCreatePOs = () => {
    if (!allowPoCreation) {
      addToast?.('You do not have permission to create purchase orders.', 'error');
      return;
    }
    if (groupedForPO.length === 0) {
      addToast?.('No items selected', 'error');
      return;
    }

    const posToCreate = groupedForPO.map(group => ({
      vendorId: group.vendorId,
      items: group.items.map(item => ({
        sku: item.inventory_sku,
        name: item.item_name,
        quantity: item.recommended_quantity,
      })),
    }));

    onCreatePOs?.(posToCreate);
    handleClearSelection();
    addToast?.(`Creating ${posToCreate.length} purchase order(s)`, 'success');
  };

  if (loading) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-6">
        <p className="text-gray-400">Loading reorder queue...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-6">
        <div className="flex items-center gap-3">
          <CheckCircleIcon className="w-6 h-6 text-green-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">All Stocked Up!</h3>
            <p className="text-gray-400 text-sm">No items need reordering at this time.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex justify-between items-center p-4 bg-gray-800 hover:bg-gray-700/50 transition-colors"
        >
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-gray-300">Reorder Queue</h2>
            <div className="flex items-center gap-2">
              {summary.critical > 0 && (
                <span className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-red-600 rounded-full">
                  <AlertCircleIcon className="w-4 h-4" />
                  {summary.critical} Critical
                </span>
              )}
              {summary.high > 0 && (
                <span className="px-3 py-1 text-xs font-bold text-white bg-orange-600 rounded-full">
                  {summary.high} High
                </span>
              )}
              <span className="px-3 py-1 text-xs font-medium text-gray-300 bg-gray-700 rounded-full">
                {summary.total} Total
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              Est. Cost: <span className="font-semibold text-white">${summary.total_cost.toFixed(2)}</span>
            </span>
            <ChevronDownIcon
              className={`w-6 h-6 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            />
          </div>
        </button>

        {isExpanded && (
          <div className="border-t border-gray-700">
            {!allowPoCreation && (
              <div className="bg-gray-900/40 border-b border-gray-800 px-4 py-1 text-sm text-gray-400">
                View-only mode: create permissions are limited to approved roles.
              </div>
            )}
            {/* Action Bar */}
            {allowPoCreation && selectedItems.size > 0 && (
              <div className="bg-indigo-900/30 border-b border-gray-700 p-4 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-300">
                    <span className="font-semibold text-white">{selectedItems.size}</span> item(s) selected
                  </span>
                  <button
                    onClick={handleClearSelection}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex gap-2">
                  {groupedForPO.length > 0 && (
                    <span className="text-sm text-gray-400">
                      Will create {groupedForPO.length} PO(s)
                    </span>
                  )}
                  <button
                    onClick={handleCreatePOs}
                    className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
                  >
                    Create Purchase Orders
                  </button>
                </div>
              </div>
            )}

            {/* Quick Select Buttons */}
            {allowPoCreation && (
              <div className="bg-gray-800/50 p-3 border-b border-gray-700 flex gap-2">
                <button
                  onClick={() => handleSelectAll('critical')}
                  className="text-xs px-3 py-1.5 bg-red-600/20 text-red-400 rounded-md hover:bg-red-600/30 transition-colors"
                >
                  Select Critical ({itemsByUrgency.critical.length})
                </button>
                <button
                  onClick={() => handleSelectAll('high')}
                  className="text-xs px-3 py-1.5 bg-orange-600/20 text-orange-400 rounded-md hover:bg-orange-600/30 transition-colors"
                >
                  Select High ({itemsByUrgency.high.length})
                </button>
                <button
                  onClick={() => handleSelectAll()}
                  className="text-xs px-3 py-1.5 bg-indigo-600/20 text-indigo-400 rounded-md hover:bg-indigo-600/30 transition-colors"
                >
                  Select All ({items.length})
                </button>
              </div>
            )}

            {/* Items Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-800/50">
                  <tr>
                    {allowPoCreation && (
                      <th className="px-4 py-2 text-left">
                        <input
                          type="checkbox"
                          checked={selectedItems.size === items.length && items.length > 0}
                          onChange={e => {
                            if (e.target.checked) {
                              handleSelectAll();
                            } else {
                              handleClearSelection();
                            }
                          }}
                          className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-indigo-600"
                        />
                      </th>
                    )}
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Urgency</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Item</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Vendor</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Stock</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Days Left</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Recommended</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Cost</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Notes</th>
                  </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-gray-700/50 transition-colors ${
                        selectedItems.has(item.id) ? 'bg-indigo-900/20' : ''
                      }`}
                    >
                      {allowPoCreation && (
                        <td className="px-4 py-1">
                          <input
                            type="checkbox"
                            checked={selectedItems.has(item.id)}
                            onChange={() => handleToggleItem(item.id)}
                            className="rounded border-gray-600 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                      )}
                      <td className="px-4 py-1">
                        <UrgencyBadge urgency={item.urgency} />
                      </td>
                      <td className="px-4 py-1">
                        <div>
                          <p className="text-sm font-medium text-white">{item.item_name}</p>
                          <p className="text-xs text-gray-400">{item.inventory_sku}</p>
                        </div>
                      </td>
                      <td className="px-4 py-1 text-sm text-gray-300">{item.vendor_name || 'N/A'}</td>
                      <td className="px-4 py-1">
                        <div className="text-sm">
                          <p className="text-white font-semibold">{item.current_stock}</p>
                          {item.on_order > 0 && (
                            <p className="text-xs text-gray-400">+{item.on_order} on order</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-1">
                        <DaysUntilStockout days={item.days_until_stockout} urgency={item.urgency} />
                      </td>
                      <td className="px-4 py-1">
                        <div className="text-sm">
                          <p className="text-white font-semibold">{item.recommended_quantity}</p>
                          {item.consumption_daily > 0 && (
                            <p className="text-xs text-gray-400">{item.consumption_daily.toFixed(1)}/day</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-1 text-sm text-white font-semibold">
                        ${item.estimated_cost.toFixed(2)}
                      </td>
                      <td className="px-4 py-1 text-xs text-gray-400 max-w-xs truncate" title={item.notes}>
                        {item.notes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Helper Components
// ═══════════════════════════════════════════════════════════════════════════

const UrgencyBadge: React.FC<{ urgency: 'critical' | 'high' | 'normal' | 'low' }> = ({ urgency }) => {
  const config = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    normal: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    low: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  const labels = {
    critical: '🔴 Critical',
    high: '🟠 High',
    normal: '🔵 Normal',
    low: '⚪ Low',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border ${config[urgency]}`}
    >
      {labels[urgency]}
    </span>
  );
};

const DaysUntilStockout: React.FC<{ days: number; urgency: string }> = ({ days, urgency }) => {
  if (days <= 0) {
    return <span className="text-sm font-bold text-red-400">STOCKED OUT</span>;
  } else if (days >= 999) {
    return <span className="text-sm text-gray-500">Low usage</span>;
  }

  const textColor =
    urgency === 'critical' ? 'text-red-400' : urgency === 'high' ? 'text-orange-400' : 'text-gray-300';

  return (
    <span className={`text-sm font-semibold ${textColor}`}>
      {days} day{days !== 1 ? 's' : ''}
    </span>
  );
};

export default ReorderQueueDashboard;
