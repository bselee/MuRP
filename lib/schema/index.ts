/**
 * App-Wide Data Schema System
 *
 * This module defines a unified schema architecture for parsing, validating,
 * and transforming data from external sources (CSV, API) to internal storage.
 *
 * Architecture:
 * 1. Raw Schema - Data as it comes from external sources (CSV columns, API fields)
 * 2. Parsed Schema - Validated and normalized data with type safety
 * 3. Database Schema - Fields that map directly to Supabase tables
 * 4. Display Schema - Fields optimized for UI rendering
 *
 * Benefits:
 * - Single source of truth for data structures
 * - Type-safe transformations
 * - Automatic validation
 * - Clear data lineage
 * - Lossless transformation (all fields preserved)
 */

import { z } from 'zod/v3';

// ============================================================================
// VENDOR SCHEMAS
// ============================================================================

/**
 * Raw Vendor Schema - CSV columns from Finale report
 * Maps directly to CSV column names (case-sensitive)
 */
export const VendorRawSchema = z.object({
  // Identity
  'Name': z.string().optional(),

  // Contact - Multiple email fields (0-3)
  'Email address 0': z.string().optional(),
  'Email address 1': z.string().optional(),
  'Email address 2': z.string().optional(),
  'Email address 3': z.string().optional(),

  // Contact - Multiple phone fields (0-3)
  'Phone number 0': z.string().optional(),
  'Phone number 1': z.string().optional(),
  'Phone number 2': z.string().optional(),
  'Phone number 3': z.string().optional(),

  // Address - Multiple address sets (0-3)
  'Address 0 street address': z.string().optional(),
  'Address 0 city': z.string().optional(),
  'Address 0 state / region': z.string().optional(),
  'Address 0 state/ region': z.string().optional(),
  'Address 0 state/region': z.string().optional(),
  'Address 0 postal code': z.string().optional(),
  'Address 0 country': z.string().optional(),

  'Address 1 street address': z.string().optional(),
  'Address 1 city': z.string().optional(),
  'Address 1 state / region': z.string().optional(),
  'Address 1 postal code': z.string().optional(),
  'Address 1 country': z.string().optional(),

  'Address 2 street address': z.string().optional(),
  'Address 2 city': z.string().optional(),
  'Address 2 state / region': z.string().optional(),
  'Address 2 postal code': z.string().optional(),
  'Address 2 country': z.string().optional(),

  'Address 3 street address': z.string().optional(),
  'Address 3 city': z.string().optional(),
  'Address 3 state / region': z.string().optional(),
  'Address 3 postal code': z.string().optional(),
  'Address 3 country': z.string().optional(),

  // Business details
  'Website': z.string().optional(),
  'Notes': z.string().optional(),
  'Lead time (days)': z.string().optional(),

  // Any other fields that might be in the CSV
}).passthrough(); // Allow additional fields

export type VendorRaw = z.infer<typeof VendorRawSchema>;

/**
 * Parsed Vendor Schema - Validated and normalized data
 * All optional fields from CSV are cleaned and structured
 */
export const VendorParsedSchema = z.object({
  // Identity
  id: z.string().min(1),
  name: z.string().min(1),

  // Contact
  contactEmails: z.array(z.string().email()).default([]),
  phone: z.string().default(''),

  // Address - Structured components
  addressLine1: z.string().default(''),
  addressLine2: z.string().default(''),
  city: z.string().default(''),
  state: z.string().default(''),
  postalCode: z.string().default(''),
  country: z.string().default(''),

  // Composite address for display
  addressDisplay: z.string().default(''),

  // Business details
  website: z.string().url().or(z.literal('')).default(''),
  leadTimeDays: z.number().int().min(0).default(7),
  notes: z.string().default(''),

  // Metadata
  source: z.enum(['csv', 'api', 'manual']).default('csv'),
  rawData: z.record(z.any()).optional(), // Keep original data for debugging
});

export type VendorParsed = z.infer<typeof VendorParsedSchema>;

/**
 * Database Vendor Schema - Fields that exist in Supabase vendors table
 * This MUST match the actual database schema
 */
