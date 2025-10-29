/**
 * Finale Inventory Connector
 * Implements DataConnector interface for Finale Inventory API
 */

import type {
  DataConnector,
  ConnectorCredentials,
  ExternalInventoryItem,
  ExternalVendor,
  ExternalPurchaseOrder,
  RateLimitInfo,
  FinaleCredentials,
  ConnectorResult,
  ConnectorError,
} from './types';
import { cache } from '../cache';

// Default base URL for Finale API
const DEFAULT_BASE_URL = 'https://app.finaleinventory.com';

// Rate limits from Finale documentation
const RATE_LIMITS = {
  POST_PER_MINUTE: 120,
  GET_PER_MINUTE: 120,
  REPORTS_PER_HOUR: 300,
};

export class FinaleConnector implements DataConnector {
  readonly source = 'finale_inventory';
  readonly supportsRealtime = false;

  private credentials: FinaleCredentials | null = null;
  private baseUrl: string;
  private authHeader: string | null = null;

  // Rate limiting tracking
  private requestsThisMinute = 0;
  private requestsThisHour = 0;
  private lastRequestAt: Date | null = null;
  private minuteResetAt: Date | null = null;
  private hourResetAt: Date | null = null;

  constructor() {
    this.baseUrl = DEFAULT_BASE_URL;
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  async authenticate(credentials: ConnectorCredentials): Promise<boolean> {
    if (credentials.type !== 'finale_inventory') {
      throw new Error('Invalid credentials type for Finale connector');
    }

    this.credentials = credentials;
    this.baseUrl = credentials.baseUrl || DEFAULT_BASE_URL;

    // Finale uses Basic Authentication: base64(API_KEY:API_SECRET)
    const authString = `${credentials.apiKey}:${credentials.apiSecret}`;
    this.authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

    // Test authentication with a simple API call
    try {
      const response = await this.makeRequest('/api/product', 'GET', null, { limit: 1 });
      return response.success;
    } catch (error) {
      console.error('Finale authentication failed:', error);
      return false;
    }
  }

  // ===========================================================================
  // DATA FETCHING
  // ===========================================================================

  async fetchInventory(): Promise<ExternalInventoryItem[]> {
    if (!this.authHeader) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    // Use Reporting API for bulk data (better for rate limits)
    const cacheKey = this.getCacheKey('inventory');
    
    // Check cache first (1 hour TTL)
    const cached = await cache.get<ExternalInventoryItem[]>(cacheKey);
    if (cached) {
      console.log('[Finale] Returning cached inventory data');
      return cached;
    }

    console.log('[Finale] Fetching fresh inventory data...');

    // Fetch from Reporting API (CSV format for efficiency)
    const result = await this.fetchReportingData('inventory');
    
    if (!result.success || !result.data) {
      throw new Error(result.error?.message || 'Failed to fetch inventory');
    }

    const items = this.parseInventoryReport(result.data);

    // Cache for 1 hour
    await cache.set(cacheKey, items, 3600);

    return items;
  }

  async fetchVendors(): Promise<ExternalVendor[]> {
    if (!this.authHeader) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    const cacheKey = this.getCacheKey('vendors');
    
    const cached = await cache.get<ExternalVendor[]>(cacheKey);
    if (cached) {
      console.log('[Finale] Returning cached vendor data');
      return cached;
    }

    console.log('[Finale] Fetching fresh vendor data...');

    // Fetch suppliers (vendors) from /api/party?type=supplier
    const result = await this.makeRequest('/api/party', 'GET', null, { type: 'supplier' });

    if (!result.success || !result.data) {
      throw new Error(result.error?.message || 'Failed to fetch vendors');
    }

    const vendors = this.parseVendors(result.data);

    // Cache for 1 hour
    await cache.set(cacheKey, vendors, 3600);

    return vendors;
  }

  async fetchPurchaseOrders(): Promise<ExternalPurchaseOrder[]> {
    if (!this.authHeader) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    const cacheKey = this.getCacheKey('purchase_orders');
    
    const cached = await cache.get<ExternalPurchaseOrder[]>(cacheKey);
    if (cached) {
      console.log('[Finale] Returning cached PO data');
      return cached;
    }

    console.log('[Finale] Fetching fresh PO data...');

    // Fetch purchase orders from /api/order?type=PURCHASE_ORDER
    const result = await this.makeRequest('/api/order', 'GET', null, { type: 'PURCHASE_ORDER' });

    if (!result.success || !result.data) {
      throw new Error(result.error?.message || 'Failed to fetch purchase orders');
    }

    const pos = this.parsePurchaseOrders(result.data);

    // Cache for 1 hour
    await cache.set(cacheKey, pos, 3600);

    return pos;
  }

  // ===========================================================================
  // RATE LIMITING
  // ===========================================================================

  getRateLimits(): RateLimitInfo {
    return {
      requestsPerMinute: RATE_LIMITS.GET_PER_MINUTE,
      requestsPerHour: RATE_LIMITS.REPORTS_PER_HOUR,
      currentMinute: this.requestsThisMinute,
      currentHour: this.requestsThisHour,
      lastRequestAt: this.lastRequestAt,
    };
  }

  isWithinRateLimits(): boolean {
    this.resetRateLimitsIfNeeded();

    // Check minute limit
    if (this.requestsThisMinute >= RATE_LIMITS.GET_PER_MINUTE) {
      console.warn('[Finale] Rate limit exceeded: requests per minute');
      return false;
    }

    // Check hour limit
    if (this.requestsThisHour >= RATE_LIMITS.REPORTS_PER_HOUR) {
      console.warn('[Finale] Rate limit exceeded: requests per hour');
      return false;
    }

    return true;
  }

  private resetRateLimitsIfNeeded() {
    const now = new Date();

    // Reset minute counter
    if (!this.minuteResetAt || now >= this.minuteResetAt) {
      this.requestsThisMinute = 0;
      this.minuteResetAt = new Date(now.getTime() + 60 * 1000);
    }

    // Reset hour counter
    if (!this.hourResetAt || now >= this.hourResetAt) {
      this.requestsThisHour = 0;
      this.hourResetAt = new Date(now.getTime() + 60 * 60 * 1000);
    }
  }

  private incrementRateLimits() {
    this.requestsThisMinute++;
    this.requestsThisHour++;
    this.lastRequestAt = new Date();
  }

  // ===========================================================================
  // HTTP REQUEST HELPERS
  // ===========================================================================

  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST',
    body: any = null,
    params: Record<string, any> = {}
  ): Promise<ConnectorResult<any>> {
    if (!this.isWithinRateLimits()) {
      return {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Rate limit exceeded. Please try again later.',
          retryable: true,
        },
      };
    }

