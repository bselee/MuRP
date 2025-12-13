-- Migration 094: Purchase and Consumption Tracking for Reorder Calculations
-- Provides comprehensive data for intelligent reorder point calculations

-- Product consumption tracking (usage from production/sales)
CREATE TABLE IF NOT EXISTS product_consumption_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  product_name text,
  quantity_consumed numeric(15,3) NOT NULL,
  consumption_type text NOT NULL CHECK (consumption_type IN ('production', 'sale', 'waste', 'adjustment', 'transfer')),
  consumed_at timestamptz NOT NULL DEFAULT now(),
  source_reference text, -- BOM ID, Sale ID, etc.
  source_type text, -- 'build_order', 'sales_order', 'manual_adjustment'
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_consumption_sku ON product_consumption_log(sku);
CREATE INDEX idx_product_consumption_date ON product_consumption_log(consumed_at DESC);
CREATE INDEX idx_product_consumption_type ON product_consumption_log(consumption_type);

-- Product purchase tracking (incoming inventory from POs)
CREATE TABLE IF NOT EXISTS product_purchase_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  product_name text,
  quantity_purchased numeric(15,3) NOT NULL,
  unit_cost numeric(15,2),
  total_cost numeric(15,2),
  po_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  po_number text,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name text,
  ordered_at timestamptz,
  received_at timestamptz,
  lead_time_days integer GENERATED ALWAYS AS (
    CASE 
      WHEN received_at IS NOT NULL AND ordered_at IS NOT NULL 
      THEN EXTRACT(DAY FROM (received_at - ordered_at))::integer
      ELSE NULL
    END
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_purchase_sku ON product_purchase_log(sku);
CREATE INDEX idx_product_purchase_po ON product_purchase_log(po_id);
CREATE INDEX idx_product_purchase_vendor ON product_purchase_log(vendor_id);
CREATE INDEX idx_product_purchase_received ON product_purchase_log(received_at DESC);
CREATE INDEX idx_product_purchase_ordered ON product_purchase_log(ordered_at DESC);

-- Reorder analytics view - combines purchase and consumption data
CREATE OR REPLACE VIEW product_reorder_analytics AS
WITH purchase_stats AS (
  SELECT 
    sku,
    COUNT(*) as purchase_count,
    AVG(lead_time_days) as avg_lead_time_days,
    MIN(lead_time_days) as min_lead_time_days,
    MAX(lead_time_days) as max_lead_time_days,
    AVG(unit_cost) as avg_unit_cost,
    MAX(received_at) as last_received_at,
    SUM(quantity_purchased) as total_purchased_qty
  FROM product_purchase_log
  WHERE received_at IS NOT NULL
  GROUP BY sku
),
consumption_stats AS (
  SELECT
    sku,
    COUNT(*) as consumption_count,
    SUM(quantity_consumed) as total_consumed_qty,
    AVG(quantity_consumed) as avg_consumption_qty,
    -- Last 30 days consumption rate
    SUM(CASE WHEN consumed_at >= NOW() - INTERVAL '30 days' THEN quantity_consumed ELSE 0 END) as consumed_last_30_days,
    -- Last 90 days consumption rate
    SUM(CASE WHEN consumed_at >= NOW() - INTERVAL '90 days' THEN quantity_consumed ELSE 0 END) as consumed_last_90_days,
    MAX(consumed_at) as last_consumed_at
  FROM product_consumption_log
  GROUP BY sku
),
current_inventory AS (
  SELECT
    sku,
    name as product_name,
    units_in_stock as quantity_on_hand,
    units_available as available_quantity,
    reorder_point,
    qty_to_order as max_stock_level
  FROM inventory_items
)
SELECT
  i.sku,
  i.product_name,
  i.quantity_on_hand,
  i.available_quantity,
  i.reorder_point,
  i.max_stock_level,
  
  -- Purchase metrics
  COALESCE(p.purchase_count, 0) as purchase_count,
  COALESCE(p.avg_lead_time_days, 0) as avg_lead_time_days,
  COALESCE(p.min_lead_time_days, 0) as min_lead_time_days,
  COALESCE(p.max_lead_time_days, 0) as max_lead_time_days,
  COALESCE(p.avg_unit_cost, 0) as avg_unit_cost,
  p.last_received_at,
  COALESCE(p.total_purchased_qty, 0) as total_purchased_qty,
  
  -- Consumption metrics
  COALESCE(c.consumption_count, 0) as consumption_count,
  COALESCE(c.total_consumed_qty, 0) as total_consumed_qty,
  COALESCE(c.avg_consumption_qty, 0) as avg_consumption_qty,
  COALESCE(c.consumed_last_30_days, 0) as consumed_last_30_days,
  COALESCE(c.consumed_last_90_days, 0) as consumed_last_90_days,
  c.last_consumed_at,
  
  -- Calculated reorder metrics
  CASE 
    WHEN c.consumed_last_30_days > 0 
    THEN (c.consumed_last_30_days / 30.0) -- Daily consumption rate
    ELSE 0 
  END as daily_consumption_rate,
  
  CASE
    WHEN c.consumed_last_30_days > 0 AND i.available_quantity > 0
    THEN (i.available_quantity / (c.consumed_last_30_days / 30.0)) -- Days of stock remaining
    ELSE 999
  END as days_of_stock_remaining,
  
  CASE
    WHEN c.consumed_last_30_days > 0 AND p.avg_lead_time_days > 0
    THEN CEIL((c.consumed_last_30_days / 30.0) * (p.avg_lead_time_days + 7)) -- Suggested reorder point (lead time + 1 week buffer)
    ELSE i.reorder_point
  END as suggested_reorder_point,
  
  CASE
    WHEN c.consumed_last_90_days > 0
    THEN CEIL((c.consumed_last_90_days / 90.0) * 90) -- Suggested max stock (90 days supply)
    ELSE i.max_stock_level
  END as suggested_max_stock,
  
  -- Reorder recommendation
  CASE
    WHEN i.available_quantity <= 0 THEN 'OUT_OF_STOCK'
    WHEN i.available_quantity <= (COALESCE(i.reorder_point, 0) * 0.5) THEN 'CRITICAL'
    WHEN i.available_quantity <= COALESCE(i.reorder_point, 0) THEN 'REORDER_NOW'
    WHEN i.available_quantity <= (COALESCE(i.reorder_point, 0) * 1.5) THEN 'REORDER_SOON'
    ELSE 'OK'
  END as reorder_status
  
FROM current_inventory i
LEFT JOIN purchase_stats p ON i.sku = p.sku
LEFT JOIN consumption_stats c ON i.sku = c.sku;

-- Function to log production consumption automatically
CREATE OR REPLACE FUNCTION log_production_consumption()
RETURNS TRIGGER AS $$
BEGIN
  -- When a build order is completed, log component consumption
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- This would be called from application code with BOM data
    -- Placeholder for when we implement automatic consumption logging
    NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to log purchase receipts automatically
CREATE OR REPLACE FUNCTION log_purchase_receipt()
RETURNS TRIGGER AS $$
BEGIN
  -- When a PO is received, log the purchase for analytics
  IF NEW.status = 'received' AND (OLD.status IS NULL OR OLD.status != 'received') THEN
    -- Insert purchase log entries for all items in the PO
    INSERT INTO product_purchase_log (
      sku,
      product_name,
      quantity_purchased,
      unit_cost,
      total_cost,
      po_id,
      po_number,
      vendor_id,
      vendor_name,
      ordered_at,
      received_at
    )
    SELECT
      item->>'sku' as sku,
      item->>'product_name' as product_name,
      (item->>'quantity')::numeric as quantity_purchased,
      (item->>'unit_price')::numeric as unit_cost,
      (item->>'quantity')::numeric * (item->>'unit_price')::numeric as total_cost,
      NEW.id,
      NEW.order_id,
      NEW.vendor_id,
      v.name,
      NEW.order_date,
      NEW.received_date
    FROM jsonb_array_elements(NEW.items) as item
    LEFT JOIN vendors v ON v.id = NEW.vendor_id
    WHERE item->>'sku' IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-log purchases when PO is received
DROP TRIGGER IF EXISTS trigger_log_purchase_receipt ON purchase_orders;
CREATE TRIGGER trigger_log_purchase_receipt
  AFTER UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION log_purchase_receipt();

-- RLS Policies
ALTER TABLE product_consumption_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_purchase_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view consumption logs
CREATE POLICY "Allow authenticated users to view consumption logs"
  ON product_consumption_log
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert consumption logs
CREATE POLICY "Allow authenticated users to insert consumption logs"
  ON product_consumption_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to view purchase logs
CREATE POLICY "Allow authenticated users to view purchase logs"
  ON product_purchase_log
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert purchase logs (auto-populated by trigger)
CREATE POLICY "Allow authenticated users to insert purchase logs"
  ON product_purchase_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Grant view access
GRANT SELECT ON product_reorder_analytics TO authenticated;
