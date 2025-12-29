/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ENHANCED EMAIL TRACKING SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Advanced email parsing for tracking extraction with high accuracy.
 * Designed to reduce dependency on paid tracking APIs by extracting
 * maximum information from vendor emails.
 *
 * Features:
 * - Multi-carrier tracking number extraction
 * - ETA/delivery date parsing (multiple formats)
 * - Shipment confirmation detection
 * - Backorder/delay detection
 * - Invoice amount extraction
 * - PO reference correlation
 * - Carrier auto-detection from email domain
 *
 * @module services/enhancedEmailTrackingService
 */

import {
  detectCarrier,
  extractTrackingNumbers,
  CARRIER_EMAIL_DOMAINS,
  type Carrier,
} from './directCarrierTrackingService';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ExtractedShipmentInfo {
  trackingNumbers: Array<{
    number: string;
    carrier: Carrier;
    confidence: number;
  }>;
  estimatedDelivery?: {
    date: string;
    confidence: number;
    source: 'explicit' | 'inferred';
  };
  shipDate?: {
    date: string;
    confidence: number;
  };
  carrierHint?: Carrier;
  isShipmentNotification: boolean;
  isDeliveryConfirmation: boolean;
  isDelayNotification: boolean;
  isBackorderNotification: boolean;
  poReferences: string[];
  invoiceAmount?: number;
  itemsShipped?: Array<{
    description: string;
    quantity?: number;
    sku?: string;
  }>;
  rawExtractions: {
    dates: string[];
    amounts: string[];
    references: string[];
  };
}

