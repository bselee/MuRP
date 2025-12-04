#!/usr/bin/env tsx
/**
 * Import Purchase Orders from Finale REST API
 * 
 * Uses existing FinalePOImporter service to fetch and sync POs.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

// Mock import.meta.env for Node (must be before dynamic imports)
global.import = global.import || {};
global.import.meta = { env: process.env };

// Dynamic import after setting up environment
const { FinalePOImporter } = await import('../services/finalePOImporter.js');

console.log('🚀 Starting Finale PO Import...\n');

const importer = new FinalePOImporter();

try {
  const result = await importer.importFromFinaleAPI();
  
  console.log('\n✅ Import Complete!\n');
  console.log('═══════════════════════════════════════════════════');
  console.log(`📊 RESULTS:`);
  console.log(`   Imported: ${result.imported} new POs`);
  console.log(`   Updated:  ${result.updated} existing POs`);
  console.log(`   Skipped:  ${result.skipped} unchanged POs`);
  console.log(`   Errors:   ${result.errors.length}`);
  console.log('═══════════════════════════════════════════════════');
  
  if (result.errors.length > 0) {
    console.log('\n⚠️  Errors encountered:');
    result.errors.forEach(err => {
      console.log(`   Row ${err.row}: ${err.error}`);
    });
  }
  
  process.exit(0);
} catch (error) {
  console.error('\n❌ Import failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
