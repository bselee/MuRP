# MuRP Schema Architecture

**Version:** 1.0
**Date:** November 4, 2025
**Purpose:** Unified data schema system for parsing, validation, and transformation

---

## Overview

The MuRP system now uses a comprehensive schema architecture that provides:

- **Single Source of Truth**: All data structures defined in one place
- **Type Safety**: Full TypeScript validation with Zod schemas
- **Lossless Transformation**: No data is lost during parsing/transformation
- **Validation**: Automatic validation at every transformation stage
- **Consistency**: Same approach for all data types (vendors, inventory, BOMs)

---

## Architecture Layers

### 1. Raw Schema
Data as it arrives from external sources (CSV columns, API responses)

```typescript
// Example: Vendor raw data from Finale CSV
{
  'Name': 'ABC Supply Co.',
  'Email address 0': 'sales@abc.com',
  'Address 0 street address': '123 Main St',
  'Address 0 city': 'Portland',
  'Phone number 0': '555-1234'
}
```

### 2. Parsed Schema
Validated and normalized data with proper types

```typescript
// Example: Parsed vendor
{
  id: '12345678-0000-4000-8000-000000000000',
  name: 'ABC Supply Co.',
  contactEmails: ['sales@abc.com'],
  phone: '555-1234',
  addressLine1: '123 Main St',
  city: 'Portland',
  state: 'OR',
  postalCode: '97201',
  addressDisplay: '123 Main St, Portland, OR, 97201',
  leadTimeDays: 7,
  source: 'csv'
}
```

### 3. Database Schema
Fields that map directly to Supabase tables

```typescript
// Example: Database insert
{
  id: '12345678-0000-4000-8000-000000000000',
  name: 'ABC Supply Co.',
  contact_emails: ['sales@abc.com'],
  phone: '555-1234',
  address: '123 Main St, Portland, OR, 97201',
  address_line1: '123 Main St',
  city: 'Portland',
  state: 'OR',
  postal_code: '97201',
  lead_time_days: 7,
  data_source: 'csv',
  last_sync_at: '2025-11-04T12:00:00Z'
}
```

### 4. Display Schema
Optimized data for UI rendering with computed fields

```typescript
// Example: Display vendor
{
  ...parsedVendor,
  primaryEmail: 'sales@abc.com',
  emailCount: 1,
  hasCompleteAddress: true,
  leadTimeFormatted: '7 days'
}
```

---

## File Structure

```
lib/schema/
├── index.ts           # Schema definitions (Zod schemas)
└── transformers.ts    # Transformation functions

supabase/migrations/
└── 002_enhance_vendor_schema.sql  # Database schema updates
```

---

## Usage Examples

### Transforming Vendor CSV Data

```typescript
import { transformVendorRawToParsed, transformVendorsBatch } from './lib/schema/transformers';

// Single vendor
const raw = { 'Name': 'ABC Co.', 'Email address 0': 'sales@abc.com', ... };
const result = transformVendorRawToParsed(raw, 0);

if (result.success) {
  console.log('Parsed vendor:', result.data);
  console.log('Warnings:', result.warnings);
} else {
  console.error('Errors:', result.errors);
}

// Batch transformation
const rawVendors = [...]; // Array of CSV rows
const batchResult = transformVendorsBatch(rawVendors);

console.log('Successful:', batchResult.successful.length);
console.log('Failed:', batchResult.failed.length);
console.log('Warnings:', batchResult.totalWarnings);
```

### Saving to Database

```typescript
import { transformVendorParsedToDatabaseEnhanced } from './lib/schema/transformers';

const parsed = { ... }; // VendorParsed object
const dbData = transformVendorParsedToDatabaseEnhanced(parsed);

await supabase.from('vendors').insert(dbData);
```

---

## Database Schema Enhancements

### Migration: 002_enhance_vendor_schema.sql

Added fields to `vendors` table:
- `address_line1` - Street address line 1
- `address_line2` - Street address line 2 (optional)
- `city` - City name
- `state` - State/region
- `postal_code` - ZIP/postal code
- `country` - Country
- `notes` - Internal notes
- `data_source` - Source of data ('manual', 'csv', 'api')
- `last_sync_at` - Last sync timestamp
- `sync_status` - Current sync status

