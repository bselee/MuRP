# Finale API Integration - REST & GraphQL

## 🎯 Quick Reference

### What API to Use When

| Task | Use This | Why |
|------|----------|-----|
| **Get Purchase Orders** | ✅ **GraphQL ONLY** | REST filtering doesn't work |
| Get Products | ✅ GraphQL (better) | Includes stock levels |
| Get Vendors | ✅ GraphQL (better) | Advanced filtering |
| Get Facilities | ⚠️ REST is fine | Simple data, no filtering needed |
| Get Shipments | ⚠️ REST is fine | No complex queries required |

### Critical Rule
**❌ NEVER use REST API for purchase orders!**  
REST `/api/order?orderTypeId=PURCHASE_ORDER` **ignores the filter** and returns all orders mixed together.  
**✅ ALWAYS use GraphQL** `orderViewConnection(type: ["PURCHASE_ORDER"])` for POs.

---

## 🎯 API Architecture Overview

Finale Inventory provides **TWO separate APIs**:
1. **REST API** - Simple HTTP endpoints for basic CRUD operations
2. **GraphQL API** - Advanced querying with filters, sorting, and complex data retrieval

**Critical Discovery:** Purchase orders are **ONLY accessible via GraphQL**, not REST API!

---

## 📡 REST API Endpoints

### Authentication
```typescript
Authorization: Basic base64(apiKey:apiSecret)
Base URL: https://app.finaleinventory.com/{accountPath}/api
```

### 1. **Products** - ✅ REST API
```http
GET /product?limit=100&offset=0
```

**Response Structure:**
```json
{
  "productId": ["BC101", "BC102"],
  "internalName": ["Bio Char - Small Bag", "Bio Char - Medium"],
  "statusId": ["PRODUCT_ACTIVE", "PRODUCT_INACTIVE"],
  "productUrl": ["/buildasoilorganics/api/product/BC101", "..."],
  "lastUpdatedDate": ["2024-11-28T16:48:23", "..."],
  "priceList": [[{...}], [{...}]],
  "supplierList": [[], []],
  "userFieldDataList": [[{...}], [{...}]]
}
```

**Key Features:**
- ✅ Real-time stock levels (via separate inventory endpoint)
- ✅ Pagination (limit/offset)
- ✅ Product metadata and custom fields
- ✅ Supplier relationships
- ⚠️ **Does NOT include** stock quantities directly - use GraphQL for inventory levels

**Usage:**
```typescript
const response = await fetch(`${baseUrl}/${accountPath}/api/product?limit=100&offset=0`, {
  headers: { 'Authorization': `Basic ${auth}` }
});
const products = await response.json();
```

---

### 2. **Orders (Sales Only)** - ⚠️ REST API (Limited)
```http
GET /order?limit=100&offset=0
```

**Response:**
```json
{
  "orderId": ["10000", "10003"],
  "orderTypeId": ["SALES_ORDER", "SALES_ORDER"],
  "statusId": ["ORDER_COMPLETED", "ORDER_CANCELLED"],
  "orderDate": ["2024-11-16T19:00:00", "..."],
  "total": [52.00, 0]
}
```

**⚠️ CRITICAL LIMITATION:**
- REST `/order` endpoint returns **ALL order types** (sales + purchase)
- **NO filtering support** - cannot filter by `orderTypeId`
- Returns 1000s of mixed orders (sales + purchase in one stream)
- **Purchase orders are buried** in the response - impractical to extract

**Why This Doesn't Work:**
```typescript
// ❌ This filter is IGNORED by the API
GET /order?orderTypeId=PURCHASE_ORDER  // Returns all orders anyway!

// ❌ Manual filtering requires scanning thousands of records
const allOrders = await getAllOrders(); // 5000+ orders
const purchaseOrders = allOrders.filter(o => o.orderTypeId === 'PURCHASE_ORDER');
// Inefficient and slow!
```

---

### 3. **Shipments** - ✅ REST API
```http
GET /shipment?limit=100&offset=0
```

**Response:**
```json
{
  "shipmentId": ["10000", "10002"],
  "shipmentTypeId": ["SALES_SHIPMENT", "SALES_SHIPMENT"],
  "primaryOrderUrl": ["/buildasoilorganics/api/order/10000", "..."],
  "statusId": ["SHIPMENT_SHIPPED", "SHIPMENT_CANCELLED"]
}
```

---

### 4. **Facilities** - ✅ REST API
```http
GET /facility?limit=100&offset=0
```

