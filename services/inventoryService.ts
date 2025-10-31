/**
 * Inventory Service - Cached Inventory Operations
 * 
 * This service provides inventory-specific operations with intelligent caching
 * to reduce database load and improve performance.
 * 
 * Features:
 * - Automatic caching with TTL
 * - Low stock alerts
 * - Stock adjustment helpers
 * - Inventory analytics
 * - Cache invalidation
 */

import { inventoryCache, CacheKeys, invalidateInventoryCache } from '../lib/cache';
import {
  fetchInventory,
  fetchInventoryItem,
  updateInventoryItem,
  createInventoryItem,
  deleteInventoryItem,
  bulkUpsertInventory,
  subscribeToInventory,
  isDataServiceAvailable,
} from './dataService';
import type { InventoryItem } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Cache TTL for inventory data (1 minute)
 */
const INVENTORY_CACHE_TTL = 60000;

/**
 * Get all inventory items (cached)
 */
export async function getInventory(): Promise<InventoryItem[]> {
  if (!isDataServiceAvailable()) {
    throw new Error('Data service not available. Check Supabase configuration.');
  }

  return await inventoryCache.getOrSet(
    CacheKeys.inventoryList(),
    () => fetchInventory(),
    INVENTORY_CACHE_TTL
  );
}

/**
 * Get a single inventory item by SKU (cached)
 */
export async function getInventoryItem(sku: string): Promise<InventoryItem | null> {
  if (!isDataServiceAvailable()) {
    throw new Error('Data service not available. Check Supabase configuration.');
  }

  return await inventoryCache.getOrSet(
    CacheKeys.inventory(sku),
    () => fetchInventoryItem(sku),
    INVENTORY_CACHE_TTL
  );
}

/**
 * Get low stock items (cached)
 */
export async function getLowStockItems(): Promise<InventoryItem[]> {
  if (!isDataServiceAvailable()) {
    throw new Error('Data service not available. Check Supabase configuration.');
  }

  return await inventoryCache.getOrSet(
    CacheKeys.inventoryLowStock(),
    async () => {
      const items = await fetchInventory();
      return items.filter(item => item.stock <= item.reorderPoint);
    },
    INVENTORY_CACHE_TTL
  );
}

/**
 * Adjust stock level for an item
 * Automatically invalidates cache
 */
export async function adjustStock(
  sku: string,
  adjustment: number,
  reason?: string
): Promise<InventoryItem> {
  if (!isDataServiceAvailable()) {
    throw new Error('Data service not available. Check Supabase configuration.');
  }

  const item = await fetchInventoryItem(sku);
  if (!item) {
    throw new Error(`Inventory item not found: ${sku}`);
  }

  const newStock = Math.max(0, item.stock + adjustment);
  
  console.log(`Stock adjustment for ${sku}: ${item.stock} → ${newStock} (${adjustment > 0 ? '+' : ''}${adjustment})${reason ? ` - ${reason}` : ''}`);

  const updated = await updateInventoryItem(sku, { stock: newStock });
  
  // Invalidate cache
  invalidateInventoryCache();
  
  return updated;
}

/**
 * Set stock level for an item (direct set, not adjustment)
 * Automatically invalidates cache
 */
export async function setStock(sku: string, newStock: number): Promise<InventoryItem> {
  if (!isDataServiceAvailable()) {
    throw new Error('Data service not available. Check Supabase configuration.');
  }

  const updated = await updateInventoryItem(sku, { stock: Math.max(0, newStock) });
  
  // Invalidate cache
  invalidateInventoryCache();
  
  return updated;
}

/**
 * Update on-order quantity for an item
 * Automatically invalidates cache
 */
export async function updateOnOrder(sku: string, quantity: number): Promise<InventoryItem> {
  if (!isDataServiceAvailable()) {
    throw new Error('Data service not available. Check Supabase configuration.');
  }

  const updated = await updateInventoryItem(sku, { onOrder: Math.max(0, quantity) });
  
  // Invalidate cache
  invalidateInventoryCache();
  
  return updated;
}

