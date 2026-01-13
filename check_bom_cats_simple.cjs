const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

(async () => {
    const { data: boms, error } = await supabase
        .from('boms')
        .select('name, category, finished_sku')
        .eq('is_active', true);
        
    if(error) console.log(error);

    console.log(`Found ${boms.length} active BOMs.`);
    const cats = {};
    boms.forEach(b => {
        cats[b.category] = (cats[b.category] || 0) + 1;
    });
    console.log('Categories:', cats);
})();
