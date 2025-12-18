# Manual Data Upload Strategy

**Purpose:** Excellent user experience for CSV/Excel/Google Sheets uploads
**Philosophy:** Simple, fast, minimal barriers - assume user knows their data

---

## Core Principles

### 1. **Manual Uploads ≠ Finale Sync**

| Aspect | Manual Upload (CSV/Excel/Sheets) | Finale API Sync |
|--------|----------------------------------|-----------------|
| **Data Source** | User curated, intentional | External system, automated |
| **Filtering Needed** | ❌ Minimal - assume active | ✅ Heavy - filter inactive/dropship |
| **Validation** | ⚠️ Format only | ✅ Business rules + format |
| **Presentation** | Show all uploaded | Show recent/relevant first |
| **User Intent** | "I want to import THIS" | "Keep me synced automatically" |
| **First Upload** | New data baseline | Initial sync |
| **Subsequent Uploads** | Delta/merge by choice | Auto-merge with filters |

### 2. **Upload Flow Philosophy**

**Goal:** 4 simple steps, no barriers

```
1. Upload File → 2. Match Columns → 3. Review Data → 4. Commit
   (drag & drop)    (auto-detect)      (preview)       (one click)
```

**No complex filtering, no heavy validation, just:**
- ✅ File format validation (is it valid CSV/Excel?)
- ✅ Column mapping (auto-detect with manual override)
- ✅ Preview before commit
- ✅ Clear error messages if data is malformed

**Assume:**
- All items are Active (unless user specifies Status column)
- All items should be imported (no dropship filtering)
- User has already cleaned their data

### 3. **Template Strategy**

