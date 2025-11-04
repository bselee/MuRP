# 📋 Supabase Integration Expansion - Complete TODO

**Status:** Planning Phase  
**Completed:** Vendors (100%)  
**Next:** Inventory → BOMs → Purchase Orders → Build Orders → Requisitions  
**Goal:** Full Supabase integration for all data types with zero data loss

---

## 🎯 Overview

We've successfully implemented the vendor schema system with:
- ✅ 4-layer architecture (Raw → Parsed → Database → Display)
- ✅ Zero data loss transformers
- ✅ Comprehensive validation
- ✅ Batch processing with error tracking
- ✅ 23/23 tests passing

**Now we expand this pattern to all other data types.**

---

## 📊 Priority Order (Dependencies)

```
Priority 1: Inventory Items (no dependencies)
    ↓
Priority 2: BOMs (depends on Inventory for components)
    ↓
Priority 3: Purchase Orders (depends on Vendors + Inventory)
    ↓
Priority 4: Build Orders (depends on BOMs)
    ↓
Priority 5: Requisitions (depends on Inventory)
```

---

## 🚀 Phase 1: Inventory Items (Priority 1)

**Goal:** Sync inventory from Finale to Supabase with enhanced fields

### 1.1 Schema Migration ⏱️ 2 hours

**File:** `supabase/migrations/003_enhance_inventory_schema.sql`

**Tasks:**
- [ ] Add missing fields to `inventory_items` table:
  - `cost` (DECIMAL) - Unit cost
  - `price` (DECIMAL) - Sale price
  - `description` (TEXT) - Product description
  - `unit_of_measure` (VARCHAR) - ea, lb, oz, gal, etc.
  - `supplier_sku` (TEXT) - Vendor's SKU for this item
  - `location` (TEXT) - Warehouse location code
  - `bin` (TEXT) - Bin/shelf location
  - `lot_number` (TEXT) - Current lot number
  - `expiration_date` (DATE) - For perishables
  - `last_counted_at` (TIMESTAMPTZ) - Last physical count
  - `last_cost` (DECIMAL) - Last purchase cost
  - `average_cost` (DECIMAL) - Moving average cost
  - `data_source` (VARCHAR) - 'manual', 'csv', 'api'
  - `last_sync_at` (TIMESTAMPTZ) - Last sync timestamp
  - `sync_status` (VARCHAR) - 'synced', 'pending', 'error'
  - `metadata` (JSONB) - Additional Finale fields

- [ ] Create indexes:
  - `idx_inventory_sku` (already exists, verify)
  - `idx_inventory_category`
  - `idx_inventory_vendor_id`
  - `idx_inventory_reorder` - WHERE stock <= reorder_point
  - `idx_inventory_location`
  - `idx_inventory_sync_status`

- [ ] Create view `inventory_details`:
  - Join with vendors for supplier name
  - Compute `reorder_needed` boolean
  - Compute `stock_value` (stock * average_cost)
  - Compute `days_on_hand` (stock / daily_usage)

- [ ] Add trigger for stock alerts (optional):
  - Notify when stock drops below reorder point

**Acceptance Criteria:**
- Migration runs without errors
- All new columns exist
- Indexes improve query performance
- View queryable and returns computed fields

---

### 1.2 TypeScript Types ⏱️ 1 hour

**File:** `types/database.ts`

**Tasks:**
- [ ] Update `inventory_items` Row/Insert/Update types with new fields
- [ ] Add `InventoryDetails` view type
- [ ] Ensure all fields match migration exactly

**File:** `lib/schema/index.ts`

**Tasks:**
- [ ] Create `InventoryRawSchema` (Zod) for CSV parsing:
  - SKU, Name, Description, Category
  - Stock, OnOrder, ReorderPoint, MOQ
  - Cost, Price, Vendor
  - Location, Bin, UnitOfMeasure
  - etc.

- [ ] Create `InventoryParsedSchema` (Zod) for validated data:
  - Normalized field names
  - Type validation (numbers, dates)
  - Required field checks

