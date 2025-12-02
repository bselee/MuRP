/**
 * Finale API Data Transformers
 * 
 * Utilities to transform Finale Inventory API responses into MuRP data structures.
 * Handles field mapping, data validation, and default values for seamless integration.
 * 
 * Transformation flow:
 * Finale Product → InventoryItem
 * Finale Supplier → Vendor
 * Finale PurchaseOrder → PurchaseOrder
 * Finale Product (with components) → BillOfMaterials
 */

import type {
  InventoryItem,
  Vendor,
  PurchaseOrder,
  PurchaseOrderItem,
  BillOfMaterials,
  BOMComponent,
  Packaging,
  Artwork
} from '../../types';

// ============================================================================
// FINALE API RESPONSE TYPES
// ============================================================================

export interface FinaleProduct {
  productId: string;
  sku?: string;
  productCode?: string;
  name: string;
  productName?: string;
  description?: string;
  category?: string;
  productCategory?: string;
  
  // Stock levels
  quantityOnHand?: number;
  stock?: number;
  unitsInStock?: number;
  quantityAvailable?: number;
  
  // Ordering
  reorderPoint?: number;
  reorderLevel?: number;
  reorderQuantity?: number;
  moq?: number;
  minimumOrderQuantity?: number;
  
  // Supplier
  supplierId?: string;
  supplier?: string;
  defaultSupplier?: string;
  
  // Pricing
  cost?: number;
  unitCost?: number;
  purchaseCost?: number;
  price?: number;
  salePrice?: number;
  
  // Components (for BOMs)
  components?: Array<{
    productId?: string;
    sku?: string;
    name?: string;
    quantity?: number;
    quantityRequired?: number;
  }>;
  
  // Metadata
  barcode?: string;
  upc?: string;
  status?: string;
  isActive?: boolean;
  lastUpdated?: string;
  modifiedDate?: string;
}

export interface FinaleSupplier {
  partyId: string;
  supplierId?: string;
  id?: string;
  name: string;
  organizationName?: string;
  
  // Contact info
  email?: string;
  emails?: string[];
  contactEmail?: string;
  phone?: string;
  phoneNumber?: string;
  
  // Address
  address?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  
  // Business details
  website?: string;
  url?: string;
  leadTimeDays?: number;
  leadTime?: number;
  terms?: string;
  paymentTerms?: string;
  
  // Metadata
  status?: string;
  isActive?: boolean;
}

export interface FinalePurchaseOrder {
  purchaseOrderId: string;
  id?: string;
  orderNumber?: string;
  poNumber?: string;
  
  // Supplier
  supplierId?: string;
  vendorId?: string;
  supplierName?: string;
  vendorName?: string;
  
  // Status
  status?: string;
  orderStatus?: string;
  
  // Dates
  orderDate?: string;
  createdDate?: string;
  expectedDate?: string;
  expectedDeliveryDate?: string;
  dueDate?: string;
  
  // Items
  items?: Array<{
    productId?: string;
    sku?: string;
    name?: string;
    productName?: string;
    quantity?: number;
    quantityOrdered?: number;
    unitCost?: number;
    price?: number;
    lineTotal?: number;
  }>;
  
  // Pricing
  totalAmount?: number;
  total?: number;
  subtotal?: number;
  
  // Notes
  notes?: string;
  comments?: string;
  internalNotes?: string;
}

// ============================================================================
// TRANSFORMATION FUNCTIONS
// ============================================================================

/**
 * Transform Finale product to MuRP InventoryItem
 */
export function transformFinaleProductToInventoryItem(
  product: FinaleProduct
): InventoryItem {
  // Extract SKU with fallback chain
  const sku = product.sku || product.productCode || product.productId || 'UNKNOWN';
  
  // Extract name with fallback
  const name = product.name || product.productName || 'Unnamed Product';
  
  // Extract category with fallback
  const category = product.category || product.productCategory || 'Uncategorized';
  
  // Extract stock with fallback chain
  const stock = 
    product.quantityOnHand ?? 
    product.stock ?? 
    product.unitsInStock ?? 
    product.quantityAvailable ?? 
    0;
  
  // Extract reorder point with fallback
  const reorderPoint = product.reorderPoint ?? product.reorderLevel ?? 10;
  
  // Extract vendor ID with fallback
  const vendorExternalId = 
    product.supplierId || 
    product.supplier || 
    product.defaultSupplier || 
    'UNKNOWN_VENDOR';

  const vendorName =
    (product as any).supplierName ||
    (product as any).vendorName ||
    (product as any).defaultSupplierName ||
    '';
  
  // Extract MOQ with fallback
  const moq = product.moq ?? product.minimumOrderQuantity ?? 1;
  
  return {
    sku,
    name,
    category,
    stock,
    onOrder: 0, // Finale doesn't provide this in product endpoint
    reorderPoint,
    vendorId: vendorExternalId,
    vendorName,
    vendorExternalId,
    moq,
  };
}