export interface EmailParseContext {
  subject: string;
  body: string;
  senderEmail: string;
  senderDomain?: string;
  receivedDate?: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📧 Email Classification Patterns
// ═══════════════════════════════════════════════════════════════════════════

const EMAIL_TYPE_PATTERNS = {
  shipmentNotification: [
    /your\s+(?:order|package|shipment)\s+(?:has\s+)?(?:been\s+)?(?:shipped|dispatched|sent)/i,
    /(?:order|shipment)\s+(?:confirmation|notification)/i,
    /(?:tracking\s+(?:number|info|details|#))/i,
    /(?:shipped|dispatched)\s+(?:via|by|using)/i,
    /(?:has\s+left|departed)\s+(?:our\s+)?(?:warehouse|facility)/i,
    /(?:ship(?:ping|ped)\s+)?confirm(?:ation|ed)/i,
    /your\s+items?\s+(?:is|are)\s+on\s+(?:the|its)\s+way/i,
  ],
  deliveryConfirmation: [
    /(?:has\s+been|was)\s+delivered/i,
    /delivery\s+confirm(?:ed|ation)/i,
    /(?:signed\s+for|left\s+at)/i,
    /package\s+(?:arrived|received)/i,
    /(?:delivered\s+to|left\s+with)/i,
  ],
  delayNotification: [
    /(?:delay(?:ed)?|postponed?|later\s+than)/i,
    /(?:shipping|delivery)\s+(?:delay|issue|problem)/i,
    /(?:revised|updated|new)\s+(?:delivery|ship)\s+date/i,
    /(?:unable\s+to|cannot)\s+(?:ship|deliver)/i,
    /(?:out\s+of\s+stock|backorder(?:ed)?)/i,
    /(?:expected|estimated)\s+(?:delay|wait)/i,
  ],
  backorderNotification: [
    /backorder(?:ed)?/i,
    /(?:out\s+of\s+stock|not\s+in\s+stock)/i,
    /(?:currently\s+unavailable|temporarily\s+unavailable)/i,
    /(?:will\s+(?:ship|be\s+available)\s+(?:when|once))/i,
    /(?:partial\s+shipment|split\s+shipment)/i,
  ],
  invoiceEmail: [
    /invoice\s*(?:#|number|no\.?)?/i,
    /(?:payment\s+)?(?:due|amount\s+due)/i,
    /(?:attached|enclosed)\s+invoice/i,
    /(?:billing|statement)/i,
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// 📅 Date Extraction Patterns
// ═══════════════════════════════════════════════════════════════════════════

const DATE_PATTERNS = {
  // US format: MM/DD/YYYY or MM-DD-YYYY
  usFormat: /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g,

  // ISO format: YYYY-MM-DD
  isoFormat: /\b(\d{4})-(\d{2})-(\d{2})\b/g,

  // Written format: January 15, 2024 or Jan 15 2024
  writtenFormat: /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/gi,

  // Written format: 15 January 2024
  europeanWritten: /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:,?\s+(\d{4}))?\b/gi,

  // Day of week: Monday, January 15
  dayOfWeek: /\b(Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?),?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/gi,

  // Relative dates: tomorrow, next Monday, in 3 days
  relative: /\b(tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)|in\s+(\d+)\s+(?:day|business\s+day)s?)\b/gi,
};

const DELIVERY_DATE_CONTEXT = [
  /(?:deliver(?:y|ed)?|arriv(?:e|al|ing)|expected|estimated|eta|due).*?DATE/i,
  /DATE.*?(?:deliver(?:y|ed)?|arriv(?:e|al|ing))/i,
  /(?:by|on|before)\s+DATE/i,
  /DATE.*?(?:is\s+)?(?:expected|estimated|scheduled)/i,
];

const SHIP_DATE_CONTEXT = [
  /(?:ship(?:ped|s|ping)?|sent|dispatch(?:ed)?|left).*?DATE/i,
  /DATE.*?(?:ship(?:ped|s|ping)?|sent|dispatch(?:ed)?)/i,
];

// ═══════════════════════════════════════════════════════════════════════════
// 💰 Amount Extraction Patterns
// ═══════════════════════════════════════════════════════════════════════════

const AMOUNT_PATTERNS = {
  // $1,234.56 or $1234.56
  usDollar: /\$\s?[\d,]+\.?\d*/g,

  // 1,234.56 USD
  currencyCode: /[\d,]+\.?\d*\s*(?:USD|CAD|EUR|GBP)/gi,

  // Total/Amount/Due followed by number
  labeledAmount: /(?:total|amount|due|subtotal|grand\s+total|invoice\s+total)[:\s]*\$?\s*([\d,]+\.?\d*)/gi,
};

// ═══════════════════════════════════════════════════════════════════════════
// 📋 PO Reference Patterns
// ═══════════════════════════════════════════════════════════════════════════

const PO_REFERENCE_PATTERNS = [
  /(?:P\.?O\.?|Purchase\s+Order|Order)[\s#:]*([A-Z0-9\-]{4,20})/gi,
  /(?:Ref(?:erence)?|Order)[\s#:]*([A-Z0-9\-]{4,20})/gi,
  /(?:PO|SO|INV)[\-#]?(\d{4,12})/gi,
  /(?:Your\s+)?(?:order|reference)[\s#:]+([A-Z0-9\-]{4,20})/gi,
];

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 Core Extraction Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract all shipment-related information from an email
 */
export function extractShipmentInfo(context: EmailParseContext): ExtractedShipmentInfo {
  const { subject, body, senderEmail } = context;
  const fullText = `${subject}\n${body}`;
  const senderDomain = senderEmail.split('@')[1]?.toLowerCase();

  // Initialize result
  const result: ExtractedShipmentInfo = {
    trackingNumbers: [],
    isShipmentNotification: false,
    isDeliveryConfirmation: false,
    isDelayNotification: false,
    isBackorderNotification: false,
    poReferences: [],
    rawExtractions: {
      dates: [],
      amounts: [],
      references: [],
    },
  };

  // Detect carrier from email domain
  if (senderDomain && CARRIER_EMAIL_DOMAINS[senderDomain]) {
    result.carrierHint = CARRIER_EMAIL_DOMAINS[senderDomain];
  }

  // Extract tracking numbers using enhanced patterns
  const trackingResults = extractTrackingNumbers(fullText);
  result.trackingNumbers = trackingResults.map(t => ({
    number: t.trackingNumber,
    carrier: t.carrier,
    confidence: t.confidence,
  }));

  // If we have a carrier hint but no tracking matched to it, boost confidence
  if (result.carrierHint && result.trackingNumbers.length > 0) {
    result.trackingNumbers = result.trackingNumbers.map(t => ({
      ...t,
      carrier: t.carrier === 'Unknown' ? result.carrierHint! : t.carrier,
      confidence: t.carrier === result.carrierHint ? Math.min(t.confidence + 0.1, 1.0) : t.confidence,
    }));
  }

  // Classify email type
  result.isShipmentNotification = EMAIL_TYPE_PATTERNS.shipmentNotification.some(p => p.test(fullText));
  result.isDeliveryConfirmation = EMAIL_TYPE_PATTERNS.deliveryConfirmation.some(p => p.test(fullText));
  result.isDelayNotification = EMAIL_TYPE_PATTERNS.delayNotification.some(p => p.test(fullText));
  result.isBackorderNotification = EMAIL_TYPE_PATTERNS.backorderNotification.some(p => p.test(fullText));

  // Extract dates
  const dates = extractDates(fullText);
  result.rawExtractions.dates = dates;

  // Determine delivery date with context
  const deliveryDate = findDateWithContext(fullText, dates, DELIVERY_DATE_CONTEXT);
  if (deliveryDate) {
    result.estimatedDelivery = {
      date: deliveryDate.date,
      confidence: deliveryDate.confidence,
      source: deliveryDate.hasContext ? 'explicit' : 'inferred',
    };
  }

  // Determine ship date with context
  const shipDate = findDateWithContext(fullText, dates, SHIP_DATE_CONTEXT);
  if (shipDate) {
    result.shipDate = {
      date: shipDate.date,
      confidence: shipDate.confidence,
    };
  }

  // Extract amounts
  const amounts = extractAmounts(fullText);
  result.rawExtractions.amounts = amounts;
  if (amounts.length > 0) {
    // Take the largest amount as the invoice total
    const numericAmounts = amounts.map(a => parseFloat(a.replace(/[$,]/g, '')));
    const maxAmount = Math.max(...numericAmounts);
    if (maxAmount > 0) {
      result.invoiceAmount = maxAmount;
    }
  }

  // Extract PO references
  result.poReferences = extractPOReferences(fullText);
  result.rawExtractions.references = result.poReferences;

  // Extract item details (simple pattern)
  result.itemsShipped = extractItemDetails(body);

  return result;
}

/**
 * Extract all dates from text
 */
function extractDates(text: string): string[] {
  const dates: string[] = [];
  const seen = new Set<string>();

  // US format
  for (const match of text.matchAll(DATE_PATTERNS.usFormat)) {
    const normalized = normalizeDate(match[0]);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      dates.push(normalized);
    }
  }

  // ISO format
  for (const match of text.matchAll(DATE_PATTERNS.isoFormat)) {
    const normalized = match[0];
    if (!seen.has(normalized)) {
      seen.add(normalized);
      dates.push(normalized);
    }
  }

  // Written format
  for (const match of text.matchAll(DATE_PATTERNS.writtenFormat)) {
    const normalized = parseWrittenDate(match[1], match[2], match[3]);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      dates.push(normalized);
    }
  }

  // European written format
  for (const match of text.matchAll(DATE_PATTERNS.europeanWritten)) {
    const normalized = parseWrittenDate(match[2], match[1], match[3]);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      dates.push(normalized);
    }
  }

  return dates;
}

/**
 * Find a date that appears in a specific context
 */
function findDateWithContext(
  text: string,
  dates: string[],
  contextPatterns: RegExp[]
): { date: string; confidence: number; hasContext: boolean } | null {
  if (dates.length === 0) return null;

  // Check each date against context patterns
  for (const date of dates) {
    for (const pattern of contextPatterns) {
      const contextRegex = new RegExp(pattern.source.replace('DATE', date), 'i');
      if (contextRegex.test(text)) {
        return { date, confidence: 0.9, hasContext: true };
      }
    }
  }

  // If no context match, return first future date with lower confidence
  const today = new Date();
  for (const date of dates) {
    try {
      const parsed = new Date(date);
      if (parsed > today) {
        return { date, confidence: 0.5, hasContext: false };
      }
    } catch {
      continue;
    }
  }

  // Return first date as last resort
  return { date: dates[0], confidence: 0.3, hasContext: false };
}

/**
 * Extract amounts from text
 */
function extractAmounts(text: string): string[] {
  const amounts: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(AMOUNT_PATTERNS.usDollar)) {
    const amount = match[0];
    if (!seen.has(amount)) {
      seen.add(amount);
      amounts.push(amount);
    }
  }

  for (const match of text.matchAll(AMOUNT_PATTERNS.labeledAmount)) {
    const amount = `$${match[1]}`;
    if (!seen.has(amount)) {
      seen.add(amount);
      amounts.push(amount);
    }
  }

  return amounts;
}

/**
 * Extract PO references from text
 */
function extractPOReferences(text: string): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();

  for (const pattern of PO_REFERENCE_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern))) {
      const ref = match[1].toUpperCase();
      if (!seen.has(ref) && ref.length >= 4) {
        seen.add(ref);
        refs.push(ref);
      }
    }
  }

