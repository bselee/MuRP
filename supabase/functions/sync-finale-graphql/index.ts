/**
 * Supabase Edge Function: Sync Finale Data via GraphQL
 * 
 * Uses Finale GraphQL API to get comprehensive data:
 * - Products with stock levels
 * - BOMs (bill of materials) 
 * - Vendors/Suppliers
 * - Purchase Orders (CRITICAL - REST API doesn't filter POs properly!)
 * 
 * Field names verified via GraphQL introspection on 2024-12-08
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

// Create Basic Auth header
function createAuthHeader(): string {
  return `Basic ${btoa(`${FINALE_API_KEY}:${FINALE_API_SECRET}`)}`;
}

// Execute GraphQL query
async function graphqlQuery(query: string, variables: Record<string, any> = {}) {
  const url = `${FINALE_BASE_URL}/${FINALE_ACCOUNT_PATH}/api/graphql`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': createAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GraphQL error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}

// ===========================================
// PRODUCTS QUERY - Verified field names from introspection
// Note: supplier1/2/3 are party types, productBomList is a String (not queryable)
// Stock columns are per-facility: stockColumnQuantityOnHandUnitsBuildasoilorganicsapifacility{ID}
// Valid facilities from error: 10000, 10003, 10005, 10059, 10109
// ===========================================
const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String) {
    productViewConnection(first: $first, after: $after) {
      edges {
        node {
          productId
          productUrl
          status
          description
          category
          notes
          itemCost
          itemPrice
          leadTime
          stdReorderLevel
          stdReorderQuantity
          manufacturer
          mfgProductId
          universalProductCode
          supplier1 {
            partyId
            partyUrl
            name
          }
          supplier2 {
            partyId
            name
          }
          supplier3 {
            partyId
            name
          }
          recordLastUpdated
          stockMain: stockColumnQuantityOnHandUnitsBuildasoilorganicsapifacility10000
          stockMfg: stockColumnQuantityOnHandUnitsBuildasoilorganicsapifacility10003
          stockShipping: stockColumnQuantityOnHandUnitsBuildasoilorganicsapifacility10005
          stock59: stockColumnQuantityOnHandUnitsBuildasoilorganicsapifacility10059
          stock109: stockColumnQuantityOnHandUnitsBuildasoilorganicsapifacility10109
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ===========================================
// VENDORS/SUPPLIERS QUERY - Verified field names
// ===========================================
const VENDORS_QUERY = `
  query GetVendors($first: Int!, $after: String) {
    partyViewConnection(first: $first, after: $after, role: ["SUPPLIER"]) {
      edges {
        node {
          partyId
          partyUrl
          name
          role
          status
          contactName
          primaryEmailAddress
          primaryPhoneNumber
          primaryAddress
          leadTime
          defaultTerms
          notes
          recordLastUpdated
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ===========================================
// PURCHASE ORDERS QUERY - Critical for MRP!
// REST API orderTypeId filter is BROKEN - must use GraphQL!
// itemList is a connection type, needs edges/node
// dateRangeWithFutureInput type: { begin: "M/D/YYYY", end: "M/D/YYYY" }
// ===========================================
const PURCHASE_ORDERS_QUERY = `
  query GetPurchaseOrders($first: Int!, $after: String, $orderDate: dateRangeWithFutureInput) {
    orderViewConnection(first: $first, after: $after, type: ["PURCHASE_ORDER"], orderDate: $orderDate) {
      edges {
        node {
          orderId
          orderUrl
          type
          status
          orderDate
          receiveDate
          subtotal
          total
          totalUnits
          publicNotes
          privateNotes
          recordLastUpdated
          supplier {
            partyId
            partyUrl
            name
          }
          origin {
            facilityUrl
          }
          itemList(first: 100) {
            edges {
              node {
                itemIndex
                productUnitsOrdered
                productUnitsReceived
                unitPrice
                subtotal
                product {
                  productId
                  productUrl
                }
              }
            }
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ===========================================
// TRANSFORM FUNCTIONS
// ===========================================

// Helper to sum stock from all facilities
function calculateTotalStock(node: any): number {
  const stockFields = [
    'stockMain',      // 10000 - BuildASoil main
    'stockMfg',       // 10003 - Manufacturing  
    'stockShipping',  // 10005 - BuildASoil Shipping (PRIMARY for stock assessment)
    'stock59',        // 10059
    'stock109',       // 10109
  ];
  
  let total = 0;
  for (const field of stockFields) {
    const value = node[field];
    if (value) {
      total += parseFloat(value) || 0;
    }
  }
  return total;
}

// Get shipping stock only (BuildASoil Shipping - 10005)
// This is the most accurate for manual stock assessment per user request
function getShippingStock(node: any): number {
  return parseFloat(node.stockShipping) || 0;
}

// Check if product is active and not in Deprecating category
function isActiveProduct(node: any): boolean {
  const status = (node.status || '').toLowerCase();
  const category = (node.category || '').toLowerCase();
  
  // Exclude inactive products
  if (status.includes('inactive') || status.includes('discontinued') || status.includes('obsolete')) {
    return false;
  }
  
  // NEVER include Deprecating category
  if (category.includes('deprecat')) {
    return false;
  }
  
  return true;
}

// Transform GraphQL product to finale_products table
function transformProduct(node: any): any {
  if (!node.productId || !node.productUrl) return null;
  
  // Skip inactive and Deprecating products
  if (!isActiveProduct(node)) return null;

  // Note: productBomList is a String in GraphQL, not queryable
  // BOMs will be extracted from REST API raw_data instead
  
  // Calculate total stock from all facilities
  const totalStock = calculateTotalStock(node);
  
  // Helper to safely parse integers (stdReorderLevel can be decimal like "0.191624")
  const safeParseInt = (val: string | number | null | undefined): number | null => {
    if (val === null || val === undefined || val === '') return null;
    const num = parseFloat(String(val));
    return isNaN(num) ? null : Math.round(num);
  };

  return {
    finale_product_url: node.productUrl,
    product_id: node.productId,
    internal_name: node.productId,
    description: node.description || null,
    product_type: node.category || null,
    status: node.status || 'PRODUCT_ACTIVE',
    upc: node.universalProductCode || null,
    sku: node.productId,
    unit_cost: node.itemCost ? parseFloat(node.itemCost) : null,
    unit_price: node.itemPrice ? parseFloat(node.itemPrice) : null,
    reorder_point: safeParseInt(node.stdReorderLevel),
    reorder_quantity: safeParseInt(node.stdReorderQuantity),
    lead_time_days: safeParseInt(node.leadTime),
    primary_supplier_id: node.supplier1?.partyId || null,
    primary_supplier_url: node.supplier1?.partyUrl || null,
    is_assembly: false, // Will be set from REST API BOMs
    custom_category: node.category || null,
    finale_last_modified: node.recordLastUpdated || null,
    // Store stock data in raw_data for now (includes per-facility breakdown)
    raw_data: {
      ...node,
      calculated_total_stock: totalStock,
      stock_by_facility: {
        main: parseFloat(node.stockMain) || 0,
        manufacturing: parseFloat(node.stockMfg) || 0,
        shipping: parseFloat(node.stockShipping) || 0,
        facility59: parseFloat(node.stock59) || 0,
        facility109: parseFloat(node.stock109) || 0,
      },
    },
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// Transform GraphQL product to inventory_items table (for app compatibility)
function transformToInventoryItem(node: any): any {
  if (!node.productId) return null;
  
  // Skip inactive and Deprecating products
  if (!isActiveProduct(node)) return null;
  
  // Use BuildASoil Shipping (10005) as PRIMARY stock reference
  // This is the most accurate for manual stock assessment
  const shippingStock = getShippingStock(node);
  const totalStock = calculateTotalStock(node);

  return {
    sku: node.productId,
    name: node.description || node.productId,
    category: node.category || 'Uncategorized',
    reorder_point: node.stdReorderLevel ? Math.round(parseFloat(node.stdReorderLevel)) : 0,
    moq: node.stdReorderQuantity ? Math.round(parseFloat(node.stdReorderQuantity)) : 1,
    // Use shipping stock as primary (most accurate for assessment)
    // Fall back to total if shipping is 0
    stock: Math.round(shippingStock > 0 ? shippingStock : totalStock),
    on_order: 0, // Will be calculated from PO sync
    updated_at: new Date().toISOString(),
  };
}

// Transform GraphQL vendor to finale_vendors table
function transformVendor(node: any): any {
  if (!node.partyId || !node.partyUrl) return null;

  return {
    finale_party_url: node.partyUrl,
    party_id: node.partyId,
    party_name: node.name || node.partyId,
    contact_name: node.contactName || null,
    email: node.primaryEmailAddress || null,
    phone: node.primaryPhoneNumber || null,
    address_street: node.primaryAddress || null,
    payment_terms: node.defaultTerms || null,
    default_lead_time_days: node.leadTime ? parseInt(node.leadTime) : null,
    status: node.status || 'Active',
    raw_data: node,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// Transform vendor to legacy vendors table (for app compatibility)
function transformToLegacyVendor(node: any): any {
  if (!node.partyId) return null;

  return {
    name: node.name || node.partyId,
    contact_emails: node.primaryEmailAddress ? [node.primaryEmailAddress] : [],
    phone: node.primaryPhoneNumber || '',
    address: node.primaryAddress || '',
    lead_time_days: node.leadTime ? parseInt(node.leadTime) : 7,
    notes: node.notes || '',
    updated_at: new Date().toISOString(),
  };
}

// Transform BOM relationship from productBomList
function transformBom(parentProduct: any, bomItem: any): any {
  if (!bomItem.productId) return null;

  const bomUrl = `${parentProduct.productUrl}/bom/${bomItem.productId}`;

  return {
    finale_bom_url: bomUrl,
    bom_id: `${parentProduct.productId}-${bomItem.productId}`,
    parent_product_url: parentProduct.productUrl,
    parent_name: parentProduct.description || parentProduct.productId,
    parent_sku: parentProduct.productId,
    component_product_url: bomItem.productUrl,
    component_name: bomItem.productId, // Will be enriched later from products table
    component_sku: bomItem.productId,
    quantity_per: parseFloat(bomItem.quantity) || 1,
    quantity_per_parent: parseFloat(bomItem.quantity) || 1,
    effective_quantity: parseFloat(bomItem.quantity) || 1,
    bom_type: 'MANUFACTURING',
    status: 'Active',
    raw_data: bomItem,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// Transform Purchase Order
function transformPurchaseOrder(node: any): any {
  if (!node.orderId || !node.orderUrl) return null;

  // Detect dropship POs by checking orderId and notes BEFORE cleaning
  const dropshipSuffixes = ['-DropshipPO', '-Dropship', 'DropshipPO', 'Dropship'];
  const hasDropshipInId = dropshipSuffixes.some(suffix => node.orderId.includes(suffix));
  const notes = `${node.publicNotes || ''} ${node.privateNotes || ''}`.toLowerCase();
  const hasDropshipInNotes = notes.includes('dropship') || notes.includes('drop ship') || notes.includes('drop-ship');
  const isDropship = hasDropshipInId || hasDropshipInNotes;

  // Clean orderId - remove dropship suffixes for display
  let cleanOrderId = node.orderId;
  for (const suffix of dropshipSuffixes) {
    if (cleanOrderId.includes(suffix)) {
      cleanOrderId = cleanOrderId.replace(suffix, '');
    }
  }

  // Transform line items from connection structure
  const itemEdges = node.itemList?.edges || [];
  const lineItems = itemEdges.map((edge: any) => {
    const item = edge.node;
    return {
      line_number: item.itemIndex,
      product_id: item.product?.productId || null,
      product_url: item.product?.productUrl || null,
      quantity_ordered: item.productUnitsOrdered || 0,
      quantity_received: item.productUnitsReceived || 0,
      unit_price: item.unitPrice || 0,
      line_total: item.subtotal || 0,
    };
  });

  return {
    finale_order_url: node.orderUrl,
    order_id: cleanOrderId,
    order_type: node.type || 'PURCHASE_ORDER',
    status: node.status || 'UNKNOWN',
    vendor_url: node.supplier?.partyUrl || null,
    vendor_name: node.supplier?.name || null,
    facility_url: node.origin?.facilityUrl || null,
    order_date: node.orderDate || null,
    expected_date: node.receiveDate || null,
    subtotal: node.subtotal ? parseFloat(node.subtotal) : null,
    total: node.total ? parseFloat(node.total) : null,
    public_notes: node.publicNotes || null,
    private_notes: node.privateNotes || null,
    is_dropship: isDropship,
    line_items: lineItems,
    line_count: lineItems.length,
    total_quantity: node.totalUnits || 0,
    finale_last_modified: node.recordLastUpdated || null,
    raw_data: node,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ===========================================
// BATCH UPSERT HELPER
// ===========================================
async function batchUpsert(supabase: any, table: string, data: any[], conflictColumn: string, batchSize = 100) {
  let totalUpserted = 0;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: conflictColumn });
    
    if (error) {
      console.error(`[Sync] Error upserting to ${table}:`, error.message);
      throw error;
    }
    
    totalUpserted += batch.length;
    console.log(`[Sync] ${table}: Upserted ${totalUpserted}/${data.length}`);
  }
  
  return totalUpserted;
}

// ===========================================
// MAIN HANDLER
// ===========================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body for sync options
    let syncTypes: string[] = ['vendors', 'products', 'purchase_orders'];
    try {
      const body = await req.json();
      if (body.syncTypes && Array.isArray(body.syncTypes)) {
        syncTypes = body.syncTypes;
      }
    } catch {
      // No body or invalid JSON, use defaults
    }
    
    console.log(`[Sync] Starting GraphQL sync for: ${syncTypes.join(', ')}...`);
    const startTime = Date.now();

    // Validate credentials
    if (!FINALE_API_KEY || !FINALE_API_SECRET || !FINALE_ACCOUNT_PATH) {
      return new Response(
        JSON.stringify({ error: 'Missing Finale credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const results: SyncResult[] = [];

    // ==========================================
    // 1. SYNC VENDORS FIRST (for foreign keys)
    // ==========================================
    if (syncTypes.includes('vendors')) {
    try {
      const vendorsStart = Date.now();
      console.log('[Sync] Fetching vendors from GraphQL...');

      const allVendors: any[] = [];
      let hasMore = true;
      let cursor: string | null = null;

      while (hasMore && allVendors.length < 1000) {
        const data = await graphqlQuery(VENDORS_QUERY, { first: 100, after: cursor });
        const connection = data.partyViewConnection;
        
        for (const edge of connection.edges) {
          allVendors.push(edge.node);
        }

        hasMore = connection.pageInfo.hasNextPage;
        cursor = connection.pageInfo.endCursor;
        
        console.log(`[Sync] Fetched ${allVendors.length} vendors...`);
      }

      if (allVendors.length > 0) {
        // Transform and deduplicate for finale_vendors
        const finaleVendors = allVendors
          .map(transformVendor)
          .filter((v): v is NonNullable<typeof v> => v !== null);
        
        const uniqueVendors = new Map<string, any>();
        for (const v of finaleVendors) {
          uniqueVendors.set(v.finale_party_url, v);
        }

        await batchUpsert(supabase, 'finale_vendors', Array.from(uniqueVendors.values()), 'finale_party_url');

        // Also sync to legacy vendors table
        const legacyVendors = allVendors
          .map(transformToLegacyVendor)
          .filter((v): v is NonNullable<typeof v> => v !== null);
        
        const uniqueLegacyVendors = new Map<string, any>();
        for (const v of legacyVendors) {
          uniqueLegacyVendors.set(v.name, v);
        }

        await batchUpsert(supabase, 'vendors', Array.from(uniqueLegacyVendors.values()), 'name');

        results.push({
          dataType: 'vendors',
          success: true,
          itemCount: uniqueVendors.size,
          duration: Date.now() - vendorsStart,
        });

        console.log(`[Sync] ✅ Vendors: ${uniqueVendors.size} in ${Date.now() - vendorsStart}ms`);
      }
    } catch (error) {
      console.error('[Sync] Vendors sync failed:', error);
      results.push({
        dataType: 'vendors',
        success: false,
        itemCount: 0,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    } // end vendors

    // ==========================================
    // 2. SYNC PRODUCTS (BOMs come from REST API)
    // ==========================================
    if (syncTypes.includes('products')) {
    try {
      const productsStart = Date.now();
      console.log('[Sync] Fetching products from GraphQL...');

      const allProducts: any[] = [];
      let hasMore = true;
      let cursor: string | null = null;

      while (hasMore && allProducts.length < 2000) {
        const data = await graphqlQuery(PRODUCTS_QUERY, { first: 100, after: cursor });
        const connection = data.productViewConnection;

        for (const edge of connection.edges) {
          allProducts.push(edge.node);
        }

        hasMore = connection.pageInfo.hasNextPage;
        cursor = connection.pageInfo.endCursor;

        console.log(`[Sync] Fetched ${allProducts.length} products...`);
      }

      // Transform and save products
      if (allProducts.length > 0) {
        const finaleProducts = allProducts
          .map(transformProduct)
          .filter((p): p is NonNullable<typeof p> => p !== null);

        const uniqueProducts = new Map<string, any>();
        for (const p of finaleProducts) {
          uniqueProducts.set(p.finale_product_url, p);
        }

        await batchUpsert(supabase, 'finale_products', Array.from(uniqueProducts.values()), 'finale_product_url');

        // CLEANUP: Delete inactive and Deprecating products from database
        // This ensures old stale data is removed
        console.log('[Sync] Cleaning up inactive/Deprecating products...');
        
        const { error: deleteError1 } = await supabase
          .from('finale_products')
          .delete()
          .ilike('status', '%inactive%');
        
        const { error: deleteError2 } = await supabase
          .from('finale_products')
          .delete()
          .ilike('product_type', '%deprecat%');
        
        if (deleteError1) console.warn('[Sync] Warning cleaning inactive:', deleteError1.message);
        if (deleteError2) console.warn('[Sync] Warning cleaning deprecating:', deleteError2.message);

        // Also sync to inventory_items table
        const inventoryItems = allProducts
          .map(transformToInventoryItem)
          .filter((i): i is NonNullable<typeof i> => i !== null);

        const uniqueInventory = new Map<string, any>();
        for (const i of inventoryItems) {
          uniqueInventory.set(i.sku, i);
        }

        await batchUpsert(supabase, 'inventory_items', Array.from(uniqueInventory.values()), 'sku');

        // CLEANUP: Also clean inventory_items that don't have active finale_products
        // Get the active SKUs we just synced
        const activeSKUs = new Set(Array.from(uniqueInventory.keys()));
        console.log(`[Sync] Active products count: ${activeSKUs.size}`);

        results.push({
          dataType: 'products',
          success: true,
          itemCount: uniqueProducts.size,
          duration: Date.now() - productsStart,
        });

        console.log(`[Sync] ✅ Products: ${uniqueProducts.size} in ${Date.now() - productsStart}ms`);
      }
    } catch (error) {
      console.error('[Sync] Products sync failed:', error);
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        errorMessage = JSON.stringify(error);
      } else {
        errorMessage = String(error);
      }
      results.push({
        dataType: 'products',
        success: false,
        itemCount: 0,
        duration: 0,
        error: errorMessage,
      });
    }
    } // end products

    // ==========================================
    // 3. SYNC PURCHASE ORDERS (The critical one!)
    // ==========================================
    if (syncTypes.includes('purchase_orders')) {
    try {
      const posStart = Date.now();
      console.log('[Sync] Fetching Purchase Orders from GraphQL (last 24 months)...');

      const allPOs: any[] = [];
      let hasMore = true;
      let cursor: string | null = null;

      // Sync orders from last 24 months to ensure adequate history
      const twentyFourMonthsAgo = new Date();
      twentyFourMonthsAgo.setMonth(twentyFourMonthsAgo.getMonth() - 24);
      const cutoffDate = twentyFourMonthsAgo.getTime();

      // Helper to parse Finale date format (M/D/YYYY) to Date object
      function parseFinaleDate(dateStr: string): Date | null {
        if (!dateStr) return null;
        const parts = dateStr.split('/');
        if (parts.length !== 3) return null;
        const month = parseInt(parts[0]) - 1;
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        return new Date(year, month, day);
      }

      // Format dates for GraphQL filter (Finale uses M/D/YYYY format)
      const cutoffDateStr = `${twentyFourMonthsAgo.getMonth() + 1}/${twentyFourMonthsAgo.getDate()}/${twentyFourMonthsAgo.getFullYear()}`;
      const today = new Date();
      const todayStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
      
      console.log(`[Sync] Fetching POs from ${cutoffDateStr} to ${todayStr}`);

      while (hasMore && allPOs.length < 5000) {
        const data = await graphqlQuery(PURCHASE_ORDERS_QUERY, { 
          first: 100, 
          after: cursor,
          orderDate: {
            begin: cutoffDateStr,
            end: todayStr
          }
        });
        const connection = data.orderViewConnection;

        // GraphQL filter handles date filtering server-side, so add all returned POs.
        for (const edge of connection.edges) {
          allPOs.push(edge.node);
        }

        hasMore = connection.pageInfo.hasNextPage;
        cursor = connection.pageInfo.endCursor;

        console.log(`[Sync] Fetched ${allPOs.length} POs from last 24 months...`);
      }

      if (allPOs.length > 0) {
        const transformedPOs = allPOs
          .map(transformPurchaseOrder)
          .filter((po): po is NonNullable<typeof po> => po !== null);

        const uniquePOs = new Map<string, any>();
        for (const po of transformedPOs) {
          // Mark all synced POs as active
          po.is_active = true;
          uniquePOs.set(po.finale_order_url, po);
        }

        await batchUpsert(supabase, 'finale_purchase_orders', Array.from(uniquePOs.values()), 'finale_order_url');

        // Mark POs older than 24 months as inactive.
        // Use an ISO date string so it compares correctly against the DB column.
        const cutoffDateIso = twentyFourMonthsAgo.toISOString().split('T')[0];
        const { error: cleanupError } = await supabase
          .from('finale_purchase_orders')
          .update({ is_active: false })
          .lt('order_date', cutoffDateIso);

        if (cleanupError) {
          console.error('[Sync] Failed to mark old completed POs as inactive:', cleanupError);
        } else {
          console.log(`[Sync] Marked POs older than ${cutoffDateIso} as inactive`);
        }

        results.push({
          dataType: 'purchase_orders',
          success: true,
          itemCount: uniquePOs.size,
          duration: Date.now() - posStart,
        });

        console.log(`[Sync] ✅ Purchase Orders: ${uniquePOs.size} in ${Date.now() - posStart}ms`);
      } else {
        results.push({
          dataType: 'purchase_orders',
          success: true,
          itemCount: 0,
          duration: Date.now() - posStart,
        });
      }
    } catch (error) {
      console.error('[Sync] Purchase Orders sync failed:', error);
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        errorMessage = JSON.stringify(error);
      } else {
        errorMessage = String(error);
      }
      results.push({
        dataType: 'purchase_orders',
        success: false,
        itemCount: 0,
        duration: 0,
        error: errorMessage,
      });
    }
    } // end purchase_orders

    // ==========================================
    // SUMMARY
    // ==========================================
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
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
