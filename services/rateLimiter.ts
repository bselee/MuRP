export interface RateLimitRule {
  maxRequests: number;
  intervalMs: number;
}

export interface RateLimiterOptions {
  perIdentity: RateLimitRule;
  global: RateLimitRule;
}

interface QueueItem<T> {
  identity: string;
  execute: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

const now = () => Date.now();

export class RateLimiter {
  private readonly perIdentityHistory = new Map<string, number[]>();
  private readonly globalHistory: number[] = [];
  private readonly queue: QueueItem<unknown>[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private processing = false;

  constructor(private readonly options: RateLimiterOptions) {}

  async schedule<T>(task: () => Promise<T>, identity = 'anonymous'): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ identity, execute: task, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.processing) {
      return;
    }

    this.processing = true;

    const step = () => {
      this.clearTimer();
      const next = this.queue[0];
      if (!next) {
        this.processing = false;
        return;
      }

      const waitForIdentity = this.timeUntilAvailable(next.identity, this.options.perIdentity, this.perIdentityHistory);
      const waitForGlobal = this.timeUntilAvailable('global', this.options.global, new Map([['global', this.globalHistory]]));
      const waitFor = Math.max(waitForIdentity, waitForGlobal);

      if (waitFor > 0) {
        this.timer = setTimeout(step, waitFor);
        this.processing = false;
        return;
      }

      this.queue.shift();

      const startedAt = now();
      this.recordInvocation(next.identity, startedAt);

      next
        .execute()
        .then((value) => {
          next.resolve(value);
        })
        .catch((error) => {
          next.reject(error);
        })
        .finally(() => {
          this.processing = false;
          if (this.queue.length > 0) {
            this.processQueue();
          }
        });
    };

    step();
  }

  private timeUntilAvailable(
    key: string,
    rule: RateLimitRule,
    store: Map<string, number[]>,
  ): number {
    const timestamps = this.pruneOldEntries(key, rule, store);
    if (timestamps.length < rule.maxRequests) {
      return 0;
    }
    const earliest = timestamps[0];
    return Math.max(earliest + rule.intervalMs - now(), 0);
  }

  private pruneOldEntries(key: string, rule: RateLimitRule, store: Map<string, number[]>): number[] {
    const timestamps = store.get(key) ?? [];
    const cutoff = now() - rule.intervalMs;
    const filtered = timestamps.filter((ts) => ts > cutoff);
    store.set(key, filtered);
    return filtered;
  }

  private recordInvocation(identity: string, timestamp: number) {
    const perIdentity = this.perIdentityHistory.get(identity) ?? [];
    perIdentity.push(timestamp);
    this.perIdentityHistory.set(identity, perIdentity);

    this.globalHistory.push(timestamp);
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export const defaultRateLimiter = new RateLimiter({
  perIdentity: { maxRequests: 60, intervalMs: 60_000 },
  global: { maxRequests: 1000, intervalMs: 3_600_000 },
});
