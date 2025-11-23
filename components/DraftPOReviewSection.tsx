import Button from '@/components/ui/Button';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📝 DRAFT PO REVIEW SECTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Displays draft POs needing review with approve/discard actions.
 * Highlights auto-generated POs for easy identification.
 *
 * Features:
 * - Filter for draft/pending POs
 * - Auto-generated badge
 * - Quick approve/discard actions
 * - Expandable item details
 */

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase/client';
import { ChevronDownIcon, CheckCircleIcon, XCircleIcon, BotIcon } from './icons';

interface DraftPO {
  id: string;
  order_id: string;
  vendor_id: string;
  vendor_name: string;
  status: string;
  order_date: string;
  expected_date: string;
  auto_generated: boolean;
  auto_approved: boolean;
  item_count: number;
  total_cost: number;
  items: Array<{
    inventory_sku: string;
    item_name: string;
    quantity_ordered: number;
    unit_cost: number;
  }>;
}

interface DraftPOReviewSectionProps {
  onApprove?: (orderId: string) => void;
  onDiscard?: (orderId: string) => void;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const DraftPOReviewSection: React.FC<DraftPOReviewSectionProps> = ({ onApprove, onDiscard, addToast }) => {
  const [draftPOs, setDraftPOs] = useState<DraftPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedPO, setExpandedPO] = useState<string | null>(null);

  useEffect(() => {
    fetchDraftPOs();

    // Subscribe to changes
    const channel = supabase
      .channel('draft-po-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchase_orders',
          filter: 'status=eq.draft',
        },
        () => {
          fetchDraftPOs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchDraftPOs = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          order_id,
          vendor_id,
          supplier_name,
          status,
          order_date,
          expected_date,
          auto_generated,
          auto_approved,
          purchase_order_items (
            inventory_sku,
            item_name,
            quantity_ordered,
            unit_cost
          )
        `)
        .eq('status', 'draft')
        .order('order_date', { ascending: false });

      if (error) throw error;

      const formatted: DraftPO[] = (data || []).map((po: any) => ({
        id: po.id,
        order_id: po.order_id,
        vendor_id: po.vendor_id,
        vendor_name: po.supplier_name,
        status: po.status,
        order_date: po.order_date,
        expected_date: po.expected_date,
        auto_generated: po.auto_generated || false,
        auto_approved: po.auto_approved || false,
        item_count: po.purchase_order_items?.length || 0,
        total_cost: (po.purchase_order_items || []).reduce(
          (sum: number, item: any) => sum + (item.quantity_ordered * item.unit_cost),
          0
        ),
        items: po.purchase_order_items || [],
      }));

      setDraftPOs(formatted);
    } catch (error) {
      console.error('[DraftPOReviewSection] Error fetching drafts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (po: DraftPO) => {
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({
          status: 'pending',
          reviewed_by: 'current_user', // TODO: Get actual user
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', po.id);

      if (error) throw error;

      addToast?.(`Approved PO ${po.order_id}`, 'success');
      onApprove?.(po.order_id);
      fetchDraftPOs();
    } catch (error) {
      console.error('Error approving PO:', error);
      addToast?.('Failed to approve PO', 'error');
    }
  };

  const handleDiscard = async (po: DraftPO) => {
    if (!confirm(`Discard ${po.order_id}? This will cancel the PO.`)) return;

    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({
          status: 'cancelled',
          reviewed_by: 'current_user', // TODO: Get actual user
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', po.id);

      if (error) throw error;

      addToast?.(`Discarded PO ${po.order_id}`, 'info');
      onDiscard?.(po.order_id);
      fetchDraftPOs();
    } catch (error) {
      console.error('Error discarding PO:', error);
      addToast?.('Failed to discard PO', 'error');
    }
  };

  const autoDrafts = useMemo(() => draftPOs.filter(po => po.auto_generated), [draftPOs]);
  const manualDrafts = useMemo(() => draftPOs.filter(po => !po.auto_generated), [draftPOs]);

  if (loading) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-6">
        <p className="text-gray-400">Loading draft POs...</p>
      </div>
    );
  }

  if (draftPOs.length === 0) {
    return null; // Don't show section if no drafts
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
      <Button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex justify-between items-center p-4 bg-gradient-to-r from-yellow-900/30 to-gray-800 hover:from-yellow-900/40 transition-colors border-b border-yellow-700/30"
      >
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-yellow-300">Draft POs Needing Review</h2>
          <div className="flex items-center gap-2">
            {autoDrafts.length > 0 && (
              <span className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-yellow-600 rounded-full">
                <BotIcon className="w-4 h-4" />
                {autoDrafts.length} Auto-Generated
              </span>
            )}
            <span className="px-3 py-1 text-xs font-medium text-gray-300 bg-gray-700 rounded-full">
              {draftPOs.length} Total
            </span>
          </div>
        </div>
        <ChevronDownIcon
          className={`w-6 h-6 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </Button>

      {isExpanded && (
        <div className="divide-y divide-gray-700">
          {draftPOs.map((po) => (
            <div key={po.id} className="bg-gray-800 hover:bg-gray-700/50 transition-colors">
              <div className="p-4 flex items-center justify-between">
                {/* PO Info */}
                <div className="flex-1 grid grid-cols-5 gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-indigo-400">{po.order_id}</span>
                      {po.auto_generated && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-yellow-600/20 text-yellow-400 border border-yellow-600/30 rounded"
                          title="Auto-generated by reorder scanner"
                        >
                          <BotIcon className="w-3 h-3" />
                          Auto
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(po.order_date).toLocaleDateString()}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-white">{po.vendor_name}</p>
                    <p className="text-xs text-gray-400">Vendor</p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-white">{po.item_count} items</p>
                    <Button
                      onClick={() => setExpandedPO(expandedPO === po.id ? null : po.id)}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      {expandedPO === po.id ? 'Hide' : 'View'} details
                    </Button>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-white">${po.total_cost.toFixed(2)}</p>
                    <p className="text-xs text-gray-400">Total Cost</p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-300">
                      {po.expected_date ? new Date(po.expected_date).toLocaleDateString() : 'N/A'}
                    </p>
                    <p className="text-xs text-gray-400">Expected</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    onClick={() => handleApprove(po)}
                    className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 transition-colors"
                    title="Approve and move to Pending status"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    Approve
                  </Button>
                  <Button
                    onClick={() => handleDiscard(po)}
                    className="flex items-center gap-1 px-3 py-2 bg-red-600/80 text-white text-sm font-semibold rounded-md hover:bg-red-600 transition-colors"
                    title="Discard this PO"
                  >
                    <XCircleIcon className="w-4 h-4" />
                    Discard
                  </Button>
                </div>
              </div>

              {/* Expanded Item Details */}
              {expandedPO === po.id && (
                <div className="px-4 pb-4 bg-gray-900/50">
                  <table className="table-density min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400">
                        <th className="py-2">SKU</th>
                        <th className="py-2">Item Name</th>
                        <th className="py-2 text-right">Quantity</th>
                        <th className="py-2 text-right">Unit Cost</th>
                        <th className="py-2 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {po.items.map((item, idx) => (
                        <tr key={idx} className="text-gray-300">
                          <td className="py-2 font-mono text-xs">{item.inventory_sku}</td>
                          <td className="py-2">{item.item_name}</td>
                          <td className="py-2 text-right">{item.quantity_ordered}</td>
                          <td className="py-2 text-right">${item.unit_cost.toFixed(2)}</td>
                          <td className="py-2 text-right font-semibold">
                            ${(item.quantity_ordered * item.unit_cost).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DraftPOReviewSection;
