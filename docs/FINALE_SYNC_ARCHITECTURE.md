# Finale Sync Architecture

## Overview
This document explains how Finale Inventory data syncs to MuRP and why certain design decisions were made.

## CSV-Based Sync (Current Implementation)

### Why CSV Reports Instead of REST API?

**CSV reports are the primary data source** for several important reasons:

1. **No API Rate Limits** - CSV reports are static URLs that can be fetched without counting against Finale's API quotas
2. **Complete Data** - CSV exports contain all fields, whereas API endpoints may paginate or limit fields
3. **Faster Bulk Sync** - Single CSV download is faster than thousands of paginated API calls
4. **Simpler Auth** - CSV reports use Basic Auth (username/password) instead of OAuth2 token management
5. **More Reliable** - No token expiration, no OAuth refresh logic, no session management

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Finale Inventory (app.finaleinventory.com)                      │
│                                                                   │
│  CSV Reports (configured in Finale UI):                          │
│  • Inventory Report → FINALE_INVENTORY_REPORT_URL                │
│  • Vendors Report → FINALE_VENDORS_REPORT_URL                    │
│  • BOM Report → FINALE_BOM_REPORT_URL                            │
└───────────────────────────────────┬─────────────────────────────┘
                                    │
                                    │ Basic Auth (FINALE_API_KEY + FINALE_API_SECRET)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ Supabase Edge Function: auto-sync-finale                        │
│ (Backend-only, credentials never exposed to browser)             │
│                                                                   │
│  1. Fetch CSV from Finale URLs                                   │
│  2. Parse CSV → JSON                                             │
│  3. Transform to database schema                                 │
│  4. Upsert to Supabase tables                                    │
│  5. Update sync_metadata with timestamp                          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ Postgres INSERT/UPDATE
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ Supabase PostgreSQL Database                                    │
│                                                                   │
│  Tables:                                                          │
│  • inventory_items                                               │
│  • vendors                                                        │
│  • bill_of_materials                                             │
│  • sync_metadata (tracks last_sync_time, item_count, success)   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ Realtime subscriptions + REST queries
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ React Frontend (useSupabaseData hooks)                          │
│                                                                   │
│  • useSupabaseInventory()                                        │
│  • useSupabaseVendors()                                          │
│  • useSupabaseBOMs()                                             │
│  • Data displayed in UI tables                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Sync Health Monitoring

The system tracks **staleness** based on expected sync intervals:

| Data Type | Expected Interval | Staleness Threshold |
|-----------|-------------------|---------------------|
| Inventory | 5 minutes         | >5 minutes = stale  |
| Vendors   | 60 minutes        | >60 minutes = stale |
| BOMs      | 60 minutes        | >60 minutes = stale |

**How it works:**
1. `get_sync_health()` RPC function compares `last_sync_time` to `NOW()`
2. If `minutes_since_sync > expected_interval_minutes`, data is flagged as stale
3. UI shows warning indicators when data hasn't synced recently
4. Manual sync can be triggered via "Sync Now" button

### Environment Variables (Backend Only)

**Required in Supabase Edge Functions:**
```bash
FINALE_API_KEY="your_username"              # Basic Auth username
FINALE_API_SECRET="your_password"           # Basic Auth password
FINALE_INVENTORY_REPORT_URL="https://..."  # CSV export URL
FINALE_VENDORS_REPORT_URL="https://..."    # CSV export URL
FINALE_BOM_REPORT_URL="https://..."        # CSV export URL
```

**❌ NEVER expose these with VITE_ prefix** - that makes them public in the browser bundle!

### Why You See "Configuration Required"

The `FinaleSetupPanel` component shows this message when:
1. **No sync metadata exists** - Backend has never successfully synced
2. **Supabase query fails** - Database isn't accessible or table doesn't exist

