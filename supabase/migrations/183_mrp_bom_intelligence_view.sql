-- ============================================================================
-- BOM EXPLOSION WITH INTELLIGENCE
-- Knows HOW MUCH of each component goes into each finished good
-- Enriches BOMs with cost analysis and lead time bottleneck identification
-- ============================================================================

-- BOM Intelligence View - enriches raw BOM data
CREATE OR REPLACE VIEW mrp_bom_intelligence AS
WITH bom_data AS (
  SELECT
    b.finished_sku AS parent_sku,
    b.name AS parent_description,
    b.category AS parent_category,
    comp->>'sku' AS component_sku,
    comp->>'name' AS component_description,
    (comp->>'quantity')::DECIMAL AS qty_per_parent,
    comp->>'unit' AS component_uom,
    -- Join to inventory for component details
    i.vendor_id AS primary_vendor_id,
    i.unit_cost AS component_cost,
    i.reorder_point AS component_reorder_point,
    -- Lead time from vendor, default 14 days
    COALESCE(v.lead_time_days, 14) AS lead_time_days,
    i.stock AS component_stock,
    i.on_order AS component_on_order,
    i.sales_last_30_days AS component_30d_sales,
    i.category AS component_category,
    -- Calculate component cost contribution
    ((comp->>'quantity')::DECIMAL * COALESCE(i.unit_cost, 0)) AS component_cost_per_parent
  FROM boms b
  CROSS JOIN LATERAL jsonb_array_elements(b.components::jsonb) AS comp
  LEFT JOIN inventory_items i ON (comp->>'sku') = i.sku
  LEFT JOIN vendors v ON i.vendor_id = v.id
  WHERE b.is_active = TRUE
),
parent_totals AS (
  SELECT
    parent_sku,
    SUM(component_cost_per_parent) AS total_component_cost,
    COUNT(DISTINCT component_sku) AS component_count,
    MAX(COALESCE(lead_time_days, 14)) AS longest_lead_time  -- Bottleneck identifier
  FROM bom_data
  GROUP BY parent_sku
),
-- Get vendor names
vendor_lookup AS (
  SELECT id, name AS vendor_name FROM vendors
)
SELECT
  b.parent_sku,
  b.parent_description,
  b.parent_category,
  b.component_sku,
  b.component_description,
  b.component_category,
  b.qty_per_parent,
  b.component_uom,
  b.primary_vendor_id,
  v.vendor_name,
  COALESCE(b.lead_time_days, 14) AS lead_time_days,
  COALESCE(b.component_cost, 0) AS component_cost,
  COALESCE(b.component_reorder_point, 0) AS component_reorder_point,
  COALESCE(b.component_stock, 0) AS component_stock,
  COALESCE(b.component_on_order, 0) AS component_on_order,
  COALESCE(b.component_30d_sales, 0) AS component_30d_sales,
  b.component_cost_per_parent,
  pt.total_component_cost,
  pt.component_count,
  pt.longest_lead_time,
  -- What % of parent cost is this component?
  ROUND(
    (b.component_cost_per_parent / NULLIF(pt.total_component_cost, 0)) * 100, 2
  ) AS cost_weight_pct,
  -- Is this the lead time bottleneck?
  (COALESCE(b.lead_time_days, 14) = pt.longest_lead_time) AS is_lead_time_critical,
  -- How many of the parent can we build with current stock?
  CASE
    WHEN b.qty_per_parent > 0
    THEN FLOOR(COALESCE(b.component_stock, 0) / b.qty_per_parent)
    ELSE 0
  END AS max_builds_from_component
FROM bom_data b
JOIN parent_totals pt ON b.parent_sku = pt.parent_sku
LEFT JOIN vendor_lookup v ON b.primary_vendor_id = v.id;

COMMENT ON VIEW mrp_bom_intelligence IS 'Enriched BOM view with cost analysis, lead times, and buildability per component';

-- ============================================================================
-- BUILD REQUIREMENTS CALCULATOR
-- Rolls finished goods demand into component requirements
-- ============================================================================

