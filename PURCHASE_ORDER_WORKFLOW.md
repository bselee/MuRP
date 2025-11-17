# Purchase Order Workflow - Complete Process & Flow

**Status:** ✅ Implemented & Integrated
**Date:** November 17, 2025

---

## 🎯 Overview

This document outlines the complete, automated purchase order workflow from inventory monitoring through vendor fulfillment. All components are tied together in a clean, logical flow.

---

## 📊 The Complete Flow (Daily Cycle)

```
┌─────────────────────────────────────────────────────────────────┐
│                    INVENTORY MONITORING                          │
│  - Sales tracking (daily updates via Finale sync)               │
│  - Stock levels (real-time from inventory_items table)          │
│  - Consumption calculation (30-day & 90-day rolling averages)   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              NIGHTLY REORDER SCAN (6am UTC)                      │
│  Edge Function: nightly-reorder-scan                            │
│                                                                  │
│  For each active inventory item:                                │
│  1. Calculate available stock (current + on_order)              │
│  2. Compare to reorder point                                    │
│  3. Calculate consumption rate (30-day avg)                     │
│  4. Determine days until stockout                               │
│  5. Assign urgency (critical/high/normal/low)                   │
│  6. Calculate recommended order quantity                        │
│                                                                  │
│  Output: Populates reorder_queue table                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  REORDER QUEUE REVIEW                            │
│  Component: ReorderQueueDashboard                               │
│                                                                  │
│  User sees:                                                      │
│  - Items sorted by urgency (critical first)                     │
│  - Days until stockout                                          │
│  - Recommended quantities (respects MOQ)                        │
│  - Consumption insights (avg daily sales)                       │
│  - Vendor grouping                                              │
│                                                                  │
│  User actions:                                                  │
│  - Select items by urgency ("Select Critical")                  │
│  - Select all items from same vendor                            │
│  - Click "Create Purchase Orders"                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              PURCHASE ORDER CREATION                             │
│  Auto-grouped by vendor                                         │
│                                                                  │
│  System creates:                                                │
│  1. PO header (purchase_orders table)                           │
│     - Order ID: PO-YYYYMMDD-XXX                                 │
│     - Status: draft                                             │
│     - Vendor info                                               │
│     - Expected date (order date + vendor lead time)             │
│                                                                  │
│  2. Line items (purchase_order_items table)                     │
│     - SKU, quantity, unit cost                                  │
│     - Line status: pending                                      │
│     - Consumption context (for future analysis)                 │
│                                                                  │
│  Output: Draft POs ready for review                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  PO REVIEW & APPROVAL                            │
│  Page: PurchaseOrders.tsx                                       │
│                                                                  │
│  User reviews draft POs:                                        │
│  - Verify quantities                                            │
│  - Adjust items if needed                                       │
│  - Add special instructions                                     │
│  - Change expected delivery date                                │
│                                                                  │
│  User approves → Status changes to "Submitted"                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  VENDOR COMMUNICATION                            │
│                                                                  │
│  Two options:                                                   │
│                                                                  │
│  A. Email Send (via Gmail integration)                          │
│     - Generate PDF from PO                                      │
│     - Email to vendor                                           │
│     - Track sent_at timestamp                                   │
│                                                                  │
│  B. CSV Export (for Finale)                                     │
│     - Export to Finale PO format                                │
│     - User uploads to Finale Inventory                          │
│     - Finale sends to vendor                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   FULFILLMENT TRACKING                           │
│                                                                  │
│  As items arrive:                                               │
│  1. Update line_status (pending → partial → received)           │
│  2. Update quantity_received                                    │
│  3. Update inventory stock levels                               │
│  4. When all items received → PO status: "Fulfilled"            │
│                                                                  │
│  Data flows back to:                                            │
│  - Inventory levels increase                                    │
│  - On-order quantities decrease                                 │
│  - Next day's scan reflects new stock                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                      🔄 CYCLE REPEATS
```

---

