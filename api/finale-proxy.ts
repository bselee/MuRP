/**
 * Finale API Proxy
 * 
 * Server-side API route to proxy requests to Finale API.
 * This solves CORS issues and keeps credentials secure.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { transformVendorsBatch, deduplicateVendors } from '../lib/schema/transformers';

interface FinaleConfig {
  apiKey: string;
  apiSecret: string;
  accountPath: string;
  baseUrl: string;
}

/**
 * Create Basic Auth header
 */
function createAuthHeader(apiKey: string, apiSecret: string): string {
  const authString = `${apiKey}:${apiSecret}`;
  return `Basic ${Buffer.from(authString).toString('base64')}`;
}

/**
 * Make a GET request to Finale API
 */
async function finaleGet(config: FinaleConfig, endpoint: string) {
  const url = `${config.baseUrl}/${config.accountPath}/api${endpoint}`;
  const authHeader = createAuthHeader(config.apiKey, config.apiSecret);

  console.log(`[Finale Proxy] GET ${url}`);
  console.log(`[Finale Proxy] Endpoint: ${endpoint}`);
  console.log(`[Finale Proxy] Config:`, {
    baseUrl: config.baseUrl,
    accountPath: config.accountPath,
    hasApiKey: !!config.apiKey,
    hasApiSecret: !!config.apiSecret,
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });

  console.log(`[Finale Proxy] Response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Finale Proxy] Error response:`, errorText);
    throw new Error(
      `Finale API error (${response.status}): ${response.statusText}\n${errorText}`
    );
  }

  return response.json();
}

/**
 * Make a GraphQL request to Finale API
 */
async function finaleGraphQL(config: FinaleConfig, query: string, variables?: Record<string, any>) {
  const url = `${config.baseUrl}/${config.accountPath}/api/graphql`;
  const authHeader = createAuthHeader(config.apiKey, config.apiSecret);

  console.log(`[Finale Proxy] GraphQL ${url}`);
  console.log(`[Finale Proxy] Query:`, query.substring(0, 100) + '...');
  if (variables) {
    console.log(`[Finale Proxy] Variables:`, JSON.stringify(variables));
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Connection': 'keep-alive',
    },
    body: JSON.stringify({
      query,
      variables: variables || {},
    }),
  });

  console.log(`[Finale Proxy] GraphQL Response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Finale Proxy] GraphQL Error response:`, errorText);
    throw new Error(
      `Finale GraphQL API error (${response.status}): ${response.statusText}\n${errorText}`
    );
  }

  const result = await response.json();
  
  if (result.errors) {
    console.error(`[Finale Proxy] GraphQL Errors:`, result.errors);
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}

/**
 * Test connection to Finale API
 */
async function testConnection(config: FinaleConfig) {
  try {
    const facilities = await finaleGet(config, '/facility');
    return {
      success: true,
      message: `Successfully connected to Finale. Found ${facilities.length} facility(ies).`,
      facilities,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to connect to Finale API',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get products with pagination
 */
async function getProducts(config: FinaleConfig, limit = 100, offset = 0) {
  return finaleGet(config, `/product?limit=${limit}&offset=${offset}`);
}

/**
 * Parse CSV text to array of objects
 * Robust parsing: handles quoted commas, escaped quotes, CRLF, and quoted newlines.
 * Also auto-detects the header row (searching for a row that contains expected columns).
 */
function parseCSV(csvText: string): any[] {
  if (!csvText || !csvText.trim()) return [];

  // Normalize line endings to \n for consistent processing
  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // First, split the text into logical rows while respecting quotes
  const rowsRaw: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        // Escaped quote
        current += '"';
        i++; // skip next
      } else {
        inQuotes = !inQuotes;
        current += ch; // keep the quote for field parsing stage
      }
    } else if (ch === '\n' && !inQuotes) {
      rowsRaw.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.length) rowsRaw.push(current);

  if (rowsRaw.length === 0) return [];

  // Helper: parse a single CSV row into fields (handle commas and quotes)
  function parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const n = line[i + 1];
      if (c === '"') {
        if (inQ && n === '"') {
          field += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (c === ',' && !inQ) {
        values.push(field.trim());
        field = '';
      } else {
        field += c;
      }
    }
    values.push(field.trim());
    // Strip surrounding quotes from each field
    return values.map(v => v.replace(/^"|"$/g, ''));
  }

  // Detect header row: find the first row that contains "Name" and one of expected columns
  let headerIndex = 0;
  let headers: string[] = [];
  for (let i = 0; i < rowsRaw.length; i++) {
    const cols = parseCsvLine(rowsRaw[i]);
    const hasName = cols.some(c => c.trim().toLowerCase() === 'name');
    const hasExpected = cols.some(c => /email address\s*0|phone number\s*0|address\s*0\s*street\s*address/i.test(c));
    if (hasName && hasExpected) {
      headerIndex = i;
      headers = cols.map(h => h.trim());
      break;
    }
  }

  if (headers.length === 0) {
    // Fallback to first row
    headers = parseCsvLine(rowsRaw[0]).map(h => h.trim());
    headerIndex = 0;
  }

  console.log('[Finale Proxy] CSV Headers:', headers);

  const rows: any[] = [];
  for (let i = headerIndex + 1; i < rowsRaw.length; i++) {
    // Skip empty lines
    if (!rowsRaw[i] || !rowsRaw[i].trim()) continue;
    const values = parseCsvLine(rowsRaw[i]);
    const row: any = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? '';
    });
    rows.push(row);
  }

  if (rows.length > 0) {
    console.log('[Finale Proxy] Sample row:', rows[0]);
  }

  return rows;
}

