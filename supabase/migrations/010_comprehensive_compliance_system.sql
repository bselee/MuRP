-- ============================================================================
-- Migration 010: Comprehensive Compliance System
-- Purpose: App settings, AI provider config, MCP control, state strictness ratings
-- ============================================================================

-- ============================================================================
-- PART 1: APP SETTINGS & AI PROVIDER MANAGEMENT
-- ============================================================================

-- App Settings Table
-- Stores all application-wide configuration including AI provider selection
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Setting identification
  setting_key TEXT NOT NULL UNIQUE,
  setting_category TEXT NOT NULL, -- 'ai_provider', 'mcp_server', 'compliance', 'general'
  
  -- Setting value (flexible JSONB for any config type)
  setting_value JSONB NOT NULL,
  
  -- Display metadata
  display_name TEXT NOT NULL,
  description TEXT,
  
  -- Validation
  is_secret BOOLEAN DEFAULT FALSE, -- API keys, sensitive data
  is_required BOOLEAN DEFAULT FALSE,
  validation_schema JSONB, -- JSON Schema for validation
  
  -- Access control
  editable_by TEXT[] DEFAULT ARRAY['admin'], -- Roles that can edit
  visible_to TEXT[] DEFAULT ARRAY['admin', 'user'], -- Roles that can view
  
  -- Audit trail
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT,
  
  -- Change history
  previous_value JSONB,
  change_reason TEXT
);

CREATE INDEX idx_app_settings_category ON app_settings(setting_category);
CREATE INDEX idx_app_settings_key ON app_settings(setting_key);

-- ============================================================================
-- PART 2: MCP SERVER MANAGEMENT
-- ============================================================================

-- MCP Server Configurations
CREATE TABLE IF NOT EXISTS mcp_server_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Server identification
  server_name TEXT NOT NULL UNIQUE,
  server_type TEXT NOT NULL, -- 'compliance', 'scraping', 'analysis', 'custom'
  display_name TEXT NOT NULL,
  description TEXT,
  
  -- Connection details
  endpoint_url TEXT, -- For remote MCP servers
  is_local BOOLEAN DEFAULT TRUE,
  command TEXT, -- Start command for local servers
  working_directory TEXT,
  
  -- Configuration
  environment_vars JSONB, -- Environment variables as key-value pairs
  settings JSONB, -- Server-specific settings
  
  -- AI Provider override (if different from app default)
  override_ai_provider BOOLEAN DEFAULT FALSE,
  ai_provider_config JSONB, -- AIProviderConfig if override_ai_provider is true
  
  -- Status
  is_enabled BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'stopped', -- 'running', 'stopped', 'error', 'starting'
  last_health_check TIMESTAMP WITH TIME ZONE,
  health_status TEXT, -- 'healthy', 'degraded', 'unhealthy'
  error_message TEXT,
  
  -- Usage stats
  total_requests INTEGER DEFAULT 0,
  successful_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  average_response_time_ms FLOAT,
  
  -- Scheduling
  auto_start BOOLEAN DEFAULT FALSE,
  restart_on_failure BOOLEAN DEFAULT TRUE,
  max_restart_attempts INTEGER DEFAULT 3,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT
);

CREATE INDEX idx_mcp_configs_server_type ON mcp_server_configs(server_type);
CREATE INDEX idx_mcp_configs_enabled ON mcp_server_configs(is_enabled);
CREATE INDEX idx_mcp_configs_status ON mcp_server_configs(status);

-- MCP Tool Calls (audit log)
CREATE TABLE IF NOT EXISTS mcp_tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tool identification
  server_name TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  
  -- Request
  arguments JSONB NOT NULL,
  called_by TEXT, -- User ID or system
  context TEXT, -- What triggered this call
  
  -- Execution
  status TEXT NOT NULL, -- 'success', 'error', 'timeout'
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  
  -- Response
  result JSONB,
  error_message TEXT,
  error_stack TEXT,
  
  -- AI usage tracking
  ai_provider TEXT,
  ai_model TEXT,
  ai_tokens_used INTEGER DEFAULT 0,
  ai_cost_usd FLOAT DEFAULT 0,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_mcp_tool_calls_server ON mcp_tool_calls(server_name);
