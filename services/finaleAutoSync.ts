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
import { startPOAutoSync, triggerPOSync } from './purchaseOrderSyncService';

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
  console.log('[FinaleAutoSync] initializeFinaleAutoSync() called');

  // Only initialize once
  if (autoSyncInitialized) {
    console.log('[FinaleAutoSync] Already initialized');
    return;
  }

  console.log('[FinaleAutoSync] Checking credentials...');

  // Check if credentials are configured
  if (!hasFinaleCredentials()) {
    console.log('[FinaleAutoSync] No credentials found in environment. Auto-sync disabled.');
    console.log('[FinaleAutoSync] Configure VITE_FINALE_API_KEY, VITE_FINALE_API_SECRET, and VITE_FINALE_ACCOUNT_PATH to enable.');
    return;
  }

  console.log('[FinaleAutoSync] Credentials found, proceeding with initialization...');

  try {
    console.log('[FinaleAutoSync] ✅ Credentials detected. Initializing professional REST API sync...');
    
    const restSyncService = getFinaleRestSyncService();
    
    // Set credentials from environment
    const credentials = {
      apiKey: import.meta.env.VITE_FINALE_API_KEY!,
      apiSecret: import.meta.env.VITE_FINALE_API_SECRET!,
      accountPath: import.meta.env.VITE_FINALE_ACCOUNT_PATH!,
      baseUrl: import.meta.env.VITE_FINALE_BASE_URL || 'https://app.finaleinventory.com',
    };
    
    restSyncService.setCredentials(
      credentials.apiKey,
      credentials.apiSecret,
      credentials.accountPath
    );
    
    // Progress monitoring for REST sync
    restSyncService.onProgress((progress) => {
      console.log(`[FinaleAutoSync] ${progress.phase}: ${progress.percentage}% - ${progress.message}`);
    });
    
    // Start GraphQL PO sync immediately (in parallel with REST sync)
    console.log('[FinaleAutoSync] Starting Purchase Order sync (GraphQL) in parallel...');
    const poPromise = triggerPOSync('full').then((result) => {
      console.log('[FinaleAutoSync] PO sync promise resolved:', result);
      return result;
    }).catch((error) => {
      console.error('[FinaleAutoSync] PO sync failed:', error);
      throw error;
    });
    
    // Start initial REST API sync (inventory, vendors, BOMs)
    console.log('[FinaleAutoSync] Starting initial sync (Inventory + Vendors + BOMs)...');
    const metrics = await restSyncService.syncAll();
    
    console.log('[FinaleAutoSync] ✅ REST API sync complete:');
    console.log(`  - Records processed: ${metrics.recordsProcessed}`);
    console.log(`  - API calls made: ${metrics.apiCallsTotal}`);
    console.log(`  - API calls saved: ${metrics.apiCallsSaved} (delta sync optimization)`);
    console.log(`  - Duration: ${(metrics.duration / 1000).toFixed(1)}s`);
    console.log(`  - Errors: ${metrics.errors}`);
    
    // Wait for PO sync to complete
    const poResult = await poPromise;
    console.log('[FinaleAutoSync] ✅ GraphQL PO sync complete');
    
    // Start automatic PO sync (only in production)
    if (!isDevelopment) {
      startPOAutoSync(15);
    } else {
      console.log('[FinaleAutoSync] Development mode: Skipping PO auto-sync to avoid excessive API calls');
    }
    
    autoSyncInitialized = true;
    
    // Set up periodic syncs (only in production)
    // - REST API (inventory/vendors): every 4 hours
    // - GraphQL PO: every 15 minutes (configured in PurchaseOrderSyncService)
    
    const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
    
    if (!isDevelopment) {
      syncCheckInterval = setInterval(async () => {
        console.log('[FinaleAutoSync] Running scheduled REST API delta sync...');
        try {
          const deltaMetrics = await restSyncService.syncAll();
          console.log(`[FinaleAutoSync] REST delta sync complete: ${deltaMetrics.recordsProcessed} records, ${deltaMetrics.apiCallsTotal} API calls`);
        } catch (error) {
          console.error('[FinaleAutoSync] REST delta sync failed:', error);
        }
      }, 4 * 60 * 60 * 1000); // 4 hours
    } else {
      console.log('[FinaleAutoSync] Development mode: Skipping periodic syncs to avoid excessive API calls');
    }
    
    console.log('[FinaleAutoSync] ✅ All syncs initialized:');
    console.log('  - REST API (Inventory/Vendors): Delta sync every 4 hours');
    console.log('  - GraphQL POs: Auto-sync every 15 minutes (PurchaseOrderSyncService)');
    
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

  const restSyncService = getFinaleRestSyncService();
  
  // Ensure credentials are set
  if (!autoSyncInitialized) {
    const credentials = {
      apiKey: import.meta.env.VITE_FINALE_API_KEY!,
      apiSecret: import.meta.env.VITE_FINALE_API_SECRET!,
      accountPath: import.meta.env.VITE_FINALE_ACCOUNT_PATH!,
      baseUrl: import.meta.env.VITE_FINALE_BASE_URL || 'https://app.finaleinventory.com',
    };
    restSyncService.setCredentials(
      credentials.apiKey,
      credentials.apiSecret,
      credentials.accountPath
    );
  }

  console.log('[FinaleAutoSync] Starting manual sync (REST + GraphQL POs)...');
  try {
    const [restMetrics, poResult] = await Promise.all([
      restSyncService.syncAll(),
      triggerPOSync('full')
    ]);
    console.log('[FinaleAutoSync] Manual sync completed - REST:', restMetrics, 'POs: triggered');
  } catch (error) {
    console.error('[FinaleAutoSync] Manual sync failed:', error);
    throw error;
  }
}
