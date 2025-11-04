/**
 * Schema-Based Data Transformers
 *
 * This module provides transformation functions that use the unified schema
 * system to parse, validate, and transform data from external sources.
 *
 * All transformers follow the same pattern:
 * 1. Accept raw data (CSV row, API response)
 * 2. Validate against Raw schema
 * 3. Extract and normalize fields
 * 4. Validate against Parsed schema
 * 5. Return ParseResult with data or errors
 */

import {
  VendorRaw,
  VendorParsed,
  VendorDatabase,
  InventoryRaw,
  InventoryParsed,
  InventoryDatabase,
  BOMRaw,
  BOMParsed,
  BOMDatabase,
  SchemaRegistry,
  ParseResult,
  validateWithSchema,
  extractFirst,
  extractAll,
  parseNumber,
  parseInt,
  formatAddress,
  generateDeterministicId,
} from './index';

// ============================================================================
// VENDOR TRANSFORMERS
// ============================================================================

/**
 * Transform raw CSV vendor data to parsed vendor object
 */
export function transformVendorRawToParsed(
  raw: Record<string, any>,
  index?: number
): ParseResult<VendorParsed> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Extract name (required)
    const name = extractFirst(raw, ['Name', 'name', 'Vendor Name', 'Company Name']);
    if (!name) {
      return {
        success: false,
        errors: ['Vendor name is required'],
        warnings: [],
      };
    }

    // Skip placeholder vendors
    if (name === '--' || name.toLowerCase() === 'various' || name.trim() === '') {
      return {
        success: false,
        errors: [`Skipping placeholder vendor: "${name}"`],
        warnings: [],
      };
    }

    // Generate ID from name and index
    const id = generateDeterministicId(name, index);

    // Extract all email addresses (0-3)
    const emailKeys = [
      'Email address 0',
      'Email address 1',
      'Email address 2',
      'Email address 3',
      'Email',
      'Contact Email',
    ];
    const contactEmails = extractAll(raw, emailKeys).filter(email => {
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    });

    if (contactEmails.length === 0) {
      warnings.push(`No valid email found for vendor: ${name}`);
    }

    // Extract phone number (use first available)
    const phoneKeys = [
      'Phone number 0',
      'Phone number 1',
      'Phone number 2',
      'Phone number 3',
      'Phone',
      'Contact Phone',
    ];
    const phone = extractFirst(raw, phoneKeys);

    // Extract address components with fallback through Address 0-3
    let addressLine1 = '';
    let city = '';
    let state = '';
    let postalCode = '';
    let country = '';

    // Try each address set (0-3) until we find data
    for (let i = 0; i < 4; i++) {
      const line1 = extractFirst(raw, [
        `Address ${i} street address`,
        `Address ${i} line 1`,
        `Address ${i} address`,
      ]);
      const cityVal = extractFirst(raw, [`Address ${i} city`]);
      const stateVal = extractFirst(raw, [
        `Address ${i} state / region`,
        `Address ${i} state/ region`,
        `Address ${i} state/region`,
        `Address ${i} state`,
        `Address ${i} region`,
      ]);
      const zipVal = extractFirst(raw, [
        `Address ${i} postal code`,
        `Address ${i} zip`,
        `Address ${i} zip code`,
        `Address ${i} postcode`,
      ]);
      const countryVal = extractFirst(raw, [
        `Address ${i} country`,
      ]);

      // If we found any address component, use this address set
      if (line1 || cityVal || stateVal || zipVal) {
        addressLine1 = line1;
        city = cityVal;
        state = stateVal;
        postalCode = zipVal;
        country = countryVal;
        break;
      }
    }

    // Build composite address for display
    const addressDisplay = formatAddress({
      addressLine1,
      city,
      state,
      postalCode,
      country,
    });

    if (!addressDisplay) {
      warnings.push(`No address found for vendor: ${name}`);
    }

    // Extract website
    const websiteRaw = extractFirst(raw, ['Website', 'URL', 'Web']);
    let website = '';
    if (websiteRaw) {
      // Ensure it's a valid URL
      try {
        // Add protocol if missing
        const urlWithProtocol = websiteRaw.startsWith('http')
          ? websiteRaw
          : `https://${websiteRaw}`;
        new URL(urlWithProtocol);
        website = urlWithProtocol;
      } catch {
        warnings.push(`Invalid website URL for vendor ${name}: ${websiteRaw}`);
      }
    }

    // Extract lead time
    const leadTimeRaw = extractFirst(raw, ['Lead time (days)', 'Lead Time', 'lead_time_days']);
    const leadTimeDays = leadTimeRaw ? parseInt(leadTimeRaw, 7) : 7;

    // Extract notes
    const notes = extractFirst(raw, ['Notes', 'notes', 'Description', 'Comments']) || '';

    // Build parsed vendor object
    const parsed: VendorParsed = {
      id,
      name,
      contactEmails,
      phone,
      addressLine1,
      addressLine2: '', // Not in standard CSV, but keep field
      city,
      state,
      postalCode,
      country,
      addressDisplay,
      website,
      leadTimeDays,
      notes,
      source: 'csv',
      rawData: raw, // Keep raw data for debugging
    };

    // Validate against Parsed schema
    const validation = validateWithSchema(SchemaRegistry.Vendor.Parsed, parsed, 'Vendor');
    if (!validation.success) {
      return {
        success: false,
        errors: validation.errors,
        warnings,
      };
    }

    return {
      success: true,
      data: validation.data!,
      errors: [],
      warnings,
    };
  } catch (error: any) {
    return {
      success: false,
      errors: [`Error transforming vendor: ${error.message}`],
      warnings,
    };
  }
}