**Response:**
```json
{
  "facilityId": ["10001", "10002"],
  "facilityName": ["Main Warehouse", "Shipping Facility"],
  "statusId": ["FACILITY_ACTIVE", "FACILITY_ACTIVE"]
}
```

---

### 5. **Invoice** - ✅ REST API
```http
GET /invoice?limit=100&offset=0
```

---

## 🚀 GraphQL API (Advanced Queries)

### Authentication
```typescript
POST https://app.finaleinventory.com/{accountPath}/api/graphql
Authorization: Basic base64(apiKey:apiSecret)
Content-Type: application/json
```

### GraphQL Query Structure
```graphql
{
  <entityName>ViewConnection(
    first: Int
    last: Int
    after: String
    before: String
    sort: [SortInput]
    <filterField>: [FilterValue]
  ) {
    edges {
      node {
        <field1>
        <field2>
        ...
      }
      cursor
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}
```

---

### 1. **Purchase Orders** - ✅ GraphQL ONLY

**⭐ THIS IS THE ONLY WAY TO GET PURCHASE ORDERS!**

```graphql
query GetPurchaseOrders {
  orderViewConnection(
    first: 100
    type: ["PURCHASE_ORDER"]
    status: ["Completed", "Pending", "Submitted"]
  ) {
    edges {
      node {
        orderId
        orderUrl
        type
        status
        orderDate
        receiveDate
        total
        subtotal
        supplier {
          partyId
          name
        }
        origin {
          facilityId
          name
        }
        itemList {
          edges {
            node {
              productId
              productUrl
              quantity
              unitPrice
              receivedQuantity
            }
          }
        }
        publicNotes
        privateNotes
      }
      cursor
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

**Available Filters:**
- `type: ["PURCHASE_ORDER"]` - **REQUIRED** to get POs
- `status: ["Completed", "Pending", "Submitted", "Cancelled"]`
- `supplier: ["partyId1", "partyId2"]` - Filter by vendor
- `orderDate: {from: "2024-01-01", to: "2024-12-31"}` - Date range
- `product: ["productId1"]` - Filter by product in line items
- `origin: ["facilityId"]` - Filter by receiving facility

**Pagination:**
```typescript
// First page
const query1 = { first: 100, type: ["PURCHASE_ORDER"] };

