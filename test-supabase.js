import { createClient } from '@supabase/supabase-js';

async function testSupabaseConnection() {
  const supabase = createClient(
    'https://mpuevsmtowyexhsqugkm.supabase.co',
    'IOngZtT66GLmqHlQ'
  );

  try {
    // Test basic connection
    const { data, error, count } = await supabase
      .from('inventory_items')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('❌ Supabase connection failed:', error.message);
      console.error('Error details:', error);
      return false;
    }

    console.log('✅ Supabase connection successful!');
    console.log('📊 Inventory items count:', count);
    return true;
  } catch (err) {
    console.error('❌ Connection error:', err.message);
    console.error('Error details:', err);
    return false;
  }
}

testSupabaseConnection();