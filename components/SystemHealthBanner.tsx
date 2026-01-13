/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SYSTEM HEALTH BANNER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Displays a prominent banner when system health issues need user attention.
 * This component ensures users are NEVER left in the dark about system failures.
 *
 * Part of: Solid UX Initiative
 * Principle: Systems should never fail silently
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase/client';
import { useSystemAlerts } from '../lib/systemAlerts/SystemAlertContext';
import {
  ExclamationTriangleIcon,
  XCircleIcon,
  CheckCircleIcon,
  XMarkIcon,
  RefreshCcwIcon,
  MailIcon,
  ServerStackIcon,
  LinkIcon,
} from './icons';

interface HealthAlert {
  id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  component: string;
  context_data: Record<string, any>;
  created_at: string;
  user_dismissed: boolean;
}

interface SystemHealthBannerProps {
  onNavigateToSettings?: () => void;
}

const SystemHealthBanner: React.FC<SystemHealthBannerProps> = ({ onNavigateToSettings }) => {
  const { alerts: contextAlerts, dismissAlert: dismissContextAlert } = useSystemAlerts();
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('system_health_alerts')
        .select('*')
        .eq('is_resolved', false)
        .eq('user_dismissed', false)
        .in('severity', ['warning', 'error', 'critical'])
        .order('severity', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('[SystemHealthBanner] Failed to fetch alerts:', error);
        return;
      }

      setAlerts(data || []);
    } catch (err) {
      console.error('[SystemHealthBanner] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();

    // Refresh every 5 minutes
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);

    // Subscribe to realtime updates
    const subscription = supabase
      .channel('health-alerts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_health_alerts' },
        () => fetchAlerts()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, [fetchAlerts]);

  const handleDismiss = async (alertId: string) => {
    // Handle context alerts (presumed transient or managed by context)
    if (contextAlerts.some(a => a.id === alertId)) {
      dismissContextAlert(alertId);
      return;
    }

    setDismissed(prev => new Set([...prev, alertId]));

    try {
      await supabase

        .from('system_health_alerts')
        .update({ user_dismissed: true, dismissed_at: new Date().toISOString() })
        .eq('id', alertId);
    } catch (err) {
      console.error('[SystemHealthBanner] Failed to dismiss alert:', err);
    }
  };

  const handleResolve = async (alertId: string) => {
    try {
      await supabase.rpc('resolve_health_alert', {
        p_alert_id: alertId,
        p_notes: 'Resolved by user from banner'
      });
      fetchAlerts();
    } catch (err) {
      console.error('[SystemHealthBanner] Failed to resolve alert:', err);
    }
  };

  const getIcon = (alertType: string) => {
    switch (alertType) {
      case 'email_polling_stopped':
      case 'oauth_expired':
        return <MailIcon className="w-5 h-5" />;
      case 'sync_failure':
      case 'data_stale':
        return <ServerStackIcon className="w-5 h-5" />;
      case 'integration_error':
        return <LinkIcon className="w-5 h-5" />;
      default:
        return <ExclamationTriangleIcon className="w-5 h-5" />;
    }
  };

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'critical':
        return {
          banner: 'bg-red-600 border-red-700',
          text: 'text-white',
          icon: 'text-white',
          button: 'bg-red-700 hover:bg-red-800 text-white',
        };
      case 'error':
        return {
          banner: 'bg-red-500/90 border-red-600',
          text: 'text-white',
          icon: 'text-red-100',
          button: 'bg-red-600 hover:bg-red-700 text-white',
        };
      case 'warning':
        return {
          banner: 'bg-amber-500/90 border-amber-600',
          text: 'text-amber-950',
          icon: 'text-amber-900',
          button: 'bg-amber-600 hover:bg-amber-700 text-white',
        };
      default:
        return {
          banner: 'bg-blue-500/90 border-blue-600',
          text: 'text-white',
          icon: 'text-blue-100',
          button: 'bg-blue-600 hover:bg-blue-700 text-white',
        };
    }
  };

  const getActionText = (alertType: string) => {
    switch (alertType) {
      case 'oauth_expired':
        return 'Reconnect';
      case 'email_polling_stopped':
        return 'Check Settings';
      case 'sync_failure':
      case 'data_stale':
        return 'View Sync Status';
      default:
        return 'View Details';
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  };

  // Filter out dismissed alerts
  const visibleAlerts = useMemo(() => {
    const dbAlerts = alerts.filter(a => !dismissed.has(a.id));
    
    // Map context alerts to HealthAlert format
    const mappedContextAlerts: HealthAlert[] = contextAlerts.map(alert => ({
      id: alert.id,
      alert_type: alert.source.includes('sync') || alert.source === 'google-sheets' ? 'sync_failure' : 'integration_error',
      severity: alert.severity,
      title: alert.source === 'google-sheets' ? 'Google Sheets Sync Issue' : `Alert: ${alert.source}`,
      message: alert.message,
      component: alert.source,
      context_data: {},
      created_at: alert.timestamp || new Date().toISOString(),
      user_dismissed: false
    }));

    return [...mappedContextAlerts, ...dbAlerts];
  }, [alerts, contextAlerts, dismissed]);

  if (visibleAlerts.length === 0) {
    return null;
  }

  const primaryAlert = visibleAlerts[0];
  const additionalCount = visibleAlerts.length - 1;
  const styles = getSeverityStyles(primaryAlert.severity);

  return (
    <div className={`${styles.banner} border-b shadow-lg`}>
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* Primary Alert */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`${styles.icon} flex-shrink-0`}>
              {primaryAlert.severity === 'critical' ? (
                <XCircleIcon className="w-6 h-6" />
              ) : (
                getIcon(primaryAlert.alert_type)
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${styles.text}`}>
                  {primaryAlert.title}
                </span>
                {additionalCount > 0 && (
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className={`text-xs ${styles.text} opacity-80 hover:opacity-100`}
                  >
                    +{additionalCount} more
                  </button>
                )}
              </div>
              <p className={`text-sm ${styles.text} opacity-90 truncate`}>
                {primaryAlert.message}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs ${styles.text} opacity-70`}>
              {formatTimeAgo(primaryAlert.created_at)}
            </span>

            {onNavigateToSettings && (
              <button
                onClick={onNavigateToSettings}
                className={`${styles.button} px-3 py-1.5 rounded text-sm font-medium transition-colors`}
              >
                {getActionText(primaryAlert.alert_type)}
              </button>
            )}

            <button
              onClick={() => handleDismiss(primaryAlert.id)}
              className={`${styles.text} opacity-70 hover:opacity-100 p-1`}
              title="Dismiss"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Expanded Additional Alerts */}
        {expanded && additionalCount > 0 && (
          <div className="mt-3 pt-3 border-t border-white/20 space-y-2">
            {visibleAlerts.slice(1).map(alert => (
              <div
                key={alert.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className={`${styles.icon} opacity-80`}>
                    {getIcon(alert.alert_type)}
                  </span>
                  <span className={`${styles.text} font-medium`}>
                    {alert.title}
                  </span>
                  <span className={`${styles.text} opacity-70 truncate`}>
                    - {alert.message}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${styles.text} opacity-60`}>
                    {formatTimeAgo(alert.created_at)}
                  </span>
                  <button
                    onClick={() => handleDismiss(alert.id)}
                    className={`${styles.text} opacity-60 hover:opacity-100`}
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemHealthBanner;
