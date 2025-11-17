export type SyncHealthRow = {
  data_type: string;
  last_sync_time: string | null;
  item_count: number;
  success: boolean;
  minutes_since_sync: number | null;
  expected_interval_minutes: number;
  is_stale: boolean;
};

export const formatTimeAgo = (date: Date | null, now: number = Date.now()): string => {
  if (!date) return 'Never';
  const seconds = Math.floor((now - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 120) return '1m ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 7200) return '1h ago';
  return `${Math.floor(seconds / 3600)}h ago`;
};

export const pickPrimaryRow = (rows: SyncHealthRow[]): SyncHealthRow | null => {
  if (!rows || rows.length === 0) return null;
  return rows.find((row) => row.data_type === 'inventory') ?? rows[0];
};

export const pickStaleRow = (rows: SyncHealthRow[]): SyncHealthRow | null => {
  if (!rows) return null;
  return rows.find((row) => row.is_stale || !row.success) ?? null;
};

export const buildSyncStatusLabel = (params: {
  showSpinner: boolean;
  staleRow: SyncHealthRow | null;
  lastSyncDate: Date | null;
  now?: number;
}): string => {
  const { showSpinner, staleRow, lastSyncDate, now } = params;
  if (showSpinner) return 'Syncing…';
  if (staleRow) {
    if (staleRow.success === false) {
      return `${staleRow.data_type} failed`;
    }
    return `${staleRow.data_type} stale`;
  }
  if (lastSyncDate) {
    return `Updated ${formatTimeAgo(lastSyncDate, now)}`;
  }
  return 'Waiting for sync';
};

export const formatSyncTooltip = (params: {
  primaryRow: SyncHealthRow | null;
  lastSyncDate: Date | null;
  itemCount: number;
  lastFetchedAt: Date | null;
  now?: number;
}): string => {
  const { primaryRow, lastSyncDate, itemCount, lastFetchedAt, now } = params;
  if (!primaryRow) return 'No sync data available yet.';
  const lastSyncText = formatTimeAgo(lastSyncDate, now);
  const checkedAt = lastFetchedAt ? lastFetchedAt.toLocaleTimeString() : '…';
  return `Last sync: ${lastSyncText}\nRows synced: ${itemCount.toLocaleString()}\nExpected cadence: ${primaryRow.expected_interval_minutes}m\nLast checked: ${checkedAt}`;
};
