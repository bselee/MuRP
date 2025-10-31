/**
 * Data Service - Supabase CRUD Operations
 * 
 * This service provides a complete data access layer for all Supabase tables.
 * It handles CRUD operations, real-time subscriptions, and data transformations
 * between database schema and application types.
 * 
 * Features:
 * - Type-safe database operations
 * - Automatic timestamp management
 * - Soft delete support
 * - Real-time subscriptions
 * - Bulk operations
 * - Error handling
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import type {
  InventoryItem,
  Vendor,
  BillOfMaterials,
  PurchaseOrder,
  BuildOrder,
  User,
  ArtworkFolder,
} from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Check if Supabase is available
 */
export function isDataServiceAvailable(): boolean {
  return isSupabaseConfigured();
}

// ============================================================================
// INVENTORY OPERATIONS
// ============================================================================

/**
 * Fetch all inventory items
 */
export async function fetchInventory(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('is_deleted', false)
    .order('sku');

  if (error) {
    console.error('Error fetching inventory:', error);
    throw error;
  }

  return data.map(transformInventoryFromDb);
}

/**
 * Fetch a single inventory item by SKU
 */
export async function fetchInventoryItem(sku: string): Promise<InventoryItem | null> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('sku', sku)
    .eq('is_deleted', false)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      return null;
    }
    console.error('Error fetching inventory item:', error);
    throw error;
  }

  return transformInventoryFromDb(data);
}

/**
 * Create a new inventory item
 */
export async function createInventoryItem(item: Omit<InventoryItem, 'stock' | 'onOrder'>): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      sku: item.sku,
      name: item.name,
      category: item.category,
      stock: 0,
      on_order: 0,
      reorder_point: item.reorderPoint,
      vendor_id: item.vendorId,
      moq: item.moq || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating inventory item:', error);
    throw error;
  }

  return transformInventoryFromDb(data);
}

/**
 * Update an inventory item
 */
export async function updateInventoryItem(sku: string, updates: Partial<InventoryItem>): Promise<InventoryItem> {
  const dbUpdates: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.category !== undefined) dbUpdates.category = updates.category;
  if (updates.stock !== undefined) dbUpdates.stock = updates.stock;
  if (updates.onOrder !== undefined) dbUpdates.on_order = updates.onOrder;
  if (updates.reorderPoint !== undefined) dbUpdates.reorder_point = updates.reorderPoint;
  if (updates.vendorId !== undefined) dbUpdates.vendor_id = updates.vendorId;
  if (updates.moq !== undefined) dbUpdates.moq = updates.moq;

  const { data, error } = await supabase
    .from('inventory_items')
    .update(dbUpdates)
    .eq('sku', sku)
    .select()
    .single();

  if (error) {
    console.error('Error updating inventory item:', error);
    throw error;
  }

  return transformInventoryFromDb(data);
}

/**
 * Delete an inventory item (soft delete)
 */
export async function deleteInventoryItem(sku: string): Promise<void> {
  const { error } = await supabase
    .from('inventory_items')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('sku', sku);

  if (error) {
    console.error('Error deleting inventory item:', error);
    throw error;
  }
}

/**
 * Bulk upsert inventory items
 */
export async function bulkUpsertInventory(items: InventoryItem[]): Promise<void> {
  const dbItems = items.map(item => ({
    sku: item.sku,
    name: item.name,
    category: item.category,
    stock: item.stock,
    on_order: item.onOrder,
    reorder_point: item.reorderPoint,
    vendor_id: item.vendorId,
    moq: item.moq || null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('inventory_items')
    .upsert(dbItems, { onConflict: 'sku' });

  if (error) {
    console.error('Error bulk upserting inventory:', error);
    throw error;
  }
}

// ============================================================================
// VENDOR OPERATIONS
// ============================================================================

/**
 * Fetch all vendors
 */
export async function fetchVendors(): Promise<Vendor[]> {
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('is_deleted', false)
    .order('name');

  if (error) {
    console.error('Error fetching vendors:', error);
    throw error;
  }

  return data.map(transformVendorFromDb);
}

/**
 * Fetch a single vendor
 */
export async function fetchVendor(id: string): Promise<Vendor | null> {
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('Error fetching vendor:', error);
    throw error;
  }

  return transformVendorFromDb(data);
}

/**
 * Create a new vendor
 */
export async function createVendor(vendor: Omit<Vendor, 'id'>): Promise<Vendor> {
  const { data, error } = await supabase
    .from('vendors')
    .insert({
      name: vendor.name,
      contact_emails: vendor.contactEmails,
      phone: vendor.phone,
      address: vendor.address,
      website: vendor.website,
      lead_time_days: vendor.leadTimeDays,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating vendor:', error);
    throw error;
  }

  return transformVendorFromDb(data);
}

/**
 * Update a vendor
 */
export async function updateVendor(id: string, updates: Partial<Vendor>): Promise<Vendor> {
  const dbUpdates: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.contactEmails !== undefined) dbUpdates.contact_emails = updates.contactEmails;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.address !== undefined) dbUpdates.address = updates.address;
  if (updates.website !== undefined) dbUpdates.website = updates.website;
  if (updates.leadTimeDays !== undefined) dbUpdates.lead_time_days = updates.leadTimeDays;

  const { data, error } = await supabase
    .from('vendors')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating vendor:', error);
    throw error;
  }

  return transformVendorFromDb(data);
}

