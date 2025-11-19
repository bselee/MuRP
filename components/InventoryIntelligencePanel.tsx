/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📊 INVENTORY INTELLIGENCE & PLANNING PANEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Unified analytics and actionable planning dashboard combining:
 * - Advanced stockout risk analysis with trend detection
 * - Enhanced demand forecasting with seasonality and confidence intervals
 * - AI-generated suggested actions (requisitions & build orders)
 * - Vendor performance scoring
 * - Consumption trend analysis
 *
 * This merges the best of Stock Intelligence and Planning & Forecast
 */

import React, { useState, useMemo, useEffect } from 'react';
import type {
  BillOfMaterials,
  InventoryItem,
  HistoricalSale,
  Vendor,
  AiConfig,
  RequisitionItem
} from '../types';
import {
  ChartBarIcon,
  AlertCircleIcon,
  TrendingUpIcon,
  UsersIcon,
  LightBulbIcon,
  BotIcon,
  ExclamationCircleIcon
} from './icons';
import { generateEnhancedForecast, calculateTrendMetrics } from '../services/forecastingService';
import type { Forecast, TrendMetrics } from '../services/forecastingService';
import { getAiPlanningInsight } from '../services/geminiService';

interface InventoryIntelligencePanelProps {
  boms: BillOfMaterials[];
  inventory: InventoryItem[];
  historicalSales: HistoricalSale[];
  vendors: Vendor[];
  purchaseOrders: any[];
  onCreateRequisition: (items: RequisitionItem[], source: 'Manual' | 'System') => void;
  onCreateBuildOrder: (sku: string, name: string, quantity: number) => void;
  aiConfig: AiConfig;
}

interface StockoutRisk {
  sku: string;
  name: string;
  currentStock: number;
  onOrder: number;
  daysUntilStockout: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  trendMetrics: TrendMetrics;
  leadTimeDays: number;
  vendorId?: string;
  moq?: number;
  reorderPoint: number;
}

interface VendorPerformance {
  vendorId: string;
  vendorName: string;
  onTimeDeliveryRate: number;
  averageLeadTimeActual: number;
  averageLeadTimeEstimated: number;
  reliabilityScore: number;
}

interface SuggestedAction {
  type: 'REQUISITION' | 'BUILD';
  sku: string;
  name: string;
  quantity: number;
  reason: string;
  actionDate: string;
  vendorId?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  linkedRisk?: string; // SKU of linked stockout risk
}

