/**
 * Data Sync Indicator
 * 
 * Simple, always-visible indicator showing data freshness.
 * Shows in header - users know data is flowing without thinking about it.
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase/client';
import { RefreshIcon, CheckCircleIcon } from './icons';
import { SYNC_EVENT_NAME, type SyncEventDetail } from '../lib/syncEventBus';

type SyncRow = {
  data_type: string;
  last_sync_time: string | null;
  success: boolean | null;
  item_count: number | null;
};

const DataSyncIndicator: React.FC = () => {
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [itemCount, setItemCount] = useState<number>(0);

  useEffect(() => {
    // Get latest sync time from metadata
    const checkSyncStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('sync_metadata')
          .select('data_type, last_sync_time, success, item_count');

        if (error) {
          throw error;
        }

        if (!data || data.length === 0) {
          setLastSync(null);
          setHasError(false);
          setItemCount(0);
          return;
        }

        const rows = data as SyncRow[];
        const inventoryRow = rows.find((row) => row.data_type === 'inventory');
        const mostRecent = rows.reduce<SyncRow | null>((latest, current) => {
          if (!current.last_sync_time) return latest;
          if (!latest || !latest.last_sync_time) return current;
          const currentTime = new Date(current.last_sync_time).getTime();
          const latestTime = new Date(latest.last_sync_time).getTime();
          return currentTime > latestTime ? current : latest;
        }, null);

        const targetRow = inventoryRow ?? mostRecent;

        if (targetRow?.last_sync_time) {
          setLastSync(new Date(targetRow.last_sync_time));
        } else {
          setLastSync(null);
        }

        setItemCount(targetRow?.item_count || 0);

        const inventoryErrored = Boolean(inventoryRow && inventoryRow.success === false);
        const anyErrored = rows.some((row) => row.success === false);
        setHasError(inventoryRow ? inventoryErrored : anyErrored);
      } catch (error) {
        console.error('[DataSync] Error checking sync status:', error);
        setHasError(true);
        setLastSync(null);
      }
    };

    checkSyncStatus();

    // Re-check every 30 seconds
    const interval = setInterval(checkSyncStatus, 30000);

    // Subscribe to real-time changes
    const subscription = supabase
      .channel('sync_metadata_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sync_metadata',
        },
        (payload: any) => {
          console.log('[DataSync] Real-time update:', payload);
          // Re-fetch all metadata when any row changes
          checkSyncStatus();
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

  const getTimeAgo = (date: Date | null): string => {
    if (!date) return 'Never';
    
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 120) return '1m ago';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 7200) return '1h ago';
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <div 
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors ${
        hasError 
          ? 'bg-red-500/10 border-red-500/30' 
          : 'bg-gray-800/50 border-gray-700/50'
      }`}
      title={`Data synced ${getTimeAgo(lastSync)}${itemCount > 0 ? ` (${itemCount.toLocaleString()} items)` : ''}`}
    >
      {isSyncing ? (
        <RefreshIcon className="w-4 h-4 text-blue-400 animate-spin" />
      ) : hasError ? (
        <div className="w-4 h-4 text-red-400">⚠</div>
      ) : (
        <CheckCircleIcon className="w-4 h-4 text-green-400" />
      )}
      <span className={`text-xs ${
        hasError ? 'text-red-300' : 'text-gray-300'
      }`}>
        {hasError ? 'Sync error' : lastSync ? getTimeAgo(lastSync) : 'Syncing...'}
      </span>
    </div>
  );
};

export default DataSyncIndicator;
