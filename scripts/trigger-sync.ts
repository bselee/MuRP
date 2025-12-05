import { config } from 'dotenv';
import { getFinaleRestSyncService } from '../services/finaleRestSyncService.js';

// Load environment variables
config({ path: '.env.local' });

async function triggerSync() {
  console.log('🔄 Starting manual Finale sync...');

  try {
    const syncService = getFinaleRestSyncService({
      supabaseUrl: process.env.VITE_SUPABASE_URL,
      supabaseKey: process.env.VITE_SUPABASE_ANON_KEY
    });

    // Set credentials from environment
    syncService.setCredentials(
      process.env.VITE_FINALE_API_KEY!,
      process.env.VITE_FINALE_API_SECRET!,
      process.env.VITE_FINALE_ACCOUNT_PATH!
    );

    // Monitor progress
    syncService.onProgress((progress) => {
      console.log(`📊 ${progress.phase}: ${progress.percentage}% - ${progress.message}`);
    });

    // Start sync
    const metrics = await syncService.syncAll();

    console.log('✅ Sync completed successfully!');
    console.log(`📈 Records processed: ${metrics.recordsProcessed}`);
    console.log(`🔗 API calls made: ${metrics.apiCallsTotal}`);
    console.log(`⚡ API calls saved: ${metrics.apiCallsSaved}`);
    console.log(`⏱️  Duration: ${(metrics.duration / 1000).toFixed(1)}s`);
    console.log(`❌ Errors: ${metrics.errors}`);

  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
}

triggerSync();