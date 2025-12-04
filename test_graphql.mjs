import { getFinaleGraphQLClient } from './lib/finale/graphql-client.js';

async function testGraphQL() {
  try {
    console.log('Testing Finale GraphQL client...');

    const client = getFinaleGraphQLClient();
    if (!client) {
      console.log('❌ GraphQL client not configured');
      return;
    }

    console.log('✅ GraphQL client configured');

    const pos = await client.fetchAllPurchaseOrders();
    console.log('✅ Fetched', pos.length, 'POs from Finale');

    if (pos.length > 0) {
      console.log('Sample PO:', JSON.stringify(pos[0], null, 2));
    } else {
      console.log('ℹ️ No POs found in Finale');
    }
  } catch (err) {
    console.log('❌ Error:', err.message);
    console.log('Stack:', err.stack);
  }
}

testGraphQL();