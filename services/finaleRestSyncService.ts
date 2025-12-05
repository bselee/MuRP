/**
 * Finale REST API Sync Service - Professional Edition
 * 
 * Optimized for minimal API hits with:
 * - Delta sync (only fetch changed data)
 * - Intelligent caching with timestamps
 * - Batch operations with configurable limits
 * - Historical data tracking (current year)
 * - Rate limiting and circuit breaker
 * - Progress monitoring and error recovery
 * 
 * Facility Filter: SHIPPING only
 * Data Sources: REST API (no CSV dependencies)
 */

import { createClient } from '@supabase/supabase-js';
import { FinaleClient, createFinaleClient } from '../lib/finale-client-v2';
import { CircuitBreaker } from './circuitBreaker';
import { RateLimiter } from './rateLimiter';
import { retryWithBackoff } from './retryWithBackoff';
import type { Database } from '../types/database';

// Types for Finale REST API responses
interface FinaleProduct {
  productId: string;
  internalName?: string;
  name?: string;
  description?: string;
  statusId: 'PRODUCT_ACTIVE' | 'PRODUCT_INACTIVE' | 'PRODUCT_DISCONTINUED';
  status?: 'PRODUCT_ACTIVE' | 'PRODUCT_INACTIVE' | 'PRODUCT_DISCONTINUED'; // fallback
  unitsInStock: number;
  unitsOnOrder: number;
  unitsReserved: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  moq?: number;
  cost?: number;
  price?: number;
  defaultSupplier?: string;
  facility?: string;
  category?: string;
  barcode?: string;
  weight?: number;
  weightUnit?: string;
  customFields?: Record<string, any>;
  createdDate: string;
  lastUpdatedDate: string;
  lastModified?: string; // fallback
}

interface FinalePurchaseOrder {
  purchaseOrderId: string;
  orderNumber: string;
  supplier: string;
  facility?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  orderDate: string;
  expectedDate?: string;
  receivedDate?: string;
  subtotal: number;
  tax?: number;
  shipping?: number;
  total: number;
  lineItems?: Array<{
    product: string;
    productId?: string;
    sku?: string;
    quantity: number;
    unitCost: number;
    total: number;
    receivedQuantity?: number;
  }>;
  notes?: string;
  createdDate: string;
  lastModified: string;
}

interface FinaleBOM {
  parentProductId: string;
  parentSku: string;
  components: Array<{
    productId: string;
    sku: string;
    quantity: number;
  }>;
}

interface SyncProgress {
  phase: 'products' | 'purchase_orders' | 'boms' | 'complete';
  current: number;
  total: number;
  percentage: number;
  message: string;
  errors?: string[];
}

interface SyncMetrics {
  apiCallsTotal: number;
  apiCallsSaved: number;
  recordsProcessed: number;
  recordsUpdated: number;
  recordsInserted: number;
  errors: number;
  duration: number;
}

interface SyncConfig {
  // Facility filter
  facilityName: string;
  
  // Rate limiting (60 requests/minute Finale limit)
  requestsPerMinute: number;
  
  // Batch sizes
  productBatchSize: number;
  purchaseOrderBatchSize: number;
  
  // Historical data (current year)
  historicalStartDate: string;
  
  // Delta sync settings
  enableDeltaSync: boolean;
  deltaThresholdHours: number;
  
  // Retry configuration
  maxRetries: number;
  retryDelayMs: number;
}

export class FinaleRestSyncService {
  private client: FinaleClient | null = null;
  private supabase: ReturnType<typeof createClient<Database>>;
  private config: SyncConfig;
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;
  
  private progress: SyncProgress | null = null;
  private metrics: SyncMetrics;
  private listeners: Array<(progress: SyncProgress) => void> = [];
  
  constructor(config?: Partial<SyncConfig> & { supabaseUrl?: string; supabaseKey?: string }) {
    const supabaseUrl = config?.supabaseUrl || import.meta.env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = config?.supabaseKey || import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }
    
    this.supabase = createClient<Database>(supabaseUrl, supabaseKey);
    
    // Default configuration
    const currentYear = new Date().getFullYear();
    this.config = {
      facilityName: 'shipping',
      requestsPerMinute: 50, // Conservative (limit is 60)
      productBatchSize: 100,
      purchaseOrderBatchSize: 100,
      historicalStartDate: `${currentYear}-01-01`,
      enableDeltaSync: true,
      deltaThresholdHours: 4, // Only full sync if last sync > 4 hours ago
      maxRetries: 3,
      retryDelayMs: 2000,
      ...config,
    };
    