- [ ] Create `InventoryDatabaseSchema` (Zod) for Supabase insert:
  - snake_case field names
  - Database-compatible types
  - Foreign key references

**Acceptance Criteria:**
- All schemas export successfully
- TypeScript compilation with no errors
- Zod validation works for sample data

---

### 1.3 Transformers ⏱️ 3 hours

**File:** `lib/schema/transformers.ts`

**Tasks:**
- [ ] Create `transformInventoryRawToParsed()`:
  - Parse CSV fields
  - Extract numbers with parseNumber()
  - Validate SKU format
  - Extract vendor reference
  - Handle missing fields with defaults

- [ ] Create `transformInventoryParsedToDatabase()`:
  - Map to snake_case
  - Convert types for PostgreSQL
  - Add metadata (data_source, sync_status)
  - Set timestamps (last_sync_at)

- [ ] Create `transformInventoryBatch()`:
  - Batch processing with error tracking
  - Success/failure/warning counts
  - Detailed error messages

- [ ] Create `deduplicateInventory()`:
  - Dedupe by SKU (case-insensitive)
  - Keep most recent (by sync date)
  - Log duplicates found

**File:** `lib/schema/transformers.test.ts`

**Tasks:**
- [ ] Test basic inventory transformation
- [ ] Test numeric field parsing (cost, price, stock)
- [ ] Test vendor reference extraction
- [ ] Test invalid SKU rejection
- [ ] Test batch transformation with errors
- [ ] Test deduplication logic
- [ ] Test database mapping (snake_case)

**Acceptance Criteria:**
- All transformer functions export
- All tests pass (aim for 10+ test cases)
- Zero data loss proven by tests
- Error handling comprehensive

---

### 1.4 Sync Service Integration ⏱️ 2 hours

**File:** `services/finaleSyncService.ts`

**Tasks:**
- [ ] Update `syncInventory()` method:
  - Use new `transformInventoryRawToParsed()`
  - Use new `transformInventoryParsedToDatabase()`
  - Use new `transformInventoryBatch()` for batch processing
  - Save to Supabase with validation

- [ ] Update `saveInventoryToSupabase()`:
  - Use enhanced transformer
  - Upsert on conflict (SKU)
  - Two-phase save (update existing, insert new)
  - Log success/failure counts

- [ ] Add inventory-specific validation:
  - Check vendor_id exists in vendors table
  - Validate stock >= 0
  - Validate reorder_point >= 0
  - Validate cost/price >= 0

**File:** `lib/finale/transformers.ts` (if exists)

**Tasks:**
- [ ] Update `transformFinaleProductsToInventory()`:
  - Use new schema system
  - Map all Finale fields
  - Handle missing fields gracefully

**Acceptance Criteria:**
- Inventory sync works end-to-end
- Data appears in Supabase
- All fields populated correctly
- Errors logged with context

---

### 1.5 Testing ⏱️ 2 hours

**File:** `e2e/inventory.spec.ts` (new)

**Tasks:**
- [ ] Create E2E tests for Inventory page:
  - Page renders
  - Table displays inventory items
  - SKU, name, stock, vendor shown
  - Reorder point indicators work
  - Search/filter functionality
  - Accessibility checks

**Tasks:**
- [ ] Run transformer unit tests
- [ ] Run E2E tests
- [ ] Verify all tests pass

**Acceptance Criteria:**
- All new tests pass
- No regressions in existing tests
- E2E coverage for inventory page

---

### 1.6 Documentation ⏱️ 1 hour

**Tasks:**
- [ ] Update `SCHEMA_ARCHITECTURE.md`:
  - Add inventory schema example
  - Document inventory transformers

- [ ] Update `SUPABASE_DEPLOYMENT_GUIDE.md`:
  - Add migration 003 instructions
  - Add inventory verification queries

- [ ] Create `INVENTORY_SYNC_GUIDE.md`:
  - How to sync inventory
  - Common issues and solutions
  - Data quality checks

**Acceptance Criteria:**
- Documentation complete
- Examples work
- Troubleshooting section helpful

---

## 🧩 Phase 2: Bill of Materials (BOMs) (Priority 2)

