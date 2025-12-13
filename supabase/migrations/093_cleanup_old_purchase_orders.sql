-- Migration: 093_cleanup_old_purchase_orders.sql
-- Description: Remove all POs older than current year (2025)
-- Author: System
-- Date: 2025-12-12

-- Only keep current year purchase orders for a clean, focused view

BEGIN;

-- Log before cleanup
DO $$
DECLARE
  old_po_count INTEGER;
  current_year_pos INTEGER;
BEGIN
  SELECT COUNT(*) INTO old_po_count
  FROM finale_purchase_orders
  WHERE EXTRACT(YEAR FROM order_date) < 2025;
  
  SELECT COUNT(*) INTO current_year_pos
  FROM finale_purchase_orders
  WHERE EXTRACT(YEAR FROM order_date) >= 2025;
  
  RAISE NOTICE 'PO CLEANUP:';
  RAISE NOTICE '  - Old POs to remove (before 2025): %', old_po_count;
  RAISE NOTICE '  - Current year POs to keep (2025+): %', current_year_pos;
END$$;

-- Delete all POs from before 2025
DELETE FROM finale_purchase_orders
WHERE EXTRACT(YEAR FROM order_date) < 2025
   OR order_date IS NULL;

-- Log after cleanup
DO $$
DECLARE
  remaining_pos INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_pos FROM finale_purchase_orders;
  
  RAISE NOTICE 'CLEANUP COMPLETE:';
  RAISE NOTICE '  - Remaining POs (2025 only): %', remaining_pos;
END$$;

-- Add index for order_date queries (newest first)
CREATE INDEX IF NOT EXISTS idx_finale_purchase_orders_order_date_desc 
ON finale_purchase_orders (order_date DESC);

COMMIT;

-- Verification query:
-- SELECT COUNT(*), EXTRACT(YEAR FROM order_date) as year 
-- FROM finale_purchase_orders 
-- GROUP BY year 
-- ORDER BY year DESC;
