/**
 * Circuit Breaker Service
 * 
 * Implements the circuit breaker pattern to prevent cascade failures:
 * - After N failures, stops calling the API for a timeout period
 * - Automatically recovers and retries after timeout
 * - Protects against hammering failing APIs
 */

enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation, requests go through
  OPEN = 'OPEN',         // Circuit tripped, requests fail fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

interface CircuitBreakerConfig {
  failureThreshold: number;  // Number of failures before opening circuit
  timeout: number;           // Time in ms to wait before attempting recovery
  name: string;             // Name for logging
}

interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  nextAttemptTime?: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptTime = 0;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(
          `Circuit breaker [${this.config.name}] is OPEN. ` +
          `Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`
        );
      }
      // Timeout expired, try half-open
      this.state = CircuitState.HALF_OPEN;
      console.log(`Circuit breaker [${this.config.name}] entering HALF_OPEN state`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.successCount++;
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      console.log(`Circuit breaker [${this.config.name}] recovered, entering CLOSED state`);
      this.state = CircuitState.CLOSED;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.config.failureThreshold) {
      this.trip();
    }
  }

  /**
   * Trip the circuit breaker (open it)
   */
  private trip(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.config.timeout;
    
    console.error(
      `Circuit breaker [${this.config.name}] OPENED after ${this.failureCount} failures. ` +
      `Will retry at ${new Date(this.nextAttemptTime).toISOString()}`
    );
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failureCount,
      successes: this.successCount,
      lastFailureTime: this.failureCount > 0 ? Date.now() : undefined,
      nextAttemptTime: this.state === CircuitState.OPEN ? this.nextAttemptTime : undefined
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = 0;
    console.log(`Circuit breaker [${this.config.name}] manually reset`);
  }
}

// Pre-configured circuit breakers for common services
export const geminiCircuitBreaker = new CircuitBreaker({
  failureThreshold: parseInt(import.meta.env.VITE_CIRCUIT_BREAKER_THRESHOLD || '5'),
  timeout: parseInt(import.meta.env.VITE_CIRCUIT_BREAKER_TIMEOUT || '60000'),
  name: 'Gemini AI'
});

export const finaleCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  timeout: 60000,
  name: 'Finale Inventory'
});

export { CircuitState };
export type { CircuitBreakerConfig, CircuitBreakerStats };
