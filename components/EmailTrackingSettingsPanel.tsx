/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EMAIL TRACKING SETTINGS PANEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Configuration panel for dedicated email inbox monitoring.
 * Manages inbox configurations, OAuth credentials, vendor domain mappings,
 * and Email Tracking Agent status.
 *
 * Part of: Email Tracking Agent Expansion - Phase 2
 * Goal: NEVER BE OUT OF STOCK
 */

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import Button from '@/components/ui/Button';
import {
  MailIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusCircleIcon,
  TrashIcon,
  RefreshCcwIcon,
  BotIcon,
  LinkIcon,
  ShieldCheckIcon,
  ClockIcon,
  ChartBarIcon,
} from './icons';

interface EmailTrackingSettingsPanelProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface InboxConfig {
  id: string;
  inbox_name: string;
  email_address: string;
  display_name: string | null;
  description: string | null;
  gmail_user: string;
  poll_enabled: boolean;
  poll_interval_minutes: number;
  last_poll_at: string | null;
  is_active: boolean;
  ai_parsing_enabled: boolean;
  max_daily_ai_cost_usd: number;
  ai_confidence_threshold: number;
  keyword_filters: string[];
  total_emails_processed: number;
  total_pos_correlated: number;
  correlation_success_rate: number | null;
  status: 'active' | 'paused' | 'error' | 'setup_required';
  last_error: string | null;
  daily_ai_cost_usd: number;
  created_at: string;
}

interface VendorDomain {
  id: string;
  domain: string;
  vendor_id: string;
  vendor_name?: string;
  confidence: number;
  match_count: number;
  source: 'auto' | 'manual' | 'vendor_record';
  last_matched_at: string;
}

interface AgentStats {
  agent_identifier: string;
  display_name: string;
  is_active: boolean;
  trust_score: number;
  emails_processed: number;
  emails_correlated: number;
  tracking_extractions: number;
  alerts_generated: number;
  correlation_rate: number;
  active_inboxes: number;
  open_threads: number;
  open_alerts: number;
  critical_alerts: number;
  last_successful_run: string | null;
}

interface RecentRun {
  id: string;
  run_type: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  emails_fetched: number;
  emails_processed: number;
  pos_correlated: number;
  tracking_numbers_found: number;
  duration_ms: number | null;
  error_message: string | null;
}