/**
 * Transform parsed vendor to database format
 */
export function transformVendorParsedToDatabase(
  parsed: VendorParsed
): ParseResult<VendorDatabase> {
  try {
    const database: VendorDatabase = {
      id: parsed.id,
      name: parsed.name,
      contact_emails: parsed.contactEmails,
      phone: parsed.phone,
      address: parsed.addressDisplay, // Use composite address
      website: parsed.website,
      lead_time_days: parsed.leadTimeDays,
      // Note: New fields from migration will be added separately
    };

    // Validate against Database schema
    const validation = validateWithSchema(SchemaRegistry.Vendor.Database, database, 'VendorDB');
    if (!validation.success) {
      return {
        success: false,
        errors: validation.errors,
        warnings: [],
      };
    }

    return {
      success: true,
      data: validation.data!,
      errors: [],
      warnings: [],
    };
  } catch (error: any) {
    return {
      success: false,
      errors: [`Error transforming vendor to database format: ${error.message}`],
      warnings: [],
    };
  }
}

/**
 * Transform parsed vendor to database insert with enhanced fields
 * Use this version after migration 002 is applied
 */
export function transformVendorParsedToDatabaseEnhanced(
  parsed: VendorParsed
): Record<string, any> {
  return {
    id: parsed.id,
    name: parsed.name,
    contact_emails: parsed.contactEmails,
    phone: parsed.phone,
    // Composite address (for backward compatibility)
    address: parsed.addressDisplay,
    // Structured address components (new fields from migration)
    address_line1: parsed.addressLine1,
    address_line2: parsed.addressLine2,
    city: parsed.city,
    state: parsed.state,
    postal_code: parsed.postalCode,
    country: parsed.country,
    // Business details
    website: parsed.website,
    lead_time_days: parsed.leadTimeDays,
    notes: parsed.notes,
    // Metadata
    data_source: parsed.source,
    last_sync_at: new Date().toISOString(),
    sync_status: 'synced',
    updated_at: new Date().toISOString(),
  };
}

// ============================================================================
// INVENTORY TRANSFORMERS
// ============================================================================

