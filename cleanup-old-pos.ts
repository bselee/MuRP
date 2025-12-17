import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function cleanupOldPOs() {
  console.log('🧹 Starting cleanup of pre-2025 purchase orders...');

  try {
    // First, get count before
    const { data: beforeData, error: beforeError } = await supabase
      .from('finale_purchase_orders')
      .select('id, order_date', { count: 'exact' })
      .lt('order_date', '2025-01-01T00:00:00Z');

    if (beforeError) {
      console.error('❌ Error counting POs:', beforeError);
      return;
    }

    const countBefore = beforeData?.length || 0;
    console.log(`📊 Found ${countBefore} POs before 2025-01-01`);

    if (countBefore === 0) {
      console.log('✅ No old POs to delete!');
      return;
    }

    // Delete POs before 2025
    const { data: deletedData, error: deleteError } = await supabase
      .from('finale_purchase_orders')
      .delete()
      .lt('order_date', '2025-01-01T00:00:00Z');

    if (deleteError) {
      console.error('❌ Error deleting POs:', deleteError);
      return;
    }

    console.log(`✅ Deleted ${countBefore} old POs`);

    // Verify deletion
    const { data: afterData, error: afterError } = await supabase
      .from('finale_purchase_orders')
      .select('id', { count: 'exact' });

    if (afterError) {
      console.error('❌ Error counting remaining POs:', afterError);
      return;
    }

    const countAfter = afterData?.length || 0;
    console.log(`📊 Remaining POs: ${countAfter}`);
    console.log('✅ Cleanup complete! Refresh your POs page to see current year only (newest first)');
  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

cleanupOldPOs();
