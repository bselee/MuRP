/**
 * Finale API Setup Panel - Updated
 * 
 * User-friendly interface for setting up Finale Inventory integration.
 * Guides users through:
 * 1. Finding their Finale credentials
 * 2. Testing the connection
 * 3. Starting data sync
 * 4. Monitoring sync status
 */

import React, { useState, useEffect } from 'react';
import { getFinaleSyncService, type SyncStatus } from '../services/finaleSyncService';
import { FinaleBasicAuthClient } from '../services/finaleBasicAuthClient';
import { 
  ServerStackIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  RefreshIcon,
  KeyIcon,
  LinkIcon,
  ChartBarIcon,
  InformationCircleIcon
} from './icons';

interface FinaleSetupPanelProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type SetupStep = 'credentials' | 'test' | 'sync' | 'monitor';

const FinaleSetupPanel: React.FC<FinaleSetupPanelProps> = ({ addToast }) => {
  // Setup state
  const [currentStep, setCurrentStep] = useState<SetupStep>('credentials');
  const [isConfigured, setIsConfigured] = useState(false);
  
  // Credentials - Initialize from environment variables if available
  const [credentials, setCredentials] = useState({
    apiKey: import.meta.env.VITE_FINALE_API_KEY || '',
    apiSecret: import.meta.env.VITE_FINALE_API_SECRET || '',
    accountPath: import.meta.env.VITE_FINALE_ACCOUNT_PATH || '',
  });
  
  // Connection test
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    facilities?: any[];
  } | null>(null);
  
  // Sync status
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  
  // Multi-select sync
  const [selectedSyncSources, setSelectedSyncSources] = useState<Set<string>>(new Set(['vendors', 'inventory', 'boms']));

  // Check if credentials are stored in localStorage on mount AND subscribe to sync status
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    const checkStoredCredentials = async () => {
      try {
        // First priority: Check localStorage for stored credentials
        let apiKey = localStorage.getItem('finale_api_key');
        let apiSecret = localStorage.getItem('finale_api_secret');
        let accountPath = localStorage.getItem('finale_account_path');
        
        // Second priority: Use environment variables if localStorage is empty
        if (!apiKey && import.meta.env.VITE_FINALE_API_KEY) {
          apiKey = import.meta.env.VITE_FINALE_API_KEY;
          apiSecret = import.meta.env.VITE_FINALE_API_SECRET;
          accountPath = import.meta.env.VITE_FINALE_ACCOUNT_PATH;
          console.log('[FinaleSetupPanel] Using credentials from environment variables');
        }
        
        if (apiKey && apiSecret && accountPath) {
          console.log('[FinaleSetupPanel] Found credentials, testing connection...');
          
          // Update form with found credentials
          setCredentials({
            apiKey,
            apiSecret,
            accountPath,
          });
          
          // Test the credentials
          const client = new FinaleBasicAuthClient({
            apiKey,
            apiSecret,
            accountPath,
            baseUrl: 'https://app.finaleinventory.com',
          });
          
          const result = await client.testConnection();
          
          if (result.success) {
            setIsConfigured(true);
            setCurrentStep('sync');
            
            // Save to localStorage for future use
            localStorage.setItem('finale_api_key', apiKey);
            localStorage.setItem('finale_api_secret', apiSecret);
            localStorage.setItem('finale_account_path', accountPath);
            
            // Configure sync service and subscribe to status changes
            const syncService = getFinaleSyncService();
            syncService.setCredentials(apiKey, apiSecret, accountPath);
            unsubscribe = syncService.onStatusChange(setSyncStatus);
            setSyncStatus(syncService.getStatus());
            
            console.log('[FinaleSetupPanel] ✅ Credentials verified, sync service configured');
          } else {
            console.warn('[FinaleSetupPanel] Credentials are invalid:', result.message);
            // Clear localStorage if they were stored there
            localStorage.removeItem('finale_api_key');
            localStorage.removeItem('finale_api_secret');
            localStorage.removeItem('finale_account_path');
          }
        } else {
          console.log('[FinaleSetupPanel] No credentials found - user needs to enter them');
        }
      } catch (error) {
        console.error('[FinaleSetupPanel] Error checking credentials:', error);
      }
    };
    
    checkStoredCredentials();
    
    // Cleanup subscription on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const handleCredentialChange = (field: keyof typeof credentials, value: string) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
    setTestResult(null); // Clear previous test result
  };

  const handleTestConnection = async () => {
    if (!credentials.apiKey || !credentials.apiSecret || !credentials.accountPath) {
      addToast('Please fill in all credentials', 'error');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const client = new FinaleBasicAuthClient({
        apiKey: credentials.apiKey,
        apiSecret: credentials.apiSecret,
        accountPath: credentials.accountPath,
        baseUrl: 'https://app.finaleinventory.com',
      });

      const result = await client.testConnection();
      setTestResult(result);

      if (result.success) {
        addToast('✅ Connection successful!', 'success');
        setCurrentStep('sync');
        
        // Save to localStorage
        localStorage.setItem('finale_api_key', credentials.apiKey);
        localStorage.setItem('finale_api_secret', credentials.apiSecret);
        localStorage.setItem('finale_account_path', credentials.accountPath);
        
        // Configure sync service and subscribe to status
        const syncService = getFinaleSyncService();
        syncService.setCredentials(
          credentials.apiKey,
          credentials.apiSecret,
          credentials.accountPath,
          'https://app.finaleinventory.com'
        );
        
        // Subscribe to sync status changes
        syncService.onStatusChange(setSyncStatus);
        setSyncStatus(syncService.getStatus());
        
        setIsConfigured(true);
      } else {
        addToast('❌ Connection failed: ' + result.message, 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({
        success: false,
        message,
      });
      addToast('❌ Connection failed: ' + message, 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleStartSync = async () => {
    if (!isConfigured) {
      addToast('❌ Please test connection first', 'error');
      return;
    }

    const syncService = getFinaleSyncService();
    
    // Ensure credentials are set
    if (!syncService.isConfigured()) {
      syncService.setCredentials(
        credentials.apiKey,
        credentials.apiSecret,
        credentials.accountPath,
        'https://app.finaleinventory.com'
      );
    }
    
    // Subscribe to sync status updates
    const unsubscribe = syncService.onStatusChange(setSyncStatus);
    
    addToast('🚀 Starting initial sync...', 'info');
    
    try {
      await syncService.syncAll();
      addToast('✅ Initial sync completed!', 'success');
      setCurrentStep('monitor');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      console.error('[FinaleSetupPanel] Sync error:', error);
      addToast('❌ Sync failed: ' + message, 'error');
    }
    
    return () => unsubscribe();
  };

  const handleToggleAutoSync = () => {
    if (!isConfigured) {
      addToast('❌ Please test connection first', 'error');
      return;
    }

    const syncService = getFinaleSyncService();
    
    // Ensure credentials are set
    if (!syncService.isConfigured()) {
      syncService.setCredentials(
        credentials.apiKey,
        credentials.apiSecret,
        credentials.accountPath,
        'https://app.finaleinventory.com'
      );
    }
    
    if (autoSyncEnabled) {
      syncService.stopAutoSync();
      addToast('Auto-sync stopped', 'info');
      setAutoSyncEnabled(false);
    } else {
      syncService.startAutoSync();
      addToast('✅ Auto-sync enabled!', 'success');
      setAutoSyncEnabled(true);
    }
  };

  const handleManualSync = async () => {
    if (selectedSyncSources.size === 0) {
      addToast('Please select at least one data source to sync', 'error');
      return;
    }

    if (!isConfigured) {
      addToast('❌ Please test connection first', 'error');
      return;
    }

    const syncService = getFinaleSyncService();
    
    // Ensure credentials are set
    if (!syncService.isConfigured()) {
      syncService.setCredentials(
        credentials.apiKey,
        credentials.apiSecret,
        credentials.accountPath,
        'https://app.finaleinventory.com'
      );
    }
    
    const sources = Array.from(selectedSyncSources);
    addToast(`🔄 Starting sync for: ${sources.join(', ')}...`, 'info');
    
    try {
      // Sync selected sources in order: vendors → inventory → BOMs
      if (selectedSyncSources.has('vendors')) {
        await syncService.syncVendors();
      }
      if (selectedSyncSources.has('inventory')) {
        await syncService.syncInventoryFromCSV();
      }
      if (selectedSyncSources.has('boms')) {
        await syncService.syncBOMsFromCSV();
      }
      
      addToast('✅ Sync completed!', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      addToast('❌ Sync failed: ' + message, 'error');
      console.error('[FinaleSetupPanel] Sync error:', error);
    }
  };

  const handleResetSyncStatus = () => {
    const syncService = getFinaleSyncService();
    // Force reset the sync status to allow manual sync again
    (syncService as any).status.isRunning = false;
    (syncService as any).updateStatus({
      isRunning: false,
      progress: {
        phase: 'idle',
        current: 0,
        total: 0,
        percentage: 0,
        message: 'Ready to sync',
      },
    });
    addToast('Sync status reset', 'info');
  };

  const toggleSyncSource = (source: string) => {
    const newSelection = new Set(selectedSyncSources);
    if (newSelection.has(source)) {
      newSelection.delete(source);
    } else {
      newSelection.add(source);
    }
    setSelectedSyncSources(newSelection);
  };

  const selectAllSyncSources = () => {
    setSelectedSyncSources(new Set(['vendors', 'inventory', 'boms']));
  };

  const deselectAllSyncSources = () => {
    setSelectedSyncSources(new Set());
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return 'N/A';
    return (ms / 1000).toFixed(1) + 's';
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  };

  const formatRelativeTime = (date: Date | null) => {
    if (!date) return 'Never';
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <ServerStackIcon className="w-10 h-10 text-blue-400" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white">Finale Inventory Integration</h3>
          <p className="text-sm text-gray-400 mt-1">
            Connect to Finale for real-time inventory, vendors, and purchase order sync
          </p>
        </div>
        {isConfigured && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-full">
            <CheckCircleIcon className="w-5 h-5 text-green-400" />
            <span className="text-sm font-medium text-green-400">Connected</span>
          </div>
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-gray-700/50 space-y-6">
        {/* Configuration Info */}
        {!isConfigured && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <p className="text-sm text-blue-300 font-medium mb-2">🔧 Setup Your Finale Integration</p>
            <p className="text-xs text-gray-400">
              Enter your Finale API credentials below to connect. You can find these in your Finale account under 
              <span className="text-blue-400 font-semibold"> Settings → Integrations → API Access</span>.
            </p>
          </div>
        )}

        {/* Step 1: Enter Credentials & Sync Data */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
              isConfigured ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
            } font-semibold text-sm`}>
              {isConfigured ? '✓' : '1'}
            </div>
            <h4 className="text-md font-semibold text-white">
              {isConfigured ? 'Finale Connected' : 'Connect to Finale'}
            </h4>
          </div>
          
          {!isConfigured && (
          <div className="ml-11 space-y-4">
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
              <p className="text-sm text-blue-300 font-medium mb-2">📍 Where to find your credentials:</p>
              <ol className="text-xs text-gray-400 space-y-1 ml-4 list-decimal">
                <li>Log in to your Finale account at <span className="text-blue-400 font-mono">app.finaleinventory.com</span></li>
                <li>Go to <span className="text-white font-semibold">Settings → Integrations → API Access</span></li>
                <li>Click <span className="text-white font-semibold">"Generate API Key"</span> if you don't have one</li>
                <li>Copy your <span className="text-white font-semibold">API Key</span> and <span className="text-white font-semibold">API Secret</span></li>
              </ol>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <KeyIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="API Key (e.g., I9TVdRvblFod)"
                  value={credentials.apiKey}
                  onChange={(e) => handleCredentialChange('apiKey', e.target.value)}
                  className="w-full bg-gray-700 rounded-md p-2.5 pl-10 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  disabled={isConfigured && currentStep !== 'credentials'}
                />
              </div>

              <div className="relative">
                <KeyIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  placeholder="API Secret"
                  value={credentials.apiSecret}
                  onChange={(e) => handleCredentialChange('apiSecret', e.target.value)}
                  className="w-full bg-gray-700 rounded-md p-2.5 pl-10 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  disabled={isConfigured && currentStep !== 'credentials'}
                />
              </div>

              <div className="relative">
                <LinkIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Account Path (e.g., yourcompany)"
                  value={credentials.accountPath}
                  onChange={(e) => handleCredentialChange('accountPath', e.target.value)}
                  className="w-full bg-gray-700 rounded-md p-2.5 pl-10 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  disabled={isConfigured && currentStep !== 'credentials'}
                />
              </div>

              <button
                onClick={handleTestConnection}
                disabled={isTesting || !credentials.apiKey || !credentials.apiSecret || !credentials.accountPath}
                className="w-full bg-blue-600 text-white font-semibold py-2.5 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isTesting ? (
                  <>
                    <RefreshIcon className="w-5 h-5 animate-spin" />
                    Testing Connection...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="w-5 h-5" />
                    Test Connection
                  </>
                )}
              </button>

              {testResult && (
                <div className={`flex items-start gap-3 p-3 rounded-lg border ${
                  testResult.success
                    ? 'bg-green-500/10 border-green-500/30 text-green-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}>
                  {testResult.success ? (
                    <CheckCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{testResult.message}</p>
                    {testResult.facilities && testResult.facilities.length > 0 && (
                      <p className="text-xs mt-1 opacity-80">
                        Found {testResult.facilities.length} facility(ies)
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        {/* Step 2: Initial Sync */}
        {isConfigured && currentStep === 'sync' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 font-semibold text-sm">
                2
              </div>
              <h4 className="text-md font-semibold text-white">Start Initial Data Sync</h4>
            </div>

            <div className="ml-11 space-y-4">
              <p className="text-sm text-gray-400">
                Sync your inventory, vendors, and purchase orders from Finale to this system.
                This may take a few minutes depending on your data size.
              </p>

              <button
                onClick={handleStartSync}
                className="w-full bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-md hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshIcon className="w-5 h-5" />
                Start Initial Sync
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Monitor */}
        {isConfigured && currentStep === 'monitor' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-green-400 font-semibold text-sm">
                ✓
              </div>
              <h4 className="text-md font-semibold text-white flex-1">Sync Status & Controls</h4>
              <button
                onClick={() => setCurrentStep('credentials')}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium"
              >
                Reconfigure Credentials
              </button>
            </div>

            <div className="ml-11 space-y-4">
              {/* Auto-sync toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-white">Automatic Sync</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Inventory: 5min | Vendors: 1hr | POs: 15min
                  </p>
                </div>
                <button
                  onClick={handleToggleAutoSync}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoSyncEnabled ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      autoSyncEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Sync stats */}
              {syncStatus && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-900/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <RefreshIcon className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-400">Last Sync</span>
                    </div>
                    <p className="text-sm font-semibold text-white">
                      {formatRelativeTime(syncStatus.lastSyncTime)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(syncStatus.lastSyncTime)}
                    </p>
                  </div>

                  <div className="p-3 bg-gray-900/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <ChartBarIcon className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-400">Items Synced</span>
                    </div>
                    <p className="text-sm font-semibold text-white">
                      {syncStatus.totalItemsSynced.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Duration: {formatDuration(syncStatus.lastSyncDuration)}
                    </p>
                  </div>
                </div>
              )}

              {/* Progress bar */}
              {syncStatus && syncStatus.isRunning && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">{syncStatus.progress.message}</span>
                    <span className="text-white font-medium">{syncStatus.progress.percentage}%</span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
                      style={{ width: `${syncStatus.progress.percentage}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Multi-select sync sources */}
              <div className="p-4 bg-gray-900/50 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white">Select Data Sources</p>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAllSyncSources}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      Select All
                    </button>
                    <span className="text-gray-600">|</span>
                    <button
                      onClick={deselectAllSyncSources}
                      className="text-xs text-gray-400 hover:text-white"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedSyncSources.has('vendors')}
                      onChange={() => toggleSyncSource('vendors')}
                      className="w-4 h-4 rounded border-gray-600 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-900"
                    />
                    <div className="flex-1">
                      <span className="text-sm text-white group-hover:text-indigo-300">Vendors</span>
                      <p className="text-xs text-gray-500">Supplier information and contacts</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedSyncSources.has('inventory')}
                      onChange={() => toggleSyncSource('inventory')}
                      className="w-4 h-4 rounded border-gray-600 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-900"
                    />
                    <div className="flex-1">
                      <span className="text-sm text-white group-hover:text-indigo-300">Inventory</span>
                      <p className="text-xs text-gray-500">Stock levels, costs, and locations</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedSyncSources.has('boms')}
                      onChange={() => toggleSyncSource('boms')}
                      className="w-4 h-4 rounded border-gray-600 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-900"
                    />
                    <div className="flex-1">
                      <span className="text-sm text-white group-hover:text-indigo-300">Bills of Materials</span>
                      <p className="text-xs text-gray-500">Product recipes and components</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Manual sync button */}
              <div className="space-y-2">
                <button
                  onClick={handleManualSync}
                  disabled={syncStatus?.isRunning || selectedSyncSources.size === 0}
                  className="w-full bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <RefreshIcon className={`w-5 h-5 ${syncStatus?.isRunning ? 'animate-spin' : ''}`} />
                  {syncStatus?.isRunning ? 'Syncing...' : `Sync Selected (${selectedSyncSources.size})`}
                </button>

                {/* Reset button if stuck in running state */}
                {syncStatus?.isRunning && (
                  <button
                    onClick={handleResetSyncStatus}
                    className="w-full bg-gray-700 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-gray-600 transition-colors"
                  >
                    Reset Sync Status (if stuck)
                  </button>
                )}

                {/* Debug info */}
                {syncStatus && (
                  <div className="text-xs text-gray-500 text-center">
                    Status: {syncStatus.isRunning ? 'Running' : 'Idle'} | 
                    Sources: {selectedSyncSources.size} | 
                    Phase: {syncStatus.progress.phase}
                  </div>
                )}
              </div>

              {/* Errors */}
              {syncStatus && syncStatus.errors.length > 0 && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-sm font-medium text-red-300 mb-2">Recent Errors:</p>
                  <div className="space-y-1">
                    {syncStatus.errors.slice(-3).map((error, i) => (
                      <p key={i} className="text-xs text-red-400">
                        {error.phase}: {error.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinaleSetupPanel;
