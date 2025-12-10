'use client';

import React, { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface POAlert {
  id: string;
  po_id: string;
  po_number: string;
  vendor_id: string;
  vendor_name: string;
  alert_type: string;
  priority_level: 'critical' | 'high' | 'medium' | 'low';
  delay_days: number;
  original_eta: string;
  new_eta: string;
  stockout_risk_days: number;
  affected_items: Array<{
    sku: string;
    name: string;
    current_stock: number;
    days_until_stockout: number;
    impact_level: string;
  }>;
  impact_summary: string;
  recommended_action: string;
  draft_vendor_email: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  dismissed_by: string | null;
}

interface AlertFeedComponentProps {
  showResolved?: boolean;
  limit?: number;
}

export default function AlertFeedComponent({ showResolved = false, limit = 50 }: AlertFeedComponentProps) {
  const [alerts, setAlerts] = useState<POAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailCopied, setEmailCopied] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadAlerts();
  }, [showResolved]);

  const loadAlerts = async () => {
    setLoading(true);

    let query = supabase
      .from('po_alert_log')
      .select('*')
      .order('priority_level', { ascending: true }) // Critical first (alphabetically)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!showResolved) {
      query = query.is('resolved_at', null).is('dismissed_by', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error loading alerts:', error);
      setLoading(false);
      return;
    }

    // Sort to ensure critical appears first (custom sort)
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = (data || []).sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority_level] - priorityOrder[b.priority_level];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    setAlerts(sorted);
    setLoading(false);
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'critical':
        return 'border-red-500 bg-red-50';
      case 'high':
        return 'border-orange-500 bg-orange-50';
      case 'medium':
        return 'border-yellow-500 bg-yellow-50';
      default:
        return 'border-gray-300 bg-gray-50';
    }
  };

  const getPriorityIcon = (priority: string): string => {
    switch (priority) {
      case 'critical':
        return '🚨';
      case 'high':
        return '⚠️';
      case 'medium':
        return '📋';
      default:
        return '🔇';
    }
  };

  const getPriorityBadgeColor = (priority: string): string => {
    switch (priority) {
      case 'critical':
        return 'bg-red-600 text-white';
      case 'high':
        return 'bg-orange-600 text-white';
      case 'medium':
        return 'bg-yellow-600 text-white';
      default:
        return 'bg-gray-600 text-white';
    }
  };

  const handleCopyEmail = async (alert: POAlert) => {
    if (!alert.draft_vendor_email) return;

    try {
      await navigator.clipboard.writeText(alert.draft_vendor_email);
      setEmailCopied(alert.id);
      setTimeout(() => setEmailCopied(null), 2000);
    } catch (error) {
      console.error('Failed to copy email:', error);
    }
  };

  const handleSendEmail = (alert: POAlert) => {
    if (!alert.draft_vendor_email) return;

    // Extract subject and body
    const lines = alert.draft_vendor_email.split('\n');
    const subjectLine = lines.find((l) => l.startsWith('Subject:'));
    const subject = subjectLine ? subjectLine.replace('Subject:', '').trim() : '';
    const body = alert.draft_vendor_email
      .replace(subjectLine || '', '')
      .trim();

    // Open default email client
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  };

  const handleMarkResolved = async (alert: POAlert) => {
    const { error } = await supabase
      .from('po_alert_log')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: 'current_user', // TODO: Get actual user ID
      })
      .eq('id', alert.id);

    if (error) {
      console.error('Failed to mark as resolved:', error);
      return;
    }

    loadAlerts();
  };

  const handleDismiss = async (alert: POAlert) => {
    const { error } = await supabase
      .from('po_alert_log')
      .update({
        dismissed_by: 'current_user', // TODO: Get actual user ID
      })
      .eq('id', alert.id);

    if (error) {
      console.error('Failed to dismiss:', error);
      return;
    }

    loadAlerts();
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const groupByPriority = () => {
    const groups: Record<string, POAlert[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };

    alerts.forEach((alert) => {
      groups[alert.priority_level].push(alert);
    });

    return groups;
  };

  if (loading) {
    return <div className="p-4 text-gray-500">Loading alerts...</div>;
  }

  const groups = groupByPriority();
  const criticalCount = groups.critical.length;
  const highCount = groups.high.length;
  const mediumCount = groups.medium.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">PO Delay Alerts</h2>
        <div className="flex gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${criticalCount > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
            {criticalCount} Critical
          </span>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${highCount > 0 ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'}`}>
            {highCount} High
          </span>
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
            {mediumCount} Medium
          </span>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-12 bg-green-50 border border-green-200 rounded-lg">
          <div className="text-6xl mb-4">✅</div>
          <div className="text-xl font-semibold text-green-900">No Active Alerts</div>
          <div className="text-sm text-green-700 mt-2">
            All purchase orders are on track. The Air Traffic Controller is monitoring for delays.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Critical Alerts */}
          {groups.critical.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-red-900 mb-3 flex items-center gap-2">
                🚨 CRITICAL ({groups.critical.length})
              </h3>
              <div className="space-y-3">
                {groups.critical.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onCopyEmail={handleCopyEmail}
                    onSendEmail={handleSendEmail}
                    onMarkResolved={handleMarkResolved}
                    onDismiss={handleDismiss}
                    emailCopied={emailCopied === alert.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* High Priority Alerts */}
          {groups.high.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-orange-900 mb-3 flex items-center gap-2">
                ⚠️ HIGH ({groups.high.length})
              </h3>
              <div className="space-y-3">
                {groups.high.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onCopyEmail={handleCopyEmail}
                    onSendEmail={handleSendEmail}
                    onMarkResolved={handleMarkResolved}
                    onDismiss={handleDismiss}
                    emailCopied={emailCopied === alert.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Medium Priority Alerts */}
          {groups.medium.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-yellow-900 mb-3 flex items-center gap-2">
                📋 MEDIUM ({groups.medium.length})
              </h3>
              <div className="space-y-3">
                {groups.medium.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onCopyEmail={handleCopyEmail}
                    onSendEmail={handleSendEmail}
                    onMarkResolved={handleMarkResolved}
                    onDismiss={handleDismiss}
                    emailCopied={emailCopied === alert.id}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AlertCardProps {
  alert: POAlert;
  onCopyEmail: (alert: POAlert) => void;
  onSendEmail: (alert: POAlert) => void;
  onMarkResolved: (alert: POAlert) => void;
  onDismiss: (alert: POAlert) => void;
  emailCopied: boolean;
}

function AlertCard({
  alert,
  onCopyEmail,
  onSendEmail,
  onMarkResolved,
  onDismiss,
  emailCopied,
}: AlertCardProps) {
  const [showEmail, setShowEmail] = useState(false);

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'critical':
        return 'border-red-500 bg-red-50';
      case 'high':
        return 'border-orange-500 bg-orange-50';
      case 'medium':
        return 'border-yellow-500 bg-yellow-50';
      default:
        return 'border-gray-300 bg-gray-50';
    }
  };

  const getPriorityBadgeColor = (priority: string): string => {
    switch (priority) {
      case 'critical':
        return 'bg-red-600 text-white';
      case 'high':
        return 'bg-orange-600 text-white';
      case 'medium':
        return 'bg-yellow-600 text-white';
      default:
        return 'bg-gray-600 text-white';
    }
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className={`border-l-4 rounded-lg p-4 ${getPriorityColor(alert.priority_level)}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${getPriorityBadgeColor(alert.priority_level)}`}>
              {alert.priority_level}
            </span>
            <span className="text-sm font-semibold text-gray-700">
              PO #{alert.po_number}
            </span>
            <span className="text-xs text-gray-500">•</span>
            <span className="text-sm text-gray-600">{alert.vendor_name}</span>
          </div>
          <div className="text-xs text-gray-500">
            Delayed {alert.delay_days} days: {formatDate(alert.original_eta)} → {formatDate(alert.new_eta)}
          </div>
        </div>
      </div>

      {/* Impact Summary */}
      <div className="mb-3">
        <div className="text-sm font-semibold text-gray-900 mb-1">{alert.impact_summary}</div>
        <div className="text-xs text-gray-700">{alert.recommended_action}</div>
      </div>

      {/* Affected Items */}
      {alert.affected_items && alert.affected_items.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-gray-700 mb-1">Affected Items:</div>
          <div className="space-y-1">
            {alert.affected_items.map((item) => (
              <div key={item.sku} className="text-xs bg-white bg-opacity-60 rounded px-2 py-1">
                <span className="font-medium">{item.name}</span> ({item.sku}):{' '}
                <span className="text-gray-600">
                  {item.current_stock} units, {item.days_until_stockout} days until stockout
                </span>
                {item.impact_level === 'critical' && (
                  <span className="ml-2 text-red-600 font-semibold">⚠️ CRITICAL</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Draft Email */}
      {alert.draft_vendor_email && (
        <div className="mb-3">
          <button
            onClick={() => setShowEmail(!showEmail)}
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline mb-2"
          >
            {showEmail ? '▼ Hide Draft Email' : '▶ Show Draft Email'}
          </button>
          {showEmail && (
            <div className="bg-white border border-gray-300 rounded p-3 text-xs font-mono whitespace-pre-wrap">
              {alert.draft_vendor_email}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {alert.draft_vendor_email && (
          <>
            <button
              onClick={() => onSendEmail(alert)}
              className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700"
            >
              📧 Send Email
            </button>
            <button
              onClick={() => onCopyEmail(alert)}
              className="px-3 py-1 bg-gray-600 text-white text-xs font-semibold rounded hover:bg-gray-700"
            >
              {emailCopied ? '✓ Copied!' : '📋 Copy Email'}
            </button>
          </>
        )}
        <button
          onClick={() => onMarkResolved(alert)}
          className="px-3 py-1 bg-green-600 text-white text-xs font-semibold rounded hover:bg-green-700"
        >
          ✓ Mark Resolved
        </button>
        <button
          onClick={() => onDismiss(alert)}
          className="px-3 py-1 bg-gray-400 text-white text-xs font-semibold rounded hover:bg-gray-500"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
