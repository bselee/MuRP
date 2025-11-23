import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import CalendarSettingsPanel from './CalendarSettingsPanel';
import GoogleSheetsPanel from './GoogleSheetsPanel';
import {
  GmailIcon,
  GoogleCalendarIcon,
  GoogleSheetsIcon,
  GoogleDocsIcon,
  CheckCircleIcon,
  XCircleIcon,
} from './icons';
import { supabase } from '../lib/supabase/client';
import { getGoogleAuthService } from '../services/googleAuthService';
import type { GmailConnection } from '../types';
import type { CalendarSourceConfig } from '../types/calendar';

interface GoogleDataPanelProps {
  userId: string;
  gmailConnection: GmailConnection;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type WorkspaceStatus = {
  isConnected: boolean;
  scopes: string[];
  expiresAt: Date | null;
};

type CalendarStatus = {
  syncEnabled: boolean;
  connectedSources: number;
  ingestName: string | null;
  pushEnabledCount: number;
  timezone: string;
  updatedAt: string | null;
};

type SheetsStatus = {
  lastImportAt: string | null;
  lastExportAt: string | null;
  lastBackupAt: string | null;
  autoBackupEnabled: boolean;
  spreadsheetId: string | null;
};

type DocsStatus = {
  hasCompanyProfile: boolean;
  lastDocUpdate: string | null;
};

const DEFAULT_CALENDAR_STATUS: CalendarStatus = {
  syncEnabled: false,
  connectedSources: 0,
  ingestName: null,
  pushEnabledCount: 0,
  timezone: 'America/Los_Angeles',
  updatedAt: null,
};

const DEFAULT_SHEETS_STATUS: SheetsStatus = {
  lastImportAt: null,
  lastExportAt: null,
  lastBackupAt: null,
  autoBackupEnabled: false,
  spreadsheetId: null,
};

const DEFAULT_DOCS_STATUS: DocsStatus = {
  hasCompanyProfile: false,
  lastDocUpdate: null,
};

const formatRelativeTime = (value?: string | Date | null): string => {
  if (!value) return 'Never';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'Never';
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const GoogleDataPanel: React.FC<GoogleDataPanelProps> = ({ userId, gmailConnection, addToast }) => {
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>({
    isConnected: false,
    scopes: [],
    expiresAt: null,
  });
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus>(DEFAULT_CALENDAR_STATUS);
  const [sheetsStatus, setSheetsStatus] = useState<SheetsStatus>(DEFAULT_SHEETS_STATUS);
  const [docsStatus, setDocsStatus] = useState<DocsStatus>(DEFAULT_DOCS_STATUS);
  const [statusLoading, setStatusLoading] = useState(false);

  const googleAuthService = useMemo(() => getGoogleAuthService(), []);

  const fetchCalendarSummary = useCallback(async (): Promise<CalendarStatus> => {
    const { data, error } = await supabase
      .from('user_settings')
      .select('calendar_sources, calendar_sync_enabled, calendar_push_enabled, calendar_timezone, updated_at')
      .eq('user_id', userId)
      .single();

    if (error && (error as any)?.code !== 'PGRST116') {
      throw error;
    }

    const sources = (data?.calendar_sources as CalendarSourceConfig[] | null) ?? [];
    const ingestSource = sources.find(src => src.ingestEnabled);
    const pushEnabled = sources.filter(src => src.pushEnabled).length;

    return {
      syncEnabled: Boolean(data?.calendar_sync_enabled && sources.length > 0),
      connectedSources: sources.length,
      ingestName: ingestSource?.name ?? null,
      pushEnabledCount: pushEnabled,
      timezone: data?.calendar_timezone ?? 'America/Los_Angeles',
      updatedAt: data?.updated_at ?? null,
    };
  }, [userId]);

  const fetchSheetsSummary = useCallback(async (): Promise<SheetsStatus> => {
    const { data, error } = await supabase
      .from('google_sheets_configs')
      .select('last_import_at,last_export_at,last_backup_at,auto_backup_enabled,default_spreadsheet_id')
      .eq('user_id', userId)
      .single();

    if (error && (error as any)?.code !== 'PGRST116') {
      throw error;
    }

    return {
      lastImportAt: data?.last_import_at ?? null,
      lastExportAt: data?.last_export_at ?? null,
      lastBackupAt: data?.last_backup_at ?? null,
      autoBackupEnabled: data?.auto_backup_enabled ?? false,
      spreadsheetId: data?.default_spreadsheet_id ?? null,
    };
  }, [userId]);

  const fetchDocsSummary = useCallback(async (): Promise<DocsStatus> => {
    const [{ data: companyData, error: companyError }, { data: pdfData, error: pdfError }] = await Promise.all([
      supabase.from('company_settings').select('updated_at').single(),
      supabase
        .from('pdf_templates')
        .select('updated_at')
        .eq('is_default', true)
        .eq('template_type', 'purchase_order')
        .is('vendor_id', null)
        .single(),
    ]);

    if (companyError && (companyError as any)?.code !== 'PGRST116') {
      throw companyError;
    }
    if (pdfError && (pdfError as any)?.code !== 'PGRST116') {
      throw pdfError;
    }

    return {
      hasCompanyProfile: Boolean(companyData),
      lastDocUpdate: pdfData?.updated_at ?? null,
    };
  }, []);

  const hydrateStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const [workspaceResult, calendarResult, sheetsResult, docsResult] = await Promise.allSettled([
        googleAuthService.getAuthStatus(),
        fetchCalendarSummary(),
        fetchSheetsSummary(),
        fetchDocsSummary(),
      ]);

      if (workspaceResult.status === 'fulfilled') {
        const status = workspaceResult.value;
        setWorkspaceStatus({
          isConnected: status.isAuthenticated && status.hasValidToken,
          scopes: status.scopes ?? [],
          expiresAt: status.expiresAt ?? null,
        });
      } else {
        console.warn('[GoogleDataPanel] Failed to load workspace status:', workspaceResult.reason);
      }

      if (calendarResult.status === 'fulfilled') {
        setCalendarStatus(calendarResult.value);
      } else {
        console.warn('[GoogleDataPanel] Failed to load calendar status:', calendarResult.reason);
        setCalendarStatus(DEFAULT_CALENDAR_STATUS);
      }

      if (sheetsResult.status === 'fulfilled') {
        setSheetsStatus(sheetsResult.value);
      } else {
        console.warn('[GoogleDataPanel] Failed to load sheets status:', sheetsResult.reason);
        setSheetsStatus(DEFAULT_SHEETS_STATUS);
      }

      if (docsResult.status === 'fulfilled') {
        setDocsStatus(docsResult.value);
      } else {
        console.warn('[GoogleDataPanel] Failed to load docs status:', docsResult.reason);
        setDocsStatus(DEFAULT_DOCS_STATUS);
      }
    } catch (error) {
      console.error('[GoogleDataPanel] Unable to refresh Google Workspace status', error);
      addToast('Unable to refresh Google Workspace status overview right now.', 'error');
    } finally {
      setStatusLoading(false);
    }
  }, [addToast, fetchCalendarSummary, fetchDocsSummary, fetchSheetsSummary, googleAuthService]);

  useEffect(() => {
    hydrateStatus();
  }, [hydrateStatus]);

  const scopeSummary = useMemo(() => {
    if (!workspaceStatus.scopes.length) return 'No scopes granted yet';
    const cleaned = workspaceStatus.scopes.map(scope =>
      scope.replace('https://www.googleapis.com/auth/', '').replace(/_/g, ' '),
    );
    const preview = cleaned.slice(0, 2).join(', ');
    return `${preview}${cleaned.length > 2 ? ` +${cleaned.length - 2}` : ''}`;
  }, [workspaceStatus.scopes]);

  const scrollToElement = (id: string) => {
    if (typeof document === 'undefined') return;
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      addToast('Scroll to the integrations section below to manage this connection.', 'info');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <header>
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Step 1</p>
          <h3 className="text-xl font-semibold text-white mt-2">Connect Google services</h3>
          <p className="text-sm text-gray-400 mt-1">
            Authenticate once and reuse shared scopes for Calendar, Sheets, Docs, and Gmail automations.
          </p>
        </header>
        <Button
          variant="ghost"
          size="sm"
          onClick={hydrateStatus}
          loading={statusLoading}
          className="self-start lg:self-auto"
        >
          Refresh status
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <GmailIcon className="h-6 w-6 text-[#EA4335]" />
                <GoogleCalendarIcon className="h-6 w-6" />
                <GoogleSheetsIcon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Workspace OAuth</p>
                <p className="text-base font-semibold text-white">
                  {workspaceStatus.isConnected ? 'Token active' : 'Not connected'}
                </p>
              </div>
            </div>
            {workspaceStatus.isConnected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-200">
                <CheckCircleIcon className="h-3.5 w-3.5" />
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1 text-xs text-rose-200">
                <XCircleIcon className="h-3.5 w-3.5" />
                Required
              </span>
            )}
          </div>
          <p className="mt-3 text-sm text-gray-400">Scopes: {scopeSummary}</p>
          <p className="text-xs text-gray-500">
            {workspaceStatus.expiresAt ? `Renews ${formatRelativeTime(workspaceStatus.expiresAt)}` : 'Stored via Supabase tokens'}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GoogleCalendarIcon className="h-8 w-8" />
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Production calendar</p>
                <p className="text-base font-semibold text-white">
                  {calendarStatus.syncEnabled ? 'Sync enabled' : 'Sync paused'}
                </p>
              </div>
            </div>
            <span className="text-xs text-gray-400">{calendarStatus.connectedSources} source(s)</span>
          </div>
          <ul className="mt-3 text-sm text-gray-400 space-y-1">
            <li>Primary ingest: {calendarStatus.ingestName ?? 'Not selected'}</li>
            <li>Push enabled on {calendarStatus.pushEnabledCount} calendars</li>
            <li>Timezone: {calendarStatus.timezone}</li>
          </ul>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Updated {calendarStatus.updatedAt ? formatRelativeTime(calendarStatus.updatedAt) : 'never'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => scrollToElement('calendar-settings-panel')}
            >
              Manage
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GoogleSheetsIcon className="h-8 w-8" />
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Sheets & backups</p>
                <p className="text-base font-semibold text-white">
                  {sheetsStatus.spreadsheetId ? 'Configured' : 'Setup pending'}
                </p>
              </div>
            </div>
            {sheetsStatus.autoBackupEnabled ? (
              <span className="text-xs text-emerald-200">Auto-backup on</span>
            ) : (
              <span className="text-xs text-yellow-300">Backups off</span>
            )}
          </div>
          <ul className="mt-3 text-sm text-gray-400 space-y-1">
            <li>Last import: {formatRelativeTime(sheetsStatus.lastImportAt)}</li>
            <li>Last export: {formatRelativeTime(sheetsStatus.lastExportAt)}</li>
            <li>Last backup: {formatRelativeTime(sheetsStatus.lastBackupAt)}</li>
          </ul>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {sheetsStatus.spreadsheetId ? `Sheet ${sheetsStatus.spreadsheetId.slice(0, 6)}…` : 'No sheet linked'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => scrollToElement('sheets-settings-panel')}
            >
              Manage
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GoogleDocsIcon className="h-8 w-8" />
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Docs & Gmail</p>
                <p className="text-base font-semibold text-white">
                  {gmailConnection.isConnected ? 'Workspace mail linked' : 'Mail not linked'}
                </p>
              </div>
            </div>
            {gmailConnection.isConnected ? (
              <span className="text-xs text-emerald-200">{gmailConnection.email}</span>
            ) : (
              <span className="text-xs text-yellow-300">Connect below</span>
            )}
          </div>
          <ul className="mt-3 text-sm text-gray-400 space-y-1">
            <li>Doc templates {docsStatus.hasCompanyProfile ? 'ready' : 'not configured'}</li>
            <li>Last doc export: {formatRelativeTime(docsStatus.lastDocUpdate)}</li>
            <li>Replies route through Gmail threads automatically.</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => scrollToElement('gmail-integration-card')}
            >
              Gmail settings
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => scrollToElement('document-templates-panel')}
            >
              Doc templates
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div
          id="calendar-settings-panel"
          className="rounded-2xl border border-gray-700/70 bg-gray-900/40 p-6"
        >
          <div className="mb-4 space-y-1">
            <h4 className="text-lg font-semibold text-white">Production calendar sync</h4>
            <p className="text-sm text-gray-400">
              Pick a calendar, timezone, and enable automatic sync so builds flow both directions.
            </p>
          </div>
          <CalendarSettingsPanel userId={userId} addToast={addToast} />
        </div>
        <div
          id="sheets-settings-panel"
          className="rounded-2xl border border-gray-700/70 bg-gray-900/40 p-6"
        >
          <div className="mb-4 space-y-1">
            <h4 className="text-lg font-semibold text-white">Sheets import / backup</h4>
            <p className="text-sm text-gray-400">
              Import curated datasets, export the live warehouse, or generate automatic backups in one place.
            </p>
          </div>
          <GoogleSheetsPanel addToast={addToast} />
        </div>
      </div>
    </div>
  );
};

export default GoogleDataPanel;
