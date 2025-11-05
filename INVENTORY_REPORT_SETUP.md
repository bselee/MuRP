# Inventory Report Setup Guide

## Overview
This guide explains how to configure the Finale Inventory Report URL for CSV synchronization.

## New Inventory Report URL (2025-11-05)

The latest inventory report has been generated with the following configuration:

```
https://app.finaleinventory.com/buildasoilorganics/doc/report/pivotTableStream/1762355976575/Report.csv?format=csv&data=product&attrName=%23%23user032&rowDimensions=~3AAlms0B_sDM_sDAwMDAwMCazQHUwMz-wMDAwMDAwJrNAc3AzP7AwMDAwMDAms0B5MDM_sDAwMDAwMCar3Byb2R1Y3RMZWFkVGltZcDM_sDAwMDAwMCazQINwMz-wMDAwMDAwJrNAg7AzP7AwMDAwMDAmrhwcm9kdWN0U3RkUmVvcmRlck1heERheXPAzP7AwMDAwMDAms0CD8DM_sDAwMDAwMCa2Sxwcm9kdWN0U3RkUmVvcmRlckNhbGN1bGF0aW9uTWV0aG9kVGltZVBlcmlvZMDM_sDAwMDAwMCa2SNwcm9kdWN0U3RkUmVvcmRlclByb2Nlc3NpbmdMZWFkVGltZcDM_sDAwMDAwMCavHByb2R1Y3RTdGRSZW9yZGVyU2FmZXR5U3RvY2vAzP7AwMDAwMDAmrxwcm9kdWN0U3RkUmVvcmRlclVzYWdlR3Jvd3RowMz-wMDAwMDAwJrNAjDAzP7AwMDAwMDAms0CMsDM_sDAwMDAwMCazQIcwMz-wMDAwMDAwJrNAh_AzP7AwMDAwMDAms0CHsDM_sDAwMDAwMCazQIgwMz-wMDAwMDAwJrNAiLAzP7AwMDAwMDAms0CJcDM_sDAwMDAwMCazQIkwMz-wMDAwMDAwJrNAibAzP7AwMDAwMDAmrVwcm9kdWN0V2hvbGVzYWxlUHJpY2XAzP7AwMDAwMDAmrZwcm9kdWN0QnVpbGRBU29pbFByaWNlwMz-wMDAwMDAwJq0cHJvZHVjdFVzZXJVc2VyMTAwMDDAzP7AwMDAwMDAmrRwcm9kdWN0VXNlclVzZXIxMDAwMcDM_sDAwMDAwMCatHByb2R1Y3RVc2VyVXNlcjEwMDAywMz-wMDAwMDAwJq0cHJvZHVjdFVzZXJVc2VyMTAwMDPAzP7AwMDAwMDAmrRwcm9kdWN0VXNlclVzZXIxMDAwNMDM_sDAwMDAwMCatHByb2R1Y3RVc2VyVXNlcjEwMDA1wMz-wMDAwMDAwJq0cHJvZHVjdFVzZXJVc2VyMTAwMDjAzP7AwMDAwMDAmrRwcm9kdWN0VXNlclVzZXIxMDAwOcDM_sDAwMDAwMCatHByb2R1Y3RVc2VyVXNlcjEwMDEwwMz-wMDAwMDAwJq0cHJvZHVjdFVzZXJVc2VyMTAwMTHAzP7AwMDAwMDAmrRwcm9kdWN0VXNlclVzZXIxMDAxMsDM_sDAwMDAwMCatHByb2R1Y3RVc2VyVXNlcjEwMDEwwMz-wMDAwMDAwA&filters=W1sicHJvZHVjdFN0YXR1cyIsWyJQUk9EVUNUX0FDVElWRSJdLG51bGxdLFsicHJvZHVjdENhdGVnb3J5IixudWxsLG51bGxdXQ%3D%3D&reportTitle=BuildASoil%20Master%20Inventory%20List%20
```

## Environment Configuration

Add this URL to your `.env.local` file:

