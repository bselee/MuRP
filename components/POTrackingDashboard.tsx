import React, { useEffect, useMemo, useState } from 'react';
import type { POTrackingStatus } from '../types';
import { fetchTrackedPurchaseOrders } from '../services/poTrackingService';
import { RefreshCcwIcon, TruckIcon, AlertTriangleIcon } from './icons';

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
};

const STATUS_COLORS: Record<POTrackingStatus, string> = {
  awaiting_confirmation: 'bg-gray-600/20 text-gray-200 border-gray-500/30',
  confirmed: 'bg-blue-500/20 text-blue-200 border-blue-500/30',
  processing: 'bg-indigo-500/20 text-indigo-200 border-indigo-500/30',
  shipped: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30',
  in_transit: 'bg-purple-500/20 text-purple-200 border-purple-500/30',
  out_for_delivery: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
  delivered: 'bg-green-500/20 text-green-200 border-green-500/30',
  exception: 'bg-red-500/20 text-red-200 border-red-500/30',
  cancelled: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
};

const POTrackingDashboard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [trackedPos, setTrackedPos] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <TruckIcon className="w-5 h-5 text-indigo-400" />
            PO Tracking
          </h2>
          <p className="text-sm text-gray-400">Real-time shipment visibility</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm text-indigo-300 border border-indigo-500/40 rounded-md px-3 py-1.5 hover:bg-indigo-500/10 disabled:opacity-50"
        >
          <RefreshCcwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
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
        <table className="min-w-full divide-y divide-gray-700 text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400">
              <th className="px-4 py-2 text-left">PO</th>
              <th className="px-4 py-2 text-left">Vendor</th>
              <th className="px-4 py-2 text-left">Tracking</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">ETA</th>
              <th className="px-4 py-2 text-left">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {trackedPos.slice(0, 10).map(po => (
              <tr key={po.id} className="text-gray-200">
                <td className="px-4 py-2 font-semibold text-indigo-300">{po.order_id}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
