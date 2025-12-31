/**
 * Three-Way Match Modal Component
 * 
 * Modal view for reviewing PO vs Invoice vs Receipt comparison.
 * Opens when user taps the match badge on a PO card.
 * Shows discrepancies and provides action buttons.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import { useTheme } from './ThemeProvider';
import Button from '@/components/ui/Button';
import { Badge } from '@/components/ui/badge';
import Modal from './Modal';
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  RefreshCcwIcon,
  PackageIcon,
  FileTextIcon,
  TruckIcon,
} from './icons';

interface MatchDiscrepancy {
  type: 'quantity' | 'price' | 'total' | 'missing_item' | 'extra_item';
  sku?: string;
  item_name?: string;
  expected: number;
  actual: number;
  variance: number;
  severity: 'minor' | 'major' | 'critical';
}

interface ThreeWayMatchData {
  id: string;
  po_id: string;
  match_status: 'matched' | 'partial_match' | 'mismatch' | 'pending_data';
  overall_score: number;
  can_auto_approve: boolean;
  discrepancies: MatchDiscrepancy[];
  recommendations: string[];
  line_items: Array<{
    sku: string;
    item_name: string;
    po_qty: number;
    invoice_qty: number;
    receipt_qty: number;
    po_price: number;
    invoice_price: number;
    variance_qty: number;
    variance_price: number;
  }>;
  totals: {
    po_total?: number;
    invoice_total?: number;
    receipt_total?: number;
    po_subtotal?: number;
    invoice_subtotal?: number;
    po_tax?: number;
    invoice_tax?: number;
    po_shipping?: number;
    invoice_shipping?: number;
  };
  matched_at: string;
  resolved_at: string | null;
  resolution_action: string | null;
  resolution_notes: string | null;
}

interface ThreeWayMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  poOrderId: string;
  vendorName?: string;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onResolved?: () => void;
}

export function ThreeWayMatchModal({
  isOpen,
  onClose,
  poOrderId,
  vendorName,
  addToast,
  onResolved,
}: ThreeWayMatchModalProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  const [loading, setLoading] = useState(true);
  const [matchData, setMatchData] = useState<ThreeWayMatchData | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMatchData = useCallback(async () => {
    if (!poOrderId) return;

    try {
      setLoading(true);
      setError(null);

      // Find the match record by order_id
      const { data, error: fetchError } = await supabase
        .from('po_three_way_matches')
        .select(`
          *,
          purchase_orders!inner(order_id, id, supplier_name, status)
        `)
        .eq('purchase_orders.order_id', poOrderId)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          // No match record exists yet
          setMatchData(null);
          setError('No match data available yet. Invoice or receipt may not have been processed.');
        } else {
          throw fetchError;
        }
        return;
      }

      setMatchData(data as ThreeWayMatchData);
    } catch (err) {
      console.error('[ThreeWayMatchModal] Load error:', err);
      setError('Failed to load match data');
    } finally {
      setLoading(false);
    }
  }, [poOrderId]);

  useEffect(() => {
    if (isOpen && poOrderId) {
      loadMatchData();
    }
  }, [isOpen, poOrderId, loadMatchData]);

  const handleResolve = async (action: 'approved' | 'rejected' | 'backorder_created' | 'dispute_filed') => {
    if (!matchData) return;

    setProcessing(true);
    try {
      const { error: updateError } = await supabase
        .from('po_three_way_matches')
        .update({
          resolved_at: new Date().toISOString(),
          resolution_action: action,
          resolution_notes: `Manually ${action} via modal review`,
        })
        .eq('id', matchData.id);

      if (updateError) throw updateError;

      // Update PO status if approved
      if (action === 'approved') {
        await supabase
          .from('purchase_orders')
          .update({
            invoice_verified: true,
            invoice_verified_at: new Date().toISOString(),
            payment_approved: true,
            payment_approved_at: new Date().toISOString(),
          })
          .eq('id', matchData.po_id);
      }

      addToast?.(`Match ${action.replace('_', ' ')} successfully`, 'success');
      onResolved?.();
      onClose();
    } catch (err) {
      console.error('[ThreeWayMatchModal] Resolve error:', err);
      addToast?.('Failed to resolve match', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'matched':
        return <CheckCircleIcon className="h-6 w-6 text-green-500" />;
      case 'partial_match':
        return <AlertTriangleIcon className="h-6 w-6 text-yellow-500" />;
      case 'mismatch':
        return <XCircleIcon className="h-6 w-6 text-red-500" />;
      default:
        return <RefreshCcwIcon className="h-6 w-6 text-gray-500 animate-spin" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'matched':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'partial_match':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'mismatch':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return isDark ? 'text-red-400 bg-red-500/10' : 'text-red-600 bg-red-50';
      case 'major':
        return isDark ? 'text-yellow-400 bg-yellow-500/10' : 'text-yellow-600 bg-yellow-50';
      default:
        return isDark ? 'text-blue-400 bg-blue-500/10' : 'text-blue-600 bg-blue-50';
    }
  };

  const cardBg = isDark ? 'bg-gray-800/50' : 'bg-gray-50';
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-600';
  const borderColor = isDark ? 'border-gray-700' : 'border-gray-200';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <span>Three-Way Match Review</span>
          <Badge variant="outline" className="font-mono">
            PO #{poOrderId}
          </Badge>
        </div>
      }
      size="xl"
    >
      <div className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCcwIcon className="h-8 w-8 animate-spin text-gray-400" />
            <span className={`ml-3 ${textSecondary}`}>Loading match data...</span>
          </div>
        ) : error ? (
          <div className={`text-center py-12 ${textSecondary}`}>
            <AlertTriangleIcon className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p className="text-lg mb-2">No Match Data Available</p>
            <p className="text-sm">{error}</p>
            <p className="text-sm mt-4">
              This PO hasn't been through the three-way match process yet.
              <br />
              An invoice or receipt needs to be processed first.
            </p>
          </div>
        ) : matchData ? (
          <>
            {/* Header with Status */}
            <div className={`flex items-center justify-between p-4 rounded-lg ${cardBg}`}>
              <div className="flex items-center gap-4">
                {getStatusIcon(matchData.match_status)}
                <div>
                  <div className={`text-lg font-semibold ${textPrimary}`}>
                    {vendorName || 'Unknown Vendor'}
                  </div>
                  <Badge className={getStatusColor(matchData.match_status)}>
                    {matchData.match_status?.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`text-3xl font-bold ${
                    matchData.overall_score >= 95
                      ? 'text-green-400'
                      : matchData.overall_score >= 85
                        ? 'text-yellow-400'
                        : 'text-red-400'
                  }`}
                >
                  {matchData.overall_score}%
                </div>
                <div className={`text-sm ${textSecondary}`}>Match Score</div>
              </div>
            </div>

            {/* Three-Way Comparison */}
            <div className="grid grid-cols-3 gap-4">
              {/* PO Column */}
              <div className={`p-4 rounded-lg border ${borderColor} ${cardBg}`}>
                <div className="flex items-center gap-2 mb-3">
                  <PackageIcon className="h-5 w-5 text-blue-400" />
                  <span className={`font-semibold ${textPrimary}`}>Purchase Order</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className={textSecondary}>Subtotal</span>
                    <span className={textPrimary}>${(matchData.totals?.po_subtotal || matchData.totals?.po_total || 0).toFixed(2)}</span>
                  </div>
                  {matchData.totals?.po_tax !== undefined && (
                    <div className="flex justify-between">
                      <span className={textSecondary}>Tax</span>
                      <span className={textPrimary}>${matchData.totals.po_tax.toFixed(2)}</span>
                    </div>
                  )}
                  {matchData.totals?.po_shipping !== undefined && (
                    <div className="flex justify-between">
                      <span className={textSecondary}>Shipping</span>
                      <span className={textPrimary}>${matchData.totals.po_shipping.toFixed(2)}</span>
                    </div>
                  )}
                  <div className={`flex justify-between pt-2 border-t ${borderColor}`}>
                    <span className={`font-semibold ${textPrimary}`}>Total</span>
                    <span className={`font-bold ${textPrimary}`}>${(matchData.totals?.po_total || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Invoice Column */}
              <div className={`p-4 rounded-lg border ${borderColor} ${cardBg}`}>
                <div className="flex items-center gap-2 mb-3">
                  <FileTextIcon className="h-5 w-5 text-purple-400" />
                  <span className={`font-semibold ${textPrimary}`}>Invoice</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className={textSecondary}>Subtotal</span>
                    <span className={textPrimary}>${(matchData.totals?.invoice_subtotal || matchData.totals?.invoice_total || 0).toFixed(2)}</span>
                  </div>
                  {matchData.totals?.invoice_tax !== undefined && (
                    <div className="flex justify-between">
                      <span className={textSecondary}>Tax</span>
                      <span className={textPrimary}>${matchData.totals.invoice_tax.toFixed(2)}</span>
                    </div>
                  )}
                  {matchData.totals?.invoice_shipping !== undefined && (
                    <div className="flex justify-between">
                      <span className={textSecondary}>Shipping</span>
                      <span className={textPrimary}>${matchData.totals.invoice_shipping.toFixed(2)}</span>
                    </div>
                  )}
                  <div className={`flex justify-between pt-2 border-t ${borderColor}`}>
                    <span className={`font-semibold ${textPrimary}`}>Total</span>
                    <span className={`font-bold ${textPrimary}`}>${(matchData.totals?.invoice_total || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Receipt Column */}
              <div className={`p-4 rounded-lg border ${borderColor} ${cardBg}`}>
                <div className="flex items-center gap-2 mb-3">
                  <TruckIcon className="h-5 w-5 text-green-400" />
                  <span className={`font-semibold ${textPrimary}`}>Receipt</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className={textSecondary}>Value</span>
                    <span className={textPrimary}>${(matchData.totals?.receipt_total || 0).toFixed(2)}</span>
                  </div>
                  <div className={`flex justify-between pt-2 border-t ${borderColor}`}>
                    <span className={`font-semibold ${textPrimary}`}>Total</span>
                    <span className={`font-bold ${textPrimary}`}>${(matchData.totals?.receipt_total || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Variance Summary */}
            {matchData.totals && (
              <div className={`p-4 rounded-lg ${cardBg}`}>
                <div className={`text-sm font-semibold mb-2 ${textPrimary}`}>Variance Summary</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between">
                    <span className={textSecondary}>PO vs Invoice</span>
                    <span className={
                      Math.abs((matchData.totals.po_total || 0) - (matchData.totals.invoice_total || 0)) > 50
                        ? 'text-red-400 font-medium'
                        : Math.abs((matchData.totals.po_total || 0) - (matchData.totals.invoice_total || 0)) > 10
                          ? 'text-yellow-400 font-medium'
                          : 'text-green-400 font-medium'
                    }>
                      {((matchData.totals.po_total || 0) - (matchData.totals.invoice_total || 0)) >= 0 ? '+' : ''}
                      ${((matchData.totals.po_total || 0) - (matchData.totals.invoice_total || 0)).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className={textSecondary}>PO vs Receipt</span>
                    <span className={
                      Math.abs((matchData.totals.po_total || 0) - (matchData.totals.receipt_total || 0)) > 50
                        ? 'text-red-400 font-medium'
                        : Math.abs((matchData.totals.po_total || 0) - (matchData.totals.receipt_total || 0)) > 10
                          ? 'text-yellow-400 font-medium'
                          : 'text-green-400 font-medium'
                    }>
                      {((matchData.totals.po_total || 0) - (matchData.totals.receipt_total || 0)) >= 0 ? '+' : ''}
                      ${((matchData.totals.po_total || 0) - (matchData.totals.receipt_total || 0)).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Discrepancies */}
            {matchData.discrepancies && matchData.discrepancies.length > 0 && (
              <div>
                <div className={`text-sm font-semibold mb-3 ${textPrimary}`}>
                  ⚠️ Discrepancies ({matchData.discrepancies.length})
                </div>
                <div className="space-y-2">
                  {matchData.discrepancies.map((disc, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-3 rounded-lg border ${borderColor} ${getSeverityColor(disc.severity)}`}
                    >
                      <div className="flex items-center gap-3">
                        {disc.severity === 'critical' ? (
                          <XCircleIcon className="h-5 w-5" />
                        ) : (
                          <AlertTriangleIcon className="h-5 w-5" />
                        )}
                        <div>
                          <div className="font-medium">
                            {disc.type.replace('_', ' ').charAt(0).toUpperCase() + disc.type.replace('_', ' ').slice(1)}
                          </div>
                          {disc.sku && (
                            <div className={`text-sm ${textSecondary}`}>
                              SKU: {disc.sku} {disc.item_name && `- ${disc.item_name}`}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={textSecondary}>
                          Expected: <span className={textPrimary}>{disc.expected.toFixed(2)}</span>
                        </div>
                        <div className={textSecondary}>
                          Actual: <span className={textPrimary}>{disc.actual.toFixed(2)}</span>
                        </div>
                        <div className={disc.variance > 0 ? 'text-red-400' : 'text-green-400'}>
                          Variance: {disc.variance > 0 ? '+' : ''}{disc.variance.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Line Items */}
            {matchData.line_items && matchData.line_items.length > 0 && (
              <div>
                <div className={`text-sm font-semibold mb-3 ${textPrimary}`}>
                  Line Item Comparison
                </div>
                <div className={`overflow-x-auto rounded-lg border ${borderColor}`}>
                  <table className="w-full text-sm">
                    <thead className={isDark ? 'bg-gray-800' : 'bg-gray-100'}>
                      <tr>
                        <th className={`text-left p-2 ${textPrimary}`}>Item</th>
                        <th className={`text-right p-2 ${textPrimary}`}>PO Qty</th>
                        <th className={`text-right p-2 ${textPrimary}`}>Invoice Qty</th>
                        <th className={`text-right p-2 ${textPrimary}`}>Received</th>
                        <th className={`text-right p-2 ${textPrimary}`}>Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchData.line_items.slice(0, 10).map((item, idx) => (
                        <tr key={idx} className={`border-t ${borderColor}`}>
                          <td className={`p-2 ${textPrimary}`}>
                            <div className="font-mono text-xs">{item.sku}</div>
                            <div className={`text-xs ${textSecondary}`}>{item.item_name}</div>
                          </td>
                          <td className={`text-right p-2 ${textPrimary}`}>{item.po_qty}</td>
                          <td className={`text-right p-2 ${textPrimary}`}>{item.invoice_qty}</td>
                          <td className={`text-right p-2 ${textPrimary}`}>{item.receipt_qty}</td>
                          <td className={`text-right p-2 ${
                            item.variance_qty !== 0
                              ? item.variance_qty < 0 ? 'text-red-400' : 'text-yellow-400'
                              : 'text-green-400'
                          }`}>
                            {item.variance_qty !== 0 ? (item.variance_qty > 0 ? '+' : '') + item.variance_qty : '✓'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {matchData.line_items.length > 10 && (
                    <div className={`text-center py-2 text-sm ${textSecondary}`}>
                      +{matchData.line_items.length - 10} more items
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {matchData.recommendations && matchData.recommendations.length > 0 && (
              <div className={`p-4 rounded-lg ${cardBg}`}>
                <div className={`text-sm font-semibold mb-2 ${textPrimary}`}>💡 Recommendations</div>
                <ul className={`text-sm ${textSecondary} space-y-1`}>
                  {matchData.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-blue-400">•</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            {!matchData.resolved_at && (
              <div className={`flex justify-end gap-3 pt-4 border-t ${borderColor}`}>
                <Button
                  variant="outline"
                  onClick={() => handleResolve('dispute_filed')}
                  disabled={processing}
                >
                  📝 File Dispute
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleResolve('backorder_created')}
                  disabled={processing}
                >
                  📦 Create Backorder
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleResolve('rejected')}
                  disabled={processing}
                >
                  ✕ Reject
                </Button>
                <Button
                  onClick={() => handleResolve('approved')}
                  disabled={processing}
                >
                  {processing ? 'Processing...' : '✓ Approve Payment'}
                </Button>
              </div>
            )}

            {/* Already Resolved Notice */}
            {matchData.resolved_at && (
              <div className={`p-4 rounded-lg ${cardBg} text-center`}>
                <CheckCircleIcon className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <div className={textPrimary}>This match has been resolved</div>
                <div className={textSecondary}>
                  Action: {matchData.resolution_action?.replace('_', ' ')} on{' '}
                  {new Date(matchData.resolved_at).toLocaleDateString()}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

export default ThreeWayMatchModal;
