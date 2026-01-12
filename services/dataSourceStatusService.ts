/**
 * Data Source Status Service
 *
 * Detects which data sources are configured and their connection status.
 * This is critical for onboarding guidance and empty state handling.
 */

import { supabase } from '../lib/supabase/client';

export type DataSourceType = 'finale' | 'google_sheets' | 'csv_import' | 'manual';

/**
 * Sync state helps distinguish between different empty data scenarios:
 * - not_configured: No data source set up at all
 * - configured_not_synced: Data source credentials entered but never synced
 * - synced_empty: Data source synced successfully but source has no data
 * - synced_with_data: Data source synced and has records
 * - sync_failed: Last sync attempt failed
 */
export type SyncState =
  | 'not_configured'
  | 'configured_not_synced'
  | 'synced_empty'
  | 'synced_with_data'
  | 'sync_failed';

export interface DataSourceStatus {
  type: DataSourceType;
  configured: boolean;
  connected: boolean;
  lastSyncAt: string | null;
  errorMessage: string | null;
  recordCount: number;
}

export interface DataSourceSummary {
  hasAnyDataSource: boolean;
  hasAnyData: boolean;
  primarySource: DataSourceType | null;
  sources: Record<DataSourceType, DataSourceStatus>;
  counts: {
    inventory: number;
    vendors: number;
    purchaseOrders: number;
    boms: number;
  };
  setupComplete: boolean;
  nextStep: SetupStep | null;
  /**
   * Overall sync state to help determine what empty state to show:
   * - not_configured: User needs to set up a data source
   * - configured_not_synced: User connected but data hasn't synced yet
   * - synced_empty: Sync worked but source has no data to import
   * - synced_with_data: All good, data is present
   * - sync_failed: Something went wrong during sync
   */
  syncState: SyncState;
}

export type SetupStep =
  | 'connect_data_source'
  | 'import_inventory'
  | 'import_vendors'
  | 'create_first_po'
  | 'complete';

/**
 * Check if Finale API is configured via user-entered credentials
 * Note: We only check localStorage for user-entered credentials.
 * Server-side credentials (env vars) are checked via API call.
 */
export function isFinaleConfiguredLocally(): boolean {
  const apiKey = localStorage.getItem('finale_api_key');
  const apiSecret = localStorage.getItem('finale_api_secret');
  const accountPath = localStorage.getItem('finale_account_path');

  return !!(apiKey && apiSecret && accountPath);
}

/**
 * Check if Finale has been configured and synced successfully
 * This checks if we have sync history, indicating server-side credentials work
 */
export async function isFinaleConfiguredFromSync(): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('sync_status')
      .select('id')
      .eq('source', 'finale')
      .limit(1)
      .maybeSingle();

    return !!data;
  } catch {
    return false;
  }
}

/**
 * Check if Finale API is configured (either locally or via server sync)
 */
export async function isFinaleConfigured(): Promise<boolean> {
  // First check localStorage (user-entered credentials)
  if (isFinaleConfiguredLocally()) {
    return true;
  }

  // Then check if we have sync history (server-side credentials worked)
  return isFinaleConfiguredFromSync();
}

/**
 * Check if Google Sheets is configured (OAuth token exists)
 */
export async function isGoogleSheetsConfigured(userId: string): Promise<boolean> {
  if (!userId) return false;

  try {
    const { data, error } = await supabase
      .from('user_oauth_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .maybeSingle();

    return !error && !!data;
  } catch {
    return false;
  }
}

/**
 * Get the last sync timestamp for Finale
 */
export async function getFinaleLastSync(): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('sync_status')
      .select('last_sync_at')
      .eq('source', 'finale')
      .order('last_sync_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.last_sync_at ?? null;
  } catch {
    return null;
  }
}

/**
 * Get record counts from all main tables
 */
export async function getRecordCounts(): Promise<DataSourceSummary['counts']> {
  const counts = {
    inventory: 0,
    vendors: 0,
    purchaseOrders: 0,
    boms: 0,
  };

  try {
    // Run counts in parallel for speed
    const [invResult, vendorResult, poResult, bomResult] = await Promise.all([
      supabase.from('inventory_items').select('id', { count: 'exact', head: true }),
      supabase.from('vendors').select('id', { count: 'exact', head: true }),
      supabase.from('purchase_orders').select('id', { count: 'exact', head: true }),
      supabase.from('boms').select('id', { count: 'exact', head: true }),
    ]);

    counts.inventory = invResult.count ?? 0;
    counts.vendors = vendorResult.count ?? 0;
    counts.purchaseOrders = poResult.count ?? 0;
    counts.boms = bomResult.count ?? 0;
  } catch (err) {
    console.error('[DataSourceStatus] Failed to get record counts:', err);
  }

  return counts;
}

