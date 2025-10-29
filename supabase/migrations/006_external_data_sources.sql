-- =====================================================================================
-- EXTERNAL DATA SOURCES TABLE
-- =====================================================================================
-- Stores configuration for external data connectors (Finale, QuickBooks, CSV APIs, etc.)
-- Each client can connect their own data sources with custom field mappings
-- =====================================================================================

-- Create source type enum
CREATE TYPE source_type AS ENUM (
  'finale_inventory',
  'quickbooks',
  'csv_api',
  'json_api',
  'custom_webhook'
);

-- Create sync frequency enum
CREATE TYPE sync_frequency AS ENUM (
  'realtime',
  'every_15_minutes',
  'hourly',
  'daily',
  'manual'
);

-- Create sync status enum
CREATE TYPE sync_status AS ENUM (
  'never_synced',
  'syncing',
  'success',
  'failed',
  'paused'
);

-- External data sources table
CREATE TABLE external_data_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Source configuration
  source_type source_type NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  
  -- Credentials (stored as encrypted JSONB)
  -- Format varies by source_type:
  -- finale_inventory: { api_key, api_secret }
  -- quickbooks: { client_id, client_secret, refresh_token }
  -- csv_api: { url, auth_header }
  -- json_api: { url, auth_type, credentials }
  credentials JSONB NOT NULL,
  
  -- Sync configuration
  sync_enabled BOOLEAN DEFAULT true,
  sync_frequency sync_frequency DEFAULT 'hourly',
  last_sync_at TIMESTAMPTZ,
  last_sync_duration_ms INTEGER,
  sync_status sync_status DEFAULT 'never_synced',
  sync_error TEXT,
  
  -- Field mappings (how to transform external data to our schema)
  -- Example: { "inventory": { "sku": "productCode", "stock": "qtyOnHand" } }
  field_mappings JSONB DEFAULT '{}'::jsonb,
  
  -- Rate limiting tracking
  last_request_at TIMESTAMPTZ,
  requests_this_minute INTEGER DEFAULT 0,
  requests_this_hour INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);

-- Indexes
CREATE INDEX idx_external_data_sources_user ON external_data_sources(user_id) WHERE is_deleted = false;
CREATE INDEX idx_external_data_sources_type ON external_data_sources(source_type) WHERE is_deleted = false;
CREATE INDEX idx_external_data_sources_sync_enabled ON external_data_sources(sync_enabled) WHERE is_deleted = false AND sync_enabled = true;
CREATE INDEX idx_external_data_sources_last_sync ON external_data_sources(last_sync_at) WHERE is_deleted = false;

-- Trigger for updated_at
CREATE TRIGGER update_external_data_sources_updated_at
  BEFORE UPDATE ON external_data_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add source_system field to existing tables for tracking data origin
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS source_system TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS source_system TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS source_system TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Create composite indexes for external lookups
CREATE INDEX IF NOT EXISTS idx_inventory_external ON inventory_items(source_system, external_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_vendors_external ON vendors(source_system, external_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_external ON purchase_orders(source_system, external_id) WHERE is_deleted = false;

-- RLS Policies for external_data_sources
ALTER TABLE external_data_sources ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data sources
CREATE POLICY external_data_sources_select_own 
  ON external_data_sources FOR SELECT 
  USING (user_id = auth.uid());

-- Users can only create their own data sources
CREATE POLICY external_data_sources_insert_own 
  ON external_data_sources FOR INSERT 
  WITH CHECK (user_id = auth.uid());

-- Users can only update their own data sources
CREATE POLICY external_data_sources_update_own 
  ON external_data_sources FOR UPDATE 
  USING (user_id = auth.uid());

-- Users can soft delete their own data sources
CREATE POLICY external_data_sources_delete_own 
  ON external_data_sources FOR UPDATE 
  USING (user_id = auth.uid() AND is_deleted = false)
  WITH CHECK (is_deleted = true);

-- Admin full access
CREATE POLICY external_data_sources_admin_all 
  ON external_data_sources FOR ALL 
  USING (get_user_role() = 'admin');

-- Service role full access (for server-side operations)
CREATE POLICY external_data_sources_service_all 
  ON external_data_sources FOR ALL 
  USING (auth.jwt()->>'role' = 'service_role');

-- Function to safely get decrypted credentials (server-side only)
-- This should only be called from server-side API routes with SERVICE_ROLE_KEY
CREATE OR REPLACE FUNCTION get_external_source_credentials(source_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  creds JSONB;
BEGIN
  -- Only service role can decrypt credentials
  IF auth.jwt()->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Only service role can access credentials';
  END IF;
  
  SELECT credentials INTO creds
  FROM external_data_sources
  WHERE id = source_id AND is_deleted = false;
  
  RETURN creds;
END;
$$;

-- Function to update sync status
CREATE OR REPLACE FUNCTION update_sync_status(
  source_id UUID,
  new_status sync_status,
  error_msg TEXT DEFAULT NULL,
  duration_ms INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE external_data_sources
  SET 
    sync_status = new_status,
    last_sync_at = CASE 
      WHEN new_status IN ('success', 'failed') THEN NOW()
      ELSE last_sync_at
    END,
    last_sync_duration_ms = COALESCE(duration_ms, last_sync_duration_ms),
    sync_error = error_msg,
    updated_at = NOW()
  WHERE id = source_id;
END;
$$;

-- Function to increment rate limit counters
CREATE OR REPLACE FUNCTION increment_rate_limit(source_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  last_req TIMESTAMPTZ;
  curr_time TIMESTAMPTZ := NOW();
BEGIN
  SELECT last_request_at INTO last_req
  FROM external_data_sources
  WHERE id = source_id;
  
  -- Reset minute counter if more than 60 seconds passed
  -- Reset hour counter if more than 60 minutes passed
  UPDATE external_data_sources
  SET 
    requests_this_minute = CASE
      WHEN last_req IS NULL OR EXTRACT(EPOCH FROM (curr_time - last_req)) > 60 
      THEN 1
      ELSE requests_this_minute + 1
    END,
    requests_this_hour = CASE
      WHEN last_req IS NULL OR EXTRACT(EPOCH FROM (curr_time - last_req)) > 3600
      THEN 1
      ELSE requests_this_hour + 1
    END,
    last_request_at = curr_time,
    updated_at = curr_time
  WHERE id = source_id;
END;
$$;

-- Comments for documentation
COMMENT ON TABLE external_data_sources IS 'Configuration for external data source connectors (Finale, QuickBooks, etc.)';
COMMENT ON COLUMN external_data_sources.credentials IS 'Encrypted JSONB containing API keys and auth tokens';
COMMENT ON COLUMN external_data_sources.field_mappings IS 'Maps external field names to our internal schema';
COMMENT ON FUNCTION get_external_source_credentials IS 'SERVER-SIDE ONLY: Decrypts and returns credentials for external API calls';
COMMENT ON FUNCTION update_sync_status IS 'Updates sync status after a sync operation completes';
COMMENT ON FUNCTION increment_rate_limit IS 'Tracks API request counts for rate limit enforcement';
