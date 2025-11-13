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

-- Comments for documentation
COMMENT ON TABLE state_regulations IS 'Stores state-by-state regulatory requirements for product compliance';
COMMENT ON TABLE compliance_checks IS 'Records compliance scans performed on labels and products';
COMMENT ON TABLE extraction_prompts IS 'Reusable AI prompt templates for regulation extraction and compliance checking';
COMMENT ON TABLE regulation_changes IS 'Audit log of regulation updates and changes';
COMMENT ON TABLE regulation_update_jobs IS 'Tracks scheduled and manual regulation update tasks';

COMMENT ON COLUMN state_regulations.confidence_score IS 'AI confidence in extraction accuracy (0.0-1.0)';
COMMENT ON COLUMN state_regulations.search_vector IS 'Full-text search index for fast querying';
COMMENT ON COLUMN compliance_checks.violations IS 'Array of violation objects with severity, state, and recommendations';
COMMENT ON COLUMN compliance_checks.compliance_score IS 'Overall compliance score 0-100';
