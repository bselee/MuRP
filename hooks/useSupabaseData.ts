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
  Label,
  ComplianceRecord,
  User,
  RequisitionPriority,
  RequisitionRequestType,
  MaterialRequirement,
} from '../types';
import { mockBOMs, mockUsers } from '../types';
import { isE2ETesting } from '../lib/auth/guards';

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
// GENERIC DATA FETCHING HOOK
// ============================================================================

/**
 * Generic data fetching hook with race condition handling
 * Context7 Pattern: Reusable fetch logic extracted from repetitive code
 * 
 * @param url - API endpoint or null to skip fetching
 * @returns Fetched data with loading and error states
 */
export function useData<T = unknown>(url: string | null): { data: T | null; loading: boolean; error: Error | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }

    let ignore = false;
    setLoading(true);
    setError(null);

    fetch(url)
      .then(response => response.json())
      .then(json => {
        if (!ignore) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!ignore) {
          setError(err instanceof Error ? err : new Error('Fetch failed'));
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [url]);

  return { data, loading, error };
}

// ============================================================================
// SCHEMA CACHE ERROR HANDLING
// ============================================================================

/**
 * Check if error is due to Supabase schema cache being stale
 * PGRST205 = Could not find table in schema cache
 * 42P01 = Undefined table (PostgreSQL error)
 * 
 * When migrations are pushed, the REST API cache can take a few seconds to update.
 * This function helps identify when to retry or return empty data gracefully.
 */
const isSchemaCacheError = (err: any): boolean => {
  if (!err) return false;
  const errorStr = `${err.code ?? ''} ${err.message ?? ''} ${err.details ?? ''} ${err.hint ?? ''}`.toLowerCase();
  return (
    err.code === 'PGRST205' ||  // Table not found in schema cache
    err.code === '42P01' ||      // PostgreSQL: undefined table
    errorStr.includes('could not find the table') ||
    errorStr.includes('schema cache')
  );
};

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

      // CRITICAL FIX: Fetch ALL inventory items using pagination
      // Supabase PostgREST has max-rows header that can override .limit()
      // Solution: Use range-based pagination to guarantee all items
      let allItems: any[] = [];
      let rangeStart = 0;
      const rangeSize = 1000; // Fetch in chunks of 1000
      let hasMore = true;

      console.log('[useSupabaseInventory] Starting pagination fetch...');

      while (hasMore) {
        const { data: chunk, error: fetchError, count } = await supabase
          .from('inventory_items')
          .select('*', { count: 'exact' })
          .range(rangeStart, rangeStart + rangeSize - 1)
          .order('name');

        if (fetchError) throw fetchError;

        if (chunk && chunk.length > 0) {
          allItems = allItems.concat(chunk);
          rangeStart += rangeSize;
          hasMore = chunk.length === rangeSize; // Continue if we got a full chunk
          console.log(`[useSupabaseInventory] Fetched ${chunk.length} items (total so far: ${allItems.length})`);
        } else {
          hasMore = false;
        }
      }

      console.log(`[useSupabaseInventory] ✅ FINAL COUNT: ${allItems.length} inventory items fetched`);
      const items = allItems;

      // Transform from snake_case to camelCase (including enhanced fields from migration 003)
      const transformed: InventoryItem[] = (items || []).map((item: any) => {
        const customFields = item.custom_fields || {};
        
        // Check all possible dropship field name variations from Finale
        const dropshipRaw =
          customFields.dropship ??
          customFields.Dropship ??
          customFields.Dropshipped ??
          customFields.dropshipped ??
          customFields.drop_ship ??
          customFields.drop_shipped ??
          customFields.Drop_Ship ??
          customFields.Drop_Shipped ??
          customFields.dropShip ??
          customFields.dropShipped ??
          customFields['Drop Ship'] ??
          customFields['Drop Shipped'] ??
          customFields['drop ship'] ??
          customFields['drop shipped'];

        const isDropship = (() => {
          if (typeof dropshipRaw === 'boolean') return dropshipRaw;
          if (typeof dropshipRaw === 'string') {
            const val = dropshipRaw.trim().toLowerCase();
            return ['true', 'yes', 'y', '1', 'drop ship', 'dropship', 'dropped', 'dropshipped', 'drop shipped'].includes(val);
          }
          if (typeof dropshipRaw === 'number') return dropshipRaw === 1 || dropshipRaw === true;
          return false;
        })();

        // Debug: Log items with dropship flag
        if (isDropship) {
          console.log(`[useSupabaseInventory] Dropship detected - SKU: ${item.sku}, raw value:`, dropshipRaw);
        }

        return {
          sku: item.sku,
          name: item.name,
          category: item.category,
          stock: item.stock,
          onOrder: item.on_order,
          reorderPoint: item.reorder_point,
          vendorId: item.vendor_id,
          moq: item.moq,
          safetyStock: item.safety_stock,
          leadTimeDays: item.lead_time_days,
          // Enhanced fields
          description: item.description,
          status: item.status,
          unitCost: item.unit_cost,
          unitPrice: item.unit_price,
          warehouseLocation: item.warehouse_location,
          binLocation: item.bin_location,
          salesVelocity: item.sales_velocity_consolidated,
          sales30Days: item.sales_last_30_days,
          sales60Days: item.sales_last_60_days,
          sales90Days: item.sales_last_90_days,
          dataSource: item.data_source,
          lastSyncAt: item.last_sync_at,
          syncStatus: item.sync_status,
          isDropship,
        };
      });

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
          sales30Days: item.sales_last_30_days,
          sales60Days: item.sales_last_60_days,
          sales90Days: item.sales_last_90_days,
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
        // Automation fields (from migration 023)
        autoPoEnabled: row.auto_po_enabled || false,
        autoPoThreshold: row.auto_po_threshold || 'critical',
        autoSendEmail: row.auto_send_email || false,
        isRecurringVendor: row.is_recurring_vendor || false,
        automationNotes: row.automation_notes || '',
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
    if (isE2ETesting()) {
      setData(mockBOMs);
      setLoading(false);
      setError(null);
      return;
    }

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
        registrations: bom.registrations as any || [],
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
    if (isE2ETesting()) {
      setData(mockBOMs);
      setLoading(false);
      return;
    }

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
 * Fetch BOM revision history
 */
