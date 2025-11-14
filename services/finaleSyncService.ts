/**
 * Finale Sync Service
 * 
 * World-class data synchronization service that:
 * - Intelligently syncs data from Finale REST API to Supabase
 * - Implements smart rate limiting to respect API quotas
 * - Uses thoughtful refresh intervals (5min for critical, 1hr for stable)
 * - Provides real-time sync status and progress tracking
 * - Handles errors gracefully with exponential backoff
 * - Caches data to minimize API calls
 */

import { FinaleBasicAuthClient } from './finaleBasicAuthClient';
import { RateLimiter } from './rateLimiter';
import { CircuitBreaker } from './circuitBreaker';
import { retryWithBackoff } from './retryWithBackoff';
import { supabase } from '../lib/supabase/client';
import type { Tables } from '../lib/supabase/client';
import {
  transformFinaleProductsToInventory,
  transformFinaleSuppliersToVendors,
  transformFinalePOsToPurchaseOrders,
  extractBOMsFromFinaleProducts,
  validateInventoryItem,
  validateVendor,
  validatePurchaseOrder,
  type FinaleProduct,
  type FinaleSupplier,
  type FinalePurchaseOrder as FinalePOType,
} from '../lib/finale/transformers';
import { createBackupService } from './backupService';
import {
  transformVendorParsedToDatabaseEnhanced,
  transformVendorsBatch,
  deduplicateVendors,
  transformInventoryBatch,
  deduplicateInventory,
  transformBOMsBatch,
  deduplicateBOMs,
} from '../lib/schema/transformers';
import type { InventoryItem, Vendor, PurchaseOrder, BillOfMaterials } from '../types';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface SyncStatus {
  isRunning: boolean;
  lastSyncTime: Date | null;
  nextSyncTime: Date | null;
  lastSyncDuration: number | null; // milliseconds
  totalItemsSynced: number;
  errors: SyncError[];
  progress: SyncProgress;
}

export interface SyncProgress {
  phase: 'idle' | 'vendors' | 'inventory' | 'boms' | 'purchase-orders' | 'complete';
  current: number;
  total: number;
  percentage: number;
  message: string;
}

export interface SyncError {
  timestamp: Date;
  phase: string;
  message: string;
  error: any;
}

export interface SyncConfig {
  // Sync intervals (milliseconds)
  inventoryRefreshInterval: number; // Default: 5 minutes
  vendorsRefreshInterval: number; // Default: 1 hour
  purchaseOrdersRefreshInterval: number; // Default: 15 minutes
  
  // Rate limiting
  maxRequestsPerMinute: number; // Default: 30
  
  // Pagination
  batchSize: number; // Default: 100 items per request
  
  // Error handling
  maxRetries: number; // Default: 3
  retryDelayMs: number; // Default: 1000ms
}

export interface FinaleInventoryItem {
  productId: string;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  quantityOnHand: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  cost?: number;
  price?: number;
  supplier?: string;
  lastUpdated: Date;
}

export interface FinaleVendor {
  vendorId: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  leadTimeDays?: number;
  terms?: string;
  lastUpdated: Date;
}

export interface FinalePurchaseOrder {
  poId: string;
  orderNumber: string;
  vendorId: string;
  vendorName: string;
  status: string;
  orderDate: Date;
  expectedDate?: Date;
  totalAmount?: number;
  items: Array<{
    productId: string;
    sku: string;
    quantity: number;
    unitCost: number;
  }>;
  lastUpdated: Date;
}

// ============================================================================
// SYNC SERVICE CLASS
// ============================================================================

export class FinaleSyncService {
  private client: FinaleBasicAuthClient | null;
  private config: SyncConfig;
  private status: SyncStatus;
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;
  private syncIntervals: Map<string, NodeJS.Timeout>;
  private statusListeners: Set<(status: SyncStatus) => void>;
  private backupService = createBackupService();

