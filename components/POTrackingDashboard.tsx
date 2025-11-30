import React, { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import type { POTrackingStatus } from '../types';
import type { TrackingTimelineEvent, TrackingHistoryRow } from '@/services/poTrackingService';
import {
  fetchTrackedPurchaseOrders,
  fetchTrackingTimeline,
  fetchTrackingHistoryRows,
} from '../services/poTrackingService';
import {
  RefreshCcwIcon,
  TruckIcon,
  AlertTriangleIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  ClockIcon,
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

const STATUS_COLORS: Record<POTrackingStatus, string> = {
  awaiting_confirmation: 'bg-gray-600/20 text-gray-200 border-gray-500/30',
  confirmed: 'bg-blue-500/20 text-blue-200 border-blue-500/30',
  processing: 'bg-accent-500/20 text-accent-200 border-accent-500/30',
  shipped: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30',
  in_transit: 'bg-purple-500/20 text-purple-200 border-purple-500/30',
  out_for_delivery: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
  delivered: 'bg-green-500/20 text-green-200 border-green-500/30',
  exception: 'bg-red-500/20 text-red-200 border-red-500/30',
  cancelled: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  invoice_received: 'bg-teal-500/20 text-teal-100 border-teal-500/30',
};

const POTrackingDashboard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [trackedPos, setTrackedPos] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [timelinePo, setTimelinePo] = useState<any | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TrackingTimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTrackedPurchaseOrders();
      setTrackedPos(data);
    } catch (err) {
      console.error('[POTrackingDashboard] refresh failed', err);
      setError(err instanceof Error ? err.message : 'Failed to load tracking data');
    } finally {
      setLoading(false);
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
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <p className="text-gray-400">Loading tracking data…</p>
      </div>
    );
  }

  if (!trackedPos.length && !loading) {
    return null;
  }

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <TruckIcon className="w-5 h-5 text-accent-400" />
            PO Tracking
          </h2>
          <p className="text-sm text-gray-400">Real-time shipment visibility</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExportHistory}
            disabled={exporting || !trackedPos.length}
            className="inline-flex items-center gap-2 text-sm text-amber-200 border border-amber-500/40 rounded-md px-3 py-1.5 hover:bg-amber-500/10 disabled:opacity-40"
            title="Download full tracking history (CSV)"
          >
            <ArrowDownTrayIcon className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`} />
            Export CSV
          </Button>
          <Button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 text-sm text-accent-300 border border-accent-500/40 rounded-md px-3 py-1.5 hover:bg-accent-500/10 disabled:opacity-50"
          >
            <RefreshCcwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-700">
          <p className="text-sm text-gray-400">At Risk</p>
          <p className="text-2xl font-semibold text-red-300">{summary.atRisk}</p>
        </div>
        <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-700">
          <p className="text-sm text-gray-400">Out for Delivery</p>
          <p className="text-2xl font-semibold text-amber-300">{summary.outForDelivery}</p>
        </div>
        <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-700">
          <p className="text-sm text-gray-400">Delivered Today</p>
          <p className="text-2xl font-semibold text-green-300">{summary.deliveredToday}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-density min-w-full divide-y divide-gray-700 text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400">
              <th className="px-4 py-2 text-left">PO</th>
              <th className="px-4 py-2 text-left">Vendor</th>
              <th className="px-4 py-2 text-left">Tracking</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">ETA</th>
              <th className="px-4 py-2 text-left">Updated</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {trackedPos.slice(0, 10).map(po => (
              <tr key={po.id} className="text-gray-200">
                <td className="px-4 py-2 font-semibold text-accent-300">{po.order_id}</td>
                <td className="px-4 py-2">{po.vendor_name}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-col">
                    <span>{po.tracking_number}</span>
                    <span className="text-xs text-gray-400 uppercase">{po.tracking_carrier || '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_COLORS[po.tracking_status as POTrackingStatus] ?? 'bg-gray-700 text-gray-200 border-gray-600'}`}>
                    {STATUS_LABELS[po.tracking_status as POTrackingStatus] ?? po.tracking_status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {po.tracking_estimated_delivery
                    ? new Date(po.tracking_estimated_delivery).toLocaleDateString()
                    : '—'}
                </td>
                <td className="px-4 py-2">
                  {po.tracking_last_checked_at
                    ? new Date(po.tracking_last_checked_at).toLocaleString()
                    : '—'}
                </td>
                <td className="px-4 py-2">
                  <Button
                    onClick={() => openTimeline(po)}
                    className="text-xs text-accent-200 border border-accent-500/40 rounded-md px-2 py-1 hover:bg-accent-500/10"
                  >
                    Timeline
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {timelinePo && (
        <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Timeline</p>
              <h3 className="text-lg font-semibold text-white">
                PO #{timelinePo.order_id} — {timelinePo.vendor_name}
              </h3>
              <p className="text-xs text-gray-400">
                Tracking {timelinePo.tracking_number} ({timelinePo.tracking_carrier || 'Carrier TBD'})
              </p>
            </div>
            <Button
              onClick={closeTimeline}
              className="p-2 text-gray-400 hover:text-white rounded-full border border-gray-700 hover:bg-gray-800"
              title="Close timeline"
            >
              <XMarkIcon className="w-4 h-4" />
            </Button>
          </div>

          {timelineError && <p className="text-xs text-red-400">{timelineError}</p>}

          {timelineLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <ClockIcon className="w-4 h-4 animate-spin" />
              Loading timeline…
            </div>
          ) : (
            <ul className="space-y-4 relative">
              {timelineEvents.length === 0 ? (
                <li className="text-gray-400 text-sm">No tracking events recorded yet.</li>
              ) : (
                timelineEvents
                  .slice()
                  .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                  .map(event => (
                    <li key={event.id} className="pl-6 relative">
                      <span className="absolute left-1 top-1.5 h-2 w-2 rounded-full bg-accent-400" />
                      <div className="text-xs uppercase text-gray-500">
                        {new Date(event.created_at).toLocaleString()}
                      </div>
                      <div className="text-sm font-semibold text-white">
                        {STATUS_LABELS[event.status] ?? event.status}
                      </div>
                      {event.description && (
                        <p className="text-sm text-gray-300">{event.description}</p>
                      )}
                      <div className="text-xs text-gray-500 flex flex-wrap gap-3 mt-1">
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
        <div className="flex items-center gap-2 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
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
