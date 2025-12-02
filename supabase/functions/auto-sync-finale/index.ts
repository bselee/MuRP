/**
 * Supabase Edge Function: Auto-Sync Finale Data
 *
 * Fetches Finale CSV reports with server-side credentials,
 * transforms them into Supabase tables, and updates sync metadata
 * so the UI can display real-time freshness indicators.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SyncType = 'inventory' | 'vendors' | 'boms' | 'purchase_orders';

const SYNC_INTERVALS: Record<SyncType, number> = {
  inventory: 5 * 60 * 1000,
  vendors: 60 * 60 * 1000,
  boms: 60 * 60 * 1000,
  purchase_orders: 15 * 60 * 1000, // 15 minutes for POs
};

interface SyncSummary {
  dataType: SyncType;
  success: boolean;
  skipped?: boolean;
  itemCount: number;
  message: string;
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const syncErrors: string[] = [];
  let requestBody: Record<string, unknown> | null = null;

  try {
    if (req.method !== 'GET') {
      requestBody = await req.json();
    }
  } catch (_error) {
    requestBody = null;
  }

  const forceSync = Boolean(requestBody && typeof requestBody === 'object' ? requestBody['force'] : false);
  const triggerSource = (requestBody && typeof requestBody === 'object' && typeof requestBody['source'] === 'string')
    ? (requestBody['source'] as string)
    : 'auto';

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const finaleApiKey = Deno.env.get('FINALE_API_KEY');
    const finaleApiSecret = Deno.env.get('FINALE_API_SECRET');
    const inventoryReportUrl = Deno.env.get('FINALE_INVENTORY_REPORT_URL');
    const vendorsReportUrl = Deno.env.get('FINALE_VENDORS_REPORT_URL');
    const bomsReportUrl = Deno.env.get('FINALE_BOM_REPORT_URL');

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: 'Server not configured with Supabase credentials' }, 500);
    }

    if (!finaleApiKey || !finaleApiSecret) {
      return jsonResponse({ error: 'Missing Finale API credentials' }, 500);
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized - missing auth header' }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();
    const credentials = { apiKey: finaleApiKey, apiSecret: finaleApiSecret };

    const config: Array<{ type: SyncType; url: string | null; intervalMs: number }> = [
      { type: 'vendors', url: vendorsReportUrl || null, intervalMs: SYNC_INTERVALS.vendors },
      { type: 'inventory', url: inventoryReportUrl || null, intervalMs: SYNC_INTERVALS.inventory },
      { type: 'boms', url: bomsReportUrl || null, intervalMs: SYNC_INTERVALS.boms },
      { type: 'purchase_orders', url: null, intervalMs: SYNC_INTERVALS.purchase_orders }, // Uses API, not CSV
    ];

    const summaries: SyncSummary[] = [];

    for (const entry of config) {
      if (!entry.url) {
        const message = 'Missing Finale report URL';
        syncErrors.push(`${entry.type}: ${message}`);
        summaries.push({
          dataType: entry.type,
          success: false,
          itemCount: 0,
          message,
          error: message,
        });
        continue;
      }

      const metadata = await getSyncMetadata(supabase, entry.type);
      if (!forceSync && !shouldSync(metadata, entry.intervalMs, now)) {
        summaries.push({
          dataType: entry.type,
          success: true,
          skipped: true,
          itemCount: metadata?.item_count || 0,
          message: 'Data is fresh, skipping sync',
        });
        continue;
      }

      try {
        // Create backup before sync for safety
        const backupTable = await createBackupBeforeSync(supabase, entry.type);

        let itemCount = 0;
        switch (entry.type) {
          case 'inventory':
            itemCount = await syncInventoryData({ supabase, url: entry.url, credentials, now });
            break;
          case 'vendors':
            itemCount = await syncVendorData({ supabase, url: entry.url, credentials, now });
            break;
          case 'boms':
            itemCount = await syncBomData({ supabase, url: entry.url, credentials, now });
            break;
          case 'purchase_orders':
            itemCount = await syncPurchaseOrdersData({ supabase, now });
            break;
        }

        // Check for empty data and trigger rollback if needed
        if (itemCount === 0) {
          console.warn(`[${entry.type}] Empty data detected, triggering automatic rollback`);
          await triggerEmptyDataRollback(supabase, entry.type, backupTable);
          throw new Error(`${entry.type} sync returned no data - automatically rolled back to last backup`);
        }

        await updateSyncMetadata(supabase, entry.type, now, itemCount, true);

        // Update connection health status
        const { error: healthError } = await supabase.rpc('update_connection_health_status', {
          p_data_type: entry.type,
          p_status: 'healthy',
          p_item_count: itemCount,
        });
        if (healthError) {
          console.error(`[ConnectionHealth] Failed to update ${entry.type}:`, healthError.message);
        }
        summaries.push({
          dataType: entry.type,
          success: true,
          itemCount,
          message: forceSync ? `Forced sync: ${itemCount} ${entry.type}` : `Synced ${itemCount} ${entry.type}`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Enqueue for retry if it's a recoverable error
        if (isRecoverableError(message)) {
          console.log(`[${entry.type}] Enqueuing recoverable error for retry: ${message}`);
          await enqueueSyncRetry(supabase, entry.type, 'sync', message, {
            forceSync,
            triggerSource,
            credentials: { apiKey: credentials.apiKey, apiSecret: '[REDACTED]' },
            url: entry.url,
            attemptNumber: 1,
            maxRetries: 3,
            backoffMs: 300000, // 5 minutes
          });
        } else {
          console.log(`[${entry.type}] Non-recoverable error, not enqueuing for retry: ${message}`);
        }

        await updateSyncMetadata(supabase, entry.type, now, 0, false);

        // Update connection health status
        const { error: healthError } = await supabase.rpc('update_connection_health_status', {
          p_data_type: entry.type,
          p_status: 'unhealthy',
          p_item_count: 0,
          p_error_message: message,
        });
        if (healthError) {
          console.error(`[ConnectionHealth] Failed to update ${entry.type}:`, healthError.message);
        }
        summaries.push({
          dataType: entry.type,
          success: false,
          itemCount: 0,
          message: 'Sync failed',
          error: message,
        });
      }
    }

    const duration = Date.now() - startTime;
    return jsonResponse({
      success: syncErrors.length === 0,
      duration,
      summaries,
      errors: syncErrors,
      force: forceSync,
      source: triggerSource,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    console.error('[AutoSync] Fatal error:', message);
    return jsonResponse({ success: false, error: message, duration }, 500);
  }
});

interface SyncMetadataRow {
  data_type: SyncType;
  last_sync_time: string | null;
  item_count: number;
  success: boolean;
}

interface Credentials {
  apiKey: string;
  apiSecret: string;
}

async function syncInventoryData(params: {
  supabase: SupabaseClient;
  url: string;
  credentials: Credentials;
  now: Date;
}): Promise<number> {
  console.log('[AutoSync][Inventory] Fetching report...');
  const csvText = await fetchReport('inventory', params.url, params.credentials);
  const rawRows = parseCSV(csvText);
  console.log(`[AutoSync][Inventory] Parsed ${rawRows.length} rows`);

  if (rawRows.length === 0) {
    throw new Error('Inventory CSV returned no rows');
  }

  const vendorMap = await buildVendorMap(params.supabase);
  const inferredVendors = new Map<string, { id: string; name: string }>();
  const nowIso = params.now.toISOString();

  const inventoryItems: Array<Record<string, any>> = [];
  rawRows.forEach((row, index) => {
    const transformed = transformInventoryRow(row, vendorMap, inferredVendors, nowIso, index);
    if (transformed) {
      inventoryItems.push(transformed);
    }
  });

  if (inventoryItems.length === 0) {
    throw new Error('No valid inventory items after transformation');
  }

  if (inferredVendors.size > 0) {
    const inferredPayload = Array.from(inferredVendors.values()).map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      contact_emails: [],
      phone: '',
      address: '',
      website: '',
      lead_time_days: 7,
      data_source: 'manual',
      last_sync_at: nowIso,
      sync_status: 'synced',
      updated_at: nowIso,
      notes: 'Auto-created from inventory sync (vendor not present in vendor report).',
    }));

    console.log(`[AutoSync][Inventory] Inferred ${inferredPayload.length} vendors missing from vendor export`);
    const { error: inferredError } = await params.supabase
      .from('vendors')
      .upsert(inferredPayload, { onConflict: 'id' });
    if (inferredError) {
      console.error('[AutoSync][Inventory] Failed to upsert inferred vendors:', inferredError.message);
    }
  }

  await batchUpsert(params.supabase, 'inventory_items', inventoryItems, 'sku');
  console.log(`[AutoSync][Inventory] Inserted ${inventoryItems.length} rows`);
  return inventoryItems.length;
}

async function syncVendorData(params: {
  supabase: SupabaseClient;
  url: string;
  credentials: Credentials;
  now: Date;
}): Promise<number> {
  console.log('[AutoSync][Vendors] Fetching report...');
  const csvText = await fetchReport('vendors', params.url, params.credentials);
  const rawRows = parseCSV(csvText);
  console.log(`[AutoSync][Vendors] Parsed ${rawRows.length} rows`);

  const nowIso = params.now.toISOString();
  const vendors: Array<Record<string, any>> = [];
  const seenVendorIds = new Set<string>();
  rawRows.forEach((row, index) => {
    const transformed = transformVendorRow(row, nowIso, index);
    if (transformed) {
      if (seenVendorIds.has(transformed.id)) {
        return;
      }
      seenVendorIds.add(transformed.id);
      vendors.push(transformed);
    }
  });

  if (vendors.length === 0) {
    throw new Error('Vendor CSV returned no usable rows');
  }

  await deleteAllRows(params.supabase, 'vendors', 'id');
  await batchInsert(params.supabase, 'vendors', vendors, 500);
  console.log(`[AutoSync][Vendors] Inserted ${vendors.length} rows`);
  return vendors.length;
}

async function syncBomData(params: {
  supabase: SupabaseClient;
  url: string;
  credentials: Credentials;
  now: Date;
}): Promise<number> {
  console.log('[AutoSync][BOMs] Fetching report...');
  const csvText = await fetchReport('boms', params.url, params.credentials);
  const flatRows = flattenBomCsv(csvText);
  console.log(`[AutoSync][BOMs] Parsed ${flatRows.length} component rows`);

  if (flatRows.length === 0) {
    throw new Error('BOM CSV returned no component rows');
  }

  const bomMap = new Map<string, {
    name: string;
    potentialBuildQty: number;
    averageCost: number;
    components: Array<Record<string, any>>;
  }>();

  for (const row of flatRows) {
    if (!row.productId || !row.componentProductId) continue;
    const key = row.productId.trim();
    const existing = bomMap.get(key) || {
      name: row.productName || key,
      potentialBuildQty: parseNumber(row.potentialBuildQty, 0),
      averageCost: 0,
      components: [],
    };

    existing.components.push({
      sku: row.componentProductId,
      name: row.componentName || row.componentProductId,
      quantity: parseNumber(row.bomQuantity, 0),
      remaining: parseNumber(row.componentRemaining, 0),
      note: row.componentNote || '',
    });

    if (!existing.averageCost && row.averageCost) {
      existing.averageCost = parseNumber(row.averageCost, 0);
    }

    bomMap.set(key, existing);
  }

  const nowIso = params.now.toISOString();
  const defaultPackaging = { bagType: 'Standard', labelType: 'Standard', specialInstructions: '' };

  const bomRecords = Array.from(bomMap.entries()).map(([finishedSku, value], index) => {
    const normalizedSku = finishedSku.trim();
    return {
      id: generateDeterministicId(normalizedSku, index),
      finished_sku: normalizedSku,
      name: value.name || normalizedSku,
    components: value.components,
    packaging: defaultPackaging,
    artwork: [],
    barcode: '',
    description: '',
    category: 'Uncategorized',
    yield_quantity: 1,
    potential_build_qty: value.potentialBuildQty,
    average_cost: value.averageCost,
    data_source: 'csv',
    last_sync_at: nowIso,
    sync_status: 'synced',
    updated_at: nowIso,
    };
  });

  if (bomRecords.length === 0) {
    throw new Error('No BOM records constructed from CSV');
  }

  await deleteAllRows(params.supabase, 'boms', 'id');
  await batchInsert(params.supabase, 'boms', bomRecords, 200);
  console.log(`[AutoSync][BOMs] Inserted ${bomRecords.length} rows`);
  return bomRecords.length;
}

async function syncPurchaseOrdersData(params: {
  supabase: SupabaseClient;
  now: Date;
}): Promise<number> {
  console.log('[AutoSync][PurchaseOrders] Fetching from API...');

  // Get Finale credentials from vault (same as api-proxy)
  const { data: secrets } = await params.supabase
    .from('vault')
    .select('secret')
    .eq('name', 'finale_credentials')
    .single();

  if (!secrets) {
    throw new Error('Finale credentials not configured in vault');
  }

  const credentials = JSON.parse(secrets.secret);
  const finaleApiUrl = credentials.baseUrl || 'https://app.finaleinventory.com';
  const accountPath = credentials.accountPath;
  const apiKey = credentials.apiKey;
  const apiSecret = credentials.apiSecret;

  if (!accountPath || !apiKey || !apiSecret) {
    throw new Error('Incomplete Finale credentials in vault');
  }

  // Get OAuth token (same as api-proxy)
  const tokenResponse = await fetch(`${finaleApiUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: apiKey,
      client_secret: apiSecret,
      subdomain: accountPath,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to authenticate with Finale API: ${tokenResponse.status}`);
  }

  const { access_token } = await tokenResponse.json();

  // Fetch purchase orders with pagination (same as api-proxy)
  const limit = 100;
  let offset = 0;
  const allPurchaseOrders: any[] = [];
  let hasMore = true;

  while (hasMore) {
    const url = `${finaleApiUrl}/purchase_orders?limit=${limit}&offset=${offset}&include=line_items`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to fetch purchase orders (${response.status}): ${errorBody}`);
    }

    const payload = await response.json();
    const batch = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

    allPurchaseOrders.push(...batch);

    if (payload?.pagination?.totalPages && payload?.pagination?.page) {
      const { page, totalPages } = payload.pagination;
      hasMore = page < totalPages;
      offset = page * limit;
    } else {
      hasMore = batch.length === limit;
      offset += limit;
    }
  }

  console.log(`[AutoSync][PurchaseOrders] Fetched ${allPurchaseOrders.length} POs from API`);

  if (allPurchaseOrders.length === 0) {
    throw new Error('Purchase orders API returned no data');
  }

  // Transform and upsert purchase orders
  const nowIso = params.now.toISOString();
  const transformedPOs: Array<Record<string, any>> = [];
  const transformedPOItems: Array<Record<string, any>> = [];

  for (const po of allPurchaseOrders) {
    const transformedPO = transformPurchaseOrder(po, nowIso);
    if (transformedPO) {
      transformedPOs.push(transformedPO);

      // Transform line items
      if (po.line_items && Array.isArray(po.line_items)) {
        for (const item of po.line_items) {
          const transformedItem = transformPurchaseOrderItem(item, transformedPO.id, nowIso);
          if (transformedItem) {
            transformedPOItems.push(transformedItem);
          }
        }
      }
    }
  }

  if (transformedPOs.length === 0) {
    throw new Error('No valid purchase orders after transformation');
  }

  // Upsert purchase orders and items
  await batchUpsert(params.supabase, 'purchase_orders', transformedPOs, 'order_id');
  if (transformedPOItems.length > 0) {
    await batchUpsert(params.supabase, 'purchase_order_items', transformedPOItems, 'id');
  }

  console.log(`[AutoSync][PurchaseOrders] Inserted ${transformedPOs.length} POs with ${transformedPOItems.length} line items`);
  return transformedPOs.length;
}

async function getSyncMetadata(supabase: SupabaseClient, dataType: SyncType) {
  const { data } = await supabase
    .from('sync_metadata')
    .select('*')
    .eq('data_type', dataType)
    .single();
  return data as SyncMetadataRow | null;
}

function shouldSync(metadata: SyncMetadataRow | null, intervalMs: number, now: Date) {
  if (!metadata || !metadata.last_sync_time) return true;
  if (!metadata.success) return true;
  const lastSync = new Date(metadata.last_sync_time).getTime();
  return now.getTime() - lastSync >= intervalMs;
}

async function updateSyncMetadata(
  supabase: SupabaseClient,
  dataType: SyncType,
  now: Date,
  count: number,
  success: boolean,
) {
  const { error } = await supabase
    .from('sync_metadata')
    .upsert({
      data_type: dataType,
      last_sync_time: now.toISOString(),
      item_count: count,
      success,
      updated_at: now.toISOString(),
    }, { onConflict: 'data_type' });

  if (error) {
    console.error(`[AutoSync][Metadata] Failed for ${dataType}:`, error.message);
  }
}

async function fetchReport(name: string, url: string, credentials: Credentials): Promise<string> {
  const fixedUrl = url.replace('/pivotTableStream/', '/pivotTable/');
  const authHeader = `Basic ${btoa(`${credentials.apiKey}:${credentials.apiSecret}`)}`;
  const response = await fetch(fixedUrl, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'text/csv, text/plain, */*',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${name} report fetch failed (${response.status}): ${response.statusText}. Body: ${body.substring(0, 200)}`);
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`${name} report returned empty CSV`);
  }
  if (text.trimStart().startsWith('<')) {
    throw new Error(`${name} report returned HTML (likely expired report URL or missing auth)`);
  }
  return text;
}