    const url = new URL(endpoint, this.baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });

    const headers: Record<string, string> = {
      'Authorization': this.authHeader!,
      'Content-Type': 'application/json',
    };

    try {
      this.incrementRateLimits();

      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const error = await this.handleErrorResponse(response);
        return { success: false, error };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error.message || 'Network request failed',
          retryable: true,
          details: error,
        },
      };
    }
  }

  private async fetchReportingData(reportType: string): Promise<ConnectorResult<any>> {
    // Finale Reporting API endpoint (hypothetical - adjust based on actual API)
    // Returns CSV or JSON data for bulk reporting
    return this.makeRequest(`/api/report/${reportType}`, 'GET', null, { format: 'json' });
  }

  private async handleErrorResponse(response: Response): Promise<ConnectorError> {
    const status = response.status;

    if (status === 401 || status === 403) {
      return {
        code: 'AUTH_FAILED',
        message: 'Authentication failed. Check your API credentials.',
        retryable: false,
      };
    }

    if (status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      return {
        code: 'RATE_LIMITED',
        message: `Rate limit exceeded. Retry after ${retryAfter || '60'} seconds.`,
        retryable: true,
        details: { retryAfter },
      };
    }

    let message = `HTTP ${status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      message = errorData.message || errorData.error || message;
    } catch {
      // Response body not JSON
    }

    return {
      code: status >= 500 ? 'NETWORK_ERROR' : 'DATA_ERROR',
      message,
      retryable: status >= 500,
    };
  }

  // ===========================================================================
  // DATA PARSING
  // ===========================================================================

  private parseInventoryReport(data: any): ExternalInventoryItem[] {
    // Parse Finale inventory response into our external format
    const items = Array.isArray(data) ? data : data.items || [];

    return items.map((item: any) => ({
      externalId: String(item.id || item.productId),
      sku: item.sku || item.productCode,
      name: item.name || item.productName,
      description: item.description,
      quantityOnHand: Number(item.qtyOnHand || item.quantity || 0),
      reorderPoint: Number(item.reorderLevel || item.reorderPoint || 0),
      unitCost: Number(item.cost || item.unitCost || 0),
      preferredVendorExternalId: item.defaultSupplierId || item.preferredVendorId,
      category: item.category,
      metadata: {
        finaleId: item.id,
        lastUpdated: item.updatedAt || item.lastModified,
        ...item.customFields,
      },
    }));
  }

  private parseVendors(data: any): ExternalVendor[] {
    const vendors = Array.isArray(data) ? data : data.suppliers || [];

    return vendors.map((vendor: any) => ({
      externalId: String(vendor.id || vendor.supplierId),
      name: vendor.name || vendor.supplierName,
      contactName: vendor.contactName,
      contactEmail: vendor.email || vendor.contactEmail,
      contactPhone: vendor.phone || vendor.contactPhone,
      address: vendor.address,
      leadTimeDays: Number(vendor.leadTime || vendor.leadTimeDays || 0),
      metadata: {
        finaleId: vendor.id,
        ...vendor.customFields,
      },
    }));
  }

  private parsePurchaseOrders(data: any): ExternalPurchaseOrder[] {
    const orders = Array.isArray(data) ? data : data.orders || [];

    return orders.map((order: any) => ({
      externalId: String(order.id || order.orderId),
      vendorExternalId: String(order.supplierId || order.vendorId),
      orderNumber: order.orderNumber || order.poNumber,
      orderDate: order.orderDate || order.createdAt,
      expectedDeliveryDate: order.expectedDate || order.deliveryDate,
      status: order.status,
      lineItems: (order.lineItems || []).map((line: any) => ({
        inventoryExternalId: String(line.productId || line.itemId),
        sku: line.sku,
        quantity: Number(line.quantity || 0),
        unitPrice: Number(line.unitPrice || 0),
        totalPrice: Number(line.totalPrice || line.quantity * line.unitPrice),
      })),
      totalAmount: Number(order.totalAmount || order.total || 0),
      metadata: {
        finaleId: order.id,
        ...order.customFields,
      },
    }));
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private getCacheKey(dataType: string): string {
    const userId = this.credentials?.apiKey.substring(0, 8) || 'unknown';
    return `connector:finale:${userId}:${dataType}`;
  }
}
