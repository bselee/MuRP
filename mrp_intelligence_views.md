-- =============================================
-- FINALE → MURP: MRP INTELLIGENCE VIEWS
-- Run AFTER the base schema is created
-- =============================================

-- =============================================
-- VIEW 1: VELOCITY ANALYSIS
-- Calculates 30/60/90 day consumption rates
-- =============================================
CREATE OR REPLACE VIEW mrp_velocity_analysis AS
WITH daily_usage AS (
  -- Aggregate stock movements by day
  SELECT 
    product_id,
    finale_product_url,
    transaction_date::DATE as usage_date,
    -- Outbound = negative quantities (sales, builds, transfers out)
    ABS(SUM(CASE WHEN quantity < 0 THEN quantity ELSE 0 END)) as daily_outbound,
    -- Inbound = positive quantities (receipts, builds completed)
    SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END) as daily_inbound
  FROM finale_stock_history
  WHERE transaction_date >= CURRENT_DATE - INTERVAL '90 days'
  GROUP BY product_id, finale_product_url, transaction_date::DATE
),
velocity_calcs AS (
  SELECT 
    product_id,
    finale_product_url,
    
    -- 30-day metrics
    SUM(CASE WHEN usage_date >= CURRENT_DATE - 30 THEN daily_outbound ELSE 0 END) as usage_30d,
    COUNT(CASE WHEN usage_date >= CURRENT_DATE - 30 AND daily_outbound > 0 THEN 1 END) as days_with_usage_30d,
    
    -- 60-day metrics
    SUM(CASE WHEN usage_date >= CURRENT_DATE - 60 THEN daily_outbound ELSE 0 END) as usage_60d,
    COUNT(CASE WHEN usage_date >= CURRENT_DATE - 60 AND daily_outbound > 0 THEN 1 END) as days_with_usage_60d,
    
    -- 90-day metrics
    SUM(daily_outbound) as usage_90d,
    COUNT(CASE WHEN daily_outbound > 0 THEN 1 END) as days_with_usage_90d,
    
    -- Last activity
    MAX(CASE WHEN daily_outbound > 0 THEN usage_date END) as last_usage_date,
    MAX(CASE WHEN daily_inbound > 0 THEN usage_date END) as last_receipt_date
    
  FROM daily_usage
  GROUP BY product_id, finale_product_url
)
SELECT 
  p.id as product_id,
  p.sku,
  p.internal_name as description,
  p.custom_department as department,
  p.unit_cost,
  p.reorder_point,
  p.reorder_quantity,
  p.lead_time_days,
  p.primary_supplier_id as vendor_id,
  
  -- Current stock position
  COALESCE(inv.total_on_hand, 0) as current_stock,
  COALESCE(inv.total_on_order, 0) as on_order,
  COALESCE(inv.total_reserved, 0) as reserved,
  COALESCE(inv.total_on_hand, 0) + COALESCE(inv.total_on_order, 0) 
    - COALESCE(inv.total_reserved, 0) as projected_available,
  
  -- Raw velocity (total units consumed)
  COALESCE(v.usage_30d, 0) as usage_30d,
  COALESCE(v.usage_60d, 0) as usage_60d,
  COALESCE(v.usage_90d, 0) as usage_90d,
  
  -- Daily averages
  ROUND(COALESCE(v.usage_30d, 0) / 30.0, 2) as avg_daily_usage_30d,
  ROUND(COALESCE(v.usage_60d, 0) / 60.0, 2) as avg_daily_usage_60d,
  ROUND(COALESCE(v.usage_90d, 0) / 90.0, 2) as avg_daily_usage_90d,
  
  -- Trending (is usage increasing or decreasing?)
  CASE 
    WHEN COALESCE(v.usage_30d, 0) > 0 AND COALESCE(v.usage_60d, 0) > 0
    THEN ROUND((v.usage_30d / 30.0) / NULLIF(v.usage_60d / 60.0, 0) * 100 - 100, 1)
    ELSE 0
  END as velocity_trend_pct,
  
  -- Days of stock remaining (at 30-day velocity)
  CASE 
    WHEN COALESCE(v.usage_30d, 0) > 0 
    THEN ROUND((COALESCE(inv.total_on_hand, 0) + COALESCE(inv.total_on_order, 0) 
           - COALESCE(inv.total_reserved, 0)) / NULLIF(v.usage_30d / 30.0, 0), 1)
    ELSE 9999
  END as days_of_stock,
  
  -- Usage frequency (% of days with movement)
  ROUND(COALESCE(v.days_with_usage_30d, 0) / 30.0 * 100, 1) as usage_frequency_pct,
  
  -- Last activity dates
  v.last_usage_date,
  v.last_receipt_date,
  CURRENT_DATE - v.last_usage_date as days_since_last_usage,
  
  -- ABC velocity classification
  CASE 
    WHEN COALESCE(v.usage_30d, 0) / 30.0 >= 10 THEN 'A'
    WHEN COALESCE(v.usage_30d, 0) / 30.0 >= 3 THEN 'B'
    WHEN COALESCE(v.usage_30d, 0) / 30.0 >= 0.5 THEN 'C'
    WHEN COALESCE(v.usage_90d, 0) > 0 THEN 'D'
    ELSE 'E'
  END as velocity_class,
  
  -- Classification description
  CASE 
    WHEN COALESCE(v.usage_30d, 0) / 30.0 >= 10 THEN 'High Velocity (10+/day)'
    WHEN COALESCE(v.usage_30d, 0) / 30.0 >= 3 THEN 'Medium Velocity (3-10/day)'
    WHEN COALESCE(v.usage_30d, 0) / 30.0 >= 0.5 THEN 'Low Velocity (0.5-3/day)'
    WHEN COALESCE(v.usage_90d, 0) > 0 THEN 'Slow Moving (<0.5/day)'
    ELSE 'Dead Stock (no movement)'
  END as velocity_description,
  
  -- Stock value
  COALESCE(inv.total_on_hand, 0) * COALESCE(p.unit_cost, 0) as stock_value,
  
  -- Sync info
  p.synced_at as last_sync

