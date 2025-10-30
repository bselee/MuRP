import type { IDataAdapter } from './BaseAdapter';
import type { InventoryItem, Vendor, PurchaseOrder, BuildOrder } from '../../types';
import {
  fetchInventory as sbFetchInventory,
  fetchVendors as sbFetchVendors,
  fetchPurchaseOrders as sbFetchPOs,
  fetchBuildOrders as sbFetchBuildOrders,
} from '../dataService';

export class SupabaseAdapter implements IDataAdapter {
  readonly name = 'Supabase';
  readonly type = 'database' as const;

  async connect(): Promise<boolean> {
    // Supabase client is initialized at app startup, so just do a tiny probe
    try {
      await sbFetchInventory();
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    // No persistent connection to tear down in browser
    return;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await sbFetchVendors();
      return true;
    } catch {
      return false;
    }
  }

  async fetchInventory(): Promise<InventoryItem[]> {
    return sbFetchInventory();
  }

  async fetchVendors(): Promise<Vendor[]> {
    return sbFetchVendors();
  }

  async fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
    return sbFetchPOs();
  }

  async fetchBuildOrders(): Promise<BuildOrder[]> {
    return sbFetchBuildOrders();
  }

  supportsRealtime(): boolean { return true; }
  supportsWebhooks(): boolean { return false; }
  async getLastSyncTime(): Promise<Date | null> { return null; }
}
