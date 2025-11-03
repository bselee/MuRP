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
  const reportUrl = process.env.FINALE_VENDORS_REPORT_URL;
  if (!reportUrl) {
    throw new Error('FINALE_VENDORS_REPORT_URL not configured');
  }
  
  console.log(`[Finale Proxy] Report URL configured: ${reportUrl.substring(0, 80)}...`);
  
  // Fetch the CSV report with Basic Auth
  const authHeader = createAuthHeader(config.apiKey, config.apiSecret);
  const response = await fetch(reportUrl, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
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
  console.log(`[Finale Proxy] Parsed ${rawSuppliers.length} suppliers from CSV`);
  
  // Transform CSV format to expected API format
  // Map common CSV column names to expected fields
  const suppliers = rawSuppliers.map((row: any) => ({
    partyId: row['Party Id'] || row['partyId'] || row['ID'] || row['id'] || '',
    name: row['Name'] || row['name'] || row['Organization Name'] || '',
    email: row['Email'] || row['email'] || row['Primary Email'] || '',
    phone: row['Phone'] || row['phone'] || row['Primary Phone'] || '',
    address: row['Address'] || row['address'] || '',
    addressLine1: row['Address Line 1'] || row['addressLine1'] || '',
    city: row['City'] || row['city'] || '',
    state: row['State'] || row['state'] || row['State/Province'] || '',
    zip: row['Zip'] || row['zip'] || row['Postal Code'] || '',
    country: row['Country'] || row['country'] || '',
    website: row['Website'] || row['website'] || '',
    leadTimeDays: parseInt(row['Lead Time'] || row['leadTimeDays'] || '7', 10),
    // Keep original row for debugging
    _rawRow: row,
  }));
  
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
