# Professional Finale REST API Integration

## 🎯 Overview

Enterprise-grade REST API integration with Finale Inventory for the **SHIPPING facility**. Designed to minimize API hits while maximizing data freshness through intelligent delta synchronization.

---

## 📊 Data Scope

### **What Gets Synced:**

1. **Inventory/Products** (REST API: `/product`)
   - All products from SHIPPING facility
   - Real-time stock levels (on hand, on order, reserved)
   - Pricing, reorder points, MOQ
   - Historical tracking (current year onwards)

2. **Purchase Orders** (REST API: `/purchase_orders`)
   - All POs for SHIPPING facility
   - Current year onwards (2025+)
   - Line items with product details
   - Real-time status tracking

3. **BOMs** (Extracted from Product Data)
   - Component relationships
   - Assembly quantities
   - Derived from product custom fields

---

## ⚡ Performance Optimization

### **Delta Sync (Intelligent Caching)**
```
First Sync:    Full data pull → ~50 API calls → ~25 seconds
Later Syncs:   Only changed data → ~5 API calls → ~3 seconds
API Calls Saved: ~90% reduction after initial sync
```

**How it works:**
1. Records last sync timestamp in database
2. On subsequent syncs, only fetches items modified since last sync
3. Automatically falls back to full sync if >4 hours elapsed
4. Early pagination termination when no changes detected

### **Rate Limiting**
- Finale Limit: 60 requests/minute
- Configured: 50 requests/minute (conservative buffer)
- Automatic queuing and throttling
- Progress monitoring

### **Resilience**
- Circuit Breaker: Auto-stops after 5 consecutive failures
- Retry Logic: 3 attempts with exponential backoff
- Error Recovery: Continues on partial failures
- Comprehensive logging

---

## 🚀 Features

### **Automatic Sync**
```typescript
// Auto-triggers on app load when credentials detected
initializeFinaleAutoSync();

// Runs:
// - Initial sync on startup
// - Delta sync every 4 hours
// - Manual sync available via UI
```

### **Progress Monitoring**
```typescript
syncService.onProgress((progress) => {
  console.log(`${progress.phase}: ${progress.percentage}%`);
  // products: 45% - Fetched 450 products (5 API calls)
});
```

### **Metrics Tracking**
```typescript
const metrics = await syncService.syncAll();
/*
{
  apiCallsTotal: 52,
  apiCallsSaved: 0,  // First sync
  recordsProcessed: 5234,
  recordsUpdated: 5234,
  duration: 24500,   // 24.5 seconds
  errors: 0
}
*/
```

---

## 🔧 Configuration

### **Environment Variables**
```bash
# Required
VITE_FINALE_API_KEY=your-api-key
VITE_FINALE_API_SECRET=your-secret
VITE_FINALE_ACCOUNT_PATH=your-account

# Optional
VITE_FINALE_BASE_URL=https://app.finaleinventory.com
```

### **Sync Configuration** (Default)
```typescript
{
  facilityName: 'shipping',           // Filter to SHIPPING facility
  requestsPerMinute: 50,              // Conservative rate limit
  productBatchSize: 100,              // Products per API call
  purchaseOrderBatchSize: 100,        // POs per API call
  historicalStartDate: '2025-01-01',  // Current year onwards
  enableDeltaSync: true,              // Intelligent caching
  deltaThresholdHours: 4,             // Full sync after 4h
  maxRetries: 3,                      // Retry attempts
  retryDelayMs: 2000                  // 2 second base delay
}
```

---

## 📋 Database Schema

### **New Table: `sync_log`**
```sql
CREATE TABLE sync_log (
  id UUID PRIMARY KEY,
  source TEXT,                    -- 'finale_rest'
  status TEXT,                    -- 'success' | 'failed' | 'partial'
  records_processed INTEGER,
  api_calls INTEGER,
  api_calls_saved INTEGER,        -- Delta sync optimization
  duration_ms INTEGER,
  completed_at TIMESTAMPTZ,
  -- Enables delta sync queries
);
```

### **Enhanced Tables:**
```sql
-- inventory table
ALTER TABLE inventory ADD COLUMN
  finale_product_id TEXT,
  finale_last_modified TIMESTAMPTZ,
  custom_fields JSONB;

-- purchase_orders table
ALTER TABLE purchase_orders ADD COLUMN
  finale_po_id TEXT,
  finale_supplier TEXT,
  finale_last_modified TIMESTAMPTZ;
```

---

## 🎯 API Endpoints Used

### **Products**
```http
GET /product?limit=100&offset=0
```
**Response:**
```json
{
  "productId": "12345",
  "sku": "BAS-MIX-001",
  "name": "BuildASoil Complete Mix - 5lb",
  "unitsInStock": 245,
  "unitsOnOrder": 100,
  "reorderPoint": 50,
  "cost": 12.50,
  "price": 24.99,
  "lastModified": "2025-12-03T10:30:00Z"
}
```