**Goal:** Sync BOMs from Finale with component references

**Estimated Time:** 8-10 hours

### 2.1 Schema Migration ⏱️ 2 hours

**File:** `supabase/migrations/004_enhance_bom_schema.sql`

**Tasks:**
- [ ] Add missing fields to `boms` table:
  - `version` (INTEGER) - BOM version number
  - `status` (VARCHAR) - 'active', 'draft', 'archived'
  - `yield_quantity` (DECIMAL) - Expected yield per batch
  - `yield_unit` (VARCHAR) - Unit of yield
  - `batch_size` (DECIMAL) - Standard batch size
  - `labor_hours` (DECIMAL) - Hours per batch
  - `labor_cost` (DECIMAL) - Cost per batch
  - `overhead_cost` (DECIMAL) - Overhead per batch
  - `total_cost` (DECIMAL) - Computed total cost
  - `notes` (TEXT) - Production notes
  - `data_source` (VARCHAR) - 'manual', 'csv', 'api'
  - `last_sync_at` (TIMESTAMPTZ)
  - `sync_status` (VARCHAR)
  - `created_by` (UUID) - User who created
  - `updated_by` (UUID) - User who last updated

- [ ] Enhance `components` JSONB structure:
  - Define schema: `[{sku, quantity, unit, waste_percent, notes}]`
  - Add validation constraint

- [ ] Create `bom_components` table (normalized option):
  - Alternative: Separate table for components
  - `bom_id`, `component_sku`, `quantity`, `unit`, `sort_order`
  - Foreign keys to boms and inventory_items

- [ ] Create view `bom_details`:
  - Join with inventory_items for component details
  - Compute total_component_cost
  - Compute cost_per_unit
  - Show component availability

- [ ] Create function `compute_bom_cost()`:
  - Calculate total cost from components
  - Include labor and overhead
  - Return cost breakdown

**Acceptance Criteria:**
- Migration runs successfully
- BOM structure supports complex recipes
- Cost calculations accurate
- View shows all component details

---

### 2.2 TypeScript Types & Schemas ⏱️ 2 hours

**Files:** `types/database.ts`, `lib/schema/index.ts`

**Tasks:**
- [ ] Update `boms` table types
- [ ] Create `BOMRawSchema` for CSV/API input
- [ ] Create `BOMParsedSchema` for validation
- [ ] Create `BOMDatabaseSchema` for Supabase
- [ ] Create `BOMComponentSchema` for components array
- [ ] Add helper types for cost breakdown

**Acceptance Criteria:**
- All types compile
- Schemas validate sample BOMs
- Component structure well-defined

---

### 2.3 Transformers & Validation ⏱️ 3 hours

**File:** `lib/schema/transformers.ts`

**Tasks:**
- [ ] Create `transformBOMRawToParsed()`
- [ ] Create `transformBOMParsedToDatabase()`
- [ ] Create `transformBOMBatch()`
- [ ] Create `validateBOMComponents()`:
  - Check all component SKUs exist in inventory
  - Validate quantities > 0
  - Check for circular references

- [ ] Create `computeBOMCost()`:
  - Sum component costs
  - Add labor and overhead
  - Return detailed breakdown

**File:** `lib/schema/transformers.test.ts`

**Tasks:**
- [ ] Test BOM transformation
- [ ] Test component validation
- [ ] Test cost calculation
- [ ] Test circular reference detection
- [ ] Test batch processing

**Acceptance Criteria:**
- All transformers work
- All tests pass (10+ test cases)
- Cost calculations accurate

---

### 2.4 Sync Service ⏱️ 2 hours

**File:** `services/finaleSyncService.ts`

**Tasks:**
- [ ] Implement `syncBOMs()` method
- [ ] Update `saveBOMsToSupabase()` with new schema
- [ ] Add component validation before save
- [ ] Handle component updates (add/remove)

**Acceptance Criteria:**
- BOMs sync successfully
- Components saved correctly
- Costs computed accurately

---

### 2.5 Testing & Documentation ⏱️ 1-2 hours

