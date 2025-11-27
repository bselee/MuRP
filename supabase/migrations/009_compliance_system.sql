-- ============================================================================
-- Migration 009: Compliance & Regulation Management System
-- Purpose: State-by-state regulations database, compliance checks, and MCP integration
-- ============================================================================

-- State Regulations Table
-- Stores extracted regulatory requirements by state and category
CREATE TABLE IF NOT EXISTS state_regulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Geographic scope
  state TEXT NOT NULL, -- Two-letter state code (e.g., 'CA', 'OR', 'WA')
  state_name TEXT, -- Full state name for display
  
  -- Categorization
  category TEXT NOT NULL, -- 'labeling', 'ingredients', 'claims', 'registration', 'packaging', 'testing'
  subcategory TEXT, -- More specific classification
  
  -- Regulation content
  rule_title TEXT NOT NULL,
  rule_text TEXT NOT NULL, -- Full text of the requirement
  rule_summary TEXT, -- AI-generated brief summary
  
  -- Legal references
  regulation_code TEXT, -- e.g., "CAC Title 16, Section 2300"
  statute_reference TEXT, -- Reference to enabling statute
  
  -- Source tracking
  source_url TEXT NOT NULL, -- Official source URL
  source_type TEXT, -- 'statute', 'regulation', 'guidance', 'faq'
  agency_name TEXT, -- e.g., "California Department of Food and Agriculture"
  agency_contact_email TEXT,
  agency_contact_phone TEXT,
  
  -- Temporal tracking
  effective_date DATE,
  expiration_date DATE,
  last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_verified_by TEXT, -- User ID or system
  
  -- AI extraction metadata
  extraction_method TEXT, -- 'manual', 'mcp_scraper', 'ai_assisted'
  confidence_score FLOAT, -- 0.0-1.0, AI confidence in extraction accuracy
  extraction_prompt_id TEXT, -- Reference to prompt template used
  extraction_model TEXT, -- AI model used (e.g., 'gemini-2.5-flash')
  extraction_notes TEXT, -- Any caveats or uncertainties
  
  -- Search optimization
  keywords TEXT[], -- Searchable keywords for fast filtering
  search_vector tsvector, -- Full-text search vector
  
  -- Status
  status TEXT DEFAULT 'active', -- 'active', 'superseded', 'pending_review', 'archived'
  superseded_by UUID REFERENCES state_regulations(id), -- Link to newer version
  
  -- Audit trail
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT,
  
  -- Indexes for common queries
  CONSTRAINT valid_state_code CHECK (length(state) = 2),
  CONSTRAINT valid_confidence CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

-- Indexes for state_regulations
CREATE INDEX idx_state_regulations_state ON state_regulations(state);
CREATE INDEX idx_state_regulations_category ON state_regulations(category);
CREATE INDEX idx_state_regulations_status ON state_regulations(status);
CREATE INDEX idx_state_regulations_effective_date ON state_regulations(effective_date);
CREATE INDEX idx_state_regulations_keywords ON state_regulations USING GIN(keywords);
CREATE INDEX idx_state_regulations_search ON state_regulations USING GIN(search_vector);

-- Trigger to update search_vector automatically
CREATE OR REPLACE FUNCTION update_state_regulations_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.rule_title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.rule_summary, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.rule_text, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.regulation_code, '')), 'A');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_state_regulations_search
  BEFORE INSERT OR UPDATE ON state_regulations
  FOR EACH ROW
  EXECUTE FUNCTION update_state_regulations_search_vector();

-- Compliance Checks Table
-- Records compliance scans performed on labels/products
CREATE TABLE IF NOT EXISTS compliance_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Associations
  artwork_id UUID, -- References artwork or label
  label_id UUID REFERENCES labels(id),
  bom_id TEXT, -- Product being checked
  
  -- Check parameters
  check_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  states_checked TEXT[] NOT NULL, -- Array of state codes checked
  categories_checked TEXT[], -- Categories of regulations checked
  
  -- Extracted label data (snapshot at time of check)
  extracted_text JSONB, -- Full OCR/vision extraction result
  extracted_claims TEXT[], -- Claims found on label
  extracted_ingredients TEXT[], -- Ingredients found
  extracted_warnings TEXT[], -- Warnings found
  product_name TEXT,
  net_weight TEXT,
  
  -- Compliance results
  overall_status TEXT NOT NULL, -- 'pass', 'warning', 'fail', 'requires_review'
  violations JSONB[], -- Array of violation objects
  warnings JSONB[], -- Array of warning objects
  recommendations JSONB[], -- Array of recommendation objects
  
  -- Violation structure example:
  -- {
  --   "severity": "high",
  --   "state": "CA",
  --   "category": "labeling",
  --   "regulation_id": "uuid",
  --   "issue": "Missing Prop 65 warning",
  --   "regulation_text": "...",
  --   "recommendation": "Add warning label"
  -- }
  
  -- AI analysis
  ai_model_used TEXT,
  ai_confidence_score FLOAT,
  ai_analysis_notes TEXT,
  prompt_template_used TEXT,
  
  -- Manual review
  reviewed_by TEXT, -- User ID
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  review_status TEXT, -- 'pending', 'confirmed', 'disputed', 'resolved'
  
  -- Compliance score
  compliance_score INTEGER, -- 0-100
  risk_level TEXT, -- 'low', 'medium', 'high', 'critical'
  
  -- Follow-up tracking
  action_items JSONB[], -- Array of required actions
  action_items_completed BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by TEXT,
  
  -- Audit trail
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for compliance_checks
CREATE INDEX idx_compliance_checks_artwork ON compliance_checks(artwork_id);
CREATE INDEX idx_compliance_checks_label ON compliance_checks(label_id);
CREATE INDEX idx_compliance_checks_bom ON compliance_checks(bom_id);
CREATE INDEX idx_compliance_checks_status ON compliance_checks(overall_status);
CREATE INDEX idx_compliance_checks_date ON compliance_checks(check_date DESC);
CREATE INDEX idx_compliance_checks_states ON compliance_checks USING GIN(states_checked);