FROM finale_products p
LEFT JOIN velocity_calcs v ON p.finale_product_url = v.finale_product_url
LEFT JOIN (
  SELECT 
    finale_product_url,
    SUM(quantity_on_hand) as total_on_hand,
    SUM(quantity_on_order) as total_on_order,
    SUM(quantity_reserved) as total_reserved
  FROM finale_inventory
  GROUP BY finale_product_url
) inv ON p.finale_product_url = inv.finale_product_url
WHERE p.status = 'PRODUCT_ACTIVE';


-- =============================================
-- VIEW 2: REORDER RECOMMENDATIONS
-- Intelligent suggestions for what to order
-- =============================================
CREATE OR REPLACE VIEW mrp_reorder_recommendations AS
SELECT 
  vel.product_id,
  vel.sku,
  vel.description,
  vel.department,
  vel.velocity_class,
  vel.velocity_description,
  
  -- Current position
  vel.current_stock,
  vel.on_order,
  vel.reserved,
  vel.projected_available,
  
  -- Velocity
  vel.avg_daily_usage_30d,
  vel.velocity_trend_pct,
  vel.days_of_stock,
  
  -- Lead time (use product setting, or vendor default, or 14 days)
  COALESCE(vel.lead_time_days, v.default_lead_time_days, v.avg_lead_time_days::INTEGER, 14) as lead_time_days,
  v.party_name as vendor_name,
  v.finale_party_url as vendor_url,
  
  -- Calculated safety stock (lead time × daily usage × 1.5)
  ROUND(COALESCE(vel.lead_time_days, v.default_lead_time_days, 14) 
        * vel.avg_daily_usage_30d * 1.5, 0) as safety_stock,
  
  -- Calculated reorder point (lead time demand + safety stock)
  ROUND(COALESCE(vel.lead_time_days, v.default_lead_time_days, 14) * vel.avg_daily_usage_30d 
        + (COALESCE(vel.lead_time_days, v.default_lead_time_days, 14) * vel.avg_daily_usage_30d * 1.5), 0) 
    as calculated_reorder_point,
  
  -- Compare to Finale's reorder point
  vel.reorder_point as finale_reorder_point,
  
  -- Order quantity (30-day supply, but at least MOQ or reorder qty)
  GREATEST(
    ROUND(vel.avg_daily_usage_30d * 30, 0),
    COALESCE(p.minimum_order_qty, 1),
    COALESCE(vel.reorder_quantity, 1)
  ) as suggested_order_qty,
  
  -- Urgency classification
  CASE 
    WHEN vel.days_of_stock <= COALESCE(vel.lead_time_days, 14) THEN 'CRITICAL'
    WHEN vel.days_of_stock <= COALESCE(vel.lead_time_days, 14) * 1.5 THEN 'URGENT'
    WHEN vel.days_of_stock <= COALESCE(vel.lead_time_days, 14) * 2 THEN 'SOON'
    WHEN vel.days_of_stock <= COALESCE(vel.lead_time_days, 14) * 3 THEN 'PLAN'
    ELSE 'OK'
  END as urgency,
  
  -- Urgency score (for sorting, lower = more urgent)
  CASE 
    WHEN vel.days_of_stock <= COALESCE(vel.lead_time_days, 14) THEN 1
    WHEN vel.days_of_stock <= COALESCE(vel.lead_time_days, 14) * 1.5 THEN 2
    WHEN vel.days_of_stock <= COALESCE(vel.lead_time_days, 14) * 2 THEN 3
    WHEN vel.days_of_stock <= COALESCE(vel.lead_time_days, 14) * 3 THEN 4
    ELSE 5
  END as urgency_score,
  
  -- Projected stockout date
  CASE 
    WHEN vel.avg_daily_usage_30d > 0 
    THEN CURRENT_DATE + vel.days_of_stock::INTEGER
    ELSE NULL
  END as projected_stockout_date,
  
  -- Cost impact
  vel.unit_cost,
  ROUND(vel.avg_daily_usage_30d * 30 * COALESCE(vel.unit_cost, 0), 2) as monthly_cost,
  
  -- Flags
  (vel.days_of_stock <= COALESCE(vel.lead_time_days, 14) * 1.5) as needs_order,
  (vel.velocity_trend_pct > 20) as demand_increasing