// Next page (use cursor from previous response)
const query2 = { 
  first: 100, 
  after: previousResponse.pageInfo.endCursor,
  type: ["PURCHASE_ORDER"]
};
```

**Full TypeScript Implementation:**
```typescript
async function fetchAllPurchaseOrders() {
  const allPOs = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const query = {
      query: `
        query GetPOs($cursor: String) {
          orderViewConnection(
            first: 100
            after: $cursor
            type: ["PURCHASE_ORDER"]
          ) {
            edges {
              node {
                orderId
                orderUrl
                type
                status
                orderDate
                total
                supplier {
                  partyId
                  name
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      variables: { cursor }
    };

    const response = await fetch(`${baseUrl}/${accountPath}/api/graphql`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(query)
    });

    const result = await response.json();
    const connection = result.data.orderViewConnection;
    
    allPOs.push(...connection.edges.map(e => e.node));
    
    hasNextPage = connection.pageInfo.hasNextPage;
    cursor = connection.pageInfo.endCursor;
  }

  return allPOs;
}
```

---

### 2. **Products with Inventory** - ✅ GraphQL (Better than REST)

```graphql
query GetProductsWithStock {
  productViewConnection(
    first: 100
    status: ["PRODUCT_ACTIVE"]
  ) {
    edges {
      node {
        productId
        productUrl
        internalName
        status
        stock
        reorderQuantityToOrder
        replenishmentQuantityToOrder
        unitSales
        supplier {
          partyId
          name
        }
      }
    }
  }
}
```

**Why GraphQL is better:**
- ✅ Includes `stock` field (not in REST)
- ✅ Filtering by status, category, supplier
- ✅ Nested supplier data in single query
- ✅ Sorting support

---

### 3. **Vendors/Suppliers** - ✅ GraphQL (Replaces REST)

```graphql
query GetSuppliers {
  partyViewConnection(
    first: 100
    role: ["SUPPLIER"]
    status: ["Active"]
  ) {
    edges {
      node {
        partyId
        partyUrl
        name
        role
        status
        contactEmail
        contactPhone
      }
    }
  }
}
```

---

## 📊 REST vs GraphQL Comparison

| Feature | REST API | GraphQL API |
|---------|----------|-------------|
| **Purchase Orders** | ❌ Not filterable | ✅ **REQUIRED** - use `orderViewConnection` |
| **Products** | ✅ Basic data | ✅ **Better** - includes stock levels |
| **Filtering** | ❌ No support | ✅ Advanced filters on all fields |
| **Pagination** | ✅ limit/offset | ✅ **Better** - cursor-based with hasNextPage |
| **Related Data** | ❌ Separate queries | ✅ Nested in single query (supplier, items) |
| **Sorting** | ❌ No support | ✅ Multi-field sorting |
| **Auth** | ✅ Basic Auth | ✅ Basic Auth (same) |
| **Performance** | ⚠️ Fixed response | ✅ Request only needed fields |

---

## 🎯 Recommended API Usage

### For Purchase Orders: **GraphQL ONLY**
```typescript
// ✅ CORRECT - Use GraphQL
const pos = await fetchPurchaseOrdersGraphQL({
  first: 100,
  type: ["PURCHASE_ORDER"],
  status: ["Pending", "Submitted"]
});

// ❌ WRONG - REST doesn't support PO filtering
const pos = await fetch('/api/order?orderTypeId=PURCHASE_ORDER'); // Ignored!
```

### For Products: **GraphQL Preferred**
```typescript
// ✅ BETTER - GraphQL with stock levels
const products = await fetchProductsGraphQL({ 
  first: 100,
  status: ["PRODUCT_ACTIVE"],
  stock: { min: 0, max: 10 } // Low stock filter
});

// ⚠️ OK - REST for basic product data
const products = await fetch('/api/product?limit=100');
```

### For Facilities/Shipments: **REST is Fine**
```typescript
// ✅ REST works well for simple lists
const facilities = await fetch('/api/facility');
const shipments = await fetch('/api/shipment?limit=100');
```

---

## 🔑 Environment Variables

```bash
# Finale API Credentials (same for both REST & GraphQL)
VITE_FINALE_API_KEY=your-api-key
VITE_FINALE_API_SECRET=your-secret
VITE_FINALE_ACCOUNT_PATH=buildasoilorganics
VITE_FINALE_BASE_URL=https://app.finaleinventory.com
```

---

## 📈 Data Flow for Purchase Orders

### Real-Time PO Sync Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FINALE INVENTORY (Source of Truth)                         │
│  - Purchase orders created manually or via integrations     │
│  - Status updates: Pending → Submitted → Completed          │
│  - Line items: Products, quantities, costs                  │
└─────────────────────────────────────────────────────────────┘
                         ↓
                    GraphQL API
                  /api/graphql
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  MURP SYNC SERVICE (Real-time polling every 5-15 min)       │
│  - Query: orderViewConnection(type: ["PURCHASE_ORDER"])     │
│  - Pagination: Cursor-based, 100 POs per request            │
│  - Delta sync: Only fetch orders modified since last sync   │
│  - Transform: Finale format → MuRP database schema          │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  SUPABASE DATABASE (purchase_orders table)                  │
│  - Stores: PO header, line items, vendor, status, dates     │
│  - Indexed: vendor_id, status, order_date, product_id       │
│  - Real-time subscriptions: UI updates on changes           │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  INVENTORY INTELLIGENCE ENGINE                              │
│  - On-order quantities: SUM(po_items WHERE status=Pending)  │
│  - Lead time tracking: orderDate → receiveDate analysis     │
│  - Vendor performance: Completion time, accuracy metrics    │
│  - Purchasing patterns: Frequency, seasonality, trends      │
│  - Reorder suggestions: Based on PO history + demand        │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  MURP UI (Purchase Orders Page)                             │
│  - Real-time PO list with filters (status, vendor, date)    │
│  - PO details: Line items, costs, tracking                  │
│  - Analytics: Spending by vendor, category, time period     │
│  - Insights: Late deliveries, cost variances, trends        │
└─────────────────────────────────────────────────────────────┘
```

### Key Data Points for Intelligence

**From Purchase Orders:**
1. **On-Order Quantities** - What inventory is incoming
2. **Lead Times** - orderDate → receiveDate per vendor/product
3. **Cost Trends** - Unit prices over time
4. **Vendor Reliability** - On-time delivery %
5. **Order Frequency** - How often we purchase each product
6. **Seasonal Patterns** - Peak ordering months/quarters

**Intelligence Calculations:**
```sql
-- On-order quantity by product
SELECT 
  product_id,
  SUM(quantity) as on_order_qty,
  COUNT(DISTINCT vendor_id) as supplier_count
FROM purchase_order_items poi
JOIN purchase_orders po ON poi.po_id = po.id
WHERE po.status IN ('Pending', 'Submitted')
GROUP BY product_id;

-- Vendor lead time analysis
SELECT 
  vendor_id,
  vendor_name,
  AVG(EXTRACT(DAY FROM (receive_date - order_date))) as avg_lead_days,
  STDDEV(EXTRACT(DAY FROM (receive_date - order_date))) as lead_time_variance
FROM purchase_orders
WHERE status = 'Completed' AND receive_date IS NOT NULL
GROUP BY vendor_id, vendor_name;

-- Cost trend analysis
SELECT 
  product_id,
  DATE_TRUNC('month', order_date) as month,
  AVG(unit_price) as avg_cost,
  MIN(unit_price) as best_price,
  MAX(unit_price) as worst_price
FROM purchase_order_items poi
JOIN purchase_orders po ON poi.po_id = po.id
GROUP BY product_id, month
ORDER BY product_id, month DESC;
```

---

## 🔄 Sync Strategy

### Delta Sync (Recommended)
```typescript
// 1. Get last sync timestamp from database
const lastSync = await getLastSyncTime('purchase_orders');

// 2. Query only orders modified since last sync
const query = {
  query: `
    query GetRecentPOs($lastSync: String!) {
      orderViewConnection(
        first: 100
        type: ["PURCHASE_ORDER"]
        recordLastUpdated: { from: $lastSync }
      ) {
        edges {
          node {
            orderId
            recordLastUpdated
            status
            # ... all fields
          }
        }
      }
    }
  `,
  variables: { lastSync: lastSync.toISOString() }
};

// 3. Upsert changed records only
await upsertPurchaseOrders(changedPOs);

// 4. Update sync timestamp
await updateSyncTime('purchase_orders', new Date());
```

### Full Sync (Initial/Recovery)
```typescript
// Fetch ALL purchase orders (paginated)
let cursor = null;
do {
  const page = await fetchPOPage(cursor);
  await upsertPurchaseOrders(page.data);
  cursor = page.nextCursor;
} while (cursor);
```

### Sync Frequency
- **Initial**: Full sync on first run
- **Regular**: Delta sync every 15 minutes
- **Manual**: User-triggered refresh from UI
- **Webhook** (future): Real-time updates when Finale PO changes

---

## 📝 Summary

### What to Use When

| Task | API Type | Endpoint/Query |
|------|----------|----------------|
| **Get Purchase Orders** | GraphQL | `orderViewConnection(type: ["PURCHASE_ORDER"])` |
| **Get Products** | GraphQL | `productViewConnection` (includes stock) |
| **Get Vendors** | GraphQL | `partyViewConnection(role: ["SUPPLIER"])` |
| **Get Facilities** | REST | `GET /facility` |
| **Get Shipments** | REST | `GET /shipment` |

### Critical Discoveries
1. ✅ Purchase orders **ONLY** via GraphQL - REST filtering doesn't work
2. ✅ GraphQL supports advanced filters, sorting, pagination
3. ✅ GraphQL can nest related data (supplier, items) in single query
4. ✅ Both APIs use same authentication (Basic Auth)
5. ✅ GraphQL returns paginated results with cursors for efficient traversal

### 4. **Facilities** - ✅ REST API
```typescript
GET /facility

Response: FinaleFacility[]
{
  facilityId: string;
  name: string;
  address?: object;
  // Additional facility details
}
```

**Client Method:**
```typescript
await finaleClient.getFacilities()
```

**Features:**
- ✅ Multi-location support
- ✅ Warehouse/facility management

---

## 📊 Comparison: REST API vs CSV Reports

| Feature | REST API | CSV Reports |
|---------|----------|-------------|
| **Data Freshness** | ✅ Real-time | ❌ Snapshot (stale) |
| **Speed** | ⚠️ Slower (pagination) | ✅ Fast (single request) |
| **Setup Required** | ✅ Just credentials | ❌ Must create reports in Finale |
| **Maintenance** | ✅ No maintenance | ❌ URLs can expire |
| **Data Volume** | ⚠️ Rate limited (60/min) | ✅ Unlimited |
| **Fields Available** | ✅ All API fields | ⚠️ Only configured columns |
| **Filtering** | ✅ API parameters | ❌ Pre-filtered in Finale |

---

## 🎯 Recommended Approach

### **For Purchase Orders:** ✅ **USE REST API**
```typescript
// Real-time PO data with line items
const pos = await finaleClient.getPurchaseOrders(100, 0);
```

**Why:**
- PO status changes frequently (draft → submitted → received)
- Need real-time updates for purchasing workflow
- Line items included automatically
- Not a huge volume of data (paginated easily)

### **For Inventory:** ✅ **USE REST API**
```typescript
// Real-time stock levels
const products = await finaleClient.getProducts(100, 0);
```

**Why:**
- Stock levels change constantly
- Need accurate data for purchasing decisions
- Reorder points tracked in real-time
- Can filter by status (active/inactive)

### **For Vendors:** ✅ **USE REST API**
```typescript
// Vendor list with contact info
const vendors = await finaleClient.getSuppliers();
```

**Why:**
- Vendor data doesn't change frequently
- Full contact information available
- Lead time and payment terms included
- One-time sync, then periodic refreshes

---

## 🔧 Current Implementation Status

### ✅ Already Using REST API:
- **Purchase Orders:** `getPurchaseOrders(limit, offset)` ✅
- **Vendors:** `getSuppliers()` ✅ (though sync service may use CSV)
- **Products:** `getProducts(limit, offset)` ✅

### ❌ Currently Using CSV (Should Switch):
- **Inventory Sync:** Uses `getInventory()` CSV method
- **BOM Sync:** Uses `getBOMs()` CSV method

---

## 🛠️ What Needs to Change

### 1. Switch Inventory Sync to REST API
```typescript
// CURRENT (CSV):
const rawInventory = await this.client.getInventory();

// CHANGE TO (REST API):
async syncInventory() {
  let offset = 0;
  const batchSize = 100;
  let hasMore = true;
  const allProducts = [];

  while (hasMore) {
    const batch = await this.client.getProducts(batchSize, offset);
    allProducts.push(...batch);
    hasMore = batch.length === batchSize;
    offset += batchSize;
  }

  return allProducts;
}
```

### 2. Switch Vendors Sync to REST API (if not already)
```typescript
// Ensure using REST endpoint, not CSV
const vendors = await this.client.getSuppliers();
// Already returns FinaleSupplier[] in server mode
```

### 3. Keep PO Sync as REST API ✅
```typescript
// Already correct:
const pos = await this.client.getPurchaseOrders(limit, offset);
```

---

## 📈 Performance Characteristics

### REST API Pagination Pattern:
```typescript
Total Products: 5,000
Batch Size: 100
Requests Needed: 50
Time per Request: ~500ms
Total Time: ~25 seconds
Rate Limit: 60 requests/minute (OK for 50 requests)
```

### CSV Report Pattern:
```typescript
Total Products: 5,000
Requests Needed: 1
Time per Request: ~2 seconds
Total Time: ~2 seconds
BUT: Data may be stale, URLs expire, requires Finale UI setup
```

**Verdict:** For real-time data integrity, REST API is worth the ~20-second trade-off.

---

## 🔑 Environment Variables Needed

### For REST API (Required):
```bash
# Finale API credentials
VITE_FINALE_API_KEY=your-api-key
VITE_FINALE_API_SECRET=your-secret
VITE_FINALE_ACCOUNT_PATH=your-account

# OR for OAuth flow:
FINALE_API_URL=https://app.finaleinventory.com/api
FINALE_API_SUBDOMAIN=your-subdomain
FINALE_API_CLIENT_ID=your-client-id
FINALE_API_CLIENT_SECRET=your-client-secret
```

### For CSV Reports (Can Remove):
```bash
# These can be removed if using REST API only:
VITE_FINALE_INVENTORY_REPORT_URL=...  # DELETE
VITE_FINALE_VENDORS_REPORT_URL=...    # DELETE
VITE_FINALE_BOM_REPORT_URL=...        # DELETE
```

---

## ✅ Action Items

1. **Update `finaleSyncService.ts`:**
   - Change `syncInventoryFromCSV()` to use `getProducts()` with pagination
   - Change `syncVendors()` to use `getSuppliers()` REST endpoint
   - Keep `syncPurchaseOrders()` as-is (already correct)

2. **Remove CSV dependencies:**
   - Delete `getInventory()` CSV method calls
   - Delete `getBOMs()` CSV method calls
   - Remove CSV report URL environment variables

3. **Test REST API sync:**
   - Verify products sync with pagination
   - Verify vendors sync with full data
   - Verify POs sync with line items

4. **Update documentation:**
   - Remove references to CSV reports
   - Document REST API as primary data source
   - Update setup guides

---

## 🎯 Bottom Line

**You're 100% right** - REST API is better than CSV for everything:
- ✅ **Purchase Orders:** Real-time status updates (draft → received)
- ✅ **Inventory:** Live stock levels for accurate purchasing
- ✅ **Vendors:** Full contact info and terms
- ✅ **No CSV maintenance:** No expired URLs, no Finale report setup

The only trade-off is sync time (~25 seconds vs ~2 seconds), but that's acceptable for **accurate, real-time data**.
