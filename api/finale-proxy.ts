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
  
  // Filter out rows with empty or invalid Name fields to prevent data shift issues
  // Finale CSV sometimes has rows where Name is blank, causing address data to appear as name
  const validSuppliers = rawSuppliers.filter(supplier => {
    const name = supplier['Name'];
    const isValid = name && 
                    typeof name === 'string' && 
                    name.trim().length > 0 &&
                    !name.trim().startsWith(',') &&  // Not just address data
                    !name.trim().startsWith('.') &&
                    name.trim() !== '--' &&
                    name.trim().toLowerCase() !== 'various';
    
    if (!isValid) {
      console.log(`[Finale Proxy] Skipping row with invalid Name: "${name}" (likely empty in CSV)`);
    }
    return isValid;
  });
  
  console.log(`[Finale Proxy] ${validSuppliers.length} valid suppliers after filtering (removed ${rawSuppliers.length - validSuppliers.length} invalid)`);
  
  if (validSuppliers.length > 0) {
    console.log(`[Finale Proxy] CSV Headers (${Object.keys(validSuppliers[0]).length} columns):`, Object.keys(validSuppliers[0]));
    console.log(`[Finale Proxy] Sample valid supplier:`, {
      Name: validSuppliers[0]['Name'],
      'Email address 0': validSuppliers[0]['Email address 0'],
      'Phone number 0': validSuppliers[0]['Phone number 0'],
    });
  }

  // Return filtered data - transformation will happen in the frontend service
  // This avoids dependency issues in the serverless function
  return validSuppliers;
}

/**
 * Get inventory items from CSV report
 * Returns raw CSV data for frontend transformation
 */