function parseCSV(csvText: string): Array<Record<string, string>> {
  if (!csvText || !csvText.trim()) return [];

  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rowsRaw: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += ch;
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

  let headerIndex = 0;
  let headers: string[] = [];
  for (let i = 0; i < rowsRaw.length; i++) {
    const cols = splitCsvRow(rowsRaw[i]);
    const colsLower = cols.map(col => col.trim().toLowerCase());
    const hasName = colsLower.some(c => c === 'name' || c === 'product name');
    const hasIdentifier = colsLower.some(c => c === 'sku' || c === 'product id' || c === 'product code' || c.includes('email address 0'));
    const enoughColumns = cols.filter(c => c.trim().length > 0).length >= 3;
    if (enoughColumns && (hasName || hasIdentifier)) {
      headerIndex = i;
      headers = cols.map(h => h.trim());
      break;
    }
  }

  if (headers.length === 0) {
    headers = splitCsvRow(rowsRaw[0]).map(h => h.trim());
    headerIndex = 0;
  }

  const rows: Array<Record<string, string>> = [];
  for (let i = headerIndex + 1; i < rowsRaw.length; i++) {
    if (!rowsRaw[i] || !rowsRaw[i].trim()) continue;
    const values = splitCsvRow(rowsRaw[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? '';
    });
    rows.push(row);
  }

  return rows;
}

