-- Migration: 123_add_perplexity_api_key.sql
-- Description: Add Perplexity API key column to mcp_server_configs
-- Purpose: Enable regulatory research features via Perplexity Sonar API
-- Date: 2025-12-23

-- Add perplexity_api_key column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mcp_server_configs' AND column_name = 'perplexity_api_key'
  ) THEN
    ALTER TABLE mcp_server_configs ADD COLUMN perplexity_api_key TEXT;
    COMMENT ON COLUMN mcp_server_configs.perplexity_api_key IS 'Perplexity API key for regulatory research (research_ingredient_regulations, research_ingredient_sds tools)';
  END IF;
END $$;

-- Ensure the compliance_mcp server record exists with proper defaults
INSERT INTO mcp_server_configs (
  server_name,
  server_type,
  display_name,
  is_local,
  server_url,
  is_enabled,
  health_status,
  notes
) VALUES (
  'compliance_mcp',
  'compliance',
  'Compliance MCP Server',
  TRUE,
  'http://localhost:8000',
  TRUE,
  'unknown',
  'Primary MCP server for compliance tools including Perplexity-powered regulatory research'
) ON CONFLICT (server_name) DO UPDATE SET
  notes = COALESCE(mcp_server_configs.notes, EXCLUDED.notes);

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 123 completed successfully!';
  RAISE NOTICE '📊 Added: perplexity_api_key column to mcp_server_configs';
  RAISE NOTICE '🔑 Configure in Settings → AI & System → MCP Server';
END $$;