CREATE INDEX idx_mcp_tool_calls_tool ON mcp_tool_calls(tool_name);
CREATE INDEX idx_mcp_tool_calls_status ON mcp_tool_calls(status);
CREATE INDEX idx_mcp_tool_calls_created ON mcp_tool_calls(created_at DESC);
CREATE INDEX idx_mcp_tool_calls_called_by ON mcp_tool_calls(called_by);

-- ============================================================================
-- PART 3: GENERIC WEB SCRAPING SYSTEM
-- ============================================================================

-- Scraping Configurations (not state-specific, works with any .gov site)
CREATE TABLE IF NOT EXISTS scraping_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Config identification
  config_name TEXT NOT NULL UNIQUE,
  description TEXT,
  
  -- Target
  base_url TEXT NOT NULL,
  url_pattern TEXT, -- URL template with placeholders
  domain TEXT, -- For grouping/filtering
  
  -- Scraping rules
  selectors JSONB NOT NULL, -- CSS/XPath selectors for data extraction
  pagination JSONB, -- Pagination rules
  
  rate_limit_ms INTEGER DEFAULT 1000, -- Delay between requests
  user_agent TEXT DEFAULT 'MuRP Compliance Bot/1.0',
  
  -- Data processing
  data_transformations JSONB, -- Post-processing rules
  required_keywords TEXT[], -- Keywords that must appear for valid extraction
  exclude_patterns TEXT[], -- Patterns to filter out
  
  -- AI enhancement
  use_ai_extraction BOOLEAN DEFAULT FALSE,
  ai_extraction_prompt TEXT, -- Prompt template for AI-based extraction
  
  -- Validation
  min_content_length INTEGER DEFAULT 100,
  validate_json_schema JSONB, -- Expected data structure
  
  -- Storage
  save_to_table TEXT, -- Table name to save results
  field_mappings JSONB, -- Map scraped fields to table columns
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMP WITH TIME ZONE,
  last_success_at TIMESTAMP WITH TIME ZONE,
  success_rate FLOAT,
  
  -- Scheduling
  schedule_cron TEXT, -- Cron expression for automatic runs
  next_run_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT
);

CREATE INDEX idx_scraping_configs_active ON scraping_configs(is_active);
CREATE INDEX idx_scraping_configs_domain ON scraping_configs(domain);
CREATE INDEX idx_scraping_configs_next_run ON scraping_configs(next_run_at);

-- Scraping Jobs (execution tracking)
CREATE TABLE IF NOT EXISTS scraping_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Job details
  config_id UUID REFERENCES scraping_configs(id),
  job_type TEXT NOT NULL, -- 'manual', 'scheduled', 'triggered'
  
  -- Target
  url TEXT NOT NULL,
  parameters JSONB, -- URL parameters or dynamic values
  
  -- Execution
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed', 'cancelled'
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  
  -- Results
  items_found INTEGER DEFAULT 0,
  items_saved INTEGER DEFAULT 0,
  items_skipped INTEGER DEFAULT 0,
  
  raw_data JSONB, -- Raw scraped data
  processed_data JSONB, -- After transformations
  validation_errors JSONB[], -- Any validation issues
  
  -- AI usage
  ai_calls_made INTEGER DEFAULT 0,
  ai_tokens_used INTEGER DEFAULT 0,
  ai_cost_usd FLOAT DEFAULT 0,
  
  -- Error handling
  error_message TEXT,
  error_details JSONB,
  retry_count INTEGER DEFAULT 0,
  
  -- Scheduling context
  scheduled_by TEXT,
  triggered_by TEXT, -- User ID or system event
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_scraping_jobs_config ON scraping_jobs(config_id);
CREATE INDEX idx_scraping_jobs_status ON scraping_jobs(status);
CREATE INDEX idx_scraping_jobs_created ON scraping_jobs(created_at DESC);

