import Button from '@/components/ui/Button';
/**
 * Enhanced BOM Card Component
 *
 * Comprehensive, information-dense card for power users managing 30-100+ products
 * Shows all pertinent info at-a-glance: specs, packaging, compliance, artwork, production
 */

import React from 'react';
import type { BillOfMaterials, InventoryItem, Label, ComplianceRecord } from '../types';
import {
  PencilIcon,
  ChevronDownIcon,
  EyeIcon,
  PackageIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
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
  labels?: Label[]; // Labels from relational table
  complianceRecords?: ComplianceRecord[]; // Compliance records from relational table
  onToggleExpand: () => void;
  onViewDetails: () => void;
  onEdit: () => void;
  onNavigateToInventory?: (sku: string) => void;
  onQuickBuild?: () => void;
  onQuickOrder?: () => void;
  queueStatus?: Record<string, { status: string; poId: string | null }>;
}

const EnhancedBomCard: React.FC<EnhancedBomCardProps> = ({
  bom,
  isExpanded,
  finishedStock,
  buildability,
  inventoryMap,
  canEdit,
  userRole,
  labels = [],
  complianceRecords = [],
  onToggleExpand,
  onViewDetails,
  onEdit,
  onNavigateToInventory,
  onQuickBuild,
  onQuickOrder,
  queueStatus = {}
}) => {
  // Determine display mode
  const isAdmin = userRole === 'Admin';
  const isManager = userRole === 'Manager';
  const limitingSummary = buildability.limitingComponents
    .map(lc => `${lc.sku} (need ${lc.needed}, have ${lc.available})`)
    .join(', ');
  const limitingHighlight = buildability.maxBuildable === 0
    ? {
        row: 'bg-red-900/20 border-2 border-red-700/50',
        badge: 'text-red-300 bg-red-900/40 border border-red-700',
        label: 'BLOCKING'
      }
    : {
        row: 'bg-amber-900/20 border-2 border-amber-500/60',
        badge: 'text-amber-200 bg-amber-900/40 border border-amber-500',
        label: 'LIMITING'
      };

  // Calculate metrics from relational data (labels table)
  const labelCount = labels.filter(l => l.fileType === 'label').length;
  const verifiedLabels = labels.filter(l => l.fileType === 'label' && l.verified).length;

  // Calculate compliance metrics from relational data (compliance_records table)
  const hasRegistrations = complianceRecords.length > 0;
  const expiredRegistrations = complianceRecords.filter(r =>
    r.expirationDate && new Date(r.expirationDate) < new Date()
  ).length;
  const urgentRegistrations = complianceRecords.filter(r => {
    if (!r.expirationDate) return false;
    const daysUntil = Math.floor((new Date(r.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysUntil > 0 && daysUntil <= 30;
  }).length;

  // Extract guaranteed analysis if available from labels
  const guaranteedAnalysis = labels
    .find(l => l.fileType === 'label' && l.extractedData?.guaranteedAnalysis)
    ?.extractedData?.guaranteedAnalysis;

  const npkRatio = guaranteedAnalysis
    ? `${guaranteedAnalysis.totalNitrogen || guaranteedAnalysis.nitrogen || 0}-${guaranteedAnalysis.availablePhosphate || guaranteedAnalysis.phosphate || 0}-${guaranteedAnalysis.soluablePotash || guaranteedAnalysis.potassium || 0}`
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
  const buildHours = bom.buildTimeMinutes ? bom.buildTimeMinutes / 60 : null;
  const laborRate = bom.laborCostPerHour ?? null;
  const estimatedLaborCost = buildHours && laborRate ? buildHours * laborRate : null;
  const queuedCount = queueStatus ? Object.keys(queueStatus).length : 0;
  const hasPoDraft = queueStatus ? Object.values(queueStatus).some(entry => entry.status === 'po_created') : false;

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 overflow-hidden transition-all hover:border-gray-600">
      {/* MAIN CARD HEADER */}
      <div className="p-4 bg-gradient-to-r from-gray-800 to-gray-800/80">
        <div className="flex items-start justify-between gap-4">
          {/* LEFT: Product Identity & Primary Metrics */}
          <div className="flex-1 min-w-0">
            {/* SKU and Category */}
            <div className="flex items-center gap-3 mb-2">
              <Button
                onClick={() => onNavigateToInventory?.(bom.finishedSku)}
                className="text-lg font-bold text-white font-mono hover:text-indigo-400 transition-colors cursor-pointer underline decoration-dotted decoration-gray-600 hover:decoration-indigo-400"
                title="View this product in Inventory"
              >
                {bom.finishedSku}
              </Button>
              {bom.category && (
                <span className="px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-300 border border-gray-600">
                  {bom.category}
                </span>
              )}
            </div>

            {/* Product Name */}
            <h4 className="text-sm font-medium text-gray-200 mb-3">{bom.name}</h4>

            {/* KEY METRICS ROW - Role-based display with Progress Bars */}
            <div className={`grid gap-3 text-xs ${isManager ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>
              {/* Inventory Status with Progress Bar - Both roles */}
              <div className="bg-gray-900/50 rounded p-3 border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-gray-500">Inventory</div>
                  {inventoryMap.get(bom.finishedSku)?.reorderPoint && (
                    <div className="text-xs text-gray-600">
                      Reorder: {inventoryMap.get(bom.finishedSku)?.reorderPoint}
                    </div>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`${isManager ? 'text-2xl' : 'text-xl'} font-bold ${finishedStock > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {finishedStock}
                  </span>
                  <span className="text-gray-400 text-xs">{isManager ? '' : 'units'}</span>
                </div>
                {/* Progress bar for inventory */}
                {inventoryMap.get(bom.finishedSku)?.reorderPoint && (
                  <div className="w-full bg-gray-800 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        finishedStock >= (inventoryMap.get(bom.finishedSku)?.reorderPoint || 0)
                          ? 'bg-green-500'
                          : 'bg-red-500'
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          (finishedStock / (inventoryMap.get(bom.finishedSku)?.reorderPoint || 1)) * 100
                        )}%`
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Buildability with Visual Indicator - Both roles */}
              <div className="bg-gray-900/50 rounded p-3 border border-gray-700">
                <div className="text-gray-500 mb-2">Can Build</div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`${isManager ? 'text-2xl' : 'text-xl'} font-bold ${buildability.maxBuildable > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {buildability.maxBuildable}
                  </span>
                  <span className="text-gray-400 text-xs">{isManager ? '' : 'units'}</span>
                </div>
                {/* Simple status indicator */}
                <div className="flex items-center gap-1">
                  <div className={`h-1.5 flex-1 rounded-full ${buildability.maxBuildable > 0 ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-xs text-gray-600">
                    {buildability.maxBuildable > 0 ? 'Ready' : 'Blocked'}
                  </span>
                </div>
              </div>

              {/* Yield - Both roles */}
              <div className="bg-gray-900/50 rounded p-3 border border-gray-700">
              <div className="text-gray-500 mb-2">Yield</div>
              <div className="flex items-baseline gap-2">
                <span className={`${isManager ? 'text-2xl' : 'text-xl'} font-bold text-blue-400`}>{bom.yieldQuantity || 1}</span>
                <span className="text-gray-400 text-xs">{isManager ? '/batch' : 'per batch'}</span>
              </div>
            </div>

            {(buildHours || laborRate) && (
              <div className="bg-gray-900/50 rounded p-3 border border-gray-700">
                <div className="text-gray-500 mb-2">Labor</div>
                <div className="text-gray-200 text-sm font-semibold">
                  {buildHours ? `${buildHours.toFixed(1)} hrs` : 'Add estimate'}
                </div>
                {laborRate && (
                  <p className="text-xs text-gray-500 mt-1">${laborRate.toFixed(2)}/hr</p>
                )}
                {estimatedLaborCost && (
                  <p className="text-xs text-gray-500">≈ ${estimatedLaborCost.toFixed(2)} per batch</p>
                )}
              </div>
            )}

            {/* Components - Admin only (technical detail) */}
            {isAdmin && (
              <div className="bg-gray-900/50 rounded p-3 border border-gray-700">
                <div className="text-gray-500 mb-2">Components</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-purple-400">{bom.components.length}</span>
                  <span className="text-gray-400 text-xs">items</span>
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
                {isManager ? complianceStatus.label : (hasRegistrations ? `${complianceRecords.length} Reg` : 'No Reg')}
              </div>
            </div>

            {/* Action Buttons - DATA MANAGEMENT FOCUS (no production triggers) */}
            <div className="flex gap-1 flex-wrap justify-end">
              {/* View Details - Prominent for both roles */}
              <Button
                onClick={onViewDetails}
                className={`flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded transition-colors ${isManager ? 'text-sm px-5' : ''}`}
                title="View all product details, labels, registrations, and data sheets"
              >
                <EyeIcon className={`${isManager ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
                {isManager && <span>Details</span>}
              </Button>

              {onQuickBuild && (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickBuild();
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded transition-colors"
                  title="Schedule this BOM on the production calendar"
                >
                  <ClockIcon className="w-3.5 h-3.5" />
                  <span>Schedule</span>
                </Button>
              )}

              {/* Expand/Collapse - Both roles */}
              <Button
                onClick={(e) => {
                  console.log('[EnhancedBomCard] EXPAND BUTTON CLICKED!', {
                    bomId: bom.id,
                    bomName: bom.name,
                    currentIsExpanded: isExpanded,
                    componentsCount: bom.components?.length || 0
                  });
                  onToggleExpand();
                }}
                className="px-2 py-1.5 hover:bg-gray-700 rounded transition-colors"
                title={isExpanded ? 'Collapse components' : 'Expand components'}
              >
                <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </Button>

              {/* Edit - Admin only */}
              {isAdmin && canEdit && (
                <Button
                  onClick={onEdit}
                  className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded transition-colors"
                  title="Edit BOM configuration"
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </Button>
              )}
            </div>

            {queuedCount > 0 && (
              <div className="text-xs text-emerald-200 bg-emerald-900/15 border border-emerald-600/40 rounded px-3 py-1">
                {queuedCount} component{queuedCount > 1 ? 's' : ''} in PO queue &middot;{' '}
                {hasPoDraft ? 'PO drafting' : 'Awaiting PO creation'}
              </div>
            )}
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
                <span className="text-gray-300">{limitingSummary}</span>
              </div>
            </div>
          </div>
        )}

        {buildability.maxBuildable > 0 && buildability.limitingComponents.length > 0 && (
          <div className="mt-3 p-2 bg-amber-900/20 border border-amber-600 rounded text-xs">
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className="w-4 h-4 text-amber-200 flex-shrink-0" />
              <div>
                <span className="text-amber-200 font-medium">
                  Limited to {buildability.maxBuildable} build{buildability.maxBuildable !== 1 ? 's' : ''}
                </span>
                <span className="text-gray-300"> — constrained by {limitingSummary}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* EXPANDED VIEW: Component Details */}
      {isExpanded && (
        <div className="p-4 space-y-4 border-t border-gray-700 bg-gray-900/30">
          {console.log('[EnhancedBomCard] EXPANDED VIEW IS RENDERING!', {
            bomName: bom.name,
            componentsCount: bom.components?.length || 0,
            inventoryMapSize: inventoryMap.size,
            firstComponent: bom.components?.[0]
          })}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3 flex items-center gap-2">
              <BeakerIcon className="w-4 h-4" />
              Component Breakdown ({bom.components?.length || 0} components)
            </h4>
            <div className="space-y-2">
              {bom.components.map(c => {
                const componentItem = inventoryMap.get(c.sku);
                const available = componentItem?.stock || 0;
                const needed = c.quantity || 1;
                const canBuild = Math.floor(available / needed);
                const isLimiting = buildability.limitingComponents.some(lc => lc.sku === c.sku);
                const rowClass = isLimiting
                  ? limitingHighlight.row
                  : 'bg-gray-800/50 border border-gray-700 hover:border-gray-600';

                return (
                  <div
                    key={c.sku}
                    className={`flex items-center justify-between p-3 rounded-lg transition-colors ${rowClass}`}
                  >
                    <div className="flex-1">
                      {onNavigateToInventory ? (
                        <Button
                          onClick={() => onNavigateToInventory(c.sku)}
                          className="font-semibold font-mono text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
                        >
                          {c.sku}
                        </Button>
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
                            <span className={`px-2 py-0.5 rounded font-semibold ${limitingHighlight.badge}`}>
                              ⚠ {limitingHighlight.label}
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
