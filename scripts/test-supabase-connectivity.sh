#!/bin/bash
# Test Supabase Auth API connectivity

SUPABASE_URL="https://mpuevsmtowyexhsqugkm.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdWV2c210b3d5ZXhoc3F1Z2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NDA3MzYsImV4cCI6MjA3NzMxNjczNn0.ewucknfYUMY-unX6tuu-s9iDO6uQykKqM7klOPDE27I"

echo "Testing Supabase Auth API connectivity..."
echo "URL: $SUPABASE_URL"
echo ""

echo "Test 1: Check if auth endpoint is reachable..."
time curl -s -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  "$SUPABASE_URL/auth/v1/health" || echo "Failed to connect"

echo ""
echo "Test 2: Try to get session (should return 401 or similar, but quickly)..."
time curl -s -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  "$SUPABASE_URL/auth/v1/user" || echo "Failed to connect"

echo ""
echo "Test 3: DNS resolution check..."
nslookup mpuevsmtowyexhsqugkm.supabase.co || echo "DNS failed"

echo ""
echo "Test 4: Ping test..."
ping -c 3 mpuevsmtowyexhsqugkm.supabase.co || echo "Ping failed"
