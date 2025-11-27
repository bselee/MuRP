/**
 * Finale Inventory Ingestion Service
 * 
 * Handles secure data ingestion from Finale Inventory API:
 * - OAuth token management
 * - Rate limiting and circuit breaker protection
 * - Automatic retry with exponential backoff
 * - Data transformation to MuRP format
 * - Audit logging
 */

import { retryWithBackoff } from './retryWithBackoff';
import { CircuitBreaker } from './circuitBreaker';
import { defaultRateLimiter } from './rateLimiter';
import type { InventoryItem, Vendor, PurchaseOrder } from '../types';

// Initialize Finale-specific circuit breaker
const finaleCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  cooldownMs: 60000,
});

interface FinaleConfig {
  apiUrl: string;
  subdomain: string;
  clientId: string;
  clientSecret: string;
}

interface FinaleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

interface FinaleInventoryItem {
  id: string;
  sku: string;
  name: string;
  category?: string;
  quantity_on_hand: number;
  quantity_on_order: number;
  reorder_point?: number;
  primary_vendor_id?: string;
  moq?: number;
}

interface FinaleVendor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  lead_time_days?: number;
}

interface FinalePurchaseOrder {
  id: string;
  vendor_id: string;
  status: string;
  created_at: string;
  line_items: Array<{
    sku: string;
    name: string;
    quantity: number;
    unit_price: number;
  }>;
  expected_date?: string;
  notes?: string;
}

export class FinaleIngestionService {
  private config: FinaleConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: FinaleConfig) {
    this.config = config;
  }

  /**
   * Get or refresh OAuth access token
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Request new token
    const tokenUrl = `${this.config.apiUrl}/oauth/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      subdomain: this.config.subdomain,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.statusText}`);
    }

    const data: FinaleTokenResponse = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000; // Refresh 5 min early

    return this.accessToken;
  }

  /**
   * Make an authenticated API request with resilience patterns
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Apply rate limiting through defaultRateLimiter
    return defaultRateLimiter.schedule(async () => {
      // Execute with circuit breaker and retry
      return finaleCircuitBreaker.execute(async () => {
        return retryWithBackoff(async () => {
          const token = await this.getAccessToken();
          const url = `${this.config.apiUrl}${endpoint}`;

          const response = await fetch(url, {
            ...options,
            headers: {
              ...options.headers,
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            // Include status for retry logic
            const error = new Error(`Finale API error: ${response.statusText}`) as Error & { status: number };
            error.status = response.status;
            throw error;
          }

          return response.json();
        }, {
          // Retry options: baseDelayMs and maxDelayMs (maxRetries not supported)
          baseDelayMs: 1000,
          maxDelayMs: 10000,
        });
      });
    }, 'finale-api');
  }

  /**
   * Pull inventory items from Finale
   */
  async pullInventory(): Promise<InventoryItem[]> {
    console.log('Pulling inventory from Finale...');
    
    const finaleItems = await this.makeRequest<{ data: FinaleInventoryItem[] }>(
      '/inventory_items'
    );

    // Transform to MuRP format
    const items: InventoryItem[] = finaleItems.data.map(item => ({
      sku: item.sku,
      name: item.name,
      category: item.category || 'Uncategorized',
      stock: item.quantity_on_hand || 0,
      onOrder: item.quantity_on_order || 0,
      reorderPoint: item.reorder_point || 0,
      vendorId: item.primary_vendor_id || 'unknown',
      moq: item.moq,
    }));

    console.log(`Successfully pulled ${items.length} inventory items`);
    return items;
  }

  /**
   * Pull vendors from Finale
   */
  async pullVendors(): Promise<Vendor[]> {
    console.log('Pulling vendors from Finale...');
    
    const finaleVendors = await this.makeRequest<{ data: FinaleVendor[] }>(
      '/vendors'
    );

    // Transform to MuRP format
    const vendors: Vendor[] = finaleVendors.data.map(vendor => ({
      id: vendor.id,
      name: vendor.name,
      contactEmails: vendor.email ? [vendor.email] : [],
      phone: vendor.phone || '',
      address: vendor.address || '',
      website: vendor.website || '',
      leadTimeDays: vendor.lead_time_days || 7,
    }));

    console.log(`Successfully pulled ${vendors.length} vendors`);
    return vendors;
  }

  /**
   * Pull purchase orders from Finale
   */
  async pullPurchaseOrders(): Promise<PurchaseOrder[]> {
    console.log('Pulling purchase orders from Finale...');
    
    const finalePOs = await this.makeRequest<{ data: FinalePurchaseOrder[] }>(
      '/purchase_orders'
    );

    // Transform to MuRP format
    const orders: PurchaseOrder[] = finalePOs.data.map(po => ({
      id: po.id,
      vendorId: po.vendor_id,
      status: this.mapPOStatus(po.status),
      createdAt: po.created_at,
      items: po.line_items.map(item => ({
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        price: item.unit_price,
      })),
      expectedDate: po.expected_date,
      notes: po.notes,
    }));

    console.log(`Successfully pulled ${orders.length} purchase orders`);
    return orders;
  }

  /**
   * Map Finale PO status to MuRP status
   */
  private mapPOStatus(finaleStatus: string): 'Pending' | 'Submitted' | 'Fulfilled' {
    const statusMap: Record<string, 'Pending' | 'Submitted' | 'Fulfilled'> = {
      'draft': 'Pending',
      'open': 'Submitted',
      'closed': 'Fulfilled',
      'cancelled': 'Pending',
    };

    return statusMap[finaleStatus.toLowerCase()] || 'Pending';
  }

  /**
   * Sync all data from Finale
   */
  async syncAll(): Promise<{
    inventory: InventoryItem[];
    vendors: Vendor[];
    purchaseOrders: PurchaseOrder[];
  }> {
    console.log('Starting full Finale sync...');
    const startTime = Date.now();

    try {
      // Pull data in parallel for efficiency
      const [inventory, vendors, purchaseOrders] = await Promise.all([
        this.pullInventory(),
        this.pullVendors(),
        this.pullPurchaseOrders(),
      ]);

      const duration = Date.now() - startTime;
      console.log(`Full sync completed in ${duration}ms`);

      return { inventory, vendors, purchaseOrders };
    } catch (error) {
      console.error('Finale sync failed:', error);
      throw error;
    }
  }

  /**
   * Get sync status and token validity
   */
  getStatus() {
    return {
      tokenValid: this.accessToken !== null && Date.now() < this.tokenExpiry,
      protected: 'Rate limited (60/min per user, 1000/hr global) + circuit breaker enabled',
    };
  }
}

/**
 * Create Finale service instance from environment variables
 */
export function createFinaleService(): FinaleIngestionService | null {
  const apiUrl = import.meta.env.VITE_FINALE_API_URL;
  const subdomain = import.meta.env.VITE_FINALE_API_SUBDOMAIN;
  const clientId = import.meta.env.VITE_FINALE_API_CLIENT_ID;
  const clientSecret = import.meta.env.VITE_FINALE_API_CLIENT_SECRET;

  if (!apiUrl || !subdomain || !clientId || !clientSecret) {
    console.warn('Finale API credentials not configured');
    return null;
  }

  return new FinaleIngestionService({
    apiUrl,
    subdomain,
    clientId,
    clientSecret,
  });
}
