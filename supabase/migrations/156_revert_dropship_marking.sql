-- Revert the blanket dropship marking from migration 155
-- Items like AC Infinity can be either dropshipped OR stocked
-- We should only mark items as dropship if they have "(Dropship)" in the name

-- Reset all items to is_dropship = false
UPDATE inventory_items
SET is_dropship = false
WHERE is_dropship = true;

-- Only mark items with explicit "Dropship" in the name
UPDATE inventory_items
SET is_dropship = true
WHERE name ILIKE '%dropship%'
   OR name ILIKE '%drop ship%'
   OR name ILIKE '%drop-ship%';

-- Log results
DO $$
DECLARE
  marked_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO marked_count
  FROM inventory_items
  WHERE is_dropship = true;

  RAISE NOTICE 'Marked % items as dropship based on name containing "dropship"', marked_count;
END $$;
