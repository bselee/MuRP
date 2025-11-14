# Run Migration 006 - MCP Tables

⚠️ **IMPORTANT**: The `app_settings` table is missing from your Supabase database. This is causing 404 errors.

## Quick Fix

1. Open Supabase SQL Editor: https://supabase.com/dashboard/project/mpuevsmtowyexhsqugkm/sql

2. Copy the entire contents of `supabase/migrations/006_add_mcp_tables.sql`

3. Paste into SQL Editor and click **Run**

4. Verify table exists:
```sql
SELECT * FROM app_settings LIMIT 5;
```

Should see 2 rows with default settings for `ai_provider_config` and `semantic_search_enabled`.

## What This Fixes

- ✅ Removes 404 error for `app_settings` table
- ✅ Enables AI provider configuration storage
- ✅ Adds MCP server tables for compliance features
- ✅ Adds proper indexes and triggers

## After Running

Refresh your app at https://murp.app and the Settings page should load without errors.
