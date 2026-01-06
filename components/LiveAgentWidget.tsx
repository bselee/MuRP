/**
 * LiveAgentWidget - Shows real-time agent activity on the Dashboard
 *
 * Users need to SEE what's happening. This widget:
 * - Shows currently running agents with live status
 * - Shows recent completions and decisions
 * - Highlights items needing human attention
 * - Updates automatically every 15 seconds
 *
 * Designed to be VISIBLE and ACTIONABLE - not hidden in admin tabs.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import { useTheme } from './ThemeProvider';
import {
  BotIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ChevronRightIcon,
  SparklesIcon,
} from './icons';

interface RunningAgent {
  id: string;
  agent_identifier: string;
  agent_name: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  progress_message?: string;
}

interface RecentActivity {
  id: string;
  agent_identifier: string;
  activity_type: string;
  title: string;
  severity: string;
  requires_human_review: boolean;
  human_reviewed_at: string | null;
  created_at: string;
  financial_impact?: number;
}

interface LiveAgentWidgetProps {
  onViewDetails?: () => void;
  maxItems?: number;
}

const LiveAgentWidget: React.FC<LiveAgentWidgetProps> = ({
  onViewDetails,
  maxItems = 5,
}) => {
  const { isDark } = useTheme();
  const [runningAgents, setRunningAgents] = useState<RunningAgent[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      // Get running agents from execution log
      const { data: running } = await supabase
        .from('agent_execution_log')
        .select('id, agent_identifier, agent_name, status, started_at')
        .eq('status', 'running')
        .order('started_at', { ascending: false })
        .limit(5);

      // Get recent activity from agent_activity_stream
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: activity } = await supabase
        .from('agent_activity_stream')
        .select('id, agent_identifier, activity_type, title, severity, requires_human_review, human_reviewed_at, created_at, financial_impact')
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(maxItems * 2);

      // Get pending review count
      const { count: reviewCount } = await supabase
        .from('agent_activity_stream')
        .select('id', { count: 'exact', head: true })
        .eq('requires_human_review', true)
        .is('human_reviewed_at', null);

      setRunningAgents(running || []);
      setRecentActivity(activity || []);
      setPendingReviewCount(reviewCount || 0);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('[LiveAgentWidget] Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [maxItems]);

  useEffect(() => {
    fetchData();
    // Refresh every 15 seconds for real-time feel
    const interval = setInterval(fetchData, 15 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);

    if (diffSecs < 30) return 'just now';
    if (diffSecs < 60) return `${diffSecs}s`;
    if (diffMins < 60) return `${diffMins}m`;
    return `${Math.floor(diffMins / 60)}h`;
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
      return <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />;
    }
    if (type === 'action' || type === 'completion') {
      return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
    }
    if (type === 'decision' || type === 'checkpoint') {
      return <SparklesIcon className="w-4 h-4 text-amber-500" />;
    }
    return <BotIcon className="w-4 h-4 text-blue-500" />;
  };

  const cardClass = isDark
    ? 'bg-gray-800/50 border-gray-700'
    : 'bg-white border-gray-200 shadow-sm';

  const textClass = isDark ? 'text-gray-100' : 'text-gray-900';
  const mutedClass = isDark ? 'text-gray-400' : 'text-gray-500';

  // Don't show widget if there's absolutely nothing happening
  const hasActivity = runningAgents.length > 0 || recentActivity.length > 0;

  if (loading) {
    return (
      <div className={`p-4 rounded-lg border ${cardClass}`}>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-gray-300 animate-pulse"></div>
          <div className="h-4 bg-gray-300 rounded w-32 animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${cardClass} overflow-hidden`}>
      {/* Header */}
      <div className={`px-4 py-3 border-b ${isDark ? 'border-gray-700 bg-gray-800/80' : 'border-gray-200 bg-gray-50'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <BotIcon className={`w-5 h-5 ${runningAgents.length > 0 ? 'text-green-500' : mutedClass}`} />
              {runningAgents.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              )}
            </div>
            <span className={`font-medium ${textClass}`}>Agent Activity</span>
            {pendingReviewCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 animate-pulse">
                {pendingReviewCount} needs review
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs ${mutedClass}`}>
              Updated {formatTimeAgo(lastUpdate.toISOString())}
            </span>
            {onViewDetails && (
              <button
                onClick={onViewDetails}
                className={`text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1`}
              >
                Details <ChevronRightIcon className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Running Agents */}
      {runningAgents.length > 0 && (
        <div className={`px-4 py-3 border-b ${isDark ? 'border-gray-700 bg-green-900/10' : 'border-gray-200 bg-green-50/50'}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className={`text-xs font-medium text-green-600 dark:text-green-400`}>
              Running Now
            </span>
          </div>
          <div className="space-y-2">
            {runningAgents.map(agent => (
              <div key={agent.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className={`text-sm ${textClass}`}>
                    {agent.agent_name || getAgentDisplayName(agent.agent_identifier)}
                  </span>
                </div>
                <span className={`text-xs ${mutedClass}`}>
                  {formatTimeAgo(agent.started_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recentActivity.length > 0 ? (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {recentActivity.slice(0, maxItems).map(activity => {
            const needsReview = activity.requires_human_review && !activity.human_reviewed_at;
            return (
              <div
                key={activity.id}
                className={`px-4 py-2.5 flex items-center gap-3 ${needsReview ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}
              >
                {getActivityIcon(activity.activity_type, activity.severity)}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${textClass} truncate`}>
                    {activity.title}
                  </p>
                  <p className={`text-xs ${mutedClass}`}>
                    {getAgentDisplayName(activity.agent_identifier)} · {formatTimeAgo(activity.created_at)}
                  </p>
                </div>
                {needsReview && (
                  <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    Review
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
      ) : !hasActivity ? (
        <div className="px-4 py-6 text-center">
          <ClockIcon className={`w-8 h-8 mx-auto mb-2 ${mutedClass}`} />
          <p className={`text-sm ${mutedClass}`}>No recent agent activity</p>
          <p className={`text-xs ${mutedClass} mt-1`}>Agents run on schedules and events</p>
        </div>
      ) : null}
    </div>
  );
};

export default LiveAgentWidget;
