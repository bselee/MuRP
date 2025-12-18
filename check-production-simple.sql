SELECT 
  COUNT(*) as total_pos,
  COUNT(*) FILTER (WHERE is_active = true) as active_pos,
  COUNT(*) FILTER (WHERE is_active = true AND order_date >= '2024-01-01') as recent_active_pos,
  COUNT(*) FILTER (WHERE is_active = true AND order_date >= '2024-01-01' AND order_id NOT ILIKE '%dropship%') as non_dropship_2024_plus
FROM finale_purchase_orders;

-- Sample recent POs
SELECT order_id, order_date, vendor_name, status
FROM finale_purchase_orders
WHERE is_active = true 
  AND order_date >= '2024-01-01'
  AND order_id NOT ILIKE '%dropship%'
ORDER BY order_date DESC
LIMIT 30;