-- Extraction Prompts Table
-- Stores reusable AI prompt templates for regulation extraction and compliance checking
CREATE TABLE IF NOT EXISTS extraction_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Prompt identification
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT NOT NULL, -- 'regulation_extraction', 'compliance_check', 'label_scan'
  
  -- Prompt template
  prompt_template TEXT NOT NULL,
  system_message TEXT, -- Optional system message for chat models
  
  -- Configuration
  target_state TEXT, -- Specific state if applicable
  target_category TEXT, -- Regulation category
  example_urls TEXT[], -- Example sources to search
  search_keywords TEXT[], -- Keywords to guide web search
  
  -- Model settings
  recommended_model TEXT, -- 'gemini-2.5-flash', 'gpt-4', etc.
  temperature FLOAT DEFAULT 0.3,
  max_tokens INTEGER,
  
  -- Quality metrics
  success_rate FLOAT, -- Percentage of successful extractions
  average_confidence FLOAT, -- Average AI confidence score
  last_tested_at TIMESTAMP WITH TIME ZONE,
  test_results JSONB, -- Sample test results
  
  -- Version control
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  supersedes UUID REFERENCES extraction_prompts(id),
  
  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit trail
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for extraction_prompts
CREATE INDEX idx_extraction_prompts_category ON extraction_prompts(category);
CREATE INDEX idx_extraction_prompts_active ON extraction_prompts(is_active);
CREATE INDEX idx_extraction_prompts_state ON extraction_prompts(target_state);

-- Regulation Change Log
-- Tracks updates to regulations for auditing and alerting
CREATE TABLE IF NOT EXISTS regulation_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Change tracking
  regulation_id UUID REFERENCES state_regulations(id),
  change_type TEXT NOT NULL, -- 'created', 'updated', 'superseded', 'archived'
  
  -- Change details
  field_changed TEXT, -- Specific field that changed
  old_value TEXT,
  new_value TEXT,
  
  -- Change detection
  detected_by TEXT, -- 'manual', 'mcp_monitor', 'scheduled_check'
  detection_method TEXT,
  change_summary TEXT,
  
  -- Alert status
  alert_sent BOOLEAN DEFAULT FALSE,
  alert_sent_at TIMESTAMP WITH TIME ZONE,
  alert_recipients TEXT[],
  
  -- User action
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  action_taken TEXT, -- What the user did in response
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_regulation_changes_regulation ON regulation_changes(regulation_id);
CREATE INDEX idx_regulation_changes_date ON regulation_changes(created_at DESC);
CREATE INDEX idx_regulation_changes_alert_sent ON regulation_changes(alert_sent);

-- Regulation Update Jobs Table
-- Tracks scheduled/manual regulation update tasks
CREATE TABLE IF NOT EXISTS regulation_update_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Job parameters
  job_type TEXT NOT NULL, -- 'manual', 'scheduled', 'triggered'
  states_to_update TEXT[], -- Which states to check
  categories_to_update TEXT[], -- Which categories to check
  
  -- Execution
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed', 'cancelled'
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Results
  regulations_found INTEGER DEFAULT 0,
  regulations_updated INTEGER DEFAULT 0,
  regulations_created INTEGER DEFAULT 0,
  changes_detected INTEGER DEFAULT 0,
  
  -- Errors
  error_message TEXT,
  error_details JSONB,
  
  -- MCP integration
  mcp_server_used TEXT, -- Which MCP server executed this
  execution_logs JSONB, -- Detailed logs from MCP execution
  
  -- Scheduling
  scheduled_by TEXT, -- User or system
  schedule_cron TEXT, -- Cron expression if recurring
  next_run_at TIMESTAMP WITH TIME ZONE,
  
  -- Review
  requires_review BOOLEAN DEFAULT TRUE,
  reviewed_by TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  approved_changes JSONB, -- Which detected changes were approved
  
  -- Audit
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_regulation_update_jobs_status ON regulation_update_jobs(status);
CREATE INDEX idx_regulation_update_jobs_next_run ON regulation_update_jobs(next_run_at);

