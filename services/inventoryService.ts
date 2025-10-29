/**
 * Inventory Service
 * Handles all inventory-related operations with caching
 */

import { supabase } from '../lib/supabase/client'
import { cache, CacheKeys, CacheTTL } from '../lib/cache'
import type { Database } from '../types/database'

type InventoryItem = Database['public']['Tables']['inventory_items']['Row']
type InventoryInsert = Database['public']['Tables']['inventory_items']['Insert']
type InventoryUpdate = Database['public']['Tables']['inventory_items']['Update']

/**
 * Get all inventory items
 */
export async function getAllInventory(): Promise<InventoryItem[]> {
  return cache.getOrSet(
    CacheKeys.inventory.all(),
    async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('is_deleted', false)
        .order('name')
      
      if (error) {
        throw new Error(`Failed to fetch inventory: ${error.message}`)
      }
      
      return data || []
    },
    CacheTTL.MEDIUM
  )
}

/**
 * Get inventory by SKU
 */
export async function getInventoryBySku(sku: string): Promise<InventoryItem | null> {
  return cache.getOrSet(
    CacheKeys.inventory.bySku(sku),
    async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('sku', sku)
        .eq('is_deleted', false)
        .single()
      
      if (error) {
        if (error.code === 'PGRST116') {
          return null // Not found
        }
        throw new Error(`Failed to fetch inventory item: ${error.message}`)
      }
      
      return data
    },
    CacheTTL.MEDIUM
  )
}

/**
 * Get inventory by category
 */
export async function getInventoryByCategory(category: string): Promise<InventoryItem[]> {
  return cache.getOrSet(
    CacheKeys.inventory.byCategory(category),
    async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('category', category)
        .eq('is_deleted', false)
        .order('name')
      
      if (error) {
        throw new Error(`Failed to fetch inventory by category: ${error.message}`)
      }
      
      return data || []
    },
    CacheTTL.MEDIUM
  )
}

/**
 * Get low stock items (stock <= reorder_point)
 */
export async function getLowStockItems(): Promise<InventoryItem[]> {
  return cache.getOrSet(
    CacheKeys.inventory.lowStock(),
    async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .lte('stock', supabase.rpc('reorder_point')) // stock <= reorder_point
        .eq('is_deleted', false)
        .order('stock', { ascending: true })
      
      if (error) {
        throw new Error(`Failed to fetch low stock items: ${error.message}`)
      }
      
      return data || []
    },
    CacheTTL.SHORT // More frequent refresh for low stock alerts
  )
}

/**
 * Create new inventory item
 */
export async function createInventoryItem(item: InventoryInsert): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from('inventory_items')
    .insert(item as any)
    .select()
    .single()
  
  if (error) {
    throw new Error(`Failed to create inventory item: ${error.message}`)
  }
  
  // Invalidate cache
  await cache.invalidateRelated('inventory')
  
  return data as InventoryItem
}

/**
 * Update inventory item
 */
export async function updateInventoryItem(sku: string, updates: InventoryUpdate): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from('inventory_items')
    .update(updates as any)
    .eq('sku', sku)
    .select()
    .single()
  
  if (error) {
    throw new Error(`Failed to update inventory item: ${error.message}`)
  }
  
  // Invalidate cache
  await cache.invalidateRelated('inventory', sku)
  
  return data as InventoryItem
}

/**
 * Delete inventory item (soft delete)
 */
export async function deleteInventoryItem(sku: string): Promise<void> {
  const { error } = await supabase
    .from('inventory_items')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() } as any)
    .eq('sku', sku)
  
  if (error) {
    throw new Error(`Failed to delete inventory item: ${error.message}`)
  }
  
  // Invalidate cache
  await cache.invalidateRelated('inventory', sku)
}

/**
 * Adjust inventory stock
 */
export async function adjustStock(sku: string, adjustment: number, reason?: string): Promise<InventoryItem> {
  // Get current item
  const item = await getInventoryBySku(sku)
  
  if (!item) {
    throw new Error(`Inventory item not found: ${sku}`)
  }
  
  const newStock = item.stock + adjustment
  
  if (newStock < 0) {
    throw new Error(`Insufficient stock. Current: ${item.stock}, Adjustment: ${adjustment}`)
  }
  
  // Update stock
  return updateInventoryItem(sku, {
    stock: newStock,
    notes: reason ? `${item.notes || ''}\nAdjustment: ${adjustment} - ${reason}` : item.notes,
  })
}

/**
 * Search inventory items
 */
export async function searchInventory(query: string): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .or(`sku.ilike.%${query}%,name.ilike.%${query}%,category.ilike.%${query}%`)
    .eq('is_deleted', false)
    .order('name')
    .limit(50)
  
  if (error) {
    throw new Error(`Failed to search inventory: ${error.message}`)
  }
  
  return data || []
}

/**
 * Get inventory value by category
 */
export async function getInventoryValue(): Promise<Record<string, number>> {
  const items = await getAllInventory()
  
  const valueByCategory: Record<string, number> = {}
  
  for (const item of items) {
    const value = item.stock * (item.unit_price || 0)
    valueByCategory[item.category] = (valueByCategory[item.category] || 0) + value
  }
  
  return valueByCategory
}

/**
 * Get inventory statistics
 */
export async function getInventoryStats() {
  const items = await getAllInventory()
  const lowStockItems = await getLowStockItems()
  
  const totalValue = items.reduce((sum, item) => {
    return sum + (item.stock * (item.unit_price || 0))
  }, 0)
  
  const totalOnOrder = items.reduce((sum, item) => sum + item.on_order, 0)
  
  return {
    totalItems: items.length,
    totalValue,
    lowStockCount: lowStockItems.length,
    totalOnOrder,
    categories: [...new Set(items.map(i => i.category))].length,
  }
}
