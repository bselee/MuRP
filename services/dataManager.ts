import type { InventoryItem, Vendor, PurchaseOrder, BuildOrder } from '../types';
import type { IDataAdapter } from './integrations/BaseAdapter';
import { createAdapter, type DataSourceConfig } from './integrations/adapters';

class DataManager {
  private primary: IDataAdapter;
  private fallback: IDataAdapter;
  private cache = new Map<string, { ts: number; data: any }>();

  constructor() {
    this.primary = createAdapter('supabase');
    this.fallback = createAdapter('supabase');
  }

  async initialize(config?: DataSourceConfig) {
    if (config?.primary) {
      this.primary = createAdapter(config.primary);
    }
    await this.primary.connect();
  }

  // Simple 60s in-memory cache helper
  private getCached<T>(key: string): T | null {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.ts < 60_000) return hit.data as T;
    return null;
  }
  private setCached(key: string, data: any) {
    this.cache.set(key, { ts: Date.now(), data });
  }

  async fetchInventory(): Promise<InventoryItem[]> {
    const cached = this.getCached<InventoryItem[]>('inventory');
    if (cached) return cached;
    try {
      const data = await this.primary.fetchInventory();
      this.setCached('inventory', data);
      return data;
    } catch (e) {
      const data = await this.fallback.fetchInventory();
      this.setCached('inventory', data);
      return data;
    }
  }

  async fetchVendors(): Promise<Vendor[]> {
    try { return await this.primary.fetchVendors(); } catch { return this.fallback.fetchVendors(); }
  }
  async fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
    try { return await this.primary.fetchPurchaseOrders(); } catch { return this.fallback.fetchPurchaseOrders(); }
  }
  async fetchBuildOrders(): Promise<BuildOrder[]> {
    try { return await this.primary.fetchBuildOrders(); } catch { return this.fallback.fetchBuildOrders(); }
  }
}

export const dataManager = new DataManager();
