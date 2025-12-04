# Purchase Order Sync Debug Guide

**Status:** Debugging why POs aren't showing from Finale GraphQL

---

## 🔍 Step 1: Check Browser Console Logs

After logging in, open DevTools (F12) and check the Console tab for these messages:

### Expected Messages (if working):
```
[App] Auto-sync useEffect triggered {userId: "...", isE2ETestMode: false}
[App] Initializing Finale auto-sync...
[FinaleAutoSync] initializeFinaleAutoSync() called
[FinaleAutoSync] Checking credentials...
[FinaleAutoSync] Credentials found, proceeding with initialization...
[FinaleAutoSync] ✅ Credentials detected. Initializing professional REST API sync...
[FinaleAutoSync] Starting initial sync (Inventory + Vendors + BOMs)...
[FinaleAutoSync] ✅ REST API sync complete: ...
[FinaleAutoSync] Starting Purchase Order sync (GraphQL)...
🚀 Starting FULL purchase order sync
📥 Fetching ALL purchase orders (full sync)...
✅ Fetched X purchase orders from Finale
```

### If You See These Instead:
```
[App] Auto-sync useEffect triggered {userId: "...", isE2ETestMode: false}
[App] Initializing Finale auto-sync...
[FinaleAutoSync] initializeFinaleAutoSync() called
[FinaleAutoSync] Checking credentials...
[FinaleAutoSync] No credentials found in environment. Auto-sync disabled.
```
→ **Problem:** Environment variables not loaded in browser

---

## 🔧 Step 2: Check Environment Variables in Browser

Run this in browser console (F12 → Console):

```javascript
// Check environment variables
console.log('VITE_FINALE_API_KEY:', import.meta.env.VITE_FINALE_API_KEY ? '✅ SET' : '❌ NOT SET');
console.log('VITE_FINALE_API_SECRET:', import.meta.env.VITE_FINALE_API_SECRET ? '✅ SET' : '❌ NOT SET');
console.log('VITE_FINALE_ACCOUNT_PATH:', import.meta.env.VITE_FINALE_ACCOUNT_PATH ? '✅ SET' : '❌ NOT SET');
console.log('VITE_FINALE_BASE_URL:', import.meta.env.VITE_FINALE_BASE_URL ? '✅ SET' : '❌ NOT SET');
```

**Expected:** All should show `✅ SET`

**If any show `❌ NOT SET`:**
- The `.env.local` file isn't being loaded by Vite
- Check if dev server was restarted after adding env vars
- Try hard refresh (Ctrl+F5) or restart dev server

---

## 🧪 Step 3: Test GraphQL Connection

Run this in browser console to test if GraphQL can connect to Finale:

```javascript
// Test GraphQL client
(async () => {
  try {
    console.log('🧪 Testing Finale GraphQL connection...');

    const { getFinaleGraphQLClient } = await import('/src/lib/finale/graphql-client.ts');
    const client = getFinaleGraphQLClient();

    if (!client) {
      console.log('❌ GraphQL client not configured');
      return;
    }

    console.log('✅ GraphQL client configured');

    // Test basic connection
    const testResult = await client.testConnection();
    console.log('Connection test result:', testResult);

    if (testResult.success) {
      console.log('📥 Fetching purchase orders...');
      const pos = await client.fetchAllPurchaseOrders();
      console.log(`✅ Found ${pos.length} purchase orders in Finale`);

      if (pos.length > 0) {
        console.log('Sample PO:', pos[0]);
      } else {
        console.log('ℹ️ No purchase orders in Finale to sync');
      }
    }

  } catch (error) {
    console.error('❌ GraphQL test failed:', error);
  }
})();
```

**Expected Results:**
- `✅ GraphQL client configured`
- `Connection test result: {success: true, message: "...", sampleCount: X}`
- `✅ Found X purchase orders in Finale`

**If it fails:**
- Check network tab for failed API calls
- Look for CORS errors
- Check if Finale API credentials are correct

---

## 📊 Step 4: Check Database State