function splitCsvRow(line: string): string[] {
  const values: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    const n = line[i + 1];
    if (c === '"') {
      if (inQuotes && n === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      values.push(field.trim().replace(/^"|"$/g, ''));
      field = '';
    } else {
      field += c;
    }
  }
  values.push(field.trim().replace(/^"|"$/g, ''));
  return values;
}

function flattenBomCsv(csvText: string) {
  const normalized = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter(line => line.trim());
  if (lines.length <= 1) return [];

  const rows: Array<{
    productId: string;
    productName: string;
    potentialBuildQty: string;
    componentProductId: string;
    componentName: string;
    componentRemaining: string;
    componentNote: string;
    bomQuantity: string;
    averageCost: string;
  }> = [];

  let currentParent: { productId: string; productName: string; potentialBuildQty: string } | null = null;

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvRow(lines[i]);
    const productId = values[0]?.trim();
    const parentDescription = values[1]?.trim();
    const potentialBuildQty = values[2]?.trim();
    const bomQuantity = values[3]?.trim();
    const componentProductId = values[4]?.trim();
    const componentDescription = values[5]?.trim();
    const componentRemaining = values[6]?.trim();
    const componentNote = values[7]?.trim();
    const averageCost = values[8]?.trim();

    if (productId) {
      currentParent = {
        productId,
        productName: parentDescription || productId,
        potentialBuildQty: potentialBuildQty || '0',
      };
      continue;
    }

    if (componentProductId && currentParent) {
      rows.push({
        productId: currentParent.productId,
        productName: currentParent.productName,
        potentialBuildQty: currentParent.potentialBuildQty,
        componentProductId,
        componentName: componentDescription || componentProductId,
        componentRemaining: componentRemaining || '0',
        componentNote: componentNote || '',
        bomQuantity: bomQuantity || '0',
        averageCost: averageCost || '0',
      });
    }
  }

  return rows;
}

