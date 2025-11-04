# TGF-MRP Schema System Deployment Checklist

**Branch:** `claude/fix-vendor-column-parsing-011CUo3gN8S6Db63DT1VJnbs`
**Date:** November 4, 2025
**Status:** Ready for Deployment

---

## Overview

This deployment implements an app-wide schema system that fixes vendor parsing issues and provides a clear path for adding new Finale integrations (inventory, BOMs, purchase orders, etc.).

### What's Included

- ✅ Enhanced vendor schema with split address components
- ✅ Type-safe data transformations with Zod validation
- ✅ Zero data loss from CSV parsing
- ✅ Improved Vendors page UI
- ✅ Comprehensive integration guides
- ✅ Test harness for transformers
- ✅ Playwright E2E tests

---

## Pre-Deployment Checklist

### 1. Review Changes

- [ ] Review commits in branch `claude/fix-vendor-column-parsing-011CUo3gN8S6Db63DT1VJnbs`
- [ ] Review database migration `002_enhance_vendor_schema.sql`
- [ ] Review schema system documentation (`SCHEMA_ARCHITECTURE.md`)
- [ ] Review integration guide (`ADDING_FINALE_REPORTS_GUIDE.md`)

### 2. Verify Prerequisites

- [ ] Supabase project is accessible
- [ ] Vercel project is connected
- [ ] Environment variables are configured:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `FINALE_API_KEY`
  - `FINALE_API_SECRET`
  - `FINALE_VENDORS_REPORT_URL`

### 3. Backup Current State

- [ ] Export current `vendors` table data
- [ ] Document current vendor count
- [ ] Backup `.env` files

---

## Deployment Steps

### Step 1: Apply Database Migration

**Location:** `supabase/migrations/002_enhance_vendor_schema.sql`

1. Open Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `002_enhance_vendor_schema.sql`
4. Run the SQL migration
5. Verify success (no errors)

**What This Does:**
- Adds `address_line1`, `address_line2`, `city`, `state`, `postal_code`, `country` columns
- Adds `notes` column for internal vendor information
- Adds `data_source`, `last_sync_at`, `sync_status` for tracking
- Creates `vendor_details` view with computed fields
- Adds trigger to auto-rebuild composite `address` field
- Adds indexes for performance

**Verification:**
```sql
-- Check that new columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'vendors'
AND column_name IN ('address_line1', 'city', 'state', 'postal_code', 'notes', 'data_source');

-- Check that view exists
SELECT * FROM vendor_details LIMIT 1;
```

Expected result: 6+ columns returned, view query succeeds.

---

### Step 2: Deploy Code

**Option A: Deploy from Branch**

```bash
# On Vercel Dashboard
1. Go to your TGF-MRP project
2. Navigate to Deployments
3. Find branch: claude/fix-vendor-column-parsing-011CUo3gN8S6Db63DT1VJnbs
4. Click "Deploy"
5. Wait for build to complete (~2-3 minutes)
```

**Option B: Merge to Main and Deploy**

```bash
# Locally
git checkout main
git pull origin main
git merge claude/fix-vendor-column-parsing-011CUo3gN8S6Db63DT1VJnbs
git push origin main

# Vercel will auto-deploy
```

**Build Verification:**
- [ ] Build succeeds (no errors)
- [ ] No TypeScript errors
- [ ] No linting errors
- [ ] Bundle size is reasonable

---

### Step 3: Verify Deployment

#### 3.1 Check Application Loads

1. Navigate to deployment URL
2. Verify homepage loads
3. Check browser console for errors
4. Verify no runtime errors

#### 3.2 Check Vendors Page

1. Navigate to `/vendors` page
2. Verify page loads without errors
3. Check that vendors are displayed
4. Verify all columns show:
   - ✓ Vendor Name (with website link if available)
   - ✓ Contact Info (emails and phone)
   - ✓ Address (split components or composite)
   - ✓ Lead Time (days format)
   - ✓ Source Badge (CSV/API/Manual)