FROM mrp_velocity_analysis vel
JOIN finale_products p ON vel.product_id = p.id
LEFT JOIN finale_vendors v ON p.primary_supplier_url = v.finale_party_url
WHERE vel.velocity_class IN ('A', 'B', 'C') -- Only active items
ORDER BY 
  CASE 
    WHEN vel.days_of_stock <= COALESCE(vel.lead_time_days, 14) THEN 1
    WHEN vel.days_of_stock <= COALESCE(vel.lead_time_days, 14) * 1.5 THEN 2
    ELSE 3
  END,
  vel.days_of_stock ASC;


-- =============================================
-- VIEW 3: BOM EXPLOSION (Multi-level)
-- Shows all components needed to build assemblies
-- =============================================
CREATE OR REPLACE VIEW mrp_bom_explosion AS
WITH RECURSIVE bom_tree AS (
  -- Level 1: Direct components
  SELECT 
    b.parent_product_url,
    b.parent_sku,
    b.parent_name,
    b.component_product_url,
    b.component_sku,
    b.component_name,
    b.quantity_per,
    b.effective_quantity,
    1 as bom_level,
    ARRAY[b.parent_sku] as path_array,
    b.parent_sku || ' → ' || b.component_sku as path_string
  FROM finale_boms b
  
  UNION ALL
  
  -- Level 2+: Sub-components
  SELECT 
    bt.parent_product_url,
    bt.parent_sku,
    bt.parent_name,
    b.component_product_url,
    b.component_sku,
    b.component_name,
    bt.effective_quantity * b.quantity_per as quantity_per,
    bt.effective_quantity * b.effective_quantity as effective_quantity,
    bt.bom_level + 1,
    bt.path_array || b.component_sku,
    bt.path_string || ' → ' || b.component_sku
  FROM bom_tree bt
  JOIN finale_boms b ON bt.component_product_url = b.parent_product_url
  WHERE bt.bom_level < 10 -- Prevent infinite loops
    AND NOT b.component_sku = ANY(bt.path_array) -- Prevent circular references
)
SELECT 
  bt.parent_sku as assembly_sku,
  bt.parent_name as assembly_name,
  bt.component_sku,
  bt.component_name,
  ROUND(bt.effective_quantity, 4) as qty_per_assembly,
  bt.bom_level,
  bt.path_string as component_path,
  
  -- Component inventory
  COALESCE(inv.total_on_hand, 0) as component_on_hand,
  COALESCE(inv.total_on_order, 0) as component_on_order,
  COALESCE(inv.total_reserved, 0) as component_reserved,
  
  -- How many assemblies can we build with current stock?
  CASE 
    WHEN bt.effective_quantity > 0 
    THEN FLOOR(COALESCE(inv.total_on_hand, 0) / bt.effective_quantity)
    ELSE 0
  END as assemblies_possible_from_stock,
  
  -- How many with stock + on order?
  CASE 
    WHEN bt.effective_quantity > 0 
    THEN FLOOR((COALESCE(inv.total_on_hand, 0) + COALESCE(inv.total_on_order, 0)) / bt.effective_quantity)
    ELSE 0
  END as assemblies_possible_total,
  
  -- Component cost
  p.unit_cost as component_unit_cost,
  ROUND(bt.effective_quantity * COALESCE(p.unit_cost, 0), 4) as component_cost_per_assembly,
  
  -- Component availability
  CASE 
    WHEN COALESCE(inv.total_on_hand, 0) >= bt.effective_quantity THEN 'In Stock'
    WHEN COALESCE(inv.total_on_hand, 0) + COALESCE(inv.total_on_order, 0) >= bt.effective_quantity THEN 'On Order'
    ELSE 'Shortage'
  END as availability_status

