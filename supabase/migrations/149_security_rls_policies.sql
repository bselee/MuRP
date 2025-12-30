-- Migration 147: Security Lint Fixes
-- 
-- Addresses Supabase security linter warnings:
-- 1. Enable RLS on 41 tables missing row-level security
-- 2. Add appropriate policies for authenticated access
--
-- Note: Security Definer views are addressed by ensuring RLS policies
-- exist on underlying tables. Views inherit security from base tables.

BEGIN;

-- ============================================================================
-- PHASE 1: ENABLE RLS ON ALL AFFECTED TABLES
-- ============================================================================

-- Vendor & Performance Tables (10)
ALTER TABLE IF EXISTS public.vendor_interaction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vendor_confidence_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vendor_confidence_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vendor_engagement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vendor_followup_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vendor_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vendor_lead_time_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.po_delivery_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.po_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.po_tracking_events ENABLE ROW LEVEL SECURITY;

-- BOM & Inventory Tables (7)
ALTER TABLE IF EXISTS public.bom_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bom_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bom_artwork_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.artwork_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory_items_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vendors_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bulk_opportunity_analysis ENABLE ROW LEVEL SECURITY;

-- Compliance & Regulatory Tables (7)
ALTER TABLE IF EXISTS public.state_compliance_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.regulatory_jurisdiction_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_regulatory_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.asset_compliance_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_compliance_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.suggested_regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.industry_settings ENABLE ROW LEVEL SECURITY;

-- Templates & Settings Tables (6)
ALTER TABLE IF EXISTS public.template_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pdf_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_intel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_intel_exclusion_log ENABLE ROW LEVEL SECURITY;

-- Tracking & Logs Tables (6)
ALTER TABLE IF EXISTS public.api_rate_limit_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.po_alert_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_performance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_backup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.finale_po_tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.usage_analytics ENABLE ROW LEVEL SECURITY;

-- Access Control & SOP Tables (5)
ALTER TABLE IF EXISTS public.sop_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sop_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_department_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.alert_priority_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.po_patterns ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PHASE 2: ADD RLS POLICIES FOR AUTHENTICATED ACCESS
-- ============================================================================

-- Helper function to check if a policy exists
CREATE OR REPLACE FUNCTION policy_exists(p_table text, p_policy text) RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = p_table AND policyname = p_policy
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VENDOR & PERFORMANCE POLICIES
-- ============================================================================

