# Adding New Finale Reports & API Integrations

**Version:** 1.0
**Date:** November 4, 2025
**Purpose:** Step-by-step guide for integrating new data types from Finale

---

## Overview

This guide shows you how to add support for new Finale data types (Inventory, BOMs, Purchase Orders, etc.) using the **unified schema system**. The system provides type-safe, validated, lossless data transformation from Finale to your database.

---

## Quick Reference: 5-Step Process

```
1. Define Schemas (lib/schema/index.ts)
   ↓
2. Create Transformers (lib/schema/transformers.ts)
   ↓
3. Add API Handler (api/finale-proxy.ts)
   ↓
4. Update Sync Service (services/finaleSyncService.ts)
   ↓
5. Test & Verify
```

---

## Method 1: CSV Report Integration (Recommended)

Use this for bulk data imports that don't change frequently (vendors, inventory, products).

### Step 1: Create Report in Finale

1. Log into Finale at `https://app.finaleinventory.com/[your-account]`
2. Navigate to **Reports** → **Create New Report**
3. Configure your report:
   - Select data type (Products, Suppliers, etc.)
   - Add all columns you need
   - Apply any filters
   - Save the report

### Step 2: Get the CSV Report URL

1. Open your saved report in Finale
2. Copy the URL from browser address bar
3. **IMPORTANT**: Replace `/pivotTableStream/` with `/pivotTable/`

```
Before: https://app.finaleinventory.com/.../pivotTableStream/123/Report.csv
After:  https://app.finaleinventory.com/.../pivotTable/123/Report.csv
```

4. Add to `.env.local`:

```bash
FINALE_INVENTORY_REPORT_URL="https://app.finaleinventory.com/.../pivotTable/123/Report.csv?format=csv"
```

### Step 3: Define Schemas

Add to `lib/schema/index.ts`:

```typescript
/**
 * Raw Inventory Schema - CSV columns from Finale report
 */
export const InventoryRawSchema = z.object({
  // Map to EXACT CSV column names (case-sensitive)
  'SKU': z.string().optional(),
  'Product Name': z.string().optional(),
  'Category': z.string().optional(),
  'Quantity On Hand': z.string().optional(),
  'Reorder Point': z.string().optional(),
  'Vendor': z.string().optional(),
  'Unit Cost': z.string().optional(),
  // Add all columns from your CSV report
}).passthrough(); // Allow additional unexpected fields

export type InventoryRaw = z.infer<typeof InventoryRawSchema>;

/**
 * Parsed Inventory Schema - Validated and normalized
 */
export const InventoryParsedSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().default('Uncategorized'),
  stock: z.number().int().min(0).default(0),
  reorderPoint: z.number().int().min(0).default(10),
  vendorId: z.string().default(''),
  vendorName: z.string().default(''),
  unitCost: z.number().min(0).default(0),
  // Type-safe, validated fields
  source: z.enum(['csv', 'api', 'manual']).default('csv'),
  rawData: z.record(z.any()).optional(), // Keep original for debugging
});

export type InventoryParsed = z.infer<typeof InventoryParsedSchema>;

/**
 * Database Inventory Schema
 */
export const InventoryDatabaseSchema = z.object({
  sku: z.string(),
  name: z.string(),
  category: z.string(),
  stock: z.number(),
  on_order: z.number(),
  reorder_point: z.number(),
  vendor_id: z.string(),
  moq: z.number(),
});

export type InventoryDatabase = z.infer<typeof InventoryDatabaseSchema>;
```

### Step 4: Create Transformers

Add to `lib/schema/transformers.ts`:

