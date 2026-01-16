/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📢 SLACK INTEGRATION PANEL - Company & User Slack Configuration
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive Slack setup including:
 * - Company workspace configuration
 * - Channel routing by alert type
 * - Quality gate configuration
 * - Alert queue management
 *
 * Note: Rube MCP tools are now configured in Settings -> AI -> MCP Integrations
 */

import React, { useState, useEffect } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import Button from '@/components/ui/Button';
import {
  SlackIcon,
  SettingsIcon,
  CheckCircleIcon,
  RefreshIcon,
  HashtagIcon,
  BellIcon,
  ShieldCheckIcon,
} from '@/components/icons';
import { testSlackConnection, getSlackStatus } from '@/services/slackService';
import {
  getQualityGateConfig,
  saveQualityGateConfig,
  getAlertStats,
  getPendingAlerts,
  manuallyVerifyAlert,
  suppressAlert,
  type QualityGateConfig,
  type AlertQueueItem,
} from '@/services/slackQualityGate';
import { supabase } from '@/lib/supabase/client';
import {
  SettingsCard,
  SettingsInput,
  SettingsSelect,
  SettingsTabs,
  SettingsStatusBadge,
  SettingsLoading,
  SettingsRow,
  SettingsButtonGroup,
  SettingsDivider,
} from './ui';

// ============================================================================
// TYPES
// ============================================================================

interface SlackWorkspaceConfig {
  webhook_url: string;
  workspace_name?: string;
  default_channel?: string;
  // Channel routing by alert type
  channels: {
    stockout?: string;
    po_overdue?: string;
    requisition?: string;
    agent_action?: string;
    invoice?: string;
    daily_summary?: string;
  };
  // Composio configuration
  composio_enabled: boolean;
  composio_api_key?: string;
}

interface SlackIntegrationPanelProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