FROM bom_tree bt
LEFT JOIN finale_products p ON bt.component_product_url = p.finale_product_url
LEFT JOIN (
  SELECT 
    finale_product_url, 
    SUM(quantity_on_hand) as total_on_hand, 
    SUM(quantity_on_order) as total_on_order,
    SUM(quantity_reserved) as total_reserved
  FROM finale_inventory 
  GROUP BY finale_product_url
) inv ON bt.component_product_url = inv.finale_product_url
ORDER BY bt.parent_sku, bt.bom_level, bt.component_sku;


-- =============================================
-- VIEW 4: BUILD REQUIREMENTS
-- What components are needed for pending builds?
-- =============================================
CREATE OR REPLACE VIEW mrp_build_requirements AS
WITH assembly_demand AS (
  -- Demand from reserved quantities (sales orders, etc.)
  SELECT 
    p.finale_product_url,
    p.sku,
    SUM(i.quantity_reserved) as reserved_qty
  FROM finale_inventory i
  JOIN finale_products p ON i.finale_product_url = p.finale_product_url
  WHERE p.is_assembly = true
    AND i.quantity_reserved > 0
  GROUP BY p.finale_product_url, p.sku
),
component_requirements AS (
  SELECT 
    bom.component_product_url,
    bom.component_sku,
    bom.component_name,
    SUM(bom.effective_quantity * COALESCE(ad.reserved_qty, 0)) as total_needed,
    STRING_AGG(DISTINCT ad.sku || ' x' || ad.reserved_qty::TEXT, ', ') as needed_for
  FROM finale_boms bom
  JOIN assembly_demand ad ON bom.parent_product_url = ad.finale_product_url
  GROUP BY bom.component_product_url, bom.component_sku, bom.component_name
  HAVING SUM(bom.effective_quantity * COALESCE(ad.reserved_qty, 0)) > 0
)
SELECT 
  cr.component_sku as sku,
  cr.component_name as description,
  cr.needed_for as assemblies,
  ROUND(cr.total_needed, 2) as qty_needed_for_builds,
  
  COALESCE(inv.total_on_hand, 0) as on_hand,
  COALESCE(inv.total_on_order, 0) as on_order,
  
  -- Net position
  COALESCE(inv.total_on_hand, 0) + COALESCE(inv.total_on_order, 0) - cr.total_needed as net_position,
  
  -- Shortage
  CASE 
    WHEN (COALESCE(inv.total_on_hand, 0) + COALESCE(inv.total_on_order, 0)) < cr.total_needed 
    THEN ROUND(cr.total_needed - COALESCE(inv.total_on_hand, 0) - COALESCE(inv.total_on_order, 0), 2)
    ELSE 0
  END as shortage_qty,
  
  -- Status
  CASE 
    WHEN COALESCE(inv.total_on_hand, 0) >= cr.total_needed THEN 'Ready'
    WHEN (COALESCE(inv.total_on_hand, 0) + COALESCE(inv.total_on_order, 0)) >= cr.total_needed THEN 'Awaiting Receipt'
    ELSE 'Shortage - Order Needed'
  END as build_status,
  
  -- Vendor info
  p.unit_cost,
  v.party_name as vendor_name,
  v.finale_party_url as vendor_url