-- Insert starter prompt templates
INSERT INTO extraction_prompts (name, description, category, prompt_template, recommended_model) VALUES
(
  'CA Fertilizer Registration Extractor',
  'Extracts California fertilizer registration requirements from CDFA website',
  'regulation_extraction',
  'You are extracting fertilizer and soil amendment registration requirements for California.
  
Search the California Department of Food and Agriculture (CDFA) Fertilizer Registration website.

Extract the following information:
1. Registration requirements (what products need registration)
2. Required label elements
3. Guaranteed analysis requirements
4. Prohibited ingredients or claims
5. Fee schedules
6. Registration renewal process

For each requirement found:
- Cite the specific regulation code (e.g., FAC Section 14500)
- Include the exact regulatory text
- Note the source URL
- Extract any contact information for the Fertilizer Registration unit

Return results as structured JSON:
{
  "regulations": [
    {
      "rule_title": "...",
      "rule_text": "...",
      "regulation_code": "...",
      "category": "registration|labeling|ingredients",
      "source_url": "...",
      "agency_contact_email": "...",
      "agency_contact_phone": "..."
    }
  ]
}',
  'gemini-2.5-flash'
),
(
  'Label Compliance Checker',
  'Analyzes label text/images against state regulations',
  'compliance_check',
  'You are a compliance expert analyzing a product label for regulatory violations.

**Product Information:**
- Product Name: {{product_name}}
- Net Weight: {{net_weight}}
- Ingredients: {{ingredients}}
- Claims: {{claims}}
- Warnings: {{warnings}}

**States to Check:** {{states}}

**Your Task:**
1. Review the label content against regulations for each specified state
2. Identify any violations, warnings, or recommendations
3. Categorize issues by severity (high, medium, low)
4. Provide specific regulation citations
5. Suggest corrective actions

For each issue found, return:
- Severity: high|medium|low
- State: state code
- Category: labeling|ingredients|claims|registration|packaging
- Issue description
- Regulation citation
- Recommendation

**Format response as JSON:**
{
  "overall_status": "pass|warning|fail",
  "compliance_score": 0-100,
  "violations": [...],
  "warnings": [...],
  "recommendations": [...]
}',
  'gemini-2.5-flash'
);

-- Enable Row Level Security
ALTER TABLE state_regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulation_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulation_update_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow authenticated users to read, admins to write)
CREATE POLICY "Allow read access to state_regulations" ON state_regulations
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert on state_regulations" ON state_regulations
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated update on state_regulations" ON state_regulations
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow read access to compliance_checks" ON compliance_checks
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert on compliance_checks" ON compliance_checks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow read access to extraction_prompts" ON extraction_prompts
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated write on extraction_prompts" ON extraction_prompts
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- TWO-TIER SYSTEM: User Profiles & Industry Intelligence
-- ============================================================================

-- User Compliance Profiles
-- Tracks user subscription tier and preferences
CREATE TABLE IF NOT EXISTS user_compliance_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE, -- Links to your auth system
  email TEXT NOT NULL,
  
  -- Subscription tier
  compliance_tier TEXT NOT NULL DEFAULT 'basic', -- 'basic' (free) or 'full_ai' ($49/mo)
  subscription_status TEXT DEFAULT 'active', -- 'active', 'trial', 'cancelled', 'expired'
  trial_checks_remaining INTEGER DEFAULT 5, -- Free AI checks for trial
  
  -- Industry context
  industry TEXT NOT NULL, -- 'organic_agriculture', 'fertilizer_manufacturing', 'soil_amendments'
  target_states TEXT[] NOT NULL, -- States user sells in ['CA', 'OR', 'WA']
  product_types TEXT[], -- ['soil_amendment', 'fertilizer', 'compost']
  certifications_held TEXT[], -- ['OMRI', 'USDA_Organic', 'State_Registration']
  
  -- Usage tracking
  checks_this_month INTEGER DEFAULT 0,
  last_check_at TIMESTAMP WITH TIME ZONE,
  total_checks_lifetime INTEGER DEFAULT 0,
  
  -- Billing
  stripe_customer_id TEXT,
  subscription_start_date TIMESTAMP WITH TIME ZONE,
  subscription_renewal_date TIMESTAMP WITH TIME ZONE,
  monthly_check_limit INTEGER DEFAULT 50, -- For full_ai tier
  
  -- Onboarding
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_step INTEGER DEFAULT 1,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns if table exists from previous migration
DO $$
BEGIN
  -- Add columns that might be missing from migration 006
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_compliance_profiles' AND column_name = 'compliance_tier') THEN
    ALTER TABLE user_compliance_profiles ADD COLUMN compliance_tier TEXT NOT NULL DEFAULT 'basic';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_compliance_profiles' AND column_name = 'subscription_status') THEN
    ALTER TABLE user_compliance_profiles ADD COLUMN subscription_status TEXT DEFAULT 'active';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_compliance_profiles' AND column_name = 'trial_checks_remaining') THEN
    ALTER TABLE user_compliance_profiles ADD COLUMN trial_checks_remaining INTEGER DEFAULT 5;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_compliance_profiles' AND column_name = 'industry') THEN
    ALTER TABLE user_compliance_profiles ADD COLUMN industry TEXT NOT NULL DEFAULT 'organic_agriculture';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_compliance_profiles' AND column_name = 'target_states') THEN
    ALTER TABLE user_compliance_profiles ADD COLUMN target_states TEXT[] NOT NULL DEFAULT ARRAY['CA'];
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_compliance_profiles' AND column_name = 'product_types') THEN
    ALTER TABLE user_compliance_profiles ADD COLUMN product_types TEXT[];
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_compliance_profiles' AND column_name = 'certifications_held') THEN
    ALTER TABLE user_compliance_profiles ADD COLUMN certifications_held TEXT[];
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_compliance_profiles' AND column_name = 'checks_this_month') THEN
    ALTER TABLE user_compliance_profiles ADD COLUMN checks_this_month INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_compliance_profiles' AND column_name = 'last_check_at') THEN
    ALTER TABLE user_compliance_profiles ADD COLUMN last_check_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_compliance_profiles' AND column_name = 'total_checks_lifetime') THEN
    ALTER TABLE user_compliance_profiles ADD COLUMN total_checks_lifetime INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_compliance_profiles' AND column_name = 'stripe_customer_id') THEN
    ALTER TABLE user_compliance_profiles ADD COLUMN stripe_customer_id TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_compliance_profiles' AND column_name = 'subscription_start_date') THEN
    ALTER TABLE user_compliance_profiles ADD COLUMN subscription_start_date TIMESTAMP WITH TIME ZONE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_compliance_profiles' AND column_name = 'subscription_renewal_date') THEN
    ALTER TABLE user_compliance_profiles ADD COLUMN subscription_renewal_date TIMESTAMP WITH TIME ZONE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_compliance_profiles' AND column_name = 'monthly_check_limit') THEN
    ALTER TABLE user_compliance_profiles ADD COLUMN monthly_check_limit INTEGER DEFAULT 50;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_compliance_profiles' AND column_name = 'onboarding_completed') THEN
    ALTER TABLE user_compliance_profiles ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_compliance_profiles' AND column_name = 'onboarding_step') THEN
    ALTER TABLE user_compliance_profiles ADD COLUMN onboarding_step INTEGER DEFAULT 1;
  END IF;
