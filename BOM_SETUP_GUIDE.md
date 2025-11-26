# BOM (Bill of Materials) Setup Guide

## Overview
Complete guide for configuring and using the Finale BOM CSV synchronization with enhanced MRP features including artwork, labels, bags, and documents tracking.

## 🎯 What's New

Your BOM system now has the same comprehensive features as Vendors and Inventory:

### ✅ Enhanced BOM Features:
- **CSV Sync**: Automatic sync from Finale BOM reports
- **Component Grouping**: Multiple CSV rows → Single BOM object
- **Component Enrichment**: Links to inventory for costs/lead times
- **MRP-Ready**: Potential build qty, average cost, yield tracking
- **Artwork/Labels/Bags**: Structured tracking for regulatory compliance
- **Source Tracking**: dataSource, lastSyncAt, syncStatus badges
- **Debug-Friendly**: Comprehensive logging and CSV preview

---

## 📋 Environment Configuration

### Step 1: Add BOM Report URL to `.env.local`

```bash
# Finale BOM Report URL (Build BOM Report-Inv Master)
FINALE_BOM_REPORT_URL=https://app.finaleinventory.com/buildasoilorganics/doc/report/pivotTableStream/1762360528963/Report.csv?format=csv&data=productBom&attrName=%23%23user155&rowDimensions=~mprNAf7AzP7AwMDAwMDAms0B1MDLQHvIAAAAAADAwMDAwMDAmr1wcm9kdWN0UG90ZW50aWFsQnVpbGRRdWFudGl0eblQb3RlbnRpYWwgXG4gQnVpbGQgXG4gUXR5zP7AwMDAAMDAms0BdsAAwADAwMDAwJrNAcqsQk9NIFF1YW50aXR5y0BjDMzMzMzNwADAwMDAwJrNAZ-3Q29tcG9uZW50IFxuIFByb2R1Y3QgSUTM_sDAwMDAwMCazQGDwMtAe8gAAAAAAMDAwMDAwMCa2T9wcm9kdWN0Qm9tUHJvZHVjdFN0b2NrUmVtYWluaW5nQWZ0ZXJSZXNlcnZhdGlvbnNDYXNlRXF1aXZhbGVudHO-Q29tcG9uZW50IHByb2R1Y3QgXG4gUmVtYWluaW5nzP7AwMDAwMDAms0Bd8DNAX3AwADAwMDAms0BebNCT00gXG4gQXZlcmFnZSBjb3N0zP7AwMDAwMDA&filters=W1sicHJvZHVjdFByb2R1Y3RVcmwiLFtdLG51bGxdLFsicHJvZHVjdEJvbVByb2R1Y3RVcmwiLG51bGwsbnVsbF0sWyJwcm9kdWN0U3RhdHVzIixbIlBST0RVQ1RfQUNUSVZFIl0sbnVsbF1d&reportTitle=Build%20BOM%20Report-Inv%20Master
```

### Step 2: Restart Development Server

```bash
npm run dev
```

---

## 📊 BOM Report Structure

Your Finale BOM report includes these columns:

### **Finished Product Info:**
- Product ID (finished SKU)
- Name (product name)
- Category
- Status

### **Build Quantities:**
- Potential Build Qty (how many can be built with current stock)
- BOM Quantity (quantity of component required)

### **Component Details:**
- Component Product ID (component SKU)
- Component Name
- Component Remaining (stock available)

### **Cost Information:**
- BOM Average Cost (average cost to produce)

### **Key Insight:**
**Each CSV row represents ONE component of a BOM**. Multiple rows with the same finished SKU are grouped together to create a complete BOM object.

**Example:**
```
Product ID | Name              | Component ID | BOM Qty
----------|-------------------|--------------|--------
PROD-001  | Super Compost 5lb | INGR-PEAT    | 2.5
PROD-001  | Super Compost 5lb | INGR-HUMUS   | 1.0
PROD-001  | Super Compost 5lb | BAG-5LB      | 1.0
```
→ Creates single BOM for "Super Compost 5lb" with 3 components

---

## 🔄 How BOM Sync Works

