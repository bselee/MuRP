-- Migration: Ensure public read access for inventory and BOM tables
-- Date: 2025-11-15
-- Purpose: Allow frontend (anon/authenticated) clients to read synced data via Supabase RLS

-- Inventory Items ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS inventory_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'inventory_items'
      AND policyname = 'inventory_public_read'
  ) THEN
    CREATE POLICY inventory_public_read
      ON public.inventory_items
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- BOMs --------------------------------------------------------------------------------------
ALTER TABLE IF EXISTS boms ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'boms'
      AND policyname = 'boms_public_read'
  ) THEN
    CREATE POLICY boms_public_read
      ON public.boms
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;