async function getInventory(config: FinaleConfig) {
  const reportUrl = process.env.FINALE_INVENTORY_REPORT_URL;

  console.log(`[Finale Proxy] getInventory() called`);
  console.log(`[Finale Proxy] Environment variable exists: ${!!reportUrl}`);
  console.log(`[Finale Proxy] URL length: ${reportUrl?.length || 0}`);

  if (!reportUrl) {
    throw new Error('FINALE_INVENTORY_REPORT_URL not configured in environment');
  }

  console.log(`[Finale Proxy] Fetching inventory CSV from report...`);
  console.log(`[Finale Proxy] Original URL (first 100 chars): ${reportUrl.substring(0, 100)}...`);

  // Fix URL: Replace pivotTableStream with pivotTable for direct API access
  // Per Finale docs: https://support.finaleinventory.com/hc/en-us/articles/115001687154
  const fixedUrl = reportUrl.replace('/pivotTableStream/', '/pivotTable/');
  console.log(`[Finale Proxy] Fixed URL (first 100 chars): ${fixedUrl.substring(0, 100)}...`);
  console.log(`[Finale Proxy] URL was modified: ${reportUrl !== fixedUrl}`);

  const response = await fetch(fixedUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64')}`,
      'Accept': 'text/csv',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Finale Proxy] Inventory CSV fetch error:`, errorText);
    throw new Error(`Failed to fetch inventory report (${response.status}): ${response.statusText}`);
  }

  const csvText = await response.text();
  console.log(`[Finale Proxy] ✅ Inventory CSV data received: ${csvText.length} characters`);
  console.log(`[Finale Proxy] CSV starts with: ${csvText.substring(0, 100)}`);

  if (csvText.length === 0) {
    console.error(`[Finale Proxy] ⚠️ ERROR: CSV text is EMPTY! Check if report URL is expired or empty.`);
    return [];
  }

  const rawInventory = parseCSV(csvText);
  console.log(`[Finale Proxy] ✅ Parsed ${rawInventory.length} raw rows from CSV`);
  console.log(`[Finale Proxy] Parsed ${rawInventory.length} raw inventory items from CSV`);
  
  // Filter out rows with empty SKU or Name (data quality)
  const validInventory = rawInventory.filter(item => {
    const sku = item['SKU'] || item['Code'] || item['sku'];
    const name = item['Name'] || item['Product'] || item['name'];
    const isValid = sku && 
                    typeof sku === 'string' && 
                    sku.trim().length > 0 &&
                    !sku.trim().startsWith(',') &&
                    name &&
                    typeof name === 'string' &&
                    name.trim().length > 0;
    
    if (!isValid) {
      console.log(`[Finale Proxy] Skipping inventory row with invalid SKU/Name: SKU="${sku}", Name="${name}"`);
    }
    return isValid;
  });
  
  console.log(`[Finale Proxy] ${validInventory.length} valid inventory items after filtering (removed ${rawInventory.length - validInventory.length} invalid)`);
  
  if (validInventory.length > 0) {
    const headers = Object.keys(validInventory[0]);
    console.log(`[Finale Proxy] CSV Headers (${headers.length} columns):`, headers);
    console.log(`[Finale Proxy] Sample inventory item (first row):`, validInventory[0]);
  } else if (rawInventory.length > 0) {
    // Show headers even if all rows were filtered out
    console.log(`[Finale Proxy] CSV Headers (${Object.keys(rawInventory[0]).length} columns):`, Object.keys(rawInventory[0]));
    console.log(`[Finale Proxy] All ${rawInventory.length} rows filtered out. Sample row:`, rawInventory[0]);
  }

  // Return filtered data - transformation will happen in the frontend service
  return validInventory;
}

/**
 * Get purchase orders with pagination
 */
async function getPurchaseOrders(config: FinaleConfig, limit = 100, offset = 0) {
  return finaleGet(config, `/purchaseOrder?limit=${limit}&offset=${offset}`);
}

/**
 * Get Bills of Materials from CSV report
 * Returns raw CSV data for frontend transformation
 */
async function getBOMs(config: FinaleConfig) {
  const reportUrl = process.env.FINALE_BOM_REPORT_URL;

  console.log(`[Finale Proxy] getBOMs() called`);
  console.log(`[Finale Proxy] Environment variable exists: ${!!reportUrl}`);
  console.log(`[Finale Proxy] URL length: ${reportUrl?.length || 0}`);

  if (!reportUrl) {
    throw new Error('FINALE_BOM_REPORT_URL not configured in environment');
  }

  console.log(`[Finale Proxy] Fetching BOM CSV from report...`);
  console.log(`[Finale Proxy] Original URL (first 100 chars): ${reportUrl.substring(0, 100)}...`);

  // Fix URL: Replace pivotTableStream with pivotTable for direct API access
  // Per Finale docs: https://support.finaleinventory.com/hc/en-us/articles/115001687154
  const fixedUrl = reportUrl.replace('/pivotTableStream/', '/pivotTable/');
  console.log(`[Finale Proxy] Fixed URL (first 100 chars): ${fixedUrl.substring(0, 100)}...`);
  console.log(`[Finale Proxy] URL was modified: ${reportUrl !== fixedUrl}`);

  const response = await fetch(fixedUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64')}`,
      'Accept': 'text/csv',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Finale Proxy] BOM CSV fetch error:`, errorText);
    throw new Error(`Failed to fetch BOM report (${response.status}): ${response.statusText}`);
  }

  const csvText = await response.text();
  console.log(`[Finale Proxy] ✅ BOM CSV data received: ${csvText.length} characters`);
  console.log(`[Finale Proxy] CSV starts with: ${csvText.substring(0, 100)}`);

  if (csvText.length === 0) {
    console.error(`[Finale Proxy] ⚠️ ERROR: BOM CSV text is EMPTY! Check if report URL is expired or empty.`);
    return [];
  }

  const rawBOMs = parseCSV(csvText);
  console.log(`[Finale Proxy] ✅ Parsed ${rawBOMs.length} raw rows from CSV`);
  console.log(`[Finale Proxy] Parsed ${rawBOMs.length} raw BOM rows from CSV`);

  // Filter out rows with empty Product ID or Name (data quality)
  const validBOMs = rawBOMs.filter(item => {
    const productId = item['Product ID'] || item['Finished SKU'] || item['SKU'];
    const name = item['Name'] || item['Product Name'];
    const isValid = productId &&
                    typeof productId === 'string' &&
                    productId.trim().length > 0 &&
                    !productId.trim().startsWith(',') &&
                    name &&
                    typeof name === 'string' &&
                    name.trim().length > 0;

    if (!isValid) {
      console.log(`[Finale Proxy] Skipping BOM row with invalid Product ID/Name: ID="${productId}", Name="${name}"`);
    }
    return isValid;
  });

  console.log(`[Finale Proxy] ${validBOMs.length} valid BOM rows after filtering (removed ${rawBOMs.length - validBOMs.length} invalid)`);

  if (validBOMs.length > 0) {
    console.log(`[Finale Proxy] CSV Headers (${Object.keys(validBOMs[0]).length} columns):`, Object.keys(validBOMs[0]));
    console.log(`[Finale Proxy] Sample BOM row:`, {
      ProductID: validBOMs[0]['Product ID'] || validBOMs[0]['Finished SKU'],
      Name: validBOMs[0]['Name'] || validBOMs[0]['Product Name'],
      Component: validBOMs[0]['Component \n Product ID'] || validBOMs[0]['Component Product ID'],
      BOMQty: validBOMs[0]['BOM \n Quantity'] || validBOMs[0]['BOM Quantity'],
    });
  }

  // Return filtered data - transformation will happen in the frontend service
  return validBOMs;
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

      case 'getInventory':
        result = await getInventory(finaleConfig);
        break;

      case 'getPurchaseOrders':
        result = await getPurchaseOrders(
          finaleConfig,
          params.limit || 100,
          params.offset || 0
        );
        break;

      case 'getBOMs':
        result = await getBOMs(finaleConfig);
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
