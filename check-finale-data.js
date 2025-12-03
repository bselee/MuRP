#!/usr/bin/env node
/**
 * Quick script to check if Finale data has been synced to Supabase
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://mpuevsmtowyexhsqugkm.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdWV2c210b3d5ZXhoc3F1Z2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NDA3MzYsImV4cCI6MjA3NzMxNjczNn0.ewucknfYUMY-unX6tuu-s9iDO6uQykKqM7klOPDE27I';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  console.log('🔍 Checking Finale data sync status...\n');

  try {
    // Check inventory
    const { count: inventoryCount, error: invError } = await supabase
      .from('inventory')
      .select('*', { count: 'exact', head: true });
    
    if (invError) throw invError;
    console.log(`📦 Inventory items: ${inventoryCount || 0}`);

    // Check vendors
    const { count: vendorCount, error: vendorError } = await supabase
      .from('vendors')
      .select('*', { count: 'exact', head: true });
    
    if (vendorError) throw vendorError;
    console.log(`🏢 Vendors: ${vendorCount || 0}`);

    // Check purchase orders
    const { count: poCount, error: poError } = await supabase
      .from('purchase_orders')
      .select('*', { count: 'exact', head: true });
    
    if (poError) throw poError;
    console.log(`📋 Purchase Orders: ${poCount || 0}`);

    // Check BOMs
    const { count: bomCount, error: bomError } = await supabase
      .from('boms')
      .select('*', { count: 'exact', head: true });
    
    if (bomError) throw bomError;
    console.log(`🔧 BOMs: ${bomCount || 0}`);

    console.log('\n✅ Database check complete!');

    // Check if data exists
    const hasData = (inventoryCount || 0) > 0 || (vendorCount || 0) > 0 || (poCount || 0) > 0 || (bomCount || 0) > 0;
    
    if (!hasData) {
      console.log('\n⚠️  No data found in database!');
      console.log('📝 This means the auto-sync has not run yet or failed.');
      console.log('\nPossible reasons:');
      console.log('  1. App.tsx auto-sync initialization hasn\'t run yet (needs page load)');
      console.log('  2. Finale API credentials are incorrect');
      console.log('  3. Network connectivity issue to Finale API');
      console.log('  4. RLS policies blocking inserts (check VITE_ENABLE_RLS flag)');
      console.log('\n💡 Try:');
      console.log('  - Start dev server: npm run dev');
      console.log('  - Open browser to http://localhost:5173');
      console.log('  - Check browser console for auto-sync logs');
      console.log('  - Look for "[FinaleAutoSync]" messages');
    } else {
      console.log('\n✅ Data successfully synced from Finale!');
    }

  } catch (error) {
    console.error('❌ Error checking data:', error.message);
    process.exit(1);
  }
}

checkData();
