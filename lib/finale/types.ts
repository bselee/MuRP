/**
 * Finale Inventory API Type Definitions
 *
 * REST API documentation: https://support.finaleinventory.com/hc/en-us/articles/4408832394647
 */

// =============================================================================
// API Response Wrappers
// =============================================================================

export interface FinaleApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  timestamp: string;
}

export interface FinalePaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
  error?: string;
}

// =============================================================================
// Product (Inventory Item) Types
// =============================================================================

export interface FinaleProduct {
  resourceUri: string;
  id: number;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  status: 'PRODUCT_ACTIVE' | 'PRODUCT_INACTIVE' | 'PRODUCT_DISCONTINUED';
  productType: 'SIMPLE' | 'ASSEMBLY' | 'COMPONENT';
  unitsInStock: number;
  unitsOnOrder: number;
  unitsReserved: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  moq?: number; // Minimum Order Quantity
  defaultSupplier?: string; // Resource URI
  cost?: number;
  price?: number;
  weight?: number;
  weightUnit?: string;
  customFields?: Record<string, any>;
  createdDate: string;
  lastModified: string;
}

// =============================================================================
// Party/Vendor Types
// =============================================================================

export interface FinalePartyGroup {
  resourceUri: string;
  id: number;
  name: string;
  organizationRole: 'SUPPLIER' | 'CUSTOMER' | 'BOTH';
  email?: string;
  phone?: string;
  fax?: string;
  website?: string;
  address?: {
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  contactPerson?: string;
  notes?: string;
  leadTimeDays?: number;
  paymentTerms?: string;
  customFields?: Record<string, any>;
  active: boolean;
  createdDate: string;
  lastModified: string;
}

// =============================================================================
// Purchase Order Types
// =============================================================================

export interface FinalePurchaseOrder {
  resourceUri: string;
  id: number;
  orderNumber: string;
  supplier: string; // Resource URI to PartyGroup
  status: 'DRAFT' | 'SUBMITTED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  orderDate: string;
  expectedDate?: string;
  receivedDate?: string;
  facility?: string; // Resource URI
  lineItems: FinalePOLineItem[];
  subtotal: number;
  tax?: number;
  shipping?: number;
  total: number;
  currency: string;
  notes?: string;
  internalNotes?: string;
  createdBy?: string;
  createdDate: string;
  lastModified: string;
}

export interface FinalePOLineItem {
  id: number;
  product: string; // Resource URI
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  received?: number;
  notes?: string;
}

// =============================================================================
// Facility (Location) Types
// =============================================================================

export interface FinaleFacility {
  resourceUri: string;
  id: number;
  name: string;
  code?: string;
  address?: {
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  type: 'WAREHOUSE' | 'STORE' | 'OFFICE' | 'OTHER';
  active: boolean;
  isDefault: boolean;
}

// =============================================================================
// Stock Transaction Types
// =============================================================================

export interface FinaleStockTransaction {
  resourceUri: string;
  id: number;
  product: string; // Resource URI
  sku: string;
  transactionType: 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'TRANSFER' | 'ASSEMBLY' | 'DISASSEMBLY';
  quantity: number;
  facility?: string; // Resource URI
  reference?: string; // Related PO, SO, etc.
  notes?: string;
  cost?: number;
  transactionDate: string;
  createdBy?: string;
  createdDate: string;
}

// =============================================================================
// Bill of Materials (Assembly) Types
// =============================================================================

export interface FinaleAssembly {
  resourceUri: string;
  id: number;
  product: string; // Resource URI (the finished product)
  components: FinaleAssemblyComponent[];
  defaultQuantity: number;
  notes?: string;
  active: boolean;
  createdDate: string;
  lastModified: string;
}

export interface FinaleAssemblyComponent {
  id: number;
  product: string; // Resource URI
  sku: string;
  name: string;
  quantity: number;
  unit?: string;
  cost?: number;
}

// =============================================================================
// Connection Status & Configuration
// =============================================================================

export interface FinaleConnectionConfig {
  apiKey: string;
  apiSecret: string;
  accountPath: string;
  baseUrl: string;
  rateLimitPerMinute?: number;
  rateLimitGlobalHour?: number;
  timeout?: number;
}

export interface FinaleConnectionStatus {
  isConnected: boolean;
  accountPath?: string;
  lastSyncTime?: string;
  lastSyncStatus?: 'success' | 'error' | 'partial';
  lastSyncError?: string;
  stats?: {
    productCount: number;
    vendorCount: number;
    poCount: number;
  };
  rateLimitStatus?: {
    remaining: number;
    resetTime: string;
  };
}

// =============================================================================
// Sync Operation Types
// =============================================================================

export interface FinaleSyncResult {
  success: boolean;
  timestamp: string;
  duration: number; // milliseconds
  itemsSynced: {
    products: number;
    vendors: number;
    purchaseOrders: number;
  };
  errors?: Array<{
    type: string;
    message: string;
    details?: any;
  }>;
}

export interface FinaleSyncOptions {
  syncProducts?: boolean;
  syncVendors?: boolean;
  syncPurchaseOrders?: boolean;
  syncFacilities?: boolean;
  fullSync?: boolean; // true = all data, false = only changed since last sync
  batchSize?: number;
}