## 🔑 Key Components & Their Roles

### 1. **Inventory Monitoring** (Foundation)
- **Table:** `inventory_items`
- **Updates:** Real-time via Finale sync, manual adjustments, build order completions
- **Calculates:** `sales_last_30_days`, `sales_last_90_days` (rolling averages)
- **Purpose:** Provides consumption data for intelligent reordering

### 2. **Reorder Queue Scanner** (Intelligence)
- **Service:** `services/reorderQueueScanner.ts`
- **Edge Function:** `supabase/functions/nightly-reorder-scan/index.ts`
- **Schedule:** Daily at 6am UTC (cron job)
- **Logic:**
  ```typescript
  if (availableStock < reorderPoint) {
    recommendedQty = (leadTimeDemand + safetyStock) - availableStock;
    urgency = calculateUrgency(daysUntilStockout, leadTime);
    → Insert into reorder_queue
  }
  ```
- **Purpose:** Identifies what to order, when to order, and how urgent

### 3. **Reorder Queue Dashboard** (Human Oversight)
- **Component:** `components/ReorderQueueDashboard.tsx`
- **Features:** Urgency sorting, vendor grouping, batch selection
- **Purpose:** Gives users visibility and control over automated recommendations

### 4. **Purchase Order System** (Execution)
- **Tables:** `purchase_orders` + `purchase_order_items`
- **Hooks:** `useSupabasePurchaseOrders()`, `createPurchaseOrder()`
- **UI:** `pages/PurchaseOrders.tsx`, `components/CreatePoModal.tsx`
- **Purpose:** Converts recommendations into actionable vendor orders

### 5. **Finale Integration** (External System Sync)
- **Services:** `finalePOImporter.ts`, `finalePOExporter.ts`, `finaleSyncService.ts`
- **Purpose:** Bidirectional sync with Finale Inventory system

---

## 🎨 Where Everything Lives

### Database Schema (Migration 022)
```
purchase_orders
├── id (UUID, internal)
├── order_id (PO-YYYYMMDD-XXX, display)
├── vendor_id → vendors(id)
├── status (draft/pending/sent/confirmed/partial/received/cancelled)
├── order_date, expected_date
├── totals (subtotal, tax, shipping)
├── notes (internal_notes, vendor_notes)
└── finale_sync metadata

purchase_order_items
├── id (UUID)
├── po_id → purchase_orders(id)
├── inventory_sku
├── quantity_ordered, quantity_received
├── unit_cost
├── line_status (pending/partial/received/cancelled)
└── consumption context (for analysis)

reorder_queue
├── id (UUID)
├── inventory_sku
├── vendor_id
├── current_stock, on_order
├── recommended_quantity
├── urgency, priority_score
├── days_until_stockout
├── consumption metrics
└── status (pending/po_created/resolved/cancelled)
```

### Services Layer
```
services/
├── reorderQueueScanner.ts     # Daily inventory analysis
├── finalePOImporter.ts         # Import Finale POs to MuRP
├── finalePOExporter.ts         # Export MuRP POs to Finale
└── finaleSyncService.ts        # Sync orchestration

supabase/functions/
└── nightly-reorder-scan/       # Cron job runner
```

### UI Layer
```
pages/
└── PurchaseOrders.tsx          # Main PO management page
    ├── ReorderQueueDashboard   # Automated recommendations
    ├── RequisitionsSection     # Manual requisitions (from staff)
    └── PO Table                # Active/historical POs

components/
├── ReorderQueueDashboard.tsx   # Reorder recommendations UI
├── CreatePoModal.tsx           # Manual PO creation
└── GeneratePoModal.tsx         # Batch PO from requisitions
```

---

## 🔄 Data Flow Integration Points

### Point 1: Inventory → Reorder Queue
```typescript
// Daily at 6am UTC
reorderQueueScanner.scanInventory()
  → Reads: inventory_items (stock, sales, reorder_point)
  → Writes: reorder_queue (new recommendations)
```