  return refs;
}

/**
 * Extract item details from email body (simplified)
 */
function extractItemDetails(body: string): Array<{ description: string; quantity?: number; sku?: string }> {
  const items: Array<{ description: string; quantity?: number; sku?: string }> = [];

  // Pattern: Qty X - Description or (X) Description
  const qtyPattern = /(?:qty\s*:?\s*)?(\d+)\s*(?:x|×|-|–)\s*([^\n\r]{5,50})/gi;
  for (const match of body.matchAll(qtyPattern)) {
    items.push({
      description: match[2].trim(),
      quantity: parseInt(match[1]),
    });
  }

  // Pattern: SKU: ABC123 - Description
  const skuPattern = /(?:sku|item|part)[\s#:]*([A-Z0-9\-]{4,20})[\s\-:]+([^\n\r]{5,50})/gi;
  for (const match of body.matchAll(skuPattern)) {
    items.push({
      description: match[2].trim(),
      sku: match[1].toUpperCase(),
    });
  }

  return items;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function normalizeDate(dateStr: string): string | null {
  try {
    // Handle MM/DD/YYYY or MM-DD-YYYY
    const parts = dateStr.split(/[\/\-]/);
    if (parts.length === 3) {
      let [month, day, year] = parts.map(p => parseInt(p));
      if (year < 100) year += 2000;
      const date = new Date(year, month - 1, day);
      return date.toISOString().split('T')[0];
    }
    return null;
  } catch {
    return null;
  }
}

function parseWrittenDate(monthStr: string, dayStr: string, yearStr?: string): string | null {
  try {
    const monthLower = monthStr.toLowerCase().replace(/\.$/, '');
    const month = MONTH_MAP[monthLower];
    if (month === undefined) return null;

    const day = parseInt(dayStr);
    let year = yearStr ? parseInt(yearStr) : new Date().getFullYear();
    if (year < 100) year += 2000;

    const date = new Date(year, month, day);
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

/**
 * Check if email appears to be from a shipping carrier
 */
export function isCarrierEmail(senderEmail: string): boolean {
  const domain = senderEmail.split('@')[1]?.toLowerCase();
  return !!domain && !!CARRIER_EMAIL_DOMAINS[domain];
}

/**
 * Get carrier from email sender domain
 */
export function getCarrierFromEmail(senderEmail: string): Carrier | null {
  const domain = senderEmail.split('@')[1]?.toLowerCase();
  return domain ? CARRIER_EMAIL_DOMAINS[domain] || null : null;
}

/**
 * Score the quality of extracted tracking info
 */
export function scoreExtractionQuality(info: ExtractedShipmentInfo): number {
  let score = 0;

  // Has tracking number with high confidence
  if (info.trackingNumbers.length > 0) {
    score += 0.4 * Math.max(...info.trackingNumbers.map(t => t.confidence));
  }

  // Has delivery date
  if (info.estimatedDelivery) {
    score += 0.2 * info.estimatedDelivery.confidence;
  }

  // Has PO reference
  if (info.poReferences.length > 0) {
    score += 0.2;
  }

  // Is classified as shipment notification
  if (info.isShipmentNotification) {
    score += 0.1;
  }

  // Has carrier hint
  if (info.carrierHint) {
    score += 0.1;
  }

  return Math.min(score, 1.0);
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 Exports
// ═══════════════════════════════════════════════════════════════════════════

export default {
  extractShipmentInfo,
  isCarrierEmail,
  getCarrierFromEmail,
  scoreExtractionQuality,
  extractDates,
  extractAmounts,
  extractPOReferences,
};
