import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mpuevsmtowyexhsqugkm.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdWV2c210b3d5ZXhoc3F1Z2ttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzI0ODMwOSwiZXhwIjoyMDYyODI0MzA5fQ.YjXZsIIbp_J3gI0agHrSWYS8p1Wa6nz1EWr82yXKu7g'
);

// Total count
const { count: total } = await supabase.from('finale_purchase_orders').select('*', { count: 'exact', head: true });
console.log(`\n📊 Total POs in database: ${total}`);

// Active count
const { count: active } = await supabase.from('finale_purchase_orders').select('*', { count: 'exact', head: true }).eq('is_active', true);
console.log(`✅ Active POs: ${active}`);

// 2024+ non-dropship POs
const { data: recent, count: recentCount } = await supabase
  .from('finale_purchase_orders')
  .select('order_id, order_date, vendor_name, status', { count: 'exact' })
  .gte('order_date', '2024-01-01')
  .eq('is_active', true)
  .not('order_id', 'ilike', '%dropship%')
  .order('order_date', { ascending: false })
  .limit(50);

console.log(`\n🎯 Non-Dropship POs from 2024+: ${recentCount}`);
console.log('\nSample of 2024+ Non-Dropship POs:');
recent?.slice(0, 30).forEach(po => {
  console.log(`  ${po.order_id} | ${po.order_date} | ${po.status} | ${po.vendor_name || 'N/A'}`);
});

// Check for specific POs we saw in Finale API
const testIds = ['119400', '120048', '120049', '120050'];
const { data: testPOs } = await supabase
  .from('finale_purchase_orders')
  .select('order_id, order_date, vendor_name')
  .in('order_id', testIds);

console.log(`\n🔍 Test POs (from Finale API verification):`);
testPOs?.forEach(po => {
  console.log(`  ✓ ${po.order_id} - ${po.vendor_name} (${po.order_date})`);
});

if (testPOs?.length === 0) {
  console.log(`  ❌ None of the test POs found - checking order_id format...`);
  const { data: sample } = await supabase
    .from('finale_purchase_orders')
    .select('order_id')
    .gte('order_date', '2024-01-01')
    .limit(5);
  console.log(`  Sample order_ids: ${sample?.map(p => p.order_id).join(', ')}`);
}
