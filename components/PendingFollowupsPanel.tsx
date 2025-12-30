/**
 * PendingFollowupsPanel - Collapsible panel showing POs needing vendor follow-up
 *
 * Features:
 * - Collapsible to preserve screen space
 * - Shows count in header when collapsed
 * - Color-coded urgency (critical, high, medium)
 * - Quick action buttons for common operations
 */
import React, { useState, useMemo, useEffect } from 'react';
import { useTheme } from './ThemeProvider';
import { AlertTriangleIcon, ChevronDownIcon, ChevronUpIcon, MailIcon, CheckCircleIcon, ClockIcon, ExclamationCircleIcon } from './icons';
import { VendorResponseIndicator } from './VendorResponseIndicator';
import type { FinalePurchaseOrderRecord } from '../types';

interface PendingFollowup {
  po: FinalePurchaseOrderRecord;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
  daysSinceOutbound: number;
  dueDate?: string;
}

interface PendingFollowupsPanelProps {
  purchaseOrders: FinalePurchaseOrderRecord[];
  onPOClick?: (po: FinalePurchaseOrderRecord) => void;
  onSendFollowup?: (po: FinalePurchaseOrderRecord) => Promise<void>;
  onMarkResolved?: (po: FinalePurchaseOrderRecord) => Promise<void>;
  defaultExpanded?: boolean;
}

/**
 * Calculate urgency level based on days waiting and followup count
 */
function calculateUrgency(
  daysSinceOutbound: number,
  followupCount: number,
  responseType?: string
): 'critical' | 'high' | 'medium' | 'low' {
  // Critical: Issue reported, or 3+ days with 2+ followups
  if (responseType === 'issue') return 'critical';
  if (followupCount >= 2 && daysSinceOutbound > 3) return 'critical';

  // High: Question/info request, or 3+ days no response
  if (responseType === 'question' || responseType === 'info_request') return 'high';
  if (daysSinceOutbound > 3) return 'high';

  // Medium: 2+ days
  if (daysSinceOutbound > 2) return 'medium';

  // Low: Everything else
  return 'low';
}

/**
 * Get reason text for follow-up
 */
function getFollowupReason(po: FinalePurchaseOrderRecord): string {
  if (po.vendorLastResponseType === 'question') {
    return 'Vendor asked a question';
  }
  if (po.vendorLastResponseType === 'info_request') {
    return 'Vendor needs more info';
  }
  if (po.vendorLastResponseType === 'delay_notice') {
    return 'Delay reported - review needed';
  }
  if (po.vendorLastResponseType === 'issue') {
    return 'Issue reported - urgent';
  }
  if (po.emailAwaitingResponse || po.needsFollowup) {
    return 'Awaiting vendor response';
  }
  return 'Follow-up needed';
}

/**
 * Calculate days since last outbound email
 */