FROM component_requirements cr
JOIN finale_products p ON cr.component_product_url = p.finale_product_url
LEFT JOIN finale_vendors v ON p.primary_supplier_url = v.finale_party_url
LEFT JOIN (
  SELECT 
    finale_product_url, 
    SUM(quantity_on_hand) as total_on_hand, 
    SUM(quantity_on_order) as total_on_order
  FROM finale_inventory 
  GROUP BY finale_product_url
) inv ON cr.component_product_url = inv.finale_product_url
ORDER BY 
  CASE WHEN (COALESCE(inv.total_on_hand, 0) + COALESCE(inv.total_on_order, 0)) < cr.total_needed THEN 0 ELSE 1 END,
  cr.total_needed DESC;


-- =============================================
-- VIEW 5: VENDOR PERFORMANCE
-- Tracks lead times, on-time delivery, spend
-- =============================================
CREATE OR REPLACE VIEW mrp_vendor_performance AS
SELECT 
  v.id as vendor_id,
  v.party_id,
  v.party_name as vendor_name,
  v.email,
  v.phone,
  v.payment_terms,
  v.default_lead_time_days,
  
  -- Order counts
  COUNT(DISTINCT po.id) as total_orders,
  COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'Completed') as completed_orders,
  COUNT(DISTINCT po.id) FILTER (WHERE po.status IN ('Pending', 'Submitted', 'Ordered')) as open_orders,
  
  -- Spend analysis
  COALESCE(SUM(po.total), 0) as lifetime_spend,
  COALESCE(SUM(po.total) FILTER (WHERE po.order_date >= CURRENT_DATE - INTERVAL '12 months'), 0) as spend_12m,
  COALESCE(SUM(po.total) FILTER (WHERE po.order_date >= CURRENT_DATE - INTERVAL '3 months'), 0) as spend_3m,
  ROUND(COALESCE(AVG(po.total), 0), 2) as avg_order_value,
  
  -- Lead time analysis
  ROUND(AVG(EXTRACT(DAY FROM (po.received_date - po.order_date)))::NUMERIC, 1) 
    FILTER (WHERE po.received_date IS NOT NULL) as avg_actual_lead_days,
  MIN(EXTRACT(DAY FROM (po.received_date - po.order_date)))::INTEGER 
    FILTER (WHERE po.received_date IS NOT NULL) as min_lead_days,
  MAX(EXTRACT(DAY FROM (po.received_date - po.order_date)))::INTEGER 
    FILTER (WHERE po.received_date IS NOT NULL) as max_lead_days,
  ROUND(STDDEV(EXTRACT(DAY FROM (po.received_date - po.order_date)))::NUMERIC, 1) 
    FILTER (WHERE po.received_date IS NOT NULL) as lead_time_stddev,
  
  -- On-time delivery
  COUNT(*) FILTER (WHERE po.received_date <= po.expected_date AND po.received_date IS NOT NULL) as on_time_count,
  COUNT(*) FILTER (WHERE po.received_date IS NOT NULL) as total_deliveries,
  ROUND(
    COUNT(*) FILTER (WHERE po.received_date <= po.expected_date AND po.received_date IS NOT NULL)::DECIMAL / 
    NULLIF(COUNT(*) FILTER (WHERE po.received_date IS NOT NULL), 0) * 100, 1
  ) as on_time_delivery_pct,
  
  -- Product coverage
  COUNT(DISTINCT p.id) as products_supplied,
  
  -- Recent activity
  MAX(po.order_date) as last_order_date,
  MAX(po.received_date) as last_receipt_date,
  CURRENT_DATE - MAX(po.order_date) as days_since_last_order,
  
  -- Vendor score (composite)
  ROUND(
    (COALESCE(
      COUNT(*) FILTER (WHERE po.received_date <= po.expected_date)::DECIMAL / 
      NULLIF(COUNT(*) FILTER (WHERE po.received_date IS NOT NULL), 0), 0) * 50) + -- On-time weight: 50%
    (CASE WHEN AVG(EXTRACT(DAY FROM (po.received_date - po.order_date))) IS NULL THEN 50
          WHEN AVG(EXTRACT(DAY FROM (po.received_date - po.order_date))) <= 7 THEN 50
          WHEN AVG(EXTRACT(DAY FROM (po.received_date - po.order_date))) <= 14 THEN 40
          WHEN AVG(EXTRACT(DAY FROM (po.received_date - po.order_date))) <= 21 THEN 30
          ELSE 20 END) -- Lead time weight: up to 50%
  , 1) as vendor_score

