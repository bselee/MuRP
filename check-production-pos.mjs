import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mpuevsmtowyexhsqugkm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdWV2c210b3d5ZXhoc3F1Z2ttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzI0ODMwOSwiZXhwIjoyMDYyODI0MzA5fQ.YjXZsIIbp_J3gI0agHrSWYS8p1Wa6nz1EWr82yXKu7g'
);

console.log('\n🎯 Checking PRODUCTION database...\n');

try {
  // Total count
  const { count: total, error: e1 } = await supabase
    .from('finale_purchase_orders')
    .select('*', { count: 'exact', head: true });

  if (e1) {
    console.error('❌ Error:', JSON.stringify(e1, null, 2));
    process.exit(1);
  }

  console.log(`📊 Total POs in database: ${total || 0}`);

  // Active count
  const { count: active } = await supabase
    .from('finale_purchase_orders')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  console.log(`✅ Active POs: ${active || 0}`);

  // 2024+ non-dropship POs
  const { data: recent, count: recentCount, error: e2 } = await supabase
    .from('finale_purchase_orders')
    .select('order_id, order_date, vendor_name, status', { count: 'exact' })
    .gte('order_date', '2024-01-01')
    .eq('is_active', true)
    .not('order_id', 'ilike', '%dropship%')
    .order('order_date', { ascending: false })
    .limit(100);

  if (e2) {
    console.error('❌ Error fetching 2024+ POs:', JSON.stringify(e2, null, 2));
  } else {
    console.log(`\n🎯 Non-Dropship POs from 2024+: ${recentCount || 0}\n`);

    if (recentCount && recentCount > 0) {
      console.log('Sample of 2024+ Non-Dropship POs:');
      recent?.slice(0, 30).forEach(po => {
        console.log(`  ${po.order_id.padEnd(10)} | ${po.order_date} | ${(po.status || 'N/A').padEnd(12)} | ${po.vendor_name || 'N/A'}`);
      });
    } else {
      console.log('❌ No 2024+ non-dropship POs found!\n');
    }
  }

  console.log('\n');
} catch (err) {
  console.error('Fatal error:', err);
  process.exit(1);
}