-- ============================================================================
-- PART 4: STATE STRICTNESS RATINGS & COMPREHENSIVE COMPLIANCE
-- ============================================================================

-- State Compliance Profiles Table
-- Tracks regulatory strictness and requirements by state (1-10 scale)
CREATE TABLE IF NOT EXISTS state_compliance_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- State identification
  state_code TEXT NOT NULL UNIQUE, -- Two-letter code (e.g., 'CA', 'OR')
  state_name TEXT NOT NULL,
  region TEXT, -- 'west', 'northeast', 'midwest', 'south'
  
  -- Strictness ratings (1-10 scale, 10 being strictest)
  overall_strictness INTEGER NOT NULL, -- Overall regulatory burden
  organic_strictness INTEGER, -- Organic product regulations
  fertilizer_strictness INTEGER, -- Fertilizer regulations
  labeling_strictness INTEGER, -- Labeling requirements
  testing_strictness INTEGER, -- Testing/certification requirements
  registration_strictness INTEGER, -- Product registration burden
  
  -- Key characteristics
  requires_registration BOOLEAN DEFAULT FALSE,
  registration_fee_range TEXT, -- e.g., "$50-$500"
  requires_testing BOOLEAN DEFAULT FALSE,
  testing_frequency TEXT, -- 'annual', 'biennial', 'per_product'
  requires_certification BOOLEAN DEFAULT FALSE,
  
  -- Important agencies
  primary_agency TEXT NOT NULL,
  primary_agency_url TEXT,
  agency_contact_email TEXT,
  agency_contact_phone TEXT,
  
  -- Regulation update frequency
  regulation_update_frequency TEXT, -- 'monthly', 'quarterly', 'annual'
  last_major_update DATE,
  next_expected_update DATE,
  
  -- Enforcement
  enforcement_level TEXT, -- 'strict', 'moderate', 'lenient'
  typical_penalty_range TEXT, -- e.g., "$500-$10,000"
  enforcement_notes TEXT,
  
  -- Key requirements summary
  key_labeling_requirements TEXT[],
  prohibited_claims TEXT[],
  special_warnings_required TEXT[],
  unique_requirements TEXT, -- State-specific quirks
  
  -- Industry-specific notes
  organic_notes TEXT,
  fertilizer_notes TEXT,
  soil_amendment_notes TEXT,
  
  -- Metadata
  data_completeness INTEGER DEFAULT 0, -- 0-100% how complete our data is
  last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_verified_by TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_state_profiles_strictness ON state_compliance_profiles(overall_strictness DESC);
CREATE INDEX idx_state_profiles_region ON state_compliance_profiles(region);
CREATE INDEX idx_state_profiles_code ON state_compliance_profiles(state_code);

-- State Compliance Updates Table
CREATE TABLE IF NOT EXISTS state_compliance_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code TEXT NOT NULL REFERENCES state_compliance_profiles(state_code),
  
  -- Update details
  update_type TEXT NOT NULL, -- 'major_revision', 'minor_update', 'clarification', 'new_requirement'
  effective_date DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  
  -- Impact assessment
  severity TEXT NOT NULL, -- 'critical', 'high', 'medium', 'low'
  affects_industries TEXT[], -- Which industries are affected
  requires_action BOOLEAN DEFAULT FALSE,
  action_deadline DATE,
  
  -- Resources
  official_notice_url TEXT,
  guidance_document_url TEXT,
  
  -- Notification tracking
  users_notified INTEGER DEFAULT 0,
  notification_sent_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_state_updates_state ON state_compliance_updates(state_code);
CREATE INDEX idx_state_updates_effective ON state_compliance_updates(effective_date);
CREATE INDEX idx_state_updates_severity ON state_compliance_updates(severity);

