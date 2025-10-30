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
  BuildOrder,
  InternalRequisition,
  User,
  ArtworkFolder
} from '../types';

/**
 * Wrapper to add timeout protection to Supabase queries
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 10000): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}

/**
 * Fetch all inventory items for the current user
 */
export async function fetchInventory(): Promise<InventoryItem[]> {
  console.log('[fetchInventory] Starting query...');
  
  const result = await withTimeout(
    supabase
      .from('inventory_items')
      .select('*')
      .eq('is_deleted', false)
      .order('sku'),
    10000
  );

  const { data, error } = result;

  if (error) {
    console.error('[fetchInventory] Error:', error);
    throw error;
  }

  console.log(`[fetchInventory] Fetched ${data?.length || 0} items`);

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

/**
 * Fetch all requisitions
 */
export async function fetchRequisitions(): Promise<InternalRequisition[]> {
  const { data, error } = await supabase
    .from('requisitions')
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching requisitions:', error);
    throw error;
  }

  return (data || []).map((req: any) => ({
    id: req.id,
    requesterId: req.requester_id,
    source: req.requester_id ? 'Manual' : 'System',
    department: req.department || 'Purchasing',
    createdAt: req.created_at,
    status: req.status as 'Pending' | 'Approved' | 'Rejected' | 'Ordered',
    items: Array.isArray(req.items) ? req.items : [],
  }));
}

/**
 * Create a new requisition
 */
export async function createRequisition(
  req: Omit<InternalRequisition, 'id' | 'createdAt'>
): Promise<string> {
  // Generate requisition number
  const { data: seqData, error: seqError } = await supabase
    .rpc('nextval', { seq_name: 'requisition_number_seq' }) as { data: number; error: any };

  if (seqError) {
    console.error('Error generating requisition number:', seqError);
    throw seqError;
  }

  const reqNumber = `REQ-${seqData.toString().padStart(5, '0')}`;

  const { error } = await supabase
    .from('requisitions')
    .insert({
      requisition_number: reqNumber,
      requester_id: req.requesterId || null,
      department: req.department,
      status: req.status,
      items: req.items,
    });

  if (error) {
    console.error('Error creating requisition:', error);
    throw error;
  }

  return reqNumber;
}

/**
 * Update requisition status
 */
export async function updateRequisitionStatus(
  id: string,
  status: 'Pending' | 'Approved' | 'Rejected' | 'Ordered'
): Promise<void> {
  const { error } = await supabase
    .from('requisitions')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error('Error updating requisition status:', error);
    throw error;
  }
}

/**
 * Fetch all users from the database
 */
export async function fetchUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching users:', error);
    throw error;
  }

  return (data || []).map((user: any) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as 'Admin' | 'Manager' | 'Staff',
    department: user.department as 'Purchasing' | 'MFG 1' | 'MFG 2' | 'Fulfillment' | 'SHP/RCV',
    onboardingComplete: true,
  }));
}

/**
 * Fetch a single user by auth ID (for current user profile)
 */
export async function fetchUserById(userId: string): Promise<User | null> {
  try {
    console.log('[fetchUserById] Fetching user:', userId);
    
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        console.warn('[fetchUserById] Timeout after 10 seconds');
        resolve(null);
      }, 10000);
    });
    
    const fetchPromise = supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    const result = await Promise.race([fetchPromise, timeoutPromise]);
    
    if (result === null) {
      console.error('[fetchUserById] Query timed out');
      return null;
    }
    
    const { data, error } = result;

    if (error) {
      console.error('[fetchUserById] Error:', error);
      return null;
    }

    if (!data) {
      console.warn('[fetchUserById] No data found for user:', userId);
      return null;
    }

    console.log('[fetchUserById] User found:', data.email);
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role as 'Admin' | 'Manager' | 'Staff',
      department: data.department as 'Purchasing' | 'MFG 1' | 'MFG 2' | 'Fulfillment' | 'SHP/RCV',
      onboardingComplete: true,
    };
  } catch (err) {
    console.error('[fetchUserById] Exception:', err);
    return null;
  }
}

/**
 * Create a new user
 */
export async function createUser(user: Omit<User, 'id' | 'onboardingComplete'>): Promise<string> {
  const { data, error } = await supabase
    .from('users')
    .insert({
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating user:', error);
    throw error;
  }

  return data.id;
}

/**
 * Fetch all artwork folders
 */
export async function fetchArtworkFolders(): Promise<ArtworkFolder[]> {
  const { data, error } = await supabase
    .from('artwork_folders')
    .select('*')
    .eq('is_deleted', false)
    .order('name');

  if (error) {
    console.error('Error fetching artwork folders:', error);
    throw error;
  }

  return (data || []).map((folder: any) => ({
    id: folder.id,
    name: folder.name,
    description: folder.description || '',
  }));
}

/**
 * Create a new artwork folder
 */
export async function createArtworkFolder(folder: Omit<ArtworkFolder, 'id'>): Promise<string> {
  const { data, error } = await supabase
    .from('artwork_folders')
    .insert({
      name: folder.name,
      description: folder.description,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating artwork folder:', error);
    throw error;
  }

  return data.id;
}

/**
 * Update a BOM
 */
export async function updateBOM(id: string, bom: Partial<BillOfMaterials>): Promise<void> {
  const updateData: any = {};
  
  if (bom.name) updateData.name = bom.name;
  if (bom.components) updateData.components = bom.components;
  if (bom.artwork) updateData.artwork = bom.artwork;
  if (bom.packaging) updateData.packaging = bom.packaging;
  if (bom.barcode) updateData.barcode = bom.barcode;
  if (bom.notes) updateData.production_notes = bom.notes;

  const { error } = await supabase
    .from('boms')
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.error('Error updating BOM:', error);
    throw error;
  }
}

/**
 * Update build order status
 */
export async function updateBuildOrderStatus(
  id: string,
  status: 'Planned' | 'In Progress' | 'Completed' | 'Cancelled'
): Promise<void> {
  const updateData: any = { status };
  
  if (status === 'In Progress' && !updateData.started_at) {
    updateData.started_at = new Date().toISOString();
  }
  
  if (status === 'Completed') {
    updateData.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('build_orders')
    .update(updateData)
    .eq('build_number', id);

  if (error) {
    console.error('Error updating build order status:', error);
    throw error;
  }
}

/**
 * Update purchase order status
 */
export async function updatePurchaseOrderStatus(
  id: string,
  status: 'Pending' | 'Submitted' | 'Fulfilled' | 'Cancelled'
): Promise<void> {
  const { error } = await supabase
    .from('purchase_orders')
    .update({ status })
    .eq('po_number', id);

  if (error) {
    console.error('Error updating purchase order status:', error);
    throw error;
  }
}

/**
 * Subscribe to real-time build order changes
 */
export function subscribeToBuildOrders(callback: (payload: any) => void) {
  const subscription = supabase
    .channel('build-orders-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'build_orders',
      },
      callback
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
}

/**
 * Subscribe to real-time BOM changes
 */
export function subscribeToBOMs(callback: (payload: any) => void) {
  const subscription = supabase
    .channel('boms-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'boms',
      },
      callback
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
}