### **Purchase Orders**
```http
GET /purchase_orders?limit=100&offset=0&include=line_items
```
**Response:**
```json
{
  "purchaseOrderId": "PO-2025-001",
  "orderNumber": "PO-2025-001",
  "status": "SUBMITTED",
  "orderDate": "2025-12-01",
  "total": 1250.00,
  "lineItems": [
    {
      "sku": "BAS-MIX-001",
      "quantity": 100,
      "unitCost": 12.50
    }
  ],
  "lastModified": "2025-12-02T14:20:00Z"
}
```

---

## 📈 Typical Sync Scenarios

### **Scenario 1: First Sync (Empty Database)**
```
Products: 5,000 items → 50 API calls → 20 seconds
Purchase Orders: 234 POs → 3 API calls → 2 seconds
BOMs: Derived from products → 0 API calls → 1 second
Total: 53 API calls, ~23 seconds
```

### **Scenario 2: Delta Sync (3 hours later)**
```
Products: 12 changed → 1 API call → 0.5 seconds
Purchase Orders: 2 new → 1 API call → 0.5 seconds
BOMs: Re-derived → 0 API calls → 0.2 seconds
Total: 2 API calls, ~1 second (51 calls saved!)
```

### **Scenario 3: Full Sync (5 hours later)**
```
Threshold exceeded → Full sync
Products: 5,000 items → 50 API calls → 20 seconds
(Same as first sync, but upserts existing records)
```

---

## 🔍 Filtering Logic

### **Facility Filter**
```typescript
// Only sync items from SHIPPING facility
products.filter(p => 
  !p.facility || 
  p.facility.toLowerCase().includes('shipping')
);
```

### **Date Filter (Purchase Orders)**
```typescript
// Only current year onwards
pos.filter(po => 
  new Date(po.orderDate) >= new Date('2025-01-01')
);
```

### **Delta Filter**
```typescript
// Only items modified since last sync
items.filter(item => 
  new Date(item.lastModified) > lastSyncTimestamp
);
```

---

## 🛠️ Usage Examples

### **Manual Sync**
```typescript
import { getFinaleRestSyncService } from './services/finaleRestSyncService';

const syncService = getFinaleRestSyncService();

// Set credentials
syncService.setCredentials(apiKey, apiSecret, accountPath);

// Monitor progress
syncService.onProgress((progress) => {
  console.log(`${progress.phase}: ${progress.message}`);
});

// Run sync
const metrics = await syncService.syncAll();
console.log(`Synced ${metrics.recordsProcessed} records in ${metrics.duration}ms`);
```

### **Check Last Sync**
```sql
SELECT 
  completed_at,
  records_processed,
  api_calls,
  api_calls_saved,
  duration_ms
FROM sync_log
WHERE source = 'finale_rest'
  AND status = 'success'
ORDER BY completed_at DESC
LIMIT 1;
```

### **View Sync History**
```sql
SELECT 
  DATE(completed_at) as sync_date,
  COUNT(*) as syncs_per_day,
  SUM(records_processed) as total_records,
  SUM(api_calls) as total_api_calls,
  AVG(duration_ms / 1000.0) as avg_duration_seconds
FROM sync_log
WHERE source = 'finale_rest'
GROUP BY DATE(completed_at)
ORDER BY sync_date DESC;
```

---

## ✅ Advantages Over CSV Reports

| Feature | REST API | CSV Reports |
|---------|----------|-------------|
| **Data Freshness** | ✅ Real-time | ❌ Stale snapshot |
| **Delta Sync** | ✅ Only changed data | ❌ Full dump every time |
| **Maintenance** | ✅ Zero config | ❌ URLs expire |
| **Line Items** | ✅ Included in POs | ❌ Separate report needed |
| **Filtering** | ✅ API parameters | ❌ Pre-configured in Finale |
| **Historical Data** | ✅ Date range queries | ❌ Current snapshot only |
| **API Efficiency** | ✅ Delta sync ~90% reduction | ❌ Same cost every time |

---

## 🎯 Next Steps

1. **Initial Setup**
   - ✅ Set environment variables
   - ✅ Run database migration 070
   - ✅ Auto-sync triggers on app load

2. **Monitor First Sync**
   - Check browser console for progress
   - Verify data appears in Supabase tables
   - Review metrics in `sync_log` table

3. **Verify Delta Sync**
   - Wait 4+ hours or manually trigger
   - Check `api_calls_saved` metric
   - Confirm only changed items synced

4. **Production Deployment**
   - Set env vars in Vercel
   - Auto-sync runs on every deployment
   - Monitor sync_log for issues

---

## 📞 Support

**Sync Issues?**
1. Check browser console for detailed logs
2. Query `sync_log` table for error messages
3. Verify Finale API credentials
4. Ensure SHIPPING facility exists in Finale

**Performance Issues?**
1. Check `api_calls` vs `api_calls_saved` ratio
2. Verify delta sync is enabled
3. Adjust `deltaThresholdHours` if needed
4. Monitor rate limit (should stay under 50/min)