async function buildVendorMap(supabase: SupabaseClient) {
  const { data } = await supabase.from('vendors').select('id, name');
  type VendorLookup = { id: string; name: string };
  const map = new Map<string, string>();
  ((data as VendorLookup[] | null) || []).forEach((vendor) => {
    if (vendor?.name) {
      map.set(normalizeVendorKey(vendor.name), vendor.id);
    }
  });
  return map;
}

function transformInventoryRow(
  raw: Record<string, any>,
  vendorMap: Map<string, string>,
  inferredVendors: Map<string, { id: string; name: string }>,
  timestamp: string,
  index: number,
) {
  const sku = (raw['SKU'] || raw['Product ID'] || raw['Product Code'] || '').trim();
  const name = (raw['Name'] || raw['Description'] || raw['Product Name'] || '').trim();
  if (!sku || !name) {
    console.warn(`[AutoSync][Inventory] Skipping row ${index} - missing SKU or name`);
    return null;
  }

  const vendorNameKeys = [
    'Vendor',
    'Vendor Name',
    'Vendor name',
    'Supplier',
    'Supplier 1',
    'Supplier 2',
    'Supplier 3',
    'Primary supplier',
    'Primary Supplier',
  ];
  const vendorName = vendorNameKeys.map(key => (raw[key] || '').trim()).find(Boolean) || '';
  const normalizedVendorName = normalizeVendorKey(vendorName);
  let vendorId: string | null = null;
  if (normalizedVendorName) {
    const existingVendorId = vendorMap.get(normalizedVendorName);
    if (existingVendorId) {
      vendorId = existingVendorId;
    } else {
      const inferredId = generateDeterministicId(normalizedVendorName);
      vendorId = inferredId;
      vendorMap.set(normalizedVendorName, inferredId);
      if (!inferredVendors.has(normalizedVendorName)) {
        inferredVendors.set(normalizedVendorName, {
          id: inferredId,
          name: vendorName || 'Unknown Vendor',
        });
      }
    }
  }

  const unitsInStock = Math.max(0, roundInt(parseNumber(raw['Units in stock'] || raw['In Stock'] || raw['Quantity On Hand'], 0)));
  const unitsOnOrder = Math.max(0, roundInt(parseNumber(raw['Units On Order'] || raw['On Order'], 0)));
  const unitsReserved = Math.max(0, roundInt(parseNumber(raw['Units Reserved'] || raw['Reserved'], 0)));
  const reorderPoint = Math.max(0, roundInt(parseNumber(raw['Reorder Point'] || raw['ReOr point'], 0)));
  const reorderVariance = parseNumber(raw['Reorder Variance'] || raw['ReOr var'], 0);
  const qtyToOrder = Math.max(0, roundInt(parseNumber(raw['Qty to Order'] || raw['Quantity to Order'], 0)));
  const moq = Math.max(1, roundInt(parseNumber(raw['MOQ'] || raw['Minimum order quantity'], 1)));
  const sales30 = Math.max(0, roundInt(parseNumber(raw['Sales last 30 days'], 0)));
  const sales60 = Math.max(0, roundInt(parseNumber(raw['Sales last 60 days'], 0)));
  const sales90 = Math.max(0, roundInt(parseNumber(raw['Sales last 90 days'], 0)));

  return {
    sku,
    name,
    category: (raw['Category'] || 'Uncategorized').trim(),
    stock: unitsInStock,
    on_order: unitsOnOrder,
    reorder_point: reorderPoint,
    vendor_id: vendorId,
    moq,
    description: raw['Description'] || '',
    status: (raw['Status'] || 'active').toLowerCase(),
    unit_cost: parseNumber(raw['Unit Cost'] || raw['Cost'], 0),
    unit_price: parseNumber(raw['Unit Price'] || raw['Price'], 0),
    units_in_stock: unitsInStock,
    units_on_order: unitsOnOrder,
    units_reserved: unitsReserved,
    reorder_variance: reorderVariance,
    qty_to_order: qtyToOrder,
    sales_velocity_consolidated: parseNumber(raw['BuildASoil sales velocity'] || raw['Sales Velocity'], 0),
    sales_last_30_days: sales30,
    sales_last_60_days: sales60,
    sales_last_90_days: sales90,
    warehouse_location: raw['Location'] || raw['Warehouse'] || '',
    supplier_sku: raw['Supplier SKU'] || sku,
    data_source: 'csv',
    last_sync_at: timestamp,
    sync_status: 'synced',
    updated_at: timestamp,
  };
}

