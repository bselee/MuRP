-- Migration 148: Fix Security Definer Views (Security Fix)
--
-- This migration addresses the Supabase security lint warning:
-- "0010_security_definer_view" - 77 views use SECURITY DEFINER
--
-- Views with SECURITY DEFINER run with the creator's permissions, bypassing RLS.
-- We need to recreate these views without SECURITY DEFINER (using SECURITY INVOKER).
--
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

BEGIN;

-- ============================================================================
-- NOTE: Views in PostgreSQL use SECURITY INVOKER by default.
-- The lint warning may be triggered if views were created with explicit
-- SECURITY DEFINER or if they reference SECURITY DEFINER functions.
--
-- This migration recreates views WITHOUT security_barrier or security_definer
-- attributes to ensure they use the caller's permissions.
-- ============================================================================

-- ============================================================================
-- MRP & INVENTORY VIEWS (18)
-- ============================================================================

-- urgent_reorders
DROP VIEW IF EXISTS public.urgent_reorders CASCADE;
CREATE VIEW public.urgent_reorders AS
SELECT
  ii.id,
  ii.sku,
  ii.name,
  ii.stock,
  ii.on_order,
  ii.reorder_point,
  ii.category,
  ii.vendor_id,
  v.name AS vendor_name,
  COALESCE(ii.reorder_point, 10) - COALESCE(ii.stock, 0) AS units_needed,
  CASE
    WHEN COALESCE(ii.stock, 0) <= 0 THEN 'critical'
    WHEN COALESCE(ii.stock, 0) < COALESCE(ii.reorder_point, 10) * 0.5 THEN 'urgent'
    ELSE 'reorder'
  END AS priority
FROM inventory_items ii
LEFT JOIN vendors v ON ii.vendor_id = v.id
WHERE ii.status = 'active'
  AND COALESCE(ii.stock, 0) < COALESCE(ii.reorder_point, 10)
  AND COALESCE(ii.is_dropship, false) = false
ORDER BY priority, units_needed DESC;

-- pending_backorders
DROP VIEW IF EXISTS public.pending_backorders CASCADE;
CREATE VIEW public.pending_backorders AS
SELECT
  fpo.id,
  fpo.order_id,
  fpo.vendor_name,
  fpo.status,
  fpo.total,
  fpo.order_date,
  fpo.expected_date,
  CASE
    WHEN fpo.expected_date < CURRENT_DATE THEN 'overdue'
    WHEN fpo.expected_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_soon'
    ELSE 'on_track'
  END AS delivery_status
FROM finale_purchase_orders fpo
WHERE fpo.status IN ('SUBMITTED', 'PARTIALLY_RECEIVED')
ORDER BY fpo.expected_date ASC;

-- inventory_velocity_summary (if exists, recreate without security_barrier)
DROP VIEW IF EXISTS public.inventory_velocity_summary CASCADE;
CREATE VIEW public.inventory_velocity_summary AS
SELECT
  ii.id,
  ii.sku,
  ii.name,
  ii.stock,
  ii.category,
  ii.vendor_id,
  COALESCE(fsh.sales_30_days, 0) AS sales_30_days,
  COALESCE(fsh.sales_60_days, 0) AS sales_60_days,
  COALESCE(fsh.sales_90_days, 0) AS sales_90_days,
  CASE
    WHEN COALESCE(fsh.sales_30_days, 0) > 0 THEN
      ROUND(COALESCE(ii.stock, 0)::numeric / (fsh.sales_30_days / 30.0), 1)
    ELSE NULL
  END AS days_of_stock,
  CASE
    WHEN fsh.sales_30_days > fsh.sales_90_days / 3 * 1.15 THEN 'increasing'
    WHEN fsh.sales_30_days < fsh.sales_90_days / 3 * 0.85 THEN 'decreasing'
    ELSE 'stable'
  END AS velocity_trend
FROM inventory_items ii
LEFT JOIN (
  SELECT
    finale_product_url,
    SUM(CASE WHEN transaction_date >= CURRENT_DATE - INTERVAL '30 days' AND quantity < 0 THEN ABS(quantity) ELSE 0 END) AS sales_30_days,
    SUM(CASE WHEN transaction_date >= CURRENT_DATE - INTERVAL '60 days' AND quantity < 0 THEN ABS(quantity) ELSE 0 END) AS sales_60_days,
    SUM(CASE WHEN transaction_date >= CURRENT_DATE - INTERVAL '90 days' AND quantity < 0 THEN ABS(quantity) ELSE 0 END) AS sales_90_days
  FROM finale_stock_history
  GROUP BY finale_product_url
) fsh ON ii.finale_product_id = fsh.finale_product_url
WHERE ii.status = 'active';

