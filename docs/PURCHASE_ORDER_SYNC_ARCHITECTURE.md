# Purchase Order Data Flow Architecture

## 🎯 Overview

Complete data flow for purchase order synchronization from Finale Inventory to MuRP, with real-time-ish updates and inventory intelligence integration.

**Key Principle:** Read-only integration - MuRP does **NOT** create or modify purchase orders in Finale. All PO management happens in Finale UI, MuRP is a real-time viewer with intelligence layer.

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  FINALE INVENTORY (Source of Truth)                                 │
│  - POs created/updated manually in Finale UI                        │
│  - Status changes: Pending → Submitted → Completed                  │
│  - Line items: Products, quantities, costs                          │
│  - Vendor assignments and dates                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
                    GraphQL API (REQUIRED!)
                /api/graphql endpoint
                orderViewConnection query
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  FINALE GRAPHQL CLIENT (lib/finale/graphql-client.ts)               │
│  ✅ fetchPurchaseOrders({ cursor, limit, status, dateFrom })        │
│  ✅ fetchAllPurchaseOrders() - auto-pagination                      │
│  ✅ fetchRecentPurchaseOrders(timestamp) - delta sync                │
│  ⚡ Circuit breaker + rate limiting + retry logic                   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  PO SYNC SERVICE (services/purchaseOrderSyncService.ts)             │
│  🔄 Auto-sync: Every 15 minutes (configurable)                      │
│  🎯 Delta sync: Only fetch POs modified since last sync             │
│  📦 Full sync: Initial import or recovery                           │
│  🔀 Transform: Finale GraphQL → Supabase schema                     │
│  📊 Intelligence: Trigger calculations after sync                   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  SUPABASE DATABASE                                                   │
│                                                                      │
│  📋 Tables:                                                          │
│  - purchase_orders: PO headers (vendor, dates, totals, status)      │
│  - purchase_order_items: Line items (product, qty, cost, received)  │
│                                                                      │
│  🧮 Functions (038_po_intelligence_functions.sql):                  │
│  - calculate_on_order_quantities() → On-order qty per product       │
│  - calculate_vendor_lead_times() → Avg/stddev lead time per vendor  │
│  - get_product_purchase_history() → Historical pricing/patterns     │
│  - calculate_cost_trends() → Price increases/decreases              │
│  - get_vendor_spending_summary() → Total spend by vendor            │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  INVENTORY INTELLIGENCE ENGINE                                       │
│                                                                      │
│  📊 Calculated Metrics:                                             │
│  - On-order quantities (what's incoming)                            │
│  - Lead time analysis (vendor performance)                          │
│  - Cost trends (price changes over time)                            │
│  - Vendor reliability (on-time delivery %)                          │
│  - Purchasing patterns (seasonality, frequency)                     │
│  - Reorder recommendations (based on PO history + demand)           │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  MURP UI (React Components)                                         │
│                                                                      │
│  📄 Pages:                                                          │
│  - Purchase Orders List (real-time data via Supabase subscriptions) │
│  - PO Details (line items, tracking, vendor info)                   │
│  - Vendor Analytics (spend, lead times, reliability)                │
│  - Inventory Dashboard (on-order quantities, reorder alerts)        │
│                                                                      │
│  🎛️ Controls:                                                       │
│  - Manual sync trigger (full/delta)                                 │
│  - Auto-sync toggle (enable/disable)                                │
│  - Sync status indicator (last sync time, next scheduled)           │
│  - Filter by status, vendor, date range                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Components

### 1. Finale GraphQL Client (`lib/finale/graphql-client.ts`)

**Why GraphQL?**
- ❌ REST API `/api/order?orderTypeId=PURCHASE_ORDER` **DOES NOT WORK** - filter is ignored!
- ✅ GraphQL `orderViewConnection(type: ["PURCHASE_ORDER"])` is the **ONLY** way to get POs
- ✅ Supports advanced filters: status, supplier, date range, lastUpdated
- ✅ Cursor-based pagination (efficient for large datasets)
- ✅ Nested data (supplier, line items) in single query

**Key Methods:**
```typescript
// Fetch single page
const result = await client.fetchPurchaseOrders({
  limit: 100,
  cursor: null,
  status: ['Pending', 'Submitted'],
  dateFrom: '2024-01-01',
  dateTo: '2024-12-31',
});

// Fetch all POs (auto-paginate)
const allPOs = await client.fetchAllPurchaseOrders();

// Delta sync (only changed since timestamp)
const recentPOs = await client.fetchRecentPurchaseOrders('2024-12-04T10:00:00Z');
```

**GraphQL Query Structure:**
```graphql
orderViewConnection(
  first: 100
  type: ["PURCHASE_ORDER"]
  status: ["Pending", "Submitted", "Completed"]
  orderDate: { from: "2024-01-01", to: "2024-12-31" }
  recordLastUpdated: { from: "2024-12-04T10:00:00Z" }
) {
  edges {
    node {
      orderId
      status
      orderDate
      receiveDate
      total
      supplier { partyId, name }
      itemList { edges { node { productId, quantity, unitPrice }}}
    }
  }
  pageInfo { hasNextPage, endCursor }
}
```

---

### 2. Purchase Order Sync Service (`services/purchaseOrderSyncService.ts`)

**Singleton service** that manages all PO synchronization.

**Auto-Sync Mode:**
```typescript
import { startPOAutoSync, stopPOAutoSync } from './services/purchaseOrderSyncService';

// Start auto-sync every 15 minutes
startPOAutoSync(15);

// Stop auto-sync
stopPOAutoSync();
```

**Manual Sync:**
```typescript
import { triggerPOSync } from './services/purchaseOrderSyncService';

// Delta sync (only changed POs)
const result = await triggerPOSync('delta');

// Full sync (all POs)
const result = await triggerPOSync('full');
```

**Sync Result:**
```typescript
interface SyncResult {
  success: boolean;
  syncType: 'full' | 'delta';
  timestamp: string;
  duration: number; // milliseconds
  stats: {
    fetched: number;    // From Finale
    inserted: number;   // New POs in Supabase
    updated: number;    // Existing POs updated
    errors: number;     // Failed operations
  };
  errors?: Array<{ message: string; details?: any }>;
}
```

**Sync Flow:**
1. Check if sync already running (prevent overlaps)
2. Get GraphQL client
3. Fetch POs from Finale (delta or full)
4. Transform GraphQL format → Supabase schema
5. Upsert POs to database (on conflict update)
6. Upsert line items (delete old, insert new)
7. Update inventory intelligence (call SQL functions)
8. Update sync status and timestamp
9. Return result

---

### 3. Database Schema (`supabase/migrations/`)

**purchase_orders table:**
```sql
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT UNIQUE NOT NULL,           -- Finale PO number
  vendor_id TEXT NOT NULL,                 -- Finale partyId
  vendor_name TEXT NOT NULL,
  status TEXT NOT NULL,                    -- pending, submitted, received, etc.
  order_date TIMESTAMP NOT NULL,
  expected_date TIMESTAMP,
  received_date TIMESTAMP,
  subtotal NUMERIC(12,2) DEFAULT 0,
  tax NUMERIC(12,2) DEFAULT 0,
  shipping NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  facility_id TEXT,
  facility_name TEXT,
  notes TEXT,
  finale_last_updated TIMESTAMP,           -- Track Finale changes
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_po_vendor ON purchase_orders(vendor_id);
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_order_date ON purchase_orders(order_date);
CREATE INDEX idx_po_finale_updated ON purchase_orders(finale_last_updated);
```

**purchase_order_items table:**
```sql
CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  received_quantity NUMERIC(12,3) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_poi_po ON purchase_order_items(po_id);
CREATE INDEX idx_poi_product ON purchase_order_items(product_id);
```

---

### 4. Intelligence Functions (`038_po_intelligence_functions.sql`)

**On-Order Quantities:**
```sql
SELECT * FROM calculate_on_order_quantities();
-- Returns: product_id, on_order_qty, po_count, earliest/latest expected dates
-- Use case: Show "X units arriving" on inventory dashboard
```

**Vendor Lead Times:**
```sql
SELECT * FROM calculate_vendor_lead_times();
-- Returns: vendor_id, avg_lead_days, min/max, stddev, on_time_delivery_pct
-- Use case: Vendor performance scorecard
```

**Product Purchase History:**
```sql
SELECT * FROM get_product_purchase_history('BC101', 12); -- Last 12 months
-- Returns: order_date, vendor, quantity, unit_cost, lead_days, status
-- Use case: Historical pricing trends, vendor comparison
```

**Cost Trends:**
```sql
SELECT * FROM calculate_cost_trends(6); -- Last 6 months
-- Returns: product_id, avg/min/max cost, variance_pct, cost_trend (increasing/decreasing/stable)
-- Use case: Budget forecasting, cost alerts
```

**Vendor Spending:**
```sql
SELECT * FROM get_vendor_spending_summary(12);
-- Returns: vendor_id, total_spent, po_count, avg_po_value, last_order_date
-- Use case: Vendor relationship insights, negotiation data
```

---

## ⚙️ Configuration

### Environment Variables
```bash
# Required for GraphQL client
VITE_FINALE_API_KEY=your-api-key
VITE_FINALE_API_SECRET=your-api-secret
VITE_FINALE_ACCOUNT_PATH=buildasoilorganics
VITE_FINALE_BASE_URL=https://app.finaleinventory.com
```

### Sync Settings
```typescript
// In App.tsx or Settings page
import { startPOAutoSync } from './services/purchaseOrderSyncService';

// Start auto-sync on app load
useEffect(() => {
  startPOAutoSync(15); // Every 15 minutes
  
  return () => {
    stopPOAutoSync(); // Cleanup on unmount
  };
}, []);
```

---

## 📈 Usage Examples

### Display On-Order Quantities in Inventory Dashboard

```typescript
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

function InventoryDashboard() {
  const [onOrderData, setOnOrderData] = useState([]);

  useEffect(() => {
    const fetchOnOrder = async () => {
      const { data, error } = await supabase
        .rpc('calculate_on_order_quantities');
      
      if (!error) {
        setOnOrderData(data);
      }
    };

    fetchOnOrder();
  }, []);

  return (
    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th>On Order</th>
          <th>Expected</th>
        </tr>
      </thead>
      <tbody>
        {onOrderData.map(item => (
          <tr key={item.product_id}>
            <td>{item.product_id}</td>
            <td>{item.on_order_qty} units</td>
            <td>{new Date(item.earliest_expected_date).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Manual Sync Button

```typescript
import { triggerPOSync, getPOSyncStatus } from './services/purchaseOrderSyncService';

function SyncControlPanel() {
  const [status, setStatus] = useState(getPOSyncStatus());
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    const result = await triggerPOSync('delta');
    console.log('Sync result:', result);
    setStatus(getPOSyncStatus());
    setSyncing(false);
  };

  return (
    <div>
      <p>Last sync: {status.lastSyncTime || 'Never'}</p>
      <p>Next sync: {status.nextScheduledSync || 'Not scheduled'}</p>
      <button onClick={handleSync} disabled={syncing || status.isRunning}>
        {syncing ? 'Syncing...' : 'Sync Now'}
      </button>
    </div>
  );
}
```

### Vendor Performance Card

```typescript
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

