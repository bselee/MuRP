-- Count all rows
SELECT 'Total POs:' as metric, COUNT(*)::text as value FROM finale_purchase_orders
UNION ALL
SELECT 'Active POs:', COUNT(*)::text FROM finale_purchase_orders WHERE is_active = true
UNION ALL
SELECT '2024+ POs:', COUNT(*)::text FROM finale_purchase_orders WHERE order_date >= '2024-01-01'
UNION ALL
SELECT '2024+ Non-Dropship:', COUNT(*)::text FROM finale_purchase_orders WHERE order_date >= '2024-01-01' AND order_id NOT ILIKE '%dropship%';

-- Sample recent POs
SELECT '--- Sample 2024+ POs ---' as info;
SELECT order_id, order_date, vendor_name, status
FROM finale_purchase_orders
WHERE order_date >= '2024-01-01'
AND is_active = true
ORDER BY order_date DESC
LIMIT 20;
