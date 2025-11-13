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

CREATE INDEX idx_app_settings_key ON app_settings(setting_key);
CREATE INDEX idx_app_settings_category ON app_settings(setting_category);

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

CREATE INDEX idx_mcp_server_name ON mcp_server_configs(server_name);
CREATE INDEX idx_mcp_enabled ON mcp_server_configs(is_enabled);

-- =============================================================================
-- 3. USER COMPLIANCE PROFILES TABLE
-- =============================================================================
-- Tracks which users have been onboarded to the MCP compliance system
CREATE TABLE IF NOT EXISTS user_compliance_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

CREATE INDEX idx_compliance_user ON user_compliance_profiles(user_id);
CREATE INDEX idx_compliance_active ON user_compliance_profiles(is_active);

-- =============================================================================
-- 4. MCP TOOL CALLS LOG TABLE
-- =============================================================================
-- Audit log of all MCP tool invocations
CREATE TABLE IF NOT EXISTS mcp_tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_name TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
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

CREATE INDEX idx_mcp_calls_server ON mcp_tool_calls(server_name);
CREATE INDEX idx_mcp_calls_tool ON mcp_tool_calls(tool_name);
CREATE INDEX idx_mcp_calls_user ON mcp_tool_calls(user_id);
CREATE INDEX idx_mcp_calls_date ON mcp_tool_calls(called_at);

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

CREATE INDEX idx_scraping_config_name ON scraping_configs(config_name);
CREATE INDEX idx_scraping_enabled ON scraping_configs(is_enabled);

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

CREATE INDEX idx_scraping_jobs_config ON scraping_jobs(config_id);
CREATE INDEX idx_scraping_jobs_status ON scraping_jobs(status);
CREATE INDEX idx_scraping_jobs_date ON scraping_jobs(created_at);

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

CREATE TRIGGER update_app_settings_updated_at BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mcp_server_configs_updated_at BEFORE UPDATE ON mcp_server_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_compliance_profiles_updated_at BEFORE UPDATE ON user_compliance_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scraping_configs_updated_at BEFORE UPDATE ON scraping_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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
