# Finale REST API - Direct Connection (No CSV)

## 🚀 Available REST API Endpoints

All data accessible via **real-time API calls** without CSV reports:

### 1. **Products** (`/product`)
```typescript
GET /product?limit=100&offset=0

Response: FinaleProduct[]
{
  productId: string;
  name: string;
  sku: string;
  description?: string;
  status: 'PRODUCT_ACTIVE' | 'PRODUCT_INACTIVE' | 'PRODUCT_DISCONTINUED';
  unitsInStock: number;
  unitsOnOrder: number;
  unitsReserved: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  cost?: number;
  price?: number;
  defaultSupplier?: string;  // Resource URI
  customFields?: Record<string, any>;
}
```

**Client Method:**
```typescript
await finaleClient.getProducts(limit, offset)
```

**Features:**
- ✅ Real-time stock levels
- ✅ Pagination support (100 items per request)
- ✅ Full product details including pricing
- ✅ Reorder point tracking
- ✅ Active/inactive status filtering

---

### 2. **Vendors/Suppliers** (`/partyGroup?role=SUPPLIER`)
```typescript
GET /partyGroup?role=SUPPLIER

Response: FinaleSupplier[]
{
  partyId: string;
  name: string;
  organizationRole: 'SUPPLIER' | 'CUSTOMER' | 'BOTH';
  email?: string;
  phone?: string;
  website?: string;
  address?: {
    street1: string;
    street2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  contactPerson?: string;
  leadTimeDays?: number;
  paymentTerms?: string;
  notes?: string;
  active: boolean;
}
```

**Client Method:**
```typescript
await finaleClient.getSuppliers()
```

**Features:**
- ✅ Full vendor contact information
- ✅ Lead time tracking
- ✅ Payment terms
- ✅ Active/inactive filtering
- ✅ Customer/supplier role filtering

---

### 3. **Purchase Orders** (`/purchaseOrder` or `/purchase_orders`)
```typescript
GET /purchase_orders?limit=100&offset=0&include=line_items

Response: FinalePurchaseOrder[]
{
  purchaseOrderId: string;
  orderNumber: string;
  supplier: string;  // Resource URI or ID
  status: 'DRAFT' | 'SUBMITTED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  orderDate: string;
  expectedDate?: string;
  receivedDate?: string;
  subtotal: number;
  tax?: number;
  shipping?: number;
  total: number;
  lineItems: [
    {
      product: string;  // Resource URI
      quantity: number;
      unitCost: number;
      total: number;
      receivedQuantity?: number;
    }
  ];
  notes?: string;
}
```

**Client Method:**
```typescript
await finaleClient.getPurchaseOrders(limit, offset)
```

**Features:**
- ✅ Real-time PO status
- ✅ Line item details included
- ✅ Pagination support
- ✅ Status filtering (draft, submitted, received)
- ✅ Financial totals (subtotal, tax, shipping)
- ✅ Received quantity tracking

---

### 4. **Facilities** (`/facility`)
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
