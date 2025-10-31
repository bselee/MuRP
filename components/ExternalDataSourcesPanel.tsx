/**
 * External Data Sources Panel
 * 
 * UI component for managing external data source integrations:
 * - Finale Inventory
 * - Supabase Backend
 * - CSV/JSON APIs
 * 
 * Features:
 * - Connection status monitoring
 * - Manual sync triggers
 * - Configuration management
 * - Sync history and logs
 */

import { useState, useEffect } from 'react';
import { isSupabaseConfigured } from '../lib/supabase/client';
import { syncInventory } from '../services/inventoryService';
import type { InventoryItem, Vendor, PurchaseOrder } from '../types';

interface DataSourceStatus {
  name: string;
  configured: boolean;
  connected: boolean;
  lastSync?: string;
  error?: string;
}

interface SyncResult {
  success: boolean;
  itemsProcessed: number;
  errors: string[];
  duration: number;
}

export default function ExternalDataSourcesPanel() {
  const [sources, setSources] = useState<DataSourceStatus[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<Record<string, SyncResult>>({});
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    checkDataSources();
  }, []);

  /**
   * Check status of all data sources
   */
  async function checkDataSources() {
    const sourceStatuses: DataSourceStatus[] = [];

    // Check Supabase
    const supabaseConfigured = isSupabaseConfigured();
    sourceStatuses.push({
      name: 'Supabase Backend',
      configured: supabaseConfigured,
      connected: supabaseConfigured, // Would need actual ping test
      lastSync: localStorage.getItem('last-supabase-sync') || undefined,
    });

    // Check Finale Inventory
    const finaleConfigured = !!(
      import.meta.env.VITE_FINALE_API_CLIENT_ID &&
      import.meta.env.VITE_FINALE_API_CLIENT_SECRET
    );
    sourceStatuses.push({
      name: 'Finale Inventory',
      configured: finaleConfigured,
      connected: false, // Would need actual API check
      lastSync: localStorage.getItem('last-finale-sync') || undefined,
    });

    // Check CSV/JSON API (placeholder)
    sourceStatuses.push({
      name: 'CSV/JSON API',
      configured: false,
      connected: false,
      lastSync: undefined,
    });

    setSources(sourceStatuses);
  }

  /**
   * Sync data from a specific source
   */
  async function syncFromSource(sourceName: string) {
    setSyncing(sourceName);
    const startTime = Date.now();

    try {
      let result: SyncResult;

      switch (sourceName) {
        case 'Supabase Backend':
          result = await syncFromSupabase();
          break;
        
        case 'Finale Inventory':
          result = await syncFromFinale();
          break;
        
        case 'CSV/JSON API':
          result = await syncFromCsvApi();
          break;
        
        default:
          throw new Error(`Unknown source: ${sourceName}`);
      }

      result.duration = Date.now() - startTime;
      
      setSyncResults(prev => ({
        ...prev,
        [sourceName]: result,
      }));

      // Update last sync time
      localStorage.setItem(`last-${sourceName.toLowerCase().replace(/\s/g, '-')}-sync`, new Date().toISOString());
      
      // Refresh source status
      await checkDataSources();
      
    } catch (error) {
      console.error(`Error syncing from ${sourceName}:`, error);
      
      setSyncResults(prev => ({
        ...prev,
        [sourceName]: {
          success: false,
          itemsProcessed: 0,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          duration: Date.now() - startTime,
        },
      }));
    } finally {
      setSyncing(null);
    }
  }

  /**
   * Sync from Supabase
   */
  async function syncFromSupabase(): Promise<SyncResult> {
    // In a real implementation, this would:
    // 1. Fetch data from Supabase tables
    // 2. Transform to application format
    // 3. Update local state or merge with localStorage

    return {
      success: true,
      itemsProcessed: 0,
      errors: [],
      duration: 0,
    };
  }

  /**
   * Sync from Finale Inventory
   */
  async function syncFromFinale(): Promise<SyncResult> {
    // In a real implementation, this would:
    // 1. Call Finale API through secure proxy
    // 2. Transform product data to inventory items
    // 3. Sync with Supabase or local storage

    throw new Error('Finale sync not yet implemented. Requires API configuration.');
  }

  /**
   * Sync from CSV/JSON API
   */
  async function syncFromCsvApi(): Promise<SyncResult> {
    throw new Error('CSV/JSON API sync not yet implemented.');
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">External Data Sources</h2>
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          {showLogs ? 'Hide Logs' : 'Show Logs'}
        </button>
      </div>

      <div className="space-y-4">
        {sources.map((source) => (
          <div
            key={source.name}
            className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  source.connected ? 'bg-green-500' :
                  source.configured ? 'bg-yellow-500' :
                  'bg-red-500'
                }`} />
                <h3 className="font-semibold text-lg">{source.name}</h3>
              </div>
              
              <button
                onClick={() => syncFromSource(source.name)}
                disabled={!source.configured || syncing === source.name}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {syncing === source.name ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Syncing...
                  </span>
                ) : (
                  'Sync Now'
                )}
              </button>
            </div>

            <div className="text-sm text-gray-600 space-y-1">
              <div>
                Status: {
                  source.connected ? '✓ Connected' :
                  source.configured ? '⚠ Configured (not connected)' :
                  '❌ Not configured'
                }
              </div>
              
              {source.lastSync && (
                <div>
                  Last sync: {new Date(source.lastSync).toLocaleString()}
                </div>
              )}

              {source.error && (
                <div className="text-red-600">
                  Error: {source.error}
                </div>
              )}

              {syncResults[source.name] && (
                <div className={`mt-2 p-2 rounded ${
                  syncResults[source.name].success ? 'bg-green-50' : 'bg-red-50'
                }`}>
                  <div className={syncResults[source.name].success ? 'text-green-800' : 'text-red-800'}>
                    {syncResults[source.name].success ? '✓' : '✗'} Sync {syncResults[source.name].success ? 'completed' : 'failed'}
                  </div>
                  <div className="text-xs mt-1">
                    Items processed: {syncResults[source.name].itemsProcessed} | 
                    Duration: {(syncResults[source.name].duration / 1000).toFixed(2)}s
                  </div>
                  {syncResults[source.name].errors.length > 0 && (
                    <div className="text-xs mt-1 text-red-700">
                      Errors: {syncResults[source.name].errors.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {!source.configured && (
              <div className="mt-3 p-3 bg-blue-50 rounded text-sm text-blue-800">
                <p className="font-medium mb-1">Configuration Required</p>
                <p>Add credentials to <code className="bg-blue-100 px-1 rounded">.env.local</code> to enable this source.</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {showLogs && (
        <div className="mt-6 border-t border-gray-200 pt-6">
          <h3 className="font-semibold mb-3">Sync Logs</h3>
          <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm max-h-96 overflow-y-auto">
            {Object.entries(syncResults).length === 0 ? (
              <p className="text-gray-500">No sync operations yet.</p>
            ) : (
              Object.entries(syncResults).map(([source, result]) => (
                <div key={source} className="mb-4 last:mb-0">
                  <div className="font-bold">{source}</div>
                  <div className="ml-4 text-gray-600">
                    <div>Success: {result.success ? 'Yes' : 'No'}</div>
                    <div>Items: {result.itemsProcessed}</div>
                    <div>Duration: {(result.duration / 1000).toFixed(2)}s</div>
                    {result.errors.length > 0 && (
                      <div className="text-red-600">
                        Errors: {result.errors.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
        <p className="font-medium mb-2">📚 Documentation</p>
        <ul className="space-y-1">
          <li>• <a href="/API_INGESTION_SETUP.md" className="text-blue-600 hover:underline">API Integration Setup Guide</a></li>
          <li>• <a href="/backend_documentation.md" className="text-blue-600 hover:underline">Backend API Documentation</a></li>
          <li>• <a href="/USAGE_EXAMPLES.md" className="text-blue-600 hover:underline">Usage Examples</a></li>
        </ul>
      </div>
    </div>
  );
}
