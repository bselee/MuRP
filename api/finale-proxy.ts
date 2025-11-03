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
 * Get suppliers (vendors)
 * Try multiple endpoint variations since /partyGroup returns 404
 */
async function getSuppliers(config: FinaleConfig) {
  const endpoints = [
    '/party?role=SUPPLIER',           // Try singular form
    '/partyGroup?role=SUPPLIER',      // Original attempt
    '/organization?role=SUPPLIER',     // Alternative naming
    '/supplier',                       // Direct supplier endpoint
    '/vendors',                        // Alternative plural
  ];

  let lastError: Error | null = null;
  
  // Try each endpoint until one works
  for (const endpoint of endpoints) {
    try {
      console.log(`[Finale Proxy] Trying supplier endpoint: ${endpoint}`);
      return await finaleGet(config, endpoint);
    } catch (error) {
      lastError = error as Error;
      console.log(`[Finale Proxy] Endpoint ${endpoint} failed:`, error instanceof Error ? error.message : String(error));
      continue;
    }
  }
  
  // If all endpoints fail, throw the last error
  throw new Error(`All supplier endpoints failed. Last error: ${lastError?.message || 'Unknown'}`);
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
