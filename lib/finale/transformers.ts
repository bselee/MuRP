/**
 * Data Transformation Utilities
 *
 * Transforms Finale Inventory API responses to TGF MRP application format
 *
 * Mapping Strategy:
 * - FinaleProduct → InventoryItem
 * - FinalePartyGroup (SUPPLIER) → Vendor
 * - FinalePurchaseOrder → PurchaseOrder
 * - FinaleAssembly → BillOfMaterials (partial)
 */

import type {
  FinaleProduct,
  FinalePartyGroup,
  FinalePurchaseOrder,
  FinaleAssembly,
} from './types';

import type {
  InventoryItem,
  Vendor,
  PurchaseOrder,
  PurchaseOrderItem,
  BillOfMaterials,
  BOMComponent,
} from '../../types';

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extract numeric ID from Finale resource URI
 * Example: "/buildasoilorganics/api/partyGroup/789" → "789"
 */
export function extractIdFromUri(uri: string | undefined): string {
  if (!uri) return 'unknown';

  const match = uri.match(/\/(\d+)$/);
  return match ? match[1] : 'unknown';
}

/**
 * Format Finale address object to single-line string
 */
export function formatAddress(address?: {
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}): string {
  if (!address) return '';

  const parts = [
    address.street1,
    address.street2,
    address.city,
    address.state,
    address.postalCode,
  ].filter(Boolean);

  return parts.join(', ');
}

/**
 * Map Finale product status to app category (fallback)
 */
export function categorizeProduct(finaleProduct: FinaleProduct): string {
  // Try category field first
  if (finaleProduct.category) {
    return finaleProduct.category;
  }

  // Fallback to product type
  const typeMap: Record<string, string> = {
    'SIMPLE': 'Products',
    'ASSEMBLY': 'Finished Goods',
    'COMPONENT': 'Components',
  };

  return typeMap[finaleProduct.productType] || 'Uncategorized';
}

// =============================================================================
// Inventory Transformations
// =============================================================================

/**
 * Transform Finale Product to TGF MRP Inventory Item
 */
export function transformFinaleProductToInventoryItem(
  finaleProduct: FinaleProduct
): InventoryItem {
  return {
    sku: finaleProduct.sku,
    name: finaleProduct.name,
    category: categorizeProduct(finaleProduct),
    stock: finaleProduct.unitsInStock || 0,
    onOrder: finaleProduct.unitsOnOrder || 0,
    reorderPoint: finaleProduct.reorderPoint || 0,
    vendorId: extractIdFromUri(finaleProduct.defaultSupplier),
    moq: finaleProduct.moq,
  };
}

/**
 * Transform array of Finale Products to Inventory Items
 */
export function transformFinaleProductsToInventory(
  finaleProducts: FinaleProduct[]
): InventoryItem[] {
  return finaleProducts.map(transformFinaleProductToInventoryItem);
}

// =============================================================================
// Vendor Transformations
// =============================================================================

/**
 * Transform Finale PartyGroup (Supplier) to TGF MRP Vendor
 */
export function transformFinaleVendorToVendor(
  finaleVendor: FinalePartyGroup
): Vendor {
  return {
    id: finaleVendor.id.toString(),
    name: finaleVendor.name,
    contactEmails: finaleVendor.email ? [finaleVendor.email] : [],
    phone: finaleVendor.phone || '',
    address: formatAddress(finaleVendor.address),
    website: finaleVendor.website || '',
    leadTimeDays: finaleVendor.leadTimeDays || 7,
  };
}

/**
 * Transform array of Finale Vendors to TGF MRP Vendors
 */
export function transformFinaleVendorsToVendors(
  finaleVendors: FinalePartyGroup[]
): Vendor[] {
  return finaleVendors.map(transformFinaleVendorToVendor);
}

// =============================================================================
// Purchase Order Transformations
// =============================================================================

/**
 * Map Finale PO status to TGF MRP PO status
 */
export function mapFinaleStatusToAppStatus(
  finaleStatus: FinalePurchaseOrder['status']
): PurchaseOrder['status'] {
  const statusMap: Record<FinalePurchaseOrder['status'], PurchaseOrder['status']> = {
    'DRAFT': 'Pending',
    'SUBMITTED': 'Submitted',
    'PARTIALLY_RECEIVED': 'Submitted',
    'RECEIVED': 'Fulfilled',
    'CANCELLED': 'Pending',
  };

  return statusMap[finaleStatus] || 'Pending';
}

/**
 * Transform Finale Purchase Order to TGF MRP Purchase Order
 */
export function transformFinalePOToPurchaseOrder(
  finalePO: FinalePurchaseOrder
): PurchaseOrder {
  const items: PurchaseOrderItem[] = finalePO.lineItems.map(lineItem => ({
    sku: lineItem.sku,
    name: lineItem.name,
    quantity: lineItem.quantity,
    price: lineItem.unitPrice,
  }));

  return {
    id: finalePO.orderNumber,
    vendorId: extractIdFromUri(finalePO.supplier),
    status: mapFinaleStatusToAppStatus(finalePO.status),
    createdAt: finalePO.orderDate,
    items,
    expectedDate: finalePO.expectedDate,
    notes: finalePO.notes || finalePO.internalNotes || '',
    requisitionIds: [], // Not available from Finale
  };
}

/**
 * Transform array of Finale POs to TGF MRP Purchase Orders
 */
