// @ts-nocheck
/**
 * Supabase Data Hooks
 * 
 * Custom React hooks for fetching and subscribing to Supabase data
 * Provides real-time updates, loading states, and error handling
 * 
 * Usage:
 * const { data: inventory, loading, error, refetch } = useSupabaseInventory();
 * const { data: vendors, loading, error } = useSupabaseVendors();
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  InventoryItem,
  Vendor,
  BillOfMaterials,
  PurchaseOrder,
  BuildOrder,
  InternalRequisition,
} from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface UseSupabaseDataResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UseSupabaseSingleResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// ============================================================================
// INVENTORY HOOKS
// ============================================================================

/**
 * Fetch and subscribe to inventory items
 * Real-time updates when inventory changes in database
 */
export function useSupabaseInventory(): UseSupabaseDataResult<InventoryItem> {
  const [data, setData] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: items, error: fetchError } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name');

      if (fetchError) throw fetchError;

      // Transform from snake_case to camelCase (including enhanced fields from migration 003)
      const transformed: InventoryItem[] = (items || []).map((item: any) => ({
        sku: item.sku,
        name: item.name,
        category: item.category,
        stock: item.stock,
        onOrder: item.on_order,
        reorderPoint: item.reorder_point,
        vendorId: item.vendor_id,
        moq: item.moq,
        // Enhanced fields
        description: item.description,
        status: item.status,
        unitCost: item.unit_cost,
        unitPrice: item.unit_price,
        warehouseLocation: item.warehouse_location,
        binLocation: item.bin_location,
        salesVelocity: item.sales_velocity_consolidated,
        dataSource: item.data_source,
        lastSyncAt: item.last_sync_at,
        syncStatus: item.sync_status,
      }));

      setData(transformed);
    } catch (err) {
      console.error('[useSupabaseInventory] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch inventory'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchInventory();

    // Set up real-time subscription
    const newChannel = supabase
      .channel('inventory-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_items',
        },
        (payload) => {
          console.log('[useSupabaseInventory] Real-time update:', payload);
          fetchInventory();
        }
      )
      .subscribe();

    setChannel(newChannel);

    // Cleanup
    return () => {
      if (newChannel) {
        supabase.removeChannel(newChannel);
      }
    };
  }, [fetchInventory]);

  return { data, loading, error, refetch: fetchInventory };
}

/**
 * Fetch single inventory item by SKU
 */
export function useSupabaseInventoryItem(sku: string): UseSupabaseSingleResult<InventoryItem> {
  const [data, setData] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchItem = useCallback(async () => {
    if (!sku) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: item, error: fetchError } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('sku', sku)
        .single();

      if (fetchError) throw fetchError;

      if (item) {
        setData({
          sku: item.sku,
          name: item.name,
          category: item.category,
          stock: item.stock,
          onOrder: item.on_order,
          reorderPoint: item.reorder_point,
          vendorId: item.vendor_id,
          moq: item.moq,
          // Enhanced fields
          description: item.description,
          status: item.status,
          unitCost: item.unit_cost,
          unitPrice: item.unit_price,
          warehouseLocation: item.warehouse_location,
          binLocation: item.bin_location,
          salesVelocity: item.sales_velocity_consolidated,
          dataSource: item.data_source,
          lastSyncAt: item.last_sync_at,
          syncStatus: item.sync_status,
        });
      } else {
        setData(null);
      }
    } catch (err) {
      console.error('[useSupabaseInventoryItem] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch inventory item'));
    } finally {
      setLoading(false);
    }
  }, [sku]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  return { data, loading, error, refetch: fetchItem };
}

// ============================================================================
// VENDOR HOOKS
// ============================================================================

/**
 * Fetch and subscribe to vendors
 * Real-time updates when vendors change in database
 */
