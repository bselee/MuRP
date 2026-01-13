const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

(async () => {
  const skus = ['CGT103', 'CGT104'];
  
  // Inventory Items
  const { data: items } = await supabase
    .from('inventory_items')
    .select('sku, category, status')
    .in('sku', skus);
    
  console.log('Inventory Items:', items);

  // BOMs
  const { data: boms } = await supabase
    .from('boms')
    .select('finished_sku, category, is_active')
    .in('finished_sku', skus);
    
  console.log('BOMs:', boms);
})();
