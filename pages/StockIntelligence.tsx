import Button from '@/components/ui/Button';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📊 STOCK INTELLIGENCE DASHBOARD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Advanced analytics and insights for inventory intelligence:
 * - Stockout risk heatmap
 * - Forecast accuracy tracking
 * - Consumption trend analysis
 * - Seasonal pattern detection
 * - Vendor performance scoring
 * - Budget utilization tracking
 *
 * @module pages/StockIntelligence
 */

import React, { useState, useMemo, useEffect } from 'react';
import type { InventoryItem, Vendor, PurchaseOrder } from '../types';
import { 
  ChartBarIcon, 
  AlertCircleIcon, 
  TrendingUpIcon, 
  CalendarIcon,
  DollarSignIcon,
  UsersIcon
} from '../components/icons';
import { usePermissions } from '../hooks/usePermissions';

interface StockIntelligenceProps {
  inventory: InventoryItem[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
}

interface StockoutRisk {
  sku: string;
  name: string;
  daysUntilStockout: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  forecastAccuracy?: number;
  trendDirection: 'up' | 'down' | 'stable';
  seasonalFactor?: number;
}

interface VendorPerformance {
  vendorId: string;
  vendorName: string;
  onTimeDeliveryRate: number;
  averageLeadTimeActual: number;
  averageLeadTimeEstimated: number;
  costStability: number;
  reliabilityScore: number;
}

const StockIntelligence: React.FC<StockIntelligenceProps> = ({ inventory, vendors, purchaseOrders }) => {
  const permissions = usePermissions();
  const [activeTab, setActiveTab] = useState<'risks' | 'forecasts' | 'trends' | 'vendors' | 'budget'>('risks');
  const [loading, setLoading] = useState(true);
  const [stockoutRisks, setStockoutRisks] = useState<StockoutRisk[]>([]);
  const [vendorPerformances, setVendorPerformances] = useState<VendorPerformance[]>([]);

  // Calculate stockout risks with trend analysis
  const calculateStockoutRisks = useMemo(() => {
    const risks: StockoutRisk[] = [];

    inventory.forEach(item => {
      const consumptionDaily = (item.salesLast30Days || 0) / 30;
      
      if (consumptionDaily === 0) return;

      const availableStock = item.stock + (item.onOrder || 0);
      const daysUntilStockout = Math.floor(availableStock / consumptionDaily);

      // Calculate trend (comparing 30-day vs 90-day)
      const trend30 = (item.salesLast30Days || 0) / 30;
      const trend90 = (item.salesLast90Days || 0) / 90;
      const trendChange = trend30 - trend90;
      
      let trendDirection: 'up' | 'down' | 'stable' = 'stable';
      if (trendChange > trend90 * 0.15) trendDirection = 'up';
      else if (trendChange < -trend90 * 0.15) trendDirection = 'down';

      // Determine risk level
      const leadTime = item.leadTimeDays || 14;
      let riskLevel: 'critical' | 'high' | 'medium' | 'low';
      
      if (daysUntilStockout <= 0) riskLevel = 'critical';
      else if (daysUntilStockout < leadTime * 0.5) riskLevel = 'critical';
      else if (daysUntilStockout < leadTime) riskLevel = 'high';
      else if (daysUntilStockout < leadTime * 1.5) riskLevel = 'medium';
      else riskLevel = 'low';

      risks.push({
        sku: item.sku,
        name: item.name,
        daysUntilStockout,
        riskLevel,
        trendDirection,
      });
    });

    return risks.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
  }, [inventory]);

  // Calculate vendor performance metrics
  const calculateVendorPerformance = useMemo(() => {
    const performances: VendorPerformance[] = [];

    vendors.forEach(vendor => {
      const vendorPOs = purchaseOrders.filter(po => po.vendorId === vendor.id);
      
      if (vendorPOs.length === 0) return;

      // On-time delivery rate
      const completedPOs = vendorPOs.filter(po => po.status === 'received' || po.status === 'Fulfilled');
      const onTimePOs = completedPOs.filter(po => {
        if (!po.expectedDate || !po.actualReceiveDate) return false;
        return new Date(po.actualReceiveDate) <= new Date(po.expectedDate);
      });
      const onTimeRate = completedPOs.length > 0 ? (onTimePOs.length / completedPOs.length) * 100 : 0;

      // Lead time accuracy
      const leadTimes = completedPOs
        .filter(po => po.orderDate && po.actualReceiveDate)
        .map(po => {
          const ordered = new Date(po.orderDate);
          const received = new Date(po.actualReceiveDate!);
          return Math.floor((received.getTime() - ordered.getTime()) / (1000 * 60 * 60 * 24));
        });
      
      const avgActualLeadTime = leadTimes.length > 0
        ? leadTimes.reduce((sum, lt) => sum + lt, 0) / leadTimes.length
        : 0;

      // Reliability score (composite)
      const reliabilityScore = Math.round(
        onTimeRate * 0.6 + // 60% weight on on-time delivery
        (avgActualLeadTime > 0 && vendor.leadTimeDays ? Math.min(100, (vendor.leadTimeDays / avgActualLeadTime) * 100) * 0.4 : 0)
      );

      performances.push({
        vendorId: vendor.id,
        vendorName: vendor.name,
        onTimeDeliveryRate: onTimeRate,
        averageLeadTimeActual: avgActualLeadTime,
        averageLeadTimeEstimated: vendor.leadTimeDays || 0,
        costStability: 0,
        reliabilityScore,
      });
    });

    return performances.sort((a, b) => b.reliabilityScore - a.reliabilityScore);
  }, [vendors, purchaseOrders]);

  useEffect(() => {
    setStockoutRisks(calculateStockoutRisks);
    setVendorPerformances(calculateVendorPerformance);
    setLoading(false);
  }, [calculateStockoutRisks, calculateVendorPerformance]);

  if (!permissions.canViewInventory) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-red-400">Access Denied</h2>
          <p className="text-gray-400 mt-2">You don't have permission to view stock intelligence.</p>
        </div>
      </div>
    );
  }

  const criticalRisks = stockoutRisks.filter(r => r.riskLevel === 'critical');
  const highRisks = stockoutRisks.filter(r => r.riskLevel === 'high');

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <ChartBarIcon className="w-8 h-8 text-indigo-400" />
          Stock Intelligence
        </h1>
        <p className="text-gray-400 mt-1">Advanced analytics and predictive insights for inventory management</p>
      </div>

      {/* Key Metrics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Critical Risks</p>
              <p className="text-2xl font-bold text-red-400">{criticalRisks.length}</p>
            </div>
            <AlertCircleIcon className="w-8 h-8 text-red-400/50" />
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">High Priority</p>
              <p className="text-2xl font-bold text-orange-400">{highRisks.length}</p>
            </div>
            <AlertCircleIcon className="w-8 h-8 text-orange-400/50" />
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Trending Up</p>
              <p className="text-2xl font-bold text-green-400">
                {stockoutRisks.filter(r => r.trendDirection === 'up').length}
              </p>
            </div>
            <TrendingUpIcon className="w-8 h-8 text-green-400/50" />
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Active Vendors</p>
              <p className="text-2xl font-bold text-indigo-400">{vendorPerformances.length}</p>
            </div>
            <UsersIcon className="w-8 h-8 text-indigo-400/50" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
        <div className="flex border-b border-gray-700">
          {[
            { id: 'risks', label: 'Stockout Risks', icon: AlertCircleIcon },
            { id: 'forecasts', label: 'Forecast Accuracy', icon: ChartBarIcon },
            { id: 'trends', label: 'Trends & Patterns', icon: TrendingUpIcon },
            { id: 'vendors', label: 'Vendor Performance', icon: UsersIcon },
            { id: 'budget', label: 'Budget Analysis', icon: DollarSignIcon },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex-1 px-4 py-1 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  activeTab === tab.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Button>
            );
          })}
        </div>

        <div className="p-6">
          {/* Stockout Risks Tab */}
          {activeTab === 'risks' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Stockout Risk Analysis</h3>
              
              {stockoutRisks.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No stockout risks detected</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-density min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-800/50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">SKU</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Item</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Days Left</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Risk Level</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Trend</th>
                      </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                      {stockoutRisks.slice(0, 50).map(risk => (
                        <tr key={risk.sku} className="hover:bg-gray-700/50">
                          <td className="px-4 py-1 text-sm text-gray-300">{risk.sku}</td>
                          <td className="px-4 py-1 text-sm text-white font-medium">{risk.name}</td>
                          <td className="px-4 py-1 text-sm">
                            <span className={`font-semibold ${
                              risk.daysUntilStockout <= 0 ? 'text-red-400' :
                              risk.daysUntilStockout < 7 ? 'text-orange-400' :
                              'text-gray-300'
                            }`}>
                              {risk.daysUntilStockout <= 0 ? 'OUT OF STOCK' : `${risk.daysUntilStockout} days`}
                            </span>
                          </td>
                          <td className="px-4 py-1">
                            <RiskBadge level={risk.riskLevel} />
                          </td>
                          <td className="px-4 py-1">
                            <TrendIndicator direction={risk.trendDirection} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Forecast Accuracy Tab */}
          {activeTab === 'forecasts' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Forecast Accuracy Tracking</h3>
              <p className="text-gray-400 text-sm">
                Historical forecast performance to improve future predictions
              </p>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-yellow-400 text-sm">
                  📊 Forecast accuracy tracking requires historical data. This feature will populate over time as forecasts are validated against actual sales.
                </p>
              </div>
            </div>
          )}

          {/* Trends & Patterns Tab */}
          {activeTab === 'trends' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Consumption Trends & Seasonal Patterns</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-gray-800/30 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-300 mb-3">Growing Demand (30d vs 90d)</h4>
                  <div className="space-y-2">
                    {inventory
                      .filter(item => {
                        const trend30 = (item.salesLast30Days || 0) / 30;
                        const trend90 = (item.salesLast90Days || 0) / 90;
                        return trend30 > trend90 * 1.15;
                      })
                      .slice(0, 10)
                      .map(item => {
                        const growth = ((((item.salesLast30Days || 0) / 30) / ((item.salesLast90Days || 0) / 90)) - 1) * 100;
                        return (
                          <div key={item.sku} className="flex justify-between items-center">
                            <span className="text-sm text-gray-300">{item.name}</span>
                            <span className="text-sm font-semibold text-green-400">+{growth.toFixed(0)}%</span>
                          </div>
                        );
                      })}
                  </div>
                </div>

                <div className="bg-gray-800/30 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-300 mb-3">Declining Demand (30d vs 90d)</h4>
                  <div className="space-y-2">
                    {inventory
                      .filter(item => {
                        const trend30 = (item.salesLast30Days || 0) / 30;
                        const trend90 = (item.salesLast90Days || 0) / 90;
                        return trend30 < trend90 * 0.85 && trend90 > 0;
                      })
                      .slice(0, 10)
                      .map(item => {
                        const decline = ((((item.salesLast30Days || 0) / 30) / ((item.salesLast90Days || 0) / 90)) - 1) * 100;
                        return (
                          <div key={item.sku} className="flex justify-between items-center">
                            <span className="text-sm text-gray-300">{item.name}</span>
                            <span className="text-sm font-semibold text-red-400">{decline.toFixed(0)}%</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Vendor Performance Tab */}
          {activeTab === 'vendors' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Vendor Performance Scoring</h3>
              
              {vendorPerformances.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No vendor performance data available yet</p>
              ) : (
                <div className="space-y-3">
                  {vendorPerformances.map(vp => (
                    <div key={vp.vendorId} className="bg-gray-800/30 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="text-lg font-semibold text-white">{vp.vendorName}</h4>
                          <p className="text-sm text-gray-400">Reliability Score</p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-indigo-400">{vp.reliabilityScore}</div>
                          <div className="text-xs text-gray-400">/ 100</div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-gray-400">On-Time Delivery</p>
                          <p className="text-lg font-semibold text-white">{vp.onTimeDeliveryRate.toFixed(0)}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Avg Lead Time</p>
                          <p className="text-lg font-semibold text-white">
                            {vp.averageLeadTimeActual.toFixed(0)} days
                            {vp.averageLeadTimeEstimated > 0 && (
                              <span className="text-sm text-gray-400 ml-1">
                                (est: {vp.averageLeadTimeEstimated})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Reliability bar */}
                      <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            vp.reliabilityScore >= 80 ? 'bg-green-500' :
                            vp.reliabilityScore >= 60 ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`}
                          style={{ width: `${vp.reliabilityScore}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Budget Analysis Tab */}
          {activeTab === 'budget' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Budget & Cost Analysis</h3>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-yellow-400 text-sm">
                  📊 Budget analysis feature coming soon. Will track spending trends, forecast future costs, and identify optimization opportunities.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper Components
const RiskBadge: React.FC<{ level: 'critical' | 'high' | 'medium' | 'low' }> = ({ level }) => {
  const config = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };

  return (
    <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full border ${config[level]}`}>
      {level.toUpperCase()}
    </span>
  );
};

const TrendIndicator: React.FC<{ direction: 'up' | 'down' | 'stable' }> = ({ direction }) => {
  if (direction === 'up') {
    return <span className="text-green-400 font-semibold">↗ Growing</span>;
  } else if (direction === 'down') {
    return <span className="text-red-400 font-semibold">↘ Declining</span>;
  }
  return <span className="text-gray-400">→ Stable</span>;
};

export default StockIntelligence;
