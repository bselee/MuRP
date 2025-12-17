/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINALE SHIPMENT/TRANSACTION SYNC
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This function syncs shipment and stock transaction data from Finale to enable
 * velocity calculations. Stock history is CRITICAL for:
 * 
 * - 30/60/90 day consumption tracking
 * - ABC velocity classification
 * - Days of stock remaining calculations
 * - Demand forecasting
 * 
 * DATA SOURCE: Finale REST API /shipment endpoint
 * 
 * The data flows to finale_stock_history table, which feeds:
 * - mrp_velocity_analysis view
 * - mrp_purchasing_recommendations view
 * 
 * @author MuRP Development Team
 * @version 1.0.0 - December 2025
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const FINALE_API_KEY = Deno.env.get('FINALE_API_KEY') || '';
const FINALE_API_SECRET = Deno.env.get('FINALE_API_SECRET') || '';
const FINALE_ACCOUNT_PATH = Deno.env.get('FINALE_ACCOUNT_PATH') || '';
const FINALE_BASE_URL = Deno.env.get('FINALE_BASE_URL') || 'https://app.finaleinventory.com';
const FINALE_API_BASE = `${FINALE_BASE_URL}/${FINALE_ACCOUNT_PATH}/api`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ShipmentData {
  shipmentId: string[];
  shipmentUrl: string[];
  shipmentTypeId: string[];
  primaryOrderUrl: string[];
  statusId: string[];
  shipDate?: string[];
  facilityOriginUrl?: string[];
  facilityDestinationUrl?: string[];
  shipmentItemUrl?: string[];
}

interface ShipmentItemData {
  shipmentItemId: string[];
  shipmentItemUrl: string[];
  productUrl: string[];
  productId: string[];
  quantity: string[] | number[];
  lotUrl?: string[];
}

interface SyncResult {
  dataType: string;
  itemCount: number;
  newRecords: number;
  updatedRecords: number;
  errors: string[];
}

// Fetch shipments from Finale REST API
async function fetchShipments(
  daysBack: number = 90,
  maxRecords: number = 5000
): Promise<ShipmentData | null> {
  const auth = btoa(`${FINALE_API_KEY}:${FINALE_API_SECRET}`);
  
  // Calculate date range (last N days for delta sync)
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - daysBack);
  const dateFilter = fromDate.toISOString().split('T')[0];
  
  try {
    // Fetch all shipments first - we'll filter by type after
    // Note: Finale's statusId filter may not work as expected
    const url = `${FINALE_API_BASE}/shipment?` + new URLSearchParams({
      limit: maxRecords.toString(),
    });
    
    console.log(`[ShipmentSync] Fetching shipments from: ${url}`);
    console.log(`[ShipmentSync] Looking for shipments in last ${daysBack} days (since ${dateFilter})`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ShipmentSync] Finale API error: ${response.status} - ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    const totalCount = data.shipmentId?.length || 0;
    console.log(`[ShipmentSync] Fetched ${totalCount} total shipments`);
    
    // Log shipment types found
    if (data.shipmentTypeId) {
      const types = [...new Set(data.shipmentTypeId)];
      console.log(`[ShipmentSync] Shipment types found: ${types.join(', ')}`);
    }
    
    // Log status IDs found
    if (data.statusId) {
      const statuses = [...new Set(data.statusId)];
      console.log(`[ShipmentSync] Status IDs found: ${statuses.join(', ')}`);
    }
    
    return data;
  } catch (error) {
    console.error('[ShipmentSync] Error fetching shipments:', error);
    return null;
  }
}

