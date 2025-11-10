// Quick script to check stock values in Supabase
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mpuevsmtowyexhsqugkm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdWV2c210b3d5ZXhoc3F1Z2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NDA3MzYsImV4cCI6MjA3NzMxNjczNn0.ewucknfYUMY-unX6tuu-s9iDO6uQykKqM7klOPDE27I'
);

async function checkStock() {
  // Get total count and stock stats
  const { data: items, error } = await supabase
    .from('inventory_items')
    .select('sku, name, stock')
    .order('stock', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\n=== TOP 10 ITEMS BY STOCK ===');
  items.forEach(item => {
    console.log(`${item.sku}: ${item.name} - Stock: ${item.stock}`);
  });

  // Get counts
  const { count: totalCount } = await supabase
    .from('inventory_items')
    .select('*', { count: 'exact', head: true });

  const { count: withStock } = await supabase
    .from('inventory_items')
    .select('*', { count: 'exact', head: true })
    .gt('stock', 0);

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total items: ${totalCount}`);
  console.log(`Items with stock > 0: ${withStock}`);
  console.log(`Items with stock = 0: ${totalCount - withStock}`);
}

checkStock();
