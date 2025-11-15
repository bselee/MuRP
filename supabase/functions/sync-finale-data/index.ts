/**
 * Supabase Edge Function: Sync Finale Data
 * 
 * Runs on a schedule (cron) to keep Supabase data fresh from Finale.
 * No client interaction needed - data is always ready.
 * 
 * Schedule: Every 5 minutes
 * Invoke via: supabase functions invoke sync-finale-data
 * Or cron: https://supabase.com/docs/guides/functions/schedule-functions
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FINALE_API_KEY = Deno.env.get('FINALE_API_KEY') || '';
const FINALE_API_SECRET = Deno.env.get('FINALE_API_SECRET') || '';
const FINALE_ACCOUNT_PATH = Deno.env.get('FINALE_ACCOUNT_PATH') || '';
const FINALE_BASE_URL = Deno.env.get('FINALE_BASE_URL') || 'https://app.finaleinventory.com';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

interface SyncResult {
  dataType: string;
  success: boolean;
  itemCount: number;
  duration: number;
  error?: string;
}

serve(async (req) => {
  try {
    console.log('[Sync] Starting scheduled Finale data sync...');
    const startTime = Date.now();

    // Validate credentials
    if (!FINALE_API_KEY || !FINALE_API_SECRET || !FINALE_ACCOUNT_PATH) {
      console.error('[Sync] Missing Finale credentials in environment');
      return new Response(
        JSON.stringify({ error: 'Missing Finale credentials' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Sync each data type
    const results: SyncResult[] = [];

    // 1. Sync Vendors (via API proxy)
    try {
      const vendorsStart = Date.now();
      const vendorsResponse = await fetch(`${req.url.split('/functions')[0]}/functions/v1/api-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getSuppliers',
          config: {
            apiKey: FINALE_API_KEY,
            apiSecret: FINALE_API_SECRET,
            accountPath: FINALE_ACCOUNT_PATH,
            baseUrl: FINALE_BASE_URL,
          },
        }),
      });

      if (vendorsResponse.ok) {
        const vendors = await vendorsResponse.json();
        
        // Upsert vendors to Supabase
        const { error } = await supabase.from('vendors').upsert(vendors, {
          onConflict: 'id',
        });

        results.push({
          dataType: 'vendors',
          success: !error,
          itemCount: vendors.length,
          duration: Date.now() - vendorsStart,
          error: error?.message,
        });

        // Update sync metadata
        await supabase.from('sync_metadata').upsert({
          data_type: 'vendors',
          last_sync_time: new Date().toISOString(),
          item_count: vendors.length,
          success: !error,
        }, { onConflict: 'data_type' });

        console.log(`[Sync] ✅ Vendors: ${vendors.length} items in ${Date.now() - vendorsStart}ms`);
      }
    } catch (error) {
      console.error('[Sync] Vendors sync failed:', error);
      results.push({
        dataType: 'vendors',
        success: false,
        itemCount: 0,
        duration: 0,
        error: error.message,
      });
    }

    // 2. Sync Inventory (via API proxy)
    try {
      const inventoryStart = Date.now();
      const inventoryResponse = await fetch(`${req.url.split('/functions')[0]}/functions/v1/api-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getInventory',
          config: {
            apiKey: FINALE_API_KEY,
            apiSecret: FINALE_API_SECRET,
            accountPath: FINALE_ACCOUNT_PATH,
            baseUrl: FINALE_BASE_URL,
          },
        }),
      });

      if (inventoryResponse.ok) {
        const inventory = await inventoryResponse.json();
        
        // Upsert inventory to Supabase
        const { error } = await supabase.from('inventory_items').upsert(inventory, {
          onConflict: 'id',
        });

        results.push({
          dataType: 'inventory',
          success: !error,
          itemCount: inventory.length,
          duration: Date.now() - inventoryStart,
          error: error?.message,
        });

        // Update sync metadata
        await supabase.from('sync_metadata').upsert({
          data_type: 'inventory',
          last_sync_time: new Date().toISOString(),
          item_count: inventory.length,
          success: !error,
        }, { onConflict: 'data_type' });

        console.log(`[Sync] ✅ Inventory: ${inventory.length} items in ${Date.now() - inventoryStart}ms`);
      }
    } catch (error) {
      console.error('[Sync] Inventory sync failed:', error);
      results.push({
        dataType: 'inventory',
        success: false,
        itemCount: 0,
        duration: 0,
        error: error.message,
      });
    }

    const totalDuration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;

    console.log(`[Sync] ✅ Complete: ${successCount}/${results.length} synced in ${totalDuration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        totalDuration,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Sync] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
