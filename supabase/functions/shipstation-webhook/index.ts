/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SHIPSTATION WEBHOOK HANDLER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Receives real-time webhook notifications from ShipStation for:
 * - ORDER_NOTIFY: New orders created
 * - SHIP_NOTIFY: Shipments created (tracking numbers available)
 * - ITEM_SHIP_NOTIFY: Individual items shipped
 *
 * Integration flow:
 * 1. Receive webhook payload with resource_url
 * 2. Fetch full data from ShipStation API
 * 3. Correlate with MuRP PO and email threads
 * 4. Update tracking data
 * 5. Trigger Air Traffic Controller for delays
 *
 * Part of: Email Tracking Agent Expansion
 * Goal: NEVER BE OUT OF STOCK!
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface ShipStationWebhookPayload {
  resource_url: string;
  resource_type: 'ORDER_NOTIFY' | 'SHIP_NOTIFY' | 'ITEM_SHIP_NOTIFY';
}

interface ShipStationConfig {
  enabled: boolean;
  apiKey: string | null;
  apiSecret: string | null;
  webhookSecret: string | null;
  autoCorrelate: boolean;
  correlateWithEmail: boolean;
}

interface ShipStationShipment {
  shipmentId: number;
  orderId: number;
  orderNumber: string;
  createDate: string;
  shipDate: string;
  shipmentCost: number;
  trackingNumber: string;
  carrierCode: string;
  serviceCode: string;
  voided: boolean;
  shipTo: {
    name: string;
    company: string | null;
    city: string;
    state: string;
  };
}