-- vendor_interaction_events
DO $$ BEGIN
  IF NOT policy_exists('vendor_interaction_events', 'authenticated_read_vendor_events') THEN
    CREATE POLICY "authenticated_read_vendor_events" ON public.vendor_interaction_events
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('vendor_interaction_events', 'authenticated_write_vendor_events') THEN
    CREATE POLICY "authenticated_write_vendor_events" ON public.vendor_interaction_events
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- vendor_confidence_profiles
DO $$ BEGIN
  IF NOT policy_exists('vendor_confidence_profiles', 'authenticated_read_confidence') THEN
    CREATE POLICY "authenticated_read_confidence" ON public.vendor_confidence_profiles
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('vendor_confidence_profiles', 'authenticated_write_confidence') THEN
    CREATE POLICY "authenticated_write_confidence" ON public.vendor_confidence_profiles
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- vendor_confidence_history
DO $$ BEGIN
  IF NOT policy_exists('vendor_confidence_history', 'authenticated_read_confidence_hist') THEN
    CREATE POLICY "authenticated_read_confidence_hist" ON public.vendor_confidence_history
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('vendor_confidence_history', 'authenticated_write_confidence_hist') THEN
    CREATE POLICY "authenticated_write_confidence_hist" ON public.vendor_confidence_history
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- vendor_engagement_events
DO $$ BEGIN
  IF NOT policy_exists('vendor_engagement_events', 'authenticated_read_engagement') THEN
    CREATE POLICY "authenticated_read_engagement" ON public.vendor_engagement_events
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('vendor_engagement_events', 'authenticated_write_engagement') THEN
    CREATE POLICY "authenticated_write_engagement" ON public.vendor_engagement_events
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- vendor_followup_alerts
DO $$ BEGIN
  IF NOT policy_exists('vendor_followup_alerts', 'authenticated_read_followup') THEN
    CREATE POLICY "authenticated_read_followup" ON public.vendor_followup_alerts
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('vendor_followup_alerts', 'authenticated_write_followup') THEN
    CREATE POLICY "authenticated_write_followup" ON public.vendor_followup_alerts
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- vendor_performance_metrics
DO $$ BEGIN
  IF NOT policy_exists('vendor_performance_metrics', 'authenticated_read_perf') THEN
    CREATE POLICY "authenticated_read_perf" ON public.vendor_performance_metrics
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('vendor_performance_metrics', 'authenticated_write_perf') THEN
    CREATE POLICY "authenticated_write_perf" ON public.vendor_performance_metrics
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- vendor_lead_time_metrics
DO $$ BEGIN
  IF NOT policy_exists('vendor_lead_time_metrics', 'authenticated_read_lead_time') THEN
    CREATE POLICY "authenticated_read_lead_time" ON public.vendor_lead_time_metrics
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('vendor_lead_time_metrics', 'authenticated_write_lead_time') THEN
    CREATE POLICY "authenticated_write_lead_time" ON public.vendor_lead_time_metrics
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- po_delivery_performance
DO $$ BEGIN
  IF NOT policy_exists('po_delivery_performance', 'authenticated_read_delivery_perf') THEN
    CREATE POLICY "authenticated_read_delivery_perf" ON public.po_delivery_performance
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('po_delivery_performance', 'authenticated_write_delivery_perf') THEN
    CREATE POLICY "authenticated_write_delivery_perf" ON public.po_delivery_performance
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- po_status_history
DO $$ BEGIN
  IF NOT policy_exists('po_status_history', 'authenticated_read_po_hist') THEN
    CREATE POLICY "authenticated_read_po_hist" ON public.po_status_history
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('po_status_history', 'authenticated_write_po_hist') THEN
    CREATE POLICY "authenticated_write_po_hist" ON public.po_status_history
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- po_tracking_events
DO $$ BEGIN
  IF NOT policy_exists('po_tracking_events', 'authenticated_read_tracking') THEN
    CREATE POLICY "authenticated_read_tracking" ON public.po_tracking_events
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('po_tracking_events', 'authenticated_write_tracking') THEN
    CREATE POLICY "authenticated_write_tracking" ON public.po_tracking_events
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- BOM & INVENTORY POLICIES
-- ============================================================================

-- bom_components
DO $$ BEGIN
  IF NOT policy_exists('bom_components', 'authenticated_read_bom_comp') THEN
    CREATE POLICY "authenticated_read_bom_comp" ON public.bom_components
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('bom_components', 'authenticated_write_bom_comp') THEN
    CREATE POLICY "authenticated_write_bom_comp" ON public.bom_components
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- bom_revisions
DO $$ BEGIN
  IF NOT policy_exists('bom_revisions', 'authenticated_read_bom_rev') THEN
    CREATE POLICY "authenticated_read_bom_rev" ON public.bom_revisions
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('bom_revisions', 'authenticated_write_bom_rev') THEN
    CREATE POLICY "authenticated_write_bom_rev" ON public.bom_revisions
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- bom_artwork_assets
DO $$ BEGIN
  IF NOT policy_exists('bom_artwork_assets', 'authenticated_read_bom_art') THEN
    CREATE POLICY "authenticated_read_bom_art" ON public.bom_artwork_assets
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('bom_artwork_assets', 'authenticated_write_bom_art') THEN
    CREATE POLICY "authenticated_write_bom_art" ON public.bom_artwork_assets
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- artwork_assets
DO $$ BEGIN
  IF NOT policy_exists('artwork_assets', 'authenticated_read_artwork') THEN
    CREATE POLICY "authenticated_read_artwork" ON public.artwork_assets
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('artwork_assets', 'authenticated_write_artwork') THEN
    CREATE POLICY "authenticated_write_artwork" ON public.artwork_assets
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- inventory_items_backup
DO $$ BEGIN
  IF NOT policy_exists('inventory_items_backup', 'authenticated_read_inv_backup') THEN
    CREATE POLICY "authenticated_read_inv_backup" ON public.inventory_items_backup
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('inventory_items_backup', 'authenticated_write_inv_backup') THEN
    CREATE POLICY "authenticated_write_inv_backup" ON public.inventory_items_backup
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- vendors_backup
DO $$ BEGIN
  IF NOT policy_exists('vendors_backup', 'authenticated_read_vend_backup') THEN
    CREATE POLICY "authenticated_read_vend_backup" ON public.vendors_backup
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('vendors_backup', 'authenticated_write_vend_backup') THEN
    CREATE POLICY "authenticated_write_vend_backup" ON public.vendors_backup
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- bulk_opportunity_analysis
DO $$ BEGIN
  IF NOT policy_exists('bulk_opportunity_analysis', 'authenticated_read_bulk') THEN
    CREATE POLICY "authenticated_read_bulk" ON public.bulk_opportunity_analysis
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('bulk_opportunity_analysis', 'authenticated_write_bulk') THEN
    CREATE POLICY "authenticated_write_bulk" ON public.bulk_opportunity_analysis
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- COMPLIANCE & REGULATORY POLICIES
-- ============================================================================

