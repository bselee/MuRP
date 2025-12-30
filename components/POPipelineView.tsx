/**
 * POPipelineView - Kanban-style visualization of Purchase Order lifecycle
 * Stages: Draft → Sent → Confirmed → In Transit → Completed
 */
import React, { useMemo, useState } from 'react';
import { useTheme } from './ThemeProvider';
import Button from './ui/Button';
import { PackageIcon, TruckIcon, CheckCircleIcon, ClockIcon, AlertTriangleIcon, ChevronRightIcon, MailIcon, MessageCircleIcon, ChevronDownIcon, ChevronUpIcon } from './icons';
import { VendorResponseIndicator } from './VendorResponseIndicator';
import { PendingFollowupsPanel } from './PendingFollowupsPanel';
import type { FinalePurchaseOrderRecord } from '../types';

export type POPipelineStage = 'draft' | 'sent' | 'confirmed' | 'in_transit' | 'completed';

interface POPipelineStageConfig {
  id: POPipelineStage;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}

interface StockoutRisk {
  sku: string;
  name: string;
  daysUntilStockout: number;
  currentStock: number;
  dailyUsage: number;
}

interface POPipelineViewProps {
  purchaseOrders: FinalePurchaseOrderRecord[];
  inventoryMap?: Map<string, { stock: number; salesVelocity: number; name: string }>;
  onPOClick?: (po: FinalePurchaseOrderRecord) => void;
  onStageClick?: (stage: POPipelineStage) => void;
  compact?: boolean; // For dashboard widget mode
  onSendFollowup?: (po: FinalePurchaseOrderRecord) => Promise<void>;
  onMarkResolved?: (po: FinalePurchaseOrderRecord) => Promise<void>;
  showPendingFollowups?: boolean; // Show collapsible pending followups panel
}

const STAGE_CONFIG: POPipelineStageConfig[] = [
  {
    id: 'draft',
    label: 'Draft',
    icon: <ClockIcon className="w-4 h-4" />,
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/20',
    borderColor: 'border-gray-500/30',
  },
  {
    id: 'sent',
    label: 'Sent',
    icon: <PackageIcon className="w-4 h-4" />,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/30',
  },
  {
    id: 'confirmed',
    label: 'Confirmed',
    icon: <CheckCircleIcon className="w-4 h-4" />,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    borderColor: 'border-amber-500/30',
  },
  {
    id: 'in_transit',
    label: 'In Transit',
    icon: <TruckIcon className="w-4 h-4" />,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    borderColor: 'border-purple-500/30',
  },
  {
    id: 'completed',
    label: 'Completed',
    icon: <CheckCircleIcon className="w-4 h-4" />,
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    borderColor: 'border-green-500/30',
  },
];

/**
 * Determine pipeline stage based on PO status and tracking info
 */
function getPOStage(po: FinalePurchaseOrderRecord): POPipelineStage {
  const status = (po.status || '').toUpperCase();

  // Completed states
  if (status === 'RECEIVED' || status === 'COMPLETED') {
    return 'completed';
  }

  // Check tracking status for transit
  if (po.trackingStatus === 'in_transit' || po.trackingStatus === 'out_for_delivery') {
    return 'in_transit';
  }

  // Has tracking = confirmed shipping
  if (po.trackingNumber && po.trackingStatus !== 'delivered') {
    return 'confirmed';
  }

  // Submitted but no tracking yet
  if (status === 'SUBMITTED' || status === 'PARTIALLY_RECEIVED') {
    return 'sent';
  }

  // Default to draft
  return 'draft';
}

/**
 * Calculate days until stockout for items in a PO
 */
function calculateStockoutRisk(
  po: FinalePurchaseOrderRecord,
  inventoryMap?: Map<string, { stock: number; salesVelocity: number; name: string }>
): StockoutRisk | null {
  if (!inventoryMap || !po.lineItems?.length) return null;

  let mostUrgent: StockoutRisk | null = null;

  for (const item of po.lineItems) {
    const sku = item.product_id || '';
    const invItem = inventoryMap.get(sku);
    if (!invItem || invItem.salesVelocity <= 0) continue;

    const daysUntilStockout = Math.floor(invItem.stock / invItem.salesVelocity);

    if (!mostUrgent || daysUntilStockout < mostUrgent.daysUntilStockout) {
      mostUrgent = {
        sku,
        name: invItem.name || sku,
        daysUntilStockout,
        currentStock: invItem.stock,
        dailyUsage: invItem.salesVelocity,
      };
    }
  }

  return mostUrgent;
}

/**
 * Check if PO has partial receipt requiring follow-up
 */