export function useSupabaseVendors(): UseSupabaseDataResult<Vendor> {
  const [data, setData] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  const fetchVendors = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Prefer enhanced view if available; fallback to base table
      let vendors: any[] | null = null;
      let fetchError: any = null;

      // Try vendor_details view first
      const viewRes = await supabase.from('vendor_details' as any).select('*').order('name');
      if (viewRes.error) {
        // Fallback to vendors table
        const tableRes = await supabase.from('vendors').select('*').order('name');
        vendors = tableRes.data as any[] | null;
        fetchError = tableRes.error;
      } else {
        vendors = viewRes.data as any[] | null;
        fetchError = viewRes.error;
      }

      if (fetchError) throw fetchError;

      // Transform from snake_case to camelCase
      const transformed: Vendor[] = (vendors || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        contactEmails: row.contact_emails || [],
        phone: row.phone || '',
        address: (row.address_display || row.address || ''),
        website: row.website || '',
        leadTimeDays: row.lead_time_days || 7,
        // Enhanced address fields (present when migration applied or when selecting from vendor_details)
        addressLine1: row.address_line1 || '',
        addressLine2: row.address_line2 || '',
        city: row.city || '',
        state: row.state || '',
        postalCode: row.postal_code || '',
        country: row.country || '',
        // Additional metadata (if available)
        notes: row.notes || '',
        dataSource: row.data_source || undefined,
        lastSyncAt: row.last_sync_at || undefined,
        syncStatus: row.sync_status || undefined,
      }));

      setData(transformed);
    } catch (err) {
      console.error('[useSupabaseVendors] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch vendors'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchVendors();

    // Set up real-time subscription
    const newChannel = supabase
      .channel('vendor-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vendors',
        },
        (payload) => {
          console.log('[useSupabaseVendors] Real-time update:', payload);
          fetchVendors();
        }
      )
      .subscribe();

    setChannel(newChannel);

    // Cleanup
    return () => {
      if (newChannel) {
        supabase.removeChannel(newChannel);
      }
    };
  }, [fetchVendors]);

  return { data, loading, error, refetch: fetchVendors };
}

/**
 * Fetch single vendor by ID
 */
export function useSupabaseVendor(id: string): UseSupabaseSingleResult<Vendor> {
  const [data, setData] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchVendor = useCallback(async () => {
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: vendor, error: fetchError } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      if (vendor) {
        setData({
          id: vendor.id,
          name: vendor.name,
          contactEmails: vendor.contact_emails || [],
          phone: vendor.phone || '',
          address: vendor.address || '',
          website: vendor.website || '',
          leadTimeDays: vendor.lead_time_days || 7,
        });
      } else {
        setData(null);
      }
    } catch (err) {
      console.error('[useSupabaseVendor] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch vendor'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchVendor();
  }, [fetchVendor]);

  return { data, loading, error, refetch: fetchVendor };
}

// ============================================================================
// BOM HOOKS
// ============================================================================

/**
 * Fetch and subscribe to BOMs (Bill of Materials)
 * Real-time updates when BOMs change in database
 */
export function useSupabaseBOMs(): UseSupabaseDataResult<BillOfMaterials> {
  const [data, setData] = useState<BillOfMaterials[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  const fetchBOMs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: boms, error: fetchError } = await supabase
        .from('boms')
        .select('*')
        .order('name');

      if (fetchError) throw fetchError;

      // Transform from snake_case to camelCase
      const transformed: BillOfMaterials[] = (boms || []).map((bom: any) => ({
        id: bom.id,
        finishedSku: bom.finished_sku,
        name: bom.name,
        description: bom.description || '',
        category: bom.category || 'Uncategorized',
        yieldQuantity: bom.yield_quantity || 1,
        potentialBuildQty: bom.potential_build_qty || 0,
        averageCost: bom.average_cost || 0,
        components: bom.components as any || [], // JSONB field
        artwork: bom.artwork as any || [], // JSONB field
        packaging: bom.packaging as any || {}, // JSONB field
        barcode: bom.barcode || '',
        notes: bom.notes || '',
      }));

      setData(transformed);
    } catch (err) {
      console.error('[useSupabaseBOMs] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch BOMs'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchBOMs();

    // Set up real-time subscription
    const newChannel = supabase
      .channel('bom-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'boms',
        },
        (payload) => {
          console.log('[useSupabaseBOMs] Real-time update:', payload);
          fetchBOMs();
        }
      )
      .subscribe();

    setChannel(newChannel);

    // Cleanup
    return () => {
      if (newChannel) {
        supabase.removeChannel(newChannel);
      }
    };
  }, [fetchBOMs]);

  return { data, loading, error, refetch: fetchBOMs };
}

