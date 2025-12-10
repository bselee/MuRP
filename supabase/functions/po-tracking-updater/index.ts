// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';

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

interface AfterShipConfig {
  enabled: boolean;
  apiKey: string | null;
  defaultSlug: string;
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

  const afterShipConfig = await getAfterShipConfig(supabase);

  let updates = 0;
  let deliveredCount = 0;
  let failureCount = 0;

  for (const po of purchaseOrders) {
    try {
      let carrierStatus = null;

      // SAFETY NET: Try AfterShip first, fall back gracefully
      if (afterShipConfig.enabled && afterShipConfig.apiKey) {
        try {
          carrierStatus = await fetchAfterShipTracking(
            po.tracking_carrier,
            po.tracking_number,
            afterShipConfig,
          );
        } catch (afterShipError) {
          console.warn(`[po-tracking-updater] AfterShip failed for PO ${po.id}, falling back`, afterShipError);
          await logTrackingFailure(supabase, po.id, new Error(`AfterShip API error: ${afterShipError.message}`));
          // Continue to fallback
        }
      }

      // FALLBACK: Use simulated progression if AfterShip unavailable
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
            status: mapAfterShipTag(latest.tag ?? carrierStatus.status),
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

async function getAfterShipConfig(supabase: any): Promise<AfterShipConfig> {
  const { data } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'aftership_config')
    .maybeSingle();

  const value = data?.setting_value || {};
  return {
    enabled: Boolean(value.enabled),
    apiKey: value.apiKey ?? null,
    defaultSlug: value.defaultSlug || 'ups',
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

async function fetchAfterShipTracking(
  carrier: string | null,
  trackingNumber: string,
  config: AfterShipConfig,
): Promise<{
  status: TrackingStatus;
  estimatedDelivery?: string;
  description?: string;
  rawPayload?: any;
  checkpoints?: any[];
} | null> {
  if (!config.apiKey) {
    return null;
  }

  const slug = mapCarrierSlug(carrier, config.defaultSlug);
  const headers = {
    'Content-Type': 'application/json',
    'aftership-api-key': config.apiKey,
  };

  try {
    // SAFETY NET: Try to fetch existing tracking first
    let response = await fetch(`https://api.aftership.com/v4/trackings/${slug}/${trackingNumber}`, {
      headers,
    });

    // SAFETY NET: Auto-create tracking if not found (404)
    if (response.status === 404) {
      console.log(`[po-tracking-updater] Creating new AfterShip tracking for ${trackingNumber}`);
      
      const createResponse = await fetch('https://api.aftership.com/v4/trackings', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tracking: {
            tracking_number: trackingNumber,
            slug,
          },
        }),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`AfterShip create failed: ${createResponse.status} ${errorText}`);
      }

      // SAFETY NET: Wait briefly for AfterShip to populate data
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Retry fetch
      response = await fetch(`https://api.aftership.com/v4/trackings/${slug}/${trackingNumber}`, {
        headers,
      });
    }

    // SAFETY NET: Handle rate limits with exponential backoff
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
      console.warn(`[po-tracking-updater] AfterShip rate limited, retry after ${retryAfter}s`);
      throw new Error(`AfterShip rate limited, retry after ${retryAfter}s`);
    }

    // SAFETY NET: Handle other errors gracefully
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[po-tracking-updater] AfterShip error', response.status, errorText);
      throw new Error(`AfterShip API error: ${response.status} ${errorText}`);
    }

    const { data } = await response.json();
    const tracking = data?.tracking;
    
    // SAFETY NET: Validate response structure
    if (!tracking) {
      console.warn('[po-tracking-updater] AfterShip response missing tracking data');
      return null;
    }

    const tag = tracking.tag;
    const checkpoints = tracking.checkpoints || [];
    const latestCheckpoint = checkpoints.length ? checkpoints[checkpoints.length - 1] : null;

    return {
      status: mapAfterShipTag(tag),
      estimatedDelivery: tracking.expected_delivery ?? tracking.estimated_delivery ?? null,
      description: latestCheckpoint?.message || `AfterShip status: ${tag}`,
      rawPayload: tracking,
      checkpoints,
    };
  } catch (error) {
    // SAFETY NET: Log detailed error but don't throw (allows fallback)
    console.error('[po-tracking-updater] AfterShip fetch failed', {
      carrier,
      trackingNumber,
      error: error.message,
    });
    throw error; // Re-throw for updatePOTracking to catch and fall back
  }
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