```typescript
/**
 * Transform raw CSV inventory to parsed inventory
 */
export function transformInventoryRawToParsed(
  raw: Record<string, any>,
  vendorIdMap: Map<string, string> = new Map()
): ParseResult<InventoryParsed> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Extract SKU (required)
    const sku = extractFirst(raw, ['SKU', 'sku', 'Product Code']);
    if (!sku) {
      return {
        success: false,
        errors: ['SKU is required'],
        warnings: [],
      };
    }

    // Extract name
    const name = extractFirst(raw, ['Product Name', 'Name']) || 'Unnamed Product';

    // Extract category
    const category = extractFirst(raw, ['Category', 'Product Category']) || 'Uncategorized';

    // Extract stock quantity (parse as number)
    const stockRaw = extractFirst(raw, ['Quantity On Hand', 'Stock']);
    const stock = parseInt(stockRaw, 0);

    // Extract reorder point
    const reorderRaw = extractFirst(raw, ['Reorder Point', 'Reorder Level']);
    const reorderPoint = parseInt(reorderRaw, 10);

    // Extract vendor info
    const vendorName = extractFirst(raw, ['Vendor', 'Supplier']);
    const vendorIdRaw = extractFirst(raw, ['Vendor ID', 'Supplier ID']);

    // Map vendor name to ID if we have the mapping
    let vendorId = vendorIdRaw;
    if (!vendorId && vendorName && vendorIdMap.has(vendorName.toLowerCase())) {
      vendorId = vendorIdMap.get(vendorName.toLowerCase())!;
    }

    if (!vendorId && vendorName) {
      warnings.push(`No vendor ID found for SKU ${sku}, vendor name: ${vendorName}`);
      vendorId = '';
    }

    // Extract cost
    const costRaw = extractFirst(raw, ['Unit Cost', 'Cost']);
    const unitCost = parseNumber(costRaw, 0);

    // Build parsed object
    const parsed: InventoryParsed = {
      sku,
      name,
      category,
      stock,
      reorderPoint,
      vendorId,
      vendorName,
      unitCost,
      source: 'csv',
      rawData: raw,
    };

    // Validate against Parsed schema
    const validation = validateWithSchema(InventoryParsedSchema, parsed, 'Inventory');
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
 * Batch transform inventory items
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

/**
 * Transform parsed inventory to database format
 */
export function transformInventoryParsedToDatabase(
  parsed: InventoryParsed
): Record<string, any> {
  return {
    sku: parsed.sku,
    name: parsed.name,
    category: parsed.category,
    stock: parsed.stock,
    on_order: 0, // Set from PO data
    reorder_point: parsed.reorderPoint,
    vendor_id: parsed.vendorId,
    moq: 1, // Default or from vendor data
    updated_at: new Date().toISOString(),
  };
}
```

### Step 5: Add API Handler

Add to `api/finale-proxy.ts`:

```typescript
/**
 * Get inventory from Finale CSV report
 */
async function getInventory(config: FinaleConfig) {
  console.log(`[Finale Proxy] Fetching inventory from CSV report`);

  // Get report URL from environment
  let reportUrl = process.env.FINALE_INVENTORY_REPORT_URL;
  if (!reportUrl) {
    throw new Error('FINALE_INVENTORY_REPORT_URL not configured');
  }

  // Fix URL format
  reportUrl = reportUrl.replace('/pivotTableStream/', '/pivotTable/');

  // Fetch with Basic Auth
  const authHeader = createAuthHeader(config.apiKey, config.apiSecret);
  const response = await fetch(reportUrl, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'text/csv, text/plain, */*',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch inventory report (${response.status}): ${response.statusText}`);
  }

  const csvText = await response.text();
  const rawInventory = parseCSV(csvText);

  console.log(`[Finale Proxy] Parsed ${rawInventory.length} inventory items from CSV`);
  console.log(`[Finale Proxy] CSV Headers:`, Object.keys(rawInventory[0] || {}));

  // Use schema-based transformer
  const { transformInventoryBatch, buildVendorNameToIdMap } = require('../lib/schema/transformers');

  // Build vendor name→ID map for lookup
  // (You'll need to fetch vendors first or pass this in)
  const vendorIdMap = new Map(); // TODO: Load from database

  // Transform using schema
  const batchResult = transformInventoryBatch(rawInventory, vendorIdMap);

  console.log(`[Finale Proxy] Transformation results:`, {
    successful: batchResult.successful.length,
    failed: batchResult.failed.length,
    warnings: batchResult.totalWarnings.length,
  });

  // Log failures
  if (batchResult.failed.length > 0) {
    console.warn(`[Finale Proxy] Failed to transform ${batchResult.failed.length} items:`);
    batchResult.failed.slice(0, 5).forEach(failure => {
      console.warn(`  Row ${failure.index + 1}:`, failure.errors.join('; '));
    });
  }

  return batchResult.successful;
}

