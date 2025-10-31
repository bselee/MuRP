/**
 * Secure API Client
 * 
 * Frontend-safe API client that routes all external API calls through
 * a secure backend proxy. This ensures API keys never touch the browser.
 * 
 * Key Features:
 * - No API keys in frontend code
 * - All calls go through authenticated backend
 * - Automatic audit logging
 * - Rate limiting
 * - Error handling with retry
 */

import { retryWithBackoff } from './retryWithBackoff';
import { defaultRateLimiter } from './rateLimiter';

interface ApiProxyRequest {
  service: string;          // 'finale' | 'gemini' | etc.
  action: string;           // 'pullInventory' | 'generateText' | etc.
  params?: Record<string, unknown>;
}

interface ApiProxyResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    executionTime: number;
    requestId: string;
  };
}

export class SecureApiClient {
  private backendUrl: string;
  private authToken: string | null = null;

  constructor(backendUrl?: string) {
    // Default to Supabase Edge Function or custom backend
    this.backendUrl = backendUrl || 
      import.meta.env.VITE_SUPABASE_URL 
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-proxy`
        : '/api/proxy';
  }

  /**
   * Set authentication token for backend requests
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Make a secure API request through the backend proxy
   */
  async request<T>(
    service: string,
    action: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    // Apply rate limiting
    return defaultRateLimiter.schedule(async () => {
      const requestBody: ApiProxyRequest = {
        service,
        action,
        params,
      };

      return retryWithBackoff(async () => {
        const response = await fetch(this.backendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` }),
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API proxy error (${response.status}): ${errorText}`);
        }

        const result: ApiProxyResponse<T> = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'API request failed');
        }

        return result.data as T;
      }, {
        baseDelayMs: 1000,
        maxDelayMs: 10000,
      });
    }, 'api-proxy');
  }

  /**
   * Pull inventory from Finale via secure proxy
   */
  async pullFinaleInventory() {
    return this.request('finale', 'pullInventory');
  }

  /**
   * Pull vendors from Finale via secure proxy
   */
  async pullFinaleVendors() {
    return this.request('finale', 'pullVendors');
  }

  /**
   * Pull purchase orders from Finale via secure proxy
   */
  async pullFinalePurchaseOrders() {
    return this.request('finale', 'pullPurchaseOrders');
  }

  /**
   * Sync all Finale data via secure proxy
   */
  async syncFinaleAll() {
    return this.request('finale', 'syncAll');
  }

  /**
   * Get Finale service status
   */
  async getFinaleStatus() {
    return this.request('finale', 'getStatus');
  }
}

// Singleton instance
let apiClientInstance: SecureApiClient | null = null;

/**
 * Get or create secure API client instance
 */
export function getSecureApiClient(): SecureApiClient {
  if (!apiClientInstance) {
    apiClientInstance = new SecureApiClient();
  }
  return apiClientInstance;
}

/**
 * Helper function to check if backend proxy is configured
 */
export function isBackendProxyConfigured(): boolean {
  return !!(
    import.meta.env.VITE_SUPABASE_URL || 
    import.meta.env.VITE_BACKEND_API_URL
  );
}
