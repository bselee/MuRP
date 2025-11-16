export const SYNC_EVENT_NAME = 'mrp-sync-progress';

export interface SyncEventDetail {
  running: boolean;
  source?: string;
}

export const dispatchSyncEvent = (detail: SyncEventDetail) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SYNC_EVENT_NAME, { detail }));
};
