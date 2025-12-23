/**
 * ===============================================================================
 * AFTERSHIP SERVICE - Real-time INBOUND PO Tracking
 * ===============================================================================
 *
 * AfterShip = INBOUND tracking (POs from vendors) - CRITICAL for stockout prevention!
 *
 * This service provides:
 * - AfterShip API client with authentication
 * - Tracking creation and management
 * - Webhook subscription (for real-time updates)
 * - PO and email thread correlation
 * - Air Traffic Controller integration for delay alerts
 *
 * Part of: Email Tracking Agent Expansion
 * Goal: NEVER BE OUT OF STOCK!
 *
 * @module services/afterShipService
 */

import { supabase } from '../lib/supabase/client';

// ===============================================================================
// Types
// ===============================================================================

export interface AfterShipConfig {
  enabled: boolean;
  apiKey: string | null;
  webhookSecret: string | null;
  webhookUrl: string | null;
  defaultSlug: string;
  autoCreateTracking: boolean;
  autoCorrelate: boolean;
  correlateWithEmail: boolean;
  pollInterval: number; // seconds
  enableWebhooks: boolean;
  lastPollAt: string | null;
  stats: {
    totalTrackings: number;
    activeTrackings: number;
    correlatedPOs: number;
    webhooksReceived: number;
    lastWebhookAt: string | null;
  };
}

export interface AfterShipTracking {
  id: string;
  created_at: string;
  updated_at: string;
  last_updated_at: string;
  tracking_number: string;
  slug: string;
  active: boolean;
  android: string[];
  ios: string[];
  custom_fields: Record<string, any>;
  customer_name: string | null;
  delivery_time: number | null;
  destination_country_iso3: string | null;
  destination_raw_location: string | null;
  emails: string[];
  expected_delivery: string | null;
  note: string | null;
  order_id: string | null;
  order_id_path: string | null;
  order_date: string | null;
  order_number: string | null;
  origin_country_iso3: string | null;
  origin_raw_location: string | null;
  shipment_package_count: number;
  shipment_pickup_date: string | null;
  shipment_delivery_date: string | null;
  shipment_type: string | null;
  shipment_weight: number | null;
  shipment_weight_unit: string | null;
  signed_by: string | null;
  smses: string[];
  source: string | null;
  tag: AfterShipTag;
  subtag: string | null;
  subtag_message: string | null;
  title: string | null;
  tracked_count: number;
  unique_token: string;
  checkpoints: AfterShipCheckpoint[];
  courier_destination_country_iso3: string | null;
  courier_tracking_link: string | null;
}

export type AfterShipTag =
  | 'Pending'
  | 'InfoReceived'
  | 'InTransit'
  | 'OutForDelivery'
  | 'AttemptFail'
  | 'Delivered'
  | 'AvailableForPickup'
  | 'Exception'
  | 'Expired';

export interface AfterShipCheckpoint {
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
  coordinates: number[] | null;
  state: string | null;
  zip: string | null;
  raw_tag: string | null;
}

export interface AfterShipWebhook {
  id: string;
  path: string;
  events: string[];
  status: 'active' | 'paused';
  created_at: string;
  updated_at: string;
}

export interface CorrelationResult {
  poId: string | null;
  threadId: string | null;
  method: 'order_number' | 'tracking_number' | 'email_thread' | 'manual' | null;
  confidence: number;
  notes: string | null;
}

// Internal status mapping
export type InternalStatus =
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
// Configuration
// ===============================================================================

const AFTERSHIP_BASE_URL = 'https://api.aftership.com/v4';

/**
 * Get AfterShip configuration from app_settings
 */
export async function getAfterShipConfig(): Promise<AfterShipConfig> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'aftership_config')
    .maybeSingle();

  if (error) {
    console.error('[AfterShip] Failed to get config:', error);
    throw error;
  }

  return data?.setting_value || {
    enabled: false,
    apiKey: null,
    webhookSecret: null,
    webhookUrl: null,
    defaultSlug: 'ups',
    autoCreateTracking: true,
    autoCorrelate: true,
    correlateWithEmail: true,
    pollInterval: 3600,
    enableWebhooks: true,
    lastPollAt: null,
    stats: {
      totalTrackings: 0,
      activeTrackings: 0,
      correlatedPOs: 0,
      webhooksReceived: 0,
      lastWebhookAt: null,
    },
  };
}

