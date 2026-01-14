-- ============================================================================
-- Migration 181: Vault Helper Functions for Automated Setup
-- ============================================================================
-- Creates helper functions to check and create Vault secrets programmatically.
-- Used by store-finale-credentials edge function to auto-configure scheduled syncs.
-- ============================================================================

-- Function to check if a Vault secret exists
CREATE OR REPLACE FUNCTION check_vault_secret_exists(secret_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  secret_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = secret_name
  ) INTO secret_exists;

  RETURN secret_exists;
EXCEPTION WHEN OTHERS THEN
  -- Vault extension might not be available
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a Vault secret if it doesn't exist
CREATE OR REPLACE FUNCTION create_vault_secret_if_not_exists(
  p_secret TEXT,
  p_name TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  secret_exists BOOLEAN;
BEGIN
  -- Check if secret already exists
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = p_name
  ) INTO secret_exists;

  IF secret_exists THEN
    -- Secret already exists, no action needed
    RETURN TRUE;
  END IF;

  -- Create the secret using vault.create_secret
  PERFORM vault.create_secret(p_secret, p_name, p_description);

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  -- Log the error but don't fail
  RAISE WARNING 'Could not create vault secret %: %', p_name, SQLERRM;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service_role only (these functions handle sensitive data)
REVOKE ALL ON FUNCTION check_vault_secret_exists(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_vault_secret_exists(TEXT) TO service_role;

REVOKE ALL ON FUNCTION create_vault_secret_if_not_exists(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_vault_secret_if_not_exists(TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION check_vault_secret_exists IS 'Checks if a secret exists in Supabase Vault extension';
COMMENT ON FUNCTION create_vault_secret_if_not_exists IS 'Creates a secret in Supabase Vault if it does not exist';

-- ============================================================================
-- Add onboarding_completed tracking
-- ============================================================================
-- Track whether user has completed data source setup
-- Note: Only add columns if users table exists (may not exist in all environments)
DO $$
BEGIN
  -- Check if users table exists first
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'users'
    AND table_schema = 'public'
  ) THEN
    -- Add onboarding_data_source column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name = 'onboarding_data_source'
    ) THEN
      ALTER TABLE users ADD COLUMN onboarding_data_source TEXT;
    END IF;

    -- Add onboarding_completed_at column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name = 'onboarding_completed_at'
    ) THEN
      ALTER TABLE users ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
    END IF;
  END IF;
END $$;

-- Only add comments if columns exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users'
    AND column_name = 'onboarding_data_source'
  ) THEN
    COMMENT ON COLUMN users.onboarding_data_source IS 'Data source chosen during onboarding: finale, google_sheets, csv, skip';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users'
    AND column_name = 'onboarding_completed_at'
  ) THEN
    COMMENT ON COLUMN users.onboarding_completed_at IS 'Timestamp when user completed onboarding';
  END IF;
END $$;
