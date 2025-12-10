-- Migration 083: Finale Orders and Sales Velocity Calculation
-- Creates finale_orders table to track shipments/fulfillments
-- Adds functions to calculate sales velocity metrics from order history

-- =====================================================
-- FINALE ORDERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS finale_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finale_order_url VARCHAR(500) UNIQUE NOT NULL,
  
  -- Order identification
  order_id VARCHAR(100) NOT NULL,
  order_type VARCHAR(50), -- 'SALES_ORDER', 'SHIPMENT', etc.
  order_status VARCHAR(50), -- 'COMPLETED', 'SHIPPED', 'PENDING', etc.
  
  -- Dates
  order_date TIMESTAMPTZ,
  ship_date TIMESTAMPTZ,
  delivered_date TIMESTAMPTZ,
  
  -- Customer/destination
  customer_id VARCHAR(100),
  customer_name VARCHAR(200),
  ship_to_location VARCHAR(500),
  
  -- Financial
  total_amount NUMERIC(12,2),
  currency VARCHAR(3) DEFAULT 'USD',
  
  -- Items (JSONB array of products and quantities)
  order_items JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"productId": "BC101", "quantity": 50, "unitPrice": 12.50}]
  
  -- Metadata
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_finale_orders_order_id ON finale_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_finale_orders_order_date ON finale_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_finale_orders_ship_date ON finale_orders(ship_date DESC);
CREATE INDEX IF NOT EXISTS idx_finale_orders_status ON finale_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_finale_orders_type ON finale_orders(order_type);
CREATE INDEX IF NOT EXISTS idx_finale_orders_items ON finale_orders USING gin(order_items);
CREATE INDEX IF NOT EXISTS idx_finale_orders_synced ON finale_orders(synced_at DESC);

COMMENT ON TABLE finale_orders IS 'Sales orders and shipments from Finale Inventory for velocity calculations';
COMMENT ON COLUMN finale_orders.order_items IS 'Array of {productId, quantity, unitPrice} objects';

-- RLS policies for data access
ALTER TABLE finale_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read finale_orders" ON finale_orders
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow authenticated read finale_orders" ON finale_orders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow service role full access finale_orders" ON finale_orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- SALES VELOCITY CALCULATION FUNCTIONS
-- =====================================================

-- Function: Calculate sales for a specific product over N days
CREATE OR REPLACE FUNCTION calculate_product_sales_period(
  p_product_id TEXT,
  p_days INTEGER
) RETURNS NUMERIC AS $$
DECLARE
  v_total_quantity NUMERIC := 0;
  v_cutoff_date TIMESTAMPTZ;
BEGIN
  v_cutoff_date := now() - (p_days || ' days')::interval;
  
  -- Sum quantities from order_items where productId matches
  SELECT COALESCE(SUM((item->>'quantity')::numeric), 0)
  INTO v_total_quantity
  FROM finale_orders,
       jsonb_array_elements(order_items) AS item
  WHERE order_status IN ('COMPLETED', 'SHIPPED', 'DELIVERED')
    AND (ship_date >= v_cutoff_date OR order_date >= v_cutoff_date)
    AND item->>'productId' = p_product_id;
  
  RETURN v_total_quantity;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_product_sales_period IS 'Calculate total units sold for a product over specified number of days';

-- Function: Update velocity metrics for a single inventory item
CREATE OR REPLACE FUNCTION update_inventory_velocity(p_sku TEXT)
RETURNS VOID AS $$
DECLARE
  v_sales_30 NUMERIC;
  v_sales_60 NUMERIC;
  v_sales_90 NUMERIC;
  v_velocity NUMERIC;