Run this SQL in Supabase SQL Editor to check current data:

```sql
-- Check PO count
SELECT COUNT(*) as total_pos FROM public.purchase_orders;

-- Check recent POs
SELECT id, order_id, supplier, status, order_date
FROM public.purchase_orders
ORDER BY order_date DESC
LIMIT 5;

-- Check sync logs
SELECT data_type, last_sync_time, success, record_count
FROM public.sync_log
ORDER BY last_sync_time DESC
LIMIT 10;
```

**Expected:**
- If sync worked: `total_pos > 0`
- If sync failed: `total_pos = 0` and sync_log shows errors

---

## 🔄 Step 5: Manual Sync Test

If auto-sync isn't working, try manual sync in browser console:

```javascript
// Manual PO sync test
(async () => {
  try {
    console.log('🔄 Testing manual PO sync...');

    const { triggerPOSync } = await import('/src/services/purchaseOrderSyncService.ts');
    const result = await triggerPOSync('full');

    console.log('Manual sync result:', result);

  } catch (error) {
    console.error('❌ Manual sync failed:', error);
  }
})();
```

---

## 🎯 Most Likely Issues & Fixes

### Issue 1: Environment Variables Not Loaded
**Symptoms:** `[FinaleAutoSync] No credentials found in environment`
**Fix:**
1. Restart dev server: `npm run dev`
2. Hard refresh browser (Ctrl+F5)
3. Check `.env.local` exists and has correct values

### Issue 2: GraphQL Client Not Configured
**Symptoms:** `❌ GraphQL client not configured`
**Fix:** Environment variables issue (see above)

### Issue 3: Finale API Connection Failed
**Symptoms:** GraphQL test shows connection error
**Fix:**
- Check Finale API credentials are correct
- Check network connectivity to Finale
- Check for CORS/firewall issues

### Issue 4: No POs in Finale
**Symptoms:** `✅ Found 0 purchase orders in Finale`
**Fix:** Create some test POs in Finale Inventory UI

### Issue 5: Sync Working But UI Not Showing
**Symptoms:** Database has POs but Purchase Orders page is empty
**Fix:** Check browser console for React errors, try refreshing page

---

## 🚀 Quick Diagnosis

Run this comprehensive test in browser console:

```javascript
// Complete diagnostic
(async () => {
  console.log('🔍 Complete PO Sync Diagnostic\n' + '='.repeat(50));

  // 1. Check env vars
  console.log('1. Environment Variables:');
  console.log('   API Key:', import.meta.env.VITE_FINALE_API_KEY ? '✅' : '❌');
  console.log('   API Secret:', import.meta.env.VITE_FINALE_API_SECRET ? '✅' : '❌');
  console.log('   Account Path:', import.meta.env.VITE_FINALE_ACCOUNT_PATH ? '✅' : '❌');

  // 2. Check GraphQL client
  console.log('\n2. GraphQL Client:');
  try {
    const { getFinaleGraphQLClient } = await import('/src/lib/finale/graphql-client.ts');
    const client = getFinaleGraphQLClient();
    console.log('   Client created:', client ? '✅' : '❌');

    if (client) {
      const test = await client.testConnection();
      console.log('   Connection test:', test.success ? '✅' : '❌');
      if (test.success) {
        console.log('   Sample count:', test.sampleCount);
      } else {
        console.log('   Error:', test.message);
      }
    }
  } catch (error) {
    console.log('   Error:', error.message);
  }

  // 3. Check Supabase data
  console.log('\n3. Database Check:');
  try {
    const { data: pos } = await supabase.from('purchase_orders').select('id').limit(1);
    console.log('   Can query POs:', pos ? '✅' : '❌');
  } catch (error) {
    console.log('   Query error:', error.message);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Diagnostic complete - check results above');
})();
```

---

## 📞 Next Steps

1. **Run the diagnostic above** and share the output
2. **Check browser console** for the detailed logs I added
3. **Tell me what you see** - I'll provide specific fixes

The enhanced logging will show exactly where the process is failing! 🔧