import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Button from '@/components/ui/Button';
import { useTheme } from './ThemeProvider';
import type { POTrackingStatus } from '../types';
import type { TrackingTimelineEvent, TrackingHistoryRow } from '@/services/poTrackingService';
import {
  fetchTrackedPurchaseOrders,
  fetchTrackingTimeline,
  fetchTrackingHistoryRows,
} from '../services/poTrackingService';
import { supabase } from '../lib/supabase/client';
import {
  RefreshCcwIcon,
  AlertTriangleIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  ClockIcon,
  ChatBubbleIcon,
  CheckCircleIcon,
} from './icons';

const STATUS_LABELS: Record<POTrackingStatus, string> = {
  awaiting_confirmation: 'Awaiting Vendor',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  exception: 'Exception',
  cancelled: 'Cancelled',
  invoice_received: 'Invoice Logged',
};

// Light theme colors - clean, professional look matching Inventory page
const STATUS_COLORS_LIGHT: Record<POTrackingStatus, string> = {
  awaiting_confirmation: 'bg-gray-100 text-gray-700 border-gray-300',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  processing: 'bg-amber-50 text-amber-700 border-amber-200',
  shipped: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  in_transit: 'bg-purple-50 text-purple-700 border-purple-200',
  out_for_delivery: 'bg-amber-100 text-amber-800 border-amber-300',
  delivered: 'bg-green-50 text-green-700 border-green-200',
  exception: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-300',
  invoice_received: 'bg-teal-50 text-teal-700 border-teal-200',
};

// Dark theme colors
const STATUS_COLORS_DARK: Record<POTrackingStatus, string> = {
  awaiting_confirmation: 'bg-gray-600/20 text-gray-200 border-gray-500/30',
  confirmed: 'bg-blue-500/20 text-blue-200 border-blue-500/30',
  processing: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
  shipped: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30',
  in_transit: 'bg-purple-500/20 text-purple-200 border-purple-500/30',
  out_for_delivery: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
  delivered: 'bg-green-500/20 text-green-200 border-green-500/30',
  exception: 'bg-red-500/20 text-red-200 border-red-500/30',
  cancelled: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  invoice_received: 'bg-teal-500/20 text-teal-100 border-teal-500/30',
};

interface PendingFollowUp {
  thread_id: string;
  finale_po_id: string | null;
  po_number: string | null;
  vendor_name: string | null;
  days_since_outbound: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  suggested_action: string | null;
}

