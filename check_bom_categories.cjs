const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

(async () => {
    const { data: boms } = await supabase
        .from('boms')
        .select('name, category, finished_sku')
        .eq('is_active', true);
        
    const categories = new Set(boms.map(b => b.category));
    console.log('Unique BOM Categories:', Array.from(categories));
    
    // Check if these match default exclusions
    const DEFAULT_EXCLUDED = ['deprecating', 'deprecated', 'discontinued'];
    
    boms.forEach(b => {
        const cat = (b.category || '').toLowerCase().trim();
        const exclude = DEFAULT_EXCLUDED.some(e => cat.includes(e));
        if (exclude) {
            console.log(`BOM ${b.finished_sku} would be excluded due to category: ${b.category}`);
        }
    });
})();
