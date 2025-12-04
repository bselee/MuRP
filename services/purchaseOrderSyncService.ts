/**
 * Purchase Order Sync Service
 * 
 * Provides real-time-ish syncing of purchase orders from Finale to MuRP Supabase
 * 
 * Features:
 * - Delta sync (only fetch changed POs since last sync)
 * - Full sync (initial import or recovery)
 * - Automatic scheduling (every 15 minutes)
 * - On-demand manual sync
 * - Data transformation (Finale GraphQL → Supabase schema)
 * - Inventory intelligence integration
 * 
 * Data Flow:
 * Finale GraphQL → Transform → Supabase → Inventory Intelligence → UI
 * 
 * @see /docs/PURCHASE_ORDER_SYNC_ARCHITECTURE.md
 */

import { supabase } from '../lib/supabase/client';
import { getFinaleGraphQLClient } from '../lib/finale/graphql-client';
import type { FinalePurchaseOrder } from '../lib/finale/types';

export interface SyncResult {
  success: boolean;
  syncType: 'full' | 'delta';
  timestamp: string;
  duration: number;
  stats: {
    fetched: number;
    inserted: number;
    updated: number;
    errors: number;
  };
  errors?: Array<{ message: string; details?: any }>;
}

export interface SyncStatus {
  isRunning: boolean;
  lastSyncTime: string | null;
  lastSyncResult: SyncResult | null;
  nextScheduledSync: string | null;
  autoSyncEnabled: boolean;
}

class PurchaseOrderSyncService {
  private syncInterval: number | null = null;
  private isSyncing: boolean = false;
  private lastSyncTime: Date | null = null;
  private lastSyncResult: SyncResult | null = null;
  private autoSyncEnabled: boolean = false;
  private syncFrequencyMs: number = 15 * 60 * 1000; // 15 minutes

  /**
   * Start automatic syncing every N minutes
   */
  startAutoSync(frequencyMinutes: number = 15): void {
    if (this.syncInterval) {
      this.stopAutoSync();
    }

    this.syncFrequencyMs = frequencyMinutes * 60 * 1000;
    this.autoSyncEnabled = true;

    console.log(`🔄 Starting auto-sync: every ${frequencyMinutes} minutes`);

    // Run initial sync immediately
    this.syncPurchaseOrders('delta').catch(err => {
      console.error('Initial auto-sync failed:', err);
    });

    // Schedule recurring syncs
    this.syncInterval = window.setInterval(() => {
      if (!this.isSyncing) {
        this.syncPurchaseOrders('delta').catch(err => {
          console.error('Scheduled sync failed:', err);
        });
      } else {
        console.log('Skipping scheduled sync - previous sync still running');
      }
    }, this.syncFrequencyMs);
  }