function hasPartialReceipt(po: FinalePurchaseOrderRecord): boolean {
  if (!po.lineItems?.length) return false;
  return po.lineItems.some(item =>
    item.quantity_received > 0 && item.quantity_received < item.quantity_ordered
  );
}

/**
 * Check if PO is overdue
 */
function isOverdue(po: FinalePurchaseOrderRecord): boolean {
  if (!po.expectedDate) return false;
  const expected = new Date(po.expectedDate);
  const now = new Date();
  return expected < now && getPOStage(po) !== 'completed';
}

/**
 * Stockout Countdown Badge component
 */
const StockoutCountdown: React.FC<{ risk: StockoutRisk; compact?: boolean }> = ({ risk, compact }) => {
  const urgencyClass = risk.daysUntilStockout <= 3
    ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : risk.daysUntilStockout <= 7
      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      : 'bg-gray-500/20 text-gray-400 border-gray-500/30';

  if (compact) {
    return (
      <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${urgencyClass}`}>
        {risk.daysUntilStockout}d
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-1 px-2 py-1 text-xs rounded border ${urgencyClass}`}>
      <AlertTriangleIcon className="w-3 h-3" />
      <span className="font-semibold">{risk.daysUntilStockout}d</span>
      <span className="opacity-75 truncate max-w-[80px]">{risk.sku}</span>
    </div>
  );
};

/**
 * Email/Tracking Status Indicator component
 * Shows visual cues for email correlation and tracking status
 */
