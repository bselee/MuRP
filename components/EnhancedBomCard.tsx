/**
 * Enhanced BOM Card Component
 *
 * Comprehensive, information-dense card for power users managing 30-100+ products
 * Shows all pertinent info at-a-glance: specs, packaging, compliance, artwork, production
 */

import React, { useState, useMemo } from 'react';
import { useTheme } from './ThemeProvider';
import { useGlobalSkuFilter } from '../hooks/useGlobalSkuFilter';
import type { BillOfMaterials, InventoryItem, Label, ComplianceRecord, ComponentSwapMap } from '../types';
import type { LimitingSKUOnOrder } from '../hooks/useLimitingSKUOnOrder';
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
import type { BuildabilityInfo } from './StrategicBomMetrics';

interface EnhancedBomCardProps {
  bom: BillOfMaterials;
  isExpanded: boolean;
  finishedStock: number;
  buildability: BuildabilityInfo;
  inventoryMap: Map<string, InventoryItem>;
  canEdit: boolean;
  userRole: 'Admin' | 'Manager' | 'User'; // Role-based display
  canApprove?: boolean;
  nestedBomLookup?: Map<string, BillOfMaterials>;
  labels?: Label[]; // Labels from relational table
  complianceRecords?: ComplianceRecord[]; // Compliance records from relational table
  componentSwapMap?: ComponentSwapMap;
  onToggleExpand: () => void;
  onViewDetails: () => void;
  onEdit: () => void;
  onApproveRevision?: () => void;
  onOpenNestedBom?: (bom: BillOfMaterials) => void;
  onNavigateToInventory?: (sku: string) => void;
  onQuickBuild?: () => void;
  onQuickOrder?: () => void;
  queueStatus?: Record<string, { status: string; poId: string | null }>;
  limitingSKUOnOrderData?: LimitingSKUOnOrder[];
  onNavigateToPurchaseOrders?: (poId?: string) => void;
}

const DARK_CARD_SHELL =
  'relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/80 to-slate-950 shadow-[0_25px_70px_rgba(2,6,23,0.65)] transition-all duration-300 hover:border-amber-500/40 hover:shadow-[0_30px_90px_rgba(251,191,36,0.25)]';
const LIGHT_CARD_SHELL =
  'relative overflow-hidden rounded-2xl border border-stone-300/30 bg-gradient-to-br from-white/95 via-stone-100/60 to-white/95 shadow-[0_30px_90px_rgba(15,23,42,0.25)] transition-all duration-300 hover:border-stone-400/50 hover:shadow-[0_32px_110px_rgba(120,113,108,0.3)]';
const DARK_CARD_OVERLAY =
  'pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),rgba(15,23,42,0))]';
const LIGHT_CARD_OVERLAY =
  'pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.6),rgba(253,244,223,0))]';
const DARK_HEADER_BACKGROUND =
  'p-2.5 bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-slate-900/70';
const LIGHT_HEADER_BACKGROUND =
  'p-2.5 bg-gradient-to-r from-amber-50/90 via-white/80 to-amber-50/90';
const DARK_HEADER_RIBBON =
  'pointer-events-none absolute inset-x-10 top-0 h-2 opacity-70 blur-2xl bg-white/20';
const LIGHT_HEADER_RIBBON =
  'pointer-events-none absolute inset-x-10 top-0 h-2 opacity-80 blur-2xl bg-amber-200/60';
const DARK_GLASS_TILE =
  'rounded-xl border border-white/10 bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-slate-950/80 backdrop-blur-lg shadow-[0_12px_30px_rgba(2,6,23,0.45)]';
const LIGHT_GLASS_TILE =
  'rounded-xl border border-stone-300/25 bg-gradient-to-br from-white/98 via-stone-100/50 to-white/92 backdrop-blur-lg shadow-[0_18px_40px_rgba(15,23,42,0.18)]';
const DARK_RECIPE_CARD =
  'rounded-lg border border-emerald-600/30 bg-gradient-to-br from-slate-900/90 via-emerald-950/40 to-slate-900/90 backdrop-blur-sm';
const LIGHT_RECIPE_CARD =
  'rounded-lg border border-emerald-600/20 bg-gradient-to-br from-white/95 via-emerald-50/40 to-white/95 backdrop-blur-sm';
const DARK_SECONDARY_PANEL =
  'mt-4 grid grid-cols-2 gap-4 rounded-2xl border border-white/5 bg-white/5 p-4 text-xs backdrop-blur md:grid-cols-4';
const LIGHT_SECONDARY_PANEL =
  'mt-4 grid grid-cols-2 gap-4 rounded-2xl border border-amber-900/10 bg-amber-50/80 p-4 text-xs text-slate-900 shadow-inner md:grid-cols-4';
const DARK_MANAGER_PANEL =
  'mt-4 rounded-2xl border border-white/5 bg-white/5 p-4 backdrop-blur';
const LIGHT_MANAGER_PANEL =
  'mt-4 rounded-2xl border border-amber-900/10 bg-amber-50/80 p-4 shadow-inner';
const DARK_EXPANDED_PANEL =
  'p-4 space-y-4 border-t border-white/5 bg-slate-950/70 backdrop-blur-lg';
const LIGHT_EXPANDED_PANEL =
  'p-4 space-y-4 border-t border-amber-900/15 bg-amber-50/80 backdrop-blur-lg';
const DARK_COMPONENT_ROW =
  'bg-gray-800/50 border border-gray-700 hover:border-gray-600';
const LIGHT_COMPONENT_ROW =
  'bg-white/94 border border-amber-900/20 hover:border-amber-700/40';
const DARK_QUEUE_BANNER =
  'text-xs text-emerald-200 bg-emerald-900/15 border border-emerald-600/40 rounded px-3 py-1';
const LIGHT_QUEUE_BANNER =
  'text-xs text-emerald-800 bg-emerald-100 border border-emerald-400/60 rounded px-3 py-1';
