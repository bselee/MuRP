#!/bin/bash

# Script to apply OAuth profile creation fix
# This migration adds the ensure_user_profile() function to handle OAuth login

set -e

echo "🔧 Applying OAuth Profile Creation Fix..."
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
  echo "❌ Error: .env file not found"
  echo "Please create a .env file with your Supabase credentials"
  exit 1
fi

# Load environment variables
source .env

# Check if required variables are set
if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ Error: Missing required environment variables"
  echo "Please ensure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env"
  exit 1
fi

echo "📍 Supabase URL: $VITE_SUPABASE_URL"
echo ""

# Apply the migration using Supabase REST API
echo "🚀 Applying migration 028_fix_oauth_profile_creation.sql..."

MIGRATION_SQL=$(cat supabase/migrations/028_fix_oauth_profile_creation.sql)

curl -X POST \
  "${VITE_SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $(echo "$MIGRATION_SQL" | jq -Rs .)}"

echo ""
echo "✅ Migration applied successfully!"
echo ""
echo "You can now test Google OAuth login. The ensure_user_profile() function"
echo "will automatically create user profiles for OAuth users."
