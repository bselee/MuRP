/**
 * Data Service for fetching and managing application data from Supabase
 * Provides centralized data access layer with real-time subscriptions
 */

import { supabase } from '../lib/supabase/client';
import type { 
  BillOfMaterials, 
  InventoryItem, 
  Vendor, 
  PurchaseOrder,
  BuildOrder 
} from '../types';

/**
 * Fetch all inventory items for the current user
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

  // Transform database format to app format
  return (data || []).map(item => ({
    sku: item.sku,
    name: item.name,
    category: item.category,
    stock: item.stock,
    onOrder: item.on_order,
    reorderPoint: item.reorder_point,
    vendorId: item.vendor_id,
    moq: item.moq,
    price: item.unit_price ? parseFloat(item.unit_price.toString()) : 0,
    unit: item.unit_of_measure || 'EA',
    location: item.location || '',
  }));
}

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

  return (data || []).map(vendor => ({
    id: vendor.id,
    name: vendor.name,
    contactEmail: vendor.contact_emails?.[0] || '',
    contactName: '', // Not in DB schema, using empty string
    phone: vendor.contact_phone || '',
    address: vendor.address || '',
    paymentTerms: vendor.payment_terms || '',
    leadTime: vendor.lead_time_days || 0,
  }));
}

/**
 * Fetch all BOMs (Bills of Materials)
 */
export async function fetchBOMs(): Promise<BillOfMaterials[]> {
  const { data, error } = await supabase
    .from('boms')
    .select('*')
    .eq('is_deleted', false)
    .order('name');

  if (error) {
    console.error('Error fetching BOMs:', error);
    throw error;
  }

  return (data || []).map(bom => ({
    id: bom.id,
    finishedSku: bom.finished_sku,
    name: bom.name,
    components: Array.isArray(bom.components) ? bom.components : [],
    artwork: Array.isArray(bom.artwork) ? bom.artwork : [],
    packaging: typeof bom.packaging === 'object' ? bom.packaging : {},
    barcode: bom.barcode || '',
    notes: bom.production_notes || '',
  }));
}

/**
 * Fetch all purchase orders
 */
export async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching purchase orders:', error);
    throw error;
  }

  return (data || []).map(po => ({
    id: po.po_number,
    vendorId: po.vendor_id,
    status: po.status as 'Pending' | 'Submitted' | 'Fulfilled' | 'Cancelled',
    createdAt: po.created_at,
    items: Array.isArray(po.items) ? po.items : [],
    expectedDate: po.expected_delivery_date || '',
    notes: po.notes || '',
    requisitionIds: po.requisition_ids || [],
  }));
}

/**
 * Fetch all build orders
 */
export async function fetchBuildOrders(): Promise<BuildOrder[]> {
  const { data, error } = await supabase
    .from('build_orders')
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching build orders:', error);
    throw error;
  }

  return (data || []).map(order => ({
    id: order.build_number,
    bomId: order.bom_id,
    finishedSku: order.finished_sku,
    quantity: order.quantity,
    status: order.status as 'Planned' | 'In Progress' | 'Completed' | 'Cancelled',
    scheduledDate: order.scheduled_date || '',
    assignedTo: order.assigned_to || '',
    notes: order.notes || '',
  }));
}

/**
 * Create a new inventory item
 */
export async function createInventoryItem(item: Omit<InventoryItem, 'onOrder'>): Promise<void> {
  const { error } = await supabase
    .from('inventory_items')
    .insert({
      sku: item.sku,
      name: item.name,
      category: item.category,
      stock: item.stock,
      on_order: 0,
      reorder_point: item.reorderPoint,
      vendor_id: item.vendorId,
      moq: item.moq,
      unit_price: item.price,
      unit_of_measure: item.unit,
      location: item.location,
    });

  if (error) {
    console.error('Error creating inventory item:', error);
    throw error;
  }
}

/**
 * Update inventory item stock levels
 */
