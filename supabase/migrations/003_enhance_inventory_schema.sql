-- Migration 003: Enhance Inventory Schema for Finale Integration
-- Description: Adds comprehensive inventory fields from Finale CSV reports
-- Author: TGF MRP Team
-- Date: 2025-11-04
-- Dependencies: 001_api_audit_log.sql, 002_enhance_vendor_schema.sql

-- ============================================================================
-- PHASE 1: Add Enhanced Inventory Fields
-- ============================================================================

ALTER TABLE inventory_items
  -- Product identification (already have sku, name)
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')),
  
  -- Pricing and cost (from Finale)
  ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD',
  
  -- Stock management (enhance existing)
  ADD COLUMN IF NOT EXISTS units_in_stock INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS units_on_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS units_reserved INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS units_available INTEGER GENERATED ALWAYS AS (units_in_stock - units_reserved) STORED,
  
  -- Reorder intelligence (from Finale reports)
  ADD COLUMN IF NOT EXISTS reorder_variance DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_to_order INTEGER DEFAULT 0,
  
  -- Sales velocity (from Finale)
  ADD COLUMN IF NOT EXISTS sales_velocity_consolidated DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_last_30_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_last_90_days INTEGER DEFAULT 0,
  
  -- Warehouse location
  ADD COLUMN IF NOT EXISTS warehouse_location VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS bin_location VARCHAR(50) DEFAULT '',
  ADD COLUMN IF NOT EXISTS facility_id VARCHAR(100) DEFAULT '',
  
  -- Supplier information (references vendors table)
  -- vendor_id already exists
  ADD COLUMN IF NOT EXISTS supplier_sku VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_purchase_date TIMESTAMPTZ,
  
  -- Product attributes
  ADD COLUMN IF NOT EXISTS weight DECIMAL(10, 3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weight_unit VARCHAR(10) DEFAULT 'lb',
  ADD COLUMN IF NOT EXISTS dimensions VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS upc VARCHAR(50) DEFAULT '',
  ADD COLUMN IF NOT EXISTS lot_tracking BOOLEAN DEFAULT false,
  
  -- Sync metadata
  ADD COLUMN IF NOT EXISTS data_source VARCHAR(20) DEFAULT 'manual' CHECK (data_source IN ('manual', 'csv', 'api')),
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'pending' CHECK (sync_status IN ('synced', 'pending', 'error')),
  ADD COLUMN IF NOT EXISTS sync_errors TEXT DEFAULT '';

-- ============================================================================
-- PHASE 2: Update Existing Columns (map to new schema)
-- ============================================================================

-- Map old 'stock' column to new 'units_in_stock' if needed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'inventory_items' AND column_name = 'stock') THEN
    -- Copy data if units_in_stock is empty
    UPDATE inventory_items 
    SET units_in_stock = stock 
    WHERE units_in_stock = 0 AND stock > 0;
  END IF;
END $$;

-- Map old 'on_order' to new 'units_on_order' if needed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'inventory_items' AND column_name = 'on_order') THEN
    UPDATE inventory_items 
    SET units_on_order = on_order 
    WHERE units_on_order = 0 AND on_order > 0;
  END IF;
END $$;

-- ============================================================================
-- PHASE 3: Create Computed View for Inventory Intelligence
-- ============================================================================

CREATE OR REPLACE VIEW inventory_details AS
SELECT
  ii.*,
  v.name AS vendor_name,
  v.lead_time_days,
  v.city AS vendor_city,
  v.state AS vendor_state,
  -- Computed fields
  CASE 
    WHEN ii.units_available <= ii.reorder_point THEN 'Below Reorder Point'
    WHEN ii.units_available <= ii.reorder_point * 1.5 THEN 'Low Stock'
    WHEN ii.units_available > ii.reorder_point * 3 THEN 'Overstock'
    ELSE 'Normal'
  END AS stock_status,
  -- Days of stock remaining (based on sales velocity)
  CASE 
    WHEN ii.sales_velocity_consolidated > 0 THEN 
      ROUND((ii.units_available / ii.sales_velocity_consolidated)::numeric, 1)
    ELSE NULL
  END AS days_of_stock_remaining,
  -- Recommended order quantity
  CASE
    WHEN ii.units_available < ii.reorder_point THEN
      GREATEST(ii.qty_to_order, ii.moq)
    ELSE 0
  END AS recommended_order_qty,
  -- Total value
  ii.units_in_stock * ii.unit_cost AS total_inventory_value
