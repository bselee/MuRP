// finale-client-v2.ts
// Enhanced Finale Inventory API Client
// CRITICAL: Uses GraphQL for Purchase Orders (REST filtering is broken!)

/**
 * Browser-safe Base64 encoding for Basic Auth
 * Uses btoa() in browser, Buffer in Node.js
 */
function toBase64(str: string): string {
  if (typeof window !== 'undefined' && typeof btoa === 'function') {
    return btoa(str);
  } else if (typeof Buffer !== 'undefined') {
    return Buffer.from(str).toString('base64');
  } else {
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
  accountPath: string;
  apiKey: string;
  apiSecret: string;
  timeout?: number;
  requestsPerMinute?: number;
}

interface FinaleResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: number;
}

interface CustomField {
  attrName: string;
  attrValue: string;
  attrValueLastUpdatedDate?: boolean;
}

interface PaginationOptions {
  first?: number;
  after?: string;
}

interface PurchaseOrderOptions extends PaginationOptions {
  status?: string[];
  supplier?: string[];
  startDate?: string;
  endDate?: string;
}

interface ProductOptions extends PaginationOptions {
  status?: string[];
  modifiedSince?: string;
}

interface StockHistoryOptions extends PaginationOptions {
  productId?: string;
  facilityId?: string;
  startDate?: string;
  endDate?: string;
  transactionType?: string[];
}

export class FinaleClient {
  private baseUrl: string;
  private authHeader: string;
  private accountPath: string;
  private timeout: number;
  private rateLimitInfo: RateLimitInfo | null = null;
  private requestsPerMinute: number;

  constructor(config: FinaleConfig) {
    this.accountPath = config.accountPath;
    this.baseUrl = `https://app.finaleinventory.com/${config.accountPath}`;
    this.timeout = config.timeout || 30000;
    this.requestsPerMinute = config.requestsPerMinute || 50;

    const credentials = toBase64(
      `${config.apiKey}:${config.apiSecret}`
    );

    this.authHeader = `Basic ${credentials}`;
  }

  // =============================================
  // Core Request Methods
  // =============================================

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<FinaleResponse<T>> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Connection': 'keep-alive', // Important for GraphQL
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      // Parse rate limit headers
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      const rateLimitLimit = response.headers.get('X-RateLimit-Limit');
      const rateLimitReset = response.headers.get('X-RateLimit-Reset');

      if (rateLimitRemaining && rateLimitLimit) {
        this.rateLimitInfo = {
          remaining: parseInt(rateLimitRemaining, 10),
          limit: parseInt(rateLimitLimit, 10),
          resetAt: rateLimitReset ? parseInt(rateLimitReset, 10) : 0,
        };
      }

