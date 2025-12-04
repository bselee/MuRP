// Check if Finale environment variables are available in browser
// Run this in browser console

console.log('🔍 Checking Finale environment variables in browser:');
console.log('VITE_FINALE_API_KEY:', import.meta.env.VITE_FINALE_API_KEY ? '✅ SET' : '❌ NOT SET');
console.log('VITE_FINALE_API_SECRET:', import.meta.env.VITE_FINALE_API_SECRET ? '✅ SET' : '❌ NOT SET');
console.log('VITE_FINALE_ACCOUNT_PATH:', import.meta.env.VITE_FINALE_ACCOUNT_PATH ? '✅ SET' : '❌ NOT SET');
console.log('VITE_FINALE_BASE_URL:', import.meta.env.VITE_FINALE_BASE_URL ? '✅ SET' : '❌ NOT SET');

// Test GraphQL client creation
console.log('\n🧪 Testing GraphQL client creation...');
try {
  import('/src/lib/finale/graphql-client.ts').then(({ getFinaleGraphQLClient }) => {
    const client = getFinaleGraphQLClient();
    if (client) {
      console.log('✅ GraphQL client created successfully');
    } else {
      console.log('❌ GraphQL client creation failed - check env vars');
    }
  });
} catch (error) {
  console.log('❌ Error importing GraphQL client:', error);
}