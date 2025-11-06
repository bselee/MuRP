# 🔧 Fix Stock Data Issue - Finale Report Missing QOH

## 🔍 Root Cause Identified

Your Finale Inventory Report is configured as `data=product` but **does not include any stock quantity columns**. The CSV transformer is looking for columns like:
- `Units In Stock`
- `In stock`
- `Quantity On Hand`
- `Stock`
- `Quantity`

But none of these exist in your current report!

## ✅ Solution: Add Stock Columns to Finale Report

### Option 1: Edit Existing Report (Recommended)

1. **Go to Finale** → Reports → Find your "BuildASoil Master Inventory List" report (ID: 1762355976575)

2. **Click "Edit Report"**

3. **Add Row Dimensions** for stock data:
   - Look for: `productStockRemaining` or `Product Stock Remaining`
   - Or: `productStockOnHand` or `Product Stock On Hand`
   - Or: `productQuantityAvailable` or `Product Quantity Available`

4. **Drag the stock field** into your Row Dimensions

5. **Save the report** (the URL will stay the same)

6. **Test**: Download the CSV and verify it has a stock column

### Option 2: Use productLocation Report Instead

If the `product` data source doesn't have stock, you might need to switch to `productLocation`:

1. **Create a NEW report** in Finale
2. **Data Source**: Select `productLocation` instead of `product`
3. **Add columns**:
   - Product ID (SKU)
   - Product Name
   - Location (filter for "Shipping" only)
   - **Quantity On Hand** ← This is the key field!
   - Supplier
   - Reorder Point
   - Category
4. **Filters**:
   - Product Status = ACTIVE
   - Location = Shipping (or your main warehouse)
5. **Save and get the CSV URL**
6. **Update** `FINALE_INVENTORY_REPORT_URL` in `.env.local`

### Option 3: Quick Fix - Add productStock Columns

The encoded URL shows your report has many custom fields. Add these specific stock fields:

**Finale Field Names to Add:**
- `productStockRemaining` → Becomes "Product Stock Remaining" in CSV
- `productStockReserved` → Becomes "Product Stock Reserved" in CSV  
- `productStockOnHand` → Becomes "Product Stock On Hand" in CSV

## 🔍 How to Find Available Fields in Finale

1. In Finale, go to **Reports** → **Edit your report**
2. Look at **Available Dimensions** panel on the left
3. Search for fields containing:
   - "Stock"
   - "Quantity"
   - "On Hand"
   - "Available"
4. These are the exact column names that will appear in the CSV

## 📋 What Your Report Should Include

**Minimum Required Columns:**
```
- Product ID (SKU) ✅ You have this
- Name ✅ You have this
- Category (optional)
- **Quantity On Hand** ❌ MISSING - THIS IS THE PROBLEM
- Supplier ✅ You have this
- Reorder Point ✅ You have this
```

## 🧪 Test Your Changes

After updating the Finale report:

1. **Test the CSV directly**:
   ```bash
   # Download the CSV to check columns
   curl "YOUR_FINALE_INVENTORY_REPORT_URL" | head -1
   ```

2. **Check for stock column**:
   - Should see: `Quantity On Hand` or `Stock` or similar

3. **Sync in app**:
   - Settings → Finale Setup → Sync Data
   - Check console for: `[Inventory Transform] CSV Columns available:`
   - Should now see stock column!

4. **Verify stock values**:
   - Inventory page should show real stock numbers
   - BOMs page buildability should calculate correctly

## 🎯 Alternative: Update Column Names in Transformer

If you can't change the Finale report, tell me what column name Finale uses for stock and I'll add it to the transformer's lookup list.

**Current lookup list** (in `lib/schema/transformers.ts` line 378):
```typescript
const stockRaw = extractFirst(raw, [
  'Units In Stock', 
  'In stock', 
  'Quantity On Hand', 
  'Stock', 
  'stock', 
  'Quantity'
]);
```

**If Finale uses a different name** (e.g., "Available Quantity"), we can add it to this list.

---

## 📊 Expected Result

**After fix:**
```
[Inventory Transform] CSV Columns available: 
  [... "Product ID", "Name", "Quantity On Hand", "Supplier" ...]
  
[Inventory Transform] Item 0 (ABC123): stockRaw="150", parsed stock=150
[Inventory] Items with stock > 0: 245
```

**Current (broken):**
```
[Inventory] Items with stock > 0: 0
```

---

**Next Step:** Edit your Finale report to include a stock/quantity column, then sync again!
