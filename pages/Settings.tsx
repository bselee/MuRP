import React, { useState } from 'react';
import Papa from 'papaparse';
import type { Page } from '../App';
import type { GmailConnection, ExternalConnection, User, AiConfig, AiPrompt } from '../types';
import { defaultAiConfig } from '../types';
import type { ValidationResult } from '../services/integrations/CSVValidator';
import { CSVValidator } from '../services/integrations/CSVValidator';
import AiPromptEditModal from '../components/AiPromptEditModal';
import { GmailIcon, KeyIcon, ClipboardCopyIcon, RefreshIcon, TrashIcon, ServerStackIcon, LinkIcon, BotIcon, ChevronDownIcon, PencilIcon, UsersIcon } from '../components/icons';
import UserManagementPanel from '../components/UserManagementPanel';

interface SettingsProps {
    currentUser: User;
    aiConfig: AiConfig;
    setAiConfig: (config: AiConfig) => void;
    gmailConnection: GmailConnection;
    onGmailConnect: () => void;
    onGmailDisconnect: () => void;
    apiKey: string | null;
    onGenerateApiKey: () => void;
    onRevokeApiKey: () => void;
    addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    setCurrentPage: (page: Page) => void;
    externalConnections: ExternalConnection[];
    onSetExternalConnections: (connections: ExternalConnection[]) => void;
    users: User[];
    onInviteUser: (email: string, role: User['role'], department: User['department']) => void;
    onUpdateUser: (updatedUser: User) => void;
    onDeleteUser: (userId: string) => void;
}