**Tasks:**
- [ ] E2E tests for BOM page
- [ ] Update documentation
- [ ] Create BOM sync guide

---

## 📦 Phase 3: Purchase Orders (Priority 3)

**Goal:** Sync purchase orders with line items and status tracking

**Estimated Time:** 8-10 hours

### 3.1 Schema Migration ⏱️ 2 hours

**File:** `supabase/migrations/005_enhance_po_schema.sql`

**Tasks:**
- [ ] Add missing fields to `purchase_orders` table:
  - `po_number` (TEXT UNIQUE) - External PO number
  - `submitted_at` (TIMESTAMPTZ) - When submitted to vendor
  - `confirmed_at` (TIMESTAMPTZ) - When vendor confirmed
  - `shipped_at` (TIMESTAMPTZ) - Ship date
  - `received_at` (TIMESTAMPTZ) - Receive date
  - `payment_terms` (VARCHAR) - Net 30, Net 60, etc.
  - `payment_due_date` (DATE) - Due date
  - `payment_status` (VARCHAR) - 'pending', 'paid', 'partial'
  - `payment_amount` (DECIMAL) - Amount paid
  - `subtotal` (DECIMAL) - Before tax/shipping
  - `tax_amount` (DECIMAL) - Tax
  - `shipping_cost` (DECIMAL) - Shipping
  - `total_amount` (DECIMAL) - Grand total
  - `currency` (VARCHAR) - USD, CAD, etc.
  - `tracking_number` (TEXT) - Shipment tracking
  - `data_source` (VARCHAR)
  - `last_sync_at` (TIMESTAMPTZ)
  - `sync_status` (VARCHAR)
  - `created_by` (UUID)
  - `approved_by` (UUID)

- [ ] Enhance `items` JSONB structure:
  - `[{sku, quantity, unit_cost, line_total, received_qty, notes}]`

- [ ] Create `po_line_items` table (normalized option):
  - `po_id`, `sku`, `quantity`, `unit_cost`, `received_qty`
  - Foreign keys to purchase_orders and inventory_items

- [ ] Create view `po_details`:
  - Join with vendors
  - Join with inventory for item names
  - Compute totals
  - Show receiving status

- [ ] Create function `update_inventory_on_receive()`:
  - Trigger when PO status = 'Fulfilled'
  - Increment inventory stock
  - Decrement on_order
  - Update last_cost

**Acceptance Criteria:**
- Migration successful
- PO lifecycle tracked
- Receiving updates inventory
- Financial fields complete

---

### 3.2 TypeScript Types & Schemas ⏱️ 2 hours

**Tasks:**
- [ ] Update `purchase_orders` types
- [ ] Create PO schemas (Raw/Parsed/Database)
- [ ] Create `POLineItemSchema`
- [ ] Add status transition validation

---

### 3.3 Transformers & Business Logic ⏱️ 3 hours

**Tasks:**
- [ ] Create PO transformers
- [ ] Implement `validatePOTransition()`:
  - Ensure valid status transitions
  - Pending → Submitted → Fulfilled
  - Can't skip states

- [ ] Implement `computePOTotals()`:
  - Sum line items
  - Add tax and shipping
  - Validate against total_amount

- [ ] Implement `receiveLineItem()`:
  - Update received_qty
  - Update inventory stock
  - Handle partial receives

**File:** `lib/schema/transformers.test.ts`

**Tasks:**
- [ ] Test PO transformation
- [ ] Test status transitions
- [ ] Test total calculations
- [ ] Test receiving logic
- [ ] Test inventory updates

---

### 3.4 Sync Service ⏱️ 2 hours

**Tasks:**
- [ ] Implement `syncPurchaseOrders()`
- [ ] Update `savePurchaseOrdersToSupabase()`
- [ ] Add line item processing
- [ ] Handle status changes

---

### 3.5 Testing & Documentation ⏱️ 1-2 hours

**Tasks:**
- [ ] E2E tests for PO page
- [ ] Test receiving workflow
- [ ] Update documentation

---

## 🏭 Phase 4: Build Orders (Priority 4)

**Goal:** Track production orders with component consumption

**Estimated Time:** 6-8 hours

