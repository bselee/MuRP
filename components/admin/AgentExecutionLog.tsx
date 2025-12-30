/**
 * Agent Execution Log
 * Technical log showing agent runs, outcomes, and performance history
 * Admin-only visibility in Agent Command Center
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { useTheme } from '../ThemeProvider';
import { RefreshIcon, CheckCircleIcon, XCircleIcon, ClockIcon, BotIcon, ZapIcon } from '../icons';
import Button from '../ui/Button';

interface AgentExecution {
  id: string;
  agent_id: string | null;
  agent_identifier: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  outcome: 'success' | 'partial' | 'failed' | 'cancelled' | null;
  user_feedback: 'approved' | 'corrected' | 'rejected' | 'pending' | null;
  actions_generated: number;
  actions_executed: number;
  actions_rejected: number;
  error_message: string | null;
  result_summary: Record<string, unknown> | null;
  trigger_source: string | null;
}

interface WorkflowExecution {
  id: string;
  workflow_id: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  steps_completed: number;
  steps_total: number;
  error_message: string | null;
  result_summary: Record<string, unknown> | null;
  trigger_type: string | null;
}

interface AgentExecutionLogProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const AgentExecutionLog: React.FC<AgentExecutionLogProps> = ({ addToast }) => {
  const { isDark } = useTheme();
  const [agentRuns, setAgentRuns] = useState<AgentExecution[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'agents' | 'workflows' | 'errors'>('agents');
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const cardClass = isDark
    ? "bg-gray-900/60 border border-gray-700 rounded-lg"
    : "bg-gray-50 border border-gray-200 rounded-lg";

  const headerClass = isDark
    ? "text-xs font-mono text-gray-500 uppercase"
    : "text-xs font-mono text-gray-500 uppercase";

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
      // Load agent execution logs
      const { data: agentData, error: agentError } = await supabase
        .from('agent_execution_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(100);

      if (agentError) {
        console.error('[AgentExecutionLog] Failed to load agent runs:', agentError);
      } else {
        setAgentRuns(agentData || []);
      }

      // Load workflow executions
      const { data: workflowData, error: workflowError } = await supabase
        .from('workflow_executions')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(100);

      if (workflowError) {
        console.error('[AgentExecutionLog] Failed to load workflow runs:', workflowError);
      } else {
        setWorkflowRuns(workflowData || []);
      }
    } catch (err) {
      console.error('[AgentExecutionLog] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getOutcomeIcon = (outcome: string | null) => {
    switch (outcome) {
      case 'success':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'failed':
      case 'cancelled':
        return <XCircleIcon className="w-4 h-4 text-red-500" />;
      case 'partial':
        return <ClockIcon className="w-4 h-4 text-amber-500" />;
      default:
        return <ClockIcon className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'running': return 'text-blue-400';
      case 'pending': return 'text-amber-400';
      default: return 'text-gray-400';
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
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  const formatAgentName = (identifier: string) => {
    return identifier
      .replace(/_/g, ' ')
      .replace(/-/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const errorAgentRuns = agentRuns.filter(r => r.outcome === 'failed' || r.error_message);
  const errorWorkflowRuns = workflowRuns.filter(r => r.status === 'failed' || r.error_message);
  const totalErrors = errorAgentRuns.length + errorWorkflowRuns.length;

  const tabClass = (tab: string) =>
    `px-3 py-1.5 text-xs font-medium rounded transition-colors ${
      activeTab === tab
        ? isDark
          ? 'bg-gray-700 text-white'
          : 'bg-gray-200 text-gray-900'
        : isDark
          ? 'text-gray-400 hover:text-white hover:bg-gray-800'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
    }`;

  return (
    <div className="space-y-4">
      {/* Header with tabs and refresh */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button className={tabClass('agents')} onClick={() => setActiveTab('agents')}>
            <span className="flex items-center gap-1">
              <BotIcon className="w-3 h-3" />
              Agent Runs ({agentRuns.length})
            </span>
          </button>
          <button className={tabClass('workflows')} onClick={() => setActiveTab('workflows')}>
            <span className="flex items-center gap-1">
              <ZapIcon className="w-3 h-3" />
              Workflows ({workflowRuns.length})
            </span>
          </button>
          <button className={tabClass('errors')} onClick={() => setActiveTab('errors')}>
            Errors ({totalErrors})
            {totalErrors > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
                {totalErrors}
              </span>
            )}
          </button>
        </div>
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

      {/* Agent Runs Tab */}
      {activeTab === 'agents' && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left">
              <thead className={`sticky top-0 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
                <tr>
                  <th className={`px-3 py-2 ${headerClass}`}>Status</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Agent</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Started</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Duration</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Trigger</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Actions</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Feedback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {agentRuns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={`px-3 py-4 text-center ${rowClass}`}>
                      No agent executions recorded yet
                    </td>
                  </tr>
                ) : (
                  agentRuns.map((run) => (
                    <React.Fragment key={run.id}>
                      <tr
                        className={`cursor-pointer ${isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}`}
                        onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                      >
                        <td className={`px-3 py-2 ${rowClass}`}>
                          <div className="flex items-center gap-2">
                            {getOutcomeIcon(run.outcome)}
                            <span className="capitalize">{run.outcome || 'pending'}</span>
                          </div>
                        </td>
                        <td className={`px-3 py-2 ${rowClass}`}>
                          {formatAgentName(run.agent_identifier)}
                        </td>
                        <td className={`px-3 py-2 ${rowClass} whitespace-nowrap`}>
                          {formatTimestamp(run.started_at)}
                        </td>
                        <td className={`px-3 py-2 ${rowClass}`}>
                          {formatDuration(run.duration_ms)}
                        </td>
                        <td className={`px-3 py-2 ${rowClass}`}>
                          <span className={`px-1.5 py-0.5 text-xs rounded ${
                            run.trigger_source === 'manual'
                              ? 'bg-blue-500/20 text-blue-400'
                              : run.trigger_source === 'schedule'
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {run.trigger_source || 'unknown'}
                          </span>
                        </td>
                        <td className={`px-3 py-2 ${rowClass}`}>
                          <span className="text-green-400">{run.actions_executed}</span>
                          <span className="text-gray-500">/</span>
                          <span className="text-gray-400">{run.actions_generated}</span>
                          {run.actions_rejected > 0 && (
                            <span className="text-red-400 ml-1">(-{run.actions_rejected})</span>
                          )}
                        </td>
                        <td className={`px-3 py-2 ${rowClass}`}>
                          {run.user_feedback && (
                            <span className={`px-1.5 py-0.5 text-xs rounded ${
                              run.user_feedback === 'approved'
                                ? 'bg-green-500/20 text-green-400'
                                : run.user_feedback === 'rejected'
                                  ? 'bg-red-500/20 text-red-400'
                                  : run.user_feedback === 'corrected'
                                    ? 'bg-amber-500/20 text-amber-400'
                                    : 'bg-gray-500/20 text-gray-400'
                            }`}>
                              {run.user_feedback}
                            </span>
                          )}
                        </td>
                      </tr>
                      {expandedRun === run.id && (run.error_message || run.result_summary) && (
                        <tr>
                          <td colSpan={7} className={`px-3 py-2 ${isDark ? 'bg-gray-800/30' : 'bg-gray-100'}`}>
                            {run.error_message && (
                              <div className={`${errorClass} mb-2`}>
                                <strong>Error:</strong> {run.error_message}
                              </div>
                            )}
                            {run.result_summary && (
                              <pre className={`text-xs font-mono ${isDark ? 'text-gray-400' : 'text-gray-600'} whitespace-pre-wrap`}>
                                {JSON.stringify(run.result_summary, null, 2)}
                              </pre>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Workflows Tab */}
      {activeTab === 'workflows' && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left">
              <thead className={`sticky top-0 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
                <tr>
                  <th className={`px-3 py-2 ${headerClass}`}>Status</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Workflow ID</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Started</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Duration</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Progress</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Trigger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {workflowRuns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={`px-3 py-4 text-center ${rowClass}`}>
                      No workflow executions recorded yet
                    </td>
                  </tr>
                ) : (
                  workflowRuns.map((run) => (
                    <React.Fragment key={run.id}>
                      <tr
                        className={`cursor-pointer ${isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}`}
                        onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                      >
                        <td className={`px-3 py-2 ${rowClass}`}>
                          <span className={getStatusColor(run.status)}>
                            {run.status}
                          </span>
                        </td>
                        <td className={`px-3 py-2 ${rowClass}`}>
                          {run.workflow_id?.substring(0, 8) || run.id.substring(0, 8)}...
                        </td>
                        <td className={`px-3 py-2 ${rowClass} whitespace-nowrap`}>
                          {formatTimestamp(run.started_at)}
                        </td>
                        <td className={`px-3 py-2 ${rowClass}`}>
                          {formatDuration(run.duration_ms)}
                        </td>
                        <td className={`px-3 py-2 ${rowClass}`}>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  run.status === 'completed' ? 'bg-green-500' :
                                  run.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'
                                }`}
                                style={{ width: `${(run.steps_completed / Math.max(run.steps_total, 1)) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">
                              {run.steps_completed}/{run.steps_total}
                            </span>
                          </div>
                        </td>
                        <td className={`px-3 py-2 ${rowClass}`}>
                          <span className={`px-1.5 py-0.5 text-xs rounded ${
                            run.trigger_type === 'manual'
                              ? 'bg-blue-500/20 text-blue-400'
                              : run.trigger_type === 'schedule'
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {run.trigger_type || 'unknown'}
                          </span>
                        </td>
                      </tr>
                      {expandedRun === run.id && (run.error_message || run.result_summary) && (
                        <tr>
                          <td colSpan={6} className={`px-3 py-2 ${isDark ? 'bg-gray-800/30' : 'bg-gray-100'}`}>
                            {run.error_message && (
                              <div className={`${errorClass} mb-2`}>
                                <strong>Error:</strong> {run.error_message}
                              </div>
                            )}
                            {run.result_summary && (
                              <pre className={`text-xs font-mono ${isDark ? 'text-gray-400' : 'text-gray-600'} whitespace-pre-wrap`}>
                                {JSON.stringify(run.result_summary, null, 2)}
                              </pre>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Errors Tab */}
      {activeTab === 'errors' && (
        <div className={`${cardClass} p-4`}>
          {totalErrors === 0 ? (
            <div className="text-center py-4">
              <CheckCircleIcon className="w-8 h-8 mx-auto mb-2 text-green-400" />
              <p className={rowClass}>No errors recorded</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {/* Agent Errors */}
              {errorAgentRuns.map((run) => (
                <div
                  key={run.id}
                  className={`p-3 rounded ${isDark ? 'bg-red-900/20 border border-red-800' : 'bg-red-50 border border-red-200'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <BotIcon className="w-4 h-4 text-red-500" />
                    <span className={`${rowClass} font-semibold`}>{formatAgentName(run.agent_identifier)}</span>
                    <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                      {formatTimestamp(run.started_at)}
                    </span>
                  </div>
                  {run.error_message && (
                    <p className={errorClass}>{run.error_message}</p>
                  )}
                </div>
              ))}

              {/* Workflow Errors */}
              {errorWorkflowRuns.map((run) => (
                <div
                  key={run.id}
                  className={`p-3 rounded ${isDark ? 'bg-red-900/20 border border-red-800' : 'bg-red-50 border border-red-200'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <ZapIcon className="w-4 h-4 text-red-500" />
                    <span className={`${rowClass} font-semibold`}>
                      Workflow {run.workflow_id?.substring(0, 8) || run.id.substring(0, 8)}
                    </span>
                    <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                      {formatTimestamp(run.started_at)}
                    </span>
                  </div>
                  {run.error_message && (
                    <p className={errorClass}>{run.error_message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary stats */}
      <div className={`${cardClass} p-3`}>
        <div className="grid grid-cols-5 gap-4 text-center">
          <div>
            <div className={headerClass}>Agent Runs (24h)</div>
            <div className={`text-lg font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {agentRuns.filter(r => new Date(r.started_at) > new Date(Date.now() - 86400000)).length}
            </div>
          </div>
          <div>
            <div className={headerClass}>Success Rate</div>
            <div className={`text-lg font-mono ${isDark ? 'text-green-400' : 'text-green-600'}`}>
              {agentRuns.length > 0
                ? Math.round((agentRuns.filter(r => r.outcome === 'success').length / agentRuns.length) * 100)
                : 0}%
            </div>
          </div>
          <div>
            <div className={headerClass}>Total Actions</div>
            <div className={`text-lg font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {agentRuns.reduce((sum, r) => sum + (r.actions_generated || 0), 0)}
            </div>
          </div>
          <div>
            <div className={headerClass}>Executed</div>
            <div className={`text-lg font-mono ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
              {agentRuns.reduce((sum, r) => sum + (r.actions_executed || 0), 0)}
            </div>
          </div>
          <div>
            <div className={headerClass}>Workflows (24h)</div>
            <div className={`text-lg font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {workflowRuns.filter(r => new Date(r.started_at) > new Date(Date.now() - 86400000)).length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentExecutionLog;
