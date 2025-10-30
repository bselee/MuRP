import type { InventoryItem, Vendor, PurchaseOrder, BuildOrder } from '../types';
import { DataError, DataErrorCode } from './errors';
import type { IDataAdapter } from './integrations/BaseAdapter';
import { createAdapter, type DataSourceConfig } from './integrations/adapters';

export interface CacheConfig {
  enabled: boolean;
  ttlByEntity?: Partial<Record<'inventory' | 'vendors' | 'purchaseOrders' | 'buildOrders', number>>;
}

class DataManager {
  private primary: IDataAdapter;
  private fallback: IDataAdapter;
  private cache = new Map<string, { ts: number; data: any }>();
  private cacheConfig: CacheConfig = {
    enabled: true,
    ttlByEntity: {
      inventory: 60_000,
      vendors: 300_000,
      purchaseOrders: 120_000,
      buildOrders: 60_000,
    },
  };

  constructor() {
    this.primary = createAdapter('supabase');
    this.fallback = createAdapter('supabase');
  }

  async initialize(config?: DataSourceConfig, cache?: CacheConfig) {
    if (config?.primary) {
      this.primary = createAdapter(config.primary);
    }
    if (cache) this.cacheConfig = { ...this.cacheConfig, ...cache, ttlByEntity: { ...this.cacheConfig.ttlByEntity, ...cache.ttlByEntity } };
    await this.primary.connect();
  }

  // Simple 60s in-memory cache helper
  private getCached<T>(key: keyof CacheConfig['ttlByEntity']): T | null {
    if (!this.cacheConfig.enabled) return null;
    const hit = this.cache.get(key);
    const ttl = this.cacheConfig.ttlByEntity?.[key] ?? 60_000;
    if (hit && Date.now() - hit.ts < ttl) return hit.data as T;
    return null;
  }
  private setCached(key: keyof CacheConfig['ttlByEntity'], data: any) {
    if (!this.cacheConfig.enabled) return;
    this.cache.set(key, { ts: Date.now(), data });
  }

  async fetchInventory(): Promise<InventoryItem[]> {
    const cached = this.getCached<InventoryItem[]>('inventory');
    if (cached) return cached;
    try {
      const data = await this.primary.fetchInventory();
      this.setCached('inventory', data);
      return data;
    } catch (e: any) {
      if (e instanceof DataError) {
        if (e.code === DataErrorCode.AUTH_FAILED || e.code === DataErrorCode.INVALID_DATA) {
          throw e;
        }
      }
      const data = await this.fallback.fetchInventory();
      this.setCached('inventory', data);
      return data;
    }
  }

  async fetchVendors(): Promise<Vendor[]> {
    try { return await this.primary.fetchVendors(); } catch (e: any) {
      if (e instanceof DataError && (e.code === DataErrorCode.AUTH_FAILED || e.code === DataErrorCode.INVALID_DATA)) throw e;
      return this.fallback.fetchVendors();
    }
  }
  async fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
    try { return await this.primary.fetchPurchaseOrders(); } catch (e: any) {
      if (e instanceof DataError && (e.code === DataErrorCode.AUTH_FAILED || e.code === DataErrorCode.INVALID_DATA)) throw e;
      return this.fallback.fetchPurchaseOrders();
    }
  }
  async fetchBuildOrders(): Promise<BuildOrder[]> {
    try { return await this.primary.fetchBuildOrders(); } catch (e: any) {
      if (e instanceof DataError && (e.code === DataErrorCode.AUTH_FAILED || e.code === DataErrorCode.INVALID_DATA)) throw e;
      return this.fallback.fetchBuildOrders();
    }
  }
}

export const dataManager = new DataManager();