interface ShipStationOrder {
  orderId: number;
  orderNumber: string;
  orderStatus: string;
  orderDate: string;
  shipTo: {
    name: string;
    company: string | null;
  };
  shipments: ShipStationShipment[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CORS Headers
// ═══════════════════════════════════════════════════════════════════════════

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-shipstation-signature',
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Handler
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Get ShipStation config
    const config = await getShipStationConfig(supabase);

    if (!config.enabled) {
      console.log('[ShipStation Webhook] Integration disabled, ignoring webhook');
      return new Response(JSON.stringify({ success: true, message: 'Integration disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse webhook payload
    const payload: ShipStationWebhookPayload = await req.json();
    console.log('[ShipStation Webhook] Received:', payload.resource_type);

    // Verify webhook signature (if configured)
    // Note: ShipStation uses RSA-SHA256 signatures
    // const signature = req.headers.get('x-shipstation-signature');
    // TODO: Implement signature verification if webhookSecret is configured

    // Fetch full data from resource_url
    const resourceData = await fetchResourceData(payload.resource_url, config);

    if (!resourceData) {
      console.warn('[ShipStation Webhook] Failed to fetch resource data');
      return new Response(JSON.stringify({ success: false, error: 'Failed to fetch resource' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process based on event type
    let result;
    switch (payload.resource_type) {
      case 'SHIP_NOTIFY':
        result = await processShipNotify(supabase, resourceData, config);
        break;
      case 'ORDER_NOTIFY':
        result = await processOrderNotify(supabase, resourceData, config);
        break;
      case 'ITEM_SHIP_NOTIFY':
        result = await processItemShipNotify(supabase, resourceData, config);
        break;
      default:
        console.log('[ShipStation Webhook] Unknown event type:', payload.resource_type);
        result = { success: true, message: 'Event type not handled' };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[ShipStation Webhook] Error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

async function getShipStationConfig(supabase: any): Promise<ShipStationConfig> {
  const { data } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'shipstation_config')
    .maybeSingle();

  return data?.setting_value || {
    enabled: false,
    apiKey: null,
    apiSecret: null,
    webhookSecret: null,
    autoCorrelate: true,
    correlateWithEmail: true,
  };
}

async function fetchResourceData(resourceUrl: string, config: ShipStationConfig): Promise<any> {
  if (!config.apiKey || !config.apiSecret) {
    console.error('[ShipStation Webhook] Missing API credentials');
    return null;
  }

  const auth = btoa(`${config.apiKey}:${config.apiSecret}`);

  try {
    const response = await fetch(resourceUrl, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[ShipStation Webhook] Resource fetch failed:', response.status);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('[ShipStation Webhook] Resource fetch error:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Event Processors
// ═══════════════════════════════════════════════════════════════════════════

async function processShipNotify(
  supabase: any,
  data: { shipments: ShipStationShipment[] },
  config: ShipStationConfig
): Promise<{ success: boolean; processed: number; matched: number }> {
  const shipments = data.shipments || [];
  let processed = 0;
  let matched = 0;

  for (const shipment of shipments) {
    if (shipment.voided) continue; // Skip voided shipments

    try {
      // Check for duplicate
      const { data: existing } = await supabase
        .from('shipstation_sync_log')
        .select('id')
        .eq('shipstation_shipment_id', String(shipment.shipmentId))
        .eq('event_type', 'SHIP_NOTIFY')
        .maybeSingle();

      if (existing) {
        console.log(`[ShipStation Webhook] Skipping duplicate shipment ${shipment.shipmentId}`);
        continue;
      }

      // Find PO correlation
      let poId: string | null = null;
      let threadId: string | null = null;
      let correlationMethod: string | null = null;

      if (config.autoCorrelate) {
        // Try by order number
        const { data: poByOrder } = await supabase.rpc('find_po_by_order_number', {
          p_order_number: shipment.orderNumber,
        });

        if (poByOrder) {
          poId = poByOrder;
          correlationMethod = 'order_number';
        } else if (shipment.trackingNumber) {
          // Try by tracking number
          const { data: poByTracking } = await supabase.rpc('find_po_by_tracking_number', {
            p_tracking_number: shipment.trackingNumber,
          });

          if (poByTracking) {
            poId = poByTracking;
            correlationMethod = 'tracking_number';
          }
        }

        // Try email thread correlation
        if (config.correlateWithEmail && shipment.trackingNumber) {
          const { data: threadByTracking } = await supabase.rpc('find_email_thread_by_tracking', {
            p_tracking_number: shipment.trackingNumber,
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

      // Update tracking data if we have a PO
      if (poId) {
        await supabase.rpc('update_tracking_from_shipstation', {
          p_po_id: poId,
          p_tracking_number: shipment.trackingNumber,
          p_carrier: mapCarrierCode(shipment.carrierCode),
          p_ship_date: shipment.shipDate?.split('T')[0] || null,
          p_estimated_delivery: null,
          p_status: 'shipped',
        });

        // Create tracking event
        await supabase.from('shipment_tracking_events').insert({
          shipment_id: null, // Will link via po_shipment_data
          event_type: 'status_update',
          status: 'shipped',
          description: `Shipped via ${mapCarrierCode(shipment.carrierCode)} - ${shipment.trackingNumber}`,
          carrier: mapCarrierCode(shipment.carrierCode),
          tracking_number: shipment.trackingNumber,
          source: 'shipstation',
          source_id: String(shipment.shipmentId),
          raw_data: shipment,
        });

        matched++;
      }

      // Update email thread if found
      if (threadId) {
        const carrier = mapCarrierCode(shipment.carrierCode);

        await supabase
          .from('email_threads')
          .update({
            tracking_numbers: supabase.sql`
              CASE
                WHEN NOT (COALESCE(tracking_numbers, ARRAY[]::TEXT[]) @> ARRAY['${shipment.trackingNumber}'])
                THEN array_append(COALESCE(tracking_numbers, ARRAY[]::TEXT[]), '${shipment.trackingNumber}')
                ELSE tracking_numbers
              END
            `,
            carriers: supabase.sql`
              CASE
                WHEN NOT (COALESCE(carriers, ARRAY[]::TEXT[]) @> ARRAY['${carrier}'])
                THEN array_append(COALESCE(carriers, ARRAY[]::TEXT[]), '${carrier}')
                ELSE carriers
              END
            `,
            has_tracking_info: true,
            latest_tracking_status: 'shipped',
            updated_at: new Date().toISOString(),
          })
          .eq('id', threadId);
      }

      // Log sync
      await supabase.from('shipstation_sync_log').insert({
        shipstation_shipment_id: String(shipment.shipmentId),
        shipstation_order_id: String(shipment.orderId),
        shipstation_order_number: shipment.orderNumber,
        po_id: poId,
        thread_id: threadId,
        event_type: 'SHIP_NOTIFY',
        tracking_number: shipment.trackingNumber,
        carrier_code: shipment.carrierCode,
        ship_date: shipment.shipDate?.split('T')[0] || null,
        correlation_method: correlationMethod,
        correlation_confidence: poId ? 0.9 : 0,
        processing_status: 'success',
        payload: shipment,
      });

      processed++;
      console.log(`[ShipStation Webhook] Processed shipment ${shipment.shipmentId}, PO: ${poId || 'none'}`);
    } catch (error) {
      console.error(`[ShipStation Webhook] Error processing shipment ${shipment.shipmentId}:`, error);

      // Log error
      await supabase.from('shipstation_sync_log').insert({
        shipstation_shipment_id: String(shipment.shipmentId),
        event_type: 'SHIP_NOTIFY',
        tracking_number: shipment.trackingNumber,
        processing_status: 'failed',
        processing_error: String(error),
        payload: shipment,
      });
    }
  }

  return { success: true, processed, matched };
}

async function processOrderNotify(
  supabase: any,
  data: { orders: ShipStationOrder[] },
  config: ShipStationConfig
): Promise<{ success: boolean; processed: number }> {
  const orders = data.orders || [];
  let processed = 0;

  for (const order of orders) {
    try {
      // Upsert order into shipstation_orders table
      await supabase
        .from('shipstation_orders')
        .upsert({
          shipstation_order_id: String(order.orderId),
          order_number: order.orderNumber,
          order_status: order.orderStatus,
          order_date: order.orderDate,
          ship_to_name: order.shipTo?.name,
          ship_to_company: order.shipTo?.company,
          shipments: order.shipments || [],
          last_synced_at: new Date().toISOString(),
          sync_source: 'webhook',
        }, {
          onConflict: 'shipstation_order_id',
        });

      // If order has shipments, process them
      if (order.shipments?.length > 0) {
        await processShipNotify(supabase, { shipments: order.shipments }, config);
      }

      // Log sync
      await supabase.from('shipstation_sync_log').insert({
        shipstation_order_id: String(order.orderId),
        shipstation_order_number: order.orderNumber,
        event_type: 'ORDER_NOTIFY',
        processing_status: 'success',
        payload: order,
      });

      processed++;
    } catch (error) {
      console.error(`[ShipStation Webhook] Error processing order ${order.orderId}:`, error);
    }
  }

  return { success: true, processed };
}

async function processItemShipNotify(
  supabase: any,
  data: any,
  config: ShipStationConfig
): Promise<{ success: boolean; message: string }> {
  // ITEM_SHIP_NOTIFY has similar structure to SHIP_NOTIFY
  // Process as shipments
  if (data.shipments) {
    return processShipNotify(supabase, data, config);
  }

  return { success: true, message: 'No shipments in payload' };
}

// ═══════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════

function mapCarrierCode(code: string): string {
  const mapping: Record<string, string> = {
    ups: 'UPS',
    fedex: 'FedEx',
    usps: 'USPS',
    dhl_express: 'DHL',
    dhl_ecommerce: 'DHL',
    ontrac: 'OnTrac',
    lasership: 'LaserShip',
    stamps_com: 'USPS',
    express_1: 'Express 1',
  };

  return mapping[code?.toLowerCase()] || code?.toUpperCase() || 'Unknown';
}
