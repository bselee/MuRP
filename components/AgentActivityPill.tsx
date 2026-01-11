/**
 * AgentActivityPill - Compact animated agent status indicator
 *
 * Shows agent status as a small vibrating pill when updating.
 * Click to expand or navigate to full Agent Command Center.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import { useTheme } from './ThemeProvider';
import { BotIcon, ChevronRightIcon } from './icons';

interface AgentActivityPillProps {
  onViewAll?: () => void;
}

const AgentActivityPill: React.FC<AgentActivityPillProps> = ({ onViewAll }) => {
  const { isDark } = useTheme();
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    setIsUpdating(true);
    try {
      const { count } = await supabase
        .from('agent_activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('requires_human_review', true)
        .is('human_reviewed_at', null);

      setPendingReviewCount(count || 0);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('[AgentActivityPill] Error:', err);
    } finally {
      // Keep vibrating for a moment after update
      setTimeout(() => setIsUpdating(false), 800);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('agent-pill-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_activity_log' }, () => {
        fetchData();
      })
      .subscribe();

    // Refresh periodically
    const interval = setInterval(fetchData, 30000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const formatTimeAgo = (date: Date) => {
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${Math.floor(diffMins / 60)}h ago`;
  };

  const hasItems = pendingReviewCount > 0;

  return (
    <button
      onClick={onViewAll}
      className={`
        group flex items-center gap-2.5 px-4 py-2.5 rounded-xl
        transition-all duration-300 ease-out
        ${hasItems
          ? (isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200')
          : (isDark ? 'bg-gray-800/60 border-gray-700/50' : 'bg-gray-50 border-gray-200')
        }
        border hover:shadow-lg
        ${isUpdating ? 'animate-vibrate' : ''}
      `}
    >
      {/* Bot icon with pulse when has items */}
      <div className="relative">
        <div className={`
          p-1.5 rounded-lg transition-colors
          ${hasItems
            ? (isDark ? 'bg-amber-500/20' : 'bg-amber-100')
            : (isDark ? 'bg-gray-700' : 'bg-gray-100')
          }
        `}>
          <BotIcon className={`w-4 h-4 ${hasItems ? 'text-amber-500' : (isDark ? 'text-gray-400' : 'text-gray-500')}`} />
        </div>
        {hasItems && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse ring-2 ring-amber-500/30" />
        )}
      </div>

      {/* Label */}
      <span className={`font-medium text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
        Agent Activity
      </span>

      {/* Count badge */}
      {hasItems && (
        <span className={`
          text-xs font-semibold px-2 py-0.5 rounded-full
          ${isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-200 text-amber-700'}
        `}>
          {pendingReviewCount} need review
        </span>
      )}

      {/* Updated time */}
      <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} hidden sm:inline`}>
        Updated {formatTimeAgo(lastUpdate)}
      </span>

      {/* Refresh indicator */}
      {isUpdating && (
        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      )}

      {/* Arrow */}
      <ChevronRightIcon className={`w-4 h-4 ${isDark ? 'text-gray-500' : 'text-gray-400'} group-hover:text-blue-500 transition-colors`} />
    </button>
  );
};

export default AgentActivityPill;