const Settings: React.FC<SettingsProps> = ({ 
    currentUser, aiConfig, setAiConfig,
    gmailConnection, onGmailConnect, onGmailDisconnect,
    apiKey, onGenerateApiKey, onRevokeApiKey, addToast,
    setCurrentPage, externalConnections, onSetExternalConnections,
    users, onInviteUser, onUpdateUser, onDeleteUser
}) => {
    const [showApiKey, setShowApiKey] = useState(false);
    const [isDevSettingsOpen, setIsDevSettingsOpen] = useState(false);
    const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
    const [selectedPrompt, setSelectedPrompt] = useState<AiPrompt | null>(null);
    // Experimental features: local toggle persisted in localStorage
    const [useDataManager, setUseDataManager] = useState<boolean>(() => {
      try { return localStorage.getItem('useDataManager') === 'true'; } catch { return false; }
    });
    
    // State for the "Add New Connection" form
    const [newConnection, setNewConnection] = useState({ name: '', apiUrl: '', apiKey: '' });
  const [importType, setImportType] = useState<'inventory' | 'vendors'>('inventory');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewHeaders, setPreviewHeaders] = useState<string[] | null>(null);
  const [previewRows, setPreviewRows] = useState<any[] | null>(null);
  const [parsedRows, setParsedRows] = useState<any[] | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validationProgress, setValidationProgress] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{completed: number; total: number} | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setImportFile(f);
    // Reset preview and validation state
    setPreviewHeaders(null);
    setPreviewRows(null);
    setParsedRows(null);
    setValidation(null);
    setValidationProgress(null);
    if (!f) return;
    // Enforce file size limit (10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (f.size > MAX_FILE_SIZE) {
      const sizeMB = (f.size / (1024 * 1024)).toFixed(1);
      addToast(`File too large (${sizeMB}MB). Maximum allowed is 10MB.`, 'error');
      return;
    }
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (ext === 'csv') {
  f.text().then(async (text) => {
        try {
          const res = Papa.parse(text, { header: true, skipEmptyLines: true });
          // Filter out empty rows
          const rowsRaw = Array.isArray(res.data) ? (res.data as any[]) : [];
          const rows = rowsRaw.filter(row => Object.values(row ?? {}).some(v => v !== undefined && v !== null && String(v).trim() !== ''));
          const headers = res.meta?.fields || (rows.length ? Object.keys(rows[0]) : []);
          setParsedRows(rows);
          setPreviewHeaders(headers || []);
          setPreviewRows(rows.slice(0, 5));
          const validator = new CSVValidator();
          let result: ValidationResult;
          if (rows.length > 500) {
            setValidationProgress(0);
            result = await validator.validateAsync(rows, importType, { chunkSize: 250, onProgress: (p) => setValidationProgress(p) });
          } else {
            result = validator.validate(rows, importType);
          }
          // After base validation, optionally perform async foreign key checks (inventory > Vendor ID)
          if (importType === 'inventory') {
            try {
              const { supabase } = await import('../lib/supabase/client');
              // Collect unique vendor IDs present
              const vendorIdKeys = ['Vendor ID', 'vendorId', 'VendorID', 'vendor_id', 'Vendor Id'];
              const vendorIds = Array.from(new Set(rows
                .map(r => vendorIdKeys.map(k => r?.[k]).find(Boolean))
                .filter(Boolean))) as string[];
              if (vendorIds.length > 0) {
                const { data: existing } = await supabase
                  .from('vendors')
                  .select('id')
                  .in('id', vendorIds);
                const existingSet = new Set((existing || []).map(v => v.id));
                const fkErrors = rows
                  .map((r, idx) => ({ val: vendorIdKeys.map(k => r?.[k]).find(Boolean) as string | undefined, idx }))
                  .filter(x => x.val && !existingSet.has(x.val))
                  .map(x => ({ row: x.idx + 2, field: 'Vendor ID', message: `Vendor "${x.val}" does not exist`, severity: 'error' as const }));
                const merged = { ...result, errors: [...result.errors, ...fkErrors] };
                merged.summary.errorRows = new Set(merged.errors.map(e => e.row)).size;
                merged.summary.validRows = merged.summary.totalRows - merged.summary.errorRows;
                merged.valid = merged.errors.length === 0;
                setValidation(merged);
              } else {
                setValidation(result);
              }
            } catch (e) {
              console.warn('Foreign key validation skipped due to error:', e);
              setValidation(result);
            }
          } else {
            setValidation(result);
          }
          setValidationProgress(100);
        } catch (err) {
          console.warn('CSV parse failed:', err);
          addToast('Failed to parse CSV. Please check the file format.', 'error');
          setValidationProgress(null);
        }
      });
    } else if (ext === 'json') {
      f.text().then((text) => {
        try {
          const data = JSON.parse(text);
          const rowsRaw = Array.isArray(data) ? data : [data];
          const rows = rowsRaw.filter(row => Object.values(row ?? {}).some(v => v !== undefined && v !== null && String(v).trim() !== ''));
          const headers = rows.length ? Object.keys(rows[0]) : [];
          setParsedRows(rows);
          setPreviewHeaders(headers);
          setPreviewRows(rows.slice(0, 5));
          const validator = new CSVValidator();
          if (rows.length > 500) {
            setValidationProgress(0);
            validator.validateAsync(rows, importType, { chunkSize: 250, onProgress: (p) => setValidationProgress(p) })
              .then((result) => { setValidation(result); setValidationProgress(100); })
              .catch((err) => { console.warn('Async validation failed:', err); setValidationProgress(null); addToast('Validation failed.', 'error'); });
          } else {
            const result = validator.validate(rows, importType);
            setValidation(result);
            setValidationProgress(100);
          }
        } catch (err) {
          console.warn('JSON parse failed:', err);
          addToast('Failed to parse JSON. Please check the file format.', 'error');
        }
      });
    }
  };

  const handleProcessImport = async () => {
    if (!importFile) {
      addToast('Please choose a CSV or JSON file to import.', 'error');
      return;
    }
    if (!validation || !validation.valid) {
      addToast('Please fix validation errors before importing.', 'error');
      return;
    }
    try {
      const text = await importFile.text();
      const { CSVAdapter } = await import('../services/integrations/CSVAdapter');
      const adapter = new CSVAdapter();
      const count = await adapter.importCSVText(text, importType);
      addToast(`Imported ${count} ${importType} records from CSV.`, 'success');
    } catch (err: any) {
      addToast(err?.message || 'Failed to import CSV', 'error');
    }
  };

  const handleConfirmSave = async () => {
    if (!importFile) {
      addToast('Please choose a CSV or JSON file to import.', 'error');
      return;
    }
    if (!validation || !validation.valid) {
      addToast('Please fix validation errors before saving.', 'error');
      return;
    }
    try {
      setIsSaving(true);
      setSaveProgress({ completed: 0, total: parsedRows?.length || 0 });
      const text = await importFile.text();
      const { CSVAdapter } = await import('../services/integrations/CSVAdapter');
      const adapter = new CSVAdapter();
      await adapter.importCSVText(text, importType);
      if (importType === 'inventory') {
        const items = await adapter.fetchInventory();
        const { bulkUpsertInventory } = await import('../services/dataService');
        const total = items.length;
        await bulkUpsertInventory(items, (completed, t) => setSaveProgress({ completed, total: t }));
      } else {
        const vendors = await adapter.fetchVendors();
        const { bulkUpsertVendors } = await import('../services/dataService');
        const total = vendors.length;
        await bulkUpsertVendors(vendors, (completed, t) => setSaveProgress({ completed, total: t }));
      }
      addToast('Save to database completed successfully.', 'success');
    } catch (err: any) {
      console.error('Save to database failed:', err);
      addToast(err?.message || 'Failed to save to database', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // CSV Export handlers
  const handleExportInventory = async () => {
    try {
      const { fetchInventory } = await import('../services/dataService');
      const items = await fetchInventory();
      const csv = Papa.unparse(items.map(i => ({
        SKU: i.sku,
        Name: i.name,
        Category: i.category,
        Stock: i.stock,
        'On Order': i.onOrder ?? 0,
        'Reorder Point': i.reorderPoint ?? 0,
        'Vendor ID': i.vendorId ?? '',
        MOQ: i.moq ?? '',
      })));
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      addToast('Failed to export inventory CSV.', 'error');
    }
  };

  const handleExportVendors = async () => {
    try {
      const { fetchVendors } = await import('../services/dataService');
      const vendors = await fetchVendors();
      const csv = Papa.unparse(vendors.map(v => ({
        ID: v.id,
        Name: v.name,
        Emails: Array.isArray((v as any).contactEmails) ? (v as any).contactEmails.join(', ') : (v as any).contactEmail || '',
        Phone: v.phone || '',
        Address: v.address || '',
        Website: (v as any).website || '',
        'Lead Time Days': (v as any).leadTimeDays ?? (v as any).leadTime ?? '',
      })));
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vendors-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      addToast('Failed to export vendors CSV.', 'error');
    }
  };

    const handleCopyApiKey = () => {
        if (apiKey) {
            navigator.clipboard.writeText(apiKey);
            addToast('API Key copied to clipboard.', 'success');
        }
    };

    const handleNewConnectionChange = (field: keyof typeof newConnection, value: string) => {
        setNewConnection(prev => ({ ...prev, [field]: value }));
    };

    const handleAddNewConnection = () => {
        if (!newConnection.name || !newConnection.apiUrl || !newConnection.apiKey) {
            addToast('All fields are required to add a connection.', 'error');
            return;
        }
        const newConnectionWithId: ExternalConnection = {
            id: `conn-${Date.now()}`,
            ...newConnection
        };
        onSetExternalConnections([...externalConnections, newConnectionWithId]);
        setNewConnection({ name: '', apiUrl: '', apiKey: '' }); // Reset form
        addToast(`Connection "${newConnection.name}" added successfully.`, 'success');
    };

    const handleDeleteConnection = (id: string) => {
        onSetExternalConnections(externalConnections.filter(c => c.id !== id));
        addToast('Connection removed.', 'info');
    };

    const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setAiConfig({ ...aiConfig, model: e.target.value });
        addToast('AI Model updated successfully.', 'success');
    };

  const handleToggleUseDataManager = () => {
    const next = !useDataManager;
    setUseDataManager(next);
    try { localStorage.setItem('useDataManager', String(next)); } catch {}
    addToast(`Experimental: DataManager for Inventory ${next ? 'enabled' : 'disabled'}.`, 'info');
  };

    const handleEditPrompt = (prompt: AiPrompt) => {
        setSelectedPrompt(prompt);
        setIsPromptModalOpen(true);
    };

    const handleSavePrompt = (updatedPrompt: AiPrompt) => {
        const newPrompts = aiConfig.prompts.map(p => p.id === updatedPrompt.id ? updatedPrompt : p);
        setAiConfig({ ...aiConfig, prompts: newPrompts });
        addToast(`Prompt "${updatedPrompt.name}" updated successfully.`, 'success');
    };
    
    const handleResetPrompts = () => {
        setAiConfig({ ...aiConfig, prompts: defaultAiConfig.prompts });
        addToast('All prompts have been reset to their default values.', 'info');
    };

  return (
    <>
        <div className="space-y-12 max-w-4xl mx-auto">
          <header>
            <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
            <p className="text-gray-400 mt-1">Manage users, integrations, API keys, and application preferences.</p>
          </header>
          
          {/* User Management Section */}
          {(currentUser.role === 'Admin' || currentUser.role === 'Manager') && (
            <section>
                <h2 className="text-xl font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4 flex items-center gap-2">
                    <UsersIcon className="w-6 h-6" />
                    User Management
                </h2>
                <UserManagementPanel
                    currentUser={currentUser}
                    users={users}
                    onInviteUser={onInviteUser}
                    onUpdateUser={onUpdateUser}
                    onDeleteUser={onDeleteUser}
                />
            </section>
          )}

          {/* API & Integrations Section */}
          <section>
            <h2 className="text-xl font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4">API & Integrations</h2>
            <div className="space-y-6">
              {/* Data Source (Preview) */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white">Data Source</h3>
                <p className="text-sm text-gray-400 mt-1">Select where the app reads core data from. Supabase is active today; Finale and CSV are coming soon.</p>
                <div className="mt-4 pt-4 border-t border-gray-700/50 grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-gray-300">Primary Source</label>
                  <select className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white" disabled>
                    <option value="supabase">Supabase (Current)</option>
                    <option value="finale">Finale Inventory (Coming Soon)</option>
                    <option value="csv">CSV/JSON Upload (Coming Soon)</option>
                  </select>
                </div>
              </div>

              {/* Import / Export (CSV/JSON) */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white">Import / Export Data</h3>
                <p className="text-sm text-gray-400 mt-1">Quickly seed or update data using CSV templates. Export your current data or import new records.</p>
                <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-3">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={handleExportInventory} className="text-xs bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1.5 px-3 rounded-md">Export Inventory CSV</button>
                    <button onClick={handleExportVendors} className="text-xs bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1.5 px-3 rounded-md">Export Vendors CSV</button>
                  </div>
                  <div className="grid md:grid-cols-3 gap-3 items-center">
                    <label className="text-sm text-gray-300">Entity</label>
                    <select value={importType} onChange={e => setImportType(e.target.value as any)} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white">
                      <option value="inventory">Inventory Items</option>
                      <option value="vendors">Vendors</option>
                    </select>
                    <div className="text-right text-sm text-gray-400">
                      <a className="underline hover:text-gray-200 mr-3" href="/templates/inventory-template.csv" download>Inventory Template</a>
                      <a className="underline hover:text-gray-200" href="/templates/vendors-template.csv" download>Vendors Template</a>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-3 gap-3 items-center">
                    <label className="text-sm text-gray-300">File</label>
                    <input type="file" accept=".csv,.json" onChange={handleFileUpload} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white" />
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={handleProcessImport} disabled={!validation?.valid || isSaving} className={`font-semibold py-2 px-4 rounded-md transition-colors ${validation?.valid && !isSaving ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-600 text-gray-300 cursor-not-allowed'}`}>
                        {validation?.valid ? 'Import to Preview (Not Saved)' : 'Fix Errors First'}
                      </button>
                      <button onClick={handleConfirmSave} disabled={!validation?.valid || isSaving} className={`font-semibold py-2 px-4 rounded-md transition-colors ${validation?.valid && !isSaving ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-600 text-gray-300 cursor-not-allowed'}`}>
                        {isSaving ? 'Saving…' : 'Confirm & Save to Database'}
                      </button>
                    </div>
                  </div>
                  {validation?.valid && (
                    <div className="bg-yellow-900/20 border border-yellow-700 rounded p-3 mt-2">
                      <p className="text-yellow-300 text-sm">Data shown below is a preview only. Click "Confirm & Save to Database" to persist changes.</p>
                    </div>
                  )}
                  {isSaving && saveProgress && (
                    <div className="mt-2 text-sm text-gray-300">
                      Saving… {saveProgress.completed}/{saveProgress.total}
                      <div className="w-full bg-gray-700 h-2 rounded mt-1">
                        <div className="bg-green-500 h-2 rounded" style={{ width: `${saveProgress.total ? Math.round((saveProgress.completed / saveProgress.total) * 100) : 0}%` }} />
                      </div>
                    </div>
                  )}
                  {validation && (
                    <div className="mt-2 space-y-2">
                      <div className={`p-3 rounded ${validation.valid ? 'bg-green-900/30 border border-green-800' : 'bg-red-900/30 border border-red-800'}`}>
                        <p className="font-semibold">{validation.valid ? 'Validation Passed' : 'Validation Failed'}</p>
                        <p className="text-sm text-gray-300">Rows: {validation.summary.validRows} valid / {validation.summary.errorRows} with errors (Total {validation.summary.totalRows})</p>
                      </div>
                      {validation.errors.length > 0 && (
                        <div className="max-h-40 overflow-y-auto">
                          <p className="font-semibold text-red-400">Errors:</p>
                          {validation.errors.slice(0, 10).map((e, i) => (
                            <p key={i} className="text-sm text-red-300">Row {e.row}: {e.field} - {e.message}</p>
                          ))}
                          {validation.errors.length > 10 && (
                            <p className="text-sm text-gray-400">… and {validation.errors.length - 10} more errors</p>
                          )}
                        </div>
                      )}
                      {validation.warnings.length > 0 && (
                        <div className="max-h-32 overflow-y-auto">
                          <p className="font-semibold text-yellow-400">Warnings:</p>
                          {validation.warnings.slice(0, 5).map((w, i) => (
                            <p key={i} className="text-sm text-yellow-300">Row {w.row}: {w.field} - {w.message}</p>
                          ))}
                          {validation.warnings.length > 5 && (
                            <p className="text-sm text-gray-400">… and {validation.warnings.length - 5} more warnings</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {validationProgress !== null && (!validation || validationProgress < 100) && (
                    <div className="mt-2 text-sm text-gray-300">
                      Validating… {validationProgress}%
                      <div className="w-full bg-gray-700 h-2 rounded mt-1">
                        <div className="bg-indigo-500 h-2 rounded" style={{ width: `${validationProgress}%` }} />
                      </div>
                    </div>
                  )}
                  {validationProgress !== null && validationProgress >= 100 && validation && (
                    <div className="mt-2 text-sm text-green-400 flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white">✓</span>
                      <span>Validation complete</span>
                    </div>
                  )}
                  {previewRows && previewHeaders && (
                    <div className="mt-2 border border-gray-700 rounded-md overflow-x-auto">
                      <div className="bg-gray-900/50 text-xs text-gray-400 px-3 py-2">Preview (first {Math.min(5, previewRows.length)} rows)</div>
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="bg-gray-900/40">
                            {previewHeaders.map(h => (
                              <th key={h} className="text-left px-3 py-2 text-gray-300 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, idx) => (
                            <tr key={idx} className="odd:bg-gray-800/30">
                              {previewHeaders.map(h => (
                                <td key={h} className="px-3 py-2 text-gray-300 whitespace-nowrap">
                                  {row?.[h] as any}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Our API Credentials (Inbound) */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white">Our API Credentials</h3>
                <p className="text-sm text-gray-400 mt-1">Allow external services to connect to this MRP instance.</p>
                <div className="mt-4 pt-4 border-t border-gray-700/50">
                  {apiKey ? (
                    <div className="space-y-3">
                      <div className="flex items-center bg-gray-900/50 rounded-md p-2">
                        <KeyIcon className="w-5 h-5 text-yellow-400 mr-3"/>
                        <input type={showApiKey ? 'text' : 'password'} value={apiKey} readOnly className="flex-1 bg-transparent text-gray-300 font-mono text-sm focus:outline-none"/>
                        <button onClick={handleCopyApiKey} className="p-2 text-gray-400 hover:text-white"><ClipboardCopyIcon className="w-5 h-5"/></button>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center text-sm text-gray-300 cursor-pointer">
                          <input type="checkbox" checked={showApiKey} onChange={() => setShowApiKey(!showApiKey)} className="mr-2"/>
                          Show Key
                        </label>
                        <div>
                          <button onClick={onGenerateApiKey} className="text-sm text-indigo-400 hover:underline mr-4">Regenerate</button>
                          <button onClick={onRevokeApiKey} className="text-sm text-red-400 hover:underline">Revoke Key</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                     <div className="text-center py-4">
                        <p className="text-gray-400 mb-3">No API key is currently active.</p>
                        <button onClick={onGenerateApiKey} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors">
                          Generate API Key
                        </button>
                     </div>
                  )}
                </div>
                 <div className="mt-4 pt-4 border-t border-gray-700/50 flex justify-end">
                    <button onClick={() => setCurrentPage('API Documentation')} className="text-sm font-semibold text-indigo-400 hover:text-indigo-300">
                        View API Documentation &rarr;
                    </button>
                </div>
              </div>
              
              {/* External Integrations (Outbound) */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white">External Integrations</h3>
                <p className="text-sm text-gray-400 mt-1">Connect to external services like supplier portals or shipping APIs.</p>
                
                <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-4">
                    {externalConnections.length > 0 && (
                        <div className="space-y-3">
                            {externalConnections.map(conn => (
                                <div key={conn.id} className="flex items-center justify-between p-3 bg-gray-900/50 rounded-md">
                                    <div>
                                        <p className="font-semibold text-white">{conn.name}</p>
                                        <p className="text-xs text-gray-400">{conn.apiUrl}</p>
                                    </div>
                                    <button onClick={() => handleDeleteConnection(conn.id)} className="p-2 text-red-500 hover:text-red-400"><TrashIcon className="w-5 h-5"/></button>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    <div className="pt-4 border-t border-gray-700/50">
                        <h4 className="text-md font-semibold text-gray-200 mb-3">Add New Connection</h4>
                        <div className="space-y-3">
                            <div className="relative">
                                <ServerStackIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"/>
                                <input type="text" placeholder="Service Name (e.g., Supplier Portal)" value={newConnection.name} onChange={e => handleNewConnectionChange('name', e.target.value)} className="w-full bg-gray-700 rounded-md p-2 pl-10 text-sm"/>
                            </div>
                            <div className="relative">
                                <LinkIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"/>
                                <input type="text" placeholder="API URL" value={newConnection.apiUrl} onChange={e => handleNewConnectionChange('apiUrl', e.target.value)} className="w-full bg-gray-700 rounded-md p-2 pl-10 text-sm"/>
                            </div>
                            <div className="relative">
                                <KeyIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"/>
                                <input type="password" placeholder="API Key / Bearer Token" value={newConnection.apiKey} onChange={e => handleNewConnectionChange('apiKey', e.target.value)} className="w-full bg-gray-700 rounded-md p-2 pl-10 text-sm"/>
                            </div>
                            <div className="flex justify-end">
                                <button onClick={handleAddNewConnection} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors">Save Connection</button>
                            </div>
                        </div>
                    </div>
                </div>
              </div>


              {/* Gmail Integration */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <div className="flex items-center gap-4">
                  <GmailIcon className="w-8 h-8 text-gray-300" />
                  <div>
                    <h3 className="text-lg font-semibold text-white">Gmail Integration</h3>
                    <p className="text-sm text-gray-400 mt-1">Connect your Gmail account to send Purchase Orders directly to vendors from within the app.</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-700/50 flex items-center justify-between">
                  {gmailConnection.isConnected ? (
                    <div className="text-sm">
                      <span className="text-gray-400">Connected as: </span>
                      <span className="font-semibold text-green-400">{gmailConnection.email}</span>
                    </div>
                  ) : (
                    <div className="text-sm text-yellow-400">
                      Gmail account is not connected.
                    </div>
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
          </section>

           {/* Developer Settings Section (Admin only) */}
           {currentUser.role === 'Admin' && (
             <section>
                <button onClick={() => setIsDevSettingsOpen(!isDevSettingsOpen)} className="w-full flex justify-between items-center text-left">
                    <h2 className="text-xl font-semibold text-gray-300">Developer Settings</h2>
                    <ChevronDownIcon className={`w-6 h-6 text-gray-400 transition-transform ${isDevSettingsOpen ? 'rotate-180' : ''}`} />
                </button>
                 {isDevSettingsOpen && (
                    <div className="mt-4 border-t border-gray-700 pt-4 space-y-6">
                        {/* Experimental Features */}
                        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h3 className="text-lg font-semibold text-white">Experimental Features</h3>
                              <p className="text-sm text-gray-400 mt-1">Toggle experimental capabilities for safe testing in production.</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-sm text-gray-300">Use DataManager for Inventory</label>
                              <input type="checkbox" checked={useDataManager} onChange={handleToggleUseDataManager} className="w-5 h-5" />
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-3">When enabled, inventory reads route through the new DataManager layer with caching and error-aware fallback. Disable if anything looks off.</p>
                        </div>

                        {/* AI Model Configuration */}
                         <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                            <div className="flex items-center gap-4">
                              <BotIcon className="w-8 h-8 text-indigo-400" />
                              <div>
                                <h3 className="text-lg font-semibold text-white">AI Model Configuration</h3>
                                <p className="text-sm text-gray-400 mt-1">Select the base Gemini model for all AI features.</p>
                              </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-700/50">
                                <label htmlFor="ai-model-select" className="block text-sm font-medium text-gray-300">Active Model</label>
                                <select 
                                    id="ai-model-select"
                                    value={aiConfig.model}
                                    onChange={handleModelChange}
                                    className="mt-1 block w-full md:w-1/2 bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                >
                                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast & Cost-Effective)</option>
                                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (Advanced Reasoning)</option>
                                </select>
                            </div>
                        </div>

                        {/* AI Prompt Management */}
                        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                             <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="text-lg font-semibold text-white">AI Prompt Management</h3>
                                    <p className="text-sm text-gray-400 mt-1">Customize the system prompts used by the AI assistant.</p>
                                </div>
                                <button onClick={handleResetPrompts} className="text-sm font-semibold text-gray-400 hover:text-white">Reset all to default</button>
                             </div>
                             <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-2">
                                {aiConfig.prompts.map(prompt => (
                                    <div key={prompt.id} className="flex justify-between items-center p-3 bg-gray-900/50 rounded-md">
                                        <div>
                                            <p className="font-semibold text-white">{prompt.name}</p>
                                            <p className="text-xs text-gray-400">{prompt.description}</p>
                                        </div>
                                        <button onClick={() => handleEditPrompt(prompt)} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-1.5 px-3 rounded-md transition-colors">
                                            <PencilIcon className="w-4 h-4" /> Edit
                                        </button>
                                    </div>
                                ))}
                             </div>
                        </div>
                    </div>
                )}
             </section>
           )}
        </div>
        <AiPromptEditModal 
            isOpen={isPromptModalOpen}
            onClose={() => setIsPromptModalOpen(false)}
            prompt={selectedPrompt}
            onSave={handleSavePrompt}
        />
    </>
  );
};

export default Settings;