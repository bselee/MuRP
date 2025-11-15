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

    // Get environment variables first
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    // Security: Validate request has authorization header
    const authHeader = req.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[AutoSync] Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing auth header' }),
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

    // Initialize Supabase client (reuse env vars from auth check)
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

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
    
    if (!inventoryResponse.ok) {
      const error = `HTTP ${inventoryResponse.status}: ${inventoryResponse.statusText}`;
      console.error('[AutoSync] Failed to fetch inventory:', error);
      syncErrors.push(`Inventory fetch failed: ${error}`);
      throw new Error(error);
    }
    
    const inventoryCsv = await inventoryResponse.text();
    console.log(`[AutoSync] Fetched ${inventoryCsv.length} bytes of CSV data`);
    
    // Parse CSV using proper CSV parsing (handles commas in quotes)
    const inventoryLines = inventoryCsv.split('\n').filter(line => line.trim());
    if (inventoryLines.length === 0) {
      console.warn('[AutoSync] No data in CSV');
      syncErrors.push('Empty CSV file');
      throw new Error('Empty CSV file');
    }

    const headers = inventoryLines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    console.log(`[AutoSync] CSV Headers:`, headers);
    
    const rawItems = [];
    for (let i = 1; i < inventoryLines.length; i++) {
      if (!inventoryLines[i].trim()) continue;
      const values = inventoryLines[i].split(',');
      const item: any = {};
      headers.forEach((header, index) => {
        const value = values[index]?.trim().replace(/"/g, '') || '';
        item[header] = value;
      });
      rawItems.push(item);
    }

    console.log(`[AutoSync] Parsed ${rawItems.length} raw items`);

    // Transform to inventory_items schema
    const inventoryItems = rawItems.map((raw, index) => {
      const sku = raw['SKU'] || raw['sku'] || raw['Product Code'] || '';
      const name = raw['Name'] || raw['name'] || raw['Product Name'] || '';
      
      if (!sku || !name) {
        console.warn(`[AutoSync] Skipping item ${index} - missing SKU or name`);
        return null;
      }

      return {
        sku: sku,
        name: name,
        description: raw['Description'] || raw['description'] || '',
        status: (raw['Status'] || raw['status'] || 'active').toLowerCase(),
        category: raw['Category'] || raw['category'] || 'Uncategorized',
        units_in_stock: parseInt(raw['Units in stock'] || raw['In Stock'] || '0') || 0,
        units_on_order: parseInt(raw['Units On Order'] || raw['On Order'] || '0') || 0,
        units_reserved: parseInt(raw['Units Reserved'] || raw['Reserved'] || '0') || 0,
        reorder_point: parseInt(raw['ReOr point'] || raw['Reorder Point'] || '10') || 10,
        reorder_variance: parseInt(raw['ReOr var'] || raw['Reorder Variance'] || '0') || 0,
        qty_to_order: parseInt(raw['Qty to Order'] || raw['Quantity to Order'] || '0') || 0,
        sales_velocity_consolidated: parseFloat(raw['BuildASoil sales velocity'] || raw['Sales Velocity'] || '0') || 0,
        sales_last_30_days: parseInt(raw['Sales last 30 days'] || '0') || 0,
        sales_last_90_days: parseInt(raw['Sales last 90 days'] || '0') || 0,
        unit_cost: parseFloat(raw['Unit Cost'] || raw['Cost'] || '0') || 0,
        unit_price: parseFloat(raw['Unit Price'] || raw['Price'] || '0') || 0,
        warehouse_location: raw['Location'] || raw['Warehouse'] || '',
        data_source: 'api' as const,
        last_sync_at: now.toISOString(),
        sync_status: 'synced' as const,
      };
    }).filter(item => item !== null);

    console.log(`[AutoSync] Transformed ${inventoryItems.length} valid items`);

    // Store inventory data in Supabase
    if (inventoryItems.length > 0) {
      console.log('[AutoSync] Deleting old inventory data...');
      const { error: deleteError } = await supabase
        .from('inventory_items')
        .delete()
        .neq('id', 0); // Delete all rows

      if (deleteError) {
        console.error('[AutoSync] Failed to delete old inventory:', deleteError);
        syncErrors.push(`Delete failed: ${deleteError.message}`);
      }

      console.log('[AutoSync] Inserting new inventory data...');
      const { error: insertError } = await supabase
        .from('inventory_items')
        .insert(inventoryItems);

      if (insertError) {
        console.error('[AutoSync] Failed to insert inventory:', insertError);
        syncErrors.push(`Insert failed: ${insertError.message}`);
      } else {
        console.log(`[AutoSync] ✓ Inserted ${inventoryItems.length} inventory items`);
      }
    }

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
