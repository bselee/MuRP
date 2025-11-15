-- Migration: Expand vendor_details view access for frontend clients
-- Date: 2025-11-15
-- Purpose: Ensure both anonymous and authenticated Supabase clients can query vendor_details

DO $$
BEGIN
  IF to_regclass('public.vendor_details') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.vendor_details TO anon';
    EXECUTE 'GRANT SELECT ON public.vendor_details TO authenticated';
  ELSE
    RAISE NOTICE 'vendor_details view not found; skipping grants.';
  END IF;
END $$;
