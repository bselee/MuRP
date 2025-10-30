-- FIX: Add RLS policies for all application tables
-- Run this in Supabase SQL Editor

-- Enable RLS and create policies for inventory_items
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.inventory_items;
CREATE POLICY "Enable read access for authenticated users"
ON public.inventory_items
FOR SELECT
TO authenticated
USING (true);

-- Enable RLS and create policies for vendors
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.vendors;
CREATE POLICY "Enable read access for authenticated users"
ON public.vendors
FOR SELECT
TO authenticated
USING (true);

-- Enable RLS and create policies for bom_items
ALTER TABLE public.bom_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.bom_items;
CREATE POLICY "Enable read access for authenticated users"
ON public.bom_items
FOR SELECT
TO authenticated
USING (true);

-- Enable RLS and create policies for purchase_orders
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.purchase_orders;
CREATE POLICY "Enable read access for authenticated users"
ON public.purchase_orders
FOR SELECT
TO authenticated
USING (true);

-- Enable RLS and create policies for build_orders
ALTER TABLE public.build_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.build_orders;
CREATE POLICY "Enable read access for authenticated users"
ON public.build_orders
FOR SELECT
TO authenticated
USING (true);

-- Enable RLS and create policies for requisitions
ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.requisitions;
CREATE POLICY "Enable read access for authenticated users"
ON public.requisitions
FOR SELECT
TO authenticated
USING (true);

-- Enable RLS and create policies for artwork_folders
ALTER TABLE public.artwork_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.artwork_folders;
CREATE POLICY "Enable read access for authenticated users"
ON public.artwork_folders
FOR SELECT
TO authenticated
USING (true);

-- Verify all policies were created
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;
