

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
  onCreateRequisition: (items: RequisitionItem[], source: 'Manual' | 'System', priority?: 'critical' | 'high' | 'medium' | 'low') => void;
  onCreateBuildOrder: (sku: string, name: string, quantity: number) => void;
  setCurrentPage: (page: Page) => void;
  aiConfig: AiConfig;
}

const Dashboard: React.FC<DashboardProps> = (props) => {
  const { inventory, boms, requisitions, users, currentUser, setCurrentPage } = props;

  const [openSections, setOpenSections] = useState({
    production: false,
    buildability: false,
    shortages: false,
    renewals: false,
    requisitions: false,
    todos: false,
  });

  // Load section order from localStorage or use default
  const defaultOrder = ['production', 'buildability', 'shortages', 'renewals', 'requisitions', 'todos'];
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('dashboardSectionOrder');
    return saved ? JSON.parse(saved) : defaultOrder;
  });

  const [draggedSection, setDraggedSection] = useState<string | null>(null);

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({...prev, [section]: !prev[section]}));
  };

  // Drag-and-drop handlers
  const handleDragStart = (section: string) => {
    setDraggedSection(section);
  };

  const handleDragOver = (e: React.DragEvent, targetSection: string) => {
    e.preventDefault();
    if (!draggedSection || draggedSection === targetSection) return;

    const newOrder = [...sectionOrder];
    const draggedIndex = newOrder.indexOf(draggedSection);
    const targetIndex = newOrder.indexOf(targetSection);

    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedSection);

    setSectionOrder(newOrder);
  };

  const handleDragEnd = () => {
    setDraggedSection(null);
    localStorage.setItem('dashboardSectionOrder', JSON.stringify(sectionOrder));
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

  // Define all sections with their content
  const sections = useMemo(() => ({
    production: {
      title: 'Master Production & Planning',
      icon: <ChartBarIcon className="w-6 h-6 text-purple-400" />,
      content: (
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
      ),
    },
    buildability: {
      title: 'Buildability Status',
      icon: <CheckCircleIcon className="w-6 h-6 text-green-400" />,
      content: <BuildabilityTable data={buildabilityData} />,
    },
    shortages: {
      title: 'Critical Shortages',
      icon: <ExclamationCircleIcon className="w-6 h-6 text-red-400" />,
      content: criticalShortagesContent,
    },
    renewals: {
      title: 'Registration Renewal Alerts',
      icon: <BellIcon className="w-6 h-6 text-orange-400" />,
      content: (
        <RenewalAlertsWidget
          boms={boms}
          onViewDetails={(bomId) => {
            setCurrentPage('BOMs');
          }}
        />
      ),
    },
    requisitions: {
      title: 'Pending Requisitions',
      icon: <ClipboardListIcon className="w-6 h-6 text-yellow-400" />,
      content: pendingRequisitionsContent,
    },
    todos: {
      title: 'Compliance & Artwork Todos',
      icon: <BeakerIcon className="w-6 h-6 text-blue-400" />,
      content: todosContent,
    },
  }), [props, buildabilityData, criticalShortagesContent, pendingRequisitionsContent, todosContent, boms, setCurrentPage]);

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
            <p className="text-gray-400 mt-1">Welcome back, here's your company-wide operations snapshot. <span className="text-xs text-gray-500">(Drag sections to reorder)</span></p>
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
        {sectionOrder.map((sectionId) => {
          const section = sections[sectionId as keyof typeof sections];
          if (!section) return null;

          return (
            <div
              key={sectionId}
              draggable
              onDragStart={() => handleDragStart(sectionId)}
              onDragOver={(e) => handleDragOver(e, sectionId)}
              onDragEnd={handleDragEnd}
              className={`transition-opacity ${draggedSection === sectionId ? 'opacity-50' : 'opacity-100'}`}
            >
              <CollapsibleSection
                id={sectionId}
                title={section.title}
                icon={section.icon}
                variant="card"
                isOpen={openSections[sectionId as keyof typeof openSections]}
                onToggle={() => toggleSection(sectionId as keyof typeof openSections)}
              >
                {section.content}
              </CollapsibleSection>
            </div>
          );
        })}
      </div>
    </div>
  );
};


export default Dashboard;