/**
 * Finale Auto-Sync Initialization
 * 
 * Automatically starts Finale data synchronization when credentials are detected
 * in environment variables. No user interaction required after initial setup.
 * 
 * Environment variables (configured in .env.local for dev, Vercel for production):
 * - VITE_FINALE_API_KEY
 * - VITE_FINALE_API_SECRET
 * - VITE_FINALE_ACCOUNT_PATH
 * - VITE_FINALE_BASE_URL (optional, defaults to https://app.finaleinventory.com)
 */

import { getFinaleSyncService } from './finaleSyncService';

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
export function initializeFinaleAutoSync(): void {
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
    console.log('[FinaleAutoSync] ✅ Credentials detected. Initializing auto-sync...');
    
    const syncService = getFinaleSyncService();
    
    // Set credentials from environment
    const credentials = {
      apiKey: import.meta.env.VITE_FINALE_API_KEY!,
      apiSecret: import.meta.env.VITE_FINALE_API_SECRET!,
      accountPath: import.meta.env.VITE_FINALE_ACCOUNT_PATH!,
      baseUrl: import.meta.env.VITE_FINALE_BASE_URL || 'https://app.finaleinventory.com',
    };
    
    syncService.setCredentials(credentials);
    
    // Start automatic synchronization
    syncService.startAutoSync();
    
    autoSyncInitialized = true;
    
    console.log('[FinaleAutoSync] ✅ Auto-sync started successfully');
    console.log('[FinaleAutoSync] Data will sync automatically:');
    console.log('  - Inventory: every 5 minutes');
    console.log('  - Vendors: every 1 hour');
    console.log('  - Purchase Orders: every 15 minutes');
    console.log('  - BOMs: every 1 hour');
    
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
    const syncService = getFinaleSyncService();
    syncService.stopAutoSync();
    autoSyncInitialized = false;
    
    if (syncCheckInterval) {
      clearInterval(syncCheckInterval);
      syncCheckInterval = null;
    }
    
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