END $$;

-- Indexes for user_compliance_profiles
CREATE INDEX idx_user_profiles_user_id ON user_compliance_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_tier ON user_compliance_profiles(compliance_tier);
CREATE INDEX idx_user_profiles_industry ON user_compliance_profiles(industry);

-- Industry Settings
-- Pre-configured intelligence for each industry
CREATE TABLE IF NOT EXISTS industry_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  
  -- Product configuration
  default_product_types TEXT[] NOT NULL,
  common_certifications TEXT[] NOT NULL,
  
  -- Compliance focus
  focus_areas TEXT[] NOT NULL, -- Key things to check for this industry
  search_keywords TEXT[] NOT NULL, -- Keywords for finding regulations
  
  -- AI optimization
  industry_prompt_context TEXT NOT NULL, -- Custom context for AI prompts
  example_violations TEXT[], -- Common violations to watch for
  
  -- Display
  icon TEXT, -- Icon name for UI
  description TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed industry settings
INSERT INTO industry_settings (industry, display_name, default_product_types, common_certifications, focus_areas, search_keywords, industry_prompt_context, example_violations) VALUES
(
  'organic_agriculture',
  'Organic Agriculture',
  ARRAY['soil_amendment', 'compost', 'potting_mix', 'growing_media'],
  ARRAY['OMRI', 'USDA_Organic', 'CDFA_Organic'],
  ARRAY['OMRI certification number', 'Organic percentage claims', 'USDA Organic seal usage', 'Prohibited substance list', 'NOP compliance'],
  ARRAY['organic', 'OMRI', 'NOP', 'USDA organic', 'certified organic', 'organic materials'],
  'Focus on OMRI certification requirements, USDA NOP compliance, organic percentage claims accuracy, and prohibited substance restrictions. Check for proper OMRI logo usage and certification number display.',
  ARRAY['Missing OMRI certification number', 'Organic % claim without certification', 'Improper USDA seal placement', 'Using prohibited substances']
),
(
  'fertilizer_manufacturing',
  'Fertilizer Manufacturing', 
  ARRAY['fertilizer', 'plant_food', 'nutrient_blend'],
  ARRAY['State_Registration', 'EPA_Registration'],
  ARRAY['Guaranteed analysis format', 'NPK values', 'State registration numbers', 'Heavy metal limits', 'Micronutrient declarations', 'Net weight'],
  ARRAY['fertilizer', 'NPK', 'guaranteed analysis', 'nitrogen', 'phosphate', 'potash', 'registration'],
  'Focus on guaranteed analysis accuracy and format (N-P-K order), state fertilizer registration numbers, heavy metal content disclosure, proper net weight declaration, and micronutrient claims.',
  ARRAY['Incorrect NPK format', 'Missing state registration', 'Heavy metal limits exceeded', 'Net weight not prominent']
),
(
  'soil_amendments',
  'Soil Amendment Manufacturing',
  ARRAY['soil_amendment', 'soil_conditioner', 'compost', 'biochar', 'humus'],
  ARRAY['State_Registration', 'USDA_Organic', 'Compost_Certification'],
  ARRAY['Material source disclosure', 'Pathogen reduction', 'Heavy metal testing', 'Organic matter content', 'pH range', 'Moisture content'],
  ARRAY['soil amendment', 'compost', 'biochar', 'humus', 'organic matter', 'pathogen reduction'],
  'Focus on material source disclosure, pathogen reduction compliance (especially for compost), heavy metal test results, organic matter percentages, pH ranges, and moisture content declarations.',
  ARRAY['Missing pathogen test results', 'Heavy metals above limits', 'Vague source materials', 'No organic matter %']
);