const SlackIntegrationPanel: React.FC<SlackIntegrationPanelProps> = ({ addToast }) => {
  const { isDark } = useTheme();

  // State
  const [activeTab, setActiveTab] = useState<string>('setup');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Configuration state
  const [workspaceConfig, setWorkspaceConfig] = useState<SlackWorkspaceConfig>({
    webhook_url: '',
    channels: {},
    composio_enabled: false,
  });
  const [qualityConfig, setQualityConfig] = useState<QualityGateConfig | null>(null);
  const [alertStats, setAlertStats] = useState<{
    pending: number;
    sent_today: number;
    suppressed_today: number;
    rate_limit_remaining: number;
  } | null>(null);
  const [pendingAlerts, setPendingAlerts] = useState<AlertQueueItem[]>([]);

  // Connection status
  const [connectionStatus, setConnectionStatus] = useState<{
    webhookConfigured: boolean;
    lastTested?: string;
    testResult?: boolean;
  }>({ webhookConfigured: false });

  // Load configuration on mount
  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    setLoading(true);
    try {
      // Load workspace config from app_settings
      const { data: configData } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'slack_workspace_config')
        .single();

      if (configData?.setting_value) {
        setWorkspaceConfig(configData.setting_value);
      }

      // Load quality gate config
      const qConfig = await getQualityGateConfig();
      setQualityConfig(qConfig);

      // Load alert stats
      const stats = await getAlertStats();
      setAlertStats(stats);

      // Load pending alerts
      const pending = await getPendingAlerts(20);
      setPendingAlerts(pending);

      // Check connection status
      const status = await getSlackStatus();
      setConnectionStatus(status);
    } catch (error) {
      console.error('Failed to load Slack configuration:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveWorkspaceConfig = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          setting_key: 'slack_workspace_config',
          setting_value: workspaceConfig,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      // Also save webhook URL to the dedicated setting
      await supabase
        .from('app_settings')
        .upsert({
          setting_key: 'slack_webhook_url',
          setting_value: workspaceConfig.webhook_url,
          updated_at: new Date().toISOString(),
        });

      addToast?.('Slack configuration saved', 'success');
      await loadConfiguration();
    } catch (error) {
      addToast?.(`Failed to save: ${error}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveQualitySettings = async () => {
    if (!qualityConfig) return;

    setSaving(true);
    try {
      const result = await saveQualityGateConfig(qualityConfig);
      if (result.success) {
        addToast?.('Quality gate settings saved', 'success');
      } else {
        addToast?.(`Failed to save: ${result.error}`, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const result = await testSlackConnection(workspaceConfig.webhook_url || undefined);
      if (result.success) {
        addToast?.('Test message sent to Slack!', 'success');
        setConnectionStatus(prev => ({
          ...prev,
          lastTested: new Date().toISOString(),
          testResult: true,
        }));
      } else {
        addToast?.(`Test failed: ${result.error}`, 'error');
        setConnectionStatus(prev => ({
          ...prev,
          lastTested: new Date().toISOString(),
          testResult: false,
        }));
      }
    } finally {
      setTesting(false);
    }
  };

  const handleVerifyAlert = async (alertId: string) => {
    const result = await manuallyVerifyAlert(alertId);
    if (result.success) {
      addToast?.('Alert verified and will be sent', 'success');
      const pending = await getPendingAlerts(20);
      setPendingAlerts(pending);
      const stats = await getAlertStats();
      setAlertStats(stats);
    }
  };

  const handleSuppressAlert = async (alertId: string) => {
    const result = await suppressAlert(alertId, 'Manually suppressed');
    if (result.success) {
      addToast?.('Alert suppressed', 'info');
      const pending = await getPendingAlerts(20);
      setPendingAlerts(pending);
      const stats = await getAlertStats();
      setAlertStats(stats);
    }
  };

  // Tab configuration
  const tabs = [
    { id: 'setup', label: 'Setup', icon: <SettingsIcon className="w-4 h-4" /> },
    { id: 'channels', label: 'Channels', icon: <HashtagIcon className="w-4 h-4" /> },
    { id: 'quality', label: 'Quality Gate', icon: <ShieldCheckIcon className="w-4 h-4" /> },
    { id: 'queue', label: 'Alert Queue', icon: <BellIcon className="w-4 h-4" />, badge: alertStats?.pending || undefined },
  ];

  if (loading) {
    return (
      <SettingsCard>
        <SettingsLoading message="Loading configuration..." />
      </SettingsCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SlackIcon className={`w-8 h-8 ${isDark ? 'text-white' : 'text-gray-800'}`} />
          <div>
            <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Slack Integration
            </h2>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Configure company Slack workspace and notification settings
            </p>
          </div>
        </div>

        {/* Connection Status */}
        <SettingsStatusBadge variant={connectionStatus.webhookConfigured ? 'success' : 'warning'}>
          {connectionStatus.webhookConfigured ? 'Connected' : 'Not configured'}
        </SettingsStatusBadge>
      </div>

      {/* Tabs */}
      <SettingsTabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        variant="pills"
      />

      {/* Tab Content */}
      {activeTab === 'setup' && (
        <SettingsCard title="Workspace Configuration">
          <div className="space-y-4">
            <SettingsInput
              label="Workspace Name (optional)"
              value={workspaceConfig.workspace_name || ''}
              onChange={(e) => setWorkspaceConfig(prev => ({ ...prev, workspace_name: e.target.value }))}
              placeholder="My Company"
            />

            <SettingsInput
              label="Incoming Webhook URL *"
              type="url"
              value={workspaceConfig.webhook_url}
              onChange={(e) => setWorkspaceConfig(prev => ({ ...prev, webhook_url: e.target.value }))}
              placeholder="https://hooks.slack.com/services/..."
              helpText={
                <>
                  Create a Slack App → Incoming Webhooks → Add to channel →{' '}
                  <a
                    href="https://api.slack.com/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-400 hover:underline"
                  >
                    api.slack.com/apps
                  </a>
                </>
              }
            />

            <SettingsInput
              label="Default Channel"
              value={workspaceConfig.default_channel || ''}
              onChange={(e) => setWorkspaceConfig(prev => ({ ...prev, default_channel: e.target.value }))}
              placeholder="#murp-alerts"
            />

            <SettingsButtonGroup>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || !workspaceConfig.webhook_url}
                className={`px-4 py-2 rounded-lg border transition-colors ${isDark
                  ? 'border-gray-600 text-gray-300 hover:bg-gray-700 disabled:opacity-50'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50'
                }`}
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              <Button
                onClick={saveWorkspaceConfig}
                disabled={saving || !workspaceConfig.webhook_url}
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
            </SettingsButtonGroup>
          </div>
        </SettingsCard>
      )}

      {activeTab === 'channels' && (
        <SettingsCard
          title="Channel Routing"
          description="Route different alert types to specific channels. Leave empty to use default channel."
        >
          <div className="space-y-3">
            {[
              { key: 'stockout', label: 'Stockout Alerts', placeholder: '#inventory-alerts' },
              { key: 'po_overdue', label: 'PO Overdue Alerts', placeholder: '#purchasing' },
              { key: 'requisition', label: 'Requisition Notifications', placeholder: '#requisitions' },
              { key: 'agent_action', label: 'AI Agent Actions', placeholder: '#ai-actions' },
              { key: 'invoice', label: 'Invoice Notifications', placeholder: '#accounting' },
              { key: 'daily_summary', label: 'Daily Summary', placeholder: '#daily-briefing' },
            ].map(({ key, label, placeholder }) => (
              <SettingsRow key={key} label={label}>
                <input
                  type="text"
                  value={workspaceConfig.channels[key as keyof typeof workspaceConfig.channels] || ''}
                  onChange={(e) => setWorkspaceConfig(prev => ({
                    ...prev,
                    channels: { ...prev.channels, [key]: e.target.value || undefined },
                  }))}
                  placeholder={placeholder}
                  className={`w-48 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    isDark
                      ? 'bg-gray-900 border-gray-700 text-white placeholder-gray-500 focus:border-gray-500'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-gray-400'
                  } focus:outline-none focus:ring-2 focus:ring-accent-500/20`}
                />
              </SettingsRow>
            ))}
          </div>

          <SettingsButtonGroup>
            <Button onClick={saveWorkspaceConfig} disabled={saving}>
              {saving ? 'Saving...' : 'Save Channel Routing'}
            </Button>
          </SettingsButtonGroup>
        </SettingsCard>
      )}

      {activeTab === 'quality' && qualityConfig && (
        <SettingsCard
          title="Quality Gate Settings"
          description="Control alert frequency and prevent notification fatigue."
        >
          {/* Stats Grid */}
          {alertStats && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Pending Review', value: alertStats.pending, color: 'text-amber-400' },
                { label: 'Sent Today', value: alertStats.sent_today, color: 'text-emerald-400' },
                { label: 'Suppressed', value: alertStats.suppressed_today, color: 'text-gray-400' },
                { label: 'Rate Limit Left', value: alertStats.rate_limit_remaining, color: 'text-cyan-400' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className={`p-3 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}
                >
                  <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{stat.label}</p>
                  <p className={`text-2xl font-semibold ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          )}

          <SettingsDivider className="my-6" />

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <SettingsInput
                label="Dedup Cooldown (minutes)"
                type="number"
                value={qualityConfig.dedup_cooldown_minutes}
                onChange={(e) => setQualityConfig(prev => prev ? {
                  ...prev,
                  dedup_cooldown_minutes: parseInt(e.target.value) || 60,
                } : prev)}
                min={1}
                max={1440}
                helpText="Don't repeat same alert within this period"
              />

              <SettingsInput
                label="Max Alerts Per Hour"
                type="number"
                value={qualityConfig.max_alerts_per_hour}
                onChange={(e) => setQualityConfig(prev => prev ? {
                  ...prev,
                  max_alerts_per_hour: parseInt(e.target.value) || 20,
                } : prev)}
                min={1}
                max={100}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <SettingsSelect
                label="Minimum Severity to Send"
                value={qualityConfig.min_severity}
                onChange={(e) => setQualityConfig(prev => prev ? {
                  ...prev,
                  min_severity: e.target.value as QualityGateConfig['min_severity'],
                } : prev)}
                options={[
                  { value: 'critical', label: 'Critical only' },
                  { value: 'high', label: 'High and above' },
                  { value: 'medium', label: 'Medium and above' },
                  { value: 'low', label: 'Low and above' },
                  { value: 'info', label: 'All alerts' },
                ]}
              />

              <SettingsSelect
                label="Auto-Verify Below Severity"
                value={qualityConfig.auto_verify_below_severity}
                onChange={(e) => setQualityConfig(prev => prev ? {
                  ...prev,
                  auto_verify_below_severity: e.target.value as QualityGateConfig['auto_verify_below_severity'],
                } : prev)}
                options={[
                  { value: 'critical', label: 'None (all need review)' },
                  { value: 'high', label: 'High and below' },
                  { value: 'medium', label: 'Medium and below' },
                  { value: 'low', label: 'Low and below' },
                  { value: 'info', label: 'All (no review needed)' },
                ]}
                helpText="Alerts above this need manual verification"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <SettingsInput
                label="Quiet Hours Start"
                type="time"
                value={qualityConfig.quiet_hours_start || ''}
                onChange={(e) => setQualityConfig(prev => prev ? {
                  ...prev,
                  quiet_hours_start: e.target.value || undefined,
                } : prev)}
              />

              <SettingsInput
                label="Quiet Hours End"
                type="time"
                value={qualityConfig.quiet_hours_end || ''}
                onChange={(e) => setQualityConfig(prev => prev ? {
                  ...prev,
                  quiet_hours_end: e.target.value || undefined,
                } : prev)}
              />
            </div>
          </div>

          <SettingsButtonGroup>
            <Button onClick={saveQualitySettings} disabled={saving}>
              {saving ? 'Saving...' : 'Save Quality Settings'}
            </Button>
          </SettingsButtonGroup>
        </SettingsCard>
      )}

      {activeTab === 'queue' && (
        <SettingsCard
          title="Alert Queue"
          description="Review and manage pending alerts before they are sent to Slack."
        >
          {pendingAlerts.length === 0 ? (
            <div className={`text-center py-8 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              <CheckCircleIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No pending alerts to review</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border ${isDark
                    ? 'bg-gray-900 border-gray-700'
                    : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <SettingsStatusBadge
                          variant={
                            alert.severity === 'critical'
                              ? 'error'
                              : alert.severity === 'high'
                              ? 'warning'
                              : 'neutral'
                          }
                          size="sm"
                          icon={false}
                        >
                          {alert.severity.toUpperCase()}
                        </SettingsStatusBadge>
                        <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                          {alert.alert_type.replace('_', ' ')}
                        </span>
                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          {new Date(alert.created_at).toLocaleString()}
                        </span>
                      </div>
                      <pre className={`text-xs overflow-x-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {JSON.stringify(alert.payload, null, 2).slice(0, 200)}...
                      </pre>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleVerifyAlert(alert.id)}
                        className="px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                      >
                        Send
                      </button>
                      <button
                        onClick={() => handleSuppressAlert(alert.id)}
                        className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                          isDark
                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                            : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        }`}
                      >
                        Suppress
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <SettingsButtonGroup>
            <button
              onClick={loadConfiguration}
              className={`px-4 py-2 rounded-lg border transition-colors flex items-center gap-2 ${isDark
                ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <RefreshIcon className="w-4 h-4" />
              Refresh
            </button>
          </SettingsButtonGroup>
        </SettingsCard>
      )}
    </div>
  );
};

export default SlackIntegrationPanel;
