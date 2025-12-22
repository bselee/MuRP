/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SHIPSTATION SERVICE - Real-time Tracking Integration
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Integrates ShipStation API for real-time tracking updates alongside
 * AfterShip polling and Email Tracking Agent.
 *
 * Key Features:
 * - ShipStation API client with authentication
 * - Order and shipment fetching
 * - Webhook subscription management
 * - PO and email thread correlation
 * - Rate limit handling
 *
 * Part of: Email Tracking Agent Expansion
 * Goal: NEVER BE OUT OF STOCK!
 *
 * @module services/shipStationService
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ShipStationConfig {
  enabled: boolean;
  apiKey: string | null;
  apiSecret: string | null;
  webhookSecret: string | null;
  webhookUrl: string | null;
  syncOrders: boolean;
  syncShipments: boolean;
  autoCorrelate: boolean;
  correlateWithEmail: boolean;
  syncHistoricalDays: number;
  lastSyncAt: string | null;
  stats: {
    totalOrders: number;
    totalShipments: number;
    matchedPOs: number;
    unmatchedOrders: number;
  };
}

export interface ShipStationOrder {
  orderId: number;
  orderNumber: string;
  orderKey: string;
  orderDate: string;
  createDate: string;
  modifyDate: string;
  paymentDate: string | null;
  shipByDate: string | null;
  orderStatus: string;
  customerEmail: string | null;
  billTo: ShipStationAddress;
  shipTo: ShipStationAddress;
  items: ShipStationOrderItem[];
  orderTotal: number;
  amountPaid: number;
  taxAmount: number;
  shippingAmount: number;
  shipments: ShipStationShipment[];
}

export interface ShipStationAddress {
  name: string;
  company: string | null;
  street1: string;
  street2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string | null;
}

export interface ShipStationOrderItem {
  orderItemId: number;
  lineItemKey: string | null;
  sku: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  warehouseLocation: string | null;
}

export interface ShipStationShipment {
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
  shipTo: ShipStationAddress;
  shipmentItems: Array<{
    orderItemId: number;
    lineItemKey: string | null;
    sku: string | null;
    name: string;
    quantity: number;
  }>;
}

export interface ShipStationWebhook {
  WebHookID: number;
  StoreID: number | null;
  HookType: string;
  MessageFormat: string;
  Url: string;
  Name: string;
  BulkCopyBatchID: number | null;
  BulkCopyRecordID: number | null;
  Active: boolean;
  WebHookLogs: any[];
  Seller: number | null;
}

export interface CorrelationResult {
  poId: string | null;
  threadId: string | null;
  method: 'order_number' | 'tracking_number' | 'vendor_match' | 'email_thread' | 'manual' | null;
  confidence: number;
  notes: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

const SHIPSTATION_BASE_URL = 'https://ssapi.shipstation.com';

/**
 * Get ShipStation configuration from app_settings
 */
export async function getShipStationConfig(): Promise<ShipStationConfig> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'shipstation_config')
    .maybeSingle();

  if (error) {
    console.error('[ShipStation] Failed to get config:', error);
    throw error;
  }

  return data?.setting_value || {
    enabled: false,
    apiKey: null,
    apiSecret: null,
    webhookSecret: null,
    webhookUrl: null,
    syncOrders: true,
    syncShipments: true,
    autoCorrelate: true,
    correlateWithEmail: true,
    syncHistoricalDays: 30,
    lastSyncAt: null,
    stats: { totalOrders: 0, totalShipments: 0, matchedPOs: 0, unmatchedOrders: 0 },
  };
}

/**
 * Update ShipStation configuration
 */
