# Data Acquisition & Parsing Analysis

**Date:** 2025-12-12
**Status:** Current Issues & Recommendations

---

## Executive Summary

The MuRP system currently has **multiple data acquisition paths** with **inconsistent filtering logic**, leading to data quality issues. This document analyzes the current state and provides actionable recommendations for a unified, flawless data flow.

---

## Current Data Acquisition Paths

### 1. Finale API Integration (Primary - Current User)

**File:** `services/finaleSyncService.ts`
**Flow:**
```
Finale API → Edge Function → 4-layer transformers → Database
```

**Filtering Applied** (`lib/schema/transformers.ts:360-390`):
- ✅ **Inactive items** - Filtered by `status_name = 'Active'`
- ✅ **Dropshipped items** - Filtered by `dropshipped = 'yes'`
- ✅ **Non-shipping locations** - Filtered if warehouse location not = 'Shipping'
- ✅ **Deprecated categories** - Filtered if category contains 'inactive', 'deprecating'
- ✅ **Missing data** - Filtered if no SKU or name

**Issues:**
- ❌ Filters are hardcoded in transformers (not user-configurable)
- ❌ No visibility into what was filtered (only console logs)
- ❌ Filter logic scattered across multiple functions
- ❌ No way to preview filtered data before import

### 2. Google Sheets Import (Secondary - For Other Users)

**File:** `services/googleSheetsSyncService.ts`
**Flow:**
```
Google Sheets → Parse rows → Auto-detect columns → Database
```

**Current Implementation:**
- ✅ Auto-detects columns from headers (lines 90)
- ✅ Supports 3 merge strategies: replace, add_new, update_existing
- ✅ Creates backup before import
- ✅ Row-by-row error tracking

**Issues:**
- ❌ **NO FILTERING APPLIED** - All data imported regardless of status
- ❌ No validation against Finale filters (inactive, dropship)
- ❌ Column auto-detection can be unreliable
- ❌ No template enforcement (only example template provided)

### 3. CSV/Excel Upload (UI Demo Only)

**File:** `components/ImportExportModal.tsx`
**Status:** **NOT FUNCTIONAL** - UI demonstration only (line 69)

**Template Provided** (lines 18-27):
```typescript
{
  sku: "COMP-001",
  name: "Worm Castings (1 lb)",
  category: "Amendments",
  stock: 500,
  onOrder: 100,
  reorderPoint: 200,
  vendorId: 'VEND-001',
  moq: 50
}
```

