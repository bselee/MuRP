/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SHIPSTATION SETTINGS PANEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Configuration UI for ShipStation API integration.
 *
 * Features:
 * - API credentials management
 * - Webhook subscription setup
 * - Manual sync controls
 * - Correlation settings
 * - Sync statistics
 *
 * Part of: Email Tracking Agent Expansion
 * Goal: NEVER BE OUT OF STOCK!
 */

import React, { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import {
  getShipStationConfig,
  updateShipStationConfig,
  testConnection,
  listWebhooks,
  subscribeWebhook,
  syncRecentShipments,
  ShipStationConfig,
} from '../services/shipStationService';

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

interface ShipStationSettingsPanelProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export default function ShipStationSettingsPanel({ addToast }: ShipStationSettingsPanelProps) {
  const [config, setConfig] = useState<ShipStationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  // Form state
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [autoCorrelate, setAutoCorrelate] = useState(true);
  const [correlateWithEmail, setCorrelateWithEmail] = useState(true);
  const [syncHistoricalDays, setSyncHistoricalDays] = useState(30);

  // Connection status
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'error'>('unknown');
  const [connectionMessage, setConnectionMessage] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await getShipStationConfig();
      setConfig(data);
      setApiKey(data.apiKey || '');
      setApiSecret(data.apiSecret || '');
      setEnabled(data.enabled);
      setAutoCorrelate(data.autoCorrelate);
      setCorrelateWithEmail(data.correlateWithEmail);
      setSyncHistoricalDays(data.syncHistoricalDays);
    } catch (error) {
      console.error('[ShipStationSettings] Failed to load config:', error);
      addToast('Failed to load ShipStation settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateShipStationConfig({
        enabled,
        apiKey: apiKey || null,
        apiSecret: apiSecret || null,
        autoCorrelate,
        correlateWithEmail,
        syncHistoricalDays,
      });
      addToast('ShipStation settings saved', 'success');
      await loadConfig();
    } catch (error) {
      console.error('[ShipStationSettings] Failed to save:', error);
      addToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setConnectionStatus('unknown');
    try {
      // Save credentials first
      await updateShipStationConfig({
        apiKey: apiKey || null,
        apiSecret: apiSecret || null,
      });

      const result = await testConnection();
      if (result.success) {
        setConnectionStatus('connected');
        setConnectionMessage(`Connected! Found ${result.storeCount} store(s).`);
        addToast('ShipStation connection successful', 'success');
      } else {
        setConnectionStatus('error');
        setConnectionMessage(result.message);
        addToast(`Connection failed: ${result.message}`, 'error');
      }
    } catch (error) {
      setConnectionStatus('error');
      setConnectionMessage(error instanceof Error ? error.message : 'Connection failed');
      addToast('Connection test failed', 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const result = await syncRecentShipments(syncHistoricalDays);
      addToast(
        `Synced ${result.processed} shipments, ${result.matched} matched to POs`,
        result.errors > 0 ? 'info' : 'success'
      );
      await loadConfig();
    } catch (error) {
      console.error('[ShipStationSettings] Sync failed:', error);
      addToast('Sync failed: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleSetupWebhooks = async () => {
    try {
      // Get current webhooks
      const { webhooks } = await listWebhooks();

      // Check if we already have our webhooks
      const hasShipNotify = webhooks.some(w => w.Name?.includes('MuRP') && w.HookType === 'SHIP_NOTIFY');

      if (hasShipNotify) {
        addToast('Webhooks already configured', 'info');
        return;
      }

      // Subscribe to SHIP_NOTIFY
      const webhookUrl = `${window.location.origin}/api/shipstation-webhook`;

      await subscribeWebhook({
        targetUrl: webhookUrl,
        event: 'SHIP_NOTIFY',
        friendlyName: 'MuRP Shipment Tracking',
      });

      addToast('Webhooks configured successfully', 'success');

      // Update config with webhook URL
      await updateShipStationConfig({
        webhookUrl,
      });

      await loadConfig();
    } catch (error) {
      console.error('[ShipStationSettings] Webhook setup failed:', error);
      addToast('Failed to setup webhooks: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                ShipStation Integration
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Real-time tracking via ShipStation webhooks
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              enabled
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
            }`}>
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Enable Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Enable ShipStation Integration
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Receive real-time tracking updates via webhooks
            </p>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* API Credentials */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            API Credentials
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                API Key
              </label>
              <input
                type={showSecrets ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter API Key"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                API Secret
              </label>
              <input
                type={showSecrets ? 'text' : 'password'}
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Enter API Secret"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={showSecrets}
                onChange={(e) => setShowSecrets(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              Show credentials
            </label>
            <Button
              onClick={handleTestConnection}
              disabled={testing || !apiKey || !apiSecret}
              size="sm"
              variant="secondary"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
          </div>

          {/* Connection Status */}
          {connectionStatus !== 'unknown' && (
            <div className={`p-3 rounded-lg text-sm ${
              connectionStatus === 'connected'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400'
            }`}>
              {connectionStatus === 'connected' ? '✓ ' : '✕ '}
              {connectionMessage}
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Get your API credentials from ShipStation → Settings → API Settings
          </p>
        </div>

        {/* Correlation Settings */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Correlation Settings
          </h4>

          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={autoCorrelate}
                onChange={(e) => setAutoCorrelate(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Auto-correlate with POs
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Match ShipStation orders to MuRP POs by order number and tracking
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={correlateWithEmail}
                onChange={(e) => setCorrelateWithEmail(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Correlate with Email Threads
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Link ShipStation tracking to email thread intelligence
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Sync Settings */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Manual Sync
          </h4>

          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Sync historical days
              </label>
              <select
                value={syncHistoricalDays}
                onChange={(e) => setSyncHistoricalDays(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={60}>Last 60 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
            <Button
              onClick={handleSyncNow}
              disabled={syncing || !enabled}
              size="sm"
              variant="secondary"
            >
              {syncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          </div>
        </div>

        {/* Webhooks */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Webhooks
          </h4>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Webhook URL
              </label>
              <input
                type="text"
                value={config?.webhookUrl || `${window.location.origin}/api/shipstation-webhook`}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm"
              />
            </div>
            <Button
              onClick={handleSetupWebhooks}
              disabled={!enabled || !apiKey || !apiSecret}
              size="sm"
              variant="secondary"
            >
              Setup Webhooks
            </Button>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Webhooks provide real-time tracking updates when shipments are created in ShipStation.
          </p>
        </div>

        {/* Statistics */}
        {config?.stats && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Sync Statistics
            </h4>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {config.stats.totalOrders}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Total Orders</div>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {config.stats.totalShipments}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Shipments</div>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {config.stats.matchedPOs}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Matched POs</div>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {config.stats.unmatchedOrders}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Unmatched</div>
              </div>
            </div>

            {config.lastSyncAt && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Last sync: {new Date(config.lastSyncAt).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
