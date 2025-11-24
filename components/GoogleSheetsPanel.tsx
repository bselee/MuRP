import Button from '@/components/ui/Button';
/**
 * Google Sheets Integration Panel
 *
 * User interface for:
 * - Connecting Google Workspace account
 * - Importing inventory from Sheets
 * - Exporting inventory to Sheets
 * - Creating automatic backups
 */

import React, { useState, useEffect, useMemo } from 'react';
import { getGoogleAuthService, type GoogleAuthStatus } from '../services/googleAuthService';
import { getGoogleSheetsSyncService, type ImportOptions, type ExportOptions } from '../services/googleSheetsSyncService';
import { getGoogleSheetsService } from '../services/googleSheetsService';
import { useSystemAlerts } from '../lib/systemAlerts/SystemAlertContext';

interface GoogleSheetsPanelProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const GoogleSheetsPanel: React.FC<GoogleSheetsPanelProps> = ({ addToast }) => {
  const [authStatus, setAuthStatus] = useState<GoogleAuthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Import state
  const [importSpreadsheetUrl, setImportSpreadsheetUrl] = useState('');
  const [importSheetName, setImportSheetName] = useState('Sheet1');
  const [importStrategy, setImportStrategy] = useState<'replace' | 'add_new' | 'update_existing'>('update_existing');

  // Export state
  const [exportResult, setExportResult] = useState<{ spreadsheetUrl?: string; itemsExported: number } | null>(null);
  