### 1. **API Proxy** (`/api/finale-proxy.ts`):
```typescript
case 'getBOMs':
  result = await getBOMs(finaleConfig);
  break;
```
- Fetches CSV from `FINALE_BOM_REPORT_URL`
- Uses Basic Auth with Finale credentials
- Parses CSV and validates rows
- Filters out invalid data (empty Product ID/Name)
- Returns raw CSV data for transformation

### 2. **Schema Transformation** (`lib/schema/transformers.ts`):
```typescript
transformBOMsBatch(rawBOMs, inventoryMap)
```
- **Groups rows by finished SKU**: Multiple components → Single BOM
- **Enriches components**: Links to inventory for costs/lead times
- **Validates data**: Uses Zod schemas for type safety
- **Tracks statistics**: Success/failure counts for debugging

### 3. **Sync Service** (`services/finaleSyncService.ts`):
```typescript
async syncBOMsFromCSV(): Promise<void>
```
- Calls API proxy to fetch BOM CSV
- Builds inventory map for component enrichment
- Transforms using schema system
- Deduplicates by finished SKU
- Upserts to Supabase with conflict resolution
- Updates sync timestamps and status

### 4. **Database Storage** (Supabase `boms` table):
```sql
-- Enhanced BOM fields
id: unique identifier
finished_sku: manufactured product SKU
name: product name
components: JSONB array of components
artwork: JSONB array of artwork/labels/bags
packaging: JSONB packaging specs
barcode: product barcode
description, category: organization
yield_quantity: how many units produced
potential_build_qty: from Finale calc
average_cost: from Finale
data_source: csv/api/manual
last_sync_at, sync_status: tracking
```

---

## 🎨 Enhanced Type Definitions

### **BOMComponent**:
```typescript
{
  sku: string;           // Component SKU
  name: string;          // Component name
  quantity: number;      // Qty required for BOM
  unitCost?: number;     // Cost per unit (from inventory)
  remaining?: number;    // Stock available (from CSV)
  supplierSku?: string;  // Supplier's SKU
  leadTimeDays?: number; // Lead time for reordering
}
```

### **Artwork** (Labels, Bags, Documents):
```typescript
{
  id: string;
  fileName: string;
  revision: number;
  url: string;
  // Enhanced tracking
  fileType?: 'label' | 'bag' | 'document' | 'regulatory' | 'artwork';
  status?: 'draft' | 'approved' | 'archived';
  approvedBy?: string;
  approvedDate?: string;
  notes?: string;
}
```

### **Packaging**:
```typescript
{
  bagType: string;
  labelType: string;
  specialInstructions: string;
  // SKU linking for packaging components
  bagSku?: string;
  labelSku?: string;
  boxSku?: string;
  insertSku?: string;
  // Shipping calculations
  weight?: number;
  weightUnit?: string;
  dimensions?: string;
}
```

### **BillOfMaterials**:
```typescript
{
  id: string;
  finishedSku: string;
  name: string;
  components: BOMComponent[];
  artwork: Artwork[];
  packaging: Packaging;
  barcode?: string;
  // Enhanced MRP fields
  description?: string;
  category?: string;
  yieldQuantity?: number;      // How many units produced
  potentialBuildQty?: number;  // From Finale
  averageCost?: number;        // From Finale
  // Sync tracking (like vendors/inventory)
  dataSource?: 'manual' | 'csv' | 'api';
  lastSyncAt?: string;
  syncStatus?: 'synced' | 'pending' | 'error';
  notes?: string;
}
```

---

## 🎯 Modern MRP Features

### **1. Cost Rollup Calculations**
```typescript
// Each component has unitCost from inventory
// Total BOM cost = Σ(component.quantity × component.unitCost)
const totalCost = bom.components.reduce((sum, comp) =>
  sum + (comp.quantity * (comp.unitCost || 0)), 0
);
```

### **2. Production Lead Time**
```typescript
// Critical path = longest component lead time
const criticalPath = Math.max(...bom.components.map(c => c.leadTimeDays || 0));
```

