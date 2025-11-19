

import React, { useMemo, useState, useEffect } from 'react';
import type { Page } from '../App';
import type { BillOfMaterials, InventoryItem, HistoricalSale, Vendor, InternalRequisition, User, AiConfig, RequisitionItem, PurchaseOrder } from '../types';
import CollapsibleSection from '../components/CollapsibleSection';
import ExecutiveSummary from '../components/ExecutiveSummary';
import BuildabilityTable from '../components/BuildabilityTable';
import RenewalAlertsWidget from '../components/RenewalAlertsWidget';
import InventoryIntelligencePanel from '../components/InventoryIntelligencePanel';
import { calculateAllBuildability } from '../services/buildabilityService';
import { LightBulbIcon, ClipboardListIcon, BeakerIcon, ExclamationCircleIcon, BellIcon, CheckCircleIcon, ChartBarIcon, ClipboardDocumentListIcon } from '../components/icons';

interface DashboardProps {
  inventory: InventoryItem[];
  boms: BillOfMaterials[];
  historicalSales: HistoricalSale[];
  vendors: Vendor[];
  requisitions: InternalRequisition[];
  users: User[];
  currentUser: User;
  purchaseOrders: PurchaseOrder[];
  onCreateRequisition: (items: RequisitionItem[], source: 'Manual' | 'System') => void;
  onCreateBuildOrder: (sku: string, name: string, quantity: number) => void;
  setCurrentPage: (page: Page) => void;
  aiConfig: AiConfig;
}

const Dashboard: React.FC<DashboardProps> = (props) => {
  const { inventory, boms, requisitions, users, currentUser, setCurrentPage } = props;
  
  const [openSections, setOpenSections] = useState({
    buildability: false,
    shortages: false,
    renewals: false,
    requisitions: false,
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
            <p className="text-gray-400 mt-1">Welcome back, here's your company-wide operations snapshot.</p>
          </div>
          <button
            onClick={() => setCurrentPage('Purchase Orders')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg transition-colors flex items-center gap-2"
          >
            <ClipboardDocumentListIcon className="w-5 h-5" />
            View Reorder Queue
          </button>
        </div>
      </header>
      
      <section>
        <h2 className="text-xl font-semibold mb-4 text-gray-300">Executive Summary</h2>
        <ExecutiveSummary data={buildabilityData} onCardClick={() => handleCardClick('buildability')} />
      </section>
      
      <div className="space-y-6">
        <CollapsibleSection
          id="buildability"
          title="Buildability Status"
          icon={<CheckCircleIcon className="w-6 h-6 text-green-400"/>}
          variant="card"
          isOpen={openSections.buildability}
          onToggle={() => toggleSection('buildability')}
        >
          <BuildabilityTable data={buildabilityData} />
        </CollapsibleSection>
        
        <CollapsibleSection
          id="shortages"
          title="Critical Shortages"
          icon={<ExclamationCircleIcon className="w-6 h-6 text-red-400"/>}
          variant="card"
          isOpen={openSections.shortages}
          onToggle={() => toggleSection('shortages')}
        >
          {criticalShortagesContent}
        </CollapsibleSection>

        <CollapsibleSection
          id="renewals"
          title="Registration Renewal Alerts"
          icon={<BellIcon className="w-6 h-6 text-orange-400"/>}
          variant="card"
          isOpen={openSections.renewals}
          onToggle={() => toggleSection('renewals')}
        >
          <RenewalAlertsWidget
            boms={boms}
            onViewDetails={(bomId) => {
              setCurrentPage('BOMs');
              // TODO: Could add navigation to specific BOM detail modal
            }}
          />
        </CollapsibleSection>

        <CollapsibleSection
          id="requisitions"
          title="Pending Requisitions"
          icon={<ClipboardListIcon className="w-6 h-6 text-yellow-400"/>}
          variant="card"
          isOpen={openSections.requisitions}
          onToggle={() => toggleSection('requisitions')}
        >
          {pendingRequisitionsContent}
        </CollapsibleSection>
        
        <CollapsibleSection
          id="todos"
          title="Compliance & Artwork Todos"
          icon={<BeakerIcon className="w-6 h-6 text-blue-400"/>}
          variant="card"
          isOpen={openSections.todos}
          onToggle={() => toggleSection('todos')}
        >
          {todosContent}
        </CollapsibleSection>

        <CollapsibleSection
          id="forecast"
          title="Inventory Intelligence & Planning"
          icon={<ChartBarIcon className="w-6 h-6 text-purple-400" />}
          variant="card"
          isOpen={openSections.forecast}
          onToggle={() => toggleSection('forecast')}
        >
          <InventoryIntelligencePanel
            boms={props.boms}
            inventory={props.inventory}
            historicalSales={props.historicalSales}
            vendors={props.vendors}
            purchaseOrders={props.purchaseOrders}
            onCreateRequisition={props.onCreateRequisition}
            onCreateBuildOrder={props.onCreateBuildOrder}
            aiConfig={props.aiConfig}
          />
        </CollapsibleSection>
      </div>
    </div>
  );
};


export default Dashboard;