CREATE OR REPLACE VIEW mrp_component_requirements AS
WITH
-- Step 1: Get finished goods demand by period (next 90 days)
demand AS (
  SELECT
    product_id,
    forecast_period,
    gross_requirement,
    seasonal_index
  FROM finished_goods_forecast
  WHERE forecast_period BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
),
-- Step 2: Explode BOMs to get component requirements
exploded AS (
  SELECT
    d.forecast_period,
    bi.component_sku,
    bi.component_description,
    bi.component_category,
    bi.vendor_name,
    bi.lead_time_days,
    d.product_id AS parent_sku,
    bi.parent_description,
    d.gross_requirement AS parent_qty_needed,
    bi.qty_per_parent,
    -- Raw component requirement
    (d.gross_requirement * bi.qty_per_parent) AS gross_component_qty,
    bi.component_cost,
    bi.is_lead_time_critical
  FROM demand d
  JOIN mrp_bom_intelligence bi ON d.product_id = bi.parent_sku
),
-- Step 3: Aggregate by component across all parents
aggregated AS (
  SELECT
    component_sku,
    component_description,
    component_category,
    vendor_name,
    lead_time_days,
    forecast_period,
    SUM(gross_component_qty) AS total_gross_requirement,
    SUM(gross_component_qty * component_cost) AS total_requirement_value,
    ARRAY_AGG(DISTINCT parent_sku) AS consuming_parents,
    COUNT(DISTINCT parent_sku) AS parent_count,
    BOOL_OR(is_lead_time_critical) AS any_critical_path
  FROM exploded
  GROUP BY 1,2,3,4,5,6
),
-- Step 4: Compare to current inventory
with_inventory AS (
  SELECT
    a.*,
    COALESCE(i.stock, 0) AS current_on_hand,
    COALESCE(i.on_order, 0) AS on_order,
    0 AS reserved,  -- Can be enhanced with actual reservations
    -- Net available = on_hand + on_order - reserved
    (COALESCE(i.stock, 0) + COALESCE(i.on_order, 0)) AS net_available,
    -- Independent demand (direct sales of this component)
    -- forecast_period - CURRENT_DATE gives integer days directly
    COALESCE(i.sales_last_30_days, 0) / 30.0 *
      ((a.forecast_period - CURRENT_DATE) + 7) AS independent_demand_forecast,
    -- Days until needed (date subtraction returns integer in PostgreSQL)
    (a.forecast_period - CURRENT_DATE) AS days_until_period
  FROM aggregated a
  LEFT JOIN inventory_items i ON a.component_sku = i.sku
)
SELECT
  component_sku,
  component_description,
  component_category,
  vendor_name,
  lead_time_days,
  forecast_period,
  total_gross_requirement AS dependent_requirement,  -- From BOM builds
  COALESCE(independent_demand_forecast, 0)::INTEGER AS independent_requirement,  -- Direct sales
  (total_gross_requirement + COALESCE(independent_demand_forecast, 0))::INTEGER AS total_requirement,
  total_requirement_value,
  consuming_parents,
  parent_count,
  any_critical_path,
  current_on_hand,
  on_order,
  net_available,
  -- SHORTAGE = requirement exceeds availability
  GREATEST(0, (total_gross_requirement + COALESCE(independent_demand_forecast, 0)) - net_available)::INTEGER AS shortage_qty,
  -- SURPLUS = have more than needed
  GREATEST(0, net_available - (total_gross_requirement + COALESCE(independent_demand_forecast, 0)))::INTEGER AS surplus_qty,
  -- Days until needed
  days_until_period AS days_until_needed,
  -- URGENCY based on lead time vs days until needed
  CASE
    WHEN GREATEST(0, (total_gross_requirement + COALESCE(independent_demand_forecast, 0)) - net_available) > 0
         AND lead_time_days >= days_until_period
      THEN 'CRITICAL'
    WHEN GREATEST(0, (total_gross_requirement + COALESCE(independent_demand_forecast, 0)) - net_available) > 0
      THEN 'SHORTAGE'
    WHEN net_available > (total_gross_requirement + COALESCE(independent_demand_forecast, 0)) * 2
      THEN 'EXCESS'
    ELSE 'COVERED'
  END AS status
FROM with_inventory;

COMMENT ON VIEW mrp_component_requirements IS 'Time-phased component requirements with shortage/surplus analysis';

-- ============================================================================
-- SUMMARY VIEW: What to order NOW
-- ============================================================================

