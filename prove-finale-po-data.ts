#!/usr/bin/env tsx
/**
 * PROOF: Fetch Purchase Orders from Finale API
 * 
 * This script demonstrates that we CAN get PO data from Finale
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

// Mock import.meta.env for Node
global.import = global.import || {};
global.import.meta = { env: process.env };

const { FinaleClient } = await import('../lib/finale/client.js');

const finaleConfig = {
  apiKey: process.env.VITE_FINALE_API_KEY!,
  apiSecret: process.env.VITE_FINALE_API_SECRET!,
  accountPath: process.env.VITE_FINALE_ACCOUNT_PATH!,
  baseUrl: process.env.VITE_FINALE_BASE_URL || 'https://app.finaleinventory.com',
};

console.log('🧪 PROOF: Fetching Purchase Orders from Finale\n');
console.log('📋 Configuration:');
console.log(`   Account: ${finaleConfig.accountPath}`);
console.log(`   Base URL: ${finaleConfig.baseUrl}\n`);

const client = new FinaleClient(finaleConfig);

console.log('🔌 Testing connection...');
const testResult = await client.testConnection();

if (!testResult.success) {
  console.error('❌ Connection failed:', testResult.message);
  process.exit(1);
}

console.log('✅ Connected to Finale API\n');

console.log('📥 Fetching purchase orders (limit 5)...\n');

try {
  const pos = await client.fetchPurchaseOrders({ limit: 5 });
  
  console.log('✅ SUCCESS! Fetched purchase orders from Finale\n');
  console.log('═'.repeat(80));
  console.log(`📊 TOTAL PURCHASE ORDERS FOUND: ${pos.length}`);
  console.log('═'.repeat(80));
  
  if (pos.length > 0) {
    console.log('\n📋 Purchase Order Details:\n');
    
    pos.forEach((po, idx) => {
      console.log(`${idx + 1}. ${po.purchaseOrderUrl || 'PO-' + (po.id || 'unknown')}`);
      console.log(`   Vendor: ${po.vendorName || 'N/A'}`);
      console.log(`   Status: ${po.status || 'N/A'}`);
      console.log(`   Created: ${po.recordCreated || 'N/A'}`);
      console.log(`   Notes: ${po.notes?.substring(0, 50) || 'None'}${po.notes?.length > 50 ? '...' : ''}`);
      console.log('');
    });
    
    console.log('─'.repeat(80));
    console.log('\n✅ PROOF COMPLETE: Finale API is returning purchase order data!');
    console.log('   Once auto-sync runs or seed script executes,');
    console.log('   this data will populate the Supabase database.\n');
    
    console.log('📄 Sample PO structure:');
    console.log(JSON.stringify(pos[0], null, 2).substring(0, 500) + '...\n');
    
  } else {
    console.log('\n⚠️  No purchase orders found.');
    console.log('   Possible reasons:');
    console.log('   - No POs created in Finale yet');
    console.log('   - POs are in a different facility');
    console.log('   - Permissions issue\n');
  }
  
} catch (error) {
  console.error('\n❌ Failed to fetch purchase orders:');
  console.error('   Error:', error.message);
  if (error.stack) {
    console.error('\n   Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
  }
  process.exit(1);
}