**Provide:**
- ✅ Comprehensive template with ALL columns
- ✅ 10-15 example rows showing proper format
- ✅ Clear column headers matching database schema
- ✅ Instructions tab explaining each field
- ✅ Validation rules tab (what's required, format expectations)

**Make it downloadable:**
- Excel (.xlsx) with multiple sheets (Data, Instructions, Validation Rules)
- CSV with example data
- Google Sheets template (shareable link)

---

## Upload Flow Design

### Step 1: Upload File

**UI:**
```
┌─────────────────────────────────────────────────────────┐
│  Upload Your Inventory Data                             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│    ┌──────────────────────────────────────────┐         │
│    │                                           │         │
│    │      📄 Drag & Drop File Here            │         │
│    │                                           │         │
│    │      or click to browse                  │         │
│    │                                           │         │
│    │   Supports: CSV, Excel (.xlsx), TSV      │         │
│    └──────────────────────────────────────────┘         │
│                                                          │
│  Don't have a file yet?                                 │
│  📥 [Download Template] (Excel with examples)           │
│  📋 [Download CSV Template] (Simple CSV)                │
│  🔗 [Copy Google Sheets Template]                       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Backend:**
- Parse file immediately (XLSX.read or CSV parse)
- Show file info: name, size, rows detected
- Auto-advance to Step 2 on success

### Step 2: Match Columns

**UI:**
```
┌─────────────────────────────────────────────────────────┐
│  Match Columns (Auto-detected)                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ✅ Detected 250 rows with 12 columns                   │
│                                                          │
│  Your Column          →    MuRP Field                   │
│  ───────────────────────────────────────────────────    │
│  SKU                  →    ✅ sku (required)            │
│  Product Name         →    ✅ name (required)           │
│  Qty                  →    ✅ stock (required)          │
│  Min                  →    ✅ reorder_point (required)  │
│  Category             →    category                     │
│  Vendor               →    vendor_name                  │
│  Cost                 →    unit_cost                    │
│  [Unmapped Column]    →    [Select field...] ▼         │
│                                                          │
│  ⚠️ Missing required: reorder_quantity                  │
│     [Set default value: 100] or [Skip this field]       │
│                                                          │
│  [← Back]                          [Continue →]         │
└─────────────────────────────────────────────────────────┘
```

**Auto-detection logic:**
```typescript
const columnMappings = {
  sku: ['sku', 'product code', 'item code', 'product_code'],
  name: ['name', 'product name', 'item name', 'description'],
  stock: ['stock', 'quantity', 'qty', 'on hand', 'current stock'],
  reorder_point: ['reorder point', 'min', 'minimum', 'min qty'],
  reorder_quantity: ['reorder qty', 'order qty', 'reorder amount'],
  category: ['category', 'type', 'product type'],
  vendor_name: ['vendor', 'supplier', 'vendor name'],
  unit_cost: ['cost', 'unit cost', 'price', 'unit price'],
  // ... all fields
};
```

### Step 3: Review Data

**UI:**
```
┌─────────────────────────────────────────────────────────┐
│  Review Your Data                                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Import Strategy (First Upload):                        │
│  ◉ New Import - Add all items as new                   │
│  ○ Merge - Update existing SKUs, add new ones          │
│  ○ Replace All - Delete existing, import fresh ⚠️       │
│                                                          │
│  Preview (showing first 10 of 250):                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │ SKU      │ Name          │ Stock │ Reorder │ ✓   │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ WC-001   │ Worm Castings │ 500   │ 200     │ ✅  │   │
│  │ KM-002   │ Kelp Meal     │ 250   │ 100     │ ✅  │   │
│  │ error    │ Missing name  │ 0     │ 0       │ ❌  │   │
│  │ ...      │ ...           │ ...   │ ...     │     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ✅ 247 items ready to import                           │
│  ❌ 3 items have errors (click to fix)                  │
│                                                          │
│  [← Back to Edit]              [Commit Import →]        │
└─────────────────────────────────────────────────────────┘
```

**Validation (Minimal):**
- ✅ Required fields present (SKU, name, stock, reorder_point)
- ✅ SKU uniqueness within upload
- ✅ Numbers are valid (stock >= 0, reorder_point >= 0)
- ⚠️ Warnings for optional fields missing (not blocking)

**No filtering:**
- Don't check if active/inactive
- Don't filter dropship
- Don't check categories
- User uploaded it = user wants it

### Step 4: Commit

**UI:**
```
┌─────────────────────────────────────────────────────────┐
│  Importing...                                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [████████████████──────────] 247/250 (98%)             │
│                                                          │
│  Importing items to database...                         │
│                                                          │
└─────────────────────────────────────────────────────────┘

↓ (On Success)

┌─────────────────────────────────────────────────────────┐
│  ✅ Import Complete!                                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  📊 Results:                                            │
│  • 247 items imported successfully                      │
│  • 3 items skipped due to errors                        │
│  • 0 items updated (first upload)                       │
│                                                          │
│  📋 [Download Error Report] (3 items)                   │
│                                                          │
│  [View Inventory →]         [Import More Data]          │
└─────────────────────────────────────────────────────────┘
```

**Backend:**
- Create backup (automatic)
- Insert in batch (1000 items at a time for performance)
- Handle SKU conflicts based on strategy
- Log to audit table
- Return detailed results

---

## Template Design

### Excel Template Structure

**Sheet 1: Data (with examples)**

| sku | name | description | category | stock | on_order | reorder_point | reorder_quantity | moq | vendor_name | vendor_email | unit_cost | unit_price | location | notes |
|-----|------|-------------|----------|-------|----------|---------------|------------------|-----|-------------|--------------|-----------|------------|----------|-------|
| WC-001 | Worm Castings 1lb | Premium earthworm castings for soil health | Amendments | 500 | 100 | 200 | 500 | 50 | Worm Farm LLC | orders@wormfarm.com | 2.50 | 5.99 | Warehouse A | Popular item |
| KM-002 | Kelp Meal 5lb | Cold-processed Norwegian kelp | Amendments | 250 | 0 | 100 | 300 | 25 | Ocean Harvest | info@oceanharvest.com | 8.75 | 18.99 | Warehouse A | Seasonal |
| BM-003 | Bat Guano 2lb | High nitrogen bat guano | Amendments | 150 | 50 | 75 | 200 | 20 | Cave Nutrients | sales@cavenutrients.com | 6.25 | 14.99 | Warehouse B | Handle with care |
| EM-004 | Beneficial Microbes | Soil inoculant blend | Biologicals | 300 | 0 | 150 | 400 | 30 | BioCultures Inc | support@biocultures.com | 12.00 | 29.99 | Refrigerated | Keep cool |
| NPK-001 | NPK Fertilizer 10lb | Balanced 10-10-10 organic blend | Fertilizers | 400 | 200 | 200 | 600 | 40 | Green Solutions | orders@greensolutions.com | 15.50 | 34.99 | Warehouse A | Best seller |
| SEED-001 | Cover Crop Mix | Clover, rye, vetch blend | Seeds | 100 | 50 | 50 | 150 | 10 | Seed Savers | info@seedsavers.org | 4.25 | 9.99 | Warehouse C | Spring only |
| TOOL-001 | Soil Probe | Stainless steel soil probe | Tools | 75 | 0 | 25 | 50 | 5 | Garden Tools Co | sales@gardentools.com | 18.00 | 39.99 | Warehouse B | |
| PKG-001 | 1 Gallon Grow Bag | Fabric grow bag with handles | Packaging | 1000 | 500 | 500 | 2000 | 100 | Packaging Plus | bulk@packagingplus.com | 0.75 | 2.49 | Warehouse D | High volume |
| LABEL-001 | Product Labels | 4x6 waterproof labels | Packaging | 500 | 0 | 200 | 1000 | 100 | Label Pros | orders@labelpros.com | 0.15 | 0.35 | Office | Per 100 |
| TEST-001 | Soil Test Kit | NPK + pH test kit | Equipment | 50 | 20 | 25 | 75 | 10 | Lab Supply Co | info@labsupply.com | 22.50 | 49.99 | Warehouse B | Expiration date matters |

**Sheet 2: Instructions**

```
MuRP Inventory Import Template
===============================

REQUIRED COLUMNS (must have data):
- sku: Unique product code (no duplicates)
- name: Product name
- stock: Current quantity on hand (must be >= 0)
- reorder_point: Minimum quantity before reorder (must be >= 0)

RECOMMENDED COLUMNS:
- reorder_quantity: How much to order when below reorder point
- vendor_name: Supplier name
- unit_cost: Your cost per unit
- category: Product category for organization

OPTIONAL COLUMNS:
- description: Detailed product description
- on_order: Quantity currently on order
- moq: Minimum order quantity from vendor
- vendor_email: Vendor contact email
- unit_price: Selling price per unit
- location: Warehouse/storage location
- notes: Any additional notes

DATA FORMATS:
- Numbers: Just the number (no currency symbols, no commas)
  ✅ Good: 12.50
  ❌ Bad: $12.50 or 1,250

- Text: Any text is fine
  ✅ Good: Worm Castings 1lb
  ✅ Also good: Worm Castings (1 lb)

- Blanks: Leave optional fields blank if no data
  ✅ Good: (empty cell)
  ❌ Bad: N/A or NULL

TIPS:
1. Don't change column headers - MuRP auto-detects them
2. Delete example rows before adding your data
3. SKUs must be unique (no duplicates)
4. Save as Excel (.xlsx) or CSV
5. First upload assumes all items are active
```

**Sheet 3: Validation Rules**

```
Column Validation Rules
========================

sku:
  - Required: Yes
  - Format: Text, max 50 characters
  - Must be unique
  - Examples: WC-001, PROD-12345, SKU_ABC

name:
  - Required: Yes
  - Format: Text, max 255 characters
  - Examples: Worm Castings 1lb, Kelp Meal Organic

stock:
  - Required: Yes
  - Format: Integer >= 0
  - Examples: 0, 100, 1000

reorder_point:
  - Required: Yes
  - Format: Integer >= 0
  - Should be < stock for well-stocked items
  - Examples: 50, 100, 200

reorder_quantity:
  - Required: Recommended
  - Format: Integer > 0
  - Should be >= reorder_point
  - Examples: 100, 500, 1000

unit_cost:
  - Required: No
  - Format: Decimal >= 0, max 2 decimal places
  - Examples: 2.50, 12.00, 125.99

vendor_name:
  - Required: No
  - Format: Text, max 255 characters
  - Will create new vendor if doesn't exist
  - Examples: ABC Supply Co, Ocean Harvest LLC
```

---

## Subsequent Uploads (Delta/Merge Logic)

### Upload Strategy Options

**1. Merge (Default for subsequent uploads)**
```typescript
For each row in upload:
  if (SKU exists in database):
    // Update existing item
    UPDATE inventory_items
    SET
      name = uploaded.name,
      stock = uploaded.stock,
      reorder_point = uploaded.reorder_point,
      // ... other fields
      updated_at = NOW()
    WHERE sku = uploaded.sku
  else:
    // Add new item
    INSERT INTO inventory_items (sku, name, stock, ...)
    VALUES (uploaded.sku, uploaded.name, uploaded.stock, ...)
```

**2. Delta (Add New Only)**
```typescript
For each row in upload:
  if (SKU does NOT exist in database):
    // Add new item only
    INSERT INTO inventory_items (sku, name, stock, ...)
    VALUES (uploaded.sku, uploaded.name, uploaded.stock, ...)
  else:
    // Skip existing SKUs
    skipped.push(uploaded.sku)
```

**3. Replace All (Dangerous)**
```typescript
// Create backup first (mandatory)
await createBackup('inventory_items')

// Delete all existing
DELETE FROM inventory_items WHERE id IS NOT NULL

// Insert all from upload
INSERT INTO inventory_items (sku, name, stock, ...)
SELECT * FROM uploaded_data
```

### Smart Delta Detection

**Show user what changed:**

```
┌─────────────────────────────────────────────────────────┐
│  Upload Review - Delta Detected                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  📊 Changes Summary:                                    │
│  • 15 new SKUs will be added                            │
│  • 230 existing SKUs will be updated                    │
│  • 5 SKUs in database not in upload (no change)         │
│                                                          │
│  New SKUs:                                              │
│  WC-010, KM-015, BM-020, ...                            │
│                                                          │
│  Updated SKUs (click to see changes):                   │
│  ┌────────────────────────────────────────────────┐     │
│  │ SKU      │ Field │ Old Value │ New Value │     │     │
│  ├────────────────────────────────────────────────┤     │
│  │ WC-001   │ stock │ 500       │ 650       │ ✅  │     │
│  │ WC-001   │ cost  │ 2.50      │ 2.75      │ ⚠️  │     │
│  │ KM-002   │ stock │ 250       │ 180       │ ⚠️  │     │
│  └────────────────────────────────────────────────┘     │
│                                                          │
│  [← Back]              [Commit Changes →]               │
└─────────────────────────────────────────────────────────┘
```

---

## Finale Data Presentation (Separate Strategy)

### Problem: Old Data Clutter

**Current issue:**
- Finale sync imports all data chronologically
- Old POs from last year show up first
- Users don't want to scroll past irrelevant data

### Solution: Recent-First + Smart Filtering

**1. Default Sort: Recent First**

```sql
-- Purchase Orders: Show recent first
SELECT * FROM purchase_orders
ORDER BY order_date DESC, created_at DESC
LIMIT 100;

-- Inventory: Show recently updated first
SELECT * FROM inventory_items
ORDER BY last_sync_at DESC NULLS LAST, updated_at DESC
LIMIT 1000;
```

**2. Smart Date Filtering**

```typescript
// UI Default Filters
const defaultFilters = {
  purchaseOrders: {
    dateRange: 'last_90_days', // Only show POs from last 3 months
    status: ['draft', 'sent', 'confirmed'], // Hide cancelled/received
  },
  inventory: {
    showInactive: false, // Hide inactive by default
    lastUpdated: 'last_7_days', // Show items updated in last week first
  }
};
```

**3. UI with Smart Defaults**

```
┌─────────────────────────────────────────────────────────┐
│  Purchase Orders (Finale Sync)                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Showing: Last 90 days | Active POs | Recent first      │
│  [Change Filter ▼]                                      │
│                                                          │
│  📅 Today (Dec 12, 2025) - 3 POs                        │
│  ├─ PO-2025-1212-001 | ABC Supply | $1,250 | Draft     │
│  ├─ PO-2025-1212-002 | XYZ Vendor | $850 | Sent        │
│  └─ PO-2025-1212-003 | Farm Co | $2,100 | Confirmed    │
│                                                          │
│  📅 This Week - 8 POs                                   │
│  ├─ PO-2025-1210-001 | Ocean LLC | $500 | Confirmed    │
│  └─ ... (7 more)                                        │
│                                                          │
│  📅 This Month - 25 POs                                 │
│  └─ [Click to expand]                                   │
│                                                          │
│  Want to see older data?                                │
│  [Show Last 6 Months] [Show Last Year] [Show All]       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**4. Grouped by Relevance**

```typescript
// Group POs by time relevance
const grouped = {
  today: POs from today,
  thisWeek: POs from this week (excluding today),
  thisMonth: POs from this month (excluding this week),
  older: POs older than this month (collapsed by default)
};
```

---

## Implementation Checklist

### Phase 1: Template & Upload (Week 1)

- [ ] Create comprehensive Excel template with 10 example rows
- [ ] Add Instructions sheet
- [ ] Add Validation Rules sheet
- [ ] Create CSV template (same data, simpler format)
- [ ] Create Google Sheets template (shareable link)
- [ ] Add download buttons to UI

### Phase 2: Upload Flow (Week 1-2)

- [ ] Build Step 1: File upload component (drag & drop)
- [ ] Build Step 2: Column matching (auto-detect + manual override)
- [ ] Build Step 3: Data review (preview + validation)
- [ ] Build Step 4: Commit (progress bar + results)
- [ ] Add error handling and clear messages

### Phase 3: Delta/Merge Logic (Week 2)

- [ ] Implement merge strategy (update existing + add new)
- [ ] Implement delta strategy (add new only)
- [ ] Implement replace strategy (with backup)
- [ ] Show diff preview before commit
- [ ] Add change summary UI

### Phase 4: Finale Presentation (Week 2-3)

- [ ] Change default sort to recent-first
- [ ] Add smart date filtering (last 90 days default)
- [ ] Group by time relevance (today, this week, this month)
- [ ] Add "Show older data" option
- [ ] Update all Finale-related list views

### Phase 5: Testing & Polish (Week 3)

- [ ] Test upload with 1000+ row files
- [ ] Test column auto-detection with various formats
- [ ] Test delta detection accuracy
- [ ] User testing for UX flow
- [ ] Performance optimization

---

## Success Metrics

**Upload Experience:**
- ✅ Users can upload 1000 items in < 2 minutes (including review)
- ✅ Column auto-detection works 90%+ of the time
- ✅ Less than 5% of uploads need manual column mapping
- ✅ Error messages are clear and actionable

**Finale Presentation:**
- ✅ Users see today's POs at top by default
- ✅ < 3 clicks to find any recent PO
- ✅ No scrolling through irrelevant old data
- ✅ "Show older" option available when needed

---

**This approach separates manual uploads (simple, fast, user-controlled) from Finale sync (smart, filtered, auto-managed) while providing excellent UX for both!**
