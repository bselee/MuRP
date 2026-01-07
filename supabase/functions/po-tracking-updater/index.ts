// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';

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

interface CarrierConfig {
  uspsConsumerKey: string | null;
  uspsConsumerSecret: string | null;
  uspsEnabled: boolean;
  upsClientId: string | null;
  upsClientSecret: string | null;
  upsEnabled: boolean;
  fedexApiKey: string | null;
  fedexSecretKey: string | null;
  fedexEnabled: boolean;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const result = await updatePOTracking(supabase);

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[po-tracking-updater] failed', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function updatePOTracking(supabase: any) {
  const { data: purchaseOrders, error } = await supabase
    .from('purchase_orders')
    .select('id, order_id, vendor_name, tracking_number, tracking_carrier, tracking_status')
    .not('tracking_number', 'is', null)
    .limit(200);

  if (error) {
    throw error;
  }

  if (!purchaseOrders?.length) {
    return { processed: 0, updates: 0, notified: 0 };
  }

  const carrierConfig = await getCarrierConfig(supabase);

  let updates = 0;
  let deliveredCount = 0;
  let failureCount = 0;

  for (const po of purchaseOrders) {
    try {
      let carrierStatus = null;

      // Try direct carrier APIs first
      if (carrierConfig.uspsEnabled || carrierConfig.upsEnabled || carrierConfig.fedexEnabled) {
        try {
          carrierStatus = await fetchDirectCarrierTracking(
            po.tracking_carrier,
            po.tracking_number,
            carrierConfig,
          );
        } catch (carrierError) {
          console.warn(`[po-tracking-updater] Direct carrier API failed for PO ${po.id}, falling back`, carrierError);
          await logTrackingFailure(supabase, po.id, new Error(`Carrier API error: ${carrierError.message}`));
          // Continue to fallback
        }
      }

      // FALLBACK: Use simulated progression if carrier API unavailable
      if (!carrierStatus) {
        carrierStatus = await getFallbackCarrierStatus(
          po.tracking_carrier,
          po.tracking_number,
          po.tracking_status as TrackingStatus,
        );
      }

      if (!carrierStatus) {
        // No update available (terminal state or no change)
        continue;
      }

      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({
          tracking_status: carrierStatus.status,
          tracking_estimated_delivery: carrierStatus.estimatedDelivery ?? null,
          tracking_last_checked_at: new Date().toISOString(),
          tracking_last_exception: carrierStatus.status === 'exception' ? carrierStatus.description : null,
        })
        .eq('id', po.id);

      if (updateError) throw updateError;

      const eventPayload = {
        po_id: po.id,
        status: carrierStatus.status,
        carrier: po.tracking_carrier,
        tracking_number: po.tracking_number,
        description: carrierStatus.description,
        raw_payload: carrierStatus.rawPayload ?? null,
      };

      const { error: eventError } = await supabase.from('po_tracking_events').insert(eventPayload);
      if (eventError) throw eventError;

      // ✈️ AIR TRAFFIC CONTROLLER INTEGRATION: Assess delay impact
      await assessDelayImpact(supabase, po, carrierStatus);

      if (carrierStatus.checkpoints?.length) {
        const latest = carrierStatus.checkpoints[carrierStatus.checkpoints.length - 1];
        if (latest) {
          await supabase.from('po_tracking_events').insert({
            po_id: po.id,
            status: mapCarrierTag(latest.tag ?? carrierStatus.status),
            carrier: latest.slug ?? po.tracking_carrier,
            tracking_number: po.tracking_number,
            description: latest.message ?? latest.tag ?? 'Carrier update',
            raw_payload: latest,
          });
        }
      }

      updates += 1;
      if (carrierStatus.status === 'delivered') {
        deliveredCount += 1;
      }
    } catch (err) {
      console.error(`[po-tracking-updater] failed to update po ${po.id}`, err);
      failureCount += 1;
      await logTrackingFailure(supabase, po.id, err);
    }
  }

