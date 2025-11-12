/**
 * Debug script to check what columns are in the Finale CSV
 * and what vendors exist in the database
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const finaleReportUrl = process.env.FINALE_INVENTORY_REPORT_URL!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugVendors() {
  console.log('\n=== VENDOR DEBUG REPORT ===\n');

  // 1. Check vendors in database
  console.log('1. Checking vendors table...');
  const { data: vendors, error: vendorError } = await supabase
    .from('vendors')
    .select('id, name')
    .limit(10);

  if (vendorError) {
    console.error('❌ Error fetching vendors:', vendorError);
  } else {
    console.log(`✓ Found ${vendors?.length || 0} vendors in database`);
    if (vendors && vendors.length > 0) {
      console.log('Sample vendors:');
      vendors.slice(0, 5).forEach(v => console.log(`  - ${v.name} (${v.id})`));
    } else {
      console.log('⚠️  No vendors found in database!');
    }
  }

  // 2. Fetch CSV and check columns
  console.log('\n2. Checking Finale CSV columns...');
  if (!finaleReportUrl) {
    console.error('❌ FINALE_INVENTORY_REPORT_URL not set');
    return;
  }

  try {
    const response = await fetch(finaleReportUrl);
    const csvText = await response.text();
    const lines = csvText.split('\n');
    const headerLine = lines[0];
    const columns = headerLine.split(',').map(col => col.trim().replace(/"/g, ''));

    console.log(`✓ CSV has ${columns.length} columns`);
    console.log('\nLooking for vendor-related columns:');
    
    const vendorColumns = columns.filter(col => 
      col.toLowerCase().includes('vendor') || 
      col.toLowerCase().includes('supplier') ||
      col.toLowerCase().includes('supp')
    );

    if (vendorColumns.length > 0) {
      vendorColumns.forEach(col => console.log(`  ✓ "${col}"`));
    } else {
      console.log('  ❌ No vendor/supplier columns found!');
    }

    console.log('\nAll columns:');
    columns.forEach((col, i) => {
      if (i < 20) {
        console.log(`  ${i + 1}. "${col}"`);
      }
    });
    if (columns.length > 20) {
      console.log(`  ... and ${columns.length - 20} more columns`);
    }

    // 3. Check a sample row
    console.log('\n3. Sample row data:');
    if (lines.length > 1) {
      const sampleRow = lines[1].split(',');
      console.log('\nFirst 10 column values:');
      columns.slice(0, 10).forEach((col, i) => {
        console.log(`  ${col}: "${sampleRow[i] || ''}"`);
      });
    }

  } catch (error) {
    console.error('❌ Error fetching CSV:', error);
  }

  // 4. Check inventory_items for vendor_id
  console.log('\n4. Checking inventory_items vendor_id...');
  const { data: items, error: itemError } = await supabase
    .from('inventory_items')
    .select('sku, name, vendor_id')
    .not('vendor_id', 'is', null)
    .limit(5);

  if (itemError) {
    console.error('❌ Error fetching items:', itemError);
  } else {
    console.log(`✓ Found ${items?.length || 0} items with vendor_id set`);
    if (items && items.length > 0) {
      items.forEach(item => console.log(`  - ${item.sku}: vendor_id="${item.vendor_id}"`));
    } else {
      console.log('⚠️  No items have vendor_id set!');
    }
  }

  console.log('\n=== END DEBUG REPORT ===\n');
}

debugVendors().catch(console.error);
