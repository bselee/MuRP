/**
 * AgentActivityFeed - Shows recent agent actions and resolutions
 *
 * Displays what agents have autonomously handled so humans can see
 * the system is working without requiring manual intervention.
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import { useTheme } from './ThemeProvider';
import { CheckCircleIcon, BotIcon, ClockIcon } from './icons';

interface AgentAction {
  id: string;
  action_type: string;
  action_label: string;
  agent_identifier: string | null;
  status: string;
  confidence: number | null;
  reasoning: string | null;
  created_at: string;
  executed_at: string | null;
  reviewed_at: string | null;
  execution_result: any;
}

interface WorkflowExecution {
  id: string;
  workflow_name: string;
  status: string;
  summary: string | null;
  actions_generated: number | null;
  auto_executed_count: number | null;
  completed_at: string;
}

const AgentActivityFeed: React.FC = () => {
  const { isDark } = useTheme();
  const [recentActions, setRecentActions] = useState<AgentAction[]>([]);
  const [recentWorkflows, setRecentWorkflows] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivity();
    // Refresh every 2 minutes
    const interval = setInterval(fetchActivity, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchActivity = async () => {
    setLoading(true);
    try {
      // Fetch recently executed/approved actions (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: actions } = await supabase
        .from('pending_actions')
        .select('id, action_type, action_label, agent_identifier, status, confidence, reasoning, created_at, executed_at, reviewed_at, execution_result')
        .in('status', ['approved', 'executed', 'auto_executed'])
        .gte('created_at', oneDayAgo)
        .order('executed_at', { ascending: false, nullsFirst: false })
        .limit(10);

      setRecentActions(actions || []);

      // Fetch recent workflow executions
      const { data: workflows } = await supabase
        .from('workflow_executions')
        .select('id, workflow_name, status, summary, actions_generated, auto_executed_count, completed_at')
        .eq('status', 'completed')
        .gte('completed_at', oneDayAgo)
        .order('completed_at', { ascending: false })
        .limit(5);

      setRecentWorkflows(workflows || []);
    } catch (err) {
      console.error('[AgentActivityFeed] Error fetching activity:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const getAgentName = (identifier: string | null) => {
    const names: Record<string, string> = {
      'stockout_prevention': 'Stockout Prevention',
      'vendor_watchdog': 'Vendor Watchdog',
      'po_intelligence': 'PO Intelligence',
      'inventory_guardian': 'Inventory Guardian',
      'price_hunter': 'Price Hunter',
      'compliance_validator': 'Compliance Validator',
      'artwork_approval': 'Artwork Approval',
      'air_traffic_controller': 'Air Traffic Controller',
    };
    return names[identifier || ''] || identifier || 'System';
  };

  const cardClass = isDark
    ? 'bg-gray-800/50 border-gray-700'
    : 'bg-white border-gray-200 shadow-sm';

  const textClass = isDark ? 'text-gray-100' : 'text-gray-900';
  const mutedClass = isDark ? 'text-gray-400' : 'text-gray-500';

  if (loading) {
    return (
      <div className={`p-4 rounded-lg border ${cardClass}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-300 rounded w-1/3"></div>
          <div className="h-12 bg-gray-200 rounded"></div>
          <div className="h-12 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const totalActivity = recentActions.length + recentWorkflows.length;
  const autoExecuted = recentActions.filter(a => a.status === 'auto_executed').length;

  return (
    <div className="space-y-4">
      {/* Activity Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`p-3 rounded-lg border ${cardClass} text-center`}>
          <div className={`text-xl font-bold ${textClass}`}>{totalActivity}</div>
          <div className={`text-xs ${mutedClass}`}>Actions (24h)</div>
        </div>
        <div className={`p-3 rounded-lg border ${cardClass} text-center`}>
          <div className="text-xl font-bold text-green-500">{autoExecuted}</div>
          <div className={`text-xs ${mutedClass}`}>Auto-Handled</div>
        </div>
        <div className={`p-3 rounded-lg border ${cardClass} text-center`}>
          <div className="text-xl font-bold text-blue-500">{recentWorkflows.length}</div>
          <div className={`text-xs ${mutedClass}`}>Workflows</div>
        </div>
      </div>

      {/* Recent Activity List */}
      {totalActivity === 0 ? (
        <div className={`p-6 rounded-lg border ${cardClass} text-center`}>
          <ClockIcon className={`w-8 h-8 mx-auto mb-2 ${mutedClass}`} />
          <p className={mutedClass}>No agent activity in the last 24 hours</p>
        </div>
      ) : (
        <div className={`rounded-lg border ${cardClass} divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
          {recentActions.slice(0, 8).map(action => (
            <div key={action.id} className="p-3 flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {action.status === 'auto_executed' ? (
                  <BotIcon className="w-4 h-4 text-green-500" />
                ) : (
                  <CheckCircleIcon className="w-4 h-4 text-blue-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${textClass} truncate`}>
                  {action.action_label}
                </p>
                <p className={`text-xs ${mutedClass}`}>
                  {getAgentName(action.agent_identifier)} · {formatTimeAgo(action.executed_at || action.reviewed_at || action.created_at)}
                  {action.status === 'auto_executed' && (
                    <span className="ml-1 text-green-500">(auto)</span>
                  )}
                </p>
              </div>
              {action.confidence && (
                <div className={`text-xs ${mutedClass}`}>
                  {Math.round(action.confidence * 100)}%
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgentActivityFeed;
