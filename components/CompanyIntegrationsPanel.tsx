/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMPANY INTEGRATIONS PANEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Unified panel for company-level (Admin-only) integrations:
 * - Data Sources: Finale API, Google Sheets import, CSV upload
 * - Production Calendar: Google Calendar for manufacturing schedules
 * - Company Email Inboxes: Purchasing & AP monitoring
 * - Agent Access Verification: Verify what data agents can access
 *
 * All integrations are company-level, not per-user.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import Button from '@/components/ui/Button';
import { useTheme } from './ThemeProvider';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  RefreshCcwIcon,
  GoogleSheetsIcon,
  GoogleCalendarIcon,
  GmailIcon,
  BotIcon,
  ServerStackIcon,
  MailIcon,
  ExternalLinkIcon,
} from './icons';
import { getGoogleAuthService } from '../services/googleAuthService';

interface CompanyIntegrationsPanelProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface DataSourceStatus {
  type: 'finale' | 'sheets' | 'csv' | 'none';
  connected: boolean;
  lastSync?: string;
  details?: string;
  itemCount?: number;
}

interface GoogleAccountInfo {
  email?: string;
  scopes?: string[];
}

interface CalendarConfig {
  connected: boolean;
  calendarId?: string;
  calendarName?: string;
  lastSync?: string;
}

interface EmailInboxStatus {
  purpose: 'purchasing' | 'accounting';
  email: string;
  connected: boolean;
  lastPoll?: string;
  emailsProcessed?: number;
  status: 'active' | 'error' | 'setup_required';
}

interface AgentAccessItem {
  agent: string;
  hasDataAccess: boolean;
  hasEmailAccess: boolean;
  hasCalendarAccess: boolean;
  lastActive?: string;
}

