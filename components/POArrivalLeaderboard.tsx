/**
 * PO Arrival Leaderboard
 * Shows upcoming deliveries sorted by ETA
 */

import React, { useEffect, useState } from 'react';
import { getArrivalPredictions, type POArrivalPrediction } from '../services/poIntelligenceAgent';
import { PackageIcon, TruckIcon, AlertCircleIcon, ClockIcon, CheckCircleIcon } from './icons';

export default function POArrivalLeaderboard() {
  const [predictions, setPredictions] = useState<POArrivalPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'urgent' | 'delayed'>('all');

  useEffect(() => {
    loadPredictions();
    const interval = setInterval(loadPredictions, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  async function loadPredictions() {
    setLoading(true);
    const data = await getArrivalPredictions();
    setPredictions(data);
    setLoading(false);
  }

  const filteredPredictions = predictions.filter(p => {
    if (filter === 'urgent') return p.days_until_arrival < 3;
    if (filter === 'delayed') return p.status === 'delayed';
    return true;
  }).slice(0, 10); // Top 10

  function getStatusIcon(status: POArrivalPrediction['status']) {
    switch (status) {
      case 'on_time':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'delayed':
        return <AlertCircleIcon className="w-5 h-5 text-red-500" />;
      case 'at_risk':
        return <ClockIcon className="w-5 h-5 text-yellow-500" />;
      default:
        return <PackageIcon className="w-5 h-5 text-gray-400" />;
    }
  }

  function getStatusBadge(status: POArrivalPrediction['status']) {
    const badges = {
      on_time: 'bg-green-100 text-green-800',
      delayed: 'bg-red-100 text-red-800',
      at_risk: 'bg-yellow-100 text-yellow-800',
      unknown: 'bg-gray-100 text-gray-800',
    };
    return badges[status] || badges.unknown;
  }

  function formatDaysUntil(days: number): string {
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${days}d`;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TruckIcon className="w-5 h-5" />
          Arrival Leaderboard
        </h3>
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TruckIcon className="w-5 h-5" />
          Arrival Leaderboard
          <span className="ml-auto text-sm font-normal text-gray-500">
            Next {filteredPredictions.length} deliveries
          </span>
        </h3>

        {/* Filters */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-sm font-medium transition ${
              filter === 'all'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({predictions.length})
          </button>
          <button
            onClick={() => setFilter('urgent')}
            className={`px-3 py-1 rounded text-sm font-medium transition ${
              filter === 'urgent'
                ? 'bg-orange-100 text-orange-800'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Urgent ({predictions.filter(p => p.days_until_arrival < 3).length})
          </button>
          <button
            onClick={() => setFilter('delayed')}
            className={`px-3 py-1 rounded text-sm font-medium transition ${
              filter === 'delayed'
                ? 'bg-red-100 text-red-800'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Delayed ({predictions.filter(p => p.status === 'delayed').length})
          </button>
        </div>
      </div>

      <div className="divide-y divide-gray-200">
        {filteredPredictions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <PackageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No incoming shipments</p>
          </div>
        ) : (
          filteredPredictions.map((pred, index) => (
            <div key={pred.po_id} className="p-4 hover:bg-gray-50 transition">
              <div className="flex items-start gap-4">
                {/* Rank */}
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-sm text-gray-600">
                  {index + 1}
                </div>

                {/* Status Icon */}
                <div className="flex-shrink-0 mt-1">
                  {getStatusIcon(pred.status)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">
                      PO #{pred.po_number}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadge(pred.status)}`}>
                      {pred.status.replace('_', ' ')}
                    </span>
                    {pred.confidence === 'low' && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        Low confidence
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-1">
                    {pred.vendor_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {pred.items.length} item{pred.items.length !== 1 ? 's' : ''}
                    {pred.items.some(i => i.is_out_of_stock) && (
                      <span className="ml-2 text-red-600 font-medium">
                        ⚠ Out of stock items
                      </span>
                    )}
                  </p>
                </div>

                {/* ETA Countdown */}
                <div className="flex-shrink-0 text-right">
                  <div className={`text-2xl font-bold ${
                    pred.days_until_arrival < 0
                      ? 'text-red-600'
                      : pred.days_until_arrival < 3
                      ? 'text-orange-600'
                      : 'text-gray-900'
                  }`}>
                    {formatDaysUntil(pred.days_until_arrival)}
                  </div>
                  {pred.expected_date && (
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(pred.expected_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