interface POTrackingDashboardProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const POTrackingDashboard: React.FC<POTrackingDashboardProps> = ({ addToast }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  const STATUS_COLORS = isDark ? STATUS_COLORS_DARK : STATUS_COLORS_LIGHT;

  const [loading, setLoading] = useState(false);
  const [trackedPos, setTrackedPos] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [timelinePo, setTimelinePo] = useState<any | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TrackingTimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [pendingFollowups, setPendingFollowups] = useState<PendingFollowUp[]>([]);

  const loadFollowups = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('pending_vendor_followups')
        .select('thread_id, finale_po_id, po_number, vendor_name, days_since_outbound, urgency, suggested_action')
        .eq('vendor_recently_active', false)
        .in('urgency', ['critical', 'high', 'medium'])
        .order('days_since_outbound', { ascending: false })
        .limit(5);
      if (!err && data) {
        setPendingFollowups(data);
      }
    } catch (e) {
      console.error('[POTrackingDashboard] followups load failed', e);
    }
  }, []);

  const refresh = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTrackedPurchaseOrders();
      setTrackedPos(data);
      await loadFollowups();
    } catch (err) {
      console.error('[POTrackingDashboard] refresh failed', err);
      setError(err instanceof Error ? err.message : 'Failed to load tracking data');
    } finally {
      setLoading(false);
    }
  };

  const dismissFollowup = async (threadId: string) => {
    try {
      await supabase
        .from('vendor_followup_alerts')
        .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
        .eq('email_thread_id', threadId)
        .eq('status', 'pending');
      await supabase
        .from('email_threads')
        .update({ needs_followup: false, vendor_response_status: 'resolved' })
        .eq('id', threadId);
      setPendingFollowups(prev => prev.filter(f => f.thread_id !== threadId));
      addToast?.('Alert dismissed', 'success');
    } catch (e) {
      console.error('[POTrackingDashboard] dismiss failed', e);
      addToast?.('Failed to dismiss', 'error');
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const openTimeline = async (po: any) => {
    setTimelinePo(po);
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const events = await fetchTrackingTimeline(po.id);
      setTimelineEvents(events);
    } catch (err) {
      console.error('[POTrackingDashboard] timeline load failed', err);
      setTimelineError(err instanceof Error ? err.message : 'Unable to load tracking timeline.');
    } finally {
      setTimelineLoading(false);
    }
  };

  const closeTimeline = () => {
    setTimelinePo(null);
    setTimelineEvents([]);
    setTimelineError(null);
  };

  const handleExportHistory = async () => {
    if (!trackedPos.length) return;
    setExporting(true);
    try {
      const rows = await fetchTrackingHistoryRows(trackedPos.map(po => po.id));
      if (!rows.length) {
        setError('No tracking history available to export.');
        return;
      }
      const csv = buildTrackingCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `po-tracking-history-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[POTrackingDashboard] export failed', err);
      setError(err instanceof Error ? err.message : 'Failed to export tracking history.');
    } finally {
      setExporting(false);
    }
  };

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    trackedPos.forEach(po => {
      counts[po.tracking_status] = (counts[po.tracking_status] || 0) + 1;
    });

    const atRisk = trackedPos.filter(po => po.tracking_status === 'exception').length;
    const outForDelivery = trackedPos.filter(po => po.tracking_status === 'out_for_delivery').length;
    const deliveredToday = trackedPos.filter(po => {
      if (!po.last_event_at) return false;
      const today = new Date().toISOString().split('T')[0];
      return po.last_event_at.startsWith(today) && po.tracking_status === 'delivered';
    }).length;

    return { counts, atRisk, outForDelivery, deliveredToday };
  }, [trackedPos]);

  if (!trackedPos.length && loading) {
    return (
      <div className={`rounded-lg border p-6 ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200'}`}>
        <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>Loading tracking data…</p>
      </div>
    );
  }

  if (!trackedPos.length && !loading) {
    return null;
  }

  return (
    <div className={`rounded-xl shadow-sm border p-6 space-y-4 ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200'}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            PO Tracking
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExportHistory}
            disabled={exporting || !trackedPos.length}
            className={`inline-flex items-center gap-2 text-sm rounded-md px-3 py-1.5 disabled:opacity-40 transition-colors ${isDark ? 'text-gray-200 border border-gray-600 hover:bg-gray-700' : 'text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
            title="Download full tracking history (CSV)"
          >
            <ArrowDownTrayIcon className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`} />
            Export CSV
          </Button>
          <Button
            onClick={refresh}
            disabled={loading}
            className={`inline-flex items-center gap-2 text-sm rounded-md px-3 py-1.5 disabled:opacity-50 transition-colors ${isDark ? 'text-blue-300 border border-blue-500/40 hover:bg-blue-500/10' : 'text-blue-700 border border-blue-300 hover:bg-blue-50'}`}
          >
            <RefreshCcwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className={`rounded-lg p-4 border ${isDark ? 'bg-gray-900/60 border-gray-700' : 'bg-white border-red-200'}`}>
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>At Risk</p>
          <p className={`text-2xl font-semibold ${isDark ? 'text-red-300' : 'text-red-600'}`}>{summary.atRisk}</p>
        </div>
        <div className={`rounded-lg p-4 border ${isDark ? 'bg-gray-900/60 border-gray-700' : 'bg-white border-amber-200'}`}>
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Out for Delivery</p>
          <p className={`text-2xl font-semibold ${isDark ? 'text-amber-300' : 'text-amber-600'}`}>{summary.outForDelivery}</p>
        </div>
        <div className={`rounded-lg p-4 border ${isDark ? 'bg-gray-900/60 border-gray-700' : 'bg-white border-green-200'}`}>
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Delivered Today</p>
          <p className={`text-2xl font-semibold ${isDark ? 'text-green-300' : 'text-green-600'}`}>{summary.deliveredToday}</p>
        </div>
        <div className={`rounded-lg p-4 border ${pendingFollowups.length > 0 ? (isDark ? 'bg-amber-900/20 border-amber-500/50' : 'bg-amber-50 border-amber-300') : (isDark ? 'bg-gray-900/60 border-gray-700' : 'bg-gray-50 border-gray-200')}`}>
          <p className={`text-sm ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>⚠️ Needs Follow-up</p>
          <p className={`text-2xl font-semibold ${pendingFollowups.length > 0 ? (isDark ? 'text-amber-300' : 'text-amber-600') : (isDark ? 'text-gray-400' : 'text-gray-500')}`}>
            {pendingFollowups.length}
          </p>
        </div>
      </div>

      {/* Vendor Follow-up Alerts - inline */}
      {pendingFollowups.length > 0 && (
        <div className={`rounded-lg p-3 ${isDark ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-amber-50 border border-amber-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-medium flex items-center gap-2 ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
              <ChatBubbleIcon className="w-4 h-4" />
              Vendors Not Responding ({pendingFollowups.length})
            </span>
          </div>
          <div className="space-y-2">
            {pendingFollowups.slice(0, 3).map(f => (
              <div key={f.thread_id} className={`flex items-center justify-between rounded px-3 py-2 ${isDark ? 'bg-gray-900/40' : 'bg-white border border-amber-200'}`}>
                <div className="flex-1 min-w-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded mr-2 ${
                    f.urgency === 'critical'
                      ? (isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-700')
                      : f.urgency === 'high'
                        ? (isDark ? 'bg-orange-500/20 text-orange-300' : 'bg-orange-100 text-orange-700')
                        : (isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700')
                  }`}>{f.urgency}</span>
                  <span className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{f.vendor_name}</span>
                  {f.po_number && <span className={`text-xs ml-2 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>PO {f.po_number}</span>}
                  <span className={`text-xs ml-2 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>• {Math.floor(f.days_since_outbound)}d ago</span>
                </div>
                <Button
                  onClick={() => dismissFollowup(f.thread_id)}
                  className={`p-1 ${isDark ? 'text-gray-400 hover:text-green-400' : 'text-gray-500 hover:text-green-600'}`}
                  title="Dismiss"
                >
                  <CheckCircleIcon className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className={`table-density min-w-full text-sm ${isDark ? 'divide-y divide-gray-700' : 'divide-y divide-gray-200'}`}>
          <thead className={isDark ? 'bg-gray-900/50' : 'bg-gray-50'}>
            <tr className={`text-xs uppercase ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              <th className="px-4 py-3 text-left font-semibold">PO</th>
              <th className="px-4 py-3 text-left font-semibold">Vendor</th>
              <th className="px-4 py-3 text-left font-semibold">Tracking</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-left font-semibold">ETA</th>
              <th className="px-4 py-3 text-left font-semibold">Email Intel</th>
              <th className="px-4 py-3 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className={isDark ? 'divide-y divide-gray-800' : 'divide-y divide-gray-100'}>
            {trackedPos.slice(0, 15).map(po => {
              const emailData = po as any;
              const hasEmailIntel = emailData.email_thread_id || emailData.email_count > 0;
              const sentimentColor = emailData.email_sentiment === 'positive'
                ? (isDark ? 'text-green-400' : 'text-green-600')
                : emailData.email_sentiment === 'negative'
                  ? (isDark ? 'text-red-400' : 'text-red-600')
                  : (isDark ? 'text-gray-400' : 'text-gray-500');
              
              return (
                <tr key={po.id} className={`${isDark ? 'text-gray-200 hover:bg-gray-900/40' : 'text-gray-800 hover:bg-gray-50'}`}>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{po.order_id}</span>
                      <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        {(po as any).source === 'finale' ? 'Finale' : 'Internal'}
                      </span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 ${isDark ? '' : 'text-gray-700'}`}>{po.vendor_name}</td>
                  <td className="px-4 py-3">
                    {po.tracking_number ? (
                      <div className="flex flex-col">
                        <span className={`font-mono ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>{po.tracking_number}</span>
                        <span className={`text-xs uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{po.tracking_carrier || '—'}</span>
                      </div>
                    ) : emailData.has_email_tracking ? (
                      <span className={`text-xs ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>📧 In email</span>
                    ) : (
                      <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_COLORS[po.tracking_status as POTrackingStatus] ?? (isDark ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-gray-100 text-gray-700 border-gray-300')}`}>
                      {STATUS_LABELS[po.tracking_status as POTrackingStatus] ?? po.tracking_status ?? 'Unknown'}
                    </span>
                    {emailData.email_derived_status && emailData.email_derived_status !== po.tracking_status && (
                      <div className={`text-xs mt-0.5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                        AI: {emailData.email_derived_status}
                      </div>
                    )}
                  </td>
                  <td className={`px-4 py-3 ${isDark ? '' : 'text-gray-700'}`}>
                    {po.tracking_estimated_delivery
                      ? new Date(po.tracking_estimated_delivery).toLocaleDateString()
                      : emailData.email_derived_eta
                        ? <span className={isDark ? 'text-cyan-400' : 'text-cyan-600'}>{new Date(emailData.email_derived_eta).toLocaleDateString()} (AI)</span>
                        : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {hasEmailIntel ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className={`text-xs ${isDark ? '' : 'text-gray-600'}`}>📧 {emailData.email_count || 0}</span>
                          {emailData.awaiting_response && (
                            <span className={`text-xs px-1 rounded ${isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>Needs Reply</span>
                          )}
                        </div>
                        {emailData.last_vendor_reply && (
                          <span className={`text-xs ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                            ✓ Vendor replied {new Date(emailData.last_vendor_reply).toLocaleDateString()}
                          </span>
                        )}
                        {emailData.email_summary && (
                          <span className={`text-xs ${sentimentColor} truncate max-w-[150px]`} title={emailData.email_summary}>
                            {emailData.email_summary.slice(0, 30)}...
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No emails</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      onClick={() => openTimeline(po)}
                      className={`text-xs rounded-md px-2 py-1 ${isDark ? 'text-blue-300 border border-blue-500/40 hover:bg-blue-500/10' : 'text-blue-700 border border-blue-300 hover:bg-blue-50'}`}
                    >
                      Timeline
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {timelinePo && (
        <div className={`rounded-lg p-4 space-y-3 border ${isDark ? 'bg-gray-900/60 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Timeline</p>
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                PO #{timelinePo.order_id} — {timelinePo.vendor_name}
              </h3>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Tracking {timelinePo.tracking_number} ({timelinePo.tracking_carrier || 'Carrier TBD'})
              </p>
            </div>
            <Button
              onClick={closeTimeline}
              className={`p-2 rounded-full border ${isDark ? 'text-gray-400 hover:text-white border-gray-700 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 border-gray-300 hover:bg-gray-100'}`}
              title="Close timeline"
            >
              <XMarkIcon className="w-4 h-4" />
            </Button>
          </div>

          {timelineError && <p className={`text-xs ${isDark ? 'text-red-400' : 'text-red-600'}`}>{timelineError}</p>}

          {timelineLoading ? (
            <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              <ClockIcon className="w-4 h-4 animate-spin" />
              Loading timeline…
            </div>
          ) : (
            <ul className="space-y-4 relative">
              {timelineEvents.length === 0 ? (
                <li className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No tracking events recorded yet.</li>
              ) : (
                timelineEvents
                  .slice()
                  .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                  .map(event => (
                    <li key={event.id} className="pl-6 relative">
                      <span className={`absolute left-1 top-1.5 h-2 w-2 rounded-full ${isDark ? 'bg-blue-400' : 'bg-blue-500'}`} />
                      <div className={`text-xs uppercase ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        {new Date(event.created_at).toLocaleString()}
                      </div>
                      <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {STATUS_LABELS[event.status] ?? event.status}
                      </div>
                      {event.description && (
                        <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{event.description}</p>
                      )}
                      <div className={`text-xs flex flex-wrap gap-3 mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        {event.carrier && <span>Carrier: {event.carrier}</span>}
                        {event.tracking_number && <span>Tracking: {event.tracking_number}</span>}
                      </div>
                    </li>
                  ))
              )}
            </ul>
          )}
        </div>
      )}

      {summary.atRisk > 0 && (
        <div className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 border ${isDark ? 'text-amber-300 bg-amber-500/10 border-amber-500/30' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
          <AlertTriangleIcon className="w-4 h-4" />
          <span>{summary.atRisk} shipment(s) require attention.</span>
        </div>
      )}
    </div>
  );
};

export default POTrackingDashboard;

function buildTrackingCsv(rows: TrackingHistoryRow[]): string {
  const header = [
    'PO Number',
    'Vendor',
    'Status',
    'Description',
    'Carrier',
    'Tracking Number',
    'Event Time',
  ];

  const lines = rows.map(row => {
    const poInfo = row.purchase_orders ?? { order_id: '', vendor_name: '' };
    return [
      escapeCsvValue(poInfo?.order_id ?? ''),
      escapeCsvValue(poInfo?.vendor_name ?? ''),
      escapeCsvValue(STATUS_LABELS[row.status] ?? row.status),
      escapeCsvValue(row.description ?? ''),
      escapeCsvValue(row.carrier ?? ''),
      escapeCsvValue(row.tracking_number ?? ''),
      escapeCsvValue(new Date(row.created_at).toISOString()),
    ].join(',');
  });

  return [header.join(','), ...lines].join('\n');
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const stringValue = String(value).replace(/"/g, '""');
  return `"${stringValue}"`;
}