/**
 * Fetch single BOM by ID
 */
export function useSupabaseBOM(id: string): UseSupabaseSingleResult<BillOfMaterials> {
  const [data, setData] = useState<BillOfMaterials | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchBOM = useCallback(async () => {
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: bom, error: fetchError } = await supabase
        .from('boms')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      if (bom) {
        setData({
          id: bom.id,
          finishedSku: bom.finished_sku,
          name: bom.name,
          description: bom.description || '',
          category: bom.category || 'Uncategorized',
          yieldQuantity: bom.yield_quantity || 1,
          potentialBuildQty: bom.potential_build_qty || 0,
          averageCost: bom.average_cost || 0,
          components: bom.components as any || [],
          artwork: bom.artwork as any || [],
          packaging: bom.packaging as any || {},
          barcode: bom.barcode || '',
          notes: bom.notes || '',
        });
      } else {
        setData(null);
      }
    } catch (err) {
      console.error('[useSupabaseBOM] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch BOM'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBOM();
  }, [fetchBOM]);

  return { data, loading, error, refetch: fetchBOM };
}

// ============================================================================
// PURCHASE ORDER HOOKS
// ============================================================================

/**
 * Fetch and subscribe to purchase orders
 * Real-time updates when POs change in database
 */
export function useSupabasePurchaseOrders(): UseSupabaseDataResult<PurchaseOrder> {
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  const fetchPurchaseOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: pos, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Transform from snake_case to camelCase
      const transformed: PurchaseOrder[] = (pos || []).map((po: any) => ({
        id: po.id,
        vendorId: po.vendor_id,
        status: po.status as 'Pending' | 'Submitted' | 'Fulfilled',
        createdAt: po.created_at,
        items: po.items as any, // JSONB field
        expectedDate: po.expected_date,
        notes: po.notes,
        requisitionIds: po.requisition_ids || [],
      }));

      setData(transformed);
    } catch (err) {
      console.error('[useSupabasePurchaseOrders] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch purchase orders'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchPurchaseOrders();

    // Set up real-time subscription
    const newChannel = supabase
      .channel('po-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchase_orders',
        },
        (payload) => {
          console.log('[useSupabasePurchaseOrders] Real-time update:', payload);
          fetchPurchaseOrders();
        }
      )
      .subscribe();

    setChannel(newChannel);

    // Cleanup
    return () => {
      if (newChannel) {
        supabase.removeChannel(newChannel);
      }
    };
  }, [fetchPurchaseOrders]);

  return { data, loading, error, refetch: fetchPurchaseOrders };
}

/**
 * Fetch single purchase order by ID
 */
export function useSupabasePurchaseOrder(id: string): UseSupabaseSingleResult<PurchaseOrder> {
  const [data, setData] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPurchaseOrder = useCallback(async () => {
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: po, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      if (po) {
        setData({
          id: po.id,
          vendorId: po.vendor_id,
          status: po.status as 'Pending' | 'Submitted' | 'Fulfilled',
          createdAt: po.created_at,
          items: po.items as any,
          expectedDate: po.expected_date,
          notes: po.notes,
          requisitionIds: po.requisition_ids || [],
        });
      } else {
        setData(null);
      }
    } catch (err) {
      console.error('[useSupabasePurchaseOrder] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch purchase order'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPurchaseOrder();
  }, [fetchPurchaseOrder]);

  return { data, loading, error, refetch: fetchPurchaseOrder };
}

// ============================================================================
// BUILD ORDER HOOKS
// ============================================================================

/**
 * Fetch and subscribe to build orders
 * Real-time updates when build orders change in database
 */
export function useSupabaseBuildOrders(): UseSupabaseDataResult<BuildOrder> {
  const [data, setData] = useState<BuildOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  const fetchBuildOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: orders, error: fetchError } = await supabase
        .from('build_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Transform from snake_case to camelCase
      const transformed: BuildOrder[] = (orders || []).map((order: any) => ({
        id: order.id,
        finishedSku: order.finished_sku,
        name: order.name,
        quantity: order.quantity,
        status: order.status as 'Pending' | 'In Progress' | 'Complete',
        createdAt: order.created_at,
      }));

      setData(transformed);
    } catch (err) {
      console.error('[useSupabaseBuildOrders] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch build orders'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchBuildOrders();

    // Set up real-time subscription
    const newChannel = supabase
      .channel('build-order-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'build_orders',
        },
        (payload) => {
          console.log('[useSupabaseBuildOrders] Real-time update:', payload);
          fetchBuildOrders();
        }
      )
      .subscribe();

    setChannel(newChannel);

    // Cleanup
    return () => {
      if (newChannel) {
        supabase.removeChannel(newChannel);
      }
    };
  }, [fetchBuildOrders]);

  return { data, loading, error, refetch: fetchBuildOrders };
}

