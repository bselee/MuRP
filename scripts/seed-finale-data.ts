#!/usr/bin/env tsx
/**
 * Seed Finale Data to Supabase
 * 
 * This script runs once to populate the database with initial data from Finale.
 * After seeding, auto-sync keeps the data updated.
 * 
 * Usage:
 *   npm run seed-finale
 * 
 * Or automatically via:
 *   - Vercel build: Add to package.json "postinstall" script
 *   - GitHub Actions: Add to deployment workflow
 *   - Manual: Run once after deployment
 */

import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local' });

// Import after env is loaded
const { createClient } = await import('@supabase/supabase-js');
const { getFinaleSyncService } = await import('../services/finaleSyncService.js');
const { FinaleClient } = await import('../lib/finale/client.js');

async function seedFinaleData() {
  console.log('🌱 Starting Finale data seeding...\n');

  // Check for Finale credentials
  const apiKey = process.env.VITE_FINALE_API_KEY;
  const apiSecret = process.env.VITE_FINALE_API_SECRET;
  const accountPath = process.env.VITE_FINALE_ACCOUNT_PATH;
  const baseUrl = process.env.VITE_FINALE_BASE_URL || 'https://app.finaleinventory.com';

  // Check for Supabase credentials
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!apiKey || !apiSecret || !accountPath) {
    console.error('❌ Missing Finale credentials!');
    console.error('Required environment variables:');
    console.error('  - VITE_FINALE_API_KEY');
    console.error('  - VITE_FINALE_API_SECRET');
    console.error('  - VITE_FINALE_ACCOUNT_PATH');
    console.error('\nMake sure these are set in .env.local or environment');
    process.exit(1);
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials!');
    console.error('Required environment variables:');
    console.error('  - VITE_SUPABASE_URL (or SUPABASE_URL)');
    console.error('  - VITE_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)');
    process.exit(1);
  }

  console.log('✅ Credentials found');
  console.log(`   Finale Account: ${accountPath}`);
  console.log(`   Supabase URL: ${supabaseUrl.substring(0, 30)}...`);
  console.log(`   Base URL: ${baseUrl}\n`);

  try {
    // Set up global process.env for modules that need it
    if (!process.env.VITE_SUPABASE_URL) process.env.VITE_SUPABASE_URL = supabaseUrl;
    if (!process.env.VITE_SUPABASE_ANON_KEY) process.env.VITE_SUPABASE_ANON_KEY = supabaseKey;

    // Initialize Finale client directly
    const finaleConfig = {
      apiKey,
      apiSecret,
      accountPath,
      baseUrl,
    };

    console.log('🔧 Configuring Finale client...');
    const client = new FinaleClient(finaleConfig);

    // Test connection
    console.log('🔌 Testing connection to Finale API...');
    const testResult = await client.testConnection();

    if (!testResult.success) {
      console.error('❌ Connection test failed:', testResult.message);
      process.exit(1);
    }

    console.log('✅ Connected to Finale API\n');

    // Initialize sync service
    const syncService = getFinaleSyncService();
    syncService.setCredentials(finaleConfig);

    // Run full sync
    console.log('📥 Starting full data sync...');
    console.log('   This may take 30-60 seconds depending on data volume.\n');

    const startTime = Date.now();
    await syncService.syncAll();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n✅ Seeding complete in ${duration}s!`);
    console.log('\n📊 Data synced to Supabase:');
    console.log('   - Vendors');
    console.log('   - Inventory (products with stock levels)');
    console.log('   - BOMs (bill of materials)');
    console.log('   - Purchase Orders');
    
    console.log('\n🔄 Auto-sync is configured to keep data updated:');
    console.log('   - Inventory: every 5 minutes');
    console.log('   - Purchase Orders: every 15 minutes');
    console.log('   - Vendors & BOMs: every 1 hour');

    console.log('\n✨ Your application is ready to use!');

  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    if (error instanceof Error) {
      console.error('   Error:', error.message);
      if (error.stack) {
        console.error('   Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
      }
    }
    process.exit(1);
  }
}

// Run seeding
seedFinaleData();