/**
 * Determine what the user's next setup step should be
 */
export function determineNextStep(
  hasDataSource: boolean,
  counts: DataSourceSummary['counts']
): SetupStep | null {
  if (!hasDataSource) {
    return 'connect_data_source';
  }

  if (counts.inventory === 0) {
    return 'import_inventory';
  }

  if (counts.vendors === 0) {
    return 'import_vendors';
  }

  if (counts.purchaseOrders === 0) {
    return 'create_first_po';
  }

  return 'complete';
}

/**
 * Determine the overall sync state based on configuration and data
 */
export function determineSyncState(
  hasDataSource: boolean,
  hasSyncHistory: boolean,
  hasData: boolean
): SyncState {
  // No data source configured at all
  if (!hasDataSource) {
    return 'not_configured';
  }

  // Data source configured but never synced
  if (!hasSyncHistory) {
    return 'configured_not_synced';
  }

  // Synced but no data - could mean source is empty
  if (!hasData) {
    return 'synced_empty';
  }

  // All good - synced with data
  return 'synced_with_data';
}

/**
 * Get comprehensive data source status summary
 */
export async function getDataSourceSummary(userId: string): Promise<DataSourceSummary> {
  // Run these checks in parallel for speed
  const [finaleConfigured, googleConfigured, finaleLastSync, counts] = await Promise.all([
    isFinaleConfigured(),
    isGoogleSheetsConfigured(userId),
    getFinaleLastSync(),
    getRecordCounts(),
  ]);

  const hasAnyDataSource = finaleConfigured || googleConfigured;
  const hasAnyData = counts.inventory > 0 || counts.vendors > 0;

  // Determine primary source based on what's configured and has data
  let primarySource: DataSourceType | null = null;
  if (finaleConfigured && finaleLastSync) {
    primarySource = 'finale';
  } else if (googleConfigured) {
    primarySource = 'google_sheets';
  } else if (hasAnyData) {
    primarySource = 'manual'; // Data exists but no external source configured
  }

  const nextStep = determineNextStep(hasAnyDataSource, counts);

  // Determine sync history - check if we have any sync records
  const hasSyncHistory = !!finaleLastSync || (googleConfigured && hasAnyData);

  const syncState = determineSyncState(hasAnyDataSource, hasSyncHistory, hasAnyData);

  return {
    hasAnyDataSource,
    hasAnyData,
    primarySource,
    sources: {
      finale: {
        type: 'finale',
        configured: finaleConfigured,
        connected: finaleConfigured && !!finaleLastSync,
        lastSyncAt: finaleLastSync,
        errorMessage: null,
        recordCount: finaleConfigured ? counts.inventory : 0,
      },
      google_sheets: {
        type: 'google_sheets',
        configured: googleConfigured,
        connected: googleConfigured,
        lastSyncAt: null, // Would need to track this separately
        errorMessage: null,
        recordCount: 0,
      },
      csv_import: {
        type: 'csv_import',
        configured: false, // CSV is a one-time action, not persistent config
        connected: false,
        lastSyncAt: null,
        errorMessage: null,
        recordCount: 0,
      },
      manual: {
        type: 'manual',
        configured: true, // Always available
        connected: true,
        lastSyncAt: null,
        errorMessage: null,
        recordCount: 0,
      },
    },
    counts,
    setupComplete: nextStep === 'complete',
    nextStep,
    syncState,
  };
}

/**
 * Human-readable descriptions for setup steps
 */
export const SETUP_STEP_INFO: Record<SetupStep, { title: string; description: string; action: string; page: string }> = {
  connect_data_source: {
    title: 'Connect Your Data',
    description: 'Connect to Finale, Google Sheets, or upload a CSV to import your inventory data.',
    action: 'Set Up Integration',
    page: 'Settings',
  },
  import_inventory: {
    title: 'Import Inventory',
    description: 'Your data source is connected. Now import your inventory items to get started.',
    action: 'Import Now',
    page: 'Settings',
  },
  import_vendors: {
    title: 'Add Vendors',
    description: 'Add your suppliers and vendors to start creating purchase orders.',
    action: 'Add Vendors',
    page: 'Vendors',
  },
  create_first_po: {
    title: 'Create First PO',
    description: 'You\'re ready to create your first purchase order!',
    action: 'Create PO',
    page: 'Purchase Orders',
  },
  complete: {
    title: 'Setup Complete',
    description: 'Your MuRP workspace is ready. Start managing your inventory!',
    action: 'View Dashboard',
    page: 'Dashboard',
  },
};