function transformVendorRow(raw: Record<string, any>, timestamp: string, _index: number) {
  const name = (raw['Name'] || raw['Vendor Name'] || '').trim();
  if (!name) return null;
  const normalizedName = normalizeVendorKey(name);

  const emailKeys = ['Email address 0', 'Email address 1', 'Email address 2', 'Email address 3', 'Email'];
  const contactEmails = emailKeys
    .map(key => (raw[key] || '').trim())
    .filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

  const phoneKeys = ['Phone number 0', 'Phone number 1', 'Phone'];
  const phone = phoneKeys.map(key => (raw[key] || '').trim()).find(Boolean) || '';

  const addressLine1 = raw['Address 0 street address'] || raw['Address 0 line 1'] || '';
  const city = raw['Address 0 city'] || '';
  const state = raw['Address 0 state / region'] || raw['Address 0 state/ region'] || raw['Address 0 state'] || '';
  const postalCode = raw['Address 0 postal code'] || '';
  const country = raw['Address 0 country'] || '';

  const address = formatAddress({ addressLine1, city, state, postalCode, country });
  const websiteRaw = (raw['Website'] || raw['URL'] || '').trim();
  const website = normalizeWebsite(websiteRaw);
  const leadTimeDays = Math.max(0, Math.round(parseNumber(raw['Lead time (days)'], 7)));

  return {
    id: generateDeterministicId(normalizedName),
    name,
    contact_emails: contactEmails,
    phone,
    address,
    website,
    lead_time_days: leadTimeDays,
    address_line1: addressLine1,
    address_line2: '',
    city,
    state,
    postal_code: postalCode,
    country,
    notes: raw['Notes'] || '',
    data_source: 'csv',
    last_sync_at: timestamp,
    sync_status: 'synced',
    updated_at: timestamp,
  };
}