export function transformFinalePOsToPurchaseOrders(
  finalePOs: FinalePurchaseOrder[]
): PurchaseOrder[] {
  return finalePOs.map(transformFinalePOToPurchaseOrder);
}

// =============================================================================
// Bill of Materials Transformations
// =============================================================================

/**
 * Transform Finale Assembly to TGF MRP Bill of Materials (partial)
 *
 * Note: Finale assemblies don't include packaging or artwork,
 * so we provide defaults for those fields.
 */
export function transformFinaleAssemblyToBOM(
  finaleAssembly: FinaleAssembly,
  finishedProduct?: FinaleProduct
): BillOfMaterials {
  const components: BOMComponent[] = finaleAssembly.components.map(component => ({
    sku: component.sku,
    name: component.name,
    quantity: component.quantity,
  }));

  // Generate a BOM ID from the product ID
  const bomId = `BOM-${extractIdFromUri(finaleAssembly.product)}`;

  // Try to get product name, fallback to "Unknown Product"
  const productName = finishedProduct?.name || 'Unknown Product';
  const productSku = finishedProduct?.sku || extractIdFromUri(finaleAssembly.product);

  return {
    id: bomId,
    finishedSku: productSku,
    name: productName,
    components,
    artwork: [], // Not available from Finale
    packaging: {
      bagType: 'Standard', // Default
      labelType: 'Standard', // Default
      specialInstructions: finaleAssembly.notes || '',
    },
    barcode: finishedProduct?.sku || undefined,
  };
}

/**
 * Transform array of Finale Assemblies to BOMs
 */
export function transformFinaleAssembliesToBOMs(
  finaleAssemblies: FinaleAssembly[],
  finaleProducts: FinaleProduct[] = []
): BillOfMaterials[] {
  return finaleAssemblies.map(assembly => {
    // Try to find the finished product
    const productId = extractIdFromUri(assembly.product);
    const finishedProduct = finaleProducts.find(p => p.id.toString() === productId);

    return transformFinaleAssemblyToBOM(assembly, finishedProduct);
  });
}

// =============================================================================
// Batch Transformation Utilities
// =============================================================================

/**
 * Transform complete Finale sync result to app data structures
 */
export interface TransformedFinaleData {
  inventory: InventoryItem[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
  boms: BillOfMaterials[];
}

export interface FinaleRawData {
  products: FinaleProduct[];
  vendors: FinalePartyGroup[];
  purchaseOrders: FinalePurchaseOrder[];
  assemblies?: FinaleAssembly[];
}

/**
 * Transform all Finale data at once
 */
export function transformFinaleData(rawData: FinaleRawData): TransformedFinaleData {
  return {
    inventory: transformFinaleProductsToInventory(rawData.products),
    vendors: transformFinaleVendorsToVendors(rawData.vendors),
    purchaseOrders: transformFinalePOsToPurchaseOrders(rawData.purchaseOrders),
    boms: rawData.assemblies
      ? transformFinaleAssembliesToBOMs(rawData.assemblies, rawData.products)
      : [],
  };
}

// =============================================================================
// Validation Utilities
// =============================================================================

/**
 * Validate that transformed data meets app requirements
 */
export function validateInventoryItem(item: InventoryItem): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!item.sku || item.sku.trim() === '') {
    errors.push('SKU is required');
  }

  if (!item.name || item.name.trim() === '') {
    errors.push('Name is required');
  }

  if (item.stock < 0) {
    errors.push('Stock cannot be negative');
  }

  if (item.onOrder < 0) {
    errors.push('On Order cannot be negative');
  }

  if (item.reorderPoint < 0) {
    errors.push('Reorder Point cannot be negative');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate vendor data
 */
export function validateVendor(vendor: Vendor): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!vendor.id || vendor.id.trim() === '') {
    errors.push('Vendor ID is required');
  }

  if (!vendor.name || vendor.name.trim() === '') {
    errors.push('Vendor name is required');
  }

  if (vendor.leadTimeDays < 0) {
    errors.push('Lead time cannot be negative');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate purchase order data
 */
export function validatePurchaseOrder(po: PurchaseOrder): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!po.id || po.id.trim() === '') {
    errors.push('PO ID is required');
  }

  if (!po.vendorId || po.vendorId.trim() === '') {
    errors.push('Vendor ID is required');
  }

  if (!po.items || po.items.length === 0) {
    errors.push('PO must have at least one item');
  }

  po.items.forEach((item, index) => {
    if (!item.sku) {
      errors.push(`Item ${index + 1}: SKU is required`);
    }
    if (item.quantity <= 0) {
      errors.push(`Item ${index + 1}: Quantity must be positive`);
    }
    if (item.price < 0) {
      errors.push(`Item ${index + 1}: Price cannot be negative`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// Export All
// =============================================================================

export default {
  // Utility functions
  extractIdFromUri,
  formatAddress,
  categorizeProduct,

  // Individual transformations
  transformFinaleProductToInventoryItem,
  transformFinaleVendorToVendor,
  transformFinalePOToPurchaseOrder,
  transformFinaleAssemblyToBOM,

  // Batch transformations
  transformFinaleProductsToInventory,
  transformFinaleVendorsToVendors,
  transformFinalePOsToPurchaseOrders,
  transformFinaleAssembliesToBOMs,
  transformFinaleData,

  // Status mapping
  mapFinaleStatusToAppStatus,

  // Validation
  validateInventoryItem,
  validateVendor,
  validatePurchaseOrder,
};
