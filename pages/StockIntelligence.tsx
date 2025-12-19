import Button from '@/components/ui/Button';
import StockoutRiskWidget from '@/components/StockoutRiskWidget';
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
import PurchasingGuidanceDashboard from '../components/PurchasingGuidanceDashboard';
import {
  ChartBarIcon,
  AlertCircleIcon,
  TrendingUpIcon,
  CalendarIcon,
  DollarSignIcon,
  UsersIcon,
  ClipboardIcon
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
  const [activeTab, setActiveTab] = useState<'guidance' | 'risks' | 'forecasts' | 'trends' | 'vendors' | 'budget'>('guidance');
  const [loading, setLoading] = useState(true);
  const [stockoutRisks, setStockoutRisks] = useState<StockoutRisk[]>([]);
  const [vendorPerformances, setVendorPerformances] = useState<VendorPerformance[]>([]);

  // Filter out dropship items, inactive items, and deprecating category
  // CRITICAL: Stock Intelligence should NEVER show dropship items to avoid confusing humans
  const filteredInventory = useMemo(
    () => inventory.filter(item => {
      // FILTER 1: Exclude dropship items (explicit flag)
      if (item.isDropship === true) return false;

      // FILTER 2: Exclude dropship items by category (belt and suspenders)
      const category = (item.category || '').toLowerCase().trim();
      if (['dropship', 'drop ship', 'dropshipped', 'drop shipped', 'ds', 'drop-ship'].includes(category)) {
        return false;
      }

      // FILTER 3: Exclude dropship items by name pattern (common naming convention)
      const name = (item.name || '').toLowerCase();
      if (name.includes('dropship') || name.includes('drop ship') || name.includes('drop-ship')) {
        return false;
      }

      // FILTER 4: Exclude inactive items
      if (item.status && item.status.toLowerCase().trim() !== 'active') return false;

      // FILTER 5: Exclude Deprecating/Deprecated category items
      if (['deprecating', 'deprecated', 'discontinued'].includes(category)) return false;

      return true;
    }),
    [inventory],
  );

  // Calculate stockout risks with trend analysis
  const calculateStockoutRisks = useMemo(() => {
    const risks: StockoutRisk[] = [];

    filteredInventory.forEach(item => {
      const consumptionDaily = (item.sales30Days || 0) / 30;

      if (consumptionDaily === 0) return;

      const availableStock = item.stock + (item.onOrder || 0);
      const daysUntilStockout = Math.floor(availableStock / consumptionDaily);

      // Calculate trend (comparing 30-day vs 90-day)
      const trend30 = (item.sales30Days || 0) / 30;
      const trend90 = (item.sales90Days || 0) / 90;
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
  }, [filteredInventory]);

  // Calculate vendor performance metrics
  const calculateVendorPerformance = useMemo(() => {
    const performances: VendorPerformance[] = [];

    vendors.forEach(vendor => {
      const vendorPOs = purchaseOrders.filter(po => po.vendorId === vendor.id);

      if (vendorPOs.length === 0) return;

      // On-time delivery rate
      const completedPOs = vendorPOs.filter(po => po.status === 'received' || po.status === 'Fulfilled');
      const onTimePOs = completedPOs.filter(po => {
        if (!po.expectedDate || !po.receivedAt) return false;
        return new Date(po.receivedAt) <= new Date(po.expectedDate);
      });
      const onTimeRate = completedPOs.length > 0 ? (onTimePOs.length / completedPOs.length) * 100 : 0;

      // Lead time accuracy
      const leadTimes = completedPOs
        .filter(po => po.orderDate && po.receivedAt)
        .map(po => {
          const ordered = new Date(po.orderDate);
          const received = new Date(po.receivedAt!);
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

      // Calculate cost stability from price variance across POs
      const allPrices: Map<string, number[]> = new Map();
      vendorPOs.forEach(po => {
        if (!po.items || !Array.isArray(po.items)) return;
        po.items.forEach((item: any) => {
          const sku = item.sku || item.productSku || item.product_sku;
          const price = Number(item.unitPrice || item.unit_price || item.unitCost || item.unit_cost || 0);
          if (sku && price > 0) {
            const prices = allPrices.get(sku) || [];
            prices.push(price);
            allPrices.set(sku, prices);
          }
        });
      });

      let totalVariation = 0;
      let skuCount = 0;
      allPrices.forEach((prices) => {
        if (prices.length < 2) return;
        const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        if (mean === 0) return;
        const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
        const stdDev = Math.sqrt(variance);
        const cv = (stdDev / mean) * 100;
        totalVariation += cv;
        skuCount++;
      });

      const avgVariation = skuCount > 0 ? totalVariation / skuCount : 0;
      const costStability = Math.max(0, Math.min(100, 100 - avgVariation));

      performances.push({
        vendorId: vendor.id,
        vendorName: vendor.name,
        onTimeDeliveryRate: onTimeRate,
        averageLeadTimeActual: avgActualLeadTime,
        averageLeadTimeEstimated: vendor.leadTimeDays || 0,
        costStability: Number(costStability.toFixed(1)),
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
          <ChartBarIcon className="w-8 h-8 text-accent-400" />
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
              <p className="text-2xl font-bold text-accent-400">{vendorPerformances.length}</p>
            </div>
            <UsersIcon className="w-8 h-8 text-accent-400/50" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
        <div className="flex border-b border-gray-700">

          {[
            { id: 'guidance', label: 'Purchasing Guidance', icon: ClipboardIcon },
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
                className={`flex-1 px-4 py-1 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === tab.id
                  ? 'bg-accent-500 text-white'
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
          {/* Purchasing Guidance Tab */}
          {activeTab === 'guidance' && (
            <div className="space-y-4">
              <PurchasingGuidanceDashboard />
            </div>
          )}
          {/* Stockout Risks Tab */}
          {activeTab === 'risks' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Stockout Risk Analysis</h3>
              <StockoutRiskWidget risks={stockoutRisks} />
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
                    {filteredInventory
                      .filter(item => {
                        const trend30 = (item.sales30Days || 0) / 30;
                        const trend90 = (item.sales90Days || 0) / 90;
                        return trend30 > trend90 * 1.15;
                      })
                      .slice(0, 10)
                      .map(item => {
                        const growth = ((((item.sales30Days || 0) / 30) / ((item.sales90Days || 0) / 90)) - 1) * 100;
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
                    {filteredInventory
                      .filter(item => {
                        const trend30 = (item.sales30Days || 0) / 30;
                        const trend90 = (item.sales90Days || 0) / 90;
                        return trend30 < trend90 * 0.85 && trend90 > 0;
                      })
                      .slice(0, 10)
                      .map(item => {
                        const decline = ((((item.sales30Days || 0) / 30) / ((item.sales90Days || 0) / 90)) - 1) * 100;
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
                          <div className="text-2xl font-bold text-accent-400">{vp.reliabilityScore}</div>
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
                          className={`h-full rounded-full ${vp.reliabilityScore >= 80 ? 'bg-green-500' :
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



export default StockIntelligence;