Expected: Vendors display with proper formatting, no "undefined" or empty critical fields.

#### 3.3 Check Enhanced Fields

For vendors synced from CSV, verify:
- [ ] Split address components display correctly
- [ ] Notes field shows if present
- [ ] Phone numbers display with 📞 emoji
- [ ] Email addresses are clickable `mailto:` links
- [ ] Website links open in new tab
- [ ] Source badge shows "CSV" for synced vendors

---

### Step 4: Run Manual Vendor Sync

1. Navigate to **Settings** page
2. Find "Finale Integration" section
3. Click **"Manual Sync"** button
4. Wait for sync to complete

**Monitor Vercel Logs:**

```bash
# In Vercel Dashboard → Functions
# Look for:

[Finale Proxy] CSV data received: 45000 characters
[Finale Proxy] Parsed 685 raw suppliers from CSV
[Finale Proxy] CSV Headers: ['Name', 'Email address 0', ...]
[Finale Proxy] Transformation results:
  successful: 685
  failed: 0
  warnings: 12
[Finale Proxy] After deduplication: 685 unique vendors
[Finale Proxy] Sample vendor (with all fields):
  id: "..."
  name: "ABC Supply Co."
  emails: ["sales@abc.com"]
  phone: "555-1234"
  address: {
    line1: "123 Main St"
    city: "Portland"
    state: "OR"
    ...
  }
  notes: "..."

[FinaleSyncService] Deduped vendors count: 685
[FinaleSyncService] Preparing 650 updates and 35 inserts
[FinaleSyncService] Sample update data (first vendor): [
  'name', 'contact_emails', 'phone', 'address',
  'address_line1', 'city', 'state', 'postal_code',
  'notes', 'data_source', 'last_sync_at', 'sync_status'
]
[FinaleSyncService] ✓ Updated 650 existing vendors
[FinaleSyncService] ✓ Inserted 35 new vendors
[FinaleSyncService] Successfully saved 685 vendors
```

**Success Criteria:**
- ✓ No errors in logs
- ✓ Transformation success count > 0
- ✓ All vendors saved to database
- ✓ Sample vendor shows all enhanced fields

---

### Step 5: Verify Database Updates

Open Supabase **Table Editor** → `vendors` table

1. **Check Row Count**
   - Should match sync count (e.g., 685 vendors)

2. **Check Sample Vendor**
   - Select a vendor row
   - Verify fields are populated:
     - ✓ `address_line1` has data
     - ✓ `city` has data
     - ✓ `state` has data
     - ✓ `postal_code` has data
     - ✓ `notes` has data (if vendor had notes in CSV)
     - ✓ `data_source` = 'csv'
     - ✓ `last_sync_at` is recent timestamp
     - ✓ `sync_status` = 'synced'

3. **Check View**
   ```sql
   SELECT * FROM vendor_details LIMIT 10;
   ```
   - Should return vendors with computed fields
   - `email_count` should be correct
   - `has_complete_address` should be true for vendors with address data

4. **Check Address Auto-Generation**
   ```sql
   SELECT name, address_line1, city, state, postal_code, address
   FROM vendors
   WHERE address_line1 IS NOT NULL
   LIMIT 5;
   ```
   - `address` field should be auto-generated from components
   - Format: "line1, city, state zip"

---

### Step 6: Quality Checks

#### Data Quality

Run these queries to check data quality:

```sql
-- Vendors with complete address
SELECT COUNT(*)
FROM vendors
WHERE address_line1 != '' AND city != '' AND state != '';

-- Vendors with email
SELECT COUNT(*)
FROM vendors
WHERE contact_emails IS NOT NULL AND array_length(contact_emails, 1) > 0;

-- Vendors with phone
SELECT COUNT(*)
FROM vendors
WHERE phone IS NOT NULL AND phone != '';

-- Vendors with notes
SELECT COUNT(*)
FROM vendors
WHERE notes IS NOT NULL AND notes != '';

-- Vendors by source
SELECT data_source, COUNT(*)
FROM vendors
GROUP BY data_source;
```

