# MuRP Data Connections Guide

**Last Updated:** December 12, 2025
**Status:** Production Ready
**Audience:** Users, Admins, Developers

---

## Overview

MuRP supports **4 ways to connect your data**:

| Method | Best For | Setup Time | Real-time Sync | Skill Level |
|--------|----------|------------|----------------|-------------|
| **1. Finale API** | BuildASoil (primary production system) | 5 min | ✅ Auto (hourly) | Beginner |
| **2. Google Sheets** | Collaboration, backups, manual entry | 10 min | ⚠️ Manual | Beginner |
| **3. CSV/Excel Upload** | One-time imports, migrations | 2 min | ❌ Manual | Beginner |
| **4. Manual Entry** | Small datasets, quick edits | 0 min | ✅ Instant | Beginner |

---

## Quick Decision Tree

```
START: How do you want to connect data?

┌─────────────────────────────────────────────────────────┐
│ Do you use Finale Inventory?                           │
└──┬──────────────────────────────────────────────────┬───┘
   YES                                                 NO
   │                                                   │
   ▼                                                   ▼
[1. Finale API Integration]              ┌────────────────────────────┐
✅ Automatic sync every hour              │ Do you need collaboration? │
✅ Real-time inventory                    └──┬─────────────────────┬───┘
✅ Purchase orders                           YES                  NO
✅ BOMs                                      │                    │
✅ Vendors                                   ▼                    ▼
   │                            [2. Google Sheets]    [3. CSV Upload]
   │                            ✅ Team editing       ✅ One-time import
   │                            ✅ Backups            ✅ Fast setup
   │                            ✅ Formulas           ✅ Template provided
   │                                   │                    │
   └───────────────┬───────────────────┴────────────────────┘
                   │
                   ▼
     ┌──────────────────────────────┐
     │ Need to add individual items?│
     └──┬───────────────────────┬───┘
        YES                     NO
        │                       │
        ▼                       ▼
[4. Manual Entry]     You're all set! ✅
✅ Quick SKU creation
✅ No import needed
✅ Instant updates
```

---

## Method 1: Finale API Integration

### What is it?
Automatic synchronization with Finale Inventory using their REST and GraphQL APIs.

### When to use:
- ✅ You use Finale Inventory as your primary system
- ✅ You want real-time data without manual exports
- ✅ You need BOMs, POs, and vendor data
- ✅ You want automatic hourly sync

### Features:
- **Auto-sync:** Every hour (configurable)
- **Data types:** Products, Vendors, Purchase Orders, BOMs, Stock Levels
- **Filtering:** Automatically excludes inactive, dropship, and deprecated items
- **Velocity tracking:** 30/60/90-day consumption data

### Setup (5 minutes):

1. **Get Finale Credentials**
   - Log in to Finale → Settings → API
   - Note your Account Path (e.g., `buildasoilorganics`)
   - Get API Key and API Secret

2. **Configure in MuRP**
   - Go to Settings → API Integrations → Finale Setup
   - Enter:
     - Account Path
     - API Key
     - API Secret
   - Click "Save & Test Connection"

3. **Run Initial Sync**
   - Click "Sync Now"
   - Wait 30-60 seconds for first sync
   - Verify data imported in Inventory page

4. **Enable Auto-Sync**
   - Toggle "Auto-sync enabled"
   - Choose sync interval (recommended: hourly)
   - Save settings

### What gets synced:

```
Finale → MuRP
├─ Products (Active only, filtered)
│  ├─ SKU, Name, Description
│  ├─ Stock levels (BuildASoil Shipping facility)
│  ├─ Unit cost
│  └─ Category
├─ Vendors
│  ├─ Name, Contact emails
│  ├─ Phone, Address
│  └─ Lead time days
├─ Purchase Orders
│  ├─ PO number, Status
│  ├─ Line items
│  └─ Tracking info
└─ BOMs (Bill of Materials)
   ├─ Finished SKU
   ├─ Component SKUs
   └─ Quantities per assembly
```