FROM inventory_items ii
LEFT JOIN vendors v ON ii.vendor_id = v.id;

COMMENT ON VIEW inventory_details IS 'Enhanced inventory view with vendor info and computed intelligence fields';

-- ============================================================================
-- PHASE 4: Create Indexes for Performance
-- ============================================================================

-- Existing indexes (if not already present)
CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON inventory_items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_items_vendor_id ON inventory_items(vendor_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category);

-- New indexes for Finale sync
CREATE INDEX IF NOT EXISTS idx_inventory_items_status ON inventory_items(status);
CREATE INDEX IF NOT EXISTS idx_inventory_items_stock_status ON inventory_items(units_available, reorder_point);
CREATE INDEX IF NOT EXISTS idx_inventory_items_data_source ON inventory_items(data_source);
CREATE INDEX IF NOT EXISTS idx_inventory_items_last_sync ON inventory_items(last_sync_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_items_warehouse ON inventory_items(warehouse_location, bin_location);

-- Composite index for reorder reports
CREATE INDEX IF NOT EXISTS idx_inventory_reorder_candidates 
  ON inventory_items(status, units_available, reorder_point)
  WHERE status = 'active' AND units_available < reorder_point;

-- ============================================================================
-- PHASE 5: Create Helper Function for Stock Calculations
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_reorder_quantity(
  p_sku VARCHAR(100)
) RETURNS TABLE (
  sku VARCHAR(100),
  current_stock INTEGER,
  reorder_point INTEGER,
  moq INTEGER,
  recommended_qty INTEGER,
  days_until_stockout DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ii.sku,
    ii.units_available AS current_stock,
    ii.reorder_point,
    ii.moq,
    GREATEST(
      ii.qty_to_order,
      ii.reorder_point - ii.units_available + ii.moq,
      ii.moq
    ) AS recommended_qty,
    CASE
      WHEN ii.sales_velocity_consolidated > 0 THEN
        ROUND((ii.units_available / ii.sales_velocity_consolidated)::numeric, 1)
      ELSE NULL
    END AS days_until_stockout
  FROM inventory_items ii
  WHERE ii.sku = p_sku;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_reorder_quantity IS 'Calculate recommended reorder quantity and stockout prediction for a SKU';

-- ============================================================================
-- PHASE 6: Create Trigger for Automatic Timestamp Updates
-- ============================================================================

CREATE OR REPLACE FUNCTION update_inventory_item_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_items_updated ON inventory_items;
CREATE TRIGGER trg_inventory_items_updated
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_item_timestamp();

-- ============================================================================
-- PHASE 7: Row Level Security (Optional - enable if needed)
-- ============================================================================

-- Uncomment if you want RLS
-- ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
-- 
-- CREATE POLICY inventory_read_policy ON inventory_items
--   FOR SELECT
--   TO authenticated
--   USING (true);  -- Allow all authenticated users to read
-- 
-- CREATE POLICY inventory_write_policy ON inventory_items
--   FOR ALL
--   TO authenticated
--   USING (
--     auth.jwt() ->> 'role' IN ('admin', 'inventory_manager', 'service_role')
--   );

-- ============================================================================
-- PHASE 8: Verification Queries
-- ============================================================================

-- Check schema
DO $$
BEGIN
  RAISE NOTICE 'Migration 003 completed successfully!';
  RAISE NOTICE 'Total inventory items: %', (SELECT COUNT(*) FROM inventory_items);
  RAISE NOTICE 'Active items: %', (SELECT COUNT(*) FROM inventory_items WHERE status = 'active');
  RAISE NOTICE 'Items below reorder point: %', 
    (SELECT COUNT(*) FROM inventory_items WHERE units_available < reorder_point AND status = 'active');
END $$;

-- Sample query to verify
SELECT
  COUNT(*) AS total_items,
  COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_items,
  COUNT(CASE WHEN data_source = 'csv' THEN 1 END) AS csv_synced,
  COUNT(CASE WHEN units_available < reorder_point THEN 1 END) AS needs_reorder,
  SUM(units_in_stock * unit_cost) AS total_inventory_value
FROM inventory_items;
