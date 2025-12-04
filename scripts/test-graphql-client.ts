/**
 * Test Finale GraphQL Client
 * 
 * Tests GraphQL connection without Supabase dependency
 * 
 * Run: npx tsx scripts/test-graphql-client.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { FinaleGraphQLClient } from '../lib/finale/graphql-client';

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 Finale GraphQL Client Test');
  console.log('='.repeat(70) + '\n');

  // Get credentials from environment
  const apiKey = process.env.VITE_FINALE_API_KEY;
  const apiSecret = process.env.VITE_FINALE_API_SECRET;
  const accountPath = process.env.VITE_FINALE_ACCOUNT_PATH;
  const baseUrl = process.env.VITE_FINALE_BASE_URL || 'https://app.finaleinventory.com';

  if (!apiKey || !apiSecret || !accountPath) {
    console.error('❌ Missing environment variables:');
    console.log('   Required: VITE_FINALE_API_KEY, VITE_FINALE_API_SECRET, VITE_FINALE_ACCOUNT_PATH');
    process.exit(1);
  }

  console.log('📋 Configuration:');
  console.log(`   Account: ${accountPath}`);
  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   API Key: ${apiKey.substring(0, 4)}...`);

  // Create client
  const client = new FinaleGraphQLClient({
    apiKey,
    apiSecret,
    accountPath,
    baseUrl,
  });

  // Step 1: Test Connection
  console.log('\n📡 Step 1: Testing GraphQL connection...');
  const connectionTest = await client.testConnection();
  
  if (!connectionTest.success) {
    console.error(`❌ Failed: ${connectionTest.message}`);
    process.exit(1);
  }

  console.log(`✅ Connected! Sample count: ${connectionTest.sampleCount} POs`);

  // Step 2: Fetch Sample POs
  console.log('\n📥 Step 2: Fetching sample purchase orders (limit 5)...');
  const sampleResult = await client.fetchPurchaseOrders({ limit: 5 });
  
  if (sampleResult.totalFetched === 0) {
    console.warn('⚠️ No purchase orders found in Finale');
    console.log('   This is OK if account has no POs yet');
  } else {
    console.log(`✅ Fetched ${sampleResult.totalFetched} purchase orders`);
    
    // Display first PO details
    if (sampleResult.data.length > 0) {
      const firstPO = sampleResult.data[0];
      console.log('\n   Sample PO:');
      console.log(`   - Order ID: ${firstPO.orderId}`);
      console.log(`   - Vendor: ${firstPO.supplierName} (${firstPO.supplier})`);
      console.log(`   - Status: ${firstPO.status}`);
      console.log(`   - Date: ${firstPO.orderDate}`);
      console.log(`   - Total: $${firstPO.total}`);
      console.log(`   - Line Items: ${firstPO.lineItems?.length || 0}`);
      
      if (firstPO.lineItems && firstPO.lineItems.length > 0) {
        console.log('\n   First line item:');
        const item = firstPO.lineItems[0];
        console.log(`   - Product: ${item.productId}`);
        console.log(`   - Quantity: ${item.quantity}`);
        console.log(`   - Unit Cost: $${item.unitCost}`);
        console.log(`   - Total: $${item.total}`);
      }
    }
  }

  // Step 3: Test Pagination
  console.log('\n📄 Step 3: Testing pagination...');
  console.log(`   Has next page: ${sampleResult.hasNextPage}`);
  console.log(`   End cursor: ${sampleResult.endCursor ? 'Present' : 'None'}`);

  if (sampleResult.hasNextPage) {
    console.log('   Fetching next page...');
    const nextPage = await client.fetchPurchaseOrders({ 
      limit: 5, 
      cursor: sampleResult.endCursor 
    });
    console.log(`✅ Next page: ${nextPage.totalFetched} POs`);
  } else {
    console.log('✅ No additional pages (total POs <= 5)');
  }

  // Step 4: Test Delta Sync (recent POs)
  console.log('\n🔄 Step 4: Testing delta sync (last 30 days)...');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const recentResult = await client.fetchPurchaseOrders({
    limit: 10,
    dateFrom: thirtyDaysAgo,
  });
  
  console.log(`✅ Found ${recentResult.totalFetched} POs modified in last 30 days`);

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📋 Test Summary');
  console.log('='.repeat(70));
  console.log(`✅ GraphQL Connection: Working`);
  console.log(`✅ Sample PO Fetch: ${sampleResult.totalFetched} POs retrieved`);
  console.log(`✅ Pagination: ${sampleResult.hasNextPage ? 'Multiple pages available' : 'Single page'}`);
  console.log(`✅ Delta Sync: ${recentResult.totalFetched} recent POs`);
  console.log('\n' + '='.repeat(70));
  console.log('✅ All GraphQL client tests passed!\n');
}

main().catch(error => {
  console.error('\n❌ Test failed with error:', error);
  process.exit(1);
});
