/**
 * Finale Inventory API Client - Basic Auth
 * 
 * Simple REST API client for Finale using HTTP Basic Authentication
 * with API Key and Secret credentials.
 * 
 * This is an alternative to the OAuth-based finaleIngestion.ts service
 * for accounts using API Key/Secret authentication.
 */

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

    // Validate configuration (skip in browser - will use proxy)
    if (!this.isBrowser) {
      if (!this.config.apiKey || !this.config.apiSecret) {
        throw new Error('Finale API Key and Secret are required');
      }
      if (!this.config.accountPath) {
        throw new Error('Finale Account Path is required');
      }

      // Create Basic Auth header (Node.js only)
      const authString = `${this.config.apiKey}:${this.config.apiSecret}`;
      this.authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
    } else {
      this.authHeader = '';
    }
  }

  /**
   * Call API proxy (for browser environments)
   */
  private async callProxy<T = any>(action: string, params: Record<string, any> = {}): Promise<T> {
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

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Proxy request failed');
    }

    return response.json();
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
    if (this.isBrowser) {
      return this.callProxy<FinaleProduct[]>('getProducts', { limit, offset });
    }
    return this.get<FinaleProduct[]>(`/product?limit=${limit}&offset=${offset}`);
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
   */
  async getSuppliers(): Promise<FinaleSupplier[]> {
    if (this.isBrowser) {
      return this.callProxy<FinaleSupplier[]>('getSuppliers');
    }
    return this.get<FinaleSupplier[]>('/partyGroup?role=SUPPLIER');
  }

  /**
   * Get all purchase orders
   */
  async getPurchaseOrders(limit = 100, offset = 0): Promise<FinalePurchaseOrder[]> {
    if (this.isBrowser) {
      return this.callProxy<FinalePurchaseOrder[]>('getPurchaseOrders', { limit, offset });
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
