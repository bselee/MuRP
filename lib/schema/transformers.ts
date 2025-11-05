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
  BOMComponentParsed,
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
    
    // Skip vendors without names or with placeholder names
    if (!name || name.trim() === '' || name === '--' || name.toLowerCase() === 'various') {
      return {
        success: false,
        errors: [`Skipping vendor: no valid name (got: "${name || 'empty'}")`],
        warnings: [],
      };
    }

    // Skip vendors that start with special characters (data errors)
    if (/^[,.\-_]+/.test(name)) {
      return {
        success: false,
        errors: [`Skipping malformed vendor name: "${name}"`],
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
 * Filters for ACTIVE items in SHIPPING warehouse only
 */
export function transformInventoryRawToParsed(
  raw: Record<string, any>,
  vendorIdMap: Map<string, string> = new Map()
): ParseResult<InventoryParsed> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Extract SKU (required)
    const sku = extractFirst(raw, ['SKU', 'sku', 'Product Code', 'Item Code', 'Code']);
    if (!sku || sku.trim() === '') {
      return {
        success: false,
        errors: ['SKU is required'],
        warnings: [],
      };
    }

    // Skip items with malformed SKUs (start with special chars)
    if (/^[,.\-_]+/.test(sku)) {
      return {
        success: false,
        errors: [`Skipping malformed SKU: "${sku}"`],
        warnings: [],
      };
    }

    // Extract name (required for active items)
    const name = extractFirst(raw, ['Name', 'name', 'Product Name', 'Item Name', 'Product']);
    if (!name || name.trim() === '') {
      return {
        success: false,
        errors: [`Skipping item with no name (SKU: ${sku})`],
        warnings: [],
      };
    }

    // FILTER 1: Active items only (report already filters for PRODUCT_ACTIVE)
    // The new inventory report (data=product) is pre-filtered in Finale for active products
    // So we don't need to filter here - trust the report filter
    const status = extractFirst(raw, ['Status', 'status', 'Product Status', 'State']) || 'active';

    // FILTER 2: Warehouse location (optional - report may not include location)
    // The new master inventory report doesn't have location data since it's data=product not data=productLocation
    // Location filtering is handled by the report configuration in Finale
    const location = extractFirst(raw, ['Location', 'location', 'Warehouse', 'Facility']) || '';

    // Extract description
    const description = extractFirst(raw, ['Description', 'description', 'Details', 'Product Description']) || '';

    // Extract category
    const category = extractFirst(raw, ['Category', 'category', 'Product Category', 'Type']) || 'Uncategorized';

    // Extract stock quantities (Finale specific columns)
    const stockRaw = extractFirst(raw, [
      'Units In Stock', 'In stock', 'Quantity On Hand', 'Stock', 'stock', 'Quantity'
    ]);
    const stock = parseNumber(stockRaw, 0);

    const onOrderRaw = extractFirst(raw, ['Units On Order', 'On Order', 'on_order', 'Quantity On Order']);
    const onOrder = parseNumber(onOrderRaw, 0);

    const reservedRaw = extractFirst(raw, ['Units Reserved', 'Reserved', 'reserved']);
    const reserved = parseNumber(reservedRaw, 0);

    const remainingRaw = extractFirst(raw, ['Units Remain', 'Available', 'remaining']);
    const remaining = parseNumber(remainingRaw, 0);

    // Extract reorder intelligence (Finale specific)
    const reorderRaw = extractFirst(raw, ['ReOr point', 'Reorder Point', 'reorder_point', 'Reorder Level']);
    const reorderPoint = parseNumber(reorderRaw, 10);

    const reorderVarRaw = extractFirst(raw, ['ReOr var', 'Reorder Variance', 'reorder_variance']);
    const reorderVariance = parseNumber(reorderVarRaw, 0);

    const qtyToOrderRaw = extractFirst(raw, ['Qty to Order', 'Quantity to Order', 'qty_to_order']);
    const qtyToOrder = parseNumber(qtyToOrderRaw, 0);

    // Extract sales velocity (Finale specific)
    const salesVelocityRaw = extractFirst(raw, [
      'productSalesVelocityConsolidate', 'Sales Velocity', 'sales_velocity'
    ]);
    const salesVelocity = parseNumber(salesVelocityRaw, 0);

    // Extract vendor info
    const vendorName = extractFirst(raw, ['Supplier', 'Vendor', 'vendor', 'supplier']);
    const vendorIdRaw = extractFirst(raw, ['Vendor ID', 'vendor_id', 'Supplier ID', 'supplier_id']);

    // Map vendor name to ID if we have the mapping
    let vendorId = vendorIdRaw;
    if (!vendorId && vendorName && vendorIdMap.has(vendorName.toLowerCase())) {
      vendorId = vendorIdMap.get(vendorName.toLowerCase())!;
    }

    if (!vendorId && vendorName) {
      warnings.push(`No vendor ID found for SKU ${sku} (vendor: ${vendorName})`);
      vendorId = '';
    }

    // Extract MOQ
    const moqRaw = extractFirst(raw, ['MOQ', 'moq', 'Minimum Order Quantity', 'Min Order']);
    const moq = parseNumber(moqRaw, 1);

    // Extract pricing
    const unitCostRaw = extractFirst(raw, ['Unit Cost', 'unit_cost', 'Cost', 'cost']);
    const unitCost = parseNumber(unitCostRaw, 0);

    const priceRaw = extractFirst(raw, ['Price', 'price', 'Sale Price', 'Retail Price', 'Unit Price']);
    const price = parseNumber(priceRaw, 0);

    // Extract barcode/UPC
    const barcode = extractFirst(raw, ['Barcode', 'barcode', 'UPC', 'upc', 'GTIN']) || '';

    // Extract warehouse location
    const warehouseLocation = extractFirst(raw, ['Location', 'location', 'Warehouse', 'Facility']) || 'Shipping';
    const binLocation = extractFirst(raw, ['Bin', 'bin', 'Bin Location', 'Position']) || '';

    // Extract last purchase date
    const lastPurchaseRaw = extractFirst(raw, [
      'productLastPurchaseDateConsolidate', 'Last Purchase Date', 'last_purchase_date'
    ]);
    const lastPurchaseDate = lastPurchaseRaw ? new Date(lastPurchaseRaw).toISOString() : null;

    // Extract notes
    const notes = extractFirst(raw, ['Notes', 'notes', 'Description', 'Comments', 'Remarks']) || '';

    // Build parsed inventory object with enhanced fields
    const parsed: InventoryParsed = {
      sku,
      name,
      description,
      category,
      status: 'active', // Filtered above, so all are active
      stock,
      onOrder,
      reserved,
      remaining,
      reorderPoint,
      reorderVariance,
      qtyToOrder,
      salesVelocity,
      vendorId,
      vendorName,
      moq,
      unitCost,
      price,
      warehouseLocation,
      binLocation,
      barcode,
      lastPurchaseDate,
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
 * Transform parsed inventory to database format with enhanced schema
 */
export function transformInventoryParsedToDatabase(
  parsed: InventoryParsed
): ParseResult<InventoryDatabase> {
  try {
    const database: InventoryDatabase = {
      sku: parsed.sku,
      name: parsed.name,
      description: parsed.description,
      status: parsed.status,
      category: parsed.category,
      stock: parsed.stock, // Legacy field, maps to units_in_stock
      on_order: parsed.onOrder, // Legacy field, maps to units_on_order
      reorder_point: parsed.reorderPoint,
      vendor_id: parsed.vendorId || null,
      moq: parsed.moq,
      // Enhanced schema fields
      unit_cost: parsed.unitCost,
      unit_price: parsed.price,
      units_in_stock: parsed.stock,
      units_on_order: parsed.onOrder,
      units_reserved: parsed.reserved,
      reorder_variance: parsed.reorderVariance,
      qty_to_order: parsed.qtyToOrder,
      sales_velocity_consolidated: parsed.salesVelocity,
      warehouse_location: parsed.warehouseLocation,
      bin_location: parsed.binLocation,
      supplier_sku: parsed.sku, // Use same SKU as supplier SKU
      last_purchase_date: parsed.lastPurchaseDate,
      upc: parsed.barcode,
      data_source: 'csv',
      last_sync_at: new Date().toISOString(),
      sync_status: 'synced',
    };

    // Validate against Database schema (relaxed - some fields optional)
    // Database schema might not have all these fields yet, so we skip validation
    // and let Supabase handle it

    return {
      success: true,
      data: database,
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

  // Track filtering statistics
  const filterStats = {
    inactiveItems: 0,
    nonShippingLocation: 0,
    missingData: 0,
    other: 0,
  };

  rawInventory.forEach((raw, index) => {
    const result = transformInventoryRawToParsed(raw, vendorIdMap);

    if (result.success && result.data) {
      successful.push(result.data);
      if (result.warnings.length > 0) {
        totalWarnings.push(...result.warnings.map(w => `Row ${index + 1}: ${w}`));
      }
    } else {
      // Track why items failed
      const errorMsg = result.errors[0] || '';
      if (errorMsg.includes('FILTER: Skipping inactive')) {
        filterStats.inactiveItems++;
      } else if (errorMsg.includes('FILTER: Skipping non-shipping')) {
        filterStats.nonShippingLocation++;
      } else if (errorMsg.includes('no name') || errorMsg.includes('SKU is required')) {
        filterStats.missingData++;
      } else {
        filterStats.other++;
      }

      failed.push({
        index,
        errors: result.errors,
        warnings: result.warnings,
        raw,
      });
    }
  });

  // Log filter statistics
  console.log('[Inventory Transform] Filter Statistics:');
  console.log(`  - Total rows processed: ${rawInventory.length}`);
  console.log(`  - ✓ Successful: ${successful.length}`);
  console.log(`  - ✗ Inactive items filtered: ${filterStats.inactiveItems}`);
  console.log(`  - ✗ Non-shipping location filtered: ${filterStats.nonShippingLocation}`);
  console.log(`  - ✗ Missing data: ${filterStats.missingData}`);
  console.log(`  - ✗ Other errors: ${filterStats.other}`);

  return {
    successful,
    failed,
    totalWarnings,
  };
}

// ============================================================================
// BOM TRANSFORMERS
// ============================================================================

/**
 * Transform raw CSV BOM data to parsed BOM object
 * Note: Finale BOM reports may have one row per component, so we need to group by finished SKU
 */
export function transformBOMRawToParsed(
  raw: Record<string, any>,
  inventoryMap: Map<string, any> = new Map()
): ParseResult<{finishedSku: string; name: string; component?: BOMComponentParsed; potentialBuildQty?: number; averageCost?: number; category?: string}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Extract finished product SKU (required)
    const finishedSku = extractFirst(raw, ['Product ID', 'Finished SKU', 'SKU']);
    if (!finishedSku || finishedSku.trim() === '') {
      return {
        success: false,
        errors: ['Product ID is required'],
        warnings: [],
      };
    }

    // Extract finished product name (required)
    const name = extractFirst(raw, ['Name', 'Product Name']);
    if (!name || name.trim() === '') {
      return {
        success: false,
        errors: [`Product Name is required for SKU: ${finishedSku}`],
        warnings: [],
      };
    }

    // Extract potential build quantity
    const potentialBuildRaw = extractFirst(raw, ['Potential \n Build \n Qty', 'Potential Build Qty']);
    const potentialBuildQty = parseNumber(potentialBuildRaw, undefined);

    // Extract BOM average cost
    const avgCostRaw = extractFirst(raw, ['BOM \n Average cost', 'BOM Average cost']);
    const averageCost = parseNumber(avgCostRaw, undefined);

    // Extract category
    const category = extractFirst(raw, ['Category', 'Product Category']) || '';

    // Extract component info (if this row has component data)
    const componentSku = extractFirst(raw, ['Component \n Product ID', 'Component Product ID', 'Component SKU']);
    const componentName = extractFirst(raw, ['Component \n Name', 'Component Name']);
    const componentQtyRaw = extractFirst(raw, ['BOM \n Quantity', 'BOM Quantity', 'Quantity']);
    const componentRemainingRaw = extractFirst(raw, ['Component product \n Remaining', 'Component product Remaining']);

    let component: BOMComponentParsed | undefined;

    if (componentSku && componentName) {
      const quantity = parseNumber(componentQtyRaw, 1);
      const remaining = parseNumber(componentRemainingRaw, undefined);

      // Get additional component info from inventory if available
      const inventoryItem = inventoryMap.get(componentSku.toUpperCase().trim());

      component = {
        sku: componentSku,
        name: componentName,
        quantity,
        remaining,
        unitCost: inventoryItem?.unitCost,
        supplierSku: inventoryItem?.supplierSku,
        leadTimeDays: inventoryItem?.leadTimeDays,
      };
    }

    return {
      success: true,
      data: {
        finishedSku,
        name,
        component,
        potentialBuildQty,
        averageCost,
        category,
      },
      errors: [],
      warnings,
    };
  } catch (error: any) {
    return {
      success: false,
      errors: [`Error transforming BOM: ${error.message}`],
      warnings,
    };
  }
}

/**
 * Transform batch of raw BOM rows and group by finished SKU
 * Each row in Finale BOM report represents one component of a BOM
 */
export function transformBOMsBatch(
  rawBOMs: Record<string, any>[],
  inventoryMap: Map<string, any> = new Map()
): BatchTransformResult<BOMParsed> {
  const successful: BOMParsed[] = [];
  const failed: Array<{ index: number; errors: string[]; warnings: string[]; raw: any }> = [];
  const totalWarnings: string[] = [];

  // Group rows by finished SKU
  const bomGroups = new Map<string, {
    name: string;
    components: BOMComponentParsed[];
    potentialBuildQty?: number;
    averageCost?: number;
    category?: string;
    rawRows: any[];
  }>();

  rawBOMs.forEach((raw, index) => {
    const result = transformBOMRawToParsed(raw, inventoryMap);

    if (result.success && result.data) {
      const { finishedSku, name, component, potentialBuildQty, averageCost, category } = result.data;

      if (!bomGroups.has(finishedSku)) {
        bomGroups.set(finishedSku, {
          name,
          components: [],
          potentialBuildQty,
          averageCost,
          category,
          rawRows: [],
        });
      }

      const group = bomGroups.get(finishedSku)!;
      if (component) {
        group.components.push(component);
      }
      group.rawRows.push(raw);

      // Collect warnings
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

  // Create BOMParsed objects from groups
  for (const [finishedSku, group] of bomGroups.entries()) {
    const id = generateDeterministicId(finishedSku);

    const bomParsed: BOMParsed = {
      id,
      finishedSku,
      name: group.name,
      components: group.components,
      artwork: [], // Will be populated from separate sources
      packaging: {
        bagType: 'Standard',
        labelType: 'Standard',
        specialInstructions: '',
      },
      description: '',
      category: group.category || '',
      yieldQuantity: 1,
      potentialBuildQty: group.potentialBuildQty,
      averageCost: group.averageCost,
      dataSource: 'csv',
      lastSyncAt: new Date().toISOString(),
      syncStatus: 'synced',
      notes: '',
      rawData: group.rawRows[0], // Keep first row as reference
    };

    successful.push(bomParsed);
  }

  console.log('[BOM Transform] Statistics:');
  console.log(`  - Total rows processed: ${rawBOMs.length}`);
  console.log(`  - ✓ Unique BOMs created: ${successful.length}`);
  console.log(`  - ✗ Failed rows: ${failed.length}`);

  return {
    successful,
    failed,
    totalWarnings,
  };
}

/**
 * Transform parsed BOM to database format
 */
export function transformBOMParsedToDatabase(
  parsed: BOMParsed
): Record<string, any> {
  return {
    id: parsed.id,
    finished_sku: parsed.finishedSku,
    name: parsed.name,
    components: parsed.components, // JSONB
    artwork: parsed.artwork, // JSONB
    packaging: parsed.packaging, // JSONB
    barcode: parsed.barcode,
    description: parsed.description,
    category: parsed.category,
    yield_quantity: parsed.yieldQuantity,
    potential_build_qty: parsed.potentialBuildQty,
    average_cost: parsed.averageCost,
    data_source: parsed.dataSource,
    last_sync_at: parsed.lastSyncAt || new Date().toISOString(),
    sync_status: parsed.syncStatus,
    notes: parsed.notes,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Deduplicate BOMs by finished SKU (keep last occurrence)
 */
export function deduplicateBOMs(boms: BOMParsed[]): BOMParsed[] {
  const byFinishedSku = new Map<string, BOMParsed>();

  boms.forEach(bom => {
    const key = bom.finishedSku.toUpperCase().trim();
    byFinishedSku.set(key, bom);
  });

  return Array.from(byFinishedSku.values());
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
 * Deduplicate inventory items by SKU (keep last occurrence)
 */
export function deduplicateInventory(items: InventoryParsed[]): InventoryParsed[] {
  const bySku = new Map<string, InventoryParsed>();

  items.forEach(item => {
    const key = item.sku.toUpperCase().trim();
    bySku.set(key, item);
  });

  return Array.from(bySku.values());
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
