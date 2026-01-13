/**
 * Data Sync Indicator
 *
 * Simple, always-visible indicator showing data freshness.
 * Shows in header - users know data is flowing without thinking about it.
 *
 * Hover for details popover with:
 * - Connection status
 * - Last sync time
 * - Item count
 * - Next scheduled sync
 * - Sync Now button
 */

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '../lib/supabase/client';
import { RefreshIcon, CheckCircleIcon } from './icons';
import { SYNC_EVENT_NAME, type SyncEventDetail, dispatchSyncEvent } from '../lib/syncEventBus';
import {
  buildSyncStatusLabel,
  formatTimeAgo,
  pickPrimaryRow,
  pickStaleRow,
  type SyncHealthRow,
} from '../lib/sync/healthUtils';

interface DataSyncIndicatorProps {
  isGlobalLoading: boolean;
}

const DataSyncIndicator: React.FC<DataSyncIndicatorProps> = ({ isGlobalLoading }) => {
  const [healthRows, setHealthRows] = useState<SyncHealthRow[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [showPopover, setShowPopover] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        setIsFetching(true);
        const { data, error } = await supabase.rpc('get_sync_health');
        if (error) throw error;
        setHealthRows(data || []);
        setLastFetchedAt(new Date());
      } catch (error) {
        console.error('[DataSync] Error fetching sync health:', error);
      } finally {
        setIsFetching(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    const subscription = supabase
      .channel('sync_metadata_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sync_metadata',
        },
        () => {
          fetchHealth();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleSyncEvent = (event: Event) => {
      const detail = (event as CustomEvent<SyncEventDetail>).detail;
      if (detail && typeof detail.running === 'boolean') {
        setIsSyncing(detail.running);
      }
    };
    window.addEventListener(SYNC_EVENT_NAME, handleSyncEvent);
    return () => {
      window.removeEventListener(SYNC_EVENT_NAME, handleSyncEvent);
    };
  }, []);

  // Close popover on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        triggerRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setShowPopover(false);
      }
    };

    if (showPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPopover]);

  const primaryRow = useMemo(() => pickPrimaryRow(healthRows), [healthRows]);
  const staleRow = useMemo(() => pickStaleRow(healthRows), [healthRows]);

  const lastSyncDate = primaryRow?.last_sync_time ? new Date(primaryRow.last_sync_time) : null;
  const itemCount = primaryRow?.item_count ?? 0;
  const showSpinner = isGlobalLoading || isSyncing || isFetching || isManualSyncing;
  const hasIssue = Boolean(staleRow);

  const statusLabel = useMemo(
    () =>
      buildSyncStatusLabel({
        showSpinner,
        staleRow,
        lastSyncDate,
      }),
    [showSpinner, staleRow, lastSyncDate],
  );

  // Calculate next scheduled sync (approximate - based on cron schedule)
  const getNextSyncTime = (): string => {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(30, 0, 0);
    if (nextHour <= now) {
      nextHour.setHours(nextHour.getHours() + 1);
    }
    return nextHour.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const handleSyncNow = async () => {
    setIsManualSyncing(true);
    dispatchSyncEvent({ running: true });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mpuevsmtowyexhsqugkm.supabase.co';

      const response = await fetch(`${supabaseUrl}/functions/v1/sync-finale-graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ syncType: 'all' }),
      });

      if (!response.ok) {
        console.error('[DataSync] Manual sync failed:', await response.text());
      } else {
        console.log('[DataSync] Manual sync triggered successfully');
      }
    } catch (error) {
      console.error('[DataSync] Error triggering manual sync:', error);
    } finally {
      setIsManualSyncing(false);
      dispatchSyncEvent({ running: false });
    }
  };

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setShowPopover(true);
    }, 200);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setShowPopover(false);
    }, 300);
  };

  return (
    <div className="relative">
      <div
        ref={triggerRef}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
          hasIssue
            ? 'bg-red-500/10 border-red-500/30'
            : 'bg-gray-800/50 border-gray-700/50 hover:bg-gray-800/70'
        }`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {showSpinner ? (
          <RefreshIcon className="w-4 h-4 text-blue-400 animate-spin" />
        ) : hasIssue ? (
          <div className="w-4 h-4 text-red-400">⚠</div>
        ) : (
          <CheckCircleIcon className="w-4 h-4 text-green-400" />
        )}
        <span className={`text-xs ${hasIssue ? 'text-red-300' : 'text-gray-300'}`}>
          {statusLabel}
        </span>
      </div>

      {/* Hover Popover */}
      {showPopover && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="p-4 space-y-3">
            {/* Status Header */}
            <div className="flex items-center gap-2">
              {hasIssue ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                  <span className="text-sm font-medium text-amber-300">Sync Issue</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-400"></div>
                  <span className="text-sm font-medium text-green-300">Connected to Finale</span>
                </>
              )}
            </div>

            {/* Sync Details */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Last sync:</span>
                <span className="text-gray-300">
                  {lastSyncDate ? formatTimeAgo(lastSyncDate) : 'Never'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Items synced:</span>
                <span className="text-gray-300">{itemCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Next sync:</span>
                <span className="text-gray-300">{getNextSyncTime()}</span>
              </div>
              {staleRow && (
                <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-amber-300">
                  {staleRow.success === false
                    ? `Error: ${staleRow.data_type} sync failed`
                    : `${staleRow.data_type} data is stale`}
                </div>
              )}
            </div>

            {/* Sync Now Button */}
            <button
              onClick={handleSyncNow}
              disabled={isManualSyncing}
              className={`w-full py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                isManualSyncing
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {isManualSyncing ? (
                <span className="flex items-center justify-center gap-2">
                  <RefreshIcon className="w-4 h-4 animate-spin" />
                  Syncing...
                </span>
              ) : (
                'Sync Now'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataSyncIndicator;
