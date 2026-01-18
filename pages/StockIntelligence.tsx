import Button from '@/components/ui/Button';
import StockoutRiskWidget from '@/components/StockoutRiskWidget';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STOCK INTELLIGENCE DASHBOARD
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
  ClipboardIcon,
  BellIcon
} from '../components/icons';
import AlertsPanel from '../components/AlertsPanel';
import { usePermissions } from '../hooks/usePermissions';
import { getCriticalStockoutAlerts, type StockoutAlert } from '../services/stockoutPreventionAgent';
import { useTheme } from '../components/ThemeProvider';

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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  const [activeTab, setActiveTab] = useState<'alerts' | 'guidance' | 'risks' | 'forecasts' | 'trends' | 'vendors' | 'budget'>('alerts');
  const [loading, setLoading] = useState(true);
  const [stockoutRisks, setStockoutRisks] = useState<StockoutRisk[]>([]);
  const [vendorPerformances, setVendorPerformances] = useState<VendorPerformance[]>([]);
  // Agent alerts - used for consistent summary cards that match the widget
  const [agentAlerts, setAgentAlerts] = useState<StockoutAlert[]>([]);

  // Theme-aware style helpers
  const cardClass = isDark
    ? 'bg-gray-800/50 backdrop-blur-sm border-gray-700'
    : 'bg-white border-gray-200 shadow-sm';

  const innerCardClass = isDark
    ? 'bg-gray-800/30'
    : 'bg-gray-50';

  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-600';
  const textTertiary = isDark ? 'text-gray-300' : 'text-gray-700';
  const textMuted = isDark ? 'text-gray-500' : 'text-gray-500';

  const borderColor = isDark ? 'border-gray-700' : 'border-gray-200';
  const divideColor = isDark ? 'divide-gray-700' : 'divide-gray-200';

  const hoverBg = isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-100';
  const hoverText = isDark ? 'hover:text-white' : 'hover:text-gray-900';

  const progressBarBg = isDark ? 'bg-gray-700' : 'bg-gray-200';

  // Filter out items based on classification settings
  // CRITICAL: Stock Intelligence respects per-item overrides, reorder_method, and global rules
  const filteredInventory = useMemo(
    () => inventory.filter((item: any) => {
      // PRIORITY 1: Per-item override takes highest precedence
      if (item.stockIntelOverride === true || item.stock_intel_override === true) {
        // When override is active, use the per-item exclude setting directly
        const isExcluded = item.stockIntelExclude === true || item.stock_intel_exclude === true;
        return !isExcluded;
      }

      // PRIORITY 2: Check per-item manual exclusion
      if (item.stockIntelExclude === true || item.stock_intel_exclude === true) {
        return false;
      }

      // PRIORITY 3: Exclude "Do Not Reorder" items (from Finale)
      const reorderMethod = (item.reorderMethod || item.reorder_method || 'default').toLowerCase();
      if (reorderMethod === 'do_not_reorder') {
        return false;
      }

      // PRIORITY 4: Check item flow type (dropship, consignment, made_to_order excluded)
      const flowType = (item.itemFlowType || item.item_flow_type || 'standard').toLowerCase();
      if (['dropship', 'consignment', 'made_to_order', 'discontinued'].includes(flowType)) {
        return false;
      }

      // FILTER 5: Exclude dropship items (explicit flag - belt and suspenders)
      if (item.isDropship === true || item.is_dropship === true) return false;

      // FILTER 6: Exclude dropship items by category
      const category = (item.category || '').toLowerCase().trim();
      if (['dropship', 'drop ship', 'dropshipped', 'drop shipped', 'ds', 'drop-ship'].includes(category)) {
        return false;
      }

      // FILTER 7: Exclude dropship items by name pattern
      const name = (item.name || '').toLowerCase();
      if (name.includes('dropship') || name.includes('drop ship') || name.includes('drop-ship')) {
        return false;
      }

      // FILTER 8: Exclude inactive items
      if (item.status && item.status.toLowerCase().trim() !== 'active') return false;

      // NOTE: Category-based exclusions (Deprecating, Discontinued, etc.) are now handled 
      // by the Global Data Filter in Settings → useGlobalCategoryFilter hook.
      // The inventory data arriving here is already filtered.

      // FILTER 9: Exclude items with zero reorder point AND zero stock (likely placeholder/mock data)
      const reorderPoint = item.reorderPoint || item.reorder_point || item.minStock || item.min_stock || 0;
      const stock = item.stock || 0;
      if (reorderPoint === 0 && stock === 0) {
        return false;
      }

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
    // Fetch agent alerts for consistent summary cards
    getCriticalStockoutAlerts().then(alerts => {
      setAgentAlerts(alerts);
      setLoading(false);
    });
  }, [calculateStockoutRisks, calculateVendorPerformance]);

  if (!permissions.canViewInventory) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-red-400">Access Denied</h2>
          <p className={`${textSecondary} mt-2`}>You don't have permission to view stock intelligence.</p>
        </div>
      </div>
    );
  }

  const criticalRisks = agentAlerts.filter(a => a.severity === 'CRITICAL');
  const highRisks = agentAlerts.filter(a => a.severity === 'HIGH');

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className={`text-3xl font-bold ${textPrimary} flex items-center gap-3`}>
          <ChartBarIcon className="w-8 h-8 text-accent-400" />
          Stock Intelligence
        </h1>
      </div>

      {/* Key Metrics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`${cardClass} rounded-lg border p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${textSecondary}`}>Critical Risks</p>
              <p className="text-2xl font-bold text-red-400">{criticalRisks.length}</p>
            </div>
            <AlertCircleIcon className="w-8 h-8 text-red-400/50" />
          </div>
        </div>

        <div className={`${cardClass} rounded-lg border p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${textSecondary}`}>High Priority</p>
              <p className="text-2xl font-bold text-orange-400">{highRisks.length}</p>
            </div>
            <AlertCircleIcon className="w-8 h-8 text-orange-400/50" />
          </div>
        </div>

        <div className={`${cardClass} rounded-lg border p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${textSecondary}`}>Trending Up</p>
              <p className="text-2xl font-bold text-green-400">
                {stockoutRisks.filter(r => r.trendDirection === 'up').length}
              </p>
            </div>
            <TrendingUpIcon className="w-8 h-8 text-green-400/50" />
          </div>
        </div>

        <div className={`${cardClass} rounded-lg border p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${textSecondary}`}>Active Vendors</p>
              <p className="text-2xl font-bold text-accent-400">{vendorPerformances.length}</p>
            </div>
            <UsersIcon className="w-8 h-8 text-accent-400/50" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={`${cardClass} rounded-lg border overflow-hidden`}>
        <div className={`flex border-b ${borderColor}`}>

          {[
            { id: 'alerts', label: 'Alerts & Actions', icon: BellIcon },
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
                  : `${textSecondary} ${hoverBg} ${hoverText}`
                  }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Button>
            );
          })}
        </div>

        <div className="p-6">
          {/* Alerts & Actions Tab */}
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              <h3 className={`text-lg font-semibold ${textPrimary}`}>Alerts & Pending Actions</h3>
              <p className={`${textSecondary} text-sm`}>
                Email-derived alerts and actions awaiting your approval
              </p>
              <AlertsPanel />
            </div>
          )}

          {/* Purchasing Guidance Tab */}
          {activeTab === 'guidance' && (
            <div className="space-y-4">
              <PurchasingGuidanceDashboard />
            </div>
          )}
          {/* Stockout Risks Tab */}
          {activeTab === 'risks' && (
            <div className="space-y-4">
              <h3 className={`text-lg font-semibold ${textPrimary}`}>Stockout Risk Analysis</h3>
              <StockoutRiskWidget risks={stockoutRisks} />
            </div>
          )}

          {/* Forecast Accuracy Tab */}
          {activeTab === 'forecasts' && (
            <div className="space-y-4">
              <h3 className={`text-lg font-semibold ${textPrimary}`}>Forecast Accuracy Tracking</h3>
              <p className={`${textSecondary} text-sm`}>
                Historical forecast performance to improve future predictions
              </p>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-yellow-400 text-sm">
                  Forecast accuracy tracking requires historical data. This feature will populate over time as forecasts are validated against actual sales.
                </p>
              </div>
            </div>
          )}

          {/* Trends & Patterns Tab */}
          {activeTab === 'trends' && (
            <div className="space-y-4">
              <h3 className={`text-lg font-semibold ${textPrimary}`}>Consumption Trends & Seasonal Patterns</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={`${innerCardClass} rounded-lg p-4`}>
                  <h4 className={`text-sm font-semibold ${textTertiary} mb-3`}>Growing Demand (30d vs 90d)</h4>
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
                            <span className={`text-sm ${textTertiary}`}>{item.name}</span>
                            <span className="text-sm font-semibold text-green-400">+{growth.toFixed(0)}%</span>
                          </div>
                        );
                      })}
                  </div>
                </div>

                <div className={`${innerCardClass} rounded-lg p-4`}>
                  <h4 className={`text-sm font-semibold ${textTertiary} mb-3`}>Declining Demand (30d vs 90d)</h4>
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
                            <span className={`text-sm ${textTertiary}`}>{item.name}</span>
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
              <h3 className={`text-lg font-semibold ${textPrimary}`}>Vendor Performance Scoring</h3>

              {vendorPerformances.length === 0 ? (
                <p className={`${textSecondary} text-center py-8`}>No vendor performance data available yet</p>
              ) : (
                <div className="space-y-3">
                  {vendorPerformances.map(vp => (
                    <div key={vp.vendorId} className={`${innerCardClass} rounded-lg p-4`}>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className={`text-lg font-semibold ${textPrimary}`}>{vp.vendorName}</h4>
                          <p className={`text-sm ${textSecondary}`}>Reliability Score</p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-accent-400">{vp.reliabilityScore}</div>
                          <div className={`text-xs ${textSecondary}`}>/ 100</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className={`text-xs ${textSecondary}`}>On-Time Delivery</p>
                          <p className={`text-lg font-semibold ${textPrimary}`}>{vp.onTimeDeliveryRate.toFixed(0)}%</p>
                        </div>
                        <div>
                          <p className={`text-xs ${textSecondary}`}>Avg Lead Time</p>
                          <p className={`text-lg font-semibold ${textPrimary}`}>
                            {vp.averageLeadTimeActual.toFixed(0)} days
                            {vp.averageLeadTimeEstimated > 0 && (
                              <span className={`text-sm ${textSecondary} ml-1`}>
                                (est: {vp.averageLeadTimeEstimated})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Reliability bar */}
                      <div className={`mt-3 h-2 ${progressBarBg} rounded-full overflow-hidden`}>
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
              <h3 className={`text-lg font-semibold ${textPrimary}`}>Budget & Cost Analysis</h3>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-yellow-400 text-sm">
                  Budget analysis feature coming soon. Will track spending trends, forecast future costs, and identify optimization opportunities.
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
