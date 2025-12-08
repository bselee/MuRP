/**
 * Supabase Edge Function: Sync Finale Data
 * 
 * Fetches product data directly from Finale REST API and stores in Supabase.
 * Runs on a schedule (cron) to keep Supabase data fresh from Finale.
 * 
 * Invoke via: POST https://[project-ref].supabase.co/functions/v1/sync-finale-data
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FINALE_API_KEY = Deno.env.get('FINALE_API_KEY') || '';
const FINALE_API_SECRET = Deno.env.get('FINALE_API_SECRET') || '';
const FINALE_ACCOUNT_PATH = Deno.env.get('FINALE_ACCOUNT_PATH') || '';
const FINALE_BASE_URL = Deno.env.get('FINALE_BASE_URL') || 'https://app.finaleinventory.com';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncResult {
  dataType: string;
  success: boolean;
  itemCount: number;
  duration: number;
  error?: string;
}

// Create Basic Auth header for Finale API
function createAuthHeader(apiKey: string, apiSecret: string): string {
  // Use btoa for base64 encoding in Deno
  const authString = `${apiKey}:${apiSecret}`;
  return `Basic ${btoa(authString)}`;
}

// Fetch data from Finale REST API
async function finaleGet(endpoint: string) {
  const url = `${FINALE_BASE_URL}/${FINALE_ACCOUNT_PATH}/api${endpoint}`;
  const authHeader = createAuthHeader(FINALE_API_KEY, FINALE_API_SECRET);

  console.log(`[Sync] Fetching: ${url}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Finale API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

// Transform Finale columnar data to row objects
function transformColumnarToRows(columnarData: Record<string, any[]>): any[] {
  if (!columnarData || typeof columnarData !== 'object') {
    console.log('[Sync] No columnar data received');
    return [];
  }

  const keys = Object.keys(columnarData);
  if (keys.length === 0) return [];

  const firstColumn = columnarData[keys[0]];
  if (!Array.isArray(firstColumn)) return [];

  const rowCount = firstColumn.length;
  const rows: any[] = [];

  for (let i = 0; i < rowCount; i++) {
    const row: Record<string, any> = {};
    for (const key of keys) {
      row[key] = columnarData[key]?.[i] ?? null;
    }
    rows.push(row);
  }

  return rows;
}

// Transform Finale product to our finale_products table format
function transformProduct(product: any): any {
  // finale_product_url is required and unique
  const productUrl = product.productUrl || product.productId 
    ? `/${Deno.env.get('FINALE_ACCOUNT_PATH')}/api/product/${product.productId}`
    : null;
  
  if (!productUrl || !product.productId) {
    return null; // Skip products without required fields
  }

  return {
    finale_product_url: productUrl,
    product_id: product.productId,
    internal_name: product.internalName || product.productId,
    description: product.description || null,
    product_type: product.productType || null,
    status: product.status || 'ACTIVE',
    upc: product.upc || null,
    sku: product.sku || product.productId,
    unit_cost: product.unitCost ? parseFloat(product.unitCost) : null,
    unit_price: product.unitPrice ? parseFloat(product.unitPrice) : null,
    reorder_point: product.reorderPoint ? parseInt(product.reorderPoint) : null,
    reorder_quantity: product.reorderQuantity ? parseInt(product.reorderQuantity) : null,
    minimum_order_qty: product.minimumOrderQty ? parseInt(product.minimumOrderQty) : null,
    primary_supplier_url: product.primarySupplierUrl || null,
    primary_supplier_id: product.primarySupplierId || null,
    lead_time_days: product.leadTimeDays ? parseInt(product.leadTimeDays) : null,
    is_assembly: product.isAssembly === true || product.productType === 'Assembly',
    raw_data: product,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[Sync] Starting Finale product sync...');
    const startTime = Date.now();

    // Validate credentials
    if (!FINALE_API_KEY || !FINALE_API_SECRET || !FINALE_ACCOUNT_PATH) {
      console.error('[Sync] Missing Finale credentials');
      console.error('[Sync] FINALE_API_KEY:', FINALE_API_KEY ? 'SET' : 'MISSING');
      console.error('[Sync] FINALE_API_SECRET:', FINALE_API_SECRET ? 'SET' : 'MISSING');
      console.error('[Sync] FINALE_ACCOUNT_PATH:', FINALE_ACCOUNT_PATH ? 'SET' : 'MISSING');
      return new Response(
        JSON.stringify({ 
          error: 'Missing Finale credentials',
          details: {
            apiKey: !!FINALE_API_KEY,
            apiSecret: !!FINALE_API_SECRET,
            accountPath: !!FINALE_ACCOUNT_PATH,
          }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[Sync] Missing Supabase credentials');
      return new Response(
        JSON.stringify({ error: 'Missing Supabase credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const results: SyncResult[] = [];

    // Fetch products from Finale REST API
    try {
      const productsStart = Date.now();
      console.log('[Sync] Fetching products from Finale...');
      
      // Fetch with pagination (get up to 1000 products)
      const allProducts: any[] = [];
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore && offset < 1000) {
        const columnarData = await finaleGet(`/product?limit=${limit}&offset=${offset}`);
        const products = transformColumnarToRows(columnarData);
        
        console.log(`[Sync] Fetched ${products.length} products at offset ${offset}`);
        
        if (products.length === 0) {
          hasMore = false;
        } else {
          allProducts.push(...products);
          offset += limit;
          if (products.length < limit) {
            hasMore = false;
          }
        }
      }

      console.log(`[Sync] Total products fetched: ${allProducts.length}`);

      if (allProducts.length > 0) {
        // Transform products to our table format
        const transformedProducts = allProducts
          .map((p) => transformProduct(p))
          .filter((p): p is NonNullable<typeof p> => p !== null);

        console.log(`[Sync] Transformed ${transformedProducts.length} valid products`);

        if (transformedProducts.length === 0) {
          throw new Error('No valid products after transformation');
        }

        // Deduplicate by finale_product_url (keep last occurrence)
        const uniqueProducts = new Map<string, typeof transformedProducts[0]>();
        for (const product of transformedProducts) {
          uniqueProducts.set(product.finale_product_url, product);
        }
        const deduplicatedProducts = Array.from(uniqueProducts.values());
        console.log(`[Sync] Deduplicated to ${deduplicatedProducts.length} unique products`);

        // Upsert to finale_products table (unique on finale_product_url)
        const { error } = await supabase
          .from('finale_products')
          .upsert(deduplicatedProducts, { onConflict: 'finale_product_url' });

        if (error) {
          console.error('[Sync] Supabase upsert error:', JSON.stringify(error));
          throw new Error(`Supabase upsert failed: ${error.message || JSON.stringify(error)}`);
        }

        results.push({
          dataType: 'products',
          success: true,
          itemCount: deduplicatedProducts.length,
          duration: Date.now() - productsStart,
        });

        console.log(`[Sync] ✅ Products: ${deduplicatedProducts.length} items in ${Date.now() - productsStart}ms`);
      } else {
        results.push({
          dataType: 'products',
          success: true,
          itemCount: 0,
          duration: Date.now() - productsStart,
          error: 'No products found in Finale',
        });
      }
    } catch (error) {
      console.error('[Sync] Products sync failed:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : (typeof error === 'object' ? JSON.stringify(error) : String(error));
      results.push({
        dataType: 'products',
        success: false,
        itemCount: 0,
        duration: 0,
        error: errorMessage,
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
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Sync] Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
