/**
 * Backorder Queue Dashboard
 *
 * Displays pending backorders identified by three-way match with stockout risk indicators.
 * Allows users to take action on shortages: create backorder PO, request credit, or dismiss.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from './ThemeProvider';
import Button from './ui/Button';
import StatusBadge from './ui/StatusBadge';
import { supabase } from '../lib/supabase/client';
import { AlertTriangleIcon, TruckIcon, DocumentTextIcon, XMarkIcon, CheckCircleIcon } from './icons';

interface Backorder {
  id: string;
  original_po_id: string;
  backorder_po_id: string | null;
  sku: string;
  item_name: string;
  shortage_quantity: number;
  shortage_value: number;
  status: 'identified' | 'pending_review' | 'backorder_created' | 'resolved' | 'cancelled';
  will_cause_stockout: boolean;
  days_until_stockout: number | null;
  daily_velocity: number | null;
  vendor_invoiced_shortage: boolean | null;
  decision: string | null;
  decision_reason: string | null;
  identified_at: string;
  po_number?: string;
  vendor_name?: string;
}

interface BackorderQueueDashboardProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onCreateBackorderPO?: (backorder: Backorder) => void;
  maxItems?: number;
  compact?: boolean;
}

const BackorderQueueDashboard: React.FC<BackorderQueueDashboardProps> = ({
  addToast,
  onCreateBackorderPO,
  maxItems = 20,
  compact = false,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  const [backorders, setBackorders] = useState<Backorder[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadBackorders();
  }, []);

  const loadBackorders = async () => {
    setLoading(true);
    try {
      // Try to use the view first, fall back to direct query
      const { data, error } = await supabase
        .from('po_backorders')
        .select(`
          *,
          purchase_orders!original_po_id (
            order_id,
            supplier_name
          )
        `)
        .in('status', ['identified', 'pending_review'])
        .order('will_cause_stockout', { ascending: false })
        .order('days_until_stockout', { ascending: true, nullsFirst: false })
        .limit(maxItems);

      if (error) {
        console.error('[BackorderQueue] Query error:', error);
        setBackorders([]);
        return;
      }

      const mapped = (data || []).map(bo => ({
        ...bo,
        po_number: (bo.purchase_orders as any)?.order_id,
        vendor_name: (bo.purchase_orders as any)?.supplier_name,
      }));

      setBackorders(mapped);
    } catch (err) {
      console.error('[BackorderQueue] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackorder = async (backorder: Backorder) => {
    setProcessingId(backorder.id);
    try {
      if (onCreateBackorderPO) {
        onCreateBackorderPO(backorder);
      } else {
        // Default: Update status to backorder_created
        await supabase
          .from('po_backorders')
          .update({
            status: 'backorder_created',
            decision: 'create_backorder',
            decision_reason: 'User initiated backorder PO creation',
          })
          .eq('id', backorder.id);
      }

      addToast?.(`Backorder initiated for ${backorder.sku}`, 'success');
      await loadBackorders();
    } catch (err) {
      addToast?.('Failed to create backorder', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRequestCredit = async (backorder: Backorder) => {
    setProcessingId(backorder.id);
    try {
      await supabase
        .from('po_backorders')
        .update({
          status: 'resolved',
          decision: 'request_credit',
          decision_reason: 'User requested credit for shortage',
        })
        .eq('id', backorder.id);

      addToast?.(`Credit request logged for ${backorder.sku}`, 'success');
      await loadBackorders();
    } catch (err) {
      addToast?.('Failed to log credit request', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDismiss = async (backorder: Backorder, reason: string) => {
    setProcessingId(backorder.id);
    try {
      await supabase
        .from('po_backorders')
        .update({
          status: 'cancelled',
          decision: 'dismissed',
          decision_reason: reason,
        })
        .eq('id', backorder.id);

      addToast?.(`Backorder dismissed for ${backorder.sku}`, 'info');
      await loadBackorders();
    } catch (err) {
      addToast?.('Failed to dismiss backorder', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // Stats
  const stats = useMemo(() => {
    const critical = backorders.filter(bo => bo.will_cause_stockout).length;
    const totalValue = backorders.reduce((sum, bo) => sum + (bo.shortage_value || 0), 0);
    const vendorInvoiced = backorders.filter(bo => bo.vendor_invoiced_shortage === true).length;
    return { total: backorders.length, critical, totalValue, vendorInvoiced };
  }, [backorders]);

  const cardClass = isDark
    ? 'bg-gray-800/50 border border-gray-700 rounded-lg'
    : 'bg-white border border-gray-200 rounded-lg shadow-sm';

  const headerClass = isDark ? 'text-white' : 'text-gray-900';
  const subTextClass = isDark ? 'text-gray-400' : 'text-gray-500';

  if (loading) {
    return (
      <div className={`${cardClass} p-6`}>
        <div className="animate-pulse space-y-4">
          <div className={`h-6 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded w-1/3`} />
          <div className={`h-20 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded`} />
        </div>
      </div>
    );
  }

  if (backorders.length === 0 && compact) {
    return null; // Hide completely in compact mode if no items
  }

  if (backorders.length === 0) {
    return (
      <div className={`${cardClass} p-6`}>
        <div className="flex items-center gap-3">
          <CheckCircleIcon className="w-6 h-6 text-emerald-500" />
          <div>
            <h3 className={`font-medium ${headerClass}`}>No Pending Backorders</h3>
            <p className={`text-sm ${subTextClass}`}>All shortages have been resolved</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      {/* Header */}
      <div className={`p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isDark ? 'bg-amber-900/30' : 'bg-amber-100'}`}>
              <AlertTriangleIcon className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className={`font-semibold ${headerClass}`}>Backorder Queue</h3>
              <p className={`text-xs ${subTextClass}`}>
                {stats.total} shortage{stats.total !== 1 ? 's' : ''} identified
              </p>
            </div>
          </div>
          <Button
            onClick={loadBackorders}
            className={`text-xs px-3 py-1.5 rounded ${
              isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Refresh
          </Button>
        </div>

        {/* Stats Row */}
        {!compact && (
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div className={`p-3 rounded-lg ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
              <p className={`text-xs ${subTextClass}`}>Total Shortages</p>
              <p className={`text-lg font-bold ${headerClass}`}>{stats.total}</p>
            </div>
            <div className={`p-3 rounded-lg ${stats.critical > 0 ? (isDark ? 'bg-red-900/30' : 'bg-red-50') : (isDark ? 'bg-gray-900/50' : 'bg-gray-50')}`}>
              <p className={`text-xs ${stats.critical > 0 ? 'text-red-400' : subTextClass}`}>Will Cause Stockout</p>
              <p className={`text-lg font-bold ${stats.critical > 0 ? 'text-red-500' : headerClass}`}>{stats.critical}</p>
            </div>
            <div className={`p-3 rounded-lg ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
              <p className={`text-xs ${subTextClass}`}>Total Value</p>
              <p className={`text-lg font-bold ${headerClass}`}>${stats.totalValue.toLocaleString()}</p>
            </div>
            <div className={`p-3 rounded-lg ${stats.vendorInvoiced > 0 ? (isDark ? 'bg-amber-900/30' : 'bg-amber-50') : (isDark ? 'bg-gray-900/50' : 'bg-gray-50')}`}>
              <p className={`text-xs ${stats.vendorInvoiced > 0 ? 'text-amber-400' : subTextClass}`}>Invoiced for Missing</p>
              <p className={`text-lg font-bold ${stats.vendorInvoiced > 0 ? 'text-amber-500' : headerClass}`}>{stats.vendorInvoiced}</p>
            </div>
          </div>
        )}
      </div>

      {/* Backorder List */}
      <div className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-100'}`}>
        {backorders.map(bo => (
          <div
            key={bo.id}
            className={`p-4 ${expandedId === bo.id ? (isDark ? 'bg-gray-800' : 'bg-gray-50') : ''}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {bo.will_cause_stockout && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-500/20 text-red-500 uppercase">
                      Stockout Risk
                    </span>
                  )}
                  {bo.vendor_invoiced_shortage && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-500 uppercase">
                      Dispute
                    </span>
                  )}
                  <StatusBadge status={bo.status} size="sm" />
                </div>

                <h4 className={`font-medium truncate ${headerClass}`}>
                  {bo.item_name || bo.sku}
                </h4>
                <p className={`text-xs ${subTextClass}`}>
                  SKU: {bo.sku} | PO: {bo.po_number || 'Unknown'} | {bo.vendor_name || 'Unknown Vendor'}
                </p>

                <div className="flex items-center gap-4 mt-2">
                  <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    <span className="font-semibold text-red-500">{bo.shortage_quantity}</span> units short
                  </div>
                  <div className={`text-sm ${subTextClass}`}>
                    ${bo.shortage_value?.toFixed(2) || '0.00'} value
                  </div>
                  {bo.days_until_stockout !== null && bo.days_until_stockout > 0 && (
                    <div className={`text-sm ${bo.days_until_stockout <= 7 ? 'text-red-500' : subTextClass}`}>
                      {bo.days_until_stockout} days until stockout
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4">
                {processingId === bo.id ? (
                  <span className={`text-sm ${subTextClass}`}>Processing...</span>
                ) : (
                  <>
                    <Button
                      onClick={() => handleCreateBackorder(bo)}
                      className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                      title="Create backorder PO"
                    >
                      <TruckIcon className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => handleRequestCredit(bo)}
                      className={`px-3 py-1.5 text-xs rounded ${
                        isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      title="Request credit"
                    >
                      <DocumentTextIcon className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => handleDismiss(bo, 'User dismissed')}
                      className={`px-3 py-1.5 text-xs rounded ${
                        isDark ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                      title="Dismiss"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Expanded Details */}
            {expandedId === bo.id && (
              <div className={`mt-4 pt-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className={subTextClass}>Identified:</span>
                    <span className={`ml-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      {new Date(bo.identified_at).toLocaleDateString()}
                    </span>
                  </div>
                  {bo.daily_velocity && (
                    <div>
                      <span className={subTextClass}>Daily Velocity:</span>
                      <span className={`ml-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        {bo.daily_velocity.toFixed(1)} units/day
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Toggle Expand */}
            <button
              onClick={() => setExpandedId(expandedId === bo.id ? null : bo.id)}
              className={`mt-2 text-xs ${isDark ? 'text-blue-400' : 'text-blue-600'} hover:underline`}
            >
              {expandedId === bo.id ? 'Show less' : 'Show more'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BackorderQueueDashboard;
