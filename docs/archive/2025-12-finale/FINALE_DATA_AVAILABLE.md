# Finale API Data Availability Analysis

## 📊 Available Data from Finale

Based on `lib/finale/types.ts` and the API client, Finale provides:

### 1. **Products (Inventory)**
```typescript
interface FinaleProduct {
  id: number;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  status: 'PRODUCT_ACTIVE' | 'PRODUCT_INACTIVE' | 'PRODUCT_DISCONTINUED';
  
  // Stock Information
  unitsInStock: number;
  unitsOnOrder: number;
  unitsReserved: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  moq?: number;  // Minimum Order Quantity
  
  // Pricing
  cost?: number;
  price?: number;
  
  // Supplier
  defaultSupplier?: string;  // Resource URI to vendor
  
  // Physical
  weight?: number;
  weightUnit?: string;
  
  // Metadata
  customFields?: Record<string, any>;
  createdDate: string;
  lastModified: string;
}
```

**Access via:**
- ✅ REST API: `client.fetchProducts({ limit, offset, status })`
- ✅ CSV Reports: VITE_FINALE_INVENTORY_REPORT_URL (pre-configured)

### 2. **Vendors/Suppliers**
```typescript
interface FinalePartyGroup {
  id: number;
  name: string;
  organizationRole: 'SUPPLIER' | 'CUSTOMER' | 'BOTH';
  
  // Contact Info
  email?: string;
  phone?: string;
  website?: string;
  address?: { ... };
  contactPerson?: string;
  
  // Business Terms
  leadTimeDays?: number;
  paymentTerms?: string;
  notes?: string;
  
  active: boolean;
  createdDate: string;
  lastModified: string;
}
```

**Access via:**
- ✅ REST API: `client.fetchVendors({ limit, offset })`
- ✅ CSV Reports: VITE_FINALE_VENDORS_REPORT_URL (pre-configured)

### 3. **Purchase Orders**
```typescript
interface FinalePurchaseOrder {
  id: number;
  orderNumber: string;
  supplier: string;  // Resource URI
  status: 'DRAFT' | 'SUBMITTED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  
  // Dates
  orderDate: string;
  expectedDate?: string;
  receivedDate?: string;
  
  // Financial
  subtotal: number;
  tax?: number;
  shipping?: number;
  total: number;
  
  // Items
  lineItems: FinalePOLineItem[];
  
  notes?: string;
  createdDate: string;
  lastModified: string;
}
```

**Access via:**
- ✅ REST API: `client.fetchPurchaseOrders({ limit, offset, status })`

### 4. **Bill of Materials (BOMs)**
- Extracted from product data (products with components)
- Shows parent-child relationships
- Component quantities

**Access via:**
- ✅ CSV Reports: VITE_FINALE_BOM_REPORT_URL (pre-configured)

## 🐛 Critical Bugs Found

### Issue 1: Wrong Method Names (BLOCKING DATA SYNC)

**Location:** `services/finaleSyncService.ts`

```typescript
// ❌ BROKEN - Method doesn't exist:
await this.client.getProducts(batchSize, offset)
await this.client.getInventory()
await this.client.getPurchaseOrders(batchSize, offset)

// ✅ CORRECT - Actual FinaleClient methods:
await this.client.fetchProducts({ limit, offset })
// CSV method doesn't exist yet - needs implementation
await this.client.fetchPurchaseOrders({ limit, offset })
```

### Issue 2: Missing CSV Methods

The client is missing methods for CSV reports that the sync service expects:
- `getInventory()` - Fetch inventory CSV
- `getVendors()` - Fetch vendors CSV  
- `getBOMs()` - Fetch BOMs CSV

## 🔧 What Needs Fixing

1. **Inventory REST API sync** - Change `getProducts()` → `fetchProducts()`
2. **Inventory CSV sync** - Implement `getInventory()` method or use fetchProducts()
3. **Purchase Orders** - Already fixed ✅ (commit 614f289)
4. **Vendors sync** - Likely has same issue

## 📈 Data Volume (Based on Your .env.local)

Your Finale account has CSV report URLs configured:
- **Inventory**: Master product list report
- **BOMs**: Build BOM Report
- **Vendors**: Supplier list

These are pre-filtered in Finale to include:
- ✅ ACTIVE products only
- ✅ Specific facility (buildasoilorganics)
- ✅ Relevant data columns

## 🎯 Recommendation

**Option A: Use REST API (Clean but slower)**
- Fetch via `fetchProducts()`, `fetchVendors()`, `fetchPurchaseOrders()`
- Slower due to pagination
- Always fresh data
- Rate limited (60/min per user)

**Option B: Use CSV Reports (Fast but needs URL maintenance)**
- Pre-configured report URLs in .env.local
- Very fast (single request gets all data)
- Filtered in Finale UI
- URLs can expire - need regeneration

**Current Implementation:** Hybrid approach
- Inventory: CSV (fast)
- Vendors: CSV (fast)
- BOMs: CSV (fast)
- Purchase Orders: REST API (always fresh)

This is optimal! Just need to fix the method names.
