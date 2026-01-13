const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

(async () => {
  const { count, error } = await supabase
    .from('inventory_items')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  if (error) console.error(error);
  console.log(`Total active items: ${count}`);
  
  // Check default fetch limit
  const { data } = await supabase
    .from('inventory_items')
    .select('sku')
    .eq('is_active', true);
    
  console.log(`Fetched without limit: ${data.length}`);
})();