### 4.1 Schema Migration ⏱️ 1.5 hours

**File:** `supabase/migrations/006_enhance_build_order_schema.sql`

**Tasks:**
- [ ] Add missing fields to `build_orders` table:
  - `order_number` (TEXT UNIQUE)
  - `bom_id` (TEXT FK) - Reference to BOM
  - `scheduled_start` (TIMESTAMPTZ)
  - `started_at` (TIMESTAMPTZ)
  - `priority` (VARCHAR) - 'low', 'medium', 'high', 'urgent'
  - `assigned_to` (UUID) - Production staff
  - `actual_quantity` (INTEGER) - Actual produced
  - `yield_percentage` (DECIMAL) - Actual / Expected
  - `labor_hours_actual` (DECIMAL)
  - `components_consumed` (JSONB) - Actual component usage
  - `waste_components` (JSONB) - Waste tracking
  - `quality_check_passed` (BOOLEAN)
  - `quality_notes` (TEXT)
  - `data_source` (VARCHAR)
  - `last_sync_at` (TIMESTAMPTZ)
  - `sync_status` (VARCHAR)

- [ ] Create view `build_order_details`:
  - Join with BOMs
  - Join with inventory for finished good
  - Show component availability
  - Compute completion percentage

- [ ] Create function `complete_build_order()`:
  - Decrement component inventory
  - Increment finished good inventory
  - Log transaction
  - Atomic operation

**Acceptance Criteria:**
- Migration successful
- Build completion updates inventory atomically
- Waste tracking works

---

### 4.2 TypeScript Types & Schemas ⏱️ 1 hour

**Tasks:**
- [ ] Update `build_orders` types
- [ ] Create build order schemas
- [ ] Add component consumption types

---

### 4.3 Transformers & Business Logic ⏱️ 2 hours

**Tasks:**
- [ ] Create build order transformers
- [ ] Implement `validateBuildOrder()`:
  - Check component availability
  - Validate quantity > 0
  - Check BOM exists

- [ ] Implement `allocateComponents()`:
  - Reserve components for build
  - Check stock availability
  - Handle partial allocation

- [ ] Implement `completeBuildOrder()`:
  - Consume components
  - Add finished goods
  - Update costs
  - Atomic transaction

**File:** `lib/schema/transformers.test.ts`

**Tasks:**
- [ ] Test build order transformation
- [ ] Test component allocation
- [ ] Test completion logic
- [ ] Test inventory updates
- [ ] Test atomic transactions

---

### 4.4 Sync Service & Testing ⏱️ 2-3 hours

**Tasks:**
- [ ] Implement `syncBuildOrders()`
- [ ] E2E tests for production page
- [ ] Test build completion workflow
- [ ] Update documentation

---

## 📝 Phase 5: Internal Requisitions (Priority 5)

**Goal:** Track purchase requests with approval workflow

**Estimated Time:** 5-7 hours

### 5.1 Schema Migration ⏱️ 1.5 hours

**File:** `supabase/migrations/007_enhance_requisition_schema.sql`

**Tasks:**
- [ ] Add missing fields to `requisitions` table:
  - `requisition_number` (TEXT UNIQUE)
  - `priority` (VARCHAR)
  - `requested_date` (DATE) - When needed by
  - `approved_at` (TIMESTAMPTZ)
  - `approved_by` (UUID)
  - `rejected_at` (TIMESTAMPTZ)
  - `rejected_by` (UUID)
  - `rejection_reason` (TEXT)
  - `converted_to_po` (BOOLEAN)
  - `po_id` (TEXT FK) - If converted
  - `estimated_cost` (DECIMAL)
  - `actual_cost` (DECIMAL)
  - `justification` (TEXT) - Why needed
  - `data_source` (VARCHAR)
  - `last_sync_at` (TIMESTAMPTZ)
  - `sync_status` (VARCHAR)

- [ ] Enhance `items` JSONB
- [ ] Create view `requisition_details`
- [ ] Create approval workflow functions

**Acceptance Criteria:**
- Migration successful
- Approval workflow tracked
- PO conversion works

