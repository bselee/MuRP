/**
 * Auto-Sync Service
 * 
 * Automatically syncs Finale data to Supabase in the background when the app loads.
 * Users never need to think about it - data is just there and always fresh.
 * 
 * Strategy:
 * 1. On app mount, check if data needs refresh (based on last sync time)
 * 2. Silently sync in background if needed
 * 3. Store data in Supabase
 * 4. App reads from Supabase (always fast, always available)
 * 
 * Refresh intervals:
 * - Inventory: 5 minutes (frequently changing)
 * - Vendors: 1 hour (rarely changes)
 * - BOMs: 1 hour (rarely changes)
 */

import { getFinaleSyncService } from './finaleSyncService';
import { supabase } from '../lib/supabase/client';
import { emitSystemAlert } from '../lib/systemAlerts/alertBus';

type DataType = 'inventory' | 'vendors' | 'boms' | 'purchase_orders' | 'connection';

interface SyncMetadata {
  lastSyncTime: string; // ISO timestamp
  dataType: DataType;
  itemCount: number;
  success: boolean;
}

const REFRESH_INTERVALS: Record<Exclude<DataType, 'connection'>, number> & { connection?: number } = {
  inventory: 5 * 60 * 1000, // 5 minutes
  vendors: 60 * 60 * 1000, // 1 hour
  boms: 60 * 60 * 1000, // 1 hour
  purchase_orders: 15 * 60 * 1000, // 15 minutes
};

class AutoSyncService {
  private isRunning = false;
  private hasCredentials = false;
  private retryTimers: Map<DataType, NodeJS.Timeout> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private connectionFailureCount = 0;
  private connectionAlertActive = false;
  private retryTimers: Map<DataType, NodeJS.Timeout> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize auto-sync on app load
   */
  async initialize() {
    console.log('[AutoSync] Initializing background sync...');

    // Check if Finale credentials are configured
    const readStorage = (key: string) =>
      typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    const apiKey = readStorage('finale_api_key') || import.meta.env.VITE_FINALE_API_KEY;
    const apiSecret = readStorage('finale_api_secret') || import.meta.env.VITE_FINALE_API_SECRET;
    const accountPath = readStorage('finale_account_path') || import.meta.env.VITE_FINALE_ACCOUNT_PATH;
    const baseUrl =
      readStorage('finale_base_url') ||
      import.meta.env.VITE_FINALE_BASE_URL ||
      'https://app.finaleinventory.com';

    if (!apiKey || !apiSecret || !accountPath) {
      console.log('[AutoSync] No Finale credentials - skipping auto-sync');
      return;
    }

    this.hasCredentials = true;

    // Configure sync service
    const syncService = getFinaleSyncService();
    syncService.setCredentials(apiKey, apiSecret, accountPath, baseUrl);

    // Check and sync each data type
    await this.checkAndSync('inventory');
    await this.checkAndSync('vendors');
    await this.checkAndSync('boms');
    await this.checkAndSync('purchase_orders');

    this.startConnectionHeartbeat(syncService);

    console.log('[AutoSync] ✅ Background sync complete');
  }

