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
import {
  PencilIcon,
  ChevronDownIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  Squares2X2Icon,
  ListBulletIcon,
  ExclamationTriangleIcon
} from '../components/icons';
import BomEditModal from '../components/BomEditModal';
import BomDetailModal from '../components/BomDetailModal';
import ComplianceDashboard from '../components/ComplianceDashboard';
import ComplianceDetailModal from '../components/ComplianceDetailModal';
import EnhancedBomCard from '../components/EnhancedBomCard';
import { useSupabaseLabels, useSupabaseComplianceRecords } from '../hooks/useSupabaseData';

type ViewMode = 'card' | 'table';
type SortOption = 'name' | 'sku' | 'inventory' | 'buildability';
type BuildabilityFilter = 'all' | 'buildable' | 'not-buildable';

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
  const [expandedBoms, setExpandedBoms] = useState<Set<string>>(new Set());
  const bomRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // New UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [buildabilityFilter, setBuildabilityFilter] = useState<BuildabilityFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [showCriticalAlerts, setShowCriticalAlerts] = useState(true);

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

  // Get unique categories for filter dropdown
  const categories = useMemo(() => {
    const cats = new Set(filteredBoms.map(b => b.category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [filteredBoms]);

  // Apply search, filters, and sorting
  const processedBoms = useMemo(() => {
    let result = [...filteredBoms];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(bom =>
        bom.name.toLowerCase().includes(query) ||
        bom.finishedSku.toLowerCase().includes(query) ||
        bom.category?.toLowerCase().includes(query) ||
        bom.components.some(c =>
          c.name.toLowerCase().includes(query) ||
          c.sku.toLowerCase().includes(query)
        )
      );
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter(bom => bom.category === categoryFilter);
    }

    // Buildability filter
    if (buildabilityFilter !== 'all') {
      result = result.filter(bom => {
        const { maxBuildable } = calculateBuildability(bom);
        return buildabilityFilter === 'buildable' ? maxBuildable > 0 : maxBuildable === 0;
      });
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'sku':
          return a.finishedSku.localeCompare(b.finishedSku);
        case 'inventory': {
          const stockA = inventoryMap.get(a.finishedSku)?.stock || 0;
          const stockB = inventoryMap.get(b.finishedSku)?.stock || 0;
          return stockB - stockA;
        }
        case 'buildability': {
          const buildA = calculateBuildability(a).maxBuildable;
          const buildB = calculateBuildability(b).maxBuildable;
          return buildB - buildA;
        }
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return result;
  }, [filteredBoms, searchQuery, categoryFilter, buildabilityFilter, sortBy, inventoryMap]);

  // Identify critical alerts
  const criticalBoms = useMemo(() => {
    return filteredBoms.filter(bom => {
      const { maxBuildable } = calculateBuildability(bom);
      return maxBuildable === 0 && (inventoryMap.get(bom.finishedSku)?.stock || 0) === 0;
    });
  }, [filteredBoms, inventoryMap]);

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
    <div className="container mx-auto p-4 space-y-4">
      {/* Critical Alerts Banner */}
      {showCriticalAlerts && criticalBoms.length > 0 && (
        <div className="bg-red-900/20 border-2 border-red-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-red-400 font-semibold text-lg mb-1">Critical Alerts</h3>
              <p className="text-gray-300 text-sm mb-3">
                {criticalBoms.length} product{criticalBoms.length > 1 ? 's' : ''} cannot be built and have zero inventory
              </p>
              <div className="flex flex-wrap gap-2">
                {criticalBoms.map(bom => (
                  <button
                    key={bom.id}
                    onClick={() => {
                      const element = bomRefs.current.get(bom.id);
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        element.classList.add('ring-2', 'ring-red-500');
                        setTimeout(() => element.classList.remove('ring-2', 'ring-red-500'), 2000);
                      }
                    }}
                    className="px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-300 text-sm rounded-md border border-red-700 transition-colors"
                  >
                    {bom.finishedSku}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => setShowCriticalAlerts(false)}
              className="text-gray-400 hover:text-gray-300"
              aria-label="Dismiss alerts"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Search, Filters, and Controls */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search Bar */}
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by SKU, name, category, or component..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            {/* Buildability Filter */}
            <select
              value={buildabilityFilter}
              onChange={(e) => setBuildabilityFilter(e.target.value as BuildabilityFilter)}
              className="px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Status</option>
              <option value="buildable">✓ Buildable</option>
              <option value="not-buildable">✗ Not Buildable</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* Sort By */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="name">Sort: Name</option>
              <option value="sku">Sort: SKU</option>
              <option value="inventory">Sort: Inventory</option>
              <option value="buildability">Sort: Buildability</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('card')}
                className={`px-3 py-2.5 transition-colors ${
                  viewMode === 'card'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800'
                }`}
                title="Card view"
              >
                <Squares2X2Icon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-2.5 transition-colors border-l border-gray-700 ${
                  viewMode === 'table'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800'
                }`}
                title="Table view"
              >
                <ListBulletIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Results Count */}
        <div className="mt-3 text-sm text-gray-400">
          Showing {processedBoms.length} of {filteredBoms.length} BOMs
          {searchQuery && <span> matching "{searchQuery}"</span>}
        </div>
      </div>

      {/* BOM Cards/Table */}
      {processedBoms.length === 0 ? (
        <div className="bg-gray-800/30 rounded-lg border-2 border-dashed border-gray-700 p-12 text-center">
          <h3 className="text-lg font-medium text-gray-400 mb-2">No BOMs found</h3>
          <p className="text-sm text-gray-500">
            Try adjusting your search or filters
          </p>
        </div>
      ) : viewMode === 'card' ? (
        <div className="grid gap-4">
          {processedBoms.map(bom => (
            <BomCard key={bom.id} bom={bom} />
          ))}
        </div>
      ) : (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Product Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Inventory
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Can Build
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Components
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {processedBoms.map(bom => {
                  const finishedStock = inventoryMap.get(bom.finishedSku)?.stock || 0;
                  const buildability = calculateBuildability(bom);

                  return (
                    <tr
                      key={bom.id}
                      ref={(el) => {
                        if (el) bomRefs.current.set(bom.id, el);
                      }}
                      className="hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => onNavigateToInventory?.(bom.finishedSku)}
                          className="text-sm font-bold font-mono text-white hover:text-indigo-400 transition-colors underline decoration-dotted decoration-gray-600 hover:decoration-indigo-400"
                        >
                          {bom.finishedSku}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-white">{bom.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-300 border border-gray-600">
                          {bom.category || 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className={`text-sm font-bold ${finishedStock > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {finishedStock}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className={`text-sm font-bold ${buildability.maxBuildable > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {buildability.maxBuildable}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-300">{bom.components.length}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewDetails(bom)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
                          >
                            View
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => handleEditClick(bom)}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded transition-colors"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