  /**
   * Stop automatic syncing
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      this.autoSyncEnabled = false;
      console.log('⏹️ Auto-sync stopped');
    }
  }

  /**
   * Main sync method - can be called manually or by scheduler
   */
  async syncPurchaseOrders(syncType: 'full' | 'delta' = 'delta'): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        syncType,
        timestamp: new Date().toISOString(),
        duration: 0,
        stats: { fetched: 0, inserted: 0, updated: 0, errors: 1 },
        errors: [{ message: 'Sync already in progress' }],
      };
    }

    this.isSyncing = true;
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      syncType,
      timestamp: new Date().toISOString(),
      duration: 0,
      stats: { fetched: 0, inserted: 0, updated: 0, errors: 0 },
      errors: [],
    };

    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🚀 Starting ${syncType.toUpperCase()} purchase order sync`);
      console.log(`Timestamp: ${result.timestamp}`);
      console.log('='.repeat(60));

      // Get GraphQL client
      const client = getFinaleGraphQLClient();
      if (!client) {
        throw new Error('Finale GraphQL client not configured');
      }

      // Fetch purchase orders from Finale
      let finalePOs: FinalePurchaseOrder[] = [];
      
      if (syncType === 'full') {
        console.log('📥 Fetching ALL purchase orders (full sync)...');
        finalePOs = await client.fetchAllPurchaseOrders();
      } else {
        // Delta sync - only fetch POs modified since last sync
        const lastSyncTimestamp = this.lastSyncTime?.toISOString() || 
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // Default: last 30 days
        
        console.log(`📥 Fetching POs modified since ${lastSyncTimestamp}...`);
        finalePOs = await client.fetchRecentPurchaseOrders(lastSyncTimestamp);
      }

      result.stats.fetched = finalePOs.length;
      console.log(`✅ Fetched ${finalePOs.length} purchase orders from Finale`);

      if (finalePOs.length === 0) {
        console.log('ℹ️ No purchase orders to sync');
        result.success = true;
        result.duration = Date.now() - startTime;
        this.lastSyncResult = result;
        this.lastSyncTime = new Date();
        return result;
      }

      // Transform and upsert to Supabase
      console.log('🔄 Transforming and upserting to Supabase...');
      const { inserted, updated, errors } = await this.upsertPurchaseOrders(finalePOs);

      result.stats.inserted = inserted;
      result.stats.updated = updated;
      result.stats.errors = errors.length;
      result.errors = errors;
      result.success = errors.length === 0;

      console.log(`\n📊 Sync Results:`);
      console.log(`   Fetched: ${result.stats.fetched}`);
      console.log(`   Inserted: ${result.stats.inserted}`);
      console.log(`   Updated: ${result.stats.updated}`);
      console.log(`   Errors: ${result.stats.errors}`);
      
      if (errors.length > 0) {
        console.error('❌ Errors during sync:', errors);
      } else {
        console.log('✅ Sync completed successfully!');
      }

      // Update inventory intelligence (calculate on-order quantities)
      await this.updateInventoryIntelligence();

      this.lastSyncTime = new Date();
      this.lastSyncResult = result;
      result.duration = Date.now() - startTime;

      console.log(`⏱️ Duration: ${(result.duration / 1000).toFixed(2)}s`);
      console.log('='.repeat(60) + '\n');

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
      console.error('❌ Sync failed:', errorMessage);
      
      result.errors?.push({ message: errorMessage, details: error });
      result.stats.errors++;
      result.duration = Date.now() - startTime;
      this.lastSyncResult = result;

      return result;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Transform Finale POs to Supabase schema and upsert
   */
  private async upsertPurchaseOrders(finalePOs: FinalePurchaseOrder[]): Promise<{
    inserted: number;
    updated: number;
    errors: Array<{ message: string; details?: any }>;
  }> {
    let inserted = 0;
    let updated = 0;
    const errors: Array<{ message: string; details?: any }> = [];

    for (const po of finalePOs) {
      try {
        // Transform to Supabase schema
        const poData = {
          order_id: po.orderId,
          vendor_id: po.supplier,
          vendor_name: po.supplierName,
          status: this.mapFinaleStatusToMuRP(po.status),
          order_date: po.orderDate,
          expected_date: po.expectedDate,
          received_date: po.receivedDate,
          subtotal: po.subtotal,
          tax: po.tax,
          shipping: po.shipping,
          total: po.total,
          facility_id: po.facilityId,
          facility_name: po.facilityName,
          notes: po.notes,
          finale_last_updated: po.lastUpdated,
        };

        // Upsert PO (on conflict update)
        const { data: existingPO, error: checkError } = await supabase
          .from('purchase_orders')
          .select('id')
          .eq('order_id', po.orderId)
          .single();

        if (checkError && checkError.code !== 'PGRST116') { // Not "not found" error
          throw checkError;
        }

        const isUpdate = !!existingPO;

        const { error: upsertError } = await supabase
          .from('purchase_orders')
          .upsert(poData, {
            onConflict: 'order_id',
            ignoreDuplicates: false,
          });

        if (upsertError) {
          throw upsertError;
        }

        // Get the PO ID for line items
        const { data: upsertedPO, error: fetchError } = await supabase
          .from('purchase_orders')
          .select('id')
          .eq('order_id', po.orderId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        // Upsert line items
        if (po.lineItems && po.lineItems.length > 0) {
          const lineItemsData = po.lineItems.map(item => ({
            po_id: upsertedPO.id,
            product_id: item.productId,
            quantity: item.quantity,
            unit_cost: item.unitCost,
            total: item.total,
            received_quantity: item.receivedQuantity,
          }));

          // Delete existing line items for this PO
          await supabase
            .from('purchase_order_items')
            .delete()
            .eq('po_id', upsertedPO.id);

          // Insert new line items
          const { error: lineItemsError } = await supabase
            .from('purchase_order_items')
            .insert(lineItemsData);

          if (lineItemsError) {
            console.error(`Error inserting line items for PO ${po.orderId}:`, lineItemsError);
          }
        }

        if (isUpdate) {
          updated++;
        } else {
          inserted++;
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          message: `Failed to upsert PO ${po.orderId}: ${errorMessage}`,
          details: error,
        });
      }
    }

    return { inserted, updated, errors };
  }

  /**
   * Map Finale status to MuRP status
   */
  private mapFinaleStatusToMuRP(finaleStatus: string): string {
    const statusMap: Record<string, string> = {
      'Pending': 'pending',
      'Submitted': 'submitted',
      'Completed': 'received',
      'Partially Received': 'partially_received',
      'Cancelled': 'cancelled',
      'Draft': 'draft',
    };

    return statusMap[finaleStatus] || finaleStatus.toLowerCase();
  }

  /**
   * Update inventory intelligence based on PO data
   * Calculates on-order quantities, lead times, vendor performance, etc.
   */
  private async updateInventoryIntelligence(): Promise<void> {
    try {
      console.log('🧠 Updating inventory intelligence...');

      // Calculate on-order quantities per product
      const { data: onOrderData, error: onOrderError } = await supabase
        .rpc('calculate_on_order_quantities');

      if (onOrderError) {
        console.error('Error calculating on-order quantities:', onOrderError);
      } else {
        console.log(`✅ Updated on-order quantities for ${onOrderData?.length || 0} products`);
      }

      // Calculate vendor lead times
      const { data: leadTimeData, error: leadTimeError } = await supabase
        .rpc('calculate_vendor_lead_times');

      if (leadTimeError) {
        console.error('Error calculating lead times:', leadTimeError);
      } else {
        console.log(`✅ Updated lead times for ${leadTimeData?.length || 0} vendors`);
      }

      console.log('✅ Inventory intelligence updated');
    } catch (error) {
      console.error('Error updating inventory intelligence:', error);
    }
  }

  /**
   * Get current sync status
   */
  getSyncStatus(): SyncStatus {
    return {
      isRunning: this.isSyncing,
      lastSyncTime: this.lastSyncTime?.toISOString() || null,
      lastSyncResult: this.lastSyncResult,
      nextScheduledSync: this.autoSyncEnabled 
        ? new Date(Date.now() + this.syncFrequencyMs).toISOString()
        : null,
      autoSyncEnabled: this.autoSyncEnabled,
    };
  }

  /**
   * Manual trigger for full sync
   */
  async triggerFullSync(): Promise<SyncResult> {
    console.log('🔄 Manual full sync triggered');
    return this.syncPurchaseOrders('full');
  }

  /**
   * Manual trigger for delta sync
   */
  async triggerDeltaSync(): Promise<SyncResult> {
    console.log('🔄 Manual delta sync triggered');
    return this.syncPurchaseOrders('delta');
  }

  /**
   * Cleanup on disposal
   */
  dispose(): void {
    this.stopAutoSync();
  }
}

// Singleton instance
const purchaseOrderSyncService = new PurchaseOrderSyncService();

export default purchaseOrderSyncService;

// Export convenience methods
export const startPOAutoSync = (frequencyMinutes?: number) => 
  purchaseOrderSyncService.startAutoSync(frequencyMinutes);

export const stopPOAutoSync = () => 
  purchaseOrderSyncService.stopAutoSync();

export const triggerPOSync = (type: 'full' | 'delta' = 'delta') => 
  type === 'full' 
    ? purchaseOrderSyncService.triggerFullSync()
    : purchaseOrderSyncService.triggerDeltaSync();

export const getPOSyncStatus = () => 
  purchaseOrderSyncService.getSyncStatus();
