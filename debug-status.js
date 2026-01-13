import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(url, key);

(async () => {
  console.log('Checking inventory_items statuses...');
  
  const { data, error } = await supabase
    .from('inventory_items')
    .select('status, category, sku, is_dropship')
    .limit(100);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Fetched ${data.length} items`);
  
  const statuses = new Set(data.map(i => i.status));
  console.log('Unique statuses:', Array.from(statuses));
  
  const categories = new Set(data.map(i => i.category));
  console.log('Unique categories:', Array.from(categories));

  // Check how many would be excluded by the logic
  const ALWAYS_EXCLUDED_CATEGORIES = [
    'dropship', 'drop ship', 'dropshipped', 'ds', 'drop-ship',
    'deprecating', 'deprecated', 'discontinued',
  ];

  let excludedCount = 0;
  data.forEach(item => {
    let excluded = false;
    let reason = '';

    if (item.is_dropship === true) {
       excluded = true; reason = 'is_dropship';
    } else if (item.status && item.status.toLowerCase() !== 'active') {
       excluded = true; reason = `status (${item.status})`;
    } else {
        const cat = (item.category || '').toLowerCase().trim();
        if (ALWAYS_EXCLUDED_CATEGORIES.some(exc => cat.includes(exc))) {
            excluded = true; reason = `category (${item.category})`;
        }
    }

    if (excluded) {
        excludedCount++;
        // console.log(`Excluded ${item.sku}: ${reason}`);
    }
  });

  console.log(`Would exclude ${excludedCount} out of ${data.length} items with basic logic.`);

})();
