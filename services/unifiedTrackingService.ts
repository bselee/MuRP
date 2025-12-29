/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNIFIED TRACKING SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Single entry point for all tracking operations. Combines:
 * - Direct carrier APIs (USPS free, UPS free tier, FedEx free tier)
 * - Email-based tracking extraction
 * - Database caching via tracking_cache table
 *
 * Strategy:
 * 1. Check database cache first (tracking_cache table)
 * 2. If stale, try email-based tracking
 * 3. If no email data, try direct carrier API
 * 4. Store results in database for future queries
 *
 * This reduces API dependency and costs while maximizing tracking accuracy.
 *
 * @module services/unifiedTrackingService
 */

import { supabase } from '../lib/supabase/client';
import {
  trackPackage,
  trackPackages,
  detectCarrier,
  extractTrackingNumbers,
  getCarrierTrackingUrl,
  type Carrier,
  type TrackingStatus,
} from './directCarrierTrackingService';
import {
  extractShipmentInfo,
  isCarrierEmail,
  getCarrierFromEmail,
  scoreExtractionQuality,
  type ExtractedShipmentInfo,
} from './enhancedEmailTrackingService';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Types
// ═══════════════════════════════════════════════════════════════════════════

export interface UnifiedTrackingResult {
  trackingNumber: string;
  carrier: Carrier;
  status: TrackingStatus['status'];
  statusDescription: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  lastLocation?: string;
  lastUpdate: string;
  events: TrackingStatus['events'];
  source: 'cache' | 'email' | 'carrier_api';
  confidence: number;
  carrierTrackingUrl: string;
  relatedPOs: string[];
  needsRefresh: boolean;
}

export interface TrackingRefreshOptions {
  forceRefresh?: boolean;
  preferEmail?: boolean;
  maxCacheAgeMinutes?: number;
}