export function useBomRevisions(bomId: string | null): UseSupabaseDataResult<any> {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchRevisions = useCallback(async () => {
    if (!bomId) {
      setData([]);
      return;
    }

    try {
      setLoading(true);
      const { data: revisions, error } = await supabase
        .from('bom_revisions')
        .select('*')
        .eq('bom_id', bomId)
        .order('revision_number', { ascending: false });

      if (error) throw error;

      setData(revisions.map(rev => ({
        id: rev.id,
        bomId: rev.bom_id,
        revisionNumber: rev.revision_number,
        status: rev.status || 'approved',
        summary: rev.summary,
        changeSummary: rev.change_summary,
        snapshot: rev.snapshot,
        createdAt: rev.created_at,
        createdBy: rev.created_by,
        approvedBy: rev.approved_by,
        approvedAt: rev.approved_at,
        revertedFromRevisionId: rev.reverted_from_revision_id,
        approvalNotes: rev.approval_notes,
      })));
    } catch (err) {
      console.error('[useBomRevisions] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch revisions'));
    } finally {
      setLoading(false);
    }
  }, [bomId]);

  useEffect(() => {
    fetchRevisions();
  }, [fetchRevisions]);

  return { data, loading, error, refetch: fetchRevisions };
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
const transformPurchaseOrderRecord = (po: any): PurchaseOrder => {
  const items = (po.purchase_order_items ?? []).map((item: any) => ({
    id: item.id,
    productId: item.product_id ?? undefined,
    sku: item.sku ?? item.product_id ?? '',
    description: item.description,
    name: item.description,
    quantity: item.qty_ordered,
    unitCost: Number(item.unit_cost ?? 0),
    lineTotal: Number(item.line_total ?? 0),
    dailyConsumption: item.daily_consumption ?? undefined,
    consumption30Day: item.consumption_30day ?? undefined,
    consumption60Day: item.consumption_60day ?? undefined,
    consumption90Day: item.consumption_90day ?? undefined,
    supplierLeadTime: item.supplier_lead_time ?? undefined,
    suggestedQty: item.suggested_qty ?? undefined,
    finaleMetadata: item.finale_metadata ?? undefined,
    price: Number(item.unit_cost ?? 0),
  }));

  const followUpCount =
    Array.isArray(po.vendor_followup_events) && po.vendor_followup_events.length > 0
      ? Number(po.vendor_followup_events[0]?.count ?? 0)
      : 0;

  return {
    id: po.id,
    orderId: po.order_id,
    vendorId: po.vendor_id ?? undefined,
    supplier: po.supplier,
    status: po.status,
    orderDate: po.order_date,
    estimatedReceiveDate: po.estimated_receive_date ?? undefined,
    expectedDate: po.estimated_receive_date ?? undefined,
    destination: po.destination ?? undefined,
    shipToFormatted: po.ship_to_formatted ?? undefined,
    shipments: po.shipments ?? undefined,
    total: Number(po.total ?? 0),
    taxableFeeFreight: po.taxable_discount_fee_freight ?? undefined,
    trackingLink: po.tracking_link ?? undefined,
    trackingNumber: po.tracking_number ?? undefined,
    trackingCarrier: po.tracking_carrier ?? undefined,
    trackingStatus: po.tracking_status ?? undefined,
    trackingLastCheckedAt: po.tracking_last_checked_at ?? undefined,
    trackingLastException: po.tracking_last_exception ?? undefined,
    trackingEstimatedDelivery: po.tracking_estimated_delivery ?? undefined,
    trackingEvents: po.tracking_events ?? [],
    estDaysOfStock: po.est_days_of_stock ?? undefined,
    dateOutOfStock: po.date_out_of_stock ?? undefined,
    fulfillment: po.fulfillment ?? undefined,
    allocation: po.allocation ?? undefined,
    internalNotes: po.internal_notes ?? undefined,
    recordLastUpdated: po.record_last_updated ?? undefined,
    autoGenerated: po.auto_generated ?? undefined,
    generationReason: po.generation_reason ?? undefined,
    vendorNotes: po.vendor_notes ?? undefined,
    notes: po.vendor_notes ?? undefined,
    emailDraft: po.email_draft ?? undefined,
    emailSent: po.email_sent ?? undefined,
    emailSentAt: po.email_sent_at ?? undefined,
    finaleSyncStatus: po.finale_sync_status ?? undefined,
    lastSyncedAt: po.last_synced_at ?? undefined,
    createdAt: po.created_at,
    approvedAt: po.approved_at ?? undefined,
    sentAt: po.sent_at ?? undefined,
    requisitionIds: po.requisition_ids ?? [],
    items,
    followUpRequired: po.follow_up_required ?? true,
    lastFollowUpStage: po.last_follow_up_stage ?? 0,
    lastFollowUpSentAt: po.last_follow_up_sent_at ?? undefined,
    followUpStatus: po.follow_up_status ?? null,
    vendorResponseStatus: po.vendor_response_status ?? po.follow_up_status ?? null,
    vendorResponseReceivedAt: po.vendor_response_received_at ?? null,
    vendorResponseEmailId: po.vendor_response_email_id ?? null,
    vendorResponseThreadId: po.vendor_response_thread_id ?? null,
    vendorResponseSummary: po.vendor_response_summary ?? null,
    verificationRequired: po.verification_required ?? undefined,
    verifiedBy: po.verified_by ?? null,
    verifiedAt: po.verified_at ?? null,
    verificationNotes: po.verification_notes ?? null,
    escalationLevel: po.escalation_level ?? 0,
    nextFollowUpDueAt: po.next_follow_up_due_at ?? null,
    followUpCount,
    invoiceDetectedAt: po.invoice_detected_at ?? undefined,
    invoiceGmailMessageId: po.invoice_gmail_message_id ?? null,
    invoiceSummary: po.invoice_summary ?? null,
  };
};