### Data Filtering (Automatic):

MuRP **automatically filters out:**
1. ❌ **Inactive items** - `status ≠ 'Active'`
2. ❌ **Dropshipped items** - `dropshipped = 'yes'`
3. ❌ **Deprecated categories** - Category contains 'inactive' or 'deprecating'
4. ❌ **Non-shipping locations** - Only imports from 'BuildASoil Shipping' facility
5. ❌ **Missing data** - No SKU or name

**Why?** These filters ensure clean data and prevent duplicate/incorrect items.

**Can I override?** Not currently - unified filter UI coming soon (see [DATA_ACQUISITION_ANALYSIS.md](docs/DATA_ACQUISITION_ANALYSIS.md))

### Troubleshooting:

| Issue | Solution |
|-------|----------|
| "Connection failed" | Verify API credentials in Finale Settings |
| "0 items synced" | Check if CSV report URLs are expired (regenerate in Finale) |
| "Stale data" warning | Click "Sync Now" to manually trigger sync |
| "Products show as inactive" | Use GraphQL sync (not REST) - auto-configured |

**Full details:** [FINALE_DATA_SYNC.md](docs/FINALE_DATA_SYNC.md)

---

## Method 2: Google Sheets Integration

### What is it?
Import/export inventory data to/from Google Sheets for collaboration and backups.

### When to use:
- ✅ You want team collaboration on inventory
- ✅ You need manual data entry with spreadsheet formulas
- ✅ You want automatic backups after Finale syncs
- ✅ You don't use Finale or need supplemental data

### Features:
- **Import:** From collaborative Google Sheets
- **Export:** One-click export to shareable spreadsheet
- **Backups:** Automatic timestamped backups
- **Merge strategies:** Update existing, add new only, or replace all

### Setup (10 minutes):

1. **Create Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create project: "MuRP Integration"
   - Enable: Google Sheets API, Google Drive API

2. **Get OAuth Credentials**
   - APIs & Services → Credentials → Create OAuth 2.0 Client ID
   - Application Type: Web application
   - Authorized redirect URI: `https://yourapp.com/api/google-auth/callback`
   - Copy Client ID and Client Secret

3. **Configure in MuRP**
   - Settings → Google Sheets Integration
   - Enter Client ID and Client Secret
   - Click "Connect Google Account"
   - Authorize MuRP to access your Sheets

4. **Test Import**
   - Create a test Google Sheet
   - Add headers: SKU, Name, Quantity, Reorder Point
   - Add sample data
   - Click "Import from Google Sheets"
   - Paste spreadsheet URL, select sheet name
   - Choose merge strategy: "Update Existing"
   - Click "Import Inventory"

### Supported Columns (auto-detected):

| Column Header | Maps To | Required |
|---------------|---------|----------|
| SKU / Product Code | sku | ✅ Yes |
| Name / Product Name | name | ✅ Yes |
| Description / Details | description | Optional |
| Category / Type | category | Optional |
| Quantity / QTY / Stock | stock | ✅ Yes |
| Reorder Point / Min Qty | reorder_point | ✅ Yes |
| Unit Cost / Cost | unit_cost | Optional |
| Supplier / Vendor | vendor_name | Optional |
| Status | status | Optional |
| Dropship | is_dropship | Optional |

### Merge Strategies:

1. **Update Existing (Recommended)**
   - Updates SKUs that already exist
   - Adds new SKUs not in database
   - Preserves data not in spreadsheet
   - **Use when:** Collaborative editing

2. **Add New Only**
   - Only imports SKUs not already in database
   - Skips existing SKUs
   - **Use when:** Adding new products without overwriting existing

3. **Replace All**
   - **⚠️ Deletes all existing inventory**
   - Imports fresh data from spreadsheet
   - Creates backup before deletion
   - **Use when:** Full data migration or reset

### Safety Features:

- ✅ **Pre-import validation** - Aborts if data looks suspicious
- ✅ **Automatic backups** - Before every overwrite
- ✅ **Audit logging** - Tracks all imports/exports
- ✅ **Rollback capability** - Restore from any backup