/**
 * Transform Finale supplier to MuRP Vendor
 */
export function transformFinaleSupplierToVendor(
  supplier: FinaleSupplier
): Vendor {
  // Extract ID with fallback
  const id = supplier.partyId || supplier.supplierId || supplier.id || 'UNKNOWN';
  
  // Extract name with fallback
  const name = supplier.name || supplier.organizationName || 'Unnamed Vendor';
  
  // Extract emails with fallback
  let contactEmails: string[] = [];
  if (supplier.emails && Array.isArray(supplier.emails)) {
    contactEmails = supplier.emails;
  } else if (supplier.email) {
    contactEmails = [supplier.email];
  } else if (supplier.contactEmail) {
    contactEmails = [supplier.contactEmail];
  }
  
  // Extract phone with fallback
  const phone = supplier.phone || supplier.phoneNumber || '';
  
  // Build address from components or use full address
  let address = supplier.address || '';
  if (!address && supplier.addressLine1) {
    const parts = [
      supplier.addressLine1,
      supplier.addressLine2,
      supplier.city,
      supplier.state,
      supplier.zip,
      supplier.country
    ].filter(Boolean);
    address = parts.join(', ');
  }
  
  // Extract website with fallback
  const website = supplier.website || supplier.url || '';
  
  // Extract lead time with fallback
  const leadTimeDays = supplier.leadTimeDays ?? supplier.leadTime ?? 7;
  
  return {
    id,
    name,
    contactEmails,
    phone,
    address,
    website,
    leadTimeDays,
  };
}

/**
 * Transform Finale purchase order to MuRP PurchaseOrder
 */
export function transformFinalePOToPurchaseOrder(
  po: FinalePurchaseOrder
): PurchaseOrder {
  // Extract ID with fallback
  const id = po.purchaseOrderId || po.id || po.orderNumber || 'UNKNOWN';
  const orderId = po.orderNumber || po.poNumber || id;
  
  // Extract vendor ID with fallback
  const vendorId = po.supplierId || po.vendorId || 'UNKNOWN_VENDOR';
  const supplierName = po.vendorName || po.supplierName || 'Unknown Vendor';
  
  // Map status with defaults
  let status: 'Pending' | 'Submitted' | 'Fulfilled' = 'Pending';
  if (po.status || po.orderStatus) {
    const statusStr = (po.status || po.orderStatus || '').toLowerCase();
    if (statusStr.includes('submit') || statusStr.includes('sent') || statusStr.includes('open')) {
      status = 'Submitted';
    } else if (statusStr.includes('fulfill') || statusStr.includes('complete') || statusStr.includes('received')) {
      status = 'Fulfilled';
    }
  }
  
  // Extract creation date with fallback
  const createdAt = po.orderDate || po.createdDate || new Date().toISOString();
  
  // Transform items
  const items: PurchaseOrderItem[] = (po.items || []).map(item => ({
    sku: item.sku || item.productId || 'UNKNOWN',
    name: item.name || item.productName || 'Unnamed Item',
    description: item.name || item.productName || 'Unnamed Item',
    quantity: item.quantity ?? item.quantityOrdered ?? 0,
    unitCost: item.unitCost ?? item.price ?? 0,
    price: item.unitCost ?? item.price ?? 0,
    lineTotal: (item.unitCost ?? item.price ?? 0) * (item.quantity ?? item.quantityOrdered ?? 0),
  }));
  const totalFromItems = items.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0);
  
  // Extract expected date with fallback
  const expectedDate = 
    po.expectedDate || 
    po.expectedDeliveryDate || 
    po.dueDate;
  
  // Extract notes with fallback
  const notes = po.notes || po.comments || po.internalNotes;
  const total = po.totalAmount ?? po.total ?? po.subtotal ?? totalFromItems;
  
  return {
    id,
    orderId,
    vendorId,
    supplier: supplierName,
    status,
    orderDate: createdAt,
    createdAt,
    items,
    expectedDate,
    notes,
    total,
    requisitionIds: [], // Finale doesn't have this concept
  };
}

