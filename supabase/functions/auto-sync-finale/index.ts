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

type SyncType = 'inventory' | 'vendors' | 'boms';

const SYNC_INTERVALS: Record<SyncType, number> = {
  inventory: 5 * 60 * 1000,
  vendors: 60 * 60 * 1000,
  boms: 60 * 60 * 1000,
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
      if (!shouldSync(metadata, entry.intervalMs, now)) {
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
        }

        await updateSyncMetadata(supabase, entry.type, now, itemCount, true);
        summaries.push({
          dataType: entry.type,
          success: true,
          itemCount,
          message: `Synced ${itemCount} ${entry.type}`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        syncErrors.push(`${entry.type}: ${message}`);
        await updateSyncMetadata(supabase, entry.type, now, 0, false);
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
  const nowIso = params.now.toISOString();

  const inventoryItems: Array<Record<string, any>> = [];
  rawRows.forEach((row, index) => {
    const transformed = transformInventoryRow(row, vendorMap, nowIso, index);
    if (transformed) {
      inventoryItems.push(transformed);
    }
  });

  if (inventoryItems.length === 0) {
    throw new Error('No valid inventory items after transformation');
  }

  await deleteAllRows(params.supabase, 'inventory_items', 'sku');
  await batchInsert(params.supabase, 'inventory_items', inventoryItems);
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
  const seenVendorNames = new Set<string>();
  rawRows.forEach((row, index) => {
    const transformed = transformVendorRow(row, nowIso, index);
    if (transformed) {
      const nameKey = transformed.name.toLowerCase();
      if (seenVendorNames.has(nameKey)) {
        return;
      }
      seenVendorNames.add(nameKey);
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
    if (vendor.name) {
      map.set(vendor.name.toLowerCase(), vendor.id);
    }
  });
  return map;
}

function transformInventoryRow(
  raw: Record<string, any>,
  vendorMap: Map<string, string>,
  timestamp: string,
  index: number,
) {
  const sku = (raw['SKU'] || raw['Product ID'] || raw['Product Code'] || '').trim();
  const name = (raw['Name'] || raw['Description'] || raw['Product Name'] || '').trim();
  if (!sku || !name) {
    console.warn(`[AutoSync][Inventory] Skipping row ${index} - missing SKU or name`);
    return null;
  }

  const vendorNameKeys = ['Vendor', 'Supplier', 'Primary supplier', 'Primary Supplier'];
  const vendorName = vendorNameKeys.map(key => (raw[key] || '').trim()).find(Boolean) || '';
  const vendorId = vendorName ? vendorMap.get(vendorName.toLowerCase()) || null : null;

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

function transformVendorRow(raw: Record<string, any>, timestamp: string, index: number) {
  const name = (raw['Name'] || raw['Vendor Name'] || '').trim();
  if (!name) return null;

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
    id: generateDeterministicId(name, index),
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

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
