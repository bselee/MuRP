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
import EnhancedBomCard from '../components/EnhancedBomCard';
import { useSupabaseLabels, useSupabaseComplianceRecords } from '../hooks/useSupabaseData';

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
    console.log('[BOMs] toggleBomExpanded CALLED!', {
      bomId,
      currentExpandedBoms: Array.from(expandedBoms),
      wasExpanded: expandedBoms.has(bomId)
    });
    const newExpanded = new Set(expandedBoms);
    if (newExpanded.has(bomId)) {
      console.log('[BOMs] COLLAPSING BOM');
      newExpanded.delete(bomId);
    } else {
      console.log('[BOMs] EXPANDING BOM');
      newExpanded.add(bomId);
    }
    console.log('[BOMs] New expandedBoms:', Array.from(newExpanded));
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

    // Fetch labels and compliance records from relational tables
    const { data: labels } = useSupabaseLabels(bom.id);
    const { data: complianceRecords } = useSupabaseComplianceRecords(bom.id);

    return (
      <div
        ref={(el) => {
          if (el) bomRefs.current.set(bom.id, el);
        }}
      >
        <EnhancedBomCard
          bom={bom}
          isExpanded={isExpanded}
          finishedStock={finishedStock}
          buildability={buildability}
          inventoryMap={inventoryMap}
          canEdit={canEdit}
          userRole={currentUser.role}
          labels={labels}
          complianceRecords={complianceRecords}
          onToggleExpand={() => toggleBomExpanded(bom.id)}
          onViewDetails={() => handleViewDetails(bom)}
          onEdit={() => handleEditClick(bom)}
          onNavigateToInventory={onNavigateToInventory}
        />
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