function transformPurchaseOrder(raw: Record<string, any>, timestamp: string) {
  const orderId = (raw.order_number || raw.id || '').toString().trim();
  if (!orderId) return null;

  // Map Finale status to our status
  const statusMap: Record<string, string> = {
    'draft': 'draft',
    'sent': 'sent',
    'confirmed': 'confirmed',
    'partial': 'partial',
    'received': 'received',
    'cancelled': 'cancelled',
  };

  const finaleStatus = (raw.status || '').toLowerCase();
  const status = statusMap[finaleStatus] || 'draft';

  // Extract vendor info
  const vendorName = raw.vendor_name || raw.supplier_name || '';
  const vendorId = vendorName ? generateDeterministicId(normalizeVendorKey(vendorName)) : null;

  return {
    id: generateDeterministicId(orderId),
    order_id: orderId,
    order_date: raw.order_date || raw.created_at || timestamp.split('T')[0],
    vendor_id: vendorId,
    supplier_code: raw.vendor_code || raw.supplier_code || '',
    supplier_name: vendorName,
    supplier_contact: raw.vendor_contact || '',
    supplier_email: raw.vendor_email || '',
    supplier_phone: raw.vendor_phone || '',
    status,
    priority: raw.priority || 'normal',
    expected_date: raw.expected_delivery_date || raw.delivery_date,
    actual_receive_date: raw.actual_delivery_date || raw.received_date,
    tracking_number: raw.tracking_number || '',
    tracking_link: raw.tracking_url || '',
    carrier: raw.carrier || '',
    subtotal: parseNumber(raw.subtotal, 0),
    tax_amount: parseNumber(raw.tax_amount, 0),
    shipping_cost: parseNumber(raw.shipping_amount || raw.shipping_cost, 0),
    total_amount: parseNumber(raw.total_amount || raw.grand_total, 0),
    currency: raw.currency || 'USD',
    payment_terms: raw.payment_terms || '',
    internal_notes: raw.notes || raw.internal_notes || '',
    vendor_notes: raw.vendor_notes || '',
    special_instructions: raw.special_instructions || '',
    finale_po_id: raw.id?.toString(),
    finale_status: finaleStatus,
    last_finale_sync: timestamp,
    source: 'api',
    data_source: 'api',
    last_sync_at: timestamp,
    sync_status: 'synced',
    record_created: raw.created_at || timestamp,
    record_last_updated: timestamp,
    updated_at: timestamp,
  };
}