const DARK_INSIGHTS_PANEL =
  'absolute right-6 top-6 z-30 w-full max-w-xl rounded-2xl border border-white/10 bg-slate-950/95 p-5 shadow-[0_25px_60px_rgba(2,6,23,0.7)] backdrop-blur-xl';
const LIGHT_INSIGHTS_PANEL =
  'absolute right-6 top-6 z-30 w-full max-w-xl rounded-2xl border border-amber-900/10 bg-white/95 p-5 shadow-[0_35px_80px_rgba(15,23,42,0.2)]';

const EnhancedBomCard: React.FC<EnhancedBomCardProps> = ({
  bom,
  isExpanded,
  finishedStock,
  buildability,
  inventoryMap,
  canEdit,
  userRole,
  canApprove = false,
  nestedBomLookup,
  labels = [],
  complianceRecords = [],
  componentSwapMap = {},
  onToggleExpand,
  onViewDetails,
  onEdit,
  onApproveRevision,
  onOpenNestedBom,
  onNavigateToInventory,
  onQuickBuild,
  onQuickOrder,
  queueStatus = {},
  limitingSKUOnOrderData = [],
  onNavigateToPurchaseOrders
}) => {
  const { resolvedTheme } = useTheme();
  const { isExcluded: isSkuGloballyExcluded } = useGlobalSkuFilter();
  const isLightTheme = resolvedTheme === 'light';
  const themeSwap = (light: string, dark: string) => (isLightTheme ? light : dark);
  const glassTile = themeSwap(LIGHT_GLASS_TILE, DARK_GLASS_TILE);
  const recipeCard = themeSwap(LIGHT_RECIPE_CARD, DARK_RECIPE_CARD);
  const cardShellClass = themeSwap(LIGHT_CARD_SHELL, DARK_CARD_SHELL);
  const cardOverlayClass = themeSwap(LIGHT_CARD_OVERLAY, DARK_CARD_OVERLAY);
  const headerClass = themeSwap(LIGHT_HEADER_BACKGROUND, DARK_HEADER_BACKGROUND);
  const ribbonClass = themeSwap(LIGHT_HEADER_RIBBON, DARK_HEADER_RIBBON);
  const secondaryPanelClass = themeSwap(LIGHT_SECONDARY_PANEL, DARK_SECONDARY_PANEL);
  const managerPanelClass = themeSwap(LIGHT_MANAGER_PANEL, DARK_MANAGER_PANEL);
  const expandedPanelClass = themeSwap(LIGHT_EXPANDED_PANEL, DARK_EXPANDED_PANEL);
  const defaultComponentRowClass = themeSwap(LIGHT_COMPONENT_ROW, DARK_COMPONENT_ROW);
  const queueBannerClass = themeSwap(LIGHT_QUEUE_BANNER, DARK_QUEUE_BANNER);
  const componentToggleClass = themeSwap(
    'inline-flex items-center gap-1 rounded-full border border-emerald-600/40 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100',
    'inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/30 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-900/40'
  );
  const dividerClass = themeSwap('text-amber-900/30', 'text-gray-600');
  const bodyHeadingClass = themeSwap('text-sm font-medium text-gray-800 mb-3', 'text-sm font-medium text-gray-200 mb-3');
  const passiveBodyText = themeSwap('text-gray-700', 'text-gray-300');
  const reorderBadgeClass = themeSwap(
    'px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800 border border-yellow-300',
    'px-2 py-1 rounded text-xs bg-yellow-900/30 text-yellow-300 border border-yellow-700'
  );
  const blockingAlertClass = themeSwap(
    'mt-3 p-2 bg-red-50 border border-red-300 rounded text-xs',
    'mt-3 p-2 bg-red-900/20 border border-red-700 rounded text-xs'
  );
  const limitingAlertClass = themeSwap(
    'mt-3 p-2 bg-amber-50 border border-amber-300 rounded text-xs',
    'mt-3 p-2 bg-amber-900/20 border border-amber-600 rounded text-xs'
  );
  const blockingIconClass = themeSwap('w-4 h-4 text-red-500 flex-shrink-0', 'w-4 h-4 text-red-400 flex-shrink-0');
  const limitingIconClass = themeSwap('w-4 h-4 text-amber-600 flex-shrink-0', 'w-4 h-4 text-amber-200 flex-shrink-0');
  const blockingAccentText = themeSwap('text-red-600 font-medium', 'text-red-400 font-medium');
  const limitingAccentText = themeSwap('text-amber-600 font-medium', 'text-amber-200 font-medium');
  const limitingSummaryText = themeSwap('text-gray-700', 'text-gray-300');
  const emphasizedBodyText = themeSwap('text-gray-900', 'text-gray-200');
  const componentSkuLinkClass = themeSwap(
    'font-semibold font-mono text-sm text-accent-600 hover:text-accent-500 hover:underline transition-colors',
    'font-semibold font-mono text-sm text-accent-400 hover:text-accent-300 hover:underline transition-colors'
  );
  const componentSkuTextClass = themeSwap('font-semibold font-mono text-sm text-slate-900', 'font-semibold font-mono text-sm text-white');
  const instructionsPanelClass = themeSwap(
    'bg-blue-50 border border-blue-200 rounded-lg p-3',
    'bg-blue-900/20 border border-blue-700 rounded-lg p-3'
  );
  const instructionsHeadingClass = themeSwap('text-xs font-semibold text-blue-700 mb-1', 'text-xs font-semibold text-blue-400 mb-1');
  const instructionsBodyClass = themeSwap('text-xs text-gray-700', 'text-xs text-gray-300');
  const componentPreviewShellClass = isLightTheme
    ? 'absolute right-0 top-full mt-2 w-80 p-3 bg-white/95 border border-amber-900/20 text-slate-900 text-xs rounded-xl shadow-[0_20px_60px_rgba(15,23,42,0.25)] opacity-0 group-hover:opacity-100 transition-all z-50 pointer-events-none translate-y-1 group-hover:translate-y-0 duration-200'
    : 'absolute right-0 top-full mt-2 w-80 p-3 bg-slate-950 border border-slate-800 text-gray-200 text-xs rounded-xl shadow-[0_25px_70px_rgba(2,6,23,0.65)] opacity-0 group-hover:opacity-100 transition-all z-50 pointer-events-none translate-y-1 group-hover:translate-y-0 duration-200';
  const componentPreviewHeaderClass = themeSwap(
    'font-semibold text-amber-900 mb-2 border-b border-amber-200 pb-1',
    'font-semibold text-gray-100 mb-2 border-b border-gray-700 pb-1'
  );
  const componentPreviewRowClass = themeSwap(
    'grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg bg-amber-50/80 px-2 py-1 text-[11px] text-amber-900',
    'grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg bg-slate-900/60 px-2 py-1 text-[11px] text-gray-100'
  );
  const componentPreviewSkuClass = themeSwap('font-mono text-accent-600', 'font-mono text-accent-300');
  const componentPreviewQuantityClass = themeSwap('font-mono text-slate-900', 'font-mono text-gray-100');
  const swapPanelClass = themeSwap(
    'mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 text-emerald-900 shadow-[0_15px_35px_rgba(16,185,129,0.15)]',
    'mt-3 rounded-lg border border-emerald-500/40 bg-emerald-900/20 p-3 text-emerald-100 shadow-[0_20px_40px_rgba(16,185,129,0.25)]'
  );
  const swapChipClass = themeSwap(
    'rounded-lg border border-emerald-200 bg-white px-3 py-2 text-left text-sm text-emerald-900 transition hover:border-emerald-400 hover:bg-white/90',
    'rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-left text-sm text-emerald-100 transition hover:border-emerald-400/80 hover:bg-emerald-900/40'
  );
  const swapChipMetaClass = themeSwap('text-emerald-800/80', 'text-emerald-200/70');
  const amountPillClass = themeSwap(
    'inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900',
    'inline-flex items-center rounded-full border border-amber-600/50 bg-amber-900/30 px-2 py-0.5 text-[11px] font-semibold text-amber-100'
  );
  const financialPanelClass = themeSwap(
    'bg-white/95 text-slate-900 border border-amber-900/15 shadow-[0_25px_50px_rgba(15,23,42,0.12)]',
    'bg-slate-900/50 text-gray-100 border border-slate-800 shadow-[0_25px_60px_rgba(2,6,23,0.55)]'
  );
  const financialDividerClass = themeSwap('divide-amber-100', 'divide-gray-800');
  const financialHeaderClass = themeSwap('text-amber-900', 'text-gray-400');
  const financialTableHeaderClass = themeSwap('text-amber-900', 'text-gray-500');
  const financialTableRowClass = themeSwap('text-slate-700', 'text-gray-300');

  // Show ALL components in BOMs - don't filter out excluded SKUs
  // Excluded SKUs should be visible but flagged for replacement
  const filteredComponents = useMemo(() => {
    return bom.components || [];
  }, [bom.components]);

  // Track which components are globally excluded (need replacement)
  const excludedComponentSkus = useMemo(() => {
    const excluded = new Set<string>();
    (bom.components || []).forEach(component => {
      if (isSkuGloballyExcluded(component.sku)) {
        excluded.add(component.sku);
      }
    });
    return excluded;
  }, [bom.components, isSkuGloballyExcluded]);

  // Check if any component needs replacement
  const hasExcludedComponents = excludedComponentSkus.size > 0;

  // Track which components are inactive (not in active inventory)
  const inactiveComponentSkus = useMemo(() => {
    const inactive = new Set<string>();
    (bom.components || []).forEach(component => {
      // If component SKU is not found in inventory, it's inactive
      if (!inventoryMap.has(component.sku)) {
        inactive.add(component.sku);
      }
    });
    return inactive;
  }, [bom.components, inventoryMap]);

  // Check if any component is inactive
  const hasInactiveComponents = inactiveComponentSkus.size > 0;

  // Excluded component row styles
  const excludedComponentRowClass = themeSwap(
    'bg-amber-50 border-2 border-amber-400 border-dashed',
    'bg-amber-900/20 border-2 border-amber-600/50 border-dashed'
  );
  const excludedBadgeClass = themeSwap(
    'px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800 border border-amber-400 font-semibold',
    'px-2 py-0.5 rounded text-xs bg-amber-900/40 text-amber-300 border border-amber-600 font-semibold'
  );

  // Inactive component row styles (component SKU not in active inventory)
  const inactiveComponentRowClass = themeSwap(
    'bg-slate-100 border-2 border-slate-400 border-dashed opacity-75',
    'bg-slate-800/30 border-2 border-slate-600/50 border-dashed opacity-75'
  );
  const inactiveBadgeClass = themeSwap(
    'px-2 py-0.5 rounded text-xs bg-slate-200 text-slate-700 border border-slate-400 font-semibold',
    'px-2 py-0.5 rounded text-xs bg-slate-700/60 text-slate-300 border border-slate-500 font-semibold'
  );

  // Determine display mode
  const isAdmin = userRole === 'Admin';
  const isManager = userRole === 'Manager';
  const finishedItem = inventoryMap.get(bom.finishedSku);
  const limitingSummary = buildability.limitingComponents
    .map(lc => `${lc.sku} (need ${lc.needed}, have ${lc.available})`)
    .join(', ');
  const limitingHighlight = buildability.maxBuildable === 0
    ? {
        row: themeSwap('bg-red-50 border-2 border-red-300', 'bg-red-900/20 border-2 border-red-700/50'),
        badge: themeSwap('text-red-800 bg-red-100 border border-red-300', 'text-red-300 bg-red-900/40 border border-red-700'),
        label: 'BLOCKING'
      }
    : {
        row: themeSwap('bg-amber-50 border-2 border-amber-300', 'bg-amber-900/20 border-2 border-amber-500/60'),
        badge: themeSwap('text-amber-800 bg-amber-100 border border-amber-300', 'text-amber-200 bg-amber-900/40 border border-amber-500'),
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
  const totalMaterialWeight = filteredComponents.reduce((sum, c) => {
    if (c.unit === 'lbs' || c.unit === 'lb') {
      return sum + (c.quantity || 0);
    }
    return sum;
  }, 0);
  const dataSourceLabel = (() => {
    switch (bom.dataSource) {
      case 'csv':
        return 'Finale CSV';
      case 'api':
        return 'API';
      case 'manual':
        return 'Manual';
      default:
        return 'Manual';
    }
  })();
  const queuedCount = queueStatus ? Object.keys(queueStatus).length : 0;
  const hasPoDraft = queueStatus ? Object.values(queueStatus).some(entry => entry.status === 'po_created') : false;
  const velocityPerDay = typeof finishedItem?.salesVelocity === 'number' ? finishedItem.salesVelocity : null;
  const sales30Days = typeof finishedItem?.sales30Days === 'number' ? finishedItem.sales30Days : 
    typeof finishedItem?.sales_30_days === 'number' ? finishedItem.sales_30_days : null;
  const avg30PerDay = sales30Days != null ? sales30Days / 30 : null;
  const avg60PerDay = typeof finishedItem?.sales60Days === 'number' ? finishedItem.sales60Days / 60 : 
    typeof finishedItem?.sales_60_days === 'number' ? finishedItem.sales_60_days / 60 : null;
  const avg90PerDay = typeof finishedItem?.sales90Days === 'number' ? finishedItem.sales90Days / 90 : 
    typeof finishedItem?.sales_90_days === 'number' ? finishedItem.sales_90_days / 90 : null;
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
  const runwayBadge = (() => {
    if (isLightTheme) {
      switch (runwayStatus) {
        case 'critical':
          return 'bg-rose-100 text-rose-800 border border-rose-300';
        case 'risk':
          return 'bg-amber-100 text-amber-800 border border-amber-300';
        case 'watch':
          return 'bg-yellow-100 text-yellow-800 border border-yellow-300';
        case 'healthy':
          return 'bg-emerald-100 text-emerald-800 border border-emerald-300';
        default:
          return 'bg-gray-100 text-gray-700 border border-gray-300';
      }
    }
    switch (runwayStatus) {
      case 'critical':
        return 'bg-rose-900/40 text-rose-200 border border-rose-700';
      case 'risk':
        return 'bg-amber-900/40 text-amber-200 border border-amber-600';
      case 'watch':
        return 'bg-yellow-900/30 text-yellow-200 border border-yellow-700';
      case 'healthy':
        return 'bg-emerald-900/30 text-emerald-200 border border-emerald-700';
      default:
        return 'bg-gray-800 text-gray-300 border border-gray-600';
    }
  })();
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
  const criticalPathComponent = filteredComponents.reduce<{
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
  const metricGridClass = 'grid-cols-3'; // Always 3 columns for compact buildability tabs

  const [activeTab, setActiveTab] = useState<'components' | 'financials'>('components');
  const getSwapRuleForSku = (sku: string) => {
    if (!sku) return undefined;
    const normalized = sku.trim();
    if (!normalized) return undefined;
    return (
      componentSwapMap[normalized] ||
      componentSwapMap[normalized.toUpperCase()] ||
      componentSwapMap[normalized.toLowerCase()]
    );
  };
  const hasSwapHints = filteredComponents?.some(component => Boolean(getSwapRuleForSku(component.sku)));

  // Calculate financial metrics if available
  const totalMaterialCost = filteredComponents.reduce((sum, c) => {
    const cost = c.unitCost || 0;
    return sum + (cost * c.quantity);
  }, 0);
  
  const laborCost = (bom.buildTimeMinutes || 0) / 60 * (bom.laborCostPerHour || 0);
  const totalCost = totalMaterialCost + laborCost;

  return (
    <div 
      className={`${cardShellClass} cursor-pointer`}
      onClick={(e) => {
        // Don't trigger if clicking buttons or interactive elements
        if ((e.target as HTMLElement).closest('button, a, input')) return;
        onViewDetails();
      }}
    >
      <div className={cardOverlayClass} />
      <div className={ribbonClass} />
      <div className="relative">
      {/* MAIN CARD HEADER */}
      <div className={headerClass}>
        <div className="flex items-center justify-between gap-4">
      {/* LEFT: Product Identity */}
      <div className="flex-1 min-w-0">
        {/* SKU, Name, Description - All in one line */}
        <div className="flex items-start gap-3 mb-3">
          {/* Product Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap md:flex-nowrap items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (canEdit) {
                    onEdit();
                  } else {
                    onToggleExpand();
                  }
                }}
                className={`font-extrabold font-mono transition-colors cursor-pointer hover:opacity-80 ${isLightTheme ? 'text-black hover:text-black' : 'text-white hover:text-white'}`}
                style={{ fontSize: '1.3rem', letterSpacing: '0.02em' }}
                title={canEdit ? 'Edit this BOM' : isExpanded ? 'Hide recipe ingredients' : 'Show recipe ingredients'}
              >
                {bom.finishedSku}
              </button>
              <h4 className={`${bodyHeadingClass} !mb-0 whitespace-nowrap text-sm`}>{bom.name}</h4>

              {bom.category && (
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-700 text-gray-300 border border-gray-600 whitespace-nowrap">
                  {bom.category}
                </span>
              )}

              {/* Warning badge when BOM has excluded components */}
              {hasExcludedComponents && (
                <span className={`px-1.5 py-0.5 text-[10px] rounded font-semibold whitespace-nowrap flex items-center gap-1 ${
                  themeSwap(
                    'bg-amber-100 text-amber-800 border border-amber-400',
                    'bg-amber-900/40 text-amber-300 border border-amber-600'
                  )
                }`} title={`${excludedComponentSkus.size} component(s) need replacement`}>
                  <ExclamationTriangleIcon className="w-3 h-3" />
                  {excludedComponentSkus.size} NEEDS REPLACE
                </span>
              )}

              {bom.description && (
                <span className={`${passiveBodyText} text-xs flex-1 min-w-0 truncate border-l border-gray-700/30 pl-2 hidden md:block`}>
                  {bom.description}
                </span>
              )}
            </div>
            {/* Artwork filename if available */}
            {labels.length > 0 && labels[0].fileName && (
              <div className={`text-[10px] mt-0.5 ${themeSwap('text-gray-600', 'text-gray-500')} truncate`}>
                {labels[0].fileName}
              </div>
            )}
          </div>
        </div>

        {/* KEY METRICS ROW with Artwork aligned */}
        <div className="flex items-start gap-3">
          {/* Artwork aligned with metrics */}
          <div className={`flex-shrink-0 w-20 h-20 rounded-lg border-2 overflow-hidden ${
            labels.length > 0 
              ? themeSwap('border-emerald-400/40', 'border-emerald-500/40')
              : themeSwap('border-gray-300', 'border-gray-700')
          }`}>
            {labels.length > 0 && labels[0].url ? (
              <div className="relative w-full h-full group">
                <img 
                  src={labels[0].url} 
                  alt={`${bom.finishedSku} label`}
                  className="w-full h-full object-cover"
                />
                <div className={`absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center`}>
                  <span className="text-white text-[8px] text-center px-1">{labels[0].fileName}</span>
                </div>
              </div>
            ) : (
              <div className={`w-full h-full flex flex-col items-center justify-center ${
                themeSwap('bg-gray-100', 'bg-gray-800/50')
              }`}>
                <DocumentTextIcon className={`w-6 h-6 ${themeSwap('text-gray-400', 'text-gray-600')}`} />
                <span className={`text-[8px] mt-1 ${themeSwap('text-gray-500', 'text-gray-600')}`}>No artwork</span>
              </div>
            )}
          </div>

          {/* Buildability metrics */}
          <div className={`grid gap-2 text-xs ${metricGridClass} flex-1`}>
            {/* Inventory Status with Progress Bar - Both roles */}
            <div className={`${glassTile} ${isExpanded ? 'p-3' : 'p-2'}`}>
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

            {/* Velocity & Trend - Show when collapsed */}
            <div className={`${glassTile} ${isExpanded ? 'p-3' : 'p-2'}`}>
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
          </div>
        </div>

        {/* Status Indicators & Actions - Moved below metrics */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {isAdmin && npkRatio && (
            <div className="px-2 py-1 rounded text-xs font-mono bg-green-900/30 text-green-300 border border-green-700">
              <BeakerIcon className="w-3 h-3 inline mr-1" />
              {npkRatio}
            </div>
          )}

          <div className={`px-2 py-1 rounded text-xs font-medium border ${
            artworkStatus.color === 'green' ? 'bg-green-900/30 text-green-300 border-green-700' :
            artworkStatus.color === 'yellow' ? 'bg-yellow-900/30 text-yellow-300 border-yellow-700' :
            artworkStatus.color === 'orange' ? 'bg-orange-900/30 text-orange-300 border-orange-700' :
            'bg-gray-700 text-gray-300 border-gray-600'
          }`}>
            <DocumentTextIcon className="w-3 h-3 inline mr-1" />
            {isManager ? artworkStatus.label : (labelCount > 0 ? `${verifiedLabels}/${labelCount} Labels` : artworkStatus.label)}
          </div>

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

          <button
            onClick={onViewDetails}
            className={`flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-md transition-colors shadow-sm ${isManager ? 'text-sm px-5' : ''}`}
            title="View all product details, labels, registrations, and data sheets"
          >
            <EyeIcon className={`${isManager ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
            {isManager && <span>Details</span>}
          </button>

          {onQuickBuild && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onQuickBuild();
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-md transition-colors shadow-sm"
              title="Schedule this BOM on the production calendar"
            >
              <ClockIcon className="w-3.5 h-3.5" />
              <span>Schedule</span>
            </button>
          )}

          {isAdmin && canEdit && (
            <button
              onClick={onEdit}
              className="flex items-center gap-1 px-3 py-1.5 bg-accent-500 hover:bg-accent-600 text-white text-xs font-bold rounded-md transition-colors shadow-sm"
              title="Edit BOM configuration"
            >
              <PencilIcon className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
          )}

          {/* Expand/Collapse Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-md transition-colors shadow-sm"
            title={isExpanded ? 'Hide recipe ingredients' : 'Show recipe ingredients'}
          >
            <BeakerIcon className="w-3.5 h-3.5" />
            {hasSwapHints && <SparklesIcon className="w-3 h-3" title="Swap suggestions available" />}
            <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {queuedCount > 0 && (
        <div className={queueBannerClass}>
          {queuedCount} component{queuedCount > 1 ? 's' : ''} in PO queue &middot;{' '}
          {hasPoDraft ? 'PO drafting' : 'Awaiting PO creation'}
        </div>
      )}
	    </div>
        {/* SECONDARY INFO BAR - Only show when expanded */}
        {isExpanded && (isAdmin ? (
          <div className={secondaryPanelClass}>
            {/* Packaging - Admin gets details */}
            <div>
              <div className="text-gray-500 mb-1 flex items-center gap-1">
                <PackageIcon className="w-3 h-3" />
                Packaging
              </div>
              <div className={passiveBodyText}>
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
              <div className={passiveBodyText}>
                {bom.packaging?.labelType || 'Not specified'}
              </div>
            </div>

            <div>
              <div className="text-gray-500 mb-1">Yield / Batch</div>
              <div className={passiveBodyText}>
                {bom.yieldQuantity || 1} units
              </div>
            </div>

            <div>
              <div className="text-gray-500 mb-1">Data Source</div>
              <div className={passiveBodyText}>
                {dataSourceLabel}
              </div>
            </div>
          </div>
        ) : (
          <div className={managerPanelClass}>
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <PackageIcon className="w-3 h-3" />
                {bom.packaging?.bagType || 'No packaging set'}
              </span>
              <span className="flex items-center gap-1">
                <DocumentTextIcon className="w-3 h-3" />
                {bom.packaging?.labelType || 'Label TBD'}
              </span>
            </div>
          </div>
        ))}

        {/* LIMITING COMPONENT WARNING */}
        {buildability.maxBuildable === 0 && buildability.limitingComponents.length > 0 && (
          <div className={blockingAlertClass}>
            <div className="flex items-center gap-2">
              <ExclamationCircleIcon className={blockingIconClass} />
              <div>
                <span className={blockingAccentText}>Cannot build - Limiting: </span>
                <span className={limitingSummaryText}>{limitingSummary}</span>
              </div>
            </div>
          </div>
        )}

        {buildability.maxBuildable > 0 && buildability.limitingComponents.length > 0 && (
          <>
            <div className={limitingAlertClass}>
              <div className="flex items-center gap-2">
                <ExclamationTriangleIcon className={limitingIconClass} />
                <div>
                  <span className={limitingAccentText}>
                    Limited to {buildability.maxBuildable} build{buildability.maxBuildable !== 1 ? 's' : ''}
                  </span>
                  <span className={limitingSummaryText}> — constrained by {limitingSummary}</span>
                </div>
              </div>
            </div>

            {/* Limiting SKU On-Order Status */}
            {limitingSKUOnOrderData && limitingSKUOnOrderData.length > 0 && (
              <div className={`mt-3 space-y-2 p-3 rounded-lg border ${
                isLightTheme
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-blue-900/20 border-blue-600/30'
              }`}>
                <div className={`text-xs font-semibold flex items-center gap-2 ${
                  isLightTheme ? 'text-blue-700' : 'text-blue-300'
                }`}>
                  <ClockIcon className="w-4 h-4" />
                  Limited SKUs On Order
                </div>
                {limitingSKUOnOrderData.map((onOrderInfo) => (
                  <button
                    key={onOrderInfo.sku}
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToPurchaseOrders?.(onOrderInfo.poId);
                    }}
                    className={`block w-full text-left p-2 rounded-md transition-all hover:opacity-80 ${
                      isLightTheme
                        ? 'bg-white/60 text-blue-800 border border-blue-200 hover:bg-white'
                        : 'bg-slate-900/40 text-blue-200 border border-blue-500/30 hover:bg-slate-900/60'
                    }`}
                    title={`Click to view PO ${onOrderInfo.orderId}`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold">{onOrderInfo.sku}</span>
                      <span className={`font-semibold ${
                        isLightTheme ? 'text-blue-700' : 'text-blue-300'
                      }`}>
                        ETA: {onOrderInfo.estimatedReceiveDate 
                          ? new Date(onOrderInfo.estimatedReceiveDate).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
                          : 'TBD'}
                      </span>
                    </div>
                    <div className={`text-[11px] mt-1 ${isLightTheme ? 'text-blue-700/70' : 'text-blue-300/70'}`}>
                      {onOrderInfo.supplier} • {onOrderInfo.quantity} units • PO #{onOrderInfo.orderId}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* EXPANDED VIEW: Component Details & Financials */}
      {isExpanded && (
        <div className={expandedPanelClass}>
          {/* Tabs */}
          <div className="flex items-center gap-4 border-b border-gray-700/50 mb-4">
            <button
              onClick={() => setActiveTab('components')}
              className={`pb-2 text-xs font-semibold uppercase transition-colors ${
                activeTab === 'components'
                  ? 'text-accent-400 border-b-2 border-accent-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <BeakerIcon className="w-4 h-4" />
                Components ({filteredComponents?.length || 0})
              </div>
            </button>
            
            {(isAdmin || isManager) && (
              <button
                onClick={() => setActiveTab('financials')}
                className={`pb-2 text-xs font-semibold uppercase transition-colors ${
                  activeTab === 'financials'
                    ? 'text-emerald-400 border-b-2 border-emerald-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none">$</span>
                  Financials
                </div>
              </button>
            )}
          </div>

          {activeTab === 'components' ? (
            <div>
              {/* Recipe Header */}
              <div className={`${recipeCard} p-4 mb-4`}>
                <div className="flex items-center gap-2 mb-2">
                  <BeakerIcon className={themeSwap('w-5 h-5 text-emerald-700', 'w-5 h-5 text-emerald-400')} />
                  <h5 className={themeSwap('text-sm font-bold text-emerald-800 uppercase tracking-wide', 'text-sm font-bold text-emerald-300 uppercase tracking-wide')}>Recipe / Ingredients</h5>
                </div>
                <p className={themeSwap('text-xs text-gray-700', 'text-xs text-gray-400')}>
                  {filteredComponents.length} ingredients • {bom.yieldQuantity || 1} unit yield per batch
                </p>
              </div>

              {/* Ingredient List */}
              <div className="space-y-3">
                {filteredComponents.map((c, idx) => {
                  const componentItem = inventoryMap.get(c.sku);
                  const available = componentItem?.stock || 0;
                  const needed = c.quantity || 1;
                  const canBuild = Math.floor(available / needed);
                  const isLimiting = buildability.limitingComponents.some(lc => lc.sku === c.sku);
                  const isOutOfStock = available === 0;
                  const hasSubstitutes = c.substitutes && c.substitutes.length > 0;
                  const nestedBom = nestedBomLookup?.get(c.sku);
                  const nestedTooltipLines = nestedBom?.components?.map((component) => {
                    const amount = component.quantity !== undefined ? `${component.quantity}${component.unit ? ` ${component.unit}` : ''}` : '';
                    return `${component.sku} — ${component.name ?? 'Unnamed'}${amount ? ` — ${amount}` : ''}`;
                  }) ?? [];
                  const nestedTooltipText = nestedTooltipLines.join('\n');

                  // Check if this component is globally excluded (needs replacement)
                  const isGloballyExcluded = excludedComponentSkus.has(c.sku);

                  // Check if this component is inactive (not in active inventory)
                  const isInactiveComponent = inactiveComponentSkus.has(c.sku);

                  const rowClass = isGloballyExcluded
                    ? excludedComponentRowClass
                    : isInactiveComponent
                      ? inactiveComponentRowClass
                      : isLimiting
                        ? limitingHighlight.row
                        : themeSwap(
                            'bg-white/80 border border-emerald-600/10 hover:border-emerald-600/30 hover:bg-emerald-50/50',
                            'bg-slate-900/50 border border-emerald-500/10 hover:border-emerald-500/30 hover:bg-emerald-950/20'
                          );

                  return (
                    <div
                      key={c.sku}
                      className={`rounded-lg transition-all ${rowClass}`}
                    >
                      {/* Main Ingredient Row */}
                      <div className="flex items-start justify-between p-3">
                        <div className="flex items-start gap-3 flex-1">
                          {/* Step Number */}
                          <div className={isGloballyExcluded
                            ? themeSwap(
                                'flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 border border-amber-400 flex items-center justify-center text-xs font-bold text-amber-800',
                                'flex-shrink-0 w-7 h-7 rounded-full bg-amber-950/50 border border-amber-600/40 flex items-center justify-center text-xs font-bold text-amber-300'
                              )
                            : isInactiveComponent
                              ? themeSwap(
                                  'flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 border border-slate-400 flex items-center justify-center text-xs font-bold text-slate-600',
                                  'flex-shrink-0 w-7 h-7 rounded-full bg-slate-700/50 border border-slate-600/40 flex items-center justify-center text-xs font-bold text-slate-400'
                                )
                              : themeSwap(
                                  'flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-xs font-bold text-emerald-800',
                                  'flex-shrink-0 w-7 h-7 rounded-full bg-emerald-950/50 border border-emerald-600/40 flex items-center justify-center text-xs font-bold text-emerald-300'
                                )
                          }>
                            {idx + 1}
                          </div>

                          {/* Ingredient Details */}
                          <div className="flex-1 min-w-0">
                            {/* SKU + Description + Name */}
                            <div className="flex items-baseline gap-2 flex-wrap">
                              {/* Excluded badge */}
                              {isGloballyExcluded && (
                                <span className={excludedBadgeClass} title="This SKU is globally excluded and needs replacement">
                                  REPLACE
                                </span>
                              )}
                              {/* Inactive badge - component not in active inventory */}
                              {isInactiveComponent && !isGloballyExcluded && (
                                <span className={inactiveBadgeClass} title="This SKU is not in active inventory">
                                  INACTIVE
                                </span>
                              )}
                              {onNavigateToInventory ? (
                                <Button
                                  onClick={() => onNavigateToInventory(c.sku)}
                                  className={`${(isGloballyExcluded || isInactiveComponent) ? 'line-through opacity-70 ' : ''}${themeSwap(
                                    'font-bold font-mono text-sm text-emerald-700 hover:text-emerald-600 underline decoration-dotted',
                                    'font-bold font-mono text-sm text-emerald-400 hover:text-emerald-300 underline decoration-dotted'
                                  )}`}
                                >
                                  {c.sku}
                                </Button>
                              ) : (
                                <span className={`${(isGloballyExcluded || isInactiveComponent) ? 'line-through opacity-70 ' : ''}${themeSwap('font-bold font-mono text-sm text-emerald-800', 'font-bold font-mono text-sm text-emerald-300')}`}>{c.sku}</span>
                              )}
                              {componentItem?.description && (
                                <span className={themeSwap('text-xs text-gray-600 italic', 'text-xs text-gray-400 italic')}>
                                  {componentItem.description}
                                </span>
                              )}
                              <span className={themeSwap('text-sm text-gray-800', 'text-sm text-gray-200')}>— {c.name}</span>
                              {nestedBom && (
                                <div className="relative group flex-shrink-0">
                                  <Button
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onOpenNestedBom?.(nestedBom);
                                    }}
                                    className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full text-[10px] font-semibold hover:bg-blue-500/30 transition-colors"
                                    title={nestedTooltipText || `View BOM ${nestedBom.finishedSku}`}
                                  >
                                    BOM
                                  </Button>
                                  {nestedTooltipLines.length > 0 && (
                                    <div className="hidden group-hover:block absolute left-0 top-full mt-2 w-64 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl z-40 p-3 text-left">
                                      <p className="text-xs text-gray-400 mb-1">Ingredients</p>
                                      <ul className="space-y-1 max-h-48 overflow-auto pr-1">
                                        {nestedTooltipLines.map((line, lineIdx) => (
                                          <li key={`${nestedBom.id}-line-${lineIdx}`} className="text-[11px] text-gray-100 font-mono">
                                            {line}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Amount (Recipe Style) */}
                            <div className={themeSwap('mt-1 text-base font-semibold text-gray-900', 'mt-1 text-base font-semibold text-white')}>
                              {needed} {c.unit}
                            </div>

                            {/* Stock Status */}
                            <div className="flex items-center gap-3 mt-2 text-xs">
                              <span className={`font-semibold ${available >= needed ? themeSwap('text-emerald-700', 'text-emerald-400') : themeSwap('text-rose-700', 'text-rose-400')}`}>
                                {available >= needed ? 'OK' : 'LOW'} Stock: {available} {c.unit}
                              </span>
                              {isLimiting && (
                                <>
                                  <span className={dividerClass}>•</span>
                                  <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${limitingHighlight.badge}`}>
                                    {limitingHighlight.label}
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Velocity / Usage Data */}
                            {componentItem && (componentItem.salesVelocity || componentItem.sales30Days) && (
                              <div className="flex items-center gap-3 mt-1 text-[11px]">
                                {componentItem.salesVelocity && componentItem.salesVelocity > 0 && (
                                  <span className={themeSwap('text-sky-700', 'text-sky-400')}>
                                    <TrendingUpIcon className="w-3 h-3 inline mr-1" />
                                    {componentItem.salesVelocity.toFixed(1)}/day velocity
                                  </span>
                                )}
                                {componentItem.sales30Days && componentItem.sales30Days > 0 && (
                                  <>
                                    {componentItem.salesVelocity && <span className={dividerClass}>•</span>}
                                    <span className={themeSwap('text-gray-600', 'text-gray-400')}>
                                      {componentItem.sales30Days} sold (30d)
                                    </span>
                                  </>
                                )}
                                {/* Days of stock estimate */}
                                {componentItem.salesVelocity && componentItem.salesVelocity > 0 && available > 0 && (
                                  <>
                                    <span className={dividerClass}>•</span>
                                    <span className={`font-semibold ${
                                      (available / componentItem.salesVelocity) < 7 
                                        ? themeSwap('text-rose-700', 'text-rose-400')
                                        : (available / componentItem.salesVelocity) < 14 
                                          ? themeSwap('text-amber-700', 'text-amber-400')
                                          : themeSwap('text-emerald-700', 'text-emerald-400')
                                    }`}>
                                      ~{Math.round(available / componentItem.salesVelocity)} days stock
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right Side Status */}
                        <div className="flex flex-col items-end gap-2 ml-4">
                          {isOutOfStock && hasSubstitutes && (
                            <span className={themeSwap(
                              'px-2 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300',
                              'px-2 py-1 rounded text-xs font-semibold bg-amber-900/30 text-amber-300 border border-amber-600'
                            )}>
                              Out of stock
                            </span>
                          )}
                          {componentItem && componentItem.reorderPoint && available < componentItem.reorderPoint && (
                            <span className={reorderBadgeClass}>
                              Below reorder
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Substitution Panel */}
                      {hasSubstitutes && (isOutOfStock || available < needed) && (
                        <div className={themeSwap(
                          'mx-3 mb-3 px-3 py-2 rounded-md bg-blue-50 border border-blue-200',
                          'mx-3 mb-3 px-3 py-2 rounded-md bg-blue-950/30 border border-blue-700/50'
                        )}>
                          <div className="flex items-start gap-2">
                            <SparklesIcon className={themeSwap('w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5', 'w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5')} />
                            <div className="flex-1">
                              <div className={themeSwap('text-xs font-semibold text-blue-800 mb-1', 'text-xs font-semibold text-blue-300 mb-1')}>
                                Suggested Substitutes:
                              </div>
                              <div className="space-y-1">
                                {c.substitutes!.map(sub => {
                                  const subItem = inventoryMap.get(sub.sku);
                                  const subStock = subItem?.stock || 0;
                                  return (
                                    <div key={sub.sku} className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        {onNavigateToInventory ? (
                                          <Button
                                            onClick={() => onNavigateToInventory(sub.sku)}
                                            className={themeSwap(
                                              'font-mono text-xs text-blue-700 hover:text-blue-600 underline',
                                              'font-mono text-xs text-blue-400 hover:text-blue-300 underline'
                                            )}
                                          >
                                            {sub.sku}
                                          </Button>
                                        ) : (
                                          <span className={themeSwap('font-mono text-xs text-blue-800', 'font-mono text-xs text-blue-300')}>{sub.sku}</span>
                                        )}
                                        <span className={themeSwap('text-xs text-gray-700', 'text-xs text-gray-300')}>— {sub.name}</span>
                                        {sub.reason && (
                                          <span className={themeSwap('text-xs italic text-gray-600', 'text-xs italic text-gray-500')}>({sub.reason})</span>
                                        )}
                                      </div>
                                      <span className={`text-xs font-semibold ${subStock > 0 ? themeSwap('text-emerald-700', 'text-emerald-400') : themeSwap('text-gray-500', 'text-gray-600')}`}>
                                        Stock: {subStock}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Special Instructions if present */}
              {bom.packaging?.specialInstructions && (
                <div className={`${instructionsPanelClass} mt-4`}>
                  <h5 className={instructionsHeadingClass}>Special Instructions</h5>
                  <p className={`${instructionsBodyClass} whitespace-pre-wrap`}>
                    {bom.packaging.specialInstructions}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Financial Breakdown */}
              <div className="space-y-4">
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                  <h5 className="text-gray-400 text-xs uppercase font-semibold mb-3">Cost Analysis</h5>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Material Cost</span>
                      <span className="text-gray-200 font-mono">${totalMaterialCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Labor Cost ({bom.buildTimeMinutes || 0}m @ ${bom.laborCostPerHour || 0}/hr)</span>
                      <span className="text-gray-200 font-mono">${laborCost.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-gray-700 my-2 pt-2 flex justify-between items-center font-bold">
                      <span className="text-gray-300">Total Cost</span>
                      <span className="text-emerald-400 font-mono">${totalCost.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                  <h5 className="text-gray-400 text-xs uppercase font-semibold mb-3">Unit Economics</h5>
                  <div className="space-y-2 text-sm">
                     <div className="flex justify-between items-center">
                      <span className="text-gray-400">Yield per Batch</span>
                      <span className="text-gray-200 font-mono">{bom.yieldQuantity || 1} units</span>
                    </div>
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-gray-300">Cost per Unit</span>
                      <span className="text-emerald-400 font-mono">
                        ${((totalCost) / (bom.yieldQuantity || 1)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Component Cost Table */}
              <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800 overflow-hidden">
                 <h5 className="text-gray-400 text-xs uppercase font-semibold mb-3">Material Cost Breakdown</h5>
                 <div className="overflow-y-auto max-h-64">
                   <table className="w-full text-xs text-left">
                     <thead className="text-gray-500 border-b border-gray-700">
                       <tr>
                         <th className="pb-2">Component</th>
                         <th className="pb-2 text-right">Qty</th>
                         <th className="pb-2 text-right">Unit Cost</th>
                         <th className="pb-2 text-right">Total</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-800">
                       {filteredComponents.map(c => (
                         <tr key={c.sku}>
                           <td className="py-2 text-gray-300">{c.name}</td>
                           <td className="py-2 text-right text-gray-400">{c.quantity} {c.unit}</td>
                           <td className="py-2 text-right text-gray-400">${(c.unitCost || 0).toFixed(2)}</td>
                           <td className="py-2 text-right text-gray-200 font-mono">${((c.unitCost || 0) * c.quantity).toFixed(2)}</td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  </div>
  );
};

export default EnhancedBomCard;