-- Multi-State Compliance Reports Table
CREATE TABLE IF NOT EXISTS multi_state_compliance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Report metadata
  report_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  product_id TEXT,
  bom_id TEXT,
  
  -- States checked
  states_included TEXT[] NOT NULL,
  strictest_state TEXT, -- Which state has the strictest requirements
  
  -- Overall assessment
  overall_compliance_status TEXT NOT NULL, -- 'compliant', 'needs_attention', 'non_compliant'
  total_issues_found INTEGER DEFAULT 0,
  critical_issues INTEGER DEFAULT 0,
  high_priority_issues INTEGER DEFAULT 0,
  
  -- State-by-state results
  state_results JSONB NOT NULL,
  
  -- Required actions
  required_changes JSONB[],
  estimated_compliance_cost TEXT,
  estimated_timeline TEXT,
  
  -- Report generation
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  generated_by TEXT, -- 'ai' or user_id
  ai_model_used TEXT,
  
  -- Review tracking
  reviewed BOOLEAN DEFAULT FALSE,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by TEXT,
  
  -- Expiration
  expires_at TIMESTAMP WITH TIME ZONE -- Reports expire after regulations change
);

CREATE INDEX idx_multi_state_reports_user ON multi_state_compliance_reports(user_id);
CREATE INDEX idx_multi_state_reports_status ON multi_state_compliance_reports(overall_compliance_status);
CREATE INDEX idx_multi_state_reports_date ON multi_state_compliance_reports(generated_at DESC);

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Seed AI Provider Configuration (Gemini as default per user request)
INSERT INTO app_settings (setting_key, setting_category, setting_value, display_name, description, is_secret, is_required) VALUES
(
  'ai_provider_config',
  'ai_provider',
  jsonb_build_object(
    'provider', 'gemini',
    'model', 'gemini-2.0-flash-exp',
    'temperature', 0.3,
    'maxTokens', 4096,
    'apiKey', ''
  ),
  'AI Provider Configuration',
  'Global AI provider settings for the entire application. Change provider here to switch between Gemini, OpenAI, Anthropic, or Azure. Gemini is the default.',
  true,
  true
),
(
  'compliance_check_defaults',
  'compliance',
  jsonb_build_object(
    'autoCheckOnUpload', false,
    'defaultStates', ARRAY['CA', 'OR', 'WA', 'CO'],
    'defaultCategories', ARRAY['labeling', 'ingredients', 'claims'],
    'minConfidenceScore', 0.7,
    'alertThreshold', 'medium'
  ),
  'Compliance Check Defaults',
  'Default settings for compliance checks',
  false,
  false
),
(
  'scraping_defaults',
  'mcp_server',
  jsonb_build_object(
    'rateLimitMs', 1000,
    'maxRetries', 3,
    'timeout', 30000,
    'respectRobotsTxt', true,
    'userAgent', 'MuRP Compliance Bot/1.0'
  ),
  'Scraping Defaults',
  'Default settings for web scraping operations',
  false,
  false
);

-- Seed MCP Server Configuration
INSERT INTO mcp_server_configs (server_name, server_type, display_name, description, is_local, command, working_directory, settings, auto_start) VALUES
(
  'compliance_scraper',
  'compliance',
  'Compliance Regulation Scraper',
  'Main MCP server for scraping and analyzing regulatory compliance data across all states',
  true,
  'python src/server_python.py',
  '/workspaces/MuRP/mcp-server',
  jsonb_build_object(
    'maxConcurrentJobs', 5,
    'logLevel', 'info',
    'enableCache', true,
    'cacheExpiryHours', 24
  ),
  false
);