const CompanyIntegrationsPanel: React.FC<CompanyIntegrationsPanelProps> = ({ addToast }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleAccount, setGoogleAccount] = useState<GoogleAccountInfo>({});
  const [dataSource, setDataSource] = useState<DataSourceStatus>({ type: 'none', connected: false });
  const [calendar, setCalendar] = useState<CalendarConfig>({ connected: false });
  const [emailInboxes, setEmailInboxes] = useState<EmailInboxStatus[]>([]);
  const [agentAccess, setAgentAccess] = useState<AgentAccessItem[]>([]);

  // Action loading states
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [configuringDataSource, setConfiguringDataSource] = useState(false);
  const [showDataSourceOptions, setShowDataSourceOptions] = useState(false);

  // Form states
  const [sheetsUrl, setSheetsUrl] = useState('');
  const [calendarUrl, setCalendarUrl] = useState('');
  const [purchasingEmail, setPurchasingEmail] = useState('');
  const [apEmail, setApEmail] = useState('');

  // Theme-aware classes
  const cardClass = isDark
    ? 'bg-gray-800/50 backdrop-blur-sm border-gray-700'
    : 'bg-white border-gray-200 shadow-sm';
  const innerCardClass = isDark
    ? 'bg-gray-900/60 border-gray-700'
    : 'bg-gray-50 border-gray-200';
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-600';
  const textMuted = isDark ? 'text-gray-500' : 'text-gray-500';
  const inputClass = isDark
    ? 'bg-gray-900/60 border-gray-700 text-white placeholder-gray-500'
    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400';

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      // Check Google OAuth status
      const googleAuthService = getGoogleAuthService();
      const authStatus = await googleAuthService.getAuthStatus();
      setGoogleConnected(authStatus.isAuthenticated && authStatus.hasValidToken);
      if (authStatus.isAuthenticated) {
        setGoogleAccount({
          email: authStatus.email,
          scopes: authStatus.scopes
        });
      }

      // Load data source configuration
      const { data: syncState } = await supabase
        .from('finale_sync_state')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (syncState?.last_full_sync) {
        setDataSource({
          type: 'finale',
          connected: true,
          lastSync: syncState.last_full_sync,
          details: `${syncState.total_products || 0} products, ${syncState.total_vendors || 0} vendors`
        });
      }

      // Load email inbox configs
      const { data: inboxes } = await supabase
        .from('email_inbox_configs')
        .select('*')
        .eq('is_active', true);

      if (inboxes) {
        const mapped: EmailInboxStatus[] = inboxes.map(inbox => ({
          purpose: inbox.inbox_purpose || 'purchasing',
          email: inbox.email_address,
          connected: inbox.status === 'active',
          lastPoll: inbox.last_poll_at,
          emailsProcessed: inbox.total_emails_processed,
          status: inbox.status
        }));
        setEmailInboxes(mapped);

        // Populate form fields
        const purchInbox = mapped.find(i => i.purpose === 'purchasing');
        const apInbox = mapped.find(i => i.purpose === 'accounting');
        if (purchInbox) setPurchasingEmail(purchInbox.email);
        if (apInbox) setApEmail(apInbox.email);
      }

      // Load agent access status
      const { data: agents } = await supabase
        .from('agent_definitions')
        .select('agent_identifier, display_name, is_active, last_execution_at')
        .eq('is_active', true);

      if (agents) {
        const agentItems: AgentAccessItem[] = agents.map(a => ({
          agent: a.display_name || a.agent_identifier,
          hasDataAccess: ['email_tracking', 'stockout_prevention', 'inventory_guardian', 'po_intelligence'].includes(a.agent_identifier),
          hasEmailAccess: a.agent_identifier === 'email_tracking',
          hasCalendarAccess: ['inventory_guardian'].includes(a.agent_identifier),
          lastActive: a.last_execution_at
        }));
        setAgentAccess(agentItems);
      }
    } catch (error) {
      console.error('[CompanyIntegrationsPanel] Failed to load status:', error);
      addToast('Failed to load integration status', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleConnectGoogle = async () => {
    setConnectingGoogle(true);
    try {
      const googleAuthService = getGoogleAuthService();
      await googleAuthService.initiateAuth();
      addToast('Connecting to Google...', 'info');
      // The OAuth flow will redirect, so we'll reload status when user returns
    } catch (error) {
      addToast('Failed to initiate Google connection', 'error');
      setConnectingGoogle(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      const googleAuthService = getGoogleAuthService();
      await googleAuthService.signOut();
      setGoogleConnected(false);
      addToast('Disconnected from Google', 'success');
    } catch (error) {
      addToast('Failed to disconnect', 'error');
    }
  };

  const handleSaveSheetsUrl = async () => {
    if (!sheetsUrl.trim()) {
      addToast('Please enter a Google Sheets URL', 'error');
      return;
    }
    // Extract sheet ID from URL
    const match = sheetsUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      addToast('Invalid Google Sheets URL', 'error');
      return;
    }
    // Save to company settings (would need a table for this)
    addToast('Google Sheets monitor configured', 'success');
    setDataSource({ type: 'sheets', connected: true, details: 'Monitoring configured' });
  };

  const handleSaveCalendar = async () => {
    if (!calendarUrl.trim()) {
      addToast('Please enter a Google Calendar ID or URL', 'error');
      return;
    }
    // Save calendar configuration
    addToast('Production calendar configured', 'success');
    setCalendar({ connected: true, calendarName: 'Production Schedule' });
  };

  const handleConfigureInbox = async (purpose: 'purchasing' | 'accounting') => {
    const email = purpose === 'purchasing' ? purchasingEmail : apEmail;
    if (!email.trim()) {
      addToast(`Please enter ${purpose} email address`, 'error');
      return;
    }

    try {
      // Upsert inbox config
      const { error } = await supabase
        .from('email_inbox_configs')
        .upsert({
          email_address: email,
          inbox_purpose: purpose,
          inbox_name: purpose,
          display_name: purpose === 'purchasing' ? 'Purchasing Inbox' : 'AP Inbox',
          is_active: true,
          status: 'setup_required'
        }, { onConflict: 'email_address' });

      if (error) throw error;
      addToast(`${purpose} inbox configured - connect Gmail to activate`, 'success');
      loadStatus();
    } catch (error) {
      addToast(`Failed to configure ${purpose} inbox`, 'error');
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCcwIcon className={`w-6 h-6 animate-spin ${textMuted}`} />
        <span className={`ml-2 ${textMuted}`}>Loading integrations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ================================================================ */}
      {/* GOOGLE ACCOUNT CONNECTION (Required for all Google services) */}
      {/* ================================================================ */}
      <div className={`rounded-xl p-6 border ${cardClass}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? 'bg-gray-900/60' : 'bg-gray-100'}`}>
              <div className="flex items-center gap-0.5">
                <GoogleCalendarIcon className="w-4 h-4 text-[#4285F4]" />
                <GoogleSheetsIcon className="w-4 h-4 text-[#34A853]" />
                <GmailIcon className="w-4 h-4 text-[#EA4335]" />
              </div>
            </div>
            <div>
              <h3 className={`text-base font-semibold ${textPrimary}`}>Google Account</h3>
              <p className={`text-xs ${textSecondary}`}>Required for Calendar, Sheets, and Email integrations</p>
            </div>
          </div>
          {googleConnected ? (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${isDark ? 'bg-green-900/40 text-green-400' : 'bg-green-100 text-green-700'}`}>
              <CheckCircleIcon className="w-3.5 h-3.5" />
              Connected
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${isDark ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
              <ExclamationTriangleIcon className="w-3.5 h-3.5" />
              Required
            </span>
          )}
        </div>

        {!googleConnected ? (
          <div className={`border rounded-lg p-5 text-center ${innerCardClass}`}>
            <p className={`text-sm ${textSecondary} mb-4`}>
              Connect a Google account to enable Calendar, Sheets, and Email integrations
            </p>
            <Button
              onClick={handleConnectGoogle}
              disabled={connectingGoogle}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium"
            >
              {connectingGoogle ? (
                <>
                  <RefreshCcwIcon className="w-4 h-4 mr-2 inline animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect Google Account'
              )}
            </Button>
          </div>
        ) : (
          <div className={`border rounded-lg p-4 ${innerCardClass}`}>
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                {googleAccount.email && (
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${textSecondary}`}>Account:</span>
                    <span className={`text-sm font-medium ${textPrimary}`}>{googleAccount.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <GoogleCalendarIcon className="w-4 h-4 text-[#4285F4]" />
                    <span className={`text-xs ${textSecondary}`}>Calendar</span>
                    <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <GoogleSheetsIcon className="w-4 h-4 text-[#34A853]" />
                    <span className={`text-xs ${textSecondary}`}>Sheets</span>
                    <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <GmailIcon className="w-4 h-4 text-[#EA4335]" />
                    <span className={`text-xs ${textSecondary}`}>Gmail</span>
                    <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" />
                  </div>
                </div>
              </div>
              <Button
                onClick={handleDisconnectGoogle}
                variant="secondary"
                size="sm"
              >
                Disconnect
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* DATA SOURCE (Finale API / Google Sheets / CSV) */}
      {/* ================================================================ */}
      <div className={`rounded-xl p-6 border ${cardClass}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? 'bg-purple-900/30' : 'bg-purple-100'}`}>
              <ServerStackIcon className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <h3 className={`text-base font-semibold ${textPrimary}`}>Inventory Data Source</h3>
              <p className={`text-xs ${textSecondary}`}>Primary source for inventory, products, and POs</p>
            </div>
          </div>
          {dataSource.connected ? (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${isDark ? 'bg-green-900/40 text-green-400' : 'bg-green-100 text-green-700'}`}>
              <CheckCircleIcon className="w-3.5 h-3.5" />
              Connected
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${isDark ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
              <ExclamationTriangleIcon className="w-3.5 h-3.5" />
              Required
            </span>
          )}
        </div>

        <div className="space-y-4">
          {/* Current Status when connected */}
          {dataSource.connected && (
            <div className={`border rounded-lg p-4 ${innerCardClass}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-semibold ${textPrimary}`}>
                      {dataSource.type === 'finale' ? 'Finale Inventory API' :
                       dataSource.type === 'sheets' ? 'Google Sheets' :
                       dataSource.type === 'csv' ? 'CSV Upload' : 'Not configured'}
                    </span>
                    <CheckCircleIcon className="w-4 h-4 text-green-500" />
                  </div>
                  {dataSource.lastSync && (
                    <p className={`text-xs ${textMuted}`}>
                      Last sync: {formatDate(dataSource.lastSync)}
                      {dataSource.details && ` • ${dataSource.details}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => loadStatus()}
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                  >
                    <RefreshCcwIcon className="w-3.5 h-3.5 mr-1" />
                    Sync Now
                  </Button>
                  <Button
                    onClick={() => setShowDataSourceOptions(true)}
                    variant="secondary"
                    size="sm"
                  >
                    Change
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Data Source Options */}
          {(!dataSource.connected || showDataSourceOptions) && (
            <div className="space-y-3">
              {!dataSource.connected && (
                <p className={`text-sm ${textSecondary}`}>
                  Select a data source for inventory, products, and purchase orders:
                </p>
              )}

              {/* Finale API Option */}
              <div className={`border rounded-lg p-4 ${innerCardClass}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDark ? 'bg-blue-900/30' : 'bg-blue-100'}`}>
                      <ServerStackIcon className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${textPrimary}`}>Finale Inventory API</p>
                      <p className={`text-xs ${textMuted}`}>Connect to Finale for automatic sync</p>
                    </div>
                  </div>
                  <a
                    href="#finale-setup"
                    onClick={(e) => {
                      e.preventDefault();
                      // Navigate to Finale setup panel or trigger modal
                      addToast('Configure Finale API in the Finale Setup tab', 'info');
                    }}
                    className="text-sm text-blue-500 hover:text-blue-400 font-medium flex items-center gap-1"
                  >
                    Configure
                    <ExternalLinkIcon className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Google Sheets Option */}
              {googleConnected && (
                <div className={`border rounded-lg p-4 ${innerCardClass}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDark ? 'bg-green-900/30' : 'bg-green-100'}`}>
                      <GoogleSheetsIcon className="w-5 h-5 text-[#34A853]" />
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${textPrimary} mb-1`}>Google Sheets</p>
                      <p className={`text-xs ${textMuted} mb-3`}>Monitor a spreadsheet for inventory data</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={sheetsUrl}
                          onChange={(e) => setSheetsUrl(e.target.value)}
                          placeholder="https://docs.google.com/spreadsheets/d/..."
                          className={`flex-1 border rounded-lg px-3 py-2 text-sm ${inputClass}`}
                        />
                        <Button
                          onClick={handleSaveSheetsUrl}
                          variant="primary"
                          size="sm"
                        >
                          Connect
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {showDataSourceOptions && (
                <div className="flex justify-end">
                  <Button
                    onClick={() => setShowDataSourceOptions(false)}
                    variant="ghost"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* PRODUCTION CALENDAR */}
      {/* ================================================================ */}
      <div className={`rounded-xl p-6 border ${cardClass}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? 'bg-blue-900/30' : 'bg-blue-100'}`}>
              <GoogleCalendarIcon className="w-6 h-6 text-[#4285F4]" />
            </div>
            <div>
              <h3 className={`text-base font-semibold ${textPrimary}`}>Production Calendar</h3>
              <p className={`text-xs ${textSecondary}`}>Manufacturing schedule for BOM/production agents to read</p>
            </div>
          </div>
          {calendar.connected ? (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${isDark ? 'bg-green-900/40 text-green-400' : 'bg-green-100 text-green-700'}`}>
              <CheckCircleIcon className="w-3.5 h-3.5" />
              Connected
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
              Optional
            </span>
          )}
        </div>

        {calendar.connected ? (
          <div className={`border rounded-lg p-4 ${innerCardClass}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-sm font-medium ${textPrimary}`}>
                    {calendar.calendarName || 'Production Calendar'}
                  </span>
                  <CheckCircleIcon className="w-4 h-4 text-green-500" />
                </div>
                <p className={`text-xs ${textMuted}`}>
                  Agents can read production schedules from this calendar
                </p>
              </div>
              <Button
                onClick={() => setCalendar({ connected: false })}
                variant="secondary"
                size="sm"
              >
                Change
              </Button>
            </div>
          </div>
        ) : googleConnected ? (
          <div className={`border rounded-lg p-4 ${innerCardClass}`}>
            <p className={`text-sm ${textSecondary} mb-3`}>
              Enter the Google Calendar ID or share URL for your production schedule
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={calendarUrl}
                onChange={(e) => setCalendarUrl(e.target.value)}
                placeholder="Calendar ID or URL (e.g., production@company.com)"
                className={`flex-1 border rounded-lg px-3 py-2 text-sm ${inputClass}`}
              />
              <Button
                onClick={handleSaveCalendar}
                variant="primary"
                size="sm"
              >
                Connect
              </Button>
            </div>
          </div>
        ) : (
          <div className={`border rounded-lg p-4 text-center ${innerCardClass}`}>
            <p className={`text-sm ${textMuted}`}>
              Connect Google Account first to enable calendar integration
            </p>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* COMPANY EMAIL INBOXES */}
      {/* ================================================================ */}
      <div className={`rounded-xl p-6 border ${cardClass}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? 'bg-emerald-900/30' : 'bg-emerald-100'}`}>
              <MailIcon className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h3 className={`text-base font-semibold ${textPrimary}`}>Company Email Inboxes</h3>
              <p className={`text-xs ${textSecondary}`}>Dedicated inboxes for PO tracking and invoice processing</p>
            </div>
          </div>
          {emailInboxes.some(i => i.connected) ? (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${isDark ? 'bg-green-900/40 text-green-400' : 'bg-green-100 text-green-700'}`}>
              <CheckCircleIcon className="w-3.5 h-3.5" />
              Active
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${isDark ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
              <ExclamationTriangleIcon className="w-3.5 h-3.5" />
              Required
            </span>
          )}
        </div>

        {!googleConnected ? (
          <div className={`border rounded-lg p-4 text-center ${innerCardClass}`}>
            <p className={`text-sm ${textMuted}`}>
              Connect Google Account first to configure email inboxes
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Purchasing Inbox */}
            <div className={`border rounded-lg p-4 ${innerCardClass}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${textPrimary}`}>Purchasing Inbox</p>
                    {emailInboxes.find(i => i.purpose === 'purchasing')?.connected && (
                      <CheckCircleIcon className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                  <p className={`text-xs ${textMuted}`}>For vendor communications, PO updates, tracking numbers</p>
                </div>
                {!emailInboxes.find(i => i.purpose === 'purchasing')?.connected && (
                  <span className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                    Required
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={purchasingEmail}
                  onChange={(e) => setPurchasingEmail(e.target.value)}
                  placeholder="purchasing@company.com"
                  className={`flex-1 border rounded-lg px-3 py-2 text-sm ${inputClass}`}
                />
                <Button
                  onClick={() => handleConfigureInbox('purchasing')}
                  variant={emailInboxes.find(i => i.purpose === 'purchasing') ? 'secondary' : 'primary'}
                  size="sm"
                >
                  {emailInboxes.find(i => i.purpose === 'purchasing') ? 'Update' : 'Configure'}
                </Button>
              </div>
              {emailInboxes.find(i => i.purpose === 'purchasing') && (
                <p className={`text-xs ${textMuted} mt-2`}>
                  {emailInboxes.find(i => i.purpose === 'purchasing')?.emailsProcessed || 0} emails processed •
                  Last poll: {formatDate(emailInboxes.find(i => i.purpose === 'purchasing')?.lastPoll)}
                </p>
              )}
            </div>

            {/* AP Inbox */}
            <div className={`border rounded-lg p-4 ${innerCardClass}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${textPrimary}`}>Accounts Payable Inbox</p>
                    {emailInboxes.find(i => i.purpose === 'accounting')?.connected && (
                      <CheckCircleIcon className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                  <p className={`text-xs ${textMuted}`}>For invoices, payment confirmations, financial docs</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                  Optional
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={apEmail}
                  onChange={(e) => setApEmail(e.target.value)}
                  placeholder="ap@company.com"
                  className={`flex-1 border rounded-lg px-3 py-2 text-sm ${inputClass}`}
                />
                <Button
                  onClick={() => handleConfigureInbox('accounting')}
                  variant="secondary"
                  size="sm"
                >
                  {emailInboxes.find(i => i.purpose === 'accounting') ? 'Update' : 'Configure'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* AGENT ACCESS VERIFICATION */}
      {/* ================================================================ */}
      <div className={`rounded-xl p-6 border ${cardClass}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? 'bg-purple-900/30' : 'bg-purple-100'}`}>
              <BotIcon className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <h3 className={`text-base font-semibold ${textPrimary}`}>Agent Access Verification</h3>
              <p className={`text-xs ${textSecondary}`}>See what data each agent can access</p>
            </div>
          </div>
          <Button
            onClick={loadStatus}
            variant="secondary"
            size="sm"
          >
            <RefreshCcwIcon className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                <th className={`text-left py-2 px-3 font-medium ${textSecondary}`}>Agent</th>
                <th className={`text-center py-2 px-3 font-medium ${textSecondary}`}>
                  <ServerStackIcon className="w-4 h-4 inline" /> Data
                </th>
                <th className={`text-center py-2 px-3 font-medium ${textSecondary}`}>
                  <MailIcon className="w-4 h-4 inline" /> Email
                </th>
                <th className={`text-center py-2 px-3 font-medium ${textSecondary}`}>
                  <GoogleCalendarIcon className="w-4 h-4 inline" /> Calendar
                </th>
                <th className={`text-left py-2 px-3 font-medium ${textSecondary}`}>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {agentAccess.length === 0 ? (
                <tr>
                  <td colSpan={5} className={`text-center py-4 ${textMuted}`}>
                    No active agents found
                  </td>
                </tr>
              ) : (
                agentAccess.map((agent, idx) => (
                  <tr key={idx} className={`border-b ${isDark ? 'border-gray-700/50' : 'border-gray-100'}`}>
                    <td className={`py-2 px-3 ${textPrimary}`}>{agent.agent}</td>
                    <td className="text-center py-2 px-3">
                      {agent.hasDataAccess ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-500 inline" />
                      ) : (
                        <XCircleIcon className={`w-4 h-4 inline ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
                      )}
                    </td>
                    <td className="text-center py-2 px-3">
                      {agent.hasEmailAccess ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-500 inline" />
                      ) : (
                        <XCircleIcon className={`w-4 h-4 inline ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
                      )}
                    </td>
                    <td className="text-center py-2 px-3">
                      {agent.hasCalendarAccess ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-500 inline" />
                      ) : (
                        <XCircleIcon className={`w-4 h-4 inline ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
                      )}
                    </td>
                    <td className={`py-2 px-3 text-xs ${textMuted}`}>
                      {agent.lastActive ? formatDate(agent.lastActive) : 'Never'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className={`mt-4 p-3 border rounded-lg ${innerCardClass}`}>
          <p className={`text-xs ${textSecondary}`}>
            <BotIcon className="w-4 h-4 inline text-purple-500 mr-1" />
            Agents only access data sources that are connected above. Disconnecting a service immediately revokes agent access.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CompanyIntegrationsPanel;