export const InventoryIntelligencePanel: React.FC<InventoryIntelligencePanelProps> = ({
  boms,
  inventory,
  historicalSales,
  vendors,
  purchaseOrders,
  onCreateRequisition,
  onCreateBuildOrder,
  aiConfig,
}) => {
  const [activeTab, setActiveTab] = useState<'risks' | 'forecast' | 'actions' | 'vendors' | 'trends'>('risks');
  const [selectedProduct, setSelectedProduct] = useState('PROD-B');
  const [aiInsight, setAiInsight] = useState('Generating insight...');
  const [isLoadingInsight, setIsLoadingInsight] = useState(true);

  const inventoryMap = useMemo(() => new Map(inventory.map(i => [i.sku, i])), [inventory]);
  const bomsMap = useMemo(() => new Map(boms.map(b => [b.finishedSku, b])), [boms]);
  const vendorMap = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);

  const finishedGoods = useMemo(() =>
    inventory.filter(i => boms.some(b => b.finishedSku === i.sku)),
    [inventory, boms]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ENHANCED FORECAST - Uses trends, seasonality, and confidence intervals
  // ═══════════════════════════════════════════════════════════════════════════
  const enhancedForecast = useMemo(() => {
    const productSales = historicalSales
      .filter(s => s.sku === selectedProduct)
      .map(s => ({ date: s.date, quantity: s.quantity }));

    return generateEnhancedForecast(selectedProduct, productSales, 90, {
      includeTrend: true,
      includeSeasonality: true,
      confidenceInterval: true,
    });
  }, [selectedProduct, historicalSales]);

  // ═══════════════════════════════════════════════════════════════════════════
  // STOCKOUT RISK ANALYSIS - Advanced trend-aware risk calculation
  // ═══════════════════════════════════════════════════════════════════════════
  const stockoutRisks = useMemo(() => {
    const risks: StockoutRisk[] = [];

    inventory.forEach(item => {
      const sales30d = item.salesLast30Days || 0;
      const sales90d = item.salesLast90Days || 0;
      const sales180d = item.salesLast180Days || 0;

      const consumptionDaily = sales30d / 30;

      if (consumptionDaily === 0) return;

      const availableStock = item.stock + (item.onOrder || 0);
      const daysUntilStockout = Math.floor(availableStock / consumptionDaily);

      // Calculate trend metrics
      const trendMetrics = calculateTrendMetrics(sales30d, sales90d, sales180d);

      // Determine risk level based on lead time
      const leadTime = item.leadTimeDays || 14;
      let riskLevel: 'critical' | 'high' | 'medium' | 'low';

      if (daysUntilStockout <= 0) riskLevel = 'critical';
      else if (daysUntilStockout < leadTime * 0.5) riskLevel = 'critical';
      else if (daysUntilStockout < leadTime) riskLevel = 'high';
      else if (daysUntilStockout < leadTime * 1.5) riskLevel = 'medium';
      else riskLevel = 'low';

      // Increase risk if trend is accelerating upward
      if (trendMetrics.direction === 'up' && trendMetrics.acceleration > 0.1) {
        if (riskLevel === 'low') riskLevel = 'medium';
        else if (riskLevel === 'medium') riskLevel = 'high';
      }

      risks.push({
        sku: item.sku,
        name: item.name,
        currentStock: item.stock,
        onOrder: item.onOrder || 0,
        daysUntilStockout,
        riskLevel,
        trendMetrics,
        leadTimeDays: leadTime,
        vendorId: item.vendorId,
        moq: item.moq,
        reorderPoint: item.reorderPoint,
      });
    });

    return risks.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
  }, [inventory]);

  // ═══════════════════════════════════════════════════════════════════════════
  // VENDOR PERFORMANCE SCORING
  // ═══════════════════════════════════════════════════════════════════════════
  const vendorPerformances = useMemo(() => {
    const performances: VendorPerformance[] = [];

    vendors.forEach(vendor => {
      const vendorPOs = purchaseOrders.filter(po => po.vendorId === vendor.id);

      if (vendorPOs.length === 0) return;

      const completedPOs = vendorPOs.filter(po => po.status === 'received' || po.status === 'Fulfilled');
      const onTimePOs = completedPOs.filter(po => {
        if (!po.expectedDate || !po.actualReceiveDate) return false;
        return new Date(po.actualReceiveDate) <= new Date(po.expectedDate);
      });
      const onTimeRate = completedPOs.length > 0 ? (onTimePOs.length / completedPOs.length) * 100 : 0;

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

      const reliabilityScore = Math.round(
        onTimeRate * 0.6 +
        (avgActualLeadTime > 0 && vendor.leadTimeDays ? Math.min(100, (vendor.leadTimeDays / avgActualLeadTime) * 100) * 0.4 : 0)
      );

      performances.push({
        vendorId: vendor.id,
        vendorName: vendor.name,
        onTimeDeliveryRate: onTimeRate,
        averageLeadTimeActual: avgActualLeadTime,
        averageLeadTimeEstimated: vendor.leadTimeDays || 0,
        reliabilityScore,
      });
    });

    return performances.sort((a, b) => b.reliabilityScore - a.reliabilityScore);
  }, [vendors, purchaseOrders]);

  // ═══════════════════════════════════════════════════════════════════════════
  // SUGGESTED ACTIONS - Enhanced with enhanced forecast and risk linking
  // ═══════════════════════════════════════════════════════════════════════════
  const suggestedActions = useMemo(() => {
    const actions: SuggestedAction[] = [];
    const bom = bomsMap.get(selectedProduct);
    if (!bom) return actions;

    // BOM explosion using enhanced forecast
    const grossRequirements: Map<string, { date: string, quantity: number }[]> = new Map();

    const explodeBOMRecursive = (sku: string, quantity: number, parentMultiplier: number) => {
      const subBom = bomsMap.get(sku);
      if (!subBom) {
        // Raw material - use enhanced forecast
        for (const dailyDemand of enhancedForecast) {
          const required = dailyDemand.quantity * quantity * parentMultiplier;
          if (required > 0) {
            const existing = grossRequirements.get(sku) || [];
            grossRequirements.set(sku, [...existing, { date: dailyDemand.date, quantity: required }]);
          }
        }
      } else {
        // Sub-assembly
        subBom.components.forEach(c => explodeBOMRecursive(c.sku, c.quantity, parentMultiplier * quantity));
      }
    };

    bom.components.forEach(c => explodeBOMRecursive(c.sku, c.quantity, 1));

    // Generate requisition actions from requirements
    for (const [sku, demands] of grossRequirements.entries()) {
      const item = inventoryMap.get(sku);
      if (!item) continue;

      let currentStock = item.stock;
      let hasBeenActioned = false;

      for (let i = 0; i < 90; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const dailyDemand = demands.find(d => d.date === dateStr)?.quantity || 0;
        currentStock -= dailyDemand;

        if (currentStock < item.reorderPoint && !hasBeenActioned && item.vendorId && item.vendorId !== 'N/A') {
          const vendor = vendorMap.get(item.vendorId);
          const orderDate = new Date(date);
          orderDate.setDate(orderDate.getDate() - (vendor?.leadTimeDays || 7));

          // Determine priority from linked risk
          const risk = stockoutRisks.find(r => r.sku === sku);
          const priority = risk?.riskLevel || 'medium';

          actions.push({
            type: 'REQUISITION',
            sku: item.sku,
            name: item.name,
            quantity: item.moq || Math.ceil(item.reorderPoint * 1.5),
            reason: `Enhanced Forecast: Stock predicted to drop below reorder point around ${new Date(dateStr).toLocaleDateString()}`,
            actionDate: orderDate.toISOString().split('T')[0],
            vendorId: item.vendorId,
            priority,
            linkedRisk: risk ? risk.sku : undefined,
          });
          hasBeenActioned = true;
        }
      }
    }

    // Generate build order actions
    const fgItem = inventoryMap.get(selectedProduct);
    if (fgItem) {
      let currentFgStock = fgItem.stock;
      let fgActioned = false;

      for (let i = 0; i < 90; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const dailyDemand = enhancedForecast.find(d => d.date === dateStr)?.quantity || 0;
        currentFgStock -= dailyDemand;

        if (currentFgStock < fgItem.reorderPoint && !fgActioned) {
          const actionDate = new Date(date);
          actionDate.setDate(actionDate.getDate() - 7);

          const risk = stockoutRisks.find(r => r.sku === selectedProduct);
          const priority = risk?.riskLevel || 'medium';

          actions.push({
            type: 'BUILD',
            sku: fgItem.sku,
            name: fgItem.name,
            quantity: Math.ceil(fgItem.reorderPoint * 1.5 - currentFgStock),
            reason: `Finished good stock low around ${new Date(dateStr).toLocaleDateString()}`,
            actionDate: actionDate.toISOString().split('T')[0],
            priority,
            linkedRisk: risk ? risk.sku : undefined,
          });
          fgActioned = true;
        }
      }
    }

    // Sort by priority: critical > high > medium > low
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }, [selectedProduct, enhancedForecast, bomsMap, inventoryMap, vendorMap, stockoutRisks]);

  // ═══════════════════════════════════════════════════════════════════════════
  // AI INSIGHTS
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const fetchInsight = async () => {
      setIsLoadingInsight(true);
      try {
        const fullForecast = finishedGoods.flatMap(fg => {
          const sales = historicalSales
            .filter(s => s.sku === fg.sku)
            .map(s => ({ date: s.date, quantity: s.quantity }));
          return generateEnhancedForecast(fg.sku, sales, 90, {
            includeTrend: true,
            includeSeasonality: true,
            confidenceInterval: true,
          });
        });

        const promptTemplate = aiConfig.prompts.find(p => p.id === 'getAiPlanningInsight');
        if (!promptTemplate) throw new Error("Planning insight prompt not found.");

        const insight = await getAiPlanningInsight(aiConfig.model, promptTemplate.prompt, inventory, boms, fullForecast);
        setAiInsight(insight);
      } catch (e) {
        console.error(e);
        setAiInsight("Could not generate AI insight at this time.");
      } finally {
        setIsLoadingInsight(false);
      }
    };
    fetchInsight();
  }, [inventory, boms, historicalSales, finishedGoods, aiConfig]);

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════
  const handleCreateActionClick = (action: SuggestedAction) => {
    if (action.type === 'REQUISITION') {
      onCreateRequisition(
        [{ sku: action.sku, name: action.name, quantity: action.quantity, reason: action.reason }],
        'System'
      );
    } else if (action.type === 'BUILD') {
      onCreateBuildOrder(action.sku, action.name, action.quantity);
    }
  };

  const handleCreateRequisitionFromRisk = (risk: StockoutRisk) => {
    const vendor = risk.vendorId ? vendorMap.get(risk.vendorId) : null;
    const quantity = risk.moq || Math.ceil(risk.reorderPoint * 1.5);

    onCreateRequisition(
      [{
        sku: risk.sku,
        name: risk.name,
        quantity,
        reason: `Critical stockout risk: ${risk.daysUntilStockout} days until stockout (Lead time: ${risk.leadTimeDays} days)`
      }],
      'Manual'
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // KEY METRICS
  // ═══════════════════════════════════════════════════════════════════════════
  const criticalRisks = stockoutRisks.filter(r => r.riskLevel === 'critical');
  const highRisks = stockoutRisks.filter(r => r.riskLevel === 'high');
  const trendingUp = stockoutRisks.filter(r => r.trendMetrics.direction === 'up');
  const topVendor = vendorPerformances.length > 0 ? vendorPerformances[0] : null;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* AI Key Insight */}
      <div className="bg-gray-800/50 rounded-lg p-6 border border-indigo-500/30 flex items-start gap-4">
        <LightBulbIcon className="w-8 h-8 text-indigo-400 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-white mb-1">AI Key Insight</h2>
          {isLoadingInsight ? (
            <div className="h-5 bg-gray-700 rounded-md w-3/4 animate-pulse"></div>
          ) : (
            <p className="text-gray-300">{aiInsight}</p>
          )}
        </div>
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
            <ExclamationCircleIcon className="w-8 h-8 text-orange-400/50" />
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Trending Up</p>
              <p className="text-2xl font-bold text-green-400">{trendingUp.length}</p>
            </div>
            <TrendingUpIcon className="w-8 h-8 text-green-400/50" />
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Top Vendor</p>
              <p className="text-lg font-bold text-indigo-400 truncate">
                {topVendor ? topVendor.vendorName : 'N/A'}
              </p>
            </div>
            <UsersIcon className="w-8 h-8 text-indigo-400/50" />
          </div>
        </div>
      </div>

      {/* Tabbed Content */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
        {/* Tab Navigation */}
        <div className="flex border-b border-gray-700 overflow-x-auto">
          {[
            { id: 'risks', label: 'Stockout Risks', icon: AlertCircleIcon },
            { id: 'forecast', label: 'Enhanced Forecast', icon: ChartBarIcon },
            { id: 'actions', label: 'Suggested Actions', icon: BotIcon },
            { id: 'vendors', label: 'Vendor Performance', icon: UsersIcon },
            { id: 'trends', label: 'Consumption Trends', icon: TrendingUpIcon },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* STOCKOUT RISKS TAB */}
          {activeTab === 'risks' && (
            <StockoutRisksTab
              risks={stockoutRisks}
              onCreateRequisition={handleCreateRequisitionFromRisk}
            />
          )}

          {/* ENHANCED FORECAST TAB */}
          {activeTab === 'forecast' && (
            <EnhancedForecastTab
              forecast={enhancedForecast}
              selectedProduct={selectedProduct}
              finishedGoods={finishedGoods}
              onProductChange={setSelectedProduct}
            />
          )}

          {/* SUGGESTED ACTIONS TAB */}
          {activeTab === 'actions' && (
            <SuggestedActionsTab
              actions={suggestedActions}
              onCreateAction={handleCreateActionClick}
            />
          )}

          {/* VENDOR PERFORMANCE TAB */}
          {activeTab === 'vendors' && (
            <VendorPerformanceTab performances={vendorPerformances} />
          )}

          {/* CONSUMPTION TRENDS TAB */}
          {activeTab === 'trends' && (
            <ConsumptionTrendsTab inventory={inventory} />
          )}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// TAB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const StockoutRisksTab: React.FC<{
  risks: StockoutRisk[];
  onCreateRequisition: (risk: StockoutRisk) => void;
}> = ({ risks, onCreateRequisition }) => {
  if (risks.length === 0) {
    return <p className="text-gray-400 text-center py-8">No stockout risks detected</p>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Stockout Risk Analysis</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">SKU</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Item</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Stock</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Days Left</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Risk</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Trend</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {risks.slice(0, 50).map(risk => (
              <tr key={risk.sku} className="hover:bg-gray-700/50">
                <td className="px-4 py-2 text-sm text-gray-300 font-mono">{risk.sku}</td>
                <td className="px-4 py-2 text-sm text-white font-medium">{risk.name}</td>
                <td className="px-4 py-2 text-sm text-gray-300">
                  {risk.currentStock}
                  {risk.onOrder > 0 && <span className="text-blue-400 ml-1">+{risk.onOrder}</span>}
                </td>
                <td className="px-4 py-2 text-sm">
                  <span className={`font-semibold ${
                    risk.daysUntilStockout <= 0 ? 'text-red-400' :
                    risk.daysUntilStockout < 7 ? 'text-orange-400' :
                    'text-gray-300'
                  }`}>
                    {risk.daysUntilStockout <= 0 ? 'OUT OF STOCK' : `${risk.daysUntilStockout} days`}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <RiskBadge level={risk.riskLevel} />
                </td>
                <td className="px-4 py-2">
                  <TrendIndicator
                    direction={risk.trendMetrics.direction}
                    growthRate={risk.trendMetrics.growthRate}
                  />
                </td>
                <td className="px-4 py-2">
                  {(risk.riskLevel === 'critical' || risk.riskLevel === 'high') && (
                    <button
                      onClick={() => onCreateRequisition(risk)}
                      className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors"
                    >
                      Create Requisition
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const EnhancedForecastTab: React.FC<{
  forecast: Forecast[];
  selectedProduct: string;
  finishedGoods: InventoryItem[];
  onProductChange: (sku: string) => void;
}> = ({ forecast, selectedProduct, finishedGoods, onProductChange }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Enhanced Demand Forecast (90 Days)</h3>
      <p className="text-sm text-gray-400">
        Includes trend analysis, seasonal patterns, and confidence intervals
      </p>

      <div className="bg-gray-800 p-4 rounded-lg">
        <select
          value={selectedProduct}
          onChange={(e) => onProductChange(e.target.value)}
          className="w-full sm:w-1/2 bg-gray-700 p-2 rounded-md focus:ring-indigo-500 focus:border-indigo-500 border-gray-600 mb-4 text-white"
        >
          {finishedGoods.map(fg => (
            <option key={fg.sku} value={fg.sku}>{fg.name}</option>
          ))}
        </select>

        <EnhancedDemandChart data={forecast} />

        {/* Forecast Stats */}
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="bg-gray-900/50 rounded-lg p-3">
            <p className="text-xs text-gray-400">Total Forecasted</p>
            <p className="text-xl font-bold text-white">
              {forecast.reduce((sum, f) => sum + f.quantity, 0)} units
            </p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3">
            <p className="text-xs text-gray-400">Avg Daily Demand</p>
            <p className="text-xl font-bold text-white">
              {(forecast.reduce((sum, f) => sum + f.quantity, 0) / forecast.length).toFixed(1)} units
            </p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3">
            <p className="text-xs text-gray-400">Avg Confidence</p>
            <p className="text-xl font-bold text-indigo-400">
              {((forecast.reduce((sum, f) => sum + (f.confidence || 0), 0) / forecast.length) * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const SuggestedActionsTab: React.FC<{
  actions: SuggestedAction[];
  onCreateAction: (action: SuggestedAction) => void;
}> = ({ actions, onCreateAction }) => {
  if (actions.length === 0) {
    return <p className="text-gray-400 text-center py-8">No immediate actions required based on forecast.</p>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">AI-Generated Suggested Actions</h3>
      <div className="space-y-3">
        {actions.map((action, index) => (
          <div
            key={`${action.sku}-${action.type}-${index}`}
            className={`p-4 rounded-lg border ${
              action.priority === 'critical' ? 'bg-red-500/10 border-red-500/30' :
              action.priority === 'high' ? 'bg-orange-500/10 border-orange-500/30' :
              action.priority === 'medium' ? 'bg-yellow-500/10 border-yellow-500/30' :
              'bg-gray-900/50 border-gray-700'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className={`font-semibold ${
                    action.type === 'REQUISITION' ? 'text-indigo-300' : 'text-green-300'
                  }`}>
                    {action.type === 'REQUISITION' ? 'Request' : 'Build'} {action.name}
                  </p>
                  <PriorityBadge priority={action.priority} />
                </div>
                <p className="text-sm text-gray-300">Quantity: <span className="font-bold">{action.quantity}</span></p>
                <p className="text-xs text-gray-400 mt-1">{action.reason}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Action by: {new Date(action.actionDate).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => onCreateAction(action)}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-md transition-colors flex items-center gap-2 whitespace-nowrap ${
                  action.type === 'REQUISITION' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-green-600 hover:bg-green-700'
                }`}
                title={`AI-Generated ${action.type === 'REQUISITION' ? 'Requisition' : 'Build Order'}`}
              >
                <BotIcon className="w-4 h-4" />
                Auto-Generate
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const VendorPerformanceTab: React.FC<{
  performances: VendorPerformance[];
}> = ({ performances }) => {
  if (performances.length === 0) {
    return <p className="text-gray-400 text-center py-8">No vendor performance data available yet</p>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Vendor Performance Scoring</h3>
      <div className="space-y-3">
        {performances.map(vp => (
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
    </div>
  );
};

const ConsumptionTrendsTab: React.FC<{
  inventory: InventoryItem[];
}> = ({ inventory }) => {
  const growingItems = inventory
    .filter(item => {
      const trend30 = (item.salesLast30Days || 0) / 30;
      const trend90 = (item.salesLast90Days || 0) / 90;
      return trend30 > trend90 * 1.15;
    })
    .slice(0, 10);

  const decliningItems = inventory
    .filter(item => {
      const trend30 = (item.salesLast30Days || 0) / 30;
      const trend90 = (item.salesLast90Days || 0) / 90;
      return trend30 < trend90 * 0.85 && trend90 > 0;
    })
    .slice(0, 10);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Consumption Trends & Patterns</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-800/30 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-300 mb-3">Growing Demand (30d vs 90d)</h4>
          <div className="space-y-2">
            {growingItems.map(item => {
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
            {decliningItems.map(item => {
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
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const EnhancedDemandChart: React.FC<{ data: Forecast[] }> = ({ data }) => {
  const maxUpper = Math.max(...data.map(d => d.upperBound || d.quantity), 1);

  return (
    <div className="h-64 bg-gray-900/50 rounded-lg p-4">
      <div className="h-full flex items-end space-x-1">
        {data.map((d, i) => {
          const baseHeight = (d.quantity / maxUpper) * 100;
          const lowerHeight = ((d.lowerBound || d.quantity) / maxUpper) * 100;
          const upperHeight = ((d.upperBound || d.quantity) / maxUpper) * 100;

          return (
            <div key={i} className="flex-1 h-full flex flex-col justify-end relative group">
              {/* Confidence interval band */}
              <div
                className="absolute bottom-0 left-0 right-0 bg-indigo-500/20 rounded-t-sm"
                style={{ height: `${upperHeight}%` }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 bg-gray-800"
                style={{ height: `${lowerHeight}%` }}
              />
              {/* Actual forecast */}
              <div
                className="relative bg-indigo-500 rounded-t-sm z-10"
                style={{ height: `${baseHeight}%` }}
                title={`${d.date}: ${d.quantity} units (${((d.confidence || 0) * 100).toFixed(0)}% confidence)`}
              />
              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-20">
                {new Date(d.date).toLocaleDateString()}<br/>
                {d.quantity} units<br/>
                {d.confidence && `${(d.confidence * 100).toFixed(0)}% confidence`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

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

const PriorityBadge: React.FC<{ priority: 'critical' | 'high' | 'medium' | 'low' }> = ({ priority }) => {
  const config = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };

  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${config[priority]}`}>
      {priority}
    </span>
  );
};

const TrendIndicator: React.FC<{ direction: 'up' | 'down' | 'stable'; growthRate?: number }> = ({ direction, growthRate }) => {
  if (direction === 'up') {
    return (
      <span className="text-green-400 font-semibold text-xs">
        ↗ {growthRate !== undefined ? `+${growthRate.toFixed(0)}%` : 'Growing'}
      </span>
    );
  } else if (direction === 'down') {
    return (
      <span className="text-red-400 font-semibold text-xs">
        ↘ {growthRate !== undefined ? `${growthRate.toFixed(0)}%` : 'Declining'}
      </span>
    );
  }
  return <span className="text-gray-400 text-xs">→ Stable</span>;
};

export default InventoryIntelligencePanel;