-- Seed Generic Scraping Configurations (works with ANY .gov site)
INSERT INTO scraping_configs (config_name, description, base_url, url_pattern, domain, selectors, rate_limit_ms, required_keywords, use_ai_extraction, ai_extraction_prompt, save_to_table, is_active) VALUES
(
  'generic_gov_scraper',
  'Generic .gov Website Scraper - works with any government site',
  '',
  '{url}',
  '',
  jsonb_build_object(
    'title', 'h1, h2, title',
    'content', 'main, article, div.content, div.main-content, div.body-content',
    'metadata', 'meta',
    'regulationCode', 'span.regulation-number, div.code-cite'
  ),
  1000,
  ARRAY[],
  true,
  'Extract regulatory information from this government webpage. Identify: regulation titles, requirement text, citation numbers, effective dates, and agency contact information. Return structured JSON matching state_regulations table schema.',
  'state_regulations',
  true
),
(
  'cdfa_fertilizer_regulations',
  'California Department of Food and Agriculture - Fertilizer Regulations',
  'https://www.cdfa.ca.gov',
  'https://www.cdfa.ca.gov/is/ffldrs/{section}',
  'cdfa.ca.gov',
  jsonb_build_object(
    'title', 'h1, h2.page-title',
    'content', 'div.content, article.main-content',
    'lastUpdated', 'span.last-modified, time'
  ),
  1500,
  ARRAY['fertilizer', 'registration', 'requirement', 'label'],
  true,
  'Extract fertilizer registration requirements from this California state webpage. Focus on: registration requirements, labeling rules, guaranteed analysis format, prohibited substances, and fee schedules.',
  'state_regulations',
  true
),
(
  'usda_organic_standards',
  'USDA National Organic Program Standards',
  'https://www.ams.usda.gov',
  'https://www.ams.usda.gov/rules-regulations/organic',
  'ams.usda.gov',
  jsonb_build_object(
    'title', 'h1.page-title',
    'content', 'div.field-body, div.content-area',
    'regulationCode', 'span.regulation-number'
  ),
  2000,
  ARRAY['organic', 'NOP', 'certification', 'prohibited'],
  true,
  'Extract USDA National Organic Program (NOP) requirements. Focus on: prohibited substances, labeling requirements, certification rules, and allowed materials.',
  'state_regulations',
  true
);

-- Seed State Strictness Profiles (Top 20 states sorted by strictness)
INSERT INTO state_compliance_profiles (
  state_code, state_name, region,
  overall_strictness, organic_strictness, fertilizer_strictness, 
  labeling_strictness, testing_strictness, registration_strictness,
  requires_registration, requires_testing, requires_certification,
  primary_agency, primary_agency_url,
  enforcement_level, key_labeling_requirements
) VALUES
-- Tier 1: Strictest (9-10)
('CA', 'California', 'west', 10, 10, 10, 10, 9, 10, true, true, true,
  'California Department of Food and Agriculture (CDFA)', 'https://www.cdfa.ca.gov/', 'strict',
  ARRAY['Prop 65 warnings if applicable', 'Guaranteed analysis in specific format', 'Registration number must be displayed', 'Net weight in metric and imperial', 'OMRI number required for organic claims', 'Heavy metal test results required']),

('OR', 'Oregon', 'west', 9, 9, 9, 9, 8, 9, true, true, true,
  'Oregon Department of Agriculture (ODA)', 'https://www.oregon.gov/oda', 'strict',
  ARRAY['State registration number required', 'Guaranteed analysis format specific', 'Organic certification number', 'Net weight declaration', 'Ingredient disclosure requirements']),

('WA', 'Washington', 'west', 9, 9, 9, 9, 8, 9, true, true, true,
  'Washington State Department of Agriculture (WSDA)', 'https://agr.wa.gov/', 'strict',
  ARRAY['Product registration required', 'Guaranteed analysis required', 'Brand name registration', 'Net weight in pounds/kg', 'Organic certification disclosure']),

('NY', 'New York', 'northeast', 9, 8, 9, 9, 8, 9, true, true, false,
  'New York State Department of Agriculture and Markets', 'https://agriculture.ny.gov/', 'strict',
  ARRAY['Registration required for fertilizers', 'Guaranteed analysis mandatory', 'Net weight requirements', 'Heavy metal limits enforced', 'Organic certification must be verifiable']),

-- Tier 2: Very Strict (7-8)
('MA', 'Massachusetts', 'northeast', 8, 8, 8, 8, 7, 8, true, true, false,
  'Massachusetts Department of Agricultural Resources', 'https://www.mass.gov/orgs/department-of-agricultural-resources', 'strict',
  ARRAY['Product registration required', 'Guaranteed analysis format', 'Net weight declaration', 'Organic claims must be certified']),

