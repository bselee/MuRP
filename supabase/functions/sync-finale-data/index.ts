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

// Transform Finale product to inventory_items table format (what the app uses)
function transformToInventoryItem(product: any): any {
  if (!product.productId) {
    return null;
  }

  return {
    sku: product.productId,
    name: product.internalName || product.description || product.productId,
    category: product.category || product.productType || 'Uncategorized',
    reorder_point: product.reorderPoint ? parseInt(product.reorderPoint) : 0,
    moq: product.minimumOrderQty ? parseInt(product.minimumOrderQty) : 1,
    stock: 0, // Will be updated by inventory sync
    on_order: 0, // Will be updated by PO sync
    updated_at: new Date().toISOString(),
  };
}

// Transform Finale vendor/party to finale_vendors table format
function transformVendor(party: any): any {
  const partyUrl = party.partyUrl || party.partyGroupUrl || 
    (party.partyId ? `/${Deno.env.get('FINALE_ACCOUNT_PATH')}/api/partygroup/${party.partyId}` : null);
  
  if (!partyUrl || !party.partyId) {
    return null;
  }

  return {
    finale_party_url: partyUrl,
    party_id: party.partyId,
    party_name: party.name || party.partyId,
    contact_name: party.contactName || null,
    email: party.email || null,
    phone: party.phone || null,
    address_street: party.addressStreet || party.street || null,
    address_city: party.addressCity || party.city || null,
    address_state: party.addressState || party.state || null,
    address_postal_code: party.addressPostalCode || party.postalCode || null,
    address_country: party.addressCountry || party.country || null,
    payment_terms: party.paymentTerms || null,
    default_lead_time_days: party.leadTimeDays ? parseInt(party.leadTimeDays) : null,
    status: party.status || 'Active',
    raw_data: party,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// Transform to legacy vendors table format (what app uses)
function transformToLegacyVendor(party: any): any {
  if (!party.partyId && !party.name) {
    return null;
  }

  return {
    name: party.name || party.partyId,
    contact_emails: party.email ? [party.email] : [],
    phone: party.phone || '',
    address: [party.addressStreet, party.addressCity, party.addressState, party.addressPostalCode]
      .filter(Boolean).join(', ') || '',
    website: party.website || '',
    lead_time_days: party.leadTimeDays ? parseInt(party.leadTimeDays) : 7,
    notes: '',
    updated_at: new Date().toISOString(),
  };
}

// Extract BOMs from product's productAssocList
function extractBomsFromProduct(product: any, accountPath: string): any[] {
  const boms: any[] = [];
  const productAssocList = product.productAssocList || [];
  
  for (const assoc of productAssocList) {
    // Only process MANUF_COMPONENT type (manufacturing BOMs)
    if (assoc.productAssocTypeId !== 'MANUF_COMPONENT') {
      continue;
    }
    
    const items = assoc.productAssocItemList || [];
    for (const item of items) {
      if (!item.productId) continue;
      
      // Create unique BOM URL for this parent-component pair
      const bomUrl = `/${accountPath}/api/bom/${product.productId}/${item.productId}`;
      
      boms.push({
        finale_bom_url: bomUrl,
        bom_id: `${product.productId}-${item.productId}`,
        
        // Parent (what we're building)
        parent_product_url: product.productUrl || `/${accountPath}/api/product/${product.productId}`,
        parent_name: product.internalName || product.productId,
        parent_sku: product.productId,
        
        // Component (what goes into it)
        component_product_url: item.productUrl || `/${accountPath}/api/product/${item.productId}`,
        component_name: item.itemDescription || item.productId,
        component_sku: item.productId,
        
        // Quantities
        quantity_per: item.quantity || 1,
        quantity_per_parent: item.quantity || 1,
        effective_quantity: item.quantity || 1,
        
        // Metadata
        bom_type: 'MANUFACTURING',
        status: 'Active',
        raw_data: item,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }
  
  return boms;
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
      
      // Fetch with pagination - get all active products (excluding Deprecating category)
      const allProducts: any[] = [];
      let offset = 0;
      const limit = 500; // Batch size
      let hasMore = true;
      const maxProducts = 3000; // ~300 active products expected, buffer for safety

      while (hasMore && allProducts.length < maxProducts) {
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

      // Filter: NEVER from "Deprecating" category
      // NOTE: REST API statusId is unreliable (all show as PRODUCT_INACTIVE)
      // GraphQL has accurate status - use that for filtering active vs inactive
      const activeProducts = allProducts.filter((p) => {
        const category = (p.userCategory || p.category || p.productType || '').toLowerCase();
        
        // NEVER include Deprecating category
        if (category.includes('deprecat')) {
          return false;
        }
        
        return true;
      });

      console.log(`[Sync] Products after filtering: ${activeProducts.length} (excluded ${allProducts.length - activeProducts.length} deprecating)`);

      if (activeProducts.length > 0) {
        // Transform products to our table format
        const transformedProducts = activeProducts
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

        // ALSO sync to inventory_items table (what the app actually uses!)
        const inventoryStart = Date.now();
        console.log('[Sync] Syncing to inventory_items table for app compatibility...');
        
        const inventoryItems = activeProducts
          .map((p) => transformToInventoryItem(p))
          .filter((p): p is NonNullable<typeof p> => p !== null);
        
        // Deduplicate by SKU
        const uniqueInventory = new Map<string, typeof inventoryItems[0]>();
        for (const item of inventoryItems) {
          uniqueInventory.set(item.sku, item);
        }
        const deduplicatedInventory = Array.from(uniqueInventory.values());
        
        console.log(`[Sync] Upserting ${deduplicatedInventory.length} items to inventory_items...`);
        
        const { error: invError } = await supabase
          .from('inventory_items')
          .upsert(deduplicatedInventory, { onConflict: 'sku' });
        
        if (invError) {
          console.error('[Sync] inventory_items upsert error:', JSON.stringify(invError));
          results.push({
            dataType: 'inventory_items',
            success: false,
            itemCount: 0,
            duration: Date.now() - inventoryStart,
            error: invError.message || JSON.stringify(invError),
          });
        } else {
          results.push({
            dataType: 'inventory_items',
            success: true,
            itemCount: deduplicatedInventory.length,
            duration: Date.now() - inventoryStart,
          });
          console.log(`[Sync] ✅ inventory_items: ${deduplicatedInventory.length} items in ${Date.now() - inventoryStart}ms`);
        }

        // ========================================
        // EXTRACT AND SYNC BOMs (from active products only)
        // ========================================
        const bomsStart = Date.now();
        console.log('[Sync] Extracting BOMs from active products...');
        
        const accountPath = FINALE_ACCOUNT_PATH;
        const allBoms: any[] = [];
        
        for (const product of activeProducts) {
          const productBoms = extractBomsFromProduct(product, accountPath);
          allBoms.push(...productBoms);
        }
        
        console.log(`[Sync] Found ${allBoms.length} BOM entries from ${activeProducts.length} active products`);
        
        if (allBoms.length > 0) {
          // Deduplicate by finale_bom_url
          const uniqueBoms = new Map<string, typeof allBoms[0]>();
          for (const bom of allBoms) {
            uniqueBoms.set(bom.finale_bom_url, bom);
          }
          const deduplicatedBoms = Array.from(uniqueBoms.values());
          
          console.log(`[Sync] Upserting ${deduplicatedBoms.length} BOMs to finale_boms...`);
          
          const { error: bomError } = await supabase
            .from('finale_boms')
            .upsert(deduplicatedBoms, { onConflict: 'finale_bom_url' });
          
          if (bomError) {
            console.error('[Sync] finale_boms upsert error:', JSON.stringify(bomError));
            results.push({
              dataType: 'finale_boms',
              success: false,
              itemCount: 0,
              duration: Date.now() - bomsStart,
              error: bomError.message || JSON.stringify(bomError),
            });
          } else {
            results.push({
              dataType: 'finale_boms',
              success: true,
              itemCount: deduplicatedBoms.length,
              duration: Date.now() - bomsStart,
            });
            console.log(`[Sync] ✅ finale_boms: ${deduplicatedBoms.length} items in ${Date.now() - bomsStart}ms`);
            
            // ========================================
            // SYNC finale_boms → boms table (app format)
            // ========================================
            const bomsAppStart = Date.now();
            console.log('[Sync] Aggregating BOMs for app display...');
            
            // Group components by parent SKU
            const bomsByParent = new Map<string, any[]>();
            for (const bom of deduplicatedBoms) {
              const parentSku = bom.parent_sku;
              if (!bomsByParent.has(parentSku)) {
                bomsByParent.set(parentSku, []);
              }
              bomsByParent.get(parentSku)!.push(bom);
            }
            
            // Transform to boms table format
            const appBoms: any[] = [];
            for (const [parentSku, components] of bomsByParent) {
              const firstComponent = components[0];
              const bomComponents = components.map(c => ({
                sku: c.component_sku,
                name: c.component_name || c.component_sku,
                quantity: c.quantity_per || 1,
                unit: 'each',
              }));
              
              appBoms.push({
                finished_sku: parentSku,
                name: firstComponent.parent_name || parentSku,
                description: `Assembly with ${components.length} components`,
                category: 'Manufacturing',
                yield_quantity: 1,
                components: bomComponents, // JSONB array
                artwork: [],
                packaging: {},
                barcode: '',
                data_source: 'finale_api',
                last_sync_at: new Date().toISOString(),
                sync_status: 'synced',
                updated_at: new Date().toISOString(),
              });
            }
            
            if (appBoms.length > 0) {
              const { error: appBomError } = await supabase
                .from('boms')
                .upsert(appBoms, { onConflict: 'finished_sku' });
              
              if (appBomError) {
                console.error('[Sync] boms table upsert error:', appBomError);
              } else {
                console.log(`[Sync] ✅ boms (app): ${appBoms.length} assemblies in ${Date.now() - bomsAppStart}ms`);
                results.push({
                  dataType: 'boms_app',
                  success: true,
                  itemCount: appBoms.length,
                  duration: Date.now() - bomsAppStart,
                });
              }
            }
          }
        } else {
          results.push({
            dataType: 'finale_boms',
            success: true,
            itemCount: 0,
            duration: Date.now() - bomsStart,
            error: 'No BOMs found in products',
          });
        }
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

    // ========================================
    // SYNC VENDORS
    // ========================================
    try {
      const vendorsStart = Date.now();
      console.log('[Sync] Fetching vendors from Finale...');
      
      const columnarVendors = await finaleGet('/partygroup?role=SUPPLIER&limit=500');
      const allVendors = transformColumnarToRows(columnarVendors);
      
      console.log(`[Sync] Fetched ${allVendors.length} vendors`);

      if (allVendors.length > 0) {
        // Transform to finale_vendors format
        const transformedVendors = allVendors
          .map((v) => transformVendor(v))
          .filter((v): v is NonNullable<typeof v> => v !== null);
        
        // Deduplicate by finale_party_url
        const uniqueVendors = new Map<string, typeof transformedVendors[0]>();
        for (const vendor of transformedVendors) {
          uniqueVendors.set(vendor.finale_party_url, vendor);
        }
        const deduplicatedVendors = Array.from(uniqueVendors.values());
        
        console.log(`[Sync] Upserting ${deduplicatedVendors.length} vendors to finale_vendors...`);
        
        const { error: vendorError } = await supabase
          .from('finale_vendors')
          .upsert(deduplicatedVendors, { onConflict: 'finale_party_url' });
        
        if (vendorError) {
          console.error('[Sync] finale_vendors upsert error:', JSON.stringify(vendorError));
          results.push({
            dataType: 'finale_vendors',
            success: false,
            itemCount: 0,
            duration: Date.now() - vendorsStart,
            error: vendorError.message || JSON.stringify(vendorError),
          });
        } else {
          results.push({
            dataType: 'finale_vendors',
            success: true,
            itemCount: deduplicatedVendors.length,
            duration: Date.now() - vendorsStart,
          });
          console.log(`[Sync] ✅ finale_vendors: ${deduplicatedVendors.length} items in ${Date.now() - vendorsStart}ms`);
        }

        // Also sync to legacy vendors table
        const legacyVendorsStart = Date.now();
        const legacyVendors = allVendors
          .map((v) => transformToLegacyVendor(v))
          .filter((v): v is NonNullable<typeof v> => v !== null);
        
        // Deduplicate by name
        const uniqueLegacyVendors = new Map<string, typeof legacyVendors[0]>();
        for (const vendor of legacyVendors) {
          uniqueLegacyVendors.set(vendor.name, vendor);
        }
        const deduplicatedLegacyVendors = Array.from(uniqueLegacyVendors.values());
        
        const { error: legacyError } = await supabase
          .from('vendors')
          .upsert(deduplicatedLegacyVendors, { onConflict: 'name' });
        
        if (legacyError) {
          console.error('[Sync] vendors (legacy) upsert error:', JSON.stringify(legacyError));
        } else {
          results.push({
            dataType: 'vendors',
            success: true,
            itemCount: deduplicatedLegacyVendors.length,
            duration: Date.now() - legacyVendorsStart,
          });
          console.log(`[Sync] ✅ vendors (legacy): ${deduplicatedLegacyVendors.length} items`);
        }
      }
    } catch (error) {
      console.error('[Sync] Vendors sync failed:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : (typeof error === 'object' ? JSON.stringify(error) : String(error));
      results.push({
        dataType: 'vendors',
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
