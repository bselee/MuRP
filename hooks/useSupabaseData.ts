/**
 * Supabase Data Hooks
 * 
 * React hooks for fetching and managing data from Supabase with real-time updates
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import type {
  BillOfMaterials,
  InventoryItem,
  Vendor,
  PurchaseOrder,
  BuildOrder,
  InternalRequisition,
  BOMComponent,
  Artwork,
  Packaging,
  PurchaseOrderItem,
  RequisitionItem,
} from '../types';

type SupabaseError = Error | null;

// Helper to transform snake_case DB rows to camelCase application types
function transformInventoryItem(row: any): InventoryItem {
  return {
    sku: row.sku,
    name: row.name,
    category: row.category || 'Raw Materials',
    stock: row.stock || 0,
    onOrder: row.on_order || 0,
    reorderPoint: row.reorder_point || 0,
    vendorId: row.vendor_id || '',
    moq: row.moq,
  };
}

function transformVendor(row: any): Vendor {
  return {
    id: row.id,
    name: row.name,
    contactEmails: row.contact_emails || [],
    phone: row.phone || '',
    address: row.address || '',
    website: row.website || '',
    leadTimeDays: row.lead_time_days || 0,
  };
}

function transformBOM(row: any): BillOfMaterials {
  return {
    id: row.id,
    finishedSku: row.finished_sku,
    name: row.name,
    components: (row.components as any[]) || [],
    artwork: (row.artwork as any[]) || [],
    packaging: row.packaging || { bagType: '', labelType: '', specialInstructions: '' },
    barcode: row.barcode,
  };
}

function transformPurchaseOrder(row: any): PurchaseOrder {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    status: row.status || 'Pending',
    createdAt: row.created_at,
    items: (row.items as any[]) || [],
    expectedDate: row.expected_date,
    notes: row.notes,
    requisitionIds: row.requisition_ids || [],
  };
}

function transformBuildOrder(row: any): BuildOrder {
  return {
    id: row.id,
    finishedSku: row.finished_sku,
    name: row.name,
    quantity: row.quantity,
    status: row.status || 'Pending',
    createdAt: row.created_at,
  };
}

function transformRequisition(row: any): InternalRequisition {
  return {
    id: row.id,
    requesterId: row.requested_by,
    source: 'Manual',
    department: row.department,
    createdAt: row.created_at,
    status: row.status || 'Pending',
    items: (row.items as any[]) || [],
  };
}

/**
 * Hook to fetch inventory items from Supabase with real-time updates
 */