const EmailTrackingIndicators: React.FC<{
  po: FinalePurchaseOrderRecord;
  isDark: boolean;
}> = ({ po, isDark }) => {
  const hasEmail = po.hasEmailThread || po.emailThreadId;
  const hasTracking = po.trackingNumber || po.emailHasTrackingInfo;
  const awaitingResponse = po.emailAwaitingResponse;
  const hasVendorReply = po.emailLastVendorReply;

  if (!hasEmail && !hasTracking) return null;

  return (
    <div className="flex items-center gap-1.5 mt-1">
      {/* Email indicator */}
      {hasEmail && (
        <div
          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
            awaitingResponse
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : hasVendorReply
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          }`}
          title={
            awaitingResponse
              ? 'Awaiting vendor response'
              : hasVendorReply
                ? `Vendor replied${po.emailMessageCount ? ` (${po.emailMessageCount} msgs)` : ''}`
                : 'Email thread linked'
          }
        >
          <MailIcon className="w-2.5 h-2.5" />
          {po.emailMessageCount && po.emailMessageCount > 1 && (
            <span>{po.emailMessageCount}</span>
          )}
          {awaitingResponse && <span>!</span>}
          {hasVendorReply && !awaitingResponse && <CheckCircleIcon className="w-2 h-2" />}
        </div>
      )}

      {/* Tracking indicator (if from email and no carrier tracking yet) */}
      {po.emailHasTrackingInfo && !po.trackingNumber && (
        <div
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30"
          title="Tracking info found in email"
        >
          <TruckIcon className="w-2.5 h-2.5" />
          <span>📧</span>
        </div>
      )}
    </div>
  );
};

/**
 * PO Card component for pipeline view
 */
const POCard: React.FC<{
  po: FinalePurchaseOrderRecord;
  stockoutRisk: StockoutRisk | null;
  onClick?: () => void;
  isDark: boolean;
}> = ({ po, stockoutRisk, onClick, isDark }) => {
  const isPartial = hasPartialReceipt(po);
  const overdue = isOverdue(po);
  const hasEmailCorrelation = po.hasEmailThread || po.emailThreadId;

  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg border cursor-pointer transition-all hover:scale-[1.02] ${
        isDark
          ? 'bg-slate-800/50 border-slate-700 hover:border-amber-500/50'
          : 'bg-white border-gray-200 hover:border-amber-400 shadow-sm'
      } ${hasEmailCorrelation ? (isDark ? 'ring-1 ring-blue-500/30' : 'ring-1 ring-blue-400/30') : ''}`}
    >
      {/* Header: PO Number + Badges */}
      <div className="flex items-center justify-between mb-2">
        <span className={`font-mono font-semibold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
          PO #{po.orderId}
        </span>
        <div className="flex items-center gap-1">
          {overdue && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-500/20 text-red-400 border border-red-500/30">
              OVERDUE
            </span>
          )}
          {isPartial && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              PARTIAL
            </span>
          )}
        </div>
      </div>

      {/* Vendor + Response Status */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className={`text-sm truncate flex-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          {po.vendorName || 'Unknown Vendor'}
        </div>
        {/* Vendor Response Indicator - Green for good, Red for problem */}
        <VendorResponseIndicator po={po} isDark={isDark} compact />
      </div>

      {/* Email/Tracking indicators */}
      <EmailTrackingIndicators po={po} isDark={isDark} />

      {/* Vendor Response Status (expanded view when has issues) */}
      {(po.vendorResponseRequiresAction || po.needsFollowup) && (
        <div className={`mt-2 p-2 rounded border text-xs ${
          isDark
            ? 'bg-red-500/10 border-red-500/30 text-red-300'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          <div className="flex items-center gap-1">
            <AlertTriangleIcon className="w-3 h-3" />
            <span className="font-medium">
              {po.vendorResponseActionType || 'Action Required'}
            </span>
          </div>
          {po.vendorResponseActionDueBy && (
            <div className={`mt-1 text-[10px] ${
              new Date(po.vendorResponseActionDueBy) < new Date() ? 'font-bold' : 'opacity-75'
            }`}>
              Due: {new Date(po.vendorResponseActionDueBy).toLocaleDateString()}
            </div>
          )}
        </div>
      )}

      {/* Footer: Total + Stockout Risk */}
      <div className="flex items-center justify-between mt-2">
        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          ${(po.total || 0).toLocaleString()}
        </span>
        {stockoutRisk && stockoutRisk.daysUntilStockout <= 14 && (
          <StockoutCountdown risk={stockoutRisk} compact />
        )}
      </div>

      {/* Tracking indicator (carrier tracking) */}
      {po.trackingNumber && (
        <div className={`mt-2 pt-2 border-t flex items-center gap-1 text-xs ${
          isDark ? 'border-slate-700 text-gray-400' : 'border-gray-100 text-gray-500'
        }`}>
          <TruckIcon className="w-3 h-3 text-green-500" />
          <span className="truncate">{po.trackingCarrier || 'Tracking'}: {po.trackingNumber.slice(0, 12)}...</span>
        </div>
      )}
    </div>
  );
};

/**
 * Pipeline Column component
 */
const PipelineColumn: React.FC<{
  stage: POPipelineStageConfig;
  pos: FinalePurchaseOrderRecord[];
  inventoryMap?: Map<string, { stock: number; salesVelocity: number; name: string }>;
  onPOClick?: (po: FinalePurchaseOrderRecord) => void;
  onStageClick?: () => void;
  isDark: boolean;
  compact?: boolean;
}> = ({ stage, pos, inventoryMap, onPOClick, onStageClick, isDark, compact }) => {
  const overdueCount = pos.filter(isOverdue).length;

  return (
    <div className={`flex-1 min-w-[200px] ${compact ? 'min-w-[140px]' : ''}`}>
      {/* Column Header */}
      <div
        onClick={onStageClick}
        className={`flex items-center justify-between p-3 rounded-t-lg cursor-pointer ${stage.bgColor} border ${stage.borderColor}`}
      >
        <div className="flex items-center gap-2">
          <span className={stage.color}>{stage.icon}</span>
          <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {stage.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-sm font-bold rounded-full ${stage.bgColor} ${stage.color}`}>
            {pos.length}
          </span>
          {overdueCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-500/30 text-red-400">
              {overdueCount} late
            </span>
          )}
        </div>
      </div>

      {/* Column Body - Cards */}
      <div className={`p-2 space-y-2 rounded-b-lg border border-t-0 min-h-[200px] max-h-[60vh] overflow-y-auto ${
        isDark ? 'bg-slate-900/30 border-slate-800' : 'bg-gray-50 border-gray-200'
      }`}>
        {pos.length === 0 ? (
          <div className={`text-center py-8 text-sm ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
            No POs
          </div>
        ) : compact ? (
          // Compact mode - just show counts and top 3
          <>
            {pos.slice(0, 3).map(po => (
              <POCard
                key={po.id}
                po={po}
                stockoutRisk={calculateStockoutRisk(po, inventoryMap)}
                onClick={() => onPOClick?.(po)}
                isDark={isDark}
              />
            ))}
            {pos.length > 3 && (
              <div className={`text-center py-2 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                +{pos.length - 3} more
              </div>
            )}
          </>
        ) : (
          // Full mode - show all cards
          pos.map(po => (
            <POCard
              key={po.id}
              po={po}
              stockoutRisk={calculateStockoutRisk(po, inventoryMap)}
              onClick={() => onPOClick?.(po)}
              isDark={isDark}
            />
          ))
        )}
      </div>
    </div>
  );
};

/**
 * Main POPipelineView component
 */
export const POPipelineView: React.FC<POPipelineViewProps> = ({
  purchaseOrders,
  inventoryMap,
  onPOClick,
  onStageClick,
  compact = false,
  onSendFollowup,
  onMarkResolved,
  showPendingFollowups = true,
}) => {
  const { isDark } = useTheme();

  // Group POs by stage
  const posByStage = useMemo(() => {
    const grouped: Record<POPipelineStage, FinalePurchaseOrderRecord[]> = {
      draft: [],
      sent: [],
      confirmed: [],
      in_transit: [],
      completed: [],
    };

    // Filter out dropship POs
    const filteredPOs = purchaseOrders.filter(po => {
      const orderId = (po.orderId || '').toLowerCase();
      return !orderId.includes('dropshippo');
    });

    filteredPOs.forEach(po => {
      const stage = getPOStage(po);
      grouped[stage].push(po);
    });

    // Sort each stage by expected date
    Object.keys(grouped).forEach(stage => {
      grouped[stage as POPipelineStage].sort((a, b) => {
        const aDate = a.expectedDate ? new Date(a.expectedDate).getTime() : 0;
        const bDate = b.expectedDate ? new Date(b.expectedDate).getTime() : 0;
        return aDate - bDate;
      });
    });

    return grouped;
  }, [purchaseOrders]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const allPOs = Object.values(posByStage).flat();
    const overdueCount = allPOs.filter(isOverdue).length;
    const inTransitCount = posByStage.in_transit.length;
    const partialCount = allPOs.filter(hasPartialReceipt).length;

    return { overdueCount, inTransitCount, partialCount, total: allPOs.length };
  }, [posByStage]);

  if (compact) {
    // Dashboard widget - compact horizontal bar
    return (
      <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-200 shadow-sm'}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            PO Pipeline
          </h3>
          <div className="flex items-center gap-2 text-xs">
            {stats.overdueCount > 0 && (
              <span className="px-2 py-1 rounded bg-red-500/20 text-red-400 font-semibold">
                {stats.overdueCount} overdue
              </span>
            )}
            <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
              {stats.inTransitCount} arriving
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-1 mb-4">
          {STAGE_CONFIG.filter(s => s.id !== 'completed').map((stage, idx) => {
            const count = posByStage[stage.id].length;
            const width = stats.total > 0 ? Math.max((count / stats.total) * 100, 5) : 25;
            return (
              <React.Fragment key={stage.id}>
                <div
                  className={`h-2 rounded-full ${stage.bgColor} transition-all`}
                  style={{ width: `${width}%` }}
                  title={`${stage.label}: ${count}`}
                />
                {idx < STAGE_CONFIG.length - 2 && (
                  <ChevronRightIcon className={`w-3 h-3 flex-shrink-0 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Stage counts */}
        <div className="flex justify-between text-xs">
          {STAGE_CONFIG.filter(s => s.id !== 'completed').map(stage => (
            <div key={stage.id} className="text-center">
              <div className={`font-bold ${stage.color}`}>{posByStage[stage.id].length}</div>
              <div className={isDark ? 'text-gray-500' : 'text-gray-400'}>{stage.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Full pipeline view
  return (
    <div className="space-y-4">
      {/* Pending Followups Panel - Collapsible */}
      {showPendingFollowups && (
        <PendingFollowupsPanel
          purchaseOrders={purchaseOrders}
          onPOClick={onPOClick}
          onSendFollowup={onSendFollowup}
          onMarkResolved={onMarkResolved}
        />
      )}

      {/* Summary bar */}
      <div className={`flex items-center justify-between p-3 rounded-lg ${
        isDark ? 'bg-slate-800/50 border border-slate-700' : 'bg-gray-50 border border-gray-200'
      }`}>
        <div className="flex items-center gap-4">
          <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            <span className="font-semibold">{stats.total}</span> active POs
          </span>
          {stats.overdueCount > 0 && (
            <span className="flex items-center gap-1 text-sm text-red-400">
              <AlertTriangleIcon className="w-4 h-4" />
              <span className="font-semibold">{stats.overdueCount}</span> overdue
            </span>
          )}
          {stats.partialCount > 0 && (
            <span className="flex items-center gap-1 text-sm text-amber-400">
              <AlertTriangleIcon className="w-4 h-4" />
              <span className="font-semibold">{stats.partialCount}</span> partial receipts
            </span>
          )}
        </div>
        <span className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {stats.inTransitCount} in transit
        </span>
      </div>

      {/* Pipeline columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGE_CONFIG.map(stage => (
          <PipelineColumn
            key={stage.id}
            stage={stage}
            pos={posByStage[stage.id]}
            inventoryMap={inventoryMap}
            onPOClick={onPOClick}
            onStageClick={() => onStageClick?.(stage.id)}
            isDark={isDark}
          />
        ))}
      </div>
    </div>
  );
};

export default POPipelineView;