  // SAFETY NET: Alert admin if high failure rate
  if (failureCount > purchaseOrders.length * 0.5) {
    await supabase.from('system_notifications').insert({
      channel: 'logistics',
      title: 'High Tracking Failure Rate',
      message: `${failureCount}/${purchaseOrders.length} PO tracking updates failed. Check carrier API status.`,
      severity: 'error',
    });
  }

  if (deliveredCount > 0) {
    await notifyDeliveries(supabase, deliveredCount);
  }

  return { processed: purchaseOrders.length, updates, failures: failureCount, notified: deliveredCount };
}

async function getFallbackCarrierStatus(
  carrier: string | null,
  trackingNumber: string,
  currentStatus: TrackingStatus,
): Promise<{ status: TrackingStatus; estimatedDelivery?: string; description?: string; rawPayload?: any } | null> {
  // FALLBACK MODE: Simulated status progression for development/testing
  // Production: Replace with direct carrier APIs (UPS, FedEx, USPS) or leave as safe default
  
  const now = new Date();
  const daysOffset = Math.floor(Math.random() * 5);
  const estimatedDelivery = new Date(now.getTime() + daysOffset * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  // Safe state transitions (never move backwards)
  const transitions: Record<TrackingStatus, TrackingStatus> = {
    awaiting_confirmation: 'confirmed',
    confirmed: 'processing',
    processing: 'shipped',
    shipped: 'in_transit',
    in_transit: 'in_transit', // Stay in transit until real update
    out_for_delivery: 'out_for_delivery', // Don't auto-deliver
    delivered: 'delivered', // Terminal state
    exception: 'exception', // Terminal state
    cancelled: 'cancelled', // Terminal state
    invoice_received: 'invoice_received',
  };

  const nextStatus = transitions[currentStatus] ?? 'in_transit';

  // Don't update if in terminal or uncertain state
  if (currentStatus === nextStatus && ['in_transit', 'out_for_delivery', 'delivered', 'exception', 'cancelled'].includes(currentStatus)) {
    return null; // No update needed
  }

  return {
    status: nextStatus,
    estimatedDelivery,
    description: `Fallback mode: ${carrier ?? 'unknown carrier'} tracking ${trackingNumber} (waiting for real carrier data)`,
    rawPayload: {
      carrier,
      trackingNumber,
      checkedAt: now.toISOString(),
      mode: 'fallback',
      note: 'Replace with real carrier API for production accuracy',
    },
  };
}

async function logTrackingFailure(supabase: any, poId: string, error: unknown) {
  const description = error instanceof Error ? error.message : String(error);
  await supabase.from('po_tracking_events').insert({
    po_id: poId,
    status: 'exception',
    description: `Tracking update failed: ${description}`,
  });
}

async function notifyDeliveries(supabase: any, deliveredCount: number) {
  try {
    await supabase.from('system_notifications').insert({
      channel: 'logistics',
      title: 'Purchase Orders Delivered',
      message: `${deliveredCount} purchase order(s) were delivered in the last check.`,
      severity: 'info',
    });
  } catch (error) {
    console.warn('[po-tracking-updater] notifyDeliveries failed', error);
  }
}

async function getCarrierConfig(supabase: any): Promise<CarrierConfig> {
  // Fetch all carrier settings in one query
  const { data } = await supabase
    .from('app_settings')
    .select('setting_key, setting_value')
    .like('setting_key', 'carrier_api_%');

  const settings: Record<string, any> = {};
  for (const row of data || []) {
    settings[row.setting_key] = row.setting_value;
  }

  const usps = settings['carrier_api_usps'] || {};
  const ups = settings['carrier_api_ups'] || {};
  const fedex = settings['carrier_api_fedex'] || {};

  return {
    uspsConsumerKey: usps.userId ?? null,
    uspsConsumerSecret: usps.apiKey ?? null,
    uspsEnabled: usps.enabled ?? false,
    upsClientId: ups.userId ?? null,
    upsClientSecret: ups.apiKey ?? null,
    upsEnabled: ups.enabled ?? false,
    fedexApiKey: fedex.userId ?? null,
    fedexSecretKey: fedex.apiKey ?? null,
    fedexEnabled: fedex.enabled ?? false,
  };
}

function mapCarrierSlug(carrier?: string | null, fallback?: string) {
  if (!carrier) return fallback || 'ups';
  const key = carrier.toLowerCase();
  if (key.includes('ups')) return 'ups';
  if (key.includes('fedex')) return 'fedex';
  if (key.includes('usps') || key.includes('postal')) return 'usps';
  if (key.includes('dhl')) return 'dhl';
  if (key.includes('lasership')) return 'lasership';
  return carrier.toLowerCase().replace(/\s+/g, '-');
}

function mapCarrierTag(tag?: string): TrackingStatus {
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

/**
 * Fetch tracking from direct carrier APIs (USPS, UPS, FedEx)
 * All these carriers offer free API access with registration
 */
async function fetchDirectCarrierTracking(
  carrier: string | null,
  trackingNumber: string,
  config: CarrierConfig,
): Promise<{
  status: TrackingStatus;
  estimatedDelivery?: string;
  description?: string;
  rawPayload?: any;
  checkpoints?: any[];
} | null> {
  const slug = mapCarrierSlug(carrier);

  try {
    // Route to appropriate carrier API
    switch (slug) {
      case 'usps':
        if (config.uspsEnabled && config.uspsConsumerKey && config.uspsConsumerSecret) {
          return await fetchUSPSTracking(trackingNumber, config.uspsConsumerKey, config.uspsConsumerSecret);
        }
        break;
      case 'ups':
        if (config.upsEnabled && config.upsClientId && config.upsClientSecret) {
          return await fetchUPSTracking(trackingNumber, config.upsClientId, config.upsClientSecret);
        }
        break;
      case 'fedex':
        if (config.fedexEnabled && config.fedexApiKey && config.fedexSecretKey) {
          return await fetchFedExTracking(trackingNumber, config.fedexApiKey, config.fedexSecretKey);
        }
        break;
    }

    // No config for this carrier
    console.log(`[po-tracking-updater] No API config for carrier ${slug}, using fallback`);
    return null;
  } catch (error) {
    console.error('[po-tracking-updater] Direct carrier fetch failed', {
      carrier: slug,
      trackingNumber,
      error: error.message,
    });
    throw error;
  }
}

/**
 * USPS Tracking API v3.2 with OAuth 2.0 (FREE - unlimited with registration)
 * https://developers.usps.com/trackingv3r2
 * Note: Legacy XML API retires January 25, 2026
 */
let uspsTokenCache: { token: string; expiresAt: number } | null = null;

async function getUSPSToken(consumerKey: string, consumerSecret: string): Promise<string> {
  // Return cached token if valid (with 5-minute buffer)
  if (uspsTokenCache && uspsTokenCache.expiresAt > Date.now() + 300000) {
    return uspsTokenCache.token;
  }

  const response = await fetch('https://apis.usps.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: consumerKey,
      client_secret: consumerSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`USPS OAuth error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  uspsTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };
  return data.access_token;
}

async function fetchUSPSTracking(
  trackingNumber: string,
  consumerKey: string,
  consumerSecret: string,
): Promise<{
  status: TrackingStatus;
  estimatedDelivery?: string;
  description?: string;
  rawPayload?: any;
  checkpoints?: any[];
} | null> {
  const accessToken = await getUSPSToken(consumerKey, consumerSecret);

  const response = await fetch(
    `https://apis.usps.com/tracking/v3/tracking/${encodeURIComponent(trackingNumber)}?expand=DETAIL`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`USPS API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Map USPS v3.2 response to our format
  const statusCategory = data.statusCategory?.toLowerCase() || '';
  const trackingEvents = data.trackingEvents || [];

  return {
    status: mapUSPSStatus(statusCategory),
    estimatedDelivery: data.expectedDeliveryDate || undefined,
    description: data.statusSummary || data.status || 'USPS tracking',
    rawPayload: { carrier: 'usps', data },
    checkpoints: trackingEvents.map((event: any) => ({
      tag: event.eventType,
      message: event.eventDescription || event.eventType,
      location: [event.eventCity, event.eventState].filter(Boolean).join(', '),
      timestamp: event.eventTimestamp,
    })),
  };
}

function mapUSPSStatus(statusCategory: string): TrackingStatus {
  const map: Record<string, TrackingStatus> = {
    'delivered': 'delivered',
    'in transit': 'in_transit',
    'in_transit': 'in_transit',
    'intransit': 'in_transit',
    'out for delivery': 'out_for_delivery',
    'out_for_delivery': 'out_for_delivery',
    'available for pickup': 'in_transit',
    'pre-shipment': 'processing',
    'pre_shipment': 'processing',
    'accepted': 'processing',
    'alert': 'exception',
    'exception': 'exception',
  };
  return map[statusCategory] || 'processing';
}

/**
 * UPS Tracking API (FREE tier - 500 requests/month)
 * https://developer.ups.com/
 */
let upsTokenCache: { token: string; expiresAt: number } | null = null;

async function getUPSToken(clientId: string, clientSecret: string): Promise<string> {
  // Return cached token if valid (with 5-minute buffer)
  if (upsTokenCache && upsTokenCache.expiresAt > Date.now() + 300000) {
    return upsTokenCache.token;
  }

  const tokenResponse = await fetch('https://onlinetools.ups.com/security/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`UPS OAuth error: ${tokenResponse.status} - ${errorText}`);
  }

  const data = await tokenResponse.json();
  upsTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in || 3600) * 1000),
  };
  return data.access_token;
}

