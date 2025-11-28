-- Create SOP Repository Tables
-- AI-curated repository of standard operating procedures and reference manuals

-- SOP Repository table
CREATE TABLE IF NOT EXISTS sop_repository (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  tags TEXT[] DEFAULT '{}',
  difficulty TEXT NOT NULL DEFAULT 'intermediate' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced', 'expert')),
  estimated_time_minutes INTEGER NOT NULL DEFAULT 30,
  content TEXT NOT NULL,
  google_doc_id TEXT,
  google_doc_url TEXT,
  last_synced_at TIMESTAMPTZ,
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  ai_confidence REAL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived'))
);

-- SOP Attachments table
CREATE TABLE IF NOT EXISTS sop_attachments (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL REFERENCES sop_repository(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pdf', 'image', 'video', 'document')),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sop_id, name)
);

-- SOP Recommendations table (AI suggestions for BOM attachments)
CREATE TABLE IF NOT EXISTS sop_recommendations (
  id TEXT PRIMARY KEY,
  bom_id TEXT NOT NULL,
  sop_id TEXT NOT NULL REFERENCES sop_repository(id) ON DELETE CASCADE,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reasoning TEXT NOT NULL,
  suggested_by TEXT NOT NULL DEFAULT 'ai' CHECK (suggested_by IN ('ai', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(bom_id, sop_id)
);

-- SOP Usage Log table
CREATE TABLE IF NOT EXISTS sop_usage_logs (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL REFERENCES sop_repository(id) ON DELETE CASCADE,
  build_order_id TEXT,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  time_spent_minutes INTEGER,
  success_rating INTEGER CHECK (success_rating >= 1 AND success_rating <= 5),
  issues_encountered TEXT[],
  notes TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sop_repository_category ON sop_repository(category);
CREATE INDEX IF NOT EXISTS idx_sop_repository_status ON sop_repository(status);
CREATE INDEX IF NOT EXISTS idx_sop_repository_tags ON sop_repository USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_sop_repository_usage ON sop_repository(usage_count DESC, last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_sop_recommendations_bom ON sop_recommendations(bom_id);
CREATE INDEX IF NOT EXISTS idx_sop_recommendations_applied ON sop_recommendations(applied);
CREATE INDEX IF NOT EXISTS idx_sop_usage_logs_sop ON sop_usage_logs(sop_id);
CREATE INDEX IF NOT EXISTS idx_sop_usage_logs_build_order ON sop_usage_logs(build_order_id);

-- Row Level Security (RLS)
ALTER TABLE sop_repository ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- SOP Repository: Everyone can read published SOPs, admins can manage all
CREATE POLICY "sop_repository_select" ON sop_repository
  FOR SELECT USING (status = 'published' OR auth.jwt() ->> 'role' IN ('Admin', 'Manager'));

CREATE POLICY "sop_repository_insert" ON sop_repository
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' IN ('Admin', 'Manager'));

CREATE POLICY "sop_repository_update" ON sop_repository
  FOR UPDATE USING (auth.jwt() ->> 'role' IN ('Admin', 'Manager'));

CREATE POLICY "sop_repository_delete" ON sop_repository
  FOR DELETE USING (auth.jwt() ->> 'role' IN ('Admin', 'Manager'));

-- SOP Attachments: Same permissions as parent SOP
CREATE POLICY "sop_attachments_select" ON sop_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sop_repository
      WHERE id = sop_attachments.sop_id
      AND (status = 'published' OR auth.jwt() ->> 'role' IN ('Admin', 'Manager'))
    )
  );

CREATE POLICY "sop_attachments_insert" ON sop_attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sop_repository
      WHERE id = sop_attachments.sop_id
      AND auth.jwt() ->> 'role' IN ('Admin', 'Manager')
    )
  );

CREATE POLICY "sop_attachments_delete" ON sop_attachments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM sop_repository
      WHERE id = sop_attachments.sop_id
      AND auth.jwt() ->> 'role' IN ('Admin', 'Manager')
    )
  );

-- SOP Recommendations: Admins and managers can manage
CREATE POLICY "sop_recommendations_select" ON sop_recommendations
  FOR SELECT USING (auth.jwt() ->> 'role' IN ('Admin', 'Manager'));

CREATE POLICY "sop_recommendations_insert" ON sop_recommendations
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' IN ('Admin', 'Manager'));

CREATE POLICY "sop_recommendations_update" ON sop_recommendations
  FOR UPDATE USING (auth.jwt() ->> 'role' IN ('Admin', 'Manager'));

-- SOP Usage Logs: Everyone can insert their own logs, admins can read all
CREATE POLICY "sop_usage_logs_select" ON sop_usage_logs
  FOR SELECT USING (auth.jwt() ->> 'role' IN ('Admin', 'Manager') OR user_id = auth.uid()::text);

CREATE POLICY "sop_usage_logs_insert" ON sop_usage_logs
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- Functions for SOP analytics
CREATE OR REPLACE FUNCTION get_sop_usage_stats(sop_id_param TEXT)
RETURNS TABLE (
  total_usage BIGINT,
  avg_completion_time INTERVAL,
  success_rate REAL,
  common_issues TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_usage,
    AVG(completed_at - started_at) as avg_completion_time,
    (COUNT(*) FILTER (WHERE success_rating >= 4)::REAL / COUNT(*)::REAL) as success_rate,
    ARRAY_AGG(DISTINCT unnest(issues_encountered)) FILTER (WHERE issues_encountered IS NOT NULL) as common_issues
  FROM sop_usage_logs
  WHERE sop_id = sop_id_param AND completed_at IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate SOP recommendations for BOMs
CREATE OR REPLACE FUNCTION generate_sop_recommendations(bom_id_param TEXT)
RETURNS TABLE (
  sop_id TEXT,
  confidence REAL,
  reasoning TEXT
) AS $$
BEGIN
  -- This is a placeholder - actual AI logic would go here
  -- For now, return some basic recommendations based on category matching
  RETURN QUERY
  SELECT
    sr.id,
    0.8::REAL as confidence,
    'Recommended based on BOM category and existing usage patterns'::TEXT as reasoning
  FROM sop_repository sr
  WHERE sr.status = 'published'
  ORDER BY sr.usage_count DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;