export async function updateInventoryStock(sku: string, stock: number, onOrder: number): Promise<void> {
  const { error } = await supabase
    .from('inventory_items')
    .update({
      stock,
      on_order: onOrder,
    })
    .eq('sku', sku);

  if (error) {
    console.error('Error updating inventory stock:', error);
    throw error;
  }
}

/**
 * Create a new vendor
 */
export async function createVendor(vendor: Omit<Vendor, 'id'>): Promise<string> {
  const { data, error } = await supabase
    .from('vendors')
    .insert({
      name: vendor.name,
      contact_emails: vendor.contactEmail ? [vendor.contactEmail] : [],
      contact_phone: vendor.phone,
      address: vendor.address,
      payment_terms: vendor.paymentTerms,
      lead_time_days: vendor.leadTime,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating vendor:', error);
    throw error;
  }

  return data.id;
}

/**
 * Create a new purchase order
 */
export async function createPurchaseOrder(
  po: Omit<PurchaseOrder, 'id' | 'status' | 'createdAt'>
): Promise<string> {
  // Generate PO number
  const { data: seqData, error: seqError } = await supabase
    .rpc('nextval', { seq_name: 'po_number_seq' }) as { data: number; error: any };

  if (seqError) {
    console.error('Error generating PO number:', seqError);
    throw seqError;
  }

  const poNumber = `PO-${new Date().getFullYear()}-${seqData.toString().padStart(4, '0')}`;

  // Calculate totals
  const subtotal = po.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const { error } = await supabase
    .from('purchase_orders')
    .insert({
      po_number: poNumber,
      vendor_id: po.vendorId,
      status: 'Pending',
      items: po.items,
      subtotal,
      tax_amount: 0,
      shipping_cost: 0,
      total_amount: subtotal,
      requisition_ids: po.requisitionIds || [],
      expected_delivery_date: po.expectedDate,
      notes: po.notes,
    });

  if (error) {
    console.error('Error creating purchase order:', error);
    throw error;
  }

  return poNumber;
}

/**
 * Create a new BOM
 */
export async function createBOM(bom: Omit<BillOfMaterials, 'id'>): Promise<string> {
  const { data, error } = await supabase
    .from('boms')
    .insert({
      finished_sku: bom.finishedSku,
      name: bom.name,
      components: bom.components,
      artwork: bom.artwork || [],
      packaging: bom.packaging || {},
      barcode: bom.barcode,
      production_notes: bom.notes,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating BOM:', error);
    throw error;
  }

  return data.id;
}

/**
 * Create a new build order
 */
export async function createBuildOrder(
  order: Omit<BuildOrder, 'id' | 'status'>
): Promise<string> {
  // Generate build number
  const { data: seqData, error: seqError } = await supabase
    .rpc('nextval', { seq_name: 'build_number_seq' }) as { data: number; error: any };

  if (seqError) {
    console.error('Error generating build number:', seqError);
    throw seqError;
  }

  const buildNumber = `BUILD-${seqData.toString().padStart(5, '0')}`;

  const { error } = await supabase
    .from('build_orders')
    .insert({
      build_number: buildNumber,
      bom_id: order.bomId,
      finished_sku: order.finishedSku,
      quantity: order.quantity,
      status: 'Planned',
      scheduled_date: order.scheduledDate,
      assigned_to: order.assignedTo || null,
      notes: order.notes,
    });

  if (error) {
    console.error('Error creating build order:', error);
    throw error;
  }

  return buildNumber;
}

/**
 * Subscribe to real-time inventory changes
 */
export function subscribeToInventory(callback: (payload: any) => void) {
  const subscription = supabase
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

  return () => {
    subscription.unsubscribe();
  };
}

/**
 * Subscribe to real-time purchase order changes
 */
export function subscribeToPurchaseOrders(callback: (payload: any) => void) {
  const subscription = supabase
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

  return () => {
    subscription.unsubscribe();
  };
}