function transformPurchaseOrderItem(raw: Record<string, any>, poId: string, timestamp: string) {
  const sku = (raw.sku || raw.product_sku || raw.item_code || '').trim();
  if (!sku) return null;

  const itemId = `${poId}_${sku}_${raw.id || 'item'}`;
  const lineNumber = parseNumber(raw.line_number, 0);

  return {
    id: generateDeterministicId(itemId),
    po_id: poId,
    inventory_sku: sku,
    item_name: raw.name || raw.product_name || raw.description || sku,
    item_description: raw.description || '',
    supplier_sku: raw.supplier_sku || sku,
    quantity_ordered: parseNumber(raw.quantity_ordered || raw.quantity, 0),
    quantity_received: parseNumber(raw.quantity_received, 0),
    unit_of_measure: raw.unit_of_measure || 'EA',
    unit_cost: parseNumber(raw.unit_cost || raw.cost, 0),
    discount_percent: parseNumber(raw.discount_percent, 0),
    discount_amount: parseNumber(raw.discount_amount, 0),
    line_status: raw.line_status || 'pending',
    expected_delivery: raw.expected_delivery_date,
    actual_delivery: raw.actual_delivery_date,
    reorder_reason: raw.reorder_reason || 'manual',
    line_notes: raw.notes || '',
    line_number: lineNumber,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

async function deleteAllRows(supabase: SupabaseClient, table: string, primaryKey: string) {
  const { error } = await supabase.from(table).delete().not(primaryKey, 'is', null);
  if (error) {
    throw new Error(`Failed to clear ${table} before insert: ${error.message}`);
  }
}

async function batchInsert(
  supabase: SupabaseClient,
  table: string,
  rows: Array<Record<string, any>>,
  chunkSize = 1000,
) {
  const columnsToSkip = new Set<string>();

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    let rowsToInsert = chunk.map((row) => applyColumnSkips(row, columnsToSkip));

    while (true) {
      const { error } = await supabase.from(table).insert(rowsToInsert);
      if (!error) break;

      const unsupportedColumn = detectUnsupportedColumn(error.message);
      if (unsupportedColumn) {
        if (!columnsToSkip.has(unsupportedColumn)) {
          columnsToSkip.add(unsupportedColumn);
          console.warn(`[AutoSync][${table}] Dropping unsupported column '${unsupportedColumn}'`);
        }
        rowsToInsert = rowsToInsert.map((row) => removeColumn(row, unsupportedColumn));
        continue;
      }

      throw new Error(`Insert into ${table} failed: ${error.message}`);
    }
  }
}

async function batchUpsert(
  supabase: SupabaseClient,
  table: string,
  rows: Array<Record<string, any>>,
  onConflict: string,
  chunkSize = 1000,
) {
  const columnsToSkip = new Set<string>();

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    let rowsToInsert = chunk.map((row) => applyColumnSkips(row, columnsToSkip));

    while (true) {
      const { error } = await supabase.from(table).upsert(rowsToInsert, { onConflict });
      if (!error) break;

      const unsupportedColumn = detectUnsupportedColumn(error.message);
      if (unsupportedColumn) {
        if (!columnsToSkip.has(unsupportedColumn)) {
          columnsToSkip.add(unsupportedColumn);
          console.warn(`[AutoSync][${table}] Dropping unsupported column '${unsupportedColumn}' during upsert`);
        }
        rowsToInsert = rowsToInsert.map((row) => removeColumn(row, unsupportedColumn));
        continue;
      }

      throw new Error(`Upsert into ${table} failed: ${error.message}`);
    }
  }
}

function applyColumnSkips(row: Record<string, any>, columnsToSkip: Set<string>) {
  if (columnsToSkip.size === 0) {
    return { ...row };
  }

  const copy = { ...row };
  columnsToSkip.forEach((column) => {
    if (column in copy) {
      delete copy[column];
    }
  });
  return copy;
}

function removeColumn(row: Record<string, any>, column: string) {
  if (!(column in row)) return row;
  const copy = { ...row };
  delete copy[column];
  return copy;
}

function detectUnsupportedColumn(message: string | null): string | null {
  if (!message) return null;
  const patterns = [
    /column "([^"]+)" of relation/i,
    /column "([^"]+)" does not exist/i,
    /cannot insert into column "([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function parseNumber(value: string | number | undefined, defaultValue = 0): number {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'number') return Number.isFinite(value) ? value : defaultValue;
  const clean = value.replace(/[^0-9.-]/g, '');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function roundInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function formatAddress(components: {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}) {
  return [
    components.addressLine1,
    components.addressLine2,
    components.city,
    components.state,
    components.postalCode,
    components.country,
  ].filter(Boolean).join(', ');
}

