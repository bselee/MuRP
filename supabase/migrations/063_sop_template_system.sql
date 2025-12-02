-- SOP Template System and Enhanced Categorization
-- Adds standardized templates, department/role categorization, and external document server integrations

-- First, create the required department and role tables
CREATE TABLE IF NOT EXISTS sop_departments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sop_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    department_id UUID REFERENCES sop_departments(id),
    permissions JSONB DEFAULT '{}', -- Role-specific permissions
    hierarchy_level INTEGER DEFAULT 1, -- For approval hierarchies
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_department_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES sop_departments(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES sop_roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(user_id, department_id, role_id)
);

-- Insert default departments and roles
INSERT INTO sop_departments (name, description) VALUES
('Operations', 'Manufacturing and production operations'),
('Quality Control', 'Quality assurance and control'),
('Compliance', 'Regulatory compliance and documentation'),
('Engineering', 'Product and process engineering'),
('Purchasing', 'Procurement and vendor management'),
('Sales', 'Sales and customer service'),
('IT', 'Information technology and systems'),
('HR', 'Human resources and administration')
ON CONFLICT (name) DO NOTHING;

INSERT INTO sop_roles (name, description, hierarchy_level) VALUES
('operator', 'Production line operator', 1),
('supervisor', 'Department supervisor', 2),
('manager', 'Department manager', 3),
('compliance_officer', 'Compliance and regulatory officer', 3),
('engineer', 'Process or product engineer', 2),
('lead', 'Department lead or coordinator', 2),
('admin', 'System administrator', 4),
('executive', 'Executive leadership', 5)
ON CONFLICT (name) DO NOTHING;

-- SOP Templates table
CREATE TABLE IF NOT EXISTS sop_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  department TEXT NOT NULL DEFAULT 'All',
  applicable_roles TEXT[] DEFAULT '{}',
  template_structure JSONB NOT NULL, -- Template fields and their configurations
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category, department, is_default) -- Only one default per category/department
);

-- Add department and role fields to SOP repository
ALTER TABLE sop_repository
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES sop_departments(id),
ADD COLUMN IF NOT EXISTS applicable_roles TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS template_id TEXT REFERENCES sop_templates(id),
ADD COLUMN IF NOT EXISTS template_data JSONB; -- Structured data following template

-- External Document Servers table
CREATE TABLE IF NOT EXISTS external_document_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('notion', 'google_docs', 'mcp_server', 'confluence', 'sharepoint')),
  config JSONB NOT NULL, -- Server-specific configuration (API keys, URLs, etc.)
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SOP Learning Data table (for AI improvement)
CREATE TABLE IF NOT EXISTS sop_learning_data (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL REFERENCES sop_repository(id) ON DELETE CASCADE,
  process_type TEXT NOT NULL,
  success_patterns JSONB, -- What worked well
  failure_patterns JSONB, -- What didn't work
  improvement_suggestions JSONB, -- AI-generated suggestions
  user_feedback JSONB, -- User ratings and comments
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sop_repository_department_id ON sop_repository(department_id);
CREATE INDEX IF NOT EXISTS idx_sop_repository_applicable_roles ON sop_repository USING GIN(applicable_roles);
CREATE INDEX IF NOT EXISTS idx_sop_repository_template_id ON sop_repository(template_id);
CREATE INDEX IF NOT EXISTS idx_sop_templates_category_dept ON sop_templates(category, department);
CREATE INDEX IF NOT EXISTS idx_sop_templates_active ON sop_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_external_document_servers_type ON external_document_servers(type);
CREATE INDEX IF NOT EXISTS idx_external_document_servers_active ON external_document_servers(is_active);
CREATE INDEX IF NOT EXISTS idx_sop_learning_data_sop ON sop_learning_data(sop_id);
CREATE INDEX IF NOT EXISTS idx_sop_learning_data_process ON sop_learning_data(process_type);

-- RLS for new tables
ALTER TABLE sop_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_document_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_learning_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- SOP Templates: Admins can manage, everyone can read active templates
CREATE POLICY "sop_templates_select" ON sop_templates
  FOR SELECT USING (is_active = true OR auth.jwt() ->> 'role' IN ('Admin', 'Manager'));

CREATE POLICY "sop_templates_insert" ON sop_templates
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' IN ('Admin', 'Manager'));

CREATE POLICY "sop_templates_update" ON sop_templates
  FOR UPDATE USING (auth.jwt() ->> 'role' IN ('Admin', 'Manager'));

CREATE POLICY "sop_templates_delete" ON sop_templates
  FOR DELETE USING (auth.jwt() ->> 'role' IN ('Admin', 'Manager'));

-- External Document Servers: Only admins can manage
CREATE POLICY "external_document_servers_select" ON external_document_servers
  FOR SELECT USING (auth.jwt() ->> 'role' = 'Admin');

CREATE POLICY "external_document_servers_insert" ON external_document_servers
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'Admin');

