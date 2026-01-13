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
  console.log('Checking BOMs CGT103 and CGT104...');
  
  // Check BOMs table
  const { data: boms, error: bomError } = await supabase
    .from('boms')
    .select('finished_sku, name, category, status')
    .in('finished_sku', ['CGT103', 'CGT104']);

  if (bomError) {
    console.error('BOM Error:', bomError);
  } else {
    console.log('BOMs found:', boms);
  }

  // Check Inventory Items table
  const { data: items, error: invError } = await supabase
    .from('inventory_items')
    .select('sku, category, status')
    .in('sku', ['CGT103', 'CGT104']);

    if (invError) {
        console.error('Inventory Error:', invError);
    } else {
        console.log('Inventory Items found:', items);
    }

})();
