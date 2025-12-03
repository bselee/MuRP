#!/usr/bin/env node
/**
 * Test Finale Purchase Orders API
 * Proves we can fetch PO data from Finale
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const apiKey = process.env.VITE_FINALE_API_KEY;
const apiSecret = process.env.VITE_FINALE_API_SECRET;
const accountPath = process.env.VITE_FINALE_ACCOUNT_PATH;
const baseUrl = process.env.VITE_FINALE_BASE_URL || 'https://app.finaleinventory.com';

console.log('🧪 Testing Finale Purchase Orders API\n');
console.log('📋 Configuration:');
console.log(`   Account: ${accountPath}`);
console.log(`   Base URL: ${baseUrl}\n`);

const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

// Test 1: Get purchase orders
console.log('📥 Fetching purchase orders from Finale...\n');

try {
  const response = await fetch(`${baseUrl}/${accountPath}/api/purchase-order`, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  
  console.log('✅ Successfully fetched purchase orders!\n');
  console.log('📊 Purchase Order Summary:');
  console.log(`   Total POs: ${data.length || 0}`);
  
  if (data.length > 0) {
    console.log('\n📋 Sample Purchase Orders (first 5):');
    console.log('─'.repeat(80));
    
    data.slice(0, 5).forEach((po, idx) => {
      console.log(`\n${idx + 1}. PO #${po.purchaseOrderUrl || po.id}`);
      console.log(`   Vendor: ${po.vendorName || 'N/A'}`);
      console.log(`   Status: ${po.status || 'N/A'}`);
      console.log(`   Created: ${po.recordCreated || 'N/A'}`);
      console.log(`   Total: $${po.totalCost || '0.00'}`);
      
      if (po.purchaseOrderLineItemsCount) {
        console.log(`   Line Items: ${po.purchaseOrderLineItemsCount}`);
      }
    });
    
    console.log('\n' + '─'.repeat(80));
    console.log('\n✅ PROOF: Finale API is returning purchase order data!');
    console.log('   The data exists and is accessible.');
    console.log('   Once auto-sync runs, this data will populate Supabase.\n');
    
    // Show detailed structure of first PO
    console.log('📄 Full structure of first PO:');
    console.log(JSON.stringify(data[0], null, 2).substring(0, 1000) + '...\n');
    
  } else {
    console.log('\n⚠️  No purchase orders found in Finale account.');
    console.log('   This could mean:');
    console.log('   - No POs have been created yet');
    console.log('   - POs are in a different facility');
    console.log('   - API permissions issue\n');
  }

} catch (error) {
  console.error('\n❌ Failed to fetch purchase orders:', error.message);
  console.error('\n   Check:');
  console.error('   1. API credentials are correct');
  console.error('   2. Network connection to Finale');
  console.error('   3. Account path is valid\n');
  process.exit(1);
}
