/**
 * Retry with Exponential Backoff
 * 
 * Implements smart retry logic with exponential backoff:
 * - Automatically retries failed requests
 * - Increases delay between retries (1s → 2s → 4s → 8s...)
 * - Respects Retry-After headers from APIs
 * - Configurable max retries and delays
 */

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatuses?: number[]; // HTTP status codes that should trigger retry
}

interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
}

const DEFAULT_RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

/**
 * Execute a function with exponential backoff retry logic
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const {
    maxRetries = 5,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    retryableStatuses = DEFAULT_RETRYABLE_STATUSES
  } = config;

  let lastError: Error | undefined;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      
      if (attempt > 0) {
        console.log(`Request succeeded after ${attempt} retries`);
      }
      
      return result;
    } catch (error) {
      lastError = error as Error;

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Check if error is retryable
      const shouldRetry = isRetryableError(error, retryableStatuses);
      if (!shouldRetry) {
        throw error;
      }

      // Check for Retry-After header
      const retryAfter = getRetryAfterDelay(error);
      const actualDelay = retryAfter || Math.min(delay, maxDelayMs);

      console.log(
        `Request failed (attempt ${attempt + 1}/${maxRetries + 1}). ` +
        `Retrying in ${actualDelay}ms...`,
        error instanceof Error ? error.message : error
      );

      // Wait before retrying
      await sleep(actualDelay);

      // Exponential backoff for next attempt
      delay *= backoffMultiplier;
    }
  }

  // All retries exhausted
  console.error(`Request failed after ${maxRetries + 1} attempts`);
  throw lastError || new Error('Request failed after maximum retries');
}

/**
 * Determine if an error should trigger a retry
 */
function isRetryableError(error: unknown, retryableStatuses: number[]): boolean {
  // Network errors are always retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Check HTTP status codes
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    return retryableStatuses.includes(status);
  }

  // Check for specific error messages
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    );
  }

  return false;
}

/**
 * Extract Retry-After header value and convert to milliseconds
 */
function getRetryAfterDelay(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  // Check if error has response with headers
  if ('response' in error && error.response && typeof error.response === 'object') {
    const response = error.response as { headers?: { get?: (key: string) => string | null } };
    
    if (response.headers?.get) {
      const retryAfter = response.headers.get('Retry-After');
      
      if (retryAfter) {
        // Retry-After can be seconds or HTTP date
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
          return seconds * 1000; // Convert to milliseconds
        }
        
        // Try parsing as date
        const date = new Date(retryAfter);
        if (!isNaN(date.getTime())) {
          return Math.max(0, date.getTime() - Date.now());
        }
      }
    }
  }

  return null;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry with backoff and collect detailed results
 */
export async function retryWithBackoffDetailed<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let attempts = 0;

  try {
    attempts = 1; // First attempt
    const data = await retryWithBackoff(fn, config);
    
    return {
      success: true,
      data,
      attempts,
    };
  } catch (error) {
    // Count the number of attempts from the config
    attempts = (config.maxRetries || 5) + 1;
    
    return {
      success: false,
      error: error as Error,
      attempts,
    };
  } finally {
    const duration = Date.now() - startTime;
    console.log(`Total execution time: ${duration}ms across ${attempts} attempt(s)`);
  }
}

export type { RetryConfig, RetryResult };
