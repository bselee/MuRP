/**
 * ===============================================================================
 * AFTERSHIP WEBHOOK HANDLER
 * ===============================================================================
 *
 * Receives real-time webhook notifications from AfterShip for INBOUND tracking.
 * This is CRITICAL for stockout prevention - provides instant tracking updates!
 *
 * Webhook Events:
 * - tracking_update: Tracking status changed
 * - tracking_created: New tracking added (if subscribed)
 * - tracking_expired: Tracking expired
 *
 * Integration Flow:
 * 1. Verify HMAC-SHA256 signature
 * 2. Parse webhook payload
 * 3. Correlate with MuRP PO and email threads
 * 4. Update tracking data
 * 5. Trigger Air Traffic Controller for delays/exceptions
 *
 * Part of: Email Tracking Agent Expansion
 * Goal: NEVER BE OUT OF STOCK!
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts';

// ===============================================================================
// Types
// ===============================================================================

interface AfterShipWebhookPayload {
  event: string;
  event_id: string;
  is_tracking_first_tag: boolean;
  msg: {
    id: string;
    tracking_number: string;
    slug: string;
    tag: AfterShipTag;
    subtag: string | null;
    subtag_message: string | null;
    expected_delivery: string | null;
    shipment_pickup_date: string | null;
    shipment_delivery_date: string | null;
    order_id: string | null;
    order_number: string | null;
    title: string | null;
    customer_name: string | null;
    origin_country_iso3: string | null;
    destination_country_iso3: string | null;
    courier_tracking_link: string | null;
    checkpoints: AfterShipCheckpoint[];
  };
  ts: number;
}

type AfterShipTag =
  | 'Pending'
  | 'InfoReceived'
  | 'InTransit'
  | 'OutForDelivery'
  | 'AttemptFail'
  | 'Delivered'
  | 'AvailableForPickup'
  | 'Exception'
  | 'Expired';

interface AfterShipCheckpoint {
  slug: string;
  city: string | null;
  created_at: string;
  location: string | null;
  country_name: string | null;
  message: string;
  country_iso3: string | null;
  tag: AfterShipTag;
  subtag: string | null;
  subtag_message: string | null;
  checkpoint_time: string;
  state: string | null;
  zip: string | null;
}

interface AfterShipConfig {
  enabled: boolean;
  apiKey: string | null;
  webhookSecret: string | null;
  autoCorrelate: boolean;
  correlateWithEmail: boolean;
  stats: {
    totalTrackings: number;
    activeTrackings: number;
    correlatedPOs: number;
    webhooksReceived: number;
    lastWebhookAt: string | null;
  };
}

type InternalStatus =
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'cancelled';

// ===============================================================================
// CORS Headers
// ===============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, as-signature, as-signature-hmac-sha256',
};

// ===============================================================================
// Main Handler
// ===============================================================================

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Get AfterShip config
    const config = await getAfterShipConfig(supabase);

    if (!config.enabled) {
      console.log('[AfterShip Webhook] Integration disabled, ignoring webhook');
      return new Response(JSON.stringify({ success: true, message: 'Integration disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get raw body for signature verification
    const rawBody = await req.text();
    const payload: AfterShipWebhookPayload = JSON.parse(rawBody);

    console.log('[AfterShip Webhook] Received:', payload.event, payload.msg?.tracking_number);

    // Verify webhook signature if secret is configured
    const signature = req.headers.get('as-signature-hmac-sha256') || req.headers.get('as-signature');
    if (config.webhookSecret && signature) {
      const isValid = await verifySignature(rawBody, signature, config.webhookSecret);
      if (!isValid) {
        console.error('[AfterShip Webhook] Invalid signature');
        return new Response(JSON.stringify({ success: false, error: 'Invalid signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Check for duplicate event
    const { data: existingEvent } = await supabase
      .from('aftership_webhook_log')
      .select('id')
      .eq('event_id', payload.event_id)
      .maybeSingle();

    if (existingEvent) {
      console.log('[AfterShip Webhook] Skipping duplicate event:', payload.event_id);
      return new Response(JSON.stringify({ success: true, message: 'Duplicate event' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process webhook based on event type
    let result;
    switch (payload.event) {
      case 'tracking_update':
        result = await processTrackingUpdate(supabase, payload, config);
        break;
      case 'tracking_created':
        result = await processTrackingCreated(supabase, payload, config);
        break;
      case 'tracking_expired':
        result = await processTrackingExpired(supabase, payload, config);
        break;
      default:
        console.log('[AfterShip Webhook] Unknown event type:', payload.event);
        result = { success: true, message: 'Event type not handled' };
    }

    // Update stats
    await updateWebhookStats(supabase, config);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[AfterShip Webhook] Error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ===============================================================================
// Helper Functions
// ===============================================================================

async function getAfterShipConfig(supabase: any): Promise<AfterShipConfig> {
  const { data } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'aftership_config')
    .maybeSingle();

  return data?.setting_value || {
    enabled: false,
    apiKey: null,
    webhookSecret: null,
    autoCorrelate: true,
    correlateWithEmail: true,
    stats: {
      totalTrackings: 0,
      activeTrackings: 0,
      correlatedPOs: 0,
      webhooksReceived: 0,
      lastWebhookAt: null,
    },
  };
}

async function verifySignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payload)
    );

    const computedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return computedSignature === signature.toLowerCase();
  } catch (error) {
    console.error('[AfterShip Webhook] Signature verification failed:', error);
    return false;
  }
}

function mapTagToInternalStatus(tag: AfterShipTag): InternalStatus {
  const mapping: Record<string, InternalStatus> = {
    Pending: 'processing',
    InfoReceived: 'processing',
    InTransit: 'in_transit',
    OutForDelivery: 'out_for_delivery',
    AttemptFail: 'exception',
    Delivered: 'delivered',
    AvailableForPickup: 'in_transit',
    Exception: 'exception',
    Expired: 'exception',
  };

  return mapping[tag] || 'in_transit';
}

function mapSlugToCarrierName(slug: string): string {
  const mapping: Record<string, string> = {
    ups: 'UPS',
    fedex: 'FedEx',
    usps: 'USPS',
    'dhl-express': 'DHL Express',
    'dhl-ecommerce': 'DHL eCommerce',
    dhl: 'DHL',
    lasership: 'LaserShip',
    ontrac: 'OnTrac',
  };

  return mapping[slug?.toLowerCase()] || slug?.toUpperCase() || 'Unknown';
}

// ===============================================================================
// Event Processors
// ===============================================================================

async function processTrackingUpdate(
  supabase: any,
  payload: AfterShipWebhookPayload,
  config: AfterShipConfig
): Promise<{ success: boolean; poId: string | null; alertId: string | null }> {
  const tracking = payload.msg;
  let poId: string | null = null;
  let threadId: string | null = null;
  let alertId: string | null = null;
  let correlationMethod: string | null = null;

  try {
    // Find PO correlation
    if (config.autoCorrelate) {
      // Try by order number
      if (tracking.order_number) {
        const { data: poByOrder } = await supabase.rpc('find_po_by_order_number', {
          p_order_number: tracking.order_number,
        });
        if (poByOrder) {
          poId = poByOrder;
          correlationMethod = 'order_number';
        }
      }

      // Try by tracking number
      if (!poId) {
        const { data: poByTracking } = await supabase.rpc('find_po_by_aftership_tracking', {
          p_tracking_number: tracking.tracking_number,
        });
        if (poByTracking) {
          poId = poByTracking;
          correlationMethod = 'tracking_number';
        }
      }

      // Try email thread correlation
      if (config.correlateWithEmail) {
        const { data: threadByTracking } = await supabase.rpc('find_email_thread_by_aftership_tracking', {
          p_tracking_number: tracking.tracking_number,
        });

        if (threadByTracking) {
          threadId = threadByTracking;

          // If no PO yet, get from thread
          if (!poId) {
            const { data: thread } = await supabase
              .from('email_threads')
              .select('po_id')
              .eq('id', threadByTracking)
              .single();

            if (thread?.po_id) {
              poId = thread.po_id;
              correlationMethod = 'email_thread';
            }
          }
        }
      }
    }

    // Upsert tracking record
    await supabase
      .from('aftership_trackings')
      .upsert({
        aftership_id: tracking.id,
        slug: tracking.slug,
        tracking_number: tracking.tracking_number,
        po_id: poId,
        thread_id: threadId,
        correlation_method: correlationMethod,
        correlation_confidence: poId ? 0.9 : 0,
        tag: tracking.tag,
        subtag: tracking.subtag,
        subtag_message: tracking.subtag_message,
        internal_status: mapTagToInternalStatus(tracking.tag),
        expected_delivery: tracking.expected_delivery,
        shipment_pickup_date: tracking.shipment_pickup_date,
        shipment_delivery_date: tracking.shipment_delivery_date,
        origin_country_iso3: tracking.origin_country_iso3,
        destination_country_iso3: tracking.destination_country_iso3,
        courier_tracking_link: tracking.courier_tracking_link,
        title: tracking.title,
        order_id: tracking.order_id,
        order_number: tracking.order_number,
        customer_name: tracking.customer_name,
        checkpoints: tracking.checkpoints,
        latest_checkpoint_message: tracking.checkpoints?.[0]?.message,
        latest_checkpoint_time: tracking.checkpoints?.[0]?.checkpoint_time,
        source: 'webhook',
        last_synced_at: new Date().toISOString(),
      }, {
        onConflict: 'slug,tracking_number',
      });

    // Update PO if correlated
    if (poId) {
      await supabase.rpc('update_po_tracking_from_aftership', {
        p_po_id: poId,
        p_tracking_number: tracking.tracking_number,
        p_carrier: mapSlugToCarrierName(tracking.slug),
        p_tag: tracking.tag,
        p_expected_delivery: tracking.expected_delivery,
        p_latest_checkpoint: tracking.checkpoints?.[0]?.message,
      });

      // Assess delay impact via Air Traffic Controller
      if (tracking.expected_delivery || ['Exception', 'AttemptFail', 'Expired'].includes(tracking.tag)) {
        const { data: alert } = await supabase.rpc('assess_aftership_delivery_impact', {
          p_po_id: poId,
          p_new_expected_delivery: tracking.expected_delivery || new Date().toISOString(),
          p_tag: tracking.tag,
          p_tracking_number: tracking.tracking_number,
        });
        alertId = alert;
      }
    }

    // Update email thread if correlated
    if (threadId) {
      const carrier = mapSlugToCarrierName(tracking.slug);

      // Get current thread data
      const { data: thread } = await supabase
        .from('email_threads')
        .select('tracking_numbers, carriers')
        .eq('id', threadId)
        .single();

      const currentTracking = thread?.tracking_numbers || [];
      const currentCarriers = thread?.carriers || [];

      const newTrackingNumbers = currentTracking.includes(tracking.tracking_number)
        ? currentTracking
        : [...currentTracking, tracking.tracking_number];

      const newCarriers = currentCarriers.includes(carrier)
        ? currentCarriers
        : [...currentCarriers, carrier];

      await supabase
        .from('email_threads')
        .update({
          tracking_numbers: newTrackingNumbers,
          carriers: newCarriers,
          has_tracking_info: true,
          latest_tracking_status: mapTagToInternalStatus(tracking.tag),
          latest_eta: tracking.expected_delivery,
          eta_confidence: ['InTransit', 'OutForDelivery'].includes(tracking.tag) ? 'high' : 'medium',
          updated_at: new Date().toISOString(),
        })
        .eq('id', threadId);
    }

    // Log webhook
    await supabase.from('aftership_webhook_log').insert({
      event_type: payload.event,
      event_id: payload.event_id,
      aftership_id: tracking.id,
      tracking_number: tracking.tracking_number,
      slug: tracking.slug,
      old_tag: null, // AfterShip doesn't provide old tag in webhook
      new_tag: tracking.tag,
      po_id: poId,
      thread_id: threadId,
      correlation_method: correlationMethod,
      correlation_confidence: poId ? 0.9 : 0,
      processing_status: 'success',
      triggered_alert: alertId !== null,
      alert_id: alertId,
      alert_priority: alertId ? 'high' : null,
      payload: payload,
      processed_at: new Date().toISOString(),
    });

    console.log(`[AfterShip Webhook] Processed ${tracking.tracking_number}: PO=${poId || 'none'}, Alert=${alertId || 'none'}`);

    return { success: true, poId, alertId };
  } catch (error) {
    console.error('[AfterShip Webhook] Error processing tracking update:', error);

    // Log error
    await supabase.from('aftership_webhook_log').insert({
      event_type: payload.event,
      event_id: payload.event_id,
      aftership_id: tracking.id,
      tracking_number: tracking.tracking_number,
      slug: tracking.slug,
      new_tag: tracking.tag,
      processing_status: 'failed',
      processing_error: String(error),
      payload: payload,
    });

    return { success: false, poId: null, alertId: null };
  }
}

async function processTrackingCreated(
  supabase: any,
  payload: AfterShipWebhookPayload,
  config: AfterShipConfig
): Promise<{ success: boolean; message: string }> {
  // For new trackings, process the same as update
  const result = await processTrackingUpdate(supabase, payload, config);
  return {
    success: result.success,
    message: result.success ? 'Tracking created and processed' : 'Failed to process new tracking',
  };
}

async function processTrackingExpired(
  supabase: any,
  payload: AfterShipWebhookPayload,
  config: AfterShipConfig
): Promise<{ success: boolean; message: string }> {
  const tracking = payload.msg;

  try {
    // Find and update existing tracking
    await supabase
      .from('aftership_trackings')
      .update({
        tag: 'Expired',
        internal_status: 'exception',
        last_synced_at: new Date().toISOString(),
      })
      .eq('tracking_number', tracking.tracking_number)
      .eq('slug', tracking.slug);

    // Log webhook
    await supabase.from('aftership_webhook_log').insert({
      event_type: payload.event,
      event_id: payload.event_id,
      aftership_id: tracking.id,
      tracking_number: tracking.tracking_number,
      slug: tracking.slug,
      new_tag: 'Expired',
      processing_status: 'success',
      processing_notes: 'Tracking expired - may need manual investigation',
      payload: payload,
      processed_at: new Date().toISOString(),
    });

    // Create system notification for expired tracking
    await supabase.from('system_notifications').insert({
      channel: 'logistics',
      title: 'Tracking Expired',
      message: `Tracking ${tracking.tracking_number} (${tracking.slug}) has expired. This may indicate the package is lost or the tracking number is invalid.`,
      severity: 'warning',
    });

    return { success: true, message: 'Tracking marked as expired' };
  } catch (error) {
    console.error('[AfterShip Webhook] Error processing tracking expired:', error);
    return { success: false, message: String(error) };
  }
}

async function updateWebhookStats(supabase: any, config: AfterShipConfig): Promise<void> {
  const newStats = {
    ...config.stats,
    webhooksReceived: (config.stats.webhooksReceived || 0) + 1,
    lastWebhookAt: new Date().toISOString(),
  };

  await supabase
    .from('app_settings')
    .update({
      setting_value: { ...config, stats: newStats },
      updated_at: new Date().toISOString(),
    })
    .eq('setting_key', 'aftership_config');
}
