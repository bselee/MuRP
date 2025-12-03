-- Check what data is currently in the database

-- Inventory count and sample
SELECT 
  'Inventory' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active_items
FROM inventory;

-- Sample inventory item
SELECT 
  sku,
  name,
  stock,
  on_order,
  min_stock,
  cost,
  price,
  updated_at
FROM inventory 
LIMIT 1;

-- Purchase Orders count
SELECT 
  'Purchase Orders' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft,
  COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted
FROM purchase_orders;

-- Sync log status
SELECT 
  source,
  status,
  records_processed,
  api_calls,
  completed_at
FROM sync_log
ORDER BY completed_at DESC
LIMIT 5;
