/**
 * BOMs Page - MERGED VERSION
 *
 * Combines:
 * - Inventory integration from main (buildability, stock levels, limiting components)
 * - Compliance features from our branch (dashboard, alerts, data sheets)
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { BillOfMaterials, User, InventoryItem, WatchlistItem, Artwork } from '../types';
import type { ComplianceStatus } from '../types/regulatory';
import { PencilIcon, ChevronDownIcon, EyeIcon } from '../components/icons';
import BomEditModal from '../components/BomEditModal';
import BomDetailModal from '../components/BomDetailModal';
import ComplianceDashboard from '../components/ComplianceDashboard';
import ComplianceDetailModal from '../components/ComplianceDetailModal';

interface BOMsProps {
  boms: BillOfMaterials[];
  inventory: InventoryItem[];
  currentUser: User;
  watchlist: WatchlistItem[];
  onUpdateBom: (updatedBom: BillOfMaterials) => void;
  onNavigateToArtwork: (filter: string) => void;
  onNavigateToInventory?: (sku: string) => void;
  onUploadArtwork?: (bomId: string, artwork: Omit<Artwork, 'id'>) => void;
}

const BOMs: React.FC<BOMsProps> = ({
  boms,
  inventory,
  currentUser,
  watchlist,
  onUpdateBom,
  onNavigateToArtwork,
  onNavigateToInventory,
  onUploadArtwork
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBom, setSelectedBom] = useState<BillOfMaterials | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedDetailBom, setSelectedDetailBom] = useState<BillOfMaterials | null>(null);
  const [isComplianceDetailOpen, setIsComplianceDetailOpen] = useState(false);
  const [selectedComplianceStatus, setSelectedComplianceStatus] = useState<ComplianceStatus | null>(null);
  const [showComplianceDashboard, setShowComplianceDashboard] = useState(true);
  const [expandedBoms, setExpandedBoms] = useState<Set<string>>(new Set());
  const bomRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const canEdit = currentUser.role === 'Admin';

  // Debug inventory integration
  useEffect(() => {
    console.log('=== BOMs COMPONENT MOUNTED/UPDATED ===');
    console.log('[BOMs] Props received:');
    console.log('  - boms:', boms?.length || 0, 'items');
    console.log('  - inventory:', inventory?.length || 0, 'items');
    if (inventory?.length > 0) {
      console.log('  - Inventory items with stock > 0:', inventory.filter(i => i.stock > 0).length);
    }
    console.log('======================================');
  }, [boms, inventory]);

  // Filter BOMs to remove those with only one component
  const filteredBoms = useMemo(() => {
    const filtered = boms.filter(bom => bom.components && bom.components.length > 1);
    console.log(`[BOMs] Filtered ${boms.length} BOMs down to ${filtered.length}`);
    return filtered;
  }, [boms]);

  // Create inventory lookup map for O(1) access
  const inventoryMap = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    inventory.forEach(item => map.set(item.sku, item));
    console.log('[BOMs] InventoryMap size:', map.size);
    return map;
  }, [inventory]);

  // Calculate buildability for a BOM - CRITICAL MRP FUNCTION
  const calculateBuildability = (bom: BillOfMaterials) => {
    if (!bom.components || bom.components.length === 0) {
      return { maxBuildable: 0, limitingComponents: [] };
    }

    let maxBuildable = Infinity;
    const limitingComponents: Array<{
      sku: string;
      name: string;
      available: number;
      needed: number;
      canBuild: number
    }> = [];

    bom.components.forEach(component => {
      const inventoryItem = inventoryMap.get(component.sku);
      const available = inventoryItem?.stock || 0;
      const needed = component.quantity || 1;
      const canBuild = Math.floor(available / needed);

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

  // Navigation from Inventory page - auto-scroll to BOM
  useEffect(() => {
    const selectedSku = localStorage.getItem('selectedBomSku');
    if (selectedSku) {
      const targetBom = boms.find(b => b.finishedSku === selectedSku);
      if (targetBom) {
        setExpandedBoms(new Set([targetBom.id]));

        setTimeout(() => {
          const element = bomRefs.current.get(targetBom.id);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('ring-2', 'ring-blue-500');
            setTimeout(() => {
              element.classList.remove('ring-2', 'ring-blue-500');
            }, 2000);
          }
        }, 100);
      }

      localStorage.removeItem('selectedBomSku');
    }
  }, [boms]);

  const handleViewComplianceDetails = (bom: BillOfMaterials, status: ComplianceStatus) => {
    setSelectedBom(bom);
    setSelectedComplianceStatus(status);
    setIsComplianceDetailOpen(true);
  };

  const handleCloseComplianceDetail = () => {
    setIsComplianceDetailOpen(false);
    setSelectedBom(null);
    setSelectedComplianceStatus(null);
  };

  const handleEditClick = (bom: BillOfMaterials) => {
    setSelectedBom(bom);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedBom(null);
  };

  const handleViewDetails = (bom: BillOfMaterials) => {
    setSelectedDetailBom(bom);
    setIsDetailModalOpen(true);
  };

  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedDetailBom(null);
  };

  // Categorize BOMs
  const manufacturedProducts = filteredBoms.filter(b =>
    b.category?.toLowerCase().includes('finished') ||
    b.category?.toLowerCase().includes('product') ||
    (!b.category?.toLowerCase().includes('sub') && !b.category?.toLowerCase().includes('assembly'))
  );
  const subAssemblies = filteredBoms.filter(b =>
    b.category?.toLowerCase().includes('sub') ||
    b.category?.toLowerCase().includes('assembly')
  );

  const displayManufacturedProducts = manufacturedProducts.length > 0 ? manufacturedProducts : filteredBoms;
  const displaySubAssemblies = subAssemblies;

  const BomCard: React.FC<{ bom: BillOfMaterials }> = ({ bom }) => {
    const isExpanded = expandedBoms.has(bom.id);
    const finishedItem = inventoryMap.get(bom.finishedSku);
    const finishedStock = finishedItem?.stock || 0;
    const buildability = calculateBuildability(bom);
    const labelCount = bom.artwork.filter(art => art.fileType === 'label').length;
    const hasRegistrations = (bom.registrations?.length || 0) > 0;

    return (
      <div
        ref={(el) => {
          if (el) bomRefs.current.set(bom.id, el);
        }}
        className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 overflow-hidden transition-all"
      >
        <div className="p-4 bg-gray-800 flex justify-between items-center">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="font-semibold text-white font-mono">{bom.finishedSku}</h3>

              {/* INVENTORY INTEGRATION: Stock & Buildability Display */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">Stock:</span>
                <span className={`font-semibold ${finishedStock > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {finishedStock}
                </span>
                <span className="text-gray-600">|</span>
                <span className="text-gray-500">Buildable:</span>
                <span className={`font-semibold ${buildability.maxBuildable > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {buildability.maxBuildable}
                </span>
              </div>

              {/* COMPLIANCE INTEGRATION: Labels & Registrations Badges */}
              {labelCount > 0 && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-900/30 text-blue-300 border border-blue-700">
                  {labelCount} {labelCount === 1 ? 'label' : 'labels'}
                </span>
              )}
              {hasRegistrations && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-purple-900/30 text-purple-300 border border-purple-700">
                  {bom.registrations?.length} {bom.registrations?.length === 1 ? 'registration' : 'registrations'}
                </span>
              )}
            </div>

            <p className="text-sm text-gray-400">{bom.name}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleViewDetails(bom)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-3 rounded-md transition-colors"
              title="View full details, labels, registrations, and data sheets"
            >
              <EyeIcon className="w-4 h-4" />
              View
            </button>

            <button
              onClick={() => toggleBomExpanded(bom.id)}
              className="p-2 hover:bg-gray-700 rounded-md transition-colors"
              title={isExpanded ? 'Collapse components' : 'Expand components'}
            >
              <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>

            {canEdit && (
              <button
                onClick={() => handleEditClick(bom)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-3 rounded-md transition-colors"
              >
                <PencilIcon className="w-4 h-4" />
                Edit
              </button>
            )}
          </div>
        </div>

        {/* EXPANDED VIEW: Component-Level Stock Details */}
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
                    <li
                      key={c.sku}
                      className={`flex justify-between items-start p-2 rounded ${
                        isLimiting ? 'bg-red-900/20 border border-red-700/30' : ''
                      }`}
                    >
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

                        {/* Component Stock Details */}
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
                              <span className="text-red-400 font-semibold">⚠ Limiting</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-gray-500 ml-4">{c.unit}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Buildability Warning */}
            {buildability.maxBuildable === 0 && (
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-3">
                <p className="text-red-400 text-sm font-medium">
                  ⚠ Cannot build - insufficient inventory
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Limiting components: {buildability.limitingComponents.map(lc => lc.sku).join(', ')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">Bills of Materials</h1>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>Inventory items: {inventory.length}</span>
          <span>•</span>
          <span>BOMs: {filteredBoms.length}</span>
        </div>
      </div>

      {/* Compliance Dashboard */}
      {showComplianceDashboard && (
        <div className="mb-6">
          <ComplianceDashboard
            boms={boms}
            watchlist={watchlist}
            onViewDetails={handleViewComplianceDetails}
          />
        </div>
      )}

      {/* Manufactured Products */}
      {displayManufacturedProducts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-300">
            Finished Products ({displayManufacturedProducts.length})
          </h2>
          <div className="grid gap-4">
            {displayManufacturedProducts.map(bom => (
              <BomCard key={bom.id} bom={bom} />
            ))}
          </div>
        </div>
      )}

      {/* Sub-Assemblies */}
      {displaySubAssemblies.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-300">
            Sub-Assemblies ({displaySubAssemblies.length})
          </h2>
          <div className="grid gap-4">
            {displaySubAssemblies.map(bom => (
              <BomCard key={bom.id} bom={bom} />
            ))}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isModalOpen && selectedBom && (
        <BomEditModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          bom={selectedBom}
          onUpdateBom={onUpdateBom}
        />
      )}

      {/* Detail Modal (Labels, Registrations, Data Sheets) */}
      {isDetailModalOpen && selectedDetailBom && (
        <BomDetailModal
          isOpen={isDetailModalOpen}
          onClose={handleCloseDetailModal}
          bom={selectedDetailBom}
          onUploadArtwork={onUploadArtwork}
          onUpdateBom={onUpdateBom}
          currentUser={currentUser}
        />
      )}

      {/* Compliance Detail Modal */}
      {isComplianceDetailOpen && selectedBom && selectedComplianceStatus && (
        <ComplianceDetailModal
          isOpen={isComplianceDetailOpen}
          onClose={handleCloseComplianceDetail}
          bom={selectedBom}
          complianceStatus={selectedComplianceStatus}
        />
      )}
    </div>
  );
};

export default BOMs;