FROM finale_vendors v
LEFT JOIN finale_purchase_orders po ON v.finale_party_url = po.vendor_url
LEFT JOIN finale_products p ON v.finale_party_url = p.primary_supplier_url
WHERE v.status = 'Active'
GROUP BY v.id, v.party_id, v.party_name, v.email, v.phone, v.payment_terms, v.default_lead_time_days
ORDER BY vendor_score DESC NULLS LAST;


-- =============================================
-- VIEW 6: OPEN PURCHASE ORDERS
-- Dashboard view of pending orders
-- =============================================
CREATE OR REPLACE VIEW mrp_open_purchase_orders AS
SELECT 
  po.order_id,
  po.status,
  po.vendor_name,
  po.order_date,
  po.expected_date,
  po.total,
  po.line_count,
  po.total_quantity,
  po.delivery_status,
  
  -- Days until/since expected
  CASE 
    WHEN po.expected_date IS NOT NULL 
    THEN po.expected_date - CURRENT_DATE
    ELSE NULL
  END as days_until_expected,
  
  -- Top 3 items summary
  (
    SELECT STRING_AGG(
      (li->>'product_sku')::TEXT || ' ×' || (li->>'quantity_ordered')::TEXT, 
      ', '
    )
    FROM (
      SELECT li
      FROM jsonb_array_elements(po.line_items) li
      ORDER BY (li->>'line_number')::INT
      LIMIT 3
    ) sub
  ) as top_items,
  
  -- Value remaining to receive
  (
    SELECT COALESCE(SUM(
      ((li->>'quantity_ordered')::DECIMAL - COALESCE((li->>'quantity_received')::DECIMAL, 0)) 
      * COALESCE((li->>'unit_cost')::DECIMAL, 0)
    ), 0)
    FROM jsonb_array_elements(po.line_items) li
  ) as value_pending,
  
  po.public_notes,
  po.finale_order_url,
  po.synced_at

