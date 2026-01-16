-- Calendar Sync Tracking
-- Tracks sync events and invalid SKUs from Google Calendar (Rube) integration

-- Calendar sync events - logs each sync run
CREATE TABLE IF NOT EXISTS calendar_sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_source TEXT NOT NULL DEFAULT 'google_calendar', -- 'google_calendar', 'rube', etc.
  calendar_type TEXT, -- 'mfg', 'soil', etc.
  events_fetched INT NOT NULL DEFAULT 0,
  builds_parsed INT NOT NULL DEFAULT 0,
  builds_imported INT NOT NULL DEFAULT 0,
  builds_appended INT NOT NULL DEFAULT 0,
  builds_created INT NOT NULL DEFAULT 0,
  builds_errored INT NOT NULL DEFAULT 0,
  invalid_skus_count INT NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'success', -- 'success', 'partial', 'failed'
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ DEFAULT now(),
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invalid SKUs from sync - tracks which SKUs aren't in BOMs
CREATE TABLE IF NOT EXISTS calendar_sync_invalid_skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_event_id UUID REFERENCES calendar_sync_events(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  forecast_date DATE,
  calendar_type TEXT, -- 'mfg', 'soil'
  reason TEXT NOT NULL DEFAULT 'No matching BOM found',
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_calendar_sync_events_source ON calendar_sync_events(sync_source, calendar_type);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_events_status ON calendar_sync_events(sync_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_invalid_skus_sku ON calendar_sync_invalid_skus(sku);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_invalid_skus_resolved ON calendar_sync_invalid_skus(resolved, created_at DESC);

-- View for sync health dashboard
CREATE OR REPLACE VIEW calendar_sync_health AS
SELECT
  sync_source,
  calendar_type,
  COUNT(*) as total_syncs,
  COUNT(*) FILTER (WHERE sync_status = 'success') as successful_syncs,
  COUNT(*) FILTER (WHERE sync_status = 'failed') as failed_syncs,
  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') as syncs_last_24h,
  SUM(builds_imported) as total_builds_imported,
  SUM(invalid_skus_count) as total_invalid_skus,
  MAX(completed_at) as last_sync_at,
  AVG(duration_ms)::INT as avg_duration_ms
FROM calendar_sync_events
WHERE created_at > now() - interval '30 days'
GROUP BY sync_source, calendar_type;

-- View for unresolved invalid SKUs
CREATE OR REPLACE VIEW calendar_sync_unresolved_skus AS
SELECT
  sku,
  COUNT(*) as occurrence_count,
  SUM(quantity) as total_quantity,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen,
  array_agg(DISTINCT calendar_type) as calendar_types
FROM calendar_sync_invalid_skus
WHERE resolved = false
GROUP BY sku
ORDER BY occurrence_count DESC, last_seen DESC;

-- Enable RLS
ALTER TABLE calendar_sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_sync_invalid_skus ENABLE ROW LEVEL SECURITY;

-- RLS policies - allow read for authenticated users, write for service role
CREATE POLICY "Allow read for authenticated users" ON calendar_sync_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow read for authenticated users" ON calendar_sync_invalid_skus
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow update resolved status" ON calendar_sync_invalid_skus
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE calendar_sync_events IS 'Tracks each Google Calendar sync run from Rube integration';
COMMENT ON TABLE calendar_sync_invalid_skus IS 'Records SKUs that failed import due to no matching BOM';
COMMENT ON VIEW calendar_sync_health IS 'Aggregated sync health metrics for dashboard display';
COMMENT ON VIEW calendar_sync_unresolved_skus IS 'Invalid SKUs that need attention (BOM creation or mapping)';
