import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const SHOPIFY_API_SECRET = Deno.env.get('SHOPIFY_API_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  try {
    // Verify webhook signature
    const hmac = req.headers.get('X-Shopify-Hmac-SHA256')
    const topic = req.headers.get('X-Shopify-Topic')
    const shop = req.headers.get('X-Shopify-Shop-Domain')
    const bodyText = await req.text()

    if (!hmac || !topic || !shop) {
      return new Response('Missing required headers', { status: 400 })
    }

    // Verify HMAC signature
    const isValid = await verifyWebhookSignature(hmac, bodyText, SHOPIFY_API_SECRET)
    if (!isValid) {
      console.error('Invalid webhook signature')
      return new Response('Unauthorized', { status: 401 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const payload = JSON.parse(bodyText)

    // Log webhook receipt
    await supabase.from('shopify_webhook_log').insert({
      topic,
      shop_domain: shop,
      webhook_id: payload.id?.toString(),
      payload,
      headers: Object.fromEntries(req.headers.entries()),
      signature_valid: isValid,
      received_at: new Date().toISOString()
    })

    // Route to appropriate handler
    switch (topic) {
      case 'orders/create':
      case 'orders/updated':
        await handleOrderWebhook(supabase, payload, topic)
        break
      
      case 'inventory_levels/update':
        await handleInventoryWebhook(supabase, payload)
        break
      
      default:
        console.log(`Unhandled webhook topic: ${topic}`)
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
})

async function verifyWebhookSignature(
  hmac: string,
  body: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)))
  
  return hmac === base64Signature
}

async function handleOrderWebhook(supabase: any, orderData: any, topic: string) {
  console.log(`Processing ${topic} for order #${orderData.order_number}`)

  // Transform Shopify order to internal schema
  const transformedOrder = {
    shopify_order_id: orderData.id.toString(),
    order_number: orderData.order_number.toString(),
    customer_email: orderData.customer?.email || null,
    customer_name: orderData.customer 
      ? `${orderData.customer.first_name || ''} ${orderData.customer.last_name || ''}`.trim()
      : null,
    customer_phone: orderData.customer?.phone || null,
    total_amount: parseFloat(orderData.total_price),
    subtotal_amount: parseFloat(orderData.subtotal_price),
    tax_amount: parseFloat(orderData.total_tax || '0'),
    shipping_amount: parseFloat(orderData.total_shipping_price_set?.shop_money?.amount || '0'),
    discount_amount: parseFloat(orderData.total_discounts || '0'),
    currency: orderData.currency,
    financial_status: orderData.financial_status,
    fulfillment_status: orderData.fulfillment_status,
    line_items: orderData.line_items.map((item: any) => ({
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
    shipping_address: orderData.shipping_address || null,
    billing_address: orderData.billing_address || null,
    order_date: orderData.created_at,
    updated_date: orderData.updated_at,
    cancelled_date: orderData.cancelled_at || null,
    sync_source: 'shopify',
    raw_data: orderData
  }

  // Upsert order (handles both create and update)
  const { error: orderError } = await supabase
    .from('shopify_orders')
    .upsert(transformedOrder, { onConflict: 'shopify_order_id' })

  if (orderError) {
    console.error('Failed to upsert order:', orderError)
    throw orderError
  }

  // Trigger inventory verification for line items
  if (orderData.financial_status === 'paid') {
    await triggerInventoryVerification(supabase, transformedOrder.line_items)
  }

  // Update webhook log as processed
  await supabase
    .from('shopify_webhook_log')
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq('webhook_id', orderData.id.toString())

  console.log(`✅ Order ${orderData.order_number} processed successfully`)
}

async function handleInventoryWebhook(supabase: any, inventoryData: any) {
  console.log(`Processing inventory update for item #${inventoryData.inventory_item_id}`)

  // Fetch current internal inventory level
  const { data: internalItem } = await supabase
    .from('inventory')
    .select('sku, quantity')
    .eq('shopify_inventory_item_id', inventoryData.inventory_item_id.toString())
    .single()

  if (!internalItem) {
    console.warn(`No internal inventory found for Shopify item ${inventoryData.inventory_item_id}`)
    return
  }

  const shopifyQty = inventoryData.available || 0
  const internalQty = internalItem.quantity
  const difference = Math.abs(shopifyQty - internalQty)

  // Only log if there's a discrepancy
  if (difference > 0) {
    await supabase.from('shopify_inventory_verification').insert({
      sku: internalItem.sku,
      shopify_qty: shopifyQty,
      internal_qty: internalQty,
      difference,
      issue_type: 'quantity_mismatch',
      status: 'pending',
      verified_at: new Date().toISOString()
    })

    console.log(`⚠️ Inventory discrepancy detected: ${internalItem.sku} (Shopify: ${shopifyQty}, Internal: ${internalQty})`)
  }
}

async function triggerInventoryVerification(supabase: any, lineItems: any[]) {
  for (const item of lineItems) {
    if (!item.sku) continue

    // Fetch internal inventory
    const { data: internalItem } = await supabase
      .from('inventory')
      .select('quantity')
      .eq('sku', item.sku)
      .single()

    if (!internalItem) {
      await supabase.from('shopify_inventory_verification').insert({
        sku: item.sku,
        shopify_qty: 0, // Unknown from order
        internal_qty: 0,
        difference: 0,
        issue_type: 'missing_in_internal',
        status: 'pending',
        verified_at: new Date().toISOString()
      })
      continue
    }

    // Check if stock will be low after this order
    const projectedQty = internalItem.quantity - item.quantity
    if (projectedQty <= 10) {
      await supabase.from('shopify_inventory_verification').insert({
        sku: item.sku,
        shopify_qty: 0, // Will be updated by inventory webhook
        internal_qty: projectedQty,
        difference: 0,
        issue_type: 'low_stock',
        status: 'pending',
        notes: `Order #${item.id} will reduce stock to ${projectedQty}`,
        verified_at: new Date().toISOString()
      })
    }
  }
}
