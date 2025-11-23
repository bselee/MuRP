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
  ArrowDownTrayIcon,
  TrendingUpIcon,
  TrendingDownIcon
} from './icons';
import StrategicBomMetrics from './StrategicBomMetrics';

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

const glassTile =
  'rounded-xl border border-white/10 bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-slate-950/80 backdrop-blur-lg shadow-[0_12px_30px_rgba(2,6,23,0.45)]';

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
  const finishedItem = inventoryMap.get(bom.finishedSku);
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
  const velocityPerDay = typeof finishedItem?.salesVelocity === 'number' ? finishedItem.salesVelocity : null;
  const sales30Days = typeof finishedItem?.sales30Days === 'number' ? finishedItem.sales30Days : null;
  const avg30PerDay = sales30Days != null ? sales30Days / 30 : null;
  const avg60PerDay = typeof finishedItem?.sales60Days === 'number' ? finishedItem.sales60Days / 60 : null;
  const avg90PerDay = typeof finishedItem?.sales90Days === 'number' ? finishedItem.sales90Days / 90 : null;
  const currentVelocity = velocityPerDay ?? avg30PerDay ?? null;
  const trailingVelocity = avg60PerDay ?? avg90PerDay ?? null;
  const velocityTrendRaw = currentVelocity != null && trailingVelocity != null && trailingVelocity !== 0
    ? ((currentVelocity - trailingVelocity) / Math.abs(trailingVelocity)) * 100
    : null;
  const velocityTrendPct = velocityTrendRaw != null ? Number(velocityTrendRaw.toFixed(1)) : null;
  const velocityTrendDirection = velocityTrendPct != null && Math.abs(velocityTrendPct) >= 0.1
    ? (velocityTrendPct > 0 ? 'up' : 'down')
    : null;
  const velocityTrendLabel = velocityTrendPct != null
    ? `${velocityTrendPct > 0 ? '+' : ''}${velocityTrendPct.toFixed(1)}%`
    : null;
  const baselineLabel = avg60PerDay != null ? 'vs 60d' : avg90PerDay != null ? 'vs 90d' : '';
  const finishedOnOrder = finishedItem?.onOrder ?? 0;
  const safetyStock = finishedItem?.safetyStock ?? finishedItem?.reorderPoint ?? null;
  const runwayDays = currentVelocity && currentVelocity > 0 ? finishedStock / currentVelocity : null;
  const runwayWithInbound = currentVelocity && currentVelocity > 0 ? (finishedStock + finishedOnOrder) / currentVelocity : null;
  const runwayStatus = runwayDays == null
    ? 'unknown'
    : runwayDays <= 1
      ? 'critical'
      : runwayDays <= 7
        ? 'risk'
        : runwayDays <= 21
          ? 'watch'
          : 'healthy';
  const runwayBadge =
    runwayStatus === 'critical'
      ? 'bg-rose-900/40 text-rose-200 border border-rose-700'
      : runwayStatus === 'risk'
        ? 'bg-amber-900/40 text-amber-200 border border-amber-600'
        : runwayStatus === 'watch'
          ? 'bg-yellow-900/30 text-yellow-200 border border-yellow-700'
          : runwayStatus === 'healthy'
            ? 'bg-emerald-900/30 text-emerald-200 border border-emerald-700'
            : 'bg-gray-800 text-gray-300 border border-gray-600';
  const runwayLabel =
    runwayStatus === 'critical'
      ? 'Stockout now'
      : runwayStatus === 'risk'
        ? 'At risk <7d'
        : runwayStatus === 'watch'
          ? 'Watch window'
          : runwayStatus === 'healthy'
            ? 'Plenty of cover'
            : 'Need demand signal';
  const criticalPathComponent = bom.components.reduce<{
    sku: string;
    name: string;
    leadTime: number | null;
  } | null>((acc, component) => {
    const leadTime = inventoryMap.get(component.sku)?.leadTimeDays ?? null;
    if (leadTime == null) {
      return acc;
    }
    if (!acc || (leadTime ?? 0) > (acc.leadTime ?? 0)) {
      return { sku: component.sku, name: component.name, leadTime };
    }
    return acc;
  }, null);
  const metricGridClass = isManager
    ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6'
    : 'grid-cols-2 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/80 to-slate-950 shadow-[0_25px_70px_rgba(2,6,23,0.65)] transition-all duration-300 hover:border-amber-500/40 hover:shadow-[0_30px_90px_rgba(251,191,36,0.25)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),rgba(15,23,42,0))]" />
      <div className="pointer-events-none absolute inset-x-10 top-0 h-2 opacity-70 blur-2xl bg-white/20" />
      <div className="relative">
      {/* MAIN CARD HEADER */}
      <div className="p-4 bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-slate-900/70">
        <div className="flex items-start justify-between gap-4">
          {/* LEFT: Product Identity & Primary Metrics */}
          <div className="flex-1 min-w-0">
            {/* SKU and Category */}
            <div className="flex items-center gap-3 mb-2">
              <Button
                onClick={() => onNavigateToInventory?.(bom.finishedSku)}
                className="font-bold text-white font-mono hover:text-indigo-400 transition-colors cursor-pointer underline decoration-dotted decoration-gray-600 hover:decoration-indigo-400"
                style={{ fontSize: 'calc(1.125rem + 2pt)' }}
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
            <div className={`grid gap-3 text-xs ${metricGridClass}`}>
              {/* Inventory Status with Progress Bar - Both roles */}
              <div className={`${glassTile} p-3`}>
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
              <div className={`${glassTile} p-3`}>
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

              {/* Velocity & Trend */}
              <div className={`${glassTile} p-3`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500">Velocity</span>
                  {sales30Days != null && (
                    <span className="text-[10px] text-gray-600">
                      {sales30Days.toFixed(0)} sold / 30d
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className={`${isManager ? 'text-2xl' : 'text-xl'} font-bold ${currentVelocity && currentVelocity > 0 ? 'text-emerald-300' : 'text-gray-400'}`}>
                    {currentVelocity != null ? currentVelocity.toFixed(1) : '--'}
                  </span>
                  <span className="text-gray-400 text-xs">per day</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="text-gray-500">
                    30d avg:{' '}
                    <span className="font-semibold text-gray-300">
                      {avg30PerDay != null ? `${avg30PerDay.toFixed(1)}/day` : '--'}
                    </span>
                  </div>
                  {velocityTrendDirection && velocityTrendLabel && (
                    <div className={`flex items-center gap-1 font-semibold ${velocityTrendDirection === 'up' ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {velocityTrendDirection === 'up' ? (
                        <TrendingUpIcon className="w-3.5 h-3.5" />
                      ) : (
                        <TrendingDownIcon className="w-3.5 h-3.5" />
                      )}
                      <span>{velocityTrendLabel}</span>
                      {baselineLabel && <span className="text-[10px] font-normal opacity-70">{baselineLabel}</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Production Runway */}
              <div className={`${glassTile} p-3`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500">Runway</span>
                  {safetyStock != null && (
                    <span className="text-[10px] text-gray-600">
                      Safety {safetyStock}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className={`${isManager ? 'text-2xl' : 'text-xl'} font-bold ${runwayDays != null && runwayDays > 0 ? 'text-cyan-200' : 'text-rose-300'}`}>
                    {runwayDays != null ? runwayDays.toFixed(1) : '--'}
                  </span>
                  <span className="text-gray-400 text-xs">days</span>
                </div>
                <div className="text-xs text-gray-500 mb-2">
                  {runwayWithInbound != null
                    ? `With inbound: ${runwayWithInbound.toFixed(1)}d`
                    : 'No inbound POs'}
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded ${runwayBadge}`}>
                  <ClockIcon className="w-3 h-3" />
                  {runwayLabel}
                </span>
              </div>

              {/* Critical Path */}
              <div className={`${glassTile} p-3`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500">Critical Path</span>
                  {criticalPathComponent && (
                    <span className="text-[10px] text-gray-600">Lead time</span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className={`${isManager ? 'text-2xl' : 'text-xl'} font-bold ${criticalPathComponent ? 'text-sky-300' : 'text-gray-500'}`}>
                    {criticalPathComponent?.leadTime != null ? criticalPathComponent.leadTime : '--'}
                  </span>
                  {criticalPathComponent && <span className="text-gray-400 text-xs">days</span>}
                </div>
                <div className="text-xs text-gray-500">
                  {criticalPathComponent
                    ? `${criticalPathComponent.name} (${criticalPathComponent.sku})`
                    : 'Add lead times for components'}
                </div>
              </div>

              {/* Yield - Both roles */}
              <div className={`${glassTile} p-3`}>
              <div className="text-gray-500 mb-2">Yield</div>
              <div className="flex items-baseline gap-2">
                <span className={`${isManager ? 'text-2xl' : 'text-xl'} font-bold text-blue-400`}>{bom.yieldQuantity || 1}</span>
                <span className="text-gray-400 text-xs">{isManager ? '/batch' : 'per batch'}</span>
              </div>
            </div>

            {(buildHours || laborRate) && (
              <div className={`${glassTile} p-3`}>
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
              <div className={`${glassTile} p-3`}>
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
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-gray-300 transition-colors hover:bg-white/10"
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
          <div className="mt-4 grid grid-cols-2 gap-4 rounded-2xl border border-white/5 bg-white/5 p-4 text-xs backdrop-blur md:grid-cols-4">
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
            <div className="mt-4 rounded-2xl border border-white/5 bg-white/5 p-4 backdrop-blur">
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
        <div className="p-4 space-y-4 border-t border-white/5 bg-slate-950/70 backdrop-blur-lg">
          <StrategicBomMetrics
            bom={bom}
            finishedItem={finishedItem}
            buildability={buildability}
            inventoryMap={inventoryMap}
            labels={labels}
            complianceRecords={complianceRecords}
            queueStatus={queueStatus}
            onViewBreakdown={onViewDetails}
          />
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
  </div>
  );
};

export default EnhancedBomCard;
