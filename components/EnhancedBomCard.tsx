/**
 * Enhanced BOM Card Component
 *
 * Comprehensive, information-dense card for power users managing 30-100+ products
 * Shows all pertinent info at-a-glance: specs, packaging, compliance, artwork, production
 */

import React from 'react';
import type { BillOfMaterials, InventoryItem } from '../types';
import {
  PencilIcon,
  ChevronDownIcon,
  EyeIcon,
  PackageIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  XCircleIcon,
  ClockIcon,
  BeakerIcon,
  ClipboardDocumentListIcon,
  SparklesIcon,
  ArrowDownTrayIcon
} from './icons';

interface EnhancedBomCardProps {
  bom: BillOfMaterials;
  isExpanded: boolean;
  finishedStock: number;
  buildability: {
    maxBuildable: number;
    limitingComponents: Array<{
      sku: string;
      name: string;
      available: number;
      needed: number;
      canBuild: number;
    }>;
  };
  inventoryMap: Map<string, InventoryItem>;
  canEdit: boolean;
  userRole: 'Admin' | 'Manager' | 'User'; // Role-based display
  onToggleExpand: () => void;
  onViewDetails: () => void;
  onEdit: () => void;
  onNavigateToInventory?: (sku: string) => void;
  onQuickBuild?: () => void;
  onQuickOrder?: () => void;
}