('CT', 'Connecticut', 'northeast', 8, 8, 8, 8, 7, 8, true, true, false,
  'Connecticut Department of Consumer Protection', 'https://portal.ct.gov/DCP', 'strict',
  ARRAY['Registration for commercial fertilizers', 'Guaranteed analysis required', 'Label approval needed', 'Heavy metal testing']),

('VT', 'Vermont', 'northeast', 8, 9, 7, 8, 7, 7, true, true, true,
  'Vermont Agency of Agriculture', 'https://agriculture.vermont.gov/', 'moderate',
  ARRAY['Organic certification highly regulated', 'Registration required', 'Environmental claims scrutinized', 'Local sourcing encouraged']),

('CO', 'Colorado', 'west', 8, 9, 8, 8, 7, 8, true, true, true,
  'Colorado Department of Agriculture', 'https://ag.colorado.gov/', 'moderate',
  ARRAY['Registration required for fertilizers', 'OMRI certification for organic', 'Guaranteed analysis format', 'Cannabis-related restrictions']),

('HI', 'Hawaii', 'west', 8, 8, 8, 8, 8, 8, true, true, false,
  'Hawaii Department of Agriculture', 'https://hdoa.hawaii.gov/', 'strict',
  ARRAY['Import restrictions', 'Quarantine requirements', 'Registration required', 'Environmental protection focus']),

-- Tier 3: Moderately Strict (5-6)
('TX', 'Texas', 'south', 6, 5, 7, 6, 5, 6, true, false, false,
  'Texas Department of Agriculture', 'https://www.texasagriculture.gov/', 'moderate',
  ARRAY['Registration for commercial products', 'Guaranteed analysis required', 'Net weight declaration', 'Organic certification optional']),

('FL', 'Florida', 'south', 6, 5, 7, 6, 6, 7, true, true, false,
  'Florida Department of Agriculture and Consumer Services', 'https://www.fdacs.gov/', 'moderate',
  ARRAY['Registration required', 'Guaranteed analysis format', 'Heavy metal testing for biosolids', 'Net weight requirements']),

('NC', 'North Carolina', 'south', 6, 6, 6, 6, 6, 6, true, false, false,
  'North Carolina Department of Agriculture', 'https://www.ncagr.gov/', 'moderate',
  ARRAY['Registration for fertilizers', 'Guaranteed analysis', 'Brand name requirements', 'Net weight display']),

('IL', 'Illinois', 'midwest', 6, 6, 6, 6, 5, 6, true, false, false,
  'Illinois Department of Agriculture', 'https://www2.illinois.gov/sites/agr', 'moderate',
  ARRAY['Registration required', 'Guaranteed analysis', 'License for distributors', 'Net weight declaration']),

('MI', 'Michigan', 'midwest', 6, 6, 7, 6, 6, 6, true, false, false,
  'Michigan Department of Agriculture and Rural Development', 'https://www.michigan.gov/mdard', 'moderate',
  ARRAY['Registration for commercial fertilizers', 'Guaranteed analysis required', 'Net weight in pounds', 'Organic certification recognized']),

('PA', 'Pennsylvania', 'northeast', 6, 6, 6, 6, 6, 6, true, false, false,
  'Pennsylvania Department of Agriculture', 'https://www.agriculture.pa.gov/', 'moderate',
  ARRAY['Registration required', 'Guaranteed analysis format', 'Net weight requirements', 'Organic standards followed']),

-- Tier 4: Less Strict (3-5)
('GA', 'Georgia', 'south', 5, 5, 5, 5, 4, 5, true, false, false,
  'Georgia Department of Agriculture', 'https://agr.georgia.gov/', 'lenient',
  ARRAY['Registration for commercial products', 'Basic guaranteed analysis', 'Net weight required', 'Minimal organic oversight']),

('OH', 'Ohio', 'midwest', 5, 5, 6, 5, 5, 6, true, false, false,
  'Ohio Department of Agriculture', 'https://agri.ohio.gov/', 'moderate',
  ARRAY['Registration required', 'Guaranteed analysis', 'Standard labeling rules', 'Net weight display']),