/**
 * Increment on-order quantity (when creating PO)
 */
export async function incrementOnOrder(sku: string, quantity: number): Promise<InventoryItem> {
  if (!isDataServiceAvailable()) {
    throw new Error('Data service not available. Check Supabase configuration.');
  }

  const item = await fetchInventoryItem(sku);
  if (!item) {
    throw new Error(`Inventory item not found: ${sku}`);
  }

  const newOnOrder = item.onOrder + quantity;
  return await updateOnOrder(sku, newOnOrder);
}

/**
 * Decrement on-order quantity (when PO is fulfilled)
 */
export async function decrementOnOrder(sku: string, quantity: number): Promise<InventoryItem> {
  if (!isDataServiceAvailable()) {
    throw new Error('Data service not available. Check Supabase configuration.');
  }

  const item = await fetchInventoryItem(sku);
  if (!item) {
    throw new Error(`Inventory item not found: ${sku}`);
  }

  const newOnOrder = Math.max(0, item.onOrder - quantity);
  return await updateOnOrder(sku, newOnOrder);
}

/**
 * Create a new inventory item
 * Automatically invalidates cache
 */
export async function addInventoryItem(item: Omit<InventoryItem, 'stock' | 'onOrder'>): Promise<InventoryItem> {
  if (!isDataServiceAvailable()) {
    throw new Error('Data service not available. Check Supabase configuration.');
  }

  const created = await createInventoryItem(item);
  
  // Invalidate cache
  invalidateInventoryCache();
  
  return created;
}

/**
 * Delete an inventory item
 * Automatically invalidates cache
 */
export async function removeInventoryItem(sku: string): Promise<void> {
  if (!isDataServiceAvailable()) {
    throw new Error('Data service not available. Check Supabase configuration.');
  }

  await deleteInventoryItem(sku);
  
  // Invalidate cache
  invalidateInventoryCache();
}

/**
 * Bulk sync inventory items (for external data sources)
 * Automatically invalidates cache
 */
export async function syncInventory(items: InventoryItem[]): Promise<void> {
  if (!isDataServiceAvailable()) {
    throw new Error('Data service not available. Check Supabase configuration.');
  }

  await bulkUpsertInventory(items);
  
  // Invalidate cache
  invalidateInventoryCache();
}

/**
 * Get inventory statistics
 */
export async function getInventoryStats(): Promise<{
  totalItems: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  onOrderCount: number;
}> {
  if (!isDataServiceAvailable()) {
    throw new Error('Data service not available. Check Supabase configuration.');
  }

  const items = await getInventory();
  
  return {
    totalItems: items.length,
    totalValue: 0, // Would need pricing data to calculate
    lowStockCount: items.filter(item => item.stock <= item.reorderPoint).length,
    outOfStockCount: items.filter(item => item.stock === 0).length,
    onOrderCount: items.filter(item => item.onOrder > 0).length,
  };
}

/**
 * Subscribe to real-time inventory updates
 * Automatically invalidates cache on changes
 */
export function subscribeToInventoryUpdates(
  callback?: (item: InventoryItem) => void
): RealtimeChannel {
  const channel = subscribeToInventory((payload) => {
    console.log('Inventory update:', payload);
    
    // Invalidate cache on any change
    invalidateInventoryCache();
    
    // Call user callback if provided
    if (callback && payload.new) {
      const item = {
        sku: payload.new.sku,
        name: payload.new.name,
        category: payload.new.category,
        stock: payload.new.stock,
        onOrder: payload.new.on_order,
        reorderPoint: payload.new.reorder_point,
        vendorId: payload.new.vendor_id,
        moq: payload.new.moq,
      };
      callback(item);
    }
  });
  
  return channel;
}

/**
 * Manually refresh inventory cache
 */
export async function refreshInventoryCache(): Promise<void> {
  invalidateInventoryCache();
  await getInventory(); // This will re-fetch and cache
}
