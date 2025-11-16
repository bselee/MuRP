import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Page } from '../App';
import type { GmailConnection, ExternalConnection } from '../types';
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
} from './icons';
import { supabase } from '../lib/supabase/client';
import { dispatchSyncEvent } from '../lib/syncEventBus';
import FinaleSetupPanel from './FinaleSetupPanel';

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

interface SyncMetadataRow {
  data_type: SyncType;
  last_sync_time: string;
  item_count: number;
  success: boolean;
}

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
  { type: 'inventory', label: 'Inventory', accent: 'text-indigo-300' },
  { type: 'boms', label: 'BOMs', accent: 'text-emerald-300' },
];

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
  const [syncMetadata, setSyncMetadata] = useState<Record<SyncType, SyncMetadataRow | null>>({
    vendors: null,
    inventory: null,
    boms: null,
  });
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [manualSyncResult, setManualSyncResult] = useState<ManualSyncResponse | null>(null);
  const [manualSyncError, setManualSyncError] = useState<string | null>(null);
  const [manualSyncStartedAt, setManualSyncStartedAt] = useState<number | null>(null);
  const manualPollingRef = useRef<number | null>(null);

  const [newConnection, setNewConnection] = useState({ name: '', apiUrl: '', apiKey: '' });

  const fetchSyncMetadata = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('sync_metadata').select('*');
      if (error) throw error;
      const next: Record<SyncType, SyncMetadataRow | null> = {
        vendors: null,
        inventory: null,
        boms: null,
      };
      (data || []).forEach((row) => {
        const type = row.data_type as SyncType;
        if (type in next) {
          next[type] = row as SyncMetadataRow;
        }
      });
      setSyncMetadata(next);
    } catch (error) {
      console.error('[APIIntegrations] Failed to load sync metadata', error);
    }
  }, []);

  const startManualPolling = useCallback(() => {
    if (typeof window === 'undefined' || manualPollingRef.current !== null) return;
    manualPollingRef.current = window.setInterval(() => {
      fetchSyncMetadata();
    }, 2500);
  }, [fetchSyncMetadata]);

  const stopManualPolling = useCallback(() => {
    if (manualPollingRef.current !== null) {
      clearInterval(manualPollingRef.current);
      manualPollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    fetchSyncMetadata();
    if (typeof window === 'undefined') return;
    const interval = window.setInterval(fetchSyncMetadata, 60000);
    return () => {
      clearInterval(interval);
    };
  }, [fetchSyncMetadata]);

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

  const handleForceSync = useCallback(async () => {
    if (isManualSyncing) return;
    setManualSyncError(null);
    setManualSyncResult(null);
    setIsManualSyncing(true);
    const startedAt = Date.now();
    setManualSyncStartedAt(startedAt);
    fetchSyncMetadata();
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
      await fetchSyncMetadata();
      dispatchSyncEvent({ running: false, source: 'settings:manual' });
    }
  }, [
    isManualSyncing,
    addToast,
    fetchSyncMetadata,
    startManualPolling,
    stopManualPolling,
  ]);

  const getStepBadge = useCallback(
    (type: SyncType): StepBadge => {
      const metadata = syncMetadata[type];
      const lastSyncTime = metadata?.last_sync_time;
      const updatedThisRun = Boolean(
        manualSyncStartedAt &&
          metadata &&
          new Date(lastSyncTime as string).getTime() >= manualSyncStartedAt,
      );

      if (manualSyncStartedAt) {
        if (updatedThisRun) {
          return metadata?.success
            ? { label: 'Updated', className: 'bg-green-500/15 text-green-300', state: 'updated' }
            : { label: 'Failed', className: 'bg-red-500/15 text-red-300', state: 'failed' };
        }

        const stepIndex = SYNC_STEPS.findIndex((step) => step.type === type);
        const previousComplete = SYNC_STEPS.slice(0, stepIndex).every((step) => {
          const stepMeta = syncMetadata[step.type];
          if (!manualSyncStartedAt || !stepMeta) return false;
          return new Date(stepMeta.last_sync_time).getTime() >= manualSyncStartedAt;
        });

        if (previousComplete) {
          return { label: 'Running…', className: 'bg-blue-500/15 text-blue-300', state: 'running' };
        }

        return { label: 'Queued', className: 'bg-gray-600/40 text-gray-300', state: 'queued' };
      }

      if (!metadata) {
        return { label: 'Not synced', className: 'bg-gray-700/50 text-gray-300', state: 'idle' };
      }

      return metadata.success
        ? { label: 'Healthy', className: 'bg-emerald-500/15 text-emerald-300', state: 'healthy' }
        : { label: 'Needs attention', className: 'bg-red-500/15 text-red-300', state: 'failed' };
    },
    [manualSyncStartedAt, syncMetadata],
  );

  const syncCards = useMemo(() => {
    return SYNC_STEPS.map((step) => {
      const metadata = syncMetadata[step.type];
      const badge = getStepBadge(step.type);
      return {
        ...step,
        metadata,
        badge,
      };
    });
  }, [getStepBadge, syncMetadata]);

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
                <button
                  onClick={handleCopyApiKey}
                  className="p-2 text-gray-400 hover:text-white"
                >
                  <ClipboardCopyIcon className="w-5 h-5" />
                </button>
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
                  <button
                    onClick={onGenerateApiKey}
                    className="text-sm text-indigo-400 hover:underline mr-4"
                  >
                    Regenerate
                  </button>
                  <button onClick={onRevokeApiKey} className="text-sm text-red-400 hover:underline">
                    Revoke Key
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-400 mb-3">No API key is currently active.</p>
              <button
                onClick={onGenerateApiKey}
                className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
              >
                Generate API Key
              </button>
            </div>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-700/50 flex justify-end">
          <button
            onClick={() => setCurrentPage('API Documentation')}
            className="text-sm font-semibold text-indigo-400 hover:text-indigo-300"
          >
            View API Documentation &rarr;
          </button>
        </div>
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
            <button
              onClick={handleForceSync}
              disabled={isManualSyncing}
              className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                isManualSyncing
                  ? 'bg-gray-700 text-gray-300 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
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
            </button>
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
                  <button
                    onClick={() => handleDeleteConnection(conn.id)}
                    className="p-2 text-red-500 hover:text-red-400"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
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
                <button
                  onClick={handleAddNewConnection}
                  className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
                >
                  Add Connection
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Finale Inventory Integration */}
      <FinaleSetupPanel addToast={addToast} />

      {/* Gmail Integration */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-4">
          <GmailIcon className="w-8 h-8 text-gray-300" />
          <div>
            <h3 className="text-lg font-semibold text-white">Gmail Integration</h3>
            <p className="text-sm text-gray-400 mt-1">
              Connect your Gmail account to send Purchase Orders directly to vendors from within the
              app.
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-700/50 flex items-center justify-between">
          {gmailConnection.isConnected ? (
            <div className="text-sm">
              <span className="text-gray-400">Connected as: </span>
              <span className="font-semibold text-green-400">{gmailConnection.email}</span>
            </div>
          ) : (
            <div className="text-sm text-yellow-400">Gmail account is not connected.</div>
          )}
          {gmailConnection.isConnected ? (
            <button
              onClick={onGmailDisconnect}
              className="bg-red-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-red-700 transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={onGmailConnect}
              className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
            >
              Connect Gmail Account
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default APIIntegrationsPanel;
