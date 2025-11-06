# 🔄 How to Sync Inventory Stock from Finale

## 🔍 Problem Identified

All 1000 inventory items are loading successfully from Supabase, but they all have `stock: 0`. This is because the inventory hasn't been synced from Finale yet.

## ✅ Solution: Manual Sync

### Step 1: Navigate to Settings
1. Go to **Settings** page in the app
2. Click on the **"Finale Setup"** tab

### Step 2: Run Manual Sync
1. Look for the **"Sync Data"** button
2. Select which data to sync:
   - ✅ **Inventory** (MUST be checked)
   - ✅ Vendors
   - ✅ BOMs
3. Click **"Start Sync"** or **"Sync Now"** button

### Step 3: Monitor Progress
- Watch the sync progress indicator
- Check console for detailed logs:
  ```
  [FinaleSyncService] Fetched X inventory items from Finale CSV
  [FinaleSyncService] Saving X inventory items to Supabase...
  ```

### Step 4: Verify Stock Data
1. Go to **Inventory** page
2. Check console logs:
   ```
   [Inventory] Items with stock > 0: X (should be > 0 now)
   ```
3. Verify the table shows actual stock values

### Step 5: Check BOMs Page
1. Navigate to **BOMs** page
2. Stock and buildability calculations should now show real values
3. Console should show:
   ```
   [BOMs] Inventory items with stock > 0: X
   [BOMs] Component SKU: ABC123 | Found: true | Stock: 150 | CanBuild: 10
   ```

## 🔧 Technical Details

### What Happens During Sync

1. **Fetch from Finale**
   - Calls `FINALE_INVENTORY_REPORT_URL`
   - Downloads CSV with all inventory data including stock levels

2. **Transform Data**
   - Converts Finale CSV format to app format
   - Maps vendor names to vendor IDs
   - Validates and deduplicates items

3. **Save to Supabase**
   - Upserts inventory items to `inventory_items` table
   - Stock values are saved in the `stock` column
   - Real-time subscriptions trigger UI updates

### Environment Variables Required

```bash
FINALE_INVENTORY_REPORT_URL="https://app.finaleinventory.com/..."
FINALE_API_KEY="..."
FINALE_API_SECRET="..."
FINALE_ACCOUNT_PATH="buildasoilorganics"
```

All are configured in `.env.local` ✅

## 📊 Expected Results

**Before Sync:**
- Inventory count: 1000 items
- Items with stock > 0: **0**
- All stock values show as 0
- Buildability shows "Can build: 0"

**After Sync:**
- Inventory count: 1000+ items
- Items with stock > 0: **XXX** (actual count)
- Real stock values from Finale
- Buildability calculations work correctly

## 🚨 Troubleshooting

### If Sync Fails

1. **Check Console for Errors**
   ```
   [FinaleSyncService] ⚠️ WARNING: No inventory items returned from CSV!
   ```

2. **Verify Report URL**
   - Go to Finale → Reports
   - Regenerate Inventory Report if expired
   - Update `FINALE_INVENTORY_REPORT_URL` in `.env.local`

3. **Check API Credentials**
   - Verify `FINALE_API_KEY` and `FINALE_API_SECRET`
   - Test connection in Settings → Finale Setup

### If Stock Still Shows 0

1. **Check Supabase Database**
   ```sql
   SELECT sku, name, stock 
   FROM inventory_items 
   WHERE stock > 0 
   LIMIT 10;
   ```

2. **Verify CSV Contains Stock Data**
   - Check the Finale report includes stock column
   - Verify column name matches transformer expectations

3. **Check Transformer Logic**
   - File: `lib/finale/transformers.ts`
   - Look for stock mapping in `transformFinaleProductsToInventory()`

## 🎯 Next Steps After Sync

Once stock data is synced:
1. ✅ Inventory page shows real stock levels
2. ✅ BOMs page calculates actual buildability
3. ✅ MRP calculations use real data
4. ✅ Purchase order recommendations are accurate

## 🔄 Automatic Sync

To enable automatic sync:
1. Go to Settings → Finale Setup
2. Toggle **"Enable Auto-Sync"**
3. Configure sync intervals:
   - Inventory: Every 5 minutes (critical)
   - Vendors: Every 1 hour (stable)
   - BOMs: Every 15 minutes

---

**Current Status:** Waiting for manual sync to populate stock data from Finale.
