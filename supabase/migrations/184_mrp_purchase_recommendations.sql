-- ============================================================================
-- SMART PURCHASE ORDER GENERATOR
-- Recommends what to buy, when, and from whom
-- Combines urgency scoring with criticality analysis
-- ============================================================================

CREATE OR REPLACE VIEW mrp_purchase_recommendations AS
WITH component_needs AS (
  SELECT
    component_sku,
    component_description,
    component_category,
    vendor_name,
    lead_time_days,
    SUM(shortage_qty) AS total_shortage,
    MIN(forecast_period) AS earliest_need_date,
    SUM(total_requirement) AS total_requirement,
    ARRAY_AGG(DISTINCT status ORDER BY status) AS statuses,
    BOOL_OR(any_critical_path) AS blocks_critical_builds,
    ARRAY_AGG(DISTINCT unnest_parent) AS consuming_boms
  FROM mrp_component_requirements,
       LATERAL unnest(consuming_parents) AS unnest_parent
  WHERE shortage_qty > 0
  GROUP BY 1,2,3,4,5
),
with_inventory AS (
  SELECT
    cn.*,
    i.moq AS min_order_qty,
    i.unit_cost,
    i.stock AS current_stock,
    i.on_order,
    -- ORDER DATE = need date minus lead time minus safety buffer (7 days)
    (cn.earliest_need_date - (cn.lead_time_days + 7)) AS order_by_date,
    -- SUGGESTED QTY considers MOQ and adds 10% buffer
    GREATEST(
      CEIL(cn.total_shortage * 1.1),  -- 10% buffer
      COALESCE(i.moq, 0)
    )::INTEGER AS suggested_order_qty
  FROM component_needs cn
  LEFT JOIN inventory_items i ON cn.component_sku = i.sku
)
SELECT
  component_sku,
  component_description,
  component_category,
  vendor_name,
  lead_time_days,
  total_shortage,
  total_requirement,
  earliest_need_date,
  order_by_date,
  current_stock,
  on_order,
  min_order_qty,
  unit_cost,
  suggested_order_qty,
  (suggested_order_qty * COALESCE(unit_cost, 0))::DECIMAL(12,2) AS estimated_po_value,
  blocks_critical_builds,
  consuming_boms,
  array_length(consuming_boms, 1) AS bom_count,
  -- DAYS UNTIL MUST ORDER
  (order_by_date - CURRENT_DATE) AS days_until_order_deadline,
  -- URGENCY SCORE (lower = more urgent)
  CASE
    WHEN order_by_date <= CURRENT_DATE THEN 0  -- OVERDUE
    WHEN order_by_date <= CURRENT_DATE + 7 THEN 1  -- THIS WEEK
    WHEN order_by_date <= CURRENT_DATE + 14 THEN 2  -- NEXT WEEK
    WHEN order_by_date <= CURRENT_DATE + 30 THEN 3  -- THIS MONTH
    ELSE 4  -- CAN WAIT
  END AS urgency_score,
  -- PURCHASE PRIORITY (combines urgency + criticality)
  CASE
    WHEN blocks_critical_builds AND order_by_date <= CURRENT_DATE + 7
      THEN 'P1_ORDER_TODAY'
    WHEN order_by_date <= CURRENT_DATE
      THEN 'P1_OVERDUE'
    WHEN blocks_critical_builds
      THEN 'P2_CRITICAL_PATH'
    WHEN order_by_date <= CURRENT_DATE + 14
      THEN 'P3_SOON'
    ELSE 'P4_PLANNED'
  END AS purchase_priority
FROM with_inventory
WHERE suggested_order_qty > 0
ORDER BY
  CASE
    WHEN blocks_critical_builds AND order_by_date <= CURRENT_DATE + 7 THEN 0
    WHEN order_by_date <= CURRENT_DATE THEN 1
    WHEN blocks_critical_builds THEN 2
    WHEN order_by_date <= CURRENT_DATE + 14 THEN 3
    ELSE 4
  END,
  (suggested_order_qty * COALESCE(unit_cost, 0)) DESC;

COMMENT ON VIEW mrp_purchase_recommendations IS 'Smart PO recommendations with urgency scoring and criticality analysis';