export function useSupabasePurchaseOrders(): UseSupabaseDataResult<PurchaseOrder> {
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  const fetchPurchaseOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch PO headers with line items from separate table
      const { data: pos, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('*, purchase_order_items(*)')
        .order('order_date', { ascending: false });

      if (fetchError) throw fetchError;

      console.log('[useSupabasePurchaseOrders] Raw data from Supabase:', {
        count: pos?.length || 0,
        statuses: [...new Set(pos?.map(p => p.status) || [])],
        sampleIds: pos?.slice(0, 3).map(p => p.order_id || p.id) || [],
      });

      setData((pos || []).map(transformPurchaseOrderRecord));
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

      // Fetch PO with line items - try both order_id and UUID
      const { data: po, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('*, purchase_order_items(*)')
        .or(`order_id.eq.${id},id.eq.${id}`)
        .single();

      if (fetchError) throw fetchError;

      setData(po ? transformPurchaseOrderRecord(po) : null);
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

  const mapMaterialRequirement = useCallback((req: any): MaterialRequirement => ({
    sku: req.sku,
    name: req.name,
    requiredQuantity: req.required_quantity,
    availableQuantity: req.available_quantity,
    shortfall: typeof req.shortfall === 'number'
      ? req.shortfall
      : Math.max(
          Number(req.required_quantity ?? 0) - Number(req.available_quantity ?? 0),
          0
        ),
    vendorId: req.vendor_id,
    vendorName: req.vendor_name,
    leadTimeDays: req.lead_time_days,
    estimatedCost: req.estimated_cost,
    sourced: req.sourced,
    sourcedAt: req.sourced_at,
    notes: req.notes,
  }), []);

  const transformBuildOrders = useCallback((
    orders: any[] | null,
    options?: {
      includeMaterials?: boolean;
      materialMap?: Record<string, any[]>;
    }
  ): BuildOrder[] => {
    const includeMaterials = options?.includeMaterials ?? true;
    const materialMap = options?.materialMap ?? null;

    return (orders || []).map((order: any) => {
      const embedded = includeMaterials ? order.build_order_material_requirements : null;
      const fallbackMaterials = materialMap ? materialMap[order.id] ?? [] : [];
      const materialRecords = Array.isArray(embedded) ? embedded : fallbackMaterials;

      return {
        id: order.id,
        finishedSku: order.finished_sku,
        name: order.name,
        quantity: order.quantity,
        status: order.status as 'Pending' | 'In Progress' | 'Completed',
        createdAt: order.created_at,
        scheduledDate: order.scheduled_date,
        dueDate: order.due_date,
        calendarEventId: order.calendar_event_id,
        notes: order.notes,
        estimatedDurationHours: order.estimated_duration_hours,
        assignedUserId: order.assigned_user_id,
        materialRequirements: Array.isArray(materialRecords)
          ? materialRecords.map(mapMaterialRequirement)
          : [],
      };
    });
  }, [mapMaterialRequirement]);

  const isMaterialRequirementsMissing = (err: any) => {
    if (!err) return false;
    const targets = ['build_order_material_requirements', 'material_requirements'];
    const haystack = `${err.message ?? ''} ${err.details ?? ''} ${err.hint ?? ''}`.toLowerCase();
    // 42P01 = undefined table, PGRST200 = relationship not found
    return err.code === '42P01' || err.code === 'PGRST200' || targets.some((token) => haystack.includes(token));
  };

  const fetchBuildOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // First, try to fetch build orders with material requirements relation
      const { data: orders, error: fetchError } = await supabase
        .from('build_orders')
        .select('*, build_order_material_requirements(*)')
        .order('created_at', { ascending: false });

      if (fetchError) {
        if (isMaterialRequirementsMissing(fetchError)) {
          console.warn('[useSupabaseBuildOrders] Material requirements relation unavailable, falling back to manual material fetch.', fetchError);

          const { data: fallbackOrders, error: ordersError } = await supabase
            .from('build_orders')
            .select('*')
            .order('created_at', { ascending: false });

          if (ordersError) throw ordersError;

          let materialMap: Record<string, any[]> | undefined;
          if (fallbackOrders && fallbackOrders.length > 0) {
            const orderIds = fallbackOrders
              .map((order) => order.id)
              .filter((id): id is string => Boolean(id));

            if (orderIds.length > 0) {
              const { data: requirements, error: requirementsError } = await supabase
                .from('build_order_material_requirements')
                .select('build_order_id, sku, name, required_quantity, available_quantity, shortfall, vendor_id, vendor_name, lead_time_days, estimated_cost, sourced, sourced_at, notes')
                .in('build_order_id', orderIds);

              if (requirementsError && requirementsError.code !== 'PGRST116') {
                console.warn('[useSupabaseBuildOrders] Manual material requirements fetch failed, continuing without materials.', requirementsError);
              } else if (requirements) {
                materialMap = requirements.reduce((acc, req) => {
                  if (!req.build_order_id) return acc;
                  if (!acc[req.build_order_id]) {
                    acc[req.build_order_id] = [];
                  }
                  acc[req.build_order_id].push(req);
                  return acc;
                }, {} as Record<string, any[]>);
              }
            }
          }

          setData(transformBuildOrders(fallbackOrders, {
            includeMaterials: false,
            materialMap,
          }));
          return;
        }

        throw fetchError;
      }

      setData(transformBuildOrders(orders));
    } catch (err) {
      console.error('[useSupabaseBuildOrders] Error:', err);
      
      // If it's a schema cache error, return empty array and log warning instead of error
      if (isSchemaCacheError(err)) {
        console.warn('[useSupabaseBuildOrders] Schema cache stale, will retry on next fetch');
        setData([]);
        setError(null);
      } else {
        setError(err instanceof Error ? err : new Error('Failed to fetch build orders'));
      }
    } finally {
      setLoading(false);
    }
  }, [transformBuildOrders]);

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
        requesterId: req.requester_id ?? null,
        department: req.department,
        status: (req.status ?? 'Pending') as InternalRequisition['status'],
        createdAt: req.created_at,
        items: req.items as any,
        notes: req.notes,
        source: (req.source ?? 'Manual') as 'Manual' | 'System',
        requestType: (req.request_type ?? 'consumable') as RequisitionRequestType,
        priority: (req.priority ?? 'medium') as RequisitionPriority,
        needByDate: req.need_by_date ?? null,
        alertOnly: req.alert_only ?? false,
        autoPo: req.auto_po ?? false,
        notifyRequester: req.notify_requester ?? true,
        context: req.context ?? null,
        metadata: req.metadata ?? {},
        managerApprovedBy: req.manager_approved_by ?? null,
        managerApprovedAt: req.manager_approved_at ?? null,
        opsApprovalRequired: req.ops_approval_required ?? false,
        opsApprovedBy: req.ops_approved_by ?? null,
        opsApprovedAt: req.ops_approved_at ?? null,
        forwardedToPurchasingAt: req.forwarded_to_purchasing_at ?? null,
      }));

      setData(transformed);
    } catch (err) {
      console.error('[useSupabaseRequisitions] Error:', err);
      
      // If it's a schema cache error, return empty array and log warning instead of error
      if (isSchemaCacheError(err)) {
        console.warn('[useSupabaseRequisitions] Schema cache stale, will retry on next fetch');
        setData([]);
        setError(null);
      } else {
        setError(err instanceof Error ? err : new Error('Failed to fetch requisitions'));
      }
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
// USER PROFILES
// ============================================================================

const transformProfileRow = (row: any): User => ({
  id: row.id,
  name: row.full_name ?? row.email,
  email: row.email,
  role: row.role,
  department: row.department,
  onboardingComplete: row.onboarding_complete,
  agreements: row.agreements ?? {},
  regulatoryAgreement: row.agreements?.regulatory,
});

export function useSupabaseUserProfiles(): UseSupabaseDataResult<User> {
  const [data, setData] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProfiles = useCallback(async () => {
    if (isE2ETesting()) {
      setData(mockUsers);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { data: rows, error: fetchError } = await supabase
        .from('user_profiles')
        .select('*')
        .order('full_name');
      if (fetchError) throw fetchError;
      setData((rows ?? []).map(transformProfileRow));
    } catch (err) {
      console.error('[useSupabaseUserProfiles] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch user profiles'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  return { data, loading, error, refetch: fetchProfiles };
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

// ============================================================================
// LABELS HOOKS
// ============================================================================

/**
 * Fetch and subscribe to labels for a specific BOM
 * Real-time updates when labels change in database
 */
export function useSupabaseLabels(bomId?: string): UseSupabaseDataResult<Label> {
  const [data, setData] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  const fetchLabels = useCallback(async () => {
    if (!bomId) {
      setData([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: labels, error: fetchError } = await supabase
        .from('labels')
        .select('*')
        .eq('bom_id', bomId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Transform from snake_case to camelCase
      const transformed: Label[] = (labels || []).map((label: any) => ({
        id: label.id,
        fileName: label.file_name,
        fileUrl: label.file_url,
        fileSize: label.file_size,
        mimeType: label.mime_type,
        barcode: label.barcode,
        productName: label.product_name,
        netWeight: label.net_weight,
        revision: label.revision,
        bomId: label.bom_id,
        scanStatus: label.scan_status,
        scanCompletedAt: label.scan_completed_at,
        scanError: label.scan_error,
        extractedData: label.extracted_data,
        ingredientComparison: label.ingredient_comparison,
        verified: label.verified,
        verifiedBy: label.verified_by,
        verifiedAt: label.verified_at,
        fileType: label.file_type,
        status: label.status,
        approvedBy: label.approved_by,
        approvedDate: label.approved_date,
        notes: label.notes,
        uploadedBy: label.uploaded_by,
        createdAt: label.created_at,
        updatedAt: label.updated_at,
      }));

      setData(transformed);
    } catch (err) {
      console.error('[useSupabaseLabels] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch labels'));
    } finally {
      setLoading(false);
    }
  }, [bomId]);

  useEffect(() => {
    if (!bomId) {
      setData([]);
      setLoading(false);
      return;
    }

    // Initial fetch
    fetchLabels();

    // Set up real-time subscription
    const newChannel = supabase
      .channel('labels-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'labels',
          filter: `bom_id=eq.${bomId}`,
        },
        (payload) => {
          console.log('[useSupabaseLabels] Real-time update:', payload);
          fetchLabels();
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
  }, [fetchLabels, bomId]);

  return { data, loading, error, refetch: fetchLabels };
}

// ============================================================================
// COMPLIANCE RECORDS HOOKS
// ============================================================================

/**
 * Fetch and subscribe to compliance records for a specific BOM
 * Real-time updates when compliance records change in database
 */
export function useSupabaseComplianceRecords(bomId?: string): UseSupabaseDataResult<ComplianceRecord> {
  const [data, setData] = useState<ComplianceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  const fetchComplianceRecords = useCallback(async () => {
    if (!bomId) {
      setData([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: records, error: fetchError } = await supabase
        .from('compliance_records')
        .select('*')
        .eq('bom_id', bomId)
        .order('expiration_date', { ascending: true });

      if (fetchError) throw fetchError;

      // Transform from snake_case to camelCase
      const transformed: ComplianceRecord[] = (records || []).map((record: any) => ({
        id: record.id,
        bomId: record.bom_id,
        labelId: record.label_id,
        complianceType: record.compliance_type,
        category: record.category,
        issuingAuthority: record.issuing_authority,
        stateCode: record.state_code,
        stateName: record.state_name,
        registrationNumber: record.registration_number,
        licenseNumber: record.license_number,
        registeredDate: record.registered_date,
        effectiveDate: record.effective_date,
        expirationDate: record.expiration_date,
        renewalDate: record.renewal_date,
        lastRenewedDate: record.last_renewed_date,
        status: record.status,
        daysUntilExpiration: record.days_until_expiration,
        registrationFee: record.registration_fee,
        renewalFee: record.renewal_fee,
        lateFee: record.late_fee,
        currency: record.currency,
        paymentStatus: record.payment_status,
        certificateUrl: record.certificate_url,
        certificateFileName: record.certificate_file_name,
        certificateFileSize: record.certificate_file_size,
        additionalDocuments: record.additional_documents,
        dueSoonAlertSent: record.due_soon_alert_sent,
        urgentAlertSent: record.urgent_alert_sent,
        expirationAlertSent: record.expiration_alert_sent,
        alertEmailAddresses: record.alert_email_addresses,
        requirements: record.requirements,
        restrictions: record.restrictions,
        conditions: record.conditions,
        contactPerson: record.contact_person,
        contactEmail: record.contact_email,
        contactPhone: record.contact_phone,
        authorityWebsite: record.authority_website,
        assignedTo: record.assigned_to,
        priority: record.priority,
        notes: record.notes,
        internalNotes: record.internal_notes,
        createdBy: record.created_by,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
        lastVerifiedAt: record.last_verified_at,
        lastVerifiedBy: record.last_verified_by,
      }));

      setData(transformed);
    } catch (err) {
      console.error('[useSupabaseComplianceRecords] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch compliance records'));
    } finally {
      setLoading(false);
    }
  }, [bomId]);

  useEffect(() => {
    if (!bomId) {
      setData([]);
      setLoading(false);
      return;
    }

    // Initial fetch
    fetchComplianceRecords();

    // Set up real-time subscription
    const newChannel = supabase
      .channel('compliance-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'compliance_records',
          filter: `bom_id=eq.${bomId}`,
        },
        (payload) => {
          console.log('[useSupabaseComplianceRecords] Real-time update:', payload);
          fetchComplianceRecords();
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
  }, [fetchComplianceRecords, bomId]);

  return { data, loading, error, refetch: fetchComplianceRecords };
}

// ============================================================================
// FINALE PURCHASE ORDERS HOOK
// ============================================================================

/**
 * Fetch Finale Purchase Orders from finale_purchase_orders table
 * Filters to show only non-completed POs (DRAFT, SUBMITTED, PARTIALLY_RECEIVED)
 * These are the "current" POs that need attention
 */
export function useSupabaseFinalePurchaseOrders(options?: { includeCompleted?: boolean }): UseSupabaseDataResult<any> {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  const fetchFinalePOs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('finale_purchase_orders')
        .select('*')
        .order('order_date', { ascending: false });

      // Show all POs - filtering will be done on frontend
      // This allows users to see and filter by all statuses including committed
      // No backend filtering by status

      const { data: pos, error: fetchError } = await query.limit(500);

      if (fetchError) throw fetchError;

      console.log('[useSupabaseFinalePurchaseOrders] Fetched POs:', pos?.length || 0);
      if (pos && pos.length > 0) {
        console.log('[useSupabaseFinalePurchaseOrders] Sample PO statuses:', 
          [...new Set(pos.slice(0, 10).map(p => p.status))]);
      }

      // Transform database snake_case to camelCase for frontend
      const transformed = (pos || []).map((po: any) => ({
        id: po.id,
        finaleOrderUrl: po.finale_order_url,
        orderId: po.order_id,
        orderType: po.order_type,
        status: po.status,
        vendorId: po.vendor_id,
        vendorUrl: po.vendor_url,
        vendorName: po.vendor_name,
        facilityUrl: po.facility_url,
        facilityId: po.facility_id,
        orderDate: po.order_date,
        expectedDate: po.expected_date,
        receivedDate: po.received_date,
        subtotal: po.subtotal,
        tax: po.tax,
        shipping: po.shipping,
        total: po.total,
        publicNotes: po.public_notes,
        privateNotes: po.private_notes,
        lineItems: po.line_items || [],
        lineCount: po.line_count,
        totalQuantity: po.total_quantity,
        deliveryStatus: po.delivery_status,
        finaleLastModified: po.finale_last_modified,
        syncedAt: po.synced_at,
        createdAt: po.created_at,
        updatedAt: po.updated_at,
      }));

      setData(transformed);
      console.log(`[useSupabaseFinalePurchaseOrders] Loaded ${transformed.length} Finale POs`);
    } catch (err) {
      console.error('[useSupabaseFinalePurchaseOrders] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch Finale purchase orders'));
    } finally {
      setLoading(false);
    }
  }, [options?.includeCompleted]);

  useEffect(() => {
    // Initial fetch
    fetchFinalePOs();

    // Set up real-time subscription
    const newChannel = supabase
      .channel('finale-po-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'finale_purchase_orders',
        },
        (payload) => {
          console.log('[useSupabaseFinalePurchaseOrders] Real-time update:', payload);
          fetchFinalePOs();
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
  }, [fetchFinalePOs]);

  return { data, loading, error, refetch: fetchFinalePOs };
}

/**
 * Fetch velocity/usage data for inventory items
 * Returns recent consumption rates for forecasting
 */
export function useSupabaseVelocityData(): UseSupabaseDataResult<any> {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchVelocityData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to fetch from mrp_velocity_analysis view
      const { data: velocityData, error: fetchError } = await supabase
        .from('mrp_velocity_analysis')
        .select('*')
        .limit(1000);

      if (fetchError) {
        // View might not exist, try direct from finale_stock_history
        console.warn('[useSupabaseVelocityData] View not available, trying stock history');
        
        const { data: historyData, error: historyError } = await supabase
          .from('finale_stock_history')
          .select('*')
          .order('recorded_at', { ascending: false })
          .limit(1000);

        if (historyError) throw historyError;
        setData(historyData || []);
      } else {
        setData(velocityData || []);
      }

      console.log(`[useSupabaseVelocityData] Loaded ${data.length} velocity records`);
    } catch (err) {
      console.error('[useSupabaseVelocityData] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch velocity data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVelocityData();
  }, [fetchVelocityData]);

  return { data, loading, error, refetch: fetchVelocityData };
}
