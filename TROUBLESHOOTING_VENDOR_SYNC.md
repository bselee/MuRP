# 🔧 Vendor Sync Troubleshooting Guide

**Issue:** "sync-vendors: require is not defined" / "full-sync: require is not defined"

## ✅ Fix Applied (Commit cbcf552)

**Fixed:** Replaced `require()` with ES module `import` in `finaleSyncService.ts`

---

## 📋 Troubleshooting Steps

### Step 1: Wait for Deployment (2-3 minutes)

The fix has been deployed but Vercel needs time to build and deploy:

1. **Check Vercel Dashboard:**
   - https://vercel.com/will-selees-projects/tgf-mrp
   - Wait for "Deployment Ready" status
   - Look for commit `cbcf552`

2. **Wait for Build:**
   - Build time: ~2 minutes
   - Check logs for "✓ built in X.XXs"

---

### Step 2: Clear Browser Cache

The browser may be caching the old JavaScript:

**Option A: Hard Refresh**
```
Windows/Linux: Ctrl + Shift + R
Mac: Cmd + Shift + R
```

**Option B: Clear Cache in DevTools**
1. Open DevTools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"

**Option C: Incognito Mode**
1. Open new incognito/private window
2. Navigate to https://tgf-mrp.vercel.app
3. Go to Settings → Finale Integration
4. Try sync again

---

### Step 3: Verify Deployment

**Check the deployed JavaScript:**

1. Open browser DevTools (F12)
2. Go to **Sources** tab
3. Find `assets/index-*.js` file
4. Search for "transformVendorParsedToDatabaseEnhanced"
5. Verify it's imported at the top:
   ```javascript
   import { transformVendorParsedToDatabaseEnhanced } from '../lib/schema/transformers';
   ```
6. Should NOT see:
   ```javascript
   require('../lib/schema/transformers')
   ```

---

### Step 4: Check for Other Errors

Open browser console (F12 → Console tab) and look for:

**✅ Good Signs:**
- "Syncing vendors..."
- "Fetched X vendors from Finale"
- "Saving X vendors to Supabase..."

**❌ Bad Signs (report these):**
- Any "require is not defined" errors
- "Module not found" errors
- "Cannot read property" errors

---

### Step 5: Test Connection First

Before trying full sync:

1. Go to Settings → Finale Integration
2. Click **"Test Connection"** button
3. Should see: ✅ "Connected" (green badge)
4. If this fails, credentials may be incorrect

---

### Step 6: Manual Sync with Logs

If sync still fails:

1. Open browser DevTools (F12) → **Console** tab
2. Click **"Run Manual Sync Now"**
3. Watch console for detailed logs
4. Take screenshot of any errors
5. Share with developer

---

## 🔍 Expected Console Output (Success)

```javascript
[FinaleSyncService] Starting full sync...
[FinaleSyncService] Syncing vendors...
[FinaleSyncService] Fetched 50 vendors from Finale
[FinaleSyncService] Detected schema-parsed vendors from proxy
[FinaleSyncService] Deduped vendors count: 48
[FinaleSyncService] Sample update data (first vendor): {name, contact_emails, address_line1, city, ...}
[FinaleSyncService] ✓ Updated 30 existing vendors
[FinaleSyncService] ✓ Inserted 18 new vendors
[FinaleSyncService] Successfully saved 48 vendors (30 updated, 18 inserted)
[FinaleSyncService] Full sync completed in 3500ms
```

---

## 🚨 If Still Failing After All Steps

### Check Supabase Connection

Run this in Supabase SQL Editor to verify vendors table:

```sql
-- Check if table exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vendors'
ORDER BY ordinal_position;

-- Should show enhanced columns:
-- address_line1, city, state, postal_code, phone, website, etc.
```

### Check Environment Variables

Verify these are set in Vercel:

```bash
VITE_SUPABASE_URL=https://mpuevsmtowyexhsqugkm.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
FINALE_API_KEY=I9TVdRvblFod
FINALE_API_SECRET=<your-secret>
```

### Check RLS Policies

Vendors table needs INSERT/UPDATE permissions:

```sql
-- Check policies
SELECT * FROM pg_policies WHERE tablename = 'vendors';

-- Should allow authenticated users to INSERT/UPDATE
```

---

## 📞 Emergency Fallback: Use CSV Import

If vendor sync continues to fail:

1. Export vendors from Finale as CSV
2. Go to Settings → Data Import
3. Upload CSV file
4. Schema transformers will process it
5. Data saved to Supabase

---

## 🎯 Quick Verification

After sync completes, verify data in Supabase:

```sql
SELECT 
  name,
  address_line1,
  city,
  state,
  phone,
  data_source,
  sync_status,
  last_sync_at
FROM vendors
WHERE data_source = 'csv'
ORDER BY last_sync_at DESC
LIMIT 5;
```

**Expected:**
- `data_source` = 'csv'
- `sync_status` = 'synced'
- `last_sync_at` = recent timestamp
- Address fields populated

---

## ✅ Success Indicators

You'll know it worked when:

1. ✅ Toast notification: "✅ Initial sync completed!"
2. ✅ Console shows: "Successfully saved X vendors"
3. ✅ Supabase table shows vendors with complete address data
4. ✅ No errors in console
5. ✅ Last Sync shows timestamp (not "Never")
6. ✅ Items Synced shows count > 0

---

**Last Updated:** November 4, 2025  
**Fix Deployed:** Commit cbcf552  
**Status:** Awaiting deployment completion + cache clear
