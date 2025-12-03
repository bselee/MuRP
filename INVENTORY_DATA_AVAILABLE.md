# Inventory Data Available from Finale

## 📦 CSV Report Fields

When you run `getInventory()`, Finale returns a CSV with these columns:

```
SKU / Product Code        - Unique product identifier (e.g., "SKU-1234")
Name / Product Name       - Product name (e.g., "Organic Fertilizer 5lb")
Description              - Full product description
Category                 - Product category/type
Quantity On Hand / Stock - Current stock count
Reorder Point / Level    - Minimum stock before reordering
MOQ / Min Order Quantity - Minimum order quantity from supplier
Vendor / Supplier        - Default supplier name
Vendor ID / Supplier ID  - Supplier identifier in Finale
Unit Cost                - Cost per unit
Price                    - Selling price per unit
Barcode / UPC            - Product barcode/UPC
Notes                    - Additional product notes
```

## 🔄 Transformed Database Fields

After processing through the schema transformers, inventory data becomes:

```typescript
{
  sku: string;             // Required: Stock Keeping Unit
  name: string;            // Required: Product name
  description: string;     // Product description
  category: string;        // Product category (default: 'Uncategorized')
  status: string;          // 'active', 'inactive', 'discontinued'
  
  // Stock levels
  stock: number;           // Current quantity on hand
  onOrder: number;         // Units currently on order from suppliers
  reserved: number;        // Units reserved for orders
  
  // Reorder logic
  minStock: number;        // Minimum stock level (reorder point)
  orderPoint: number;      // When to trigger reorder
  moq: number;             // Minimum order quantity
  
  // Vendor & pricing
  defaultVendorId: string; // Default supplier ID (links to vendors table)
  cost: number;            // Unit cost from supplier
  price: number;           // Selling price to customers
  
  // Identification
  barcode: string;         // Product barcode/UPC
  notes: string;           // Additional notes
}
```

## 🚀 How to Access Inventory Data

### Method 1: CSV Report (Fastest)
```typescript
const inventoryItems = await finaleClient.getInventory();
// Returns: Array<Record<string, any>> with CSV columns
```

**Requirements:**
- Set `VITE_FINALE_INVENTORY_REPORT_URL` in `.env.local`
- CSV report must be created in Finale with the columns above
- Report URL is valid (doesn't expire too quickly)

**Pros:**
✅ Very fast (single request gets ALL products)
✅ Pre-filtered in Finale (e.g., only ACTIVE products)
✅ No pagination needed

**Cons:**
❌ Report URLs can expire (need regeneration in Finale)
❌ Data is snapshot from CSV generation time

### Method 2: REST API (Always Fresh)
```typescript
// Fetch paginated products
const products = await finaleClient.getProducts(limit, offset);
// Returns: FinaleProduct[] with API fields
```

**Pros:**
✅ Always fresh data (real-time)
✅ No CSV report configuration needed
✅ Automatic pagination support

**Cons:**
❌ Slower (need to paginate through all products)
❌ Rate limited (60 requests/minute per user)
❌ Returns different field names than CSV

## 📊 Data Transformation Flow

```
1. RAW CSV DATA (from Finale)
   ↓
   getInventory() returns:
   {
     "SKU": "BAS-001",
     "Name": "Organic Mix 5lb",
     "Quantity On Hand": "150",
     "Unit Cost": "12.50",
     "Vendor": "BuildASoil Supply"
   }

2. PARSED DATA (validated with Zod)
   ↓
   transformInventoryRawToParsed() returns:
   {
     sku: "BAS-001",
     name: "Organic Mix 5lb",
     stock: 150,
     cost: 12.50,
     defaultVendorId: "uuid-of-buildsoil"
   }

3. DATABASE FORMAT (snake_case)
   ↓
   transformInventoryParsedToDatabase() returns:
   {
     sku: "BAS-001",
     name: "Organic Mix 5lb",
     stock: 150,
     cost: 12.50,
     default_vendor_id: "uuid-of-buildsoil"
   }

4. DISPLAY FORMAT (UI-ready)
   ↓
   transformInventoryDatabaseToDisplay() adds:
   {
     ...database fields,
     stockStatus: "In Stock",
     lowStockAlert: false,
     vendorName: "BuildASoil Supply"
   }
```

## 🔍 Current Sync Status

**Automatic Sync:**
- ✅ Runs on app load when Finale credentials detected
- ✅ Uses CSV method for speed (all inventory in one request)
- ✅ Filters for ACTIVE products only
- ✅ Deduplicates by SKU
- ✅ Links to vendor IDs via vendor name matching

**Sync Service:**
- Location: `services/finaleSyncService.ts`
- Method: `syncInventoryFromCSV()`
- Resilience: Circuit breaker + retry logic + rate limiting
- Progress: Real-time progress updates to UI

## 🎯 What You Get

After successful sync, the `inventory` table in Supabase contains:

```sql
SELECT 
  sku,
  name,
  stock,
  cost,
  price,
  min_stock,
  default_vendor_id
FROM inventory
WHERE status = 'active'
ORDER BY sku;
```

This data then appears in:
- `/inventory` page - Full inventory list with search/filter
- Purchase order modals - Product selection
- Build calculations - Component availability
- Low stock alerts - Reorder notifications
- Vendor management - Product sourcing

## 📝 Example Data

```json
{
  "sku": "BAS-MIX-001",
  "name": "BuildASoil Complete Mix - 5lb",
  "description": "Complete organic soil amendment",
  "category": "Soil Amendments",
  "status": "active",
  "stock": 245,
  "onOrder": 100,
  "reserved": 25,
  "minStock": 50,
  "orderPoint": 50,
  "moq": 100,
  "defaultVendorId": "abc123-vendor-uuid",
  "cost": 12.50,
  "price": 24.99,
  "barcode": "850012345678",
  "notes": "Flagship product - maintain high stock"
}
```

---

**💡 Bottom Line:**  
Inventory data from Finale includes **everything you need** to manage stock levels, reordering, vendor relationships, and pricing. The CSV method gets all this data in a single fast request.
