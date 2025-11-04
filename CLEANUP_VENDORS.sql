-- Clean up malformed vendors in Supabase
-- Run this in Supabase SQL Editor before re-syncing

-- Delete vendors with no name or malformed names
DELETE FROM vendors
WHERE name IS NULL 
   OR name = '' 
   OR name = '--'
   OR name LIKE ',%%'
   OR name LIKE '.%%'
   OR name LIKE '-%%'
   OR name LIKE '_%%'
   OR LOWER(name) = 'various';

-- Check how many good vendors remain
SELECT COUNT(*) as good_vendors_count FROM vendors;

-- Preview remaining vendors
SELECT id, name, city, state, data_source, last_sync_at
FROM vendors
ORDER BY name
LIMIT 20;
