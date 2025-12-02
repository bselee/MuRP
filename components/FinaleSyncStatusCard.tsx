import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase/client';
import { CheckCircleIcon, RefreshIcon, XCircleIcon } from './icons';

type SyncMetaRow = {
  data_type: string;
  last_sync_time: string;
  item_count: number;
  success: boolean;
};

const DATA_TYPES: Array<{ key: string; label: string; description: string }> = [
  { key: 'connection', label: 'API Connection', description: 'Heartbeat (auth status)' },
  { key: 'inventory', label: 'Inventory', description: 'Active SKUs + stock levels' },
  { key: 'vendors', label: 'Vendors', description: 'Supplier directory' },
  { key: 'boms', label: 'BOMs', description: 'Assemblies & components' },
  { key: 'purchase_orders', label: 'Purchase Orders', description: 'Latest Finale POs' },
];

const formatRelativeTime = (iso?: string | null) => {
  if (!iso) return 'Never synced';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Never synced';
  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
};

const FinaleSyncStatusCard: React.FC = () => {
  const [rows, setRows] = useState<Record<string, SyncMetaRow>>({});
  const [loading, setLoading] = useState(false);

  const fetchStatuses = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sync_metadata')
        .select('*')
        .in(
          'data_type',
          DATA_TYPES.map((d) => d.key),
        );
      if (error) throw error;
      const map: Record<string, SyncMetaRow> = {};
      (data || []).forEach((row) => {
        map[row.data_type] = row as SyncMetaRow;
      });
      setRows(map);
    } catch (error) {
      console.error('[FinaleSyncStatusCard] Failed to fetch sync metadata', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatuses();
    const subscription = supabase
      .channel('finale_sync_status')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sync_metadata',
        },
        (payload) => {
          const newRow = payload.new as SyncMetaRow | null;
          if (!newRow) return;
          setRows((prev) => ({ ...prev, [newRow.data_type]: newRow }));
        },
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const statusList = useMemo(
    () =>
      DATA_TYPES.map((meta) => ({
        ...meta,
        row: rows[meta.key],
      })),
    [rows],
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-inner shadow-black/10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-white">Finale Sync Status</h3>
          <p className="text-xs text-gray-400">Autonomous sync health for each dataset</p>
        </div>
        {loading && <RefreshIcon className="w-4 h-4 text-accent-300 animate-spin" />}
      </div>

      <div className="space-y-3">
        {statusList.map(({ key, label, description, row }) => {
          const success = row?.success ?? false;
          const lastSyncLabel = row ? formatRelativeTime(row.last_sync_time) : 'Never synced';
          return (
            <div
              key={key}
              className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-semibold text-white">{label}</p>
                <p className="text-xs text-gray-400">{description}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {row ? `${lastSyncLabel} · ${row.item_count ?? 0} items` : 'Awaiting first sync'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {success ? (
                  <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
                ) : (
                  <XCircleIcon className="w-5 h-5 text-red-400" />
                )}
                <span className={`text-xs font-semibold ${success ? 'text-emerald-300' : 'text-red-300'}`}>
                  {success ? 'Healthy' : 'Check'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FinaleSyncStatusCard;