/**
 * Extract BOM from Finale product with components
 */
export function extractBOMFromFinaleProduct(
  product: FinaleProduct
): BillOfMaterials | null {
  // Only create BOM if product has components
  if (!product.components || product.components.length === 0) {
    return null;
  }
  
  // Extract finished product SKU
  const finishedSku = product.sku || product.productCode || product.productId || 'UNKNOWN';
  
  // Extract name
  const name = product.name || product.productName || 'Unnamed Product';
  
  // Transform components
  const components: BOMComponent[] = product.components.map(comp => ({
    sku: comp.sku || comp.productId || 'UNKNOWN',
    quantity: comp.quantity ?? comp.quantityRequired ?? 1,
    name: comp.name || 'Unnamed Component',
  }));
  
  // Create default packaging (Finale doesn't provide this)
  const packaging: Packaging = {
    bagType: 'Standard',
    labelType: 'Standard',
    specialInstructions: '',
  };
  
  // Create default artwork array (Finale doesn't provide this)
  const artwork: Artwork[] = [];
  
  return {
    id: `BOM-${finishedSku}`,
    finishedSku,
    name,
    components,
    artwork,
    packaging,
    barcode: product.barcode || product.upc,
  };
}

// ============================================================================
// BATCH TRANSFORMATION FUNCTIONS
// ============================================================================

/**
 * Transform array of Finale products to InventoryItems
 */
export function transformFinaleProductsToInventory(
  products: FinaleProduct[]
): InventoryItem[] {
  return products
    .map(transformFinaleProductToInventoryItem)
    .filter(item => item.sku !== 'UNKNOWN'); // Filter out invalid items
}

/**
 * Transform array of Finale suppliers to Vendors
 */
export function transformFinaleSuppliersToVendors(
  suppliers: FinaleSupplier[]
): Vendor[] {
  return suppliers
    .map(transformFinaleSupplierToVendor)
    .filter(vendor => vendor.id !== 'UNKNOWN'); // Filter out invalid vendors
}

/**
 * Transform array of Finale POs to PurchaseOrders
 */
export function transformFinalePOsToPurchaseOrders(
  pos: FinalePurchaseOrder[]
): PurchaseOrder[] {
  return pos
    .map(transformFinalePOToPurchaseOrder)
    .filter(po => po.id !== 'UNKNOWN'); // Filter out invalid POs
}

/**
 * Extract BOMs from array of Finale products
 */
export function extractBOMsFromFinaleProducts(
  products: FinaleProduct[]
): BillOfMaterials[] {
  return products
    .map(extractBOMFromFinaleProduct)
    .filter((bom): bom is BillOfMaterials => bom !== null); // Filter out non-BOM products
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate transformed inventory item
 */
export function validateInventoryItem(item: InventoryItem): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!item.sku || item.sku === 'UNKNOWN') {
    errors.push('Missing or invalid SKU');
  }
  
  if (!item.name) {
    errors.push('Missing product name');
  }
  
  if (item.stock < 0) {
    errors.push('Stock cannot be negative');
  }
  
  if (item.reorderPoint < 0) {
    errors.push('Reorder point cannot be negative');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate transformed vendor
 */
export function validateVendor(vendor: Vendor): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!vendor.id || vendor.id === 'UNKNOWN') {
    errors.push('Missing or invalid vendor ID');
  }
  
  if (!vendor.name) {
    errors.push('Missing vendor name');
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
 * Validate transformed purchase order
 */
export function validatePurchaseOrder(po: PurchaseOrder): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!po.id || po.id === 'UNKNOWN') {
    errors.push('Missing or invalid PO ID');
  }
  
  if (!po.vendorId || po.vendorId === 'UNKNOWN_VENDOR') {
    errors.push('Missing or invalid vendor ID');
  }
  
  if (!po.items || po.items.length === 0) {
    errors.push('PO must have at least one item');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Safe number extraction with fallback
 */
export function safeNumber(value: any, fallback: number = 0): number {
  const num = Number(value);
  return isNaN(num) ? fallback : num;
}

/**
 * Safe string extraction with fallback
 */
export function safeString(value: any, fallback: string = ''): string {
  return value != null ? String(value) : fallback;
}

/**
 * Safe date extraction with fallback to now
 */
export function safeDate(value: any): string {
  if (!value) return new Date().toISOString();
  
  try {
    const date = new Date(value);
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Safe array extraction
 */
export function safeArray<T>(value: any): T[] {
  return Array.isArray(value) ? value : [];
}