### **3. Build Feasibility**
```typescript
// Can we build this BOM with current stock?
const canBuild = bom.components.every(comp =>
  (comp.remaining || 0) >= comp.quantity
);

// How many can we build?
const maxBuildQty = Math.min(...bom.components.map(comp =>
  Math.floor((comp.remaining || 0) / comp.quantity)
));
```

### **4. Regulatory Compliance**
```typescript
// Track artwork approval workflow
const artwork = {
  fileType: 'label',
  status: 'approved',
  approvedBy: 'John Doe',
  approvedDate: '2025-11-05',
  notes: 'FDA compliant - Rev 3'
};
```

### **5. Packaging Component Tracking**
```typescript
// Link packaging to inventory items
const packaging = {
  bagSku: 'BAG-5LB-ZIPPER',
  labelSku: 'LABEL-5LB-COMPOST',
  boxSku: 'BOX-12CT',
  insertSku: 'INSERT-INSTRUCTIONS'
};
```

---

## 🔍 Debugging & Monitoring

### **Enhanced Logging**

When sync runs, check console for:

```
[Finale Proxy] Fetching BOM CSV from report...
[Finale Proxy] BOM CSV data received: 45000 characters
[Finale Proxy] CSV Preview (first 500 chars): Product ID,Name,Potential...
[Finale Proxy] Parsed 120 raw BOM rows from CSV
[Finale Proxy] 115 valid BOM rows after filtering (removed 5 invalid)
[Finale Proxy] CSV Headers (12 columns): ["Product ID", "Name", ...]
[Finale Proxy] Sample BOM row: { ProductID: "PROD-001", Name: "Super Compost", ... }

[BOM Transform] Statistics:
  - Total rows processed: 115
  - ✓ Unique BOMs created: 38
  - ✗ Failed rows: 0

[FinaleSyncService] Successfully synced 38 BOMs
```

### **Common Issues**

**Issue**: 0 BOM rows returned
- **Cause**: Report URL might be expired or empty
- **Solution**: Regenerate report in Finale and update `FINALE_BOM_REPORT_URL`

**Issue**: Components not enriched with cost/lead time
- **Cause**: Component SKU doesn't match inventory SKU
- **Solution**: Ensure inventory is synced first, check SKU formatting

**Issue**: Multiple BOMs with duplicate finished SKUs
- **Cause**: Data quality issue in Finale
- **Solution**: Deduplication keeps last occurrence, review in Finale

---

## 📝 Next Steps - Manual Configuration

The following features are ready in the type system but need manual configuration:

### **1. Artwork/Labels/Bags Management**
The system is ready to track artwork files, but you'll need to:
- Create artwork records in the database
- Link them to BOMs via the `artwork` JSONB array
- Use the enhanced fields: fileType, status, approvedBy, etc.

**Example**:
```typescript
const artwork = [
  {
    id: 'art-001',
    fileName: 'compost-5lb-label-3x5.pdf',
    revision: 3,
    url: '/artwork/compost-5lb-label-3x5.pdf',
    fileType: 'label',
    status: 'approved',
    approvedBy: 'jane@buildasoil.com',
    approvedDate: '2025-11-01',
    notes: 'FDA compliant, organic certification included'
  },
  {
    id: 'art-002',
    fileName: 'compost-5lb-bag-spec.pdf',
    revision: 2,
    url: '/artwork/compost-5lb-bag-spec.pdf',
    fileType: 'bag',
    status: 'approved',
    approvedBy: 'jane@buildasoil.com',
    approvedDate: '2025-10-15',
    notes: 'Zipper bag with resealable top'
  }
];
```

### **2. Packaging SKU Linking**
Link packaging components to your inventory:
```typescript
const packaging = {
  bagType: '5lb Resealable Zipper Bag',
  labelType: '3x5 Color Label',
  specialInstructions: 'Apply label to front, insert instruction sheet',
  bagSku: 'BAG-5LB-ZIP-001',      // Links to inventory
  labelSku: 'LABEL-3X5-COMP-001',  // Links to inventory
  insertSku: 'INSERT-INSTR-001',   // Links to inventory
  weight: 5.5,
  weightUnit: 'lb',
  dimensions: '8x10x3'
};
```

### **3. Database Migration**
Apply the enhanced BOM schema migration:

```sql
-- Add to next migration file
ALTER TABLE boms
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS yield_quantity INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS potential_build_qty INTEGER,
  ADD COLUMN IF NOT EXISTS average_cost DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS data_source VARCHAR(20) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_boms_data_source ON boms(data_source);
CREATE INDEX IF NOT EXISTS idx_boms_sync_status ON boms(sync_status);
CREATE INDEX IF NOT EXISTS idx_boms_category ON boms(category);
```

### **4. UI Enhancements**
The BOMs page (`pages/BOMs.tsx`) can be enhanced with:
- **Source badges** (CSV/API/Manual) like Vendors/Inventory
- **Sync status indicators**
- **Gmail compose links** for vendor contacts
- **Artwork gallery** with approval status
- **Packaging component list** with inventory links
- **Cost rollup display**
- **Build feasibility indicator**

---

## 🔐 Revision & Approval Workflow

Every edit to a BOM now goes through the revision control pipeline so Ops can verify changes before production uses them.

### Core Tables
- `boms.revision_number` and `boms.revision_status` track the live state (pending vs approved).
- `bom_revisions` holds the immutable audit trail with a JSON snapshot of each change set.
- `bom_artwork_assets` + `artwork_assets` stay in sync via trigger so asset approvals map back to revisions.

### Requesting Ops Approval
1. Open any BOM and click **Edit**.
2. Add a short summary of what changed (ex: “Peat ratio ↑ / bag spec = kraft 5lb”).
3. Assign an Ops reviewer or leave unassigned to drop into the Ops queue.
4. Click **Save & Request Ops Approval** – this bumps the revision pill to red (`REV N`) until Ops signs off.

### Auto-Approval (Ops/Admin)
If you belong to the Operations department or carry the Admin role you’ll see a **Save & Approve** button for low-risk tweaks. This immediately approves the revision and the pill glows green.

### Approving & Reverting
- Ops can approve from the BOM list, the detail modal, or the card view.
- Previous revisions stay in the timeline; hit **Revert** in the detail modal to roll forward a prior snapshot (creates a new `REV` entry so history stays linear).

---

## 🧩 Artwork Normalization (DAM Ready)

A normalized DAM layer now backs every artwork attachment:

- **`artwork_assets`**: canonical asset record (status, revision, barcode, notes, timestamps).
- **`bom_artwork_assets`**: attachment metadata (usage type, workflow state, primary flag).
- **`asset_compliance_checks`**: hook for state-by-state verification runs.

A trigger on `boms.artwork` keeps legacy JSON in sync with the new tables so the existing Artwork page keeps working while the RegVault DAM add-on can read/write from the normalized schema.

---

## 🚀 Benefits

### **For Production Planning:**
- See exactly what can be built with current stock
- Calculate production costs in real-time
- Track component lead times for scheduling
- Identify bottleneck components

### **For Regulatory Compliance:**
- Track artwork approval workflow
- Maintain revision history
- Link regulatory documents to products
- Audit trail for compliance

### **For Inventory Management:**
- Link packaging components to inventory
- Calculate packaging costs
- Track bag/label/box usage
- Reorder packaging materials

### **For Cost Analysis:**
- Roll up component costs
- Track average production costs
- Compare planned vs actual costs
- Identify cost reduction opportunities

---

## 📚 Related Documentation

- **Schema Architecture**: `lib/schema/index.ts`
- **Transformers**: `lib/schema/transformers.ts`
- **API Proxy**: `api/finale-proxy.ts`
- **Sync Service**: `services/finaleSyncService.ts`
- **Type Definitions**: `types.ts`, `types/database.ts`

---

## ✅ Checklist

- [x] BOM type definitions enhanced
- [x] BOM schemas created (Raw, Parsed, Database)
- [x] BOM transformers implemented
- [x] API proxy getBOMs handler added
- [ ] FinaleSyncService updated with syncBOMsFromCSV()
- [ ] Database migration created and applied
- [ ] Environment variable configured
- [ ] BOMs page enhanced with source badges
- [ ] useSupabaseData updated for enhanced fields
- [ ] Testing completed

---

**Questions?** Check the existing vendor and inventory implementations for reference patterns!
