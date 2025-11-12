/**
 * Debug script to check vendor_id in inventory_items
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkVendorIds() {
  console.log('\n=== VENDOR ID CHECK ===\n');

  // Check vendors table
  const { data: vendors, error: vError } = await supabase
    .from('vendors')
    .select('id, name')
    .limit(10);

  console.log('1. Vendors in database:');
  if (vError) {
    console.error('Error:', vError);
  } else {
    console.log(`Found ${vendors?.length || 0} vendors`);
    vendors?.forEach(v => console.log(`  - ID: "${v.id}", Name: "${v.name}"`));
  }

  // Check inventory items vendor_id
  console.log('\n2. Sample inventory items:');
  const { data: items, error: iError } = await supabase
    .from('inventory_items')
    .select('sku, name, vendor_id')
    .limit(20);

  if (iError) {
    console.error('Error:', iError);
  } else {
    console.log(`Found ${items?.length || 0} items`);
    const withVendor = items?.filter(i => i.vendor_id) || [];
    const withoutVendor = items?.filter(i => !i.vendor_id) || [];
    
    console.log(`\n  ✓ Items WITH vendor_id: ${withVendor.length}`);
    withVendor.slice(0, 5).forEach(i => 
      console.log(`    - ${i.sku}: vendor_id="${i.vendor_id}"`)
    );
    
    console.log(`\n  ✗ Items WITHOUT vendor_id: ${withoutVendor.length}`);
    withoutVendor.slice(0, 5).forEach(i => 
      console.log(`    - ${i.sku}: vendor_id=${i.vendor_id}`)
    );
  }

  // Check if vendor IDs match
  if (vendors && vendors.length > 0 && items && items.length > 0) {
    const vendorIds = new Set(vendors.map(v => v.id));
    const itemVendorIds = items.map(i => i.vendor_id).filter(Boolean);
    const matching = itemVendorIds.filter(id => vendorIds.has(id));
    
    console.log(`\n3. Vendor ID matching:`);
    console.log(`  - Vendor IDs in vendors table: ${vendorIds.size}`);
    console.log(`  - Unique vendor IDs in items: ${new Set(itemVendorIds).size}`);
    console.log(`  - Matching IDs: ${new Set(matching).size}`);
  }
}

checkVendorIds().catch(console.error);
