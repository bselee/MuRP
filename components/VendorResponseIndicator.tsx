/**
 * VendorResponseIndicator - Shows vendor response status on PO cards
 *
 * Color coding:
 * - Green: Good response (confirmation, tracking provided, simple acknowledgment)
 * - Red: Problem needs attention (question, delay, issue, info request)
 * - Amber: Awaiting response (no reply yet)
 * - Gray: No email thread
 */
import React from 'react';
import { CheckCircleIcon, ExclamationCircleIcon, ClockIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import type { FinalePurchaseOrderRecord } from '../types';

interface VendorResponseIndicatorProps {
  po: FinalePurchaseOrderRecord;
  isDark: boolean;
  showDate?: boolean;
  compact?: boolean;
}

type ResponseStatusCategory = 'good' | 'problem' | 'awaiting' | 'none';

/**
 * Determine the status category based on PO response data
 */
function getStatusCategory(po: FinalePurchaseOrderRecord): ResponseStatusCategory {
  // No email thread = no indicator
  if (!po.hasEmailThread && !po.emailThreadId && !po.sentAt) {
    return 'none';
  }

  // Has vendor response
  if (po.vendorResponseDate || po.emailLastVendorReply) {
    // Check if response requires action (problem)
    if (po.vendorResponseRequiresAction) {
      return 'problem';
    }

    // Check response type
    const responseType = po.vendorLastResponseType;
    if (responseType) {
      const problemTypes = ['question', 'delay_notice', 'issue', 'info_request', 'unknown'];
      if (problemTypes.includes(responseType)) {
        return 'problem';
      }
    }

    // Good response - confirmation, tracking, acknowledgment
    return 'good';
  }

  // Email sent but no response yet
  if (po.sentAt || po.emailLastSentAt || po.hasEmailThread) {
    return 'awaiting';
  }

  return 'none';
}

/**
 * Get human-readable label for response type
 */
function getResponseLabel(po: FinalePurchaseOrderRecord): string {
  const responseType = po.vendorLastResponseType;

  if (!responseType) {
    if (po.vendorResponseDate || po.emailLastVendorReply) {
      return 'Responded';
    }
    if (po.emailAwaitingResponse || po.needsFollowup) {
      return 'Awaiting Response';
    }
    return '';
  }

  const labels: Record<string, string> = {
    'confirmation': 'Confirmed',
    'tracking_provided': 'Tracking Sent',
    'question': 'Question Asked',
    'delay_notice': 'Delay Reported',
    'acknowledgment': 'Acknowledged',
    'issue': 'Issue Reported',
    'info_request': 'Info Needed',
    'price_quote': 'Quote Received',
    'unknown': 'Needs Review'
  };

  return labels[responseType] || 'Responded';
}

/**
 * Get action description for problems
 */
function getActionDescription(po: FinalePurchaseOrderRecord): string | null {
  if (po.vendorResponseActionType) {
    return po.vendorResponseActionType;
  }

  const responseType = po.vendorLastResponseType;

  const actionDescriptions: Record<string, string> = {
    'question': 'Reply to vendor question',
    'delay_notice': 'Review delay impact',
    'issue': 'Address reported issue',
    'info_request': 'Provide requested info',
    'unknown': 'Review and classify'
  };

  return responseType ? (actionDescriptions[responseType] || null) : null;
}

/**
 * Format date for display
 */
function formatResponseDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

export const VendorResponseIndicator: React.FC<VendorResponseIndicatorProps> = ({
  po,
  isDark,
  showDate = true,
  compact = false
}) => {
  const category = getStatusCategory(po);

  if (category === 'none') {
    return null;
  }

  const responseDate = po.vendorResponseDate || po.emailLastVendorReply;
  const label = getResponseLabel(po);
  const actionDescription = getActionDescription(po);

  // Color configurations
  const colorConfig = {
    good: {
      bg: 'bg-green-500/20',
      text: 'text-green-400',
      border: 'border-green-500/30',
      bgLight: 'bg-green-100',
      textLight: 'text-green-700',
      borderLight: 'border-green-300',
      icon: CheckCircleIcon
    },
    problem: {
      bg: 'bg-red-500/20',
      text: 'text-red-400',
      border: 'border-red-500/30',
      bgLight: 'bg-red-100',
      textLight: 'text-red-700',
      borderLight: 'border-red-300',
      icon: ExclamationCircleIcon
    },
    awaiting: {
      bg: 'bg-amber-500/20',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      bgLight: 'bg-amber-100',
      textLight: 'text-amber-700',
      borderLight: 'border-amber-300',
      icon: ClockIcon
    }
  };

  const config = colorConfig[category];
  const Icon = config.icon;

  if (compact) {
    // Compact mode - just colored dot with tooltip
    return (
      <div
        className={`w-2.5 h-2.5 rounded-full ${
          isDark ? config.bg : config.bgLight
        } border ${
          isDark ? config.border : config.borderLight
        }`}
        title={`${label}${responseDate ? ` - ${formatResponseDate(responseDate)}` : ''}${actionDescription ? `\n${actionDescription}` : ''}`}
      />
    );
  }

  // Standard mode - badge with text
  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
        isDark
          ? `${config.bg} ${config.text} ${config.border}`
          : `${config.bgLight} ${config.textLight} ${config.borderLight}`
      }`}
      title={actionDescription || label}
    >
      <Icon className="w-3 h-3" />
      <span>{label}</span>
      {showDate && responseDate && (
        <span className="opacity-75">
          {formatResponseDate(responseDate)}
        </span>
      )}
    </div>
  );
};

/**
 * VendorResponseDetail - Expanded view for PO details panel
 */
export const VendorResponseDetail: React.FC<{
  po: FinalePurchaseOrderRecord;
  isDark: boolean;
}> = ({ po, isDark }) => {
  const category = getStatusCategory(po);

  if (category === 'none') {
    return null;
  }

  const responseDate = po.vendorResponseDate || po.emailLastVendorReply;
  const label = getResponseLabel(po);
  const actionDescription = getActionDescription(po);
  const actionDueBy = po.vendorResponseActionDueBy;

  return (
    <div className={`p-3 rounded-lg border ${
      isDark
        ? 'bg-slate-800/50 border-slate-700'
        : 'bg-gray-50 border-gray-200'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <VendorResponseIndicator po={po} isDark={isDark} showDate={false} />
            {responseDate && (
              <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {new Date(responseDate).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            )}
          </div>

          {actionDescription && category === 'problem' && (
            <div className={`text-sm mt-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              {actionDescription}
            </div>
          )}
        </div>

        {actionDueBy && category === 'problem' && (
          <div className={`text-right ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            <div className="text-[10px] uppercase tracking-wide">Due</div>
            <div className={`text-xs font-medium ${
              new Date(actionDueBy) < new Date()
                ? 'text-red-500'
                : 'text-amber-500'
            }`}>
              {new Date(actionDueBy).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
              })}
            </div>
          </div>
        )}
      </div>

      {po.vendorFollowupCount && po.vendorFollowupCount > 0 && (
        <div className={`mt-2 pt-2 border-t text-xs ${
          isDark ? 'border-slate-700 text-gray-500' : 'border-gray-200 text-gray-500'
        }`}>
          {po.vendorFollowupCount} follow-up{po.vendorFollowupCount > 1 ? 's' : ''} sent
        </div>
      )}
    </div>
  );
};

export default VendorResponseIndicator;
