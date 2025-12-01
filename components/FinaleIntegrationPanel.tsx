import Button from '@/components/ui/Button';
/**
 * Finale Integration Panel
 *
 * Beautiful, user-friendly interface for setting up Finale API integration
 * - Visual connection status
 * - Easy credential configuration
 * - One-click connection test
 * - Sync controls with progress
 * - Health monitoring
 */

import React, { useState, useEffect } from 'react';
import { getDataService } from '../lib/dataService';
import { upsertInventoryItems, upsertVendors } from '../hooks/useSupabaseMutations';
import {
  CheckCircleIcon,
  XCircleIcon,
  RefreshIcon,
  KeyIcon,
  ServerStackIcon,
  LinkIcon,
  ClipboardCopyIcon,
  EyeIcon,
  EyeSlashIcon,
} from './icons';

interface FinaleIntegrationPanelProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const FinaleIntegrationPanel: React.FC<FinaleIntegrationPanelProps> = ({ addToast }) => {
  // State for form inputs
  const [apiKey, setApiKey] = useState<string>(import.meta.env.VITE_FINALE_API_KEY || '');
  const [apiSecret, setApiSecret] = useState<string>(import.meta.env.VITE_FINALE_API_SECRET || '');
  const [accountPath, setAccountPath] = useState<string>(
    import.meta.env.VITE_FINALE_ACCOUNT_PATH || ''
  );
  const [baseUrl, setBaseUrl] = useState<string>(
    import.meta.env.VITE_FINALE_BASE_URL || 'https://app.finaleinventory.com'
  );

  // UI state
  const [showApiSecret, setShowApiSecret] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<FinaleConnectionStatus | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [finaleClient, setFinaleClient] = useState<FinaleClient | null>(getFinaleClient());

  // Check if credentials are configured
  const hasCredentials = apiKey && apiSecret && accountPath && baseUrl;
  const isConfigured = !!finaleClient && hasCredentials;

  // Load connection status on mount
  useEffect(() => {
    if (finaleClient) {
      loadConnectionStatus();
      // Start health checks
      finaleClient.startHealthCheck(300000); // Every 5 minutes

      return () => {
        finaleClient.stopHealthCheck();
      };
    }
  }, [finaleClient]);

  const loadConnectionStatus = async () => {
    if (!finaleClient) return;
    try {
      const status = await finaleClient.getConnectionStatus();
      setConnectionStatus(status);
    } catch (error) {
      console.error('Error loading connection status:', error);
    }
  };