**To fix:**
1. Verify environment variables are set in Supabase dashboard (Project Settings → Edge Functions → Environment Variables)
2. Trigger a manual sync via: `supabase functions invoke auto-sync-finale --method POST`
3. Check logs: `supabase functions logs auto-sync-finale`

### REST API vs CSV: When to Use Each

| Use Case | Recommended Approach |
|----------|---------------------|
| Initial bulk import | ✅ CSV reports |
| Hourly/daily batch sync | ✅ CSV reports |
| Real-time single item lookup | REST API (future enhancement) |
| Creating new purchase orders | REST API (future enhancement) |
| Updating stock levels | REST API (future enhancement) |

**Current implementation uses CSV only** because:
- MuRP is primarily a **read-only** analytics tool
- Batch updates every 5-60 minutes are sufficient
- No write operations (PO creation) implemented yet

## Future Enhancements

### Hybrid Approach (CSV + REST API)

If you need real-time writes:
1. **Keep CSV for bulk reads** (inventory, vendors, BOMs)
2. **Add REST API for writes** (create PO, update stock)
3. **Use webhooks for instant updates** (Finale → Supabase on stock change)

### Current Limitations

1. **No bi-directional sync** - Changes in MuRP don't write back to Finale
2. **5-minute freshness** - Inventory data can be up to 5 minutes stale
3. **No conflict resolution** - If same item edited in both systems, last sync wins

### Recommended Architecture (Future)

```
┌──────────────────┐
│ Finale Inventory │
└────────┬─────────┘
         │
         ├──────────► CSV Reports (bulk sync every 5-60 min)
         │
         ├──────────► REST API (real-time writes: create PO, update stock)
         │
         └──────────► Webhooks (push notifications on changes)
                      │
                      ▼
         ┌────────────────────────┐
         │ Supabase Edge Function │
         └────────┬───────────────┘
                  │
                  ▼
         ┌────────────────┐
         │ PostgreSQL DB  │
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │ React Frontend │
         └────────────────┘
```

## Security Best Practices

### ✅ DO:
- Store Finale credentials in Supabase Edge Function environment variables
- Use Supabase RLS policies to restrict data access
- Proxy all external API calls through Edge Functions
- Use service role key only in backend functions

### ❌ DON'T:
- Add VITE_ prefix to sensitive credentials (exposes to browser!)
- Call Finale API directly from React components
- Store API keys in `.env.local` with VITE_ prefix
- Commit credentials to git (use `.env.local` and `.gitignore`)

## Troubleshooting

### "Configuration Required" Message
**Cause:** No sync metadata in database  
**Fix:** Run manual sync: `supabase functions invoke auto-sync-finale --method POST`

### Stale Data Warnings
**Cause:** Last sync older than expected interval  
**Fix:** Check Edge Function logs for errors, verify CSV report URLs are valid

### Missing Inventory Items
**Cause:** CSV report filters may exclude inactive products  
**Fix:** Adjust Finale report filters to include all desired items

### Sync Fails with 401 Unauthorized
**Cause:** Invalid FINALE_API_KEY or FINALE_API_SECRET  
**Fix:** Verify credentials in Supabase dashboard match Finale account

## Monitoring

Check sync health in UI:
1. **Header indicator** - Shows "Updated 2m ago" or "vendors stale"
2. **Settings → API Integrations** - Detailed sync status per data type
3. **Supabase Dashboard** - Query `sync_metadata` table directly

Check backend logs:
```bash
supabase functions logs auto-sync-finale --tail
```

## Summary

**You asked: "Do we need the API if we are querying CSV reports?"**

**Answer: No, you don't need the REST API for read-only bulk syncing.** CSV reports are:
- Faster for bulk data
- Simpler authentication
- No rate limits
- More reliable for batch operations

The REST API would only be needed if you want to:
- Create purchase orders in Finale from MuRP
- Update stock levels in real-time
- Push data back to Finale (bi-directional sync)

Currently, MuRP is read-only, so CSV reports are the optimal choice.