      // Handle specific errors
      if (response.status === 401) {
        return { success: false, error: 'Authentication failed. Check API key/secret.', statusCode: 401 };
      }
      if (response.status === 402) {
        return { success: false, error: 'API access not enabled on your Finale plan.', statusCode: 402 };
      }
      if (response.status === 429) {
        const resetTime = this.rateLimitInfo?.resetAt
          ? new Date(this.rateLimitInfo.resetAt * 1000).toISOString()
          : 'unknown';
        return { success: false, error: `Rate limited. Resets at: ${resetTime}`, statusCode: 429 };
      }
      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}`, statusCode: response.status };
      }

      const data = await response.json();
      return { success: true, data, statusCode: response.status };

    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: `Request timeout after ${this.timeout}ms` };
      }
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async graphql<T>(query: string, variables?: Record<string, any>): Promise<FinaleResponse<T>> {
    return this.request<T>('/api/graphql', {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // =============================================
  // REST API Methods (for simple data)
  // =============================================

  async getProducts(limit = 100, offset = 0): Promise<FinaleResponse<any>> {
    return this.request(`/api/product?limit=${limit}&offset=${offset}`);
  }

  async getInventoryItems(): Promise<FinaleResponse<any>> {
    return this.request('/api/inventoryitem');
  }

  async getFacilities(): Promise<FinaleResponse<any>> {
    return this.request('/api/facility');
  }

  async getShipments(limit = 100, offset = 0): Promise<FinaleResponse<any>> {
    return this.request(`/api/shipment?limit=${limit}&offset=${offset}`);
  }

  // =============================================
  // PURCHASE ORDERS - GraphQL ONLY!
  // ⚠️ REST /api/order IGNORES orderTypeId filter!
  // =============================================

  async getPurchaseOrders(options: PurchaseOrderOptions = {}): Promise<FinaleResponse<any>> {
    const {
      first = 100,
      after,
      status = ['Pending', 'Submitted', 'Ordered', 'Partial', 'Completed'],
      supplier,
      startDate,
      endDate
    } = options;

    const query = `
      query GetPurchaseOrders(
        $first: Int!
        $after: String
        $status: [String!]
        $supplier: [String]
        $startDate: String
        $endDate: String
      ) {
        orderViewConnection(
          first: $first
          after: $after
          type: ["PURCHASE_ORDER"]
          status: $status
          supplier: $supplier
          orderDate: { from: $startDate, to: $endDate }
        ) {
          edges {
            node {
              orderId
              orderUrl
              type
              status
              orderDate
              receiveDate
              total
              subtotal
              publicNotes
              privateNotes
              recordLastUpdated
              supplier {
                partyId
                partyUrl
                name
              }
              origin {
                facilityId
                facilityUrl
                name
              }
              itemList {
                edges {
                  node {
                    productId
                    productUrl
                    productName
                    quantity
                    unitPrice
                    receivedQuantity
                  }
                }
              }
              userFieldDataList {
                attrName
                attrValue
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `;

    return this.graphql(query, { first, after, status, supplier, startDate, endDate });
  }

  async getAllPurchaseOrders(options: {
    status?: string[];
    startDate?: string;
    endDate?: string;
    onProgress?: (count: number, hasMore: boolean) => void;
  } = {}): Promise<any[]> {
    const allPOs: any[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getPurchaseOrders({
        first: 100,
        after: cursor,
        status: options.status,
        startDate: options.startDate,
        endDate: options.endDate
      });

      if (!result.success || !result.data?.data?.orderViewConnection) {
        console.error('PO fetch error:', result.error);
        break;
      }

      const connection = result.data.data.orderViewConnection;
      const edges = connection.edges || [];

      for (const edge of edges) {
        allPOs.push(edge.node);
      }

      hasMore = connection.pageInfo?.hasNextPage || false;
      cursor = connection.pageInfo?.endCursor;

      if (options.onProgress) {
        options.onProgress(allPOs.length, hasMore);
      }

      // Rate limit protection
      await this.delay(100);
    }

    return allPOs;
  }

  // =============================================
  // VENDORS - GraphQL (better than REST)
  // =============================================

  async getVendors(options: PaginationOptions & { status?: string[] } = {}): Promise<FinaleResponse<any>> {
    const { first = 100, after, status = ['Active'] } = options;

    const query = `
      query GetVendors($first: Int!, $after: String, $status: [String]) {
        partyViewConnection(
          first: $first
          after: $after
          role: ["SUPPLIER"]
          status: $status
        ) {
          edges {
            node {
              partyId
              partyUrl
              name
              role
              status
              contactEmail
              contactPhone
              address {
                street1
                street2
                city
                state
                postalCode
                country
              }
              userFieldDataList {
                attrName
                attrValue
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    return this.graphql(query, { first, after, status });
  }

  async getAllVendors(status: string[] = ['Active']): Promise<any[]> {
    const allVendors: any[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getVendors({ first: 100, after: cursor, status });

      if (!result.success || !result.data?.data?.partyViewConnection) {
        break;
      }

      const connection = result.data.data.partyViewConnection;
      const edges = connection.edges || [];

      for (const edge of edges) {
        allVendors.push(edge.node);
      }

      hasMore = connection.pageInfo?.hasNextPage || false;
      cursor = connection.pageInfo?.endCursor;

      await this.delay(100);
    }

    return allVendors;
  }

  // =============================================
  // PRODUCTS WITH STOCK & BOM - GraphQL
  // =============================================

  async getProductsWithStock(options: ProductOptions = {}): Promise<FinaleResponse<any>> {
    const { first = 100, after, status = ['PRODUCT_ACTIVE'], modifiedSince } = options;

    const query = `
      query GetProductsWithStock(
        $first: Int!
        $after: String
        $status: [String]
        $modifiedSince: String
      ) {
        productViewConnection(
          first: $first
          after: $after
          status: $status
          recordLastUpdated: { from: $modifiedSince }
        ) {
          edges {
            node {
              productId
              productUrl
              internalName
              description
              productTypeId
              statusId
              upc
              unitCost
              unitPrice
              reorderPoint
              reorderQuantity
              stock
              unitsOnOrder
              primarySupplierId
              primarySupplierUrl
              recordLastUpdated
              userFieldDataList {
                attrName
                attrValue
              }
              billOfMaterial {
                edges {
                  node {
                    componentProductId
                    componentProductUrl
                    componentProductName
                    quantity
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    return this.graphql(query, { first, after, status, modifiedSince });
  }

  async getAllProductsWithStock(options: ProductOptions = {}): Promise<any[]> {
    const allProducts: any[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getProductsWithStock({
        ...options,
        first: 100,
        after: cursor,
      });

      if (!result.success || !result.data?.data?.productViewConnection) {
        break;
      }

      const connection = result.data.data.productViewConnection;
      const edges = connection.edges || [];

      for (const edge of edges) {
        allProducts.push(edge.node);
      }

      hasMore = connection.pageInfo?.hasNextPage || false;
      cursor = connection.pageInfo?.endCursor;

      // Early termination for delta sync with no changes
      if (options.modifiedSince && edges.length === 0) {
        break;
      }

      await this.delay(100);
    }

    return allProducts;
  }

  // =============================================
  // STOCK HISTORY - GraphQL (for velocity)
  // =============================================

  async getStockHistory(options: StockHistoryOptions = {}): Promise<FinaleResponse<any>> {
    const {
      first = 100,
      after,
      productId,
      facilityId,
      startDate,
      endDate,
      transactionType
    } = options;

    const query = `
      query GetStockHistory(
        $first: Int!
        $after: String
        $productId: String
        $facilityId: String
        $startDate: String
        $endDate: String
        $transactionType: [String]
      ) {
        stockHistoryViewConnection(
          first: $first
          after: $after
          product: $productId
          facility: $facilityId
          transactionDate: { from: $startDate, to: $endDate }
          transactionType: $transactionType
        ) {
          edges {
            node {
              productId
              productUrl
              facilityId
              facilityUrl
              transactionDate
              transactionType
              quantity
              runningBalance
              unitCost
              documentUrl
              documentType
              documentId
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    return this.graphql(query, {
      first, after, productId, facilityId, startDate, endDate, transactionType
    });
  }

  async getAllStockHistory(options: StockHistoryOptions = {}): Promise<any[]> {
    const allHistory: any[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getStockHistory({
        ...options,
        first: 100,
        after: cursor,
      });

      if (!result.success || !result.data?.data?.stockHistoryViewConnection) {
        break;
      }

      const connection = result.data.data.stockHistoryViewConnection;
      const edges = connection.edges || [];

      for (const edge of edges) {
        allHistory.push(edge.node);
      }

      hasMore = connection.pageInfo?.hasNextPage || false;
      cursor = connection.pageInfo?.endCursor;

      await this.delay(100);
    }

    return allHistory;
  }

  // =============================================
  // Custom Fields Utilities
  // =============================================

  /**
   * Parse Finale's userFieldDataList into a friendly object
   *
   * @param userFieldDataList - Array from Finale API
   * @param fieldMapping - Maps attrName (e.g., 'user_10000') to display name (e.g., 'lead_time')
   */
  parseCustomFields(
    userFieldDataList: CustomField[] | undefined,
    fieldMapping: Record<string, string>
  ): Record<string, any> {
    const result: Record<string, any> = {};

    if (!Array.isArray(userFieldDataList)) return result;

    for (const field of userFieldDataList) {
      // Skip Finale's internal integration fields
      if (field.attrName.startsWith('integration_')) continue;

      const displayName = fieldMapping[field.attrName];
      if (displayName) {
        let value: any = field.attrValue;

        // Auto-convert dates (ISO format)
        if (value && typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
          value = new Date(value);
        }
        // Auto-convert numbers
        else if (value && typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== '') {
          value = Number(value);
        }

        result[displayName] = value;
      }
    }

    return result;
  }

  /**
   * Build userFieldDataList for updating an entity
   * CRITICAL: Preserves existing integration_* fields!
   *
   * @param existingFields - Current userFieldDataList from entity
   * @param updates - New values keyed by display name
   * @param fieldMapping - Maps display name to attrName
   */
  buildCustomFieldUpdate(
    existingFields: CustomField[] | undefined,
    updates: Record<string, any>,
    fieldMapping: Record<string, string> // displayName -> attrName
  ): CustomField[] {
    const result: CustomField[] = [];

    // Build reverse mapping
    const reverseMapping: Record<string, string> = {};
    for (const [attrName, displayName] of Object.entries(fieldMapping)) {
      reverseMapping[displayName] = attrName;
    }

    // CRITICAL: Preserve integration_* fields (used by ShipStation, etc.)
    for (const field of existingFields || []) {
      if (field.attrName.startsWith('integration_')) {
        result.push({ ...field });
      }
    }

    // Add/update custom fields
    for (const [displayName, value] of Object.entries(updates)) {
      const attrName = reverseMapping[displayName];
      if (attrName) {
        let attrValue: string;

        if (value instanceof Date) {
          attrValue = value.toISOString();
        } else if (value === null || value === undefined) {
          attrValue = '';
        } else {
          attrValue = String(value);
        }

        result.push({ attrName, attrValue });
      }
    }

    return result;
  }

  // =============================================
  // Utility Methods
  // =============================================

  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  getAccountPath(): string {
    return this.accountPath;
  }

  /**
   * Test the connection with a simple API call
   */
  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    // Test REST
    const restResult = await this.getFacilities();
    if (!restResult.success) {
      return {
        success: false,
        message: `REST API failed: ${restResult.error}`,
        details: { statusCode: restResult.statusCode }
      };
    }

    // Test GraphQL
    const graphqlResult = await this.graphql(`
      query TestConnection {
        productViewConnection(first: 1) {
          edges { node { productId } }
        }
      }
    `);

    if (!graphqlResult.success) {
      return {
        success: false,
        message: `GraphQL API failed: ${graphqlResult.error}`,
        details: { statusCode: graphqlResult.statusCode }
      };
    }

    const facilityCount = restResult.data?.facilityCollection?.length || 0;
    return {
      success: true,
      message: `Connected! Found ${facilityCount} facilities.`,
      details: {
        accountPath: this.accountPath,
        facilities: facilityCount,
        rateLimit: this.rateLimitInfo
      }
    };
  }
}

// Factory function
export function createFinaleClient(config: FinaleConfig): FinaleClient {
  return new FinaleClient(config);
}

// Type exports
export type {
  FinaleConfig,
  FinaleResponse,
  RateLimitInfo,
  CustomField,
  PurchaseOrderOptions,
  ProductOptions,
  StockHistoryOptions
};