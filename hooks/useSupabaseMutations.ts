// @ts-nocheck
/**
 * Supabase Data Mutations
 * 
 * Helper functions for creating, updating, and deleting records in Supabase
 * These are used by App.tsx to replace the mock data mutations
 */

import { supabase } from '../lib/supabase/client';
import type {
  InventoryItem,
  Vendor,
  BillOfMaterials,
  PurchaseOrder,
  BuildOrder,
  InternalRequisition,
} from '../types';

// ============================================================================
// PURCHASE ORDERS
// ============================================================================

export async function createPurchaseOrder(po: PurchaseOrder): Promise<{ success: boolean; error?: string }> {
  try {
    // Map UI status to database status
    const statusMap: Record<'Pending' | 'Submitted' | 'Fulfilled', string> = {
      'Pending': 'draft',
      'Submitted': 'sent',
      'Fulfilled': 'received'
    };

    // 1. Lookup vendor name
    const { data: vendor } = await supabase
      .from('vendors')
      .select('name')
      .eq('id', po.vendorId)
      .single();

    // 2. Insert PO header
    const { data: newPO, error: poError } = await supabase
      .from('purchase_orders')
      .insert({
        order_id: po.id, // Use the ID from UI as the order_id (e.g., "PO-20251117-001")
        vendor_id: po.vendorId,
        supplier_name: vendor?.name || 'Unknown Vendor',
        status: statusMap[po.status] || 'draft',
        order_date: po.createdAt,
        expected_date: po.expectedDate,
        internal_notes: po.notes,
        requisition_ids: po.requisitionIds || [],
        source: 'manual',
        record_created: new Date().toISOString(),
      } as any)
      .select('id')
      .single();

    if (poError) throw poError;

    // 3. Insert line items
    if (newPO && po.items && po.items.length > 0) {
      const lineItems = po.items.map((item, idx) => ({
        po_id: newPO.id,
        inventory_sku: item.sku,
        item_name: item.name,
        quantity_ordered: item.quantity,
        unit_cost: item.price || 0,
        line_number: idx + 1,
        line_status: 'pending',
      }));

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(lineItems);

      if (itemsError) throw itemsError;
    }

    return { success: true };
  } catch (error) {
    console.error('[createPurchaseOrder] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create PO' };
  }
}

export async function updatePurchaseOrderStatus(
  id: string,
  status: 'Pending' | 'Submitted' | 'Fulfilled'
): Promise<{ success: boolean; error?: string }> {
  try {
    // Map UI status to database status
    const statusMap: Record<'Pending' | 'Submitted' | 'Fulfilled', string> = {
      'Pending': 'draft',
      'Submitted': 'sent',
      'Fulfilled': 'received'
    };

    const { error } = await supabase
      .from('purchase_orders')
      .update({
        status: statusMap[status] || 'draft',
        record_last_updated: new Date().toISOString()
      } as any)
      .or(`order_id.eq.${id},id.eq.${id}`);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('[updatePurchaseOrderStatus] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update PO' };
  }
}

// ============================================================================
// INVENTORY
// ============================================================================

export async function updateInventoryStock(
  sku: string,
  stockDelta: number,
  onOrderDelta: number = 0
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get current item
    const { data: item, error: fetchError } = await supabase
      .from('inventory_items')
      .select('stock, on_order')
      .eq('sku', sku)
      .single();

    if (fetchError) throw fetchError;
    if (!item) throw new Error(`Item ${sku} not found`);

    // Update with deltas
    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({
        stock: (item.stock as number) + stockDelta,
        on_order: (item.on_order as number) + onOrderDelta,
        updated_at: new Date().toISOString(),
      })
      .eq('sku', sku);

    if (updateError) throw updateError;
    return { success: true };
  } catch (error) {
    console.error('[updateInventoryStock] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update inventory' };
  }
}

export async function createInventoryItem(item: InventoryItem): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('inventory_items')
      .insert({
        sku: item.sku,
        name: item.name,
        category: item.category,
        stock: item.stock,
        on_order: item.onOrder,
        reorder_point: item.reorderPoint,
        vendor_id: item.vendorId,
        moq: item.moq,
      });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('[createInventoryItem] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create inventory item' };
  }
}

// ============================================================================
// BUILD ORDERS
// ============================================================================

export async function createBuildOrder(order: BuildOrder): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('build_orders')
      .insert({
        id: order.id,
        finished_sku: order.finishedSku,
        name: order.name,
        quantity: order.quantity,
        status: order.status,
        created_at: order.createdAt,
      });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('[createBuildOrder] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create build order' };
  }
}

export async function updateBuildOrderStatus(
  id: string,
  status: 'Pending' | 'In Progress' | 'Completed'
): Promise<{ success: boolean; error?: string }> {
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
    return { success: true };
  } catch (error) {
    console.error('[updateBuildOrderStatus] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update build order' };
  }
}

// ============================================================================
// BOMS
// ============================================================================

export async function updateBOM(bom: BillOfMaterials): Promise<{ success: boolean; error?: string }> {
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
    return { success: true };
  } catch (error) {
    console.error('[updateBOM] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update BOM' };
  }
}

export async function createBOM(bom: BillOfMaterials): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('boms')
      .insert({
        id: bom.id,
        finished_sku: bom.finishedSku,
        name: bom.name,
        components: bom.components as any,
        artwork: bom.artwork as any,
        packaging: bom.packaging as any,
        barcode: bom.barcode,
      });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('[createBOM] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create BOM' };
  }
}

// ============================================================================
// REQUISITIONS
// ============================================================================

export async function updateRequisitionStatus(
  id: string,
  status: 'Pending' | 'Approved' | 'Rejected' | 'Ordered' | 'Fulfilled'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('requisitions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('[updateRequisitionStatus] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update requisition' };
  }
}

export async function updateMultipleRequisitions(
  ids: string[],
  status: 'Pending' | 'Approved' | 'Rejected' | 'Ordered' | 'Fulfilled'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('requisitions')
      .update({ status, updated_at: new Date().toISOString() })
      .in('id', ids);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('[updateMultipleRequisitions] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update requisitions' };
  }
}

export async function createRequisition(req: InternalRequisition): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('requisitions')
      .insert({
        id: req.id,
        requested_by: req.requestedBy,
        department: req.department,
        status: req.status,
        created_at: req.createdAt,
        items: req.items as any,
        notes: req.notes,
      });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('[createRequisition] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create requisition' };
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

export async function batchUpdateInventory(
  updates: Array<{ sku: string; stockDelta: number; onOrderDelta?: number }>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Execute all updates
    const results = await Promise.all(
      updates.map(update => updateInventoryStock(update.sku, update.stockDelta, update.onOrderDelta || 0))
    );

    // Check if any failed
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      throw new Error(`${failed.length} inventory updates failed`);
    }

    return { success: true };
  } catch (error) {
    console.error('[batchUpdateInventory] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to batch update inventory' };
  }
}
