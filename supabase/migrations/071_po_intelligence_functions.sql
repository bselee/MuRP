-- Purchase Order Intelligence Functions
-- Provides calculated metrics for inventory intelligence based on PO data

-- =============================================================================
-- Function: Calculate On-Order Quantities
-- Returns the total quantity on order for each product (from pending/submitted POs)
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_on_order_quantities()
RETURNS TABLE (
  product_id TEXT,
  on_order_qty NUMERIC,
  po_count INTEGER,
  earliest_expected_date TIMESTAMP,
  latest_expected_date TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    poi.product_id,
    SUM(poi.quantity - COALESCE(poi.received_quantity, 0)) as on_order_qty,
    COUNT(DISTINCT po.id)::INTEGER as po_count,
    MIN(po.expected_date) as earliest_expected_date,
    MAX(po.expected_date) as latest_expected_date
  FROM purchase_order_items poi
  JOIN purchase_orders po ON poi.po_id = po.id
  WHERE po.status IN ('pending', 'submitted', 'partially_received')
    AND poi.quantity > COALESCE(poi.received_quantity, 0)
  GROUP BY poi.product_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_on_order_quantities() IS 
'Calculates on-order quantities per product from pending purchase orders';

-- =============================================================================
-- Function: Calculate Vendor Lead Times
-- Returns average and variance of lead times for each vendor
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_vendor_lead_times()
RETURNS TABLE (
  vendor_id TEXT,
  vendor_name TEXT,
  avg_lead_days NUMERIC,
  min_lead_days INTEGER,
  max_lead_days INTEGER,
  stddev_lead_days NUMERIC,
  completed_po_count INTEGER,
  on_time_delivery_pct NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    po.vendor_id,
    po.vendor_name,
    AVG(EXTRACT(DAY FROM (po.received_date - po.order_date)))::NUMERIC(10,2) as avg_lead_days,
    MIN(EXTRACT(DAY FROM (po.received_date - po.order_date)))::INTEGER as min_lead_days,
    MAX(EXTRACT(DAY FROM (po.received_date - po.order_date)))::INTEGER as max_lead_days,
    STDDEV(EXTRACT(DAY FROM (po.received_date - po.order_date)))::NUMERIC(10,2) as stddev_lead_days,
    COUNT(*)::INTEGER as completed_po_count,
    (COUNT(*) FILTER (WHERE po.received_date <= po.expected_date)::NUMERIC / 
     NULLIF(COUNT(*), 0) * 100)::NUMERIC(5,2) as on_time_delivery_pct
  FROM purchase_orders po
  WHERE po.status = 'received'
    AND po.received_date IS NOT NULL
    AND po.order_date IS NOT NULL
  GROUP BY po.vendor_id, po.vendor_name
  HAVING COUNT(*) >= 3; -- Only vendors with 3+ completed orders
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_vendor_lead_times() IS 
'Calculates vendor performance metrics including lead times and on-time delivery';

-- =============================================================================
-- Function: Get Product Purchase History
-- Returns purchasing pattern data for a specific product
-- =============================================================================

CREATE OR REPLACE FUNCTION get_product_purchase_history(
  p_product_id TEXT,
  p_months_back INTEGER DEFAULT 12
)
RETURNS TABLE (
  order_date DATE,
  vendor_id TEXT,
  vendor_name TEXT,
  quantity NUMERIC,
  unit_cost NUMERIC,
  total_cost NUMERIC,
  lead_days INTEGER,
  po_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    po.order_date::DATE,
    po.vendor_id,
    po.vendor_name,
    poi.quantity,
    poi.unit_cost,
    poi.total,
    EXTRACT(DAY FROM (po.received_date - po.order_date))::INTEGER as lead_days,
    po.status
  FROM purchase_order_items poi
  JOIN purchase_orders po ON poi.po_id = po.id
  WHERE poi.product_id = p_product_id
    AND po.order_date >= CURRENT_DATE - (p_months_back || ' months')::INTERVAL
  ORDER BY po.order_date DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_product_purchase_history(TEXT, INTEGER) IS 
'Returns purchase history for a product including pricing and lead time trends';

-- =============================================================================
-- Function: Calculate Cost Trends
-- Returns cost trend analysis for products
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_cost_trends(
  p_months_back INTEGER DEFAULT 6
)
RETURNS TABLE (
  product_id TEXT,
  avg_cost NUMERIC,
  min_cost NUMERIC,
  max_cost NUMERIC,
  cost_variance_pct NUMERIC,
  last_cost NUMERIC,
  cost_trend TEXT, -- 'increasing', 'decreasing', 'stable'
  purchase_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH recent_purchases AS (
    SELECT 
      poi.product_id,
      poi.unit_cost,
      po.order_date,
      ROW_NUMBER() OVER (PARTITION BY poi.product_id ORDER BY po.order_date DESC) as rn
    FROM purchase_order_items poi
    JOIN purchase_orders po ON poi.po_id = po.id
    WHERE po.order_date >= CURRENT_DATE - (p_months_back || ' months')::INTERVAL
      AND po.status != 'cancelled'
  ),
  stats AS (
    SELECT 
      product_id,
      AVG(unit_cost)::NUMERIC(10,2) as avg_cost,
      MIN(unit_cost)::NUMERIC(10,2) as min_cost,
      MAX(unit_cost)::NUMERIC(10,2) as max_cost,
      ((MAX(unit_cost) - MIN(unit_cost)) / NULLIF(AVG(unit_cost), 0) * 100)::NUMERIC(5,2) as cost_variance_pct,
      COUNT(*)::INTEGER as purchase_count
    FROM recent_purchases
    GROUP BY product_id
  ),
  latest AS (
    SELECT 
      product_id,
      unit_cost as last_cost
    FROM recent_purchases
    WHERE rn = 1
  ),
  trends AS (
    SELECT 
      rp.product_id,
      CASE 
        WHEN AVG(CASE WHEN rn <= 3 THEN unit_cost END) > AVG(CASE WHEN rn > 3 THEN unit_cost END) * 1.05 
          THEN 'increasing'
        WHEN AVG(CASE WHEN rn <= 3 THEN unit_cost END) < AVG(CASE WHEN rn > 3 THEN unit_cost END) * 0.95 
          THEN 'decreasing'
        ELSE 'stable'
      END as trend
    FROM recent_purchases rp
    GROUP BY rp.product_id
    HAVING COUNT(*) >= 6
  )
  SELECT 
    s.product_id,
    s.avg_cost,
    s.min_cost,
    s.max_cost,
    s.cost_variance_pct,
    l.last_cost,
    COALESCE(t.trend, 'insufficient_data') as cost_trend,
    s.purchase_count
  FROM stats s
  LEFT JOIN latest l ON s.product_id = l.product_id
  LEFT JOIN trends t ON s.product_id = t.product_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_cost_trends(INTEGER) IS 
'Analyzes cost trends for products including variance and trend direction';

-- =============================================================================
-- Function: Get Vendor Spending Summary
-- Returns spending breakdown by vendor
-- =============================================================================

CREATE OR REPLACE FUNCTION get_vendor_spending_summary(
  p_months_back INTEGER DEFAULT 12
)
RETURNS TABLE (
  vendor_id TEXT,
  vendor_name TEXT,
  total_spent NUMERIC,
  po_count INTEGER,
  avg_po_value NUMERIC,
  last_order_date DATE,
  unique_products_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    po.vendor_id,
    po.vendor_name,
    SUM(po.total)::NUMERIC(12,2) as total_spent,
    COUNT(DISTINCT po.id)::INTEGER as po_count,
    AVG(po.total)::NUMERIC(10,2) as avg_po_value,
    MAX(po.order_date::DATE) as last_order_date,
    COUNT(DISTINCT poi.product_id)::INTEGER as unique_products_count
  FROM purchase_orders po
  LEFT JOIN purchase_order_items poi ON po.id = poi.po_id
  WHERE po.order_date >= CURRENT_DATE - (p_months_back || ' months')::INTERVAL
    AND po.status != 'cancelled'
  GROUP BY po.vendor_id, po.vendor_name
  ORDER BY total_spent DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_vendor_spending_summary(INTEGER) IS 
'Provides vendor spending analysis including total spend and order patterns';

-- =============================================================================
-- Grant permissions to authenticated users
-- =============================================================================

GRANT EXECUTE ON FUNCTION calculate_on_order_quantities() TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_vendor_lead_times() TO authenticated;
GRANT EXECUTE ON FUNCTION get_product_purchase_history(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_cost_trends(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_vendor_spending_summary(INTEGER) TO authenticated;
