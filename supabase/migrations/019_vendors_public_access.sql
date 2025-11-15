-- Migration: Ensure public read access for vendors table
-- Date: 2025-11-15
-- Purpose: Allow frontend anonymous/authenticated clients to read synced vendor data via Supabase RLS

ALTER TABLE IF EXISTS vendors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vendors'
      AND policyname = 'vendors_public_read'
  ) THEN
    CREATE POLICY vendors_public_read
      ON public.vendors
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;