-- ============================================================================
-- VENDOR PO CONSOLIDATION VIEW
-- Groups purchase recommendations by vendor for efficient PO creation
-- ============================================================================

CREATE OR REPLACE VIEW mrp_vendor_po_summary AS
SELECT
  vendor_name,
  COUNT(*) AS item_count,
  SUM(suggested_order_qty) AS total_units,
  SUM(estimated_po_value)::DECIMAL(12,2) AS total_po_value,
  MIN(order_by_date) AS earliest_order_date,
  MIN(days_until_order_deadline) AS most_urgent_days,
  ARRAY_AGG(DISTINCT purchase_priority ORDER BY purchase_priority) AS priorities,
  ARRAY_AGG(component_sku ORDER BY estimated_po_value DESC) AS skus_to_order,
  -- Vendor urgency level
  CASE
    WHEN MIN(days_until_order_deadline) <= 0 THEN 'OVERDUE'
    WHEN MIN(days_until_order_deadline) <= 7 THEN 'THIS_WEEK'
    WHEN MIN(days_until_order_deadline) <= 14 THEN 'NEXT_WEEK'
    ELSE 'PLANNED'
  END AS vendor_urgency
FROM mrp_purchase_recommendations
WHERE vendor_name IS NOT NULL
GROUP BY vendor_name
ORDER BY
  MIN(days_until_order_deadline),
  SUM(estimated_po_value) DESC;

COMMENT ON VIEW mrp_vendor_po_summary IS 'Consolidated PO recommendations grouped by vendor';

-- ============================================================================
-- MRP DASHBOARD SUMMARY
-- High-level metrics for the MRP system
-- ============================================================================

CREATE OR REPLACE VIEW mrp_dashboard_summary AS
WITH buildability_metrics AS (
  SELECT
    COUNT(*) AS total_boms,
    COUNT(*) FILTER (WHERE build_action = 'BUILD_URGENT') AS urgent_builds,
    COUNT(*) FILTER (WHERE build_action = 'BUILD_SOON') AS soon_builds,
    COUNT(*) FILTER (WHERE build_action = 'ADEQUATE') AS adequate_builds,
    COUNT(*) FILTER (WHERE build_action = 'NO_DEMAND') AS no_demand_builds,
    AVG(days_of_coverage) FILTER (WHERE daily_demand > 0) AS avg_days_coverage
  FROM mrp_buildability_summary
),
purchasing_metrics AS (
  SELECT
    COUNT(*) AS components_to_order,
    COUNT(*) FILTER (WHERE purchase_priority = 'P1_ORDER_TODAY') AS p1_order_today,
    COUNT(*) FILTER (WHERE purchase_priority = 'P1_OVERDUE') AS p1_overdue,
    COUNT(*) FILTER (WHERE purchase_priority = 'P2_CRITICAL_PATH') AS p2_critical,
    SUM(estimated_po_value) AS total_po_value_needed,
    COUNT(DISTINCT vendor_name) AS vendors_to_contact
  FROM mrp_purchase_recommendations
),
forecast_metrics AS (
  SELECT
    COUNT(*) AS forecast_records,
    COUNT(DISTINCT product_id) AS products_forecasted,
    SUM(gross_requirement) AS total_gross_requirement
  FROM finished_goods_forecast
  WHERE forecast_period BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
)
SELECT
  -- Buildability
  bm.total_boms,
  bm.urgent_builds,
  bm.soon_builds,
  bm.adequate_builds,
  bm.no_demand_builds,
  ROUND(bm.avg_days_coverage::NUMERIC, 1) AS avg_days_coverage,
  -- Purchasing
  pm.components_to_order,
  pm.p1_order_today,
  pm.p1_overdue,
  pm.p2_critical,
  ROUND(pm.total_po_value_needed::NUMERIC, 2) AS total_po_value_needed,
  pm.vendors_to_contact,
  -- Forecasting
  fm.forecast_records,
  fm.products_forecasted,
  fm.total_gross_requirement AS demand_next_30_days,
  -- Timestamps
  NOW() AS generated_at
FROM buildability_metrics bm
CROSS JOIN purchasing_metrics pm
CROSS JOIN forecast_metrics fm;

COMMENT ON VIEW mrp_dashboard_summary IS 'High-level MRP dashboard metrics';
