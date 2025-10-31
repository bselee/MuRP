export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  cooldownMs?: number;
  onStateChange?: (state: CircuitState) => void;
  shouldTrip?: (error: unknown) => boolean;
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly cooldownMs: number;
  private readonly onStateChange?: (state: CircuitState) => void;
  private readonly shouldTrip?: (error: unknown) => boolean;

  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptTimestamp = 0;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 2;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.onStateChange = options.onStateChange;
    this.shouldTrip = options.shouldTrip;
  }

  async execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTimestamp) {
        throw new Error('Circuit breaker is open. Request blocked to protect downstream service.');
      }
      this.transitionTo('HALF_OPEN');
    }

    try {
      const result = await action();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  private recordSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount += 1;
      if (this.successCount >= this.successThreshold) {
        this.reset();
      }
      return;
    }

    this.resetCounts();
  }

  private recordFailure(error: unknown) {
    const shouldTrip = this.shouldTrip ? this.shouldTrip(error) : true;
    if (!shouldTrip) {
      return;
    }

    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold) {
      this.trip();
    }
  }

  private trip() {
    this.transitionTo('OPEN');
    this.nextAttemptTimestamp = Date.now() + this.cooldownMs;
  }

  private reset() {
    this.resetCounts();
    this.transitionTo('CLOSED');
  }

  private resetCounts() {
    this.failureCount = 0;
    this.successCount = 0;
  }

  private transitionTo(nextState: CircuitState) {
    if (this.state === nextState) {
      return;
    }
    this.state = nextState;
    this.onStateChange?.(nextState);
  }
}

export const defaultCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  cooldownMs: 60_000,
});