-- User Regulatory Sources (Basic Mode)
-- Allows users to manage their own regulation links
CREATE TABLE IF NOT EXISTS user_regulatory_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_compliance_profiles(user_id),
  
  -- Source information
  state_code TEXT NOT NULL,
  regulation_type TEXT NOT NULL, -- 'organic', 'fertilizer', 'labeling', 'testing'
  source_url TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_description TEXT,
  
  -- Organization
  tags TEXT[],
  is_favorite BOOLEAN DEFAULT FALSE,
  last_accessed_at TIMESTAMP WITH TIME ZONE,
  
  -- Notes
  user_notes TEXT,
  key_requirements TEXT, -- User's summary of key requirements
  
  -- Metadata
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_sources_user_id ON user_regulatory_sources(user_id);
CREATE INDEX idx_user_sources_state ON user_regulatory_sources(state_code);

-- Compliance Check History (Enhanced)
-- Add tier tracking to existing compliance_checks
ALTER TABLE compliance_checks ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE compliance_checks ADD COLUMN IF NOT EXISTS check_tier TEXT DEFAULT 'full_ai'; -- 'basic' or 'full_ai'
ALTER TABLE compliance_checks ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE compliance_checks ADD COLUMN IF NOT EXISTS product_type TEXT;

CREATE INDEX IF NOT EXISTS idx_compliance_checks_user ON compliance_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_tier ON compliance_checks(check_tier);

-- Usage Analytics
-- Track feature usage for conversion optimization
CREATE TABLE IF NOT EXISTS usage_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_compliance_profiles(user_id),
  
  -- Event tracking
  event_type TEXT NOT NULL, -- 'check_run', 'source_added', 'upgrade_viewed', 'trial_check_used'
  event_data JSONB,
  
  -- Context
  compliance_tier TEXT NOT NULL,
  page_location TEXT,
  
  -- Timing
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_usage_analytics_user ON usage_analytics(user_id);
CREATE INDEX idx_usage_analytics_event ON usage_analytics(event_type);
CREATE INDEX idx_usage_analytics_date ON usage_analytics(created_at DESC);

-- Suggested Regulations (Curated)
-- Pre-populated helpful links for each industry/state combo
CREATE TABLE IF NOT EXISTS suggested_regulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Targeting
  industry TEXT NOT NULL,
  state_code TEXT NOT NULL,
  regulation_type TEXT NOT NULL,
  
  -- Content
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  agency_name TEXT,
  
  -- Relevance
  relevance_score FLOAT DEFAULT 1.0,
  is_official BOOLEAN DEFAULT TRUE,
  
  -- Display
  display_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_suggested_regs_industry ON suggested_regulations(industry);
CREATE INDEX idx_suggested_regs_state ON suggested_regulations(state_code);

-- Seed some suggested regulations
INSERT INTO suggested_regulations (industry, state_code, regulation_type, title, url, description, agency_name) VALUES
('organic_agriculture', 'CA', 'organic', 'California Organic Program', 'https://www.cdfa.ca.gov/is/i_&_c/organic.html', 'State organic certification requirements', 'CDFA'),
('organic_agriculture', 'OR', 'organic', 'Oregon Tilth Organic Certification', 'https://tilth.org/', 'OMRI and organic certification resources', 'Oregon Tilth'),
('fertilizer_manufacturing', 'CA', 'fertilizer', 'California Fertilizer Registration', 'https://www.cdfa.ca.gov/is/ffldrs/', 'Fertilizer product registration requirements', 'CDFA'),
('fertilizer_manufacturing', 'WA', 'fertilizer', 'Washington Fertilizer Regulations', 'https://agr.wa.gov/departments/pesticides-and-fertilizers/fertilizers', 'WA state fertilizer rules', 'WSDA'),
('soil_amendments', 'CA', 'testing', 'California Compost Quality Standards', 'https://www.calrecycle.ca.gov/organics/compostmulch/', 'Pathogen reduction and heavy metal limits', 'CalRecycle');

-- Comments for documentation
COMMENT ON TABLE state_regulations IS 'Stores state-by-state regulatory requirements for product compliance';
COMMENT ON TABLE compliance_checks IS 'Records compliance scans performed on labels and products';
COMMENT ON TABLE extraction_prompts IS 'Reusable AI prompt templates for regulation extraction and compliance checking';
COMMENT ON TABLE regulation_changes IS 'Audit log of regulation updates and changes';
COMMENT ON TABLE regulation_update_jobs IS 'Tracks scheduled and manual regulation update tasks';
COMMENT ON TABLE user_compliance_profiles IS 'User subscription tiers, industry settings, and usage tracking';
COMMENT ON TABLE industry_settings IS 'Pre-configured intelligence for each industry vertical';
COMMENT ON TABLE user_regulatory_sources IS 'User-managed regulatory links (Basic Mode)';
COMMENT ON TABLE usage_analytics IS 'Feature usage tracking for conversion optimization';
COMMENT ON TABLE suggested_regulations IS 'Curated regulation links by industry and state';