### Troubleshooting:

| Issue | Solution |
|-------|----------|
| "OAuth client not initialized" | Add `GOOGLE_CLIENT_ID` to environment variables |
| "Failed to read sheet" | Check sheet name spelling, verify permissions |
| "Import validation failed" | Ensure first row has headers (SKU, Name, Quantity) |
| "No refresh token" | Disconnect and reconnect to force new consent |

**Full details:** [GOOGLE_SHEETS_INTEGRATION.md](GOOGLE_SHEETS_INTEGRATION.md)

---

## Method 3: CSV/Excel Upload

### What is it?
Upload CSV or Excel files directly to import inventory data.

### When to use:
- ✅ One-time import or migration
- ✅ Exporting from another system
- ✅ Quick bulk updates
- ✅ Don't want to set up API/OAuth

### Features:
- **Fast setup:** Download template, fill it out, upload
- **Offline editing:** Use Excel or Google Sheets offline
- **Batch operations:** Import thousands of items at once
- **Validation:** Checks data before importing

### Setup (2 minutes):

1. **Download Template**
   - Go to Inventory page
   - Click "Import/Export"
   - Click "Download CSV Template"

2. **Fill Out Template**
   - Open in Excel or Google Sheets
   - Enter inventory data
   - Follow column headers exactly

3. **Upload File**
   - Click "Import/Export" → "Upload CSV"
   - Select your filled template
   - Click "Import"
   - Review validation results
   - Confirm import

### Template Structure:

```csv
sku,name,category,stock,on_order,reorder_point,reorder_quantity,moq,vendor_name,unit_cost,status,dropship,location
COMP-001,Worm Castings (1 lb),Amendments,500,100,200,500,50,ABC Supply,12.50,Active,No,Shipping
COMP-002,Kelp Meal (5 lb),Amendments,250,0,100,300,25,XYZ Farms,25.00,Active,No,Shipping
```

### Required Columns:

- ✅ `sku` - Product SKU (unique)
- ✅ `name` - Product name
- ✅ `stock` - Current quantity
- ✅ `reorder_point` - When to reorder
- ✅ `status` - Active or Inactive

### Optional Columns:

- `category` - Product category
- `on_order` - Quantity on order
- `reorder_quantity` - How much to order
- `moq` - Minimum order quantity
- `vendor_name` - Supplier name
- `unit_cost` - Cost per unit
- `dropship` - Yes/No (dropship items)
- `location` - Warehouse location

### Data Filtering (Same as Finale):

When you upload a CSV, MuRP applies the **same filters** as Finale sync:
- ❌ Skips items with `status ≠ 'Active'` (unless override enabled)
- ❌ Skips items with `dropship = 'Yes'` (unless override enabled)
- ❌ Skips items missing SKU or name

**Preview before import:** See what will be filtered before confirming.

### Troubleshooting:

| Issue | Solution |
|-------|----------|
| "CSV parse error" | Ensure file is valid CSV format, check for extra commas |
| "Column 'sku' not found" | First row must have headers matching template |
| "Duplicate SKU" | Each SKU must be unique across your inventory |
| "Upload failed" | Check file size < 10 MB, contact admin if persistent |

**Note:** CSV upload is currently **UI-only** (non-functional). Implementation guide: [DATA_ACQUISITION_ANALYSIS.md](docs/DATA_ACQUISITION_ANALYSIS.md) Phase 5

---

## Method 4: Manual Entry

### What is it?
Add individual inventory items directly in the MuRP UI.

### When to use:
- ✅ Adding a few items quickly
- ✅ Editing existing item details
- ✅ Creating test data
- ✅ No bulk import needed

### Features:
- **Instant:** No import/sync delays
- **Simple:** Form-based entry
- **Validation:** Real-time field validation
- **Flexible:** Add any custom fields

### How to use:

