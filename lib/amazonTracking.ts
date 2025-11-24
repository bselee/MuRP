export type AmazonLinkMetadata = {
  asin?: string;
  marketplace?: string;
  canonicalUrl: string;
  rawUrl: string;
};

export const DEFAULT_AMAZON_TRACKING_EMAIL = 'shipment-tracking@amazon.com';

export const getAmazonTrackingEmail = () => DEFAULT_AMAZON_TRACKING_EMAIL;

const AMAZON_HOST_PATTERN = /amazon\./i;
const ASIN_REGEXES = [
  /\/dp\/([A-Z0-9]{10})/i,
  /\/gp\/product\/([A-Z0-9]{10})/i,
  /\/gp\/aw\/d\/([A-Z0-9]{10})/i,
  /\/gp\/offer-listing\/([A-Z0-9]{10})/i,
  /[?&]asin=([A-Z0-9]{10})/i,
];

/**
 * Extract canonical metadata from an Amazon product URL so requisitions can be matched
 * back to marketplace orders and tracked through fulfillment.
 */
export function extractAmazonMetadata(rawUrl?: string | null): AmazonLinkMetadata | null {
  if (!rawUrl) return null;

  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const normalized = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    const url = new URL(normalized);
    if (!AMAZON_HOST_PATTERN.test(url.hostname)) {
      return null;
    }

    const asin = findAsin(url);
    const marketplace = url.hostname.split('amazon.')[1] ?? 'com';
    const canonicalHost = url.hostname.toLowerCase();
    const canonicalUrl = asin
      ? `https://${canonicalHost}/dp/${asin}`
      : `${url.origin}${url.pathname}`;

    return {
      asin: asin ?? undefined,
      marketplace,
      canonicalUrl,
      rawUrl: normalized,
    };
  } catch (error) {
    console.warn('[amazonTracking] Failed to parse Amazon URL', error);
    return null;
  }
}

const findAsin = (url: URL): string | null => {
  for (const regex of ASIN_REGEXES) {
    const match = url.href.match(regex);
    if (match?.[1]) {
      return match[1].toUpperCase();
    }
  }
  return null;
};
