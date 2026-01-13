/**
 * Finale Inventory API Client - Basic Auth
 *
 * Simple REST API client for Finale using HTTP Basic Authentication
 * with API Key and Secret credentials.
 *
 * This is an alternative to the OAuth-based finaleIngestion.ts service
 * for accounts using API Key/Secret authentication.
 */

import type { VendorParsed } from '../lib/schema/index';

/**
 * Browser-safe Base64 encoding for Basic Auth
 * Uses btoa() in browser, Buffer in Node.js
 */
function toBase64(str: string): string {
  if (typeof window !== 'undefined' && typeof btoa === 'function') {
    // Browser environment - use btoa
    return btoa(str);
  } else if (typeof Buffer !== 'undefined') {
    // Node.js environment - use Buffer
    return Buffer.from(str).toString('base64');
  } else {
    // Fallback - manual Base64 encoding
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    let i = 0;
    while (i < str.length) {
      const a = str.charCodeAt(i++);
      const b = i < str.length ? str.charCodeAt(i++) : 0;
      const c = i < str.length ? str.charCodeAt(i++) : 0;
      const triplet = (a << 16) | (b << 8) | c;
      result += chars[(triplet >> 18) & 0x3f];
      result += chars[(triplet >> 12) & 0x3f];
      result += i > str.length + 1 ? '=' : chars[(triplet >> 6) & 0x3f];
      result += i > str.length ? '=' : chars[triplet & 0x3f];
    }
    return result;
  }
}

interface FinaleConfig {
  apiKey: string;
  apiSecret: string;
  accountPath: string;
  baseUrl: string;
}

interface FinaleFacility {
  facilityId: string;
  name: string;
  [key: string]: any;
}

interface FinaleProduct {
  productId: string;
  name: string;
  sku: string;
  description?: string;
  [key: string]: any;
}

interface FinaleSupplier {
  partyId: string;
  name: string;
  [key: string]: any;
}

interface FinalePurchaseOrder {
  purchaseOrderId: string;
  orderNumber: string;
  [key: string]: any;
}

/**
 * Transform Finale columnar JSON response to array of product objects
 */
function transformColumnarToProducts(columnarData: any): FinaleProduct[] {
  if (!columnarData || typeof columnarData !== 'object') {
    return [];
  }

  // Get the productId array to determine how many products we have
  const productIds = columnarData.productId;
  if (!Array.isArray(productIds)) {
    return [];
  }

  const products: FinaleProduct[] = [];

  // Transform each product
  for (let i = 0; i < productIds.length; i++) {
    const product: FinaleProduct = {
      productId: productIds[i],
      name: columnarData.internalName?.[i] || columnarData.name?.[i] || '',
      sku: productIds[i], // productId is the SKU
      description: columnarData.description?.[i] || '',
      statusId: columnarData.statusId?.[i] || columnarData.status?.[i] || 'PRODUCT_ACTIVE',
      status: columnarData.statusId?.[i] || columnarData.status?.[i] || 'PRODUCT_ACTIVE',
      unitsInStock: parseFloat(columnarData.unitsInStock?.[i] || '0') || 0,
      unitsOnOrder: parseFloat(columnarData.unitsOnOrder?.[i] || '0') || 0,
      unitsReserved: parseFloat(columnarData.unitsReserved?.[i] || '0') || 0,
      reorderPoint: columnarData.reorderPoint?.[i] ? parseFloat(columnarData.reorderPoint[i]) : undefined,
      reorderQuantity: columnarData.reorderQuantity?.[i] ? parseFloat(columnarData.reorderQuantity[i]) : undefined,
      moq: columnarData.moq?.[i] ? parseFloat(columnarData.moq[i]) : undefined,
      cost: columnarData.cost?.[i] ? parseFloat(columnarData.cost[i]) : undefined,
      price: columnarData.price?.[i] ? parseFloat(columnarData.price[i]) : undefined,
      defaultSupplier: columnarData.defaultSupplier?.[i] || '',
      facility: columnarData.facility?.[i] || '',
      category: columnarData.category?.[i] || '',
      barcode: columnarData.barcode?.[i] || '',
      weight: columnarData.weight?.[i] ? parseFloat(columnarData.weight[i]) : undefined,
      weightUnit: columnarData.weightUnit?.[i] || '',
      createdDate: columnarData.createdDate?.[i] || '',
      lastUpdatedDate: columnarData.lastModified?.[i] || columnarData.lastUpdatedDate?.[i] || '',
      lastModified: columnarData.lastModified?.[i] || columnarData.lastUpdatedDate?.[i] || '',
    };

    products.push(product);
  }

  return products;
}

export class FinaleBasicAuthClient {
  private config: FinaleConfig;
  private authHeader: string;
  private isBrowser: boolean;