// Add case to handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ... existing code ...

  switch (action) {
    case 'testConnection':
      result = await testConnection(finaleConfig);
      break;

    case 'getSuppliers':
      result = await getSuppliers(finaleConfig);
      break;

    case 'getInventory':
      result = await getInventory(finaleConfig);
      break;

    // ... other cases ...
  }
}
```

### Step 6: Update Sync Service

Add to `services/finaleSyncService.ts`:

```typescript
/**
 * Sync inventory from Finale
 */
async syncInventory(): Promise<void> {
  console.log('[FinaleSyncService] Starting inventory sync...');

  try {
    // Fetch inventory from Finale
    const inventory = await this.finaleProxyCall('getInventory');

    if (!inventory || inventory.length === 0) {
      console.warn('[FinaleSyncService] No inventory returned from Finale');
      return;
    }

    console.log(`[FinaleSyncService] Received ${inventory.length} inventory items`);

    // Save to Supabase
    await this.saveInventoryToSupabase(inventory);

    console.log('[FinaleSyncService] ✓ Inventory sync complete');
  } catch (error) {
    console.error('[FinaleSyncService] Inventory sync failed:', error);
    throw error;
  }
}

/**
 * Save inventory to Supabase
 */
private async saveInventoryToSupabase(items: InventoryParsed[]): Promise<void> {
  if (items.length === 0) return;

  const { transformInventoryParsedToDatabase } = require('../lib/schema/transformers');

  // Transform to database format
  const dbItems = items.map(transformInventoryParsedToDatabase);

  console.log(`[FinaleSyncService] Saving ${dbItems.length} items to database...`);

  // Upsert (insert or update)
  const { error } = await supabase
    .from('inventory_items')
    .upsert(dbItems, {
      onConflict: 'sku',
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`Failed to save inventory: ${error.message}`);
  }

  console.log(`[FinaleSyncService] ✓ Saved ${dbItems.length} inventory items`);
}
```

### Step 7: Test the Integration

1. **Test CSV parsing**:
   - Trigger sync from Settings page
   - Check Vercel logs for:
     - CSV headers detected
     - Number of rows parsed
     - Transformation success/failure counts

2. **Verify transformations**:
   ```
   [Finale Proxy] CSV Headers: ['SKU', 'Product Name', 'Category', ...]
   [Finale Proxy] Transformation results: { successful: 450, failed: 2, warnings: 5 }
   ```

3. **Check database**:
   - Open Supabase Table Editor
   - Verify data in `inventory_items` table
   - Check that all fields populated correctly

4. **Test UI display**:
   - Open Inventory page
   - Verify items show with all fields
   - Check for missing/incorrect data

---

## Method 2: REST API Integration

Use this for real-time data or frequent updates.

### Step 1: Review Finale API Documentation

Finale API base: `https://app.finaleinventory.com/api/`

Available endpoints:
- `/product` - Get products/inventory
- `/facility` - Get warehouses/locations
- `/purchaseOrder` - Get/create purchase orders
- `/transfer` - Get/create transfers

### Step 2: Add API Endpoint Handler

Add to `api/finale-proxy.ts`:

