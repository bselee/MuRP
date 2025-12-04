#!/usr/bin/env tsx
/**
 * Import Purchase Orders from Finale REST API (Direct)
 * 
 * Fetches POs from Finale and inserts them directly into Supabase.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

// Mock import.meta.env for Node
global.import = global.import || {};
global.import.meta = { env: process.env };

// Dynamic imports
const { FinaleClient } = await import('../lib/finale/client.js');
const { createClient } = await import('@supabase/supabase-js');

console.log('🚀 Starting Direct Finale PO Import...\n');

// Finale configuration
const finaleConfig = {
  apiKey: process.env.VITE_FINALE_API_KEY!,
  apiSecret: process.env.VITE_FINALE_API_SECRET!,
  accountPath: process.env.VITE_FINALE_ACCOUNT_PATH!,
  baseUrl: process.env.VITE_FINALE_BASE_URL || 'https://app.finaleinventory.com',
};

// Supabase configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const finaleClient = new FinaleClient(finaleConfig);

try {
  // Test Finale connection
  console.log('🔌 Testing Finale connection...');
  const connectionTest = await finaleClient.testConnection();
  
  if (!connectionTest.success) {
    throw new Error(`Connection failed: ${connectionTest.message}`);
  }
  
  console.log('✅ Connected to Finale API\n');
  
  // Fetch POs from Finale
  console.log('📥 Fetching purchase orders from Finale...');
  
  let allPOs: any[] = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;
  
  while (hasMore) {
    const batch = await finaleClient.fetchPurchaseOrders({ limit, offset });
    allPOs.push(...batch);
    offset += limit;
    hasMore = batch.length === limit;
    
    if (batch.length > 0) {
      console.log(`   Fetched ${allPOs.length} POs...`);
    }
  }
  
  console.log(`\n✅ Fetched ${allPOs.length} total purchase orders\n`);
  
  if (allPOs.length === 0) {
    console.log('No purchase orders to import.');
    process.exit(0);
  }
  
  // Show sample PO data
  console.log('📋 Sample PO Data:');
  console.log(JSON.stringify(allPOs[0], null, 2));
  console.log('\n');
  
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  // Process each PO
  for (const finalePO of allPOs) {
    try {
      const poNumber = finalePO.orderNumber || finalePO.purchaseOrderId;
      
      if (!poNumber) {
        console.log(`⚠️  Skipping PO with no order number`);
        skipped++;
        continue;
      }
      
      // Check if PO exists
      const { data: existing } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('order_id', poNumber)
        .single();
      
      // Transform PO data to MuRP format
      const poData = {
        order_id: poNumber,
        vendor_id: finalePO.supplier || finalePO.vendorId || null,
        vendor_name: finalePO.vendorName || null,
        status: mapFinaleStatus(finalePO.status),
        order_date: finalePO.orderDate || finalePO.createdDate || new Date().toISOString(),
        expected_date: finalePO.expectedDate || null,
        received_date: finalePO.receivedDate || null,
        subtotal: finalePO.subtotal || 0,
        tax: finalePO.tax || 0,
        shipping: finalePO.shipping || 0,
        total: finalePO.total || 0,
        notes: finalePO.notes || null,
        internal_notes: finalePO.internalNotes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        record_last_updated: finalePO.lastModified || new Date().toISOString()
      };
      
      if (existing) {
        // Update existing PO
        const { error } = await supabase
          .from('purchase_orders')
          .update(poData)
          .eq('id', existing.id);
        
        if (error) throw error;
        updated++;
        console.log(`   ↻ Updated PO ${poNumber}`);
      } else {
        // Insert new PO
        const { error } = await supabase
          .from('purchase_orders')
          .insert(poData);
        
        if (error) throw error;
        imported++;
        console.log(`   ✓ Imported PO ${poNumber}`);
      }
      
    } catch (error) {
      console.error(`   ✗ Error processing PO:`, error instanceof Error ? error.message : error);
      errors++;
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('📊 IMPORT RESULTS:');
  console.log(`   Imported: ${imported} new POs`);
  console.log(`   Updated:  ${updated} existing POs`);
  console.log(`   Skipped:  ${skipped} POs`);
  console.log(`   Errors:   ${errors}`);
  console.log('═══════════════════════════════════════════════════\n');
  
  console.log('✅ Import complete!');
  process.exit(0);
  
} catch (error) {
  console.error('\n❌ Import failed:', error instanceof Error ? error.message : error);
  console.error(error);
  process.exit(1);
}

// Helper: Map Finale status to MuRP status
function mapFinaleStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'DRAFT': 'pending',
    'SUBMITTED': 'approved',
    'PARTIALLY_RECEIVED': 'in_transit',
    'RECEIVED': 'received',
    'CANCELLED': 'cancelled'
  };
  
  return statusMap[status] || 'pending';
}
