/**
 * AfterShip Webhook Handler
 *
 * Receives real-time tracking updates from AfterShip and:
 * 1. Updates PO tracking status
 * 2. Correlates with email threads
 * 3. Creates Air Traffic Controller alerts for delays
 * 4. Logs tracking events
 *
 * Webhook URL: https://<project>.supabase.co/functions/v1/aftership-webhook
 * Configure in AfterShip: Settings > Webhooks > Add Webhook
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import { createHmac } from 'https://deno.land/std@0.201.0/crypto/mod.ts';

type TrackingStatus =
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'cancelled'
  | 'invoice_received';

interface AfterShipWebhookPayload {
  event: string;
  msg: {
    id: string;
    tracking_number: string;
    slug: string;
    tag: string;
    subtag?: string;
    subtag_message?: string;
    expected_delivery?: string;
    checkpoints?: Array<{
      slug: string;
      city?: string;
      state?: string;
      country_name?: string;
      message: string;
      tag: string;
      subtag?: string;
      checkpoint_time: string;
      coordinates?: [number, number];
      location?: string;
    }>;
    custom_fields?: {
      po_id?: string;
      po_number?: string;
    };
    title?: string;
    order_id?: string;
  };
  ts: number;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, aftership-hmac-sha256',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const webhookSecret = Deno.env.get('AFTERSHIP_WEBHOOK_SECRET');
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const rawBody = await req.text();

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const signature = req.headers.get('aftership-hmac-sha256');
      if (!signature || !verifySignature(rawBody, signature, webhookSecret)) {
        console.error('[aftership-webhook] Invalid signature');
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const payload: AfterShipWebhookPayload = JSON.parse(rawBody);

    console.log(`[aftership-webhook] Received event: ${payload.event} for tracking ${payload.msg.tracking_number}`);

    // Only process tracking update events
    if (!['tracking_update', 'tracking_checkpoint'].includes(payload.event)) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'Event type not handled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await processTrackingUpdate(supabase, payload);

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[aftership-webhook] Error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function verifySignature(body: string, signature: string, secret: string): boolean {
  try {
    const encoder = new TextEncoder();
    const key = encoder.encode(secret);
    const data = encoder.encode(body);

    const hmac = createHmac('sha256', key);
    hmac.update(data);
    const computed = hmac.digest('base64');

    return computed === signature;
  } catch {
    return false;
  }
}

async function processTrackingUpdate(supabase: ReturnType<typeof createClient>, payload: AfterShipWebhookPayload) {
  const { msg } = payload;
  const trackingNumber = msg.tracking_number;
  const status = mapAfterShipTag(msg.tag);
  const latestCheckpoint = msg.checkpoints?.length ? msg.checkpoints[msg.checkpoints.length - 1] : null;

  // Find matching PO by tracking number
  const { data: purchaseOrders, error: poError } = await supabase
    .from('purchase_orders')
    .select('id, order_id, vendor_id, vendor_name, expected_date, tracking_status')
    .eq('tracking_number', trackingNumber)
    .limit(1);

  if (poError) {
    throw new Error(`Failed to find PO: ${poError.message}`);
  }

  if (!purchaseOrders?.length) {
    // Try custom fields (po_id passed when creating tracking)
    if (msg.custom_fields?.po_id) {
      const { data: poById } = await supabase
        .from('purchase_orders')
        .select('id, order_id, vendor_id, vendor_name, expected_date, tracking_status')
        .eq('id', msg.custom_fields.po_id)
        .single();

      if (poById) {
        purchaseOrders?.push(poById);
      }
    }
  }

  if (!purchaseOrders?.length) {
    console.warn(`[aftership-webhook] No PO found for tracking ${trackingNumber}`);
    return { matched: false, trackingNumber };
  }

  const po = purchaseOrders[0];
  const previousStatus = po.tracking_status as TrackingStatus;

  // Update PO tracking status
  const updateData: Record<string, unknown> = {
    tracking_status: status,
    tracking_last_checked_at: new Date().toISOString(),
  };

  if (msg.expected_delivery) {
    updateData.tracking_estimated_delivery = msg.expected_delivery;
  }

  if (status === 'exception') {
    updateData.tracking_last_exception = msg.subtag_message || latestCheckpoint?.message || 'Tracking exception';
  }

  const { error: updateError } = await supabase
    .from('purchase_orders')
    .update(updateData)
    .eq('id', po.id);

  if (updateError) {
    throw new Error(`Failed to update PO: ${updateError.message}`);
  }

  // Log tracking event
  await supabase.from('po_tracking_events').insert({
    po_id: po.id,
    status,
    carrier: msg.slug,
    tracking_number: trackingNumber,
    description: latestCheckpoint?.message || `AfterShip webhook: ${msg.tag}`,
    raw_payload: msg,
  });

  // Correlate with email threads
  await correlateWithEmailThreads(supabase, po, trackingNumber, status, latestCheckpoint);

  // Assess delay impact (Air Traffic Controller)
  if (status === 'exception' || (msg.expected_delivery && po.expected_date)) {
    await assessDelayImpact(supabase, po, {
      status,
      estimatedDelivery: msg.expected_delivery,
      description: latestCheckpoint?.message,
    });
  }

  // Notify on delivery
  if (status === 'delivered' && previousStatus !== 'delivered') {
    await notifyDelivery(supabase, po);
  }

  return {
    matched: true,
    poId: po.id,
    poNumber: po.order_id,
    previousStatus,
    newStatus: status,
    estimatedDelivery: msg.expected_delivery,
  };
}

/**
 * Correlate tracking updates with email threads
 * Links webhook updates to any email conversations about this PO/tracking
 */
