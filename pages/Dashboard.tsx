

import React, { useMemo, useState, useEffect } from 'react';
import type { Page } from '../App';
import type { BillOfMaterials, InventoryItem, HistoricalSale, Vendor, InternalRequisition, User, AiConfig, RequisitionItem } from '../types';
import ExecutiveSummary from '../components/ExecutiveSummary';
import BuildabilityTable from '../components/BuildabilityTable';
import { calculateAllBuildability } from '../services/buildabilityService';
import { generateForecast } from '../services/forecastingService';
import type { Forecast } from '../services/forecastingService';
import { getAiPlanningInsight } from '../services/geminiService';
import { ChevronDownIcon, LightBulbIcon, ClipboardListIcon, BeakerIcon, ExclamationCircleIcon } from '../components/icons';

interface DashboardProps {
  inventory: InventoryItem[];
  boms: BillOfMaterials[];
  historicalSales: HistoricalSale[];
  vendors: Vendor[];
  requisitions: InternalRequisition[];
  users: User[];
  currentUser: User;
  onCreateRequisition: (items: RequisitionItem[], source: 'Manual' | 'System') => void;
  onCreateBuildOrder: (sku: string, name: string, quantity: number) => void;
  setCurrentPage: (page: Page) => void;
  aiConfig: AiConfig;
}

