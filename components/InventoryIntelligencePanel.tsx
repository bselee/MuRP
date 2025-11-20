/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📊 MASTER PRODUCTION & PLANNING DASHBOARD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Shows ALL products at once with actionable insights:
 * - Master production status table (all finished goods)
 * - Component shortage alerts
 * - Smart weekly planner
 * - One-click build/request actions
 *
 * Main Goal: Stay in optimal stock - not too much, not too little
 */

import React, { useState, useMemo, useEffect } from 'react';
import type {
  BillOfMaterials,
  InventoryItem,
  HistoricalSale,
  Vendor,
  AiConfig,
  RequisitionItem,
  PurchaseOrder
} from '../types';
import {
  ChartBarIcon,
  AlertCircleIcon,
  TrendingUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  XCircleIcon,
  BotIcon,
  LightBulbIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from './icons';
import { calculateAllBuildability } from '../services/buildabilityService';
import type { Buildability } from '../services/buildabilityService';
import { generateEnhancedForecast, calculateTrendMetrics } from '../services/forecastingService';
import type { Forecast, TrendMetrics } from '../services/forecastingService';
import { getAiPlanningInsight } from '../services/geminiService';
import ScheduleBuildModal from './ScheduleBuildModal';

interface InventoryIntelligencePanelProps {
  boms: BillOfMaterials[];
  inventory: InventoryItem[];
  historicalSales: HistoricalSale[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
  onCreateRequisition: (items: RequisitionItem[], source: 'Manual' | 'System') => void;
  onCreateBuildOrder: (sku: string, name: string, quantity: number, scheduledDate?: string, dueDate?: string) => void;
  aiConfig: AiConfig;
}

interface ProductionStatus {
  sku: string;
  name: string;
  currentStock: number;
  buildableUnits: number;
  daysOfStock: number;
  status: 'BUILDABLE' | 'BLOCKED' | 'LOW_SOON' | 'OUT_OF_STOCK';
  limitingComponent: { sku: string; name: string; quantity: number } | null;
  trendDirection: 'up' | 'down' | 'stable';
  forecast: Forecast[];
}

interface ComponentShortage {
  sku: string;
  name: string;
  currentStock: number;
  needed: number;
  shortfall: number;
  blocksProducts: string[]; // SKUs of products this blocks
  vendorId?: string;
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
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState('Analyzing production status...');
  const [isLoadingInsight, setIsLoadingInsight] = useState(true);
  const [scheduleModalConfig, setScheduleModalConfig] = useState<{ product: ProductionStatus; start: Date } | null>(null);

  const inventoryMap = useMemo(() => new Map(inventory.map(i => [i.sku, i])), [inventory]);
  const bomsMap = useMemo(() => new Map(boms.map(b => [b.finishedSku, b])), [boms]);
  const vendorMap = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);

  // Calculate buildability for all products
  const buildabilityData = useMemo(() =>
    calculateAllBuildability(boms, inventory),
    [boms, inventory]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // MASTER PRODUCTION STATUS - All products at once
  // ═══════════════════════════════════════════════════════════════════════════
  const productionStatus = useMemo(() => {
    const statuses: ProductionStatus[] = [];

    buildabilityData.forEach(buildData => {
      const item = inventoryMap.get(buildData.bom.finishedSku);
      if (!item) return;

      // Calculate consumption trend
      const sales30d = item.salesLast30Days || 0;
      const sales90d = item.salesLast90Days || 0;
      const sales180d = item.salesLast180Days || 0;
      const trendMetrics = calculateTrendMetrics(sales30d, sales90d, sales180d);

      // Generate enhanced forecast
      const salesHistory = historicalSales
        .filter(s => s.sku === item.sku)
        .map(s => ({ date: s.date, quantity: s.quantity }));
      const forecast = generateEnhancedForecast(item.sku, salesHistory, 90, {
        includeTrend: true,
        includeSeasonality: true,
        confidenceInterval: true,
      });

      // Calculate days of stock based on forecast
      const avgDailyDemand = forecast.length > 0
        ? forecast.slice(0, 30).reduce((sum, f) => sum + f.quantity, 0) / 30
        : (sales30d / 30);
      const totalAvailable = item.stock + buildData.buildableUnits;
      const daysOfStock = avgDailyDemand > 0 ? Math.floor(totalAvailable / avgDailyDemand) : 999;

      // Determine status
      let status: ProductionStatus['status'];
      if (item.stock === 0 && buildData.buildableUnits === 0) {
        status = 'OUT_OF_STOCK';
      } else if (buildData.buildableUnits === 0) {
        status = 'BLOCKED';
      } else if (daysOfStock < 7) {
        status = 'LOW_SOON';
      } else {
        status = 'BUILDABLE';
      }

      statuses.push({
        sku: item.sku,
        name: item.name,
        currentStock: item.stock,
        buildableUnits: buildData.buildableUnits,
        daysOfStock,
        status,
        limitingComponent: buildData.limitingComponent,
        trendDirection: trendMetrics.direction,
        forecast,
      });
    });

    // Sort: OUT_OF_STOCK > BLOCKED > LOW_SOON > BUILDABLE
    const statusOrder = { OUT_OF_STOCK: 0, BLOCKED: 1, LOW_SOON: 2, BUILDABLE: 3 };
    return statuses.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  }, [buildabilityData, inventoryMap, historicalSales]);

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPONENT SHORTAGES - What's blocking builds
  // ═══════════════════════════════════════════════════════════════════════════
  const componentShortages = useMemo(() => {
    const shortages = new Map<string, ComponentShortage>();

    buildabilityData.forEach(buildData => {
      if (buildData.buildableUnits === 0 && buildData.limitingComponent) {
        const comp = buildData.limitingComponent;
        const compItem = inventoryMap.get(comp.sku);

        if (compItem) {
          const existing = shortages.get(comp.sku);
          const blocksProducts = existing
            ? [...existing.blocksProducts, buildData.bom.finishedSku]
            : [buildData.bom.finishedSku];

          shortages.set(comp.sku, {
            sku: comp.sku,
            name: comp.name,
            currentStock: compItem.stock,
            needed: comp.quantity,
            shortfall: Math.max(0, comp.quantity - compItem.stock),
            blocksProducts,
            vendorId: compItem.vendorId,
          });
        }
      }
    });

    return Array.from(shortages.values()).sort((a, b) => b.blocksProducts.length - a.blocksProducts.length);
  }, [buildabilityData, inventoryMap]);

  // ═══════════════════════════════════════════════════════════════════════════
  // AI INSIGHTS
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const fetchInsight = async () => {
      setIsLoadingInsight(true);
      try {
        const allForecasts: Forecast[] = [];
        productionStatus.forEach(ps => {
          allForecasts.push(...ps.forecast);
        });

        const promptTemplate = aiConfig.prompts.find(p => p.id === 'getAiPlanningInsight');
        if (!promptTemplate) throw new Error("Planning insight prompt not found.");

        const insight = await getAiPlanningInsight(aiConfig.model, promptTemplate.prompt, inventory, boms, allForecasts);
        setAiInsight(insight);
      } catch (e) {
        console.error(e);
        setAiInsight("Focus on critical shortages and blocked products. Stock levels look good overall.");
      } finally {
        setIsLoadingInsight(false);
      }
    };
    fetchInsight();
  }, [productionStatus, aiConfig, inventory, boms]);

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════
  const handleBuildNow = (product: ProductionStatus) => {
    const suggestedQuantity = Math.min(product.buildableUnits, Math.ceil(product.currentStock * 0.5));
    const quantity = suggestedQuantity > 0 ? suggestedQuantity : product.buildableUnits;

    if (quantity > 0) {
      onCreateBuildOrder(product.sku, product.name, quantity);
    }
  };

  const handleRequestComponent = (shortage: ComponentShortage) => {
    const item = inventoryMap.get(shortage.sku);
    if (!item) return;

    const quantity = item.moq || Math.ceil(shortage.shortfall * 1.5);
    onCreateRequisition(
      [{
        sku: shortage.sku,
        name: shortage.name,
        quantity,
        reason: `Critical shortage blocking ${shortage.blocksProducts.length} product(s)`
      }],
      'Manual'
    );
  };

  const handleScheduleBuild = (product: ProductionStatus) => {
    setScheduleModalConfig({ product, start: new Date() });
  };

  const getRecommendedQuantity = (product: ProductionStatus) => {
    const avgDailyDemand =
      product.forecast.slice(0, 30).reduce((sum, f) => sum + f.quantity, 0) / 30 || 1;
    const targetQuantity = Math.ceil(avgDailyDemand * 7);
    const buildQuantity = Math.min(product.buildableUnits || 1, targetQuantity);
    return Math.max(1, buildQuantity);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // KEY METRICS
  // ═══════════════════════════════════════════════════════════════════════════
  const metrics = {
    outOfStock: productionStatus.filter(p => p.status === 'OUT_OF_STOCK').length,
    blocked: productionStatus.filter(p => p.status === 'BLOCKED').length,
    lowSoon: productionStatus.filter(p => p.status === 'LOW_SOON').length,
    healthy: productionStatus.filter(p => p.status === 'BUILDABLE').length,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      <div className="space-y-6">
      {/* AI Insight */}
      <div className="bg-gray-800/50 rounded-lg p-4 border border-indigo-500/30 flex items-start gap-3">
        <LightBulbIcon className="w-6 h-6 text-indigo-400 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white mb-1">AI Production Insight</h3>
          {isLoadingInsight ? (
            <div className="h-4 bg-gray-700 rounded-md w-3/4 animate-pulse"></div>
          ) : (
            <p className="text-sm text-gray-300">{aiInsight}</p>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Out of Stock</p>
              <p className="text-2xl font-bold text-red-400">{metrics.outOfStock}</p>
            </div>
            <XCircleIcon className="w-6 h-6 text-red-400/50" />
          </div>
        </div>

        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Blocked</p>
              <p className="text-2xl font-bold text-orange-400">{metrics.blocked}</p>
            </div>
            <AlertCircleIcon className="w-6 h-6 text-orange-400/50" />
          </div>
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Low Soon</p>
              <p className="text-2xl font-bold text-yellow-400">{metrics.lowSoon}</p>
            </div>
            <ExclamationCircleIcon className="w-6 h-6 text-yellow-400/50" />
          </div>
        </div>

        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Healthy</p>
              <p className="text-2xl font-bold text-green-400">{metrics.healthy}</p>
            </div>
            <CheckCircleIcon className="w-6 h-6 text-green-400/50" />
          </div>
        </div>
      </div>

      {/* Component Shortages */}
      {componentShortages.length > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-orange-400 mb-3 flex items-center gap-2">
            <AlertCircleIcon className="w-5 h-5" />
            Component Shortages Blocking Production
          </h3>
          <div className="space-y-2">
            {componentShortages.slice(0, 5).map(shortage => (
              <div key={shortage.sku} className="bg-gray-800/50 rounded p-3 flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{shortage.name}</p>
                  <p className="text-xs text-gray-400">
                    Stock: {shortage.currentStock} | Need: {shortage.needed} | Short: {shortage.shortfall}
                  </p>
                  <p className="text-xs text-orange-400 mt-1">
                    Blocking {shortage.blocksProducts.length} product(s)
                  </p>
                </div>
                <button
                  onClick={() => handleRequestComponent(shortage)}
                  className="ml-3 px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors whitespace-nowrap"
                >
                  Request Now
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Master Production Status Table */}
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
        <div className="p-3 bg-gray-800 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-white">Master Production Status</h3>
          <p className="text-xs text-gray-400 mt-1">All finished goods - click to expand details</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Product</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">In Stock</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Can Build</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Days Left</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Trend</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {productionStatus.map((product) => (
                <React.Fragment key={product.sku}>
                  <tr
                    className="hover:bg-gray-700/50 cursor-pointer transition-colors"
                    onClick={() => setExpandedProduct(expandedProduct === product.sku ? null : product.sku)}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {expandedProduct === product.sku ? (
                          <ChevronUpIcon className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-white">{product.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{product.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-300">{product.currentStock}</td>
                    <td className="px-4 py-2 text-sm">
                      <span className={`font-semibold ${
                        product.buildableUnits === 0 ? 'text-red-400' :
                        product.buildableUnits < 10 ? 'text-yellow-400' :
                        'text-green-400'
                      }`}>
                        {product.buildableUnits}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <span className={`${
                        product.daysOfStock < 3 ? 'text-red-400 font-semibold' :
                        product.daysOfStock < 7 ? 'text-yellow-400 font-semibold' :
                        'text-gray-300'
                      }`}>
                        {product.daysOfStock > 90 ? '90+' : product.daysOfStock} days
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <TrendIndicator direction={product.trendDirection} />
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={product.status} />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {product.status === 'BUILDABLE' && (
                          <button
                            onClick={() => handleBuildNow(product)}
                            className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                          >
                            Build Now
                          </button>
                        )}
                        {product.status === 'LOW_SOON' && (
                          <button
                            onClick={() => handleScheduleBuild(product)}
                            className="px-2 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors"
                          >
                            Schedule
                          </button>
                        )}
                        {product.status === 'BLOCKED' && product.limitingComponent && (
                          <button
                            onClick={() => {
                              const shortage = componentShortages.find(s => s.sku === product.limitingComponent!.sku);
                              if (shortage) handleRequestComponent(shortage);
                            }}
                            className="px-2 py-1 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors"
                          >
                            Request Parts
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Details Row */}
                  {expandedProduct === product.sku && (
                    <tr>
                      <td colSpan={7} className="px-4 py-3 bg-gray-900/50">
                        <ProductDetailView
                          product={product}
                          buildData={buildabilityData.find(b => b.bom.finishedSku === product.sku)}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {scheduleModalConfig && (
        <ScheduleBuildModal
          boms={boms}
          defaultBomId={bomsMap.get(scheduleModalConfig.product.sku)?.id}
          defaultStart={scheduleModalConfig.start}
          defaultQuantity={getRecommendedQuantity(scheduleModalConfig.product)}
          lockProductSelection={Boolean(bomsMap.get(scheduleModalConfig.product.sku))}
          onClose={() => setScheduleModalConfig(null)}
          onCreate={(sku, name, quantity, scheduledDate, dueDate) => {
            onCreateBuildOrder(sku, name, quantity, scheduledDate, dueDate);
            setScheduleModalConfig(null);
          }}
        />
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT DETAIL VIEW (Drill-down)
// ═══════════════════════════════════════════════════════════════════════════
const ProductDetailView: React.FC<{
  product: ProductionStatus;
  buildData?: Buildability;
}> = ({ product, buildData }) => {
  if (!buildData) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Component Stock Levels */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Component Stock</h4>
        <div className="space-y-1">
          {buildData.componentStock.map(comp => (
            <div key={comp.sku} className="flex justify-between text-sm">
              <span className="text-gray-300">{comp.name}</span>
              <span className={`font-mono ${
                comp.stock === 0 ? 'text-red-400' :
                comp.stock < 10 ? 'text-yellow-400' :
                'text-green-400'
              }`}>
                {comp.stock}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Forecast Preview */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">30-Day Forecast</h4>
        <div className="h-20 bg-gray-800 rounded p-2 flex items-end gap-0.5">
          {product.forecast.slice(0, 30).map((f, i) => {
            const maxQty = Math.max(...product.forecast.slice(0, 30).map(d => d.quantity), 1);
            const height = (f.quantity / maxQty) * 100;
            return (
              <div
                key={i}
                className="flex-1 bg-indigo-500 rounded-t-sm"
                style={{ height: `${height}%` }}
                title={`${f.date}: ${f.quantity} units`}
              />
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Avg: {(product.forecast.slice(0, 30).reduce((sum, f) => sum + f.quantity, 0) / 30).toFixed(1)} units/day
        </p>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════
const StatusBadge: React.FC<{ status: ProductionStatus['status'] }> = ({ status }) => {
  const config = {
    BUILDABLE: { label: 'Buildable', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
    BLOCKED: { label: 'Blocked', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    LOW_SOON: { label: 'Low Soon', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    OUT_OF_STOCK: { label: 'Out of Stock', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  };

  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${config[status].className}`}>
      {config[status].label}
    </span>
  );
};

const TrendIndicator: React.FC<{ direction: 'up' | 'down' | 'stable' }> = ({ direction }) => {
  if (direction === 'up') {
    return <span className="text-green-400 text-xs">↗ Growing</span>;
  } else if (direction === 'down') {
    return <span className="text-red-400 text-xs">↘ Declining</span>;
  }
  return <span className="text-gray-400 text-xs">→ Stable</span>;
};

export default InventoryIntelligencePanel;