---

### 5.2 TypeScript, Transformers, Sync ⏱️ 3 hours

**Tasks:**
- [ ] Update types
- [ ] Create schemas
- [ ] Create transformers
- [ ] Implement sync
- [ ] Add approval logic

---

### 5.3 Testing & Documentation ⏱️ 1-2 hours

**Tasks:**
- [ ] E2E tests
- [ ] Test approval workflow
- [ ] Update documentation

---

## 🔧 Phase 6: Integration & Polish (Final)

**Estimated Time:** 4-6 hours

### 6.1 Cross-Entity Relationships ⏱️ 2 hours

**Tasks:**
- [ ] Test vendor → inventory relationships
- [ ] Test inventory → BOM relationships
- [ ] Test BOM → build order relationships
- [ ] Test vendor → PO relationships
- [ ] Test inventory → requisition relationships
- [ ] Verify all foreign keys work

---

### 6.2 Data Quality & Monitoring ⏱️ 2 hours

**File:** `services/dataQualityService.ts` (new)

**Tasks:**
- [ ] Create data quality dashboard
- [ ] Monitor sync success rates
- [ ] Track data completeness:
  - % vendors with complete address
  - % inventory with costs
  - % BOMs with valid components

- [ ] Create alerting for:
  - Sync failures
  - Data validation errors
  - Missing required fields

---

### 6.3 Real-Time Subscriptions ⏱️ 2 hours

**File:** `hooks/useSupabaseRealtime.ts` (new)

**Tasks:**
- [ ] Set up real-time subscriptions for:
  - Inventory changes
  - PO status changes
  - Build order updates
  - Requisition approvals

- [ ] Update UI to reflect real-time changes
- [ ] Handle conflicts gracefully

---

### 6.4 Final Documentation ⏱️ 2 hours

**Tasks:**
- [ ] Update `README.md` with complete integration status
- [ ] Create `SUPABASE_COMPLETE_GUIDE.md`:
  - All migrations
  - All sync procedures
  - Troubleshooting guide
  - Data flow diagrams

- [ ] Create `DATA_DICTIONARY.md`:
  - Document all tables
  - Document all fields
  - Document all relationships
  - Document all views

- [ ] Update `SESSION_DOCUMENT.md`:
  - Mark all phases complete
  - Document final architecture

---

## 📊 Summary

### Total Estimated Time: 45-55 hours

**Breakdown:**
- Phase 1 (Inventory): 10-11 hours
- Phase 2 (BOMs): 8-10 hours
- Phase 3 (Purchase Orders): 8-10 hours
- Phase 4 (Build Orders): 6-8 hours
- Phase 5 (Requisitions): 5-7 hours
- Phase 6 (Integration): 4-6 hours
- Buffer for issues: 4-3 hours

### Deliverables:

- **7 Migration Files** (003-009)
- **5 Data Type Implementations** (Inventory, BOM, PO, Build, Requisition)
- **100+ Test Cases** (unit + E2E)
- **Complete Documentation** (guides, dictionaries, architecture)
- **Real-Time Subscriptions** for live updates
- **Data Quality Monitoring** dashboard

### Success Criteria:

- ✅ All migrations applied successfully
- ✅ All data syncs from Finale to Supabase
- ✅ Zero data loss proven by tests
- ✅ All tests passing (200+ total)
- ✅ Real-time updates working
- ✅ Documentation complete
- ✅ Production deployment successful

---

## 🚀 Getting Started

**To begin Phase 1 (Inventory):**

```bash
# 1. Create migration branch
git checkout -b feat/supabase-inventory-integration

# 2. Create migration file
touch supabase/migrations/003_enhance_inventory_schema.sql

# 3. Follow Phase 1 checklist above

# 4. Test thoroughly
npm run test
npm run e2e

# 5. Deploy
git add .
git commit -m "feat: inventory Supabase integration"
git push
```

**Review this TODO regularly and update status as you progress!**

---

**Last Updated:** November 4, 2025  
**Current Phase:** Planning  
**Next Action:** Begin Phase 1.1 (Inventory Schema Migration)
