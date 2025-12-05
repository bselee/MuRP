#!/usr/bin/env node

/**
 * Apply MRP Intelligence Views Migration
 * Applies the MRP views to the local Supabase database
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

async function applyMRPViews() {
  console.log('🚀 Applying MRP Intelligence Views Migration');
  console.log('=' .repeat(50));

  try {
    // Check if migration file exists
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/077_mrp_intelligence_views.sql');

    try {
      readFileSync(migrationPath);
      console.log('✅ Migration file found');
    } catch (error) {
      console.error('❌ Migration file not found:', migrationPath);
      process.exit(1);
    }

    // Apply migration to local database
    console.log('📡 Applying migration to local Supabase...');

    const command = `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f ${migrationPath}`;

    execSync(command, {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    console.log('✅ Migration applied successfully!');

    // Verify views were created
    console.log('🔍 Verifying views...');

    const verifyCommand = `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
      SELECT schemaname, tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename LIKE 'mrp_%'
      ORDER BY tablename;
    "`;

    console.log('Created MRP views:');
    execSync(verifyCommand, {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    console.log('\n🎉 MRP Intelligence Views migration completed!');
    console.log('\n📋 Next Steps:');
    console.log('1. Sync Finale data: npm run sync-finale');
    console.log('2. Test views: npx tsx scripts/test-mrp-views.ts');

  } catch (error) {
    console.error('❌ Error applying migration:', error);
    process.exit(1);
  }
}

applyMRPViews();