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

  constructor(config?: Partial<FinaleConfig>) {
    // Load from environment variables or use provided config
    this.config = {
      apiKey: config?.apiKey || process.env.FINALE_API_KEY || '',
      apiSecret: config?.apiSecret || process.env.FINALE_API_SECRET || '',
      accountPath: config?.accountPath || process.env.FINALE_ACCOUNT_PATH || '',
      baseUrl: config?.baseUrl || process.env.FINALE_BASE_URL || 'https://app.finaleinventory.com',
    };

    // Validate configuration
    if (!this.config.apiKey || !this.config.apiSecret) {
      throw new Error('Finale API Key and Secret are required');
    }
    if (!this.config.accountPath) {
      throw new Error('Finale Account Path is required');
    }

    // Create Basic Auth header
    const authString = `${this.config.apiKey}:${this.config.apiSecret}`;
    this.authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
  }

  /**
   * Make a GET request to the Finale API
   */
  private async get<T = any>(endpoint: string): Promise<T> {
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
    return this.get<FinaleFacility[]>('/facility');
  }

  /**
   * Get all products
   */
  async getProducts(limit = 100, offset = 0): Promise<FinaleProduct[]> {
    return this.get<FinaleProduct[]>(`/product?limit=${limit}&offset=${offset}`);
  }

  /**
   * Get product by ID
   */
  async getProduct(productId: string): Promise<FinaleProduct> {
    return this.get<FinaleProduct>(`/product/${productId}`);
  }

  /**
   * Get all suppliers
   */
  async getSuppliers(): Promise<FinaleSupplier[]> {
    return this.get<FinaleSupplier[]>('/partyGroup?role=SUPPLIER');
  }

  /**
   * Get all purchase orders
   */
  async getPurchaseOrders(limit = 100, offset = 0): Promise<FinalePurchaseOrder[]> {
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