```typescript
/**
 * Get products from Finale REST API
 */
async function getProducts(config: FinaleConfig, limit = 100, offset = 0) {
  console.log(`[Finale Proxy] Fetching products from REST API (limit: ${limit}, offset: ${offset})`);

  const response = await finaleGet(config, `/product?limit=${limit}&offset=${offset}`);

  if (!response || !response.data) {
    throw new Error('No product data returned from Finale API');
  }

  console.log(`[Finale Proxy] Received ${response.data.length} products from API`);

  // Transform using schema system
  const { transformInventoryBatch } = require('../lib/schema/transformers');

  // Map Finale API response to our Raw schema format
  const rawInventory = response.data.map((product: any) => ({
    'SKU': product.productId || product.sku,
    'Product Name': product.productName || product.name,
    'Category': product.productCategory || product.category,
    'Quantity On Hand': String(product.quantityOnHand || 0),
    'Vendor ID': product.supplierId || product.defaultSupplier,
    'Unit Cost': String(product.unitCost || product.cost || 0),
    // Map all needed fields from API response
  }));

  const batchResult = transformInventoryBatch(rawInventory);

  return batchResult.successful;
}
```

### Step 3: Handle Pagination

For large datasets:

```typescript
/**
 * Fetch all products with pagination
 */
async function getAllProducts(config: FinaleConfig): Promise<InventoryParsed[]> {
  const allProducts: InventoryParsed[] = [];
  const pageSize = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    console.log(`[Finale Proxy] Fetching page at offset ${offset}...`);

    const products = await getProducts(config, pageSize, offset);

    allProducts.push(...products);
    hasMore = products.length === pageSize;
    offset += pageSize;

    // Rate limiting
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1s delay
    }
  }

  console.log(`[Finale Proxy] Fetched ${allProducts.length} total products`);
  return allProducts;
}
```

---

## Method 3: GraphQL Integration

For complex queries with specific field selection.

### Step 1: Define GraphQL Query

```typescript
/**
 * GraphQL query for inventory with relationships
 */
const INVENTORY_QUERY = `
  query GetInventory($limit: Int, $offset: Int) {
    products(limit: $limit, offset: $offset) {
      productId
      sku
      productName
      category
      quantityOnHand
      reorderPoint
      supplier {
        partyId
        name
        email
      }
      cost {
        unitCost
        currency
      }
      locations {
        facilityId
        quantity
      }
    }
  }
`;
```

### Step 2: Execute GraphQL Query

```typescript
/**
 * Fetch inventory via GraphQL
 */
async function getInventoryGraphQL(config: FinaleConfig) {
  const variables = {
    limit: 100,
    offset: 0,
  };

  const response = await finaleGraphQL(config, INVENTORY_QUERY, variables);

  if (!response || !response.data || !response.data.products) {
    throw new Error('No product data returned from GraphQL');
  }

  // Transform GraphQL response to Raw schema format
  const rawInventory = response.data.products.map((product: any) => ({
    'SKU': product.sku || product.productId,
    'Product Name': product.productName,
    'Category': product.category,
    'Quantity On Hand': String(product.quantityOnHand || 0),
    'Vendor': product.supplier?.name || '',
    'Vendor ID': product.supplier?.partyId || '',
    'Unit Cost': String(product.cost?.unitCost || 0),
  }));

  const { transformInventoryBatch } = require('../lib/schema/transformers');
  const batchResult = transformInventoryBatch(rawInventory);

  return batchResult.successful;
}
```

---

## Complete Example: Adding BOM Sync

Here's a full example for syncing BOMs (Bills of Materials).

### 1. Define Schemas

```typescript
// In lib/schema/index.ts

export const BOMComponentRawSchema = z.object({
  'Component SKU': z.string().optional(),
  'Component Name': z.string().optional(),
  'Quantity': z.string().optional(),
}).passthrough();

export const BOMRawSchema = z.object({
  'Finished SKU': z.string().optional(),
  'Product Name': z.string().optional(),
  'Barcode': z.string().optional(),
  'Components': z.string().optional(), // JSON string
}).passthrough();

export const BOMComponentParsedSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().min(0),
});

export const BOMParsedSchema = z.object({
  id: z.string().min(1),
  finishedSku: z.string().min(1),
  name: z.string().min(1),
  components: z.array(BOMComponentParsedSchema),
  barcode: z.string().optional(),
  source: z.enum(['csv', 'api', 'manual']).default('csv'),
});
```

