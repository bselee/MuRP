import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Button from '@/components/ui/Button';
import type { Page } from '../App';
import type { GmailConnection, ExternalConnection, POTrackingStatus } from '../types';
import {
GmailIcon,
  KeyIcon,
  ClipboardCopyIcon,
  TrashIcon,
  ServerStackIcon,
  LinkIcon,
  RefreshIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  TruckIcon,
  BellIcon,
} from './icons';
import { supabase } from '../lib/supabase/client';
import { dispatchSyncEvent } from '../lib/syncEventBus';
import FinaleSetupPanel from './FinaleSetupPanel';
import type { SyncHealthRow } from '../lib/sync/healthUtils';

interface APIIntegrationsPanelProps {
  apiKey: string | null;
  onGenerateApiKey: () => void;
  onRevokeApiKey: () => void;
  showApiKey: boolean;
  onToggleShowApiKey: (show: boolean) => void;
  gmailConnection: GmailConnection;
  onGmailConnect: () => void;
  onGmailDisconnect: () => void;
  externalConnections: ExternalConnection[];
  onSetExternalConnections: (connections: ExternalConnection[]) => void;
  setCurrentPage: (page: Page) => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type SyncType = 'vendors' | 'inventory' | 'boms';

type SyncHealthRowWithType = SyncHealthRow & { data_type: SyncType };

interface ManualSyncSummary {
  dataType: SyncType;
  success: boolean;
  skipped?: boolean;
  itemCount: number;
  message: string;
  error?: string;
}

interface ManualSyncResponse {
  success: boolean;
  duration: number;
  summaries: ManualSyncSummary[];
  errors?: string[];
  force?: boolean;
  source?: string;
}

type StepBadgeState = 'healthy' | 'failed' | 'running' | 'queued' | 'updated' | 'idle';

interface StepBadge {
  label: string;
  className: string;
  state: StepBadgeState;
}

const SYNC_STEPS: Array<{ type: SyncType; label: string; accent: string }> = [
  { type: 'vendors', label: 'Vendors', accent: 'text-pink-300' },
  { type: 'inventory', label: 'Inventory', accent: 'text-accent-300' },
  { type: 'boms', label: 'BOMs', accent: 'text-emerald-300' },
];

const CUSTOM_CARRIER_VALUE = 'custom';

const AFTERSHIP_CARRIER_OPTIONS = [
  { value: 'ups', label: 'UPS' },
  { value: 'fedex', label: 'FedEx' },
  { value: 'usps', label: 'USPS' },
  { value: 'dhl', label: 'DHL' },
  { value: CUSTOM_CARRIER_VALUE, label: 'Custom Carrier' },
];

const TRACKING_STATUS_CHOICES: Array<{
  value: POTrackingStatus;
  label: string;
  description: string;
}> = [
  {
    value: 'exception',
    label: 'Exception',
    description: 'Carrier flagged an issue – needs purchasing review.',
  },
  {
    value: 'delivered',
    label: 'Delivered',
    description: 'Confirm receiving + close the loop.',
  },
  {
    value: 'out_for_delivery',
    label: 'Out for Delivery',
    description: 'Heads-up that receiving should prep.',
  },
  {
    value: 'shipped',
    label: 'Shipped',
    description: 'Vendor confirmed carrier acceptance.',
  },
  {
    value: 'in_transit',
    label: 'In Transit',
    description: 'Optional progress pings while in route.',
  },
];

const resolveCarrierSelection = (slug?: string) => {
  if (!slug || slug === 'other') {
    return { selectedCarrier: 'ups', customSlug: '' };
  }

  if (slug === CUSTOM_CARRIER_VALUE) {
    return { selectedCarrier: CUSTOM_CARRIER_VALUE, customSlug: '' };
  }

  const matchesPreset = AFTERSHIP_CARRIER_OPTIONS.some(
    (option) => option.value === slug && option.value !== CUSTOM_CARRIER_VALUE,
  );

  if (matchesPreset) {
    return { selectedCarrier: slug, customSlug: '' };
  }

  return { selectedCarrier: CUSTOM_CARRIER_VALUE, customSlug: slug };
};

const formatRelativeTime = (iso?: string) => {
  if (!iso) return 'Never synced';
  const date = new Date(iso);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const formatExactTime = (iso?: string) => {
  if (!iso) return 'No history';
  try {
    return new Date(iso).toLocaleString();
  } catch (_error) {
    return iso;
  }
};

/**
 * API & Integrations Panel
 * Manages:
 * - Our API credentials (inbound connections)
 * - External integrations (outbound connections)
 * - Finale inventory integration
 * - Gmail integration
 */
const APIIntegrationsPanel: React.FC<APIIntegrationsPanelProps> = ({
  apiKey,
  onGenerateApiKey,
  onRevokeApiKey,
  showApiKey,
  onToggleShowApiKey,
  gmailConnection,
  onGmailConnect,
  onGmailDisconnect,
  externalConnections,
  onSetExternalConnections,
  setCurrentPage,
  addToast,
}) => {
  const [syncHealth, setSyncHealth] = useState<Record<SyncType, SyncHealthRowWithType | null>>({
    vendors: null,
    inventory: null,
    boms: null,
  });
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [manualSyncResult, setManualSyncResult] = useState<ManualSyncResponse | null>(null);
  const [manualSyncError, setManualSyncError] = useState<string | null>(null);
  const [manualSyncStartedAt, setManualSyncStartedAt] = useState<number | null>(null);
  const manualPollingRef = useRef<number | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<{
    hasCredentials: boolean;
    connectionTest?: { success: boolean; message: string };
    recommendations: string[];
  } | null>(null);

  const [newConnection, setNewConnection] = useState({ name: '', apiUrl: '', apiKey: '' });
  const [afterShipInputs, setAfterShipInputs] = useState({
    enabled: false,
    selectedCarrier: 'ups',
    customSlug: '',
    apiKey: '',
  });
  const [afterShipStoredKey, setAfterShipStoredKey] = useState<string | null>(null);
  const [afterShipLoading, setAfterShipLoading] = useState(false);
  const [afterShipError, setAfterShipError] = useState<string | null>(null);
  const [trackingAlerts, setTrackingAlerts] = useState<{
    enabled: boolean;
    slackWebhookUrl: string;
    channelLabel: string;
    slackMention: string;
    triggerStatuses: POTrackingStatus[];
  }>({
    enabled: false,
    slackWebhookUrl: '',
    channelLabel: '',
    slackMention: '',
    triggerStatuses: ['exception', 'delivered'],
  });
  const [trackingAlertsLoading, setTrackingAlertsLoading] = useState(false);
  const [trackingAlertsSaving, setTrackingAlertsSaving] = useState(false);
  const [trackingAlertsError, setTrackingAlertsError] = useState<string | null>(null);

  const fetchSyncHealth = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc<SyncHealthRowWithType[]>('get_sync_health');
      if (error) throw error;

      const next: Record<SyncType, SyncHealthRowWithType | null> = {
        vendors: null,
        inventory: null,
        boms: null,
      };

      (data || []).forEach((row) => {
        const type = row.data_type as SyncType;
        if (type in next) {
          next[type] = row;
        }
      });

      setSyncHealth(next);
    } catch (error) {
      console.error('[APIIntegrations] Failed to load sync health', error);
    }
  }, []);

  const loadAfterShipConfig = useCallback(async () => {
    try {
      setAfterShipLoading(true);
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'aftership_config')
        .maybeSingle();
      if (error) throw error;

      const value = data?.setting_value || {};
      const { selectedCarrier, customSlug } = resolveCarrierSelection(value.defaultSlug);

      setAfterShipInputs({
        enabled: Boolean(value.enabled),
        selectedCarrier,
        customSlug,
        apiKey: '',
      });
      setAfterShipStoredKey(value.apiKey ?? null);
      setAfterShipError(null);
    } catch (error) {
      console.error('[APIIntegrations] Failed to load AfterShip config', error);
      addToast?.('Failed to load AfterShip settings', 'error');
    } finally {
      setAfterShipLoading(false);
    }
  }, [addToast]);

  const handleSaveAfterShip = useCallback(async () => {
    try {
      setAfterShipLoading(true);
      setAfterShipError(null);
      const apiKeyToSave = afterShipInputs.apiKey.trim()
        ? afterShipInputs.apiKey.trim()
        : afterShipStoredKey;

      const resolvedSlug =
        afterShipInputs.selectedCarrier === CUSTOM_CARRIER_VALUE
          ? afterShipInputs.customSlug.trim()
          : afterShipInputs.selectedCarrier;

      if (afterShipInputs.selectedCarrier === CUSTOM_CARRIER_VALUE && !resolvedSlug) {
        setAfterShipError('Enter a valid AfterShip carrier slug when using the custom option.');
        addToast?.('Custom carrier slug required before saving.', 'error');
        return;
      }

      if (afterShipInputs.enabled && !resolvedSlug) {
        setAfterShipError('Default carrier slug is required when tracking is enabled.');
        addToast?.('Default carrier slug cannot be empty.', 'error');
        return;
      }

      const payload = {
        enabled: afterShipInputs.enabled,
        defaultSlug: resolvedSlug || 'ups',
        apiKey: apiKeyToSave,
      };

      const { error } = await supabase
        .from('app_settings')
        .update({
          setting_value: payload,
          updated_at: new Date().toISOString(),
        })
        .eq('setting_key', 'aftership_config');

      if (error) throw error;

      setAfterShipInputs((prev) => ({ ...prev, apiKey: '' }));
      setAfterShipStoredKey(apiKeyToSave ?? null);
      addToast?.('AfterShip settings updated', 'success');
    } catch (error) {
      console.error('[APIIntegrations] Failed to save AfterShip config', error);
      addToast?.('Failed to save AfterShip settings', 'error');
    } finally {
      setAfterShipLoading(false);
    }
  }, [afterShipInputs, afterShipStoredKey, addToast]);

  const handleClearAfterShipKey = useCallback(() => {
    setAfterShipStoredKey(null);
    setAfterShipInputs((prev) => ({ ...prev, apiKey: '' }));
    setAfterShipError(null);
  }, []);

  const handleResetAfterShip = useCallback(() => {
    setAfterShipError(null);
    loadAfterShipConfig();
  }, [loadAfterShipConfig]);

  const handleTrackingStatusToggle = (status: POTrackingStatus) => {
    setTrackingAlertsError(null);
    setTrackingAlerts((prev) => {
      const nextSet = new Set(prev.triggerStatuses);
      if (nextSet.has(status)) {
        nextSet.delete(status);
      } else {
        nextSet.add(status);
      }
      const next = Array.from(nextSet) as POTrackingStatus[];
      return {
        ...prev,
        triggerStatuses: next.length > 0 ? next : prev.triggerStatuses,
      };
    });
  };

  const handleSaveTrackingNotifications = useCallback(async () => {
    if (trackingAlerts.enabled) {
      if (!trackingAlerts.slackWebhookUrl.trim()) {
        setTrackingAlertsError('Slack webhook URL is required when alerts are enabled.');
        return;
      }
      if (trackingAlerts.triggerStatuses.length === 0) {
        setTrackingAlertsError('Select at least one status to broadcast.');
        return;
      }
    }
    try {
      setTrackingAlertsSaving(true);
      setTrackingAlertsError(null);
      const payload = {
        enabled: trackingAlerts.enabled,
        slackWebhookUrl: trackingAlerts.slackWebhookUrl.trim() || null,
        channelLabel: trackingAlerts.channelLabel.trim() || null,
        slackMention: trackingAlerts.slackMention.trim() || null,
        triggerStatuses: trackingAlerts.triggerStatuses,
        department: 'purchasing',
      };
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          {
            setting_key: 'po_tracking_notifications',
            setting_category: 'tracking',
            display_name: 'PO Tracking Notifications',
            setting_value: payload,
          },
          { onConflict: 'setting_key' },
        );
      if (error) throw error;
      addToast?.('PO tracking notifications updated', 'success');
    } catch (err) {
      console.error('[APIIntegrations] Failed to save tracking notifications', err);
      setTrackingAlertsError('Failed to save tracking notification settings.');
      addToast?.('Failed to save tracking notifications', 'error');
    } finally {
      setTrackingAlertsSaving(false);
    }
  }, [trackingAlerts, addToast]);

  const handleResetTrackingNotifications = () => {
    loadTrackingNotifications();
  };

  const loadTrackingNotifications = useCallback(async () => {
    try {
      setTrackingAlertsLoading(true);
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'po_tracking_notifications')
        .maybeSingle();
      if (error) throw error;

      const value = data?.setting_value || {};
      setTrackingAlerts({
        enabled: Boolean(value.enabled),
        slackWebhookUrl: value.slackWebhookUrl || '',
        channelLabel: value.channelLabel || '',
        slackMention: value.slackMention || '',
        triggerStatuses:
          Array.isArray(value.triggerStatuses) && value.triggerStatuses.length > 0
            ? value.triggerStatuses
            : (['exception', 'delivered'] as POTrackingStatus[]),
      });
      setTrackingAlertsError(null);
    } catch (err) {
      console.error('[APIIntegrations] Failed to load tracking notifications', err);
      setTrackingAlertsError('Unable to load tracking notification settings.');
    } finally {
      setTrackingAlertsLoading(false);
    }
  }, []);

  const startManualPolling = useCallback(() => {
    if (typeof window === 'undefined' || manualPollingRef.current !== null) return;
    manualPollingRef.current = window.setInterval(() => {
      fetchSyncHealth();
    }, 2500);
  }, [fetchSyncHealth]);

  const stopManualPolling = useCallback(() => {
    if (manualPollingRef.current !== null) {
      clearInterval(manualPollingRef.current);
      manualPollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    fetchSyncHealth();
    if (typeof window === 'undefined') return;
    const interval = window.setInterval(fetchSyncHealth, 60000);
    return () => {
      clearInterval(interval);
    };
  }, [fetchSyncHealth]);

  useEffect(() => {
    loadAfterShipConfig();
    loadTrackingNotifications();
  }, [loadAfterShipConfig, loadTrackingNotifications]);

  useEffect(() => {
    return () => {
      stopManualPolling();
    };
  }, [stopManualPolling]);

  const handleCopyApiKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      addToast('API Key copied to clipboard.', 'success');
    }
  };

  const handleNewConnectionChange = (field: keyof typeof newConnection, value: string) => {
    setNewConnection((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddNewConnection = () => {
    if (!newConnection.name || !newConnection.apiUrl || !newConnection.apiKey) {
      addToast('All fields are required to add a connection.', 'error');
      return;
    }
    const newConnectionWithId: ExternalConnection = {
      id: `conn-${Date.now()}`,
      ...newConnection,
    };
    onSetExternalConnections([...externalConnections, newConnectionWithId]);
    setNewConnection({ name: '', apiUrl: '', apiKey: '' }); // Reset form
    addToast(`Connection "${newConnection.name}" added successfully.`, 'success');
  };

  const handleDeleteConnection = (id: string) => {
    onSetExternalConnections(externalConnections.filter((c) => c.id !== id));
    addToast('Connection removed.', 'info');
  };

  const runDiagnostics = useCallback(async () => {
    setIsDiagnosing(true);
    setDiagnosticResult(null);
    addToast('Running diagnostics...', 'info');

    try {
      // Check if credentials are stored
      const apiKey = localStorage.getItem('finale_api_key');
      const apiSecret = localStorage.getItem('finale_api_secret');
      const accountPath = localStorage.getItem('finale_account_path');

      const hasCredentials = !!(apiKey && apiSecret && accountPath);
      const recommendations: string[] = [];

      if (!hasCredentials) {
        recommendations.push('Set up Finale credentials in the Finale Setup panel below');
        setDiagnosticResult({ hasCredentials, recommendations });
        addToast('Missing Finale credentials', 'error');
        setIsDiagnosing(false);
        return;
      }

      // Test connection to Finale API
      addToast('Testing Finale connection...', 'info');
      try {
        const { data, error } = await supabase.functions.invoke('api-proxy', {
          body: {
            endpoint: 'testConnection',
            method: 'GET',
          },
        });

        if (error || !data?.success) {
          recommendations.push('Verify your Finale API credentials are correct');
          recommendations.push('Check that your Finale account is active');
          recommendations.push('Ensure Finale API access is enabled for your account');
          setDiagnosticResult({
            hasCredentials,
            connectionTest: {
              success: false,
              message: data?.error || error?.message || 'Connection test failed',
            },
            recommendations,
          });
          addToast('Connection test failed', 'error');
        } else {
          recommendations.push('Credentials and connection are valid');
          recommendations.push('Try running Force Sync again');
          recommendations.push('If sync still fails, check Finale report URLs in environment variables');
          setDiagnosticResult({
            hasCredentials,
            connectionTest: { success: true, message: 'Connected successfully' },
            recommendations,
          });
          addToast('Connection test passed', 'success');
        }
      } catch (error) {
        recommendations.push('Unable to reach Finale API - check network connection');
        recommendations.push('Verify API proxy function is deployed');
        setDiagnosticResult({
          hasCredentials,
          connectionTest: {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          recommendations,
        });
        addToast('Diagnostic test failed', 'error');
      }
    } finally {
      setIsDiagnosing(false);
    }
  }, [addToast]);

  const handleForceSync = useCallback(async () => {
    if (isManualSyncing) return;
    setManualSyncError(null);
    setManualSyncResult(null);
    setDiagnosticResult(null);
    setIsManualSyncing(true);
    const startedAt = Date.now();
    setManualSyncStartedAt(startedAt);
    fetchSyncHealth();
    startManualPolling();
    addToast('Triggering Finale sync…', 'info');
    dispatchSyncEvent({ running: true, source: 'settings:manual' });

    try {
      const { data, error } = await supabase.functions.invoke<ManualSyncResponse>('auto-sync-finale', {
        body: { source: 'settings-manual-sync', force: true },
      });

      if (error) {
        throw error;
      }

      setManualSyncResult(data ?? null);

      if (data?.success) {
        addToast('Finale sync completed successfully.', 'success');
      } else if (data) {
        addToast('Finale sync finished with warnings.', 'error');
      } else {
        addToast('No response payload from sync function.', 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Manual sync failed';
      setManualSyncError(message);
      addToast(`Manual sync failed: ${message}`, 'error');
    } finally {
      setIsManualSyncing(false);
      setManualSyncStartedAt(null);
      stopManualPolling();
      await fetchSyncHealth();
      dispatchSyncEvent({ running: false, source: 'settings:manual' });
    }
  }, [
    isManualSyncing,
    addToast,
    fetchSyncHealth,
    startManualPolling,
    stopManualPolling,
  ]);

  const getStepBadge = useCallback(
    (type: SyncType): StepBadge => {
      const metadata = syncHealth[type];
      const lastSyncTime = metadata?.last_sync_time;
      const updatedThisRun = Boolean(
        manualSyncStartedAt &&
          metadata &&
          new Date(lastSyncTime as string).getTime() >= manualSyncStartedAt,
      );

      if (isManualSyncing && manualSyncStartedAt) {
        if (updatedThisRun) {
          return metadata?.success
            ? { label: 'Updated', className: 'bg-green-500/15 text-green-300', state: 'updated' }
            : { label: 'Failed', className: 'bg-red-500/15 text-red-300', state: 'failed' };
        }

        const stepIndex = SYNC_STEPS.findIndex((step) => step.type === type);
        const previousComplete = SYNC_STEPS.slice(0, stepIndex).every((step) => {
          const stepMeta = syncHealth[step.type];
          if (!manualSyncStartedAt || !stepMeta) return false;
          return new Date(stepMeta.last_sync_time).getTime() >= manualSyncStartedAt;
        });

        if (previousComplete) {
          return { label: 'Running…', className: 'bg-blue-500/15 text-blue-300', state: 'running' };
        }

        return { label: 'Queued', className: 'bg-gray-600/40 text-gray-300', state: 'queued' };
      }

      if (!metadata || !metadata.last_sync_time) {
        return { label: 'Not synced', className: 'bg-gray-700/50 text-gray-300', state: 'idle' };
      }

      if (metadata.is_stale) {
        return { label: 'Stale', className: 'bg-amber-500/15 text-amber-300', state: 'failed' };
      }

      return metadata.success
        ? { label: 'Healthy', className: 'bg-emerald-500/15 text-emerald-300', state: 'healthy' }
        : { label: 'Error', className: 'bg-red-500/15 text-red-300', state: 'failed' };
    },
    [isManualSyncing, manualSyncStartedAt, syncHealth],
  );

  const syncCards = useMemo(() => {
    return SYNC_STEPS.map((step) => {
      const metadata = syncHealth[step.type];
      const badge = getStepBadge(step.type);
      return {
        ...step,
        metadata,
        badge,
      };
    });
  }, [getStepBadge, syncHealth]);

  return (
    <div className="space-y-6">
      {/* Our API Credentials (Inbound) */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white">Our API Credentials</h3>
        <p className="text-sm text-gray-400 mt-1">
          Allow external services to connect to this MRP instance.
        </p>
        <div className="mt-4 pt-4 border-t border-gray-700/50">
          {apiKey ? (
            <div className="space-y-3">
              <div className="flex items-center bg-gray-900/50 rounded-md p-2">
                <KeyIcon className="w-5 h-5 text-yellow-400 mr-3" />
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  readOnly
                  className="flex-1 bg-transparent text-gray-300 font-mono text-sm focus:outline-none"
                />
                <Button
                  onClick={handleCopyApiKey}
                  className="p-2 text-gray-400 hover:text-white"
                >
                  <ClipboardCopyIcon className="w-5 h-5" />
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showApiKey}
                    onChange={(e) => onToggleShowApiKey(e.target.checked)}
                    className="mr-2"
                  />
                  Show Key
                </label>
                <div>
                  <Button
                    onClick={onGenerateApiKey}
                    className="text-sm text-accent-400 hover:underline mr-4"
                  >
                    Regenerate
                  </Button>
                  <Button onClick={onRevokeApiKey} className="text-sm text-red-400 hover:underline">
                    Revoke Key
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-400 mb-3">No API key is currently active.</p>
              <Button
                onClick={onGenerateApiKey}
                className="bg-accent-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-accent-600 transition-colors"
              >
                Generate API Key
              </Button>
            </div>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-700/50 flex justify-end">
          <Button
            onClick={() => setCurrentPage('API Documentation')}
            className="text-sm font-semibold text-accent-400 hover:text-accent-300"
          >
            View API Documentation &rarr;
          </Button>
      </div>
    </div>

      {/* PO Tracking Notifications */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700 space-y-4">
        <div className="flex items-center gap-4">
          <BellIcon className="w-8 h-8 text-amber-300" />
          <div>
            <h3 className="text-lg font-semibold text-white">Purchasing Alerts (Slack)</h3>
            <p className="text-sm text-gray-400 mt-1">
              Send delivery + exception updates to the purchasing channel for validation before anyone else sees them.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-3 text-sm text-gray-300">
          <input
            type="checkbox"
            className="rounded bg-gray-700 border-gray-600 text-accent-500 focus:ring-accent-500"
            checked={trackingAlerts.enabled}
            onChange={(e) => {
              setTrackingAlertsError(null);
              setTrackingAlerts((prev) => ({ ...prev, enabled: e.target.checked }));
            }}
          />
          Enable purchasing-only Slack notifications
        </label>
        <p className="text-xs text-gray-500 pl-7">
          Exceptions and deliveries stay in one designated channel. We’ll append the mention you provide on every alert.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">
              Slack Webhook URL
            </label>
            <input
              type="url"
              value={trackingAlerts.slackWebhookUrl}
              onChange={(e) => {
                setTrackingAlertsError(null);
                setTrackingAlerts((prev) => ({ ...prev, slackWebhookUrl: e.target.value }));
              }}
              placeholder="https://hooks.slack.com/services/…"
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white"
              disabled={!trackingAlerts.enabled || trackingAlertsLoading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Paste the incoming webhook URL for your purchasing channel.
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">
              Channel label (optional)
            </label>
            <input
              type="text"
              value={trackingAlerts.channelLabel}
              onChange={(e) => {
                setTrackingAlertsError(null);
                setTrackingAlerts((prev) => ({ ...prev, channelLabel: e.target.value }));
              }}
              placeholder="e.g., #purchasing-tracking"
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white"
              disabled={!trackingAlerts.enabled || trackingAlertsLoading}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">
              Mention (optional)
            </label>
            <input
              type="text"
              value={trackingAlerts.slackMention}
              onChange={(e) => {
                setTrackingAlertsError(null);
                setTrackingAlerts((prev) => ({ ...prev, slackMention: e.target.value }));
              }}
              placeholder="@purchasing-managers"
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white"
              disabled={!trackingAlerts.enabled || trackingAlertsLoading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Use Slack handle, user ID, or group mention to get instant validation.
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">
              Tracked statuses
            </label>
            <div className="space-y-2">
              {TRACKING_STATUS_CHOICES.map((option) => {
                const checked = trackingAlerts.triggerStatuses.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className={`flex items-start gap-2 rounded-md border p-3 text-sm transition-colors ${
                      checked
                        ? 'border-accent-500/40 bg-gray-700/40'
                        : 'border-gray-700/60 bg-gray-900/30'
                    } ${!trackingAlerts.enabled ? 'opacity-60' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 rounded bg-gray-700 border-gray-600 text-accent-500 focus:ring-accent-500"
                      checked={checked}
                      onChange={() => handleTrackingStatusToggle(option.value)}
                      disabled={!trackingAlerts.enabled || trackingAlertsLoading}
                    />
                    <span>
                      <span className="font-medium text-gray-100 block">{option.label}</span>
                      <span className="text-xs text-gray-400">{option.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {trackingAlertsLoading && (
          <p className="text-sm text-gray-400">Loading notification settings…</p>
        )}

        {trackingAlertsError && (
          <p className="text-sm text-rose-300">{trackingAlertsError}</p>
        )}

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            onClick={handleResetTrackingNotifications}
            className="text-sm text-gray-300 hover:text-white"
            disabled={trackingAlertsLoading || trackingAlertsSaving}
          >
            Reset
          </Button>
          <Button
            type="button"
            onClick={handleSaveTrackingNotifications}
            disabled={trackingAlertsSaving || trackingAlertsLoading}
            className="bg-amber-500/80 text-white font-semibold py-2 px-4 rounded-md hover:bg-amber-500 transition-colors disabled:bg-gray-600"
          >
            {trackingAlertsSaving ? 'Saving…' : 'Save Alert Settings'}
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          Notifications stay locked to the purchasing department. Only the statuses you select will ever post to Slack.
        </p>
      </div>

        {/* Manual Finale Sync Controls */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Finale Data Sync</h3>
              <p className="text-sm text-gray-400 mt-1">
                Trigger the Supabase auto-sync function on demand and monitor each data stream.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={runDiagnostics}
                disabled={isDiagnosing || isManualSyncing}
                className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                  isDiagnosing || isManualSyncing
                    ? 'bg-gray-700 text-gray-300 cursor-not-allowed'
                    : 'bg-gray-600 text-white hover:bg-gray-500'
                }`}
              >
                {isDiagnosing ? (
                  <>
                    <RefreshIcon className="w-4 h-4 animate-spin" />
                    Testing…
                  </>
                ) : (
                  <>
                    <ExclamationTriangleIcon className="w-4 h-4" />
                    Run Diagnostics
                  </>
                )}
              </Button>
              <Button
                onClick={handleForceSync}
                disabled={isManualSyncing}
                className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                  isManualSyncing
                    ? 'bg-gray-700 text-gray-300 cursor-not-allowed'
                    : 'bg-accent-500 text-white hover:bg-accent-600'
                }`}
              >
                {isManualSyncing ? (
                  <>
                    <RefreshIcon className="w-4 h-4 animate-spin" />
                    Syncing…
                  </>
                ) : (
                  <>
                    <RefreshIcon className="w-4 h-4" />
                    Force Sync Now
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {syncCards.map((card) => (
              <div key={card.type} className="rounded-lg border border-gray-700/60 bg-gray-900/40 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{card.label}</p>
                    <p className={`text-xs ${card.accent}`}>
                      {manualSyncStartedAt ? 'Current run' : 'Last update'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${card.badge.className}`}>
                    {card.badge.label}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-xs text-gray-400">
                  <p>
                    Last sync:{' '}
                    <span className="text-gray-200">
                      {formatRelativeTime(card.metadata?.last_sync_time)}
                    </span>
                  </p>
                  <p>
                    Records:{' '}
                    <span className="text-gray-200">{card.metadata?.item_count ?? 0}</span>
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {formatExactTime(card.metadata?.last_sync_time)}
                  </p>
                </div>
                {card.badge.state === 'running' && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-blue-300">
                    <RefreshIcon className="w-3.5 h-3.5 animate-spin" />
                    Syncing now…
                  </div>
                )}
                {card.badge.state === 'failed' && card.metadata && !card.metadata.success && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-red-300">
                    <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                    Last attempt failed
                  </div>
                )}
              </div>
            ))}
          </div>

          {isManualSyncing && (
            <p className="mt-3 flex items-center gap-2 text-xs text-blue-300">
              <RefreshIcon className="w-4 h-4 animate-spin" />
              Manual sync running — this usually takes under a minute.
            </p>
          )}

          {manualSyncResult && (
            <div className="mt-4 rounded-lg border border-gray-700/70 bg-gray-900/40 p-4">
              <p className="text-sm font-semibold text-white mb-2">Last run summary</p>
              {manualSyncResult.summaries ? (
                <ul className="space-y-1 text-xs text-gray-300">
                  {manualSyncResult.summaries.map((summary) => (
                    <li key={summary.dataType} className="flex items-center justify-between">
                      <span className="capitalize text-gray-400">{summary.dataType}</span>
                      <span className={summary.success ? 'text-green-300' : 'text-red-300'}>
                        {summary.success
                          ? `Synced ${summary.itemCount}`
                          : summary.error || summary.message}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400">No summary returned from the last run.</p>
              )}
              {manualSyncResult.errors && manualSyncResult.errors.length > 0 && (
                <p className="mt-3 text-xs text-red-300">
                  {manualSyncResult.errors.join('; ')}
                </p>
              )}
            </div>
          )}

          {manualSyncError && (
            <p className="mt-3 text-sm text-red-400">{manualSyncError}</p>
          )}

          {diagnosticResult && (
            <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
              <div className="flex items-start gap-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-yellow-200 mb-2">Diagnostic Results</p>
                  
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">Credentials:</span>
                      {diagnosticResult.hasCredentials ? (
                        <span className="text-green-300 flex items-center gap-1">
                          <CheckCircleIcon className="w-3.5 h-3.5" />
                          Found
                        </span>
                      ) : (
                        <span className="text-red-300 flex items-center gap-1">
                          <XCircleIcon className="w-3.5 h-3.5" />
                          Missing
                        </span>
                      )}
                    </div>

                    {diagnosticResult.connectionTest && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">Connection:</span>
                        {diagnosticResult.connectionTest.success ? (
                          <span className="text-green-300 flex items-center gap-1">
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            {diagnosticResult.connectionTest.message}
                          </span>
                        ) : (
                          <span className="text-red-300 flex items-center gap-1">
                            <XCircleIcon className="w-3.5 h-3.5" />
                            {diagnosticResult.connectionTest.message}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {diagnosticResult.recommendations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-yellow-500/20">
                      <p className="text-xs font-semibold text-yellow-200 mb-1.5">Recommendations:</p>
                      <ul className="space-y-1 text-xs text-gray-300">
                        {diagnosticResult.recommendations.map((rec, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="text-yellow-400 mt-0.5">•</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

      {/* External Integrations (Outbound) */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white">External Integrations</h3>
        <p className="text-sm text-gray-400 mt-1">
          Connect to external services like supplier portals or shipping APIs.
        </p>

        <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-4">
          {externalConnections.length > 0 && (
            <div className="space-y-3">
              {externalConnections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between p-3 bg-gray-900/50 rounded-md"
                >
                  <div>
                    <p className="font-semibold text-white">{conn.name}</p>
                    <p className="text-xs text-gray-400">{conn.apiUrl}</p>
                  </div>
                  <Button
                    onClick={() => handleDeleteConnection(conn.id)}
                    className="p-2 text-red-500 hover:text-red-400"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="pt-4 border-t border-gray-700/50">
            <h4 className="text-md font-semibold text-gray-200 mb-3">Add New Connection</h4>
            <div className="space-y-3">
              <div className="relative">
                <ServerStackIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Service Name (e.g., Supplier Portal)"
                  value={newConnection.name}
                  onChange={(e) => handleNewConnectionChange('name', e.target.value)}
                  className="w-full bg-gray-700 rounded-md p-2 pl-10 text-sm"
                />
              </div>
              <div className="relative">
                <LinkIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="API URL"
                  value={newConnection.apiUrl}
                  onChange={(e) => handleNewConnectionChange('apiUrl', e.target.value)}
                  className="w-full bg-gray-700 rounded-md p-2 pl-10 text-sm"
                />
              </div>
              <div className="relative">
                <KeyIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  placeholder="API Key / Bearer Token"
                  value={newConnection.apiKey}
                  onChange={(e) => handleNewConnectionChange('apiKey', e.target.value)}
                  className="w-full bg-gray-700 rounded-md p-2 pl-10 text-sm"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleAddNewConnection}
                  className="bg-accent-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-accent-600 transition-colors"
                >
                  Add Connection
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Finale Inventory Integration */}
      <FinaleSetupPanel addToast={addToast} />

      {/* AfterShip Integration */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700 space-y-4">
        <div className="flex items-center gap-4">
          <TruckIcon className="w-8 h-8 text-accent-300" />
          <div>
            <h3 className="text-lg font-semibold text-white">AfterShip Tracking</h3>
            <p className="text-sm text-gray-400 mt-1">
              Poll carrier APIs via AfterShip to update PO tracking statuses automatically.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-3 text-sm text-gray-300">
            <input
              type="checkbox"
              className="rounded bg-gray-700 border-gray-600 text-accent-500 focus:ring-accent-500"
              checked={afterShipInputs.enabled}
              onChange={(e) => {
                setAfterShipInputs((prev) => ({ ...prev, enabled: e.target.checked }));
                setAfterShipError(null);
              }}
            />
            Enable automatic tracking updates
          </label>
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">
              Default Carrier Slug
            </label>
            <select
              value={afterShipInputs.selectedCarrier}
              onChange={(e) => {
                const nextValue = e.target.value;
                setAfterShipInputs((prev) => ({
                  ...prev,
                  selectedCarrier: nextValue,
                  customSlug: nextValue === CUSTOM_CARRIER_VALUE ? prev.customSlug : '',
                }));
                setAfterShipError(null);
              }}
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white"
            >
              {AFTERSHIP_CARRIER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {afterShipInputs.selectedCarrier === CUSTOM_CARRIER_VALUE && (
              <div className="mt-3">
                <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">
                  Carrier slug (from AfterShip docs)
                </label>
                <input
                  type="text"
                  value={afterShipInputs.customSlug}
                  onChange={(e) => {
                    const value = e.target.value;
                    setAfterShipInputs((prev) => ({ ...prev, customSlug: value }));
                    setAfterShipError(null);
                  }}
                  placeholder="e.g., canada-post"
                  className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Use the exact slug AfterShip expects for your carrier.
                </p>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">
            AfterShip API Key
          </label>
          <input
            type="password"
            value={afterShipInputs.apiKey}
            onChange={(e) => {
              setAfterShipInputs((prev) => ({ ...prev, apiKey: e.target.value }));
              setAfterShipError(null);
            }}
            placeholder={afterShipStoredKey ? '•••••••••• (stored)' : 'Enter AfterShip API key'}
            className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white"
          />
          <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
            <span>
              {afterShipStoredKey
                ? 'API key stored securely. Enter a new key to rotate.'
                : 'No API key stored yet.'}
            </span>
            {afterShipStoredKey && (
              <Button
                type="button"
                onClick={handleClearAfterShipKey}
                className="text-rose-300 hover:text-rose-200"
              >
                Remove stored key
              </Button>
            )}
          </div>
        </div>

        {afterShipError && (
          <p className="text-sm text-rose-300">{afterShipError}</p>
        )}

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            onClick={handleResetAfterShip}
            className="text-sm text-gray-300 hover:text-white"
            disabled={afterShipLoading}
          >
            {afterShipLoading ? 'Refreshing…' : 'Reset Changes'}
          </Button>
          <Button
            type="button"
            onClick={handleSaveAfterShip}
            disabled={afterShipLoading}
            className="bg-accent-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-accent-600 transition-colors disabled:bg-gray-600"
          >
            {afterShipLoading ? 'Saving…' : 'Save AfterShip Settings'}
          </Button>
        </div>
      </div>

      {/* Gmail Integration */}
      <div
        id="gmail-integration-card"
        className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700"
      >
        <div className="flex items-center gap-4">
          <GmailIcon className="w-8 h-8 text-gray-300" />
          <div>
            <h3 className="text-lg font-semibold text-white">Google Workspace Gmail</h3>
            <p className="text-sm text-gray-400 mt-1">
              Connect Workspace Gmail to send purchase orders directly to vendors and keep AI follow-ups threaded.
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-700/50 flex items-center justify-between">
          {gmailConnection.isConnected ? (
            <div className="text-sm">
              <span className="text-gray-400">Connected inbox: </span>
              <span className="font-semibold text-green-400">{gmailConnection.email}</span>
            </div>
          ) : (
            <div className="text-sm text-yellow-400">Workspace Gmail is not connected.</div>
          )}
          {gmailConnection.isConnected ? (
            <Button
              onClick={onGmailDisconnect}
              className="bg-red-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-red-700 transition-colors"
            >
              Disconnect Gmail
            </Button>
          ) : (
            <Button
              onClick={onGmailConnect}
              className="bg-accent-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-accent-600 transition-colors"
            >
              Connect Workspace Gmail
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default APIIntegrationsPanel;