1. **Add New Item**
   - Go to Inventory page
   - Click "+ New Item" button
   - Fill out form:
     - SKU (required, unique)
     - Name (required)
     - Category
     - Stock quantity
     - Reorder point
     - Vendor
     - Unit cost
   - Click "Save"

2. **Edit Existing Item**
   - Click item row in inventory table
   - Click "Edit" button
   - Update fields
   - Click "Save"

3. **Bulk Actions**
   - Select multiple items (checkboxes)
   - Choose action: Update category, Update vendor, Delete
   - Confirm changes

### Limitations:
- ❌ Not practical for 100+ items
- ❌ No formulas or calculations
- ❌ Manual data entry errors possible

### When to combine with imports:
- Use Finale/Google Sheets for bulk data
- Use manual entry for exceptions:
  - New vendor samples
  - Special orders
  - Test products

---

## Comparison Matrix

| Feature | Finale API | Google Sheets | CSV Upload | Manual Entry |
|---------|-----------|---------------|------------|--------------|
| **Setup Time** | 5 min | 10 min | 2 min | 0 min |
| **Auto-sync** | ✅ Yes (hourly) | ⚠️ Manual | ❌ No | ✅ Instant |
| **Collaboration** | ❌ No | ✅ Yes | ❌ No | ❌ No |
| **Bulk Import** | ✅ Automatic | ✅ Yes | ✅ Yes | ❌ No |
| **Real-time** | ✅ Yes | ⚠️ Manual | ❌ No | ✅ Yes |
| **Offline Editing** | ❌ No | ✅ Yes | ✅ Yes | ❌ No |
| **Backups** | ✅ Auto | ✅ Auto | ⚠️ Manual | ✅ Auto |
| **BOMs** | ✅ Yes | ❌ No | ❌ No | ⚠️ Manual |
| **Purchase Orders** | ✅ Yes | ❌ No | ❌ No | ⚠️ Manual |
| **Filtering** | ✅ Auto | ❌ No | ⚠️ Coming | N/A |
| **Skill Level** | Beginner | Beginner | Beginner | Beginner |
| **Cost** | Free | Free | Free | Free |

---

## Recommended Workflows

### Workflow 1: Finale as Primary (Most Common)

```
Finale Inventory (Single Source of Truth)
  ↓ (Auto-sync every hour)
MuRP (Analytics & Planning)
  ↓ (Auto-backup after sync)
Google Sheets (Team Collaboration & Backup)
```

**Setup:**
1. Configure Finale API integration
2. Enable auto-sync (hourly)
3. Enable auto-backup to Google Sheets
4. Team edits in Google Sheets → Import to MuRP when ready

### Workflow 2: Google Sheets as Primary

```
Google Sheets (Team Collaboration)
  ↓ (Manual import when ready)
MuRP (Analytics & Approval)
  ↓ (Export reports)
PDF/Excel Reports (Stakeholders)
```

**Setup:**
1. Create master Google Sheet template
2. Team enters data in Sheets
3. Import to MuRP for validation
4. Export reports for stakeholders

### Workflow 3: Hybrid (Finale + Manual)

```
Finale API (Bulk Products)
  ↓ (Auto-sync)
MuRP Database
  ↑ (Manual entry)
Special Orders & Samples
```

**Setup:**
1. Finale for main inventory
2. Manual entry for:
   - Vendor samples
   - Special/custom orders
   - Test products

### Workflow 4: Migration from Another System

```
Old System
  ↓ (Export to CSV)
CSV File (cleaned up)
  ↓ (Upload)
MuRP Database
  ↓ (Setup going forward)
Finale API or Google Sheets
```

**Setup:**
1. Export from old system to CSV
2. Clean up data (match template)
3. Upload to MuRP
4. Going forward: Use Finale or Google Sheets

---

## Best Practices

### 1. Choose the Right Method

- **High volume (1000+ SKUs)**: Finale API
- **Collaboration needed**: Google Sheets
- **One-time migration**: CSV Upload
- **Small dataset (<100 SKUs)**: Manual Entry or Google Sheets

### 2. Always Backup Before Bulk Changes

