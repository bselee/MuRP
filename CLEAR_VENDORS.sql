-- Clear vendors and all related data safely
-- This handles foreign key constraints by truncating in the correct order

-- First, truncate inventory_items (child table)
TRUNCATE TABLE inventory_items CASCADE;

-- Then truncate vendors (parent table)
TRUNCATE TABLE vendors CASCADE;

-- Verify
SELECT COUNT(*) as inventory_count FROM inventory_items;
SELECT COUNT(*) as vendors_count FROM vendors;

SELECT 'Database cleared successfully. Ready for fresh vendor sync.' as status;