CREATE OR REPLACE VIEW mrp_purchasing_action_summary AS
SELECT
  component_sku,
  component_description,
  component_category,
  vendor_name,
  lead_time_days,
  SUM(shortage_qty) AS total_shortage,
  SUM(dependent_requirement) AS total_dependent_demand,
  SUM(independent_requirement) AS total_independent_demand,
  SUM(total_requirement) AS total_demand,
  MIN(days_until_needed) AS soonest_need_days,
  ARRAY_AGG(DISTINCT unnest_parent) AS all_consuming_parents,
  -- Priority score: higher = more urgent
  CASE
    WHEN MIN(days_until_needed) <= lead_time_days AND SUM(shortage_qty) > 0 THEN 'ORDER NOW'
    WHEN SUM(shortage_qty) > 0 THEN 'PLAN ORDER'
    ELSE 'MONITOR'
  END AS action_required,
  -- Order quantity recommendation
  CEIL(SUM(shortage_qty) * 1.1) AS suggested_order_qty  -- 10% buffer
FROM mrp_component_requirements,
     LATERAL unnest(consuming_parents) AS unnest_parent
WHERE status IN ('CRITICAL', 'SHORTAGE')
GROUP BY 1,2,3,4,5
ORDER BY
  CASE WHEN MIN(days_until_needed) <= lead_time_days AND SUM(shortage_qty) > 0 THEN 0 ELSE 1 END,
  MIN(days_until_needed),
  SUM(shortage_qty) DESC;

COMMENT ON VIEW mrp_purchasing_action_summary IS 'Actionable purchasing recommendations based on BOM explosion and forecasts';

-- ============================================================================
-- BUILDABILITY SUMMARY VIEW
-- How many of each finished good can we build?
-- ============================================================================

CREATE OR REPLACE VIEW mrp_buildability_summary AS
WITH component_limits AS (
  SELECT
    parent_sku,
    parent_description,
    parent_category,
    MIN(max_builds_from_component) AS buildable_units,
    -- Find the limiting component
    (ARRAY_AGG(component_sku ORDER BY max_builds_from_component))[1] AS limiting_component_sku,
    (ARRAY_AGG(component_description ORDER BY max_builds_from_component))[1] AS limiting_component_name,
    MIN(max_builds_from_component) AS limiting_component_builds,
    COUNT(*) AS total_components,
    SUM(total_component_cost) / COUNT(*) AS avg_component_cost
  FROM mrp_bom_intelligence
  WHERE qty_per_parent > 0
  GROUP BY parent_sku, parent_description, parent_category
),
with_demand AS (
  SELECT
    cl.*,
    COALESCE(i.stock, 0) AS finished_stock,
    COALESCE(i.sales_last_30_days, 0) AS sales_30d,
    COALESCE(i.sales_last_30_days, 0) / 30.0 AS daily_demand
  FROM component_limits cl
  LEFT JOIN inventory_items i ON cl.parent_sku = i.sku
)
SELECT
  parent_sku,
  parent_description,
  parent_category,
  finished_stock,
  buildable_units,
  (finished_stock + buildable_units) AS total_available,
  daily_demand,
  -- Days of coverage
  CASE
    WHEN daily_demand > 0
    THEN FLOOR((finished_stock + buildable_units) / daily_demand)
    ELSE 999
  END AS days_of_coverage,
  limiting_component_sku,
  limiting_component_name,
  limiting_component_builds,
  total_components,
  avg_component_cost,
  -- Build recommendation
  CASE
    WHEN daily_demand <= 0 THEN 'NO_DEMAND'
    WHEN (finished_stock + buildable_units) / NULLIF(daily_demand, 0) <= 7 THEN 'BUILD_URGENT'
    WHEN (finished_stock + buildable_units) / NULLIF(daily_demand, 0) <= 21 THEN 'BUILD_SOON'
    ELSE 'ADEQUATE'
  END AS build_action
FROM with_demand
ORDER BY
  CASE
    WHEN daily_demand > 0 AND (finished_stock + buildable_units) / NULLIF(daily_demand, 0) <= 7 THEN 0
    WHEN daily_demand > 0 AND (finished_stock + buildable_units) / NULLIF(daily_demand, 0) <= 21 THEN 1
    ELSE 2
  END,
  daily_demand DESC;

COMMENT ON VIEW mrp_buildability_summary IS 'Summary of buildable quantities for each BOM with limiting factor analysis';
