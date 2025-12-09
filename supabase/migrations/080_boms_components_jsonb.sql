-- =============================================
-- MIGRATION 080: Add JSONB components column to boms table
-- =============================================
-- The app expects components as JSONB in boms table for BOM display
-- This allows storing component details directly with the BOM

-- Add components JSONB column
ALTER TABLE boms ADD COLUMN IF NOT EXISTS components JSONB DEFAULT '[]';

-- Add description column (expected by sync)
ALTER TABLE boms ADD COLUMN IF NOT EXISTS description TEXT;

-- Add category column (expected by sync)
ALTER TABLE boms ADD COLUMN IF NOT EXISTS category TEXT;

-- Add yield_quantity column (expected by sync)  
ALTER TABLE boms ADD COLUMN IF NOT EXISTS yield_quantity INTEGER DEFAULT 1;

-- Add artwork JSONB column (expected by app)
ALTER TABLE boms ADD COLUMN IF NOT EXISTS artwork JSONB DEFAULT '[]';

-- Add packaging JSONB column (expected by app)
ALTER TABLE boms ADD COLUMN IF NOT EXISTS packaging JSONB DEFAULT '{}';

-- Add data sync tracking columns
ALTER TABLE boms ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'manual';
ALTER TABLE boms ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;
ALTER TABLE boms ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending';

-- Add unique constraint on finished_sku for upserts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boms_finished_sku_key'
  ) THEN
    ALTER TABLE boms ADD CONSTRAINT boms_finished_sku_key UNIQUE (finished_sku);
  END IF;
EXCEPTION WHEN duplicate_table THEN
  -- Constraint already exists
  NULL;
END $$;

-- Create index for faster BOM lookups by SKU
CREATE INDEX IF NOT EXISTS idx_boms_finished_sku ON boms(finished_sku);

-- Add comment
COMMENT ON COLUMN boms.components IS 'JSONB array of BOM components with sku, quantity, name, unit';