```typescript
// Before import/overwrite:
✅ Enable auto-backup in Settings
✅ Manually create backup before major changes
✅ Verify backup spreadsheet opens correctly
```

### 3. Validate Data First

```typescript
// Before uploading CSV or importing Sheets:
✅ Check for duplicate SKUs
✅ Ensure required fields filled
✅ Preview import results
✅ Start with small test (10-20 items)
```

### 4. Use Consistent Column Names

```
Preferred:          Avoid:
sku                 product_code, item_id
name                product_name, title
stock               quantity, qty_on_hand
reorder_point       min_qty, safety_stock
```

### 5. Monitor Sync Health

```
Settings → API Integrations → Sync Status

Check:
✅ Last sync time (should be < 1 hour)
✅ Items synced (should match Finale count)
✅ Error messages (investigate if any)
```

---

## Troubleshooting Guide

### Problem: "Data not updating"

**Check:**
1. Finale sync status (Settings → API Integrations)
2. Last sync time (should be recent)
3. Error messages in sync log

**Solutions:**
- Click "Sync Now" to force manual sync
- Verify Finale API credentials
- Check if Finale CSV report URLs expired

### Problem: "Duplicate items after import"

**Cause:** SKUs don't match exactly (case-sensitive, extra spaces)

**Solution:**
- Clean data before import
- Use "Update Existing" merge strategy
- Standardize SKU format (e.g., all uppercase)

### Problem: "Filtered items not showing up"

**Cause:** Items are inactive, dropship, or deprecated

**Solution:**
- Check item status in Finale (must be Active)
- Check if item is dropship (filtered by default)
- See [DATA_FILTERING_GUIDE.md](docs/DATA_FILTERING_GUIDE.md) for full filter list

### Problem: "Sync takes too long"

**Cause:** Large dataset (3000+ products)

**Solution:**
- Increase sync timeout in settings
- Filter inactive products in Finale before export
- Contact support for optimization

---

## FAQ

### Q: Can I use multiple methods at once?

**A:** Yes! Common setup:
- Finale API for bulk inventory (auto-sync)
- Google Sheets for team collaboration (manual import)
- Manual entry for special cases

### Q: What happens if I import duplicate SKUs?

**A:** Depends on merge strategy:
- **Update Existing:** Overwrites existing SKU with new data
- **Add New Only:** Skips existing SKU
- **Replace All:** Deletes all, imports fresh

### Q: Will inactive items ever be imported?

**A:** Not currently - they're always filtered. Unified filter UI coming soon to allow overrides.

### Q: Can I export and re-import without data loss?

**A:** Yes! Export to CSV/Google Sheets, edit, re-import with "Update Existing" strategy.

### Q: How do I restore from a backup?

**A:** Settings → Backups → Select backup → Click "Restore"

### Q: Which method is fastest for 1000+ items?

**A:** Finale API (automatic) or CSV upload (one-time).

### Q: Can I schedule imports/exports?

**A:** Finale: Yes (auto-sync configurable). Google Sheets/CSV: Manual only (automation coming soon).

---

## Support & Documentation

### Quick Links

- **Finale Integration:** [FINALE_DATA_SYNC.md](docs/FINALE_DATA_SYNC.md)
- **Google Sheets:** [GOOGLE_SHEETS_INTEGRATION.md](GOOGLE_SHEETS_INTEGRATION.md)
- **Data Filtering:** [DATA_ACQUISITION_ANALYSIS.md](docs/DATA_ACQUISITION_ANALYSIS.md)
- **System Architecture:** [CRITICAL_ARCHITECTURE.md](docs/CRITICAL_ARCHITECTURE.md)
- **Schema Details:** [SCHEMA_ARCHITECTURE.md](SCHEMA_ARCHITECTURE.md)

### Need Help?

1. Check troubleshooting section above
2. Review detailed docs for your method
3. Check audit logs in Settings → Sync History
4. Contact system administrator

---

**Last Updated:** December 12, 2025
**Version:** 2.0
**Maintainer:** MuRP Development Team
