import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mpuevsmtowyexhsqugkm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdWV2c210b3d5ZXhoc3F1Z2ttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTc0MDczNiwiZXhwIjoyMDc3MzE2NzM2fQ.k9AeWCxt7G7O66qAnusmFHQzYkP_JFn0u2ZnswUikrk'
);

async function checkSync() {
  console.log('\n=== Checking Sync Status ===\n');
  
  // Check sync_metadata
  const { data: metadata, error: metaError } = await supabase
    .from('sync_metadata')
    .select('*')
    .order('last_sync_time', { ascending: false });
    
  if (metaError) {
    console.error('Error reading sync_metadata:', metaError);
  } else {
    console.log('Sync Metadata:');
    console.table(metadata);
  }
  
  // Check inventory count
  const { count: invCount, error: invError } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true });
    
  console.log('\nInventory items:', invError ? 'Error: ' + invError.message : invCount);
  
  // Check vendors count
  const { count: vendorCount, error: vendorError } = await supabase
    .from('vendors')
    .select('*', { count: 'exact', head: true });
    
  console.log('Vendor items:', vendorError ? 'Error: ' + vendorError.message : vendorCount);
  
  // Check BOMs count
  const { count: bomCount, error: bomError } = await supabase
    .from('boms')
    .select('*', { count: 'exact', head: true });
    
  console.log('BOM items:', bomError ? 'Error: ' + bomError.message : bomCount);
}

checkSync().then(() => process.exit(0));
