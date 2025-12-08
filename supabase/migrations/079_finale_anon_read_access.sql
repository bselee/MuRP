-- Migration 079: Add anon read access to finale tables
-- Purpose: Allow public read access to Finale data for the app UI

-- Drop existing policies if they exist, then create new ones
DO $$
BEGIN
  -- finale_products
  DROP POLICY IF EXISTS "Allow anon read finale_products" ON finale_products;
  CREATE POLICY "Allow anon read finale_products" ON finale_products FOR SELECT TO anon USING (true);
  
  -- finale_inventory
  DROP POLICY IF EXISTS "Allow anon read finale_inventory" ON finale_inventory;
  CREATE POLICY "Allow anon read finale_inventory" ON finale_inventory FOR SELECT TO anon USING (true);
  
  -- finale_vendors
  DROP POLICY IF EXISTS "Allow anon read finale_vendors" ON finale_vendors;
  CREATE POLICY "Allow anon read finale_vendors" ON finale_vendors FOR SELECT TO anon USING (true);
  
  -- finale_purchase_orders
  DROP POLICY IF EXISTS "Allow anon read finale_purchase_orders" ON finale_purchase_orders;
  CREATE POLICY "Allow anon read finale_purchase_orders" ON finale_purchase_orders FOR SELECT TO anon USING (true);
  
  -- finale_po_line_items
  DROP POLICY IF EXISTS "Allow anon read finale_po_line_items" ON finale_po_line_items;
  CREATE POLICY "Allow anon read finale_po_line_items" ON finale_po_line_items FOR SELECT TO anon USING (true);
  
  -- finale_facilities
  DROP POLICY IF EXISTS "Allow anon read finale_facilities" ON finale_facilities;
  CREATE POLICY "Allow anon read finale_facilities" ON finale_facilities FOR SELECT TO anon USING (true);
  
  -- finale_boms
  DROP POLICY IF EXISTS "Allow anon read finale_boms" ON finale_boms;
  CREATE POLICY "Allow anon read finale_boms" ON finale_boms FOR SELECT TO anon USING (true);

  RAISE NOTICE '✅ Anon read access added to finale tables';
END $$;
