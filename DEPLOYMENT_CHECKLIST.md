# Deployment Checklist: Schema-based Vendor Parsing

This release introduces the schema-based vendor parsing pipeline and enhanced vendor schema.

## Prerequisites
- Supabase access with SQL Editor permissions
- Finale credentials and a valid Finale Vendors CSV report URL
  - Use the full pivot table URL (pivotTable), not pivotTableStream
- Hosting that supports Node/Edge functions (e.g., Vercel)
- Environment variables configured where applicable:
  - VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (frontend)
  - FINALE_API_KEY, FINALE_API_SECRET, FINALE_ACCOUNT_PATH (server, if using direct REST)
  - FINALE_VENDORS_REPORT_URL (server/proxy)

## 1) Apply database migration
- Run the SQL in `supabase/migrations/002_enhance_vendor_schema.sql` in the Supabase SQL Editor.
- Verify new columns on `vendors`: address_line1, address_line2, city, state, postal_code, country, notes, data_source, last_sync_at, sync_status.
- Verify the view `vendor_details` exists and is queryable.

Quick checks:
```sql
-- New columns present
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'vendors'
AND column_name IN (
  'address_line1','address_line2','city','state','postal_code','country',
  'notes','data_source','last_sync_at','sync_status'
);

-- View exists
SELECT * FROM vendor_details LIMIT 1;
```

## 2) Configure environment
- Set FINALE_VENDORS_REPORT_URL to the Finale CSV report URL (pivotTable).
- Ensure Supabase env vars are set in your hosting provider for the frontend.

## 3) Deploy the branch
- Deploy or merge `claude/fix-vendor-column-parsing-011CUo3gN8S6Db63DT1VJnbs`.
- Build should pass (vite build).

## 4) Initial vendor sync
- In the app: Settings → Finale Integration → Test connection → Manual Sync.
- Watch function logs during the sync to confirm parsed counts and upserts.

Expected log highlights:
- Transformation results show non-zero successful rows, low failures.
- Upsert summary indicates updates/inserts, then "Successfully saved N vendors".

## 5) Verify data
- In Supabase Table Editor (vendors): spot-check rows for populated address components, notes, and metadata.
- In SQL:
```sql
-- Address completeness
SELECT COUNT(*) FROM vendors
WHERE COALESCE(address_line1,'') <> '' AND COALESCE(city,'') <> '' AND COALESCE(state,'') <> '';

-- Email presence
SELECT COUNT(*) FROM vendors
WHERE contact_emails IS NOT NULL AND array_length(contact_emails,1) > 0;

-- Source distribution
SELECT data_source, COUNT(*) FROM vendors GROUP BY data_source;
```
- In the app Vendors page, verify columns Vendor, Address, Email, Phone, Website render correctly.

## Rollback
- Migration is additive (no drops). Older code can continue using `vendors.address` and `contact_emails`.

## Troubleshooting
- Build fails: check Vercel logs, ensure dependencies installed and zod is in dependencies, not devDependencies.
- Vendors empty in UI: verify RLS allows reading `vendor_details`, or fallback to `vendors` table; ensure the view exists.
- Sync errors: verify FINALE_VENDORS_REPORT_URL and Finale credentials; inspect function logs for transformation errors.

## Notes
- The UI prefers the `vendor_details` view for computed fields when present and falls back to the `vendors` table.