const EnhancedBomCard: React.FC<EnhancedBomCardProps> = ({
  bom,
  isExpanded,
  finishedStock,
  buildability,
  inventoryMap,
  canEdit,
  userRole,
  onToggleExpand,
  onViewDetails,
  onEdit,
  onNavigateToInventory,
  onQuickBuild,
  onQuickOrder
}) => {
  // Determine display mode
  const isAdmin = userRole === 'Admin';
  const isManager = userRole === 'Manager';
  // Calculate metrics
  const labelCount = bom.artwork?.filter(art => art.fileType === 'label').length || 0;
  const verifiedLabels = bom.artwork?.filter(art => art.fileType === 'label' && art.verified).length || 0;
  const hasRegistrations = (bom.registrations?.length || 0) > 0;
  const expiredRegistrations = bom.registrations?.filter(r =>
    r.expirationDate && new Date(r.expirationDate) < new Date()
  ).length || 0;
  const urgentRegistrations = bom.registrations?.filter(r => {
    if (!r.expirationDate) return false;
    const daysUntil = Math.floor((new Date(r.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysUntil > 0 && daysUntil <= 30;
  }).length || 0;

  // Extract guaranteed analysis if available
  const guaranteedAnalysis = bom.artwork
    ?.find(art => art.fileType === 'label' && art.extractedData?.guaranteedAnalysis)
    ?.extractedData?.guaranteedAnalysis;

  const npkRatio = guaranteedAnalysis
    ? `${guaranteedAnalysis.totalNitrogen || 0}-${guaranteedAnalysis.availablePhosphate || 0}-${guaranteedAnalysis.soluablePotash || 0}`
    : null;

  // Compliance status
  const getComplianceStatus = () => {
    if (expiredRegistrations > 0) return { label: 'Expired', color: 'red' };
    if (urgentRegistrations > 0) return { label: 'Urgent', color: 'orange' };
    if (hasRegistrations) return { label: 'Current', color: 'green' };
    return { label: 'None', color: 'gray' };
  };

  const complianceStatus = getComplianceStatus();

  // Artwork status
  const getArtworkStatus = () => {
    if (labelCount === 0) return { label: 'No Labels', color: 'gray' };
    if (verifiedLabels === labelCount) return { label: 'Verified', color: 'green' };
    if (verifiedLabels > 0) return { label: 'Partial', color: 'yellow' };
    return { label: 'Unverified', color: 'orange' };
  };

  const artworkStatus = getArtworkStatus();

  // Calculate total component weight/volume if units are consistent
  const totalMaterialWeight = bom.components.reduce((sum, c) => {
    if (c.unit === 'lbs' || c.unit === 'lb') {
      return sum + (c.quantity || 0);
    }
    return sum;
  }, 0);

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 overflow-hidden transition-all hover:border-gray-600">
      {/* MAIN CARD HEADER */}
      <div className="p-4 bg-gradient-to-r from-gray-800 to-gray-800/80">
        <div className="flex items-start justify-between gap-4">
          {/* LEFT: Product Identity & Primary Metrics */}
          <div className="flex-1 min-w-0">
            {/* SKU and Category */}
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-bold text-white font-mono">{bom.finishedSku}</h3>
              {bom.category && (
                <span className="px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-300 border border-gray-600">
                  {bom.category}
                </span>
              )}
            </div>

            {/* Product Name */}
            <h4 className="text-sm font-medium text-gray-200 mb-3">{bom.name}</h4>

            {/* KEY METRICS ROW - Role-based display */}
            <div className={`grid gap-3 text-xs ${isManager ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>
              {/* Inventory Status - Both roles */}
              <div className="bg-gray-900/50 rounded p-2 border border-gray-700">
                <div className="text-gray-500 mb-1">Inventory</div>
                <div className="flex items-baseline gap-2">
                  <span className={`${isManager ? 'text-2xl' : 'text-lg'} font-bold ${finishedStock > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {finishedStock}
                  </span>
                  <span className="text-gray-400">{isManager ? '' : 'units'}</span>
                </div>
              </div>

              {/* Buildability - Both roles */}
              <div className="bg-gray-900/50 rounded p-2 border border-gray-700">
                <div className="text-gray-500 mb-1">Can Build</div>
                <div className="flex items-baseline gap-2">
                  <span className={`${isManager ? 'text-2xl' : 'text-lg'} font-bold ${buildability.maxBuildable > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {buildability.maxBuildable}
                  </span>
                  <span className="text-gray-400">{isManager ? '' : 'units'}</span>
                </div>
              </div>

              {/* Yield - Both roles */}
              <div className="bg-gray-900/50 rounded p-2 border border-gray-700">
                <div className="text-gray-500 mb-1">Yield</div>
                <div className="flex items-baseline gap-2">
                  <span className={`${isManager ? 'text-2xl' : 'text-lg'} font-bold text-blue-400`}>{bom.yieldQuantity || 1}</span>
                  <span className="text-gray-400">{isManager ? '/batch' : 'per batch'}</span>
                </div>
              </div>

              {/* Components - Admin only (technical detail) */}
              {isAdmin && (
                <div className="bg-gray-900/50 rounded p-2 border border-gray-700">
                  <div className="text-gray-500 mb-1">Components</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-purple-400">{bom.components.length}</span>
                    <span className="text-gray-400">items</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Status Indicators & Actions */}
          <div className="flex flex-col gap-2 items-end">
            {/* Status Badges - Role-aware display */}
            <div className="flex flex-wrap gap-2 justify-end">
              {/* NPK Ratio - Admin only (technical) */}
              {isAdmin && npkRatio && (
                <div className="px-2 py-1 rounded text-xs font-mono bg-green-900/30 text-green-300 border border-green-700">
                  <BeakerIcon className="w-3 h-3 inline mr-1" />
                  {npkRatio}
                </div>
              )}

              {/* Artwork Status - Both roles, simplified text for managers */}
              <div className={`px-2 py-1 rounded text-xs font-medium border ${
                artworkStatus.color === 'green' ? 'bg-green-900/30 text-green-300 border-green-700' :
                artworkStatus.color === 'yellow' ? 'bg-yellow-900/30 text-yellow-300 border-yellow-700' :
                artworkStatus.color === 'orange' ? 'bg-orange-900/30 text-orange-300 border-orange-700' :
                'bg-gray-700 text-gray-300 border-gray-600'
              }`}>
                <DocumentTextIcon className="w-3 h-3 inline mr-1" />
                {isManager ? artworkStatus.label : (labelCount > 0 ? `${verifiedLabels}/${labelCount} Labels` : artworkStatus.label)}
              </div>

              {/* Compliance Status - Both roles, emphasis for managers */}
              <div className={`px-2 py-1 rounded text-xs font-medium border ${
                complianceStatus.color === 'green' ? 'bg-green-900/30 text-green-300 border-green-700' :
                complianceStatus.color === 'orange' ? 'bg-orange-900/30 text-orange-300 border-orange-700' :
                complianceStatus.color === 'red' ? 'bg-red-900/30 text-red-300 border-red-700' :
                'bg-gray-700 text-gray-300 border-gray-600'
              }`}>
                {complianceStatus.color === 'green' && <CheckCircleIcon className="w-3 h-3 inline mr-1" />}
                {complianceStatus.color === 'orange' && <ExclamationCircleIcon className="w-3 h-3 inline mr-1" />}
                {complianceStatus.color === 'red' && <XCircleIcon className="w-3 h-3 inline mr-1" />}
                {isManager ? complianceStatus.label : (hasRegistrations ? `${bom.registrations?.length} Reg` : 'No Reg')}
              </div>
            </div>

            {/* Action Buttons - DATA MANAGEMENT FOCUS (no production triggers) */}
            <div className="flex gap-1">
              {/* View Details - Prominent for both roles */}
              <button
                onClick={onViewDetails}
                className={`flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded transition-colors ${isManager ? 'text-sm px-5' : ''}`}
                title="View all product details, labels, registrations, and data sheets"
              >
                <EyeIcon className={`${isManager ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
                {isManager && <span>Details</span>}
              </button>

              {/* Expand/Collapse - Both roles */}
              <button
                onClick={onToggleExpand}
                className="px-2 py-1.5 hover:bg-gray-700 rounded transition-colors"
                title={isExpanded ? 'Collapse components' : 'Expand components'}
              >
                <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* Edit - Admin only */}
              {isAdmin && canEdit && (
                <button
                  onClick={onEdit}
                  className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded transition-colors"
                  title="Edit BOM configuration"
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* SECONDARY INFO BAR - Simplified for managers, detailed for admins */}
        {isAdmin ? (
          <div className="mt-4 pt-3 border-t border-gray-700 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            {/* Packaging - Admin gets details */}
            <div>
              <div className="text-gray-500 mb-1 flex items-center gap-1">
                <PackageIcon className="w-3 h-3" />
                Packaging
              </div>
              <div className="text-gray-300">
                {bom.packaging?.bagType || 'Not specified'}
              </div>
              {totalMaterialWeight > 0 && (
                <div className="text-gray-500 text-xs mt-0.5">
                  {totalMaterialWeight} lbs material
                </div>
              )}
            </div>

            {/* Label Type */}
            <div>
              <div className="text-gray-500 mb-1">Label Type</div>
              <div className="text-gray-300">
                {bom.packaging?.labelType || 'Not specified'}
              </div>
            </div>

            {/* Description Preview */}
            <div className="col-span-2">
              <div className="text-gray-500 mb-1">Description</div>
              <div className="text-gray-300 text-xs line-clamp-2">
                {bom.description || 'No description provided'}
              </div>
            </div>
          </div>
        ) : (
          /* Manager View - Just description */
          bom.description && (
            <div className="mt-4 pt-3 border-t border-gray-700">
              <div className="text-gray-400 text-xs line-clamp-2">
                {bom.description}
              </div>
            </div>
          )
        )}

        {/* LIMITING COMPONENT WARNING */}
        {buildability.maxBuildable === 0 && buildability.limitingComponents.length > 0 && (
          <div className="mt-3 p-2 bg-red-900/20 border border-red-700 rounded text-xs">
            <div className="flex items-center gap-2">
              <ExclamationCircleIcon className="w-4 h-4 text-red-400 flex-shrink-0" />
              <div>
                <span className="text-red-400 font-medium">Cannot build - Limiting: </span>
                <span className="text-gray-300">
                  {buildability.limitingComponents.map(lc =>
                    `${lc.sku} (need ${lc.needed}, have ${lc.available})`
                  ).join(', ')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* EXPANDED VIEW: Component Details */}
      {isExpanded && (
        <div className="p-4 space-y-4 border-t border-gray-700 bg-gray-900/30">
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3 flex items-center gap-2">
              <BeakerIcon className="w-4 h-4" />
              Component Breakdown
            </h4>
            <div className="space-y-2">
              {bom.components.map(c => {
                const componentItem = inventoryMap.get(c.sku);
                const available = componentItem?.stock || 0;
                const needed = c.quantity || 1;
                const canBuild = Math.floor(available / needed);
                const isLimiting = buildability.limitingComponents.some(lc => lc.sku === c.sku);

                return (
                  <div
                    key={c.sku}
                    className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                      isLimiting
                        ? 'bg-red-900/20 border-2 border-red-700/50'
                        : 'bg-gray-800/50 border border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex-1">
                      {onNavigateToInventory ? (
                        <button
                          onClick={() => onNavigateToInventory(c.sku)}
                          className="font-semibold font-mono text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
                        >
                          {c.sku}
                        </button>
                      ) : (
                        <span className="font-semibold font-mono text-sm text-white">{c.sku}</span>
                      )}
                      <span className="text-gray-400 ml-2 text-sm">/ {c.name}</span>

                      <div className="flex items-center gap-3 mt-1 text-xs">
                        <span className={`font-semibold ${available >= needed ? 'text-green-400' : 'text-red-400'}`}>
                          Stock: {available}
                        </span>
                        <span className="text-gray-600">|</span>
                        <span className="text-gray-500">Need: {needed} {c.unit}</span>
                        <span className="text-gray-600">|</span>
                        <span className={`font-semibold ${canBuild > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          Can build: {canBuild}
                        </span>
                        {isLimiting && (
                          <>
                            <span className="text-gray-600">|</span>
                            <span className="px-2 py-0.5 rounded text-red-400 font-semibold bg-red-900/30 border border-red-700">
                              ⚠ LIMITING
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {componentItem && componentItem.reorderPoint && available < componentItem.reorderPoint && (
                      <div className="ml-4">
                        <span className="px-2 py-1 rounded text-xs bg-yellow-900/30 text-yellow-300 border border-yellow-700">
                          Below reorder
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Special Instructions if present */}
          {bom.packaging?.specialInstructions && (
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
              <h5 className="text-xs font-semibold text-blue-400 mb-1">Special Instructions</h5>
              <p className="text-xs text-gray-300 whitespace-pre-wrap">
                {bom.packaging.specialInstructions}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EnhancedBomCard;
