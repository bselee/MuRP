/**
 * Critical Stockout Dashboard Widget
 * Shows items that are out of stock or will block production
 */

import React, { useEffect, useState } from 'react';
import { 
  getCriticalStockoutAlerts, 
  analyzeBOMBlocking,
  generatePurchaseRecommendations,
  type StockoutAlert,
  type BOMBlockingAnalysis,
  type PurchaseRecommendation
} from '@/services/stockoutPreventionAgent';
import {
  AlertCircleIcon,
  TrendingUpIcon,
  PackageIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon
} from './icons';

export default function CriticalStockoutWidget() {
  const [alerts, setAlerts] = useState<StockoutAlert[]>([]);
  const [bomBlocking, setBomBlocking] = useState<BOMBlockingAnalysis[]>([]);
  const [recommendations, setRecommendations] = useState<PurchaseRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'alerts' | 'blocking' | 'recommendations'>('alerts');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadData();
    
    if (autoRefresh) {
      const interval = setInterval(loadData, 5 * 60 * 1000); // Refresh every 5 minutes
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  async function loadData() {
    setLoading(true);
    const [alertsData, blockingData, recsData] = await Promise.all([
      getCriticalStockoutAlerts(),
      analyzeBOMBlocking(),
      generatePurchaseRecommendations(),
    ]);
    setAlerts(alertsData);
    setBomBlocking(blockingData);
    setRecommendations(recsData);
    setLoading(false);
  }

  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL').length;
  const highCount = alerts.filter(a => a.severity === 'HIGH').length;
  const blockedBuilds = bomBlocking.length;

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <AlertCircleIcon className="w-6 h-6 text-red-400" />
            Stockout Prevention Monitor
          </h2>
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3">
            <div className="text-3xl font-bold text-red-300">{criticalCount}</div>
            <div className="text-sm text-gray-400">Critical Alerts</div>
          </div>
          <div className="bg-orange-900/30 border border-orange-500/50 rounded-lg p-3">
            <div className="text-3xl font-bold text-orange-300">{highCount}</div>
            <div className="text-sm text-gray-400">High Priority</div>
          </div>
          <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-3">
            <div className="text-3xl font-bold text-yellow-300">{blockedBuilds}</div>
            <div className="text-sm text-gray-400">Blocked Builds</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('alerts')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'alerts'
              ? 'text-white border-b-2 border-accent-500'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Stockout Alerts ({alerts.length})
        </button>
        <button
          onClick={() => setActiveTab('blocking')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'blocking'
              ? 'text-white border-b-2 border-accent-500'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          BOM Blocking ({bomBlocking.length})
        </button>
        <button
          onClick={() => setActiveTab('recommendations')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'recommendations'
              ? 'text-white border-b-2 border-accent-500'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Purchase Orders ({recommendations.filter(r => r.urgency === 'IMMEDIATE').length} urgent)
        </button>
      </div>

      {/* Content */}
      <div className="p-6 max-h-[600px] overflow-y-auto">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500"></div>
            <p className="text-gray-400 mt-4">Analyzing inventory...</p>
          </div>
        ) : (
          <>
            {activeTab === 'alerts' && <AlertsTab alerts={alerts} />}
            {activeTab === 'blocking' && <BlockingTab blocking={bomBlocking} />}
            {activeTab === 'recommendations' && <RecommendationsTab recommendations={recommendations} />}
          </>
        )}
      </div>
    </div>
  );
}