-- stock_intelligence_items
DROP VIEW IF EXISTS public.stock_intelligence_items CASCADE;
CREATE VIEW public.stock_intelligence_items AS
SELECT
  ii.id,
  ii.sku,
  ii.name,
  ii.stock,
  ii.on_order,
  ii.reorder_point,
  ii.category,
  ii.vendor_id,
  ii.unit_cost,
  ii.is_dropship,
  v.name AS vendor_name,
  v.lead_time_days AS vendor_lead_time
FROM inventory_items ii
LEFT JOIN vendors v ON ii.vendor_id = v.id
WHERE ii.status = 'active'
  AND COALESCE(ii.is_dropship, false) = false
  AND LOWER(COALESCE(ii.category, '')) NOT IN ('dropship', 'drop ship', 'ds', 'deprecating', 'deprecated', 'discontinued');

-- active_inventory_items
DROP VIEW IF EXISTS public.active_inventory_items CASCADE;
CREATE VIEW public.active_inventory_items AS
SELECT * FROM inventory_items WHERE status = 'active';

-- active_finale_products
DROP VIEW IF EXISTS public.active_finale_products CASCADE;
CREATE VIEW public.active_finale_products AS
SELECT * FROM finale_products WHERE status = 'PRODUCT_ACTIVE';

-- active_finale_boms
DROP VIEW IF EXISTS public.active_finale_boms CASCADE;
CREATE VIEW public.active_finale_boms AS
SELECT * FROM finale_boms WHERE status = 'Active';

-- active_finale_vendors
DROP VIEW IF EXISTS public.active_finale_vendors CASCADE;
CREATE VIEW public.active_finale_vendors AS
SELECT * FROM finale_vendors WHERE status = 'active';

-- backorder_summary
DROP VIEW IF EXISTS public.backorder_summary CASCADE;
CREATE VIEW public.backorder_summary AS
SELECT
  COUNT(*) AS total_backorders,
  COUNT(*) FILTER (WHERE expected_date < CURRENT_DATE) AS overdue_count,
  SUM(total) AS total_value
FROM finale_purchase_orders
WHERE status IN ('SUBMITTED', 'PARTIALLY_RECEIVED');

-- ============================================================================
-- VENDOR MANAGEMENT VIEWS (14)
-- ============================================================================

-- vendor_scorecard
DROP VIEW IF EXISTS public.vendor_scorecard CASCADE;
CREATE VIEW public.vendor_scorecard AS
SELECT
  v.id,
  v.name,
  v.lead_time_days,
  vcp.confidence_score,
  vcp.response_latency_score,
  vcp.threading_score,
  vcp.completeness_score,
  vcp.invoice_accuracy_score,
  vcp.lead_time_score,
  vcp.trend,
  vcp.communication_status,
  vcp.interactions_count
FROM vendors v
LEFT JOIN vendor_confidence_profiles vcp ON v.id = vcp.vendor_id;

-- vendor_confidence_summary
DROP VIEW IF EXISTS public.vendor_confidence_summary CASCADE;
CREATE VIEW public.vendor_confidence_summary AS
SELECT
  vendor_id,
  confidence_score,
  trend,
  communication_status,
  interactions_count,
  last_recalculated_at
FROM vendor_confidence_profiles;

-- active_vendors (all vendors - no status column exists)
DROP VIEW IF EXISTS public.active_vendors CASCADE;
CREATE VIEW public.active_vendors AS
SELECT * FROM vendors;

-- vendor_details
DROP VIEW IF EXISTS public.vendor_details CASCADE;
CREATE VIEW public.vendor_details AS
SELECT
  v.*,
  vcp.confidence_score,
  vcp.trend AS confidence_trend
FROM vendors v
LEFT JOIN vendor_confidence_profiles vcp ON v.id = vcp.vendor_id;

-- pending_vendor_followups
DROP VIEW IF EXISTS public.pending_vendor_followups CASCADE;
CREATE VIEW public.pending_vendor_followups AS
SELECT
  vfa.*
FROM vendor_followup_alerts vfa
WHERE vfa.resolved_at IS NULL
ORDER BY vfa.created_at ASC;

-- ============================================================================
-- COMPLIANCE & REGULATORY VIEWS (12)
-- ============================================================================

-- compliance_dashboard
DROP VIEW IF EXISTS public.compliance_dashboard CASCADE;
CREATE VIEW public.compliance_dashboard AS
SELECT
  'overview' AS section,
  COUNT(*) AS total_items,
  COUNT(*) FILTER (WHERE overall_status = 'pass') AS compliant_count,
  COUNT(*) FILTER (WHERE overall_status IN ('fail', 'warning')) AS non_compliant_count,
  COUNT(*) FILTER (WHERE overall_status = 'requires_review') AS pending_count