  // Auto-backup state
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('google_sheets_auto_backup') === 'true';
  });

  const authService = getGoogleAuthService();
  const syncService = getGoogleSheetsSyncService();
  const sheetsService = getGoogleSheetsService();
  const { upsertAlert, resolveAlert } = useSystemAlerts();

  const isConnected = Boolean(authStatus?.isAuthenticated && authStatus?.hasValidToken);

  const scopesSummary = useMemo(() => {
    const scopes = authStatus?.scopes ?? [];
    if (!scopes.length) return 'No scopes granted yet';
    const preview = scopes.slice(0, 2).join(', ');
    return `${preview}${scopes.length > 2 ? ` +${scopes.length - 2}` : ''}`;
  }, [authStatus?.scopes]);

  const expiresLabel = authStatus?.expiresAt
    ? authStatus.expiresAt instanceof Date
      ? authStatus.expiresAt.toLocaleString()
      : new Date(authStatus.expiresAt).toLocaleString()
    : '—';

  const notifySheetsFailure = (action: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    upsertAlert({
      source: 'google-sheets',
      message: `Google Sheets ${action} failed: ${message}`,
    });
  };

  const clearSheetsAlert = () => {
    resolveAlert('google-sheets');
  };

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const status = await authService.getAuthStatus();
      setAuthStatus(status);
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  };

  const handleConnect = async () => {
    try {
      setIsLoading(true);
      await authService.startOAuthFlow();
      await checkAuthStatus();
      addToast('Connected to Google Workspace.', 'success');
    } catch (error) {
      console.error('Error connecting to Google Workspace:', error);
      addToast(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Google Sheets? This will not delete any existing spreadsheets.')) {
      return;
    }

    try {
      setIsLoading(true);
      await authService.revokeAccess();
      setAuthStatus(null);
      addToast('Disconnected from Google Workspace.', 'success');
    } catch (error) {
      console.error('Error disconnecting:', error);
      addToast(`Failed to disconnect: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    try {
      setIsLoading(true);

      const spreadsheetId = sheetsService.parseSpreadsheetId(importSpreadsheetUrl);
      if (!spreadsheetId) {
        throw new Error('Invalid spreadsheet URL or ID');
      }

      const options: ImportOptions = {
        spreadsheetId,
        sheetName: importSheetName,
        mergeStrategy: importStrategy,
        skipFirstRow: true,
      };

      const result = await syncService.importInventory(options);

      if (result.success) {
        clearSheetsAlert();
        addToast(
          `Successfully imported ${result.itemsImported} items! ${result.itemsSkipped > 0 ? `(${result.itemsSkipped} skipped)` : ''}`,
          'success'
        );
      } else {
        throw new Error(result.errors.join(', '));
      }
    } catch (error) {
      console.error('Error importing:', error);
      addToast(`Import failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
      notifySheetsFailure('import', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setIsLoading(true);

      const result = await syncService.exportInventory({
        includeHeaders: true,
        formatHeaders: true,
      });

      setExportResult({
        spreadsheetUrl: result.spreadsheetUrl,
        itemsExported: result.itemsExported,
      });

      clearSheetsAlert();
      addToast(`Successfully exported ${result.itemsExported} items!`, 'success');
    } catch (error) {
      console.error('Error exporting:', error);
      addToast(`Export failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
      notifySheetsFailure('export', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setIsLoading(true);

      const result = await syncService.createAutoBackup();

      addToast('Backup created successfully!', 'success');
      clearSheetsAlert();

      if (result.spreadsheetUrl) {
        window.open(result.spreadsheetUrl, '_blank');
      }
    } catch (error) {
      console.error('Error creating backup:', error);
      addToast(`Backup failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
      notifySheetsFailure('backup', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAutoBackup = (enabled: boolean) => {
    setAutoBackupEnabled(enabled);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('google_sheets_auto_backup', String(enabled));
    }
    addToast(
      enabled 
        ? 'Automatic backups enabled. Inventory will backup to Google Sheets after each Finale sync.' 
        : 'Automatic backups disabled',
      'success'
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-200">Step 2</p>
            <h3 className="mt-1 text-xl font-semibold text-white">Google Sheets Integration</h3>
            <p className="text-sm text-gray-300 mt-1">
              Import curated datasets, export the live warehouse, and keep rolling backups in Drive.
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
              isConnected
                ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30'
                : 'bg-rose-500/15 text-rose-200 border border-rose-400/30'
            }`}
          >
            {isConnected ? 'Connected' : 'Not Connected'}
          </span>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-gray-900/40 p-4">
            <p className="text-xs uppercase text-gray-400">Workspace account</p>
            <p className="text-base font-semibold text-white mt-1">{authStatus?.email ?? 'Link an account'}</p>
            <p className="text-xs text-gray-500 mt-2">
              Token expires: {expiresLabel}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-gray-900/40 p-4">
            <p className="text-xs uppercase text-gray-400">Scopes granted</p>
            <p className="text-base font-semibold text-white mt-1">{scopesSummary}</p>
            <p className="text-xs text-gray-500 mt-2">Calendar + Sheets scopes are required for imports/exports.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-gray-900/40 p-4">
            <p className="text-xs uppercase text-gray-400">Actions</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {isConnected ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={checkAuthStatus}
                    loading={isLoading}
                  >
                    Refresh status
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={isLoading}
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button onClick={handleConnect} loading={isLoading}>
                  Connect Google Workspace
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {isConnected && (
        <>
          <div className="rounded-2xl border border-white/10 bg-gray-900/50 p-6 space-y-4">
            <div>
              <h4 className="text-lg font-semibold text-white">Import from Google Sheets</h4>
              <p className="text-sm text-gray-400">
                Paste any inventory worksheet URL, choose how to merge rows, and MuRP will ingest it instantly.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-gray-400">Spreadsheet URL or ID</label>
                <input
                  type="text"
                  value={importSpreadsheetUrl}
                  onChange={(e) => setImportSpreadsheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  disabled={isLoading}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-gray-900/70 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-wide text-gray-400">Sheet name</label>
                  <input
                    type="text"
                    value={importSheetName}
                    onChange={(e) => setImportSheetName(e.target.value)}
                    placeholder="Sheet1"
                    disabled={isLoading}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-gray-900/70 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-gray-400">Import strategy</label>
                  <select
                    value={importStrategy}
                    onChange={(e) => setImportStrategy(e.target.value as any)}
                    disabled={isLoading}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-gray-900/70 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                  >
                    <option value="update_existing">Update existing (merge rows)</option>
                    <option value="add_new">Add new only (skip matches)</option>
                    <option value="replace">Replace all data (dangerous)</option>
                  </select>
                </div>
              </div>
              <Button
                onClick={handleImport}
                disabled={isLoading || !importSpreadsheetUrl}
                loading={isLoading}
              >
                {isLoading ? 'Processing import…' : 'Import inventory'}
              </Button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-gray-900/50 p-6 space-y-4">
              <div>
                <h4 className="text-lg font-semibold text-white">Export live inventory</h4>
                <p className="text-sm text-gray-400">
                  Generates a brand-new spreadsheet with the latest counts, headers, and formatting.
                </p>
              </div>
              <Button onClick={handleExport} disabled={isLoading} loading={isLoading}>
                {isLoading ? 'Exporting…' : 'Export inventory to Sheets'}
              </Button>
              {exportResult && (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                  <p className="font-semibold">
                    ✓ Exported {exportResult.itemsExported} items
                  </p>
                  {exportResult.spreadsheetUrl && (
                    <a
                      href={exportResult.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center text-xs font-semibold text-emerald-200 hover:text-emerald-100"
                    >
                      Open spreadsheet →
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-gray-900/50 p-6 space-y-4">
              <div>
                <h4 className="text-lg font-semibold text-white">Automatic & manual backups</h4>
                <p className="text-sm text-gray-400">
                  Keep a rolling snapshot every time Finale syncs, or trigger a backup on demand before big changes.
                </p>
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-gray-950/40 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Automatic backups</p>
                    <p className="text-xs text-gray-400">
                      Stores a dated sheet after each Finale sync job.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoBackupEnabled}
                      onChange={(e) => handleToggleAutoBackup(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="h-6 w-11 rounded-full bg-gray-700 peer-checked:bg-emerald-500/70 transition-all after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5"></div>
                  </label>
                </div>
                <p className="text-xs text-gray-400">
                  {autoBackupEnabled
                    ? 'Backups will trigger automatically and appear in your Google Drive.'
                    : 'Enable to capture a sheet after every Finale sync run.'}
                </p>
              </div>
              <Button onClick={handleCreateBackup} disabled={isLoading} loading={isLoading}>
                {isLoading ? 'Creating backup…' : 'Create backup now'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GoogleSheetsPanel;
