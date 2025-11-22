-- Verify and fix build_order_material_requirements table and relationship

-- Check if table exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'build_order_material_requirements'
    ) THEN 'Table EXISTS ✓'
    ELSE 'Table MISSING ✗'
  END as table_status;

-- Check foreign key constraint
SELECT
  CASE 
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'build_order_material_requirements'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'build_orders'
    ) THEN 'Foreign key to build_orders EXISTS ✓'
    ELSE 'Foreign key to build_orders MISSING ✗'
  END as fk_status;

-- Check RLS policies
SELECT
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'build_order_material_requirements'
    ) THEN 'RLS policies EXIST ✓'
    ELSE 'RLS policies MISSING ✗'
  END as rls_status;

-- Count records
SELECT
  (SELECT COUNT(*) FROM build_orders) as build_orders_count,
  (SELECT COUNT(*) FROM build_order_material_requirements) as material_requirements_count;

-- If table is missing or broken, create it
CREATE TABLE IF NOT EXISTS build_order_material_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_order_id UUID NOT NULL REFERENCES build_orders(id) ON DELETE CASCADE,
  
  -- Material info
  sku VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  required_quantity INTEGER NOT NULL,
  available_quantity INTEGER DEFAULT 0,
  shortfall INTEGER GENERATED ALWAYS AS (GREATEST(required_quantity - available_quantity, 0)) STORED,
  
  -- Vendor sourcing info
  vendor_id UUID REFERENCES vendors(id),
  vendor_name VARCHAR(255),
  lead_time_days INTEGER,
  estimated_cost DECIMAL(10,2),
  
  -- Tracking
  sourced BOOLEAN DEFAULT FALSE,
  sourced_at TIMESTAMPTZ,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_material_requirements_build_order ON build_order_material_requirements(build_order_id);
CREATE INDEX IF NOT EXISTS idx_material_requirements_sku ON build_order_material_requirements(sku);
CREATE INDEX IF NOT EXISTS idx_material_requirements_vendor ON build_order_material_requirements(vendor_id);
CREATE INDEX IF NOT EXISTS idx_material_requirements_shortfall ON build_order_material_requirements(shortfall) WHERE shortfall > 0;

-- Enable RLS
ALTER TABLE build_order_material_requirements ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for all users" ON build_order_material_requirements;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON build_order_material_requirements;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON build_order_material_requirements;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON build_order_material_requirements;

-- Create RLS policies
CREATE POLICY "Enable read access for all users"
  ON build_order_material_requirements
  FOR SELECT
  USING (true);

CREATE POLICY "Enable insert for authenticated users"
  ON build_order_material_requirements
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users"
  ON build_order_material_requirements
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users"
  ON build_order_material_requirements
  FOR DELETE
  USING (true);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_material_requirements_timestamp ON build_order_material_requirements;
CREATE TRIGGER trigger_update_material_requirements_timestamp
  BEFORE UPDATE ON build_order_material_requirements
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

-- Final verification
SELECT 
  'Setup complete!' as message,
  (SELECT COUNT(*) FROM pg_tables WHERE tablename = 'build_order_material_requirements') as table_exists,
  (SELECT COUNT(*) FROM pg_constraint WHERE conrelid = 'build_order_material_requirements'::regclass) as constraint_count,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'build_order_material_requirements') as policy_count;