### Auto-Generated Fields

The database includes a trigger that automatically rebuilds the `address` field from components:

```sql
CREATE TRIGGER trg_rebuild_vendor_address
  BEFORE INSERT OR UPDATE OF address_line1, address_line2, city, state, postal_code, country
  ON vendors
  FOR EACH ROW
  EXECUTE FUNCTION rebuild_vendor_address();
```

---

## Data Flow

```
External Source (CSV/API)
  ↓
Raw Data (CSV columns, API fields)
  ↓
[transformVendorRawToParsed]
  ↓
Parsed Data (validated, normalized)
  ↓
[transformVendorParsedToDatabaseEnhanced]
  ↓
Database Insert (all fields preserved)
  ↓
Supabase Storage
  ↓
[View: vendor_details]
  ↓
UI Display (with computed fields)
```

---

## Benefits

### Before (Legacy System)

- ❌ Ad-hoc parsing per data type
- ❌ Data loss (notes, split address components)
- ❌ No validation
- ❌ Inconsistent error handling
- ❌ Hard to debug
- ❌ Display issues due to missing data

### After (New Schema System)

- ✅ Unified parsing approach
- ✅ Zero data loss
- ✅ Comprehensive validation with Zod
- ✅ Consistent error/warning handling
- ✅ Full data lineage (rawData preserved)
- ✅ Perfect display (all fields available)

---

## Adding New Data Types

To add support for a new data type (e.g., Purchase Orders):

### 1. Define Schemas in `lib/schema/index.ts`

```typescript
export const PurchaseOrderRawSchema = z.object({
  'PO Number': z.string().optional(),
  'Vendor': z.string().optional(),
  // ... all CSV columns
}).passthrough();

export const PurchaseOrderParsedSchema = z.object({
  id: z.string(),
  vendorId: z.string(),
  items: z.array(...),
  // ... normalized fields
});

export const PurchaseOrderDatabaseSchema = z.object({
  id: z.string(),
  vendor_id: z.string(),
  // ... database fields
});
```

### 2. Create Transformers in `lib/schema/transformers.ts`

```typescript
export function transformPurchaseOrderRawToParsed(
  raw: Record<string, any>
): ParseResult<PurchaseOrderParsed> {
  // Extract and validate fields
  // Return ParseResult with data or errors
}

export function transformPurchaseOrderParsedToDatabase(
  parsed: PurchaseOrderParsed
): Record<string, any> {
  // Map to database fields
  // Return database insert object
}
```

### 3. Update API Handler

```typescript
// In api/finale-proxy.ts or equivalent
const { transformPurchaseOrdersBatch } = require('../lib/schema/transformers');
const batchResult = transformPurchaseOrdersBatch(rawData);
```

### 4. Update Sync Service

```typescript
// In services/finaleSyncService.ts
const { transformPurchaseOrderParsedToDatabase } = require('../lib/schema/transformers');
const dbData = transformPurchaseOrderParsedToDatabase(parsed);
await supabase.from('purchase_orders').insert(dbData);
```

---

## Validation & Error Handling

### Parse Results

All transformation functions return a `ParseResult<T>`:

```typescript
interface ParseResult<T> {
  success: boolean;       // true if transformation succeeded
  data?: T;               // Transformed data (if successful)
  errors: string[];       // Array of error messages
  warnings: string[];     // Array of warning messages
}
```

### Batch Results

Batch transformations return successful and failed items separately:

```typescript
interface BatchTransformResult<T> {
  successful: T[];                      // Successfully transformed items
  failed: Array<{                       // Failed items with details
    index: number;
    errors: string[];
    warnings: string[];
    raw: any;
  }>;
  totalWarnings: string[];              // All warnings collected
}
```

### Example: Handling Errors