BEGIN
  -- Calculate sales for each period
  v_sales_30 := calculate_product_sales_period(p_sku, 30);
  v_sales_60 := calculate_product_sales_period(p_sku, 60);
  v_sales_90 := calculate_product_sales_period(p_sku, 90);
  
  -- Calculate consolidated velocity (units per day, weighted toward recent data)
  -- Formula: (30d * 0.5 + 60d * 0.3 + 90d * 0.2) / days
  v_velocity := CASE
    WHEN v_sales_30 > 0 OR v_sales_60 > 0 OR v_sales_90 > 0 THEN
      ((v_sales_30 * 0.5) + (v_sales_60 * 0.3) + (v_sales_90 * 0.2)) / 30
    ELSE 0
  END;
  
  -- Update inventory_items table
  UPDATE inventory_items
  SET 
    sales_last_30_days = v_sales_30::integer,
    sales_last_60_days = v_sales_60::integer,
    sales_last_90_days = v_sales_90::integer,
    sales_velocity_consolidated = ROUND(v_velocity::numeric, 2),
    updated_at = now()
  WHERE sku = p_sku;
  
  RAISE NOTICE 'Updated velocity for SKU %: 30d=%, 60d=%, 90d=%, velocity=%', 
    p_sku, v_sales_30, v_sales_60, v_sales_90, ROUND(v_velocity, 2);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_inventory_velocity IS 'Update sales velocity metrics for a single SKU from order history';

-- Function: Batch update all inventory velocities
CREATE OR REPLACE FUNCTION update_all_inventory_velocities()
RETURNS TABLE(
  sku TEXT,
  sales_30d INTEGER,
  sales_60d INTEGER,
  sales_90d INTEGER,
  velocity NUMERIC
) AS $$
DECLARE
  v_sku_record RECORD;
  v_updated_count INTEGER := 0;
BEGIN
  -- Loop through all active inventory items
  FOR v_sku_record IN 
    SELECT i.sku 
    FROM inventory_items i 
    WHERE i.status = 'active'
    ORDER BY i.sku
  LOOP
    -- Update velocity for this SKU
    PERFORM update_inventory_velocity(v_sku_record.sku);
    v_updated_count := v_updated_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Updated velocity for % inventory items', v_updated_count;
  
  -- Return updated values for verification
  RETURN QUERY
  SELECT 
    i.sku,
    i.sales_last_30_days,
    i.sales_last_60_days,
    i.sales_last_90_days,
    i.sales_velocity_consolidated
  FROM inventory_items i
  WHERE i.status = 'active'
    AND (i.sales_last_30_days > 0 OR i.sales_last_60_days > 0 OR i.sales_last_90_days > 0)
  ORDER BY i.sales_velocity_consolidated DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_all_inventory_velocities IS 'Batch update sales velocity for all active inventory items';

-- =====================================================
-- HELPER VIEW: Sales Summary by Product
-- =====================================================
CREATE OR REPLACE VIEW v_product_sales_summary AS
SELECT 
  item->>'productId' AS product_id,
  COUNT(DISTINCT o.id) AS order_count,
  SUM((item->>'quantity')::numeric) AS total_quantity_sold,
  MIN(o.order_date) AS first_sale_date,
  MAX(o.order_date) AS last_sale_date,
  SUM(CASE WHEN o.order_date >= now() - interval '30 days' THEN (item->>'quantity')::numeric ELSE 0 END) AS qty_last_30d,
  SUM(CASE WHEN o.order_date >= now() - interval '60 days' THEN (item->>'quantity')::numeric ELSE 0 END) AS qty_last_60d,
  SUM(CASE WHEN o.order_date >= now() - interval '90 days' THEN (item->>'quantity')::numeric ELSE 0 END) AS qty_last_90d,
  ROUND(
    SUM(CASE WHEN o.order_date >= now() - interval '30 days' THEN (item->>'quantity')::numeric ELSE 0 END) / 30.0,
    2
  ) AS velocity_30d
FROM finale_orders o,
     jsonb_array_elements(o.order_items) AS item
WHERE o.order_status IN ('COMPLETED', 'SHIPPED', 'DELIVERED')
  AND o.order_date IS NOT NULL
GROUP BY item->>'productId'
ORDER BY total_quantity_sold DESC;

COMMENT ON VIEW v_product_sales_summary IS 'Sales summary by product with rolling window calculations';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
DO $$ 
BEGIN 
  RAISE NOTICE '✅ Migration 083 complete: finale_orders table and velocity functions created';
  RAISE NOTICE '📊 Use update_all_inventory_velocities() to calculate velocities from order data';
  RAISE NOTICE '📈 View v_product_sales_summary for sales analytics';
END $$;