**Issues:**
- ❌ **NOT IMPLEMENTED** - File upload doesn't work
- ❌ No backend handler for CSV uploads
- ❌ Template is minimal (doesn't match Finale schema)

---

## Current Filtering Logic (Finale Only)

### Filter Application Points

**Location:** `lib/schema/transformers.ts`

#### Inventory Filtering (lines 360-390)

```typescript
// FILTER 1: Inactive items
if (status_name !== 'Active') {
  return { success: false, errors: ['FILTER: Skipping inactive item'] };
}

// FILTER 2: Dropshipped items
if (dropshipped === 'yes') {
  return { success: false, errors: ['FILTER: Skipping dropshipped item'] };
}

// FILTER 3: Non-shipping locations
// Currently commented out or optional - inconsistent

// FILTER 4: Deprecated categories
if (category.includes('inactive') || category.includes('deprecating')) {
  return { success: false, errors: ['FILTER: Skipping deprecated category'] };
}
```

#### BOM Filtering (line 762)

```typescript
// FILTER: Only create BOMs for active inventory items
if (!inventoryMap.has(finishedSku)) {
  return { success: false, errors: ['FILTER: Skipping BOM for inactive parent SKU'] };
}
```

### Filter Statistics Tracking (lines 680-725)

```typescript
const filterStats = {
  inactiveItems: 0,
  nonShippingLocation: 0,
  missingData: 0,
  other: 0
};
```

**Issues:**
- ❌ Statistics only logged to console (not visible to users)
- ❌ No database tracking of filtered items
- ❌ No UI to review filtered items before sync
- ❌ No way to override filters for specific items

---

## Problems with Current System

### 1. Inconsistent Filtering

| Data Source | Inactive Filter | Dropship Filter | Category Filter | Validation |
|-------------|----------------|----------------|----------------|-----------|
| Finale API | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Zod schemas |
| Google Sheets | ❌ No | ❌ No | ❌ No | ⚠️ Basic only |
| CSV Upload | ❌ Not implemented | ❌ Not implemented | ❌ Not implemented | ❌ None |

**Result:** Users can bypass filters by using Google Sheets, leading to:
- Inactive items in database
- Dropship items incorrectly managed
- Deprecated categories mixed with active data

### 2. No User Control

**Current State:**
- Filters are hardcoded in `transformers.ts`
- No UI to configure which filters to apply
- No way to see filtered items
- No ability to whitelist specific SKUs

**Example:** User wants to import a dropshipped item for tracking purposes, but the filter prevents it entirely.

### 3. No Visibility

**What Users Can't See:**
- How many items were filtered during sync
- Which specific items were filtered and why
- Filter statistics over time
- Comparison of source data vs. imported data

### 4. Template Issues

**Current Template** (`ImportExportModal.tsx:18-27`):
- ✅ Provides basic structure
- ❌ Doesn't match Finale's column names
- ❌ Missing critical fields (status, dropship, location)
- ❌ No validation rules documented
- ❌ Not downloadable in proper format

### 5. No Unified Pipeline

**Current State:** 3 separate code paths
```
Finale → finaleSyncService.ts → transformers.ts → Database
Google Sheets → googleSheetsSyncService.ts → Database
CSV → Not implemented
```

**Result:**
- Duplicate code for parsing
- Inconsistent validation
- Different error handling
- No centralized filtering

---

## Recommended Solutions

### Solution 1: Unified Data Acquisition Pipeline

**Create:** `services/unifiedDataAcquisitionService.ts`

```typescript
interface DataAcquisitionPipeline {
  // Step 1: Acquire data from source
  acquire(source: DataSource): Promise<RawData[]>;

  // Step 2: Apply user-configured filters
  filter(data: RawData[], filters: FilterConfig): FilterResult;

  // Step 3: Transform through 4-layer schema
  transform(data: RawData[]): TransformResult;

  // Step 4: Validate and preview
  validate(data: ParsedData[]): ValidationResult;

  // Step 5: User confirms and imports
  import(data: ParsedData[], options: ImportOptions): ImportResult;
}
```

**Benefits:**
- ✅ Single code path for all data sources
- ✅ Consistent filtering across all sources
- ✅ Unified error handling
- ✅ Centralized validation

### Solution 2: User-Configurable Filters

**Create:** `components/DataAcquisitionFilters.tsx`

**UI Features:**
```typescript
interface FilterConfig {
  // Status filtering
  includeInactive: boolean;
  includeDropship: boolean;

  // Category filtering
  excludedCategories: string[];  // ['deprecating', 'inactive']
  includedCategories: string[];  // [] = all

  // Location filtering
  allowedLocations: string[];  // ['Shipping', 'Warehouse A']

  // Custom rules
  customRules: FilterRule[];
}

interface FilterRule {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'greaterThan';
  value: string | number;
  action: 'include' | 'exclude';
}
```

**Database Table:**
```sql
CREATE TABLE data_acquisition_profiles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  profile_name TEXT NOT NULL,
  data_source TEXT,  -- 'finale', 'google_sheets', 'csv'
  filter_config JSONB NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Benefits:**
- ✅ Users control which data to import
- ✅ Different profiles for different use cases
- ✅ Saved configurations for repeated imports
- ✅ Override filters for specific imports

### Solution 3: Filter Preview & Audit

**Create:** `components/DataAcquisitionPreview.tsx`

**UI Components:**

1. **Pre-Import Summary**
```
┌─────────────────────────────────────────┐
│ Import Preview                          │
├─────────────────────────────────────────┤
│ Total items in source:        1,234     │
│ ✓ Items to import:              856     │
│ ✗ Items filtered:                378     │
│                                         │
│ Filter Breakdown:                       │
│   - Inactive items:              245     │
│   - Dropshipped:                  89     │
│   - Deprecated categories:        32     │
│   - Missing data:                 12     │
│                                         │
│ [View Filtered Items] [Configure Filters]│
└─────────────────────────────────────────┘
```

2. **Filtered Items Table**
```typescript
interface FilteredItem {
  sku: string;
  name: string;
  reason: string;  // "Inactive status"
  source_value: any;  // Original data for debugging
  can_override: boolean;
}
```

**Database Tracking:**
```sql
CREATE TABLE data_acquisition_audit (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  data_source TEXT NOT NULL,
  import_timestamp TIMESTAMPTZ DEFAULT NOW(),

  -- Statistics
  total_rows_source INT,
  rows_imported INT,
  rows_filtered INT,
  rows_failed INT,

  -- Detailed breakdown
  filter_breakdown JSONB,  -- {inactive: 245, dropship: 89, ...}

  -- Filtered items (for review)
  filtered_items JSONB[],

  -- Configuration used
  filter_config JSONB,

  -- Result
  status TEXT,  -- 'success', 'partial', 'failed'
  errors TEXT[]
);
```

**Benefits:**
- ✅ Users see what will be imported BEFORE confirming
- ✅ Full audit trail of all imports
- ✅ Ability to review filtered items
- ✅ Override filters for specific items if needed

### Solution 4: Enhanced CSV/Excel Template

**Create:** `public/templates/inventory_import_template.xlsx`

**Template Structure:**

| Column | Required | Example | Validation | Description |
|--------|----------|---------|-----------|-------------|
| sku | ✅ Yes | COMP-001 | Unique, no spaces | Product SKU |
| name | ✅ Yes | Worm Castings (1 lb) | Max 255 chars | Product name |
| category | ⚠️ Recommended | Amendments | From list | Product category |
| stock | ✅ Yes | 500 | Integer ≥ 0 | Current stock |
| on_order | ⚠️ Optional | 100 | Integer ≥ 0 | Qty on order |
| reorder_point | ✅ Yes | 200 | Integer ≥ 0 | Reorder threshold |
| reorder_quantity | ⚠️ Recommended | 500 | Integer > 0 | Order qty |
| moq | ⚠️ Optional | 50 | Integer > 0 | Minimum order |
| vendor_name | ⚠️ Recommended | ABC Supply | Text | Vendor name |
| unit_cost | ⚠️ Optional | 12.50 | Decimal ≥ 0 | Cost per unit |
| status | ✅ Yes | Active | Active/Inactive | Item status |
| dropship | ⚠️ Optional | No | Yes/No | Dropship item? |
| location | ⚠️ Optional | Shipping | Text | Warehouse location |

**Validation Sheet** (separate tab):
```
Rules:
1. SKU must be unique across all items
2. Stock cannot be negative
3. If status = 'Inactive', item will be filtered (unless override enabled)
4. If dropship = 'Yes', item will be filtered (unless override enabled)
5. Vendor name must match existing vendor (or will create new vendor)
```

**Implementation:**
```typescript
// Enhanced template download
function downloadEnhancedTemplate() {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Template with example data
  const templateData = [
    {
      sku: 'COMP-001',
      name: 'Worm Castings (1 lb)',
      category: 'Amendments',
      stock: 500,
      on_order: 100,
      reorder_point: 200,
      reorder_quantity: 500,
      moq: 50,
      vendor_name: 'ABC Supply',
      unit_cost: 12.50,
      status: 'Active',
      dropship: 'No',
      location: 'Shipping'
    }
  ];
  const ws1 = XLSX.utils.json_to_sheet(templateData);
  XLSX.utils.book_append_sheet(workbook, ws1, 'Inventory Template');

  // Sheet 2: Validation rules
  const rulesData = [
    { Field: 'sku', Required: 'Yes', Validation: 'Unique, no spaces' },
    { Field: 'name', Required: 'Yes', Validation: 'Max 255 characters' },
    // ... all fields
  ];
  const ws2 = XLSX.utils.json_to_sheet(rulesData);
  XLSX.utils.book_append_sheet(workbook, ws2, 'Validation Rules');

  // Download
  XLSX.writeFile(workbook, 'MuRP_Inventory_Import_Template.xlsx');
}
```

**Benefits:**
- ✅ Matches database schema exactly
- ✅ Clear validation rules
- ✅ Example data included
- ✅ Works with Excel and Google Sheets
- ✅ Multi-sheet for instructions

### Solution 5: CSV/Excel Upload Implementation

**Create:** `supabase/functions/csv-import/index.ts`

**Flow:**
```
User uploads CSV/Excel
  ↓
Parse file (browser-side with XLSX library)
  ↓
Validate against schema
  ↓
Preview + filter configuration
  ↓
User confirms
  ↓
Send to Edge Function
  ↓
Run through unified pipeline
  ↓
Import to database
  ↓
Show results + audit log
```

**Implementation:**
```typescript
// Frontend: File upload handler
async function handleFileUpload(file: File) {
  // Parse file
  const workbook = XLSX.read(await file.arrayBuffer());
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);

  // Run through unified pipeline
  const pipeline = new UnifiedDataAcquisitionPipeline();

  // Step 1: Acquire (already done - data from file)

  // Step 2: Filter (with user config)
  const filterConfig = await getUserFilterConfig('csv');
  const filterResult = pipeline.filter(data, filterConfig);

  // Step 3: Transform
  const transformResult = pipeline.transform(filterResult.data);

  // Step 4: Validate
  const validationResult = pipeline.validate(transformResult.data);

  // Step 5: Show preview
  setPreviewData({
    total: data.length,
    toImport: validationResult.valid.length,
    filtered: filterResult.filtered.length,
    failed: validationResult.invalid.length,
    filterBreakdown: filterResult.breakdown
  });

  // Wait for user confirmation
  await showPreviewModal();

  // Step 6: Import
  const importResult = await pipeline.import(validationResult.valid, {
    createBackup: true,
    mergeStrategy: 'update_existing'
  });

  // Show results
  showResultsModal(importResult);
}
```

**Benefits:**
- ✅ Full CSV/Excel upload functionality
- ✅ Client-side parsing (no file upload to server)
- ✅ Consistent with other acquisition methods
- ✅ Same filtering and validation

---

## Implementation Plan

### Phase 1: Unified Pipeline (Week 1)

**Tasks:**
1. ✅ Create `services/unifiedDataAcquisitionService.ts`
2. ✅ Extract filter logic from transformers to separate `filterData()` function
3. ✅ Refactor Finale sync to use unified pipeline
4. ✅ Refactor Google Sheets sync to use unified pipeline
5. ✅ Add unit tests for filtering logic

**Deliverables:**
- Unified service with single code path
- All existing functionality preserved
- Consistent filtering across all sources

### Phase 2: User-Configurable Filters (Week 2)

**Tasks:**
1. ✅ Create database table: `data_acquisition_profiles`
2. ✅ Create UI component: `DataAcquisitionFilters.tsx`
3. ✅ Implement save/load filter configurations
4. ✅ Add default filter profiles (Finale-style, Open, Custom)
5. ✅ Integrate with unified pipeline

**Deliverables:**
- Filter configuration UI
- Saved filter profiles
- Override capabilities

### Phase 3: Preview & Audit (Week 2-3)

**Tasks:**
1. ✅ Create database table: `data_acquisition_audit`
2. ✅ Create UI component: `DataAcquisitionPreview.tsx`
3. ✅ Implement pre-import preview
4. ✅ Add filtered items review table
5. ✅ Create audit log viewer

**Deliverables:**
- Pre-import preview modal
- Filtered items review
- Complete audit trail

### Phase 4: Enhanced Template (Week 3)

**Tasks:**
1. ✅ Create multi-sheet Excel template
2. ✅ Add validation rules sheet
3. ✅ Update `ImportExportModal.tsx` to download new template
4. ✅ Create documentation for template usage
5. ✅ Add column mapping UI for custom templates

**Deliverables:**
- Professional Excel template
- Template documentation
- Flexible column mapping

### Phase 5: CSV/Excel Upload (Week 4)

**Tasks:**
1. ✅ Implement file upload in `ImportExportModal.tsx`
2. ✅ Add XLSX parsing logic
3. ✅ Integrate with unified pipeline
4. ✅ Add edge function for server-side processing (if needed)
5. ✅ Add progress indicators and error handling

**Deliverables:**
- Functional CSV/Excel upload
- Same quality as Finale integration
- Complete documentation

---

## Success Metrics

### Data Quality
- ✅ 100% consistency: Same filters applied regardless of source
- ✅ Zero unintended imports: All filtered items reviewed before import
- ✅ Full traceability: Complete audit log of all imports

### User Experience
- ✅ Clear visibility: Users see exactly what will be imported
- ✅ Control: Users can configure filters for their needs
- ✅ Flexibility: Override filters when necessary
- ✅ Guidance: Clear templates and documentation

### System Reliability
- ✅ Single code path: Easier to maintain and test
- ✅ Comprehensive validation: Zod schemas at every step
- ✅ Error handling: Graceful degradation and recovery
- ✅ Performance: Efficient batch processing

---

## File Structure

```
services/
├── unifiedDataAcquisitionService.ts    # NEW: Core pipeline
├── dataFilterService.ts                # NEW: Filter logic
├── finaleSyncService.ts                # REFACTORED: Uses pipeline
├── googleSheetsSyncService.ts          # REFACTORED: Uses pipeline
└── csvImportService.ts                 # NEW: CSV upload