  /**
   * Check if data needs refresh and sync if needed
   */
  private async checkAndSync(dataType: DataType) {
    if (this.isRunning) {
      console.log(`[AutoSync] Sync already running for ${dataType}, skipping`);
      return;
    }

    try {
      // Check last sync time from Supabase
      const metadata = await this.getSyncMetadata(dataType);
      const needsSync = this.needsRefresh(metadata, dataType);

      if (!needsSync) {
        console.log(`[AutoSync] ${dataType} is fresh (last sync: ${metadata?.lastSyncTime}), skipping`);
        return;
      }

      console.log(`[AutoSync] ${dataType} needs refresh, syncing in background...`);
      this.isRunning = true;

      // Sync data
      const syncService = getFinaleSyncService();
      let itemCount = 0;

      switch (dataType) {
        case 'inventory':
          await syncService.syncInventoryFromCSV();
          itemCount = await this.getDataCount('inventory_items');
          break;
        case 'vendors':
          await syncService.syncVendors();
          itemCount = await this.getDataCount('vendors');
          break;
        case 'boms':
          await syncService.syncBOMsFromCSV();
          itemCount = await this.getDataCount('boms');
          break;
        case 'purchase_orders':
          await syncService.syncPurchaseOrders();
          itemCount = await this.getDataCount('purchase_orders');
          break;
      }

      // Save sync metadata
      await this.saveSyncMetadata({
        dataType,
        lastSyncTime: new Date().toISOString(),
        itemCount,
        success: true,
      });

      console.log(`[AutoSync] ✅ ${dataType} synced: ${itemCount} items`);
      this.clearRetry(dataType);
    } catch (error) {
      console.error(`[AutoSync] Failed to sync ${dataType}:`, error);
      
      // Save failed sync metadata
      await this.saveSyncMetadata({
        dataType,
        lastSyncTime: new Date().toISOString(),
        itemCount: 0,
        success: false,
      });

      this.scheduleRetry(dataType);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check if data needs refresh based on last sync time
   */
  private needsRefresh(metadata: SyncMetadata | null, dataType: DataType): boolean {
    if (!metadata || !metadata.lastSyncTime) {
      return true; // Never synced before
    }

    if (!metadata.success) {
      return true; // Last sync failed
    }

    const lastSyncTime = new Date(metadata.lastSyncTime).getTime();
    const now = Date.now();
    const timeSinceSync = now - lastSyncTime;
    const intervalMap: Record<string, number> = REFRESH_INTERVALS as Record<string, number>;
    const refreshInterval = intervalMap[dataType] ?? REFRESH_INTERVALS.inventory;

    return timeSinceSync > refreshInterval;
  }

  /**
   * Get sync metadata from Supabase
   */
  private async getSyncMetadata(dataType: DataType): Promise<SyncMetadata | null> {
    try {
      const { data, error } = await supabase
        .from('sync_metadata')
        .select('*')
        .eq('data_type', dataType)
        .single();

      if (error) {
        console.log(`[AutoSync] No metadata found for ${dataType}, will create on first sync`);
        return null;
      }

      return {
        dataType: data.data_type,
        lastSyncTime: data.last_sync_time,
        itemCount: data.item_count,
        success: data.success,
      };
    } catch (error) {
      console.error(`[AutoSync] Error getting metadata for ${dataType}:`, error);
      return null;
    }
  }

  /**
   * Save sync metadata to Supabase
   */
  private async saveSyncMetadata(metadata: SyncMetadata) {
    try {
      const { error } = await supabase
        .from('sync_metadata')
        .upsert({
          data_type: metadata.dataType,
          last_sync_time: metadata.lastSyncTime,
          item_count: metadata.itemCount,
          success: metadata.success,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'data_type',
        });

      if (error) {
        console.error('[AutoSync] Error saving metadata:', error);
      }
    } catch (error) {
      console.error('[AutoSync] Error saving metadata:', error);
    }
  }

  private scheduleRetry(dataType: DataType) {
    if (this.retryTimers.has(dataType)) {
      return;
    }

    const delayMs = 2 * 60 * 1000; // 2 minutes
    console.log(`[AutoSync] Scheduling retry for ${dataType} in ${delayMs / 1000}s`);
    const timer = setTimeout(() => {
      this.retryTimers.delete(dataType);
      this.checkAndSync(dataType);
    }, delayMs);
    this.retryTimers.set(dataType, timer);
  }

  private clearRetry(dataType: DataType) {
    const timer = this.retryTimers.get(dataType);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(dataType);
    }
  }

  private startConnectionHeartbeat(syncService: ReturnType<typeof getFinaleSyncService>) {
    if (!this.hasCredentials) return;

    const runHeartbeat = async () => {
      try {
        const result = await syncService.testConnection();
        await this.saveSyncMetadata({
          dataType: 'connection',
          lastSyncTime: new Date().toISOString(),
          itemCount: result.success ? 1 : 0,
          success: result.success,
        });
        if (!result.success) {
          console.warn('[AutoSync] Finale connection heartbeat failed:', result.message);
        }
      } catch (error) {
        console.error('[AutoSync] Finale heartbeat error:', error);
        await this.saveSyncMetadata({
          dataType: 'connection',
          lastSyncTime: new Date().toISOString(),
          itemCount: 0,
          success: false,
        });
      }
    };

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    runHeartbeat();
    this.heartbeatInterval = setInterval(runHeartbeat, 15 * 60 * 1000);
  }

  /**
   * Get count of items in a Supabase table
   */
  private async getDataCount(tableName: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.error(`[AutoSync] Error counting ${tableName}:`, error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error(`[AutoSync] Error counting ${tableName}:`, error);
      return 0;
    }
  }

  /**
   * Force sync all data (for manual refresh)
   */
  async forceSyncAll() {
    console.log('[AutoSync] Force syncing all data...');
    
    const syncService = getFinaleSyncService();
    await syncService.syncAll();
    
    console.log('[AutoSync] ✅ Force sync complete');
  }

  private scheduleRetry(dataType: DataType) {
    if (this.retryTimers.has(dataType)) return;
    const delayMs = 2 * 60 * 1000;
    console.log(`[AutoSync] Scheduling retry for ${dataType} in ${delayMs / 1000}s`);
    const timer = setTimeout(() => {
      this.retryTimers.delete(dataType);
      this.checkAndSync(dataType);
    }, delayMs);
    this.retryTimers.set(dataType, timer);
  }

  private clearRetry(dataType: DataType) {
    const timer = this.retryTimers.get(dataType);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(dataType);
    }
  }

  private startConnectionHeartbeat(syncService: ReturnType<typeof getFinaleSyncService>) {
    if (!this.hasCredentials) return;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    const runHeartbeat = async () => {
      try {
        const result = await syncService.testConnection();
        await this.saveSyncMetadata({
          dataType: 'connection',
          lastSyncTime: new Date().toISOString(),
          itemCount: result.success ? 1 : 0,
          success: result.success,
        });
        if (result.success) {
          this.connectionFailureCount = 0;
          if (this.connectionAlertActive) {
            emitSystemAlert({
              source: 'finale-connection',
              severity: 'warning',
              message: 'Finale API connection restored.',
            });
            this.connectionAlertActive = false;
          }
        } else {
          this.handleConnectionFailure(result.message || 'Connection failed');
        }
      } catch (error) {
        this.handleConnectionFailure(error instanceof Error ? error.message : 'Connection error');
      }
    };

    runHeartbeat();
    this.heartbeatInterval = setInterval(runHeartbeat, 60 * 60 * 1000); // hourly
  }

  private handleConnectionFailure(details: string) {
    this.connectionFailureCount += 1;
    console.warn('[AutoSync] Finale connection heartbeat failed:', details);
    if (this.connectionFailureCount >= 2 && !this.connectionAlertActive) {
      emitSystemAlert({
        source: 'finale-connection',
        severity: 'warning',
        message: 'Finale API credentials appear invalid. Re-authenticate in Settings.',
        details,
      });
      this.connectionAlertActive = true;
    }
  }
}

// Singleton instance
let autoSyncInstance: AutoSyncService | null = null;

export function getAutoSyncService(): AutoSyncService {
  if (!autoSyncInstance) {
    autoSyncInstance = new AutoSyncService();
  }
  return autoSyncInstance;
}

export default getAutoSyncService;
