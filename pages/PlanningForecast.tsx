import React, { useState, useMemo, useEffect } from 'react';
// FIX: Add AiConfig to imports
import type { BillOfMaterials, InventoryItem, HistoricalSale, Vendor, AiConfig } from '../types';
import { generateForecast } from '../services/forecastingService';
import type { Forecast } from '../services/forecastingService';
import { calculateAllBuildability } from '../services/buildabilityService';
import { getAiPlanningInsight } from '../services/geminiService';
import { LightBulbIcon, DocumentTextIcon, ChevronDownIcon, CheckCircleIcon, ExclamationCircleIcon, XCircleIcon } from '../components/icons';

interface PlanningForecastProps {
  boms: BillOfMaterials[];
  inventory: InventoryItem[];
  historicalSales: HistoricalSale[];
  vendors: Vendor[];
  onCreatePo: (vendorId: string, items: { sku: string; name: string; quantity: number }[]) => void;
  onCreateBuildOrder: (sku: string, name: string, quantity: number) => void;
  // FIX: Add aiConfig to props to provide model and prompt info
  aiConfig: AiConfig;
}

// Chart component placeholder
const DemandChart: React.FC<{ data: Forecast[] }> = ({ data }) => {
    const maxQty = Math.max(...data.map(d => d.quantity), 1);
    return (
        <div className="h-40 bg-gray-800/50 rounded-lg p-2 flex items-end space-x-1">
            {data.map((d, i) => (
                <div key={i} className="flex-1 h-full flex flex-col justify-end">
                    <div 
                        className="bg-indigo-500 rounded-t-sm"
                        style={{ height: `${(d.quantity / maxQty) * 100}%` }}
                        title={`${d.date}: ${d.quantity} units`}
                    ></div>
                </div>
            ))}
        </div>
    );
};

interface ProjectedInventory {
    date: string;
    projectedStock: number;
    isBelowReorder: boolean;
}

interface SuggestedAction {
    type: 'PO' | 'BUILD';
    sku: string;
    name: string;
    quantity: number;
    reason: string;
    actionDate: string; // Generic date for action
    vendorId?: string;
}

