/**
 * Google Sheets Integration Panel
 *
 * User interface for:
 * - Connecting Google account
 * - Importing inventory from Sheets
 * - Exporting inventory to Sheets
 * - Creating automatic backups
 */

import React, { useState, useEffect } from 'react';
import { getGoogleAuthService, type GoogleAuthStatus } from '../services/googleAuthService';
import { getGoogleSheetsSyncService, type ImportOptions, type ExportOptions } from '../services/googleSheetsSyncService';
import { getGoogleSheetsService } from '../services/googleSheetsService';

interface GoogleSheetsPanelProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type SetupStep = 'auth' | 'import' | 'export' | 'backup';

const GoogleSheetsPanel: React.FC<GoogleSheetsPanelProps> = ({ addToast }) => {
  const [currentStep, setCurrentStep] = useState<SetupStep>('auth');
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
    return localStorage.getItem('google_sheets_auto_backup') === 'true';
  });

  const authService = getGoogleAuthService();
  const syncService = getGoogleSheetsSyncService();
  const sheetsService = getGoogleSheetsService();

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Listen for OAuth callback messages
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        await authService.handleAuthCallback(event.data.tokens);
        await checkAuthStatus();
        addToast('Successfully connected to Google!', 'success');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkAuthStatus = async () => {
    try {
      const status = await authService.getAuthStatus();
      setAuthStatus(status);
      if (status.isAuthenticated && status.hasValidToken) {
        setCurrentStep('import');
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  };

  const handleConnect = async () => {
    try {
      setIsLoading(true);
      const authUrl = await authService.getAuthUrl();

      // Open in popup
      const popup = window.open(
        authUrl,
        'Google OAuth',
        'width=600,height=700,menubar=no,toolbar=no'
      );

      if (!popup) {
        // Fallback: redirect in same window
        window.location.href = authUrl;
      }
    } catch (error) {
      console.error('Error connecting to Google:', error);
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
      setCurrentStep('auth');
      addToast('Successfully disconnected from Google', 'success');
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

      addToast(`Successfully exported ${result.itemsExported} items!`, 'success');
    } catch (error) {
      console.error('Error exporting:', error);
      addToast(`Export failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setIsLoading(true);

      const result = await syncService.createAutoBackup();

      addToast('Backup created successfully!', 'success');

      if (result.spreadsheetUrl) {
        window.open(result.spreadsheetUrl, '_blank');
      }
    } catch (error) {
      console.error('Error creating backup:', error);
      addToast(`Backup failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="google-sheets-panel">
      <h2>Google Sheets Integration</h2>

      {/* Authentication Section */}
      <div className="section">
        <h3>1. Connect Google Account</h3>
        {authStatus?.isAuthenticated ? (
          <div className="auth-status connected">
            <p>✓ Connected to Google</p>
            <p className="scopes">Scopes: {authStatus.scopes.join(', ')}</p>
            {authStatus.expiresAt && (
              <p className="expires">Expires: {authStatus.expiresAt.toLocaleString()}</p>
            )}
            <button onClick={handleDisconnect} disabled={isLoading}>
              Disconnect
            </button>
          </div>
        ) : (
          <div className="auth-status disconnected">
            <p>Not connected to Google</p>
            <button onClick={handleConnect} disabled={isLoading}>
              {isLoading ? 'Connecting...' : 'Connect Google Account'}
            </button>
          </div>
        )}
      </div>

      {/* Import Section */}
      {authStatus?.isAuthenticated && (
        <div className="section">
          <h3>2. Import from Google Sheets</h3>
          <p>Import inventory data from an existing Google Sheet</p>

          <div className="form-group">
            <label>Spreadsheet URL or ID:</label>
            <input
              type="text"
              value={importSpreadsheetUrl}
              onChange={(e) => setImportSpreadsheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>Sheet Name:</label>
            <input
              type="text"
              value={importSheetName}
              onChange={(e) => setImportSheetName(e.target.value)}
              placeholder="Sheet1"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>Import Strategy:</label>
            <select
              value={importStrategy}
              onChange={(e) => setImportStrategy(e.target.value as any)}
              disabled={isLoading}
            >
              <option value="update_existing">Update Existing (Merge)</option>
              <option value="add_new">Add New Only (Skip Existing)</option>
              <option value="replace">Replace All (Clear & Import)</option>
            </select>
          </div>

          <button
            onClick={handleImport}
            disabled={isLoading || !importSpreadsheetUrl}
            className="btn-primary"
          >
            {isLoading ? 'Importing...' : 'Import Inventory'}
          </button>
        </div>
      )}

      {/* Export Section */}
      {authStatus?.isAuthenticated && (
        <div className="section">
          <h3>3. Export to Google Sheets</h3>
          <p>Export current inventory to a new Google Sheet</p>

          <button
            onClick={handleExport}
            disabled={isLoading}
            className="btn-primary"
          >
            {isLoading ? 'Exporting...' : 'Export Inventory'}
          </button>

          {exportResult && (
            <div className="export-result">
              <p>✓ Exported {exportResult.itemsExported} items</p>
              {exportResult.spreadsheetUrl && (
                <a href={exportResult.spreadsheetUrl} target="_blank" rel="noopener noreferrer">
                  Open Spreadsheet →
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Backup Section */}
      {authStatus?.isAuthenticated && (
        <div className="section">
          <h3>4. Automatic Backups</h3>
          <p>Automatically backup inventory to Google Sheets after each Finale sync</p>

          <div className="auto-backup-toggle">
            <label className="toggle-container">
              <input
                type="checkbox"
                checked={autoBackupEnabled}
                onChange={(e) => handleToggleAutoBackup(e.target.checked)}
              />
              <span className="toggle-slider"></span>
              <span className="toggle-label">
                {autoBackupEnabled ? 'Auto-Backup Enabled' : 'Auto-Backup Disabled'}
              </span>
            </label>
            <p className="toggle-description">
              {autoBackupEnabled 
                ? '✓ Inventory will be automatically backed up to Google Sheets after Finale syncs' 
                : 'Enable to create automatic backups after each Finale sync'}
            </p>
          </div>

          <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #e0e0e0' }}>
            <h4 style={{ fontSize: '1em', marginBottom: '10px' }}>Manual Backup</h4>
            <p style={{ fontSize: '0.9em', color: '#666', marginBottom: '10px' }}>
              Create a backup right now without waiting for next Finale sync
            </p>
            <button
              onClick={handleCreateBackup}
              disabled={isLoading}
              className="btn-secondary"
            >
              {isLoading ? 'Creating Backup...' : 'Create Backup Now'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        .google-sheets-panel {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }

        .section {
          background: #f9f9f9;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
        }

        .section h3 {
          margin-top: 0;
          color: #333;
        }

        .auth-status {
          padding: 15px;
          border-radius: 4px;
          margin: 10px 0;
        }

        .auth-status.connected {
          background: #e8f5e9;
          border: 1px solid #4caf50;
        }

        .auth-status.disconnected {
          background: #fff3e0;
          border: 1px solid #ff9800;
        }

        .scopes, .expires {
          font-size: 0.9em;
          color: #666;
          margin: 5px 0;
        }

        .form-group {
          margin: 15px 0;
        }

        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
          color: #333;
        }

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: #4285f4;
        }

        button {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          cursor: pointer;
          margin-right: 10px;
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-primary {
          background: #4285f4;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #357ae8;
        }

        .btn-secondary {
          background: #34a853;
          color: white;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #2d8e47;
        }

        .export-result {
          margin-top: 15px;
          padding: 15px;
          background: #e8f5e9;
          border: 1px solid #4caf50;
          border-radius: 4px;
        }

        .export-result a {
          color: #4285f4;
          text-decoration: none;
          font-weight: 500;
        }

        .export-result a:hover {
          text-decoration: underline;
        }

        .auto-backup-toggle {
          margin: 15px 0;
        }

        .toggle-container {
          display: flex;
          align-items: center;
          cursor: pointer;
          user-select: none;
          margin-bottom: 10px;
        }

        .toggle-container input[type="checkbox"] {
          position: absolute;
          opacity: 0;
          cursor: pointer;
        }

        .toggle-slider {
          position: relative;
          display: inline-block;
          width: 50px;
          height: 26px;
          background-color: #ccc;
          border-radius: 34px;
          transition: background-color 0.3s;
          margin-right: 12px;
        }

        .toggle-slider::before {
          content: '';
          position: absolute;
          height: 20px;
          width: 20px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          border-radius: 50%;
          transition: transform 0.3s;
        }

        .toggle-container input:checked + .toggle-slider {
          background-color: #4caf50;
        }

        .toggle-container input:checked + .toggle-slider::before {
          transform: translateX(24px);
        }

        .toggle-label {
          font-weight: 500;
          color: #333;
        }

        .toggle-description {
          font-size: 0.9em;
          color: #666;
          margin: 5px 0 0 0;
          padding-left: 62px;
        }
      `}</style>
    </div>
  );
};

export default GoogleSheetsPanel;
