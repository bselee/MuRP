import Button from '@/components/ui/Button';
/**
 * Finale API Setup Panel
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
import { supabase } from '../lib/supabase/client';
import { 
  ServerStackIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  RefreshIcon,
  KeyIcon,
  LinkIcon,
  ChartBarIcon,
  InformationCircleIcon,
  CloudUploadIcon,
  DocumentTextIcon,
} from './icons';
import { finalePOImporter, type FinalePOCSVRow, type ImportResult } from '../services/finalePOImporter';
import { getFinaleClient, updateFinaleClient } from '../lib/finale/client';
import type { FinaleConnectionConfig, FinalePurchaseOrder } from '../lib/finale/types';

interface FinaleSetupPanelProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type SetupStep = 'credentials' | 'test' | 'sync' | 'monitor';

const FinaleSetupPanel: React.FC<FinaleSetupPanelProps> = ({ addToast }) => {
  // Setup state
  const [currentStep, setCurrentStep] = useState<SetupStep>('credentials');
  const [isConfigured, setIsConfigured] = useState(false);
  
  // Credentials - auto-load from environment or localStorage
  const [credentials, setCredentials] = useState({
    apiKey: import.meta.env.VITE_FINALE_API_KEY || localStorage.getItem('finale_api_key') || '',
    apiSecret: import.meta.env.VITE_FINALE_API_SECRET || localStorage.getItem('finale_api_secret') || '',
    accountPath: import.meta.env.VITE_FINALE_ACCOUNT_PATH || localStorage.getItem('finale_account_path') || '',
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
  
  // PO Import state
  const [isImportingCSV, setIsImportingCSV] = useState(false);
  const [isPullingFinale, setIsPullingFinale] = useState(false);
  const [importStats, setImportStats] = useState<{
    imported: number;
    updated: number;
    skipped: number;
    errors: number;
  } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Check if backend is configured on mount and auto-configure if env vars exist
  useEffect(() => {
    // Check if Finale sync is configured by querying sync metadata
    const checkBackendConfig = async () => {
      try {
        // Auto-configure from environment variables if available
        const envApiKey = import.meta.env.VITE_FINALE_API_KEY;
        const envApiSecret = import.meta.env.VITE_FINALE_API_SECRET;
        const envAccountPath = import.meta.env.VITE_FINALE_ACCOUNT_PATH;

        if (envApiKey && envApiSecret && envAccountPath) {
          // Auto-configure the global Finale client from environment
          updateFinaleClient({
            apiKey: envApiKey,
            apiSecret: envApiSecret,
            accountPath: envAccountPath,
            baseUrl: import.meta.env.VITE_FINALE_BASE_URL || 'https://app.finaleinventory.com',
          });
          console.log('[FinaleSetupPanel] Auto-configured from environment variables');
        }

        // Check Supabase for sync metadata (proves backend is working)
        const { data: syncData, error } = await supabase
          .from('sync_metadata')
          .select('data_type, last_sync_time')
          .limit(1)
          .single();

        if (!error && syncData) {
          // Backend is configured and has synced data before
          setIsConfigured(true);
          setCurrentStep('sync');

          // Initialize sync service and subscribe to status
          const syncService = getFinaleSyncService();
          const unsubscribe = syncService.onStatusChange(setSyncStatus);
          setSyncStatus(syncService.getStatus());

          return () => unsubscribe();
        }
      } catch (error) {
        // Backend not configured yet or no sync data
        console.log('[FinaleSetupPanel] Backend not yet configured');
      }
    };

    checkBackendConfig();
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
        
        // Configure the global Finale client
        updateFinaleClient({
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
          accountPath: credentials.accountPath,
          baseUrl: 'https://app.finaleinventory.com',
        });
        
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
    const syncService = getFinaleSyncService();
    
    // Subscribe to sync status updates
    const unsubscribe = syncService.onStatusChange(setSyncStatus);
    
    addToast('🚀 Starting initial sync...', 'info');
    
    try {
      await syncService.syncAll();
      addToast('✅ Initial sync completed!', 'success');
      setCurrentStep('monitor');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      addToast('❌ Sync failed: ' + message, 'error');
    }
    
    return () => unsubscribe();
  };

  const handleToggleAutoSync = () => {
    const syncService = getFinaleSyncService();
    
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

    const syncService = getFinaleSyncService();
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

  /**
   * Parse CSV text into rows
   */
  const parseCSV = (text: string): FinalePOCSVRow[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows: FinalePOCSVRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length === headers.length) {
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        rows.push(row as FinalePOCSVRow);
      }
    }
    return rows;
  };

  /**
   * Handle CSV file upload
   */
  const handleCSVUpload = async (file: File) => {
    setIsImportingCSV(true);
    setImportStats(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length === 0) {
        addToast('No valid data found in CSV file', 'error');
        return;
      }

      addToast(`Processing ${rows.length} rows from CSV...`, 'info');

      const result = await finalePOImporter.importFromCSV(rows);
      setImportStats(result.stats);

      if (result.success) {
        addToast(`✅ CSV import complete: ${result.stats.imported} imported, ${result.stats.updated} updated, ${result.stats.skipped} skipped`, 'success');
      } else {
        addToast(`❌ CSV import failed: ${result.error}`, 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      addToast(`❌ CSV import failed: ${message}`, 'error');
    } finally {
      setIsImportingCSV(false);
    }
  };

  /**
   * Handle drag and drop
   */
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find(file => file.name.toLowerCase().endsWith('.csv'));

    if (csvFile) {
      handleCSVUpload(csvFile);
    } else {
      addToast('Please drop a CSV file', 'error');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleCSVUpload(file);
    }
  };

  /**
   * Handle Finale API pull
   */
  const handlePullFromFinale = async () => {
    // Get the configured Finale client
    const finaleClient = getFinaleClient();
    if (!finaleClient) {
      addToast('Finale is not configured. Please set up credentials first.', 'error');
      return;
    }

    setIsPullingFinale(true);
    setImportStats(null);

    try {
      // Test connection first
      addToast('🔍 Testing Finale connection...', 'info');
      const testResult = await finaleClient.testConnection();
      
      if (!testResult.success) {
        addToast(`❌ Connection failed: ${testResult.message}`, 'error');
        return;
      }

      addToast('✅ Connection successful, pulling POs...', 'info');

      // Pull POs from Finale API using the importer service
      const result = await finalePOImporter.importFromFinaleAPI();
      setImportStats({
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors.length,
      });

      if (result.success || result.imported > 0 || result.updated > 0) {
        addToast(`✅ Finale pull complete: ${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped`, 'success');
      } else {
        addToast(`❌ Finale pull failed: ${result.errors.length > 0 ? result.errors[0].error : 'No POs found'}`, 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      addToast(`❌ Finale pull failed: ${message}`, 'error');
    } finally {
      setIsPullingFinale(false);
    }
  };

  // Check if Finale is configured
  const finaleClient = getFinaleClient();
  const isFinaleConfigured = !!finaleClient;

  type StepIndicator = SetupStep | 'po';
  type StepState = 'completed' | 'active' | 'upcoming';

  const connectionSteps: Array<{ id: StepIndicator; label: string; badge: string }> = [
    { id: 'credentials', label: 'Credentials', badge: '1' },
    { id: 'sync', label: 'Initial Sync', badge: '2' },
    { id: 'monitor', label: 'Monitoring', badge: '3' },
    { id: 'po', label: 'PO Import', badge: 'PO' },
  ];

  const stepOrder: SetupStep[] = ['credentials', 'sync', 'monitor'];

  const getStepState = (stepId: StepIndicator): StepState => {
    if (stepId === 'po') {
      return isConfigured ? 'active' : 'upcoming';
    }

    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(stepId);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'upcoming';
  };

  const syncOptions = [
    {
      id: 'vendors',
      label: 'Vendors',
      description: 'Supplier records, contacts, preferred terms',
    },
    {
      id: 'inventory',
      label: 'Inventory',
      description: 'Stock levels, valuation, locations',
    },
    {
      id: 'boms',
      label: 'BOMs',
      description: 'Assemblies, components, and revisions',
    },
  ];

  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#050505] via-[#050505] to-[#0B0C0E] p-6 text-white shadow-[0_20px_80px_-40px_rgba(0,0,0,0.8)] md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-[#1D9BF0]/10 text-[#1D9BF0] flex items-center justify-center">
            <ServerStackIcon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Finale sync controls</h3>
            <p className="text-xs text-gray-500">Credentials · Sync automation · PO imports</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isConfigured && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
              <CheckCircleIcon className="h-4 w-4" />
              Connected
            </span>
          )}
          {isConfigured && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep('credentials')}
              className="rounded-full border border-white/10 px-4 py-1.5 text-xs text-[#1D9BF0] hover:bg-white/5"
            >
              Edit credentials
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {connectionSteps.map((step, index) => {
          const state = getStepState(step.id);
          const stateClasses =
            state === 'completed'
              ? 'border-[#1D9BF0]/50 bg-[#1D9BF0]/10 text-white'
              : state === 'active'
                ? 'border-white/20 bg-white/5 text-white'
                : 'border-white/5 text-gray-500';

          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 rounded-full border px-4 py-2 text-sm transition-colors ${stateClasses}`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-xs font-semibold">
                {step.badge === 'PO' ? step.badge : index + 1}
              </span>
              <span>{step.label}</span>
            </div>
          );
        })}
      </div>

      {!isConfigured && (
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100">
          <div className="flex items-start gap-3">
            <InformationCircleIcon className="h-5 w-5 flex-shrink-0 text-amber-200" />
            <div>
              <p className="font-semibold">Backend configuration required</p>
              <p className="mt-1 text-amber-100/80">
                Supabase Edge Functions need the Finale CSV endpoints before sync can run. Ask an administrator to set
                <code className="mx-1 rounded bg-gray-800/40 px-1 py-0.5">FINALE_INVENTORY_REPORT_URL</code>
                ,
                <code className="mx-1 rounded bg-gray-800/40 px-1 py-0.5">FINALE_VENDORS_REPORT_URL</code>
                , and
                <code className="mx-1 rounded bg-gray-800/40 px-1 py-0.5">FINALE_BOM_REPORT_URL</code>.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-gray-400">Status</p>
            <ServerStackIcon className="h-5 w-5 text-white/40" />
          </div>
          <p className="mt-2 text-lg font-semibold">
            {isConfigured ? 'Connected to Finale' : 'Waiting on config'}
          </p>
          <p className="text-sm text-gray-500">
            {isConfigured ? 'Supabase imports ready' : 'Authenticate + add CSV endpoints'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-gray-400">Last sync</p>
            <RefreshIcon className="h-5 w-5 text-white/40" />
          </div>
          <p className="mt-2 text-lg font-semibold">
            {syncStatus ? formatRelativeTime(syncStatus.lastSyncTime) : 'Never'}
          </p>
          <p className="text-sm text-gray-500">{syncStatus ? formatDate(syncStatus.lastSyncTime) : 'Run initial sync'}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-gray-400">Records synced</p>
            <ChartBarIcon className="h-5 w-5 text-white/40" />
          </div>
          <p className="mt-2 text-lg font-semibold">
            {syncStatus ? syncStatus.totalItemsSynced.toLocaleString() : '0'}
          </p>
          <p className="text-sm text-gray-500">
            Duration {syncStatus ? formatDuration(syncStatus.lastSyncDuration) : '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-gray-400">Auto sync</p>
            <InformationCircleIcon className="h-5 w-5 text-white/40" />
          </div>
          <p className="mt-2 text-lg font-semibold">{autoSyncEnabled ? 'Enabled' : 'Manual only'}</p>
          <p className="text-sm text-gray-500">Inventory 5m · Vendors 1h · POs 15m</p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Step 1</p>
              <h4 className="text-xl font-semibold">Finale credentials</h4>
              <p className="mt-1 text-sm text-gray-400">Paste the key, secret, and account path issued by Finale.</p>
            </div>
            <DocumentTextIcon className="h-6 w-6 text-white/40" />
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-[#0A0C10]/60 p-4">
            <p className="text-sm font-medium text-[#1D9BF0]">Where to find them</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-gray-400">
              <li>Sign in at app.finaleinventory.com</li>
              <li>Navigate to Settings → Integrations → API Access</li>
              <li>Generate a key pair if none exists</li>
              <li>Copy API key, secret, and your account path</li>
            </ol>
          </div>

          <div className="mt-4 space-y-3">
            <div className="relative">
              <KeyIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="API Key (e.g., I9TVdRvblFod)"
                value={credentials.apiKey}
                onChange={(e) => handleCredentialChange('apiKey', e.target.value)}
                className="w-full rounded-full border border-white/10 bg-gray-900/60 py-3 pl-12 pr-4 text-sm placeholder:text-gray-600 focus:border-[#1D9BF0] focus:outline-none"
                disabled={isConfigured && currentStep !== 'credentials'}
              />
            </div>
            <div className="relative">
              <KeyIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="password"
                placeholder="API Secret"
                value={credentials.apiSecret}
                onChange={(e) => handleCredentialChange('apiSecret', e.target.value)}
                className="w-full rounded-full border border-white/10 bg-gray-900/60 py-3 pl-12 pr-4 text-sm placeholder:text-gray-600 focus:border-[#1D9BF0] focus:outline-none"
                disabled={isConfigured && currentStep !== 'credentials'}
              />
            </div>
            <div className="relative">
              <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Account path (e.g., yourcompany)"
                value={credentials.accountPath}
                onChange={(e) => handleCredentialChange('accountPath', e.target.value)}
                className="w-full rounded-full border border-white/10 bg-gray-900/60 py-3 pl-12 pr-4 text-sm placeholder:text-gray-600 focus:border-[#1D9BF0] focus:outline-none"
                disabled={isConfigured && currentStep !== 'credentials'}
              />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <Button
              onClick={handleTestConnection}
              disabled={isTesting || !credentials.apiKey || !credentials.apiSecret || !credentials.accountPath}
              className="w-full rounded-full bg-[#1D9BF0] py-3 text-sm font-semibold text-white transition hover:bg-[#1a8cd8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isTesting ? (
                <span className="flex items-center justify-center gap-2">
                  <RefreshIcon className="h-5 w-5 animate-spin" /> Testing connection...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <CheckCircleIcon className="h-5 w-5" /> Test connection
                </span>
              )}
            </Button>

            {testResult && (
              <div
                className={`rounded-2xl border p-4 text-sm ${
                  testResult.success
                    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-100'
                }`}
              >
                <div className="flex items-start gap-2">
                  {testResult.success ? (
                    <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
                  ) : (
                    <XCircleIcon className="h-5 w-5 flex-shrink-0" />
                  )}
                  <div>
                    <p className="font-medium">{testResult.message}</p>
                    {testResult.facilities && testResult.facilities.length > 0 && (
                      <p className="mt-1 text-xs opacity-80">
                        Found {testResult.facilities.length} facility(ies)
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Step 2</p>
          <div className="mt-1 flex items-center justify-between">
            <div>
              <h4 className="text-xl font-semibold">Initial sync & readiness</h4>
              <p className="mt-1 text-sm text-gray-400">Hydrate inventory, vendors, and BOMs from Finale.</p>
            </div>
            <RefreshIcon className="h-6 w-6 text-white/40" />
          </div>

          <div className="mt-4 space-y-3 text-sm text-gray-400">
            <p>1. Validate credentials • 2. Ensure Supabase env vars exist • 3. Run the full import once.</p>
            <p className="rounded-2xl border border-white/10 bg-gray-800/30 px-4 py-2 text-xs text-gray-400">
              Tip: keep an eye on the cards below — sync stats update in real time while automation runs.
            </p>
          </div>

          <Button
            onClick={handleStartSync}
            disabled={!isConfigured || currentStep === 'monitor'}
            className="mt-6 w-full rounded-full bg-white/90 py-3 text-sm font-semibold text-black transition hover:bg-white"
          >
            {currentStep === 'monitor' ? 'Initial sync complete' : 'Start initial sync'}
          </Button>
          {currentStep === 'monitor' && (
            <p className="mt-2 text-center text-xs text-emerald-200">All sync services active — use automation controls below.</p>
          )}
        </section>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section
          className={`rounded-3xl border border-white/10 bg-white/5 p-6 ${!isConfigured ? 'opacity-40 pointer-events-none' : ''}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Step 3</p>
              <h4 className="text-xl font-semibold">Automation & manual sync</h4>
              <p className="mt-1 text-sm text-gray-400">Toggle background jobs or trigger selective syncs.</p>
            </div>
            <Button
              onClick={handleToggleAutoSync}
              className={`relative inline-flex h-8 w-16 items-center rounded-full border border-white/10 ${
                autoSyncEnabled ? 'bg-emerald-500/80' : 'bg-gray-700/60'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 rounded-full bg-white transition ${
                  autoSyncEnabled ? 'translate-x-8' : 'translate-x-1'
                }`}
              />
            </Button>
          </div>

          {syncStatus && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-gray-800/30 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Last run</p>
                <p className="mt-1 text-lg font-semibold">{formatRelativeTime(syncStatus.lastSyncTime)}</p>
                <p className="text-xs text-gray-500">{formatDate(syncStatus.lastSyncTime)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-gray-800/30 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Phase</p>
                <p className="mt-1 text-lg font-semibold">{syncStatus.progress.phase}</p>
                <p className="text-xs text-gray-500">{syncStatus.isRunning ? 'Running' : 'Idle'}</p>
              </div>
            </div>
          )}

          {syncStatus && syncStatus.isRunning && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{syncStatus.progress.message}</span>
                <span className="text-white">{syncStatus.progress.percentage}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-gray-700/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#1D9BF0] to-[#00BA7C]"
                  style={{ width: `${syncStatus.progress.percentage}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <Button
              variant="ghost"
              size="xs"
              onClick={selectAllSyncSources}
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-white hover:bg-white/5"
            >
              Select all
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={deselectAllSyncSources}
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-gray-400 hover:bg-white/5"
            >
              Clear
            </Button>
            <span>• {selectedSyncSources.size} source(s) selected</span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {syncOptions.map(option => {
              const isActive = selectedSyncSources.has(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggleSyncSource(option.id)}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                    isActive
                      ? 'border-[#1D9BF0] bg-[#1D9BF0]/10 text-white'
                      : 'border-white/10 bg-black/10 text-gray-400'
                  }`}
                >
                  <p className="font-medium">{option.label}</p>
                  <p className="mt-1 text-xs text-gray-500">{option.description}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-5 space-y-3">
            <Button
              onClick={handleManualSync}
              disabled={selectedSyncSources.size === 0 || syncStatus?.isRunning}
              className="w-full rounded-full bg-[#1D9BF0] py-3 text-sm font-semibold text-white transition hover:bg-[#1a8cd8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {syncStatus?.isRunning ? 'Sync in progress…' : `Sync selected (${selectedSyncSources.size})`}
            </Button>
            {syncStatus?.isRunning && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetSyncStatus}
                className="w-full rounded-full border border-white/10 py-3 text-xs text-gray-300 hover:bg-white/5"
              >
                Reset status (stuck run)
              </Button>
            )}
            {syncStatus && (
              <p className="text-center text-xs text-gray-500">
                {syncStatus.errors.length} recent error(s) • phase {syncStatus.progress.phase}
              </p>
            )}
          </div>

          {syncStatus && syncStatus.errors.length > 0 && (
            <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-100">
              <p className="font-semibold">Recent errors</p>
              <ul className="mt-2 space-y-1">
                {syncStatus.errors.slice(-3).map((error, index) => (
                  <li key={index}>
                    {error.phase}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section
          className={`rounded-3xl border border-white/10 bg-white/5 p-6 ${!isConfigured ? 'opacity-40 pointer-events-none' : ''}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Step 4</p>
              <h4 className="text-xl font-semibold">Purchase order imports</h4>
              <p className="mt-1 text-sm text-gray-400">Drag in Finale CSV exports or call the API importer.</p>
            </div>
            <CloudUploadIcon className="h-6 w-6 text-white/40" />
          </div>

          <div
            className={`mt-5 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition ${
              dragActive ? 'border-[#1D9BF0] bg-[#1D9BF0]/5' : 'border-white/15 bg-black/10'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              disabled={isImportingCSV}
            />
            <p className="text-sm font-semibold">
              {isImportingCSV ? 'Importing purchase orders…' : 'Drop CSV or click to browse'}
            </p>
            <p className="mt-2 text-xs text-gray-500">Finale → Purchase Orders → Export → CSV</p>
          </div>

          <div className="mt-4 flex items-center gap-3 text-xs text-gray-500">
            <div className="h-px flex-1 bg-white/10" />
            <span>or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <Button
            onClick={handlePullFromFinale}
            disabled={isPullingFinale || !isFinaleConfigured}
            className="mt-4 w-full rounded-full bg-purple-500 py-3 text-sm font-semibold text-white transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPullingFinale ? 'Pulling from Finale…' : 'Pull from Finale API'}
          </Button>
          {!isFinaleConfigured && (
            <p className="mt-2 text-center text-xs text-amber-200">Add credentials first to enable API pulls.</p>
          )}

          {importStats && (
            <div className="mt-6 grid grid-cols-2 gap-3 text-center text-xs">
              <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-3">
                <p className="text-lg font-semibold text-emerald-200">{importStats.imported}</p>
                Imported
              </div>
              <div className="rounded-2xl border border-[#1D9BF0]/40 bg-[#1D9BF0]/10 p-3">
                <p className="text-lg font-semibold text-[#1D9BF0]">{importStats.updated}</p>
                Updated
              </div>
              <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3">
                <p className="text-lg font-semibold text-amber-200">{importStats.skipped}</p>
                Skipped
              </div>
              <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-3">
                <p className="text-lg font-semibold text-rose-200">{importStats.errors}</p>
                Errors
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default FinaleSetupPanel;