async function correlateWithEmailThreads(
  supabase: ReturnType<typeof createClient>,
  po: { id: string; order_id: string; vendor_name: string },
  trackingNumber: string,
  status: TrackingStatus,
  checkpoint: AfterShipWebhookPayload['msg']['checkpoints'][0] | null
) {
  try {
    // Find email threads related to this PO
    const { data: threads } = await supabase
      .from('email_threads')
      .select('id, thread_id')
      .eq('po_id', po.id)
      .order('last_message_at', { ascending: false })
      .limit(5);

    if (!threads?.length) {
      return; // No email threads for this PO
    }

    // Add tracking update as a thread note/event
    for (const thread of threads) {
      await supabase.from('email_thread_messages').insert({
        thread_id: thread.id,
        message_type: 'tracking_update',
        from_address: 'system@aftership.com',
        subject: `Tracking Update: ${status.replace('_', ' ').toUpperCase()}`,
        body_text: checkpoint?.message || `Package ${trackingNumber} is now ${status}`,
        body_html: null,
        received_at: new Date().toISOString(),
        extracted_data: {
          tracking_number: trackingNumber,
          status,
          location: checkpoint?.location || checkpoint?.city,
          checkpoint_time: checkpoint?.checkpoint_time,
        },
      });
    }

    // Create alert for exceptions
    if (status === 'exception') {
      await supabase.from('email_tracking_alerts').insert({
        po_id: po.id,
        alert_type: 'tracking_exception',
        severity: 'high',
        title: `Tracking Exception: ${po.order_id}`,
        message: checkpoint?.message || `Package ${trackingNumber} has an exception`,
        metadata: {
          tracking_number: trackingNumber,
          vendor: po.vendor_name,
          checkpoint,
        },
      });
    }

  } catch (error) {
    console.error('[aftership-webhook] Email correlation failed:', error);
    // Don't throw - tracking update should still succeed
  }
}

async function notifyDelivery(
  supabase: ReturnType<typeof createClient>,
  po: { id: string; order_id: string; vendor_name: string }
) {
  try {
    await supabase.from('system_notifications').insert({
      channel: 'logistics',
      title: 'Purchase Order Delivered',
      message: `PO ${po.order_id} from ${po.vendor_name} has been delivered.`,
      severity: 'info',
      metadata: { po_id: po.id },
    });
  } catch (error) {
    console.warn('[aftership-webhook] Delivery notification failed:', error);
  }
}

