// Browser test for Finale GraphQL connection
// Run this in browser console after logging in

async function testFinaleGraphQL() {
  console.log('🧪 Testing Finale GraphQL connection...');

  try {
    // Test if client is configured
    const { getFinaleGraphQLClient } = await import('/src/lib/finale/graphql-client.ts');
    const client = getFinaleGraphQLClient();

    if (!client) {
      console.log('❌ GraphQL client not configured - check environment variables');
      return;
    }

    console.log('✅ GraphQL client configured');

    // Test connection
    const testResult = await client.testConnection();
    console.log('Connection test:', testResult);

    if (testResult.success) {
      // Fetch all POs
      console.log('📥 Fetching all purchase orders...');
      const pos = await client.fetchAllPurchaseOrders();
      console.log(`✅ Found ${pos.length} purchase orders in Finale`);

      if (pos.length > 0) {
        console.log('Sample PO:', pos[0]);
      } else {
        console.log('ℹ️ No purchase orders found in Finale');
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Auto-run
testFinaleGraphQL();