  constructor(config?: Partial<FinaleConfig>) {
    // Detect if running in browser
    this.isBrowser = typeof window !== 'undefined';

    // Load from environment variables or use provided config
    this.config = {
      apiKey: config?.apiKey || (this.isBrowser ? '' : process.env.FINALE_API_KEY || ''),
      apiSecret: config?.apiSecret || (this.isBrowser ? '' : process.env.FINALE_API_SECRET || ''),
      accountPath: config?.accountPath || (this.isBrowser ? '' : process.env.FINALE_ACCOUNT_PATH || ''),
      baseUrl: config?.baseUrl || (this.isBrowser ? '' : process.env.FINALE_BASE_URL || 'https://app.finaleinventory.com'),
    };

    // Create Basic Auth header (always, for both browser and server)
    // In production browser, this will be overridden by proxy calls
    if (this.config.apiKey && this.config.apiSecret) {
      const authString = `${this.config.apiKey}:${this.config.apiSecret}`;
      this.authHeader = `Basic ${toBase64(authString)}`;
    } else {
      this.authHeader = '';
    }
  }

  /**
   * Call API proxy (for browser environments)
   */
  private async callProxy<T = any>(action: string, params: Record<string, any> = {}): Promise<T> {
    console.log(`[FinaleClient] Calling proxy action: ${action}`);
    
    const response = await fetch('/api/finale-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        config: this.config,
        ...params,
      }),
    });

    console.log(`[FinaleClient] Proxy response for ${action}:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`[FinaleClient] Proxy error for ${action}:`, error);
      throw new Error(error.error || 'Proxy request failed');
    }

    const result = await response.json();
    console.log(`[FinaleClient] Proxy result for ${action}:`, {
      isArray: Array.isArray(result),
      length: Array.isArray(result) ? result.length : 'N/A',
      firstItem: Array.isArray(result) && result.length > 0 ? Object.keys(result[0]).slice(0, 5) : null,
    });

    return result;
  }

  /**
   * Make a GET request to the Finale API
   */
  private async get<T = any>(endpoint: string): Promise<T> {
    // In browser, use proxy
    if (this.isBrowser) {
      throw new Error('Direct API calls not supported in browser. Use specific methods like getProducts()');
    }

    const url = `${this.config.baseUrl}/${this.config.accountPath}/api${endpoint}`;

    console.log(`[Finale] GET ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Finale API error (${response.status}): ${response.statusText}\n${errorText}`
      );
    }

    return response.json();
  }

  /**
   * Make a POST request to the Finale API
   */
  private async post<T = any>(endpoint: string, data: any): Promise<T> {
    const url = `${this.config.baseUrl}/${this.config.accountPath}/api${endpoint}`;

    console.log(`[Finale] POST ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Finale API error (${response.status}): ${response.statusText}\n${errorText}`
      );
    }

    return response.json();
  }

  /**
   * Fetch CSV from a Finale report URL
   */
  async fetchReport(reportUrl: string): Promise<string> {
    console.log(`[Finale] Fetching report: ${reportUrl.substring(0, 100)}...`);

    const response = await fetch(reportUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch report (${response.status}): ${response.statusText}`
      );
    }

    return response.text();
  }

  /**
   * Parse CSV text into array of objects
   */
  parseCSV(csvText: string): Array<Record<string, string>> {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      return [];
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"(.*)"$/, '$1'));
    const rows = lines.slice(1);

    return rows.map(row => {
      const values = row.split(',').map(v => v.trim().replace(/^"(.*)"$/, '$1'));
      const obj: Record<string, string> = {};

      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });

      return obj;
    });
  }

  // =========================================================================
  // REST API Endpoints
  // =========================================================================

  /**
   * Get all facilities
   */
  async getFacilities(): Promise<FinaleFacility[]> {
    if (this.isBrowser) {
      const result = await this.callProxy<{ facilities?: FinaleFacility[] }>('testConnection');
      return result.facilities || [];
    }
    return this.get<FinaleFacility[]>('/facility');
  }

  /**
   * Get all products
   */
  async getProducts(limit = 100, offset = 0): Promise<FinaleProduct[]> {
    // Allow direct API calls in development
    const isDevelopment = (import.meta.env?.DEV || import.meta.env?.MODE === 'development') ?? 
                         (typeof process !== 'undefined' && process.env.NODE_ENV === 'development');
    
    if (this.isBrowser && !isDevelopment) {
      return this.callProxy<FinaleProduct[]>('getProducts', { limit, offset });
    }
    
    // Direct API call for development or server environments
    if (!this.authHeader) {
      const authString = `${this.config.apiKey}:${this.config.apiSecret}`;
      this.authHeader = `Basic ${toBase64(authString)}`;
    }
    
    const response = this.get<any>(`/product?limit=${limit}&offset=${offset}`);
    
    // Transform columnar JSON response to array of objects
    const columnarData = await response;
    return transformColumnarToProducts(columnarData);
  }

  /**
   * Get product by ID
   */
  async getProduct(productId: string): Promise<FinaleProduct> {
    if (this.isBrowser) {
      throw new Error('getProduct() not yet supported in browser');
    }
    return this.get<FinaleProduct>(`/product/${productId}`);
  }

  /**
   * Get all suppliers
   *
   * IMPORTANT: Return type differs based on execution context:
   * - Server mode: Returns FinaleSupplier[] (raw API response)
   * - Browser mode: Returns VendorParsed[] (schema-validated vendors from proxy)
   *
   * The browser proxy applies the schema transformation pipeline:
   * CSV/API → VendorRaw → VendorParsed (validated, normalized)
   */
  async getSuppliers(): Promise<FinaleSupplier[] | VendorParsed[]> {
    if (this.isBrowser) {
      // Browser mode: Returns schema-parsed vendors from proxy
      return this.callProxy<VendorParsed[]>('getSuppliers');
    }
    // Server mode: Returns raw Finale API response
    return this.get<FinaleSupplier[]>('/partyGroup?role=SUPPLIER');
  }

  /**
   * Get inventory items from CSV report
   * Returns raw CSV data for transformation in frontend
   */
  async getInventory(): Promise<Array<Record<string, any>>> {
    if (this.isBrowser) {
      // Browser mode: Call API proxy which fetches and parses CSV
      return this.callProxy<Array<Record<string, any>>>('getInventory');
    }
    // Server mode would need direct CSV fetch (not typically used)
    throw new Error('Inventory fetch in server mode not implemented - use browser mode');
  }

  /**
   * Get BOMs from CSV report
   * Returns raw CSV data for transformation in frontend
   */
  async getBOMs(reportUrl?: string): Promise<Array<Record<string, any>>> {
    if (this.isBrowser) {
      // Browser mode: Call API proxy which fetches and parses CSV
      // Pass the report URL if available, otherwise rely on server env
      return this.callProxy<Array<Record<string, any>>>('getBOMs', { url: reportUrl });
    }
    // Server mode would need direct CSV fetch (not typically used)
    throw new Error('BOMs fetch in server mode not implemented - use browser mode');
  }

  /**
   * Get all purchase orders
   */
  async getPurchaseOrders(limit = 100, offset = 0): Promise<FinalePurchaseOrder[]> {
    // Allow direct API calls in development
    const isDevelopment = (import.meta.env?.DEV || import.meta.env?.MODE === 'development') ?? 
                         (typeof process !== 'undefined' && process.env.NODE_ENV === 'development');
    
    if (this.isBrowser && !isDevelopment) {
      return this.callProxy<FinalePurchaseOrder[]>('getPurchaseOrders', { limit, offset });
    }
    
    // Direct API call for development or server environments
    if (!this.authHeader) {
      const authString = `${this.config.apiKey}:${this.config.apiSecret}`;
      this.authHeader = `Basic ${toBase64(authString)}`;
    }
    
    return this.get<FinalePurchaseOrder[]>(`/purchaseOrder?limit=${limit}&offset=${offset}`);
  }

  // =========================================================================
  // Report CSV Endpoints
  // =========================================================================

  /**
   * Fetch vendors report from CSV URL
   */
  async getVendorsReport(): Promise<Array<Record<string, string>>> {
    const url = process.env.FINALE_VENDORS_REPORT_URL;
    if (!url) {
      throw new Error('FINALE_VENDORS_REPORT_URL not configured');
    }

    const csv = await this.fetchReport(url);
    return this.parseCSV(csv);
  }

  /**
   * Fetch inventory report from CSV URL
   */
  async getInventoryReport(): Promise<Array<Record<string, string>>> {
    const url = process.env.FINALE_INVENTORY_REPORT_URL;
    if (!url) {
      throw new Error('FINALE_INVENTORY_REPORT_URL not configured');
    }

    const csv = await this.fetchReport(url);
    return this.parseCSV(csv);
  }

  /**
   * Fetch reorder report from CSV URL
   */
  async getReorderReport(): Promise<Array<Record<string, string>>> {
    const url = process.env.FINALE_REORDER_REPORT_URL;
    if (!url) {
      throw new Error('FINALE_REORDER_REPORT_URL not configured');
    }

    const csv = await this.fetchReport(url);
    return this.parseCSV(csv);
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Test connection to Finale API
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
    facilities?: FinaleFacility[];
    error?: string;
  }> {
    try {
      if (this.isBrowser) {
        return this.callProxy<{
          success: boolean;
          message: string;
          facilities?: FinaleFacility[];
          error?: string;
        }>('testConnection');
      }

      const facilities = await this.getFacilities();
      return {
        success: true,
        message: `Successfully connected to Finale. Found ${facilities.length} facility(ies).`,
        facilities,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to connect to Finale API',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get account information
   */
  getAccountInfo() {
    return {
      accountPath: this.config.accountPath,
      baseUrl: this.config.baseUrl,
      apiKey: this.config.apiKey.substring(0, 4) + '...',
    };
  }
}

/**
 * Factory function to create a Finale client
 */
export function createFinaleClient(config?: Partial<FinaleConfig>): FinaleBasicAuthClient {
  return new FinaleBasicAuthClient(config);
}

/**
 * Singleton instance (lazy-loaded)
 */
let finaleClientInstance: FinaleBasicAuthClient | null = null;

export function getFinaleClient(): FinaleBasicAuthClient {
  if (!finaleClientInstance) {
    finaleClientInstance = new FinaleBasicAuthClient();
  }
  return finaleClientInstance;
}