/**
 * Assess delay impact using Air Traffic Controller logic
 */
async function assessDelayImpact(
  supabase: ReturnType<typeof createClient>,
  po: { id: string; order_id: string; vendor_id: string; vendor_name: string; expected_date: string },
  carrierStatus: { status: TrackingStatus; estimatedDelivery?: string; description?: string }
) {
  try {
    const originalETA = po.expected_date;
    const newETA = carrierStatus.estimatedDelivery;

    if (!originalETA || !newETA) return;

    const delayDays = Math.ceil(
      (new Date(newETA).getTime() - new Date(originalETA).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (delayDays <= 0) return; // No delay

    console.log(`✈️ [Webhook] Air Traffic Controller: PO ${po.order_id} delayed ${delayDays} days`);

    // Get PO items to assess stock impact
    const { data: poItems } = await supabase
      .from('purchase_order_items')
      .select(`
        inventory_sku,
        item_name,
        quantity_ordered,
        inventory_items (
          current_stock,
          sales_last_30_days
        )
      `)
      .eq('po_id', po.id);

    let criticalItems = 0;
    let highPriorityItems = 0;
    const affectedItems: Array<{
      sku: string;
      name: string;
      current_stock: number;
      days_until_stockout: number;
      impact_level: string;
    }> = [];

    for (const item of poItems || []) {
      const currentStock = (item.inventory_items as any)?.current_stock || 0;
      const dailySales = ((item.inventory_items as any)?.sales_last_30_days || 0) / 30;

      if (dailySales === 0) continue;

      const daysUntilStockout = currentStock / dailySales;
      let impactLevel = 'low';

      if (daysUntilStockout < delayDays) {
        impactLevel = 'critical';
        criticalItems++;
      } else if (daysUntilStockout < delayDays + 7) {
        impactLevel = 'high';
        highPriorityItems++;
      }

      if (impactLevel !== 'low') {
        affectedItems.push({
          sku: item.inventory_sku,
          name: item.item_name,
          current_stock: currentStock,
          days_until_stockout: Math.floor(daysUntilStockout),
          impact_level: impactLevel,
        });
      }
    }

    const priorityLevel = criticalItems > 0 ? 'critical' : highPriorityItems > 0 ? 'high' : 'low';

    if (priorityLevel === 'low') {
      // Silent update
      await supabase.from('purchase_orders').update({ expected_date: newETA }).eq('id', po.id);
      return;
    }

    // Create alert
    await supabase.from('po_alert_log').insert({
      po_id: po.id,
      po_number: po.order_id,
      vendor_id: po.vendor_id,
      vendor_name: po.vendor_name,
      alert_type: 'delay',
      priority_level: priorityLevel,
      delay_days: delayDays,
      original_eta: originalETA,
      new_eta: newETA,
      affected_items: affectedItems,
      impact_summary: criticalItems > 0
        ? `${criticalItems} item(s) will stockout before delivery`
        : `${highPriorityItems} item(s) will be critically low`,
      source: 'aftership_webhook',
      created_at: new Date().toISOString(),
    });

    await supabase.from('purchase_orders').update({ expected_date: newETA }).eq('id', po.id);

  } catch (error) {
    console.error('[aftership-webhook] Delay assessment failed:', error);
  }
}

function mapAfterShipTag(tag?: string): TrackingStatus {
  if (!tag) return 'processing';
  const normalized = tag.toLowerCase();
  const tagMap: Record<string, TrackingStatus> = {
    pending: 'processing',
    inforeceived: 'processing',
    info_received: 'processing',
    intransit: 'in_transit',
    in_transit: 'in_transit',
    outfordelivery: 'out_for_delivery',
    out_for_delivery: 'out_for_delivery',
    delivered: 'delivered',
    exception: 'exception',
    attemptfail: 'exception',
    availableforpickup: 'in_transit',
    expired: 'exception',
  };
  return tagMap[normalized] ?? 'processing';
}
