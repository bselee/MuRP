#!/bin/bash
# Quick data validation script - check actual database state

echo "=== VERIFYING AGENT DATA QUALITY ==="
echo ""

# Check if we have real vendor data
echo "1. VENDOR DATA CHECK:"
psql $DATABASE_URL -c "SELECT COUNT(*) as vendor_count, 
  COUNT(CASE WHEN email IS NOT NULL THEN 1 END) as with_email,
  COUNT(CASE WHEN phone IS NOT NULL THEN 1 END) as with_phone,
  COUNT(CASE WHEN address IS NOT NULL THEN 1 END) as with_address
FROM vendors;" 2>/dev/null || echo "  ❌ Cannot connect to database"

echo ""
echo "2. PURCHASE ORDER DATA CHECK:"
psql $DATABASE_URL -c "SELECT COUNT(*) as total_pos,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
  COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
  COUNT(CASE WHEN ship_to_address IS NOT NULL THEN 1 END) as has_ship_to
FROM purchase_orders;" 2>/dev/null || echo "  ❌ Cannot connect to database"

echo ""
echo "3. FINALE PO DATA CHECK:"
psql $DATABASE_URL -c "SELECT COUNT(*) as finale_pos,
  COUNT(CASE WHEN line_items IS NOT NULL THEN 1 END) as with_items,
  COUNT(CASE WHEN vendor_id IS NOT NULL THEN 1 END) as with_vendor
FROM finale_purchase_orders 
WHERE created_at > NOW() - INTERVAL '90 days';" 2>/dev/null || echo "  ❌ Cannot connect to database"

echo ""
echo "4. INVENTORY DATA CHECK:"
psql $DATABASE_URL -c "SELECT COUNT(*) as total_items,
  COUNT(CASE WHEN quantity_on_hand > 0 THEN 1 END) as in_stock,
  COUNT(CASE WHEN quantity_on_hand = 0 THEN 1 END) as out_of_stock
FROM inventory;" 2>/dev/null || echo "  ❌ Cannot connect to database"
