import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mpuevsmtowyexhsqugkm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdWV2c210b3d5ZXhoc3F1Z2ttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTc0MDczNiwiZXhwIjoyMDc3MzE2NzM2fQ.k9AeWCxt7G7O66qAnusmFHQzYkP_JFn0u2ZnswUikrk'
);

async function forceSync() {
  // Update sync_metadata to make it stale
  console.log('Making data stale...');
  const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago
  
  await supabase.from('sync_metadata').update({
    last_sync_time: oldTime
  }).eq('data_type', 'inventory');
  
  console.log('Triggering sync...');
  const response = await fetch('https://mpuevsmtowyexhsqugkm.supabase.co/functions/v1/auto-sync-finale', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdWV2c210b3d5ZXhoc3F1Z2ttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTc0MDczNiwiZXhwIjoyMDc3MzE2NzM2fQ.k9AeWCxt7G7O66qAnusmFHQzYkP_JFn0u2ZnswUikrk',
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  
  const result = await response.text();
  console.log('\nSync Response:', response.status);
  console.log(result);
}

forceSync().then(() => process.exit(0));
