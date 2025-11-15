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

interface SyncMetadata {
  lastSyncTime: string; // ISO timestamp
  dataType: 'inventory' | 'vendors' | 'boms';
  itemCount: number;
  success: boolean;
}

const REFRESH_INTERVALS = {
  inventory: 5 * 60 * 1000, // 5 minutes
  vendors: 60 * 60 * 1000, // 1 hour
  boms: 60 * 60 * 1000, // 1 hour
};

class AutoSyncService {
  private isRunning = false;
  private hasCredentials = false;

  /**
   * Initialize auto-sync on app load
   */
  async initialize() {
    console.log('[AutoSync] Initializing background sync...');

    // Check if Finale credentials are configured
    const apiKey = localStorage.getItem('finale_api_key') || import.meta.env.VITE_FINALE_API_KEY;
    const apiSecret = localStorage.getItem('finale_api_secret') || import.meta.env.VITE_FINALE_API_SECRET;
    const accountPath = localStorage.getItem('finale_account_path') || import.meta.env.VITE_FINALE_ACCOUNT_PATH;

    if (!apiKey || !apiSecret || !accountPath) {
      console.log('[AutoSync] No Finale credentials - skipping auto-sync');
      return;
    }

    this.hasCredentials = true;

    // Configure sync service
    const syncService = getFinaleSyncService();
    syncService.setCredentials(apiKey, apiSecret, accountPath);

    // Check and sync each data type
    await this.checkAndSync('inventory');
    await this.checkAndSync('vendors');
    await this.checkAndSync('boms');

    console.log('[AutoSync] ✅ Background sync complete');
  }

  /**
   * Check if data needs refresh and sync if needed
   */
  private async checkAndSync(dataType: 'inventory' | 'vendors' | 'boms') {
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
      }

      // Save sync metadata
      await this.saveSyncMetadata({
        dataType,
        lastSyncTime: new Date().toISOString(),
        itemCount,
        success: true,
      });

      console.log(`[AutoSync] ✅ ${dataType} synced: ${itemCount} items`);
    } catch (error) {
      console.error(`[AutoSync] Failed to sync ${dataType}:`, error);
      
      // Save failed sync metadata
      await this.saveSyncMetadata({
        dataType,
        lastSyncTime: new Date().toISOString(),
        itemCount: 0,
        success: false,
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check if data needs refresh based on last sync time
   */
  private needsRefresh(metadata: SyncMetadata | null, dataType: 'inventory' | 'vendors' | 'boms'): boolean {
    if (!metadata || !metadata.lastSyncTime) {
      return true; // Never synced before
    }

    if (!metadata.success) {
      return true; // Last sync failed
    }

    const lastSyncTime = new Date(metadata.lastSyncTime).getTime();
    const now = Date.now();
    const timeSinceSync = now - lastSyncTime;
    const refreshInterval = REFRESH_INTERVALS[dataType];

    return timeSinceSync > refreshInterval;
  }

  /**
   * Get sync metadata from Supabase
   */
  private async getSyncMetadata(dataType: string): Promise<SyncMetadata | null> {
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
