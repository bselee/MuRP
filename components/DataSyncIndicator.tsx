/**
 * Data Sync Indicator
 * 
 * Simple, always-visible indicator showing data freshness.
 * Shows in header - users know data is flowing without thinking about it.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase/client';
import { RefreshIcon, CheckCircleIcon } from './icons';
import { SYNC_EVENT_NAME, type SyncEventDetail } from '../lib/syncEventBus';
import {
  buildSyncStatusLabel,
  formatSyncTooltip,
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

  const primaryRow = useMemo(() => pickPrimaryRow(healthRows), [healthRows]);
  const staleRow = useMemo(() => pickStaleRow(healthRows), [healthRows]);

  const lastSyncDate = primaryRow?.last_sync_time ? new Date(primaryRow.last_sync_time) : null;
  const itemCount = primaryRow?.item_count ?? 0;
  const showSpinner = isGlobalLoading || isSyncing || isFetching;
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

  const titleDetails = useMemo(
    () =>
      formatSyncTooltip({
        primaryRow,
        lastSyncDate,
        itemCount,
        lastFetchedAt,
      }),
    [primaryRow, lastSyncDate, itemCount, lastFetchedAt],
  );

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors ${
        hasIssue
          ? 'bg-red-500/10 border-red-500/30'
          : 'bg-gray-800/50 border-gray-700/50'
      }`}
      title={titleDetails}
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
  );
};

export default DataSyncIndicator;
