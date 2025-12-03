/**
 * Finale Auto-Sync Initialization
 * 
 * Automatically starts Finale data synchronization when credentials are detected
 * in environment variables. Uses professional REST API sync with intelligent
 * delta sync to minimize API hits. No user interaction required after initial setup.
 * 
 * Environment variables (configured in .env.local for dev, Vercel for production):
 * - VITE_FINALE_API_KEY
 * - VITE_FINALE_API_SECRET
 * - VITE_FINALE_ACCOUNT_PATH
 * - VITE_FINALE_BASE_URL (optional, defaults to https://app.finaleinventory.com)
 */

import { getFinaleRestSyncService } from './finaleRestSyncService';

let autoSyncInitialized = false;
let syncCheckInterval: NodeJS.Timeout | null = null;

/**
 * Check if Finale credentials are configured
 */
function hasFinaleCredentials(): boolean {
  const apiKey = import.meta.env.VITE_FINALE_API_KEY;
  const apiSecret = import.meta.env.VITE_FINALE_API_SECRET;
  const accountPath = import.meta.env.VITE_FINALE_ACCOUNT_PATH;
  
  return !!(apiKey && apiSecret && accountPath);
}

/**
 * Initialize auto-sync if credentials are available
 */
export async function initializeFinaleAutoSync(): Promise<void> {
  // Only initialize once
  if (autoSyncInitialized) {
    console.log('[FinaleAutoSync] Already initialized');
    return;
  }

  // Check if credentials are configured
  if (!hasFinaleCredentials()) {
    console.log('[FinaleAutoSync] No credentials found in environment. Auto-sync disabled.');
    console.log('[FinaleAutoSync] Configure VITE_FINALE_API_KEY, VITE_FINALE_API_SECRET, and VITE_FINALE_ACCOUNT_PATH to enable.');
    return;
  }

  try {
    console.log('[FinaleAutoSync] ✅ Credentials detected. Initializing professional REST API sync...');
    
    const syncService = getFinaleRestSyncService();
    
    // Set credentials from environment
    const credentials = {
      apiKey: import.meta.env.VITE_FINALE_API_KEY!,
      apiSecret: import.meta.env.VITE_FINALE_API_SECRET!,
      accountPath: import.meta.env.VITE_FINALE_ACCOUNT_PATH!,
      baseUrl: import.meta.env.VITE_FINALE_BASE_URL || 'https://app.finaleinventory.com',
    };
    
    syncService.setCredentials(
      credentials.apiKey,
      credentials.apiSecret,
      credentials.accountPath
    );
    
    // Progress monitoring
    syncService.onProgress((progress) => {
      console.log(`[FinaleAutoSync] ${progress.phase}: ${progress.percentage}% - ${progress.message}`);
    });
    
    // Start initial sync
    console.log('[FinaleAutoSync] Starting initial sync...');
    const metrics = await syncService.syncAll();
    
    console.log('[FinaleAutoSync] ✅ Initial sync complete:');
    console.log(`  - Records processed: ${metrics.recordsProcessed}`);
    console.log(`  - API calls made: ${metrics.apiCallsTotal}`);
    console.log(`  - API calls saved: ${metrics.apiCallsSaved} (delta sync optimization)`);
    console.log(`  - Duration: ${(metrics.duration / 1000).toFixed(1)}s`);
    console.log(`  - Errors: ${metrics.errors}`);
    
    autoSyncInitialized = true;
    
    // Set up periodic sync (every 4 hours for delta sync)
    syncCheckInterval = setInterval(async () => {
      console.log('[FinaleAutoSync] Running scheduled delta sync...');
      try {
        const deltaMetrics = await syncService.syncAll();
        console.log(`[FinaleAutoSync] Delta sync complete: ${deltaMetrics.recordsProcessed} records, ${deltaMetrics.apiCallsTotal} API calls`);
      } catch (error) {
        console.error('[FinaleAutoSync] Delta sync failed:', error);
      }
    }, 4 * 60 * 60 * 1000); // 4 hours
    
    console.log('[FinaleAutoSync] ✅ Scheduled delta sync every 4 hours');
    
  } catch (error) {
    console.error('[FinaleAutoSync] ❌ Failed to initialize auto-sync:', error);
    console.error('[FinaleAutoSync] Data sync will not run automatically. Check credentials and try again.');
  }
}

/**
 * Stop auto-sync (for cleanup)
 */
export function stopFinaleAutoSync(): void {
  if (!autoSyncInitialized) {
    return;
  }

  try {
    if (syncCheckInterval) {
      clearInterval(syncCheckInterval);
      syncCheckInterval = null;
    }
    
    autoSyncInitialized = false;
    console.log('[FinaleAutoSync] Auto-sync stopped');
  } catch (error) {
    console.error('[FinaleAutoSync] Error stopping auto-sync:', error);
  }
}

/**
 * Get auto-sync status
 */
export function getAutoSyncStatus(): { initialized: boolean; hasCredentials: boolean } {
  return {
    initialized: autoSyncInitialized,
    hasCredentials: hasFinaleCredentials(),
  };
}

/**
 * Manually trigger a full sync (useful for testing)
 */
export async function triggerManualSync(): Promise<void> {
  if (!hasFinaleCredentials()) {
    throw new Error('Finale credentials not configured');
  }

  const syncService = getFinaleSyncService();
  
  // Ensure credentials are set
  if (!autoSyncInitialized) {
    const credentials = {
      apiKey: import.meta.env.VITE_FINALE_API_KEY!,
      apiSecret: import.meta.env.VITE_FINALE_API_SECRET!,
      accountPath: import.meta.env.VITE_FINALE_ACCOUNT_PATH!,
      baseUrl: import.meta.env.VITE_FINALE_BASE_URL || 'https://app.finaleinventory.com',
    };
    syncService.setCredentials(credentials);
  }

  console.log('[FinaleAutoSync] Starting manual sync...');
  await syncService.syncAll();
  console.log('[FinaleAutoSync] Manual sync completed');
}