export function useSupabaseInventory() {
  const [data, setData] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SupabaseError>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: rows, error: fetchError } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name', { ascending: true });

      if (fetchError) throw fetchError;
      setData((rows || []).map(transformInventoryItem));
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching inventory:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Subscribe to real-time changes
    const subscription = supabase
      .channel('inventory_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'inventory_items' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Hook to fetch vendors from Supabase with real-time updates
 */
export function useSupabaseVendors() {
  const [data, setData] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SupabaseError>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: rows, error: fetchError } = await supabase
        .from('vendors')
        .select('*')
        .order('name', { ascending: true });

      if (fetchError) throw fetchError;
      setData((rows || []).map(transformVendor));
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching vendors:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Subscribe to real-time changes
    const subscription = supabase
      .channel('vendors_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'vendors' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Hook to fetch BOMs from Supabase with real-time updates
 */
export function useSupabaseBOMs() {
  const [data, setData] = useState<BillOfMaterials[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SupabaseError>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: rows, error: fetchError } = await supabase
        .from('boms')
        .select('*')
        .order('name', { ascending: true });

      if (fetchError) throw fetchError;
      setData((rows || []).map(transformBOM));
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching BOMs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Subscribe to real-time changes
    const subscription = supabase
      .channel('boms_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'boms' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Hook to fetch purchase orders from Supabase with real-time updates
 */
export function useSupabasePurchaseOrders() {
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SupabaseError>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: rows, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setData((rows || []).map(transformPurchaseOrder));
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching purchase orders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Subscribe to real-time changes
    const subscription = supabase
      .channel('purchase_orders_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_orders' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Hook to fetch build orders from Supabase with real-time updates
 */
export function useSupabaseBuildOrders() {
  const [data, setData] = useState<BuildOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SupabaseError>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: rows, error: fetchError } = await supabase
        .from('build_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setData((rows || []).map(transformBuildOrder));
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching build orders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Subscribe to real-time changes
    const subscription = supabase
      .channel('build_orders_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'build_orders' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Hook to fetch requisitions from Supabase with real-time updates
 */
export function useSupabaseRequisitions() {
  const [data, setData] = useState<InternalRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SupabaseError>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: rows, error: fetchError } = await supabase
        .from('requisitions')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setData((rows || []).map(transformRequisition));
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching requisitions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Subscribe to real-time changes
    const subscription = supabase
      .channel('requisitions_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'requisitions' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Mutation helpers for modifying Supabase data
 */

export async function createPurchaseOrder(
  po: Omit<PurchaseOrder, 'id' | 'createdAt'>
): Promise<{ data: PurchaseOrder | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .insert({
        vendor_id: po.vendorId,
        status: po.status,
        items: po.items as any,
        expected_date: po.expectedDate,
        notes: po.notes,
        requisition_ids: po.requisitionIds || [],
      })
      .select()
      .single();

    if (error) throw error;
    return { data: data ? transformPurchaseOrder(data) : null, error: null };
  } catch (err) {
    return { data: null, error: err as Error };
  }
}

export async function updateInventoryStock(
  sku: string,
  stockChange: number,
  onOrderChange: number = 0
): Promise<{ error: Error | null }> {
  try {
    // First get current values
    const { data: current, error: fetchError } = await supabase
      .from('inventory_items')
      .select('stock, on_order')
      .eq('sku', sku)
      .single();

    if (fetchError) throw fetchError;

    // Update with new values
    const { error } = await supabase
      .from('inventory_items')
      .update({
        stock: (current?.stock || 0) + stockChange,
        on_order: (current?.on_order || 0) + onOrderChange,
        updated_at: new Date().toISOString(),
      })
      .eq('sku', sku);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}

export async function createBuildOrder(
  buildOrder: Omit<BuildOrder, 'id' | 'createdAt'>
): Promise<{ data: BuildOrder | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('build_orders')
      .insert({
        finished_sku: buildOrder.finishedSku,
        name: buildOrder.name,
        quantity: buildOrder.quantity,
        status: buildOrder.status,
      })
      .select()
      .single();

    if (error) throw error;
    return { data: data ? transformBuildOrder(data) : null, error: null };
  } catch (err) {
    return { data: null, error: err as Error };
  }
}

export async function updateBuildOrderStatus(
  id: string,
  status: BuildOrder['status']
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('build_orders')
      .update({
        status,
        completed_at: status === 'Completed' ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}

export async function updateBOM(
  bom: BillOfMaterials
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('boms')
      .update({
        finished_sku: bom.finishedSku,
        name: bom.name,
        components: bom.components as any,
        artwork: bom.artwork as any,
        packaging: bom.packaging as any,
        barcode: bom.barcode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bom.id);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}

export async function createRequisition(
  requisition: Omit<InternalRequisition, 'id' | 'createdAt'>
): Promise<{ data: InternalRequisition | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('requisitions')
      .insert({
        requested_by: requisition.requesterId,
        department: requisition.department,
        status: requisition.status,
        items: requisition.items as any,
        notes: '',
      })
      .select()
      .single();

    if (error) throw error;
    return { data: data ? transformRequisition(data) : null, error: null };
  } catch (err) {
    return { data: null, error: err as Error };
  }
}

export async function updateRequisitionStatus(
  id: string,
  status: InternalRequisition['status']
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('requisitions')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}
