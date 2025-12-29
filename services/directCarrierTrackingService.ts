/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIRECT CARRIER TRACKING SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Free/low-cost direct carrier tracking using official carrier APIs.
 * Uses official carrier APIs where free tiers exist, plus enhanced
 * email-based tracking as primary fallback.
 *
 * Strategy (in order of preference):
 * 1. USPS Web Tools API (FREE with registration)
 * 2. UPS Tracking API (FREE tier available)
 * 3. FedEx Track API (FREE tier available)
 * 4. Carrier tracking page scraping (backup, via edge function)
 * 5. Email-based tracking extraction (always available)
 *
 * @module services/directCarrierTrackingService
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Types
// ═══════════════════════════════════════════════════════════════════════════

export type Carrier = 'UPS' | 'FedEx' | 'USPS' | 'DHL' | 'OnTrac' | 'LSO' | 'Unknown';

export interface TrackingStatus {
  carrier: Carrier;
  trackingNumber: string;
  status: 'pending' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'unknown';
  statusDescription: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  lastLocation?: string;
  lastUpdate?: string;
  events: TrackingEvent[];
  source: 'carrier_api' | 'email' | 'manual';
  confidence: number;
  rawResponse?: any;
}

export interface TrackingEvent {
  timestamp: string;
  status: string;
  description: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
}

