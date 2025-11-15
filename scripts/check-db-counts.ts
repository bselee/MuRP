import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf8');
const url = envContent.match(/VITE_SUPABASE_URL="?([^"\n]+)"?/)?.[1] || '';
const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="?([^"\n]+)"?/)?.[1] || '';

const supabase = createClient(url, key);

async function getCounts() {
  const tables = ['inventory_items', 'vendors', 'boms', 'purchase_orders', 'sync_metadata'];
  
  console.log('\n📊 Database Counts:\n');
  
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.log(`❌ ${table}: Error - ${error.message}`);
    } else {
      console.log(`   ${table.padEnd(20)} : ${count || 0}`);
    }
  }
  
  // Get sync metadata details
  console.log('\n📋 Sync Metadata:\n');
  const { data: syncData } = await supabase
    .from('sync_metadata')
    .select('*')
    .order('last_sync_time', { ascending: false });
  
  if (syncData && syncData.length > 0) {
    syncData.forEach(row => {
      const ago = Math.round((Date.now() - new Date(row.last_sync_time).getTime()) / 1000 / 60);
      console.log(`   ${row.data_type.padEnd(15)} : ${row.item_count} items, ${row.success ? '✓' : '✗'} (${ago}m ago)`);
    });
  } else {
    console.log('   No sync metadata found');
  }
}

getCounts();