const EmailTrackingSettingsPanel: React.FC<EmailTrackingSettingsPanelProps> = ({ addToast }) => {
  // State
  const [inboxes, setInboxes] = useState<InboxConfig[]>([]);
  const [vendorDomains, setVendorDomains] = useState<VendorDomain[]>([]);
  const [agentStats, setAgentStats] = useState<AgentStats | null>(null);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'inboxes' | 'domains' | 'agent'>('inboxes');

  // New inbox form
  const [showNewInboxForm, setShowNewInboxForm] = useState(false);
  const [newInbox, setNewInbox] = useState({
    inbox_name: '',
    email_address: '',
    display_name: '',
    description: '',
  });
  const [creatingInbox, setCreatingInbox] = useState(false);

  // Edit inbox
  const [editingInboxId, setEditingInboxId] = useState<string | null>(null);
  const [savingInbox, setSavingInbox] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════════
  // Data Loading
  // ═══════════════════════════════════════════════════════════════════════════

  const loadInboxes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('email_inbox_configs')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setInboxes(data || []);
    } catch (error) {
      console.error('[EmailTrackingSettingsPanel] Failed to load inboxes:', error);
      addToast?.('Failed to load inbox configurations', 'error');
    }
  }, [addToast]);

  const loadVendorDomains = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('vendor_email_domains')
        .select(`
          *,
          vendors (name)
        `)
        .order('match_count', { ascending: false })
        .limit(50);

      if (error) throw error;
      setVendorDomains(
        (data || []).map((d: any) => ({
          ...d,
          vendor_name: d.vendors?.name,
        }))
      );
    } catch (error) {
      console.error('[EmailTrackingSettingsPanel] Failed to load vendor domains:', error);
    }
  }, []);

  const loadAgentStats = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('email_tracking_agent_stats')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setAgentStats(data);
    } catch (error) {
      console.error('[EmailTrackingSettingsPanel] Failed to load agent stats:', error);
    }
  }, []);

  const loadRecentRuns = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('email_tracking_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRecentRuns(data || []);
    } catch (error) {
      console.error('[EmailTrackingSettingsPanel] Failed to load recent runs:', error);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadInboxes(), loadVendorDomains(), loadAgentStats(), loadRecentRuns()]);
    setLoading(false);
  }, [loadInboxes, loadVendorDomains, loadAgentStats, loadRecentRuns]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Inbox Management
  // ═══════════════════════════════════════════════════════════════════════════

  const handleCreateInbox = async () => {
    if (!newInbox.inbox_name.trim() || !newInbox.email_address.trim()) {
      addToast?.('Inbox name and email address are required', 'error');
      return;
    }

    setCreatingInbox(true);
    try {
      const { error } = await supabase.from('email_inbox_configs').insert({
        inbox_name: newInbox.inbox_name.trim(),
        email_address: newInbox.email_address.trim(),
        display_name: newInbox.display_name.trim() || null,
        description: newInbox.description.trim() || null,
        status: 'setup_required',
        is_active: false,
      });

      if (error) throw error;

      setNewInbox({ inbox_name: '', email_address: '', display_name: '', description: '' });
      setShowNewInboxForm(false);
      addToast?.('Inbox created. Configure OAuth credentials to activate.', 'success');
      await loadInboxes();
    } catch (error: any) {
      console.error('[EmailTrackingSettingsPanel] Failed to create inbox:', error);
      if (error.code === '23505') {
        addToast?.('An inbox with this email address already exists', 'error');
      } else {
        addToast?.('Failed to create inbox', 'error');
      }
    } finally {
      setCreatingInbox(false);
    }
  };

  const handleUpdateInbox = async (inbox: InboxConfig) => {
    setSavingInbox(true);
    try {
      const { error } = await supabase
        .from('email_inbox_configs')
        .update({
          inbox_name: inbox.inbox_name,
          display_name: inbox.display_name,
          description: inbox.description,
          is_active: inbox.is_active,
          poll_enabled: inbox.poll_enabled,
          poll_interval_minutes: inbox.poll_interval_minutes,
          ai_parsing_enabled: inbox.ai_parsing_enabled,
          max_daily_ai_cost_usd: inbox.max_daily_ai_cost_usd,
          ai_confidence_threshold: inbox.ai_confidence_threshold,
          keyword_filters: inbox.keyword_filters,
        })
        .eq('id', inbox.id);

      if (error) throw error;

      setEditingInboxId(null);
      addToast?.('Inbox settings saved', 'success');
      await loadInboxes();
    } catch (error) {
      console.error('[EmailTrackingSettingsPanel] Failed to update inbox:', error);
      addToast?.('Failed to save inbox settings', 'error');
    } finally {
      setSavingInbox(false);
    }
  };

  const handleDeleteInbox = async (id: string) => {
    if (!confirm('Are you sure you want to delete this inbox configuration?')) return;

    try {
      const { error } = await supabase.from('email_inbox_configs').delete().eq('id', id);
      if (error) throw error;
      addToast?.('Inbox deleted', 'success');
      await loadInboxes();
    } catch (error) {
      console.error('[EmailTrackingSettingsPanel] Failed to delete inbox:', error);
      addToast?.('Failed to delete inbox', 'error');
    }
  };

  const handleToggleInboxActive = async (inbox: InboxConfig) => {
    if (inbox.status === 'setup_required') {
      addToast?.('Configure OAuth credentials before activating', 'error');
      return;
    }

    try {
      const { error } = await supabase
        .from('email_inbox_configs')
        .update({ is_active: !inbox.is_active })
        .eq('id', inbox.id);

      if (error) throw error;
      addToast?.(`Inbox ${!inbox.is_active ? 'activated' : 'paused'}`, 'success');
      await loadInboxes();
    } catch (error) {
      console.error('[EmailTrackingSettingsPanel] Failed to toggle inbox:', error);
      addToast?.('Failed to update inbox', 'error');
    }
  };

  const handleDeleteDomain = async (id: string) => {
    if (!confirm('Remove this vendor domain mapping?')) return;

    try {
      const { error } = await supabase.from('vendor_email_domains').delete().eq('id', id);
      if (error) throw error;
      addToast?.('Domain mapping removed', 'success');
      await loadVendorDomains();
    } catch (error) {
      console.error('[EmailTrackingSettingsPanel] Failed to delete domain:', error);
      addToast?.('Failed to remove domain', 'error');
    }
  };

  const handleTriggerPoll = async () => {
    try {
      addToast?.('Triggering inbox poll...', 'info');
      const { error } = await supabase.functions.invoke('email-inbox-poller');
      if (error) throw error;
      addToast?.('Inbox poll completed', 'success');
      await refreshAll();
    } catch (error) {
      console.error('[EmailTrackingSettingsPanel] Failed to trigger poll:', error);
      addToast?.('Failed to trigger poll', 'error');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Render Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircleIcon className="w-3 h-3" /> Active
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-300 border border-red-500/30">
            <ExclamationTriangleIcon className="w-3 h-3" /> Error
          </span>
        );
      case 'setup_required':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <ExclamationTriangleIcon className="w-3 h-3" /> Setup Required
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-500/20 text-gray-300 border border-gray-500/30">
            Paused
          </span>
        );
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTimeAgo = (date: string | null) => {
    if (!date) return 'Never';
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <MailIcon className="w-5 h-5 text-sky-400" />
            Email Tracking Agent
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Monitor dedicated email inboxes for vendor communications, tracking info, and ETA updates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleTriggerPoll}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-gray-600 text-gray-200 hover:bg-gray-700"
          >
            <RefreshCcwIcon className="w-4 h-4" />
            Poll Now
          </Button>
          <Button
            onClick={refreshAll}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-gray-600 text-gray-200 hover:bg-gray-700"
          >
            <RefreshCcwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Agent Stats Summary */}
      {agentStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Emails Processed</p>
            <p className="text-2xl font-bold text-white mt-1">{agentStats.emails_processed?.toLocaleString() || 0}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Correlation Rate</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{agentStats.correlation_rate?.toFixed(1) || 0}%</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Open Threads</p>
            <p className="text-2xl font-bold text-sky-400 mt-1">{agentStats.open_threads || 0}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Open Alerts</p>
            <p className={`text-2xl font-bold mt-1 ${agentStats.critical_alerts > 0 ? 'text-red-400' : 'text-amber-400'}`}>
              {agentStats.open_alerts || 0}
              {agentStats.critical_alerts > 0 && (
                <span className="text-sm ml-2 text-red-300">({agentStats.critical_alerts} critical)</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-700">
        <nav className="flex gap-4">
          {[
            { id: 'inboxes', label: 'Inboxes', icon: MailIcon },
            { id: 'domains', label: 'Vendor Domains', icon: LinkIcon },
            { id: 'agent', label: 'Agent Activity', icon: BotIcon },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-accent-500 text-accent-300'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Inboxes Tab */}
      {activeTab === 'inboxes' && (
        <div className="space-y-4">
          {/* New Inbox Form */}
          {showNewInboxForm ? (
            <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4 space-y-4">
              <h4 className="text-sm font-semibold text-white">Add New Inbox</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <input
                  type="text"
                  placeholder="Inbox name (e.g., purchasing)"
                  value={newInbox.inbox_name}
                  onChange={(e) => setNewInbox((prev) => ({ ...prev, inbox_name: e.target.value }))}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                />
                <input
                  type="email"
                  placeholder="Email address (e.g., po@company.com)"
                  value={newInbox.email_address}
                  onChange={(e) => setNewInbox((prev) => ({ ...prev, email_address: e.target.value }))}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                />
                <input
                  type="text"
                  placeholder="Display name (optional)"
                  value={newInbox.display_name}
                  onChange={(e) => setNewInbox((prev) => ({ ...prev, display_name: e.target.value }))}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={newInbox.description}
                  onChange={(e) => setNewInbox((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setShowNewInboxForm(false)}
                  className="px-4 py-2 text-sm rounded-md border border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateInbox}
                  disabled={creatingInbox}
                  className="px-4 py-2 text-sm rounded-md bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-50"
                >
                  {creatingInbox ? 'Creating...' : 'Create Inbox'}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setShowNewInboxForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-dashed border-gray-600 text-gray-300 hover:bg-gray-800 w-full justify-center"
            >
              <PlusCircleIcon className="w-4 h-4" />
              Add Email Inbox
            </Button>
          )}

          {/* Inbox List */}
          {loading ? (
            <p className="text-sm text-gray-400">Loading inboxes...</p>
          ) : inboxes.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <MailIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No email inboxes configured</p>
              <p className="text-sm mt-1">Add an inbox to start monitoring vendor emails</p>
            </div>
          ) : (
            <div className="space-y-4">
              {inboxes.map((inbox) => (
                <div
                  key={inbox.id}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="text-base font-semibold text-white">{inbox.display_name || inbox.inbox_name}</h4>
                        {getStatusBadge(inbox.status)}
                        {inbox.is_active && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-sky-500/20 text-sky-300 border border-sky-500/30">
                            Monitoring
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-1">{inbox.email_address}</p>
                      {inbox.description && <p className="text-xs text-gray-500 mt-1">{inbox.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handleToggleInboxActive(inbox)}
                        className={`px-3 py-1.5 text-sm rounded-md ${
                          inbox.is_active
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                        }`}
                      >
                        {inbox.is_active ? 'Pause' : 'Activate'}
                      </Button>
                      <Button
                        onClick={() => setEditingInboxId(editingInboxId === inbox.id ? null : inbox.id)}
                        className="px-3 py-1.5 text-sm rounded-md border border-gray-600 text-gray-300 hover:bg-gray-700"
                      >
                        {editingInboxId === inbox.id ? 'Close' : 'Configure'}
                      </Button>
                      <Button
                        onClick={() => handleDeleteInbox(inbox.id)}
                        className="px-2 py-1.5 text-sm rounded-md text-red-400 hover:bg-red-500/20"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <ClockIcon className="w-3 h-3" />
                      Last poll: {formatTimeAgo(inbox.last_poll_at)}
                    </span>
                    <span>Emails: {inbox.total_emails_processed.toLocaleString()}</span>
                    <span>POs Correlated: {inbox.total_pos_correlated.toLocaleString()}</span>
                    {inbox.correlation_success_rate !== null && (
                      <span className="text-emerald-400">{inbox.correlation_success_rate.toFixed(1)}% correlation</span>
                    )}
                    <span>AI Cost Today: ${inbox.daily_ai_cost_usd.toFixed(2)}</span>
                  </div>

                  {inbox.last_error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3 text-xs text-red-300">
                      <strong>Error:</strong> {inbox.last_error}
                    </div>
                  )}

                  {/* Expanded Config */}
                  {editingInboxId === inbox.id && (
                    <div className="border-t border-gray-700 pt-4 mt-4 space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Inbox Name</label>
                          <input
                            type="text"
                            value={inbox.inbox_name}
                            onChange={(e) =>
                              setInboxes((prev) =>
                                prev.map((i) => (i.id === inbox.id ? { ...i, inbox_name: e.target.value } : i))
                              )
                            }
                            className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Poll Interval (minutes)</label>
                          <input
                            type="number"
                            min={1}
                            value={inbox.poll_interval_minutes}
                            onChange={(e) =>
                              setInboxes((prev) =>
                                prev.map((i) =>
                                  i.id === inbox.id ? { ...i, poll_interval_minutes: parseInt(e.target.value) || 5 } : i
                                )
                              )
                            }
                            className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Max Daily AI Cost ($)</label>
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={inbox.max_daily_ai_cost_usd}
                            onChange={(e) =>
                              setInboxes((prev) =>
                                prev.map((i) =>
                                  i.id === inbox.id ? { ...i, max_daily_ai_cost_usd: parseFloat(e.target.value) || 5 } : i
                                )
                              )
                            }
                            className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">AI Confidence Threshold</label>
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.05}
                            value={inbox.ai_confidence_threshold}
                            onChange={(e) =>
                              setInboxes((prev) =>
                                prev.map((i) =>
                                  i.id === inbox.id
                                    ? { ...i, ai_confidence_threshold: parseFloat(e.target.value) || 0.65 }
                                    : i
                                )
                              )
                            }
                            className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Keyword Filters (comma-separated)</label>
                        <input
                          type="text"
                          value={inbox.keyword_filters.join(', ')}
                          onChange={(e) =>
                            setInboxes((prev) =>
                              prev.map((i) =>
                                i.id === inbox.id
                                  ? {
                                      ...i,
                                      keyword_filters: e.target.value
                                        .split(',')
                                        .map((k) => k.trim())
                                        .filter(Boolean),
                                    }
                                  : i
                              )
                            )
                          }
                          placeholder="tracking, shipped, delivery, invoice, confirm"
                          className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-gray-300">
                          <input
                            type="checkbox"
                            checked={inbox.poll_enabled}
                            onChange={(e) =>
                              setInboxes((prev) =>
                                prev.map((i) => (i.id === inbox.id ? { ...i, poll_enabled: e.target.checked } : i))
                              )
                            }
                            className="rounded border-gray-600 bg-gray-800 text-accent-500"
                          />
                          Enable polling
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-300">
                          <input
                            type="checkbox"
                            checked={inbox.ai_parsing_enabled}
                            onChange={(e) =>
                              setInboxes((prev) =>
                                prev.map((i) => (i.id === inbox.id ? { ...i, ai_parsing_enabled: e.target.checked } : i))
                              )
                            }
                            className="rounded border-gray-600 bg-gray-800 text-accent-500"
                          />
                          Enable AI parsing
                        </label>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          onClick={() => handleUpdateInbox(inbox)}
                          disabled={savingInbox}
                          className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {savingInbox ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Vendor Domains Tab */}
      {activeTab === 'domains' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Learned mappings from email domains to vendors. These improve automatic PO correlation.
          </p>
          {vendorDomains.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <LinkIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No vendor domains learned yet</p>
              <p className="text-sm mt-1">Domains will appear here as emails are correlated to POs</p>
            </div>
          ) : (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-900/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Domain</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Vendor</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Confidence</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Matches</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Source</th>
                    <th className="text-right px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {vendorDomains.map((domain) => (
                    <tr key={domain.id} className="hover:bg-gray-800/30">
                      <td className="px-4 py-3 text-white font-mono">{domain.domain}</td>
                      <td className="px-4 py-3 text-gray-300">{domain.vendor_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`${
                            domain.confidence >= 0.9
                              ? 'text-emerald-400'
                              : domain.confidence >= 0.7
                                ? 'text-amber-400'
                                : 'text-gray-400'
                          }`}
                        >
                          {(domain.confidence * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">{domain.match_count}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            domain.source === 'auto'
                              ? 'bg-sky-500/20 text-sky-300'
                              : domain.source === 'manual'
                                ? 'bg-purple-500/20 text-purple-300'
                                : 'bg-gray-500/20 text-gray-300'
                          }`}
                        >
                          {domain.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          onClick={() => handleDeleteDomain(domain.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Agent Activity Tab */}
      {activeTab === 'agent' && (
        <div className="space-y-6">
          {/* Agent Info */}
          {agentStats && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BotIcon className="w-8 h-8 text-sky-400" />
                  <div>
                    <h4 className="text-base font-semibold text-white">{agentStats.display_name}</h4>
                    <p className="text-xs text-gray-400">Trust Score: {(agentStats.trust_score * 100).toFixed(0)}%</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs ${
                      agentStats.is_active
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                    }`}
                  >
                    {agentStats.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4 pt-4 border-t border-gray-700">
                <div>
                  <p className="text-xs text-gray-400">Emails Correlated</p>
                  <p className="text-lg font-semibold text-white">{agentStats.emails_correlated?.toLocaleString() || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Tracking Found</p>
                  <p className="text-lg font-semibold text-white">{agentStats.tracking_extractions?.toLocaleString() || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Alerts Generated</p>
                  <p className="text-lg font-semibold text-white">{agentStats.alerts_generated?.toLocaleString() || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Active Inboxes</p>
                  <p className="text-lg font-semibold text-white">{agentStats.active_inboxes || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Last Run</p>
                  <p className="text-sm font-semibold text-white">{formatTimeAgo(agentStats.last_successful_run)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Recent Runs */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <ChartBarIcon className="w-4 h-4" />
              Recent Activity
            </h4>
            {recentRuns.length === 0 ? (
              <p className="text-sm text-gray-400">No recent activity</p>
            ) : (
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Time</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Emails</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">POs</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Tracking</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {recentRuns.map((run) => (
                      <tr key={run.id} className="hover:bg-gray-800/30">
                        <td className="px-4 py-3 text-gray-300">{formatTimeAgo(run.started_at)}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-xs bg-gray-600/50 text-gray-300">
                            {run.run_type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${
                              run.status === 'completed'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : run.status === 'failed'
                                  ? 'bg-red-500/20 text-red-300'
                                  : run.status === 'running'
                                    ? 'bg-sky-500/20 text-sky-300'
                                    : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {run.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white">{run.emails_processed}</td>
                        <td className="px-4 py-3 text-emerald-400">{run.pos_correlated}</td>
                        <td className="px-4 py-3 text-sky-400">{run.tracking_numbers_found}</td>
                        <td className="px-4 py-3 text-gray-400">{formatDuration(run.duration_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg p-4 flex gap-3">
        <ShieldCheckIcon className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-sky-100">
          <p className="font-semibold">OAuth Setup Required</p>
          <p className="text-sky-200/80 mt-1">
            Each inbox needs Gmail API OAuth credentials. Set environment variables for{' '}
            <code className="text-xs bg-sky-900/50 px-1 rounded">GMAIL_WEBHOOK_CLIENT_ID</code>,{' '}
            <code className="text-xs bg-sky-900/50 px-1 rounded">GMAIL_WEBHOOK_CLIENT_SECRET</code>, and{' '}
            <code className="text-xs bg-sky-900/50 px-1 rounded">GMAIL_WEBHOOK_REFRESH_TOKEN</code>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EmailTrackingSettingsPanel;