```bash
FINALE_INVENTORY_REPORT_URL=https://app.finaleinventory.com/buildasoilorganics/doc/report/pivotTableStream/1762355976575/Report.csv?format=csv&data=product&attrName=%23%23user032&rowDimensions=~3AAlms0B_sDM_sDAwMDAwMCazQHUwMz-wMDAwMDAwJrNAc3AzP7AwMDAwMDAms0B5MDM_sDAwMDAwMCar3Byb2R1Y3RMZWFkVGltZcDM_sDAwMDAwMCazQINwMz-wMDAwMDAwJrNAg7AzP7AwMDAwMDAmrhwcm9kdWN0U3RkUmVvcmRlck1heERheXPAzP7AwMDAwMDAms0CD8DM_sDAwMDAwMCa2Sxwcm9kdWN0U3RkUmVvcmRlckNhbGN1bGF0aW9uTWV0aG9kVGltZVBlcmlvZMDM_sDAwMDAwMCa2SNwcm9kdWN0U3RkUmVvcmRlclByb2Nlc3NpbmdMZWFkVGltZcDM_sDAwMDAwMCavHByb2R1Y3RTdGRSZW9yZGVyU2FmZXR5U3RvY2vAzP7AwMDAwMDAmrxwcm9kdWN0U3RkUmVvcmRlclVzYWdlR3Jvd3RowMz-wMDAwMDAwJrNAjDAzP7AwMDAwMDAms0CMsDM_sDAwMDAwMCazQIcwMz-wMDAwMDAwJrNAh_AzP7AwMDAwMDAms0CHsDM_sDAwMDAwMCazQIgwMz-wMDAwMDAwJrNAiLAzP7AwMDAwMDAms0CJcDM_sDAwMDAwMCazQIkwMz-wMDAwMDAwJrNAibAzP7AwMDAwMDAmrVwcm9kdWN0V2hvbGVzYWxlUHJpY2XAzP7AwMDAwMDAmrZwcm9kdWN0QnVpbGRBU29pbFByaWNlwMz-wMDAwMDAwJq0cHJvZHVjdFVzZXJVc2VyMTAwMDDAzP7AwMDAwMDAmrRwcm9kdWN0VXNlclVzZXIxMDAwMcDM_sDAwMDAwMCatHByb2R1Y3RVc2VyVXNlcjEwMDAywMz-wMDAwMDAwJq0cHJvZHVjdFVzZXJVc2VyMTAwMDPAzP7AwMDAwMDAmrRwcm9kdWN0VXNlclVzZXIxMDAwNMDM_sDAwMDAwMCatHByb2R1Y3RVc2VyVXNlcjEwMDA1wMz-wMDAwMDAwJq0cHJvZHVjdFVzZXJVc2VyMTAwMDjAzP7AwMDAwMDAmrRwcm9kdWN0VXNlclVzZXIxMDAwOcDM_sDAwMDAwMCatHByb2R1Y3RVc2VyVXNlcjEwMDEwwMz-wMDAwMDAwJq0cHJvZHVjdFVzZXJVc2VyMTAwMTHAzP7AwMDAwMDAmrRwcm9kdWN0VXNlclVzZXIxMDAxMsDM_sDAwMDAwMCatHByb2R1Y3RVc2VyVXNlcjEwMDEwwMz-wMDAwMDAwA&filters=W1sicHJvZHVjdFN0YXR1cyIsWyJQUk9EVUNUX0FDVElWRSJdLG51bGxdLFsicHJvZHVjdENhdGVnb3J5IixudWxsLG51bGxdXQ%3D%3D&reportTitle=BuildASoil%20Master%20Inventory%20List%20
```

## Report Configuration

The report is configured with the following filters:
- **Product Status**: `PRODUCT_ACTIVE` (active items only)
- **Product Category**: All categories
- **Report Title**: BuildASoil Master Inventory List

### Fields Included
The report includes comprehensive product data:
- SKU, Name, Description, Category
- Stock levels (In Stock, On Order, Reserved)
- Pricing (Unit Cost, Wholesale Price, BuildASoil Price)
- Reorder intelligence (Reorder Point, Variance, Qty to Order)
- Warehouse location and bin location
- Sales velocity and historical sales data
- Vendor/Supplier information
- Custom user fields

## How the Sync Works

1. **API Proxy** (`/api/finale-proxy.ts`):
   - Fetches CSV data from the report URL
   - Uses Basic Auth with Finale credentials
   - Parses CSV and validates rows

2. **Transformers** (`lib/schema/transformers.ts`):
   - Applies filters: ACTIVE items only, SHIPPING warehouse only
   - Maps CSV columns to standardized field names
   - Validates data quality (SKU, name required)
   - Tracks filtering statistics

3. **Sync Service** (`services/finaleSyncService.ts`):
   - Runs every 5 minutes (configurable)
   - Builds vendor ID map for linking
   - Deduplicates items by SKU
   - Upserts to Supabase with conflict resolution

## Debugging Enhanced CSV Fetch

The latest update includes comprehensive logging:

### Console Logs to Check:
1. **CSV Preview**: First 500 characters of fetched CSV
2. **Filter Statistics**:
   - Total rows processed
   - Successful transformations
   - Items filtered by status (inactive)
   - Items filtered by location (non-shipping)
   - Missing data errors

### Example Output:
```
[Finale Proxy] Inventory CSV data received: 125000 characters
[Finale Proxy] CSV Preview (first 500 chars): SKU,Name,Status,Location...
[Finale Proxy] Parsed 150 raw inventory items from CSV
[Finale Proxy] 145 valid inventory items after filtering
[Inventory Transform] Filter Statistics:
  - Total rows processed: 145
  - ✓ Successful: 120
  - ✗ Inactive items filtered: 15
  - ✗ Non-shipping location filtered: 8
  - ✗ Missing data: 2
  - ✗ Other errors: 0
```

## Troubleshooting

### No Items Returned (0 items)
Check:
1. Report URL is correct and not expired
2. Report contains active items
3. Items are in the "Shipping" warehouse location
4. CSV has valid SKU and Name columns

### Items Filtered Out
If items are being filtered, check the console logs for:
- `FILTER: Skipping inactive item` - Item status is not "active"
- `FILTER: Skipping non-shipping location` - Item is not in "Shipping" warehouse
- Missing SKU or Name fields

### Report URL Expired
Finale report URLs can expire. To generate a new one:
1. Log into Finale
2. Go to Reports → Custom Reports
3. Find "BuildASoil Master Inventory List"
4. Click "Export" → "CSV"
5. Copy the new URL from the download link
6. Update FINALE_INVENTORY_REPORT_URL in .env.local

## Next Steps

1. Update your `.env.local` with the new report URL
2. Restart your development server
3. Monitor the console logs during sync
4. Check the Inventory page for:
   - Gmail compose links for vendors
   - Source badges (CSV/API/Manual)
   - BOM indicators
5. Verify data quality and filtering is working as expected

## Related Documentation
- [Inventory Sync Success Report](./INVENTORY_SYNC_SUCCESS.md)
- [Finale API Proxy](./api/finale-proxy.ts)
- [Schema Transformers](./lib/schema/transformers.ts)
- [Sync Service](./services/finaleSyncService.ts)
