export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  shouldRetry?: (error: unknown) => boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function retryWithBackoff<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxAttempts = 4,
    baseDelayMs = 1000,
    maxDelayMs = 8000,
    jitter = true,
    onRetry,
    shouldRetry,
  } = options;

  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      attempt += 1;

      const retry = shouldRetry ? shouldRetry(error) : true;
      if (!retry || attempt >= maxAttempts) {
        break;
      }

      let delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      if (jitter) {
        const jitterValue = delay * 0.2 * Math.random();
        delay = delay - jitterValue / 2 + jitterValue;
      }

      onRetry?.(attempt, error, delay);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error('Retry operation failed without an error being thrown.');
}