CREATE POLICY "external_document_servers_update" ON external_document_servers
  FOR UPDATE USING (auth.jwt() ->> 'role' = 'Admin');

CREATE POLICY "external_document_servers_delete" ON external_document_servers
  FOR DELETE USING (auth.jwt() ->> 'role' = 'Admin');

-- SOP Learning Data: Everyone can read, authenticated users can contribute
CREATE POLICY "sop_learning_data_select" ON sop_learning_data
  FOR SELECT USING (true);

CREATE POLICY "sop_learning_data_insert" ON sop_learning_data
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "sop_learning_data_update" ON sop_learning_data
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Default SOP Templates
INSERT INTO sop_templates (id, name, description, category, department, applicable_roles, template_structure, is_default, created_by) VALUES
('template_standard_manufacturing', 'Standard Manufacturing SOP', 'Comprehensive template for manufacturing procedures', 'Manufacturing', 'Production', ARRAY['Operator', 'Supervisor', 'Engineer'], '{
  "sections": [
    {"id": "purpose", "name": "Purpose & Scope", "required": true, "type": "textarea"},
    {"id": "responsibilities", "name": "Responsibilities", "required": true, "type": "textarea"},
    {"id": "safety", "name": "Safety Requirements", "required": true, "type": "textarea"},
    {"id": "equipment", "name": "Equipment & Materials", "required": true, "type": "textarea"},
    {"id": "procedure", "name": "Procedure Steps", "required": true, "type": "textarea"},
    {"id": "quality", "name": "Quality Checks", "required": false, "type": "textarea"},
    {"id": "troubleshooting", "name": "Troubleshooting", "required": false, "type": "textarea"},
    {"id": "references", "name": "References & Documentation", "required": false, "type": "textarea"}
  ],
  "metadata": {
    "estimated_time_unit": "minutes",
    "difficulty_levels": ["beginner", "intermediate", "advanced", "expert"],
    "categories": ["Manufacturing", "Quality Control", "Safety", "Maintenance", "Setup"]
  }
}', true, 'system'),

('template_quality_control', 'Quality Control SOP', 'Template for quality inspection and control procedures', 'Quality Control', 'Quality', ARRAY['Inspector', 'Supervisor', 'Engineer'], '{
  "sections": [
    {"id": "purpose", "name": "Purpose & Scope", "required": true, "type": "textarea"},
    {"id": "standards", "name": "Quality Standards", "required": true, "type": "textarea"},
    {"id": "responsibilities", "name": "Responsibilities", "required": true, "type": "textarea"},
    {"id": "equipment", "name": "Inspection Equipment", "required": true, "type": "textarea"},
    {"id": "procedure", "name": "Inspection Procedure", "required": true, "type": "textarea"},
    {"id": "acceptance", "name": "Acceptance Criteria", "required": true, "type": "textarea"},
    {"id": "documentation", "name": "Documentation Requirements", "required": true, "type": "textarea"},
    {"id": "escalation", "name": "Escalation Procedures", "required": false, "type": "textarea"}
  ],
  "metadata": {
    "estimated_time_unit": "minutes",
    "difficulty_levels": ["beginner", "intermediate", "advanced", "expert"],
    "categories": ["Quality Control", "Compliance", "Documentation"]
  }
}', true, 'system'),

