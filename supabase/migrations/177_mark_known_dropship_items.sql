-- Mark known dropship items that Finale's GraphQL API doesn't expose properly
-- BLM220 is confirmed as "Dropshipped: Yes" in Finale but GraphQL doesn't expose the custom field

UPDATE inventory_items
SET is_dropship = true, updated_at = now()
WHERE UPPER(sku) = 'BLM220'
  AND (is_dropship IS NULL OR is_dropship = false);

-- Create index to speed up dropship filtering if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_inventory_items_dropship
ON inventory_items (is_dropship)
WHERE is_dropship = true;

-- Log this change using the existing audit_log schema (adjustment action)
INSERT INTO inventory_audit_log (sku, action, quantity_change, notes, reference_type)
SELECT
  'BLM220',
  'adjustment',
  0,
  'Set is_dropship=true - Finale GraphQL API does not expose Dropshipped custom field',
  'system'
WHERE EXISTS (SELECT 1 FROM inventory_items WHERE UPPER(sku) = 'BLM220');
