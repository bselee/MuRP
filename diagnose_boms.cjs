const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(url, key);

(async () => {
    // 1. Count active BOMs
    const { count: bomCount, error: countError } = await supabase
        .from('boms')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
    
    if (countError) console.error('BOM Count Error:', countError);
    console.log(`Total Active BOMs in DB: ${bomCount}`);

    // 2. Fetch a sample of BOMs
    const { data: boms, error: bomError } = await supabase
        .from('boms')
        .select('name, finished_sku, is_active')
        .eq('is_active', true)
        .limit(20);
        
    if (bomError) {
        console.error('BOM Fetch Error:', bomError);
        return;
    }

    console.log(`Sample BOMs:`, boms);

    // 3. Check if their finished_sku exists in inventory_items
    const skus = boms.map(b => b.finished_sku).filter(s => s);
    
    const { data: inventory, error: invError } = await supabase
        .from('inventory_items')
        .select('sku, is_active')
        .in('sku', skus);
        
    if (invError) console.error('Inventory Fetch Error:', invError);
    
    console.log('Matching Inventory Items:', inventory);
    
    // Check match rate
    const invSkus = new Set(inventory.map(i => i.sku));
    const invActiveSkus = new Set(inventory.filter(i => i.is_active).map(i => i.sku));
    
    boms.forEach(b => {
        const inInv = invSkus.has(b.finished_sku);
        const isActiveInInv = invActiveSkus.has(b.finished_sku);
        console.log(`BOM ${b.finished_sku} (${b.name}): In Inv? ${inInv}, Active in Inv? ${isActiveInInv}`);
    });

})();