/**
 * Transform raw CSV inventory data to parsed inventory object
 */
export function transformInventoryRawToParsed(
  raw: Record<string, any>,
  vendorIdMap: Map<string, string> = new Map()
): ParseResult<InventoryParsed> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Extract SKU (required)
    const sku = extractFirst(raw, ['SKU', 'sku', 'Product Code', 'Item Code']);
    if (!sku) {
      return {
        success: false,
        errors: ['SKU is required'],
        warnings: [],
      };
    }

    // Extract name
    const name = extractFirst(raw, ['Name', 'name', 'Product Name', 'Item Name']) || 'Unnamed Product';

    // Extract description
    const description = extractFirst(raw, ['Description', 'description', 'Details']) || '';

    // Extract category
    const category = extractFirst(raw, ['Category', 'category', 'Product Category']) || 'Uncategorized';

    // Extract stock quantity
    const stockRaw = extractFirst(raw, ['Quantity On Hand', 'Stock', 'stock', 'Quantity']);
    const stock = parseInt(stockRaw, 0);

    // Extract on order quantity
    const onOrderRaw = extractFirst(raw, ['On Order', 'on_order', 'Quantity On Order']);
    const onOrder = parseInt(onOrderRaw, 0);

    // Extract reorder point
    const reorderRaw = extractFirst(raw, ['Reorder Point', 'reorder_point', 'Reorder Level']);
    const reorderPoint = parseInt(reorderRaw, 10);

    // Extract vendor info
    const vendorName = extractFirst(raw, ['Vendor', 'vendor', 'Supplier', 'supplier']);
    const vendorIdRaw = extractFirst(raw, ['Vendor ID', 'vendor_id', 'Supplier ID', 'supplier_id']);

    // Map vendor name to ID if we have the mapping
    let vendorId = vendorIdRaw;
    if (!vendorId && vendorName && vendorIdMap.has(vendorName.toLowerCase())) {
      vendorId = vendorIdMap.get(vendorName.toLowerCase())!;
    }

    if (!vendorId) {
      warnings.push(`No vendor ID found for SKU ${sku}`);
      vendorId = '';
    }

    // Extract MOQ
    const moqRaw = extractFirst(raw, ['MOQ', 'moq', 'Minimum Order Quantity', 'Min Order']);
    const moq = parseInt(moqRaw, 1);

    // Extract pricing
    const unitCostRaw = extractFirst(raw, ['Unit Cost', 'unit_cost', 'Cost', 'cost']);
    const unitCost = parseNumber(unitCostRaw, 0);

    const priceRaw = extractFirst(raw, ['Price', 'price', 'Sale Price', 'Retail Price']);
    const price = parseNumber(priceRaw, 0);

    // Extract barcode
    const barcode = extractFirst(raw, ['Barcode', 'barcode', 'UPC', 'upc']) || '';

    // Extract notes
    const notes = extractFirst(raw, ['Notes', 'notes', 'Description', 'Comments']) || '';

    // Build parsed inventory object
    const parsed: InventoryParsed = {
      sku,
      name,
      description,
      category,
      stock,
      onOrder,
      reorderPoint,
      vendorId,
      vendorName,
      moq,
      unitCost,
      price,
      barcode,
      notes,
      source: 'csv',
      rawData: raw,
    };

    // Validate against Parsed schema
    const validation = validateWithSchema(SchemaRegistry.Inventory.Parsed, parsed, 'Inventory');
    if (!validation.success) {
      return {
        success: false,
        errors: validation.errors,
        warnings,
      };
    }

    return {
      success: true,
      data: validation.data!,
      errors: [],
      warnings,
    };
  } catch (error: any) {
    return {
      success: false,
      errors: [`Error transforming inventory: ${error.message}`],
      warnings,
    };
  }
}

/**
 * Transform parsed inventory to database format
 */
