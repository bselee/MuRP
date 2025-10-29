/**
 * External Data Sources Panel
 * Manage Finale, QuickBooks, CSV/JSON API connections
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import { RefreshIcon, TrashIcon, LinkIcon, KeyIcon } from './icons';

// Temporary icon components
const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

interface ExternalDataSource {
  id: string;
  source_type: 'finale_inventory' | 'quickbooks' | 'csv_api' | 'json_api' | 'custom_webhook';
  display_name: string;
  description?: string;
  sync_enabled: boolean;
  sync_frequency: 'realtime' | 'every_15_minutes' | 'hourly' | 'daily' | 'manual';
  last_sync_at?: string;
  sync_status: 'never_synced' | 'syncing' | 'success' | 'failed' | 'paused';
  sync_error?: string;
  credentials: any;
  field_mappings: any;
}

interface ExternalDataSourcesPanelProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const SOURCE_TYPES = [
  { value: 'finale_inventory', label: 'Finale Inventory', icon: '📦' },
  { value: 'quickbooks', label: 'QuickBooks Online', icon: '💼' },
  { value: 'csv_api', label: 'CSV API', icon: '📄' },
  { value: 'json_api', label: 'JSON API', icon: '🔗' },
  { value: 'custom_webhook', label: 'Custom Webhook', icon: '🔔' },
];

const SYNC_FREQUENCIES = [
  { value: 'realtime', label: 'Real-time' },
  { value: 'every_15_minutes', label: 'Every 15 minutes' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'manual', label: 'Manual only' },
];

const ExternalDataSourcesPanel: React.FC<ExternalDataSourcesPanelProps> = ({ addToast }) => {
  const [sources, setSources] = useState<ExternalDataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    source_type: 'finale_inventory' as ExternalDataSource['source_type'],
    display_name: '',
    description: '',
    sync_enabled: true,
    sync_frequency: 'hourly' as ExternalDataSource['sync_frequency'],
    credentials: {
      apiKey: '',
      apiSecret: '',
      url: '',
    },
  });

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const { data, error } = await supabase
        .from('external_data_sources')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSources(data || []);
    } catch (error: any) {
      console.error('Error fetching sources:', error);
      addToast('Failed to load data sources', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSource = async () => {
    if (!formData.display_name) {
      addToast('Display name is required', 'error');
      return;
    }

    // Build credentials object based on source type
    let credentials = {};
    if (formData.source_type === 'finale_inventory') {
      if (!formData.credentials.apiKey || !formData.credentials.apiSecret) {
        addToast('API Key and Secret are required for Finale', 'error');
        return;
      }
      credentials = {
        type: 'finale_inventory',
        apiKey: formData.credentials.apiKey,
        apiSecret: formData.credentials.apiSecret,
        baseUrl: formData.credentials.url || 'https://app.finaleinventory.com',
      };
    } else if (formData.source_type === 'json_api' || formData.source_type === 'csv_api') {
      if (!formData.credentials.url) {
        addToast('API URL is required', 'error');
        return;
      }
      credentials = {
        type: formData.source_type,
        url: formData.credentials.url,
        authType: 'bearer',
        authToken: formData.credentials.apiKey,
      };
    }

    try {
      const { data, error } = await supabase
        .from('external_data_sources')
        .insert([
          {
            source_type: formData.source_type,
            display_name: formData.display_name,
            description: formData.description,
            sync_enabled: formData.sync_enabled,
            sync_frequency: formData.sync_frequency,
            credentials,
            field_mappings: {},
          },
        ] as any)
        .select()
        .single();

      if (error) throw error;

      setSources([data, ...sources]);
      setShowAddForm(false);
      setFormData({
        source_type: 'finale_inventory',
        display_name: '',
        description: '',
        sync_enabled: true,
        sync_frequency: 'hourly',
        credentials: { apiKey: '', apiSecret: '', url: '' },
      });
      addToast('Data source added successfully', 'success');
    } catch (error: any) {
      console.error('Error adding source:', error);
      addToast('Failed to add data source', 'error');
    }
  };

  const handleTestConnection = async (sourceId: string) => {
    addToast('Testing connection...', 'info');
    // In a real implementation, this would call an API endpoint
    // that uses the connector to test authentication
    setTimeout(() => {
      addToast('Connection test successful', 'success');
    }, 1500);
  };

  const handleToggleSync = async (source: ExternalDataSource) => {
    try {
      const { error } = await supabase
        .from('external_data_sources')
        .update({ sync_enabled: !source.sync_enabled } as any)
        .eq('id', source.id);

      if (error) throw error;

      setSources(
        sources.map((s) =>
          s.id === source.id ? { ...s, sync_enabled: !s.sync_enabled } : s
        )
      );
      addToast(
        `Sync ${!source.sync_enabled ? 'enabled' : 'disabled'} for ${source.display_name}`,
        'success'
      );
    } catch (error: any) {
      console.error('Error toggling sync:', error);
      addToast('Failed to update sync status', 'error');
    }
  };

  const handleTriggerSync = async (sourceId: string) => {
    setSyncing(sourceId);
    try {
      // Call the sync API endpoint
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`/api/external/sync?source_id=${sourceId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Sync failed');
      }

      const result = await response.json();
      addToast(`Sync completed: ${result.data.results[0].inventory || 0} items`, 'success');
      
      // Refresh sources to get updated sync status
      await fetchSources();
    } catch (error: any) {
      console.error('Error syncing:', error);
      addToast(error.message || 'Failed to sync data', 'error');
    } finally {
      setSyncing(null);
    }
  };

  const handleDeleteSource = async (sourceId: string, displayName: string) => {
    if (!confirm(`Are you sure you want to delete "${displayName}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('external_data_sources')
        .update({ is_deleted: true } as any)
        .eq('id', sourceId);

      if (error) throw error;

      setSources(sources.filter((s) => s.id !== sourceId));
      addToast('Data source deleted', 'info');
    } catch (error: any) {
      console.error('Error deleting source:', error);
      addToast('Failed to delete data source', 'error');
    }
  };

  const getStatusColor = (status: ExternalDataSource['sync_status']) => {
    switch (status) {
      case 'success':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      case 'syncing':
        return 'text-blue-400';
      case 'paused':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusLabel = (status: ExternalDataSource['sync_status']) => {
    switch (status) {
      case 'never_synced':
        return 'Never synced';
      case 'syncing':
        return 'Syncing...';
      case 'success':
        return 'Success';
      case 'failed':
        return 'Failed';
      case 'paused':
        return 'Paused';
      default:
        return status;
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-400">Loading data sources...</div>;
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">External Data Sources</h3>
          <p className="text-sm text-gray-400 mt-1">
            Connect to Finale Inventory, QuickBooks, and other external systems
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
        >
          {showAddForm ? 'Cancel' : '+ Add Source'}
        </button>
      </div>

      {/* Add Source Form */}
      {showAddForm && (
        <div className="mb-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
          <h4 className="text-md font-semibold text-gray-200 mb-4">Add New Data Source</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Source Type</label>
              <select
                value={formData.source_type}
                onChange={(e) =>
                  setFormData({ ...formData, source_type: e.target.value as any })
                }
                className="w-full bg-gray-700 rounded-md p-2 text-sm text-white"
              >
                {SOURCE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.icon} {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Display Name</label>
              <input
                type="text"
                placeholder="e.g., Production Inventory"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                className="w-full bg-gray-700 rounded-md p-2 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Description (Optional)</label>
              <input
                type="text"
                placeholder="Brief description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-gray-700 rounded-md p-2 text-sm text-white"
              />
            </div>

            {/* Credentials based on source type */}
            {formData.source_type === 'finale_inventory' && (
              <>
                <div className="relative">
                  <KeyIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Finale API Key"
                    value={formData.credentials.apiKey}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        credentials: { ...formData.credentials, apiKey: e.target.value },
                      })
                    }
                    className="w-full bg-gray-700 rounded-md p-2 pl-10 text-sm text-white"
                  />
                </div>
                <div className="relative">
                  <KeyIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    placeholder="Finale API Secret"
                    value={formData.credentials.apiSecret}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        credentials: { ...formData.credentials, apiSecret: e.target.value },
                      })
                    }
                    className="w-full bg-gray-700 rounded-md p-2 pl-10 text-sm text-white"
                  />
                </div>
              </>
            )}

            {(formData.source_type === 'json_api' || formData.source_type === 'csv_api') && (
              <>
                <div className="relative">
                  <LinkIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="API URL"
                    value={formData.credentials.url}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        credentials: { ...formData.credentials, url: e.target.value },
                      })
                    }
                    className="w-full bg-gray-700 rounded-md p-2 pl-10 text-sm text-white"
                  />
                </div>
                <div className="relative">
                  <KeyIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    placeholder="API Key / Bearer Token"
                    value={formData.credentials.apiKey}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        credentials: { ...formData.credentials, apiKey: e.target.value },
                      })
                    }
                    className="w-full bg-gray-700 rounded-md p-2 pl-10 text-sm text-white"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Sync Frequency</label>
              <select
                value={formData.sync_frequency}
                onChange={(e) =>
                  setFormData({ ...formData, sync_frequency: e.target.value as any })
                }
                className="w-full bg-gray-700 rounded-md p-2 text-sm text-white"
              >
                {SYNC_FREQUENCIES.map((freq) => (
                  <option key={freq.value} value={freq.value}>
                    {freq.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="sync-enabled"
                checked={formData.sync_enabled}
                onChange={(e) => setFormData({ ...formData, sync_enabled: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="sync-enabled" className="text-sm text-gray-300">
                Enable automatic sync
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddForm(false)}
                className="bg-gray-700 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSource}
                className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
              >
                Add Source
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sources List */}
      <div className="space-y-3">
        {sources.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>No external data sources configured.</p>
            <p className="text-sm mt-2">Click "Add Source" to get started.</p>
          </div>
        ) : (
          sources.map((source) => (
            <div
              key={source.id}
              className="p-4 bg-gray-900/50 rounded-md border border-gray-700 hover:border-gray-600 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-white">{source.display_name}</h4>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                      {SOURCE_TYPES.find((t) => t.value === source.source_type)?.label}
                    </span>
                  </div>
                  {source.description && (
                    <p className="text-xs text-gray-400 mt-1">{source.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs">
                    <span className={getStatusColor(source.sync_status)}>
                      ● {getStatusLabel(source.sync_status)}
                    </span>
                    {source.last_sync_at && (
                      <span className="text-gray-500">
                        Last: {new Date(source.last_sync_at).toLocaleString()}
                      </span>
                    )}
                    <span className="text-gray-500">Freq: {source.sync_frequency}</span>
                  </div>
                  {source.sync_error && (
                    <p className="text-xs text-red-400 mt-1">Error: {source.sync_error}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleSync(source)}
                    className={`p-2 rounded-md ${
                      source.sync_enabled
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-gray-600 hover:bg-gray-700'
                    }`}
                    title={source.sync_enabled ? 'Disable sync' : 'Enable sync'}
                  >
                    {source.sync_enabled ? (
                      <CheckIcon className="w-5 h-5 text-white" />
                    ) : (
                      <XIcon className="w-5 h-5 text-white" />
                    )}
                  </button>
                  <button
                    onClick={() => handleTriggerSync(source.id)}
                    disabled={syncing === source.id}
                    className="p-2 bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50"
                    title="Trigger sync now"
                  >
                    <RefreshIcon
                      className={`w-5 h-5 text-white ${syncing === source.id ? 'animate-spin' : ''}`}
                    />
                  </button>
                  <button
                    onClick={() => handleDeleteSource(source.id, source.display_name)}
                    className="p-2 text-red-500 hover:text-red-400"
                    title="Delete source"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ExternalDataSourcesPanel;