function normalizeWebsite(url: string) {
  if (!url) return '';
  try {
    const full = url.startsWith('http') ? url : `https://${url}`;
    new URL(full);
    return full;
  } catch (_) {
    return '';
  }
}

const textEncoder = new TextEncoder();

function generateDeterministicId(value: string, index = 0): string {
  const seed = textEncoder.encode(`${value || 'unknown'}::${index}`);
  const bytes = new Uint8Array(16);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = ((i * 73) + seed.length) & 0xff;
  }

  for (let i = 0; i < seed.length; i++) {
    const byteIndex = i % 16;
    const mirrorIndex = (byteIndex * 7 + index) % 16;
    bytes[byteIndex] = (bytes[byteIndex] + seed[i] + i) & 0xff;
    bytes[mirrorIndex] ^= (seed[i] + byteIndex) & 0xff;
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4 UUID
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10xx

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

function normalizeVendorKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

async function createBackupBeforeSync(supabase: SupabaseClient, dataType: SyncType): Promise<string | null> {
  try {
    const tableName = getTableNameForDataType(dataType);
    const { data, error } = await supabase.rpc('backup_before_sync', {
      p_data_type: dataType,
      p_table_name: tableName,
      p_triggered_by: 'auto_sync_finale'
    });

    if (error) {
      console.warn(`[Backup] Failed to create backup for ${dataType}:`, error.message);
      return null;
    }

    console.log(`[Backup] Created backup for ${dataType}: ${data}`);
    return data;
  } catch (error) {
    console.warn(`[Backup] Error creating backup for ${dataType}:`, error);
    return null;
  }
}

async function triggerEmptyDataRollback(supabase: SupabaseClient, dataType: SyncType, backupTable: string | null): Promise<void> {
  if (!backupTable) {
    console.warn(`[Rollback] No backup available for ${dataType} rollback`);
    return;
  }

  try {
    const tableName = getTableNameForDataType(dataType);
    const { data, error } = await supabase.rpc('trigger_empty_data_rollback', {
      p_data_type: dataType,
      p_table_name: tableName,
      p_error_message: `Empty ${dataType} data detected during sync`
    });

    if (error) {
      console.error(`[Rollback] Failed to rollback ${dataType}:`, error.message);
    } else {
      console.log(`[Rollback] Successfully rolled back ${dataType} to backup: ${data}`);
    }
  } catch (error) {
    console.error(`[Rollback] Error during ${dataType} rollback:`, error);
  }
}

async function enqueueSyncRetry(
  supabase: SupabaseClient,
  dataType: SyncType,
  operation: string,
  errorMessage: string,
  contextData: Record<string, any>
): Promise<void> {
  try {
    const { error } = await supabase.rpc('enqueue_sync_retry', {
      p_data_type: dataType,
      p_operation: operation,
      p_error_message: errorMessage,
      p_context_data: contextData,
      p_priority: 2, // Normal priority
      p_max_retries: 3,
      p_requires_rollback: false
    });

    if (error) {
      console.warn(`[Retry] Failed to enqueue ${dataType} retry:`, error.message);
    } else {
      console.log(`[Retry] Enqueued ${dataType} for retry`);
    }
  } catch (error) {
    console.warn(`[Retry] Error enqueuing ${dataType} retry:`, error);
  }
}

function getTableNameForDataType(dataType: SyncType): string {
  switch (dataType) {
    case 'inventory': return 'inventory_items';
    case 'vendors': return 'vendors';
    case 'boms': return 'boms';
    case 'purchase_orders': return 'purchase_orders';
    default: return dataType;
  }
}

function isRecoverableError(errorMessage: string): boolean {
  // Define which errors are recoverable (network issues, temporary API problems, rate limits)
  const recoverablePatterns = [
    /network/i,
    /timeout/i,
    /connection/i,
    /temporary/i,
    /rate limit/i,
    /server error/i,
    /5\d{2}/, // 5xx HTTP errors
    /fetch failed/i,
    /connection refused/i,
    /connection reset/i,
    /dns/i,
    /ssl/i,
    /certificate/i,
    /gateway timeout/i,
    /bad gateway/i,
    /service unavailable/i,
    /internal server error/i,
  ];

  // Define which errors are NOT recoverable (data issues, auth problems, schema changes)
  const nonRecoverablePatterns = [
    /empty.*data/i,
    /no.*rows/i,
    /invalid.*credentials/i,
    /unauthorized/i,
    /forbidden/i,
    /authentication/i,
    /invalid.*token/i,
    /schema.*error/i,
    /column.*not.*exist/i,
    /relation.*not.*exist/i,
    /invalid.*csv/i,
    /malformed.*data/i,
    /data.*corruption/i,
  ];

  // Check for non-recoverable errors first
  if (nonRecoverablePatterns.some(pattern => pattern.test(errorMessage))) {
    return false;
  }

  // Check for recoverable errors
  return recoverablePatterns.some(pattern => pattern.test(errorMessage));
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
