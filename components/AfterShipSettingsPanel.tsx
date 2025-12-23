/**
 * ===============================================================================
 * AFTERSHIP SETTINGS PANEL
 * ===============================================================================
 *
 * Configuration UI for AfterShip API integration.
 * AfterShip = INBOUND tracking (POs from vendors) - CRITICAL for stockout prevention!
 *
 * Features:
 * - API credentials management
 * - Webhook subscription setup
 * - Manual sync controls
 * - Correlation settings
 * - Tracking statistics
 * - Active tracking dashboard
 *
 * Part of: Email Tracking Agent Expansion
 * Goal: NEVER BE OUT OF STOCK!
 */

import React, { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import {
  getAfterShipConfig,
  updateAfterShipConfig,
  testConnection,
  listWebhooks,
  createWebhook,
  syncActiveTrackings,
  listTrackings,
  AfterShipConfig,
  AfterShipTracking,
  mapTagToInternalStatus,
  mapSlugToCarrierName,
} from '../services/afterShipService';
import { supabase } from '../lib/supabase/client';

// ===============================================================================
// Component
// ===============================================================================

interface AfterShipSettingsPanelProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export default function AfterShipSettingsPanel({ addToast }: AfterShipSettingsPanelProps) {
  const [config, setConfig] = useState<AfterShipConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  // Form state
  const [apiKey, setApiKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [enableWebhooks, setEnableWebhooks] = useState(true);
  const [autoCreateTracking, setAutoCreateTracking] = useState(true);
  const [autoCorrelate, setAutoCorrelate] = useState(true);
  const [correlateWithEmail, setCorrelateWithEmail] = useState(true);
  const [defaultSlug, setDefaultSlug] = useState('ups');

  // Connection status
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'error'>('unknown');
  const [connectionMessage, setConnectionMessage] = useState('');

  // Active trackings
  const [activeTrackings, setActiveTrackings] = useState<any[]>([]);
  const [loadingTrackings, setLoadingTrackings] = useState(false);

  useEffect(() => {
    loadConfig();
    loadActiveTrackings();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await getAfterShipConfig();
      setConfig(data);
      setApiKey(data.apiKey || '');
      setWebhookSecret(data.webhookSecret || '');
      setEnabled(data.enabled);
      setEnableWebhooks(data.enableWebhooks);
      setAutoCreateTracking(data.autoCreateTracking);
      setAutoCorrelate(data.autoCorrelate);
      setCorrelateWithEmail(data.correlateWithEmail);
      setDefaultSlug(data.defaultSlug);
    } catch (error) {
      console.error('[AfterShipSettings] Failed to load config:', error);
      addToast('Failed to load AfterShip settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadActiveTrackings = async () => {
    setLoadingTrackings(true);
    try {
      const { data, error } = await supabase
        .from('aftership_trackings')
        .select(`
          *,
          purchase_orders (
            order_id,
            vendor_name,
            status
          )
        `)
        .not('tag', 'in', '("Delivered","Expired")')
        .order('expected_delivery', { ascending: true, nullsFirst: false })
        .limit(20);

      if (error) throw error;
      setActiveTrackings(data || []);
    } catch (error) {
      console.error('[AfterShipSettings] Failed to load trackings:', error);
    } finally {
      setLoadingTrackings(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAfterShipConfig({
        enabled,
        apiKey: apiKey || null,
        webhookSecret: webhookSecret || null,
        enableWebhooks,
        autoCreateTracking,
        autoCorrelate,
        correlateWithEmail,
        defaultSlug,
      });
      addToast('AfterShip settings saved', 'success');
      await loadConfig();
    } catch (error) {
      console.error('[AfterShipSettings] Failed to save:', error);
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
      await updateAfterShipConfig({
        apiKey: apiKey || null,
      });

      const result = await testConnection();
      if (result.success) {
        setConnectionStatus('connected');
        setConnectionMessage(`Connected! ${result.trackingCount} trackings found.`);
        addToast('AfterShip connection successful', 'success');
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
      const result = await syncActiveTrackings();
      addToast(
        `Synced ${result.processed} trackings, ${result.updated} matched to POs`,
        result.errors > 0 ? 'info' : 'success'
      );
      await loadConfig();
      await loadActiveTrackings();
    } catch (error) {
      console.error('[AfterShipSettings] Sync failed:', error);
      addToast('Sync failed: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleSetupWebhooks = async () => {
    try {
      // Get webhook URL
      const webhookUrl = `${window.location.origin.replace('localhost:5173', 'your-project.supabase.co')}/functions/v1/aftership-webhook`;

      // Get current webhooks
      const webhooks = await listWebhooks();

      // Check if we already have our webhook
      const hasWebhook = webhooks.some(w => w.path.includes('aftership-webhook'));

      if (hasWebhook) {
        addToast('Webhook already configured', 'info');
        return;
      }

      // Create webhook
      await createWebhook({
        url: webhookUrl,
        events: ['tracking_update'],
      });

      addToast('Webhook configured successfully', 'success');

      // Update config with webhook URL
      await updateAfterShipConfig({
        webhookUrl,
      });

      await loadConfig();
    } catch (error) {
      console.error('[AfterShipSettings] Webhook setup failed:', error);
      addToast('Failed to setup webhook: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
    }
  };

  const getTagColor = (tag: string) => {
    const colors: Record<string, string> = {
      Pending: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      InfoReceived: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      InTransit: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
      OutForDelivery: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      AttemptFail: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      Delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
      AvailableForPickup: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      Exception: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      Expired: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400',
    };
    return colors[tag] || colors.Pending;
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
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                AfterShip Integration
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Real-time INBOUND PO tracking - Critical for stockout prevention!
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
        {/* Critical Notice */}
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="font-medium text-emerald-800 dark:text-emerald-200">
                INBOUND PO Tracking
              </h4>
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                AfterShip tracks shipments FROM vendors TO you. This is critical for knowing when inventory will arrive
                and preventing stockouts. Webhooks provide instant updates when tracking status changes.
              </p>
            </div>
          </div>
        </div>

        {/* Enable Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Enable AfterShip Integration
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Track INBOUND POs from vendors with real-time updates
            </p>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enabled ? 'bg-emerald-600' : 'bg-gray-200 dark:bg-gray-700'
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
                placeholder="Enter AfterShip API Key"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Webhook Secret (optional)
              </label>
              <input
                type={showSecrets ? 'text' : 'password'}
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="HMAC verification secret"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={showSecrets}
                onChange={(e) => setShowSecrets(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-500"
              />
              Show credentials
            </label>
            <Button
              onClick={handleTestConnection}
              disabled={testing || !apiKey}
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
              {connectionStatus === 'connected' ? '\u2713 ' : '\u2717 '}
              {connectionMessage}
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Get your API key from AfterShip dashboard &rarr; Settings &rarr; API Keys
          </p>
        </div>

        {/* Tracking Settings */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Tracking Settings
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Default Carrier
              </label>
              <select
                value={defaultSlug}
                onChange={(e) => setDefaultSlug(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ups">UPS</option>
                <option value="fedex">FedEx</option>
                <option value="usps">USPS</option>
                <option value="dhl">DHL</option>
                <option value="dhl-express">DHL Express</option>
                <option value="lasership">LaserShip</option>
                <option value="ontrac">OnTrac</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={autoCreateTracking}
                onChange={(e) => setAutoCreateTracking(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Auto-create trackings
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Automatically register tracking numbers with AfterShip
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={autoCorrelate}
                onChange={(e) => setAutoCorrelate(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Auto-correlate with POs
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Match trackings to MuRP POs by order number and tracking
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={correlateWithEmail}
                onChange={(e) => setCorrelateWithEmail(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Correlate with Email Threads
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Link tracking to email thread intelligence
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={enableWebhooks}
                onChange={(e) => setEnableWebhooks(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Enable Webhooks
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Receive real-time tracking updates (recommended)
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Webhooks */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Webhook Configuration
          </h4>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Webhook URL
              </label>
              <input
                type="text"
                value={config?.webhookUrl || `https://your-project.supabase.co/functions/v1/aftership-webhook`}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm"
              />
            </div>
            <Button
              onClick={handleSetupWebhooks}
              disabled={!enabled || !apiKey}
              size="sm"
              variant="secondary"
            >
              Setup Webhook
            </Button>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Webhooks provide instant tracking updates. You can also configure them directly in AfterShip dashboard.
          </p>
        </div>

        {/* Sync Controls */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Manual Sync
          </h4>

          <div className="flex items-center gap-4">
            <Button
              onClick={handleSyncNow}
              disabled={syncing || !enabled}
              size="sm"
              variant="secondary"
            >
              {syncing ? 'Syncing...' : 'Sync Active Trackings'}
            </Button>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Polls AfterShip for all active trackings (Pending, InTransit, Exception, etc.)
            </p>
          </div>
        </div>

        {/* Statistics */}
        {config?.stats && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Statistics
            </h4>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {config.stats.totalTrackings}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Total Trackings</div>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-2xl font-bold text-sky-600 dark:text-sky-400">
                  {config.stats.activeTrackings}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Active</div>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {config.stats.correlatedPOs}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Matched POs</div>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {config.stats.webhooksReceived}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Webhooks</div>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              {config.lastPollAt && (
                <span>Last poll: {new Date(config.lastPollAt).toLocaleString()}</span>
              )}
              {config.stats.lastWebhookAt && (
                <span>Last webhook: {new Date(config.stats.lastWebhookAt).toLocaleString()}</span>
              )}
            </div>
          </div>
        )}

        {/* Active Trackings */}
        {activeTrackings.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Active Trackings
              </h4>
              <button
                onClick={loadActiveTrackings}
                disabled={loadingTrackings}
                className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                {loadingTrackings ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Tracking
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      PO
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      ETA
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {activeTrackings.slice(0, 10).map((tracking) => (
                    <tr key={tracking.id}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {tracking.tracking_number}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {mapSlugToCarrierName(tracking.slug)}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {tracking.purchase_orders ? (
                          <div>
                            <div className="text-sm text-gray-900 dark:text-white">
                              {tracking.purchase_orders.order_id}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {tracking.purchase_orders.vendor_name}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                            Not matched
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getTagColor(tracking.tag)}`}>
                          {tracking.tag}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {tracking.expected_delivery
                          ? new Date(tracking.expected_delivery).toLocaleDateString()
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {activeTrackings.length > 10 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                Showing 10 of {activeTrackings.length} active trackings
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
