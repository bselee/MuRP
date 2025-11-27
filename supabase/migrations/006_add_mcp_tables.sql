-- Migration: Add MCP (Model Context Protocol) and Settings Tables
-- Description: Creates tables for MCP server configuration, compliance tracking, scraping, and app settings
-- Date: 2025-11-13

-- =============================================================================
-- 1. APP SETTINGS TABLE
-- =============================================================================
-- Stores application-wide configuration settings (AI providers, semantic search, etc.)
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_category TEXT NOT NULL, -- 'ai', 'api', 'semantic_search', 'general'
  setting_value JSONB NOT NULL,
  display_name TEXT,
  description TEXT,
  is_sensitive BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_app_settings_category ON app_settings(setting_category);

-- =============================================================================
-- 2. MCP SERVER CONFIGURATIONS TABLE
-- =============================================================================
-- Stores MCP server connection details and tool configurations
CREATE TABLE IF NOT EXISTS mcp_server_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_name TEXT NOT NULL UNIQUE,
  server_type TEXT NOT NULL DEFAULT 'compliance', -- 'compliance', 'custom'
  display_name TEXT NOT NULL,
  is_local BOOLEAN DEFAULT true,
  server_url TEXT NOT NULL,
  api_key TEXT, -- Encrypted API key for MCP server
  anthropic_api_key TEXT, -- For AI-powered compliance checks
  is_enabled BOOLEAN DEFAULT true,
  health_status TEXT DEFAULT 'unknown', -- 'healthy', 'unhealthy', 'unknown'
  last_health_check TIMESTAMPTZ,
  available_tools JSONB, -- Array of tool names/configs
  tool_permissions JSONB, -- Which roles can use which tools
  rate_limit_per_hour INTEGER DEFAULT 1000,
  timeout_seconds INTEGER DEFAULT 30,
  retry_attempts INTEGER DEFAULT 3,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_server_name ON mcp_server_configs(server_name);
CREATE INDEX IF NOT EXISTS idx_mcp_enabled ON mcp_server_configs(is_enabled);

-- =============================================================================
-- 3. USER COMPLIANCE PROFILES TABLE
-- =============================================================================
-- Tracks which users have been onboarded to the MCP compliance system
CREATE TABLE IF NOT EXISTS user_compliance_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  profile_type TEXT NOT NULL DEFAULT 'standard', -- 'standard', 'enhanced', 'enterprise'
  onboarded_at TIMESTAMPTZ DEFAULT NOW(),
  regulatory_sources JSONB DEFAULT '[]'::jsonb, -- Array of states/agencies user has access to
  compliance_level TEXT DEFAULT 'basic', -- 'basic', 'full_ai'
  upgrade_requested_at TIMESTAMPTZ,
  upgraded_at TIMESTAMPTZ,
  last_compliance_check TIMESTAMPTZ,
  total_checks_performed INTEGER DEFAULT 0,
  failed_checks_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Note: No foreign key constraint on user_id because users table doesn't exist
-- user_id will be populated from application code (localStorage/session)
-- If using Supabase Auth, user_id should match auth.users.id (UUID)

-- Add missing columns if table already exists
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'user_compliance_profiles') THEN
    -- Add is_active column if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns 
                   WHERE table_name = 'user_compliance_profiles' AND column_name = 'is_active') THEN
      ALTER TABLE user_compliance_profiles ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_compliance_user ON user_compliance_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_active ON user_compliance_profiles(is_active);

-- =============================================================================
-- 4. MCP TOOL CALLS LOG TABLE
-- =============================================================================
-- Audit log of all MCP tool invocations
CREATE TABLE IF NOT EXISTS mcp_tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_name TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  user_id UUID, -- No FK constraint - users table doesn't exist in migrations
  session_id TEXT,
  input_params JSONB,
  output_result JSONB,
  status TEXT NOT NULL, -- 'success', 'error', 'timeout'
  error_message TEXT,
  execution_time_ms INTEGER,
  tokens_used INTEGER,
  cost_usd DECIMAL(10, 6),
  called_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_calls_server ON mcp_tool_calls(server_name);