### 2. Create Transformers

```typescript
// In lib/schema/transformers.ts

export function transformBOMRawToParsed(
  raw: Record<string, any>
): ParseResult<BOMParsed> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const finishedSku = extractFirst(raw, ['Finished SKU', 'SKU']);
    if (!finishedSku) {
      return { success: false, errors: ['Finished SKU is required'], warnings: [] };
    }

    const name = extractFirst(raw, ['Product Name', 'Name']) || 'Unnamed Product';
    const barcode = extractFirst(raw, ['Barcode', 'UPC']) || '';

    // Parse components (might be JSON string or separate fields)
    let components: BOMComponentParsed[] = [];
    const componentsRaw = extractFirst(raw, ['Components', 'Recipe']);

    if (componentsRaw) {
      try {
        const parsed = JSON.parse(componentsRaw);
        components = parsed.map((comp: any) => ({
          sku: comp.sku || comp.productId,
          name: comp.name || 'Unknown Component',
          quantity: parseNumber(comp.quantity, 1),
        }));
      } catch (err) {
        warnings.push(`Failed to parse components JSON for ${finishedSku}`);
      }
    }

    const id = generateDeterministicId(finishedSku);

    const parsed: BOMParsed = {
      id,
      finishedSku,
      name,
      components,
      barcode,
      source: 'csv',
    };

    const validation = validateWithSchema(BOMParsedSchema, parsed, 'BOM');
    if (!validation.success) {
      return { success: false, errors: validation.errors, warnings };
    }

    return { success: true, data: validation.data!, errors: [], warnings };
  } catch (error: any) {
    return {
      success: false,
      errors: [`Error transforming BOM: ${error.message}`],
      warnings,
    };
  }
}
```

### 3. Add API Handler

```typescript
// In api/finale-proxy.ts

async function getBOMs(config: FinaleConfig) {
  let reportUrl = process.env.FINALE_BOMS_REPORT_URL;
  if (!reportUrl) {
    throw new Error('FINALE_BOMS_REPORT_URL not configured');
  }

  reportUrl = reportUrl.replace('/pivotTableStream/', '/pivotTable/');

  const authHeader = createAuthHeader(config.apiKey, config.apiSecret);
  const response = await fetch(reportUrl, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'text/csv',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch BOM report (${response.status})`);
  }

  const csvText = await response.text();
  const rawBOMs = parseCSV(csvText);

  const { transformBOMsBatch } = require('../lib/schema/transformers');
  const batchResult = transformBOMsBatch(rawBOMs);

  console.log(`[Finale Proxy] BOM sync: ${batchResult.successful.length} success, ${batchResult.failed.length} failed`);

  return batchResult.successful;
}

// Add to handler switch
case 'getBOMs':
  result = await getBOMs(finaleConfig);
  break;
```

### 4. Update Sync Service

```typescript
// In services/finaleSyncService.ts

async syncBOMs(): Promise<void> {
  console.log('[FinaleSyncService] Starting BOM sync...');

  const boms = await this.finaleProxyCall('getBOMs');

  if (!boms || boms.length === 0) {
    console.warn('[FinaleSyncService] No BOMs returned');
    return;
  }

  await this.saveBOMsToSupabase(boms);
  console.log('[FinaleSyncService] ✓ BOM sync complete');
}