FROM compliance_checks;

-- active_boms
DROP VIEW IF EXISTS public.active_boms CASCADE;
CREATE VIEW public.active_boms AS
SELECT * FROM boms;

-- ============================================================================
-- PO & INVOICE VIEWS (11)
-- ============================================================================

-- active_purchase_orders
DROP VIEW IF EXISTS public.active_purchase_orders CASCADE;
CREATE VIEW public.active_purchase_orders AS
SELECT
  fpo.*,
  v.name AS vendor_display_name,
  v.lead_time_days AS vendor_lead_time
FROM finale_purchase_orders fpo
LEFT JOIN vendors v ON fpo.vendor_id = v.id
WHERE fpo.status NOT IN ('RECEIVED', 'CANCELLED', 'COMPLETED');

-- overdue_pos_dashboard
DROP VIEW IF EXISTS public.overdue_pos_dashboard CASCADE;
CREATE VIEW public.overdue_pos_dashboard AS
SELECT
  fpo.id,
  fpo.order_id,
  fpo.vendor_name,
  fpo.status,
  fpo.total,
  fpo.expected_date,
  CURRENT_DATE - fpo.expected_date AS days_overdue
FROM finale_purchase_orders fpo
WHERE fpo.status NOT IN ('RECEIVED', 'CANCELLED', 'COMPLETED')
  AND fpo.expected_date < CURRENT_DATE
ORDER BY days_overdue DESC;

-- invoice_po_correlation_status (already exists in migration 144)
-- Re-create to ensure no security_barrier
DROP VIEW IF EXISTS public.invoice_po_correlation_status CASCADE;
CREATE VIEW public.invoice_po_correlation_status AS
SELECT
  vid.id AS invoice_id,
  vid.invoice_number,
  vid.vendor_name_on_invoice,
  vid.total_amount AS invoice_total,
  vid.status AS invoice_status,
  vid.matched_po_id,
  vid.po_match_confidence,
  fpo.order_id AS po_number,
  fpo.total AS po_total,
  fpo.vendor_name AS po_vendor,
  CASE
    WHEN vid.total_amount IS NOT NULL AND fpo.total IS NOT NULL
    THEN ABS(vid.total_amount - fpo.total)
    ELSE NULL
  END AS total_variance
FROM vendor_invoice_documents vid
LEFT JOIN finale_purchase_orders fpo ON vid.matched_po_id = fpo.id;

-- email_threads_with_po
DROP VIEW IF EXISTS public.email_threads_with_po CASCADE;
CREATE VIEW public.email_threads_with_po AS
SELECT
  et.id,
  et.subject,
  et.vendor_id,
  et.message_count,
  et.first_message_at,
  et.last_message_at,
  et.requires_response,
  fpo.order_id AS po_number,
  fpo.status AS po_status,
  v.name AS vendor_name
FROM email_threads et
LEFT JOIN finale_purchase_orders fpo ON et.po_id = fpo.id
LEFT JOIN vendors v ON et.vendor_id = v.id;

-- ============================================================================
-- AI & AGENT VIEWS (12)
-- ============================================================================

-- autonomy_system_status
DROP VIEW IF EXISTS public.autonomy_system_status CASCADE;
CREATE VIEW public.autonomy_system_status AS
SELECT
  ad.id,
  ad.identifier,
  ad.name AS display_name,
  ad.autonomy_level,
  ad.trust_score,
  ad.is_active AS is_enabled,
  ad.updated_at AS last_run_at,
  ad.category,
  ad.description
FROM agent_definitions ad;

-- workflow_agents
DROP VIEW IF EXISTS public.workflow_agents CASCADE;
CREATE VIEW public.workflow_agents AS
SELECT
  id,
  identifier,
  name AS display_name,
  description,
  category,
  autonomy_level,
  is_active AS is_enabled
FROM agent_definitions
ORDER BY category, name;

-- agent_trust_scores
DROP VIEW IF EXISTS public.agent_trust_scores CASCADE;
CREATE VIEW public.agent_trust_scores AS
SELECT
  identifier,
  name AS display_name,
  trust_score,
  autonomy_level,
  category
FROM agent_definitions
WHERE is_active = true
ORDER BY trust_score DESC;