CREATE INDEX IF NOT EXISTS idx_mcp_calls_tool ON mcp_tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_mcp_calls_user ON mcp_tool_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_calls_date ON mcp_tool_calls(called_at);

-- =============================================================================
-- 5. SCRAPING CONFIGURATIONS TABLE
-- =============================================================================
-- Stores web scraping configurations for regulatory data sources
CREATE TABLE IF NOT EXISTS scraping_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_name TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL,
  selectors JSONB NOT NULL, -- CSS selectors for data extraction
  rate_limit_ms INTEGER DEFAULT 1000,
  user_agent TEXT,
  headers JSONB,
  is_enabled BOOLEAN DEFAULT true,
  last_successful_scrape TIMESTAMPTZ,
  total_scrapes INTEGER DEFAULT 0,
  failed_scrapes INTEGER DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraping_config_name ON scraping_configs(config_name);
CREATE INDEX IF NOT EXISTS idx_scraping_enabled ON scraping_configs(is_enabled);

-- =============================================================================
-- 6. SCRAPING JOBS TABLE
-- =============================================================================
-- Tracks individual scraping job executions
CREATE TABLE IF NOT EXISTS scraping_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES scraping_configs(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL, -- 'manual', 'scheduled', 'on_demand'
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  scraped_data JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  triggered_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraping_jobs_config ON scraping_jobs(config_id);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_status ON scraping_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_date ON scraping_jobs(created_at);

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_app_settings_updated_at ON app_settings;
CREATE TRIGGER update_app_settings_updated_at BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_mcp_server_configs_updated_at ON mcp_server_configs;
CREATE TRIGGER update_mcp_server_configs_updated_at BEFORE UPDATE ON mcp_server_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_compliance_profiles_updated_at ON user_compliance_profiles;
CREATE TRIGGER update_user_compliance_profiles_updated_at BEFORE UPDATE ON user_compliance_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scraping_configs_updated_at ON scraping_configs;
CREATE TRIGGER update_scraping_configs_updated_at BEFORE UPDATE ON scraping_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scraping_jobs_updated_at ON scraping_jobs;
CREATE TRIGGER update_scraping_jobs_updated_at BEFORE UPDATE ON scraping_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SEED DATA
-- =============================================================================
-- Insert default MCP server configuration
INSERT INTO mcp_server_configs (
  server_name,
  display_name,
  server_type,
  is_local,
  server_url,
  is_enabled,
  available_tools,
  tool_permissions
) VALUES (
  'compliance_mcp',
  'Compliance MCP Server',
  'compliance',
  true,
  'http://localhost:8000',
  false, -- Disabled by default until Admin configures it
  '["onboard_user", "add_regulatory_source", "basic_compliance_check", "extract_label_text", "full_ai_compliance_check", "scrape_state_regulation", "upgrade_to_full_ai", "get_compliance_summary"]'::jsonb,
  '{"admin": ["*"], "manager": ["basic_compliance_check", "get_compliance_summary"], "user": ["basic_compliance_check"]}'::jsonb
) ON CONFLICT (server_name) DO NOTHING;

-- Insert default app settings
INSERT INTO app_settings (setting_key, setting_category, setting_value, display_name, description) VALUES
  ('ai_provider_config', 'ai', '{"provider": "gemini", "model": "gemini-1.5-flash", "temperature": 0.7, "maxTokens": 2000}'::jsonb, 'AI Provider Configuration', 'Active AI provider and model settings'),
  ('semantic_search_enabled', 'semantic_search', '{"enabled": true, "embedding_model": "text-embedding-3-small", "similarity_threshold": 0.7}'::jsonb, 'Semantic Search Settings', 'Vector search configuration for inventory and BOMs')
ON CONFLICT (setting_key) DO NOTHING;

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE app_settings IS 'Application-wide configuration settings';
COMMENT ON TABLE mcp_server_configs IS 'MCP (Model Context Protocol) server connection and tool configurations';
COMMENT ON TABLE user_compliance_profiles IS 'User compliance onboarding and access tracking';
COMMENT ON TABLE mcp_tool_calls IS 'Audit log of all MCP tool invocations';
COMMENT ON TABLE scraping_configs IS 'Web scraping configurations for regulatory data sources';
COMMENT ON TABLE scraping_jobs IS 'Individual scraping job execution tracking';

-- ============================================================================
-- BEGIN COMPLIANCE RECORDS MIGRATION (merged from former 006a)
-- ============================================================================

-- Migration: Create Compliance Records Table
-- Description: Comprehensive tracking of state registrations, certifications, and compliance
-- Author: MuRP Team
-- Date: 2025-11-06
-- Phase: 1.4 - Core Infrastructure

-- ============================================================================
-- Compliance Records Table
-- ============================================================================
-- Stores all compliance-related records: state registrations, certifications, EPA, OMRI, etc.
-- Tracks expiration dates, renewal alerts, and compliance status

CREATE TABLE IF NOT EXISTS compliance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Associations
  bom_id UUID NOT NULL,                      -- Always linked to a BOM
  label_id UUID,                             -- Optional link to label
  -- Foreign keys will be added after tables exist

  -- Compliance type and category
  compliance_type TEXT NOT NULL,             -- 'state_registration', 'organic_cert', 'omri', 'epa', 'custom'
  category TEXT,                             -- Additional categorization: 'fertilizer', 'pesticide', 'soil_amendment'

  -- Registration/certification details
  issuing_authority TEXT,                    -- "State of California", "OMRI", "EPA", etc.
  state_code TEXT,                           -- For state registrations: "CA", "OR", "WA", etc.
  state_name TEXT,                           -- "California", "Oregon", "Washington"
  registration_number TEXT NOT NULL,         -- The actual registration/certification number
  license_number TEXT,                       -- Some states have separate license numbers

  -- Important dates
  registered_date DATE,                      -- When initially registered/certified
  effective_date DATE,                       -- When registration becomes effective
  expiration_date DATE,                      -- When it expires
  renewal_date DATE,                         -- Renewal deadline (may differ from expiration)
  last_renewed_date DATE,                    -- Last renewal date

  -- Status tracking
  status TEXT DEFAULT 'current',             -- 'current', 'due_soon', 'urgent', 'expired', 'pending', 'suspended', 'cancelled'
  days_until_expiration INTEGER,             -- Calculated field, updated by trigger

  -- Financial information
  registration_fee NUMERIC(10, 2),
  renewal_fee NUMERIC(10, 2),
  late_fee NUMERIC(10, 2),
  currency TEXT DEFAULT 'USD',
  payment_status TEXT,                       -- 'paid', 'pending', 'overdue'

  -- Documents and certificates
  certificate_url TEXT,                      -- PDF of registration certificate
  certificate_file_name TEXT,
  certificate_file_size BIGINT,
  additional_documents JSONB,
  /*
    Example:
    [
      {
        "name": "Label Approval Letter",
        "url": "https://...",
        "uploadedAt": "2025-11-06T10:00:00Z"
      }
    ]
  */

  -- Alert tracking
  due_soon_alert_sent BOOLEAN DEFAULT false,     -- 90-day alert
  urgent_alert_sent BOOLEAN DEFAULT false,       -- 30-day alert
  expiration_alert_sent BOOLEAN DEFAULT false,   -- Expired alert
  alert_email_addresses TEXT[],                  -- Who to notify

  -- Requirements and conditions
  requirements TEXT,                         -- What's required to maintain compliance
  restrictions TEXT,                         -- Any restrictions or limitations
  conditions JSONB,                          -- Structured conditions
  /*
    Example:
    {
      "annualReportRequired": true,
      "reportDueDate": "2026-03-31",
      "inspectionRequired": false,
      "labelApprovalRequired": true
    }
  */

  -- Contact information at issuing authority
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  authority_website TEXT,

  -- Internal tracking
  assigned_to UUID,                          -- References users(id) - who's responsible
  priority TEXT DEFAULT 'normal',            -- 'low', 'normal', 'high', 'critical'
  notes TEXT,
  internal_notes TEXT,                       -- Private notes not shared in exports

  -- Audit trail
  created_by UUID,                           -- References users(id)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ,             -- When someone last verified this is still valid
  last_verified_by UUID                      -- References users(id)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

CREATE INDEX idx_compliance_bom_id ON compliance_records(bom_id);
CREATE INDEX idx_compliance_label_id ON compliance_records(label_id) WHERE label_id IS NOT NULL;
CREATE INDEX idx_compliance_type ON compliance_records(compliance_type);
CREATE INDEX idx_compliance_status ON compliance_records(status);
CREATE INDEX idx_compliance_state_code ON compliance_records(state_code) WHERE state_code IS NOT NULL;
CREATE INDEX idx_compliance_expiration_date ON compliance_records(expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX idx_compliance_renewal_date ON compliance_records(renewal_date) WHERE renewal_date IS NOT NULL;
CREATE INDEX idx_compliance_registration_number ON compliance_records(registration_number);
CREATE INDEX idx_compliance_assigned_to ON compliance_records(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_compliance_priority ON compliance_records(priority);
CREATE INDEX idx_compliance_created_at ON compliance_records(created_at DESC);

-- GIN index for JSONB fields
CREATE INDEX idx_compliance_conditions ON compliance_records USING GIN (conditions);
CREATE INDEX idx_compliance_additional_docs ON compliance_records USING GIN (additional_documents);

-- Composite indexes for common queries
CREATE INDEX idx_compliance_expiring_soon ON compliance_records(status, expiration_date)
  WHERE status IN ('due_soon', 'urgent');

-- ============================================================================
-- Constraints
-- ============================================================================

ALTER TABLE compliance_records ADD CONSTRAINT compliance_type_check
  CHECK (compliance_type IN ('state_registration', 'organic_cert', 'omri', 'epa', 'wsda', 'cdfa', 'custom'));

ALTER TABLE compliance_records ADD CONSTRAINT compliance_status_check
  CHECK (status IN ('current', 'due_soon', 'urgent', 'expired', 'pending', 'suspended', 'cancelled', 'renewed'));

ALTER TABLE compliance_records ADD CONSTRAINT compliance_priority_check
  CHECK (priority IN ('low', 'normal', 'high', 'critical'));

ALTER TABLE compliance_records ADD CONSTRAINT compliance_payment_status_check
  CHECK (payment_status IS NULL OR payment_status IN ('paid', 'pending', 'overdue'));

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE compliance_records ENABLE ROW LEVEL SECURITY;

-- Users can view all compliance records (within their organization)
CREATE POLICY compliance_select_policy ON compliance_records
  FOR SELECT
  TO authenticated
  USING (true);  -- Adjust for multi-tenant

-- Users can create compliance records
CREATE POLICY compliance_insert_policy ON compliance_records
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

-- Users can update compliance records
CREATE POLICY compliance_update_policy ON compliance_records
  FOR UPDATE
  TO authenticated
  USING (true);  -- Adjust based on your needs (e.g., only assigned_to can update)

-- Users can delete compliance records they created
CREATE POLICY compliance_delete_policy ON compliance_records
  FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at timestamp and calculate days_until_expiration
CREATE OR REPLACE FUNCTION update_compliance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();

  -- Calculate days until expiration
  IF NEW.expiration_date IS NOT NULL THEN
    NEW.days_until_expiration = (NEW.expiration_date - CURRENT_DATE);

    -- Auto-update status based on days until expiration
    IF NEW.days_until_expiration < 0 THEN
      NEW.status = 'expired';
    ELSIF NEW.days_until_expiration <= 30 THEN
      NEW.status = 'urgent';
    ELSIF NEW.days_until_expiration <= 90 THEN
      NEW.status = 'due_soon';
    ELSIF NEW.status NOT IN ('pending', 'suspended', 'cancelled') THEN
      NEW.status = 'current';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_compliance_updated_at
  BEFORE UPDATE ON compliance_records
  FOR EACH ROW
  EXECUTE FUNCTION update_compliance_updated_at();

-- Trigger on insert to calculate initial days_until_expiration
CREATE TRIGGER trigger_compliance_insert
  BEFORE INSERT ON compliance_records
  FOR EACH ROW
  EXECUTE FUNCTION update_compliance_updated_at();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to get all compliance records for a BOM
CREATE OR REPLACE FUNCTION get_compliance_by_bom(p_bom_id UUID)
RETURNS TABLE (
  id UUID,
  compliance_type TEXT,
  state_name TEXT,
  registration_number TEXT,
  status TEXT,
  expiration_date DATE,
  days_until_expiration INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.id,
    cr.compliance_type,
    cr.state_name,
    cr.registration_number,
    cr.status,
    cr.expiration_date,
    cr.days_until_expiration
  FROM compliance_records cr
  WHERE cr.bom_id = p_bom_id
  ORDER BY cr.expiration_date ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get upcoming renewals (within N days)
CREATE OR REPLACE FUNCTION get_upcoming_renewals(p_days_ahead INTEGER DEFAULT 90)
RETURNS TABLE (
  id UUID,
  bom_id UUID,
  compliance_type TEXT,
  state_name TEXT,
  registration_number TEXT,
  expiration_date DATE,
  days_until_expiration INTEGER,
  status TEXT,
  assigned_to UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.id,
    cr.bom_id,
    cr.compliance_type,
    cr.state_name,
    cr.registration_number,
    cr.expiration_date,
    cr.days_until_expiration,
    cr.status,
    cr.assigned_to
  FROM compliance_records cr
  WHERE cr.expiration_date IS NOT NULL
    AND cr.days_until_expiration <= p_days_ahead
    AND cr.days_until_expiration >= 0
    AND cr.status NOT IN ('expired', 'cancelled', 'suspended')
  ORDER BY cr.days_until_expiration ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get expired compliance records
CREATE OR REPLACE FUNCTION get_expired_compliance()
RETURNS TABLE (
  id UUID,
  bom_id UUID,
  compliance_type TEXT,
  state_name TEXT,
  registration_number TEXT,
  expiration_date DATE,
  days_overdue INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.id,
    cr.bom_id,
    cr.compliance_type,
    cr.state_name,
    cr.registration_number,
    cr.expiration_date,
    ABS(cr.days_until_expiration) AS days_overdue
  FROM compliance_records cr
  WHERE cr.status = 'expired'
  ORDER BY cr.expiration_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update compliance status (run as scheduled job)
CREATE OR REPLACE FUNCTION update_all_compliance_statuses()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE compliance_records
  SET
    days_until_expiration = (expiration_date - CURRENT_DATE),
    status = CASE
      WHEN (expiration_date - CURRENT_DATE) < 0 THEN 'expired'
      WHEN (expiration_date - CURRENT_DATE) <= 30 THEN 'urgent'
      WHEN (expiration_date - CURRENT_DATE) <= 90 THEN 'due_soon'
      WHEN status NOT IN ('pending', 'suspended', 'cancelled') THEN 'current'
      ELSE status
    END,
    updated_at = NOW()
  WHERE expiration_date IS NOT NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE compliance_records IS 'Comprehensive tracking of state registrations, certifications, and compliance records';
COMMENT ON COLUMN compliance_records.compliance_type IS 'Type: state_registration, organic_cert, omri, epa, wsda, cdfa, custom';
COMMENT ON COLUMN compliance_records.status IS 'Status: current, due_soon (90d), urgent (30d), expired, pending, suspended, cancelled';
COMMENT ON COLUMN compliance_records.days_until_expiration IS 'Auto-calculated days until expiration (negative if expired)';
COMMENT ON FUNCTION update_all_compliance_statuses() IS 'Run daily to update all compliance statuses based on expiration dates';

-- ============================================================================
-- Grants
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON compliance_records TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
