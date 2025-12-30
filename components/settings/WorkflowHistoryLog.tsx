/**
 * Workflow & Agent History Log
 * Technical log showing workflow runs and agent executions
 * Admin-only visibility in Settings
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { useTheme } from '../ThemeProvider';
import { RefreshIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from '../icons';
import Button from '../ui/Button';

interface WorkflowRun {
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
}

interface AgentRun {
  id: string;
  agent_identifier: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  outcome: string | null;
  actions_generated: number;
  actions_executed: number;
  error_message: string | null;
}

interface WorkflowHistoryLogProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const WorkflowHistoryLog: React.FC<WorkflowHistoryLogProps> = ({ addToast }) => {
  const { isDark } = useTheme();
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'workflows' | 'agents'>('all');

  const cardClass = isDark
    ? "bg-gray-900/60 border border-gray-700 rounded-lg"
    : "bg-gray-50 border border-gray-200 rounded-lg";

  const headerClass = isDark
    ? "text-xs font-mono text-gray-500 uppercase"
    : "text-xs font-mono text-gray-500 uppercase";

  const rowClass = isDark
    ? "text-sm font-mono text-gray-300"
    : "text-sm font-mono text-gray-700";

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load workflow runs
      const { data: wfData, error: wfError } = await supabase
        .from('workflow_executions')
        .select('id, workflow_id, status, started_at, completed_at, duration_ms, steps_completed, steps_total, error_message, result_summary')
        .order('started_at', { ascending: false })
        .limit(50);

      if (wfError) {
        console.error('[WorkflowHistoryLog] Failed to load workflows:', wfError);
      } else {
        setWorkflowRuns(wfData || []);
      }

      // Load agent runs
      const { data: agData, error: agError } = await supabase
        .from('agent_execution_log')
        .select('id, agent_identifier, started_at, completed_at, duration_ms, outcome, actions_generated, actions_executed, error_message')
        .order('started_at', { ascending: false })
        .limit(50);

      if (agError) {
        console.error('[WorkflowHistoryLog] Failed to load agents:', agError);
      } else {
        setAgentRuns(agData || []);
      }
    } catch (err) {
      console.error('[WorkflowHistoryLog] Load error:', err);
    } finally {
      setLoading(false);
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

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'completed':
      case 'success':
        return <CheckCircleIcon className="w-3 h-3 text-green-500" />;
      case 'failed':
      case 'error':
        return <XCircleIcon className="w-3 h-3 text-red-500" />;
      default:
        return <ClockIcon className="w-3 h-3 text-amber-500" />;
    }
  };

  // Combine and sort all runs
  const allRuns = [
    ...workflowRuns.map(w => ({
      id: w.id,
      type: 'workflow' as const,
      name: w.workflow_id?.substring(0, 12) || 'workflow',
      started_at: w.started_at,
      status: w.status,
      duration_ms: w.duration_ms,
      detail: `${w.steps_completed}/${w.steps_total} steps`,
      error: w.error_message,
    })),
    ...agentRuns.map(a => ({
      id: a.id,
      type: 'agent' as const,
      name: a.agent_identifier.replace(/_/g, ' '),
      started_at: a.started_at,
      status: a.outcome || 'pending',
      duration_ms: a.duration_ms,
      detail: `${a.actions_executed}/${a.actions_generated} actions`,
      error: a.error_message,
    })),
  ].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  const filteredRuns = activeTab === 'all'
    ? allRuns
    : allRuns.filter(r => r.type === (activeTab === 'workflows' ? 'workflow' : 'agent'));

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
          <button className={tabClass('all')} onClick={() => setActiveTab('all')}>
            All ({allRuns.length})
          </button>
          <button className={tabClass('workflows')} onClick={() => setActiveTab('workflows')}>
            Workflows ({workflowRuns.length})
          </button>
          <button className={tabClass('agents')} onClick={() => setActiveTab('agents')}>
            Agents ({agentRuns.length})
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

      {/* Runs Log */}
      <div className={`${cardClass} overflow-hidden`}>
        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-left">
            <thead className={`sticky top-0 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
              <tr>
                <th className={`px-3 py-2 ${headerClass}`}>Type</th>
                <th className={`px-3 py-2 ${headerClass}`}>Name</th>
                <th className={`px-3 py-2 ${headerClass}`}>Time</th>
                <th className={`px-3 py-2 ${headerClass}`}>Status</th>
                <th className={`px-3 py-2 ${headerClass}`}>Duration</th>
                <th className={`px-3 py-2 ${headerClass}`}>Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`px-3 py-4 text-center ${rowClass}`}>
                    No runs recorded yet
                  </td>
                </tr>
              ) : (
                filteredRuns.slice(0, 30).map((run) => (
                  <tr key={run.id} className={isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}>
                    <td className={`px-3 py-2 ${rowClass}`}>
                      <span className={`px-1.5 py-0.5 text-xs rounded ${
                        run.type === 'workflow'
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {run.type}
                      </span>
                    </td>
                    <td className={`px-3 py-2 ${rowClass} max-w-[150px] truncate`} title={run.name}>
                      {run.name}
                    </td>
                    <td className={`px-3 py-2 ${rowClass} whitespace-nowrap`}>
                      {formatTimestamp(run.started_at)}
                    </td>
                    <td className={`px-3 py-2 ${rowClass}`}>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(run.status)}
                        <span className="capitalize">{run.status}</span>
                      </div>
                    </td>
                    <td className={`px-3 py-2 ${rowClass}`}>
                      {formatDuration(run.duration_ms)}
                    </td>
                    <td className={`px-3 py-2 ${rowClass}`}>
                      {run.error ? (
                        <span className="text-red-400" title={run.error}>error</span>
                      ) : (
                        <span className="text-gray-500">{run.detail}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary stats */}
      <div className={`${cardClass} p-3`}>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className={headerClass}>Total Runs (24h)</div>
            <div className={`text-lg font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {allRuns.filter(r => new Date(r.started_at) > new Date(Date.now() - 86400000)).length}
            </div>
          </div>
          <div>
            <div className={headerClass}>Workflows</div>
            <div className={`text-lg font-mono ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
              {workflowRuns.length}
            </div>
          </div>
          <div>
            <div className={headerClass}>Agent Runs</div>
            <div className={`text-lg font-mono ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
              {agentRuns.length}
            </div>
          </div>
          <div>
            <div className={headerClass}>Errors</div>
            <div className={`text-lg font-mono ${isDark ? 'text-red-400' : 'text-red-600'}`}>
              {allRuns.filter(r => r.status === 'failed' || r.status === 'error' || r.error).length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowHistoryLog;