  constructor(config?: Partial<SyncConfig>) {
    // Don't initialize Finale client yet - will be set via setCredentials()
    this.client = null;

    // Default configuration
    this.config = {
      inventoryRefreshInterval: 5 * 60 * 1000, // 5 minutes
      vendorsRefreshInterval: 60 * 60 * 1000, // 1 hour
      purchaseOrdersRefreshInterval: 15 * 60 * 1000, // 15 minutes
      maxRequestsPerMinute: 30,
      batchSize: 100,
      maxRetries: 3,
      retryDelayMs: 1000,
      ...config,
    };

    // Initialize status
    this.status = {
      isRunning: false,
      lastSyncTime: null,
      nextSyncTime: null,
      lastSyncDuration: null,
      totalItemsSynced: 0,
      errors: [],
      progress: {
        phase: 'idle',
        current: 0,
        total: 0,
        percentage: 0,
        message: 'Ready to sync',
      },
    };

    // Initialize rate limiter (30 requests per minute per user, 100 global)
    this.rateLimiter = new RateLimiter({
      perIdentity: {
        maxRequests: this.config.maxRequestsPerMinute,
        intervalMs: 60 * 1000,
      },
      global: {
        maxRequests: 100,
        intervalMs: 60 * 1000,
      },
    });

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      cooldownMs: 60 * 1000,
    });

    this.syncIntervals = new Map();
    this.statusListeners = new Set();
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Set Finale API credentials
   */
  setCredentials(apiKey: string, apiSecret: string, accountPath: string, baseUrl?: string): void {
    this.client = new FinaleBasicAuthClient({
      apiKey,
      apiSecret,
      accountPath,
      baseUrl: baseUrl || 'https://app.finaleinventory.com',
    });
    console.log('[FinaleSyncService] Credentials configured');
  }

  /**
   * Check if credentials are configured
   */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Subscribe to sync status updates
   */
  onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(callback);
    // Return unsubscribe function
    return () => this.statusListeners.delete(callback);
  }

  /**
   * Start automatic sync with configured intervals
   */
  startAutoSync(): void {
    console.log('[FinaleSyncService] Starting automatic sync...');

    // Immediate initial sync
    this.syncAll().catch(console.error);

    // Schedule inventory sync (every 5 minutes)
    this.syncIntervals.set(
      'inventory',
      setInterval(() => {
        this.syncInventory().catch(console.error);
      }, this.config.inventoryRefreshInterval)
    );

    // Schedule vendors sync (every hour)
    this.syncIntervals.set(
      'vendors',
      setInterval(() => {
        this.syncVendors().catch(console.error);
      }, this.config.vendorsRefreshInterval)
    );

    // Schedule purchase orders sync (every 15 minutes)
    this.syncIntervals.set(
      'purchase-orders',
      setInterval(() => {
        this.syncPurchaseOrders().catch(console.error);
      }, this.config.purchaseOrdersRefreshInterval)
    );

    console.log('[FinaleSyncService] Auto-sync started');
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync(): void {
    console.log('[FinaleSyncService] Stopping automatic sync...');

    for (const [name, interval] of this.syncIntervals) {
      clearInterval(interval);
      console.log(`[FinaleSyncService] Stopped ${name} sync`);
    }

    this.syncIntervals.clear();
  }

  /**
   * Manually trigger a full sync
   */
  async syncAll(): Promise<void> {
    if (!this.client) {
      throw new Error('Finale API credentials not configured. Call setCredentials() first.');
    }

    if (this.status.isRunning) {
      console.warn('[FinaleSyncService] Sync already in progress');
      return;
    }

    console.log('[FinaleSyncService] Starting full sync...');
    const startTime = Date.now();

    this.updateStatus({
      isRunning: true,
      progress: {
        phase: 'vendors',
        current: 0,
        total: 3,
        percentage: 0,
        message: 'Starting full sync...',
      },
    });

    try {
      // Sync vendors first (needed for inventory supplier references)
      await this.syncVendors();

      // Then inventory (CSV-based, needed for BOM component references)
      await this.syncInventoryFromCSV();

      // Then BOMs (CSV-based, depends on inventory)
      await this.syncBOMsFromCSV();

      // Purchase orders - still unavailable
      console.log('[FinaleSyncService] Skipping purchase order sync (REST API unavailable)');

      const duration = Date.now() - startTime;

      this.updateStatus({
        isRunning: false,
        lastSyncTime: new Date(),
        lastSyncDuration: duration,
        nextSyncTime: new Date(Date.now() + this.config.inventoryRefreshInterval),
        progress: {
          phase: 'complete',
          current: 4,
          total: 4,
          percentage: 100,
          message: `Full sync completed in ${(duration / 1000).toFixed(1)}s`,
        },
      });

      console.log(`[FinaleSyncService] Full sync completed in ${duration}ms`);
    } catch (error) {
      this.handleError('full-sync', error);
      this.updateStatus({
        isRunning: false,
        progress: {
          phase: 'idle',
          current: 0,
          total: 0,
          percentage: 0,
          message: 'Sync failed - see errors',
        },
      });
    }
  }

  /**
   * Sync vendors from Finale
   */
  async syncVendors(): Promise<Vendor[]> {
    if (!this.client) {
      throw new Error('Finale API credentials not configured. Call setCredentials() first.');
    }

    console.log('[FinaleSyncService] Syncing vendors...');

    this.updateProgress({
      phase: 'vendors',
      current: 0,
      total: 2,
      percentage: 0,
      message: 'Fetching vendors from Finale...',
    });

    try {
      // Fetch from Finale with rate limiting and resilience
      const rawVendors = await this.rateLimiter.schedule(async () => {
        return await this.circuitBreaker.execute(async () => {
          return await retryWithBackoff(
            async () => await this.client.getSuppliers(),
            {
              maxAttempts: this.config.maxRetries,
              baseDelayMs: this.config.retryDelayMs,
            }
          );
        });
      }, 'finale-sync');

      console.log(`[FinaleSyncService] Fetched ${rawVendors.length} vendors from Finale`);

      this.updateProgress({
        phase: 'vendors',
        current: 1,
        total: 2,
        percentage: 50,
        message: 'Transforming and saving vendors...',
      });

      // Transform to TGF MRP format
      // Check what format the data is in
      let vendors: any[];
      const first = Array.isArray(rawVendors) && rawVendors.length > 0 ? rawVendors[0] : null;
      const looksSchemaParsed = !!first && (('addressLine1' in first) || ('postalCode' in first) || ('source' in first));
      const looksRawCSV = !!first && (('Name' in first) || ('Email Address 0' in first));

      if (looksSchemaParsed) {
        // Already transformed by proxy (old behavior)
        vendors = rawVendors as any[];
        console.log(`[FinaleSyncService] Detected schema-parsed vendors from proxy; skipping transform`);
      } else if (looksRawCSV) {
        // Raw CSV data from proxy - apply schema transformers here
        console.log(`[FinaleSyncService] Detected raw CSV data; applying schema transformers`);
        const batchResult = transformVendorsBatch(rawVendors);
        console.log(`[FinaleSyncService] Transform results: ${batchResult.successful.length} success, ${batchResult.failed.length} failed`);
        
        if (batchResult.failed.length > 0) {
          console.warn(`[FinaleSyncService] ${batchResult.failed.length} vendors failed transformation:`);
          batchResult.failed.slice(0, 5).forEach(failure => {
            console.warn(`  - Row ${failure.index + 1}:`, failure.errors.join('; '));
          });
        }
        
        // Deduplicate by name
        vendors = deduplicateVendors(batchResult.successful);
        console.log(`[FinaleSyncService] After deduplication: ${vendors.length} unique vendors`);
      } else {
        // Legacy Finale API format
        vendors = transformFinaleSuppliersToVendors(rawVendors as FinaleSupplier[]);
        console.log(`[FinaleSyncService] Transformed ${vendors.length} vendors using legacy transformer`);
      }

      // Save to Supabase
      await this.saveVendorsToSupabase(vendors);

      this.updateProgress({
        phase: 'vendors',
        current: 2,
        total: 2,
        percentage: 100,
        message: `Synced ${vendors.length} vendors`,
      });

      this.status.totalItemsSynced += vendors.length;
      this.notifyListeners();

      return vendors;
    } catch (error) {
      this.handleError('sync-vendors', error);
      throw error;
    }
  }

  /**
   * Sync inventory from Finale CSV report (ACTIVE items in SHIPPING warehouse only)
   */
  async syncInventoryFromCSV(): Promise<InventoryItem[]> {
    if (!this.client) {
      throw new Error('Finale API credentials not configured. Call setCredentials() first.');
    }

    console.log('[FinaleSyncService] Syncing inventory from CSV...');

    this.updateProgress({
      phase: 'inventory',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Fetching inventory from Finale CSV report...',
    });

    try {
      // Fetch inventory CSV data via API proxy
      const rawInventory = await this.rateLimiter.schedule(async () => {
        return await this.circuitBreaker.execute(async () => {
          return await retryWithBackoff(
            async () => await this.client.getInventory(),
            {
              maxAttempts: this.config.maxRetries,
              baseDelayMs: this.config.retryDelayMs,
            }
          );
        });
      }, 'finale-sync-inventory');

      console.log(`[FinaleSyncService] Fetched ${rawInventory.length} inventory items from Finale CSV`);

      // Check if CSV is empty
      if (rawInventory.length === 0) {
        console.warn(`[FinaleSyncService] ⚠️  WARNING: No inventory items returned from CSV!`);
        console.warn(`[FinaleSyncService] Possible causes:`);
        console.warn(`  1. The FINALE_INVENTORY_REPORT_URL might be pointing to an empty report`);
        console.warn(`  2. The report URL might be expired (Finale reports can expire)`);
        console.warn(`  3. The CSV file might be empty or incorrectly formatted`);
        console.warn(`[FinaleSyncService] Please check your Finale Inventory Report and regenerate the URL if needed`);
      }

      // Build vendor ID map for inventory transformation
      const vendors = await this.getVendorsFromSupabase();
      const vendorIdMap = new Map<string, string>();
      vendors.forEach(v => {
        if (v.name) {
          vendorIdMap.set(v.name.toLowerCase(), v.id);
        }
      });
      console.log(`[FinaleSyncService] Built vendor ID map with ${vendorIdMap.size} entries`);

      // Transform using schema transformers (filters for ACTIVE + SHIPPING)
      const batchResult = transformInventoryBatch(rawInventory, vendorIdMap);
      
      console.log(`[FinaleSyncService] Transform results: ${batchResult.successful.length} success, ${batchResult.failed.length} failed`);
      
      if (batchResult.failed.length > 0) {
        console.warn(`[FinaleSyncService] ${batchResult.failed.length} inventory items failed transformation:`);
        // Log first 5 failures for debugging
        batchResult.failed.slice(0, 5).forEach(f => {
          console.warn(`  - Row ${f.index + 1}: ${f.errors.join('; ')}`);
        });
      }

      // Deduplicate by SKU
      const uniqueInventory = deduplicateInventory(batchResult.successful);
      console.log(`[FinaleSyncService] After deduplication: ${uniqueInventory.length} unique items`);

      // Save to Supabase
      console.log(`[FinaleSyncService] Saving ${uniqueInventory.length} inventory items to Supabase...`);
      const savedItems = await this.saveInventoryToSupabase(uniqueInventory);

      this.updateProgress({
        phase: 'inventory',
        current: 2,
        total: 2,
        percentage: 100,
        message: `Synced ${savedItems.length} inventory items`,
      });

      this.status.totalItemsSynced += savedItems.length;
      this.notifyListeners();

      return savedItems;
    } catch (error) {
      this.handleError('sync-inventory-csv', error);
      throw error;
    }
  }

  /**
   * Sync BOMs from Finale CSV report (ACTIVE products only)
   */
  async syncBOMsFromCSV(): Promise<BillOfMaterials[]> {
    if (!this.client) {
      throw new Error('Finale API credentials not configured. Call setCredentials() first.');
    }

    console.log('[FinaleSyncService] Syncing BOMs from CSV...');

    this.updateProgress({
      phase: 'boms',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Fetching BOMs from Finale CSV report...',
    });

    try {
      // Fetch BOM CSV data via API proxy
      const rawBOMs = await this.rateLimiter.schedule(async () => {
        return await this.circuitBreaker.execute(async () => {
          return await retryWithBackoff(
            async () => await this.client.getBOMs(),
            {
              maxAttempts: this.config.maxRetries,
              baseDelayMs: this.config.retryDelayMs,
            }
          );
        });
      }, 'finale-sync-boms');

      console.log(`[FinaleSyncService] Fetched ${rawBOMs.length} BOM rows from Finale CSV`);

      if (rawBOMs.length === 0) {
        console.warn(`[FinaleSyncService] ⚠️  WARNING: No BOM data returned from CSV!`);
        return [];
      }

      // Get inventory items for component enrichment
      const { data: inventoryItems, error: invError } = await supabase
        .from('inventory_items')
        .select('*');

      if (invError) {
        console.error('[FinaleSyncService] Error fetching inventory for BOM enrichment:', invError);
        throw invError;
      }

      const inventoryMap = new Map(
        (inventoryItems || []).map(item => [item.sku?.toUpperCase(), item])
      );
      console.log(`[FinaleSyncService] Built inventory map with ${inventoryMap.size} items for component enrichment`);

      // Transform using schema transformers (groups by finished product SKU)
      const batchResult = transformBOMsBatch(rawBOMs, inventoryMap);
      
      console.log(`[FinaleSyncService] Transform results: ${batchResult.successful.length} BOMs created, ${batchResult.failed.length} rows failed`);
      
      if (batchResult.failed.length > 0) {
        console.warn(`[FinaleSyncService] ${batchResult.failed.length} BOM rows failed transformation:`);
        batchResult.failed.slice(0, 5).forEach(f => {
          console.warn(`  - Row ${f.index + 1}: ${f.errors.join('; ')}`);
        });
      }

      // Deduplicate by finished product SKU
      const uniqueBOMs = deduplicateBOMs(batchResult.successful);
      console.log(`[FinaleSyncService] After deduplication: ${uniqueBOMs.length} unique BOMs`);

      // Save to Supabase
      console.log(`[FinaleSyncService] Saving ${uniqueBOMs.length} BOMs to Supabase...`);
      const savedBOMs = await this.saveBOMsToSupabase(uniqueBOMs);

      this.updateProgress({
        phase: 'boms',
        current: 2,
        total: 2,
        percentage: 100,
        message: `Synced ${savedBOMs.length} BOMs`,
      });

      this.status.totalItemsSynced += savedBOMs.length;
      this.notifyListeners();

      return savedBOMs;
    } catch (error) {
      this.handleError('sync-boms-csv', error);
      throw error;
    }
  }

  /**
   * Sync inventory from Finale (Legacy REST API method - currently unavailable)
   */
  async syncInventory(): Promise<{
    inventory: InventoryItem[];
    boms: BillOfMaterials[];
  }> {
    if (!this.client) {
      throw new Error('Finale API credentials not configured. Call setCredentials() first.');
    }

    console.log('[FinaleSyncService] Syncing inventory (REST API)...');

    this.updateProgress({
      phase: 'inventory',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Fetching inventory from Finale...',
    });

    try {
      const allRawProducts: any[] = [];
      let offset = 0;
      let hasMore = true;

      // Fetch all products with pagination
      while (hasMore) {
        const rawProducts = await this.rateLimiter.schedule(async () => {
          return await this.circuitBreaker.execute(async () => {
            return await retryWithBackoff(
              async () => await this.client.getProducts(this.config.batchSize, offset),
              {
                maxAttempts: this.config.maxRetries,
                baseDelayMs: this.config.retryDelayMs,
              }
            );
          });
        }, 'finale-sync');

        // Handle case where API returns non-array (error object, etc.)
        if (!Array.isArray(rawProducts)) {
          console.error('[FinaleSyncService] getProducts() returned non-array:', rawProducts);
          throw new Error('Product sync not yet supported - REST /product endpoint unavailable');
        }

        allRawProducts.push(...rawProducts);
        offset += this.config.batchSize;
        hasMore = rawProducts.length === this.config.batchSize;

        this.updateProgress({
          phase: 'inventory',
          current: allRawProducts.length,
          total: allRawProducts.length + (hasMore ? this.config.batchSize : 0),
          percentage: hasMore ? 40 : 70,
          message: `Fetched ${allRawProducts.length} products...`,
        });
      }

      console.log(`[FinaleSyncService] Fetched ${allRawProducts.length} products from Finale`);

      this.updateProgress({
        phase: 'inventory',
        current: allRawProducts.length,
        total: allRawProducts.length,
        percentage: 80,
        message: 'Transforming and saving products...',
      });

      // Transform to TGF MRP format
      const inventory = transformFinaleProductsToInventory(allRawProducts as FinaleProduct[]);
      console.log(`[FinaleSyncService] Transformed ${inventory.length} inventory items`);

      // Extract BOMs from products with components
      const boms = extractBOMsFromFinaleProducts(allRawProducts as FinaleProduct[]);
      console.log(`[FinaleSyncService] Extracted ${boms.length} BOMs`);

      // Save to Supabase
      await this.saveInventoryToSupabase(inventory);
      if (boms.length > 0) {
        await this.saveBOMsToSupabase(boms);
      }

      this.updateProgress({
        phase: 'inventory',
        current: allRawProducts.length,
        total: allRawProducts.length,
        percentage: 100,
        message: `Synced ${inventory.length} items and ${boms.length} BOMs`,
      });

      this.status.totalItemsSynced += inventory.length + boms.length;
      this.notifyListeners();

      return { inventory, boms };
    } catch (error) {
      this.handleError('sync-inventory', error);
      throw error;
    }
  }

  /**
   * Sync purchase orders from Finale
   */
  async syncPurchaseOrders(): Promise<PurchaseOrder[]> {
    if (!this.client) {
      throw new Error('Finale API credentials not configured. Call setCredentials() first.');
    }

    console.log('[FinaleSyncService] Syncing purchase orders...');

    this.updateProgress({
      phase: 'purchase-orders',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Fetching purchase orders from Finale...',
    });

    try {
      const allRawPOs: any[] = [];
      let offset = 0;
      let hasMore = true;

      // Fetch all POs with pagination
      while (hasMore) {
        const rawPOs = await this.rateLimiter.schedule(async () => {
          return await this.circuitBreaker.execute(async () => {
            return await retryWithBackoff(
              async () => await this.client.getPurchaseOrders(this.config.batchSize, offset),
              {
                maxAttempts: this.config.maxRetries,
                baseDelayMs: this.config.retryDelayMs,
              }
            );
          });
        }, 'finale-sync');

        allRawPOs.push(...rawPOs);
        offset += this.config.batchSize;
        hasMore = rawPOs.length === this.config.batchSize;

        this.updateProgress({
          phase: 'purchase-orders',
          current: allRawPOs.length,
          total: allRawPOs.length + (hasMore ? this.config.batchSize : 0),
          percentage: hasMore ? 50 : 80,
          message: `Fetched ${allRawPOs.length} purchase orders...`,
        });
      }

      console.log(`[FinaleSyncService] Fetched ${allRawPOs.length} purchase orders from Finale`);

      this.updateProgress({
        phase: 'purchase-orders',
        current: allRawPOs.length,
        total: allRawPOs.length,
        percentage: 90,
        message: 'Transforming and saving purchase orders...',
      });

      // Transform to TGF MRP format
      const pos = transformFinalePOsToPurchaseOrders(allRawPOs as FinalePOType[]);
      console.log(`[FinaleSyncService] Transformed ${pos.length} purchase orders`);

      // Save to Supabase
      await this.savePurchaseOrdersToSupabase(pos);

      this.updateProgress({
        phase: 'purchase-orders',
        current: allRawPOs.length,
        total: allRawPOs.length,
        percentage: 100,
        message: `Synced ${pos.length} purchase orders`,
      });

      this.status.totalItemsSynced += pos.length;
      this.notifyListeners();

      return pos;
    } catch (error) {
      this.handleError('sync-purchase-orders', error);
      throw error;
    }
  }

  /**
   * Test Finale connection
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
    facilities?: any[];
  }> {
    if (!this.client) {
      return {
        success: false,
        message: 'Finale API credentials not configured',
      };
    }

    try {
      return await this.client.testConnection();
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private transformVendors(rawVendors: any[]): FinaleVendor[] {
    return rawVendors.map(v => ({
      vendorId: v.partyId || v.id,
      name: v.name || 'Unknown Vendor',
      contactName: v.contactName,
      email: v.email,
      phone: v.phone,
      address: v.address,
      leadTimeDays: v.leadTimeDays,
      terms: v.terms,
      lastUpdated: new Date(),
    }));
  }

  private transformInventory(rawProducts: any[]): FinaleInventoryItem[] {
    return rawProducts.map(p => ({
      productId: p.productId || p.id,
      sku: p.sku || p.productCode || 'NO-SKU',
      name: p.name || p.productName || 'Unknown Product',
      description: p.description,
      category: p.category,
      quantityOnHand: p.quantityOnHand || p.stock || 0,
      reorderPoint: p.reorderPoint,
      reorderQuantity: p.reorderQuantity,
      cost: p.cost || p.unitCost,
      price: p.price || p.salePrice,
      supplier: p.supplier || p.supplierId,
      lastUpdated: new Date(),
    }));
  }

  private transformPurchaseOrders(rawPOs: any[]): FinalePurchaseOrder[] {
    return rawPOs.map(po => ({
      poId: po.purchaseOrderId || po.id,
      orderNumber: po.orderNumber || po.poNumber || 'NO-PO',
      vendorId: po.vendorId || po.supplierId,
      vendorName: po.vendorName || po.supplierName || 'Unknown Vendor',
      status: po.status || 'PENDING',
      orderDate: new Date(po.orderDate || Date.now()),
      expectedDate: po.expectedDate ? new Date(po.expectedDate) : undefined,
      totalAmount: po.totalAmount || po.total,
      items: po.items || [],
      lastUpdated: new Date(),
    }));
  }

  private updateStatus(updates: Partial<SyncStatus>): void {
    Object.assign(this.status, updates);
    this.notifyListeners();
  }

  private updateProgress(progress: SyncProgress): void {
    this.status.progress = progress;
    this.notifyListeners();
  }

  private handleError(phase: string, error: any): void {
    const syncError: SyncError = {
      timestamp: new Date(),
      phase,
      message: error instanceof Error ? error.message : String(error),
      error,
    };

    this.status.errors.push(syncError);
    // Keep only last 10 errors
    if (this.status.errors.length > 10) {
      this.status.errors = this.status.errors.slice(-10);
    }

    console.error(`[FinaleSyncService] Error in ${phase}:`, error);
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    this.statusListeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('[FinaleSyncService] Error in status listener:', error);
      }
    });
  }

  // ==========================================================================
  // SUPABASE PERSISTENCE
  // ==========================================================================

  /**
   * Save vendors to Supabase
   */
  private async saveVendorsToSupabase(vendors: Vendor[]): Promise<void> {
    if (vendors.length === 0) {
      console.log('[FinaleSyncService] No vendors to save');
      return;
    }

    console.log(`[FinaleSyncService] Saving ${vendors.length} vendors to Supabase...`);

    // Fetch existing vendors (id + name) to preserve IDs and avoid unique name conflicts
    const { data: existingRows, error: existingErr } = await supabase
      .from('vendors')
      .select('id, name');

    if (existingErr) {
      throw new Error(`Failed to fetch existing vendors: ${existingErr.message}`);
    }

    const existingByName = new Map<string, string>(); // nameLower -> id
    (existingRows || []).forEach(row => {
      if (row && row.name && row.id) {
        existingByName.set(String(row.name).trim().toLowerCase(), String(row.id));
      }
    });

    // Validate vendors
    const validVendors = vendors.filter(vendor => {
      const validation = validateVendor(vendor);
      if (!validation.valid) {
        console.warn(`[FinaleSyncService] Invalid vendor ${vendor.id}:`, validation.errors);
      }
      return validation.valid;
    });

    if (validVendors.length === 0) {
      throw new Error('No valid vendors to save');
    }

    // Deduplicate vendors by name within this batch, last occurrence wins
    const byName = new Map<string, Vendor>();
    for (const v of validVendors) {
      const key = (v.name || '').trim().toLowerCase();
      if (!key) continue;
      // Preserve existing ID if a vendor with this name already exists in DB
      const existingId = existingByName.get(key);
      if (existingId) {
        byName.set(key, { ...v, id: existingId });
      } else {
        byName.set(key, v);
      }
    }

    const dedupedVendors = Array.from(byName.values());
    console.log(`[FinaleSyncService] Deduped vendors count: ${dedupedVendors.length}`);

    // Partition: existing (by name) vs new (by name)
    const existingUpdates = dedupedVendors
      .filter(v => existingByName.has((v.name || '').trim().toLowerCase()))
      .map(vendor => {
        // Check if this vendor has enhanced fields (from new schema)
        const hasEnhancedFields = 'addressLine1' in vendor || 'postalCode' in vendor || 'notes' in vendor;

        if (hasEnhancedFields) {
          // Use enhanced transformer for complete data
          const enhanced = transformVendorParsedToDatabaseEnhanced(vendor as any);
          // Remove id for updates (conflict target is name)
          const { id, ...updateData } = enhanced;
          return updateData;
        } else {
          // Legacy format (backward compatibility)
          return {
            name: vendor.name,
            contact_emails: vendor.contactEmails,
            address: vendor.address,
            phone: vendor.phone || '',
            website: vendor.website || '',
            lead_time_days: vendor.leadTimeDays,
            updated_at: new Date().toISOString(),
          };
        }
      });

    const newInserts = dedupedVendors
      .filter(v => !existingByName.has((v.name || '').trim().toLowerCase()))
      .map(vendor => {
        // Check if this vendor has enhanced fields
        const hasEnhancedFields = 'addressLine1' in vendor || 'postalCode' in vendor || 'notes' in vendor;

        if (hasEnhancedFields) {
          // Use enhanced transformer for complete data
          return transformVendorParsedToDatabaseEnhanced(vendor as any);
        } else {
          // Legacy format (backward compatibility)
          return {
            id: vendor.id,
            name: vendor.name,
            contact_emails: vendor.contactEmails,
            address: vendor.address,
            phone: vendor.phone || '',
            website: vendor.website || '',
            lead_time_days: vendor.leadTimeDays,
            updated_at: new Date().toISOString(),
          };
        }
      });

    console.log(`[FinaleSyncService] Preparing ${existingUpdates.length} updates and ${newInserts.length} inserts`);

    // Log sample data to verify enhanced fields
    if (existingUpdates.length > 0) {
      console.log(`[FinaleSyncService] Sample update data (first vendor):`, Object.keys(existingUpdates[0]));
    }
    if (newInserts.length > 0) {
      console.log(`[FinaleSyncService] Sample insert data (first vendor):`, Object.keys(newInserts[0]));
    }

    // 1) Update existing rows by unique name (no id provided)
    if (existingUpdates.length > 0) {
      const { error: updErr } = await supabase
        .from('vendors')
        .upsert(existingUpdates as any, {
          onConflict: 'name',
          ignoreDuplicates: false,
        });
      if (updErr) {
        throw new Error(`Failed to update existing vendors: ${updErr.message}`);
      }
      console.log(`[FinaleSyncService] ✓ Updated ${existingUpdates.length} existing vendors`);
    }

    // 2) Insert new rows with IDs
    if (newInserts.length > 0) {
      const { error: insErr } = await supabase
        .from('vendors')
        .insert(newInserts as any);
      if (insErr) {
        throw new Error(`Failed to insert new vendors: ${insErr.message}`);
      }
      console.log(`[FinaleSyncService] ✓ Inserted ${newInserts.length} new vendors`);
    }

    console.log(`[FinaleSyncService] Successfully saved ${dedupedVendors.length} vendors (${existingUpdates.length} updated, ${newInserts.length} inserted)`);
  }

  /**
   * Save inventory items to Supabase (enhanced schema with migration 003 fields)
   */
  private async saveInventoryToSupabase(parsedItems: any[]): Promise<InventoryItem[]> {
    if (parsedItems.length === 0) {
      console.log('[FinaleSyncService] No inventory items to save');
      return [];
    }

    console.log(`[FinaleSyncService] Saving ${parsedItems.length} inventory items to Supabase...`);

    // Transform parsed items to database format
    const dbItems = parsedItems.map(parsed => ({
      sku: parsed.sku,
      name: parsed.name,
      description: parsed.description || '',
      status: parsed.status || 'active',
      category: parsed.category || 'Uncategorized',
      stock: parsed.stock || 0,
      on_order: parsed.onOrder || 0,
      reorder_point: parsed.reorderPoint || 10,
      vendor_id: parsed.vendorId || null,
      moq: parsed.moq || 1,
      // Enhanced fields from migration 003
      unit_cost: parsed.unitCost || 0,
      unit_price: parsed.price || 0,
      units_in_stock: parsed.stock || 0,
      units_on_order: parsed.onOrder || 0,
      units_reserved: parsed.reserved || 0,
      reorder_variance: parsed.reorderVariance || 0,
      qty_to_order: parsed.qtyToOrder || 0,
      sales_velocity_consolidated: parsed.salesVelocity || 0,
      sales_last_30_days: parsed.sales30Days || 0,
      sales_last_60_days: parsed.sales60Days || 0,
      sales_last_90_days: parsed.sales90Days || 0,
      warehouse_location: parsed.warehouseLocation || 'Shipping',
      bin_location: parsed.binLocation || '',
      supplier_sku: parsed.sku, // Use same SKU
      last_purchase_date: parsed.lastPurchaseDate || null,
      upc: parsed.barcode || '',
      data_source: 'csv',
      last_sync_at: new Date().toISOString(),
      sync_status: 'synced',
      updated_at: new Date().toISOString(),
    }));

    // Upsert inventory items
    const { error } = await supabase
      .from('inventory_items')
      .upsert(dbItems as any, {
        onConflict: 'sku',
        ignoreDuplicates: false,
      });

    if (error) {
      throw new Error(`Failed to save inventory: ${error.message}`);
    }

    console.log(`[FinaleSyncService] Successfully saved ${dbItems.length} inventory items`);

    // Return as InventoryItem format for the caller
    return dbItems.map(db => ({
      sku: db.sku,
      name: db.name,
      category: db.category,
      stock: db.stock,
      onOrder: db.on_order,
      reorderPoint: db.reorder_point,
      vendorId: db.vendor_id || '',
      moq: db.moq,
    }));
  }

  /**
   * Save purchase orders to Supabase
```
   */
  private async savePurchaseOrdersToSupabase(pos: PurchaseOrder[]): Promise<void> {
    if (pos.length === 0) {
      console.log('[FinaleSyncService] No purchase orders to save');
      return;
    }

    console.log(`[FinaleSyncService] Saving ${pos.length} purchase orders to Supabase...`);

    // Validate POs
    const validPOs = pos.filter(po => {
      const validation = validatePurchaseOrder(po);
      if (!validation.valid) {
        console.warn(`[FinaleSyncService] Invalid PO ${po.id}:`, validation.errors);
      }
      return validation.valid;
    });

    if (validPOs.length === 0) {
      throw new Error('No valid purchase orders to save');
    }

    // Prepare PO data for Supabase
    const poInserts = validPOs.map(po => ({
      id: po.id,
      vendor_id: po.vendorId,
      status: po.status,
      created_at: po.createdAt,
      items: po.items, // JSONB column
      expected_date: po.expectedDate,
      notes: po.notes,
      requisition_ids: po.requisitionIds,
      updated_at: new Date().toISOString(),
    }));

    // Upsert purchase orders
    const { error } = await supabase
      .from('purchase_orders')
      .upsert(poInserts as any, {
        onConflict: 'id',
        ignoreDuplicates: false,
      });

    if (error) {
      throw new Error(`Failed to save purchase orders: ${error.message}`);
    }

    console.log(`[FinaleSyncService] Successfully saved ${validPOs.length} purchase orders`);
  }

  /**
   * Get vendors from Supabase for building vendor ID map
   */
  private async getVendorsFromSupabase(): Promise<Vendor[]> {
    const { data, error } = await supabase
      .from('vendors')
      .select('id, name');

    if (error) {
      console.error('[FinaleSyncService] Failed to fetch vendors from Supabase:', error);
      throw new Error(`Failed to fetch vendors: ${error.message}`);
    }

    return (data || []).map(row => ({
      id: row.id,
      name: row.name,
      contactEmails: [],
      phone: '',
      address: '',
      website: '',
      leadTimeDays: 0,
    }));
  }

  /**
   * Save BOMs to Supabase
   */
  private async saveBOMsToSupabase(boms: any[]): Promise<BillOfMaterials[]> {
    if (boms.length === 0) {
      console.log('[FinaleSyncService] No BOMs to save');
      return [];
    }

    console.log(`[FinaleSyncService] Saving ${boms.length} BOMs to Supabase...`);

    // Prepare BOM data for Supabase - use finished_sku as unique identifier
    const bomInserts = boms.map(bom => ({
      finished_sku: bom.finishedSku,
      name: bom.name || `BOM for ${bom.finishedSku}`,
      description: bom.description || '',
      category: bom.category || 'Uncategorized',
      yield_quantity: bom.yieldQuantity || 1,
      potential_build_qty: bom.potentialBuildQty || 0,
      average_cost: bom.averageCost || 0,
      components: bom.components || [], // JSONB column
      artwork: bom.artwork || [], // JSONB column
      packaging: bom.packaging || {}, // JSONB column
      barcode: bom.barcode || '',
      data_source: 'csv',
      last_sync_at: new Date().toISOString(),
      sync_status: 'synced',
      updated_at: new Date().toISOString(),
    }));

    // Upsert BOMs using finished_sku
    const { error } = await supabase
      .from('boms')
      .upsert(bomInserts as any, {
        onConflict: 'finished_sku',
        ignoreDuplicates: false,
      });

    if (error) {
      throw new Error(`Failed to save BOMs: ${error.message}`);
    }

    console.log(`[FinaleSyncService] Successfully saved ${boms.length} BOMs`);

    // Fetch saved BOMs with IDs
    const { data: savedBOMs, error: fetchError } = await supabase
      .from('boms')
      .select('*')
      .in('finished_sku', bomInserts.map(b => b.finished_sku));

    if (fetchError) {
      console.error('[FinaleSyncService] Error fetching saved BOMs:', fetchError);
      throw fetchError;
    }

    // Return as BillOfMaterials format
    return (savedBOMs || []).map(db => ({
      id: db.id,
      finishedSku: db.finished_sku,
      name: db.name,
      description: db.description || '',
      category: db.category || 'Uncategorized',
      yieldQuantity: db.yield_quantity || 1,
      potentialBuildQty: db.potential_build_qty || 0,
      averageCost: db.average_cost || 0,
      components: (db.components as any) || [],
      artwork: (db.artwork as any) || [],
      packaging: (db.packaging as any) || {},
      barcode: db.barcode || '',
      notes: db.notes || '',
    }));
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let syncServiceInstance: FinaleSyncService | null = null;

export function getFinaleSyncService(config?: Partial<SyncConfig>): FinaleSyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new FinaleSyncService(config);
  }
  return syncServiceInstance;
}
