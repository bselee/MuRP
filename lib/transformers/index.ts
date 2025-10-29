/**
 * Data Transformers
 * Transform external data formats to internal database schema
 */

import type {
  ExternalInventoryItem,
  ExternalVendor,
  ExternalPurchaseOrder,
  FieldMapping,
  MappingContext,
} from '../connectors/types';
import type { Tables, Inserts } from '../supabase';

// =============================================================================
// INVENTORY TRANSFORMER
// =============================================================================

export function transformInventoryItem(
  external: ExternalInventoryItem,
  context: MappingContext
): Inserts<'inventory_items'> {
  const mapping = context.mapping.inventory || {};

  return {
    // Apply field mappings
    sku: applyMapping(external, 'sku', mapping) || external.sku || `ITEM-${external.externalId}`,
    name: applyMapping(external, 'name', mapping) || external.name,
    description: applyMapping(external, 'description', mapping) || external.description,
    quantity_on_hand: Number(applyMapping(external, 'quantityOnHand', mapping) || external.quantityOnHand || 0),
    reorder_point: Number(applyMapping(external, 'reorderPoint', mapping) || external.reorderPoint || 0),
    unit_cost: Number(applyMapping(external, 'unitCost', mapping) || external.unitCost || 0),
    category: applyMapping(external, 'category', mapping) || external.category,
    
    // Track external source
    source_system: context.sourceType,
    external_id: external.externalId,
    last_synced_at: new Date().toISOString(),
    
    // Store additional metadata
    metadata: {
      ...external.metadata,
      transformedAt: new Date().toISOString(),
      sourceType: context.sourceType,
    },
    
    // Defaults
    is_deleted: false,
  };
}

// =============================================================================
// VENDOR TRANSFORMER
// =============================================================================

export function transformVendor(
  external: ExternalVendor,
  context: MappingContext
): Inserts<'vendors'> {
  const mapping = context.mapping.vendors || {};

  return {
    name: applyMapping(external, 'name', mapping) || external.name,
    contact_name: applyMapping(external, 'contactName', mapping) || external.contactName,
    contact_email: applyMapping(external, 'contactEmail', mapping) || external.contactEmail,
    contact_phone: applyMapping(external, 'contactPhone', mapping) || external.contactPhone,
    address: applyMapping(external, 'address', mapping) || external.address,
    lead_time_days: Number(applyMapping(external, 'leadTimeDays', mapping) || external.leadTimeDays || 0),
    
    // Track external source
    source_system: context.sourceType,
    external_id: external.externalId,
    last_synced_at: new Date().toISOString(),
    
    // Store additional metadata
    metadata: {
      ...external.metadata,
      transformedAt: new Date().toISOString(),
      sourceType: context.sourceType,
    },
    
    is_deleted: false,
  };
}

// =============================================================================
// PURCHASE ORDER TRANSFORMER
// =============================================================================