```typescript
const result = transformVendorRawToParsed(raw, 0);

if (!result.success) {
  console.error('Failed to transform vendor:');
  result.errors.forEach(err => console.error(`  - ${err}`));
  // Skip this vendor or handle appropriately
}

if (result.warnings.length > 0) {
  console.warn('Transformation warnings:');
  result.warnings.forEach(warn => console.warn(`  - ${warn}`));
  // Log warnings but continue processing
}
```

---

## Helper Functions

### extractFirst
Get first meaningful value from multiple possible fields:

```typescript
const email = extractFirst(row, [
  'Email address 0',
  'Email address 1',
  'Email',
  'Contact Email'
]);
```

### extractAll
Get all meaningful values from multiple fields:

```typescript
const emails = extractAll(row, [
  'Email address 0',
  'Email address 1',
  'Email address 2',
]);
// Returns: ['sales@example.com', 'support@example.com']
```

### parseNumber / parseInt
Safe number parsing with fallback:

```typescript
const leadTime = parseInt(row['Lead time (days)'], 7);
const price = parseNumber(row['Unit Cost'], 0.0);
```

### formatAddress
Build composite address from components:

```typescript
const address = formatAddress({
  addressLine1: '123 Main St',
  city: 'Portland',
  state: 'OR',
  postalCode: '97201',
});
// Returns: '123 Main St, Portland, OR, 97201'
```

### generateDeterministicId
Create consistent UUID from string:

```typescript
const id = generateDeterministicId('ABC Supply Co.', 0);
// Always returns same UUID for same input
```

---

## Testing

### Validation Testing

```typescript
import { validateWithSchema, SchemaRegistry } from './lib/schema';

const testData = { id: '123', name: 'Test', ... };
const result = validateWithSchema(
  SchemaRegistry.Vendor.Parsed,
  testData,
  'TestVendor'
);

if (result.success) {
  console.log('Validation passed');
} else {
  console.log('Validation errors:', result.errors);
}
```

### Transformation Testing

```typescript
// Test with sample CSV data
const sampleCSV = {
  'Name': 'Test Vendor',
  'Email address 0': 'test@example.com',
  'Address 0 street address': '123 Test St',
};

const result = transformVendorRawToParsed(sampleCSV, 0);
assert(result.success === true);
assert(result.data.name === 'Test Vendor');
assert(result.data.contactEmails[0] === 'test@example.com');
```

---

## Troubleshooting

### Common Issues

**Issue**: Zod validation error

```
Error: Field 'contactEmails': Expected array, received string
```

**Solution**: Check that the field is being extracted and formatted correctly:
```typescript
// Wrong
contactEmails: row['Email address 0']

// Right
contactEmails: extractAll(row, ['Email address 0', 'Email address 1'])
```

**Issue**: Data not appearing in UI

**Solution**:
1. Check database migration was applied
2. Verify UI is using enhanced vendor view/query
3. Check that enhanced transformer is being used

**Issue**: "Column does not exist" database error

**Solution**: Apply migration `002_enhance_vendor_schema.sql` to add missing columns

---

## Migration Checklist

When deploying the new schema system:

- [ ] Install zod: `npm install zod`
- [ ] Apply database migration: `002_enhance_vendor_schema.sql`
- [ ] Deploy updated code (api/finale-proxy.ts, services/finaleSyncService.ts)
- [ ] Run manual sync to test transformation
- [ ] Check Vercel logs for transformation results
- [ ] Verify data in Supabase table editor
- [ ] Test UI display with new fields
- [ ] Monitor for warnings/errors

---

## Future Enhancements

- [ ] Add schema support for inventory items
- [ ] Add schema support for BOMs
- [ ] Add schema support for purchase orders
- [ ] Create automated tests for all transformers
- [ ] Add schema versioning for migrations
- [ ] Create UI for viewing transformation logs/warnings
- [ ] Add data quality metrics dashboard

---

## Related Documentation

- `FINALE_CSV_REPORTS.md` - CSV report integration guide
- `types/database.ts` - Database type definitions
- `types.ts` - Application type definitions

---

**For Questions**: Contact system maintainer or create an issue in the repository.
