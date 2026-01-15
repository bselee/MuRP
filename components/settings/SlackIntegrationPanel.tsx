/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📢 SLACK INTEGRATION PANEL - Company & User Slack Configuration
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive Slack setup including:
 * - Company workspace configuration
 * - Channel routing by alert type
 * - User-specific channel overrides
 * - Composio/Rube integration setup
 * - Quality gate configuration
 * - Alert queue management
 */

import React, { useState, useEffect } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import Button from '@/components/ui/Button';
import {
  SlackIcon,
  SettingsIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  RefreshIcon,
  HashtagIcon,
  BellIcon,
  ShieldCheckIcon,
  LinkIcon,
} from '@/components/icons';
import { testSlackConnection, getSlackStatus, isComposioConfigured } from '@/services/slackService';
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
  const [activeTab, setActiveTab] = useState<'setup' | 'channels' | 'quality' | 'composio' | 'queue'>('setup');
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
    composioConfigured: boolean;
    lastTested?: string;
    testResult?: boolean;
  }>({ webhookConfigured: false, composioConfigured: false });

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
      setConnectionStatus({
        ...status,
        composioConfigured: isComposioConfigured(),
      });
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

  // Styles
  const cardClass = isDark
    ? 'bg-gray-800/50 border border-gray-700 rounded-xl p-6'
    : 'bg-white border border-gray-200 rounded-xl p-6 shadow-sm';

  const inputClass = isDark
    ? 'w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-gray-500 focus:outline-none'
    : 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:border-gray-500 focus:outline-none';

  const tabClass = (isActive: boolean) => `
    px-4 py-2 text-sm font-medium rounded-lg transition-colors
    ${isActive
      ? isDark
        ? 'bg-gray-700 text-white'
        : 'bg-gray-800 text-white'
      : isDark
        ? 'text-gray-400 hover:text-white hover:bg-gray-800'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
    }
  `;

  if (loading) {
    return (
      <div className={cardClass}>
        <div className="flex items-center justify-center py-12">
          <RefreshIcon className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-400">Loading configuration...</span>
        </div>
      </div>
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
        <div className="flex items-center gap-2">
          {connectionStatus.webhookConfigured ? (
            <span className="flex items-center gap-1 text-sm text-emerald-400">
              <CheckCircleIcon className="w-4 h-4" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-sm text-amber-400">
              <AlertCircleIcon className="w-4 h-4" />
              Not configured
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2">
        <button className={tabClass(activeTab === 'setup')} onClick={() => setActiveTab('setup')}>
          <SettingsIcon className="w-4 h-4 inline mr-1" />
          Setup
        </button>
        <button className={tabClass(activeTab === 'channels')} onClick={() => setActiveTab('channels')}>
          <HashtagIcon className="w-4 h-4 inline mr-1" />
          Channels
        </button>
        <button className={tabClass(activeTab === 'quality')} onClick={() => setActiveTab('quality')}>
          <ShieldCheckIcon className="w-4 h-4 inline mr-1" />
          Quality Gate
        </button>
        <button className={tabClass(activeTab === 'composio')} onClick={() => setActiveTab('composio')}>
          <LinkIcon className="w-4 h-4 inline mr-1" />
          Composio/Rube
        </button>
        <button className={tabClass(activeTab === 'queue')} onClick={() => setActiveTab('queue')}>
          <BellIcon className="w-4 h-4 inline mr-1" />
          Alert Queue
          {alertStats && alertStats.pending > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-500 text-white rounded-full">
              {alertStats.pending}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'setup' && (
        <div className={cardClass}>
          <h3 className={`text-lg font-medium mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Workspace Configuration
          </h3>

          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Workspace Name (optional)
              </label>
              <input
                type="text"
                value={workspaceConfig.workspace_name || ''}
                onChange={(e) => setWorkspaceConfig(prev => ({ ...prev, workspace_name: e.target.value }))}
                placeholder="My Company"
                className={inputClass}
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Incoming Webhook URL *
              </label>
              <input
                type="url"
                value={workspaceConfig.webhook_url}
                onChange={(e) => setWorkspaceConfig(prev => ({ ...prev, webhook_url: e.target.value }))}
                placeholder="https://hooks.slack.com/services/..."
                className={inputClass}
              />
              <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                Create a Slack App → Incoming Webhooks → Add to channel →{' '}
                <a
                  href="https://api.slack.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline"
                >
                  api.slack.com/apps
                </a>
              </p>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Default Channel
              </label>
              <input
                type="text"
                value={workspaceConfig.default_channel || ''}
                onChange={(e) => setWorkspaceConfig(prev => ({ ...prev, default_channel: e.target.value }))}
                placeholder="#murp-alerts"
                className={inputClass}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                onClick={saveWorkspaceConfig}
                disabled={saving || !workspaceConfig.webhook_url}
                className="flex-1"
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
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
            </div>
          </div>
        </div>
      )}

      {activeTab === 'channels' && (
        <div className={cardClass}>
          <h3 className={`text-lg font-medium mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Channel Routing
          </h3>
          <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Route different alert types to specific channels. Leave empty to use default channel.
          </p>

          <div className="grid gap-4">
            {[
              { key: 'stockout', label: 'Stockout Alerts', placeholder: '#inventory-alerts' },
              { key: 'po_overdue', label: 'PO Overdue Alerts', placeholder: '#purchasing' },
              { key: 'requisition', label: 'Requisition Notifications', placeholder: '#requisitions' },
              { key: 'agent_action', label: 'AI Agent Actions', placeholder: '#ai-actions' },
              { key: 'invoice', label: 'Invoice Notifications', placeholder: '#accounting' },
              { key: 'daily_summary', label: 'Daily Summary', placeholder: '#daily-briefing' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="flex items-center gap-4">
                <label className={`w-48 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  {label}
                </label>
                <input
                  type="text"
                  value={workspaceConfig.channels[key as keyof typeof workspaceConfig.channels] || ''}
                  onChange={(e) => setWorkspaceConfig(prev => ({
                    ...prev,
                    channels: { ...prev.channels, [key]: e.target.value || undefined },
                  }))}
                  placeholder={placeholder}
                  className={`flex-1 ${inputClass}`}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={saveWorkspaceConfig} disabled={saving}>
              {saving ? 'Saving...' : 'Save Channel Routing'}
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'quality' && qualityConfig && (
        <div className={cardClass}>
          <h3 className={`text-lg font-medium mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Quality Gate Settings
          </h3>
          <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Control alert frequency and prevent notification fatigue.
          </p>

          {/* Stats */}
          {alertStats && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className={`p-3 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Pending Review</p>
                <p className={`text-2xl font-semibold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                  {alertStats.pending}
                </p>
              </div>
              <div className={`p-3 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Sent Today</p>
                <p className={`text-2xl font-semibold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  {alertStats.sent_today}
                </p>
              </div>
              <div className={`p-3 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Suppressed</p>
                <p className={`text-2xl font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  {alertStats.suppressed_today}
                </p>
              </div>
              <div className={`p-3 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Rate Limit Left</p>
                <p className={`text-2xl font-semibold ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                  {alertStats.rate_limit_remaining}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Dedup Cooldown (minutes)
                </label>
                <input
                  type="number"
                  value={qualityConfig.dedup_cooldown_minutes}
                  onChange={(e) => setQualityConfig(prev => prev ? {
                    ...prev,
                    dedup_cooldown_minutes: parseInt(e.target.value) || 60,
                  } : prev)}
                  min={1}
                  max={1440}
                  className={inputClass}
                />
                <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                  Don't repeat same alert within this period
                </p>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Max Alerts Per Hour
                </label>
                <input
                  type="number"
                  value={qualityConfig.max_alerts_per_hour}
                  onChange={(e) => setQualityConfig(prev => prev ? {
                    ...prev,
                    max_alerts_per_hour: parseInt(e.target.value) || 20,
                  } : prev)}
                  min={1}
                  max={100}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Minimum Severity to Send
                </label>
                <select
                  value={qualityConfig.min_severity}
                  onChange={(e) => setQualityConfig(prev => prev ? {
                    ...prev,
                    min_severity: e.target.value as any,
                  } : prev)}
                  className={inputClass}
                >
                  <option value="critical">Critical only</option>
                  <option value="high">High and above</option>
                  <option value="medium">Medium and above</option>
                  <option value="low">Low and above</option>
                  <option value="info">All alerts</option>
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Auto-Verify Below Severity
                </label>
                <select
                  value={qualityConfig.auto_verify_below_severity}
                  onChange={(e) => setQualityConfig(prev => prev ? {
                    ...prev,
                    auto_verify_below_severity: e.target.value as any,
                  } : prev)}
                  className={inputClass}
                >
                  <option value="critical">None (all need review)</option>
                  <option value="high">High and below</option>
                  <option value="medium">Medium and below</option>
                  <option value="low">Low and below</option>
                  <option value="info">All (no review needed)</option>
                </select>
                <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                  Alerts above this need manual verification
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Quiet Hours Start
                </label>
                <input
                  type="time"
                  value={qualityConfig.quiet_hours_start || ''}
                  onChange={(e) => setQualityConfig(prev => prev ? {
                    ...prev,
                    quiet_hours_start: e.target.value || undefined,
                  } : prev)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Quiet Hours End
                </label>
                <input
                  type="time"
                  value={qualityConfig.quiet_hours_end || ''}
                  onChange={(e) => setQualityConfig(prev => prev ? {
                    ...prev,
                    quiet_hours_end: e.target.value || undefined,
                  } : prev)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={saveQualitySettings} disabled={saving}>
              {saving ? 'Saving...' : 'Save Quality Settings'}
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'composio' && (
        <div className={cardClass}>
          <h3 className={`text-lg font-medium mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Composio / Rube Integration
          </h3>
          <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Enable advanced two-way Slack integration with interactive buttons, slash commands, and more.
          </p>

          <div className={`p-4 rounded-lg mb-4 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-3 h-3 rounded-full ${connectionStatus.composioConfigured ? 'bg-emerald-400' : 'bg-gray-400'}`} />
              <span className={isDark ? 'text-white' : 'text-gray-900'}>
                {connectionStatus.composioConfigured ? 'Composio Connected' : 'Composio Not Configured'}
              </span>
            </div>

            {connectionStatus.composioConfigured ? (
              <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                <p>Advanced features enabled:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Interactive buttons and actions in Slack</li>
                  <li>Slash commands (/murp stock, /murp po status)</li>
                  <li>User mentions and direct messages</li>
                  <li>Thread replies and conversations</li>
                  <li>File and image uploads</li>
                </ul>
              </div>
            ) : (
              <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                <p>To enable Composio integration:</p>
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>
                    Get API key at{' '}
                    <a
                      href="https://platform.composio.dev"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:underline"
                    >
                      platform.composio.dev
                    </a>
                  </li>
                  <li>Add <code className="px-1 bg-gray-800 rounded">VITE_COMPOSIO_API_KEY</code> to your environment</li>
                  <li>Connect your Slack workspace in Composio dashboard</li>
                  <li>Restart the application</li>
                </ol>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className={`flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                <input
                  type="checkbox"
                  checked={workspaceConfig.composio_enabled}
                  onChange={(e) => setWorkspaceConfig(prev => ({
                    ...prev,
                    composio_enabled: e.target.checked,
                  }))}
                  className="rounded border-gray-600"
                  disabled={!connectionStatus.composioConfigured}
                />
                <span>Enable Composio features (requires API key)</span>
              </label>
            </div>

            {workspaceConfig.composio_enabled && (
              <div className={`p-4 border rounded-lg ${isDark ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-cyan-300 bg-cyan-50'}`}>
                <h4 className={`font-medium mb-2 ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>
                  Rube Recipe Integration
                </h4>
                <p className={`text-sm mb-3 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Create Rube recipes that push data to MuRP or pull inventory/PO status on demand.
                </p>
                <div className="space-y-2 text-sm">
                  <div className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                    <strong>Recipe → MuRP:</strong> POST to <code className="px-1 bg-gray-800 rounded text-xs">/rube-webhook</code>
                  </div>
                  <div className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                    <strong>MuRP → Slack:</strong> Use Composio MCP tools for interactive messages
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={saveWorkspaceConfig} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'queue' && (
        <div className={cardClass}>
          <h3 className={`text-lg font-medium mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Alert Queue
          </h3>
          <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Review and manage pending alerts before they are sent to Slack.
          </p>

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
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          alert.severity === 'critical'
                            ? 'bg-red-500/20 text-red-400'
                            : alert.severity === 'high'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {alert.severity.toUpperCase()}
                        </span>
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
                        className="px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded"
                      >
                        Send
                      </button>
                      <button
                        onClick={() => handleSuppressAlert(alert.id)}
                        className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded"
                      >
                        Suppress
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-4">
            <button
              onClick={loadConfiguration}
              className={`px-4 py-2 rounded-lg border transition-colors ${isDark
                ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <RefreshIcon className="w-4 h-4 inline mr-1" />
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SlackIntegrationPanel;
