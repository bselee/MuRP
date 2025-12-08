#!/bin/bash

# Test Finale Sync Endpoint
# This script triggers a manual sync from your deployed Vercel app

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 Testing Finale Server-Side Sync"
echo "=================================="
echo ""

# Get your Vercel URL
read -p "Enter your Vercel app URL (e.g., https://murp.vercel.app): " APP_URL
read -p "Enter your CRON_SECRET (from Vercel env vars): " CRON_SECRET

echo ""
echo "${YELLOW}📡 Triggering sync at: ${APP_URL}/api/sync-finale${NC}"
echo ""

# Make the request
RESPONSE=$(curl -X POST "${APP_URL}/api/sync-finale" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -w "\n%{http_code}" \
  -s)

# Extract status code and body
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo ""
echo "Response Status: $HTTP_CODE"
echo "Response Body:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "${GREEN}✅ Sync triggered successfully!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Check Vercel function logs for details"
  echo "2. Query Supabase to verify data:"
  echo "   SELECT COUNT(*) FROM finale_products;"
  echo "   SELECT COUNT(*) FROM finale_purchase_orders;"
elif [ "$HTTP_CODE" = "401" ]; then
  echo "${RED}❌ Unauthorized - Check your CRON_SECRET${NC}"
elif [ "$HTTP_CODE" = "500" ]; then
  echo "${RED}❌ Server error - Check Vercel function logs${NC}"
else
  echo "${RED}❌ Unexpected response${NC}"
fi
