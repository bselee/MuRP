const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

(async () => {
    const { data } = await supabase
        .from('inventory_items')
        .select('*')
    .eq('sku', 'C6P101');
    console.log(JSON.stringify(data, null, 2));
})();