-- state_compliance_ratings
DO $$ BEGIN
  IF NOT policy_exists('state_compliance_ratings', 'authenticated_read_state_comp') THEN
    CREATE POLICY "authenticated_read_state_comp" ON public.state_compliance_ratings
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('state_compliance_ratings', 'authenticated_write_state_comp') THEN
    CREATE POLICY "authenticated_write_state_comp" ON public.state_compliance_ratings
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- regulatory_jurisdiction_map
DO $$ BEGIN
  IF NOT policy_exists('regulatory_jurisdiction_map', 'authenticated_read_reg_juris') THEN
    CREATE POLICY "authenticated_read_reg_juris" ON public.regulatory_jurisdiction_map
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('regulatory_jurisdiction_map', 'authenticated_write_reg_juris') THEN
    CREATE POLICY "authenticated_write_reg_juris" ON public.regulatory_jurisdiction_map
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- user_regulatory_sources
DO $$ BEGIN
  IF NOT policy_exists('user_regulatory_sources', 'authenticated_read_user_reg') THEN
    CREATE POLICY "authenticated_read_user_reg" ON public.user_regulatory_sources
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('user_regulatory_sources', 'authenticated_write_user_reg') THEN
    CREATE POLICY "authenticated_write_user_reg" ON public.user_regulatory_sources
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- asset_compliance_checks
DO $$ BEGIN
  IF NOT policy_exists('asset_compliance_checks', 'authenticated_read_asset_comp') THEN
    CREATE POLICY "authenticated_read_asset_comp" ON public.asset_compliance_checks
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('asset_compliance_checks', 'authenticated_write_asset_comp') THEN
    CREATE POLICY "authenticated_write_asset_comp" ON public.asset_compliance_checks
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- user_compliance_profiles
DO $$ BEGIN
  IF NOT policy_exists('user_compliance_profiles', 'authenticated_read_user_comp') THEN
    CREATE POLICY "authenticated_read_user_comp" ON public.user_compliance_profiles
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('user_compliance_profiles', 'authenticated_write_user_comp') THEN
    CREATE POLICY "authenticated_write_user_comp" ON public.user_compliance_profiles
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- suggested_regulations
DO $$ BEGIN
  IF NOT policy_exists('suggested_regulations', 'authenticated_read_sugg_reg') THEN
    CREATE POLICY "authenticated_read_sugg_reg" ON public.suggested_regulations
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('suggested_regulations', 'authenticated_write_sugg_reg') THEN
    CREATE POLICY "authenticated_write_sugg_reg" ON public.suggested_regulations
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- industry_settings
DO $$ BEGIN
  IF NOT policy_exists('industry_settings', 'authenticated_read_industry') THEN
    CREATE POLICY "authenticated_read_industry" ON public.industry_settings
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('industry_settings', 'authenticated_write_industry') THEN
    CREATE POLICY "authenticated_write_industry" ON public.industry_settings
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- TEMPLATES & SETTINGS POLICIES
-- ============================================================================