/**
 * Delete a vendor (soft delete)
 */
export async function deleteVendor(id: string): Promise<void> {
  const { error } = await supabase
    .from('vendors')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error deleting vendor:', error);
    throw error;
  }
}

// ============================================================================
// BILL OF MATERIALS OPERATIONS
// ============================================================================

/**
 * Fetch all BOMs
 */
export async function fetchBOMs(): Promise<BillOfMaterials[]> {
  const { data, error } = await supabase
    .from('bills_of_materials')
    .select('*')
    .eq('is_deleted', false)
    .order('name');

  if (error) {
    console.error('Error fetching BOMs:', error);
    throw error;
  }

  return data.map(transformBOMFromDb);
}

/**
 * Fetch a single BOM
 */
export async function fetchBOM(id: string): Promise<BillOfMaterials | null> {
  const { data, error } = await supabase
    .from('bills_of_materials')
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('Error fetching BOM:', error);
    throw error;
  }

  return transformBOMFromDb(data);
}

/**
 * Create a new BOM
 */
export async function createBOM(bom: Omit<BillOfMaterials, 'id'>): Promise<BillOfMaterials> {
  const { data, error } = await supabase
    .from('bills_of_materials')
    .insert({
      finished_sku: bom.finishedSku,
      name: bom.name,
      components: bom.components,
      artwork: bom.artwork,
      packaging: bom.packaging,
      barcode: bom.barcode || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating BOM:', error);
    throw error;
  }

  return transformBOMFromDb(data);
}

/**
 * Update a BOM
 */
export async function updateBOM(id: string, updates: Partial<BillOfMaterials>): Promise<BillOfMaterials> {
  const dbUpdates: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.finishedSku !== undefined) dbUpdates.finished_sku = updates.finishedSku;
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.components !== undefined) dbUpdates.components = updates.components;
  if (updates.artwork !== undefined) dbUpdates.artwork = updates.artwork;
  if (updates.packaging !== undefined) dbUpdates.packaging = updates.packaging;
  if (updates.barcode !== undefined) dbUpdates.barcode = updates.barcode;

  const { data, error } = await supabase
    .from('bills_of_materials')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating BOM:', error);
    throw error;
  }

  return transformBOMFromDb(data);
}

/**
 * Delete a BOM (soft delete)
 */
export async function deleteBOM(id: string): Promise<void> {
  const { error } = await supabase
    .from('bills_of_materials')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error deleting BOM:', error);
    throw error;
  }
}

// ============================================================================
// PURCHASE ORDER OPERATIONS
// ============================================================================

/**
 * Fetch all purchase orders
 */
export async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching purchase orders:', error);
    throw error;
  }

  return data.map(transformPurchaseOrderFromDb);
}

/**
 * Fetch purchase orders by vendor
 */
export async function fetchPurchaseOrdersByVendor(vendorId: string): Promise<PurchaseOrder[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching purchase orders by vendor:', error);
    throw error;
  }

  return data.map(transformPurchaseOrderFromDb);
}

/**
 * Create a new purchase order
 */
export async function createPurchaseOrder(po: Omit<PurchaseOrder, 'id' | 'createdAt'>): Promise<PurchaseOrder> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .insert({
      vendor_id: po.vendorId,
      status: po.status || 'Pending',
      items: po.items,
      expected_date: po.expectedDate || null,
      notes: po.notes || null,
      requisition_ids: po.requisitionIds || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating purchase order:', error);
    throw error;
  }

  return transformPurchaseOrderFromDb(data);
}

/**
 * Update a purchase order
 */
export async function updatePurchaseOrder(id: string, updates: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
  const dbUpdates: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.items !== undefined) dbUpdates.items = updates.items;
  if (updates.expectedDate !== undefined) dbUpdates.expected_date = updates.expectedDate;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  if (updates.requisitionIds !== undefined) dbUpdates.requisition_ids = updates.requisitionIds;

  const { data, error } = await supabase
    .from('purchase_orders')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating purchase order:', error);
    throw error;
  }

  return transformPurchaseOrderFromDb(data);
}

// ============================================================================
// BUILD ORDER OPERATIONS
// ============================================================================

/**
 * Fetch all build orders
 */
export async function fetchBuildOrders(): Promise<BuildOrder[]> {
  const { data, error } = await supabase
    .from('build_orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching build orders:', error);
    throw error;
  }

  return data.map(transformBuildOrderFromDb);
}

/**
 * Create a new build order
 */
