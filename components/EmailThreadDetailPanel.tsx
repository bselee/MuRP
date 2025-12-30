/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EMAIL THREAD DETAIL PANEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive view of an email thread with:
 * - Timeline of events
 * - Key dates (confirmed, shipped, ETA, delivered)
 * - Tracking information
 * - Action items
 * - Thread summary
 * - Message list
 *
 * Part of: Email Tracking Agent Expansion - Phase 2
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  reconstructThread,
  resolveThread,
  setThreadUrgency,
  generateThreadSummary,
  type ThreadReconstruction,
  type TimelineEvent,
  type ActionItem,
} from '../services/emailThreadService';
import Button from '@/components/ui/Button';
import {
  MailIcon,
  CheckCircleIcon,
  ClockIcon,
  TruckIcon,
  ExclamationTriangleIcon,
  RefreshCcwIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BotIcon,
  LinkIcon,
  CalendarIcon,
  FlagIcon,
} from './icons';

interface EmailThreadDetailPanelProps {
  threadId: string;
  onClose?: () => void;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const EmailThreadDetailPanel: React.FC<EmailThreadDetailPanelProps> = ({
  threadId,
  onClose,
  addToast,
}) => {
  const [thread, setThread] = useState<ThreadReconstruction | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  const loadThread = useCallback(async () => {
    setLoading(true);
    try {
      const data = await reconstructThread(threadId);
      setThread(data);
    } catch (error) {
      console.error('[EmailThreadDetailPanel] Failed to load thread:', error);
      addToast?.('Failed to load thread details', 'error');
    } finally {
      setLoading(false);
    }
  }, [threadId, addToast]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  const handleGenerateSummary = async () => {
    if (!thread) return;
    setGeneratingSummary(true);
    try {
      const summary = await generateThreadSummary(threadId);
      setThread((prev) => (prev ? { ...prev, summary } : prev));
      addToast?.('Summary generated', 'success');
    } catch (error) {
      console.error('[EmailThreadDetailPanel] Failed to generate summary:', error);
      addToast?.('Failed to generate summary', 'error');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleResolve = async (resolutionType: 'delivered' | 'cancelled' | 'no_action_needed' | 'manual_close') => {
    if (!thread) return;
    try {
      await resolveThread(threadId, resolutionType);
      addToast?.('Thread resolved', 'success');
      await loadThread();
    } catch (error) {
      console.error('[EmailThreadDetailPanel] Failed to resolve thread:', error);
      addToast?.('Failed to resolve thread', 'error');
    }
  };

  const handleSetUrgency = async (level: 'low' | 'normal' | 'high' | 'critical') => {
    if (!thread) return;
    try {
      await setThreadUrgency(threadId, level);
      addToast?.(`Urgency set to ${level}`, 'success');
      await loadThread();
    } catch (error) {
      console.error('[EmailThreadDetailPanel] Failed to set urgency:', error);
      addToast?.('Failed to set urgency', 'error');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Render Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  const getStatusBadge = (status: string, urgency: string) => {
    if (urgency === 'critical') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse">
          <ExclamationTriangleIcon className="w-3 h-3" /> CRITICAL
        </span>
      );
    }

    switch (status) {
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircleIcon className="w-3 h-3" /> Delivered
          </span>
        );
      case 'resolved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-500/20 text-gray-300 border border-gray-500/30">
            <CheckCircleIcon className="w-3 h-3" /> Resolved
          </span>
        );
      case 'awaiting_response':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <ClockIcon className="w-3 h-3" /> Awaiting Response
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-sky-500/20 text-sky-300 border border-sky-500/30">
            Active
          </span>
        );
    }
  };

  const getTimelineIcon = (event: string) => {
    switch (event) {
      case 'order_confirmed':
        return <CheckCircleIcon className="w-4 h-4 text-emerald-400" />;
      case 'tracking_received':
        return <TruckIcon className="w-4 h-4 text-sky-400" />;
      case 'delay_notice':
        return <ExclamationTriangleIcon className="w-4 h-4 text-amber-400" />;
      case 'backorder_notice':
        return <ExclamationTriangleIcon className="w-4 h-4 text-red-400" />;
      case 'vendor_reply':
        return <MailIcon className="w-4 h-4 text-emerald-400" />;
      case 'outbound_sent':
        return <MailIcon className="w-4 h-4 text-sky-400" />;
      default:
        return <ClockIcon className="w-4 h-4 text-gray-400" />;
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTimeAgo = (date: string | null) => {
    if (!date) return '—';
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'high':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'medium':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-400">
        <RefreshCcwIcon className="w-6 h-6 animate-spin mx-auto mb-2" />
        Loading thread details...
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="p-6 text-center text-gray-400">
        Thread not found
      </div>
    );
  }

  const displayedMessages = showAllMessages ? thread.messages : thread.messages.slice(-3);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white">{thread.subject}</h3>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            {getStatusBadge(thread.status.status, thread.status.urgencyLevel)}
            {thread.poNumber && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30">
                <LinkIcon className="w-3 h-3" /> {thread.poNumber}
              </span>
            )}
            {thread.vendorName && (
              <span className="text-sm text-gray-400">{thread.vendorName}</span>
            )}
            {thread.correlationConfidence && (
              <span className="text-xs text-gray-500">
                {(thread.correlationConfidence * 100).toFixed(0)}% correlation
              </span>
            )}
          </div>
        </div>
        <Button
          onClick={loadThread}
          className="px-3 py-1.5 text-sm rounded-md border border-gray-600 text-gray-300 hover:bg-gray-700"
        >
          <RefreshCcwIcon className="w-4 h-4" />
        </Button>
      </div>

      {/* Key Dates */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'PO Sent', value: thread.keyDates.poSent, icon: MailIcon },
          { label: 'Confirmed', value: thread.keyDates.confirmed, icon: CheckCircleIcon },
          { label: 'Shipped', value: thread.keyDates.shipped, icon: TruckIcon },
          { label: 'ETA', value: thread.keyDates.eta, icon: CalendarIcon },
          { label: 'Delivered', value: thread.keyDates.delivered, icon: CheckCircleIcon },
        ].map((date) => (
          <div key={date.label} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <date.icon className="w-3 h-3" />
              {date.label}
            </div>
            <p className={`text-sm font-medium ${date.value ? 'text-white' : 'text-gray-500'}`}>
              {formatDate(date.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Tracking Info */}
      {thread.trackingInfo.trackingNumbers.length > 0 && (
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-300 mb-2">
            <TruckIcon className="w-4 h-4" />
            Tracking Information
          </div>
          <div className="space-y-2">
            {thread.trackingInfo.trackingNumbers.map((num, i) => (
              <div key={num} className="flex items-center gap-3 text-sm">
                <span className="font-mono text-white">{num}</span>
                {thread.trackingInfo.carriers[i] && (
                  <span className="text-gray-400">{thread.trackingInfo.carriers[i]}</span>
                )}
              </div>
            ))}
            {thread.trackingInfo.latestStatus && (
              <p className="text-xs text-sky-200 mt-2">
                Status: {thread.trackingInfo.latestStatus}
                {thread.trackingInfo.latestEta && ` • ETA: ${formatDate(thread.trackingInfo.latestEta)}`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <BotIcon className="w-4 h-4 text-purple-400" />
            Thread Summary
          </div>
          <Button
            onClick={handleGenerateSummary}
            disabled={generatingSummary}
            className="px-3 py-1 text-xs rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 disabled:opacity-50"
          >
            {generatingSummary ? 'Generating...' : 'Generate'}
          </Button>
        </div>
        {thread.summary ? (
          <p className="text-sm text-gray-300">{thread.summary}</p>
        ) : (
          <p className="text-sm text-gray-500 italic">No summary generated yet</p>
        )}
        {thread.sentiment && (
          <div className="mt-2">
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                thread.sentiment === 'positive'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : thread.sentiment === 'negative'
                    ? 'bg-red-500/20 text-red-300'
                    : thread.sentiment === 'urgent'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-gray-500/20 text-gray-300'
              }`}
            >
              Sentiment: {thread.sentiment}
            </span>
          </div>
        )}
      </div>

      {/* Action Items */}
      {thread.actionItems.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-300 mb-3">
            <FlagIcon className="w-4 h-4" />
            Action Items ({thread.actionItems.length})
          </div>
          <div className="space-y-2">
            {thread.actionItems.map((item, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-2 rounded-md border ${getPriorityColor(item.priority)}`}
              >
                <span className="text-xs font-semibold uppercase">{item.priority}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{item.action.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-400">{item.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      {thread.timeline.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-white mb-3">Timeline</h4>
          <div className="space-y-3">
            {thread.timeline.slice(-5).map((event, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-0.5">{getTimelineIcon(event.event)}</div>
                <div className="flex-1">
                  <p className="text-sm text-white">{event.event.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-400">{formatTimeAgo(event.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-white">
            Messages ({thread.messages.length})
          </h4>
          {thread.messages.length > 3 && (
            <Button
              onClick={() => setShowAllMessages(!showAllMessages)}
              className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
            >
              {showAllMessages ? (
                <>
                  <ChevronUpIcon className="w-3 h-3" /> Show less
                </>
              ) : (
                <>
                  <ChevronDownIcon className="w-3 h-3" /> Show all
                </>
              )}
            </Button>
          )}
        </div>
        <div className="space-y-3">
          {displayedMessages.map((msg) => (
            <div
              key={msg.id}
              className={`p-3 rounded-lg border ${
                msg.direction === 'inbound'
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-sky-500/5 border-sky-500/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">
                  {msg.direction === 'inbound' ? 'From: ' : 'To: '}
                  {msg.sender_email}
                </span>
                <span className="text-xs text-gray-500">{formatTimeAgo(msg.sent_at)}</span>
              </div>
              <p className="text-sm text-gray-300">{msg.body_preview || msg.subject}</p>
              {msg.extracted_tracking_number && (
                <p className="text-xs text-sky-300 mt-2">
                  Tracking: {msg.extracted_tracking_number}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      {!thread.status.status.includes('resolved') && (
        <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-700">
          <span className="text-xs text-gray-400 mr-2">Set Urgency:</span>
          {(['low', 'normal', 'high', 'critical'] as const).map((level) => (
            <Button
              key={level}
              onClick={() => handleSetUrgency(level)}
              className={`px-3 py-1 text-xs rounded-md border ${
                thread.status.urgencyLevel === level
                  ? getPriorityColor(level)
                  : 'border-gray-600 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {level}
            </Button>
          ))}
          <div className="flex-1" />
          <Button
            onClick={() => handleResolve('no_action_needed')}
            className="px-3 py-1 text-xs rounded-md border border-gray-600 text-gray-300 hover:bg-gray-700"
          >
            Resolve
          </Button>
        </div>
      )}
    </div>
  );
};

export default EmailThreadDetailPanel;