export interface CarrierConfig {
  name: Carrier;
  apiKey?: string;
  userId?: string;
  enabled: boolean;
  rateLimit: number; // requests per minute
  lastRequest?: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 Tracking Number Detection (Enhanced)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enhanced tracking number patterns with higher accuracy
 */
export const TRACKING_PATTERNS: Record<Carrier, RegExp[]> = {
  UPS: [
    /\b1Z[A-Z0-9]{16}\b/gi,                          // Standard UPS
    /\b(T\d{10})\b/gi,                               // UPS Mail Innovations
    /\b(K\d{10})\b/gi,                               // UPS SurePost
  ],
  FedEx: [
    /\b(\d{12})\b/g,                                 // Express/Ground 12-digit
    /\b(\d{15})\b/g,                                 // Ground 15-digit
    /\b(\d{20})\b/g,                                 // SmartPost 20-digit
    /\b(\d{22})\b/g,                                 // Door Tag 22-digit
    /\b(96\d{20})\b/g,                               // 96 prefix
    /\b(DT\d{12})\b/gi,                              // Door Tag
  ],
  USPS: [
    /\b(94\d{20})\b/g,                               // Certified Mail
    /\b(93\d{20})\b/g,                               // Priority Mail
    /\b(92\d{20})\b/g,                               // First Class
    /\b(91\d{20})\b/g,                               // Signature Confirm
    /\b(\d{20})\b/g,                                 // Generic 20-digit
    /\b(\d{22})\b/g,                                 // Generic 22-digit
    /\b(420\d{5}93\d{20})\b/g,                       // With routing code
    /\b([A-Z]{2}\d{9}US)\b/gi,                       // International
  ],
  DHL: [
    /\b(\d{10})\b/g,                                 // Standard 10-digit
    /\b(\d{11})\b/g,                                 // Standard 11-digit
    /\b([A-Z]{3}\d{7,10})\b/gi,                      // With prefix (JJD, JDA, etc)
    /\b(\d{16,19})\b/g,                              // eCommerce
  ],
  OnTrac: [
    /\b(C\d{14})\b/gi,                               // Standard OnTrac
    /\b(D\d{14})\b/gi,                               // Door Tag
  ],
  LSO: [
    /\b(\d{10,15})\b/g,                              // LSO tracking
  ],
  Unknown: [],
};

/**
 * Carrier-specific email domains for detection
 */
export const CARRIER_EMAIL_DOMAINS: Record<string, Carrier> = {
  'ups.com': 'UPS',
  'upsemail.com': 'UPS',
  'fedex.com': 'FedEx',
  'usps.com': 'USPS',
  'dhl.com': 'DHL',
  'dhl-news.com': 'DHL',
  'ontrac.com': 'OnTrac',
  'lso.com': 'LSO',
};

/**
 * Detect carrier from tracking number pattern
 */
export function detectCarrier(trackingNumber: string): { carrier: Carrier; confidence: number } {
  const cleaned = trackingNumber.trim().toUpperCase();

  // UPS - highest confidence patterns
  if (/^1Z[A-Z0-9]{16}$/i.test(cleaned)) {
    return { carrier: 'UPS', confidence: 0.99 };
  }

  // FedEx patterns
  if (/^96\d{20}$/.test(cleaned)) {
    return { carrier: 'FedEx', confidence: 0.98 };
  }
  if (/^\d{12}$/.test(cleaned) || /^\d{15}$/.test(cleaned)) {
    return { carrier: 'FedEx', confidence: 0.85 };
  }
  if (/^\d{20}$/.test(cleaned) || /^\d{22}$/.test(cleaned)) {
    // Could be FedEx or USPS - need context
    return { carrier: 'FedEx', confidence: 0.60 };
  }

  // USPS patterns
  if (/^(94|93|92|91)\d{20,22}$/.test(cleaned)) {
    return { carrier: 'USPS', confidence: 0.98 };
  }
  if (/^[A-Z]{2}\d{9}US$/i.test(cleaned)) {
    return { carrier: 'USPS', confidence: 0.99 };
  }
  if (/^420\d{5}/.test(cleaned)) {
    return { carrier: 'USPS', confidence: 0.95 };
  }

  // DHL patterns
  if (/^[A-Z]{3}\d{7,10}$/i.test(cleaned)) {
    return { carrier: 'DHL', confidence: 0.85 };
  }
  if (/^\d{10,11}$/.test(cleaned)) {
    return { carrier: 'DHL', confidence: 0.70 };
  }

  // OnTrac
  if (/^[CD]\d{14}$/i.test(cleaned)) {
    return { carrier: 'OnTrac', confidence: 0.95 };
  }

  return { carrier: 'Unknown', confidence: 0.0 };
}

/**
 * Extract all tracking numbers from text with carrier detection
 */
export function extractTrackingNumbers(text: string): Array<{
  trackingNumber: string;
  carrier: Carrier;
  confidence: number;
  context?: string;
}> {
  const results: Array<{
    trackingNumber: string;
    carrier: Carrier;
    confidence: number;
    context?: string;
  }> = [];

  const seen = new Set<string>();

  // Try each carrier's patterns
  for (const [carrier, patterns] of Object.entries(TRACKING_PATTERNS)) {
    if (carrier === 'Unknown') continue;

    for (const pattern of patterns) {
      const matches = text.matchAll(new RegExp(pattern));
      for (const match of matches) {
        const trackingNumber = match[1] || match[0];
        const cleaned = trackingNumber.trim().toUpperCase();

        if (seen.has(cleaned)) continue;
        seen.add(cleaned);

        // Get context around the match
        const startIdx = Math.max(0, (match.index || 0) - 50);
        const endIdx = Math.min(text.length, (match.index || 0) + trackingNumber.length + 50);
        const context = text.slice(startIdx, endIdx);

        const detection = detectCarrier(cleaned);
        results.push({
          trackingNumber: cleaned,
          carrier: detection.carrier,
          confidence: detection.confidence,
          context,
        });
      }
    }
  }

  // Sort by confidence
  return results.sort((a, b) => b.confidence - a.confidence);
}

// ═══════════════════════════════════════════════════════════════════════════
// 📦 USPS Web Tools API (FREE)
// ═══════════════════════════════════════════════════════════════════════════
// Registration: https://www.usps.com/business/web-tools-apis/
// Completely free, just need to register

/**
 * Track package via USPS Web Tools API
 */
export async function trackUSPS(trackingNumber: string): Promise<TrackingStatus | null> {
  const config = await getCarrierConfig('USPS');
  if (!config?.enabled || !config.userId) {
    console.log('USPS API not configured');
    return null;
  }

  try {
    // USPS uses XML API
    const xml = `
      <TrackRequest USERID="${config.userId}">
        <TrackID ID="${trackingNumber}"></TrackID>
      </TrackRequest>
    `;

    const response = await fetch(
      `https://secure.shippingapis.com/ShippingAPI.dll?API=TrackV2&XML=${encodeURIComponent(xml)}`
    );

    if (!response.ok) {
      throw new Error(`USPS API error: ${response.status}`);
    }

    const xmlText = await response.text();
    const parsed = parseUSPSResponse(xmlText, trackingNumber);

    return parsed;
  } catch (error) {
    console.error('USPS tracking error:', error);
    return null;
  }
}

function parseUSPSResponse(xmlText: string, trackingNumber: string): TrackingStatus {
  // Simple XML parsing for USPS response
  const events: TrackingEvent[] = [];

  // Extract TrackDetail elements
  const detailMatches = xmlText.matchAll(/<TrackDetail>(.*?)<\/TrackDetail>/gs);
  for (const match of detailMatches) {
    const detail = match[1];
    const eventDate = extractXMLTag(detail, 'EventDate');
    const eventTime = extractXMLTag(detail, 'EventTime');
    const eventCity = extractXMLTag(detail, 'EventCity');
    const eventState = extractXMLTag(detail, 'EventState');
    const event = extractXMLTag(detail, 'Event');

    if (event) {
      events.push({
        timestamp: `${eventDate} ${eventTime}`,
        status: event,
        description: event,
        city: eventCity,
        state: eventState,
        location: eventCity && eventState ? `${eventCity}, ${eventState}` : undefined,
      });
    }
  }

  // Extract summary
  const summary = extractXMLTag(xmlText, 'TrackSummary');
  const statusDesc = extractXMLTag(xmlText, 'Status');
  const expectedDate = extractXMLTag(xmlText, 'ExpectedDeliveryDate');

  // Determine status
  let status: TrackingStatus['status'] = 'unknown';
  const summaryLower = (summary || '').toLowerCase();
  if (summaryLower.includes('delivered')) status = 'delivered';
  else if (summaryLower.includes('out for delivery')) status = 'out_for_delivery';
  else if (summaryLower.includes('in transit') || summaryLower.includes('arrived') || summaryLower.includes('departed')) status = 'in_transit';
  else if (summaryLower.includes('exception') || summaryLower.includes('alert')) status = 'exception';
  else if (events.length > 0) status = 'in_transit';

  return {
    carrier: 'USPS',
    trackingNumber,
    status,
    statusDescription: summary || statusDesc || 'Status unavailable',
    estimatedDelivery: expectedDate,
    events,
    source: 'carrier_api',
    confidence: 0.95,
    lastUpdate: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📦 UPS Tracking API (FREE tier)
// ═══════════════════════════════════════════════════════════════════════════
// Registration: https://developer.ups.com/
// Free tier: 500 requests/month

/**
 * Track package via UPS API
 */
export async function trackUPS(trackingNumber: string): Promise<TrackingStatus | null> {
  const config = await getCarrierConfig('UPS');
  if (!config?.enabled || !config.apiKey) {
    console.log('UPS API not configured');
    return null;
  }

  try {
    // UPS OAuth2 token (would need to be cached)
    const tokenResponse = await fetch('https://onlinetools.ups.com/security/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${config.apiKey}:${config.userId}`)}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get UPS token');
    }

    const { access_token } = await tokenResponse.json();

    // Track package
    const trackResponse = await fetch(
      `https://onlinetools.ups.com/api/track/v1/details/${trackingNumber}`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'transId': `track-${Date.now()}`,
          'transactionSrc': 'murp-tracking',
        },
      }
    );

    if (!trackResponse.ok) {
      throw new Error(`UPS API error: ${trackResponse.status}`);
    }

    const data = await trackResponse.json();
    return parseUPSResponse(data, trackingNumber);
  } catch (error) {
    console.error('UPS tracking error:', error);
    return null;
  }
}

