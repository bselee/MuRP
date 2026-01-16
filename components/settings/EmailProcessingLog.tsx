/**
 * Email Processing Activity Log
 * Technical log showing email sync runs, processed messages, and errors
 * Admin-only visibility in Settings
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { useTheme } from '../ThemeProvider';
import { RefreshIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from '../icons';
import Button from '../ui/Button';
import { SettingsCard, SettingsTabs } from './ui';

interface EmailTrackingRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'error';
  inboxes_checked: number;
  emails_processed: number;
  pos_correlated: number;
  tracking_extracted: number;
  errors: string[] | null;
  run_duration_ms: number | null;
}

interface EmailThreadMessage {
  id: string;
  thread_id: string;
  gmail_message_id: string;
  direction: 'inbound' | 'outbound';
  sender_email: string;
  subject: string;
  body_preview: string;
  extracted_tracking_number: string | null;
  extracted_carrier: string | null;
  received_at: string;
  created_at: string;
}

interface InvoiceDocument {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  vendor_name_on_invoice: string | null;
  total_amount: number | null;
  status: string;
  source_inbox_purpose: string | null;
  po_match_confidence: number | null;
  has_variances: boolean;
  is_duplicate: boolean;
  created_at: string;
}

interface StatementDocument {
  id: string;
  vendor_name_on_statement: string | null;
  statement_date: string | null;
  closing_balance: number | null;
  status: string;
  created_at: string;
}

interface ProcessingLogProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const EmailProcessingLog: React.FC<ProcessingLogProps> = ({ addToast }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [runs, setRuns] = useState<EmailTrackingRun[]>([]);
  const [recentMessages, setRecentMessages] = useState<EmailThreadMessage[]>([]);
  const [invoices, setInvoices] = useState<InvoiceDocument[]>([]);
  const [statements, setStatements] = useState<StatementDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'runs' | 'messages' | 'invoices' | 'errors'>('runs');

  const headerClass = "text-xs font-mono text-gray-500 uppercase";
  const rowClass = isDark
    ? "text-sm font-mono text-gray-300"
    : "text-sm font-mono text-gray-700";

  const errorClass = isDark
    ? "text-sm font-mono text-red-400"
    : "text-sm font-mono text-red-600";

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load recent sync runs
      const { data: runsData, error: runsError } = await supabase
        .from('email_tracking_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);

      if (runsError) {
        console.error('[EmailProcessingLog] Failed to load runs:', runsError);
      } else {
        setRuns(runsData || []);
      }

      // Load recent messages
      const { data: messagesData, error: messagesError } = await supabase
        .from('email_thread_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (messagesError) {
        console.error('[EmailProcessingLog] Failed to load messages:', messagesError);
      } else {
        setRecentMessages(messagesData || []);
      }

      // Load invoices
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('vendor_invoice_documents')
        .select('id, invoice_number, invoice_date, vendor_name_on_invoice, total_amount, status, source_inbox_purpose, po_match_confidence, has_variances, is_duplicate, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (invoicesError) {
        console.error('[EmailProcessingLog] Failed to load invoices:', invoicesError);
      } else {
        setInvoices(invoicesData || []);
      }

      // Load statements
      const { data: statementsData, error: statementsError } = await supabase
        .from('vendor_statement_documents')
        .select('id, vendor_name_on_statement, statement_date, closing_balance, status, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (statementsError) {
        console.error('[EmailProcessingLog] Failed to load statements:', statementsError);
      } else {
        setStatements(statementsData || []);
      }
    } catch (err) {
      console.error('[EmailProcessingLog] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircleIcon className="w-4 h-4 text-red-500" />;
      case 'running':
        return <ClockIcon className="w-4 h-4 text-amber-500 animate-pulse" />;
      default:
        return <ClockIcon className="w-4 h-4 text-gray-500" />;
    }
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const errorRuns = runs.filter(r => r.status === 'error' || (r.errors && r.errors.length > 0));
  const varianceCount = invoices.filter(i => i.has_variances).length;

  const tabs = [
    { id: 'runs', label: 'Sync Runs', badge: runs.length },
    { id: 'messages', label: 'Messages', badge: recentMessages.length },
    { id: 'invoices', label: `Invoices${varianceCount > 0 ? ` (${varianceCount} var)` : ''}`, badge: invoices.length },
    { id: 'errors', label: 'Errors', badge: errorRuns.length },
  ];

  return (
    <div className="space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SettingsTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as 'runs' | 'messages' | 'invoices' | 'errors')}
        />
        <Button
          onClick={loadData}
          variant="ghost"
          size="sm"
          disabled={loading}
          className="flex items-center gap-1"
        >
          <RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Sync Runs Tab */}
      {activeTab === 'runs' && (
        <SettingsCard noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className={isDark ? "bg-gray-800/50" : "bg-gray-100"}>
                <tr>
                  <th className={`px-3 py-2 ${headerClass}`}>Status</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Started</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Duration</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Inboxes</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Emails</th>
                  <th className={`px-3 py-2 ${headerClass}`}>POs</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Tracking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={`px-3 py-4 text-center ${rowClass}`}>
                      No sync runs recorded yet
                    </td>
                  </tr>
                ) : (
                  runs.map((run) => (
                    <React.Fragment key={run.id}>
                      <tr
                        className={`cursor-pointer ${isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}`}
                        onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                      >
                        <td className={`px-3 py-2 ${rowClass}`}>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(run.status)}
                            <span className="capitalize">{run.status}</span>
                          </div>
                        </td>
                        <td className={`px-3 py-2 ${rowClass}`}>{formatTimestamp(run.started_at)}</td>
                        <td className={`px-3 py-2 ${rowClass}`}>{formatDuration(run.run_duration_ms)}</td>
                        <td className={`px-3 py-2 ${rowClass}`}>{run.inboxes_checked}</td>
                        <td className={`px-3 py-2 ${rowClass}`}>{run.emails_processed}</td>
                        <td className={`px-3 py-2 ${rowClass}`}>{run.pos_correlated}</td>
                        <td className={`px-3 py-2 ${rowClass}`}>{run.tracking_extracted}</td>
                      </tr>
                      {expandedRun === run.id && run.errors && run.errors.length > 0 && (
                        <tr>
                          <td colSpan={7} className={`px-3 py-2 ${isDark ? 'bg-red-900/20' : 'bg-red-50'}`}>
                            <div className={errorClass}>
                              <strong>Errors:</strong>
                              <ul className="list-disc list-inside mt-1">
                                {run.errors.map((err, i) => (
                                  <li key={i}>{err}</li>
                                ))}
                              </ul>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SettingsCard>
      )}

      {/* Messages Tab */}
      {activeTab === 'messages' && (
        <SettingsCard noPadding>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left">
              <thead className={`sticky top-0 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
                <tr>
                  <th className={`px-3 py-2 ${headerClass}`}>Time</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Dir</th>
                  <th className={`px-3 py-2 ${headerClass}`}>From</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Subject</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Tracking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {recentMessages.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={`px-3 py-4 text-center ${rowClass}`}>
                      No messages processed yet
                    </td>
                  </tr>
                ) : (
                  recentMessages.map((msg) => (
                    <tr key={msg.id} className={isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}>
                      <td className={`px-3 py-2 ${rowClass} whitespace-nowrap`}>
                        {formatTimestamp(msg.created_at)}
                      </td>
                      <td className={`px-3 py-2 ${rowClass}`}>
                        <span className={`px-1.5 py-0.5 text-xs rounded ${
                          msg.direction === 'inbound'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-green-500/20 text-green-400'
                        }`}>
                          {msg.direction === 'inbound' ? 'IN' : 'OUT'}
                        </span>
                      </td>
                      <td className={`px-3 py-2 ${rowClass} max-w-[200px] truncate`} title={msg.sender_email}>
                        {msg.sender_email}
                      </td>
                      <td className={`px-3 py-2 ${rowClass} max-w-[300px] truncate`} title={msg.subject}>
                        {msg.subject}
                      </td>
                      <td className={`px-3 py-2 ${rowClass}`}>
                        {msg.extracted_tracking_number ? (
                          <span className="text-purple-400" title={`${msg.extracted_carrier}: ${msg.extracted_tracking_number}`}>
                            {msg.extracted_carrier || 'TRACK'}: {msg.extracted_tracking_number.substring(0, 12)}...
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SettingsCard>
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <SettingsCard noPadding>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left">
              <thead className={`sticky top-0 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
                <tr>
                  <th className={`px-3 py-2 ${headerClass}`}>Time</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Invoice #</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Vendor</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Amount</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Source</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Status</th>
                  <th className={`px-3 py-2 ${headerClass}`}>PO Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={`px-3 py-4 text-center ${rowClass}`}>
                      No invoices detected yet
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className={isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}>
                      <td className={`px-3 py-2 ${rowClass} whitespace-nowrap`}>
                        {formatTimestamp(inv.created_at)}
                      </td>
                      <td className={`px-3 py-2 ${rowClass}`}>
                        {inv.invoice_number || <span className="text-gray-500 italic">pending</span>}
                      </td>
                      <td className={`px-3 py-2 ${rowClass} max-w-[150px] truncate`} title={inv.vendor_name_on_invoice || ''}>
                        {inv.vendor_name_on_invoice || '-'}
                      </td>
                      <td className={`px-3 py-2 ${rowClass}`}>
                        {inv.total_amount ? `$${inv.total_amount.toLocaleString()}` : '-'}
                      </td>
                      <td className={`px-3 py-2 ${rowClass}`}>
                        <span className={`px-1.5 py-0.5 text-xs rounded ${
                          inv.source_inbox_purpose === 'accounting'
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {inv.source_inbox_purpose === 'accounting' ? 'AP' : 'PUR'}
                        </span>
                      </td>
                      <td className={`px-3 py-2 ${rowClass}`}>
                        <span className={`px-1.5 py-0.5 text-xs rounded ${
                          inv.is_duplicate
                            ? 'bg-gray-500/20 text-gray-400'
                            : inv.has_variances
                              ? 'bg-amber-500/20 text-amber-400'
                              : inv.status === 'pending_extraction'
                                ? 'bg-blue-500/20 text-blue-400'
                                : inv.status === 'pending_review'
                                  ? 'bg-yellow-500/20 text-yellow-400'
                                  : inv.status === 'approved'
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {inv.is_duplicate ? 'DUPE' : inv.has_variances ? 'VARIANCE' : inv.status.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className={`px-3 py-2 ${rowClass}`}>
                        {inv.po_match_confidence ? (
                          <span className={inv.po_match_confidence >= 0.8 ? 'text-green-400' : 'text-yellow-400'}>
                            {Math.round(inv.po_match_confidence * 100)}%
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Statements summary */}
          {statements.length > 0 && (
            <div className={`p-3 border-t ${isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-center gap-2 text-sm">
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>
                  📊 {statements.length} statement(s) detected (deferred for separate processing)
                </span>
              </div>
            </div>
          )}
        </SettingsCard>
      )}

      {/* Errors Tab */}
      {activeTab === 'errors' && (
        <SettingsCard>
          {errorRuns.length === 0 ? (
            <p className={rowClass}>No errors recorded</p>
          ) : (
            <div className="space-y-3">
              {errorRuns.map((run) => (
                <div
                  key={run.id}
                  className={`p-3 rounded ${isDark ? 'bg-red-900/20 border border-red-800' : 'bg-red-50 border border-red-200'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <XCircleIcon className="w-4 h-4 text-red-500" />
                    <span className={`${rowClass} font-semibold`}>{formatTimestamp(run.started_at)}</span>
                    <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                      (Run ID: {run.id.substring(0, 8)})
                    </span>
                  </div>
                  {run.errors && run.errors.length > 0 && (
                    <ul className={`${errorClass} list-disc list-inside`}>
                      {run.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </SettingsCard>
      )}

      {/* Summary stats */}
      <SettingsCard>
        <div className="grid grid-cols-6 gap-4 text-center">
          <div>
            <div className={headerClass}>Total Runs</div>
            <div className={`text-lg font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>{runs.length}</div>
          </div>
          <div>
            <div className={headerClass}>Emails</div>
            <div className={`text-lg font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {runs.reduce((sum, r) => sum + (r.emails_processed || 0), 0)}
            </div>
          </div>
          <div>
            <div className={headerClass}>POs Matched</div>
            <div className={`text-lg font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {runs.reduce((sum, r) => sum + (r.pos_correlated || 0), 0)}
            </div>
          </div>
          <div>
            <div className={headerClass}>Tracking</div>
            <div className={`text-lg font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {runs.reduce((sum, r) => sum + (r.tracking_extracted || 0), 0)}
            </div>
          </div>
          <div>
            <div className={headerClass}>Invoices</div>
            <div className={`text-lg font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {invoices.filter(i => !i.is_duplicate).length}
              {invoices.filter(i => i.has_variances).length > 0 && (
                <span className="text-xs text-amber-400 ml-1">
                  ({invoices.filter(i => i.has_variances).length} var)
                </span>
              )}
            </div>
          </div>
          <div>
            <div className={headerClass}>Statements</div>
            <div className={`text-lg font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {statements.length}
              <span className="text-xs ml-1">(defer)</span>
            </div>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
};

export default EmailProcessingLog;
