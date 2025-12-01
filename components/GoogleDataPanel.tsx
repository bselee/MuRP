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

const isExpectedNoDataError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const code = (error as any)?.code;
  if (code && (code === 'PGRST116' || code === 'PGRST107' || code === '404' || code === '406')) {
    return true;
  }
  const message = typeof (error as any)?.message === 'string' ? (error as any).message.toLowerCase() : '';
  return (
    message.includes('pgrst116') ||
    message.includes('pgrst107') ||
    message.includes('status 406') ||
    message.includes('no rows') ||
    message.includes('not found')
  );
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
        if (!isExpectedNoDataError(workspaceResult.reason)) {
          console.warn('[GoogleDataPanel] Failed to load workspace status:', workspaceResult.reason);
        }
        setWorkspaceStatus({
          isConnected: false,
          scopes: [],
          expiresAt: null,
        });
      }

      if (calendarResult.status === 'fulfilled') {
        setCalendarStatus(calendarResult.value);
      } else {
        if (!isExpectedNoDataError(calendarResult.reason)) {
          console.warn('[GoogleDataPanel] Failed to load calendar status:', calendarResult.reason);
        }
        setCalendarStatus(DEFAULT_CALENDAR_STATUS);
      }

      if (sheetsResult.status === 'fulfilled') {
        setSheetsStatus(sheetsResult.value);
      } else {
        if (!isExpectedNoDataError(sheetsResult.reason)) {
          console.warn('[GoogleDataPanel] Failed to load sheets status:', sheetsResult.reason);
        }
        setSheetsStatus(DEFAULT_SHEETS_STATUS);
      }

      if (docsResult.status === 'fulfilled') {
        setDocsStatus(docsResult.value);
      } else {
        if (!isExpectedNoDataError(docsResult.reason)) {
          console.warn('[GoogleDataPanel] Failed to load docs status:', docsResult.reason);
        }
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

  type BadgeTone = 'success' | 'warning' | 'neutral';
  type CardAction = { label: string; onClick: () => void };
  type StatusCard = {
    id: string;
    icon: React.ReactNode;
    label: string;
    headline: string;
    description?: string;
    details?: string[];
    meta?: string | null;
    note?: string;
    badgeLabel?: string;
    badgeTone?: BadgeTone;
    actions?: CardAction[];
  };

  const badgeToneClasses: Record<BadgeTone, string> = {
    success: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    warning: 'border border-amber-500/30 bg-amber-500/10 text-amber-200',
    neutral: 'border border-white/10 bg-white/5 text-gray-300',
  };

  const statusCards: StatusCard[] = [
    {
      id: 'workspace',
      icon: (
        <div className="flex items-center gap-1 text-white">
          <GmailIcon className="h-5 w-5 text-[#EA4335]" />
          <GoogleCalendarIcon className="h-5 w-5 text-[#4285F4]" />
          <GoogleSheetsIcon className="h-5 w-5 text-[#34A853]" />
        </div>
      ),
      label: 'Workspace OAuth',
      headline: workspaceStatus.isConnected ? 'Token active' : 'Not connected',
      description: `Scopes: ${scopeSummary}`,
      meta: workspaceStatus.expiresAt ? `Renews ${formatRelativeTime(workspaceStatus.expiresAt)}` : 'Stored via Supabase tokens',
      note:
        !workspaceStatus.isConnected && !statusLoading
          ? 'No OAuth token detected. Use the panels below to link Google Workspace.'
          : undefined,
      badgeLabel: workspaceStatus.isConnected ? 'Connected' : 'Required',
      badgeTone: workspaceStatus.isConnected ? 'success' : 'warning',
    },
    {
      id: 'calendar',
      icon: <GoogleCalendarIcon className="h-6 w-6 text-[#4285F4]" />,
      label: 'Production calendar',
      headline: calendarStatus.syncEnabled ? 'Sync enabled' : 'Sync paused',
      details: [
        `Primary ingest: ${calendarStatus.ingestName ?? 'Not selected'}`,
        `Push enabled on ${calendarStatus.pushEnabledCount} calendars`,
        `Timezone: ${calendarStatus.timezone}`,
      ],
      meta: calendarStatus.updatedAt ? `Updated ${formatRelativeTime(calendarStatus.updatedAt)}` : 'Never updated',
      note: !calendarStatus.connectedSources ? 'No Supabase calendar sources configured yet.' : undefined,
      badgeLabel: `${calendarStatus.connectedSources} source${calendarStatus.connectedSources === 1 ? '' : 's'}`,
      badgeTone: 'neutral',
      actions: [
        {
          label: 'Manage calendar',
          onClick: () => scrollToElement('calendar-settings-panel'),
        },
      ],
    },
    {
      id: 'sheets',
      icon: <GoogleSheetsIcon className="h-6 w-6 text-[#34A853]" />,
      label: 'Sheets & backups',
      headline: sheetsStatus.spreadsheetId ? 'Configured' : 'Setup pending',
      details: [
        `Last import: ${formatRelativeTime(sheetsStatus.lastImportAt)}`,
        `Last export: ${formatRelativeTime(sheetsStatus.lastExportAt)}`,
        `Last backup: ${formatRelativeTime(sheetsStatus.lastBackupAt)}`,
      ],
      meta: sheetsStatus.spreadsheetId ? `Sheet ${sheetsStatus.spreadsheetId.slice(0, 6)}…` : null,
      note: !sheetsStatus.spreadsheetId ? 'No default spreadsheet on file yet.' : undefined,
      badgeLabel: sheetsStatus.autoBackupEnabled ? 'Auto-backup on' : 'Backups off',
      badgeTone: sheetsStatus.autoBackupEnabled ? 'success' : 'warning',
      actions: [
        {
          label: 'Sheets settings',
          onClick: () => scrollToElement('sheets-settings-panel'),
        },
      ],
    },
    {
      id: 'docs',
      icon: <GoogleDocsIcon className="h-6 w-6 text-[#1A73E8]" />,
      label: 'Docs & Gmail',
      headline: gmailConnection.isConnected ? 'Workspace mail linked' : 'Mail not linked',
      details: [
        docsStatus.hasCompanyProfile ? 'Doc templates ready' : 'Doc templates not configured',
        `Last doc export: ${formatRelativeTime(docsStatus.lastDocUpdate)}`,
        gmailConnection.isConnected ? `Routing via ${gmailConnection.email}` : 'Connect Gmail for PO replies',
      ],
      badgeLabel: gmailConnection.isConnected ? 'Gmail linked' : 'Mail required',
      badgeTone: gmailConnection.isConnected ? 'success' : 'warning',
      actions: [
        {
          label: 'Gmail settings',
          onClick: () => scrollToElement('gmail-integration-card'),
        },
        {
          label: 'Doc templates',
          onClick: () => scrollToElement('document-templates-panel'),
        },
      ],
    },
  ];

  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#050505] via-[#050505] to-[#0C0F13] p-6 text-white shadow-[0_20px_80px_-40px_rgba(0,0,0,0.9)] md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-2xl bg-[#1D9BF0]/10 text-[#1D9BF0] flex items-center justify-center">
            <GoogleSheetsIcon className="h-7 w-7" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-gray-500">Google workspace</p>
            <h3 className="text-2xl font-semibold leading-tight">Unified settings console</h3>
            <p className="mt-1 text-sm text-gray-400">
              Authenticate once, then orchestrate Calendar, Sheets, Docs, and Gmail automations from one surface.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={hydrateStatus}
          loading={statusLoading}
          className="self-start rounded-full border border-white/10 px-5 py-2 text-sm text-white hover:bg-white/5 lg:self-auto"
        >
          Refresh status
        </Button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statusCards.map(card => (
          <div key={card.id} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-black/30 p-2 text-white">{card.icon}</div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">{card.label}</p>
                  <p className="text-lg font-semibold">{card.headline}</p>
                </div>
              </div>
              {card.badgeLabel && card.badgeTone && (
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs ${badgeToneClasses[card.badgeTone]}`}>
                  {card.badgeLabel}
                </span>
              )}
            </div>
            {card.description && <p className="mt-3 text-sm text-gray-400">{card.description}</p>}
            {card.details && (
              <ul className="mt-3 space-y-1 text-sm text-gray-400">
                {card.details.map((detail, index) => (
                  <li key={`${card.id}-detail-${index}`}>{detail}</li>
                ))}
              </ul>
            )}
            {card.meta && <p className="mt-2 text-xs text-gray-500">{card.meta}</p>}
            {card.note && <p className="mt-3 text-xs text-amber-200">{card.note}</p>}
            {card.actions && card.actions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {card.actions.map(action => (
                  <Button
                    key={`${card.id}-${action.label}`}
                    variant="ghost"
                    size="xs"
                    className="rounded-full border border-white/10 px-3 py-1 text-xs text-white hover:bg-white/5"
                    onClick={action.onClick}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section id="calendar-settings-panel" className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Calendar sync</p>
            <h4 className="text-xl font-semibold">Production calendar</h4>
            <p className="text-sm text-gray-400">
              Pick an ingest calendar, timezone, and enable push so schedules flow both directions.
            </p>
          </div>
          <CalendarSettingsPanel userId={userId} addToast={addToast} />
        </section>

        <section id="sheets-settings-panel" className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Sheets + backups</p>
            <h4 className="text-xl font-semibold">Imports, exports & archival</h4>
            <p className="text-sm text-gray-400">
              Import curated datasets, export the live warehouse, or schedule automatic backups.
            </p>
          </div>
          <GoogleSheetsPanel addToast={addToast} />
        </section>
      </div>

      <section id="gmail-integration-card" className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-black/30 p-3 text-white">
              <GmailIcon className="h-6 w-6 text-[#EA4335]" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Docs & Gmail</p>
              <h4 className="text-xl font-semibold">
                {gmailConnection.isConnected ? 'Workspace mail linked' : 'Mail not linked'}
              </h4>
              <p className="mt-1 text-sm text-gray-400">
                {docsStatus.hasCompanyProfile
                  ? 'Company profile synced with Docs templates and branded exports.'
                  : 'Complete your company profile to unlock branded Docs templates.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full border border-white/10 px-4 py-2 text-xs text-white hover:bg-white/5"
              onClick={() => scrollToElement('document-templates-panel')}
            >
              Doc templates
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full border border-white/10 px-4 py-2 text-xs text-white hover:bg-white/5"
              onClick={() => scrollToElement('gmail-integration-card')}
            >
              Gmail preferences
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Connected inbox</p>
            <p className="mt-1 text-lg font-semibold">
              {gmailConnection.isConnected ? gmailConnection.email : 'Not connected'}
            </p>
            <p className="text-xs text-gray-500">Replies route through Gmail threads automatically.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Last doc export</p>
            <p className="mt-1 text-lg font-semibold">{formatRelativeTime(docsStatus.lastDocUpdate)}</p>
            <p className="text-xs text-gray-500">Templates stored in Supabase</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default GoogleDataPanel;