**Expected Results:**
- Most vendors should have address data
- Most vendors should have at least one email
- Many vendors should have phone numbers
- Some vendors may have notes
- Most vendors should have `data_source = 'csv'` after sync

#### UI Quality

1. **Load Vendors Page**
   - [ ] No layout issues
   - [ ] Table responsive on mobile
   - [ ] All data displays properly
   - [ ] No "undefined" or "null" text

2. **Click Through Vendors**
   - [ ] Email links work (open mail client)
   - [ ] Website links work (open in new tab)
   - [ ] Phone numbers display correctly
   - [ ] Address formatting looks good

3. **Check Tooltips**
   - [ ] Notes truncate with tooltip on hover
   - [ ] Long addresses handle gracefully

---

### Step 7: Test Transformers (Optional)

If you want to verify the transformer logic works:

```bash
# Install dependencies
npm install

# Run transformer tests
npm run test:transformers

# Or run directly
npx ts-node lib/schema/transformers.test.ts
```

**Expected Output:**
```
🧪 Running Schema Transformer Tests...
============================================================

📝 Test: Basic Vendor Transformation
✅ Basic transformation passed

📝 Test: Multiple Emails and Phones
✅ Multiple emails/phones passed

...

============================================================

📊 Test Results: 9 passed, 0 failed
✅ All tests passed!
```

---

### Step 8: Run E2E Tests (Optional)

If you have Playwright installed:

```bash
# Install Playwright (if not already)
npx playwright install

# Run vendors page tests
npx playwright test e2e/vendors.spec.ts

# Run with UI
npx playwright test e2e/vendors.spec.ts --ui
```

**Expected Results:**
- All tests pass
- Page renders correctly
- Data displays properly
- Accessibility checks pass

---

## Post-Deployment Verification

### Immediate (Within 1 Hour)

- [ ] Vendors page loads for all users
- [ ] No errors in Vercel logs
- [ ] No errors in browser console
- [ ] Manual sync works
- [ ] Data displays correctly

### Short Term (Within 24 Hours)

- [ ] Monitor error tracking (Sentry, etc.)
- [ ] Check user feedback
- [ ] Verify performance metrics
- [ ] Check database size/growth

### Medium Term (Within 1 Week)

- [ ] Verify data quality remains high
- [ ] Check sync reliability
- [ ] Monitor transformation warnings
- [ ] Plan next integrations (inventory, BOMs)

---

## Rollback Plan

If issues arise, you can rollback:

### Code Rollback

```bash
# On Vercel
1. Go to Deployments
2. Find previous working deployment
3. Click "..." → "Promote to Production"
```

### Database Rollback (If Needed)

**⚠️ WARNING**: Only do this if migration causes critical issues.

The migration is **additive only** (no columns dropped), so old code will continue to work even with new columns present. However, if you must rollback:

```sql
-- Remove new columns (loses data!)
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

-- Drop view
DROP VIEW IF EXISTS vendor_details;

-- Drop trigger
DROP TRIGGER IF EXISTS trg_rebuild_vendor_address ON vendors;
DROP FUNCTION IF EXISTS rebuild_vendor_address();
```

**Note:** This will **lose all data** in these columns. Only use as last resort.

---

## Troubleshooting

### Issue: Migration Fails

**Symptoms**: Error when running SQL migration

**Solution**:
1. Check if migration was already applied: `SELECT * FROM vendor_details LIMIT 1;`
2. If view exists, migration may be partially applied
3. Review error message carefully
4. Contact DBA if structural issue

### Issue: Build Fails on Vercel

**Symptoms**: TypeScript errors, build timeout

**Solution**:
1. Check Vercel build logs for specific error
2. Verify all dependencies installed (`npm install`)
3. Check TypeScript config is correct
4. Ensure zod package is in `dependencies` (not `devDependencies`)

### Issue: Vendors Page Shows Empty

