# 🚨 DATA RECOVERY PLAN

## Current Status
- **Issue**: All data connection lost across app
- **Symptom**: 0 inventory items, vendors, BOMs fetched from Supabase
- **Root Cause**: Database tables empty or migration not applied

## Immediate Actions Required

### 1. Run Critical Migration (PRIORITY 1)
The `006_add_mcp_tables.sql` migration hasn't been run in Supabase.

**Steps:**
1. Go to: https://supabase.com/dashboard/project/mpuevsmtowyexhsqugkm
2. Click: **SQL Editor** → **New Query**
3. Copy entire contents of: `supabase/migrations/006_add_mcp_tables.sql`
4. Paste and click **Run**
5. Verify: `SELECT * FROM app_settings;` (should show 2 rows)

### 2. Check Existing Data (PRIORITY 1)
Verify if data still exists or was wiped:

```sql
-- Check if tables exist and have data
SELECT COUNT(*) FROM inventory_items;
SELECT COUNT(*) FROM vendors;
SELECT COUNT(*) FROM boms;
SELECT COUNT(*) FROM purchase_orders;
```

### 3. Re-sync from Finale (PRIORITY 2)
If tables are empty, re-sync from Finale:

1. Go to: https://murp.app
2. Navigate: **Settings** → **API & Integrations** → **Finale Integration**
3. If configured:
   - Select all data sources (Vendors, Inventory, BOMs)
   - Click "Sync Selected"
4. If not configured:
   - Enter Finale credentials
   - Test connection
   - Run initial sync

### 4. Check Finale Credentials (PRIORITY 2)
Verify Finale API credentials are still valid:

```javascript
// Check localStorage for Finale credentials
localStorage.getItem('finale_api_key')
localStorage.getItem('finale_api_secret')
localStorage.getItem('finale_account_path')
```

## Possible Causes

### A. Migration Not Applied
- **Evidence**: `app_settings` table not found (404 error)
- **Fix**: Run migration 006 in Supabase SQL Editor
- **Time**: 2 minutes

### B. Data Wiped
- **Evidence**: Tables exist but `COUNT(*) = 0`
- **Fix**: Re-sync from Finale
- **Time**: 5-10 minutes

### C. Finale Credentials Lost
- **Evidence**: localStorage empty or sync fails
- **Fix**: Re-enter credentials in Settings
- **Time**: 2 minutes

### D. Supabase Connection Issue
- **Evidence**: All queries fail
- **Fix**: Check Supabase project status
- **Time**: Check dashboard

## Verification Steps

After fixes:

```sql
-- 1. Verify app_settings table exists
SELECT * FROM app_settings;

-- 2. Verify data exists
SELECT COUNT(*) as inventory_count FROM inventory_items;
SELECT COUNT(*) as vendor_count FROM vendors;
SELECT COUNT(*) as bom_count FROM boms;

-- 3. Sample data check
SELECT name, stock, category FROM inventory_items LIMIT 5;
SELECT name, city, state FROM vendors LIMIT 5;
```

## Recovery Timeline

| Step | Action | Time | Priority |
|------|--------|------|----------|
| 1 | Run migration 006 | 2 min | CRITICAL |
| 2 | Check existing data | 1 min | CRITICAL |
| 3 | Re-sync from Finale | 10 min | HIGH |
| 4 | Verify data | 2 min | HIGH |

**Total Recovery Time**: ~15 minutes

## Prevention

1. **Enable RLS Policies**: Prevent accidental data deletion
2. **Scheduled Backups**: Daily automated backups
3. **Migration Tracking**: Track which migrations are applied
4. **Health Checks**: Monitor data counts daily

## Contact

If recovery fails:
1. Check Supabase dashboard for errors
2. Check browser console for detailed error messages
3. Review Finale API status

---

**Created**: November 14, 2025  
**Status**: ACTIVE RECOVERY NEEDED
