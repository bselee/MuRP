const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

(async () => {
    const { count, error } = await supabase
        .from('boms')
        .select('*', { count: 'exact', head: true }); 
        
    console.log(`Total BOMs (active + inactive): ${count}`);
    
    // Check inactive ones
     const { count: inactiveCount } = await supabase
        .from('boms')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', false);
        
    console.log(`Inactive BOMs: ${inactiveCount}`);
})();