('template_safety', 'Safety SOP', 'Template for safety procedures and protocols', 'Safety', 'All', ARRAY['All'], '{
  "sections": [
    {"id": "purpose", "name": "Purpose & Scope", "required": true, "type": "textarea"},
    {"id": "hazards", "name": "Potential Hazards", "required": true, "type": "textarea"},
    {"id": "responsibilities", "name": "Responsibilities", "required": true, "type": "textarea"},
    {"id": "ppe", "name": "Required PPE", "required": true, "type": "textarea"},
    {"id": "procedure", "name": "Safety Procedure", "required": true, "type": "textarea"},
    {"id": "emergency", "name": "Emergency Procedures", "required": true, "type": "textarea"},
    {"id": "training", "name": "Training Requirements", "required": false, "type": "textarea"},
    {"id": "compliance", "name": "Regulatory Compliance", "required": false, "type": "textarea"}
  ],
  "metadata": {
    "estimated_time_unit": "minutes",
    "difficulty_levels": ["beginner", "intermediate", "advanced", "expert"],
    "categories": ["Safety", "Compliance", "Training"]
  }
}', true, 'system')
ON CONFLICT (id) DO NOTHING;

-- Function to get applicable SOP templates for a user
CREATE OR REPLACE FUNCTION get_applicable_sop_templates(user_role TEXT DEFAULT NULL, user_department TEXT DEFAULT NULL)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  description TEXT,
  category TEXT,
  department TEXT,
  applicable_roles TEXT[],
  template_structure JSONB,
  is_default BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    st.id,
    st.name,
    st.description,
    st.category,
    st.department,
    st.applicable_roles,
    st.template_structure,
    st.is_default
  FROM sop_templates st
  WHERE st.is_active = true
    AND (user_role IS NULL OR user_role = ANY(st.applicable_roles) OR 'All' = ANY(st.applicable_roles))
    AND (user_department IS NULL OR st.department = 'All' OR st.department = user_department)
  ORDER BY st.category, st.is_default DESC, st.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate SOP against template
CREATE OR REPLACE FUNCTION validate_sop_template(sop_data JSONB, template_id TEXT)
RETURNS TABLE (
  is_valid BOOLEAN,
  validation_errors TEXT[]
) AS $$
DECLARE
  template_record RECORD;
  section_record RECORD;
  errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Get template
  SELECT * INTO template_record FROM sop_templates WHERE id = template_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, ARRAY['Template not found or inactive'];
    RETURN;
  END IF;

  -- Validate required sections
  FOR section_record IN SELECT * FROM jsonb_array_elements(template_record.template_structure->'sections') AS section
  LOOP
    IF (section_record.section->>'required')::boolean = true THEN
      IF NOT sop_data ? (section_record.section->>'id') OR
         trim(COALESCE(sop_data->>(section_record.section->>'id'), '')) = '' THEN
        errors := errors || format('Required section "%s" is missing or empty', section_record.section->>'name');
      END IF;
    END IF;
  END LOOP;

  -- Return validation result
  RETURN QUERY SELECT
    array_length(errors, 1) IS NULL,
    CASE WHEN array_length(errors, 1) IS NULL THEN ARRAY[]::TEXT[] ELSE errors END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate AI learning insights
CREATE OR REPLACE FUNCTION generate_sop_learning_insights(sop_id_param TEXT)
RETURNS TABLE (
  insight_type TEXT,
  insight_data JSONB,
  confidence REAL
) AS $$
BEGIN
  -- Analyze usage patterns and generate insights
  RETURN QUERY
  WITH usage_stats AS (
    SELECT
      COUNT(*) as total_uses,
      AVG(time_spent_minutes) as avg_time,
      AVG(success_rating) as avg_rating,
      COUNT(*) FILTER (WHERE success_rating >= 4) as successful_uses,
      array_agg(DISTINCT unnest(issues_encountered)) FILTER (WHERE issues_encountered IS NOT NULL) as common_issues
    FROM sop_usage_logs
    WHERE sop_id = sop_id_param AND completed_at IS NOT NULL
  )
  SELECT
    'usage_patterns'::TEXT as insight_type,
    jsonb_build_object(
      'total_uses', total_uses,
      'avg_completion_time', avg_time,
      'success_rate', successful_uses::REAL / total_uses,
      'avg_rating', avg_rating,
      'common_issues', common_issues
    ) as insight_data,
    0.9::REAL as confidence
  FROM usage_stats
  WHERE total_uses > 0

  UNION ALL

  -- Analyze learning data patterns
  SELECT
    'improvement_suggestions'::TEXT,
    jsonb_agg(improvement_suggestions) as insight_data,
    0.8::REAL
  FROM sop_learning_data
  WHERE sop_id = sop_id_param AND improvement_suggestions IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;