// ============================================================================
// REQUISITION HOOKS
// ============================================================================

/**
 * Fetch and subscribe to internal requisitions
 * Real-time updates when requisitions change in database
 */
export function useSupabaseRequisitions(): UseSupabaseDataResult<InternalRequisition> {
  const [data, setData] = useState<InternalRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  const fetchRequisitions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: reqs, error: fetchError } = await supabase
        .from('requisitions')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Transform from snake_case to camelCase
      const transformed: InternalRequisition[] = (reqs || []).map((req: any) => ({
        id: req.id,
        requestedBy: req.requested_by,
        department: req.department,
        status: req.status as 'Pending' | 'Approved' | 'Fulfilled',
        createdAt: req.created_at,
        items: req.items as any, // JSONB field
        notes: req.notes,
      }));

      setData(transformed);
    } catch (err) {
      console.error('[useSupabaseRequisitions] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch requisitions'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchRequisitions();

    // Set up real-time subscription
    const newChannel = supabase
      .channel('requisition-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'requisitions',
        },
        (payload) => {
          console.log('[useSupabaseRequisitions] Real-time update:', payload);
          fetchRequisitions();
        }
      )
      .subscribe();

    setChannel(newChannel);

    // Cleanup
    return () => {
      if (newChannel) {
        supabase.removeChannel(newChannel);
      }
    };
  }, [fetchRequisitions]);

  return { data, loading, error, refetch: fetchRequisitions };
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Get low stock inventory items
 */
export function useSupabaseLowStock(): UseSupabaseDataResult<InventoryItem> {
  const [data, setData] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLowStock = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch items where stock <= reorder_point
      const { data: items, error: fetchError } = await supabase
        .from('inventory_items')
        .select('*')
        .order('stock');

      if (fetchError) throw fetchError;

      // Filter items where stock <= reorder_point
      const lowStockItems = (items || []).filter((item: any) => item.stock <= item.reorder_point);

      const transformed: InventoryItem[] = lowStockItems.map((item: any) => ({
        sku: item.sku,
        name: item.name,
        category: item.category,
        stock: item.stock,
        onOrder: item.on_order,
        reorderPoint: item.reorder_point,
        vendorId: item.vendor_id,
        moq: item.moq,
      }));

      setData(transformed);
    } catch (err) {
      console.error('[useSupabaseLowStock] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch low stock items'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLowStock();
  }, [fetchLowStock]);

  return { data, loading, error, refetch: fetchLowStock };
}

/**
 * Get pending purchase orders
 */
export function useSupabasePendingPOs(): UseSupabaseDataResult<PurchaseOrder> {
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPendingPOs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: pos, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('*')
        .in('status', ['Pending', 'Submitted'])
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const transformed: PurchaseOrder[] = (pos || []).map((po: any) => ({
        id: po.id,
        vendorId: po.vendor_id,
        status: po.status as 'Pending' | 'Submitted' | 'Fulfilled',
        createdAt: po.created_at,
        items: po.items as any,
        expectedDate: po.expected_date,
        notes: po.notes,
        requisitionIds: po.requisition_ids || [],
      }));

      setData(transformed);
    } catch (err) {
      console.error('[useSupabasePendingPOs] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch pending POs'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingPOs();
  }, [fetchPendingPOs]);

  return { data, loading, error, refetch: fetchPendingPOs };
}
