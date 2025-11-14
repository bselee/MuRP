-- Migration 011: Google Sheets OAuth & Backup System
-- Date: November 14, 2025
-- Purpose: Add OAuth token storage and database backup functionality

-- ============================================================================
-- PART 1: OAUTH TOKEN STORAGE
-- ============================================================================

-- Store OAuth tokens (encrypted, server-side only)
CREATE TABLE IF NOT EXISTS user_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft', 'dropbox')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scopes TEXT[],
  token_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Create index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_provider
  ON user_oauth_tokens(user_id, provider);

-- Enable Row Level Security
ALTER TABLE user_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own tokens
CREATE POLICY "Users access own OAuth tokens"
  ON user_oauth_tokens FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================================
-- PART 2: GOOGLE SHEETS INTEGRATION SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS google_sheets_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Backup configuration
  auto_backup_enabled BOOLEAN DEFAULT false,
  backup_spreadsheet_id TEXT,
  backup_sheet_name TEXT DEFAULT 'Finale Backups',

  -- Import/Export settings
  default_spreadsheet_id TEXT,
  import_sheet_name TEXT DEFAULT 'Inventory',
  export_sheet_name TEXT DEFAULT 'Inventory Export',

  -- Sync settings
  last_import_at TIMESTAMPTZ,
  last_export_at TIMESTAMPTZ,
  last_backup_at TIMESTAMPTZ,

  -- Metadata
  settings_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_google_sheets_configs_user
  ON google_sheets_configs(user_id);

ALTER TABLE google_sheets_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own Google Sheets configs"
  ON google_sheets_configs FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================================
-- PART 3: BACKUP TABLES
-- ============================================================================