components/
├── DataAcquisitionFilters.tsx          # NEW: Filter config UI
├── DataAcquisitionPreview.tsx          # NEW: Preview modal
├── ImportExportModal.tsx               # ENHANCED: Full upload
└── DataAuditLog.tsx                    # NEW: Audit viewer

lib/schema/
├── transformers.ts                     # REFACTORED: Remove hardcoded filters
└── filters.ts                          # NEW: Reusable filter functions

public/templates/
└── MuRP_Inventory_Import_Template.xlsx # NEW: Enhanced template

supabase/migrations/
└── 092_data_acquisition_system.sql     # NEW: Tables for filters & audit
```

---

## Quick Wins (Immediate Actions)

### 1. Make Filters Visible (1 day)

**Change:** Add console.log filter stats to UI

```typescript
// In finaleSyncService.ts after sync
showToast(`
  Sync complete!
  ✓ Imported: ${successful.length}
  ✗ Filtered: ${filtered.length}
    - Inactive: ${filterStats.inactiveItems}
    - Dropship: ${filterStats.dropshipItems}
`);
```

### 2. Standardize Google Sheets Import (1 day)

**Change:** Apply same filters to Google Sheets

```typescript
// In googleSheetsSyncService.ts
const filteredItems = items.filter(item => {
  // Apply same logic as Finale transformers
  if (item.status !== 'Active') return false;
  if (item.dropship === 'Yes') return false;
  return true;
});
```

### 3. Fix CSV Template (2 hours)

**Change:** Update template to match actual schema

```typescript
const templateData = [{
  sku: "COMP-001",
  name: "Worm Castings (1 lb)",
  category: "Amendments",
  stock: 500,
  on_order: 100,
  reorder_point: 200,
  reorder_quantity: 500,
  moq: 50,
  vendor_name: "ABC Supply",
  unit_cost: 12.50,
  status: "Active",           // ADD THIS
  dropship: "No",             // ADD THIS
  location: "Shipping"        // ADD THIS
}];
```

### 4. Document Current Filters (1 hour)

**Create:** `docs/DATA_FILTERS.md`

```markdown
# Current Data Filters

When importing from Finale, the following items are automatically filtered:

1. **Inactive Items**: status_name ≠ 'Active'
2. **Dropshipped Items**: dropshipped = 'yes'
3. **Deprecated Categories**: category contains 'inactive' or 'deprecating'
4. **Missing Data**: No SKU or name provided

To see filtered items, check the Vercel logs after sync.
```

---

## Conclusion

The current data acquisition system has **inconsistent filtering** and **no user visibility**. The recommended solution is a **unified pipeline** with **user-configurable filters** and **comprehensive preview/audit capabilities**.

**Immediate actions:**
1. Make filters visible to users
2. Standardize Google Sheets filtering
3. Fix CSV template
4. Document current behavior

**Long-term implementation:**
- Phase 1: Unified pipeline (1 week)
- Phase 2: User-configurable filters (1 week)
- Phase 3: Preview & audit (1-2 weeks)
- Phase 4: Enhanced template (1 week)
- Phase 5: CSV upload (1 week)

**Total timeline:** 4-6 weeks for complete implementation

---

**Next Steps:**
1. Review and approve recommendations
2. Prioritize phases
3. Begin implementation with Phase 1
