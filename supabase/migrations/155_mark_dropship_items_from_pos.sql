-- Mark items as dropship based on PO naming pattern
-- Items that appear on POs with "dropship" in the order_id are dropshipped

-- Extract all SKUs from dropship POs and mark them
UPDATE inventory_items
SET is_dropship = true
WHERE sku IN (
  SELECT DISTINCT jsonb_array_elements(line_items)->>'product_id' as sku
  FROM finale_purchase_orders
  WHERE order_id ILIKE '%dropship%'
);

-- Log how many were updated
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM inventory_items
  WHERE is_dropship = true;

  RAISE NOTICE 'Marked % items as dropship based on PO history', updated_count;
END $$;