function VendorPerformance({ vendorId }: { vendorId: string }) {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      const { data, error } = await supabase
        .rpc('calculate_vendor_lead_times');
      
      if (!error) {
        const vendorMetrics = data.find(v => v.vendor_id === vendorId);
        setMetrics(vendorMetrics);
      }
    };

    fetchMetrics();
  }, [vendorId]);

  if (!metrics) return <p>Loading...</p>;

  return (
    <div className="vendor-card">
      <h3>{metrics.vendor_name}</h3>
      <p>Avg Lead Time: {metrics.avg_lead_days} days</p>
      <p>On-Time Delivery: {metrics.on_time_delivery_pct}%</p>
      <p>Completed Orders: {metrics.completed_po_count}</p>
    </div>
  );
}
```

---

## 🚨 Important Notes

### Why GraphQL is Required
**REST API Limitation:** The Finale REST endpoint `/api/order` **DOES NOT support filtering** by `orderTypeId`. When you query `/api/order?orderTypeId=PURCHASE_ORDER`, the API **ignores the filter** and returns ALL orders (sales + purchase mixed). This makes it impractical to extract purchase orders via REST.

**GraphQL Solution:** The `orderViewConnection` query supports a `type` filter that actually works: `type: ["PURCHASE_ORDER"]` returns ONLY purchase orders. This is documented in `FINALE_REST_API_ENDPOINTS.md`.

### Data Ownership
- **Source of Truth:** Finale Inventory (not MuRP)
- **MuRP Role:** Read-only viewer with intelligence layer
- **No Modifications:** MuRP never creates/updates POs in Finale
- **Sync Direction:** One-way (Finale → MuRP)

### Sync Strategy
- **Delta Sync:** Default mode - only fetch POs modified since last sync (efficient)
- **Full Sync:** Initial import or recovery after errors (slow but complete)
- **Frequency:** 15 minutes recommended (balance freshness vs API load)
- **Idempotency:** Upserts (on conflict update) ensure safe re-syncing

### Error Handling
- Circuit breaker prevents API overload
- Exponential backoff on retries
- Rate limiting (60/min per user)
- Failed POs logged but don't block batch
- Sync continues even if intelligence functions fail

---

## 🔧 Troubleshooting

### No POs syncing
1. Check `.env.local` has Finale credentials
2. Test GraphQL client: `await client.testConnection()`
3. Check browser console for errors
4. Verify Finale account has purchase orders
5. Check Supabase logs for SQL errors

### Slow sync
1. Use delta sync (not full) for regular updates
2. Reduce sync frequency if hitting rate limits
3. Check network speed and API response times
4. Consider pagination size (100 is optimal)

### Incorrect on-order quantities
1. Verify PO statuses are correct (pending/submitted)
2. Check `purchase_order_items.received_quantity` is updating
3. Re-run `calculate_on_order_quantities()` function
4. Check for duplicate POs (should be prevented by unique constraint)

### Intelligence functions return no data
1. Ensure POs exist in database (`SELECT COUNT(*) FROM purchase_orders`)
2. Check function requirements (e.g., min 3 completed orders for lead times)
3. Verify date range filters (may be excluding all data)
4. Check RLS policies allow authenticated access

---

## 📚 Related Documentation

- `FINALE_REST_API_ENDPOINTS.md` - Complete REST vs GraphQL comparison
- `lib/finale/graphql-client.ts` - GraphQL client implementation
- `services/purchaseOrderSyncService.ts` - Sync service code
- `supabase/migrations/038_po_intelligence_functions.sql` - SQL functions
- `SCHEMA_ARCHITECTURE.md` - Overall data architecture

---

## ✅ Success Criteria

Purchase order integration is successful when:

1. ✅ GraphQL client can fetch POs from Finale
2. ✅ Auto-sync runs every 15 minutes without errors
3. ✅ Delta sync only fetches changed POs (not all)
4. ✅ POs display in UI with correct data (vendor, dates, line items, totals)
5. ✅ On-order quantities show in inventory dashboard
6. ✅ Vendor performance metrics calculate correctly
7. ✅ Cost trends identify price changes
8. ✅ Manual sync triggers work from UI
9. ✅ Sync status shows last sync time and next scheduled
10. ✅ No duplicate POs in database (unique constraint enforced)