function parseUPSResponse(data: any, trackingNumber: string): TrackingStatus {
  const pkg = data?.trackResponse?.shipment?.[0]?.package?.[0];
  if (!pkg) {
    return {
      carrier: 'UPS',
      trackingNumber,
      status: 'unknown',
      statusDescription: 'Package not found',
      events: [],
      source: 'carrier_api',
      confidence: 0.5,
    };
  }

  const activity = pkg.activity || [];
  const events: TrackingEvent[] = activity.map((act: any) => ({
    timestamp: `${act.date} ${act.time}`,
    status: act.status?.type || '',
    description: act.status?.description || '',
    city: act.location?.address?.city,
    state: act.location?.address?.stateProvince,
    country: act.location?.address?.country,
    location: act.location?.address?.city
      ? `${act.location.address.city}, ${act.location.address.stateProvince}`
      : undefined,
  }));

  const currentStatus = pkg.currentStatus?.type || '';
  let status: TrackingStatus['status'] = 'unknown';
  if (currentStatus === 'D') status = 'delivered';
  else if (currentStatus === 'O') status = 'out_for_delivery';
  else if (currentStatus === 'I') status = 'in_transit';
  else if (currentStatus === 'X') status = 'exception';
  else if (currentStatus === 'P') status = 'pending';

  return {
    carrier: 'UPS',
    trackingNumber,
    status,
    statusDescription: pkg.currentStatus?.description || 'Status unavailable',
    estimatedDelivery: pkg.deliveryDate?.[0]?.date,
    actualDelivery: status === 'delivered' ? events[0]?.timestamp : undefined,
    lastLocation: events[0]?.location,
    lastUpdate: new Date().toISOString(),
    events,
    source: 'carrier_api',
    confidence: 0.95,
    rawResponse: data,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📦 FedEx Track API (FREE tier)
// ═══════════════════════════════════════════════════════════════════════════
// Registration: https://developer.fedex.com/
// Free tier: 5000 requests/month for tracking

/**
 * Track package via FedEx API
 */
export async function trackFedEx(trackingNumber: string): Promise<TrackingStatus | null> {
  const config = await getCarrierConfig('FedEx');
  if (!config?.enabled || !config.apiKey) {
    console.log('FedEx API not configured');
    return null;
  }

  try {
    // FedEx OAuth2 token
    const tokenResponse = await fetch('https://apis.fedex.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.apiKey,
        client_secret: config.userId || '',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get FedEx token');
    }

    const { access_token } = await tokenResponse.json();

    // Track package
    const trackResponse = await fetch('https://apis.fedex.com/track/v1/trackingnumbers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
        'X-locale': 'en_US',
      },
      body: JSON.stringify({
        includeDetailedScans: true,
        trackingInfo: [{
          trackingNumberInfo: {
            trackingNumber,
          },
        }],
      }),
    });

    if (!trackResponse.ok) {
      throw new Error(`FedEx API error: ${trackResponse.status}`);
    }

    const data = await trackResponse.json();
    return parseFedExResponse(data, trackingNumber);
  } catch (error) {
    console.error('FedEx tracking error:', error);
    return null;
  }
}

