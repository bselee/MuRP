/**
 * Finale Integration Panel - Simplified
 *
 * Easy 3-step setup:
 * 1. Enter credentials
 * 2. Click Save & Test
 * 3. See green status ✅
 */

import React, { useState, useEffect } from 'react';
import { getFinaleClient, updateFinaleClient } from '../lib/finale/client';
import type { FinaleConnectionConfig } from '../lib/finale/types';
import {
  CheckCircleIcon,
  XCircleIcon,
  KeyIcon,
  EyeIcon,
  EyeSlashIcon,
  RefreshIcon,
} from './icons';
import Button from '@/components/ui/Button';

interface FinaleIntegrationPanelProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const readStored = (key: string, fallback = '') =>
  typeof window !== 'undefined' ? localStorage.getItem(key) ?? fallback : fallback;

const FinaleIntegrationPanel: React.FC<FinaleIntegrationPanelProps> = ({ addToast }) => {
  
  // Credentials
  const [apiKey, setApiKey] = useState<string>(() => readStored('finale_api_key', import.meta.env.VITE_FINALE_API_KEY || ''));
  const [apiSecret, setApiSecret] = useState<string>(() => readStored('finale_api_secret', import.meta.env.VITE_FINALE_API_SECRET || ''));
  const [accountPath, setAccountPath] = useState<string>(() => readStored('finale_account_path', import.meta.env.VITE_FINALE_ACCOUNT_PATH || ''));

  // UI state
  const [showSecret, setShowSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const hasAllCredentials = !!(apiKey && apiSecret && accountPath);

  // Check existing connection on mount
  useEffect(() => {
    const client = getFinaleClient();
    if (client && hasAllCredentials) {
      checkConnection();
    }
  }, []);

  const checkConnection = async () => {
    try {
      const client = getFinaleClient();
      if (!client) {
        setIsConnected(false);
        return;
      }
      const result = await client.testConnection();
      setIsConnected(result.success);
      setConnectionError(result.success ? null : result.message);
    } catch (error) {
      setIsConnected(false);
      setConnectionError(error instanceof Error ? error.message : 'Connection check failed');
    }
  };

  const handleSaveAndTest = async () => {
    if (!hasAllCredentials) {
      addToast('Please fill in all fields', 'error');
      return;
    }

    setIsSaving(true);
    setConnectionError(null);

    try {
      // Save to localStorage
      localStorage.setItem('finale_api_key', apiKey);
      localStorage.setItem('finale_api_secret', apiSecret);
      localStorage.setItem('finale_account_path', accountPath);

      // Update the global Finale client
      const config: FinaleConnectionConfig = {
        apiKey,
        apiSecret,
        accountPath,
        baseUrl: 'https://app.finaleinventory.com',
      };
      
      const client = updateFinaleClient(config);

      // Test the connection
      const result = await client.testConnection();

      if (result.success) {
        setIsConnected(true);
        addToast('✅ Connected to Finale! Auto-sync is now active.', 'success');
        
        // Trigger auto-sync to start immediately
        import('../services/finaleAutoSync').then(({ initializeFinaleAutoSync }) => {
          initializeFinaleAutoSync();
        });
      } else {
        setIsConnected(false);
        setConnectionError(result.message);
        addToast(`Connection failed: ${result.message}`, 'error');
      }
    } catch (error) {
      setIsConnected(false);
      const message = error instanceof Error ? error.message : 'Failed to save credentials';
      setConnectionError(message);
      addToast(message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Status */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-200">Finale Inventory Integration</h3>
          <p className="text-sm text-gray-400 mt-1">Connect to sync inventory, vendors, and purchase orders automatically</p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <CheckCircleIcon className="w-6 h-6 text-green-500" />
              <span className="text-green-500 font-medium">Connected</span>
            </>
          ) : (
            <>
              <div className="w-6 h-6 rounded-full border-2 border-gray-600" />
              <span className="text-gray-500">Not Connected</span>
            </>
          )}
        </div>
      </div>

      {/* Credentials Form */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 space-y-4">
        <div className="space-y-4">
          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              API Key <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Finale API key"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            />
          </div>

          {/* API Secret */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              API Secret <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Enter your Finale API secret"
                className="w-full px-4 py-2 pr-10 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:ring-2 focus:ring-accent-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
              >
                {showSecret ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Account Path */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Account Path <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={accountPath}
              onChange={(e) => setAccountPath(e.target.value)}
              placeholder="account/12345/facility/67890"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Format: account/YOUR_ACCOUNT_ID/facility/YOUR_FACILITY_ID
            </p>
          </div>
        </div>

        {/* Error Message */}
        {connectionError && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-md">
            <XCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-300">{connectionError}</p>
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="pt-2">
          <Button
            onClick={handleSaveAndTest}
            disabled={!hasAllCredentials || isSaving}
            className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
              hasAllCredentials && !isSaving
                ? 'bg-accent-500 hover:bg-accent-600 text-white'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSaving ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshIcon className="w-5 h-5 animate-spin" />
                Testing Connection...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <KeyIcon className="w-5 h-5" />
                Save & Test Connection
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Success Status */}
      {isConnected && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0" />
            <div>
              <p className="text-green-300 font-medium">Successfully Connected</p>
              <p className="text-sm text-green-400/80 mt-1">
                Your data will automatically sync:
              </p>
              <ul className="text-sm text-green-400/80 mt-2 space-y-1">
                <li>• Inventory: every 5 minutes</li>
                <li>• Purchase Orders: every 15 minutes</li>
                <li>• Vendors & BOMs: every hour</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-300 mb-2">Where to find your credentials:</h4>
        <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
          <li>Log in to your Finale Inventory account</li>
          <li>Go to Settings → API Settings</li>
          <li>Generate or copy your API Key and Secret</li>
          <li>Find your Account Path in the URL or API documentation</li>
        </ol>
      </div>
    </div>
  );
};

export default FinaleIntegrationPanel;
