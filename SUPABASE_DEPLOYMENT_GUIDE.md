# Supabase Schema Deployment Guide

**Status:** ✅ Ready to Deploy  
**Migration:** `002_enhance_vendor_schema.sql`  
**Date:** November 4, 2025

---

## 🎯 Quick Start

### Step 1: Open Supabase SQL Editor

1. Navigate to https://supabase.com/dashboard/project/mpuevsmtowyexhsqugkm
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Apply Migration

Copy and paste the entire contents of `supabase/migrations/002_enhance_vendor_schema.sql` into the SQL editor.

```bash
# From your terminal, copy the migration file:
cat supabase/migrations/002_enhance_vendor_schema.sql
```

Then paste into Supabase SQL Editor and click **Run**.

### Step 3: Verify Migration

After running the migration, verify the new columns exist:

```sql
-- Check vendors table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'vendors'
ORDER BY ordinal_position;
```

**Expected new columns:**
- `address_line1` (text)
- `address_line2` (text)
- `city` (text)
- `state` (text)
- `postal_code` (text)
- `country` (text)
- `notes` (text)
- `data_source` (varchar)
- `last_sync_at` (timestamptz)
- `sync_status` (varchar)

### Step 4: Test Vendor Sync

1. Open https://tgf-mrp.vercel.app
2. Navigate to **Settings** → **Finale Integration**
3. Click **"Sync Data"** button
4. Watch for success toast: "✅ Synced X vendors"

### Step 5: Verify Data in Supabase

```sql
-- Check vendor data
SELECT 
  name,
  address_line1,
  city,
  state,
  postal_code,
  phone,
  website,
  data_source,
  sync_status
FROM vendors
ORDER BY updated_at DESC
LIMIT 10;
```

---

## 📋 What This Migration Does

### 1. **Adds Structured Address Fields**
- Replaces single `address` field with structured components
- Enables better filtering, sorting, and data quality
- Auto-generates composite `address` from components via trigger

### 2. **Adds Contact Fields**
- `phone` - Vendor phone number
- `website` - Vendor website URL

### 3. **Adds Metadata Fields**
- `notes` - Internal notes about vendor
- `data_source` - Tracks where data came from (manual/csv/api)
- `last_sync_at` - Timestamp of last successful sync
- `sync_status` - Current sync status (synced/pending/error)

### 4. **Creates Indexes for Performance**
- `idx_vendors_name` - Fast name searches
- `idx_vendors_emails` - Fast email lookups
- `idx_vendors_city` - City filtering
- `idx_vendors_state` - State filtering
- `idx_vendors_sync_status` - Monitoring failed syncs

### 5. **Creates Auto-Update Trigger**
- `rebuild_vendor_address()` function
- Automatically rebuilds composite `address` when components change
- Ensures UI always shows current address

### 6. **Creates Enhanced View**
- `vendor_details` view with computed fields
- `email_count` - Number of contact emails
- `has_complete_address` - Boolean for data quality checks

---

## ✅ Benefits

### **Zero Data Loss**
- All CSV fields now captured (previously: notes, website, split address thrown away)
- Schema transformers validate and preserve all data

### **Better Data Quality**
- Structured address enables validation
- Clear source tracking (manual vs. imported)
- Sync status monitoring

### **Improved UI/UX**
- Can filter vendors by city/state
- Better search functionality
- Clear data provenance

### **Future-Proof**
- Ready for multi-source imports (CSV, API, manual)
- Supports incremental sync workflows
- Audit trail for compliance

---

## 🔍 Verification Queries

### Check Migration Applied Successfully

```sql
-- Should return 10+ new columns
SELECT COUNT(*) as new_columns
FROM information_schema.columns
WHERE table_name = 'vendors'
AND column_name IN (
  'address_line1', 'address_line2', 'city', 'state', 
  'postal_code', 'country', 'notes', 'data_source', 
  'last_sync_at', 'sync_status'
);
```

Expected: `10`

### Check Trigger Exists

```sql
-- Should return 1 row
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'trg_rebuild_vendor_address';
```

Expected: `trg_rebuild_vendor_address` | `BEFORE INSERT OR UPDATE` | `vendors`

### Check View Exists

```sql
-- Should return vendor data with computed fields
SELECT * FROM vendor_details LIMIT 5;
```

Expected: Columns include `email_count` and `has_complete_address`

### Check Sample Vendor Data

```sql
-- View sample vendor with enhanced fields
SELECT 
  name,
  CONCAT_WS(', ', address_line1, city, state, postal_code) as structured_address,
  phone,
  website,
  data_source,
  sync_status,
  last_sync_at
FROM vendors
WHERE name ILIKE '%build%'
LIMIT 1;
```

---

## 🔄 Data Flow After Migration

