# Check Vendor Data in Supabase

Run this query in Supabase SQL Editor to see what vendor data exists:

```sql
-- Check vendor data
SELECT 
  id,
  name,
  contact_emails,
  phone,
  address_line1,
  address_line2,
  city,
  state,
  postal_code,
  country,
  website,
  lead_time_days,
  notes,
  data_source,
  last_sync_at,
  sync_status,
  created_at
FROM vendors
ORDER BY created_at DESC
LIMIT 10;
```

## Expected columns (from migration 002):
- ✅ address_line1
- ✅ address_line2  
- ✅ city
- ✅ state
- ✅ postal_code
- ✅ country
- ✅ phone
- ✅ website
- ✅ notes
- ✅ data_source
- ✅ last_sync_at
- ✅ sync_status

## If data looks wrong:

1. **Delete existing vendors:**
```sql
DELETE FROM vendors;
```

2. **Run vendor sync from Settings page:**
   - Go to Settings → Finale Integration
   - Click "Run Manual Sync Now"
   - Check console for transformation logs

3. **Verify transformation in console:**
   - Should see: `[FinaleSyncService] Detected raw CSV data; applying schema transformers`
   - Should see: `[FinaleSyncService] Transform results: X success, Y failed`
   - Should see: `[FinaleSyncService] After deduplication: X unique vendors`

## If vendors table is empty:

The sync may not have run yet. Try:
1. Hard refresh browser (Ctrl+Shift+R)
2. Go to Settings page
3. Scroll to "Finale Inventory Integration" 
4. Click "Run Manual Sync Now"
5. Watch console for logs
