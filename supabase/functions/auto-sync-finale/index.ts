/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINALE AUTO-SYNC ORCHESTRATOR
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This function orchestrates automatic data synchronization from Finale Inventory
 * to MuRP's Supabase database. It calls the specialized sync functions:
 * 
 * 1. sync-finale-data (REST API)
 *    - Products with BOMs from productAssocList
 *    - Vendors from party endpoint
 *    - Filters: Only active products, NEVER Deprecating category
 * 
 * 2. sync-finale-graphql (GraphQL API)
 *    - Products with stock levels (BuildASoil Shipping prioritized)
 *    - Purchase Orders (CRITICAL - REST doesn't filter POs properly!)
 *    - Vendors with full contact details
 *    - Filters: Status != Inactive, Category != Deprecating
 * 
 * SCHEDULE: Configure via pg_cron or external scheduler
 *   - Recommended: Every 4 hours for full sync
 *   - POs can be synced more frequently (every 15 minutes)
 * 
 * DATA FLOW:
 *   Finale API → sync-finale-data → finale_products, finale_vendors, finale_boms, boms
 *   Finale API → sync-finale-graphql → finale_products (stock), finale_purchase_orders, inventory_items
 * 
 * @author MuRP Development Team
 * @version 2.0.0 - December 2025
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncResult {
  function: string;
  success: boolean;
  results?: any[];
  duration?: number;
  error?: string;
}

// Call another Supabase edge function
async function callSyncFunction(functionName: string): Promise<SyncResult> {
  const startTime = Date.now();
  
  try {
    const url = `${SUPABASE_URL}/functions/v1/${functionName}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        function: functionName,
        success: false,
        duration: Date.now() - startTime,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json();
    
    return {
      function: functionName,
      success: data.success !== false,
      results: data.results,
      duration: Date.now() - startTime,
      error: data.error,
    };
  } catch (error) {
    return {
      function: functionName,
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Log sync event to database
async function logSyncEvent(supabase: any, results: SyncResult[], totalDuration: number, syncType: string) {
  try {
    const successCount = results.filter(r => r.success).length;
    const totalItems = results.reduce((sum, r) => {
      if (r.results) {
        return sum + r.results.reduce((s: number, res: any) => s + (res.itemCount || 0), 0);
      }
      return sum;
    }, 0);

    // Update sync_metadata (legacy)
    await supabase.from('sync_metadata').upsert({
      sync_type: 'auto_sync_finale',
      last_sync_at: new Date().toISOString(),
      sync_status: successCount === results.length ? 'success' : 'partial',
      items_synced: totalItems,
      sync_duration_ms: totalDuration,
      error_message: results.filter(r => !r.success).map(r => r.error).join('; ') || null,
    }, { onConflict: 'sync_type' });

    // Update finale_sync_state for delta tracking
    const syncStateUpdate: Record<string, any> = {
      sync_in_progress: false,
      current_sync_started_at: null,
      updated_at: new Date().toISOString(),
    };
    
    // Update appropriate timestamp based on sync type
    if (syncType === 'all') {
      syncStateUpdate.last_full_sync_at = new Date().toISOString();
    } else if (syncType === 'graphql') {
      syncStateUpdate.last_po_sync_at = new Date().toISOString();
      syncStateUpdate.last_stock_sync_at = new Date().toISOString();
    } else if (syncType === 'rest') {
      syncStateUpdate.last_delta_sync_at = new Date().toISOString();
    }
    
    await supabase.from('finale_sync_state')
      .update(syncStateUpdate)
      .eq('id', 'main');

  } catch (error) {
    console.error('[AutoSync] Failed to log sync event:', error);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    console.log('[AutoSync] ═══════════════════════════════════════════════════');
    console.log('[AutoSync] Starting Finale auto-sync orchestration...');
    console.log('[AutoSync] ═══════════════════════════════════════════════════');

    // Parse request body for options
    let options: { syncType?: string; force?: boolean } = {};
    try {
      if (req.method === 'POST') {
        options = await req.json();
      }
    } catch {
      options = {};
    }

    const results: SyncResult[] = [];

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: REST API Sync (Products with BOMs, Vendors)
    // ═══════════════════════════════════════════════════════════════════
    if (!options.syncType || options.syncType === 'all' || options.syncType === 'rest') {
      console.log('[AutoSync] Step 1: Running REST API sync (products, BOMs, vendors)...');
      const restResult = await callSyncFunction('sync-finale-data');
      results.push(restResult);
      
      if (restResult.success) {
        console.log(`[AutoSync] ✅ REST sync complete in ${restResult.duration}ms`);
        if (restResult.results) {
          for (const r of restResult.results) {
            console.log(`[AutoSync]   - ${r.dataType}: ${r.itemCount} items`);
          }
        }
      } else {
        console.error(`[AutoSync] ❌ REST sync failed: ${restResult.error}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: GraphQL API Sync (Stock levels, POs, enhanced products)
    // ═══════════════════════════════════════════════════════════════════
    if (!options.syncType || options.syncType === 'all' || options.syncType === 'graphql') {
      console.log('[AutoSync] Step 2: Running GraphQL API sync (stock, POs)...');
      const graphqlResult = await callSyncFunction('sync-finale-graphql');
      results.push(graphqlResult);
      
      if (graphqlResult.success) {
        console.log(`[AutoSync] ✅ GraphQL sync complete in ${graphqlResult.duration}ms`);
        if (graphqlResult.results) {
          for (const r of graphqlResult.results) {
            console.log(`[AutoSync]   - ${r.dataType}: ${r.itemCount} items`);
          }
        }
      } else {
        console.error(`[AutoSync] ❌ GraphQL sync failed: ${graphqlResult.error}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Log results and update metadata
    // ═══════════════════════════════════════════════════════════════════
    const totalDuration = Date.now() - startTime;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const syncType = options.syncType || 'all';
    await logSyncEvent(supabase, results, totalDuration, syncType);

    const successCount = results.filter(r => r.success).length;
    console.log('[AutoSync] ═══════════════════════════════════════════════════');
    console.log(`[AutoSync] Sync complete: ${successCount}/${results.length} functions succeeded`);
    console.log(`[AutoSync] Total duration: ${totalDuration}ms`);
    console.log('[AutoSync] ═══════════════════════════════════════════════════');

    return new Response(
      JSON.stringify({
        success: successCount === results.length,
        message: `Auto-sync complete: ${successCount}/${results.length} functions succeeded`,
        results,
        totalDuration,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[AutoSync] Orchestration failed:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
