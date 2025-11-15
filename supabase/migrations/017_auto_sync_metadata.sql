-- Migration: Auto-Sync Metadata Table
-- 
-- Tracks background sync status for automatic data refresh.
-- Enables the app to know when data was last synced and if it needs refresh.

-- Create sync_metadata table
CREATE TABLE IF NOT EXISTS sync_metadata (
  data_type TEXT PRIMARY KEY,
  last_sync_time TIMESTAMPTZ NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_sync_metadata_last_sync 
  ON sync_metadata(last_sync_time);

CREATE INDEX IF NOT EXISTS idx_sync_metadata_success 
  ON sync_metadata(success);

-- Add RLS policies (allow all authenticated users to read/write sync metadata)
ALTER TABLE sync_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read sync metadata"
  ON sync_metadata FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Anyone can insert sync metadata"
  ON sync_metadata FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Anyone can update sync metadata"
  ON sync_metadata FOR UPDATE
  TO authenticated, anon
  USING (true);

-- Add helpful comment
COMMENT ON TABLE sync_metadata IS 'Tracks background sync status for automatic Finale data refresh';
COMMENT ON COLUMN sync_metadata.data_type IS 'Type of data: inventory, vendors, or boms';
COMMENT ON COLUMN sync_metadata.last_sync_time IS 'When this data was last synced from Finale';
COMMENT ON COLUMN sync_metadata.item_count IS 'Number of items synced in last sync';
COMMENT ON COLUMN sync_metadata.success IS 'Whether the last sync succeeded';

-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a cron job to trigger auto-sync every 5 minutes
-- This calls the Supabase Edge Function to sync Finale data
SELECT cron.schedule(
  'auto-sync-finale',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/auto-sync-finale',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