async function fetchUPSTracking(
  trackingNumber: string,
  clientId: string,
  clientSecret: string,
): Promise<{
  status: TrackingStatus;
  estimatedDelivery?: string;
  description?: string;
  rawPayload?: any;
  checkpoints?: any[];
} | null> {
  // Get OAuth token (with caching)
  const access_token = await getUPSToken(clientId, clientSecret);

  // Fetch tracking
  const response = await fetch(
    `https://onlinetools.ups.com/api/track/v1/details/${trackingNumber}`,
    {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'transId': crypto.randomUUID(),
        'transactionSrc': 'murp',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`UPS API error: ${response.status}`);
  }

  const data = await response.json();
  const shipment = data.trackResponse?.shipment?.[0];
  const pkg = shipment?.package?.[0];
  
  if (!pkg) return null;

  const activity = pkg.activity || [];
  const latest = activity[0];
  const deliveryDate = pkg.deliveryDate?.[0]?.date;

  return {
    status: mapUPSStatus(latest?.status?.type),
    estimatedDelivery: deliveryDate ? formatUPSDate(deliveryDate) : undefined,
    description: latest?.status?.description || 'UPS tracking',
    rawPayload: data,
    checkpoints: activity.map((a: any) => ({
      tag: a.status?.type,
      message: a.status?.description,
      location: a.location?.address?.city,
      timestamp: a.date && a.time ? `${a.date}T${a.time}` : undefined,
    })),
  };
}