function getDaysSinceOutbound(po: FinalePurchaseOrderRecord): number {
  const sentDate = po.sentAt || po.emailLastSentAt;
  if (!sentDate) return 0;

  const sent = new Date(sentDate);
  const now = new Date();
  const diffMs = now.getTime() - sent.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Extract pending followups from PO list
 */
function extractPendingFollowups(pos: FinalePurchaseOrderRecord[]): PendingFollowup[] {
  const followups: PendingFollowup[] = [];

  for (const po of pos) {
    // Skip completed/received POs
    const status = (po.status || '').toUpperCase();
    if (['RECEIVED', 'COMPLETED', 'CANCELLED'].includes(status)) continue;

    // Check if needs follow-up
    const needsFollowup =
      po.needsFollowup ||
      po.vendorResponseRequiresAction ||
      po.emailAwaitingResponse ||
      (po.vendorLastResponseType && ['question', 'info_request', 'delay_notice', 'issue'].includes(po.vendorLastResponseType));

    if (!needsFollowup) continue;

    const daysSinceOutbound = getDaysSinceOutbound(po);
    const urgency = calculateUrgency(
      daysSinceOutbound,
      po.vendorFollowupCount || 0,
      po.vendorLastResponseType
    );

    followups.push({
      po,
      urgency,
      reason: getFollowupReason(po),
      daysSinceOutbound,
      dueDate: po.vendorResponseActionDueBy || po.vendorFollowupDueAt
    });
  }

  // Sort by urgency (critical first) then by days waiting
  return followups.sort((a, b) => {
    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return b.daysSinceOutbound - a.daysSinceOutbound;
  });
}

const UrgencyBadge: React.FC<{ urgency: 'critical' | 'high' | 'medium' | 'low'; isDark: boolean }> = ({
  urgency,
  isDark
}) => {
  const configs = {
    critical: {
      bg: isDark ? 'bg-red-500/20' : 'bg-red-100',
      text: isDark ? 'text-red-400' : 'text-red-700',
      border: isDark ? 'border-red-500/30' : 'border-red-300',
      label: 'Critical'
    },
    high: {
      bg: isDark ? 'bg-orange-500/20' : 'bg-orange-100',
      text: isDark ? 'text-orange-400' : 'text-orange-700',
      border: isDark ? 'border-orange-500/30' : 'border-orange-300',
      label: 'High'
    },
    medium: {
      bg: isDark ? 'bg-amber-500/20' : 'bg-amber-100',
      text: isDark ? 'text-amber-400' : 'text-amber-700',
      border: isDark ? 'border-amber-500/30' : 'border-amber-300',
      label: 'Medium'
    },
    low: {
      bg: isDark ? 'bg-gray-500/20' : 'bg-gray-100',
      text: isDark ? 'text-gray-400' : 'text-gray-600',
      border: isDark ? 'border-gray-500/30' : 'border-gray-300',
      label: 'Low'
    }
  };

  const config = configs[urgency];

  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${config.bg} ${config.text} ${config.border}`}>
      {config.label}
    </span>
  );
};

const FollowupRow: React.FC<{
  followup: PendingFollowup;
  isDark: boolean;
  onPOClick?: () => void;
  onSendFollowup?: () => void;
  onMarkResolved?: () => void;
}> = ({ followup, isDark, onPOClick, onSendFollowup, onMarkResolved }) => {
  const { po, urgency, reason, daysSinceOutbound, dueDate } = followup;
  const isOverdue = dueDate && new Date(dueDate) < new Date();

  return (
    <div
      className={`p-3 rounded-lg border transition-all ${
        isDark
          ? 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
          : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: PO info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`font-mono font-semibold cursor-pointer hover:underline ${
                isDark ? 'text-amber-400' : 'text-amber-700'
              }`}
              onClick={onPOClick}
            >
              PO #{po.orderId}
            </span>
            <UrgencyBadge urgency={urgency} isDark={isDark} />
            <VendorResponseIndicator po={po} isDark={isDark} showDate={false} />
          </div>

          <div className={`text-sm truncate ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            {po.vendorName || 'Unknown Vendor'}
          </div>

          <div className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            {reason}
            {daysSinceOutbound > 0 && (
              <span className="ml-2">
                ({daysSinceOutbound} day{daysSinceOutbound !== 1 ? 's' : ''} waiting)
              </span>
            )}
          </div>
        </div>

        {/* Right: Due date + Actions */}
        <div className="flex items-center gap-2">
          {dueDate && (
            <div className={`text-right ${isOverdue ? 'text-red-500' : isDark ? 'text-gray-500' : 'text-gray-500'}`}>
              <div className="text-[10px] uppercase tracking-wide">Due</div>
              <div className={`text-xs font-medium ${isOverdue ? 'font-bold' : ''}`}>
                {new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-1">
            {onSendFollowup && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSendFollowup();
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark
                    ? 'hover:bg-blue-500/20 text-blue-400'
                    : 'hover:bg-blue-100 text-blue-600'
                }`}
                title="Send follow-up email"
              >
                <MailIcon className="w-4 h-4" />
              </button>
            )}
            {onMarkResolved && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkResolved();
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark
                    ? 'hover:bg-green-500/20 text-green-400'
                    : 'hover:bg-green-100 text-green-600'
                }`}
                title="Mark as resolved"
              >
                <CheckCircleIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const PendingFollowupsPanel: React.FC<PendingFollowupsPanelProps> = ({
  purchaseOrders,
  onPOClick,
  onSendFollowup,
  onMarkResolved,
  defaultExpanded = false
}) => {
  const { isDark } = useTheme();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const pendingFollowups = useMemo(
    () => extractPendingFollowups(purchaseOrders),
    [purchaseOrders]
  );

  // Auto-expand if critical items
  useEffect(() => {
    const hasCritical = pendingFollowups.some(f => f.urgency === 'critical');
    if (hasCritical && !isExpanded) {
      setIsExpanded(true);
    }
  }, [pendingFollowups]);

  if (pendingFollowups.length === 0) {
    return null;
  }

  const criticalCount = pendingFollowups.filter(f => f.urgency === 'critical').length;
  const highCount = pendingFollowups.filter(f => f.urgency === 'high').length;

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${
      isDark
        ? 'bg-slate-900/50 border-slate-800'
        : 'bg-white border-gray-200 shadow-sm'
    }`}>
      {/* Header - Always visible, clickable to toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
          isDark
            ? 'hover:bg-slate-800/50'
            : 'hover:bg-gray-50'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${
            criticalCount > 0
              ? (isDark ? 'bg-red-500/20' : 'bg-red-100')
              : highCount > 0
                ? (isDark ? 'bg-orange-500/20' : 'bg-orange-100')
                : (isDark ? 'bg-amber-500/20' : 'bg-amber-100')
          }`}>
            <AlertTriangleIcon className={`w-5 h-5 ${
              criticalCount > 0
                ? 'text-red-500'
                : highCount > 0
                  ? 'text-orange-500'
                  : 'text-amber-500'
            }`} />
          </div>

          <div className="text-left">
            <div className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Pending Follow-ups
            </div>
            <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
              {pendingFollowups.length} PO{pendingFollowups.length !== 1 ? 's' : ''} need attention
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Urgency summary badges */}
          <div className="flex items-center gap-1">
            {criticalCount > 0 && (
              <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700'
              }`}>
                {criticalCount} critical
              </span>
            )}
            {highCount > 0 && (
              <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700'
              }`}>
                {highCount} high
              </span>
            )}
          </div>

          {/* Expand/Collapse icon */}
          {isExpanded ? (
            <ChevronUpIcon className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`} />
          ) : (
            <ChevronDownIcon className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`} />
          )}
        </div>
      </button>

      {/* Collapsible content */}
      {isExpanded && (
        <div className={`px-4 pb-4 space-y-2 border-t ${
          isDark ? 'border-slate-800' : 'border-gray-100'
        }`}>
          <div className="pt-3">
            {pendingFollowups.map((followup, idx) => (
              <div key={followup.po.id || idx} className="mb-2 last:mb-0">
                <FollowupRow
                  followup={followup}
                  isDark={isDark}
                  onPOClick={() => onPOClick?.(followup.po)}
                  onSendFollowup={onSendFollowup ? () => onSendFollowup(followup.po) : undefined}
                  onMarkResolved={onMarkResolved ? () => onMarkResolved(followup.po) : undefined}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PendingFollowupsPanel;
