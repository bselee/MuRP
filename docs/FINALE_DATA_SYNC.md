# Finale Inventory Data Synchronization

> **AUTHORITATIVE DOCUMENTATION** - December 2025
> 
> This is the single source of truth for Finale data acquisition in MuRP.
> All other Finale-related documentation should reference this file.

## Table of Contents

1. [Overview](#overview)
2. [Data Flow Architecture](#data-flow-architecture)
3. [Sync Functions](#sync-functions)
4. [Database Tables](#database-tables)
5. [Scheduling & Automation](#scheduling--automation)
6. [Data Filtering Rules](#data-filtering-rules)
7. [API Endpoints](#api-endpoints)
8. [Troubleshooting](#troubleshooting)

---

## Overview

MuRP synchronizes data from **Finale Inventory** using two complementary APIs:

| API | Function | Best For |
|-----|----------|----------|
| **REST API** | `sync-finale-data` | Products with BOMs, Vendors |
| **GraphQL API** | `sync-finale-graphql` | Stock levels, Purchase Orders, Active filtering |

Both APIs are called by the **orchestrator** (`auto-sync-finale`) which can be triggered manually or via scheduled cron.

### Key Data Points Synced

- ✅ **Products**: 954 active products (filtered from 3000+)
- ✅ **Vendors**: 908 suppliers
- ✅ **Purchase Orders**: 1000 POs via GraphQL
- ✅ **BOMs**: 506 components → 90 assemblies
- ✅ **Stock Levels**: BuildASoil Shipping (10005) prioritized
- ✅ **Inventory Items**: 4,400 app-compatible records

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FINALE INVENTORY                                 │
│                                                                          │
│   REST API (/api/product, /api/partygroup)                              │
│   GraphQL API (/api/graphql)                                            │
└────────────────────────┬────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    SUPABASE EDGE FUNCTIONS                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  auto-sync-finale (ORCHESTRATOR)                                │    │
│  │  - Calls both sync functions in sequence                        │    │
│  │  - Logs results to sync_metadata table                          │    │
│  │  - Can be triggered via cron or manual POST                     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                         │                                                │
│            ┌────────────┴────────────┐                                  │
│            ▼                         ▼                                  │
│  ┌─────────────────────┐  ┌─────────────────────────┐                   │
│  │ sync-finale-data    │  │ sync-finale-graphql     │                   │
│  │ (REST API)          │  │ (GraphQL API)           │                   │
│  │                     │  │                         │                   │
│  │ • Products w/ BOMs  │  │ • Products w/ Stock     │                   │
│  │ • Vendors           │  │ • Purchase Orders       │                   │
│  │ • productAssocList  │  │ • Enhanced filtering    │                   │
│  └─────────────────────┘  └─────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      SUPABASE DATABASE                                   │
│                                                                          │
│  STAGING TABLES (Finale-specific)        APP TABLES (MuRP uses these)   │
│  ┌─────────────────────────────┐        ┌─────────────────────────┐     │
│  │ finale_products             │ ──────▶│ inventory_items         │     │
│  │ finale_vendors              │ ──────▶│ vendors                 │     │
│  │ finale_purchase_orders      │        │ boms (+ components JSONB)│    │
│  │ finale_boms                 │ ──────▶│                         │     │
│  └─────────────────────────────┘        └─────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Sync Functions

### 1. `sync-finale-data` (REST API)

**Purpose**: Fetch products with BOMs and vendors from REST API

**Endpoint**: `POST /functions/v1/sync-finale-data`

**What it syncs**:
- Products from `/api/product` (columnar format)
- BOMs extracted from `productAssocList` field
- Vendors from `/api/partygroup`

**Tables updated**:
| Table | Data |
|-------|------|
| `finale_products` | Raw product data |
| `inventory_items` | App-compatible format |
| `finale_boms` | Individual BOM components |
| `boms` | Aggregated assemblies with JSONB components |
| `finale_vendors` | Raw vendor data |
| `vendors` | App-compatible format |

**Configuration**:
```bash
# Required secrets in Supabase
FINALE_API_KEY=xxx
FINALE_API_SECRET=xxx
FINALE_ACCOUNT_PATH=buildasoilorganics
```

### 2. `sync-finale-graphql` (GraphQL API)

**Purpose**: Fetch products with stock levels and purchase orders

**Endpoint**: `POST /functions/v1/sync-finale-graphql`

**What it syncs**:
- Products with stock columns (per-facility breakdown)
- Purchase orders (REST API filter is broken - GraphQL required!)
- Vendors with full contact details

**Tables updated**:
| Table | Data |
|-------|------|
| `finale_products` | Products with stock levels |
| `inventory_items` | Stock values from BuildASoil Shipping |
| `finale_purchase_orders` | All POs |
| `finale_vendors` | Enhanced vendor data |

**Stock Columns Queried**:
```graphql
stockMain: stockColumnQuantityOnHandUnitsBuildasoilorganicsapifacility10000
stockMfg: stockColumnQuantityOnHandUnitsBuildasoilorganicsapifacility10003
stockShipping: stockColumnQuantityOnHandUnitsBuildasoilorganicsapifacility10005  # PRIMARY
stock59: stockColumnQuantityOnHandUnitsBuildasoilorganicsapifacility10059
stock109: stockColumnQuantityOnHandUnitsBuildasoilorganicsapifacility10109
```

### 3. `auto-sync-finale` (Orchestrator)

**Purpose**: Coordinate both sync functions

**Endpoint**: `POST /functions/v1/auto-sync-finale`

**Request body**:
```json
{
  "syncType": "all",  // Options: "all", "rest", "graphql"
  "force": true       // Optional: bypass interval checks
}
```

**Response**:
```json
{
  "success": true,
  "message": "Auto-sync complete: 2/2 functions succeeded",
  "results": [
    {
      "function": "sync-finale-data",
      "success": true,
      "results": [...],
      "duration": 6572
    },
    {
      "function": "sync-finale-graphql", 
      "success": true,
      "results": [...],
      "duration": 36632
    }
  ],
  "totalDuration": 43206
}
```

---

## Database Tables

### Staging Tables (Finale-specific)

#### `finale_products`
| Column | Type | Description |
|--------|------|-------------|
| finale_product_url | TEXT (PK) | Unique Finale URL |
| product_id | TEXT | SKU/Product ID |
| description | TEXT | Product description |
| status | TEXT | Active/Inactive |
| product_type | TEXT | Category |
| unit_cost | NUMERIC | Cost per unit |
| raw_data | JSONB | Full Finale response |
| synced_at | TIMESTAMP | Last sync time |

#### `finale_vendors`
| Column | Type | Description |
|--------|------|-------------|
| finale_party_url | TEXT (PK) | Unique Finale URL |
| party_id | TEXT | Vendor ID |
| party_name | TEXT | Vendor name |
| email | TEXT | Contact email |
| phone | TEXT | Phone number |
| raw_data | JSONB | Full Finale response |

#### `finale_purchase_orders`
| Column | Type | Description |
|--------|------|-------------|
| finale_po_url | TEXT (PK) | Unique Finale URL |
| po_number | TEXT | PO number |
| vendor_id | TEXT | Vendor reference |
| status | TEXT | Order status |
| order_date | TIMESTAMP | Order date |
| items | JSONB | Line items |
| raw_data | JSONB | Full Finale response |

#### `finale_boms`
| Column | Type | Description |
|--------|------|-------------|
| finale_bom_url | TEXT (PK) | Unique URL |
| parent_sku | TEXT | Parent product |
| component_sku | TEXT | Component product |
| quantity_per | NUMERIC | Quantity per parent |
| raw_data | JSONB | Full Finale response |

### App Tables (MuRP uses these)

#### `inventory_items`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Primary key |
| sku | TEXT (UNIQUE) | Product SKU |
| name | TEXT | Product name |
| stock | INTEGER | Current stock (from BuildASoil Shipping) |
| on_order | INTEGER | Quantity on order |
| reorder_point | INTEGER | Reorder threshold |

#### `boms`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Primary key |
| finished_sku | TEXT (UNIQUE) | Assembly SKU |
| name | TEXT | Assembly name |
| components | JSONB | Array of {sku, name, quantity, unit} |
| data_source | TEXT | "finale_api" |
| sync_status | TEXT | "synced" |

---

## Scheduling & Automation

### Manual Trigger

```bash
# Full sync
curl -X POST "https://<project>.supabase.co/functions/v1/auto-sync-finale" \
  -H "Authorization: Bearer <anon_key>" \
  -H "Content-Type: application/json" \
  -d '{"syncType": "all"}'

# REST only (products, BOMs, vendors)
curl -X POST "https://<project>.supabase.co/functions/v1/auto-sync-finale" \
  -H "Authorization: Bearer <anon_key>" \
  -d '{"syncType": "rest"}'

# GraphQL only (stock, POs)
curl -X POST "https://<project>.supabase.co/functions/v1/auto-sync-finale" \
  -H "Authorization: Bearer <anon_key>" \
  -d '{"syncType": "graphql"}'
```

### Recommended Schedule

| Sync Type | Frequency | Duration |
|-----------|-----------|----------|
| Full sync | Every 4 hours | ~45 seconds |
| PO-only | Every 15 minutes | ~25 seconds |
| Stock-only | Every hour | ~15 seconds |

### Setting up pg_cron (in Supabase Dashboard)

**NOTE:** pg_cron is now automatically configured via migration 081!

The following schedules are active:
- **Full sync**: Every 12 hours (1 AM and 1 PM UTC / ~6 AM and 6 PM MT)
- **PO sync**: Every hour at minute 30
- **Shipment sync**: Every 6 hours (for velocity calculations)

```sql
-- View current schedules
SELECT * FROM cron.job;

-- View sync state
SELECT * FROM sync_dashboard;

-- Manually trigger sync
SELECT trigger_auto_sync('all');  -- Full sync
SELECT trigger_auto_sync('graphql');  -- PO/stock only
SELECT trigger_shipment_sync();  -- Shipments for velocity

-- Check sync history
SELECT * FROM finale_sync_state;
```

---

## Data Filtering Rules

### Products

1. **NEVER include "Deprecating" category** - Filtered at sync time
2. **Only ACTIVE status** - GraphQL filter + cleanup query
3. **Max 3000 products** - Pagination limit to prevent timeouts

### Stock Levels

**Priority order for stock value**:
1. BuildASoil Shipping (facility 10005) - **PRIMARY**
2. Total of all facilities - fallback if shipping is 0

```typescript
// Stock calculation logic
const shippingStock = getShippingStock(node);  // Facility 10005
const totalStock = calculateTotalStock(node);   // All facilities
stock = shippingStock > 0 ? shippingStock : totalStock;
```

### Purchase Orders

⚠️ **IMPORTANT**: REST API `orderTypeId` filter is broken in Finale!
- REST returns ALL order types regardless of filter
- GraphQL is the ONLY reliable way to filter POs

---

## API Endpoints

### Finale REST API

```
Base URL: https://app.finaleinventory.com/{account}/api

GET /product                    # Products (columnar)
GET /product/{id}              # Single product with BOM
GET /partygroup                # Vendors (columnar)
GET /order                     # Orders (FILTER BROKEN!)
```

### Finale GraphQL API

```
POST /api/graphql

Queries:
- productViewConnection       # Products with stock
- partyViewConnection         # Vendors
- purchaseOrderViewConnection # Purchase orders (use this, not REST!)
```

### Supabase Edge Functions

```
POST /functions/v1/auto-sync-finale    # Orchestrator
POST /functions/v1/sync-finale-data    # REST sync
POST /functions/v1/sync-finale-graphql # GraphQL sync
```

---

## Troubleshooting

### Common Issues

#### 1. "All products show as PRODUCT_INACTIVE"

**Cause**: REST API statusId field has different values than GraphQL
**Solution**: Use GraphQL for status filtering, REST for BOM extraction

#### 2. "BOMs not syncing"

**Cause**: BOMs are in `productAssocList` which requires iterating all products
**Solution**: Ensure `sync-finale-data` completes - it extracts BOMs

#### 3. "Stock levels are 0"

**Cause**: Stock columns are facility-specific in GraphQL
**Solution**: Check `stockShipping` field (facility 10005)

#### 4. "Purchase Orders missing"

**Cause**: REST API filter is broken
**Solution**: Use `sync-finale-graphql` for POs

### Debug Commands

```bash
# Check sync status
curl "https://<project>.supabase.co/rest/v1/sync_metadata" \
  -H "apikey: <anon_key>"

# Check product counts
curl "https://<project>.supabase.co/rest/v1/finale_products?select=status" \
  -H "apikey: <anon_key>" \
  -H "Prefer: count=exact" -I

# Check BOM counts
curl "https://<project>.supabase.co/rest/v1/boms?select=finished_sku,components" \
  -H "apikey: <anon_key>"
```

### Logs

View function logs in Supabase Dashboard:
`Dashboard > Edge Functions > [function-name] > Logs`

---

## Velocity & Consumption Tracking

### Overview

Velocity data is **CRITICAL** for MRP forecasting. The system calculates:
- 30/60/90 day consumption from shipment history
- Daily velocity (units/day)
- ABC velocity classification (A=High, B=Medium, C=Low, D=VeryLow, F=NoMovement)
- Days of stock remaining at current velocity

### Data Flow

```
Finale Shipments → sync-finale-shipments → finale_stock_history
                                                  ↓
                                      refresh_inventory_velocity()
                                                  ↓
                                      inventory_items (sales_30_days, sales_velocity, etc.)
                                                  ↓
                                      inventory_velocity_summary view
```

### Tables & Views

**finale_stock_history** - Raw transaction log
- Stores outbound shipments (negative quantities)
- Source for all velocity calculations

**inventory_items** - Updated velocity columns:
- `sales_30_days` - Units consumed in last 30 days
- `sales_60_days` - Units consumed in last 60 days
- `sales_90_days` - Units consumed in last 90 days
- `sales_velocity` - Daily average (sales_30_days / 30)

**inventory_velocity_summary** - Dashboard view:
- Days of stock remaining
- ABC velocity classification
- Reorder urgency (CRITICAL/LOW/WATCH/OK)

### SQL Functions

```sql
-- Calculate velocity for single product
SELECT * FROM calculate_product_velocity('/buildasoilorganics/api/product/12345');

-- Batch update all inventory items
SELECT refresh_inventory_velocity();

-- View velocity summary
SELECT * FROM inventory_velocity_summary WHERE velocity_class IN ('A', 'B');
```

### Scheduled Sync

Shipment sync runs every 6 hours via pg_cron:
- Fetches last 90 days of shipments from Finale
- Populates finale_stock_history table
- Triggers velocity recalculation

```sql
-- Manually trigger shipment sync
SELECT trigger_shipment_sync();

-- Check velocity data
SELECT sku, name, sales_velocity, days_of_stock, velocity_class
FROM inventory_velocity_summary
ORDER BY sales_velocity DESC
LIMIT 20;
```

---

## Quick Reference

### Environment Variables Required

```bash
# Supabase
SUPABASE_URL=https://mpuevsmtowyexhsqugkm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_ANON_KEY=xxx

# Finale
FINALE_API_KEY=xxx
FINALE_API_SECRET=xxx
FINALE_ACCOUNT_PATH=buildasoilorganics
FINALE_BASE_URL=https://app.finaleinventory.com
```

### Data Counts (December 2025)

| Table | Count | Notes |
|-------|-------|-------|
| finale_products | 954 | Active only |
| finale_vendors | 908 | All suppliers |
| finale_purchase_orders | 1000 | Via GraphQL |
| finale_boms | 506 | Components |
| boms | 90 | Assemblies |
| inventory_items | 4400 | App format |
| finale_stock_history | TBD | Shipment transactions |

---

## Related Files

- `supabase/functions/auto-sync-finale/index.ts` - Orchestrator
- `supabase/functions/sync-finale-data/index.ts` - REST sync
- `supabase/functions/sync-finale-graphql/index.ts` - GraphQL sync
- `supabase/functions/sync-finale-shipments/index.ts` - Shipment/velocity sync
- `hooks/useSupabaseData.ts` - App data hooks
- `components/EnhancedBomCard.tsx` - BOM display

---

*Last updated: December 9, 2025*
*Version: 2.1.0*