function mapUPSStatus(code?: string): TrackingStatus {
  if (!code) return 'processing';
  const map: Record<string, TrackingStatus> = {
    'D': 'delivered',
    'I': 'in_transit',
    'M': 'processing',
    'X': 'exception',
    'P': 'processing',
    'O': 'out_for_delivery',
  };
  return map[code] || 'processing';
}

function formatUPSDate(date: string): string {
  // UPS format: YYYYMMDD
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

/**
 * FedEx Track API (FREE tier - 5000 requests/month)
 * https://developer.fedex.com/
 */
let fedexTokenCache: { token: string; expiresAt: number } | null = null;

async function getFedExToken(apiKey: string, secretKey: string): Promise<string> {
  // Return cached token if valid (with 5-minute buffer)
  if (fedexTokenCache && fedexTokenCache.expiresAt > Date.now() + 300000) {
    return fedexTokenCache.token;
  }

  const tokenResponse = await fetch('https://apis.fedex.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`,
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`FedEx OAuth error: ${tokenResponse.status} - ${errorText}`);
  }

  const data = await tokenResponse.json();
  fedexTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in || 3600) * 1000),
  };
  return data.access_token;
}

async function fetchFedExTracking(
  trackingNumber: string,
  apiKey: string,
  secretKey: string,
): Promise<{
  status: TrackingStatus;
  estimatedDelivery?: string;
  description?: string;
  rawPayload?: any;
  checkpoints?: any[];
} | null> {
  // Get OAuth token (with caching)
  const access_token = await getFedExToken(apiKey, secretKey);

  // Fetch tracking
  const response = await fetch('https://apis.fedex.com/track/v1/trackingnumbers', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json',
      'X-locale': 'en_US',
    },
    body: JSON.stringify({
      trackingInfo: [{
        trackingNumberInfo: {
          trackingNumber,
        },
      }],
      includeDetailedScans: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`FedEx API error: ${response.status}`);
  }

  const data = await response.json();
  const result = data.output?.completeTrackResults?.[0]?.trackResults?.[0];

  if (!result) return null;

  const latestStatus = result.latestStatusDetail;
  const deliveryDate = result.standardTransitTimeWindow?.window?.ends || 
                       result.estimatedDeliveryTimeWindow?.window?.ends;
  const scanEvents = result.scanEvents || [];

  return {
    status: mapFedExStatus(latestStatus?.code),
    estimatedDelivery: deliveryDate ? deliveryDate.split('T')[0] : undefined,
    description: latestStatus?.description || 'FedEx tracking',
    rawPayload: data,
    checkpoints: scanEvents.map((e: any) => ({
      tag: e.eventType,
      message: e.eventDescription,
      location: e.scanLocation?.city,
      timestamp: e.date,
    })),
  };
}