function AlertsTab({ alerts }: { alerts: StockoutAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircleIcon className="w-16 h-16 text-green-400 mx-auto mb-4" />
        <p className="text-gray-300 font-medium">No critical stockout alerts</p>
        <p className="text-gray-500 text-sm mt-2">All inventory levels are healthy</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {alerts.map((alert, i) => (
        <div
          key={i}
          className={`p-4 rounded-lg border ${
            alert.severity === 'CRITICAL'
              ? 'bg-red-900/20 border-red-500/50'
              : alert.severity === 'HIGH'
              ? 'bg-orange-900/20 border-orange-500/50'
              : 'bg-yellow-900/20 border-yellow-500/50'
          }`}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                  alert.severity === 'CRITICAL' ? 'bg-red-500 text-white' :
                  alert.severity === 'HIGH' ? 'bg-orange-500 text-white' :
                  'bg-yellow-500 text-black'
                }`}>
                  {alert.severity}
                </span>
                <span className="text-xs text-gray-400">{alert.issue_type.replace('_', ' ')}</span>
              </div>
              <h3 className="font-semibold text-white">{alert.product_name}</h3>
              <p className="text-sm text-gray-300 mt-1">{alert.message}</p>
            </div>
            <div className="text-right ml-4">
              <div className="text-2xl font-bold text-white">{alert.current_stock}</div>
              <div className="text-xs text-gray-400">units left</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-700">
            <div>
              <div className="text-xs text-gray-400">Days Until Stockout</div>
              <div className="text-lg font-semibold text-white mt-1">
                {alert.days_until_stockout < 1 ? 'NOW' : `${Math.ceil(alert.days_until_stockout)} days`}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Recommended Order</div>
              <div className="text-lg font-semibold text-white mt-1">
                {alert.recommended_order_qty} units
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Estimated Cost</div>
              <div className="text-lg font-semibold text-white mt-1">
                ${alert.estimated_cost.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-gray-900/50 rounded">
            <div className="text-xs text-gray-400 mb-1">Recommended Action:</div>
            <div className="text-sm text-gray-200">{alert.recommended_action}</div>
          </div>

          {alert.consumption_change_pct && (
            <div className="mt-2 text-xs text-yellow-400">
              ⚠️ Consumption rate increased {Math.round(alert.consumption_change_pct)}% recently
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BlockingTab({ blocking }: { blocking: BOMBlockingAnalysis[] }) {
  if (blocking.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircleIcon className="w-16 h-16 text-green-400 mx-auto mb-4" />
        <p className="text-gray-300 font-medium">No blocked build orders</p>
        <p className="text-gray-500 text-sm mt-2">All builds have sufficient component inventory</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {blocking.map((build, i) => (
        <div key={i} className="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-white flex items-center gap-2">
                <XCircleIcon className="w-5 h-5 text-red-400" />
                {build.build_order_name}
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                Target: {build.target_quantity} units • Delayed: ~{build.estimated_delay_days} days
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-300">Missing Components:</div>
            {build.missing_components.map((component, j) => (
              <div key={j} className="bg-gray-900/50 rounded p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-medium text-white">{component.product_name}</div>
                    <div className="text-xs text-gray-500 mt-1">{component.sku}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-red-400 font-semibold">
                      Short {component.shortage_qty} units
                    </div>
                    <div className="text-xs text-gray-400">
                      Need {component.required_qty} • Have {component.available_qty}
                    </div>
                  </div>
                </div>
                {component.days_until_available !== null && (
                  <div className="mt-2 text-xs text-yellow-400">
                    Available in ~{component.days_until_available} days if ordered now
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecommendationsTab({ recommendations }: { recommendations: PurchaseRecommendation[] }) {
  if (recommendations.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircleIcon className="w-16 h-16 text-green-400 mx-auto mb-4" />
        <p className="text-gray-300 font-medium">No purchase orders needed</p>
        <p className="text-gray-500 text-sm mt-2">All inventory levels are within normal ranges</p>
      </div>
    );
  }

  const immediate = recommendations.filter(r => r.urgency === 'IMMEDIATE');
  const thisWeek = recommendations.filter(r => r.urgency === 'THIS_WEEK');
  const thisMonth = recommendations.filter(r => r.urgency === 'THIS_MONTH');

  return (
    <div className="space-y-6">
      {immediate.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-red-400 mb-3">⚠️ IMMEDIATE - Order Today</h3>
          <div className="space-y-3">
            {immediate.map((rec, i) => (
              <RecommendationCard key={i} rec={rec} />
            ))}
          </div>
        </div>
      )}

      {thisWeek.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-orange-400 mb-3">This Week</h3>
          <div className="space-y-3">
            {thisWeek.map((rec, i) => (
              <RecommendationCard key={i} rec={rec} />
            ))}
          </div>
        </div>
      )}

      {thisMonth.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-yellow-400 mb-3">This Month</h3>
          <div className="space-y-3">
            {thisMonth.map((rec, i) => (
              <RecommendationCard key={i} rec={rec} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RecommendationCard({ rec }: { rec: PurchaseRecommendation }) {
  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h4 className="font-semibold text-white">{rec.product_name}</h4>
          <p className="text-xs text-gray-500 mt-1">{rec.sku}</p>
          <p className="text-sm text-gray-400 mt-2">{rec.reason}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-accent-400">{rec.recommended_qty}</div>
          <div className="text-xs text-gray-400">units</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 py-3 border-t border-gray-700">
        <div>
          <div className="text-xs text-gray-400">Estimated Cost</div>
          <div className="text-sm font-semibold text-white mt-1">
            ${rec.estimated_cost.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Lead Time</div>
          <div className="text-sm font-semibold text-white mt-1">
            {rec.expected_lead_time_days} days
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Order By</div>
          <div className="text-sm font-semibold text-white mt-1">
            {rec.order_by_date.toLocaleDateString()}
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        Preferred Vendor: <span className="text-gray-300">{rec.preferred_vendor}</span>
      </div>

      {rec.notes.length > 0 && (
        <div className="mt-3 space-y-1">
          {rec.notes.map((note, i) => (
            <div key={i} className="text-xs text-yellow-400">{note}</div>
          ))}
        </div>
      )}
    </div>
  );
}