export const VendorDatabaseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  contact_emails: z.array(z.string()),
  phone: z.string(),
  address: z.string(), // Composite address
  website: z.string(),
  lead_time_days: z.number().int(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type VendorDatabase = z.infer<typeof VendorDatabaseSchema>;

/**
 * Display Vendor Schema - Optimized for UI rendering
 */
export const VendorDisplaySchema = VendorParsedSchema.extend({
  // Add computed fields for display
  primaryEmail: z.string().optional(),
  emailCount: z.number().optional(),
  hasCompleteAddress: z.boolean().optional(),
  leadTimeFormatted: z.string().optional(),
});

export type VendorDisplay = z.infer<typeof VendorDisplaySchema>;

// ============================================================================
// INVENTORY SCHEMAS
// ============================================================================

/**
 * Raw Inventory Schema - CSV columns from Finale report
 */
export const InventoryRawSchema = z.object({
  'SKU': z.string().optional(),
  'Product Code': z.string().optional(),
  'Name': z.string().optional(),
  'Product Name': z.string().optional(),
  'Description': z.string().optional(),
  'Category': z.string().optional(),
  'Quantity On Hand': z.string().optional(),
  'Stock': z.string().optional(),
  'Reorder Point': z.string().optional(),
  'Reorder Level': z.string().optional(),
  'MOQ': z.string().optional(),
  'Minimum Order Quantity': z.string().optional(),
  'Vendor': z.string().optional(),
  'Supplier': z.string().optional(),
  'Vendor ID': z.string().optional(),
  'Supplier ID': z.string().optional(),
  'Unit Cost': z.string().optional(),
  'Price': z.string().optional(),
  'Barcode': z.string().optional(),
  'UPC': z.string().optional(),
  'Notes': z.string().optional(),
}).passthrough();

export type InventoryRaw = z.infer<typeof InventoryRawSchema>;

/**
 * Parsed Inventory Schema - Enhanced for Finale Integration
 */
export const InventoryParsedSchema = z.object({
  // Core identification
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  category: z.string().default('Uncategorized'),
  status: z.string().default('active'),
  
  // Stock quantities
  stock: z.number().int().min(0).default(0),
  onOrder: z.number().int().min(0).default(0),
  reserved: z.number().int().min(0).default(0),
  remaining: z.number().int().min(0).default(0),
  
  // Reorder intelligence
  reorderPoint: z.number().int().min(0).default(10),
  reorderVariance: z.number().default(0),
  qtyToOrder: z.number().int().min(0).default(0),
  
  // Sales data
  salesVelocity: z.number().default(0),
  
  // Vendor info
  vendorId: z.string().default(''),
  vendorName: z.string().default(''),
  moq: z.number().int().min(1).default(1),
  
  // Pricing
  unitCost: z.number().min(0).default(0),
  price: z.number().min(0).default(0),
  
  // Location
  warehouseLocation: z.string().default('Shipping'),
  binLocation: z.string().default(''),
  
  // Product info
  barcode: z.string().default(''),
  lastPurchaseDate: z.string().nullable().default(null),
  notes: z.string().default(''),
  
  // Metadata
  source: z.enum(['csv', 'api', 'manual']).default('csv'),
  rawData: z.record(z.any()).optional(),
});

export type InventoryParsed = z.infer<typeof InventoryParsedSchema>;

/**
 * Database Inventory Schema - Enhanced for Migration 003
 */
export const InventoryDatabaseSchema = z.object({
  // Core fields
  sku: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.string().optional(),
  category: z.string(),
  
  // Legacy fields (mapped to new schema)
  stock: z.number(),
  on_order: z.number(),
  reorder_point: z.number(),
  vendor_id: z.string().nullable(),
  moq: z.number(),
  
  // Enhanced schema fields (from migration 003)
  unit_cost: z.number().optional(),
  unit_price: z.number().optional(),
  units_in_stock: z.number().optional(),
  units_on_order: z.number().optional(),
  units_reserved: z.number().optional(),
  reorder_variance: z.number().optional(),
  qty_to_order: z.number().optional(),
  sales_velocity_consolidated: z.number().optional(),
  warehouse_location: z.string().optional(),
  bin_location: z.string().optional(),
  supplier_sku: z.string().optional(),
  last_purchase_date: z.string().nullable().optional(),
  upc: z.string().optional(),
  data_source: z.string().optional(),
  last_sync_at: z.string().optional(),
  sync_status: z.string().optional(),
  
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type InventoryDatabase = z.infer<typeof InventoryDatabaseSchema>;

// ============================================================================
// BOM (BILL OF MATERIALS) SCHEMAS
// ============================================================================

/**
 * Raw BOM Schema - CSV columns from Finale BOM report
 * Maps directly to "Build BOM Report-Inv Master" columns
 */
export const BOMRawSchema = z.object({
  // Finished product info
  'Product ID': z.string().optional(),
  'Name': z.string().optional(),
  'Product Name': z.string().optional(),

  // Build quantities
  'Potential \n Build \n Qty': z.string().optional(),
  'Potential Build Qty': z.string().optional(),
  'BOM Quantity': z.string().optional(),
  'BOM \n Quantity': z.string().optional(),

  // Component info
  'Component \n Product ID': z.string().optional(),
  'Component Product ID': z.string().optional(),
  'Component Name': z.string().optional(),
  'Component \n Name': z.string().optional(),

  // Stock and cost info
  'Component product \n Remaining': z.string().optional(),
  'Component product Remaining': z.string().optional(),
  'BOM \n Average cost': z.string().optional(),
  'BOM Average cost': z.string().optional(),

  // Additional fields
  'Barcode': z.string().optional(),
  'Category': z.string().optional(),
  'Status': z.string().optional(),
  'Product Status': z.string().optional(),

  // Allow any other fields from the report
}).passthrough();

export type BOMRaw = z.infer<typeof BOMRawSchema>;

/**
 * Raw BOM Component Schema - Component data from CSV before parsing
 * This is derived from BOMRawSchema since components are embedded in each BOM row
 */
export const BOMComponentRawSchema = BOMRawSchema;
export type BOMComponentRaw = z.infer<typeof BOMComponentRawSchema>;

/**
 * Parsed BOM Component Schema - Individual component within a BOM
 */
export const BOMComponentParsedSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().min(0),
  // Enhanced fields for MRP
  unitCost: z.number().optional(),
  remaining: z.number().optional(), // Stock remaining for this component
  supplierSku: z.string().optional(),
  leadTimeDays: z.number().optional(),
});

export type BOMComponentParsed = z.infer<typeof BOMComponentParsedSchema>;

/**
 * Parsed BOM Schema - Validated and normalized Bill of Materials
 */
export const BOMParsedSchema = z.object({
  id: z.string().min(1),
  finishedSku: z.string().min(1),
  name: z.string().min(1),
  components: z.array(BOMComponentParsedSchema).default([]),

  // Artwork/Labels/Bags/Documents (will be populated separately or from additional columns)
  artwork: z.array(z.any()).default([]),

  // Packaging specifications
  packaging: z.object({
    bagType: z.string().default('Standard'),
    labelType: z.string().default('Standard'),
    specialInstructions: z.string().default(''),
    bagSku: z.string().optional(),
    labelSku: z.string().optional(),
    boxSku: z.string().optional(),
    insertSku: z.string().optional(),
    weight: z.number().optional(),
    weightUnit: z.string().optional(),
    dimensions: z.string().optional(),
  }).default({
    bagType: 'Standard',
    labelType: 'Standard',
    specialInstructions: '',
  }),

  // Enhanced fields for MRP
  barcode: z.string().optional(),
  description: z.string().default(''),
  category: z.string().default(''),
  yieldQuantity: z.number().default(1), // How many units this BOM produces
  potentialBuildQty: z.number().optional(), // From Finale report
  averageCost: z.number().optional(), // BOM average cost

  // Sync tracking (like vendors/inventory)
  dataSource: z.enum(['csv', 'api', 'manual']).default('csv'),
  lastSyncAt: z.string().optional(),
  syncStatus: z.enum(['synced', 'pending', 'error']).default('synced'),
  notes: z.string().default(''),

  // Preserve raw data for debugging
  rawData: z.record(z.any()).optional(),
});

export type BOMParsed = z.infer<typeof BOMParsedSchema>;

/**
 * Database BOM Schema - Maps to Supabase boms table
 */
export const BOMDatabaseSchema = z.object({
  id: z.string(),
  finished_sku: z.string(),
  name: z.string(),
  components: z.any(), // JSONB in database
  artwork: z.any(), // JSONB
  packaging: z.any(), // JSONB
  barcode: z.string().optional(),
  // Enhanced fields for MRP
  description: z.string().optional(),
  category: z.string().optional(),
  yield_quantity: z.number().optional(),
  potential_build_qty: z.number().optional(),
  average_cost: z.number().optional(),
  // Sync tracking
  data_source: z.string().optional(),
  last_sync_at: z.string().optional(),
  sync_status: z.string().optional(),
  notes: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type BOMDatabase = z.infer<typeof BOMDatabaseSchema>;

// ============================================================================
// VALIDATION & TRANSFORMATION UTILITIES
// ============================================================================

/**
 * Result type for parsing operations
 */
export interface ParseResult<T> {
  success: boolean;
  data?: T;
  errors: string[];
  warnings: string[];
}

/**
 * Validate and parse data using a Zod schema
 */
export function validateWithSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): ParseResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
      errors: [],
      warnings: [],
    };
  }

  const errors = result.error.errors.map(err => {
    const path = err.path.join('.');
    return `${context || 'Field'} '${path}': ${err.message}`;
  });

  return {
    success: false,
    errors,
    warnings: [],
  };
}

