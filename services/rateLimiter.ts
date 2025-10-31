/**
 * Rate Limiter Service
 * 
 * Implements multi-layer rate limiting:
 * - Per-user limits (60 requests/minute by default)
 * - Application-wide limits (1000 requests/hour by default)
 * - Automatic request queuing when limits are hit
 */

interface RateLimitConfig {
  maxRequestsPerWindow: number;
  windowMs: number;
  userId?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  queue: Array<() => void>;
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Check if a request can proceed or needs to be queued
   */
  async checkLimit(key: string): Promise<void> {
    const now = Date.now();
    const limitKey = this.config.userId ? `${key}:${this.config.userId}` : key;
    
    let entry = this.limits.get(limitKey);
    
    // Initialize or reset if window expired
    if (!entry || now >= entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + this.config.windowMs,
        queue: []
      };
      this.limits.set(limitKey, entry);
    }

    // If under limit, allow immediately
    if (entry.count < this.config.maxRequestsPerWindow) {
      entry.count++;
      return Promise.resolve();
    }

    // Otherwise, queue the request
    return new Promise<void>((resolve) => {
      entry.queue.push(resolve);
      
      // Schedule processing when window resets
      const waitTime = entry.resetTime - now;
      setTimeout(() => {
        this.processQueue(limitKey);
      }, waitTime);
    });
  }

  /**
   * Process queued requests after window reset
   */
  private processQueue(key: string): void {
    const entry = this.limits.get(key);
    if (!entry || entry.queue.length === 0) return;

    const now = Date.now();
    
    // Reset the window
    entry.count = 0;
    entry.resetTime = now + this.config.windowMs;

    // Process as many requests as the limit allows
    const toProcess = Math.min(
      entry.queue.length,
      this.config.maxRequestsPerWindow
    );

    for (let i = 0; i < toProcess; i++) {
      const resolve = entry.queue.shift();
      if (resolve) {
        entry.count++;
        resolve();
      }
    }

    // Schedule next processing if queue still has items
    if (entry.queue.length > 0) {
      setTimeout(() => {
        this.processQueue(key);
      }, this.config.windowMs);
    }
  }

  /**
   * Get current rate limit status
   */
  getStatus(key: string): { remaining: number; resetTime: number } {
    const now = Date.now();
    const limitKey = this.config.userId ? `${key}:${this.config.userId}` : key;
    const entry = this.limits.get(limitKey);

    if (!entry || now >= entry.resetTime) {
      return {
        remaining: this.config.maxRequestsPerWindow,
        resetTime: now + this.config.windowMs
      };
    }

    return {
      remaining: this.config.maxRequestsPerWindow - entry.count,
      resetTime: entry.resetTime
    };
  }

  /**
   * Clear all rate limit data (useful for testing)
   */
  reset(): void {
    this.limits.clear();
  }
}

// Default rate limiters
export const perUserLimiter = new RateLimiter({
  maxRequestsPerWindow: parseInt(import.meta.env.VITE_RATE_LIMIT_PER_USER || '60', 10),
  windowMs: 60 * 1000, // 1 minute
});

export const applicationLimiter = new RateLimiter({
  maxRequestsPerWindow: parseInt(import.meta.env.VITE_RATE_LIMIT_TOTAL_HOUR || '1000', 10),
  windowMs: 60 * 60 * 1000, // 1 hour
});

export { RateLimiter };
export type { RateLimitConfig };