  const handleTestConnection = async () => {
    if (!hasCredentials) {
      addToast('Please fill in all required fields', 'error');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // Create or update client
      const config: FinaleConnectionConfig = {
        apiKey,
        apiSecret,
        accountPath,
        baseUrl,
      };

      const client = updateFinaleClient(config);
      setFinaleClient(client);

      // Test connection
      const result = await client.testConnection();
      setTestResult(result);

      if (result.success) {
        addToast('Successfully connected to Finale!', 'success');
        // Load status
        await loadConnectionStatus();
      } else {
        addToast(`Connection failed: ${result.message}`, 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({ success: false, message });
      addToast(`Connection test failed: ${message}`, 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSync = async () => {
    if (!finaleClient) {
      addToast('Please connect to Finale first', 'error');
      return;
    }

    setIsSyncing(true);
    try {
      // Use data service to sync and transform data
      const dataService = getDataService();
      const transformedData = await dataService.syncAllFromFinale();

      // Save inventory to Supabase
      const inventoryResult = await upsertInventoryItems(transformedData.inventory);
      if (!inventoryResult.success) {
        throw new Error(`Failed to save inventory: ${inventoryResult.error}`);
      }

      // Save vendors to Supabase
      const vendorResult = await upsertVendors(transformedData.vendors);
      if (!vendorResult.success) {
        throw new Error(`Failed to save vendors: ${vendorResult.error}`);
      }

      addToast(
        `Sync complete! Saved ${transformedData.inventory.length} products and ${transformedData.vendors.length} vendors to database`,
        'success'
      );

      // Reload status
      await loadConnectionStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      addToast(`Sync failed: ${message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCopySetupInstructions = () => {
    const instructions = `
# Finale API Setup Instructions

1. Log in to Finale Inventory at: https://app.finaleinventory.com/${accountPath || 'YOUR_ACCOUNT'}

2. Navigate to: Settings → Integrations → API Access

3. Create a new API application or use existing credentials

4. Copy your credentials:
   - API Key: ${apiKey || '[YOUR_API_KEY]'}
   - API Secret: ${apiSecret || '[YOUR_API_SECRET]'}
   - Account Path: ${accountPath || '[YOUR_ACCOUNT_PATH]'}

5. Add to your .env.local file:
   VITE_FINALE_API_KEY=${apiKey || 'your-api-key-here'}
   VITE_FINALE_API_SECRET=${apiSecret || 'your-api-secret-here'}
   VITE_FINALE_ACCOUNT_PATH=${accountPath || 'your-account-path'}
   VITE_FINALE_BASE_URL=${baseUrl}

6. Restart your development server

For more information, see: https://support.finaleinventory.com/hc/en-us/articles/4408832394647
    `.trim();

    navigator.clipboard.writeText(instructions);
    addToast('Setup instructions copied to clipboard', 'success');
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <ServerStackIcon className="w-8 h-8 text-accent-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">Finale Inventory Integration</h3>
            <p className="text-sm text-gray-400 mt-1">
              Connect to your Finale account for real-time inventory sync
            </p>
          </div>
        </div>
        {isConfigured && connectionStatus?.isConnected && (
          <div className="flex items-center gap-2 bg-green-900/30 text-green-400 px-3 py-1.5 rounded-full border border-green-700/50">
            <CheckCircleIcon className="w-5 h-5" />
            <span className="text-sm font-semibold">Connected</span>
          </div>
        )}
      </div>

      {/* Connection Status (if connected) */}
      {connectionStatus && (
        <div className="mb-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-400">Account</p>
              <p className="text-sm font-semibold text-white">{connectionStatus.accountPath}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Products</p>
              <p className="text-sm font-semibold text-white">
                {connectionStatus.stats?.productCount || 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Vendors</p>
              <p className="text-sm font-semibold text-white">
                {connectionStatus.stats?.vendorCount || 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Purchase Orders</p>
              <p className="text-sm font-semibold text-white">
                {connectionStatus.stats?.poCount || 0}
              </p>
            </div>
          </div>
          {connectionStatus.lastSyncTime && (
            <div className="mt-3 pt-3 border-t border-gray-700/50">
              <p className="text-xs text-gray-400">
                Last synced:{' '}
                <span className="text-gray-300">
                  {new Date(connectionStatus.lastSyncTime).toLocaleString()}
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Configuration Form */}
      <div className="space-y-4 mb-6">
        {/* Account Path */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Account Path <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <ServerStackIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="e.g., buildasoilorganics"
              value={accountPath}
              onChange={(e) => setAccountPath(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-md p-2 pl-10 text-sm border border-gray-600 focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Your Finale subdomain (e.g., yourcompany from yourcompany.finaleinventory.com)
          </p>
        </div>

        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            API Key <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <KeyIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Enter your Finale API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-md p-2 pl-10 text-sm border border-gray-600 focus:border-accent-500 focus:ring-1 focus:ring-accent-500 font-mono"
            />
          </div>
        </div>

        {/* API Secret */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            API Secret <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <KeyIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type={showApiSecret ? 'text' : 'password'}
              placeholder="Enter your Finale API Secret"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-md p-2 pl-10 pr-10 text-sm border border-gray-600 focus:border-accent-500 focus:ring-1 focus:ring-accent-500 font-mono"
            />
            <Button
              onClick={() => setShowApiSecret(!showApiSecret)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >
              {showApiSecret ? (
                <EyeSlashIcon className="w-5 h-5" />
              ) : (
                <EyeIcon className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Base URL */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Base URL</label>
          <div className="relative">
            <LinkIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="https://app.finaleinventory.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-md p-2 pl-10 text-sm border border-gray-600 focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Usually https://app.finaleinventory.com (change only if using custom domain)
          </p>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div
          className={`mb-4 p-3 rounded-md border ${
            testResult.success
              ? 'bg-green-900/20 border-green-700/50 text-green-400'
              : 'bg-red-900/20 border-red-700/50 text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircleIcon className="w-5 h-5" />
            ) : (
              <XCircleIcon className="w-5 h-5" />
            )}
            <span className="text-sm font-semibold">{testResult.message}</span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={handleTestConnection}
          disabled={!hasCredentials || isTesting}
          className="flex-1 min-w-[150px] bg-accent-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isTesting ? (
            <>
              <RefreshIcon className="w-5 h-5 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <CheckCircleIcon className="w-5 h-5" />
              Test Connection
            </>
          )}
        </Button>

        <Button
          onClick={handleSync}
          disabled={!isConfigured || isSyncing}
          className="flex-1 min-w-[150px] bg-green-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSyncing ? (
            <>
              <RefreshIcon className="w-5 h-5 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshIcon className="w-5 h-5" />
              Sync Data
            </>
          )}
        </Button>

        <Button
          onClick={handleCopySetupInstructions}
          className="bg-gray-700 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
        >
          <ClipboardCopyIcon className="w-5 h-5" />
          Copy Setup Guide
        </Button>
      </div>

      {/* Help Text */}
      <div className="mt-6 pt-6 border-t border-gray-700/50">
        <h4 className="text-sm font-semibold text-gray-300 mb-2">How to get your API credentials:</h4>
        <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
          <li>
            Log in to{' '}
            <a
              href={`https://app.finaleinventory.com/${accountPath || 'YOUR_ACCOUNT'}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-400 hover:underline"
            >
              Finale Inventory
            </a>
          </li>
          <li>Navigate to Settings → Integrations → API Access</li>
          <li>Create a new API application or use existing credentials</li>
          <li>Copy your API Key and API Secret</li>
          <li>Enter them above and click "Test Connection"</li>
        </ol>
        <p className="text-xs text-gray-500 mt-3">
          Need help? Check our{' '}
          <a
            href="https://support.finaleinventory.com/hc/en-us/articles/4408832394647"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-400 hover:underline"
          >
            API documentation
          </a>
        </p>
      </div>
    </div>
  );
};

export default FinaleIntegrationPanel;
