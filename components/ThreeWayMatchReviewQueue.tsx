/**
 * Three-Way Match Review Queue Component
 *
 * Displays POs with match discrepancies that need human review.
 * The autonomous system handles 90-95% of matches automatically.
 * This UI is for the edge cases that fail auto-approval:
 * - Mismatches (score < 85%)
 * - Critical discrepancies
 * - Partial matches exceeding variance threshold
 */

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import { useTheme } from './ThemeProvider';
import Button from '@/components/ui/Button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  RefreshCcwIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from './icons';

interface MatchDiscrepancy {
  type: 'quantity' | 'price' | 'total' | 'missing_item';
  sku?: string;
  expected: number;
  actual: number;
  variance: number;
  severity: 'minor' | 'major' | 'critical';
}

interface ThreeWayMatchRecord {
  id: string;
  po_id: string;
  match_status: 'matched' | 'partial_match' | 'mismatch' | 'pending_data';
  overall_score: number;
  can_auto_approve: boolean;
  discrepancies: MatchDiscrepancy[];
  recommendations: string[];
  line_items: any[];
  totals: {
    po_total?: number;
    invoice_total?: number;
    receipt_total?: number;
  };
  matched_at: string;
  resolved_at: string | null;
  resolution_action: string | null;
  resolution_notes: string | null;
  // Joined data
  order_id?: string;
  supplier_name?: string;
  po_status?: string;
}

interface ThreeWayMatchReviewQueueProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  maxItems?: number;
  compact?: boolean; // When true, hides completely when no items need review
}

