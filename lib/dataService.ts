/**
 * Unified Data Service
 *
 * Provides a single API for accessing data from multiple sources:
 * - Mock data (for development/testing)
 * - Finale Inventory API (live data)
 * - Supabase (cached/persisted data)
 *
 * Features:
 * - Automatic source switching based on configuration
 * - Loading state management
 * - Error handling with fallbacks
 * - Response caching
 * - Data validation
 */

import { createFinaleClient } from './finale-client-v2';
import {
  transformFinaleProductsToInventory,
  transformFinaleVendorsToVendors,
  transformFinalePOsToPurchaseOrders,
  transformFinaleData,
  validateInventoryItem,
  validateVendor,
  validatePurchaseOrder,
} from './finale/transformers';
import type { TransformedFinaleData } from './finale/transformers';

import type {
  InventoryItem,
  Vendor,
  PurchaseOrder,
  BillOfMaterials,
  FinalePurchaseOrder,
} from '../types';

// =============================================================================
// Configuration
// =============================================================================

export type DataSource = 'mock' | 'finale' | 'supabase';

export interface DataServiceConfig {
  source: DataSource;
  enableCaching: boolean;
  cacheExpiryMs: number;
  enableValidation: boolean;
  onError?: (error: Error) => void;
  onLoadingChange?: (loading: boolean) => void;
}

const DEFAULT_CONFIG: DataServiceConfig = {
  source: 'finale', // Use Finale by default
  enableCaching: true,
  cacheExpiryMs: 5 * 60 * 1000, // 5 minutes
  enableValidation: true,
};