COMMENT ON COLUMN state_regulations.confidence_score IS 'AI confidence in extraction accuracy (0.0-1.0)';
COMMENT ON COLUMN state_regulations.search_vector IS 'Full-text search index for fast querying';
COMMENT ON COLUMN compliance_checks.violations IS 'Array of violation objects with severity, state, and recommendations';
COMMENT ON COLUMN compliance_checks.compliance_score IS 'Overall compliance score 0-100';
COMMENT ON COLUMN user_compliance_profiles.compliance_tier IS 'basic (free) or full_ai ($49/mo)';
COMMENT ON COLUMN user_compliance_profiles.trial_checks_remaining IS 'Free AI checks before requiring upgrade';

-- ============================================================================
-- State Compliance Ratings Table
-- Categorizes all US states by regulatory strictness
-- ============================================================================
CREATE TABLE IF NOT EXISTS state_compliance_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state_code TEXT UNIQUE NOT NULL,
    state_name TEXT NOT NULL,
    strictness_level TEXT NOT NULL CHECK (strictness_level IN ('Very Strict', 'Strict', 'Moderate', 'Lenient', 'Very Lenient')),
    strictness_score INTEGER NOT NULL CHECK (strictness_score BETWEEN 1 AND 5),
    key_focus_areas TEXT[] DEFAULT '{}',
    regulatory_agencies TEXT[] DEFAULT '{}',
    registration_required BOOLEAN DEFAULT false,
    labeling_requirements TEXT,
    notes TEXT,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_state_ratings_strictness ON state_compliance_ratings(strictness_score DESC);
CREATE INDEX idx_state_ratings_code ON state_compliance_ratings(state_code);

COMMENT ON TABLE state_compliance_ratings IS 'Categorizes all 50 US states by regulatory strictness for prioritization';
COMMENT ON COLUMN state_compliance_ratings.strictness_score IS '5=Very Strict (CA,OR,WA), 3=Moderate, 1=Very Lenient';