export function ThreeWayMatchReviewQueue({
  addToast,
  maxItems = 10,
  compact = false,
}: ThreeWayMatchReviewQueueProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<ThreeWayMatchRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [dashboardStats, setDashboardStats] = useState<{
    pending_extraction: number;
    pending_review: number;
    pending_match: number;
    auto_approved_today: number;
    discrepancies_pending: number;
  } | null>(null);

  const loadMatches = useCallback(async () => {
    try {
      setLoading(true);

      // Load mismatches from the view
      const { data, error } = await supabase
        .from('pos_needing_match_review')
        .select('*')
        .limit(maxItems);

      if (error) {
        console.error('[ThreeWayMatchReviewQueue] Load error:', error);
        return;
      }

      // Also load detailed match data
      if (data && data.length > 0) {
        const poIds = data.map((d) => d.id);
        const { data: matchData } = await supabase
          .from('po_three_way_matches')
          .select('*')
          .in('po_id', poIds);

        // Merge the data
        const merged = data.map((po) => {
          const match = matchData?.find((m) => m.po_id === po.id);
          return {
            ...match,
            order_id: po.order_id,
            supplier_name: po.supplier_name,
            po_status: po.status,
            id: match?.id || po.id,
            po_id: po.id,
            match_status: match?.match_status || po.match_status || 'pending_data',
            overall_score: match?.overall_score || po.overall_score,
            discrepancies: match?.discrepancies || [],
            recommendations: match?.recommendations || [],
            line_items: match?.line_items || [],
            totals: match?.totals || {},
          } as ThreeWayMatchRecord;
        });

        setMatches(merged);
      } else {
        setMatches([]);
      }

      // Load dashboard stats
      const { data: statsData } = await supabase
        .from('invoice_processing_dashboard')
        .select('*')
        .single();

      if (statsData) {
        setDashboardStats(statsData);
      }
    } catch (err) {
      console.error('[ThreeWayMatchReviewQueue] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [maxItems]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const handleResolve = async (
    matchId: string,
    poId: string,
    action: 'approved' | 'rejected' | 'backorder_created' | 'dispute_filed'
  ) => {
    setProcessingId(matchId);
    try {
      const { error } = await supabase
        .from('po_three_way_matches')
        .update({
          resolved_at: new Date().toISOString(),
          resolution_action: action,
          resolution_notes: `Manually ${action} via review queue`,
        })
        .eq('id', matchId);

      if (error) throw error;

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
          .eq('id', poId);
      }

      addToast?.(`Match ${action} successfully`, 'success');
      loadMatches();
    } catch (err) {
      console.error('[ThreeWayMatchReviewQueue] Resolve error:', err);
      addToast?.('Failed to resolve match', 'error');
    } finally {
      setProcessingId(null);
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
        return 'text-red-400';
      case 'major':
        return 'text-yellow-400';
      default:
        return 'text-blue-400';
    }
  };

  const cardBg = isDark
    ? 'bg-gray-800/50 border-gray-700'
    : 'bg-white border-gray-200 shadow-sm';

  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-600';

  // In compact mode, don't show loading state or empty state
  if (loading) {
    if (compact) return null;
    return (
      <Card className={cardBg}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-2">
            <RefreshCcwIcon className="h-4 w-4 animate-spin" />
            <span className={textSecondary}>Loading match queue...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // In compact mode, hide completely when no items need review
  const hasItemsToReview = matches.length > 0 || (dashboardStats?.discrepancies_pending || 0) > 0;
  if (compact && !hasItemsToReview) {
    return null;
  }

  return (
    <div className={compact ? "mt-4" : "space-y-4"}>
      {/* Dashboard Stats - Show only in full mode */}
      {!compact && dashboardStats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className={`p-3 rounded-lg ${cardBg}`}>
            <div className={`text-xs ${textSecondary}`}>Pending Extraction</div>
            <div className={`text-xl font-bold ${textPrimary}`}>
              {dashboardStats.pending_extraction}
            </div>
          </div>
          <div className={`p-3 rounded-lg ${cardBg}`}>
            <div className={`text-xs ${textSecondary}`}>Pending Review</div>
            <div className={`text-xl font-bold ${textPrimary}`}>
              {dashboardStats.pending_review}
            </div>
          </div>
          <div className={`p-3 rounded-lg ${cardBg}`}>
            <div className={`text-xs ${textSecondary}`}>Pending Match</div>
            <div className={`text-xl font-bold ${textPrimary}`}>
              {dashboardStats.pending_match}
            </div>
          </div>
          <div className={`p-3 rounded-lg ${cardBg}`}>
            <div className={`text-xs ${textSecondary}`}>Auto-Approved Today</div>
            <div className="text-xl font-bold text-green-400">
              {dashboardStats.auto_approved_today}
            </div>
          </div>
          <div className={`p-3 rounded-lg ${cardBg}`}>
            <div className={`text-xs ${textSecondary}`}>Discrepancies</div>
            <div className="text-xl font-bold text-yellow-400">
              {dashboardStats.discrepancies_pending}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <Card className={cardBg}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className={`flex items-center gap-2 ${textPrimary}`}>
              <AlertTriangleIcon className="h-5 w-5 text-yellow-500" />
              Three-Way Match Review Queue
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadMatches()}
              disabled={loading}
            >
              <RefreshCcwIcon
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
          <p className={`text-sm ${textSecondary}`}>
            POs with match discrepancies requiring human review
          </p>
        </CardHeader>

        <CardContent>
          {matches.length === 0 ? (
            <div className={`text-center py-8 ${textSecondary}`}>
              <CheckCircleIcon className="h-12 w-12 mx-auto mb-2 text-green-500" />
              <p>All matches resolved! The autonomous system is working well.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((match) => (
                <div
                  key={match.id}
                  className={`border rounded-lg ${isDark ? 'border-gray-700' : 'border-gray-200'}`}
                >
                  {/* Summary Row */}
                  <div
                    className={`p-3 flex items-center justify-between cursor-pointer hover:bg-gray-700/20`}
                    onClick={() =>
                      setExpandedId(expandedId === match.id ? null : match.id)
                    }
                  >
                    <div className="flex items-center gap-3">
                      <Badge className={getStatusColor(match.match_status)}>
                        {match.match_status?.replace('_', ' ')}
                      </Badge>
                      <div>
                        <div className={`font-medium ${textPrimary}`}>
                          {match.order_id || 'Unknown PO'}
                        </div>
                        <div className={`text-sm ${textSecondary}`}>
                          {match.supplier_name || 'Unknown Vendor'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div
                          className={`text-lg font-bold ${
                            (match.overall_score || 0) >= 95
                              ? 'text-green-400'
                              : (match.overall_score || 0) >= 85
                                ? 'text-yellow-400'
                                : 'text-red-400'
                          }`}
                        >
                          {match.overall_score || 0}%
                        </div>
                        <div className={`text-xs ${textSecondary}`}>
                          Match Score
                        </div>
                      </div>
                      {expandedId === match.id ? (
                        <ChevronUpIcon className="h-5 w-5" />
                      ) : (
                        <ChevronDownIcon className="h-5 w-5" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedId === match.id && (
                    <div
                      className={`border-t p-4 space-y-4 ${isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50'}`}
                    >
                      {/* Totals Comparison */}
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className={`text-xs ${textSecondary}`}>
                            PO Total
                          </div>
                          <div className={`font-medium ${textPrimary}`}>
                            ${(match.totals?.po_total || 0).toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className={`text-xs ${textSecondary}`}>
                            Invoice Total
                          </div>
                          <div className={`font-medium ${textPrimary}`}>
                            ${(match.totals?.invoice_total || 0).toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className={`text-xs ${textSecondary}`}>
                            Receipt Total
                          </div>
                          <div className={`font-medium ${textPrimary}`}>
                            ${(match.totals?.receipt_total || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Discrepancies */}
                      {match.discrepancies && match.discrepancies.length > 0 && (
                        <div>
                          <div
                            className={`text-sm font-medium mb-2 ${textPrimary}`}
                          >
                            Discrepancies ({match.discrepancies.length})
                          </div>
                          <div className="space-y-2">
                            {match.discrepancies.map((disc, idx) => (
                              <div
                                key={idx}
                                className={`flex items-center justify-between p-2 rounded ${isDark ? 'bg-gray-700/50' : 'bg-white'}`}
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={getSeverityColor(disc.severity)}
                                  >
                                    {disc.severity === 'critical' ? (
                                      <XCircleIcon className="h-4 w-4" />
                                    ) : (
                                      <AlertTriangleIcon className="h-4 w-4" />
                                    )}
                                  </span>
                                  <span className={textPrimary}>
                                    {disc.type.replace('_', ' ')}
                                    {disc.sku && ` - ${disc.sku}`}
                                  </span>
                                </div>
                                <div className={`text-sm ${textSecondary}`}>
                                  Expected: {disc.expected.toFixed(2)} | Actual:{' '}
                                  {disc.actual.toFixed(2)} | Variance:{' '}
                                  <span
                                    className={
                                      disc.variance > 0
                                        ? 'text-red-400'
                                        : 'text-green-400'
                                    }
                                  >
                                    {disc.variance > 0 ? '+' : ''}
                                    {disc.variance.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recommendations */}
                      {match.recommendations && match.recommendations.length > 0 && (
                        <div>
                          <div
                            className={`text-sm font-medium mb-2 ${textPrimary}`}
                          >
                            Recommendations
                          </div>
                          <ul className={`text-sm ${textSecondary} list-disc pl-4`}>
                            {match.recommendations.map((rec, idx) => (
                              <li key={idx}>{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex justify-end gap-2 pt-2 border-t border-gray-700">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleResolve(match.id, match.po_id, 'dispute_filed')
                          }
                          disabled={processingId === match.id}
                        >
                          File Dispute
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleResolve(
                              match.id,
                              match.po_id,
                              'backorder_created'
                            )
                          }
                          disabled={processingId === match.id}
                        >
                          Create Backorder
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() =>
                            handleResolve(match.id, match.po_id, 'rejected')
                          }
                          disabled={processingId === match.id}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            handleResolve(match.id, match.po_id, 'approved')
                          }
                          disabled={processingId === match.id}
                        >
                          {processingId === match.id ? 'Processing...' : 'Approve'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ThreeWayMatchReviewQueue;
