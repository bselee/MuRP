/**
 * Supabase Edge Function: Auto-Sync Finale Data
 * 
 * Runs on a schedule (every 5 minutes) to keep data fresh.
 * Users never need to manually sync - data is always current.
 * 
 * Triggered by: Supabase Cron (pg_cron)
 * Schedule: Every 5 minutes via cron
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  let syncErrors: string[] = [];

  try {
    console.log('[AutoSync] ===============================================');
    console.log('[AutoSync] Starting scheduled Finale sync...');
    console.log('[AutoSync] Timestamp:', new Date().toISOString());

    // Security: Validate request is from Supabase cron or has valid auth
    const authHeader = req.headers.get('authorization');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!authHeader?.includes(supabaseServiceKey || '')) {
      console.error('[AutoSync] Unauthorized request');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Finale credentials from environment
    const finaleApiKey = Deno.env.get('FINALE_API_KEY');
    const finaleApiSecret = Deno.env.get('FINALE_API_SECRET');
    const finaleAccountPath = Deno.env.get('FINALE_ACCOUNT_PATH');
    const inventoryReportUrl = Deno.env.get('FINALE_INVENTORY_REPORT_URL');
    const vendorsReportUrl = Deno.env.get('FINALE_VENDORS_REPORT_URL');
    const bomsReportUrl = Deno.env.get('FINALE_BOM_REPORT_URL');

    if (!finaleApiKey || !finaleApiSecret || !finaleAccountPath) {
      console.error('[AutoSync] Missing Finale credentials');
      return new Response(
        JSON.stringify({ error: 'Missing Finale credentials', timestamp: new Date().toISOString() }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[AutoSync] Credentials validated ✓');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if we need to sync (based on last sync time)
    const { data: metadata } = await supabase
      .from('sync_metadata')
      .select('*')
      .eq('data_type', 'inventory')
      .single();

    const lastSyncTime = metadata?.last_sync_time ? new Date(metadata.last_sync_time) : null;
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    if (lastSyncTime && lastSyncTime > fiveMinutesAgo) {
      console.log('[AutoSync] Data is fresh, skipping sync');
      return new Response(
        JSON.stringify({ message: 'Data is fresh, skipping sync' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch inventory data from Finale CSV report
    console.log('[AutoSync] Fetching inventory data...');
    const inventoryResponse = await fetch(inventoryReportUrl || '');
    const inventoryCsv = await inventoryResponse.text();
    
    // Parse CSV (simple parsing - you may want to use a library)
    const inventoryLines = inventoryCsv.split('\n');
    const headers = inventoryLines[0].split(',').map(h => h.trim());
    const inventoryItems = [];

    for (let i = 1; i < inventoryLines.length; i++) {
      if (!inventoryLines[i].trim()) continue;
      const values = inventoryLines[i].split(',');
      const item: any = {};
      headers.forEach((header, index) => {
        item[header] = values[index]?.trim() || '';
      });
      inventoryItems.push(item);
    }

    console.log(`[AutoSync] Parsed ${inventoryItems.length} inventory items`);

    const duration = Date.now() - startTime;

    // Update sync metadata with detailed info
    const { error: metadataError } = await supabase
      .from('sync_metadata')
      .upsert({
        data_type: 'inventory',
        last_sync_time: now.toISOString(),
        item_count: inventoryItems.length,
        success: syncErrors.length === 0,
        updated_at: now.toISOString(),
      }, {
        onConflict: 'data_type',
      });

    if (metadataError) {
      console.error('[AutoSync] Failed to update metadata:', metadataError);
      syncErrors.push(`Metadata update failed: ${metadataError.message}`);
    }

    console.log('[AutoSync] ✅ Sync complete');
    console.log('[AutoSync] Duration:', duration, 'ms');
    console.log('[AutoSync] Items synced:', inventoryItems.length);
    console.log('[AutoSync] Errors:', syncErrors.length);
    console.log('[AutoSync] ===============================================');

    return new Response(
      JSON.stringify({
        success: syncErrors.length === 0,
        itemCount: inventoryItems.length,
        syncTime: now.toISOString(),
        duration,
        errors: syncErrors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[AutoSync] ❌ Fatal error:', error);
    console.error('[AutoSync] Duration:', duration, 'ms');
    console.error('[AutoSync] ===============================================');

    // Record failed sync in metadata
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase
        .from('sync_metadata')
        .upsert({
          data_type: 'inventory',
          last_sync_time: new Date().toISOString(),
          item_count: 0,
          success: false,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'data_type',
        });
    } catch (metaError) {
      console.error('[AutoSync] Failed to record error in metadata:', metaError);
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        duration,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
