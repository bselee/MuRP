/**
 * AlertsPanel - Display actionable alerts from email monitoring and pending actions
 *
 * Shows:
 * - Email-derived alerts (delays, backorders, stockout risks)
 * - Pending actions awaiting approval (draft POs from stock alerts)
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import { useTheme } from './ThemeProvider';

interface EmailAlert {
  id: string;
  alert_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  affected_skus: string[] | null;
  requires_human: boolean;
}

interface PendingAction {
  id: string;
  action_type: string;
  action_label: string;
  priority: string;
  confidence: number;
  reasoning: string | null;
  payload: any;
  created_at: string;
  status: string;
}

interface AlertsPanelProps {
  onActionApproved?: () => void;
}

const AlertsPanel: React.FC<AlertsPanelProps> = ({ onActionApproved }) => {
  const { isDark } = useTheme();
  const [alerts, setAlerts] = useState<EmailAlert[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch open email alerts
      const { data: alertsData, error: alertsError } = await supabase
        .from('email_tracking_alerts')
        .select('id, alert_type, severity, title, description, status, created_at, affected_skus, requires_human')
        .eq('status', 'open')
        .order('severity', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(50);

      if (alertsError) throw alertsError;
      setAlerts(alertsData || []);

      // Fetch pending actions
      const { data: actionsData, error: actionsError } = await supabase
        .from('pending_actions')
        .select('id, action_type, action_label, priority, confidence, reasoning, payload, created_at, status')
        .eq('status', 'pending')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(50);

      if (actionsError) throw actionsError;
      setPendingActions(actionsData || []);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDismissAlert = async (alertId: string) => {
    const { error } = await supabase
      .from('email_tracking_alerts')
      .update({ status: 'dismissed' })
      .eq('id', alertId);

    if (!error) {
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    }
  };

  const handleApproveAction = async (actionId: string) => {
    const { error } = await supabase
      .from('pending_actions')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', actionId);

    if (!error) {
      setPendingActions(prev => prev.filter(a => a.id !== actionId));
      onActionApproved?.();
    }
  };

  const handleRejectAction = async (actionId: string) => {
    const { error } = await supabase
      .from('pending_actions')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', actionId);

    if (!error) {
      setPendingActions(prev => prev.filter(a => a.id !== actionId));
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'normal': return 'bg-blue-500';
      case 'low': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const formatAlertType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const cardClass = isDark
    ? 'bg-gray-800 border-gray-700'
    : 'bg-white border-gray-200 shadow-sm';

  const textClass = isDark ? 'text-gray-100' : 'text-gray-900';
  const mutedClass = isDark ? 'text-gray-400' : 'text-gray-500';

  if (loading) {
    return (
      <div className={`p-6 rounded-lg border ${cardClass}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-300 rounded w-1/4"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 rounded-lg border ${cardClass}`}>
        <p className="text-red-500">Error: {error}</p>
        <button onClick={fetchData} className="mt-2 text-blue-500 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const totalAlerts = alerts.length + pendingActions.length;
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const urgentActions = pendingActions.filter(a => a.priority === 'urgent' || a.priority === 'high').length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`p-4 rounded-lg border ${cardClass}`}>
          <div className={`text-2xl font-bold ${textClass}`}>{totalAlerts}</div>
          <div className={mutedClass}>Total Alerts</div>
        </div>
        <div className={`p-4 rounded-lg border ${cardClass}`}>
          <div className="text-2xl font-bold text-red-500">{criticalCount}</div>
          <div className={mutedClass}>Critical</div>
        </div>
        <div className={`p-4 rounded-lg border ${cardClass}`}>
          <div className="text-2xl font-bold text-orange-500">{urgentActions}</div>
          <div className={mutedClass}>Urgent Actions</div>
        </div>
        <div className={`p-4 rounded-lg border ${cardClass}`}>
          <div className="text-2xl font-bold text-blue-500">{pendingActions.length}</div>
          <div className={mutedClass}>Pending POs</div>
        </div>
      </div>

      {/* Pending Actions (POs needing approval) */}
      {pendingActions.length > 0 && (
        <div className={`rounded-lg border ${cardClass}`}>
          <div className={`px-4 py-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <h3 className={`font-semibold ${textClass}`}>
              Pending Actions ({pendingActions.length})
            </h3>
            <p className={`text-sm ${mutedClass}`}>Actions awaiting your approval</p>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {pendingActions.map(action => (
              <div key={action.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs font-medium text-white rounded ${getPriorityColor(action.priority)}`}>
                        {action.priority}
                      </span>
                      <span className={`font-medium ${textClass}`}>{action.action_label}</span>
                    </div>
                    {action.reasoning && (
                      <p className={`mt-1 text-sm ${mutedClass}`}>{action.reasoning}</p>
                    )}
                    {action.payload?.line_items && (
                      <div className={`mt-2 text-sm ${mutedClass}`}>
                        SKUs: {action.payload.line_items.map((i: any) => i.sku).join(', ')}
                      </div>
                    )}
                    <div className={`mt-1 text-xs ${mutedClass}`}>
                      Confidence: {Math.round((action.confidence || 0) * 100)}% |
                      Created: {new Date(action.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleApproveAction(action.id)}
                      className="px-3 py-1 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleRejectAction(action.id)}
                      className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-200 rounded hover:bg-gray-300 dark:text-gray-200 dark:bg-gray-600 dark:hover:bg-gray-500"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email Alerts */}
      {alerts.length > 0 && (
        <div className={`rounded-lg border ${cardClass}`}>
          <div className={`px-4 py-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <h3 className={`font-semibold ${textClass}`}>
              Email Alerts ({alerts.length})
            </h3>
            <p className={`text-sm ${mutedClass}`}>Alerts from email monitoring</p>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {alerts.map(alert => (
              <div key={alert.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs font-medium text-white rounded ${getSeverityColor(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                        {formatAlertType(alert.alert_type)}
                      </span>
                    </div>
                    <p className={`mt-1 font-medium ${textClass}`}>{alert.title}</p>
                    {alert.description && (
                      <p className={`mt-1 text-sm ${mutedClass}`}>{alert.description}</p>
                    )}
                    {alert.affected_skus && alert.affected_skus.length > 0 && (
                      <div className={`mt-1 text-xs ${mutedClass}`}>
                        SKUs: {alert.affected_skus.join(', ')}
                      </div>
                    )}
                    <div className={`mt-1 text-xs ${mutedClass}`}>
                      {new Date(alert.created_at).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDismissAlert(alert.id)}
                    className={`px-3 py-1 text-sm rounded ${isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {totalAlerts === 0 && (
        <div className={`p-8 rounded-lg border ${cardClass} text-center`}>
          <div className="text-4xl mb-2">✓</div>
          <h3 className={`font-semibold ${textClass}`}>All Clear</h3>
          <p className={mutedClass}>No alerts or pending actions at this time.</p>
        </div>
      )}
    </div>
  );
};

export default AlertsPanel;
