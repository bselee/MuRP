/**
 * Product Reorder Intelligence Display
 * Shows purchase/consumption analytics in human-readable format
 */

import React, { useEffect, useState } from 'react';
import { 
  getProductReorderAnalytics, 
  getPurchaseHistory, 
  getConsumptionHistory,
  type ReorderAnalytics 
} from '@/services/reorderIntelligenceService';
import { 
  TrendingUpIcon, 
  TrendingDownIcon, 
  ClockIcon, 
  PackageIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  DollarSignIcon,
  CalendarIcon,
  TruckIcon
} from './icons';

interface ProductReorderIntelligenceProps {
  sku: string;
  productName: string;
}

export default function ProductReorderIntelligence({ sku, productName }: ProductReorderIntelligenceProps) {
  const [analytics, setAnalytics] = useState<ReorderAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, [sku]);

  async function loadAnalytics() {
    setLoading(true);
    const data = await getProductReorderAnalytics(sku);
    setAnalytics(data);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 animate-pulse">
        <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-700 rounded"></div>
          <div className="h-4 bg-gray-700 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <p className="text-gray-400 text-center">No reorder analytics available yet.</p>
        <p className="text-gray-500 text-sm text-center mt-2">
          Data will appear after purchases and consumption are logged.
        </p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OUT_OF_STOCK': return 'bg-red-500/20 text-red-300 border-red-500/50';
      case 'CRITICAL': return 'bg-orange-500/20 text-orange-300 border-orange-500/50';
      case 'REORDER_NOW': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50';
      case 'REORDER_SOON': return 'bg-blue-500/20 text-blue-300 border-blue-500/50';
      default: return 'bg-green-500/20 text-green-300 border-green-500/50';
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'OUT_OF_STOCK' || status === 'CRITICAL') {
      return <AlertCircleIcon className="w-5 h-5" />;
    }
    return <CheckCircleIcon className="w-5 h-5" />;
  };

  const getStatusMessage = (status: string, daysRemaining: number) => {
    switch (status) {
      case 'OUT_OF_STOCK':
        return 'OUT OF STOCK - Order immediately to avoid production delays';
      case 'CRITICAL':
        return `CRITICAL - Only ${Math.ceil(daysRemaining)} days of stock remaining`;
      case 'REORDER_NOW':
        return `Time to reorder - ${Math.ceil(daysRemaining)} days until stockout`;
      case 'REORDER_SOON':
        return `Plan to reorder soon - ${Math.ceil(daysRemaining)} days of stock`;
      default:
        return `Stock levels healthy - ${Math.ceil(daysRemaining)} days supply`;
    }
  };

  return (
    <div className="space-y-4">
      {/* Status Banner */}
      <div className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${getStatusColor(analytics.reorder_status)}`}>
        {getStatusIcon(analytics.reorder_status)}
        <div className="flex-1">
          <div className="font-semibold">{analytics.reorder_status.replace('_', ' ')}</div>
          <div className="text-sm opacity-90">
            {getStatusMessage(analytics.reorder_status, analytics.days_of_stock_remaining)}
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Current Stock */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <PackageIcon className="w-4 h-4 text-blue-400" />
            <div className="text-xs text-gray-400">Current Stock</div>
          </div>
          <div className="text-2xl font-bold text-white">{analytics.available_quantity}</div>
          <div className="text-xs text-gray-500 mt-1">units available</div>
        </div>

        {/* Days Remaining */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <ClockIcon className="w-4 h-4 text-yellow-400" />
            <div className="text-xs text-gray-400">Days Until Stockout</div>
          </div>
          <div className={`text-2xl font-bold ${
            analytics.days_of_stock_remaining < 7 ? 'text-red-400' :
            analytics.days_of_stock_remaining < 14 ? 'text-yellow-400' :
            'text-green-400'
          }`}>
            {analytics.days_of_stock_remaining === 999 ? '∞' : Math.ceil(analytics.days_of_stock_remaining)}
          </div>
          <div className="text-xs text-gray-500 mt-1">days of supply</div>
        </div>

        {/* Daily Usage */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDownIcon className="w-4 h-4 text-purple-400" />
            <div className="text-xs text-gray-400">Daily Usage</div>
          </div>
          <div className="text-2xl font-bold text-white">
            {analytics.daily_consumption_rate.toFixed(1)}
          </div>
          <div className="text-xs text-gray-500 mt-1">units per day</div>
        </div>

        {/* Lead Time */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TruckIcon className="w-4 h-4 text-green-400" />
            <div className="text-xs text-gray-400">Avg Lead Time</div>
          </div>
          <div className="text-2xl font-bold text-white">
            {Math.ceil(analytics.avg_lead_time_days)}
          </div>
          <div className="text-xs text-gray-500 mt-1">days from order</div>
        </div>
      </div>

      {/* Consumption Trends */}
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Consumption Trends</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-400 mb-1">Last 30 Days</div>
            <div className="text-xl font-bold text-white">
              {analytics.consumed_last_30_days} units
            </div>
            <div className="text-xs text-gray-500">
              Avg: {(analytics.consumed_last_30_days / 30).toFixed(1)} units/day
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-400 mb-1">Last 90 Days</div>
            <div className="text-xl font-bold text-white">
              {analytics.consumed_last_90_days} units
            </div>
            <div className="text-xs text-gray-500">
              Avg: {(analytics.consumed_last_90_days / 90).toFixed(1)} units/day
            </div>
          </div>
        </div>
      </div>

      {/* Intelligent Recommendations */}
      <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-blue-500/30 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUpIcon className="w-5 h-5 text-blue-400" />
          AI Recommendations
        </h3>
        
        <div className="space-y-4">
          {/* Suggested Reorder Point */}
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-gray-300">Suggested Reorder Point</div>
              <div className="text-xs text-gray-500 mt-1">
                Based on {Math.ceil(analytics.avg_lead_time_days)} day lead time + 7 day safety buffer
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-accent-400">
                {Math.ceil(analytics.suggested_reorder_point)} units
              </div>
              {analytics.reorder_point !== analytics.suggested_reorder_point && (
                <div className="text-xs text-yellow-400 mt-1">
                  Current: {analytics.reorder_point} 
                  {analytics.suggested_reorder_point > analytics.reorder_point ? ' ⚠️ Too low' : ' ✓ Adequate'}
                </div>
              )}
            </div>
          </div>

          {/* Suggested Max Stock */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-700">
            <div>
              <div className="text-sm text-gray-300">Suggested Max Stock</div>
              <div className="text-xs text-gray-500 mt-1">
                90 days supply based on current consumption
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-accent-400">
                {Math.ceil(analytics.suggested_max_stock)} units
              </div>
            </div>
          </div>

          {/* Order Recommendation */}
          {analytics.available_quantity <= analytics.suggested_reorder_point && (
            <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="text-sm font-semibold text-yellow-300 mb-2">
                Recommended Order Quantity
              </div>
              <div className="text-3xl font-bold text-yellow-400">
                {Math.ceil(analytics.suggested_max_stock - analytics.available_quantity)} units
              </div>
              <div className="text-xs text-gray-400 mt-2">
                This will bring stock to max level ({Math.ceil(analytics.suggested_max_stock)} units)
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Estimated cost: ${(analytics.avg_unit_cost * (analytics.suggested_max_stock - analytics.available_quantity)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Purchase & Consumption History Toggle */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="w-full bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 rounded-lg p-4 text-left transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-gray-400" />
            <span className="text-white font-medium">Purchase & Consumption History</span>
          </div>
          <span className="text-gray-400">{showHistory ? '−' : '+'}</span>
        </div>
      </button>

      {showHistory && (
        <HistoryView sku={sku} />
      )}
    </div>
  );
}

function HistoryView({ sku }: { sku: string }) {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [consumption, setConsumption] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHistory() {
      const [p, c] = await Promise.all([
        getPurchaseHistory(sku, 90),
        getConsumptionHistory(sku, 90)
      ]);
      setPurchases(p);
      setConsumption(c);
      setLoading(false);
    }
    loadHistory();
  }, [sku]);

  if (loading) {
    return <div className="text-center py-4 text-gray-400">Loading history...</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Purchases */}
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
        <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
          <TruckIcon className="w-4 h-4 text-green-400" />
          Recent Purchases (Last 90 Days)
        </h4>
        {purchases.length === 0 ? (
          <p className="text-gray-500 text-sm">No purchase history</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {purchases.map((p, i) => (
              <div key={i} className="text-sm p-2 bg-gray-900/50 rounded border border-gray-700">
                <div className="flex justify-between">
                  <span className="text-gray-300">{p.quantity_purchased} units</span>
                  <span className="text-green-400">${p.unit_cost?.toFixed(2)}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {p.received_at ? new Date(p.received_at).toLocaleDateString() : 'Pending'}
                  {p.lead_time_days && ` • ${p.lead_time_days} day lead time`}
                </div>
                {p.vendor_name && (
                  <div className="text-xs text-gray-600 mt-1">from {p.vendor_name}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Consumption */}
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
        <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
          <TrendingDownIcon className="w-4 h-4 text-purple-400" />
          Recent Usage (Last 90 Days)
        </h4>
        {consumption.length === 0 ? (
          <p className="text-gray-500 text-sm">No consumption history</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {consumption.map((c, i) => (
              <div key={i} className="text-sm p-2 bg-gray-900/50 rounded border border-gray-700">
                <div className="flex justify-between">
                  <span className="text-gray-300">{c.quantity_consumed} units</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    c.consumption_type === 'production' ? 'bg-blue-500/20 text-blue-300' :
                    c.consumption_type === 'sale' ? 'bg-green-500/20 text-green-300' :
                    'bg-gray-500/20 text-gray-300'
                  }`}>
                    {c.consumption_type}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(c.consumed_at).toLocaleDateString()}
                </div>
                {c.source_reference && (
                  <div className="text-xs text-gray-600 mt-1">{c.source_reference}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