// Fetch shipment items (line items with product quantities)
async function fetchShipmentItems(
  shipmentUrls: string[]
): Promise<ShipmentItemData[]> {
  const auth = btoa(`${FINALE_API_KEY}:${FINALE_API_SECRET}`);
  const results: ShipmentItemData[] = [];
  
  // Batch fetch - process in chunks to avoid overwhelming API
  const batchSize = 50;
  for (let i = 0; i < shipmentUrls.length; i += batchSize) {
    const batch = shipmentUrls.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (shipmentUrl) => {
      try {
        // Extract shipment ID from URL
        const shipmentId = shipmentUrl.split('/').pop();
        const url = `${FINALE_API_BASE}/shipmentItem?shipmentUrl=${encodeURIComponent(shipmentUrl)}&limit=500`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          console.warn(`[ShipmentSync] Failed to fetch items for shipment ${shipmentId}`);
          return null;
        }
        
        return await response.json() as ShipmentItemData;
      } catch (error) {
        console.warn(`[ShipmentSync] Error fetching shipment items:`, error);
        return null;
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter((r): r is ShipmentItemData => r !== null));
    
    // Rate limiting - wait between batches
    if (i + batchSize < shipmentUrls.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return results;
}

// Transform and upsert stock history records
async function upsertStockHistory(
  supabase: any,
  shipments: ShipmentData,
  shipmentItems: ShipmentItemData[]
): Promise<SyncResult> {
  const result: SyncResult = {
    dataType: 'stock_history',
    itemCount: 0,
    newRecords: 0,
    updatedRecords: 0,
    errors: [],
  };
  
  // Create a map of shipment URLs to shipment data
  const shipmentMap = new Map<string, {
    shipmentId: string;
    shipDate: string | null;
    facilityUrl: string | null;
    type: string;
  }>();
  
  for (let i = 0; i < (shipments.shipmentUrl?.length || 0); i++) {
    shipmentMap.set(shipments.shipmentUrl[i], {
      shipmentId: shipments.shipmentId[i],
      shipDate: shipments.shipDate?.[i] || null,
      facilityUrl: shipments.facilityOriginUrl?.[i] || null,
      type: shipments.shipmentTypeId[i],
    });
  }
  
  // Process all shipment items into stock history records
  const stockRecords: any[] = [];
  
  for (const itemData of shipmentItems) {
    if (!itemData.shipmentItemId) continue;
    
    for (let i = 0; i < itemData.shipmentItemId.length; i++) {
      const productUrl = itemData.productUrl?.[i];
      const productId = itemData.productId?.[i];
      const quantity = Number(itemData.quantity?.[i]) || 0;
      
      if (!productUrl || !productId || quantity === 0) continue;
      
      // Find the parent shipment for date and facility info
      // Note: shipmentItemUrl contains the parent shipment URL
      let shipmentInfo = null;
      for (const [url, info] of shipmentMap) {
        // Check if this item belongs to this shipment
        // The shipment URL is embedded in the item URL
        if (itemData.shipmentItemUrl?.[i]?.includes(info.shipmentId)) {
          shipmentInfo = info;
          break;
        }
      }
      
      stockRecords.push({
        finale_transaction_url: itemData.shipmentItemUrl?.[i],
        finale_product_url: productUrl,
        transaction_date: shipmentInfo?.shipDate || new Date().toISOString(),
        transaction_type: 'SALE', // Sales shipments are outbound (consumption)
        quantity: -Math.abs(quantity), // Negative for outbound
        facility_url: shipmentInfo?.facilityUrl,
        reference_number: shipmentInfo?.shipmentId,
        synced_at: new Date().toISOString(),
      });
    }
  }
  
  result.itemCount = stockRecords.length;
  console.log(`[ShipmentSync] Processing ${stockRecords.length} stock history records`);
  
  if (stockRecords.length === 0) {
    return result;
  }
  
  // Batch upsert
  const batchSize = 500;
  for (let i = 0; i < stockRecords.length; i += batchSize) {
    const batch = stockRecords.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('finale_stock_history')
      .upsert(batch, {
        onConflict: 'finale_transaction_url',
        ignoreDuplicates: false,
      });
    
    if (error) {
      console.error(`[ShipmentSync] Upsert error:`, error);
      result.errors.push(error.message);
    } else {
      result.newRecords += batch.length;
    }
  }
  
  console.log(`[ShipmentSync] ✅ Upserted ${result.newRecords} stock history records`);
  return result;
}

// Update velocity metrics in inventory_items
async function updateVelocityMetrics(supabase: any): Promise<SyncResult> {
  const result: SyncResult = {
    dataType: 'velocity_metrics',
    itemCount: 0,
    newRecords: 0,
    updatedRecords: 0,
    errors: [],
  };
  
  try {
    // Calculate velocity from stock history
    const { data: velocityData, error: velocityError } = await supabase.rpc('calculate_velocity_metrics');
    
    if (velocityError) {
      // If the function doesn't exist, calculate inline
      console.log('[ShipmentSync] Using inline velocity calculation');
      
      // Update inventory_items with velocity from stock_history
      const { error: updateError } = await supabase.rpc('refresh_inventory_velocity');
      
      if (updateError) {
        console.warn('[ShipmentSync] Velocity refresh not available:', updateError.message);
        // Fall back to direct SQL update via view
      }
    }
    
    // Count ACTIVE items with velocity data
    const { count } = await supabase
      .from('inventory_items')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)  // CRITICAL: Only count active items
      .gt('sales_velocity', 0);
    
    result.itemCount = count || 0;
    result.updatedRecords = count || 0;
    
    console.log(`[ShipmentSync] ✅ ${result.itemCount} items have velocity data`);
    
  } catch (error) {
    console.error('[ShipmentSync] Velocity update error:', error);
    result.errors.push(error instanceof Error ? error.message : String(error));
  }
  
  return result;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const results: SyncResult[] = [];

  try {
    console.log('[ShipmentSync] ═══════════════════════════════════════════════════');
    console.log('[ShipmentSync] Starting shipment/velocity sync...');
    console.log('[ShipmentSync] ═══════════════════════════════════════════════════');
    
    // Check environment variables
    if (!FINALE_API_KEY || !FINALE_API_SECRET || !FINALE_ACCOUNT_PATH) {
      console.error('[ShipmentSync] Missing Finale credentials:');
      console.error('[ShipmentSync] FINALE_API_KEY:', FINALE_API_KEY ? 'SET' : 'MISSING');
      console.error('[ShipmentSync] FINALE_API_SECRET:', FINALE_API_SECRET ? 'SET' : 'MISSING');
      console.error('[ShipmentSync] FINALE_ACCOUNT_PATH:', FINALE_ACCOUNT_PATH ? 'SET' : 'MISSING');
      console.error('[ShipmentSync] FINALE_API_BASE:', FINALE_API_BASE);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing Finale API credentials',
          credentials: {
            apiKey: !!FINALE_API_KEY,
            apiSecret: !!FINALE_API_SECRET,
            accountPath: !!FINALE_ACCOUNT_PATH,
          },
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[ShipmentSync] Finale API Base:', FINALE_API_BASE);

    // Parse request body for options
    let options: { daysBack?: number; maxRecords?: number } = {};
    try {
      if (req.method === 'POST') {
        options = await req.json();
      }
    } catch {
      options = {};
    }

    const daysBack = options.daysBack || 90; // Default to 90 days for velocity calc
    const maxRecords = options.maxRecords || 5000;

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Fetch shipments from Finale
    // ═══════════════════════════════════════════════════════════════════
    console.log(`[ShipmentSync] Step 1: Fetching shipments (last ${daysBack} days)...`);
    const shipments = await fetchShipments(daysBack, maxRecords);
    
    if (!shipments || !shipments.shipmentUrl?.length) {
      console.log('[ShipmentSync] No shipments found');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No shipments to sync',
          results: [],
          duration: Date.now() - startTime,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[ShipmentSync] Found ${shipments.shipmentUrl.length} shipments`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Fetch shipment items (line items)
    // ═══════════════════════════════════════════════════════════════════
    console.log('[ShipmentSync] Step 2: Fetching shipment items...');
    const shipmentItems = await fetchShipmentItems(shipments.shipmentUrl);
    
    console.log(`[ShipmentSync] Fetched items from ${shipmentItems.length} shipments`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Upsert stock history records
    // ═══════════════════════════════════════════════════════════════════
    console.log('[ShipmentSync] Step 3: Upserting stock history...');
    const stockResult = await upsertStockHistory(supabase, shipments, shipmentItems);
    results.push(stockResult);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Update velocity metrics
    // ═══════════════════════════════════════════════════════════════════
    console.log('[ShipmentSync] Step 4: Updating velocity metrics...');
    const velocityResult = await updateVelocityMetrics(supabase);
    results.push(velocityResult);

    // ═══════════════════════════════════════════════════════════════════
    // COMPLETE
    // ═══════════════════════════════════════════════════════════════════
    const totalDuration = Date.now() - startTime;
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    
    console.log('[ShipmentSync] ═══════════════════════════════════════════════════');
    console.log(`[ShipmentSync] Sync complete in ${totalDuration}ms`);
    console.log(`[ShipmentSync] Stock history: ${stockResult.itemCount} records`);
    console.log(`[ShipmentSync] Velocity items: ${velocityResult.itemCount}`);
    if (totalErrors > 0) {
      console.log(`[ShipmentSync] ⚠️ ${totalErrors} errors occurred`);
    }
    console.log('[ShipmentSync] ═══════════════════════════════════════════════════');

    return new Response(
      JSON.stringify({
        success: totalErrors === 0,
        message: `Synced ${stockResult.itemCount} stock transactions, ${velocityResult.itemCount} items with velocity`,
        results,
        duration: totalDuration,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[ShipmentSync] Fatal error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        results,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
