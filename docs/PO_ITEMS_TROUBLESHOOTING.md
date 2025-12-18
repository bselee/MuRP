# PO Items Troubleshooting Guide

## Issue: "Items Ordered (0)" in PO Modal

### Quick Diagnosis

**Open your browser console (F12) and look for:**
```
[PODetailModal] PO items debug: {
  poId: "124094",
  hasItems: true/false,
  hasLineItems: true/false,
  hasLineItemsCamel: true/false,
  hasPurchaseOrderItems: true/false,
  itemsCount: 0,
  firstItem: {...}
}
```

### What Each Field Means

- **`hasItems: true`** → PO has `.items` property (internal POs)
- **`hasLineItems: true`** → PO has `.line_items` property (legacy format)
- **`hasLineItemsCamel: true`** → PO has `.lineItems` property (Finale POs)
- **`hasPurchaseOrderItems: true`** → PO has `.purchase_order_items` property (raw Supabase)
- **`itemsCount: 0`** → **PROBLEM**: No items found in any field
- **`firstItem: {...}`** → Shows structure of first item (if found)

---

## Fix Steps Based on Console Output

### Case 1: All fields are `false`
**Problem:** PO has no items in database

**Solution:**
```sql
-- Check if PO exists
SELECT order_id, status, total 
FROM finale_purchase_orders 
WHERE order_id = '124094';

-- Check if line_items column has data
SELECT order_id, line_items 
FROM finale_purchase_orders 
WHERE order_id = '124094';

-- If line_items is null, resync from Finale
```

### Case 2: `hasLineItemsCamel: true` but `itemsCount: 0`
**Problem:** lineItems exists but is empty array `[]`

**Solution:**
```sql
-- Check Finale raw data
SELECT order_id, line_items, line_count 
FROM finale_purchase_orders 
WHERE order_id = '124094';

-- If line_count > 0 but line_items is empty, trigger resync
```

### Case 3: `hasPurchaseOrderItems: true` but `itemsCount: 0`
**Problem:** Relation exists but returned empty

**Solution:**
```sql
-- Check purchase_order_items table
SELECT * FROM purchase_order_items 
WHERE po_id IN (
  SELECT id FROM purchase_orders WHERE order_id = '124094'
);

-- If no rows, items weren't created when PO was created
```

---

## Manual Fix for Specific PO #124094

**Step 1: Check PO in database**
```sql
-- Run in Supabase SQL Editor
SELECT 
  id,
  order_id,
  vendor_name,
  status,
  total,
  line_items,
  line_count
FROM finale_purchase_orders
WHERE order_id = '124094';
```

**Step 2: If `line_items` is null or empty**
```sql
-- Force resync this specific PO from Finale
-- (This would trigger the Finale API sync for this order)
UPDATE finale_purchase_orders 
SET finale_sync_status = 'pending'
WHERE order_id = '124094';
```

**Step 3: If PO doesn't exist in Supabase**
- PO only exists in Finale, not synced to Supabase yet
- Run full Finale sync: Dashboard → Settings → Finale Integration → Sync Now

---

## Expected Data Structures

### Finale PO (finale_purchase_orders table)
```json
{
  "order_id": "124094",
  "vendor_name": "Quinton O'Connor",
  "lineItems": [  // ← Note: camelCase
    {
      "productUrl": "https://...",  // ← SKU
      "productName": "Widget ABC",
      "quantity": 10,
      "price": 2.50
    }
  ]
}
```

### Internal PO (purchase_orders table)
```json
{
  "order_id": "PO-001",
  "vendor_id": "uuid",
  "items": [  // ← Note: lowercase
    {
      "sku": "SKU-123",
      "description": "Widget ABC",
      "quantity": 10,
      "unitCost": 2.50
    }
  ]
}
```

### Raw Supabase (with relation)
```json
{
  "order_id": "PO-001",
  "purchase_order_items": [  // ← Note: snake_case relation
    {
      "sku": "SKU-123",
      "description": "Widget ABC",
      "qty_ordered": 10,
      "unit_cost": 2.50
    }
  ]
}
```

---

## Testing After Fix

**Step 1: Clear browser cache**
- Press `Ctrl + Shift + Delete` (or `Cmd + Shift + Delete` on Mac)
- Select "Cached images and files"
- Click "Clear data"

**Step 2: Hard refresh**
- Press `Ctrl + Shift + R` (or `Cmd + Shift + R` on Mac)

**Step 3: Open PO modal again**
- Click on PO #124094
- Check browser console for debug log
- Items should now display

---

## Field Mapping Reference

| Data Source | Items Field | SKU Field | Name Field | Quantity Field | Price Field |
|------------|-------------|-----------|------------|----------------|-------------|
| Finale PO | `lineItems` | `productUrl` | `productName` | `quantity` | `price` |
| Internal PO | `items` | `sku` | `description` or `name` | `quantity` | `unitCost` |
| Supabase Raw | `purchase_order_items` | `sku` | `description` | `qty_ordered` | `unit_cost` |
| Legacy | `line_items` | `product_id` | `product_name` | `quantity_ordered` | `unit_price` |

---

## If Still Not Working

**Check Network Tab:**
1. Open DevTools (F12)
2. Go to Network tab
3. Click on PO to open modal
4. Look for API call (should be to Supabase or `/api/finale-proxy`)
5. Click on the request
6. Check "Response" tab - does it have items data?

**If Response has items but UI doesn't show them:**
- This is a frontend bug
- Send the response JSON to developer

**If Response doesn't have items:**
- This is a backend/database issue
- Need to resync from Finale or check database directly

---

## Quick SQL Queries for Debugging

```sql
-- Count total POs with items
SELECT 
  COUNT(*) as total_pos,
  COUNT(CASE WHEN line_items IS NOT NULL AND jsonb_array_length(line_items) > 0 THEN 1 END) as pos_with_items,
  COUNT(CASE WHEN line_items IS NULL OR jsonb_array_length(line_items) = 0 THEN 1 END) as pos_without_items
FROM finale_purchase_orders
WHERE is_active = true;

-- Find all POs from Quinton O'Connor
SELECT order_id, vendor_name, status, total, line_count, 
       CASE 
         WHEN line_items IS NULL THEN 'NULL'
         WHEN jsonb_array_length(line_items) = 0 THEN 'EMPTY'
         ELSE 'HAS ITEMS'
       END as items_status
FROM finale_purchase_orders
WHERE vendor_name ILIKE '%Quinton%'
ORDER BY order_date DESC
LIMIT 20;

-- Get specific PO with all details
SELECT *
FROM finale_purchase_orders
WHERE order_id = '124094';
```

---

## Prevention for Future

**Ensure all POs have items when created:**

1. **For Finale POs:** Sync includes line items
2. **For Internal POs:** Always create purchase_order_items when creating PO
3. **For Imports:** Validate items exist before saving

**Add validation:**
```typescript
// Before saving PO
if (!po.items || po.items.length === 0) {
  throw new Error('Cannot create PO without items');
}
```

---

**Last Updated:** December 13, 2025  
**Related Commit:** baa98f3
