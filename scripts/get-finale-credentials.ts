/**
 * Retrieve Finale credentials from Supabase Vault
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment
dotenv.config({ path: '.env.production' });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials');
  console.error('   SUPABASE_URL:', !!SUPABASE_URL);
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', !!SUPABASE_SERVICE_KEY);
  process.exit(1);
}

async function getFinaleCredentials() {
  console.log('🔍 Connecting to Supabase...');
  console.log(`   URL: ${SUPABASE_URL}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log('\n🔐 Querying vault for Finale credentials...');

  const { data, error } = await supabase
    .from('vault')
    .select('name, secret, description, updated_at')
    .eq('name', 'finale_credentials')
    .single();

  if (error) {
    console.error('\n❌ Error querying vault:', error.message);
    if (error.message.includes('relation') || error.message.includes('does not exist')) {
      console.log('\n💡 The vault table may not exist. Checking schema...');

      // Try to list all tables
      const { data: tables, error: tablesError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');

      if (!tablesError && tables) {
        console.log('\n📋 Available tables:', tables.map(t => t.table_name).join(', '));
      }
    }
    process.exit(1);
  }

  if (!data) {
    console.log('\n⚠️  No credentials found in vault');
    console.log('   Credential name searched: "finale_credentials"');
    console.log('\n💡 You need to store credentials first. Use the Finale settings panel in the app.');
    process.exit(1);
  }

  console.log('\n✅ Found credentials in vault!');
  console.log(`   Name: ${data.name}`);
  console.log(`   Description: ${data.description || 'N/A'}`);
  console.log(`   Last Updated: ${data.updated_at || 'N/A'}`);

  try {
    const credentials = JSON.parse(data.secret);

    console.log('\n📝 Credential Structure:');
    console.log(`   API Key: ${credentials.apiKey?.substring(0, 8)}...`);
    console.log(`   API Secret: ${credentials.apiSecret ? '***' : 'MISSING'}`);
    console.log(`   Account Path: ${credentials.accountPath || 'MISSING'}`);
    console.log(`   Base URL: ${credentials.baseUrl || 'https://app.finaleinventory.com'}`);

    console.log('\n\n' + '='.repeat(80));
    console.log('📋 ENV VARIABLES TO SET');
    console.log('='.repeat(80));
    console.log('\nAdd these to your .env.local file:\n');
    console.log(`VITE_FINALE_API_KEY="${credentials.apiKey || ''}"`);
    console.log(`VITE_FINALE_API_SECRET="${credentials.apiSecret || ''}"`);
    console.log(`VITE_FINALE_ACCOUNT_PATH="${credentials.accountPath || ''}"`);
    console.log(`VITE_FINALE_BASE_URL="${credentials.baseUrl || 'https://app.finaleinventory.com'}"`);

    console.log('\n\nAnd these for the Vercel API proxy (without VITE_ prefix):\n');
    console.log(`FINALE_API_KEY="${credentials.apiKey || ''}"`);
    console.log(`FINALE_API_SECRET="${credentials.apiSecret || ''}"`);
    console.log(`FINALE_ACCOUNT_PATH="${credentials.accountPath || ''}"`);
    console.log(`FINALE_BASE_URL="${credentials.baseUrl || 'https://app.finaleinventory.com'}"`);

    console.log('\n' + '='.repeat(80));

    return credentials;
  } catch (parseError) {
    console.error('\n❌ Error parsing credentials:', parseError);
    console.log('   Raw secret (first 100 chars):', data.secret.substring(0, 100));
    process.exit(1);
  }
}

getFinaleCredentials()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
