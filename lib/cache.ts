// lib/cache.ts
// Caching service with Vercel KV support and fallback to in-memory cache

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

/**
 * In-memory cache fallback when Vercel KV is not available
 */
class InMemoryCache {
  private cache = new Map<string, CacheEntry<any>>()
  
  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key)
    
    if (!entry) {
      return null
    }
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    
    return entry.value as T
  }
  
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const expiresAt = Date.now() + (ttlSeconds * 1000)
    this.cache.set(key, { value, expiresAt })
  }
  
  async del(key: string): Promise<void> {
    this.cache.delete(key)
  }
  
  async keys(pattern: string): Promise<string[]> {
    // Simple pattern matching (supports * wildcard)
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
    return Array.from(this.cache.keys()).filter(key => regex.test(key))
  }
  
  // Cleanup expired entries periodically
  cleanup() {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }
}

// Singleton in-memory cache
const memoryCache = new InMemoryCache()

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => memoryCache.cleanup(), 5 * 60 * 1000)
}

/**
 * Cache service with automatic fallback
 */
export class CacheService {
  private isVercelKV: boolean
  
  constructor() {
    // Check if Vercel KV is available
    this.isVercelKV = !!(
      process.env.KV_REST_API_URL && 
      process.env.KV_REST_API_TOKEN
    )
    
    if (!this.isVercelKV) {
      console.warn('⚠️  Vercel KV not configured, using in-memory cache')
    }
  }
  
  /**
   * Get a cached value
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      if (this.isVercelKV) {
        // Vercel KV implementation
        const { kv } = await import('@vercel/kv')
        return await kv.get<T>(key)
      } else {
        // Fallback to in-memory
        return await memoryCache.get<T>(key)
      }
    } catch (error) {
      console.error('Cache get error:', error)
      return null
    }
  }
  
  /**
   * Set a cached value with TTL (time to live in seconds)
   */
  async set<T = any>(key: string, value: T, ttlSeconds: number = 3600): Promise<void> {
    try {
      if (this.isVercelKV) {
        const { kv } = await import('@vercel/kv')
        await kv.set(key, value, { ex: ttlSeconds })
      } else {
        await memoryCache.set(key, value, ttlSeconds)
      }
    } catch (error) {
      console.error('Cache set error:', error)
      // Don't throw - cache failures shouldn't break the app
    }
  }
  
  /**
   * Delete a cached value
   */
  async del(key: string): Promise<void> {
    try {
      if (this.isVercelKV) {
        const { kv } = await import('@vercel/kv')
        await kv.del(key)
      } else {
        await memoryCache.del(key)
      }
    } catch (error) {
      console.error('Cache del error:', error)
    }
  }
  
  /**
   * Get or set a cached value (cache-aside pattern)
   */
  async getOrSet<T = any>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = 3600
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key)
    if (cached !== null) {
      return cached
    }
    
    // Fetch fresh data
    const fresh = await fetchFn()
    
    // Cache it
    await this.set(key, fresh, ttlSeconds)
    
    return fresh
  }
  
  /**
   * Invalidate multiple keys by pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      if (this.isVercelKV) {
        const { kv } = await import('@vercel/kv')
        const keys = await kv.keys(pattern)
        if (keys.length > 0) {
          await kv.del(...keys)
        }
      } else {
        const keys = await memoryCache.keys(pattern)
        for (const key of keys) {
          await memoryCache.del(key)
        }
      }
    } catch (error) {
      console.error('Cache invalidate pattern error:', error)
    }
  }
  
  /**
   * Invalidate related cache entries
   */
  async invalidateRelated(entity: string, id?: string): Promise<void> {
    const patterns = [
      `${entity}:*`,
      `${entity}s:*`, // Plural form
    ]
    
    if (id) {
      patterns.push(`${entity}:${id}:*`)
    }
    
    for (const pattern of patterns) {
      await this.invalidatePattern(pattern)
    }
  }
}

// Export singleton instance
export const cache = new CacheService()

/**
 * Cache key generators for consistency
 */
export const CacheKeys = {
  // Inventory
  inventory: {
    all: () => 'inventory:all',
    byCategory: (category: string) => `inventory:category:${category}`,
    bySku: (sku: string) => `inventory:sku:${sku}`,
    lowStock: () => 'inventory:low-stock',
  },
  
  // BOMs
  bom: {
    all: () => 'boms:all',
    byId: (id: string) => `bom:${id}`,
    bySku: (sku: string) => `bom:sku:${sku}`,
    buildability: (sku: string) => `buildability:${sku}`,
  },
  
  // Purchase Orders
  po: {
    all: () => 'pos:all',
    byId: (id: string) => `po:${id}`,
    byVendor: (vendorId: string) => `pos:vendor:${vendorId}`,
    byStatus: (status: string) => `pos:status:${status}`,
  },
  
  // Requisitions
  requisition: {
    all: () => 'requisitions:all',
    byId: (id: string) => `requisition:${id}`,
    byRequester: (userId: string) => `requisitions:user:${userId}`,
    byStatus: (status: string) => `requisitions:status:${status}`,
  },
  
  // Build Orders
  build: {
    all: () => 'builds:all',
    byId: (id: string) => `build:${id}`,
    byStatus: (status: string) => `builds:status:${status}`,
    byAssignee: (userId: string) => `builds:assignee:${userId}`,
  },
  
  // Vendors
  vendor: {
    all: () => 'vendors:all',
    byId: (id: string) => `vendor:${id}`,
  },
  
  // Users
  user: {
    byId: (id: string) => `user:${id}`,
    role: (id: string) => `user:${id}:role`,
  },
}

/**
 * Standard cache TTLs (in seconds)
 */
export const CacheTTL = {
  SHORT: 60,        // 1 minute - frequently changing data
  MEDIUM: 300,      // 5 minutes - moderately stable data
  LONG: 3600,       // 1 hour - relatively stable data
  VERY_LONG: 86400, // 24 hours - very stable data
}
