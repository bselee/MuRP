/**
 * Finale GraphQL API Client
 * 
 * Purchase orders are ONLY available via GraphQL API - REST doesn't support filtering
 * 
 * @see FINALE_REST_API_ENDPOINTS.md for REST vs GraphQL comparison
 */

import { CircuitBreaker } from '../../services/circuitBreaker';
import { retryWithBackoff } from '../../services/retryWithBackoff';
import { defaultRateLimiter } from '../../services/rateLimiter';
import type { FinalePurchaseOrder } from './types';

export interface GraphQLPurchaseOrderOptions {
  limit?: number;
  cursor?: string | null;
  status?: string[];
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  lastUpdatedFrom?: string; // For delta sync
}

export interface GraphQLPurchaseOrderResult {
  data: FinalePurchaseOrder[];
  hasNextPage: boolean;
  endCursor: string | null;
  totalFetched: number;
}

// GraphQL-specific circuit breaker
const graphqlCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  cooldownMs: 60000,
});

/**
 * Finale GraphQL Client for Purchase Orders
 */
export class FinaleGraphQLClient {
  private baseUrl: string;
  private accountPath: string;
  private auth: string;
  private timeout: number;

  constructor(config: {
    apiKey: string;
    apiSecret: string;
    accountPath: string;
    baseUrl?: string;
    timeout?: number;
  }) {
    this.baseUrl = config.baseUrl || 'https://app.finaleinventory.com';
    this.accountPath = config.accountPath;
    this.timeout = config.timeout || 30000; // GraphQL queries can be slower
    
    // HTTP Basic Auth
    const credentials = `${config.apiKey}:${config.apiSecret}`;
    this.auth = btoa(credentials);
  }