export function transformInventoryParsedToDatabase(
  parsed: InventoryParsed
): ParseResult<InventoryDatabase> {
  try {
    const database: InventoryDatabase = {
      sku: parsed.sku,
      name: parsed.name,
      category: parsed.category,
      stock: parsed.stock,
      on_order: parsed.onOrder,
      reorder_point: parsed.reorderPoint,
      vendor_id: parsed.vendorId,
      moq: parsed.moq,
    };

    // Validate against Database schema
    const validation = validateWithSchema(SchemaRegistry.Inventory.Database, database, 'InventoryDB');
    if (!validation.success) {
      return {
        success: false,
        errors: validation.errors,
        warnings: [],
      };
    }

    return {
      success: true,
      data: validation.data!,
      errors: [],
      warnings: [],
    };
  } catch (error: any) {
    return {
      success: false,
      errors: [`Error transforming inventory to database format: ${error.message}`],
      warnings: [],
    };
  }
}

// ============================================================================
// BATCH TRANSFORMATION FUNCTIONS
// ============================================================================

/**
 * Transform array of raw vendors to parsed vendors
 * Returns both successful and failed transformations
 */
export interface BatchTransformResult<T> {
  successful: T[];
  failed: Array<{ index: number; errors: string[]; warnings: string[]; raw: any }>;
  totalWarnings: string[];
}

export function transformVendorsBatch(
  rawVendors: Record<string, any>[]
): BatchTransformResult<VendorParsed> {
  const successful: VendorParsed[] = [];
  const failed: Array<{ index: number; errors: string[]; warnings: string[]; raw: any }> = [];
  const totalWarnings: string[] = [];

  rawVendors.forEach((raw, index) => {
    const result = transformVendorRawToParsed(raw, index);

    if (result.success && result.data) {
      successful.push(result.data);
      // Collect warnings even for successful transformations
      if (result.warnings.length > 0) {
        totalWarnings.push(...result.warnings.map(w => `Row ${index + 1}: ${w}`));
      }
    } else {
      failed.push({
        index,
        errors: result.errors,
        warnings: result.warnings,
        raw,
      });
    }
  });

  return {
    successful,
    failed,
    totalWarnings,
  };
}

/**
 * Transform array of raw inventory items to parsed inventory
 */
export function transformInventoryBatch(
  rawInventory: Record<string, any>[],
  vendorIdMap: Map<string, string> = new Map()
): BatchTransformResult<InventoryParsed> {
  const successful: InventoryParsed[] = [];
  const failed: Array<{ index: number; errors: string[]; warnings: string[]; raw: any }> = [];
  const totalWarnings: string[] = [];

  rawInventory.forEach((raw, index) => {
    const result = transformInventoryRawToParsed(raw, vendorIdMap);

    if (result.success && result.data) {
      successful.push(result.data);
      if (result.warnings.length > 0) {
        totalWarnings.push(...result.warnings.map(w => `Row ${index + 1}: ${w}`));
      }
    } else {
      failed.push({
        index,
        errors: result.errors,
        warnings: result.warnings,
        raw,
      });
    }
  });

  return {
    successful,
    failed,
    totalWarnings,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Deduplicate vendors by name (case-insensitive)
 * Last occurrence wins
 */
export function deduplicateVendors(vendors: VendorParsed[]): VendorParsed[] {
  const byName = new Map<string, VendorParsed>();

  vendors.forEach(vendor => {
    const key = vendor.name.toLowerCase().trim();
    byName.set(key, vendor);
  });

  return Array.from(byName.values());
}

/**
 * Map vendor names to IDs for inventory import
 */
export function buildVendorNameToIdMap(vendors: VendorParsed[]): Map<string, string> {
  const map = new Map<string, string>();

  vendors.forEach(vendor => {
    const key = vendor.name.toLowerCase().trim();
    map.set(key, vendor.id);
  });

  return map;
}