function parseFedExResponse(data: any, trackingNumber: string): TrackingStatus {
  const result = data?.output?.completeTrackResults?.[0]?.trackResults?.[0];
  if (!result) {
    return {
      carrier: 'FedEx',
      trackingNumber,
      status: 'unknown',
      statusDescription: 'Package not found',
      events: [],
      source: 'carrier_api',
      confidence: 0.5,
    };
  }

  const scanEvents = result.scanEvents || [];
  const events: TrackingEvent[] = scanEvents.map((evt: any) => ({
    timestamp: evt.date,
    status: evt.eventType || '',
    description: evt.eventDescription || '',
    city: evt.scanLocation?.city,
    state: evt.scanLocation?.stateOrProvinceCode,
    country: evt.scanLocation?.countryCode,
    location: evt.scanLocation?.city
      ? `${evt.scanLocation.city}, ${evt.scanLocation.stateOrProvinceCode}`
      : undefined,
  }));

  const latestStatus = result.latestStatusDetail;
  let status: TrackingStatus['status'] = 'unknown';
  const statusCode = latestStatus?.code || '';
  if (statusCode === 'DL') status = 'delivered';
  else if (statusCode === 'OD') status = 'out_for_delivery';
  else if (['IT', 'IX', 'AR', 'DP'].includes(statusCode)) status = 'in_transit';
  else if (['DE', 'SE', 'CA'].includes(statusCode)) status = 'exception';
  else if (statusCode === 'PU') status = 'pending';

  return {
    carrier: 'FedEx',
    trackingNumber,
    status,
    statusDescription: latestStatus?.description || 'Status unavailable',
    estimatedDelivery: result.dateAndTimes?.find((d: any) => d.type === 'ESTIMATED_DELIVERY')?.dateTime,
    actualDelivery: result.dateAndTimes?.find((d: any) => d.type === 'ACTUAL_DELIVERY')?.dateTime,
    lastLocation: events[0]?.location,
    lastUpdate: new Date().toISOString(),
    events,
    source: 'carrier_api',
    confidence: 0.95,
    rawResponse: data,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 Unified Tracking Interface
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Track a package using the best available method
 */
export async function trackPackage(
  trackingNumber: string,
  carrierHint?: Carrier
): Promise<TrackingStatus> {
  // Detect carrier if not provided
  const detection = detectCarrier(trackingNumber);
  const carrier = carrierHint || detection.carrier;

  // Try carrier-specific API first
  let result: TrackingStatus | null = null;

  switch (carrier) {
    case 'USPS':
      result = await trackUSPS(trackingNumber);
      break;
    case 'UPS':
      result = await trackUPS(trackingNumber);
      break;
    case 'FedEx':
      result = await trackFedEx(trackingNumber);
      break;
    // DHL would require enterprise API access
  }

  // If still no result, return unknown status
  if (!result) {
    return {
      carrier,
      trackingNumber,
      status: 'unknown',
      statusDescription: 'Unable to retrieve tracking information',
      events: [],
      source: 'carrier_api',
      confidence: detection.confidence,
    };
  }

  // Store tracking result in database
  await storeTrackingResult(result);

  return result;
}

/**
 * Track multiple packages in batch
 */
export async function trackPackages(
  trackingNumbers: Array<{ trackingNumber: string; carrier?: Carrier }>
): Promise<Map<string, TrackingStatus>> {
  const results = new Map<string, TrackingStatus>();

  // Process in parallel with rate limiting
  const batchSize = 5;
  for (let i = 0; i < trackingNumbers.length; i += batchSize) {
    const batch = trackingNumbers.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(({ trackingNumber, carrier }) => trackPackage(trackingNumber, carrier))
    );

    batchResults.forEach((result, idx) => {
      results.set(batch[idx].trackingNumber, result);
    });

    // Rate limit delay
    if (i + batchSize < trackingNumbers.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// 💾 Database Integration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get carrier API configuration from database
 */
async function getCarrierConfig(carrier: Carrier): Promise<CarrierConfig | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', `carrier_api_${carrier.toLowerCase()}`)
    .maybeSingle();

  if (error || !data) return null;
  return data.setting_value as CarrierConfig;
}

/**
 * Store tracking result in database
 */
async function storeTrackingResult(result: TrackingStatus): Promise<void> {
  try {
    // Update any associated shipments
    const { data: shipments } = await supabase
      .from('po_shipment_data')
      .select('id')
      .contains('tracking_numbers', [result.trackingNumber]);

    if (shipments && shipments.length > 0) {
      for (const shipment of shipments) {
        await supabase.from('shipment_tracking_events').insert({
          shipment_id: shipment.id,
          event_type: 'status_update',
          status: result.status,
          description: result.statusDescription,
          carrier: result.carrier,
          tracking_number: result.trackingNumber,
          carrier_location: result.lastLocation,
          carrier_timestamp: result.lastUpdate,
          source: result.source,
          raw_data: result.rawResponse,
          created_at: new Date().toISOString(),
        });

        // Update shipment status
        await supabase.from('po_shipment_data').update({
          status: result.status,
          carrier: result.carrier,
          updated_at: new Date().toISOString(),
          ...(result.estimatedDelivery && { estimated_delivery_date: result.estimatedDelivery }),
          ...(result.actualDelivery && { actual_delivery_date: result.actualDelivery }),
        }).eq('id', shipment.id);
      }
    }

    // Also store in tracking_cache for future lookups
    await supabase.from('tracking_cache').upsert({
      tracking_number: result.trackingNumber,
      carrier: result.carrier,
      status: result.status,
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
  } catch (error) {
    console.error('Failed to store tracking result:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

function extractXMLTag(xml: string, tagName: string): string | undefined {
  const match = xml.match(new RegExp(`<${tagName}>(.*?)</${tagName}>`, 's'));
  return match?.[1]?.trim();
}

/**
 * Validate tracking number format
 */
export function isValidTrackingNumber(trackingNumber: string): boolean {
  const detection = detectCarrier(trackingNumber);
  return detection.confidence > 0.5;
}

/**
 * Get tracking URL for carrier
 */
export function getCarrierTrackingUrl(trackingNumber: string, carrier: Carrier): string {
  const urls: Record<Carrier, string> = {
    UPS: `https://www.ups.com/track?tracknum=${trackingNumber}`,
    FedEx: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    USPS: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    DHL: `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
    OnTrac: `https://www.ontrac.com/tracking/?number=${trackingNumber}`,
    LSO: `https://www.lso.com/track/${trackingNumber}`,
    Unknown: '',
  };
  return urls[carrier];
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 Exports
// ═══════════════════════════════════════════════════════════════════════════

export default {
  // Detection
  detectCarrier,
  extractTrackingNumbers,
  isValidTrackingNumber,
  getCarrierTrackingUrl,

  // Tracking
  trackPackage,
  trackPackages,
  trackUSPS,
  trackUPS,
  trackFedEx,

  // Patterns
  TRACKING_PATTERNS,
  CARRIER_EMAIL_DOMAINS,
};