/**
 * Get suppliers from Finale CSV report
 * Uses pre-configured report URL from environment
 * NOW USING SCHEMA-BASED TRANSFORMERS FOR ROBUST PARSING
 */
async function getSuppliers(config: FinaleConfig) {
  console.log(`[Finale Proxy] Fetching suppliers from CSV report`);

  // Get report URL from environment
  let reportUrl = process.env.FINALE_VENDORS_REPORT_URL;
  if (!reportUrl) {
    throw new Error('FINALE_VENDORS_REPORT_URL not configured');
  }

  // Fix URL: Replace pivotTableStream with pivotTable for direct API access
  // Per Finale docs: https://support.finaleinventory.com/hc/en-us/articles/115001687154
  reportUrl = reportUrl.replace('/pivotTableStream/', '/pivotTable/');

  console.log(`[Finale Proxy] Report URL configured: ${reportUrl.substring(0, 80)}...`);

  // Fetch the CSV report with Basic Auth
  const authHeader = createAuthHeader(config.apiKey, config.apiSecret);
  console.log(`[Finale Proxy] Fetching CSV with auth header`);

  const response = await fetch(reportUrl, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'text/csv, text/plain, */*',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Finale Proxy] CSV fetch error:`, errorText);
    throw new Error(`Failed to fetch vendor report (${response.status}): ${response.statusText}`);
  }

  const csvText = await response.text();
  console.log(`[Finale Proxy] CSV data received: ${csvText.length} characters`);

  const rawSuppliers = parseCSV(csvText);
  console.log(`[Finale Proxy] Parsed ${rawSuppliers.length} raw suppliers from CSV`);
  console.log(`[Finale Proxy] CSV Headers:`, Object.keys(rawSuppliers[0] || {}));

  // Transform all vendors using the new schema-based transformers
  const batchResult = transformVendorsBatch(rawSuppliers);

  console.log(`[Finale Proxy] Transformation results:`, {
    successful: batchResult.successful.length,
    failed: batchResult.failed.length,
    warnings: batchResult.totalWarnings.length,
  });

  // Log failed transformations for debugging
  if (batchResult.failed.length > 0) {
    console.warn(`[Finale Proxy] Failed to transform ${batchResult.failed.length} vendors:`);
    batchResult.failed.slice(0, 5).forEach(failure => {
      console.warn(`  Row ${failure.index + 1}:`, failure.errors.join('; '));
    });
  }

  // Log warnings
  if (batchResult.totalWarnings.length > 0) {
    console.warn(`[Finale Proxy] Transformation warnings (first 10):`,
      batchResult.totalWarnings.slice(0, 10));
  }

  // Deduplicate by name
  const dedupedVendors = deduplicateVendors(batchResult.successful);
  console.log(`[Finale Proxy] After deduplication: ${dedupedVendors.length} unique vendors`);

  // Log sample vendor with all fields
  if (dedupedVendors.length > 0) {
    const sample = dedupedVendors[0];
    console.log(`[Finale Proxy] Sample vendor (with all fields):`, {
      id: sample.id,
      name: sample.name,
      emails: sample.contactEmails,
      phone: sample.phone,
      address: {
        line1: sample.addressLine1,
        city: sample.city,
        state: sample.state,
        zip: sample.postalCode,
        country: sample.country,
        display: sample.addressDisplay,
      },
      website: sample.website,
      leadTime: sample.leadTimeDays,
      notes: sample.notes?.substring(0, 50) || '',
      source: sample.source,
    });
  }

  // Return in the format expected by finaleSyncService (VendorParsed objects)
  return dedupedVendors;
}

/**
 * Get purchase orders with pagination
 */
async function getPurchaseOrders(config: FinaleConfig, limit = 100, offset = 0) {
  return finaleGet(config, `/purchaseOrder?limit=${limit}&offset=${offset}`);
}

/**
 * Main API handler
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Log request for debugging
    console.log('[Finale Proxy] Received request:', {
      method: req.method,
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
    });

    const { action, config, ...params } = req.body || {};

    // Validate config
    if (!config || !config.apiKey || !config.apiSecret || !config.accountPath) {
      console.error('[Finale Proxy] Missing config:', { hasConfig: !!config, config });
      return res.status(400).json({
        error: 'Missing required configuration: apiKey, apiSecret, accountPath',
      });
    }

    // Add default base URL if not provided
    const finaleConfig: FinaleConfig = {
      ...config,
      baseUrl: config.baseUrl || 'https://app.finaleinventory.com',
    };

    // Route to appropriate action
    let result;
    switch (action) {
      case 'testConnection':
        result = await testConnection(finaleConfig);
        break;

      case 'getProducts':
        result = await getProducts(
          finaleConfig,
          params.limit || 100,
          params.offset || 0
        );
        break;

      case 'getSuppliers':
        result = await getSuppliers(finaleConfig);
        break;

      case 'getPurchaseOrders':
        result = await getPurchaseOrders(
          finaleConfig,
          params.limit || 100,
          params.offset || 0
        );
        break;

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('[Finale Proxy] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