**Symptoms**: Vendors page loads but no vendors display

**Solution**:
1. Check browser console for errors
2. Check network tab - is API call succeeding?
3. Verify RLS policies allow reading `vendor_details` view
4. Check that view exists: `SELECT * FROM vendor_details;`
5. Check Supabase logs for permission errors

### Issue: Vendor Fields Show Empty

**Symptoms**: Vendors display but new fields (city, notes, etc.) are empty

**Solution**:
1. Run vendor sync manually from Settings
2. Check Vercel logs for transformation results
3. Verify database has data: `SELECT address_line1, city, notes FROM vendors LIMIT 10;`
4. If DB has data but UI doesn't, check hook transformation in `useSupabaseVendors`

### Issue: Sync Fails

**Symptoms**: Manual sync button shows error

**Solution**:
1. Check Vercel function logs
2. Verify `FINALE_VENDORS_REPORT_URL` is configured
3. Test CSV URL manually (should download CSV file)
4. Check Finale credentials (`FINALE_API_KEY`, `FINALE_API_SECRET`)
5. Review transformation errors in logs

### Issue: Performance Degradation

**Symptoms**: Vendors page loads slowly

**Solution**:
1. Check database indexes are created (from migration)
2. Verify view performance: `EXPLAIN ANALYZE SELECT * FROM vendor_details;`
3. Consider adding more indexes if needed
4. Check Vercel function execution time

---

## Success Metrics

### Technical Metrics

- ✅ Build time: < 3 minutes
- ✅ Page load time: < 2 seconds
- ✅ Transformation success rate: > 95%
- ✅ Database write time: < 10 seconds
- ✅ Zero runtime errors

### Data Quality Metrics

- ✅ Vendors synced: All from CSV (685+ expected)
- ✅ Address completeness: > 80%
- ✅ Email availability: > 90%
- ✅ Phone availability: > 70%
- ✅ Duplicate vendors: 0 (after deduplication)

### User Experience Metrics

- ✅ Vendors page loads without errors
- ✅ All vendor data displays correctly
- ✅ Links work (email, website)
- ✅ Responsive on mobile
- ✅ Accessible (keyboard navigation, screen readers)

---

## Next Steps After Deployment

### Immediate Priorities

1. **Monitor for Issues** (Week 1)
   - Watch error logs daily
   - Check user feedback
   - Verify sync reliability

2. **Optimize** (Week 2)
   - Add more indexes if needed
   - Tune query performance
   - Optimize bundle size

### Future Enhancements

3. **Add Inventory Sync** (Weeks 3-4)
   - Follow `ADDING_FINALE_REPORTS_GUIDE.md`
   - Use existing schema definitions
   - Test thoroughly

4. **Add BOM Sync** (Weeks 5-6)
   - Implement nested component structure
   - Handle cost calculations
   - Validate component relationships

5. **Add Purchase Order Sync** (Weeks 7-8)
   - Bidirectional sync
   - Status updates
   - Integration with requisitions

---

## Support & Documentation

### Key Documents

- **Architecture**: `SCHEMA_ARCHITECTURE.md`
- **Integration Guide**: `ADDING_FINALE_REPORTS_GUIDE.md`
- **Implementation Summary**: `SCHEMA_IMPLEMENTATION_SUMMARY.md`
- **API Reference**: `FINALE_CSV_REPORTS.md`

### Getting Help

1. Review error logs (Vercel, Supabase)
2. Check documentation
3. Review test cases for examples
4. Create GitHub issue if blocked

---

## Sign-Off

- [ ] Database migration applied successfully
- [ ] Code deployed without errors
- [ ] Vendors page verified working
- [ ] Manual sync tested and working
- [ ] Database data verified correct
- [ ] Quality checks passed
- [ ] Documentation reviewed
- [ ] Team notified of deployment

**Deployed By:** _______________
**Date:** _______________
**Deployment URL:** _______________
**Notes:** _______________

---

**End of Deployment Checklist**