export async function updateShipStationConfig(config: Partial<ShipStationConfig>): Promise<void> {
  const current = await getShipStationConfig();
  const merged = { ...current, ...config };

  const { error } = await supabase
    .from('app_settings')
    .update({ setting_value: merged })
    .eq('setting_key', 'shipstation_config');

  if (error) {
    console.error('[ShipStation] Failed to update config:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// API Client
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Make authenticated request to ShipStation API
 */
async function shipStationRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const config = await getShipStationConfig();

  if (!config.apiKey || !config.apiSecret) {
    throw new Error('ShipStation API credentials not configured');
  }

  const auth = btoa(`${config.apiKey}:${config.apiSecret}`);
  const url = `${SHIPSTATION_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Handle rate limiting
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
    console.warn(`[ShipStation] Rate limited, retry after ${retryAfter}s`);
    throw new Error(`Rate limited. Retry after ${retryAfter} seconds.`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ShipStation] API error:', response.status, errorText);
    throw new Error(`ShipStation API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// Orders API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch orders from ShipStation
 */
export async function fetchOrders(params: {
  orderStatus?: string;
  orderNumber?: string;
  modifyDateStart?: string;
  modifyDateEnd?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<{ orders: ShipStationOrder[]; total: number; pages: number }> {
  const queryParams = new URLSearchParams();

  if (params.orderStatus) queryParams.append('orderStatus', params.orderStatus);
  if (params.orderNumber) queryParams.append('orderNumber', params.orderNumber);
  if (params.modifyDateStart) queryParams.append('modifyDateStart', params.modifyDateStart);
  if (params.modifyDateEnd) queryParams.append('modifyDateEnd', params.modifyDateEnd);
  queryParams.append('page', String(params.page || 1));
  queryParams.append('pageSize', String(params.pageSize || 100));

  const response = await shipStationRequest<{
    orders: ShipStationOrder[];
    total: number;
    pages: number;
  }>(`/orders?${queryParams.toString()}`);

  return response;
}

/**
 * Fetch a single order by ID
 */
export async function fetchOrder(orderId: number): Promise<ShipStationOrder> {
  return shipStationRequest<ShipStationOrder>(`/orders/${orderId}`);
}

/**
 * Fetch order by order number
 */
export async function fetchOrderByNumber(orderNumber: string): Promise<ShipStationOrder | null> {
  const { orders } = await fetchOrders({ orderNumber });
  return orders[0] || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shipments API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch shipments from ShipStation
 */
export async function fetchShipments(params: {
  trackingNumber?: string;
  shipDateStart?: string;
  shipDateEnd?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<{ shipments: ShipStationShipment[]; total: number; pages: number }> {
  const queryParams = new URLSearchParams();

  if (params.trackingNumber) queryParams.append('trackingNumber', params.trackingNumber);
  if (params.shipDateStart) queryParams.append('shipDateStart', params.shipDateStart);
  if (params.shipDateEnd) queryParams.append('shipDateEnd', params.shipDateEnd);
  queryParams.append('page', String(params.page || 1));
  queryParams.append('pageSize', String(params.pageSize || 100));

  const response = await shipStationRequest<{
    shipments: ShipStationShipment[];
    total: number;
    pages: number;
  }>(`/shipments?${queryParams.toString()}`);

  return response;
}

/**
 * Fetch shipment by tracking number
 */
export async function fetchShipmentByTracking(trackingNumber: string): Promise<ShipStationShipment | null> {
  const { shipments } = await fetchShipments({ trackingNumber });
  return shipments[0] || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Webhooks API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List existing webhooks
 */
export async function listWebhooks(): Promise<{ webhooks: ShipStationWebhook[] }> {
  return shipStationRequest<{ webhooks: ShipStationWebhook[] }>('/webhooks');
}

/**
 * Subscribe to a webhook event
 */
export async function subscribeWebhook(params: {
  targetUrl: string;
  event: 'ORDER_NOTIFY' | 'SHIP_NOTIFY' | 'ITEM_SHIP_NOTIFY';
  storeId?: number | null;
  friendlyName?: string;
}): Promise<number> {
  const response = await shipStationRequest<{ id: number }>('/webhooks/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      target_url: params.targetUrl,
      event: params.event,
      store_id: params.storeId || null,
      friendly_name: params.friendlyName || `MuRP ${params.event}`,
    }),
  });

  return response.id;
}

/**
 * Unsubscribe from a webhook
 */
export async function unsubscribeWebhook(webhookId: number): Promise<void> {
  await shipStationRequest(`/webhooks/${webhookId}`, { method: 'DELETE' });
}

// ═══════════════════════════════════════════════════════════════════════════
// Correlation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Correlate ShipStation order with MuRP PO
 */
export async function correlateOrder(order: ShipStationOrder): Promise<CorrelationResult> {
  const result: CorrelationResult = {
    poId: null,
    threadId: null,
    method: null,
    confidence: 0,
    notes: null,
  };

  // Try by order number first
  const { data: poByNumber } = await supabase.rpc('find_po_by_order_number', {
    p_order_number: order.orderNumber,
  });

  if (poByNumber) {
    result.poId = poByNumber;
    result.method = 'order_number';
    result.confidence = 0.95;
    result.notes = `Matched by order number: ${order.orderNumber}`;
    return result;
  }

  // Try by tracking number if shipments exist
  for (const shipment of order.shipments || []) {
    if (shipment.trackingNumber) {
      const { data: poByTracking } = await supabase.rpc('find_po_by_tracking_number', {
        p_tracking_number: shipment.trackingNumber,
      });

      if (poByTracking) {
        result.poId = poByTracking;
        result.method = 'tracking_number';
        result.confidence = 0.9;
        result.notes = `Matched by tracking: ${shipment.trackingNumber}`;
        break;
      }

      // Also try email thread
      const { data: threadByTracking } = await supabase.rpc('find_email_thread_by_tracking', {
        p_tracking_number: shipment.trackingNumber,
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
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Correlate ShipStation shipment with email thread
 */
export async function correlateShipmentWithEmailThread(
  trackingNumber: string
): Promise<string | null> {
  const { data: threadId } = await supabase.rpc('find_email_thread_by_tracking', {
    p_tracking_number: trackingNumber,
  });

  return threadId || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Sync Operations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process a ShipStation shipment and update MuRP tracking
 */
export async function processShipStationShipment(
  shipment: ShipStationShipment,
  orderId?: string
): Promise<{
  success: boolean;
  poId: string | null;
  threadId: string | null;
  error?: string;
}> {
  try {
    // Find correlation
    let poId: string | null = null;
    let threadId: string | null = null;

    // Try to find PO by tracking
    const { data: poByTracking } = await supabase.rpc('find_po_by_tracking_number', {
      p_tracking_number: shipment.trackingNumber,
    });
    poId = poByTracking;

    // Try to find by order number if we have it
    if (!poId && shipment.orderNumber) {
      const { data: poByOrder } = await supabase.rpc('find_po_by_order_number', {
        p_order_number: shipment.orderNumber,
      });
      poId = poByOrder;
    }

    // Try to find email thread
    const { data: threadByTracking } = await supabase.rpc('find_email_thread_by_tracking', {
      p_tracking_number: shipment.trackingNumber,
    });
    threadId = threadByTracking;

    // If no PO but we have a thread with PO, use that
    if (!poId && threadId) {
      const { data: thread } = await supabase
        .from('email_threads')
        .select('po_id')
        .eq('id', threadId)
        .single();
      poId = thread?.po_id || null;
    }

    // Update tracking if we found a PO
    if (poId) {
      await supabase.rpc('update_tracking_from_shipstation', {
        p_po_id: poId,
        p_tracking_number: shipment.trackingNumber,
        p_carrier: mapCarrierCode(shipment.carrierCode),
        p_ship_date: shipment.shipDate?.split('T')[0] || null,
        p_estimated_delivery: null, // ShipStation doesn't always provide this
        p_status: 'shipped',
      });
    }

    // Update email thread if found
    if (threadId) {
      await supabase
        .from('email_threads')
        .update({
          tracking_numbers: supabase.sql`
            CASE
              WHEN NOT (tracking_numbers @> ARRAY[${shipment.trackingNumber}])
              THEN array_append(COALESCE(tracking_numbers, ARRAY[]::TEXT[]), ${shipment.trackingNumber})
              ELSE tracking_numbers
            END
          `,
          carriers: supabase.sql`
            CASE
              WHEN NOT (carriers @> ARRAY[${mapCarrierCode(shipment.carrierCode)}])
              THEN array_append(COALESCE(carriers, ARRAY[]::TEXT[]), ${mapCarrierCode(shipment.carrierCode)})
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
      correlation_method: poId ? 'tracking_number' : null,
      correlation_confidence: poId ? 0.9 : 0,
      processing_status: 'success',
      payload: shipment as unknown as Record<string, unknown>,
    });

    return { success: true, poId, threadId };
  } catch (error) {
    console.error('[ShipStation] Failed to process shipment:', error);

    // Log error
    await supabase.from('shipstation_sync_log').insert({
      shipstation_shipment_id: String(shipment.shipmentId),
      event_type: 'SHIP_NOTIFY',
      tracking_number: shipment.trackingNumber,
      processing_status: 'failed',
      processing_error: error instanceof Error ? error.message : String(error),
      payload: shipment as unknown as Record<string, unknown>,
    });

    return {
      success: false,
      poId: null,
      threadId: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Sync recent shipments from ShipStation
 */
export async function syncRecentShipments(daysBack: number = 7): Promise<{
  processed: number;
  matched: number;
  errors: number;
}> {
  const config = await getShipStationConfig();
  if (!config.enabled) {
    throw new Error('ShipStation integration is not enabled');
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  let processed = 0;
  let matched = 0;
  let errors = 0;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { shipments, pages } = await fetchShipments({
      shipDateStart: startDate.toISOString(),
      page,
      pageSize: 100,
    });

    for (const shipment of shipments) {
      const result = await processShipStationShipment(shipment);
      processed++;
      if (result.poId) matched++;
      if (!result.success) errors++;
    }

    hasMore = page < pages;
    page++;
  }

  // Update config stats
  await updateShipStationConfig({
    lastSyncAt: new Date().toISOString(),
    stats: {
      ...config.stats,
      totalShipments: config.stats.totalShipments + processed,
      matchedPOs: config.stats.matchedPOs + matched,
    },
  });

  return { processed, matched, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map ShipStation carrier code to standard carrier name
 */
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

  return mapping[code.toLowerCase()] || code.toUpperCase();
}

/**
 * Test ShipStation connection
 */
export async function testConnection(): Promise<{
  success: boolean;
  message: string;
  storeCount?: number;
}> {
  try {
    const config = await getShipStationConfig();
    if (!config.apiKey || !config.apiSecret) {
      return { success: false, message: 'API credentials not configured' };
    }

    // Try to list stores as a connection test
    const response = await shipStationRequest<{ stores: any[] }>('/stores');

    return {
      success: true,
      message: 'Connected successfully',
      storeCount: response.stores?.length || 0,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════════════

export default {
  // Config
  getShipStationConfig,
  updateShipStationConfig,

  // Orders
  fetchOrders,
  fetchOrder,
  fetchOrderByNumber,

  // Shipments
  fetchShipments,
  fetchShipmentByTracking,

  // Webhooks
  listWebhooks,
  subscribeWebhook,
  unsubscribeWebhook,

  // Correlation
  correlateOrder,
  correlateShipmentWithEmailThread,

  // Sync
  processShipStationShipment,
  syncRecentShipments,

  // Utilities
  testConnection,
};