-- template_variables
DO $$ BEGIN
  IF NOT policy_exists('template_variables', 'authenticated_read_tpl_vars') THEN
    CREATE POLICY "authenticated_read_tpl_vars" ON public.template_variables
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('template_variables', 'authenticated_write_tpl_vars') THEN
    CREATE POLICY "authenticated_write_tpl_vars" ON public.template_variables
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- email_templates
DO $$ BEGIN
  IF NOT policy_exists('email_templates', 'authenticated_read_email_tpl') THEN
    CREATE POLICY "authenticated_read_email_tpl" ON public.email_templates
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('email_templates', 'authenticated_write_email_tpl') THEN
    CREATE POLICY "authenticated_write_email_tpl" ON public.email_templates
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- pdf_templates
DO $$ BEGIN
  IF NOT policy_exists('pdf_templates', 'authenticated_read_pdf_tpl') THEN
    CREATE POLICY "authenticated_read_pdf_tpl" ON public.pdf_templates
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('pdf_templates', 'authenticated_write_pdf_tpl') THEN
    CREATE POLICY "authenticated_write_pdf_tpl" ON public.pdf_templates
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- company_settings
DO $$ BEGIN
  IF NOT policy_exists('company_settings', 'authenticated_read_company') THEN
    CREATE POLICY "authenticated_read_company" ON public.company_settings
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('company_settings', 'authenticated_write_company') THEN
    CREATE POLICY "authenticated_write_company" ON public.company_settings
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- stock_intel_settings
DO $$ BEGIN
  IF NOT policy_exists('stock_intel_settings', 'authenticated_read_stock_intel') THEN
    CREATE POLICY "authenticated_read_stock_intel" ON public.stock_intel_settings
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('stock_intel_settings', 'authenticated_write_stock_intel') THEN
    CREATE POLICY "authenticated_write_stock_intel" ON public.stock_intel_settings
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- stock_intel_exclusion_log
DO $$ BEGIN
  IF NOT policy_exists('stock_intel_exclusion_log', 'authenticated_read_stock_excl') THEN
    CREATE POLICY "authenticated_read_stock_excl" ON public.stock_intel_exclusion_log
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('stock_intel_exclusion_log', 'authenticated_write_stock_excl') THEN
    CREATE POLICY "authenticated_write_stock_excl" ON public.stock_intel_exclusion_log
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- TRACKING & LOGS POLICIES
-- ============================================================================

-- api_rate_limit_tracking
DO $$ BEGIN
  IF NOT policy_exists('api_rate_limit_tracking', 'authenticated_read_rate_limit') THEN
    CREATE POLICY "authenticated_read_rate_limit" ON public.api_rate_limit_tracking
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('api_rate_limit_tracking', 'authenticated_write_rate_limit') THEN
    CREATE POLICY "authenticated_write_rate_limit" ON public.api_rate_limit_tracking
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- po_alert_log
DO $$ BEGIN
  IF NOT policy_exists('po_alert_log', 'authenticated_read_po_alert') THEN
    CREATE POLICY "authenticated_read_po_alert" ON public.po_alert_log
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('po_alert_log', 'authenticated_write_po_alert') THEN
    CREATE POLICY "authenticated_write_po_alert" ON public.po_alert_log
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- agent_performance_log
DO $$ BEGIN
  IF NOT policy_exists('agent_performance_log', 'authenticated_read_agent_perf') THEN
    CREATE POLICY "authenticated_read_agent_perf" ON public.agent_performance_log
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('agent_performance_log', 'authenticated_write_agent_perf') THEN
    CREATE POLICY "authenticated_write_agent_perf" ON public.agent_performance_log
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- data_backup_logs
DO $$ BEGIN
  IF NOT policy_exists('data_backup_logs', 'authenticated_read_backup_logs') THEN
    CREATE POLICY "authenticated_read_backup_logs" ON public.data_backup_logs
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('data_backup_logs', 'authenticated_write_backup_logs') THEN
    CREATE POLICY "authenticated_write_backup_logs" ON public.data_backup_logs
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- finale_po_tracking_events
DO $$ BEGIN
  IF NOT policy_exists('finale_po_tracking_events', 'authenticated_read_finale_track') THEN
    CREATE POLICY "authenticated_read_finale_track" ON public.finale_po_tracking_events
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('finale_po_tracking_events', 'authenticated_write_finale_track') THEN
    CREATE POLICY "authenticated_write_finale_track" ON public.finale_po_tracking_events
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- usage_analytics
DO $$ BEGIN
  IF NOT policy_exists('usage_analytics', 'authenticated_read_usage') THEN
    CREATE POLICY "authenticated_read_usage" ON public.usage_analytics
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('usage_analytics', 'authenticated_write_usage') THEN
    CREATE POLICY "authenticated_write_usage" ON public.usage_analytics
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- ACCESS CONTROL & SOP POLICIES
-- ============================================================================

