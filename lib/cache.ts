/**
 * Caching Layer for Services
 * 
 * Provides in-memory caching with TTL (time-to-live) support
 * to reduce unnecessary API calls and improve performance.
 * 
 * Features:
 * - TTL-based expiration
 * - Automatic cleanup of expired entries
 * - Type-safe cache keys
 * - Memory-efficient storage
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
}

class Cache {
  private store: Map<string, CacheEntry<any>>;
  private cleanupInterval: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(cleanupIntervalMs: number = 60000) {
    this.store = new Map();
    this.cleanupInterval = cleanupIntervalMs;
    this.startCleanup();
  }

  /**
   * Set a value in the cache with TTL
   */
  set<T>(key: string, data: T, ttlMs: number = 300000): void {
    this.store.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  /**
   * Get a value from the cache
   * Returns null if not found or expired
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.store.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let activeEntries = 0;
    let expiredEntries = 0;

    this.store.forEach((entry) => {
      if (now - entry.timestamp > entry.ttl) {
        expiredEntries++;
      } else {
        activeEntries++;
      }
    });

    return {
      totalEntries: this.store.size,
      activeEntries,
      expiredEntries,
    };
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.store.forEach((entry, key) => {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => this.store.delete(key));

    if (keysToDelete.length > 0) {
      console.log(`Cache cleanup: Removed ${keysToDelete.length} expired entries`);
    }
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  /**
   * Stop automatic cleanup timer
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Get or set pattern
   * Fetches from cache if available, otherwise executes fetchFn and caches result
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlMs: number = 300000
  ): Promise<T> {
    const cached = this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }

    const data = await fetchFn();
    this.set(key, data, ttlMs);
    return data;
  }

  /**
   * Invalidate all keys matching a pattern
   */
  invalidatePattern(pattern: string | RegExp): number {
    const regex = typeof pattern === 'string' 
      ? new RegExp(pattern.replace(/\*/g, '.*'))
      : pattern;
    
    const keysToDelete: string[] = [];
    
    this.store.forEach((_, key) => {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => this.store.delete(key));
    
    return keysToDelete.length;
  }
}

/**
 * Default cache instance
 * TTL defaults to 5 minutes (300000ms)
 * Cleanup runs every minute
 */
export const cache = new Cache(60000);

/**
 * Specialized cache for inventory data
 * Shorter TTL (1 minute) for frequently changing data
 */
export const inventoryCache = new Cache(30000);

/**
 * Cache key generators for consistency
 */
export const CacheKeys = {
  inventory: (sku?: string) => sku ? `inventory:${sku}` : 'inventory:all',
  inventoryList: () => 'inventory:list',
  inventoryLowStock: () => 'inventory:low-stock',
  
  bom: (id?: string) => id ? `bom:${id}` : 'bom:all',
  bomByFinishedSku: (sku: string) => `bom:finished:${sku}`,
  
  vendor: (id?: string) => id ? `vendor:${id}` : 'vendor:all',
  
  purchaseOrder: (id?: string) => id ? `po:${id}` : 'po:all',
  purchaseOrderByVendor: (vendorId: string) => `po:vendor:${vendorId}`,
  purchaseOrderByStatus: (status: string) => `po:status:${status}`,
  
  requisition: (id?: string) => id ? `requisition:${id}` : 'requisition:all',
  requisitionByStatus: (status: string) => `requisition:status:${status}`,
  
  buildOrder: (id?: string) => id ? `build-order:${id}` : 'build-order:all',
  
  user: (id?: string) => id ? `user:${id}` : 'user:all',
  
  artworkFolder: (id?: string) => id ? `artwork-folder:${id}` : 'artwork-folder:all',
} as const;

/**
 * Clear all inventory-related caches
 */
export function invalidateInventoryCache(): void {
  cache.invalidatePattern(/^inventory:/);
  inventoryCache.clear();
}

/**
 * Clear all BOM-related caches
 */
export function invalidateBomCache(): void {
  cache.invalidatePattern(/^bom:/);
}

/**
 * Clear all purchase order caches
 */
export function invalidatePurchaseOrderCache(): void {
  cache.invalidatePattern(/^po:/);
}

/**
 * Clear all requisition caches
 */
export function invalidateRequisitionCache(): void {
  cache.invalidatePattern(/^requisition:/);
}

/**
 * Clear all caches (nuclear option)
 */
export function clearAllCaches(): void {
  cache.clear();
  inventoryCache.clear();
}

export default cache;
