/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SYSTEM HEALTH WIDGET
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Compact widget showing system health status for Dashboard display.
 * Shows sync status, email polling, and any active alerts.
 *
 * Part of: Solid UX Initiative
 */

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  RefreshCcwIcon,
  MailIcon,
  ServerStackIcon,
  ClockIcon,
} from './icons';

interface HealthStatus {
  finale_sync_status: 'healthy' | 'warning' | 'stale';
  hours_since_full_sync: number;
  email_polling_status: 'healthy' | 'warning' | 'stale' | 'not_configured';
  active_inboxes: number;
  error_inboxes: number;
  critical_alerts: number;
  error_alerts: number;
  warning_alerts: number;
  overall_status: 'healthy' | 'warning' | 'error' | 'critical';
  last_full_sync: string;
  oldest_poll: string;
}

interface SystemHealthWidgetProps {
  onNavigateToSettings?: () => void;
  compact?: boolean;
}

const SystemHealthWidget: React.FC<SystemHealthWidgetProps> = ({
  onNavigateToSettings,
  compact = false,
}) => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('sync_health_status')
        .select('*')
        .single();

      if (error) {
        // View might not exist yet, use fallback
        console.warn('[SystemHealthWidget] Health view not available:', error);
        setHealth(null);
        return;
      }

      setHealth(data);
    } catch (err) {
      console.error('[SystemHealthWidget] Error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60 * 1000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchHealth();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />;
      case 'error':
      case 'stale':
        return <XCircleIcon className="w-5 h-5 text-red-500" />;
      case 'critical':
        return <XCircleIcon className="w-5 h-5 text-red-600 animate-pulse" />;
      default:
        return <ClockIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'warning':
        return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'error':
      case 'stale':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'critical':
        return 'text-red-700 bg-red-100 border-red-300';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
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

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3"></div>
        <div className="h-8 bg-gray-200 rounded w-full"></div>
      </div>
    );
  }

  if (!health) {
    // Fallback when view doesn't exist
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">System Health</h3>
        </div>
        <div className="text-sm text-gray-500">
          Health monitoring initializing...
        </div>
      </div>
    );
  }

  const totalAlerts = health.critical_alerts + health.error_alerts + health.warning_alerts;

  if (compact) {
    // Ultra-compact version for tight spaces
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${getStatusColor(health.overall_status)}`}
        onClick={onNavigateToSettings}
        title="Click to view system health details"
      >
        {getStatusIcon(health.overall_status)}
        <span className="text-sm font-medium">
          {health.overall_status === 'healthy' ? 'All Systems OK' :
           health.overall_status === 'warning' ? `${totalAlerts} Warning${totalAlerts !== 1 ? 's' : ''}` :
           `${totalAlerts} Issue${totalAlerts !== 1 ? 's' : ''}`}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">System Health</h3>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title="Refresh status"
        >
          <RefreshCcwIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Overall Status */}
      <div className={`flex items-center gap-3 p-3 rounded-lg border mb-4 ${getStatusColor(health.overall_status)}`}>
        {getStatusIcon(health.overall_status)}
        <div>
          <p className="font-semibold">
            {health.overall_status === 'healthy' ? 'All Systems Operational' :
             health.overall_status === 'warning' ? 'Attention Needed' :
             health.overall_status === 'error' ? 'Issues Detected' :
             'Critical Issues'}
          </p>
          {totalAlerts > 0 && (
            <p className="text-xs opacity-80">
              {health.critical_alerts > 0 && `${health.critical_alerts} critical, `}
              {health.error_alerts > 0 && `${health.error_alerts} errors, `}
              {health.warning_alerts > 0 && `${health.warning_alerts} warnings`}
            </p>
          )}
        </div>
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Finale Sync */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <ServerStackIcon className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500">Data Sync</span>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon(health.finale_sync_status)}
            <div>
              <p className="text-sm font-medium text-gray-700">
                {health.finale_sync_status === 'healthy' ? 'Current' :
                 health.finale_sync_status === 'warning' ? 'Delayed' : 'Stale'}
              </p>
              <p className="text-xs text-gray-500">
                {formatTimeAgo(health.last_full_sync)}
              </p>
            </div>
          </div>
        </div>

        {/* Email Polling */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <MailIcon className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500">Email Polling</span>
          </div>
          <div className="flex items-center gap-2">
            {health.email_polling_status === 'not_configured' ? (
              <ClockIcon className="w-5 h-5 text-gray-400" />
            ) : (
              getStatusIcon(health.email_polling_status)
            )}
            <div>
              <p className="text-sm font-medium text-gray-700">
                {health.email_polling_status === 'not_configured' ? 'Not Set Up' :
                 health.email_polling_status === 'healthy' ? 'Active' :
                 health.email_polling_status === 'warning' ? 'Delayed' : 'Stopped'}
              </p>
              <p className="text-xs text-gray-500">
                {health.email_polling_status === 'not_configured'
                  ? 'Configure in Settings'
                  : health.error_inboxes > 0
                    ? `${health.error_inboxes} inbox error${health.error_inboxes !== 1 ? 's' : ''}`
                    : `${health.active_inboxes} inbox${health.active_inboxes !== 1 ? 'es' : ''}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Button */}
      {health.overall_status !== 'healthy' && onNavigateToSettings && (
        <button
          onClick={onNavigateToSettings}
          className="w-full mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
        >
          View Details & Fix Issues
        </button>
      )}
    </div>
  );
};

export default SystemHealthWidget;