    // Initialize resilience patterns
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000,
      monitorInterval: 10000,
    });
    
    this.rateLimiter = new RateLimiter({
      perIdentity: {
        maxRequests: this.config.requestsPerMinute,
        intervalMs: 60000,
      },
      global: {
        maxRequests: this.config.requestsPerMinute * 2,
        intervalMs: 60000,
      },
    });
    
    // Initialize metrics
    this.metrics = this.resetMetrics();
  }
  
  /**
   * Set Finale API credentials
   */
  setCredentials(apiKey: string, apiSecret: string, accountPath: string): void {
    this.client = createFinaleClient({
      apiKey,
      apiSecret,
      accountPath,
      timeout: 30000,
      requestsPerMinute: 50,
    });
  }
  
  /**
   * Test connection to Finale API
   */
  async testConnection(): Promise<{ success: boolean; message: string; facilities?: any[] }> {
    if (!this.client) {
      return { success: false, message: 'API credentials not configured' };
    }
    
    try {
      const result = await this.client.testConnection();
      return result;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }
  
  /**
   * Main sync orchestrator - intelligently syncs all data
   */
  async syncAll(): Promise<SyncMetrics> {
    if (!this.client) {
      throw new Error('Finale API credentials not configured. Call setCredentials() first.');
    }
    
    const startTime = Date.now();
    this.metrics = this.resetMetrics();
    
    console.log('[FinaleRestSync] Starting intelligent sync...');
    
    try {
      // Check if delta sync is possible
      const lastSync = await this.getLastSyncTimestamp();
      const hoursSinceLastSync = lastSync 
        ? (Date.now() - lastSync.getTime()) / (1000 * 60 * 60)
        : Infinity;
      
      const useDeltaSync = this.config.enableDeltaSync && 
                          hoursSinceLastSync < this.config.deltaThresholdHours;
      
      if (useDeltaSync) {
        console.log(`[FinaleRestSync] Delta sync: Last sync ${hoursSinceLastSync.toFixed(1)}h ago`);
      } else {
        console.log('[FinaleRestSync] Full sync: First sync or threshold exceeded');
      }
      
      // Sync in optimized order: Vendors → Products → BOMs → Purchase Orders
      await this.syncProducts(useDeltaSync ? lastSync : null);
      await this.syncPurchaseOrders(useDeltaSync ? lastSync : null);
      await this.syncBOMs();
      
      // Record successful sync
      await this.recordSyncTimestamp();
      
      this.metrics.duration = Date.now() - startTime;
      
      this.updateProgress({
        phase: 'complete',
        current: 100,
        total: 100,
        percentage: 100,
        message: `Sync complete: ${this.metrics.recordsProcessed} records processed`,
      });
      
      console.log('[FinaleRestSync] Sync completed successfully:', this.metrics);
      
      return this.metrics;
      
    } catch (error) {
      this.metrics.duration = Date.now() - startTime;
      this.metrics.errors++;
      console.error('[FinaleRestSync] Sync failed:', error);
      throw error;
    }
  }
  
  /**
   * Sync products from Finale REST API with pagination and filtering
   */
  private async syncProducts(deltaSyncFrom: Date | null): Promise<void> {
    console.log('[FinaleRestSync] Syncing products...');
    
    this.updateProgress({
      phase: 'products',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Fetching products from Finale API...',
    });
    
    const allProducts: FinaleProduct[] = [];
    let offset = 0;
    let hasMore = true;
    let batchCount = 0;
    
    while (hasMore) {
      batchCount++;
      
      const response = await this.rateLimiter.schedule(async () => {
        return await this.circuitBreaker.execute(async () => {
          return await retryWithBackoff(
            async () => await this.client!.getProducts(this.config.productBatchSize, offset),
            {
              maxAttempts: this.config.maxRetries,
              baseDelayMs: this.config.retryDelayMs,
            }
          );
        });
      }, 'finale-products');
      
      if (!response.success) {
        throw new Error(`Failed to fetch products: ${response.error}`);
      }
      
      // Transform columnar data to array
      const columnarData = response.data;
      const products = this.transformColumnarToProducts(columnarData);
      
      console.log(`[FinaleRestSync] Batch ${batchCount}: received ${products.length} products`);
      
      this.metrics.apiCallsTotal++;
      
      // Filter by facility (SHIPPING)
      const shippingProducts = products.filter(p => 
        !p.facility || p.facility.toLowerCase().includes(this.config.facilityName.toLowerCase())
      );
      
      // Delta sync: only include modified items
      const relevantProducts = deltaSyncFrom
        ? shippingProducts.filter(p => new Date(p.lastModified) > deltaSyncFrom)
        : shippingProducts;
      
      allProducts.push(...relevantProducts);
      
      console.log(`[FinaleRestSync] Batch ${batchCount}: Fetched ${products.length}, Filtered ${shippingProducts.length}, Relevant ${relevantProducts.length}`);
      
      // Check if we should continue pagination
      hasMore = products.length === this.config.productBatchSize;
      offset += this.config.productBatchSize;
      
      // If delta sync and we got fewer relevant items, likely past the modified threshold
      if (deltaSyncFrom && relevantProducts.length < shippingProducts.length * 0.1) {
        console.log('[FinaleRestSync] Delta sync: Minimal changes detected, stopping pagination early');
        this.metrics.apiCallsSaved += 10; // Estimate saved calls
        hasMore = false;
      }
      
      this.updateProgress({
        phase: 'products',
        current: offset,
        total: offset + (hasMore ? this.config.productBatchSize : 0),
        percentage: Math.min(90, (offset / (offset + 100)) * 100),
        message: `Fetched ${allProducts.length} products (${batchCount} API calls)`,
      });
    }
    
    console.log(`[FinaleRestSync] Total products fetched: ${allProducts.length}`);
    
    // Transform and save to Supabase
    await this.saveProductsToDatabase(allProducts);
    
    this.updateProgress({
      phase: 'products',
      current: allProducts.length,
      total: allProducts.length,
      percentage: 100,
      message: `Synced ${allProducts.length} products`,
    });
  }
  
  /**
   * Sync purchase orders with line items (current year + historical)
   */
  private async syncPurchaseOrders(deltaSyncFrom: Date | null): Promise<void> {
    console.log('[FinaleRestSync] Syncing purchase orders...');

    this.updateProgress({
      phase: 'purchase_orders',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Fetching purchase orders from Finale API...',
    });

    const allPOs: FinalePurchaseOrder[] = [];
    let hasNextPage = true;
    let endCursor: string | undefined;
    let batchCount = 0;

    while (hasNextPage) {
      batchCount++;

      const response = await this.rateLimiter.schedule(async () => {
        return await this.circuitBreaker.execute(async () => {
          return await retryWithBackoff(
            async () => await this.client!.getPurchaseOrders({
              first: this.config.purchaseOrderBatchSize,
              after: endCursor,
              startDate: this.config.historicalStartDate,
              status: ['Pending', 'Submitted', 'Ordered', 'Partial', 'Completed']
            }),
            {
              maxAttempts: this.config.maxRetries,
              baseDelayMs: this.config.retryDelayMs,
            }
          );
        });
      }, 'finale-pos');

      if (!response.success) {
        throw new Error(`Failed to fetch purchase orders: ${response.error}`);
      }

      const data = response.data;
      if (!data?.orderViewConnection) {
        console.log('[FinaleRestSync] No more purchase orders to fetch');
        break;
      }

      // Transform GraphQL response to FinalePurchaseOrder format
      const pos = this.transformGraphQLPurchaseOrders(data.orderViewConnection.edges);

      this.metrics.apiCallsTotal++;

      // Filter by facility and date range (additional filtering beyond GraphQL)
      const relevantPOs = pos.filter(po => {
        // Facility filter (if needed beyond GraphQL filtering)
        const facilityMatch = !po.facility ||
          po.facility.toLowerCase().includes(this.config.facilityName.toLowerCase());

        // Delta sync filter
        const deltaMatch = deltaSyncFrom
          ? new Date(po.lastModified) > deltaSyncFrom
          : true;

        return facilityMatch && deltaMatch;
      });

      allPOs.push(...relevantPOs);

      console.log(`[FinaleRestSync] PO Batch ${batchCount}: Fetched ${pos.length}, Relevant ${relevantPOs.length}`);

      // Check pagination
      hasNextPage = data.orderViewConnection.pageInfo?.hasNextPage || false;
      endCursor = data.orderViewConnection.pageInfo?.endCursor;

      // Early exit for delta sync
      if (deltaSyncFrom && relevantPOs.length === 0 && batchCount > 2) {
        console.log('[FinaleRestSync] Delta sync: No recent PO changes, stopping early');
        this.metrics.apiCallsSaved += 5;
        hasNextPage = false;
      }

      this.updateProgress({
        phase: 'purchase_orders',
        current: allPOs.length,
        total: allPOs.length + (hasNextPage ? this.config.purchaseOrderBatchSize : 0),
        percentage: Math.min(90, (allPOs.length / (allPOs.length + 100)) * 100),
        message: `Fetched ${allPOs.length} purchase orders (${batchCount} API calls)`,
      });
    }

    console.log(`[FinaleRestSync] Total purchase orders fetched: ${allPOs.length}`);

    // Save to database
    await this.savePurchaseOrdersToDatabase(allPOs);

    this.updateProgress({
      phase: 'purchase_orders',
      current: allPOs.length,
      total: allPOs.length,
      percentage: 100,
      message: `Synced ${allPOs.length} purchase orders`,
    });
  }
  
  /**
   * Sync BOMs (extracted from product component relationships)
   */
  private async syncBOMs(): Promise<void> {
    console.log('[FinaleRestSync] Syncing BOMs from product data...');
    
    // BOMs are derived from products with component relationships
    // This is a lightweight operation using existing product data
    
    const { data: products, error } = await this.supabase
      .from('inventory_items')
      .select('id, sku, finale_product_id, custom_fields')
      .eq('status', 'active');
    
    if (error) {
      console.error('[FinaleRestSync] Failed to fetch products for BOM extraction:', error);
      return;
    }
    
    // Extract BOMs from products with component data
    const boms: FinaleBOM[] = [];
    
    products?.forEach(product => {
      const customFields = product.custom_fields as Record<string, any> | null;
      if (customFields?.components && Array.isArray(customFields.components)) {
        boms.push({
          parentProductId: product.finale_product_id || product.id,
          parentSku: product.sku,
          components: customFields.components,
        });
      }
    });
    
    console.log(`[FinaleRestSync] Extracted ${boms.length} BOMs from product data`);
    
    // Save BOMs to database
    await this.saveBOMsToDatabase(boms);
    
    this.metrics.recordsProcessed += boms.length;
  }
  
  /**
   * Save products to Supabase with upsert logic
   */
  private async saveProductsToDatabase(products: FinaleProduct[]): Promise<void> {
    if (products.length === 0) return;
    
    console.log(`[FinaleRestSync] Saving ${products.length} products to database...`);
    
    // Transform to database schema
    const dbProducts = products.map(p => ({
      sku: p.productId, // API returns productId, not sku
      name: p.internalName || p.name || '', // API returns internalName, not name
      description: p.description || '',
      category: p.category || 'Uncategorized',
      status: p.statusId === 'PRODUCT_ACTIVE' ? 'active' : 'inactive', // API returns statusId, not status
      stock: p.unitsInStock || 0,
      on_order: p.unitsOnOrder || 0,
      reserved: p.unitsReserved || 0,
      min_stock: p.reorderPoint || 0,
      order_point: p.reorderPoint || 0,
      moq: p.moq || 0,
      cost: p.cost || 0,
      price: p.price || 0,
      barcode: p.barcode || '',
      notes: '',
      finale_product_id: p.productId,
      finale_last_modified: p.lastUpdatedDate || p.lastModified, // API returns lastUpdatedDate
      custom_fields: p.customFields || {},
      updated_at: new Date().toISOString(),
    }));
    
    // Upsert in batches of 100
    const batchSize = 100;
    for (let i = 0; i < dbProducts.length; i += batchSize) {
      const batch = dbProducts.slice(i, i + batchSize);
      
      const { error } = await this.supabase
        .from('inventory_items')
        .upsert(batch, { 
          onConflict: 'sku',
          ignoreDuplicates: false 
        });
      
      if (error) {
        console.error('[FinaleRestSync] Error saving products batch:', error);
        this.metrics.errors++;
      } else {
        this.metrics.recordsProcessed += batch.length;
        this.metrics.recordsUpdated += batch.length;
      }
    }
    
    console.log(`[FinaleRestSync] Saved ${dbProducts.length} products to database`);
  }
  
  /**
   * Save purchase orders to Supabase with line items
   */
  private async savePurchaseOrdersToDatabase(pos: FinalePurchaseOrder[]): Promise<void> {
    if (pos.length === 0) return;
    
    console.log(`[FinaleRestSync] Saving ${pos.length} purchase orders to database...`);
    
    // Transform to database schema
    const dbPOs = pos.map(po => ({
      order_id: po.orderNumber,
      supplier_name: po.supplier || 'Unknown Supplier',
      vendor_id: null, // Will be matched by supplier name in a separate process
      status: po.status.toLowerCase().replace('_', ' '),
      order_date: po.orderDate,
      expected_date: po.expectedDate || null,
      actual_receive_date: po.receivedDate || null,
      subtotal: po.subtotal || 0,
      tax_amount: po.tax || 0,
      shipping_cost: po.shipping || 0,
      total_amount: po.total || 0,
      notes: po.notes || '',
      line_items: JSON.stringify(po.lineItems || []),
      finale_po_id: po.purchaseOrderId,
      finale_supplier: po.supplier,
      finale_last_modified: po.lastModified,
      updated_at: new Date().toISOString(),
      created_at: po.createdDate || new Date().toISOString(),
    }));
    
    // Upsert in batches
    const batchSize = 50;
    for (let i = 0; i < dbPOs.length; i += batchSize) {
      const batch = dbPOs.slice(i, i + batchSize);
      
      const { error } = await this.supabase
        .from('purchase_orders')
        .upsert(batch, { 
          onConflict: 'order_id',
          ignoreDuplicates: false 
        });
      
      if (error) {
        console.error('[FinaleRestSync] Error saving POs batch:', error);
        this.metrics.errors++;
      } else {
        this.metrics.recordsProcessed += batch.length;
        this.metrics.recordsUpdated += batch.length;
      }
    }
    
    console.log(`[FinaleRestSync] Saved ${dbPOs.length} purchase orders to database`);
  }
  
  /**
   * Save BOMs to database
   */
  private async saveBOMsToDatabase(boms: FinaleBOM[]): Promise<void> {
    if (boms.length === 0) return;
    
    // BOMs would be saved to a boms table if it exists
    // For now, they're embedded in product custom_fields
    console.log(`[FinaleRestSync] ${boms.length} BOMs available in product data`);
  }
  
  /**
   * Get last successful sync timestamp from database
   */
  private async getLastSyncTimestamp(): Promise<Date | null> {
    const { data, error } = await this.supabase
      .from('sync_log')
      .select('completed_at')
      .eq('source', 'finale_rest')
      .eq('status', 'success')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !data) return null;
    return new Date(data.completed_at);
  }
  
  /**
   * Record successful sync timestamp
   */
  private async recordSyncTimestamp(): Promise<void> {
    await this.supabase.from('sync_log').insert({
      source: 'finale_rest',
      status: 'success',
      records_processed: this.metrics.recordsProcessed,
      api_calls: this.metrics.apiCallsTotal,
      duration_ms: this.metrics.duration,
      completed_at: new Date().toISOString(),
    });
  }
  
  /**
   * Progress tracking
   */
  private updateProgress(progress: SyncProgress): void {
    this.progress = progress;
    this.listeners.forEach(listener => listener(progress));
  }
  
  onProgress(listener: (progress: SyncProgress) => void): void {
    this.listeners.push(listener);
  }
  
  private resetMetrics(): SyncMetrics {
    return {
      apiCallsTotal: 0,
      apiCallsSaved: 0,
      recordsProcessed: 0,
      recordsUpdated: 0,
      recordsInserted: 0,
      errors: 0,
      duration: 0,
    };
  }
  
  /**
   * Transform Finale columnar JSON response to array of product objects
   */
  private transformColumnarToProducts(columnarData: any): FinaleProduct[] {
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
        internalName: columnarData.internalName?.[i] || columnarData.name?.[i] || '',
        description: columnarData.description?.[i] || '',
        statusId: (columnarData.statusId?.[i] || columnarData.status?.[i] || 'PRODUCT_ACTIVE') as any,
        status: (columnarData.statusId?.[i] || columnarData.status?.[i] || 'PRODUCT_ACTIVE') as any,
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

  /**
   * Transform GraphQL purchase order response to FinalePurchaseOrder format
   */
  private transformGraphQLPurchaseOrders(edges: any[]): FinalePurchaseOrder[] {
    return edges.map(edge => {
      const node = edge.node;
      return {
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
      };
    });
  }

  /**
   * Get current metrics
   */
  getMetrics(): SyncMetrics {
    return { ...this.metrics };
  }
}

// Singleton instance
let syncServiceInstance: FinaleRestSyncService | null = null;

export function getFinaleRestSyncService(): FinaleRestSyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new FinaleRestSyncService();
  }
  return syncServiceInstance;
}
