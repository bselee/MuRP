#!/bin/bash
#
# Test Finale Sync Edge Function
# 
# This script helps you test and trigger the auto-sync-finale Edge Function.
# It requires a valid Supabase auth token (anon key works with RLS disabled).
#

set -e

SUPABASE_URL="${VITE_SUPABASE_URL:-https://mpuevsmtowyexhsqugkm.supabase.co}"
SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY}"

if [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "❌ Error: VITE_SUPABASE_ANON_KEY not found in environment"
  echo "Please source your .env.local file first:"
  echo "  set -a && source .env.local && set +a"
  exit 1
fi

FUNCTION_URL="$SUPABASE_URL/functions/v1/auto-sync-finale"

echo "🔄 Testing Finale Sync Edge Function"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "URL: $FUNCTION_URL"
echo ""

# Option parsing
FORCE_SYNC=false
if [ "$1" = "--force" ]; then
  FORCE_SYNC=true
  echo "⚡ Force sync enabled (will sync even if data is fresh)"
fi

echo "📡 Invoking Edge Function..."
echo ""

if [ "$FORCE_SYNC" = true ]; then
  RESPONSE=$(curl -s -X POST "$FUNCTION_URL" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"force": true, "source": "manual-script"}')
else
  RESPONSE=$(curl -s -X GET "$FUNCTION_URL" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY")
fi

echo "📊 Response:"
echo "$RESPONSE" | jq -C '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Parse success status
if echo "$RESPONSE" | jq -e '.success' >/dev/null 2>&1; then
  SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
  if [ "$SUCCESS" = "true" ]; then
    echo "✅ Sync completed successfully!"
    
    # Show summaries
    SUMMARIES=$(echo "$RESPONSE" | jq -r '.summaries[]? | "\(.dataType): \(.itemCount) items - \(.message)"')
    if [ -n "$SUMMARIES" ]; then
      echo ""
      echo "📋 Summary:"
      echo "$SUMMARIES"
    fi
  else
    echo "❌ Sync failed"
    ERROR=$(echo "$RESPONSE" | jq -r '.error // "Unknown error"')
    echo "Error: $ERROR"
    exit 1
  fi
else
  echo "⚠️  Unable to parse response - check output above"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 Tips:"
echo "  • Check sync status: supabase functions logs auto-sync-finale"
echo "  • Force sync: $0 --force"
echo "  • Query metadata: psql -c 'SELECT * FROM sync_metadata;'"