/**
 * Extract first meaningful value from multiple possible fields
 */
export function extractFirst(
  row: Record<string, any>,
  keys: string[],
  filter: (val: string) => boolean = (v) => !!v && v !== 'Various' && v !== '--'
): string {
  for (const key of keys) {
    const val = row[key];
    if (val && typeof val === 'string' && filter(val.trim())) {
      return val.trim();
    }
  }
  return '';
}

/**
 * Extract all meaningful values from multiple fields
 */
export function extractAll(
  row: Record<string, any>,
  keys: string[],
  filter: (val: string) => boolean = (v) => !!v && v !== 'Various' && v !== '--'
): string[] {
  const values: string[] = [];
  for (const key of keys) {
    const val = row[key];
    if (val && typeof val === 'string' && filter(val.trim())) {
      values.push(val.trim());
    }
  }
  return values;
}

/**
 * Safe number parsing with fallback
 */
export function parseNumber(value: any, fallback: number = 0): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? fallback : num;
  }
  return fallback;
}

/**
 * Safe integer parsing with fallback
 */
export function parseInt(value: any, fallback: number = 0): number {
  return Math.floor(parseNumber(value, fallback));
}

/**
 * Format address components into a single string
 */
export function formatAddress(components: {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}): string {
  const parts = [
    components.addressLine1,
    components.addressLine2,
    components.city,
    components.state,
    components.postalCode,
    components.country,
  ].filter(Boolean);

  return parts.join(', ');
}

/**
 * Generate deterministic UUID from string
 */
export function generateDeterministicId(value: string, index?: number): string {
  const seed = index !== undefined ? `${value}-${index}` : value;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  const hashHex = Math.abs(hash).toString(16).padStart(8, '0');
  const indexHex = (index || 0).toString(16).padStart(4, '0');
  return `${hashHex}-0000-4000-8000-${indexHex}00000000`.slice(0, 36);
}

// ============================================================================
// SCHEMA REGISTRY
// ============================================================================

/**
 * Central registry of all schemas for different data types
 */
export const SchemaRegistry = {
  Vendor: {
    Raw: VendorRawSchema,
    Parsed: VendorParsedSchema,
    Database: VendorDatabaseSchema,
    Display: VendorDisplaySchema,
  },
  Inventory: {
    Raw: InventoryRawSchema,
    Parsed: InventoryParsedSchema,
    Database: InventoryDatabaseSchema,
  },
  BOM: {
    Raw: BOMRawSchema,
    Parsed: BOMParsedSchema,
    Database: BOMDatabaseSchema,
    Component: {
      Parsed: BOMComponentParsedSchema,
    },
  },
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Types above are already exported via type aliases; avoid duplicate re-exports