export async function createBuildOrder(order: Omit<BuildOrder, 'id' | 'createdAt'>): Promise<BuildOrder> {
  const { data, error } = await supabase
    .from('build_orders')
    .insert({
      finished_sku: order.finishedSku,
      name: order.name,
      quantity: order.quantity,
      status: order.status || 'Pending',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating build order:', error);
    throw error;
  }

  return transformBuildOrderFromDb(data);
}

/**
 * Update a build order
 */
export async function updateBuildOrder(id: string, updates: Partial<BuildOrder>): Promise<BuildOrder> {
  const dbUpdates: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.quantity !== undefined) dbUpdates.quantity = updates.quantity;

  const { data, error } = await supabase
    .from('build_orders')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating build order:', error);
    throw error;
  }

  return transformBuildOrderFromDb(data);
}

// ============================================================================
// ARTWORK FOLDER OPERATIONS
// ============================================================================

/**
 * Fetch all artwork folders
 */
export async function fetchArtworkFolders(): Promise<ArtworkFolder[]> {
  const { data, error } = await supabase
    .from('artwork_folders')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching artwork folders:', error);
    throw error;
  }

  return data;
}

/**
 * Create a new artwork folder
 */
export async function createArtworkFolder(name: string): Promise<ArtworkFolder> {
  const { data, error } = await supabase
    .from('artwork_folders')
    .insert({ name })
    .select()
    .single();

  if (error) {
    console.error('Error creating artwork folder:', error);
    throw error;
  }

  return data;
}

// ============================================================================
// REAL-TIME SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to inventory changes
 */
export function subscribeToInventory(
  callback: (payload: any) => void
): RealtimeChannel {
  return supabase
    .channel('inventory-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'inventory_items',
      },
      callback
    )
    .subscribe();
}

/**
 * Subscribe to purchase order changes
 */
export function subscribeToPurchaseOrders(
  callback: (payload: any) => void
): RealtimeChannel {
  return supabase
    .channel('po-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'purchase_orders',
      },
      callback
    )
    .subscribe();
}

/**
 * Subscribe to BOM changes
 */
export function subscribeToBOMs(
  callback: (payload: any) => void
): RealtimeChannel {
  return supabase
    .channel('bom-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bills_of_materials',
      },
      callback
    )
    .subscribe();
}

// ============================================================================
// DATA TRANSFORMATION HELPERS
// ============================================================================

function transformInventoryFromDb(dbItem: any): InventoryItem {
  return {
    sku: dbItem.sku,
    name: dbItem.name,
    category: dbItem.category,
    stock: dbItem.stock,
    onOrder: dbItem.on_order,
    reorderPoint: dbItem.reorder_point,
    vendorId: dbItem.vendor_id,
    moq: dbItem.moq,
  };
}

function transformVendorFromDb(dbVendor: any): Vendor {
  return {
    id: dbVendor.id,
    name: dbVendor.name,
    contactEmails: Array.isArray(dbVendor.contact_emails) 
      ? dbVendor.contact_emails 
      : JSON.parse(dbVendor.contact_emails || '[]'),
    phone: dbVendor.phone,
    address: dbVendor.address,
    website: dbVendor.website,
    leadTimeDays: dbVendor.lead_time_days,
  };
}

function transformBOMFromDb(dbBOM: any): BillOfMaterials {
  return {
    id: dbBOM.id,
    finishedSku: dbBOM.finished_sku,
    name: dbBOM.name,
    components: Array.isArray(dbBOM.components) 
      ? dbBOM.components 
      : JSON.parse(dbBOM.components || '[]'),
    artwork: Array.isArray(dbBOM.artwork) 
      ? dbBOM.artwork 
      : JSON.parse(dbBOM.artwork || '[]'),
    packaging: typeof dbBOM.packaging === 'object' 
      ? dbBOM.packaging 
      : JSON.parse(dbBOM.packaging || '{}'),
    barcode: dbBOM.barcode,
  };
}

function transformPurchaseOrderFromDb(dbPO: any): PurchaseOrder {
  return {
    id: dbPO.id,
    vendorId: dbPO.vendor_id,
    status: dbPO.status,
    items: Array.isArray(dbPO.items) 
      ? dbPO.items 
      : JSON.parse(dbPO.items || '[]'),
    expectedDate: dbPO.expected_date,
    notes: dbPO.notes,
    requisitionIds: dbPO.requisition_ids 
      ? (Array.isArray(dbPO.requisition_ids) 
          ? dbPO.requisition_ids 
          : JSON.parse(dbPO.requisition_ids))
      : undefined,
    createdAt: dbPO.created_at,
  };
}

function transformBuildOrderFromDb(dbOrder: any): BuildOrder {
  return {
    id: dbOrder.id,
    finishedSku: dbOrder.finished_sku,
    name: dbOrder.name,
    quantity: dbOrder.quantity,
    status: dbOrder.status,
    createdAt: dbOrder.created_at,
  };
}