FROM finale_purchase_orders po
WHERE po.status IN ('Pending', 'Submitted', 'Ordered', 'Partial')
ORDER BY 
  CASE po.delivery_status
    WHEN 'OVERDUE' THEN 1
    WHEN 'DUE_SOON' THEN 2
    ELSE 3
  END,
  po.expected_date ASC NULLS LAST;


-- =============================================
-- VIEW 7: INVENTORY SUMMARY BY DEPARTMENT
-- Quick overview for each department
-- =============================================
CREATE OR REPLACE VIEW mrp_inventory_by_department AS
SELECT 
  COALESCE(p.custom_department, 'Unassigned') as department,
  COUNT(DISTINCT p.id) as product_count,
  
  -- Stock position
  SUM(COALESCE(inv.total_on_hand, 0)) as total_on_hand,
  SUM(COALESCE(inv.total_on_order, 0)) as total_on_order,
  SUM(COALESCE(inv.total_reserved, 0)) as total_reserved,
  
  -- Stock value
  SUM(COALESCE(inv.total_on_hand, 0) * COALESCE(p.unit_cost, 0)) as stock_value,
  
  -- Items needing reorder
  COUNT(*) FILTER (WHERE 
    (COALESCE(inv.total_on_hand, 0) + COALESCE(inv.total_on_order, 0)) <= COALESCE(p.reorder_point, 0)
    AND COALESCE(p.reorder_point, 0) > 0
  ) as items_below_reorder_point,
  
  -- Velocity breakdown
  COUNT(*) FILTER (WHERE vel.velocity_class = 'A') as high_velocity_items,
  COUNT(*) FILTER (WHERE vel.velocity_class = 'B') as medium_velocity_items,
  COUNT(*) FILTER (WHERE vel.velocity_class = 'C') as low_velocity_items,
  COUNT(*) FILTER (WHERE vel.velocity_class IN ('D', 'E')) as slow_dead_items,
  
  -- Average days of stock
  ROUND(AVG(vel.days_of_stock) FILTER (WHERE vel.days_of_stock < 9999), 1) as avg_days_of_stock

FROM finale_products p
LEFT JOIN (
  SELECT 
    finale_product_url, 
    SUM(quantity_on_hand) as total_on_hand, 
    SUM(quantity_on_order) as total_on_order,
    SUM(quantity_reserved) as total_reserved
  FROM finale_inventory 
  GROUP BY finale_product_url
) inv ON p.finale_product_url = inv.finale_product_url
LEFT JOIN mrp_velocity_analysis vel ON p.id = vel.product_id
WHERE p.status = 'PRODUCT_ACTIVE'
GROUP BY COALESCE(p.custom_department, 'Unassigned')
ORDER BY stock_value DESC;


-- =============================================
-- INDEXES FOR VIEW PERFORMANCE
-- =============================================
CREATE INDEX IF NOT EXISTS idx_stock_history_velocity 
  ON finale_stock_history(finale_product_url, transaction_date, quantity) 
  WHERE transaction_date >= CURRENT_DATE - INTERVAL '90 days';

CREATE INDEX IF NOT EXISTS idx_products_active 
  ON finale_products(finale_product_url) 
  WHERE status = 'PRODUCT_ACTIVE';

CREATE INDEX IF NOT EXISTS idx_po_open 
  ON finale_purchase_orders(expected_date, status) 
  WHERE status IN ('Pending', 'Submitted', 'Ordered', 'Partial');