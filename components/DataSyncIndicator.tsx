/**
 * Data Sync Indicator
 * 
 * Simple, always-visible indicator showing data freshness.
 * Shows in header - users know data is flowing without thinking about it.
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase/client';
import { RefreshIcon, CheckCircleIcon } from './icons';

const DataSyncIndicator: React.FC = () => {
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Get latest sync time from metadata
    const checkSyncStatus = async () => {
      try {
        const { data } = await supabase
          .from('sync_metadata')
          .select('last_sync_time')
          .order('last_sync_time', { ascending: false })
          .limit(1)
          .single();

        if (data?.last_sync_time) {
          setLastSync(new Date(data.last_sync_time));
        }
      } catch (error) {
        console.error('[DataSync] Error checking sync status:', error);
      }
    };

    checkSyncStatus();

    // Re-check every 30 seconds
    const interval = setInterval(checkSyncStatus, 30000);

    return () => clearInterval(interval);
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
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-full border border-gray-700/50">
      {isSyncing ? (
        <RefreshIcon className="w-4 h-4 text-blue-400 animate-spin" />
      ) : (
        <CheckCircleIcon className="w-4 h-4 text-green-400" />
      )}
      <span className="text-xs text-gray-300">
        {lastSync ? getTimeAgo(lastSync) : 'Syncing...'}
      </span>
    </div>
  );
};

export default DataSyncIndicator;
