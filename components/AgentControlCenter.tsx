/**
 * AgentControlCenter - Compact widget showing agent activity RESULTS
 *
 * Design goals:
 * - SIMPLE: Show what's happening without overwhelming users
 * - RESULTS-FOCUSED: Show what agents found, not just that they ran
 * - COMPACT: Don't take up too much dashboard space
 * - ACTIONABLE: Highlight items needing attention
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import { useTheme } from './ThemeProvider';
import {
  BotIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ChevronRightIcon,
  RefreshIcon,
  SparklesIcon,
} from './icons';

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
  context: Record<string, unknown> | null;
}

interface AgentControlCenterProps {
  onViewAllActivity?: () => void;
}

const AgentControlCenter: React.FC<AgentControlCenterProps> = ({
  onViewAllActivity,
}) => {
  const { isDark } = useTheme();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [runningCount, setRunningCount] = useState(0);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      // Get recent activity (last 24h, focus on important items)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: activity } = await supabase
        .from('agent_activity_log')
        .select('id, agent_identifier, activity_type, title, description, severity, requires_human_review, human_reviewed_at, created_at, context')
        .gte('created_at', oneDayAgo)
        .in('activity_type', ['decision', 'completion', 'action'])  // Focus on results
        .order('created_at', { ascending: false })
        .limit(8);

      // Count running agents
      const { count: running } = await supabase
        .from('agent_execution_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'running');

      // Count items needing review
      const { count: pendingReview } = await supabase
        .from('agent_activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('requires_human_review', true)
        .is('human_reviewed_at', null);

      setActivities(activity || []);
      setRunningCount(running || 0);
      setPendingReviewCount(pendingReview || 0);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('[AgentControlCenter] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('agent-activity-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_activity_log' },
        () => fetchData()
      )
      .subscribe();

    // Poll every 30 seconds as backup
    const interval = setInterval(fetchData, 30000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const getAgentName = (identifier: string) => {
    const names: Record<string, string> = {
      'stockout-prevention': 'Stock Monitor',
      'vendor-watchdog': 'Vendor Watch',
      'inventory-guardian': 'Inventory',
      'po-intelligence': 'PO Monitor',
      'email-tracking-specialist': 'Email Track',
      'invoice-extractor': 'Invoice AI',
    };
    return names[identifier] || identifier.split('-').map(w => w[0].toUpperCase()).join('');
  };

  const getSeverityIcon = (severity: string, activityType: string) => {
    if (severity === 'critical') return <XCircleIcon className="w-4 h-4 text-red-500" />;
    if (severity === 'warning' || activityType === 'decision') return <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />;
    if (activityType === 'completion') return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
    return <SparklesIcon className="w-4 h-4 text-blue-500" />;
  };

  // Theme classes
  const cardBg = isDark ? 'bg-gray-800/50' : 'bg-white';
  const borderColor = isDark ? 'border-gray-700' : 'border-gray-200';
  const textColor = isDark ? 'text-gray-100' : 'text-gray-900';
  const mutedColor = isDark ? 'text-gray-400' : 'text-gray-500';

  const hasActivity = activities.length > 0 || runningCount > 0;
  const needsAttention = pendingReviewCount > 0;

  if (loading) {
    return (
      <div className={`rounded-lg border ${borderColor} ${cardBg} p-4`}>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className={mutedColor}>Loading agent activity...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${needsAttention ? 'border-amber-500' : borderColor} ${cardBg} overflow-hidden`}>
      {/* Compact Header */}
      <div className={`px-4 py-2 flex items-center justify-between border-b ${borderColor} ${needsAttention ? (isDark ? 'bg-amber-900/20' : 'bg-amber-50') : ''}`}>
        <div className="flex items-center gap-2">
          <div className="relative">
            <BotIcon className={`w-4 h-4 ${runningCount > 0 ? 'text-green-500' : mutedColor}`} />
            {runningCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            )}
          </div>
          <span className={`font-medium text-sm ${textColor}`}>Agent Activity</span>

          {/* Status badges */}
          {runningCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {runningCount} running
            </span>
          )}
          {pendingReviewCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 animate-pulse">
              {pendingReviewCount} needs review
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-xs ${mutedColor}`}>{formatTimeAgo(lastUpdate.toISOString())}</span>
          <button
            onClick={fetchData}
            className={`p-1 rounded ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
            title="Refresh"
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${mutedColor}`} />
          </button>
          {onViewAllActivity && (
            <button
              onClick={onViewAllActivity}
              className="text-xs text-blue-500 hover:text-blue-400 flex items-center"
            >
              More <ChevronRightIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Activity List - Compact */}
      {hasActivity ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
          {activities.slice(0, 5).map(item => {
            const needsReview = item.requires_human_review && !item.human_reviewed_at;
            return (
              <div
                key={item.id}
                className={`px-4 py-2 flex items-start gap-2 ${
                  needsReview ? (isDark ? 'bg-amber-900/10' : 'bg-amber-50/50') : ''
                }`}
              >
                <div className="mt-0.5">
                  {getSeverityIcon(item.severity, item.activity_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${textColor} truncate`}>{item.title}</p>
                  <p className={`text-xs ${mutedColor}`}>
                    {getAgentName(item.agent_identifier)} · {formatTimeAgo(item.created_at)}
                  </p>
                </div>
                {needsReview && (
                  <span className="text-xs px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    Review
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-4 py-6 text-center">
          <BotIcon className={`w-6 h-6 mx-auto mb-1 ${mutedColor}`} />
          <p className={`text-sm ${mutedColor}`}>No recent activity</p>
          <p className={`text-xs ${mutedColor}`}>Agents run automatically on schedule</p>
        </div>
      )}
    </div>
  );
};

export default AgentControlCenter;