export interface BulkTrackingResult {
  successful: UnifiedTrackingResult[];
  failed: Array<{ trackingNumber: string; error: string }>;
  stats: {
    total: number;
    fromCache: number;
    fromEmail: number;
    fromApi: number;
    failed: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 Main Tracking Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get tracking status using the best available method
 */
export async function getTrackingStatus(
  trackingNumber: string,
  options: TrackingRefreshOptions = {}
): Promise<UnifiedTrackingResult> {
  const {
    forceRefresh = false,
    preferEmail = true,
    maxCacheAgeMinutes = 30,
  } = options;

  // Detect carrier
  const detection = detectCarrier(trackingNumber);
  const carrier = detection.carrier;

  // Step 1: Check database cache
  if (!forceRefresh) {
    const cached = await getCachedTracking(trackingNumber, maxCacheAgeMinutes);
    if (cached) {
      return {
        ...cached,
        needsRefresh: false,
      };
    }
  }

  // Step 2: Try email-based tracking if preferred
  if (preferEmail) {
    const emailResult = await getTrackingFromEmails(trackingNumber);
    if (emailResult && emailResult.confidence > 0.7) {
      await cacheTrackingResult(emailResult);
      return emailResult;
    }
  }

  // Step 3: Try direct carrier API
  try {
    const apiResult = await trackPackage(trackingNumber, carrier);
    const result = convertToUnifiedResult(apiResult, trackingNumber);
    await cacheTrackingResult(result);
    return result;
  } catch (error) {
    console.error(`Direct API tracking failed for ${trackingNumber}:`, error);
  }

  // Step 4: Return unknown status
  return {
    trackingNumber,
    carrier,
    status: 'unknown',
    statusDescription: 'Unable to retrieve tracking information',
    lastUpdate: new Date().toISOString(),
    events: [],
    source: 'cache',
    confidence: 0,
    carrierTrackingUrl: getCarrierTrackingUrl(trackingNumber, carrier),
    relatedPOs: [],
    needsRefresh: true,
  };
}

/**
 * Get tracking status for multiple packages
 */
export async function getBulkTrackingStatus(
  trackingNumbers: string[],
  options: TrackingRefreshOptions = {}
): Promise<BulkTrackingResult> {
  const results: UnifiedTrackingResult[] = [];
  const failed: Array<{ trackingNumber: string; error: string }> = [];
  const stats = {
    total: trackingNumbers.length,
    fromCache: 0,
    fromEmail: 0,
    fromApi: 0,
    failed: 0,
  };

  // Process in batches
  const batchSize = 10;
  for (let i = 0; i < trackingNumbers.length; i += batchSize) {
    const batch = trackingNumbers.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (tn) => {
        try {
          const result = await getTrackingStatus(tn, options);
          return { success: true, result };
        } catch (error) {
          return { success: false, trackingNumber: tn, error: String(error) };
        }
      })
    );

    for (const br of batchResults) {
      if (br.success && 'result' in br) {
        results.push(br.result);
        switch (br.result.source) {
          case 'cache': stats.fromCache++; break;
          case 'email': stats.fromEmail++; break;
          case 'carrier_api': stats.fromApi++; break;
        }
      } else if ('trackingNumber' in br) {
        failed.push({ trackingNumber: br.trackingNumber, error: br.error || 'Unknown error' });
        stats.failed++;
      }
    }

    // Rate limiting between batches
    if (i + batchSize < trackingNumbers.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return { successful: results, failed, stats };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📧 Email-Based Tracking
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get tracking information from processed emails
 */
async function getTrackingFromEmails(trackingNumber: string): Promise<UnifiedTrackingResult | null> {
  try {
    // Find emails that mention this tracking number
    const { data: messages } = await supabase
      .from('email_thread_messages')
      .select(`
        id,
        subject,
        body_preview,
        sender_email,
        received_at,
        extracted_tracking_number,
        extracted_carrier,
        extracted_eta,
        email_threads (
          po_id,
          purchase_orders (
            order_id
          )
        )
      `)
      .or(`extracted_tracking_number.eq.${trackingNumber},body_preview.ilike.%${trackingNumber}%`)
      .order('received_at', { ascending: false })
      .limit(10);

    if (!messages || messages.length === 0) {
      return null;
    }

    // Process the most recent email
    const latestMessage = messages[0];
    const carrier = (latestMessage.extracted_carrier as Carrier) ||
                   getCarrierFromEmail(latestMessage.sender_email) ||
                   detectCarrier(trackingNumber).carrier;

    // Extract more info from email body
    const extraction = extractShipmentInfo({
      subject: latestMessage.subject || '',
      body: latestMessage.body_preview || '',
      senderEmail: latestMessage.sender_email || '',
    });

    // Determine status from email content
    let status: TrackingStatus['status'] = 'in_transit';
    if (extraction.isDeliveryConfirmation) status = 'delivered';
    else if (extraction.isDelayNotification) status = 'exception';
    else if (extraction.isShipmentNotification) status = 'in_transit';

    // Get related POs
    const relatedPOs = messages
      .filter((m: any) => m.email_threads?.purchase_orders?.order_id)
      .map((m: any) => m.email_threads.purchase_orders.order_id);

    return {
      trackingNumber,
      carrier,
      status,
      statusDescription: extraction.isDeliveryConfirmation
        ? 'Delivered (confirmed via email)'
        : extraction.isShipmentNotification
          ? 'Shipment confirmed via email'
          : 'Tracking from vendor email',
      estimatedDelivery: extraction.estimatedDelivery?.date || latestMessage.extracted_eta,
      lastUpdate: latestMessage.received_at,
      events: [{
        timestamp: latestMessage.received_at,
        status: 'Email received',
        description: latestMessage.subject || 'Tracking email processed',
      }],
      source: 'email',
      confidence: scoreExtractionQuality(extraction),
      carrierTrackingUrl: getCarrierTrackingUrl(trackingNumber, carrier),
      relatedPOs: [...new Set(relatedPOs)],
      needsRefresh: false,
    };
  } catch (error) {
    console.error('Email tracking lookup failed:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 💾 Database Caching
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get cached tracking from database
 */
async function getCachedTracking(
  trackingNumber: string,
  maxAgeMinutes: number
): Promise<UnifiedTrackingResult | null> {
  try {
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();

    const { data } = await supabase
      .from('tracking_cache')
      .select(`
        tracking_number,
        carrier,
        status,
        status_description,
        estimated_delivery,
        actual_delivery,
        last_location,
        last_update,
        events,
        source,
        confidence,
        updated_at
      `)
      .eq('tracking_number', trackingNumber)
      .gte('updated_at', cutoffTime)
      .single();

    if (!data) return null;

    // Get related POs
    const { data: shipments } = await supabase
      .from('po_shipment_data')
      .select('po_id, purchase_orders(order_id)')
      .contains('tracking_numbers', [trackingNumber]);

    const relatedPOs = shipments
      ?.filter((s: any) => s.purchase_orders?.order_id)
      .map((s: any) => s.purchase_orders.order_id) || [];

    const carrier = (data.carrier?.toUpperCase() || 'Unknown') as Carrier;

    return {
      trackingNumber,
      carrier,
      status: mapTagToStatus(data.status || ''),
      statusDescription: data.status_description || data.status || 'Status from cache',
      estimatedDelivery: data.estimated_delivery,
      actualDelivery: data.actual_delivery,
      lastLocation: data.last_location,
      lastUpdate: data.last_update || data.updated_at,
      events: (data.events || []) as TrackingStatus['events'],
      source: 'cache',
      confidence: data.confidence || 0.85,
      carrierTrackingUrl: getCarrierTrackingUrl(trackingNumber, carrier),
      relatedPOs: [...new Set(relatedPOs)],
      needsRefresh: false,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Cache tracking result to database
 */
async function cacheTrackingResult(result: UnifiedTrackingResult): Promise<void> {
  try {
    await supabase.from('tracking_cache').upsert({
      tracking_number: result.trackingNumber,
      carrier: result.carrier.toLowerCase(),
      status: statusToTag(result.status),
      status_description: result.statusDescription,
      estimated_delivery: result.estimatedDelivery,
      actual_delivery: result.actualDelivery,
      last_location: result.lastLocation,
      last_update: new Date().toISOString(),
      events: result.events,
      source: result.source,
      confidence: result.confidence,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'tracking_number',
    });

    // Cache events in tracking_events table if we have events
    if (result.events.length > 0) {
      const events = result.events.map(event => ({
        tracking_number: result.trackingNumber,
        carrier: result.carrier.toLowerCase(),
        event_time: event.timestamp,
        status: event.status,
        description: event.description,
        location: event.location,
        city: event.city,
        state: event.state,
        country: event.country,
        source: result.source,
      }));

      // Insert new events (ignore duplicates)
      for (const ev of events) {
        await supabase
          .from('tracking_events')
          .upsert(ev, { onConflict: 'tracking_number,event_time' })
          .select();
      }
    }
  } catch (error) {
    console.error('Failed to cache tracking result:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 Tracking Analytics
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get tracking summary for a PO
 */
export async function getPOTrackingSummary(poId: string): Promise<{
  totalShipments: number;
  trackingNumbers: string[];
  statuses: Record<string, number>;
  estimatedDeliveries: string[];
  allDelivered: boolean;
  hasExceptions: boolean;
}> {
  const { data: shipments } = await supabase
    .from('po_shipment_data')
    .select('tracking_numbers, status, estimated_delivery_date')
    .eq('po_id', poId);

  if (!shipments || shipments.length === 0) {
    return {
      totalShipments: 0,
      trackingNumbers: [],
      statuses: {},
      estimatedDeliveries: [],
      allDelivered: false,
      hasExceptions: false,
    };
  }

  const trackingNumbers = shipments.flatMap((s: any) => s.tracking_numbers || []);
  const statuses: Record<string, number> = {};
  const estimatedDeliveries: string[] = [];

  for (const shipment of shipments) {
    const status = (shipment as any).status || 'unknown';
    statuses[status] = (statuses[status] || 0) + 1;
    if ((shipment as any).estimated_delivery_date) {
      estimatedDeliveries.push((shipment as any).estimated_delivery_date);
    }
  }

  return {
    totalShipments: shipments.length,
    trackingNumbers,
    statuses,
    estimatedDeliveries: [...new Set(estimatedDeliveries)].sort(),
    allDelivered: Object.keys(statuses).length === 1 && statuses['delivered'] > 0,
    hasExceptions: !!statuses['exception'],
  };
}

/**
 * Get all active trackings (in transit or pending)
 */
export async function getActiveTrackings(): Promise<UnifiedTrackingResult[]> {
  const { data } = await supabase
    .from('tracking_cache')
    .select('tracking_number')
    .in('status', ['InTransit', 'OutForDelivery', 'Pending', 'InfoReceived', 'in_transit', 'out_for_delivery', 'pending'])
    .order('updated_at', { ascending: false })
    .limit(50);

  if (!data || data.length === 0) return [];

  const trackingNumbers = data.map((d: any) => d.tracking_number);
  const result = await getBulkTrackingStatus(trackingNumbers, { maxCacheAgeMinutes: 60 });

  return result.successful;
}

/**
 * Get trackings that need refresh (stale data)
 */
export async function getStaleTrackings(maxAgeMinutes: number = 120): Promise<string[]> {
  const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('tracking_cache')
    .select('tracking_number')
    .in('status', ['InTransit', 'OutForDelivery', 'Pending', 'InfoReceived', 'in_transit', 'out_for_delivery', 'pending'])
    .lt('updated_at', cutoffTime)
    .limit(20);

  return data?.map((d: any) => d.tracking_number) || [];
}

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

function convertToUnifiedResult(
  status: TrackingStatus,
  trackingNumber: string
): UnifiedTrackingResult {
  return {
    trackingNumber,
    carrier: status.carrier,
    status: status.status,
    statusDescription: status.statusDescription,
    estimatedDelivery: status.estimatedDelivery,
    actualDelivery: status.actualDelivery,
    lastLocation: status.lastLocation,
    lastUpdate: status.lastUpdate || new Date().toISOString(),
    events: status.events,
    source: status.source as UnifiedTrackingResult['source'],
    confidence: status.confidence,
    carrierTrackingUrl: getCarrierTrackingUrl(trackingNumber, status.carrier),
    relatedPOs: [],
    needsRefresh: false,
  };
}

function mapTagToStatus(tag: string): TrackingStatus['status'] {
  const tagMap: Record<string, TrackingStatus['status']> = {
    Delivered: 'delivered',
    OutForDelivery: 'out_for_delivery',
    InTransit: 'in_transit',
    InfoReceived: 'pending',
    Pending: 'pending',
    Exception: 'exception',
    AttemptFail: 'exception',
    Expired: 'exception',
  };
  return tagMap[tag] || 'unknown';
}

function statusToTag(status: TrackingStatus['status']): string {
  const statusMap: Record<TrackingStatus['status'], string> = {
    delivered: 'Delivered',
    out_for_delivery: 'OutForDelivery',
    in_transit: 'InTransit',
    pending: 'Pending',
    exception: 'Exception',
    unknown: 'Pending',
  };
  return statusMap[status] || 'Pending';
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 Exports
// ═══════════════════════════════════════════════════════════════════════════

export {
  // Re-export from direct carrier service
  detectCarrier,
  extractTrackingNumbers,
  getCarrierTrackingUrl,
};

export default {
  // Main functions
  getTrackingStatus,
  getBulkTrackingStatus,

  // PO-specific
  getPOTrackingSummary,

  // Management
  getActiveTrackings,
  getStaleTrackings,

  // Re-exports
  detectCarrier,
  extractTrackingNumbers,
  getCarrierTrackingUrl,
};
