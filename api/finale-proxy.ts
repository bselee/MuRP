/**
 * Finale API Proxy
 * 
 * Server-side API route to proxy requests to Finale API.
 * This solves CORS issues and keeps credentials secure.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

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
 * Handles quoted fields with commas
 */
function parseCSV(csvText: string): any[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  // Parse CSV line handling quoted fields
  function parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add last field
    values.push(current.trim());
    
    return values;
  }
  
  const headers = parseCsvLine(lines[0]);
  console.log('[Finale Proxy] CSV Headers:', headers);
  
  const rows: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }
  
  console.log('[Finale Proxy] Sample row:', rows[0]);
  
  return rows;
}

/**
 * Get suppliers from Finale CSV report
 * Uses pre-configured report URL from environment
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
  
  // Skip first row if it has placeholder name
  const validSuppliers = rawSuppliers.filter((row: any, index: number) => {
    const name = row['Name'] || row['name'] || '';
    // Skip rows with placeholder or empty names
    if (name === '--' || name.trim() === '') {
      console.log(`[Finale Proxy] Skipping row ${index} with placeholder name: "${name}"`);
      return false;
    }
    return true;
  });
  
  console.log(`[Finale Proxy] After filtering: ${validSuppliers.length} valid suppliers`);
  
  // Track name usage to deduplicate
  const nameCount = new Map<string, number>();

  // Helpers to robustly read fields and pick first meaningful values
  const isMeaningful = (val?: string) => {
    if (!val) return false;
    const v = String(val).trim();
    if (!v) return false;
    return v.toLowerCase() !== 'various' && v !== '--';
  };

  const getField = (row: any, key: string): string => {
    // Try exact key first, then some normalized variants
    if (row[key] !== undefined) return String(row[key] ?? '').trim();
    const alt = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
    return alt ? String(row[alt] ?? '').trim() : '';
  };

  const pickFirst = (row: any, keys: string[]): string => {
    for (const k of keys) {
      const v = getField(row, k);
      if (isMeaningful(v)) return v;
    }
    return '';
  };

  const pickAddressComponents = (row: any): { addressLine1: string; city: string; state: string; zip: string } => {
    for (let i = 0; i < 4; i++) {
      const addressLine1 = pickFirst(row, [
        `Address ${i} street address`,
        `Address ${i} line 1`,
        `Address ${i} address`,
      ]);
      const city = pickFirst(row, [
        `Address ${i} city`,
      ]);
      const state = pickFirst(row, [
        `Address ${i} state / region`,
        `Address ${i} state/ region`,
        `Address ${i} state/region`,
        `Address ${i} state`,
        `Address ${i} region`,
      ]);
      const zip = pickFirst(row, [
        `Address ${i} postal code`,
        `Address ${i} zip`,
        `Address ${i} zip code`,
        `Address ${i} postcode`,
      ]);

      if (addressLine1 || city || state || zip) {
        return { addressLine1, city, state, zip };
      }
    }
    return { addressLine1: '', city: '', state: '', zip: '' };
  };
  
  // Transform CSV format to expected API format
  // Map Finale CSV report columns to expected fields
  const suppliers = validSuppliers.map((row: any, index: number) => {
    // Get vendor name
    const baseName = getField(row, 'Name') || getField(row, 'name') || 'Unknown Vendor';

    // Deduplicate: if we've seen this name before, append number
    const count = nameCount.get(baseName) || 0;
    nameCount.set(baseName, count + 1);
    const name = count > 0 ? `${baseName} (${count})` : baseName;

    // Create deterministic UUID from name + index to ensure uniqueness
    const uniqueKey = `${name}-${index}`;
    let hash = 0;
    for (let i = 0; i < uniqueKey.length; i++) {
      hash = ((hash << 5) - hash) + uniqueKey.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    const hashHex = Math.abs(hash).toString(16).padStart(8, '0');
    const indexHex = index.toString(16).padStart(4, '0');
    const partyId = `${hashHex}-0000-4000-8000-${indexHex}00000000`.slice(0, 36);

    // Get first non-empty email (0..3)
    const email = pickFirst(row, [
      'Email address 0',
      'Email address 1',
      'Email address 2',
      'Email address 3',
    ]);

    // Get first non-empty phone (0..3)
    const phone = pickFirst(row, [
      'Phone number 0',
      'Phone number 1',
      'Phone number 2',
      'Phone number 3',
    ]);

    // Build address from first available Address {0-3}
    const { addressLine1, city, state, zip } = pickAddressComponents(row);
    const addressParts = [addressLine1, city, state, zip].filter(p => isMeaningful(p));
    const address = addressParts.join(', ');

    return {
      partyId,
      name,
      email,
      phone,
      address,
      addressLine1,
      city,
      state,
      zip,
      country: '', // Not in CSV
      website: '', // Not in CSV
      leadTimeDays: 7, // Default
      notes: getField(row, 'Notes'),
      // Keep original row for debugging
      _rawRow: row,
    };
  });
  
  console.log(`[Finale Proxy] Transformed sample supplier:`, suppliers[0]);
  
  return suppliers;
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