// =============================================================================
// Cache Management
// =============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class DataCache {
  private cache = new Map<string, CacheEntry<any>>();

  set<T>(key: string, data: T, expiryMs: number): void {
    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + expiryMs,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  clear(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// =============================================================================
// Data Service Class
// =============================================================================

export class DataService {
  private config: DataServiceConfig;
  private cache: DataCache;
  private loading = false;

  constructor(config: Partial<DataServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new DataCache();
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<DataServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): DataServiceConfig {
    return { ...this.config };
  }

  /**
   * Set loading state and notify listener
   */
  private setLoading(loading: boolean): void {
    this.loading = loading;
    this.config.onLoadingChange?.(loading);
  }

  /**
   * Handle errors and notify listener
   */
  private handleError(error: Error): never {
    this.setLoading(false);
    this.config.onError?.(error);
    throw error;
  }

  // ===========================================================================
  // Inventory Methods
  // ===========================================================================

  /**
   * Get inventory items from configured source
   */
  async getInventory(forceRefresh = false): Promise<InventoryItem[]> {
    const cacheKey = 'inventory';

    // Check cache first
    if (!forceRefresh && this.config.enableCaching) {
      const cached = this.cache.get<InventoryItem[]>(cacheKey);
      if (cached) {
        console.log('[DataService] Returning cached inventory');
        return cached;
      }
    }

    this.setLoading(true);

    try {
      let inventory: InventoryItem[];

      switch (this.config.source) {
        case 'finale':
          inventory = await this.getInventoryFromFinale();
          break;

        case 'supabase':
          // TODO: Implement Supabase fetch
          throw new Error('Supabase source not yet implemented');

        case 'mock':
        default:
          inventory = await this.getInventoryFromMock();
          break;
      }

      // Validate data if enabled
      if (this.config.enableValidation) {
        inventory = this.validateInventoryData(inventory);
      }

      // Cache the result
      if (this.config.enableCaching) {
        this.cache.set(cacheKey, inventory, this.config.cacheExpiryMs);
      }

      this.setLoading(false);
      return inventory;
    } catch (error) {
      return this.handleError(error as Error);
    }
  }

  /**
   * Fetch inventory from Finale API
   */
  private async getInventoryFromFinale(): Promise<InventoryItem[]> {
    // Create new Finale client from environment variables
    const apiKey = import.meta.env.VITE_FINALE_API_KEY;
    const apiSecret = import.meta.env.VITE_FINALE_API_SECRET;
    const accountPath = import.meta.env.VITE_FINALE_ACCOUNT_PATH;

    if (!apiKey || !apiSecret || !accountPath) {
      throw new Error('Finale client not configured. Please set up Finale API credentials.');
    }

    const finaleClient = createFinaleClient({
      accountPath,
      apiKey,
      apiSecret,
      timeout: 30000,
      requestsPerMinute: 50
    });

    console.log('[DataService] Fetching inventory from Finale API...');

    const response = await finaleClient.getProductsWithStock({
      status: ['PRODUCT_ACTIVE']
    });

    if (!response.success) {
      throw new Error(`Failed to fetch products: ${response.error}`);
    }

    const inventory = transformFinaleProductsToInventory(response.data);

    console.log(`[DataService] Fetched ${inventory.length} products from Finale`);

    return inventory;
  }

  /**
   * Get mock inventory data
   */
  private async getInventoryFromMock(): Promise<InventoryItem[]> {
    console.log('[DataService] Using mock inventory data');

    // Dynamically import to avoid circular dependencies
    const { mockInventory } = await import('../types');
    return mockInventory;
  }

  /**
   * Validate inventory data
   */
  private validateInventoryData(inventory: InventoryItem[]): InventoryItem[] {
    const validItems: InventoryItem[] = [];
    const errors: string[] = [];

    inventory.forEach((item, index) => {
      const validation = validateInventoryItem(item);

      if (validation.valid) {
        validItems.push(item);
      } else {
        errors.push(`Item ${index} (${item.sku}): ${validation.errors.join(', ')}`);
      }
    });

    if (errors.length > 0) {
      console.warn('[DataService] Validation errors:', errors);
    }

    return validItems;
  }

  // ===========================================================================
  // Vendor Methods
  // ===========================================================================

  /**
   * Get vendors from configured source
   */
  async getVendors(forceRefresh = false): Promise<Vendor[]> {
    const cacheKey = 'vendors';

    // Check cache first
    if (!forceRefresh && this.config.enableCaching) {
      const cached = this.cache.get<Vendor[]>(cacheKey);
      if (cached) {
        console.log('[DataService] Returning cached vendors');
        return cached;
      }
    }

    this.setLoading(true);

    try {
      let vendors: Vendor[];

      switch (this.config.source) {
        case 'finale':
          vendors = await this.getVendorsFromFinale();
          break;

        case 'supabase':
          // TODO: Implement Supabase fetch
          throw new Error('Supabase source not yet implemented');

        case 'mock':
        default:
          vendors = await this.getVendorsFromMock();
          break;
      }

      // Validate data if enabled
      if (this.config.enableValidation) {
        vendors = this.validateVendorData(vendors);
      }

      // Cache the result
      if (this.config.enableCaching) {
        this.cache.set(cacheKey, vendors, this.config.cacheExpiryMs);
      }

      this.setLoading(false);
      return vendors;
    } catch (error) {
      return this.handleError(error as Error);
    }
  }

  /**
   * Fetch vendors from Finale API
   */
  private async getVendorsFromFinale(): Promise<Vendor[]> {
    // Create new Finale client from environment variables
    const apiKey = import.meta.env.VITE_FINALE_API_KEY;
    const apiSecret = import.meta.env.VITE_FINALE_API_SECRET;
    const accountPath = import.meta.env.VITE_FINALE_ACCOUNT_PATH;

    if (!apiKey || !apiSecret || !accountPath) {
      throw new Error('Finale API credentials not configured. Please set up Finale API credentials.');
    }

    const finaleClient = createFinaleClient({
      accountPath,
      apiKey,
      apiSecret,
      timeout: 30000,
      requestsPerMinute: 50
    });

    console.log('[DataService] Fetching vendors from Finale API...');

    const finaleVendors = await finaleClient.getAllVendors();
    const vendors = transformFinaleVendorsToVendors(finaleVendors);

    console.log(`[DataService] Fetched ${vendors.length} vendors from Finale`);

    return vendors;
  }

  /**
   * Get mock vendor data
   */
  private async getVendorsFromMock(): Promise<Vendor[]> {
    console.log('[DataService] Using mock vendor data');

    const { mockVendors } = await import('../types');
    return mockVendors;
  }

  /**
   * Transform GraphQL purchase order response to FinalePurchaseOrder format
   */
  private transformGraphQLPurchaseOrders(edges: any[]): FinalePurchaseOrder[] {
    return edges.map(node => ({
      orderId: node.orderId,
      orderUrl: node.orderUrl,
      type: node.type,
      status: node.status,
      orderDate: node.orderDate,
      receiveDate: node.receiveDate,
      total: parseFloat(node.total) || 0,
      subtotal: parseFloat(node.subtotal) || 0,
      publicNotes: node.publicNotes || '',
      privateNotes: node.privateNotes || '',
      lastModified: node.recordLastUpdated,
      supplier: node.supplier ? {
        partyId: node.supplier.partyId,
        partyUrl: node.supplier.partyUrl,
        name: node.supplier.name
      } : undefined,
      facility: node.origin?.name || '',
      facilityId: node.origin?.facilityId || '',
      items: node.itemList?.edges?.map((itemEdge: any) => ({
        productId: itemEdge.node.productId,
        productUrl: itemEdge.node.productUrl,
        productName: itemEdge.node.productName,
        quantity: parseFloat(itemEdge.node.quantity) || 0,
        unitPrice: parseFloat(itemEdge.node.unitPrice) || 0,
        receivedQuantity: parseFloat(itemEdge.node.receivedQuantity) || 0
      })) || [],
      customFields: node.userFieldDataList?.reduce((acc: Record<string, any>, field: any) => {
        acc[field.attrName] = field.attrValue;
        return acc;
      }, {}) || {}
    }));
  }

  // ===========================================================================
  // Purchase Order Methods
  // ===========================================================================

  /**
   * Get purchase orders from configured source
   */
  async getPurchaseOrders(forceRefresh = false): Promise<PurchaseOrder[]> {
    const cacheKey = 'purchaseOrders';

    // Check cache first
    if (!forceRefresh && this.config.enableCaching) {
      const cached = this.cache.get<PurchaseOrder[]>(cacheKey);
      if (cached) {
        console.log('[DataService] Returning cached purchase orders');
        return cached;
      }
    }

    this.setLoading(true);

    try {
      let purchaseOrders: PurchaseOrder[];

      switch (this.config.source) {
        case 'finale':
          purchaseOrders = await this.getPurchaseOrdersFromFinale();
          break;

        case 'supabase':
          throw new Error('Supabase purchase order source not yet implemented.');

        case 'mock':
          throw new Error('Mock purchase order source has been removed. Please use Finale or Supabase.');

        default:
          purchaseOrders = await this.getPurchaseOrdersFromFinale();
          break;
      }

      // Validate data if enabled
      if (this.config.enableValidation) {
        purchaseOrders = this.validatePurchaseOrderData(purchaseOrders);
      }

      // Cache the result
      if (this.config.enableCaching) {
        this.cache.set(cacheKey, purchaseOrders, this.config.cacheExpiryMs);
      }

      this.setLoading(false);
      return purchaseOrders;
    } catch (error) {
      return this.handleError(error as Error);
    }
  }

  /**
   * Fetch purchase orders from Finale API
   */
  private async getPurchaseOrdersFromFinale(): Promise<PurchaseOrder[]> {
    // Create new Finale client from environment variables
    const apiKey = import.meta.env.VITE_FINALE_API_KEY;
    const apiSecret = import.meta.env.VITE_FINALE_API_SECRET;
    const accountPath = import.meta.env.VITE_FINALE_ACCOUNT_PATH;

    if (!apiKey || !apiSecret || !accountPath) {
      throw new Error('Finale client not configured. Please set up Finale API credentials.');
    }

    const finaleClient = createFinaleClient({
      accountPath,
      apiKey,
      apiSecret,
      timeout: 30000,
      requestsPerMinute: 50
    });

    console.log('[DataService] Fetching purchase orders from Finale API...');

    const finalePOs = await finaleClient.getAllPurchaseOrders({
      startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Last year
    });

    // Transform GraphQL response to FinalePurchaseOrder format
    const transformedPOs = this.transformGraphQLPurchaseOrders(finalePOs);
    const purchaseOrders = transformFinalePOsToPurchaseOrders(transformedPOs);

    console.log(`[DataService] Fetched ${purchaseOrders.length} purchase orders from Finale`);

    return purchaseOrders;
  }

  /**
   * Validate purchase order data
   */
  private validatePurchaseOrderData(purchaseOrders: PurchaseOrder[]): PurchaseOrder[] {
    const validPOs: PurchaseOrder[] = [];
    const errors: string[] = [];

    purchaseOrders.forEach((po, index) => {
      const validation = validatePurchaseOrder(po);

      if (validation.valid) {
        validPOs.push(po);
      } else {
        errors.push(`PO ${index} (${po.id}): ${validation.errors.join(', ')}`);
      }
    });

    if (errors.length > 0) {
      console.warn('[DataService] Validation errors:', errors);
    }

    return validPOs;
  }

  // ===========================================================================
  // Bulk Sync Methods
  // ===========================================================================

  /**
   * Sync all data from Finale at once
   */
  async syncAllFromFinale(): Promise<TransformedFinaleData> {
    // Create new Finale client from environment variables
    const apiKey = import.meta.env.VITE_FINALE_API_KEY;
    const apiSecret = import.meta.env.VITE_FINALE_API_SECRET;
    const accountPath = import.meta.env.VITE_FINALE_ACCOUNT_PATH;

    if (!apiKey || !apiSecret || !accountPath) {
      throw new Error('Finale client not configured. Please set up Finale API credentials.');
    }

    const finaleClient = createFinaleClient({
      accountPath,
      apiKey,
      apiSecret,
      timeout: 30000,
      requestsPerMinute: 50
    });

    this.setLoading(true);

    try {
      console.log('[DataService] Starting bulk sync from Finale...');

      // Fetch all data in parallel
      const [productsResponse, vendors, purchaseOrders] = await Promise.all([
        finaleClient.getProductsWithStock({ status: ['PRODUCT_ACTIVE'] }),
        finaleClient.getAllVendors(),
        finaleClient.getAllPurchaseOrders({
          startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }),
      ]);

      if (!productsResponse.success) {
        throw new Error(`Failed to fetch products: ${productsResponse.error}`);
      }

      // Transform GraphQL data
      const transformedVendors = transformFinaleVendorsToVendors(vendors);
      const transformedPOs = this.transformGraphQLPurchaseOrders(purchaseOrders);
      const transformedPurchaseOrders = transformFinalePOsToPurchaseOrders(transformedPOs);

      // Transform all data
      const transformedData = transformFinaleData({
        products: productsResponse.data,
        vendors: transformedVendors,
        purchaseOrders: transformedPurchaseOrders,
      });

      // Cache everything
      if (this.config.enableCaching) {
        this.cache.set('inventory', transformedData.inventory, this.config.cacheExpiryMs);
        this.cache.set('vendors', transformedData.vendors, this.config.cacheExpiryMs);
        this.cache.set('purchaseOrders', transformedData.purchaseOrders, this.config.cacheExpiryMs);
      }

      console.log('[DataService] Bulk sync complete:', {
        products: transformedData.inventory.length,
        vendors: transformedData.vendors.length,
        purchaseOrders: transformedData.purchaseOrders.length,
      });

      this.setLoading(false);

      return transformedData;
    } catch (error) {
      return this.handleError(error as Error);
    }
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Clear all cached data
   */
  clearCache(key?: string): void {
    this.cache.clear(key);
    console.log(`[DataService] Cache cleared${key ? ` for key: ${key}` : ''}`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Check if currently loading
   */
  isLoading(): boolean {
    return this.loading;
  }

  /**
   * Switch data source
   */
  switchSource(source: DataSource): void {
    this.config.source = source;
    this.clearCache(); // Clear cache when switching sources
    console.log(`[DataService] Switched to ${source} source`);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let dataServiceInstance: DataService | null = null;

/**
 * Get or create DataService singleton
 */
export function getDataService(config?: Partial<DataServiceConfig>): DataService {
  if (!dataServiceInstance) {
    dataServiceInstance = new DataService(config);
  }

  return dataServiceInstance;
}

/**
 * Reset singleton (useful for testing)
 */
export function resetDataService(): void {
  dataServiceInstance = null;
}

// =============================================================================
// Convenience Exports
// =============================================================================

export default {
  DataService,
  getDataService,
  resetDataService,
};