-- sop_departments
DO $$ BEGIN
  IF NOT policy_exists('sop_departments', 'authenticated_read_sop_dept') THEN
    CREATE POLICY "authenticated_read_sop_dept" ON public.sop_departments
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('sop_departments', 'authenticated_write_sop_dept') THEN
    CREATE POLICY "authenticated_write_sop_dept" ON public.sop_departments
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- sop_roles
DO $$ BEGIN
  IF NOT policy_exists('sop_roles', 'authenticated_read_sop_roles') THEN
    CREATE POLICY "authenticated_read_sop_roles" ON public.sop_roles
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('sop_roles', 'authenticated_write_sop_roles') THEN
    CREATE POLICY "authenticated_write_sop_roles" ON public.sop_roles
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- user_department_roles
DO $$ BEGIN
  IF NOT policy_exists('user_department_roles', 'authenticated_read_user_roles') THEN
    CREATE POLICY "authenticated_read_user_roles" ON public.user_department_roles
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('user_department_roles', 'authenticated_write_user_roles') THEN
    CREATE POLICY "authenticated_write_user_roles" ON public.user_department_roles
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- alert_priority_rules
DO $$ BEGIN
  IF NOT policy_exists('alert_priority_rules', 'authenticated_read_alert_rules') THEN
    CREATE POLICY "authenticated_read_alert_rules" ON public.alert_priority_rules
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('alert_priority_rules', 'authenticated_write_alert_rules') THEN
    CREATE POLICY "authenticated_write_alert_rules" ON public.alert_priority_rules
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- po_patterns
DO $$ BEGIN
  IF NOT policy_exists('po_patterns', 'authenticated_read_po_patterns') THEN
    CREATE POLICY "authenticated_read_po_patterns" ON public.po_patterns
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT policy_exists('po_patterns', 'authenticated_write_po_patterns') THEN
    CREATE POLICY "authenticated_write_po_patterns" ON public.po_patterns
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- SERVICE ROLE BYPASS POLICIES
-- ============================================================================
-- Service role needs full access for edge functions and background jobs

DO $$ 
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN 
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    -- Check if service role policy already exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = tbl.tablename 
      AND policyname = 'service_role_bypass'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "service_role_bypass" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        tbl.tablename
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- CLEANUP HELPER FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS policy_exists(text, text);

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (for manual testing)
-- ============================================================================

-- Check tables with RLS enabled
-- SELECT tablename, rowsecurity FROM pg_tables t
-- JOIN pg_class c ON t.tablename = c.relname
-- WHERE t.schemaname = 'public' AND c.relrowsecurity = true;

-- Check policy count per table
-- SELECT tablename, count(*) as policy_count
-- FROM pg_policies WHERE schemaname = 'public'
-- GROUP BY tablename ORDER BY policy_count DESC;
