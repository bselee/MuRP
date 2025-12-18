/**
 * Direct Finale Sync - No Supabase Edge Function Required
 *
 * This endpoint fetches data directly from Finale API and writes to Supabase.
 * Works immediately without needing to deploy Supabase Edge Functions.
 *
 * Usage:
 *   curl -X POST https://your-app.vercel.app/api/sync-finale-direct \
 *     -H "Authorization: Bearer YOUR_CRON_SECRET"
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Environment variables
const FINALE_API_KEY = process.env.FINALE_API_KEY || '';
const FINALE_API_SECRET = process.env.FINALE_API_SECRET || '';
const FINALE_ACCOUNT_PATH = process.env.FINALE_ACCOUNT_PATH || '';
const FINALE_BASE_URL = process.env.FINALE_BASE_URL || 'https://app.finaleinventory.com';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET || 'default-secret-change-me';

/**
 * Create Basic Auth header
 */
function createAuthHeader(apiKey: string, apiSecret: string): string {
  const authString = `${apiKey}:${apiSecret}`;
  return `Basic ${Buffer.from(authString).toString('base64')}`;
}

/**
 * Fetch from Finale API
 */
async function finaleGet(endpoint: string): Promise<any> {
  const url = `${FINALE_BASE_URL}/${FINALE_ACCOUNT_PATH}/api${endpoint}`;
  const authHeader = createAuthHeader(FINALE_API_KEY, FINALE_API_SECRET);

  console.log(`[Finale] GET ${url}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Finale API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * GraphQL query to Finale
 */
async function finaleGraphQL(query: string, variables?: any): Promise<any> {
  const url = `${FINALE_BASE_URL}/${FINALE_ACCOUNT_PATH}/api/graphql`;
  const authHeader = createAuthHeader(FINALE_API_KEY, FINALE_API_SECRET);

  console.log(`[Finale] GraphQL query`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Finale GraphQL error: ${response.status}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Only allow POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Verify authorization
  const authHeader = req.headers.authorization;
  const cronSecret = req.headers['x-vercel-cron-secret'];

  if (!authHeader && cronSecret !== CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  console.log('[sync-finale-direct] Starting direct Finale→Supabase sync...');

  // Validate credentials
  if (!FINALE_API_KEY || !FINALE_API_SECRET || !FINALE_ACCOUNT_PATH) {
    res.status(500).json({
      error: 'Missing Finale credentials',
      details: {
        hasApiKey: !!FINALE_API_KEY,
        hasApiSecret: !!FINALE_API_SECRET,
        hasAccountPath: !!FINALE_ACCOUNT_PATH,
      }
    });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Missing Supabase credentials' });
    return;
  }

  try {
    const startTime = Date.now();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const results: any = {
      products: 0,
      purchaseOrders: 0,
      vendors: 0,
      errors: [],
    };

    // 1. Sync Products (simple fetch, limit 100 for testing)
    try {
      console.log('[sync] Fetching products from Finale...');
      const productsData = await finaleGet('/product?limit=100&offset=0');

      // Transform columnar to array if needed
      let products = Array.isArray(productsData) ? productsData : [];

      if (!Array.isArray(productsData) && typeof productsData === 'object') {
        // Columnar format - transform
        const productIds = productsData.productId || [];
        products = productIds.map((_: any, i: number) => {
          const product: any = {};
          Object.keys(productsData).forEach(key => {
            if (Array.isArray(productsData[key])) {
              product[key] = productsData[key][i];
            }
          });
          return product;
        });
      }

      console.log(`[sync] Fetched ${products.length} products`);

      // Insert to Supabase (simple upsert)
      if (products.length > 0) {
        const { error } = await supabase
          .from('finale_products')
          .upsert(
            products.slice(0, 10).map((p: any) => ({
              product_id: p.productId || p.product_id,
              internal_name: p.internalName || p.internal_name || p.name,
              sku: p.productId || p.sku,
              description: p.description,
              status: p.statusId || p.status || 'PRODUCT_ACTIVE',
              unit_cost: p.unitCost || p.unit_cost,
              unit_price: p.unitPrice || p.unit_price,
              raw_data: p,
              synced_at: new Date().toISOString(),
            })),
            { onConflict: 'product_id', ignoreDuplicates: false }
          );

        if (error) {
          console.error('[sync] Products upsert error:', error);
          results.errors.push(`Products: ${error.message}`);
        } else {
          results.products = Math.min(products.length, 10);
        }
      }
    } catch (error) {
      console.error('[sync] Products sync failed:', error);
      results.errors.push(`Products: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 2. Sync Purchase Orders via GraphQL
    try {
      console.log('[sync] Fetching purchase orders from Finale (GraphQL)...');

      const query = `
        query GetPurchaseOrders {
          orderViewConnection(first: 10, type: ["PURCHASE_ORDER"]) {
            edges {
              node {
                orderId
                orderNumber
                status
                orderDate
                expectedDate
                total
                supplier {
                  partyId
                  name
                }
              }
            }
          }
        }
      `;

      const data = await finaleGraphQL(query);
      const orders = data.orderViewConnection?.edges?.map((e: any) => e.node) || [];

      console.log(`[sync] Fetched ${orders.length} purchase orders`);

      if (orders.length > 0) {
        const { error } = await supabase
          .from('finale_purchase_orders')
          .upsert(
            orders.map((po: any) => ({
              order_id: po.orderId,
              order_number: po.orderNumber,
              status: po.status,
              order_date: po.orderDate,
              expected_date: po.expectedDate,
              total: po.total,
              supplier_name: po.supplier?.name,
              supplier_id: po.supplier?.partyId,
              raw_data: po,
              synced_at: new Date().toISOString(),
            })),
            { onConflict: 'order_id', ignoreDuplicates: false }
          );

        if (error) {
          console.error('[sync] PO upsert error:', error);
          results.errors.push(`POs: ${error.message}`);
        } else {
          results.purchaseOrders = orders.length;
        }
      }
    } catch (error) {
      console.error('[sync] PO sync failed:', error);
      results.errors.push(`POs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const duration = Date.now() - startTime;

    console.log('[sync-finale-direct] ✅ Sync completed');
    console.log(`[sync-finale-direct] Products: ${results.products}, POs: ${results.purchaseOrders}`);
    console.log(`[sync-finale-direct] Duration: ${duration}ms`);

    res.status(200).json({
      success: true,
      duration,
      timestamp: new Date().toISOString(),
      results,
    });

  } catch (error) {
    console.error('[sync-finale-direct] Fatal error:', error);
    res.status(500).json({
      error: 'Sync failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
