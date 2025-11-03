/**
 * External Sync API Endpoint
 * Triggers synchronization for all enabled external data sources
 * GET /api/external/sync
 */

import { requireRole, handleError, successResponse, ApiError, getQueryParam } from '../../lib/api/helpers';
import type { SyncConfig } from '../../lib/connectors/types';
import type { ConnectorCredentials, FieldMapping } from '../../lib/connectors/types';

export default async function handler(request: Request): Promise<Response> {
  // Handle OPTIONS for CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return handleError(new ApiError('Unauthorized', 401));
  }

  try {
    // CRITICAL: Perform auth check first and ensure any auth failures return 401
    // This must happen before any admin client or connector imports
    let auth;
    try {
      auth = await requireRole(request, 'admin');
    } catch (authError: any) {
      // If auth fails for ANY reason (missing token, invalid token, missing env vars, etc.),
      // always return 401 instead of 500
      console.error('[Sync] Auth failed:', authError.message);
      if (authError instanceof ApiError && authError.statusCode === 401) {
        throw authError; // Preserve 401 errors
      }
      // Convert any other auth-related errors to 401
      throw new ApiError('Unauthorized', 401);
    }

    const [{ createConnector }, { transformInventoryBatch, transformVendorBatch }] = await Promise.all([
      import('../../lib/connectors/registry'),
      import('../../lib/transformers'),
    ]);

    // Optional: sync specific source by ID
    const sourceId = getQueryParam(request, 'source_id');

    console.log(`[Sync] Triggered by user ${auth.user.id}${sourceId ? ` for source ${sourceId}` : ''}`);

    // Import admin client and connectors AFTER auth check to prevent module-load errors
    // from causing 500s on unauthenticated requests
    const { getSupabaseAdmin } = await import('../../lib/supabase');
    const { createConnector } = await import('../../lib/connectors/registry');
    const { transformInventoryBatch, transformVendorBatch } = await import('../../lib/transformers');

    const supabaseAdmin = getSupabaseAdmin();
    // Fetch enabled external data sources
    let query = supabaseAdmin
      .from('external_data_sources')
      .select('*')
      .eq('sync_enabled', true)
      .eq('is_deleted', false);

    if (sourceId) {
      query = query.eq('id', sourceId);
    }

    const { data: sources, error } = await query;

    if (error) {
      throw new ApiError('Failed to fetch data sources', 500);
    }

    if (!sources || sources.length === 0) {
      return successResponse({ message: 'No enabled data sources found', synced: 0 });
    }

    const results = [];

    // Process each source
    for (const source of sources) {
      try {
        console.log(`[Sync] Processing source: ${source.display_name} (${source.source_type})`);

        // Update status to syncing
        await supabaseAdmin
          .from('external_data_sources')
          .update({ sync_status: 'syncing' })
          .eq('id', source.id);

        const startTime = Date.now();

        // Create connector config
        const config: SyncConfig = {
          sourceId: source.id,
          sourceType: source.source_type,
          credentials: (source.credentials as unknown as ConnectorCredentials),
          fieldMapping: ((source.field_mappings || {}) as unknown as FieldMapping),
          syncFrequency: source.sync_frequency,
          enabled: source.sync_enabled,
        };

        // Create connector instance
        const connector = createConnector(config);

        // Authenticate
  const authenticated = await connector.authenticate(config.credentials);
        if (!authenticated) {
          throw new Error('Authentication failed');
        }

        // Fetch data
        const [inventory, vendors] = await Promise.all([
          connector.fetchInventory().catch(err => {
            console.warn(`[Sync] Inventory fetch failed:`, err);
            return [];
          }),
          connector.fetchVendors().catch(err => {
            console.warn(`[Sync] Vendor fetch failed:`, err);
            return [];
          }),
        ]);

        // Transform data
        const context = {
          sourceType: source.source_type,
          mapping: ((source.field_mappings || {}) as unknown as FieldMapping),
        };

        const transformedInventory = transformInventoryBatch(inventory, context);
        const transformedVendors = transformVendorBatch(vendors, context);

        // Upsert to database (using external_id for conflict resolution)
        let inventoryCount = 0;
        let vendorCount = 0;

        if (transformedInventory.success.length > 0) {
          const { error: invError } = await supabaseAdmin
            .from('inventory_items')
            .upsert(transformedInventory.success as any, {
              onConflict: 'source_system,external_id',
            });

          if (!invError) {
            inventoryCount = transformedInventory.success.length;
          } else {
            console.error('[Sync] Inventory upsert error:', invError);
          }
        }

        if (transformedVendors.success.length > 0) {
          const { error: vendError } = await supabaseAdmin
            .from('vendors')
            .upsert(transformedVendors.success as any, {
              onConflict: 'source_system,external_id',
            });

          if (!vendError) {
            vendorCount = transformedVendors.success.length;
          } else {
            console.error('[Sync] Vendor upsert error:', vendError);
          }
        }

        const duration = Date.now() - startTime;

        // Update sync status to success
        await supabaseAdmin
          .from('external_data_sources')
          .update({
            sync_status: 'success',
            last_sync_at: new Date().toISOString(),
            last_sync_duration_ms: duration,
            sync_error: null,
          })
          .eq('id', source.id);

        results.push({
          source: source.display_name,
          success: true,
          inventory: inventoryCount,
          vendors: vendorCount,
          duration_ms: duration,
        });

      } catch (error: any) {
        console.error(`[Sync] Error processing source ${source.id}:`, error);

        // Update sync status to failed
        await supabaseAdmin
          .from('external_data_sources')
          .update({
            sync_status: 'failed',
            sync_error: error.message || 'Unknown error',
          })
          .eq('id', source.id);

        results.push({
          source: source.display_name,
          success: false,
          error: error.message,
        });
      }
    }

    return successResponse({
      synced: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    }, 'Sync completed');

  } catch (error) {
    return handleError(error);
  }
}

export const config = {
  runtime: 'nodejs',
  maxDuration: 300, // 5 minutes for long sync operations
};