  /**
   * Fetch purchase orders using GraphQL (paginated)
   */
  async fetchPurchaseOrders(options: GraphQLPurchaseOrderOptions = {}): Promise<GraphQLPurchaseOrderResult> {
    try {
      const limit = options.limit || 100;
      const cursor = options.cursor || null;
      
      // Build filter arguments
      const statusFilter = options.status && options.status.length > 0 
        ? `, status: ${JSON.stringify(options.status)}` 
        : '';
      const supplierFilter = options.supplierId 
        ? `, supplier: ["${options.supplierId}"]` 
        : '';
      const dateFilter = (options?.dateFrom || options?.dateTo) 
        ? `, orderDate: {${options.dateFrom ? ` after: "${options.dateFrom}"` : ''}${options.dateFrom && options.dateTo ? ',' : ''}${options.dateTo ? ` before: "${options.dateTo}"` : ''} }`
        : '';
      
      const cursorArg = cursor ? `, after: "${cursor}"` : '';

      const query = {
        query: `
          query GetPurchaseOrders {
            orderViewConnection(
              first: ${limit}
              type: ["PURCHASE_ORDER"]
              ${cursorArg}
              ${statusFilter}
              ${supplierFilter}
              ${dateFilter}
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
                  supplier {
                    partyId
                    name
                  }
                  origin {
                    facilityUrl
                    name
                  }
                  itemList(first: 100) {
                    edges {
                      node {
                        product {
                          productId
                          productUrl
                        }
                        quantity
                        unitPrice
                      }
                    }
                  }
                  publicNotes
                  privateNotes
                  recordLastUpdated
                }
                cursor
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `
      };

      const response = await defaultRateLimiter.schedule(async () => {
        return graphqlCircuitBreaker.execute(async () => {
          return retryWithBackoff(
            async () => {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), this.timeout);

              try {
                const res = await fetch(
                  `${this.baseUrl}/${this.accountPath}/api/graphql`,
                  {
                    method: 'POST',
                    headers: {
                      Authorization: `Basic ${this.auth}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(query),
                    signal: controller.signal,
                  }
                );

                clearTimeout(timeoutId);

                if (!res.ok) {
                  const errorText = await res.text().catch(() => 'Unable to read error');
                  throw new Error(`GraphQL request failed: ${res.status} ${res.statusText} - ${errorText}`);
                }

                return res.json();
              } catch (err) {
                clearTimeout(timeoutId);
                if (err instanceof Error && err.name === 'AbortError') {
                  throw new Error(`GraphQL request timeout after ${this.timeout}ms`);
                }
                throw err;
              }
            },
            { baseDelayMs: 1000, maxDelayMs: 10000 }
          );
        });
      }, 'finale-graphql');

      // Handle GraphQL errors
      if (response.errors) {
        console.error('GraphQL errors:', response.errors);
        return { 
          data: [], 
          hasNextPage: false, 
          endCursor: null,
          totalFetched: 0
        };
      }

      const connection = response.data?.orderViewConnection;
      if (!connection) {
        return { 
          data: [], 
          hasNextPage: false, 
          endCursor: null,
          totalFetched: 0
        };
      }

      // Transform GraphQL response to FinalePurchaseOrder[]
      const purchaseOrders = connection.edges.map((edge: any) => 
        this.transformGraphQLNode(edge.node)
      );

      return {
        data: purchaseOrders,
        hasNextPage: connection.pageInfo.hasNextPage,
        endCursor: connection.pageInfo.endCursor,
        totalFetched: purchaseOrders.length,
      };
    } catch (error) {
      console.error('Failed to fetch purchase orders via GraphQL:', error);
      return { 
        data: [], 
        hasNextPage: false, 
        endCursor: null,
        totalFetched: 0
      };
    }
  }

  /**
   * Fetch ALL purchase orders (auto-paginate)
   */
  async fetchAllPurchaseOrders(options: Omit<GraphQLPurchaseOrderOptions, 'cursor' | 'limit'> = {}): Promise<FinalePurchaseOrder[]> {
    const allPOs: FinalePurchaseOrder[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    let pageCount = 0;
    const maxPages = 100; // Safety limit (10,000 POs)

    console.log('Starting full purchase order sync from Finale GraphQL...');

    while (hasNextPage && pageCount < maxPages) {
      const result = await this.fetchPurchaseOrders({
        ...options,
        limit: 100,
        cursor,
      });

      allPOs.push(...result.data);
      hasNextPage = result.hasNextPage;
      cursor = result.endCursor;
      pageCount++;

      console.log(`Fetched page ${pageCount}: ${result.totalFetched} POs (Total: ${allPOs.length})`);

      if (!hasNextPage) {
        console.log(`✅ Completed sync: ${allPOs.length} total purchase orders fetched`);
      }
    }

    if (pageCount >= maxPages) {
      console.warn(`⚠️ Hit page limit (${maxPages} pages). May have more data to fetch.`);
    }

    return allPOs;
  }

  /**
   * Fetch purchase orders modified since timestamp (delta sync)
   * Note: recordLastUpdated filter not supported by API, using orderDate instead
   */
  async fetchRecentPurchaseOrders(sinceTimestamp: string): Promise<FinalePurchaseOrder[]> {
    console.log(`Fetching POs with orderDate >= ${sinceTimestamp}...`);
    
    return this.fetchAllPurchaseOrders({
      dateFrom: sinceTimestamp,
    });
  }

  /**
   * Transform GraphQL node to FinalePurchaseOrder
   */
  private transformGraphQLNode(node: any): FinalePurchaseOrder {
    return {
      orderId: node.orderId,
      orderNumber: node.orderId,
      supplier: node.supplier?.partyId || '',
      supplierName: node.supplier?.name || '',
      status: node.status,
      orderDate: node.orderDate,
      expectedDate: node.receiveDate,
      receivedDate: node.receiveDate,
      subtotal: parseFloat(node.subtotal) || 0,
      tax: 0, // Not available in GraphQL schema
      shipping: 0, // Not available in GraphQL schema
      total: parseFloat(node.total) || 0,
      facilityId: node.origin?.facilityUrl || '',
      facilityName: node.origin?.name || '',
      lineItems: node.itemList?.edges?.map((itemEdge: any) => ({
        productId: itemEdge.node.product?.productId || '',
        productUrl: itemEdge.node.product?.productUrl || '',
        quantity: parseFloat(itemEdge.node.quantity) || 0,
        unitCost: parseFloat(itemEdge.node.unitPrice) || 0,
        total: (parseFloat(itemEdge.node.quantity) || 0) * (parseFloat(itemEdge.node.unitPrice) || 0),
        receivedQuantity: 0, // Not available in this GraphQL schema version
      })) || [],
      notes: node.publicNotes || node.privateNotes || '',
      lastUpdated: node.recordLastUpdated,
    };
  }

  /**
   * Test GraphQL connection
   */
  async testConnection(): Promise<{ success: boolean; message: string; sampleCount?: number }> {
    try {
      const result = await this.fetchPurchaseOrders({ limit: 5 });
      
      return {
        success: true,
        message: `GraphQL connection successful. Found ${result.totalFetched} sample purchase orders.`,
        sampleCount: result.totalFetched,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown GraphQL connection error',
      };
    }
  }
}

/**
 * Create Finale GraphQL client from environment variables
 */
export function createFinaleGraphQLClientFromEnv(): FinaleGraphQLClient | null {
  const apiKey = import.meta.env.VITE_FINALE_API_KEY;
  const apiSecret = import.meta.env.VITE_FINALE_API_SECRET;
  const accountPath = import.meta.env.VITE_FINALE_ACCOUNT_PATH;
  const baseUrl = import.meta.env.VITE_FINALE_BASE_URL || 'https://app.finaleinventory.com';

  if (!apiKey || !apiSecret || !accountPath) {
    console.warn('Finale API credentials not configured for GraphQL client');
    return null;
  }

  return new FinaleGraphQLClient({
    apiKey,
    apiSecret,
    accountPath,
    baseUrl,
  });
}

// Singleton instance
let graphqlClientInstance: FinaleGraphQLClient | null = null;

/**
 * Get or create Finale GraphQL client singleton
 */
export function getFinaleGraphQLClient(): FinaleGraphQLClient | null {
  if (!graphqlClientInstance) {
    graphqlClientInstance = createFinaleGraphQLClientFromEnv();
  }
  return graphqlClientInstance;
}