function mapFedExStatus(code?: string): TrackingStatus {
  if (!code) return 'processing';
  const map: Record<string, TrackingStatus> = {
    'DL': 'delivered',
    'IT': 'in_transit',
    'OD': 'out_for_delivery',
    'PU': 'processing',
    'DE': 'exception',
    'CA': 'cancelled',
  };
  return map[code] || 'processing';
}

/**
 * ✈️ AIR TRAFFIC CONTROLLER INTEGRATION
 * Assess delay impact and create intelligent alerts based on stock levels
 */
async function assessDelayImpact(
  supabase: any,
  po: any,
  carrierStatus: { status: TrackingStatus; estimatedDelivery?: string; description?: string }
): Promise<void> {
  try {
    // Only assess if tracking shows exception or estimated delivery changed
    if (carrierStatus.status !== 'exception' && !carrierStatus.estimatedDelivery) {
      return;
    }

    // Get full PO data with expected date
    const { data: fullPO, error: poError } = await supabase
      .from('purchase_orders')
      .select('id, order_id, vendor_id, vendor_name, expected_date')
      .eq('id', po.id)
      .single();

    if (poError || !fullPO) {
      console.warn(`[Air Traffic Controller] Could not fetch PO ${po.id}:`, poError);
      return;
    }

    const originalETA = fullPO.expected_date;
    const newETA = carrierStatus.estimatedDelivery;

    if (!originalETA || !newETA) {
      return; // Can't calculate delay without dates
    }

    // Calculate delay in days
    const originalDate = new Date(originalETA);
    const newDate = new Date(newETA);
    const delayDays = Math.ceil((newDate.getTime() - originalDate.getTime()) / (1000 * 60 * 60 * 24));

    // No delay or shipment is early - silent update
    if (delayDays <= 0) {
      return;
    }

    console.log(`✈️ Air Traffic Controller: PO ${fullPO.order_id} delayed ${delayDays} days`);

    // Get PO line items to assess stock impact
    const { data: poItems, error: itemsError } = await supabase
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
      .eq('po_id', fullPO.id);

    if (itemsError || !poItems || poItems.length === 0) {
      console.warn(`[Air Traffic Controller] Could not fetch PO items for ${po.id}`);
      return;
    }

    // Calculate impact for each item
    let criticalItems = 0;
    let highPriorityItems = 0;
    let maxImpactDays = 0;
    const affectedItems = [];

    for (const item of poItems) {
      const currentStock = item.inventory_items?.current_stock || 0;
      const dailySales = (item.inventory_items?.sales_last_30_days || 0) / 30;

      if (dailySales === 0) continue; // Skip items with no sales

      const daysOfStock = currentStock / dailySales;
      const daysUntilStockout = Math.max(0, daysOfStock);

      // Determine impact level
      let impactLevel = 'low';
      if (daysUntilStockout < delayDays) {
        // Will stockout before delivery
        impactLevel = 'critical';
        criticalItems++;
      } else if (daysUntilStockout < delayDays + 7) {
        // Will be very low stock
        impactLevel = 'high';
        highPriorityItems++;
      } else if (daysUntilStockout < delayDays + 14) {
        impactLevel = 'medium';
      }

      if (impactLevel !== 'low') {
        affectedItems.push({
          sku: item.inventory_sku,
          name: item.item_name,
          current_stock: currentStock,
          days_until_stockout: Math.floor(daysUntilStockout),
          impact_level: impactLevel,
        });

        maxImpactDays = Math.max(maxImpactDays, daysUntilStockout);
      }
    }

    // Determine overall priority
    let priorityLevel = 'low';
    if (criticalItems > 0) {
      priorityLevel = 'critical';
    } else if (highPriorityItems > 0) {
      priorityLevel = 'high';
    } else if (affectedItems.length > 0) {
      priorityLevel = 'medium';
    }

    // Low priority = silent update, no alert needed
    if (priorityLevel === 'low') {
      console.log(`✈️ Air Traffic Controller: PO ${fullPO.order_id} delay is LOW priority (plenty of stock)`);

      // Silent update - just update expected date
      await supabase
        .from('purchase_orders')
        .update({ expected_date: newETA })
        .eq('id', fullPO.id);

      return;
    }

    // Medium/High/Critical = Create alert
    console.log(`✈️ Air Traffic Controller: Creating ${priorityLevel.toUpperCase()} alert for PO ${fullPO.order_id}`);

    // Draft vendor email for critical alerts
    let draftEmail = null;
    if (priorityLevel === 'critical') {
      draftEmail = `Subject: URGENT: PO ${fullPO.order_id} Delayed - Critical Stock Impact

Hi ${fullPO.vendor_name},

I'm writing regarding PO ${fullPO.order_id} which is now showing an expected delivery of ${newETA} (${delayDays} days later than originally planned).

This delay is critical as we will run out of stock on the following items before delivery:

${affectedItems
  .filter(i => i.impact_level === 'critical')
  .map(i => `• ${i.name} (${i.sku}): ${i.current_stock} units in stock, will run out in ${i.days_until_stockout} days`)
  .join('\n')}

Is there any way to expedite this shipment? We're willing to pay additional shipping fees if necessary.

Alternatively, can you confirm if a partial shipment is possible for the critical items listed above?

Please respond ASAP as we're at risk of stockout.

Thank you,
[Your Name]`;
    }

    // Create alert in database
    await supabase.from('po_alert_log').insert({
      po_id: fullPO.id,
      po_number: fullPO.order_id,
      vendor_id: fullPO.vendor_id,
      vendor_name: fullPO.vendor_name,
      alert_type: 'delay',
      priority_level: priorityLevel,
      delay_days: delayDays,
      original_eta: originalETA,
      new_eta: newETA,
      stockout_risk_days: Math.floor(maxImpactDays),
      affected_items: affectedItems,
      impact_summary: criticalItems > 0
        ? `${criticalItems} item(s) will stockout before delivery`
        : highPriorityItems > 0
        ? `${highPriorityItems} item(s) will be critically low`
        : `${affectedItems.length} item(s) impacted`,
      recommended_action: criticalItems > 0
        ? 'Contact vendor immediately - expedite shipment or find backup supplier'
        : highPriorityItems > 0
        ? 'Review with vendor within 24 hours'
        : 'Monitor - no immediate action required',
      draft_vendor_email: draftEmail,
      created_at: new Date().toISOString(),
    });

    // Update PO expected date
    await supabase
      .from('purchase_orders')
      .update({ expected_date: newETA })
      .eq('id', fullPO.id);

    console.log(`✈️ Air Traffic Controller: Alert created for PO ${fullPO.order_id} (${priorityLevel})`);

  } catch (error) {
    console.error('[Air Traffic Controller] Failed to assess delay impact:', error);
    // Don't throw - tracking update should still succeed even if alert fails
  }
}
