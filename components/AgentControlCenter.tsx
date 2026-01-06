/**
 * AgentControlCenter - HERO component showing real-time agent activity
 *
 * This is THE primary visibility component for the agent system.
 * Designed to be UNMISSABLE on the dashboard.
 *
 * Shows:
 * - Currently running agents with live spinners
 * - Recent completions with success indicators
 * - Items needing human attention (review, approval)
 * - Quick stats on system health
 *
 * Updates every 10 seconds for near-real-time feel.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import { useTheme } from './ThemeProvider';
import {
  BotIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ChevronRightIcon,
  RefreshIcon,
  PlayIcon,
  EyeIcon,
  SparklesIcon,
} from './icons';

interface RunningAgent {
  id: string;
  agent_identifier: string;
  agent_name: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
}

interface ActivityItem {
  id: string;
  agent_identifier: string;
  activity_type: string;
  title: string;
  description: string | null;
  severity: string;
  requires_human_review: boolean;
  human_reviewed_at: string | null;
  created_at: string;
  confidence_score: number | null;
  financial_impact: number | null;
}

interface PendingAction {
  id: string;
  action_type: string;
  action_label: string;
  agent_identifier: string | null;
  status: string;
  confidence: number | null;
  created_at: string;
}

interface AgentStats {
  total_today: number;
  running_now: number;
  completed_today: number;
  pending_review: number;
  errors_today: number;
}

interface AgentControlCenterProps {
  onViewAllActivity?: () => void;
  onReviewItem?: (activityId: string) => void;
}

const AgentControlCenter: React.FC<AgentControlCenterProps> = ({
  onViewAllActivity,
  onReviewItem,
}) => {
  const { isDark } = useTheme();
  const [runningAgents, setRunningAgents] = useState<RunningAgent[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [stats, setStats] = useState<AgentStats>({
    total_today: 0,
    running_now: 0,
    completed_today: 0,
    pending_review: 0,
    errors_today: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Fetch running agents
      const { data: running } = await supabase
        .from('agent_execution_log')
        .select('id, agent_identifier, agent_name, status, started_at')
        .eq('status', 'running')
        .order('started_at', { ascending: false })
        .limit(5);

      // Fetch PENDING ACTIONS - these are REAL actionable items!
      const { data: pending } = await supabase
        .from('pending_actions')
        .select('id, action_type, action_label, agent_identifier, status, confidence, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10);

      // Fetch recently completed/executed actions (last 24h)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: completed } = await supabase
        .from('pending_actions')
        .select('id, action_type, action_label, agent_identifier, status, confidence, created_at, executed_at')
        .in('status', ['executed', 'auto_executed', 'approved'])
        .gte('created_at', oneDayAgo)
        .order('executed_at', { ascending: false, nullsFirst: false })
        .limit(10);

      // Also try to get agent_activity_stream if it has data
      const { data: activity } = await supabase
        .from('agent_activity_stream')
        .select('*')
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      // Calculate stats from pending_actions (which has real data)
      const { count: pendingCount } = await supabase
        .from('pending_actions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');

      const { count: completedCount } = await supabase
        .from('pending_actions')
        .select('id', { count: 'exact', head: true })
        .in('status', ['executed', 'auto_executed', 'approved'])
        .gte('created_at', oneDayAgo);

      setRunningAgents(running || []);
      setPendingActions(pending || []);
      setRecentActivity(activity || []);
      setStats({
        total_today: (pending?.length || 0) + (completed?.length || 0) + (activity?.length || 0),
        running_now: (running || []).length,
        completed_today: completedCount || 0,
        pending_review: pendingCount || 0,
        errors_today: 0, // Would need error tracking
      });
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error('[AgentControlCenter] Error fetching data:', err);
      setError('Failed to load agent activity');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Subscribe to real-time updates for instant feedback
    const activityChannel = supabase
      .channel('agent-activity-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_activity_log',
        },
        (payload) => {
          // New activity - refresh immediately
          console.log('[AgentControlCenter] New activity detected:', payload.new);
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_execution_log',
        },
        (payload) => {
          // Agent execution status changed - refresh immediately
          console.log('[AgentControlCenter] Execution status changed:', payload);
          fetchData();
        }
      )
      .subscribe();

    // Fallback polling every 30 seconds in case realtime misses something
    const interval = setInterval(fetchData, 30 * 1000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(activityChannel);
    };
  }, [fetchData]);

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);

    if (diffSecs < 30) return 'just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${Math.floor(diffMins / 60)}h ago`;
  };

  const getAgentDisplayName = (identifier: string) => {
    const names: Record<string, string> = {
      'stockout-prevention': 'Stockout Prevention',
      'stockout_prevention': 'Stockout Prevention',
      'vendor-watchdog': 'Vendor Watchdog',
      'vendor_watchdog': 'Vendor Watchdog',
      'po-intelligence': 'PO Intelligence',
      'po_intelligence': 'PO Intelligence',
      'inventory-guardian': 'Inventory Guardian',
      'inventory_guardian': 'Inventory Guardian',
      'email-monitor': 'Email Monitor',
      'invoice-extractor': 'Invoice Extractor',
      'three-way-match': 'Three-Way Match',
    };
    return names[identifier] || identifier.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getActivityIcon = (type: string, severity: string) => {
    if (severity === 'error' || severity === 'critical') {
      return <XCircleIcon className="w-5 h-5 text-red-500" />;
    }
    if (type === 'decision' || type === 'checkpoint') {
      return <SparklesIcon className="w-5 h-5 text-amber-500" />;
    }
    if (type === 'observation') {
      return <EyeIcon className="w-5 h-5 text-blue-500" />;
    }
    if (type === 'action' || type === 'completion') {
      return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
    }
    return <BotIcon className="w-5 h-5 text-gray-500" />;
  };

  // Theme classes
  const cardClass = isDark
    ? 'bg-gray-800 border-gray-700'
    : 'bg-white border-gray-200 shadow-sm';

  const textClass = isDark ? 'text-gray-100' : 'text-gray-900';
  const mutedClass = isDark ? 'text-gray-400' : 'text-gray-500';
  const borderClass = isDark ? 'border-gray-700' : 'border-gray-200';

  // Status indicator
  const isHealthy = stats.errors_today === 0 && stats.pending_review < 5;
  const needsAttention = stats.pending_review > 0 || stats.errors_today > 0;

  if (loading) {
    return (
      <div className={`rounded-xl border-2 ${cardClass} p-6`}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded w-48"></div>
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border-2 ${needsAttention ? 'border-amber-500' : isHealthy ? 'border-green-500/50' : borderClass} ${cardClass} overflow-hidden`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${borderClass} flex items-center justify-between ${needsAttention ? 'bg-amber-500/10' : ''}`}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <BotIcon className={`w-6 h-6 ${runningAgents.length > 0 ? 'text-green-500' : mutedClass}`} />
            {runningAgents.length > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
            )}
          </div>
          <div>
            <h2 className={`font-semibold ${textClass}`}>Agent Control Center</h2>
            <p className={`text-xs ${mutedClass}`}>
              Updated {formatTimeAgo(lastUpdate.toISOString())}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stats.pending_review > 0 && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 animate-pulse">
              {stats.pending_review} needs review
            </span>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors`}
            title="Refresh"
          >
            <RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''} ${mutedClass}`} />
          </button>
          {onViewAllActivity && (
            <button
              onClick={onViewAllActivity}
              className="text-sm text-blue-500 hover:text-blue-400 flex items-center gap-1"
            >
              View All <ChevronRightIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className={`grid grid-cols-4 gap-px bg-gray-200 dark:bg-gray-700`}>
        {/* Running Now */}
        <div className={`p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex items-center gap-2 mb-1">
            {stats.running_now > 0 ? (
              <div className="w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <div className={`w-3 h-3 rounded-full ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`}></div>
            )}
            <span className={`text-xs font-medium ${mutedClass}`}>Running</span>
          </div>
          <p className={`text-2xl font-bold ${stats.running_now > 0 ? 'text-green-500' : textClass}`}>
            {stats.running_now}
          </p>
        </div>

        {/* Completed Today */}
        <div className={`p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircleIcon className="w-3 h-3 text-green-500" />
            <span className={`text-xs font-medium ${mutedClass}`}>Completed</span>
          </div>
          <p className={`text-2xl font-bold text-green-500`}>
            {stats.completed_today}
          </p>
        </div>

        {/* Pending Review */}
        <div className={`p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex items-center gap-2 mb-1">
            <ExclamationTriangleIcon className={`w-3 h-3 ${stats.pending_review > 0 ? 'text-amber-500' : mutedClass}`} />
            <span className={`text-xs font-medium ${mutedClass}`}>Need Review</span>
          </div>
          <p className={`text-2xl font-bold ${stats.pending_review > 0 ? 'text-amber-500' : textClass}`}>
            {stats.pending_review}
          </p>
        </div>

        {/* Errors */}
        <div className={`p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex items-center gap-2 mb-1">
            <XCircleIcon className={`w-3 h-3 ${stats.errors_today > 0 ? 'text-red-500' : mutedClass}`} />
            <span className={`text-xs font-medium ${mutedClass}`}>Errors</span>
          </div>
          <p className={`text-2xl font-bold ${stats.errors_today > 0 ? 'text-red-500' : textClass}`}>
            {stats.errors_today}
          </p>
        </div>
      </div>

      {/* Currently Running */}
      {runningAgents.length > 0 && (
        <div className={`px-6 py-3 border-t ${borderClass} bg-green-50/50 dark:bg-green-900/10`}>
          <div className="flex items-center gap-2 mb-2">
            <PlayIcon className="w-4 h-4 text-green-500" />
            <span className={`text-sm font-medium text-green-700 dark:text-green-400`}>
              Running Now
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {runningAgents.map(agent => (
              <div
                key={agent.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
                  isDark ? 'bg-green-900/30' : 'bg-green-100'
                }`}
              >
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className={`text-sm font-medium ${isDark ? 'text-green-300' : 'text-green-800'}`}>
                  {agent.agent_name || getAgentDisplayName(agent.agent_identifier)}
                </span>
                <span className={`text-xs ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                  {formatTimeAgo(agent.started_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Actions - SHOW REAL ACTIONABLE ITEMS */}
      {pendingActions.length > 0 && (
        <div className={`border-t ${borderClass}`}>
          <div className={`px-4 py-2 border-b ${borderClass} ${isDark ? 'bg-amber-900/10' : 'bg-amber-50/50'}`}>
            <span className={`text-sm font-medium ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
              Pending Actions ({pendingActions.length})
            </span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {pendingActions.slice(0, 5).map(action => (
              <div
                key={action.id}
                className={`px-4 py-2 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50`}
              >
                <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${textClass} truncate`}>{action.action_label}</p>
                  <p className={`text-xs ${mutedClass}`}>{formatTimeAgo(action.created_at)}</p>
                </div>
                {action.confidence && (
                  <span className={`text-xs ${mutedClass}`}>{Math.round(action.confidence * 100)}%</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity Feed - only show if we have activity data */}
      {recentActivity.length > 0 && (
        <div className={`border-t ${borderClass}`}>
          <div className={`px-4 py-2 border-b ${borderClass}`}>
            <span className={`text-sm font-medium ${mutedClass}`}>Recent Activity</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {recentActivity.slice(0, 4).map(activity => {
              const needsReview = activity.requires_human_review && !activity.human_reviewed_at;
              return (
                <div
                  key={activity.id}
                  className={`px-4 py-2 flex items-center gap-3 ${
                    needsReview ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''
                  } hover:bg-gray-50 dark:hover:bg-gray-700/50`}
                  onClick={() => needsReview && onReviewItem?.(activity.id)}
                  role={needsReview ? 'button' : undefined}
                >
                  {getActivityIcon(activity.activity_type, activity.severity)}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${textClass} truncate`}>{activity.title}</p>
                    <p className={`text-xs ${mutedClass}`}>
                      {getAgentDisplayName(activity.agent_identifier)} · {formatTimeAgo(activity.created_at)}
                    </p>
                  </div>
                  {needsReview && (
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      Review
                    </span>
                  )}
                  {activity.confidence_score && (
                    <span className={`text-xs ${mutedClass}`}>
                      {Math.round(activity.confidence_score * 100)}%
                    </span>
                  )}
                  {activity.financial_impact && activity.financial_impact > 0 && (
                    <span className="text-xs font-medium text-green-600 dark:text-green-400">
                      +${activity.financial_impact.toLocaleString()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state - only show if NOTHING at all */}
      {pendingActions.length === 0 && recentActivity.length === 0 && runningAgents.length === 0 && (
        <div className={`border-t ${borderClass} px-4 py-6 text-center`}>
          <BotIcon className={`w-8 h-8 mx-auto mb-2 ${mutedClass}`} />
          <p className={`text-sm ${mutedClass}`}>Agents are idle</p>
          <p className={`text-xs ${mutedClass} mt-1`}>Runs on schedules and events</p>
        </div>
      )}

      {/* Quick Status Footer */}
      {stats.total_today > 0 && (
        <div className={`px-6 py-3 border-t ${borderClass} ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
          <div className="flex items-center justify-between">
            <p className={`text-xs ${mutedClass}`}>
              {stats.total_today} total activities today
            </p>
            {isHealthy && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                  All systems healthy
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentControlCenter;
