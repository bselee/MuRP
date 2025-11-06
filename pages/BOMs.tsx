
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { BillOfMaterials, User, InventoryItem } from '../types';
import { PencilIcon, ChevronDownIcon } from '../components/icons';
import BomEditModal from '../components/BomEditModal';

interface BOMsProps {
  boms: BillOfMaterials[];
  inventory: InventoryItem[];
  currentUser: User;
  onUpdateBom: (updatedBom: BillOfMaterials) => void;
  onNavigateToArtwork: (filter: string) => void;
  onNavigateToInventory?: (sku: string) => void;
}

const BOMs: React.FC<BOMsProps> = ({ boms, inventory, currentUser, onUpdateBom, onNavigateToArtwork, onNavigateToInventory }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBom, setSelectedBom] = useState<BillOfMaterials | null>(null);
  const [expandedBoms, setExpandedBoms] = useState<Set<string>>(new Set());
  const bomRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const canEdit = currentUser.role === 'Admin';

  // Debug on mount and prop changes
  useEffect(() => {
    console.log('=== BOMs COMPONENT MOUNTED/UPDATED ===');
    console.log('[BOMs] Props received:');
    console.log('  - boms:', boms?.length || 0, 'items');
    console.log('  - inventory:', inventory?.length || 0, 'items');
    console.log('  - Sample BOM:', boms?.[0]);
    console.log('  - Sample Inventory:', inventory?.[0]);
    console.log('======================================');
  }, [boms, inventory]);

  // Filter BOMs to remove those with only one component
  const filteredBoms = useMemo(() => {
    const filtered = boms.filter(bom => bom.components && bom.components.length > 1);
    console.log(`[BOMs] Filtered ${boms.length} BOMs down to ${filtered.length} (removed ${boms.length - filtered.length} single-component BOMs)`);
    return filtered;
  }, [boms]);

  // Create inventory lookup map
  const inventoryMap = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    inventory.forEach(item => map.set(item.sku, item));
    console.log('=== INVENTORY DEBUG ===');
    console.log('[BOMs] Inventory array:', inventory);
    console.log('[BOMs] Inventory count:', inventory.length);
    console.log('[BOMs] InventoryMap size:', map.size);
    if (inventory.length > 0) {
      console.log('[BOMs] Sample inventory items:', inventory.slice(0, 5).map(i => ({ sku: i.sku, name: i.name, stock: i.stock })));
    }
    console.log('======================');
    return map;
  }, [inventory]);

  // Calculate buildability for a BOM
  const calculateBuildability = (bom: BillOfMaterials) => {
    console.log('=== CALCULATING BUILDABILITY FOR:', bom.finishedSku, '===');
    console.log('[BOMs] BOM components:', bom.components);
    
    if (!bom.components || bom.components.length === 0) {
      console.log('[BOMs] No components found');
      return { maxBuildable: 0, limitingComponents: [] };
    }

    let maxBuildable = Infinity;
    const limitingComponents: Array<{ sku: string; name: string; available: number; needed: number; canBuild: number }> = [];

    bom.components.forEach(component => {
      console.log('[BOMs] Looking up component:', component);
      const inventoryItem = inventoryMap.get(component.sku);
      console.log('[BOMs] Found inventory item:', inventoryItem);
      const available = inventoryItem?.stock || 0;
      const needed = component.quantity || 1;
      const canBuild = Math.floor(available / needed);

      console.log('[BOMs] Component SKU:', component.sku, '| Found:', !!inventoryItem, '| Stock:', available, '| Needed:', needed, '| CanBuild:', canBuild);

      if (canBuild < maxBuildable) {
        maxBuildable = canBuild;
        limitingComponents.length = 0; // Clear previous limiting components
        limitingComponents.push({
          sku: component.sku,
          name: component.name,
          available,
          needed,
          canBuild
        });
      } else if (canBuild === maxBuildable && maxBuildable < Infinity) {
        limitingComponents.push({
          sku: component.sku,
          name: component.name,
          available,
          needed,
          canBuild
        });
      }
    });

    return {
      maxBuildable: maxBuildable === Infinity ? 0 : maxBuildable,
      limitingComponents
    };
  };

  const toggleBomExpanded = (bomId: string) => {
    const newExpanded = new Set(expandedBoms);
    if (newExpanded.has(bomId)) {
      newExpanded.delete(bomId);
    } else {
      newExpanded.add(bomId);
    }
    setExpandedBoms(newExpanded);
  };

  // Check for selectedBomSku from localStorage (navigation from Inventory)
  useEffect(() => {
    const selectedSku = localStorage.getItem('selectedBomSku');
    if (selectedSku) {
      // Find the BOM with this SKU
      const targetBom = boms.find(b => b.finishedSku === selectedSku);
      if (targetBom) {
        // Expand this BOM
        setExpandedBoms(new Set([targetBom.id]));
        
        // Scroll to it after a short delay
        setTimeout(() => {
          const element = bomRefs.current.get(targetBom.id);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Flash effect
            element.classList.add('ring-2', 'ring-blue-500');
            setTimeout(() => {
              element.classList.remove('ring-2', 'ring-blue-500');
            }, 2000);
          }
        }, 100);
      }
      
      // Clear the localStorage
      localStorage.removeItem('selectedBomSku');
    }
  }, [boms]);

  const handleEditClick = (bom: BillOfMaterials) => {
    setSelectedBom(bom);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedBom(null);
  };

  // Separate BOMs by category or show all as finished goods if no clear distinction
  const manufacturedProducts = filteredBoms.filter(b => 
    b.category?.toLowerCase().includes('finished') || 
    b.category?.toLowerCase().includes('product') ||
    (!b.category?.toLowerCase().includes('sub') && !b.category?.toLowerCase().includes('assembly'))
  );
  const subAssemblies = filteredBoms.filter(b => 
    b.category?.toLowerCase().includes('sub') || 
    b.category?.toLowerCase().includes('assembly')
  );
  
  // If no clear categorization, show all in finished goods
  const displayManufacturedProducts = manufacturedProducts.length > 0 ? manufacturedProducts : filteredBoms;
  const displaySubAssemblies = subAssemblies;

  const BomCard: React.FC<{ bom: BillOfMaterials }> = ({ bom }) => {
    const isExpanded = expandedBoms.has(bom.id);
    const finishedItem = inventoryMap.get(bom.finishedSku);
    const finishedStock = finishedItem?.stock || 0;
    const buildability = calculateBuildability(bom);
    
    return (
      <div 
        ref={(el) => {
          if (el) bomRefs.current.set(bom.id, el);
        }}
        className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 overflow-hidden transition-all"
      >
        <div className="p-4 bg-gray-800 flex justify-between items-center">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-white font-mono">{bom.finishedSku}</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Stock:</span>
                <span className={`text-sm font-semibold ${finishedStock > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {finishedStock}
                </span>
                <span className="text-gray-600">|</span>
                <span className="text-xs text-gray-500">Buildable:</span>
                <span className={`text-sm font-semibold ${buildability.maxBuildable > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {buildability.maxBuildable}
                </span>
              </div>
            </div>
            <p className="text-sm text-gray-400">{bom.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => toggleBomExpanded(bom.id)}
              className="p-2 hover:bg-gray-700 rounded-md transition-colors"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
            {canEdit && (
              <button onClick={() => handleEditClick(bom)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-3 rounded-md transition-colors">
                <PencilIcon className="w-4 h-4" />
                Edit
              </button>
            )}
          </div>
        </div>
        {isExpanded && (
          <div className="p-4 space-y-4 border-t border-gray-700">
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Components</h4>
          <ul className="space-y-2 text-sm">
            {bom.components.map(c => {
              const componentItem = inventoryMap.get(c.sku);
              const available = componentItem?.stock || 0;
              const needed = c.quantity || 1;
              const canBuild = Math.floor(available / needed);
              const isLimiting = buildability.limitingComponents.some(lc => lc.sku === c.sku);
              
              return (
                <li key={c.sku} className={`flex justify-between items-start p-2 rounded ${isLimiting ? 'bg-red-900/20 border border-red-700/30' : ''}`}>
                  <div className="flex-1">
                    {onNavigateToInventory ? (
                      <button
                        onClick={() => onNavigateToInventory(c.sku)}
                        className="font-semibold font-mono text-indigo-400 hover:text-indigo-300 hover:underline"
                      >
                        {c.sku}
                      </button>
                    ) : (
                      <span className="font-semibold font-mono text-white">{c.sku}</span>
                    )}
                    <span className="text-gray-400 ml-2">/ {c.name}</span>
                    <div className="text-xs mt-1 flex items-center gap-2">
                      <span className={`font-semibold ${available >= needed ? 'text-green-400' : 'text-red-400'}`}>
                        Stock: {available}
                      </span>
                      <span className="text-gray-600">|</span>
                      <span className="text-gray-500">Need: {needed}</span>
                      <span className="text-gray-600">|</span>
                      <span className={`font-semibold ${canBuild > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        Can build: {canBuild}
                      </span>
                      {isLimiting && (
                        <>
                          <span className="text-gray-600">|</span>
                          <span className="text-red-400 font-semibold">⚠️ LIMITING</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-gray-400 font-mono ml-4">x{c.quantity}</span>
                </li>
              );
            })}
          </ul>
        </div>
        {bom.artwork.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Artwork</h4>
            <ul className="space-y-1 text-sm">
              {bom.artwork.map(art => (
                <li key={art.id} className="flex justify-between">
                  <button onClick={() => onNavigateToArtwork(art.fileName)} className="text-indigo-400 hover:underline text-left truncate">
                    {art.fileName}
                  </button>
                  <span className="text-gray-400 font-mono ml-2">Rev {art.revision}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Packaging</h4>
          <p className="text-sm text-gray-300">{bom.packaging.bagType} w/ {bom.packaging.labelType}</p>
          <p className="text-xs text-gray-500 mt-1"><i>Instructions: {bom.packaging.specialInstructions}</i></p>
        </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white tracking-tight">Bills of Materials (BOMs)</h1>
        <p className="text-gray-400 mt-1">Manage the recipes and specifications for all manufactured items.</p>
      </header>
      
      {!canEdit && (
        <div className="bg-yellow-900/50 border border-yellow-700 text-yellow-300 text-sm rounded-lg p-4">
            You do not have permission to edit Bills of Materials. This action is restricted to Administrators.
        </div>
      )}

      <section>
        <h2 className="text-xl font-semibold mb-4 text-gray-300">Finished Goods</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {displayManufacturedProducts.length > 0 ? (
            displayManufacturedProducts.map(bom => <BomCard key={bom.id} bom={bom} />)
          ) : (
            <p className="text-gray-400 col-span-full">No finished goods BOMs found.</p>
          )}
        </div>
      </section>

      {displaySubAssemblies.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4 text-gray-300">Sub-Assemblies</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {displaySubAssemblies.map(bom => <BomCard key={bom.id} bom={bom} />)}
          </div>
        </section>
      )}
      
      {selectedBom && (
        <BomEditModal 
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            bom={selectedBom}
            onSave={onUpdateBom}
        />
      )}
    </div>
  );
};

export default BOMs;