-- Seed all 50 states + DC with compliance ratings
INSERT INTO state_compliance_ratings (state_code, state_name, strictness_level, strictness_score, key_focus_areas, regulatory_agencies, registration_required, labeling_requirements, notes) VALUES
    -- VERY STRICT (Score 5)
    ('CA', 'California', 'Very Strict', 5, 
        ARRAY['Heavy metal testing', 'NPK accuracy', 'Organic certification', 'Ingredient disclosure', 'Pathogen testing'],
        ARRAY['CDFA', 'California EPA', 'County Agricultural Commissioners'],
        true, 'Must display registration number, guaranteed analysis, heavy metal content, pathogen warnings, OMRI number if organic.',
        'Most comprehensive fertilizer regulations in US. Requires annual product registration, quarterly testing, pathogen analysis for organics.'
    ),
    ('OR', 'Oregon', 'Very Strict', 5,
        ARRAY['Compost testing', 'Heavy metals', 'Pathogen analysis', 'Organic claims', 'Source verification'],
        ARRAY['Oregon Department of Agriculture', 'ODA Fertilizer Program'],
        true, 'Registration number required. Detailed ingredient listing. Pathogen and heavy metal test results on file.',
        'Strict compost and organic amendment rules. Requires microbial testing and source documentation.'
    ),
    ('WA', 'Washington', 'Very Strict', 5,
        ARRAY['Heavy metal limits', 'Organic certification', 'Registration', 'Net weight accuracy'],
        ARRAY['Washington State Department of Agriculture', 'WSDA Fertilizer Program'],
        true, 'Must display WSDA registration number, guaranteed analysis, manufacturer info.',
        'Comprehensive fertilizer law. Annual registration, strict organic rules, heavy metal testing required.'
    ),
    -- STRICT (Score 4)
    ('NY', 'New York', 'Strict', 4,
        ARRAY['Product registration', 'Labeling accuracy', 'Heavy metal testing', 'Organic claims'],
        ARRAY['New York State Department of Agriculture and Markets'], true,
        'Registration number, guaranteed analysis, net weight, manufacturer name required.',
        'Requires product registration but less stringent testing than West Coast states.'
    ),
    ('CO', 'Colorado', 'Strict', 4,
        ARRAY['Organic certification', 'OMRI verification', 'Labeling compliance', 'Heavy metals'],
        ARRAY['Colorado Department of Agriculture', 'CDA Plant Industry Division'], true,
        'Must display CDA registration number. OMRI products must show certification number.',
        'Strong organic program. Requires OMRI certification number on labels.'
    ),
    ('TX', 'Texas', 'Strict', 4,
        ARRAY['Product registration', 'Labeling requirements', 'Guaranteed analysis'],
        ARRAY['Texas Department of Agriculture'], true,
        'TDA registration number required. Guaranteed analysis must be accurate.',
        'Robust fertilizer program with annual registration and inspection.'
    ),
    ('FL', 'Florida', 'Strict', 4,
        ARRAY['Registration', 'Labeling', 'Grade accuracy', 'Moisture content'],
        ARRAY['Florida Department of Agriculture and Consumer Services'], true,
        'Registration number, grade, guaranteed analysis, weight required.',
        'Active enforcement program. Important for citrus/agriculture market.'
    ),
    ('MI', 'Michigan', 'Strict', 4,
        ARRAY['Registration', 'Labeling', 'Heavy metals'],
        ARRAY['Michigan Department of Agriculture'], true,
        'Registration number required. Heavy metal content disclosure.',
        'Strong agricultural state with comprehensive fertilizer program.'
    ),
    ('PA', 'Pennsylvania', 'Strict', 4,
        ARRAY['Registration', 'Labeling compliance', 'Organic certification'],
        ARRAY['Pennsylvania Department of Agriculture'], true,
        'Registration number, guaranteed analysis, manufacturer info required.',
        'Active fertilizer enforcement. Important market for organic products.'
    ),
    -- MODERATE (Score 3)
    ('AZ', 'Arizona', 'Moderate', 3, ARRAY['Product registration', 'Labeling'],
        ARRAY['Arizona Department of Agriculture'], true,
        'Registration number and guaranteed analysis required.', 'Standard fertilizer program.'
    ),
    ('CT', 'Connecticut', 'Moderate', 3, ARRAY['Registration', 'Labeling'],
        ARRAY['Connecticut DEEP'], true, 'Standard labeling requirements.', 'Moderate regulations.'
    ),
    ('GA', 'Georgia', 'Moderate', 3, ARRAY['Registration', 'Grade accuracy'],
        ARRAY['Georgia Department of Agriculture'], true, 'Registration and guaranteed analysis.', 'Standard program.'
    ),
    ('IL', 'Illinois', 'Moderate', 3, ARRAY['Registration', 'Labeling'],
        ARRAY['Illinois Department of Agriculture'], true, 'Standard labeling.', 'Standard Midwest program.'
    ),
    ('IN', 'Indiana', 'Moderate', 3, ARRAY['Registration', 'Grade verification'],
        ARRAY['Indiana State Chemist'], true, 'Standard labeling rules.', 'State Chemist oversees program.'
    ),
    ('IA', 'Iowa', 'Moderate', 3, ARRAY['Registration', 'Labeling'],
        ARRAY['Iowa Department of Agriculture'], true, 'Standard requirements.', 'Major agricultural state.'
    ),
    ('KY', 'Kentucky', 'Moderate', 3, ARRAY['Registration', 'Labeling'],
        ARRAY['Kentucky Department of Agriculture'], true, 'Standard labeling.', 'Moderate program.'
    ),
    ('ME', 'Maine', 'Moderate', 3, ARRAY['Registration', 'Environmental standards'],
        ARRAY['Maine Department of Agriculture'], true, 'Standard with environmental focus.', 'Growing organic market.'
    ),
    ('MD', 'Maryland', 'Moderate', 3, ARRAY['Registration', 'Water quality'],
        ARRAY['Maryland Department of Agriculture'], true, 'Standard requirements.', 'Chesapeake Bay focus.'
    ),
    ('MA', 'Massachusetts', 'Moderate', 3, ARRAY['Registration', 'Labeling'],
        ARRAY['Massachusetts MDAR'], true, 'Standard labeling.', 'Moderate program.'
    ),
    ('MN', 'Minnesota', 'Moderate', 3, ARRAY['Registration', 'Grade accuracy'],
        ARRAY['Minnesota Department of Agriculture'], true, 'Standard labeling.', 'Strong agricultural oversight.'
    ),
    ('NV', 'Nevada', 'Moderate', 3, ARRAY['Registration', 'Labeling'],
        ARRAY['Nevada Department of Agriculture'], true, 'Standard requirements.', 'Standard Western program.'
    ),
    ('NH', 'New Hampshire', 'Moderate', 3, ARRAY['Registration', 'Labeling'],
        ARRAY['New Hampshire Department of Agriculture'], true, 'Standard labeling.', 'Moderate program.'
    ),
    ('NJ', 'New Jersey', 'Moderate', 3, ARRAY['Registration', 'Environmental standards'],
        ARRAY['New Jersey Department of Agriculture'], true, 'Standard with environmental focus.', 'Moderate program.'
    ),
    ('NM', 'New Mexico', 'Moderate', 3, ARRAY['Registration', 'Labeling'],
        ARRAY['New Mexico Department of Agriculture'], true, 'Standard requirements.', 'Standard program.'
    ),
    ('NC', 'North Carolina', 'Moderate', 3, ARRAY['Registration', 'Grade verification'],
        ARRAY['North Carolina Department of Agriculture'], true, 'Standard labeling.', 'Active agricultural state.'
    ),
    ('OH', 'Ohio', 'Moderate', 3, ARRAY['Registration', 'Labeling'],
        ARRAY['Ohio Department of Agriculture'], true, 'Standard requirements.', 'Standard Midwest program.'
    ),
    ('OK', 'Oklahoma', 'Moderate', 3, ARRAY['Registration', 'Labeling'],
        ARRAY['Oklahoma Department of Agriculture'], true, 'Standard requirements.', 'Standard program.'
    ),
    ('RI', 'Rhode Island', 'Moderate', 3, ARRAY['Registration', 'Labeling'],
        ARRAY['Rhode Island DEM'], true, 'Standard requirements.', 'Small state program.'
    ),
    ('TN', 'Tennessee', 'Moderate', 3, ARRAY['Registration', 'Labeling'],
        ARRAY['Tennessee Department of Agriculture'], true, 'Standard requirements.', 'Standard program.'
    ),
    ('UT', 'Utah', 'Moderate', 3, ARRAY['Registration', 'Labeling'],
        ARRAY['Utah Department of Agriculture'], true, 'Standard requirements.', 'Standard Western program.'
    ),
    ('VT', 'Vermont', 'Moderate', 3, ARRAY['Registration', 'Organic focus'],
        ARRAY['Vermont Agency of Agriculture'], true, 'Standard labeling.', 'Growing organic market.'
    ),
    ('VA', 'Virginia', 'Moderate', 3, ARRAY['Registration', 'Labeling'],
        ARRAY['Virginia Department of Agriculture'], true, 'Standard requirements.', 'Standard Mid-Atlantic program.'
    ),
    ('WI', 'Wisconsin', 'Moderate', 3, ARRAY['Registration', 'Grade accuracy'],
        ARRAY['Wisconsin Department of Agriculture'], true, 'Standard labeling.', 'Strong agricultural state.'
    ),
    -- LENIENT (Score 2)
    ('AL', 'Alabama', 'Lenient', 2, ARRAY['Basic registration'],
        ARRAY['Alabama Department of Agriculture'], true, 'Basic labeling.', 'Lenient program.'
    ),
    ('AR', 'Arkansas', 'Lenient', 2, ARRAY['Basic registration'],
        ARRAY['Arkansas State Plant Board'], true, 'Basic labeling.', 'Lenient program.'
    ),
    ('DE', 'Delaware', 'Lenient', 2, ARRAY['Basic registration'],
        ARRAY['Delaware Department of Agriculture'], true, 'Basic labeling.', 'Small state program.'
    ),
    ('ID', 'Idaho', 'Lenient', 2, ARRAY['Basic registration'],
        ARRAY['Idaho Department of Agriculture'], true, 'Basic labeling.', 'Lenient Western program.'
    ),
    ('KS', 'Kansas', 'Lenient', 2, ARRAY['Basic registration'],
        ARRAY['Kansas Department of Agriculture'], true, 'Basic labeling.', 'Lenient agricultural state.'
    ),
    ('LA', 'Louisiana', 'Lenient', 2, ARRAY['Basic registration'],
        ARRAY['Louisiana Department of Agriculture'], true, 'Basic labeling.', 'Lenient Southern program.'
    ),
    ('MS', 'Mississippi', 'Lenient', 2, ARRAY['Basic registration'],
        ARRAY['Mississippi Department of Agriculture'], true, 'Basic labeling.', 'Lenient program.'
    ),
    ('MO', 'Missouri', 'Lenient', 2, ARRAY['Basic registration'],
        ARRAY['Missouri Department of Agriculture'], true, 'Basic labeling.', 'Lenient Midwest program.'
    ),
    ('MT', 'Montana', 'Lenient', 2, ARRAY['Basic registration'],
        ARRAY['Montana Department of Agriculture'], true, 'Basic labeling.', 'Lenient Western program.'
    ),
    ('NE', 'Nebraska', 'Lenient', 2, ARRAY['Basic registration'],
        ARRAY['Nebraska Department of Agriculture'], true, 'Basic labeling.', 'Lenient agricultural state.'
    ),
    ('ND', 'North Dakota', 'Lenient', 2, ARRAY['Basic registration'],
        ARRAY['North Dakota Department of Agriculture'], true, 'Basic labeling.', 'Lenient program.'
    ),
    ('SC', 'South Carolina', 'Lenient', 2, ARRAY['Basic registration'],
        ARRAY['South Carolina Department of Agriculture'], true, 'Basic labeling.', 'Lenient Southern program.'
    ),
    ('SD', 'South Dakota', 'Lenient', 2, ARRAY['Basic registration'],
        ARRAY['South Dakota Department of Agriculture'], true, 'Basic labeling.', 'Lenient program.'
    ),
    ('WV', 'West Virginia', 'Lenient', 2, ARRAY['Basic registration'],
        ARRAY['West Virginia Department of Agriculture'], true, 'Basic labeling.', 'Lenient Appalachian program.'
    ),
    -- VERY LENIENT (Score 1)
    ('AK', 'Alaska', 'Very Lenient', 1, ARRAY['Minimal oversight'],
        ARRAY['Alaska DNR'], false, 'Minimal labeling.', 'Very lenient due to small market.'
    ),
    ('HI', 'Hawaii', 'Very Lenient', 1, ARRAY['Basic labeling'],
        ARRAY['Hawaii Department of Agriculture'], false, 'Basic labeling.', 'Island state with minimal oversight.'
    ),
    ('WY', 'Wyoming', 'Very Lenient', 1, ARRAY['Minimal requirements'],
        ARRAY['Wyoming Department of Agriculture'], false, 'Minimal labeling.', 'Very lenient due to small population.'
    ),
    ('DC', 'District of Columbia', 'Very Lenient', 1, ARRAY['Minimal urban requirements'],
        ARRAY['DC DOEE'], false, 'Minimal requirements.', 'Urban jurisdiction with minimal oversight.'
    );