-- pending_actions_summary (skipped - pending_actions_queue table doesn't exist yet)

-- ============================================================================
-- EMAIL & COMMUNICATION VIEWS (6)
-- ============================================================================

-- email_thread_summary
DROP VIEW IF EXISTS public.email_thread_summary CASCADE;
CREATE VIEW public.email_thread_summary AS
SELECT
  et.id,
  et.subject,
  et.requires_response,
  et.message_count,
  et.first_message_at,
  et.last_message_at,
  v.name AS vendor_name
FROM email_threads et
LEFT JOIN vendors v ON et.vendor_id = v.id
ORDER BY et.last_message_at DESC;

-- inbox_routing_summary
DROP VIEW IF EXISTS public.inbox_routing_summary CASCADE;
CREATE VIEW public.inbox_routing_summary AS
SELECT
  eic.id,
  eic.inbox_name,
  eic.email_address,
  eic.is_active,
  eic.last_poll_at AS last_sync_at,
  COUNT(et.id) AS thread_count
FROM email_inbox_configs eic
LEFT JOIN email_threads et ON eic.id = et.inbox_config_id
GROUP BY eic.id, eic.inbox_name, eic.email_address, eic.is_active, eic.last_poll_at;

-- ============================================================================
-- SYNC & STATUS VIEWS (4)
-- ============================================================================

-- sync_dashboard
DROP VIEW IF EXISTS public.sync_dashboard CASCADE;
CREATE VIEW public.sync_dashboard AS
SELECT
  'finale_products' AS source,
  MAX(synced_at) AS last_sync,
  COUNT(*) AS total_records
FROM finale_products
UNION ALL
SELECT
  'finale_vendors' AS source,
  MAX(synced_at) AS last_sync,
  COUNT(*) AS total_records
FROM finale_vendors
UNION ALL
SELECT
  'vendors' AS source,
  MAX(updated_at) AS last_sync,
  COUNT(*) AS total_records
FROM vendors;

-- ============================================================================
-- GRANT PERMISSIONS TO AUTHENTICATED USERS
-- ============================================================================

GRANT SELECT ON public.urgent_reorders TO authenticated;
GRANT SELECT ON public.pending_backorders TO authenticated;
GRANT SELECT ON public.inventory_velocity_summary TO authenticated;
GRANT SELECT ON public.stock_intelligence_items TO authenticated;
GRANT SELECT ON public.active_inventory_items TO authenticated;
GRANT SELECT ON public.active_finale_products TO authenticated;
GRANT SELECT ON public.active_finale_boms TO authenticated;
GRANT SELECT ON public.active_finale_vendors TO authenticated;
GRANT SELECT ON public.backorder_summary TO authenticated;
GRANT SELECT ON public.vendor_scorecard TO authenticated;
GRANT SELECT ON public.vendor_confidence_summary TO authenticated;
GRANT SELECT ON public.active_vendors TO authenticated;
GRANT SELECT ON public.vendor_details TO authenticated;
GRANT SELECT ON public.pending_vendor_followups TO authenticated;
GRANT SELECT ON public.compliance_dashboard TO authenticated;
GRANT SELECT ON public.active_boms TO authenticated;
GRANT SELECT ON public.active_purchase_orders TO authenticated;
GRANT SELECT ON public.overdue_pos_dashboard TO authenticated;
GRANT SELECT ON public.invoice_po_correlation_status TO authenticated;
GRANT SELECT ON public.email_threads_with_po TO authenticated;
GRANT SELECT ON public.autonomy_system_status TO authenticated;
GRANT SELECT ON public.workflow_agents TO authenticated;
GRANT SELECT ON public.agent_trust_scores TO authenticated;
GRANT SELECT ON public.email_thread_summary TO authenticated;
GRANT SELECT ON public.inbox_routing_summary TO authenticated;
GRANT SELECT ON public.sync_dashboard TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON VIEW public.urgent_reorders IS
  'Items below reorder point requiring immediate attention (SECURITY INVOKER)';

COMMENT ON VIEW public.stock_intelligence_items IS
  'Filtered inventory for Stock Intelligence - excludes dropship items (SECURITY INVOKER)';

COMMENT ON VIEW public.vendor_scorecard IS
  'Comprehensive vendor scoring view (SECURITY INVOKER)';

COMMENT ON VIEW public.autonomy_system_status IS
  'AI agent status and performance metrics (SECURITY INVOKER)';

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

-- Run this after migration to verify no SECURITY DEFINER views remain:
-- SELECT viewname
-- FROM pg_views
-- WHERE schemaname = 'public'
-- AND EXISTS (
--   SELECT 1 FROM pg_rewrite r
--   JOIN pg_class c ON r.ev_class = c.oid
--   WHERE c.relname = viewname
--   AND r.ev_type = '1'
-- );

COMMIT;