### Point 2: Reorder Queue → Purchase Orders
```typescript
// User clicks "Create Purchase Orders"
ReorderQueueDashboard.handleCreatePOs()
  → Reads: reorder_queue (selected items)
  → Writes: purchase_orders + purchase_order_items
  → Updates: reorder_queue.status = 'po_created'
```

### Point 3: Purchase Orders → Inventory
```typescript
// When items are received
updatePurchaseOrderStatus('received')
  → Updates: purchase_order_items.quantity_received
  → Updates: inventory_items.current_stock += quantity
  → Updates: inventory_items.on_order -= quantity
```

### Point 4: Finale ↔ MuRP
```typescript
// Option A: Import Finale POs
finalePOImporter.importFromCSV(csvData)
  → Creates: purchase_orders + purchase_order_items
  → Source: 'finale_import'

// Option B: Export MuRP POs to Finale
finalePOExporter.exportToCSV(poIds)
  → Reads: purchase_orders + items
  → Generates: Finale-compatible CSV
```

---

## 🚀 Automation Levels

### Current Implementation (Semi-Automated)
✅ Daily scan identifies items to order
✅ Calculates recommended quantities
✅ Assigns urgency levels
✅ Groups by vendor for efficient ordering
⚠️ **User reviews and approves** before PO creation
⚠️ **User sends POs** to vendors

### Potential Full Automation (Optional)
- **Auto-create critical POs** (urgency = critical, days < 3)
- **Auto-send to vendors** (via email or API)
- **Auto-receive** (track shipments, update on delivery)
- **Seasonal forecasting** (adjust for predictable demand spikes)

**Recommended:** Keep human oversight for now. Move to full automation once you trust the system's recommendations (typically after 1-2 months of observation).

---

## 📈 Adding Forecasting (Future Enhancement)

### What's Missing?
Current system is **reactive** (responds to low stock). Forecasting would be **proactive** (predicts future demand).

### How to Add:
1. **Seasonal Patterns** (~2 hours)
   ```typescript
   // In reorder scanner
   const seasonalFactor = getSeasonalFactor(sku, month);
   const adjustedConsumption = consumption30day * seasonalFactor;
   ```

2. **Trend Detection** (~2 hours)
   ```typescript
   // Compare growth
   const growthRate = (last30days - previous30days) / previous30days;
   const trendAdjustedQty = recommendedQty * (1 + growthRate);
   ```

3. **Historical Year-over-Year** (~3 hours)
   ```typescript
   // Compare same month last year
   const yoyGrowth = (thisMarch - lastMarch) / lastMarch;
   ```

### When to Add?
- After 3+ months of sales data (need history for patterns)
- When you notice seasonal items running out before peaks
- When you want to reduce emergency orders

---

## ✅ Current Status

### What's Built & Working:
- ✅ Database schema (purchase_orders, reorder_queue)
- ✅ Reorder queue scanner service
- ✅ Nightly Edge Function for daily scans
- ✅ Reorder queue dashboard UI
- ✅ PO creation from reorder queue
- ✅ PO UI wired to real Supabase data
- ✅ Finale import/export services

### What's Next:
- 🔲 Deploy Edge Function to Supabase
- 🔲 Set up cron job (daily at 6am UTC)
- 🔲 Run migration 022 in production
- 🔲 Test end-to-end workflow
- 🔲 Monitor for 1 week, tune reorder points
- 🔲 (Optional) Add seasonal forecasting

---

## 🎯 Success Metrics

### Week 1:
- Reorder queue populates daily
- Critical items flagged accurately
- POs created from queue successfully

### Month 1:
- Zero stockouts on tracked items
- 90% of POs created from automated recommendations
- Reorder points tuned based on actual consumption

### Month 3:
- 95% PO automation (only exceptions need manual creation)
- Predictable ordering schedule
- Ready to add seasonal forecasting

---

**The flow is clean, connected, and autonomous where it matters—with human oversight where it's valuable.**