### Before Migration:
```
CSV → parse → partial data → vendors table (data loss)
        ↓
   (notes, website, split address thrown away)
```

### After Migration:
```
CSV → transformVendorRawToParsed() → VendorParsed (validated)
        ↓
   transformVendorParsedToDatabaseEnhanced() → Database insert
        ↓
   vendors table (ALL fields preserved, zero data loss)
        ↓
   vendor_details view (computed fields for UI)
```

---

## 🧪 Testing Checklist

After applying migration:

- [ ] Migration runs without errors
- [ ] All 10 new columns exist in `vendors` table
- [ ] Trigger `trg_rebuild_vendor_address` exists
- [ ] View `vendor_details` queryable
- [ ] Can run vendor sync from UI
- [ ] Synced vendors show in Supabase table editor
- [ ] `address_line1`, `city`, `state` populated
- [ ] `data_source` = 'csv' for synced vendors
- [ ] `sync_status` = 'synced' for successful imports
- [ ] No TypeScript build errors (`npm run build`)
- [ ] All tests pass (`npm test` + `npm run e2e`)

---

## 📊 Expected Results

### Sample Vendor After Sync:

| Field | Value |
|-------|-------|
| name | "Build-A-Soil" |
| address_line1 | "123 Organic Way" |
| city | "Denver" |
| state | "CO" |
| postal_code | "80202" |
| country | "USA" |
| phone | "(555) 123-4567" |
| website | "https://buildasoil.com" |
| contact_emails | ["info@buildasoil.com"] |
| data_source | "csv" |
| sync_status | "synced" |
| last_sync_at | "2025-11-04 15:30:00+00" |

---

## 🚨 Troubleshooting

### Issue: "column already exists"

**Solution:** Migration uses `IF NOT EXISTS`, so it's safe to run multiple times. This warning is harmless.

### Issue: "relation vendors does not exist"

**Solution:** Run the initial schema first:
```sql
CREATE TABLE vendors (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL UNIQUE,
  contact_emails TEXT[] DEFAULT '{}',
  address TEXT DEFAULT '',
  lead_time_days INTEGER DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Issue: Vendor sync fails with "column does not exist"

**Solution:** 
1. Verify migration applied: `\d vendors` (if using psql)
2. Check TypeScript types match database: `types/database.ts`
3. Rebuild app: `npm run build`
4. Redeploy: `git push` (Vercel auto-deploys)

### Issue: Composite address not updating

**Solution:** Check trigger exists:
```sql
SELECT * FROM pg_trigger WHERE tgname = 'trg_rebuild_vendor_address';
```

If missing, re-run trigger creation from migration.

---

## 🔐 Security & RLS

The migration preserves existing Row Level Security (RLS) policies. No changes needed.

Existing policies:
- `vendors` table: Public read access
- `vendor_details` view: Authenticated users only

---

## 📝 Rollback (If Needed)

The migration is **additive only** (no drops), so rollback is optional. If needed:

```sql
-- Drop new columns (destructive - will lose data!)
ALTER TABLE vendors
DROP COLUMN IF EXISTS address_line1,
DROP COLUMN IF EXISTS address_line2,
DROP COLUMN IF EXISTS city,
DROP COLUMN IF EXISTS state,
DROP COLUMN IF EXISTS postal_code,
DROP COLUMN IF EXISTS country,
DROP COLUMN IF EXISTS notes,
DROP COLUMN IF EXISTS data_source,
DROP COLUMN IF EXISTS last_sync_at,
DROP COLUMN IF EXISTS sync_status;

-- Drop trigger
DROP TRIGGER IF EXISTS trg_rebuild_vendor_address ON vendors;
DROP FUNCTION IF EXISTS rebuild_vendor_address();

-- Drop view
DROP VIEW IF EXISTS vendor_details;
```

**Note:** Rollback is NOT recommended. Older code is compatible with new schema (uses `IF NOT EXISTS`).

---

## ✅ Success Criteria

Migration is successful when:

1. ✅ SQL runs without errors
2. ✅ All new columns exist
3. ✅ Trigger and view created
4. ✅ Vendor sync works from UI
5. ✅ Data appears in Supabase table editor
6. ✅ No TypeScript build errors
7. ✅ All tests pass (unit + e2e)

---

## 📞 Support

**Migration File:** `supabase/migrations/002_enhance_vendor_schema.sql`  
**TypeScript Types:** `types/database.ts`  
**Schema Architecture:** See `SCHEMA_ARCHITECTURE.md`  
**Implementation:** See `SCHEMA_IMPLEMENTATION_SUMMARY.md`

**Supabase Project:**
- URL: https://mpuevsmtowyexhsqugkm.supabase.co
- Dashboard: https://supabase.com/dashboard/project/mpuevsmtowyexhsqugkm

---

**Ready to deploy? Follow the Quick Start steps above.** 🚀
