import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const SHOPIFY_SHOP_DOMAIN = Deno.env.get('SHOPIFY_SHOP_DOMAIN')!
const SHOPIFY_ACCESS_TOKEN = Deno.env.get('SHOPIFY_ACCESS_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const startTime = Date.now()

    console.log('🌙 Starting nightly Shopify sync...')

    // Get last sync timestamp
    const { data: lastSync } = await supabase
      .from('shopify_sync_log')
      .select('last_sync_at')
      .eq('sync_type', 'nightly')
      .order('last_sync_at', { ascending: false })
      .limit(1)
      .single()

    const sinceDate = lastSync?.last_sync_at 
      ? new Date(lastSync.last_sync_at)
      : new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours

    console.log(`Syncing orders since: ${sinceDate.toISOString()}`)

    // Fetch updated orders from Shopify
    const orders = await fetchShopifyOrders(sinceDate)
    console.log(`Fetched ${orders.length} orders from Shopify`)

    let inserted = 0
    let updated = 0
    let skipped = 0
    const errors: any[] = []

    // Process each order
    for (const order of orders) {
      try {
        const transformedOrder = transformShopifyOrder(order)
        
        // Check if order exists
        const { data: existing } = await supabase
          .from('shopify_orders')
          .select('id, updated_at')
          .eq('shopify_order_id', transformedOrder.shopify_order_id)
          .single()

        if (!existing) {
          // Insert new order
          await supabase.from('shopify_orders').insert(transformedOrder)
          inserted++
        } else if (new Date(order.updated_at) > new Date(existing.updated_at)) {
          // Update existing order
          await supabase
            .from('shopify_orders')
            .update(transformedOrder)
            .eq('shopify_order_id', transformedOrder.shopify_order_id)
          updated++
        } else {
          skipped++
        }
      } catch (error) {
        console.error(`Failed to process order ${order.id}:`, error)
        errors.push({ order_id: order.id, error: error.message })
      }
    }

    // Refresh sales summary materialized view
    await supabase.rpc('refresh_shopify_sales_summary')

    const duration = Date.now() - startTime

    // Log sync results
    await supabase.from('shopify_sync_log').insert({
      sync_type: 'nightly',
      orders_inserted: inserted,
      orders_updated: updated,
      orders_skipped: skipped,
      errors: errors.length > 0 ? errors : null,
      duration_ms: duration,
      status: errors.length === 0 ? 'success' : 'partial',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString()
    })

    console.log(`✅ Nightly sync complete: ${inserted} inserted, ${updated} updated, ${skipped} skipped`)

    return new Response(
      JSON.stringify({
        success: true,
        inserted,
        updated,
        skipped,
        errors: errors.length,
        duration_ms: duration
      }),
      {
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Nightly sync failed:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
})

async function fetchShopifyOrders(sinceDate: Date): Promise<any[]> {
  const allOrders: any[] = []
  let page = 1
  const limit = 250 // Shopify max per request

  while (true) {
    const url = new URL(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/orders.json`)
    url.searchParams.set('updated_at_min', sinceDate.toISOString())
    url.searchParams.set('limit', limit.toString())
    url.searchParams.set('page', page.toString())
    url.searchParams.set('status', 'any')

    const response = await fetch(url.toString(), {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    if (!data.orders || data.orders.length === 0) {
      break
    }

    allOrders.push(...data.orders)

    // Check if there are more pages
    if (data.orders.length < limit) {
      break
    }

    page++
    
    // Rate limiting: Shopify allows 2 requests/second for Basic, 4 for Plus
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  return allOrders
}

function transformShopifyOrder(order: any) {
  return {
    shopify_order_id: order.id.toString(),
    order_number: order.order_number.toString(),
    customer_email: order.customer?.email || null,
    customer_name: order.customer 
      ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
      : null,
    customer_phone: order.customer?.phone || null,
    total_amount: parseFloat(order.total_price),
    subtotal_amount: parseFloat(order.subtotal_price),
    tax_amount: parseFloat(order.total_tax || '0'),
    shipping_amount: parseFloat(order.total_shipping_price_set?.shop_money?.amount || '0'),
    discount_amount: parseFloat(order.total_discounts || '0'),
    currency: order.currency,
    financial_status: order.financial_status,
    fulfillment_status: order.fulfillment_status,
    line_items: order.line_items.map((item: any) => ({
      id: item.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      sku: item.sku,
      title: item.title,
      quantity: item.quantity,
      price: parseFloat(item.price),
      total: parseFloat(item.price) * item.quantity,
      vendor: item.vendor
    })),
    shipping_address: order.shipping_address || null,
    billing_address: order.billing_address || null,
    order_date: order.created_at,
    updated_date: order.updated_at,
    cancelled_date: order.cancelled_at || null,
    sync_source: 'shopify',
    raw_data: order
  }
}