export function transformPurchaseOrder(
  external: ExternalPurchaseOrder,
  context: MappingContext,
  vendorIdMap: Map<string, string>, // external_id -> internal UUID
  inventoryIdMap: Map<string, string> // external_id -> internal UUID
): Inserts<'purchase_orders'> | null {
  const mapping = context.mapping.purchaseOrders || {};

  // Map vendor external ID to internal UUID
  const vendorId = vendorIdMap.get(external.vendorExternalId);
  if (!vendorId) {
    console.warn(`[Transformer] Vendor not found for external ID: ${external.vendorExternalId}`);
    return null; // Skip this PO if vendor doesn't exist
  }

  // Transform line items
  const lineItems = external.lineItems.map(line => {
    const inventoryId = inventoryIdMap.get(line.inventoryExternalId);
    return {
      inventory_item_id: inventoryId || null,
      sku: line.sku,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      total_price: line.totalPrice,
      external_inventory_id: line.inventoryExternalId,
    };
  }).filter(item => item.inventory_item_id !== null); // Only include items that exist in our DB

  if (lineItems.length === 0) {
    console.warn(`[Transformer] No valid line items for PO: ${external.orderNumber}`);
    return null;
  }

  return {
    vendor_id: vendorId,
    order_number: applyMapping(external, 'orderNumber', mapping) || external.orderNumber,
    order_date: applyMapping(external, 'orderDate', mapping) || external.orderDate,
    expected_delivery_date: applyMapping(external, 'expectedDeliveryDate', mapping) || external.expectedDeliveryDate,
    status: normalizeStatus(external.status, 'purchase_order'),
    line_items: lineItems,
    total_amount: Number(applyMapping(external, 'totalAmount', mapping) || external.totalAmount || 0),
    
    // Track external source
    source_system: context.sourceType,
    external_id: external.externalId,
    last_synced_at: new Date().toISOString(),
    
    // Store additional metadata
    metadata: {
      ...external.metadata,
      transformedAt: new Date().toISOString(),
      sourceType: context.sourceType,
      originalStatus: external.status,
    },
    
    is_deleted: false,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Apply field mapping to get value from external object
 */
function applyMapping(
  external: any,
  internalField: string,
  mapping: Record<string, string>
): any {
  // Check if there's a custom mapping for this field
  const externalField = mapping[internalField];
  
  if (externalField) {
    // Navigate nested fields using dot notation (e.g., "address.street")
    return getNestedValue(external, externalField);
  }
  
  // No mapping, use direct field access
  return external[internalField];
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Normalize external status values to our internal status enums
 */
function normalizeStatus(externalStatus: string, entityType: 'purchase_order' | 'build_order'): string {
  const normalized = externalStatus.toLowerCase().replace(/[\s_-]/g, '');
  
  if (entityType === 'purchase_order') {
    // Map common PO statuses
    const statusMap: Record<string, string> = {
      'draft': 'draft',
      'pending': 'pending',
      'submitted': 'pending',
      'approved': 'approved',
      'ordered': 'ordered',
      'received': 'received',
      'partiallyreceived': 'partially_received',
      'cancelled': 'cancelled',
      'closed': 'completed',
      'completed': 'completed',
    };
    
    return statusMap[normalized] || 'pending';
  }
  
  // Build orders
  const buildStatusMap: Record<string, string> = {
    'queued': 'queued',
    'pending': 'queued',
    'inprogress': 'in_progress',
    'started': 'in_progress',
    'completed': 'completed',
    'cancelled': 'cancelled',
  };
  
  return buildStatusMap[normalized] || 'queued';
}

// =============================================================================
// BATCH TRANSFORMATION
// =============================================================================

export interface TransformResult<T> {
  success: T[];
  failed: Array<{ item: any; error: string }>;
}

/**
 * Transform multiple inventory items in batch
 */
export function transformInventoryBatch(
  externalItems: ExternalInventoryItem[],
  context: MappingContext
): TransformResult<Inserts<'inventory_items'>> {
  const success: Inserts<'inventory_items'>[] = [];
  const failed: Array<{ item: any; error: string }> = [];

  for (const item of externalItems) {
    try {
      const transformed = transformInventoryItem(item, context);
      success.push(transformed);
    } catch (error: any) {
      failed.push({
        item,
        error: error.message || 'Transformation failed',
      });
    }
  }

  return { success, failed };
}

/**
 * Transform multiple vendors in batch
 */
export function transformVendorBatch(
  externalVendors: ExternalVendor[],
  context: MappingContext
): TransformResult<Inserts<'vendors'>> {
  const success: Inserts<'vendors'>[] = [];
  const failed: Array<{ item: any; error: string }> = [];

  for (const vendor of externalVendors) {
    try {
      const transformed = transformVendor(vendor, context);
      success.push(transformed);
    } catch (error: any) {
      failed.push({
        item: vendor,
        error: error.message || 'Transformation failed',
      });
    }
  }

  return { success, failed };
}

/**
 * Transform multiple purchase orders in batch
 */
export function transformPurchaseOrderBatch(
  externalOrders: ExternalPurchaseOrder[],
  context: MappingContext,
  vendorIdMap: Map<string, string>,
  inventoryIdMap: Map<string, string>
): TransformResult<Inserts<'purchase_orders'>> {
  const success: Inserts<'purchase_orders'>[] = [];
  const failed: Array<{ item: any; error: string }> = [];

  for (const order of externalOrders) {
    try {
      const transformed = transformPurchaseOrder(order, context, vendorIdMap, inventoryIdMap);
      if (transformed) {
        success.push(transformed);
      } else {
        failed.push({
          item: order,
          error: 'Missing required relationships (vendor or inventory items)',
        });
      }
    } catch (error: any) {
      failed.push({
        item: order,
        error: error.message || 'Transformation failed',
      });
    }
  }

  return { success, failed };
}