-- Inventory backups
CREATE TABLE IF NOT EXISTS inventory_items_backup (
  id UUID,
  sku TEXT,
  name TEXT,
  description TEXT,
  category TEXT,
  quantity_on_hand DECIMAL(10,2),
  reorder_point DECIMAL(10,2),
  reorder_quantity DECIMAL(10,2),
  unit_cost DECIMAL(10,2),
  unit_price DECIMAL(10,2),
  supplier_id UUID,
  supplier_name TEXT,
  upc TEXT,
  location TEXT,
  weight DECIMAL(10,3),
  dimensions JSONB,
  is_active BOOLEAN,
  custom_fields JSONB,
  finale_id TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,

  -- Backup metadata
  backup_id UUID DEFAULT gen_random_uuid(),
  backup_at TIMESTAMPTZ DEFAULT NOW(),
  backup_source TEXT DEFAULT 'manual',
  backup_reason TEXT,

  PRIMARY KEY (backup_id, id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_backup_time
  ON inventory_items_backup(backup_at DESC);

-- Vendors backups
CREATE TABLE IF NOT EXISTS vendors_backup (
  id UUID,
  name TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT,
  website TEXT,
  payment_terms TEXT,
  lead_time_days INTEGER,
  minimum_order_value DECIMAL(10,2),
  notes TEXT,
  is_active BOOLEAN,
  finale_id TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,

  -- Backup metadata
  backup_id UUID DEFAULT gen_random_uuid(),
  backup_at TIMESTAMPTZ DEFAULT NOW(),
  backup_source TEXT DEFAULT 'manual',
  backup_reason TEXT,

  PRIMARY KEY (backup_id, id)
);

CREATE INDEX IF NOT EXISTS idx_vendors_backup_time
  ON vendors_backup(backup_at DESC);

-- ============================================================================
-- PART 4: BACKUP FUNCTIONS
-- ============================================================================

-- Function to create inventory backup
CREATE OR REPLACE FUNCTION backup_inventory_items(
  p_backup_reason TEXT DEFAULT 'manual',
  p_backup_source TEXT DEFAULT 'manual'
)
RETURNS TABLE (
  backup_id UUID,
  items_backed_up BIGINT,
  backup_timestamp TIMESTAMPTZ
) AS $$
DECLARE
  v_backup_id UUID;
  v_items_count BIGINT;
BEGIN
  v_backup_id := gen_random_uuid();

  -- Copy current inventory to backup table
  INSERT INTO inventory_items_backup (
    id, sku, name, description, category, quantity_on_hand,
    reorder_point, reorder_quantity, unit_cost, unit_price,
    supplier_id, supplier_name, upc, location, weight, dimensions,
    is_active, custom_fields, finale_id, last_synced_at,
    created_at, updated_at,
    backup_id, backup_reason, backup_source
  )
  SELECT
    id, sku, name, description, category, quantity_on_hand,
    reorder_point, reorder_quantity, unit_cost, unit_price,
    supplier_id, supplier_name, upc, location, weight, dimensions,
    is_active, custom_fields, finale_id, last_synced_at,
    created_at, updated_at,
    v_backup_id, p_backup_reason, p_backup_source
  FROM inventory_items;

  GET DIAGNOSTICS v_items_count = ROW_COUNT;

  RETURN QUERY SELECT v_backup_id, v_items_count, NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create vendors backup
CREATE OR REPLACE FUNCTION backup_vendors(
  p_backup_reason TEXT DEFAULT 'manual',
  p_backup_source TEXT DEFAULT 'manual'
)
RETURNS TABLE (
  backup_id UUID,
  items_backed_up BIGINT,
  backup_timestamp TIMESTAMPTZ
) AS $$
DECLARE
  v_backup_id UUID;
  v_items_count BIGINT;
BEGIN
  v_backup_id := gen_random_uuid();

  INSERT INTO vendors_backup (
    id, name, contact_name, email, phone, address,
    city, state, zip_code, country, website, payment_terms,
    lead_time_days, minimum_order_value, notes, is_active,
    finale_id, created_at, updated_at,
    backup_id, backup_reason, backup_source
  )
  SELECT
    id, name, contact_name, email, phone, address,
    city, state, zip_code, country, website, payment_terms,
    lead_time_days, minimum_order_value, notes, is_active,
    finale_id, created_at, updated_at,
    v_backup_id, p_backup_reason, p_backup_source
  FROM vendors;

  GET DIAGNOSTICS v_items_count = ROW_COUNT;

  RETURN QUERY SELECT v_backup_id, v_items_count, NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to restore from backup
CREATE OR REPLACE FUNCTION restore_from_backup(
  p_table_name TEXT,
  p_backup_id UUID
)
RETURNS TABLE (
  rows_restored BIGINT,
  restore_timestamp TIMESTAMPTZ
) AS $$
DECLARE
  v_rows_count BIGINT;
BEGIN
  -- Validate table name
  IF p_table_name NOT IN ('inventory_items', 'vendors') THEN
    RAISE EXCEPTION 'Invalid table name. Must be inventory_items or vendors';
  END IF;

  -- Delete current data
  IF p_table_name = 'inventory_items' THEN
    DELETE FROM inventory_items;

    -- Restore from backup
    INSERT INTO inventory_items (
      id, sku, name, description, category, quantity_on_hand,
      reorder_point, reorder_quantity, unit_cost, unit_price,
      supplier_id, supplier_name, upc, location, weight, dimensions,
      is_active, custom_fields, finale_id, last_synced_at,
      created_at, updated_at
    )
    SELECT
      id, sku, name, description, category, quantity_on_hand,
      reorder_point, reorder_quantity, unit_cost, unit_price,
      supplier_id, supplier_name, upc, location, weight, dimensions,
      is_active, custom_fields, finale_id, last_synced_at,
      created_at, updated_at
    FROM inventory_items_backup
    WHERE backup_id = p_backup_id;

  ELSIF p_table_name = 'vendors' THEN
    DELETE FROM vendors;

    INSERT INTO vendors (
      id, name, contact_name, email, phone, address,
      city, state, zip_code, country, website, payment_terms,
      lead_time_days, minimum_order_value, notes, is_active,
      finale_id, created_at, updated_at
    )
    SELECT
      id, name, contact_name, email, phone, address,
      city, state, zip_code, country, website, payment_terms,
      lead_time_days, minimum_order_value, notes, is_active,
      finale_id, created_at, updated_at
    FROM vendors_backup
    WHERE backup_id = p_backup_id;
  END IF;

  GET DIAGNOSTICS v_rows_count = ROW_COUNT;

  RETURN QUERY SELECT v_rows_count, NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to list available backups
CREATE OR REPLACE FUNCTION list_backups(
  p_table_name TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  backup_id UUID,
  backup_at TIMESTAMPTZ,
  backup_source TEXT,
  backup_reason TEXT,
  items_count BIGINT
) AS $$
BEGIN
  IF p_table_name = 'inventory_items' THEN
    RETURN QUERY
    SELECT
      b.backup_id,
      b.backup_at,
      b.backup_source,
      b.backup_reason,
      COUNT(*)::BIGINT as items_count
    FROM inventory_items_backup b
    GROUP BY b.backup_id, b.backup_at, b.backup_source, b.backup_reason
    ORDER BY b.backup_at DESC
    LIMIT p_limit;
  ELSIF p_table_name = 'vendors' THEN
    RETURN QUERY
    SELECT
      b.backup_id,
      b.backup_at,
      b.backup_source,
      b.backup_reason,
      COUNT(*)::BIGINT as items_count
    FROM vendors_backup b
    GROUP BY b.backup_id, b.backup_at, b.backup_source, b.backup_reason
    ORDER BY b.backup_at DESC
    LIMIT p_limit;
  ELSE
    RAISE EXCEPTION 'Invalid table name';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean old backups (keep only last N backups)
CREATE OR REPLACE FUNCTION cleanup_old_backups(
  p_table_name TEXT,
  p_keep_count INTEGER DEFAULT 10
)
RETURNS BIGINT AS $$
DECLARE
  v_deleted_count BIGINT;
BEGIN
  IF p_table_name = 'inventory_items' THEN
    DELETE FROM inventory_items_backup
    WHERE backup_id NOT IN (
      SELECT DISTINCT backup_id
      FROM inventory_items_backup
      ORDER BY backup_at DESC
      LIMIT p_keep_count
    );
  ELSIF p_table_name = 'vendors' THEN
    DELETE FROM vendors_backup
    WHERE backup_id NOT IN (
      SELECT DISTINCT backup_id
      FROM vendors_backup
      ORDER BY backup_at DESC
      LIMIT p_keep_count
    );
  ELSE
    RAISE EXCEPTION 'Invalid table name';
  END IF;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 5: SYNC AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Sync details
  sync_type TEXT NOT NULL CHECK (sync_type IN ('finale', 'google_sheets', 'manual')),
  operation TEXT NOT NULL CHECK (operation IN ('import', 'export', 'backup', 'restore')),
  table_name TEXT NOT NULL,

  -- Results
  items_affected BIGINT,
  success BOOLEAN,
  error_message TEXT,

  -- Metadata
  sync_metadata JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_audit_user_time
  ON sync_audit_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_audit_type_time
  ON sync_audit_log(sync_type, created_at DESC);

ALTER TABLE sync_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sync audit logs"
  ON sync_audit_log FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE user_oauth_tokens IS 'Stores encrypted OAuth tokens for third-party integrations';
COMMENT ON TABLE google_sheets_configs IS 'User-specific Google Sheets integration settings';
COMMENT ON TABLE inventory_items_backup IS 'Point-in-time backups of inventory data';
COMMENT ON TABLE vendors_backup IS 'Point-in-time backups of vendor data';
COMMENT ON TABLE sync_audit_log IS 'Audit trail of all data sync operations';

COMMENT ON FUNCTION backup_inventory_items IS 'Creates a point-in-time backup of all inventory items';
COMMENT ON FUNCTION backup_vendors IS 'Creates a point-in-time backup of all vendors';
COMMENT ON FUNCTION restore_from_backup IS 'Restores data from a specific backup';
COMMENT ON FUNCTION list_backups IS 'Lists available backups for a table';
COMMENT ON FUNCTION cleanup_old_backups IS 'Removes old backups, keeping only the most recent N';