private async saveBOMsToSupabase(boms: BOMParsed[]): Promise<void> {
  const dbBOMs = boms.map(bom => ({
    id: bom.id,
    finished_sku: bom.finishedSku,
    name: bom.name,
    components: JSON.stringify(bom.components),
    barcode: bom.barcode,
    artwork: JSON.stringify([]),
    packaging: JSON.stringify({}),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('boms')
    .upsert(dbBOMs, {
      onConflict: 'finished_sku',
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`Failed to save BOMs: ${error.message}`);
  }

  console.log(`[FinaleSyncService] ✓ Saved ${dbBOMs.length} BOMs`);
}
```

---

## Troubleshooting Guide

### Issue: "Column not found in CSV"

**Cause**: CSV column names don't match schema

**Solution**:
1. Check Vercel logs for actual CSV headers
2. Update schema to match exact column names (case-sensitive)
3. Use `extractFirst()` with multiple fallback names

### Issue: "Validation failed"

**Cause**: Data doesn't match Zod schema constraints

**Solution**:
1. Check transformation function
2. Add logging to see what data is being validated
3. Adjust schema constraints or add data cleaning

### Issue: "No data returned from Finale"

**Cause**: Authentication, URL, or report misconfiguration

**Solution**:
1. Verify `FINALE_API_KEY` and `FINALE_API_SECRET` in env
2. Check report URL uses `/pivotTable/` not `/pivotTableStream/`
3. Ensure report has `?format=csv` parameter
4. Test report URL in browser (should download CSV)

### Issue: "Database insert failed"

**Cause**: Schema mismatch between transformed data and database

**Solution**:
1. Apply database migration if new fields added
2. Check database column names match transformer output
3. Verify data types match (string vs number, etc.)

---

## Best Practices

### 1. Always Use Schema System

```typescript
// ❌ BAD: Ad-hoc parsing
const vendor = {
  id: row['id'],
  name: row['name'],
  // Fragile, no validation
};

// ✅ GOOD: Schema-based
const result = transformVendorRawToParsed(row);
if (result.success) {
  // Validated, type-safe
  const vendor = result.data;
}
```

### 2. Handle Errors Gracefully

```typescript
const batchResult = transformInventoryBatch(rawData);

// Process successes
if (batchResult.successful.length > 0) {
  await saveToDatabase(batchResult.successful);
}

// Log failures
if (batchResult.failed.length > 0) {
  console.error('Failed items:', batchResult.failed);
  // Send alert, store in error log, etc.
}

// Show warnings to user
if (batchResult.totalWarnings.length > 0) {
  console.warn('Data quality warnings:', batchResult.totalWarnings);
}
```

### 3. Preserve Raw Data

Always keep `rawData` field in parsed schema:

```typescript
const parsed = {
  // ... transformed fields
  rawData: raw, // Original CSV row
};
```

Benefits:
- Debug transformation issues
- Recover lost data
- Audit data changes

### 4. Test with Small Batches First

```typescript
// Test with first 10 rows
const testData = rawData.slice(0, 10);
const result = transformInventoryBatch(testData);

if (result.failed.length === 0) {
  // All good, process full batch
  const fullResult = transformInventoryBatch(rawData);
}
```

### 5. Monitor Data Quality

Track metrics:
- Success/failure rates
- Common validation errors
- Missing vendor mappings
- Invalid data patterns

Add to sync service:

```typescript
console.log('[Sync Metrics]', {
  total: rawData.length,
  successful: batchResult.successful.length,
  failed: batchResult.failed.length,
  successRate: (batchResult.successful.length / rawData.length * 100).toFixed(2) + '%',
  warnings: batchResult.totalWarnings.length,
});
```

---

## Checklist for New Integration

- [ ] Define Raw schema (CSV columns)
- [ ] Define Parsed schema (validated types)
- [ ] Define Database schema (DB columns)
- [ ] Create transformer functions
- [ ] Add batch processing
- [ ] Create API handler function
- [ ] Add to handler switch statement
- [ ] Update sync service
- [ ] Add sync method
- [ ] Add database save method
- [ ] Test CSV parsing
- [ ] Test transformations
- [ ] Test database inserts
- [ ] Test UI display
- [ ] Document new endpoint
- [ ] Update types.ts if needed

---

## Reference

- **Schema docs**: `SCHEMA_ARCHITECTURE.md`
- **CSV reports**: `FINALE_CSV_REPORTS.md`
- **Finale API**: https://support.finaleinventory.com/hc/en-us/articles/115001687154

---

**Questions?** Check troubleshooting section or create an issue in the repository.