('AZ', 'Arizona', 'west', 5, 5, 5, 5, 4, 5, true, false, false,
  'Arizona Department of Agriculture', 'https://agriculture.az.gov/', 'lenient',
  ARRAY['Registration for fertilizers', 'Basic labeling requirements', 'Net weight declaration', 'Minimal testing requirements']),

('WI', 'Wisconsin', 'midwest', 5, 6, 5, 5, 5, 5, true, false, false,
  'Wisconsin Department of Agriculture', 'https://datcp.wi.gov/', 'moderate',
  ARRAY['Registration required', 'Guaranteed analysis', 'Organic certification optional', 'Standard net weight rules']),

('MN', 'Minnesota', 'midwest', 5, 6, 5, 5, 5, 5, true, false, false,
  'Minnesota Department of Agriculture', 'https://www.mda.state.mn.us/', 'moderate',
  ARRAY['Registration required', 'Guaranteed analysis format', 'Organic certification recognized', 'Net weight requirements']);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_server_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE state_compliance_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE state_compliance_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_state_compliance_reports ENABLE ROW LEVEL SECURITY;

-- App Settings Policies
CREATE POLICY "Allow read non-secret settings" ON app_settings
  FOR SELECT USING (
    auth.role() = 'authenticated' AND 
    (NOT is_secret OR auth.jwt() ->> 'role' = 'admin')
  );

CREATE POLICY "Allow admin to manage settings" ON app_settings
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- MCP Server Policies
CREATE POLICY "Allow read mcp_server_configs" ON mcp_server_configs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow admin to manage mcp_server_configs" ON mcp_server_configs
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Scraping Policies
CREATE POLICY "Allow read scraping_configs" ON scraping_configs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow admin to manage scraping_configs" ON scraping_configs
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Allow authenticated to view own jobs" ON scraping_jobs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated to create jobs" ON scraping_jobs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- MCP Tool Calls Policy
CREATE POLICY "Allow read mcp_tool_calls" ON mcp_tool_calls
  FOR SELECT USING (auth.role() = 'authenticated');

-- State Compliance Policies
CREATE POLICY "Anyone can read state profiles" ON state_compliance_profiles
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read state updates" ON state_compliance_updates
  FOR SELECT USING (true);

CREATE POLICY "Users can read their own reports" ON multi_state_compliance_reports
  FOR SELECT USING (auth.uid()::text = user_id OR auth.role() = 'authenticated');

CREATE POLICY "Users can create reports" ON multi_state_compliance_reports
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- ============================================================================
-- COMMENTS & DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE app_settings IS 'Application-wide configuration settings including AI provider selection (Gemini default)';
COMMENT ON TABLE mcp_server_configs IS 'MCP server instance management and configuration';
COMMENT ON TABLE scraping_configs IS 'Generic web scraping configurations for any .gov website';
COMMENT ON TABLE scraping_jobs IS 'Execution tracking for scraping jobs with AI cost tracking';
COMMENT ON TABLE mcp_tool_calls IS 'Audit log of all MCP tool invocations';
COMMENT ON TABLE state_compliance_profiles IS 'Strictness ratings (1-10) and requirements by state';
COMMENT ON TABLE state_compliance_updates IS 'Tracks state regulation updates and changes';
COMMENT ON TABLE multi_state_compliance_reports IS 'Comprehensive multi-state compliance assessments';

COMMENT ON COLUMN app_settings.setting_key IS 'Unique identifier for setting (e.g., ai_provider_config)';
COMMENT ON COLUMN app_settings.is_secret IS 'If true, only admins can view the value (API keys)';
COMMENT ON COLUMN mcp_server_configs.override_ai_provider IS 'If true, this server uses different AI provider than app default';
COMMENT ON COLUMN scraping_configs.use_ai_extraction IS 'If true, uses AI to extract structured data instead of CSS selectors';
COMMENT ON COLUMN state_compliance_profiles.overall_strictness IS 'Overall regulatory burden rating (1-10, 10 being strictest)';
COMMENT ON COLUMN multi_state_compliance_reports.strictest_state IS 'Which state has the most demanding requirements for this product';

