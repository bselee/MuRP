# External Data Connector Architecture

## Overview

The TGF-MRP system supports multiple external data sources (Finale Inventory, QuickBooks, CSV APIs, etc.) through a unified connector abstraction layer. This design enables:

- **Flexibility**: Add new data sources without changing core application code
- **Data Normalization**: Transform different formats into our unified schema
- **Caching & Rate Limiting**: Protect against API rate limits and reduce external calls
- **Client-Specific**: Each client can connect their own data sources with custom mappings
- **Security**: Credentials never exposed to client-side code

## Architecture Diagram

```
┌─────────────────────────────────────┐
│     TGF-MRP Application             │
│     (React Frontend)                │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       │  Supabase DB    │ (Central Data Store)
       │  - inventory    │
       │  - vendors      │
       │  - purchase_orders
       └───────┬─────────┘
               │
    ┌──────────┴──────────────┐
    │  API Layer (Vercel)      │
    │  /api/external/sync      │
    │  /api/connectors/*       │
    └──┬────────┬──────────┬──┘
       │        │          │
   ┌───▼───┐ ┌─▼─────┐  ┌─▼──────┐
   │Finale │ │QuickB │  │Custom  │
   │Inv API│ │ooks   │  │CSV/JSON│
   └───────┘ └───────┘  └────────┘
```

## Connector Interface

All data connectors implement the `DataConnector` interface:

```typescript
interface DataConnector {
  // Metadata
  source: string;
  supportsRealtime: boolean;
  
  // Authentication
  authenticate(credentials: any): Promise<boolean>;
  
  // Data fetching methods
  fetchInventory(): Promise<InventoryItem[]>;
  fetchVendors(): Promise<Vendor[]>;
  fetchPurchaseOrders(): Promise<PurchaseOrder[]>;
  
  // Rate limiting info
  getRateLimits(): RateLimitInfo;
}
```

## Data Flow

### 1. Configuration Phase
- User adds external data source in Settings UI
- Credentials stored encrypted in `external_data_sources` table
- Field mappings configured (external field → internal field)
- Sync frequency set (realtime, hourly, daily, manual)

### 2. Sync Phase
- Scheduled job or manual trigger calls `/api/external/sync`
- System fetches enabled sources from `external_data_sources`
- For each source:
  1. Load credentials (server-side only)
  2. Instantiate appropriate connector from registry
  3. Check rate limits and cache
  4. Authenticate with external API
  5. Fetch data (inventory, vendors, POs)
  6. Apply field mappings via transformer
  7. Upsert to Supabase tables
  8. Update `last_sync_at` and `sync_status`

### 3. Cache Layer
- External API responses cached for 1 hour (configurable per source)
- Cache key: `connector:{source_type}:{user_id}:{method}:{hash}`
- Protects against rate limit exhaustion
- Reduces latency for frequently accessed data

## Security Model

### Credential Storage
- Stored in `external_data_sources.credentials` as JSONB
- **Never** exposed to client-side code
- Only accessible via service role key
- Helper function `get_external_source_credentials()` enforces service_role check

### API Access
- All external API calls made server-side only
- Client cannot directly call external APIs
- Authentication required for all sync endpoints
- RLS policies enforce user can only sync their own sources

## Rate Limiting Strategy

Each connector tracks:
- `requests_this_minute` (reset every 60 seconds)
- `requests_this_hour` (reset every 3600 seconds)
- `last_request_at` timestamp

Before making external API call:
1. Check if within rate limits
2. If exceeded, return cached data or queue request
3. After successful call, increment counters via `increment_rate_limit()`

### Finale Inventory Limits
- 120 POST requests/minute
- 120 GET requests/minute
- 300 collection/report requests/hour

Solution: Prioritize Reporting API (CSV/JSON) for bulk data, cache for 1 hour.

## Field Mapping System

External data fields rarely match our schema exactly. Field mappings translate:

```json
{
  "inventory": {
    "sku": "productCode",
    "quantity_on_hand": "qtyOnHand",
    "reorder_point": "reorderLevel",
    "preferred_vendor_id": "defaultSupplierId"
  },
  "vendors": {
    "name": "supplierName",
    "contact_email": "email",
    "lead_time_days": "leadTimeDays"
  }
}
```

Transformers read these mappings and convert external data to our schema.

## Retry & Backoff Strategy

When external API calls fail:

1. **Transient Errors** (5xx, timeout):
   - Exponential backoff: 1s, 2s, 4s, 8s, 16s
   - Max 5 retries
   - Update `sync_status` to 'failed' after exhaustion

2. **Authentication Errors** (401, 403):
   - No retry
   - Set `sync_status` to 'failed'
   - Set `sync_error` to guide user to fix credentials

3. **Rate Limit Errors** (429):
   - Wait for `Retry-After` header duration
   - If no header, wait 60 seconds
   - Max 3 retry attempts

## Supported Connectors

### 1. Finale Inventory
- **Auth**: Basic Auth (base64 encoded API_KEY:API_SECRET)
- **Endpoints**: `/api/product`, `/api/order`, `/api/party`, Reporting API
- **Data Format**: JSON or CSV (via Reporting API)
- **Rate Limits**: See above
- **Best Practice**: Use Reporting API for bulk data retrieval

### 2. QuickBooks Online (Future)
- **Auth**: OAuth 2.0
- **Endpoints**: QuickBooks API v3
- **Data Format**: JSON
- **Rate Limits**: 500 requests/minute per app

### 3. CSV API (Generic)
- **Auth**: Custom headers or query params
- **Endpoints**: User-provided URL
- **Data Format**: CSV
- **Rate Limits**: User-defined

### 4. JSON API (Generic)
- **Auth**: Bearer token, API key, or Basic Auth
- **Endpoints**: User-provided URL
- **Data Format**: JSON
- **Rate Limits**: User-defined

## Error Handling

All connector errors are:
1. Logged to console (server-side)
2. Stored in `external_data_sources.sync_error`
3. Returned to client as generic message (no credential leaks)

Error categories:
- `AUTH_FAILED`: Credentials invalid
- `RATE_LIMITED`: Too many requests
- `NETWORK_ERROR`: Connection issue
- `DATA_ERROR`: Malformed response
- `MAPPING_ERROR`: Field mapping failed

## Testing Strategy

### Unit Tests
- Mock external API responses
- Test field mapping transformations
- Verify rate limit logic
- Test retry/backoff behavior

### Integration Tests
- Use test credentials for Finale sandbox
- Verify end-to-end sync flow
- Confirm data appears in Supabase
- Test RLS enforcement

### Manual Testing Checklist
1. Add Finale source in Settings
2. Test connection button works
3. Trigger manual sync
4. Verify inventory items created/updated
5. Check `source_system` and `external_id` fields populated
6. Confirm `last_sync_at` updated

## Performance Considerations

- **Batch Operations**: Upsert data in batches of 100 records
- **Parallel Fetches**: Fetch inventory/vendors/POs concurrently where possible
- **Incremental Sync**: Support "sync since last_sync_at" for APIs that allow it
- **Background Jobs**: Long syncs run async, return immediately with status

## Future Enhancements

1. **Webhooks**: Real-time updates when external system changes
2. **Conflict Resolution**: Handle when user edits data that's also synced
3. **Sync History**: Track all sync runs with diffs
4. **Data Validation**: Pre-flight checks before upserting to DB
5. **Two-Way Sync**: Push changes from TGF-MRP back to external systems