const CollapsibleSection: React.FC<{
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  id: string;
}> = ({ title, icon, children, isOpen, onToggle, id }) => (
    <section id={id} className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden scroll-mt-20">
        <button onClick={onToggle} className="w-full flex justify-between items-center p-4 bg-gray-800 hover:bg-gray-700/50 transition-colors">
            <h2 className="text-xl font-semibold text-gray-300 flex items-center gap-3">
              {icon}
              {title}
            </h2>
            <ChevronDownIcon className={`w-6 h-6 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
            <div className="p-4 md:p-6 border-t border-gray-700">
                {children}
            </div>
        )}
    </section>
);


const Dashboard: React.FC<DashboardProps> = (props) => {
  const { inventory, boms, requisitions, users, currentUser, setCurrentPage } = props;
  
  const [openSections, setOpenSections] = useState({
    buildability: true,
    shortages: true,
    requisitions: true,
    todos: false,
    forecast: false,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({...prev, [section]: !prev[section]}));
  };

  const handleCardClick = (sectionId: keyof typeof openSections) => {
    // FIX: `keyof` can return `string | number | symbol`, but `getElementById` expects a `string`.
    // Using `toString()` safely converts the key to a string for the DOM query.
    const element = document.getElementById(sectionId.toString());
    if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        // Also expand the section if it's closed
        if (!openSections[sectionId]) {
            toggleSection(sectionId);
        }
    }
  };
  
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u.name])), [users]);
  
  const buildabilityData = useMemo(() =>
    calculateAllBuildability(boms, inventory),
    [boms, inventory]
  );
  
  const criticalShortages = useMemo(() => 
    inventory.filter(item => item.stock < item.reorderPoint && item.reorderPoint > 0),
    [inventory]
  );

  const pendingRequisitions = useMemo(() => {
    const pending = requisitions.filter(r => r.status === 'Pending');
    if (currentUser.role === 'Admin') return pending;
    if (currentUser.role === 'Manager') return pending.filter(r => r.department === currentUser.department);
    return [];
  }, [requisitions, currentUser]);

  const bomsMissingArtwork = useMemo(() => boms.filter(b => b.artwork.length === 0 && b.finishedSku.startsWith('PROD-')), [boms]);
  const artworkMissingDocs = useMemo(() => boms.flatMap(b => b.artwork).filter(a => !a.regulatoryDocLink), [boms]);

  const criticalShortagesContent = criticalShortages.length > 0 ? (
      <ul className="divide-y divide-gray-700">
          {criticalShortages.map(item => (
              <li key={item.sku} className="py-3">
                  <div className="flex items-center justify-between">
                      <div>
                          <p className="text-sm font-medium text-white">{item.name}</p>
                          <p className="text-xs text-gray-400">{item.sku}</p>
                      </div>
                      <div className="text-right">
                          <p className="text-sm font-semibold text-red-400">{item.stock} in stock</p>
                          <p className="text-xs text-gray-500">Reorder at {item.reorderPoint}</p>
                      </div>
                  </div>
              </li>
          ))}
      </ul>
  ) : <p className="text-center text-gray-400 py-8">No critical shortages. Well done!</p>;
  
  const pendingRequisitionsContent = (currentUser.role === 'Admin' || currentUser.role === 'Manager') ? (
    pendingRequisitions.length > 0 ? (
        <div className="space-y-3">
            <ul className="divide-y divide-gray-700">
               {pendingRequisitions.slice(0, 5).map(req => (
                   <li key={req.id} className="py-2">
                       <p className="text-sm font-medium text-white">{req.department} - {req.source === 'System' ? 'System (AI)' : (userMap.get(req.requesterId!) || 'Unknown')}</p>
                       <p className="text-xs text-gray-400">{req.items.length} item(s) requested on {new Date(req.createdAt).toLocaleDateString()}</p>
                   </li>
               ))}
            </ul>
             <button onClick={() => setCurrentPage('Purchase Orders')} className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 w-full text-right mt-2">
                View All Requisitions &rarr;
            </button>
        </div>
    ) : <p className="text-center text-gray-400 py-8">No requisitions are pending approval.</p>
  ) : <p className="text-center text-gray-400 py-8">You do not have permission to view requisitions.</p>;

  const todosContent = (
      <div className="space-y-4">
          <div>
              <h4 className="font-semibold text-gray-200">BOMs Missing Artwork ({bomsMissingArtwork.length})</h4>
              {bomsMissingArtwork.length > 0 ? (
                 <ul className="text-sm text-gray-400 list-disc pl-5 mt-1">
                      {bomsMissingArtwork.slice(0,3).map(b => <li key={b.id}>{b.name}</li>)}
                 </ul>
              ) : <p className="text-sm text-gray-500 mt-1">All products have artwork.</p>}
          </div>
           <div>
              <h4 className="font-semibold text-gray-200">Artwork Missing Regulatory Docs ({artworkMissingDocs.length})</h4>
               {artworkMissingDocs.length > 0 ? (
                 <ul className="text-sm text-gray-400 list-disc pl-5 mt-1">
                      {artworkMissingDocs.slice(0,3).map(a => <li key={a.id}>{a.fileName}</li>)}
                 </ul>
              ) : <p className="text-sm text-gray-500 mt-1">All artwork has documentation links.</p>}
          </div>
          <div className="flex justify-end gap-4 pt-2">
              <button onClick={() => setCurrentPage('BOMs')} className="text-sm font-semibold text-indigo-400 hover:text-indigo-300">Manage BOMs &rarr;</button>
              <button onClick={() => setCurrentPage('Artwork')} className="text-sm font-semibold text-indigo-400 hover:text-indigo-300">Manage Artwork &rarr;</button>
          </div>
      </div>
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-gray-400 mt-1">Welcome back, here's your company-wide operations snapshot.</p>
      </header>
      
      <section>
        <h2 className="text-xl font-semibold mb-4 text-gray-300">Executive Summary</h2>
        <ExecutiveSummary data={buildabilityData} onCardClick={() => handleCardClick('buildability')} />
      </section>
      
      <div className="space-y-6">
        <CollapsibleSection
          id="buildability"
          title="Buildability Status"
          icon={<BeakerIcon className="w-6 h-6 text-indigo-400"/>}
          isOpen={openSections.buildability}
          onToggle={() => toggleSection('buildability')}
        >
          <BuildabilityTable data={buildabilityData} />
        </CollapsibleSection>
        
        <CollapsibleSection
          id="shortages"
          title="Critical Shortages"
          icon={<ExclamationCircleIcon className="w-6 h-6 text-red-400"/>}
          isOpen={openSections.shortages}
          onToggle={() => toggleSection('shortages')}
        >
          {criticalShortagesContent}
        </CollapsibleSection>
        
        <CollapsibleSection
          id="requisitions"
          title="Pending Requisitions"
          icon={<ClipboardListIcon className="w-6 h-6 text-yellow-400"/>}
          isOpen={openSections.requisitions}
          onToggle={() => toggleSection('requisitions')}
        >
          {pendingRequisitionsContent}
        </CollapsibleSection>
        
        <CollapsibleSection
          id="todos"
          title="Compliance & Artwork Todos"
          icon={<BeakerIcon className="w-6 h-6 text-blue-400"/>}
          isOpen={openSections.todos}
          onToggle={() => toggleSection('todos')}
        >
          {todosContent}
        </CollapsibleSection>

        <CollapsibleSection
          title="Planning & Forecast"
          id="forecast"
          isOpen={openSections.forecast}
          onToggle={() => toggleSection('forecast')}
          icon={<LightBulbIcon className="w-6 h-6 text-yellow-300" />}
        >
          <PlanningForecastContent {...props} />
        </CollapsibleSection>
      </div>
    </div>
  );
};


// The content from the old Planning & Forecast page is now a component here
const PlanningForecastContent: React.FC<DashboardProps> = ({ boms, inventory, historicalSales, vendors, onCreateRequisition, onCreateBuildOrder, aiConfig }) => {
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
  
  const { suggestedActions } = useMemo(() => {
    const grossRequirements: Map<string, { date: string, quantity: number }[]> = new Map();
    const bom = bomsMap.get(selectedProduct);
    if (!bom) return { suggestedActions: [] };

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
    
    const suggestedActions: SuggestedAction[] = [];
    
    // Suggest Purchase Requisitions for components
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
                suggestedActions.push({
                    type: 'REQUISITION',
                    sku: item.sku,
                    name: item.name,
                    quantity: item.moq || Math.ceil(item.reorderPoint * 1.5),
                    reason: `AI Forecast: Stock predicted to drop below reorder point around ${new Date(dateStr).toLocaleDateString()}`,
                    actionDate: orderDate.toISOString().split('T')[0]
                });
                hasBeenActioned = true; // Only suggest one action per item
            }
        }
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
                    quantity: Math.ceil(fgItem.reorderPoint * 1.5 - currentFgStock),
                    reason: `Finished good stock low around ${new Date(dateStr).toLocaleDateString()}`,
                    actionDate: actionDate.toISOString().split('T')[0]
                });
                fgActioned = true;
            }
        }
    }
    return { suggestedActions };
  }, [selectedProduct, forecast, bomsMap, inventoryMap, vendorMap]);

  const handleCreateActionClick = (action: SuggestedAction) => {
    if (action.type === 'REQUISITION') {
        onCreateRequisition(
            [{ sku: action.sku, name: action.name, quantity: action.quantity, reason: action.reason }], 
            'System'
        );
    } else if (action.type === 'BUILD') {
        onCreateBuildOrder(action.sku, action.name, action.quantity);
    }
  }

  return (
      <div className="space-y-8">
          <div className="bg-gray-800/50 rounded-lg p-6 border border-indigo-500/30 flex items-start gap-4">
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
                  <section>
                      <h3 className="text-lg font-semibold mb-4 text-gray-300">Demand Forecast (Next 90 Days)</h3>
                       <div className="bg-gray-800 p-4 rounded-lg">
                          <select
                              value={selectedProduct}
                              onChange={(e) => setSelectedProduct(e.target.value)}
                              className="w-full sm:w-1/2 bg-gray-700 p-2 rounded-md focus:ring-indigo-500 focus:border-indigo-500 border-gray-600 mb-4"
                          >
                              {finishedGoods.map(fg => <option key={fg.sku} value={fg.sku}>{fg.name}</option>)}
                          </select>
                          <DemandChart data={forecast} />
                      </div>
                  </section>
              </div>
              <div className="lg:col-span-1">
                  <section>
                      <h3 className="text-lg font-semibold mb-4 text-gray-300">Suggested Actions</h3>
                      <div className="bg-gray-800 p-4 rounded-lg max-h-[450px] overflow-y-auto">
                          {suggestedActions.length > 0 ? (
                              <ul className="space-y-3">
                                  {suggestedActions.map((action, index) => (
                                      <li key={`${action.sku}-${action.type}-${index}`} className="p-3 bg-gray-900/50 rounded-lg">
                                          <p className={`font-semibold ${action.type === 'REQUISITION' ? 'text-indigo-300' : 'text-green-300'}`}>{action.type === 'REQUISITION' ? 'Request' : 'Build'} {action.name}</p>
                                          <p className="text-sm text-gray-300">Quantity: <span className="font-bold">{action.quantity}</span></p>
                                          <p className="text-xs text-gray-400">{action.reason}</p>
                                          <button
                                              onClick={() => handleCreateActionClick(action)}
                                              className={`text-xs font-semibold mt-2 w-full text-white ${action.type === 'REQUISITION' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-green-600 hover:bg-green-700'} py-1.5 rounded-md transition-colors`}
                                          >
                                              {action.type === 'REQUISITION' ? 'Create Requisition' : 'Create Build Order'} by {new Date(action.actionDate).toLocaleDateString()}
                                          </button>
                                      </li>
                                  ))}
                              </ul>
                          ) : <p className="text-center text-gray-400 py-8">No immediate actions required based on forecast.</p>}
                      </div>
                  </section>
              </div>
          </div>
      </div>
  )
};

const DemandChart: React.FC<{ data: Forecast[] }> = ({ data }) => {
    const maxQty = Math.max(...data.map(d => d.quantity), 1);
    return (
        <div className="h-40 bg-gray-900/50 rounded-lg p-2 flex items-end space-x-1">
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

interface SuggestedAction {
    type: 'REQUISITION' | 'BUILD';
    sku: string;
    name: string;
    quantity: number;
    reason: string;
    actionDate: string;
    vendorId?: string;
}


export default Dashboard;