/**
 * Update AfterShip configuration
 */
export async function updateAfterShipConfig(config: Partial<AfterShipConfig>): Promise<void> {
  const current = await getAfterShipConfig();
  const merged = { ...current, ...config };

  const { error } = await supabase
    .from('app_settings')
    .upsert({
      setting_key: 'aftership_config',
      setting_value: merged,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('[AfterShip] Failed to update config:', error);
    throw error;
  }
}

// ===============================================================================
// API Client
// ===============================================================================

/**
 * Make authenticated request to AfterShip API
 */
async function afterShipRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const config = await getAfterShipConfig();

  if (!config.apiKey) {
    throw new Error('AfterShip API key not configured');
  }

  const url = `${AFTERSHIP_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'aftership-api-key': config.apiKey,
      ...options.headers,
    },
  });

  // Handle rate limiting
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
    console.warn(`[AfterShip] Rate limited, retry after ${retryAfter}s`);
    throw new Error(`Rate limited. Retry after ${retryAfter} seconds.`);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const errorMessage = errorBody?.meta?.message || `HTTP ${response.status}`;
    console.error('[AfterShip] API error:', response.status, errorMessage);
    throw new Error(`AfterShip API error: ${errorMessage}`);
  }

  const json = await response.json();
  return json.data;
}

// ===============================================================================
// Tracking API
// ===============================================================================

/**
 * Create a new tracking in AfterShip
 */
export async function createTracking(params: {
  trackingNumber: string;
  slug?: string;
  title?: string;
  orderId?: string;
  orderNumber?: string;
  customerName?: string;
  note?: string;
  emails?: string[];
}): Promise<AfterShipTracking> {
  const config = await getAfterShipConfig();

  const tracking = await afterShipRequest<{ tracking: AfterShipTracking }>('/trackings', {
    method: 'POST',
    body: JSON.stringify({
      tracking: {
        tracking_number: params.trackingNumber,
        slug: params.slug || config.defaultSlug,
        title: params.title,
        order_id: params.orderId,
        order_number: params.orderNumber,
        customer_name: params.customerName,
        note: params.note,
        emails: params.emails,
      },
    }),
  });

  return tracking.tracking;
}

/**
 * Get tracking by slug and tracking number
 */
export async function getTracking(
  slug: string,
  trackingNumber: string
): Promise<AfterShipTracking | null> {
  try {
    const result = await afterShipRequest<{ tracking: AfterShipTracking }>(
      `/trackings/${slug}/${trackingNumber}`
    );
    return result.tracking;
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null;
    }
    throw error;
  }
}

/**
 * Get tracking by AfterShip ID
 */
export async function getTrackingById(id: string): Promise<AfterShipTracking | null> {
  try {
    const result = await afterShipRequest<{ tracking: AfterShipTracking }>(
      `/trackings/${id}`
    );
    return result.tracking;
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null;
    }
    throw error;
  }
}

/**
 * Get or create tracking (ensures tracking exists)
 */
export async function ensureTracking(params: {
  trackingNumber: string;
  slug?: string;
  title?: string;
  orderId?: string;
  orderNumber?: string;
}): Promise<AfterShipTracking> {
  const config = await getAfterShipConfig();
  const slug = params.slug || config.defaultSlug;

  // Try to get existing tracking
  let tracking = await getTracking(slug, params.trackingNumber);

  // Create if not exists
  if (!tracking) {
    console.log(`[AfterShip] Creating new tracking for ${params.trackingNumber}`);
    tracking = await createTracking(params);
  }

  return tracking;
}

/**
 * List trackings with filters
 */
export async function listTrackings(params: {
  page?: number;
  limit?: number;
  tag?: AfterShipTag;
  slug?: string;
  createdAtMin?: string;
  createdAtMax?: string;
}): Promise<{ trackings: AfterShipTracking[]; count: number }> {
  const queryParams = new URLSearchParams();

  if (params.page) queryParams.append('page', String(params.page));
  if (params.limit) queryParams.append('limit', String(params.limit || 100));
  if (params.tag) queryParams.append('tag', params.tag);
  if (params.slug) queryParams.append('slug', params.slug);
  if (params.createdAtMin) queryParams.append('created_at_min', params.createdAtMin);
  if (params.createdAtMax) queryParams.append('created_at_max', params.createdAtMax);

  const result = await afterShipRequest<{ trackings: AfterShipTracking[]; count: number }>(
    `/trackings?${queryParams.toString()}`
  );

  return result;
}

/**
 * Delete a tracking
 */
export async function deleteTracking(slug: string, trackingNumber: string): Promise<void> {
  await afterShipRequest(`/trackings/${slug}/${trackingNumber}`, {
    method: 'DELETE',
  });
}

/**
 * Retrack an expired tracking
 */
export async function retrackTracking(slug: string, trackingNumber: string): Promise<AfterShipTracking> {
  const result = await afterShipRequest<{ tracking: AfterShipTracking }>(
    `/trackings/${slug}/${trackingNumber}/retrack`,
    { method: 'POST' }
  );
  return result.tracking;
}

// ===============================================================================
// Webhooks API
// ===============================================================================

/**
 * List webhooks
 */
export async function listWebhooks(): Promise<AfterShipWebhook[]> {
  const result = await afterShipRequest<{ webhooks: AfterShipWebhook[] }>('/webhooks');
  return result.webhooks;
}

/**
 * Create a webhook
 */
export async function createWebhook(params: {
  url: string;
  events?: string[];
}): Promise<AfterShipWebhook> {
  const result = await afterShipRequest<{ webhook: AfterShipWebhook }>('/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        url: params.url,
        events: params.events || ['tracking_update'],
      },
    }),
  });
  return result.webhook;
}

/**
 * Delete a webhook
 */
export async function deleteWebhook(id: string): Promise<void> {
  await afterShipRequest(`/webhooks/${id}`, { method: 'DELETE' });
}

/**
 * Get or create webhook for MuRP
 */
export async function ensureWebhook(webhookUrl: string): Promise<AfterShipWebhook> {
  const webhooks = await listWebhooks();

  // Check if webhook already exists
  const existing = webhooks.find((w) => w.path === webhookUrl);
  if (existing) {
    return existing;
  }

  // Create new webhook
  return createWebhook({ url: webhookUrl });
}

// ===============================================================================
// Correlation
// ===============================================================================

/**
 * Correlate tracking with MuRP PO
 */
export async function correlateTracking(
  trackingNumber: string,
  orderNumber?: string | null
): Promise<CorrelationResult> {
  const result: CorrelationResult = {
    poId: null,
    threadId: null,
    method: null,
    confidence: 0,
    notes: null,
  };

  // Try by order number first (highest confidence)
  if (orderNumber) {
    const { data: poByOrder } = await supabase.rpc('find_po_by_order_number', {
      p_order_number: orderNumber,
    });

    if (poByOrder) {
      result.poId = poByOrder;
      result.method = 'order_number';
      result.confidence = 0.95;
      result.notes = `Matched by order number: ${orderNumber}`;
      return result;
    }
  }

  // Try by tracking number
  const { data: poByTracking } = await supabase.rpc('find_po_by_aftership_tracking', {
    p_tracking_number: trackingNumber,
  });

  if (poByTracking) {
    result.poId = poByTracking;
    result.method = 'tracking_number';
    result.confidence = 0.9;
    result.notes = `Matched by tracking number: ${trackingNumber}`;
    return result;
  }

  // Try email thread correlation
  const { data: threadByTracking } = await supabase.rpc('find_email_thread_by_aftership_tracking', {
    p_tracking_number: trackingNumber,
  });

  if (threadByTracking) {
    result.threadId = threadByTracking;

    // Get PO from thread
    const { data: thread } = await supabase
      .from('email_threads')
      .select('po_id')
      .eq('id', threadByTracking)
      .single();

    if (thread?.po_id) {
      result.poId = thread.po_id;
      result.method = 'email_thread';
      result.confidence = 0.85;
      result.notes = `Matched via email thread: ${threadByTracking}`;
    }
  }

  return result;
}

// ===============================================================================
// Status Mapping
// ===============================================================================

/**
 * Map AfterShip tag to internal status
 */
export function mapTagToInternalStatus(tag: AfterShipTag): InternalStatus {
  const mapping: Record<AfterShipTag, InternalStatus> = {
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

/**
 * Map carrier slug to display name
 */
export function mapSlugToCarrierName(slug: string): string {
  const mapping: Record<string, string> = {
    ups: 'UPS',
    fedex: 'FedEx',
    usps: 'USPS',
    'dhl-express': 'DHL Express',
    'dhl-ecommerce': 'DHL eCommerce',
    dhl: 'DHL',
    lasership: 'LaserShip',
    ontrac: 'OnTrac',
    purolator: 'Purolator',
    'canada-post': 'Canada Post',
    'royal-mail': 'Royal Mail',
    tnt: 'TNT',
    aramex: 'Aramex',
    dpd: 'DPD',
    gls: 'GLS',
    'amazon-fba': 'Amazon FBA',
    sf: 'SF Express',
    cainiao: 'Cainiao',
    'china-post': 'China Post',
    yanwen: 'Yanwen',
  };

  return mapping[slug.toLowerCase()] || slug.toUpperCase();
}

// ===============================================================================
// Sync Operations
// ===============================================================================

/**
 * Process tracking update and sync with MuRP
 */
export async function processTrackingUpdate(
  tracking: AfterShipTracking,
  source: 'webhook' | 'polling' = 'webhook'
): Promise<{
  success: boolean;
  poId: string | null;
  threadId: string | null;
  alertId: string | null;
  error?: string;
}> {
  try {
    // Find correlation
    const correlation = await correlateTracking(
      tracking.tracking_number,
      tracking.order_number
    );

    // Upsert tracking record
    const { error: trackingError } = await supabase
      .from('aftership_trackings')
      .upsert({
        aftership_id: tracking.id,
        slug: tracking.slug,
        tracking_number: tracking.tracking_number,
        po_id: correlation.poId,
        thread_id: correlation.threadId,
        correlation_method: correlation.method,
        correlation_confidence: correlation.confidence,
        tag: tracking.tag,
        subtag: tracking.subtag,
        subtag_message: tracking.subtag_message,
        internal_status: mapTagToInternalStatus(tracking.tag),
        expected_delivery: tracking.expected_delivery,
        shipment_pickup_date: tracking.shipment_pickup_date,
        shipment_delivery_date: tracking.shipment_delivery_date,
        origin_country_iso3: tracking.origin_country_iso3,
        destination_country_iso3: tracking.destination_country_iso3,
        destination_state: tracking.checkpoints?.[0]?.state,
        destination_city: tracking.checkpoints?.[0]?.city,
        destination_postal_code: tracking.checkpoints?.[0]?.zip,
        courier_tracking_link: tracking.courier_tracking_link,
        title: tracking.title,
        order_id: tracking.order_id,
        order_number: tracking.order_number,
        customer_name: tracking.customer_name,
        note: tracking.note,
        checkpoints: tracking.checkpoints,
        latest_checkpoint_message: tracking.checkpoints?.[0]?.message,
        latest_checkpoint_time: tracking.checkpoints?.[0]?.checkpoint_time,
        source,
        last_synced_at: new Date().toISOString(),
      }, {
        onConflict: 'slug,tracking_number',
      });

    if (trackingError) {
      console.error('[AfterShip] Failed to upsert tracking:', trackingError);
      throw trackingError;
    }

    // Store checkpoints
    if (tracking.checkpoints?.length) {
      const { data: trackingRecord } = await supabase
        .from('aftership_trackings')
        .select('id')
        .eq('tracking_number', tracking.tracking_number)
        .eq('slug', tracking.slug)
        .single();

      if (trackingRecord) {
        // Get existing checkpoint times to avoid duplicates
        const { data: existingCheckpoints } = await supabase
          .from('aftership_checkpoints')
          .select('checkpoint_time')
          .eq('tracking_id', trackingRecord.id);

        const existingTimes = new Set(
          existingCheckpoints?.map((c) => c.checkpoint_time) || []
        );

        // Insert new checkpoints
        const newCheckpoints = tracking.checkpoints
          .filter((cp) => !existingTimes.has(cp.checkpoint_time))
          .map((cp) => ({
            tracking_id: trackingRecord.id,
            aftership_id: tracking.id,
            checkpoint_time: cp.checkpoint_time,
            tag: cp.tag,
            subtag: cp.subtag,
            subtag_message: cp.subtag_message,
            message: cp.message,
            location: cp.location,
            city: cp.city,
            state: cp.state,
            zip: cp.zip,
            country_name: cp.country_name,
            country_iso3: cp.country_iso3,
            raw_tag: cp.raw_tag,
          }));

        if (newCheckpoints.length > 0) {
          await supabase.from('aftership_checkpoints').insert(newCheckpoints);
        }
      }
    }

    // Update PO if correlated
    let alertId: string | null = null;
    if (correlation.poId) {
      // Update PO tracking
      await supabase.rpc('update_po_tracking_from_aftership', {
        p_po_id: correlation.poId,
        p_tracking_number: tracking.tracking_number,
        p_carrier: mapSlugToCarrierName(tracking.slug),
        p_tag: tracking.tag,
        p_expected_delivery: tracking.expected_delivery,
        p_latest_checkpoint: tracking.checkpoints?.[0]?.message,
      });

      // Assess delay impact via Air Traffic Controller
      if (tracking.expected_delivery) {
        const { data: alert } = await supabase.rpc('assess_aftership_delivery_impact', {
          p_po_id: correlation.poId,
          p_new_expected_delivery: tracking.expected_delivery,
          p_tag: tracking.tag,
          p_tracking_number: tracking.tracking_number,
        });
        alertId = alert;
      }
    }

    // Update email thread if correlated
    if (correlation.threadId) {
      await updateEmailThreadFromTracking(correlation.threadId, tracking);
    }

    return {
      success: true,
      poId: correlation.poId,
      threadId: correlation.threadId,
      alertId,
    };
  } catch (error) {
    console.error('[AfterShip] Failed to process tracking update:', error);
    return {
      success: false,
      poId: null,
      threadId: null,
      alertId: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Update email thread with tracking info
 */
async function updateEmailThreadFromTracking(
  threadId: string,
  tracking: AfterShipTracking
): Promise<void> {
  const carrier = mapSlugToCarrierName(tracking.slug);

  // Get current thread data
  const { data: thread } = await supabase
    .from('email_threads')
    .select('tracking_numbers, carriers')
    .eq('id', threadId)
    .single();

  const currentTracking = thread?.tracking_numbers || [];
  const currentCarriers = thread?.carriers || [];

  // Add tracking number if not exists
  const newTrackingNumbers = currentTracking.includes(tracking.tracking_number)
    ? currentTracking
    : [...currentTracking, tracking.tracking_number];

  // Add carrier if not exists
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
      eta_confidence: tracking.tag === 'InTransit' || tracking.tag === 'OutForDelivery' ? 'high' : 'medium',
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId);
}

/**
 * Sync active trackings from AfterShip
 */
export async function syncActiveTrackings(): Promise<{
  processed: number;
  updated: number;
  errors: number;
}> {
  const config = await getAfterShipConfig();
  if (!config.enabled) {
    throw new Error('AfterShip integration is not enabled');
  }

  let processed = 0;
  let updated = 0;
  let errors = 0;
  let page = 1;
  let hasMore = true;

  // Sync non-delivered trackings
  const activeTags: AfterShipTag[] = [
    'Pending',
    'InfoReceived',
    'InTransit',
    'OutForDelivery',
    'AttemptFail',
    'AvailableForPickup',
    'Exception',
  ];

  for (const tag of activeTags) {
    page = 1;
    hasMore = true;

    while (hasMore) {
      try {
        const { trackings, count } = await listTrackings({ page, limit: 100, tag });

        for (const tracking of trackings) {
          const result = await processTrackingUpdate(tracking, 'polling');
          processed++;
          if (result.success && result.poId) updated++;
          if (!result.success) errors++;
        }

        hasMore = trackings.length === 100 && processed < count;
        page++;
      } catch (error) {
        console.error(`[AfterShip] Failed to sync ${tag} trackings:`, error);
        hasMore = false;
      }
    }
  }

  // Update config stats
  await updateAfterShipConfig({
    lastPollAt: new Date().toISOString(),
    stats: {
      ...config.stats,
      totalTrackings: config.stats.totalTrackings + processed,
      correlatedPOs: config.stats.correlatedPOs + updated,
    },
  });

  return { processed, updated, errors };
}

/**
 * Create tracking for PO
 */
export async function createTrackingForPO(
  poId: string,
  trackingNumber: string,
  carrier?: string
): Promise<AfterShipTracking> {
  // Get PO info
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, order_id, vendor_name')
    .eq('id', poId)
    .single();

  if (!po) {
    throw new Error('PO not found');
  }

  const config = await getAfterShipConfig();

  // Create tracking
  const tracking = await createTracking({
    trackingNumber,
    slug: carrier?.toLowerCase() || config.defaultSlug,
    title: `PO ${po.order_id}`,
    orderNumber: po.order_id,
    note: `Vendor: ${po.vendor_name}`,
  });

  // Process to store correlation
  await processTrackingUpdate(tracking, 'manual');

  // Update PO
  await supabase
    .from('purchase_orders')
    .update({
      tracking_number: trackingNumber,
      tracking_carrier: carrier || config.defaultSlug.toUpperCase(),
      tracking_status: 'processing',
      tracking_last_checked_at: new Date().toISOString(),
    })
    .eq('id', poId);

  return tracking;
}

// ===============================================================================
// Connection Test
// ===============================================================================

/**
 * Test AfterShip connection
 */
export async function testConnection(): Promise<{
  success: boolean;
  message: string;
  trackingCount?: number;
}> {
  try {
    const config = await getAfterShipConfig();
    if (!config.apiKey) {
      return { success: false, message: 'API key not configured' };
    }

    // Try to list trackings as a connection test
    const { count } = await listTrackings({ limit: 1 });

    return {
      success: true,
      message: 'Connected successfully',
      trackingCount: count,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

// ===============================================================================
// Detect carrier from tracking number
// ===============================================================================

/**
 * Detect carrier from tracking number pattern
 */
export async function detectCarrier(trackingNumber: string): Promise<{ slug: string; name: string }[]> {
  try {
    const result = await afterShipRequest<{ couriers: Array<{ slug: string; name: string }> }>(
      '/couriers/detect',
      {
        method: 'POST',
        body: JSON.stringify({
          tracking: { tracking_number: trackingNumber },
        }),
      }
    );

    return result.couriers || [];
  } catch (error) {
    console.error('[AfterShip] Failed to detect carrier:', error);
    return [];
  }
}

// ===============================================================================
// Export
// ===============================================================================

export default {
  // Config
  getAfterShipConfig,
  updateAfterShipConfig,

  // Tracking operations
  createTracking,
  getTracking,
  getTrackingById,
  ensureTracking,
  listTrackings,
  deleteTracking,
  retrackTracking,

  // Webhooks
  listWebhooks,
  createWebhook,
  deleteWebhook,
  ensureWebhook,

  // Correlation
  correlateTracking,

  // Status mapping
  mapTagToInternalStatus,
  mapSlugToCarrierName,

  // Sync
  processTrackingUpdate,
  syncActiveTrackings,
  createTrackingForPO,

  // Utils
  testConnection,
  detectCarrier,
};
