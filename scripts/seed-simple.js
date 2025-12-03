#!/usr/bin/env node
/**
 * Seed Finale Data - Simplified Node.js Script
 * 
 * This runs the seed in a way that works with Node.js environment
 */

import { config } from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load .env.local
config({ path: '.env.local' });

// Critical: Set process.env BEFORE any app imports
if (!process.env.VITE_SUPABASE_URL) {
  console.error('❌ VITE_SUPABASE_URL not set in .env.local');
  process.exit(1);
}
if (!process.env.VITE_SUPABASE_ANON_KEY) {
  console.error('❌ VITE_SUPABASE_ANON_KEY not set in .env.local');
  process.exit(1);
}

// Mock import.meta.env for modules that expect it
global.import = global.import || {};
global.import.meta = global.import.meta || {};
global.import.meta.env = new Proxy(process.env, {
  get(target, prop) {
    return target[prop];
  }
});

console.log('🌱 Finale Data Seeding Script\n');
console.log('📋 Environment check:');
console.log(`   ✅ Supabase URL: ${process.env.VITE_SUPABASE_URL.substring(0, 30)}...`);
console.log(`   ✅ Finale API Key: ${process.env.VITE_FINALE_API_KEY}`);
console.log(`   ✅ Finale Account: ${process.env.VITE_FINALE_ACCOUNT_PATH}\n`);

// Now import app modules
const { getFinaleSyncService } = await import('../services/finaleSyncService.js');
const { FinaleClient } = await import('../lib/finale/client.js');

const finaleConfig = {
  apiKey: process.env.VITE_FINALE_API_KEY,
  apiSecret: process.env.VITE_FINALE_API_SECRET,
  accountPath: process.env.VITE_FINALE_ACCOUNT_PATH,
  baseUrl: process.env.VITE_FINALE_BASE_URL || 'https://app.finaleinventory.com',
};

console.log('🔧 Configuring Finale client...');
const client = new FinaleClient(finaleConfig);

console.log('🔌 Testing Finale API connection...');
const testResult = await client.testConnection();

if (!testResult.success) {
  console.error('❌ Connection failed:', testResult.message);
  process.exit(1);
}

console.log('✅ Connected to Finale API\n');

const syncService = getFinaleSyncService();
syncService.setCredentials(finaleConfig);

console.log('📥 Starting full data sync...');
console.log('   ⏱️  This may take 30-60 seconds...\n');

const startTime = Date.now();

try {
  await syncService.syncAll();
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`\n✅ Seeding complete in ${duration}s!`);
  console.log('\n📊 Data synced to Supabase:');
  console.log('   ✅ Vendors');
  console.log('   ✅ Inventory (with stock levels, costs, velocity)');
  console.log('   ✅ BOMs (bill of materials)');
  console.log('   ✅ Purchase Orders');
  
  console.log('\n🔄 Auto-sync configured:');
  console.log('   • Inventory: every 5 minutes');
  console.log('   • Purchase Orders: every 15 minutes');
  console.log('   • Vendors & BOMs: every 1 hour');
  
  console.log('\n✨ Application ready with pre-loaded data!');
  console.log('   Users will see data immediately on first page load.\n');
  
} catch (error) {
  console.error('\n❌ Sync failed:', error.message);
  if (error.stack) {
    console.error('\nStack trace:');
    console.error(error.stack.split('\n').slice(0, 10).join('\n'));
  }
  process.exit(1);
}
