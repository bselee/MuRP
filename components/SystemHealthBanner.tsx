/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SYSTEM HEALTH BANNER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Displays a banner ONLY for truly critical system issues that need immediate attention.
 *
 * Design principle: Don't cry wolf
 * - Sync failures are shown in DataSyncIndicator, NOT here
 * - Only CRITICAL alerts appear in this banner
 * - Users should trust that if this banner appears, it's important
 *
 * What DOES show here:
 * - OAuth token expired (can't authenticate)
 * - Critical integration failures
 *
 * What does NOT show here:
 * - Sync failures (handled by DataSyncIndicator)
 * - Data staleness (informational)
 * - Warnings or errors (not critical)
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
      // Only show CRITICAL alerts in the banner
      // Regular sync failures should NOT interrupt the user - they can check sync status
      const { data, error } = await supabase
        .from('system_health_alerts')
        .select('*')
        .eq('is_resolved', false)
        .eq('user_dismissed', false)
        .eq('severity', 'critical') // ONLY critical - not warnings or errors
        .not('alert_type', 'eq', 'sync_failure') // Never show sync failures in banner
        .not('alert_type', 'eq', 'data_stale') // Data staleness is informational
        .order('created_at', { ascending: false })
        .limit(5);

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

  // Filter out dismissed alerts and non-critical issues
  // Banner should ONLY show things that truly need immediate attention
  const visibleAlerts = useMemo(() => {
    const dbAlerts = alerts.filter(a => !dismissed.has(a.id));

    // Map context alerts
    const mappedContextAlerts: HealthAlert[] = contextAlerts
      .map(alert => {
        const isSync = alert.source.includes('sync') || alert.source === 'google-sheets';
         // Force sync alerts to be treated as non-critical warnings for the banner
         // This moves them from the big red banner to the minimal indicator
        const effectiveSeverity = isSync ? 'warning' : alert.severity;
        
        return {
            id: alert.id,
            alert_type: isSync ? 'sync_failure' : 'integration_error',
            severity: effectiveSeverity,
            title: isSync && alert.source === 'google-sheets' ? 'Sheets Sync' : `Alert: ${alert.source}`,
            message: alert.message,
            component: alert.source,
            context_data: {},
            created_at: alert.timestamp || new Date().toISOString(),
            user_dismissed: false
        };
      });

    return [...mappedContextAlerts, ...dbAlerts];
  }, [alerts, contextAlerts, dismissed]);

  // Separate alerts
  const criticalAlert = visibleAlerts.find(a => a.severity === 'critical');
  const minimalAlert = !criticalAlert ? visibleAlerts[0] : null;

  if (!criticalAlert && !minimalAlert) {
    return null;
  }

  // --- 1. CRITICAL BANNER (Big Red) ---
  if (criticalAlert) {
      const styles = getSeverityStyles(criticalAlert.severity);
      return (
        <div className={`${styles.banner} border-b shadow-lg`}>
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`${styles.icon} flex-shrink-0`}>
                  <XCircleIcon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`font-semibold ${styles.text}`}>
                    {criticalAlert.title}
                  </span>
                  <p className={`text-sm ${styles.text} opacity-90 truncate`}>
                    {criticalAlert.message}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {onNavigateToSettings && (
                  <button
                    onClick={onNavigateToSettings}
                    className={`${styles.button} px-3 py-1.5 rounded text-sm font-medium transition-colors`}
                  >
                    Fix
                  </button>
                )}
                <button 
                  onClick={() => handleDismiss(criticalAlert.id)}
                  className={`p-1 rounded hover:bg-black/10 transition-colors ${styles.text}`}
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      );
  }

  // --- 2. MINIMAL INDICATOR (Floating Pill) ---
  if (minimalAlert) {
      const isError = minimalAlert.severity === 'error' || minimalAlert.severity === 'critical';
      const isWarning = minimalAlert.severity === 'warning';
      
      // Determine colors
      let bgClass = 'bg-white dark:bg-gray-800';
      let indicatorClass = 'bg-blue-500';
      if (isError) indicatorClass = 'bg-red-500';
      else if (isWarning) indicatorClass = 'bg-amber-500';

      return (
        <div className="absolute top-20 right-6 z-50 pointer-events-none flex justify-end">
             <div className="pointer-events-auto bg-white/95 dark:bg-gray-800/95 backdrop-blur shadow-lg border border-gray-200 dark:border-gray-700 rounded-full pl-2 pr-3 py-1.5 flex items-center gap-3 max-w-sm animate-in fade-in slide-in-from-right-8 duration-500">
                <div className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${indicatorClass} ${isError ? 'animate-pulse' : ''}`} />
                
                <div className="flex flex-col min-w-0">
                     <span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate max-w-[200px]">
                        {minimalAlert.message}
                     </span>
                </div>

                 <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 mx-1 flex-shrink-0" />
                 
                 <div className="flex items-center gap-2 flex-shrink-0">
                    {onNavigateToSettings && (
                        <button
                            onClick={onNavigateToSettings}
                            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                        Check
                        </button>
                    )}
                    <button
                        onClick={() => handleDismiss(minimalAlert.id)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                 </div>
             </div>
        </div>
      );
  }

  return null;
};

export default SystemHealthBanner;