const PlanningForecast: React.FC<PlanningForecastProps> = ({ boms, inventory, historicalSales, vendors, onCreatePo, onCreateBuildOrder, aiConfig }) => {
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
  
  const forecast = useMemo(() => 
    generateForecast(selectedProduct, historicalSales, 90), 
    [selectedProduct, historicalSales]
  );

  useEffect(() => {
    const fetchInsight = async () => {
      setIsLoadingInsight(true);
      try {
        const fullForecast = finishedGoods.flatMap(fg => generateForecast(fg.sku, historicalSales, 90));
        // FIX: Pass the model and prompt template to the AI service function.
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
  
  const { projectedInventory, suggestedActions } = useMemo(() => {
    const grossRequirements: Map<string, { date: string, quantity: number }[]> = new Map();
    const bom = bomsMap.get(selectedProduct);
    if (!bom) return { projectedInventory: new Map(), suggestedActions: [] };

    const explodeBOMRecursive = (sku: string, quantity: number, parentMultiplier: number) => {
        const subBom = bomsMap.get(sku);
        if (!subBom) { // It's a raw material
            for (const dailyDemand of forecast) {
                const required = dailyDemand.quantity * quantity * parentMultiplier;
                if(required > 0) {
                    const existing = grossRequirements.get(sku) || [];
                    grossRequirements.set(sku, [...existing, { date: dailyDemand.date, quantity: required }]);
                }
            }
        } else { // It's a sub-assembly
             subBom.components.forEach(c => explodeBOMRecursive(c.sku, c.quantity, parentMultiplier * quantity));
        }
    };
    bom.components.forEach(c => explodeBOMRecursive(c.sku, c.quantity, 1));
    
    const projectedInventory: Map<string, ProjectedInventory[]> = new Map();
    const suggestedActions: SuggestedAction[] = [];
    
    // Suggest Purchase Orders for components
    for (const [sku, demands] of grossRequirements.entries()) {
        const item = inventoryMap.get(sku);
        if (!item) continue;
        let currentStock = item.stock;
        const projections: ProjectedInventory[] = [];
        const today = new Date();
        let hasBeenActioned = false;

        for (let i = 0; i < 90; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            const dailyDemand = demands.find(d => d.date === dateStr)?.quantity || 0;
            currentStock -= dailyDemand;
            const isBelowReorder = currentStock < item.reorderPoint;
            projections.push({ date: dateStr, projectedStock: Math.round(currentStock), isBelowReorder });

            if (isBelowReorder && !hasBeenActioned && item.vendorId && item.vendorId !== 'N/A') {
                const vendor = vendorMap.get(item.vendorId);
                const orderDate = new Date(date);
                orderDate.setDate(orderDate.getDate() - (vendor?.leadTimeDays || 7));
                suggestedActions.push({
                    type: 'PO',
                    sku: item.sku,
                    name: item.name,
                    vendorId: item.vendorId,
                    quantity: item.moq || Math.ceil(item.reorderPoint * 1.5),
                    reason: `Stock predicted to drop below reorder point around ${new Date(dateStr).toLocaleDateString()}`,
                    actionDate: orderDate.toISOString().split('T')[0]
                });
                hasBeenActioned = true; // Only suggest one action per item
            }
        }
        projectedInventory.set(sku, projections);
    }
    
    // Suggest Build Orders for the selected finished good
    const fgItem = inventoryMap.get(selectedProduct);
    if(fgItem) {
        let currentFgStock = fgItem.stock;
        let fgActioned = false;
        for(let i=0; i < 90; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];

            const dailyDemand = forecast.find(d => d.date === dateStr)?.quantity || 0;
            currentFgStock -= dailyDemand;

            if(currentFgStock < fgItem.reorderPoint && !fgActioned) {
                const actionDate = new Date(date);
                actionDate.setDate(actionDate.getDate() - 7); // Assume 7 day build time
                suggestedActions.push({
                    type: 'BUILD',
                    sku: fgItem.sku,
                    name: fgItem.name,
                    quantity: Math.ceil(fgItem.reorderPoint * 1.5 - currentFgStock), // Suggest building up to 1.5x reorder point
                    reason: `Finished good stock low around ${new Date(dateStr).toLocaleDateString()}`,
                    actionDate: actionDate.toISOString().split('T')[0]
                });
                fgActioned = true;
            }
        }
    }

    return { projectedInventory, suggestedActions };
  }, [selectedProduct, forecast, bomsMap, inventoryMap, vendorMap]);

  const buildabilityData = useMemo(() =>
    calculateAllBuildability(boms, inventory),
    [boms, inventory]
  );
  
  const handleCreateActionClick = (action: SuggestedAction) => {
    if (action.type === 'PO' && action.vendorId) {
        onCreatePo(action.vendorId, [{sku: action.sku, name: action.name, quantity: action.quantity}]);
    } else if (action.type === 'BUILD') {
        onCreateBuildOrder(action.sku, action.name, action.quantity);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white tracking-tight">Planning & Forecast</h1>
        <p className="text-gray-400 mt-1">Autonomous planning based on demand forecasts and inventory levels.</p>
      </header>
      
      {/* AI Insight Card */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-indigo-500/30 flex items-start gap-4">
        <LightBulbIcon className="w-8 h-8 text-indigo-400 flex-shrink-0 mt-1" />
        <div>
            <h2 className="text-lg font-semibold text-white mb-1">AI Key Insight</h2>
            {isLoadingInsight ? 
                <div className="h-5 bg-gray-700 rounded-md w-3/4 animate-pulse"></div> :
                <p className="text-gray-300">{aiInsight}</p>
            }
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
            {/* Demand Forecast Section */}
            <section>
                <h2 className="text-xl font-semibold mb-4 text-gray-300">Demand Forecast (Next 90 Days)</h2>
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
                    <select
                        value={selectedProduct}
                        onChange={(e) => setSelectedProduct(e.target.value)}
                        className="w-full sm:w-1/3 bg-gray-700 p-2 rounded-md focus:ring-indigo-500 focus:border-indigo-500 border-gray-600 mb-4"
                    >
                        {finishedGoods.map(fg => <option key={fg.sku} value={fg.sku}>{fg.name}</option>)}
                    </select>
                    <DemandChart data={forecast} />
                </div>
            </section>

            {/* Projected Inventory Section */}
            <section>
                <h2 className="text-xl font-semibold mb-4 text-gray-300">Projected Component Inventory</h2>
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700 max-h-96 overflow-y-auto">
                    <ul className="space-y-3">
                    {Array.from(projectedInventory.entries()).map(([sku, data]) => {
                        const item = inventoryMap.get(sku)!;
                        const firstDip = data.find(d => d.isBelowReorder);
                        return (
                            <li key={sku} className="p-3 bg-gray-800 rounded-md">
                                <p className="font-semibold text-white">{item.name}</p>
                                <div className="h-20 w-full flex items-end space-x-px mt-2">
                                    {data.map((d,i) => (
                                        <div key={i} className={`flex-1 ${d.isBelowReorder ? 'bg-red-500' : 'bg-green-500'}`} style={{ height: `${Math.max(0, (d.projectedStock / (item.reorderPoint * 2)) * 100)}%`}}></div>
                                    ))}
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                    {firstDip ? `Shortage expected around ${new Date(firstDip.date).toLocaleDateString()}` : "Stock levels look stable"}
                                </div>
                            </li>
                        )
                    })}
                    </ul>
                </div>
            </section>
        </div>

        <div className="lg:col-span-1 space-y-8">
            {/* Suggested Actions Section */}
            <section>
                <h2 className="text-xl font-semibold mb-4 text-gray-300">Suggested Actions</h2>
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700 max-h-[450px] overflow-y-auto">
                    {suggestedActions.length > 0 ? (
                        <ul className="space-y-3">
                            {suggestedActions.map(action => (
                                <li key={action.sku + action.type} className="p-3 bg-gray-800 rounded-lg">
                                    <p className={`font-semibold ${action.type === 'PO' ? 'text-indigo-300' : 'text-green-300'}`}>{action.type === 'PO' ? 'Order' : 'Build'} {action.name}</p>
                                    <p className="text-sm text-gray-300">Quantity: <span className="font-bold">{action.quantity}</span></p>
                                    <p className="text-xs text-gray-400">{action.reason}</p>
                                    <button 
                                        onClick={() => handleCreateActionClick(action)}
                                        className={`text-xs font-semibold mt-2 w-full text-white ${action.type === 'PO' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-green-600 hover:bg-green-700'} py-1.5 rounded-md transition-colors`}
                                    >
                                        {action.type === 'PO' ? 'Create PO' : 'Create Build Order'} by {new Date(action.actionDate).toLocaleDateString()}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-center text-gray-400 py-8">No immediate actions required based on forecast.</p>}
                </div>
            </section>

             {/* Executive Summary */}
            <section>
                <h2 className="text-xl font-semibold mb-4 text-gray-300">Current Buildability</h2>
                 <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
                   <BuildabilityTable data={buildabilityData} />
                 </div>
            </section>
        </div>
      </div>
    </div>
  );
};

// Simplified Buildability Table for this page
const BuildabilityTable: React.FC<{data: any[]}> = ({ data }) => {
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const toggleRow = (sku: string) => setExpandedRow(expandedRow === sku ? null : sku);

    const StatusBadge: React.FC<{ status: 'In Stock' | 'Low Stock' | 'Out of Stock' }> = ({ status }) => {
        const statusConfig = {
          'In Stock': { color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: <CheckCircleIcon className="w-4 h-4" /> },
          'Low Stock': { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: <ExclamationCircleIcon className="w-4 h-4" /> },
          'Out of Stock': { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: <XCircleIcon className="w-4 h-4" /> },
        };
        const config = statusConfig[status];
        return <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full border ${config.color}`}>{config.icon} {status}</span>;
      };

    return(
        <div className="overflow-x-auto">
            <table className="min-w-full">
                <thead>
                    <tr>
                        <th className="py-2 text-left text-xs font-medium text-gray-300 uppercase">Product</th>
                        <th className="py-2 text-left text-xs font-medium text-gray-300 uppercase">Buildable</th>
                        <th className="py-2 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map(item => (
                        <tr key={item.bom.finishedSku} className="border-t border-gray-700">
                             <td className="py-2 text-sm font-medium text-white">{item.bom.name}</td>
                             <td className="py-2 text-sm text-gray-300">{item.buildableUnits}</td>
                             <td className="py-2"><StatusBadge status={item.status} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};


export default PlanningForecast;