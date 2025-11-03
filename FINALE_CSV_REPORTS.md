# Finale CSV Report Integration Guide

## Overview

This guide explains how to integrate Finale CSV reports into the TGF-MRP system. We use Finale's Reporting API instead of REST endpoints because:

- ✅ Reports are easier to configure in Finale UI
- ✅ Data is pre-filtered and formatted
- ✅ More reliable than REST endpoints (which often return 404s)
- ✅ Support for custom fields and complex queries

## Process for Adding a New Report

### Step 1: Create Report in Finale

1. Log into Finale at `https://app.finaleinventory.com/[your-account]`
2. Navigate to **Reports** and create/configure your report
3. Add all needed columns and filters
4. Save the report

### Step 2: Get the Report URL

1. Open the report in Finale
2. Copy the URL from the browser address bar
3. **Modify the URL**: Replace `/pivotTableStream/` with `/pivotTable/`
   - Before: `https://app.finaleinventory.com/account/doc/report/pivotTableStream/123/Report.csv`
   - After: `https://app.finaleinventory.com/account/doc/report/pivotTable/123/Report.csv`
4. Ensure the URL has `?format=csv` in the query string

**Reference**: [Finale Reporting API Documentation](https://support.finaleinventory.com/hc/en-us/articles/115001687154)

### Step 3: Add Environment Variable

Add the report URL to `.env.local` and Vercel:

```bash
# In .env.local
FINALE_[REPORT_NAME]_URL="https://app.finaleinventory.com/..."

# In Vercel Dashboard
# Go to: Settings → Environment Variables
# Add the same variable for Production, Preview, Development
```

### Step 4: Add Proxy Function

In `api/finale-proxy.ts`, add a function to fetch the report:

```typescript
/**
 * Get [data type] from Finale CSV report
 */
async function get[DataType](config: FinaleConfig) {
  console.log(`[Finale Proxy] Fetching [data type] from CSV report`);
  
  // Get report URL from environment
  let reportUrl = process.env.FINALE_[REPORT_NAME]_URL;
  if (!reportUrl) {
    throw new Error('FINALE_[REPORT_NAME]_URL not configured');
  }
  
  // Fix URL format
  reportUrl = reportUrl.replace('/pivotTableStream/', '/pivotTable/');
  
  // Fetch with Basic Auth
  const authHeader = createAuthHeader(config.apiKey, config.apiSecret);
  const response = await fetch(reportUrl, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'text/csv, text/plain, */*',
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch report (${response.status}): ${response.statusText}`);
  }
  
  const csvText = await response.text();
  const rawData = parseCSV(csvText);
  
  console.log(`[Finale Proxy] Parsed ${rawData.length} items from CSV`);
  console.log(`[Finale Proxy] CSV Headers:`, Object.keys(rawData[0] || {}));
  console.log(`[Finale Proxy] Sample row:`, rawData[0]);
  
  // Transform CSV columns to expected format
  const transformedData = rawData.map((row: any) => ({
    // Map CSV columns to expected field names
    // See Step 5 below
  }));
  
  return transformedData;
}
```

### Step 5: Map CSV Columns to Fields

After deploying the function, run a test sync and check Vercel logs for:

```
[Finale Proxy] CSV Headers: [...]
[Finale Proxy] Sample row: {...}
```

Use the actual column names to create your mapping:

```typescript
const transformedData = rawData.map((row: any) => ({
  id: row['ID'] || row['Some ID Column'] || generateId(row['Name']),
  name: row['Name'] || row['Product Name'] || '',
  email: row['Email address 0'] || row['Email'] || '',
  // ... map all needed fields
}));
```

**Important**: 
- Use exact column names from the CSV (case-sensitive)
- Handle multiple columns (e.g., "Email address 0", "Email address 1")
- Filter out placeholder values like "Various"
- Generate IDs if CSV doesn't include them

### Step 6: Add to Handler Switch

In `api/finale-proxy.ts`, add a case to the handler:

```typescript
switch (action) {
  case 'testConnection':
    result = await testConnection(finaleConfig);
    break;

  case 'get[DataType]':
    result = await get[DataType](finaleConfig);
    break;
    
  // ... other cases
}
```

### Step 7: Verify Database Schema

**Before deploying**, check that the Supabase table has all the columns you're trying to save:

1. Go to Supabase Dashboard → Table Editor
2. Check the table schema
3. **Only save fields that exist** in the database
4. Comment out or remove any fields that don't exist

Example:
```typescript
const dataInserts = validData.map(item => ({
  id: item.id,
  name: item.name,
  // only_save_existing_columns: item.value,
  // missing_column: item.value, // ❌ Comment out if doesn't exist
}));
```

### Step 8: Test and Deploy

1. Commit changes: `git add -A && git commit -m "feat: Add [report name] CSV sync"`
2. Push to deploy: `git push origin main`
3. Wait for Vercel deployment (~1-2 min)
4. Run manual sync in Settings
5. Check Vercel function logs for errors
6. Verify data appears in the app

## Common Issues and Solutions

### Issue: "Could not find the '[column]' column in the schema cache"

**Cause**: You're trying to save a field that doesn't exist in the Supabase table.

**Solution**: 
1. Remove that field from the insert
2. OR add the column to the Supabase table first

### Issue: CSV returns HTML instead of CSV data

**Cause**: Missing authentication or wrong URL format.

**Solution**:
1. Ensure Basic Auth header is included
2. Verify URL uses `/pivotTable/` not `/pivotTableStream/`
3. Check that `format=csv` is in the query string

### Issue: "Transformed 0 items"

**Cause**: Column names don't match the CSV headers.

**Solution**:
1. Check Vercel logs for actual CSV column names
2. Update the mapping to use exact column names (case-sensitive)

### Issue: Getting placeholder values like "Various"

**Cause**: Finale uses "Various" when a field has multiple different values.

**Solution**: Filter these out in the transformation:
```typescript
const values = [field1, field2, field3].filter(v => v && v !== 'Various');
```

## Example: Vendors Report Integration

Here's the complete flow we used for vendors:

1. **Report URL**: `https://app.finaleinventory.com/buildasoilorganics/doc/report/pivotTable/1754577905233/Report.csv?format=csv&data=partyGroup&...`

2. **CSV Columns**:
   - Name
   - Email address 0, Email address 1, Email address 2, Email address 3
   - Phone number 0, Phone number 1, Phone number 2, Phone number 3
   - Address 0 street address, Address 0 city, Address 0 state / region, Address 0 postal code
   - Notes

3. **Mapping**:
   ```typescript
   const suppliers = rawSuppliers.map((row: any) => {
     const name = row['Name'] || 'Unknown Vendor';
     const partyId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
     
     return {
       partyId,
       name,
       email: row['Email address 0'] || row['Email address 1'] || '',
       phone: row['Phone number 0'] || row['Phone number 1'] || '',
       addressLine1: row['Address 0 street address'] || '',
       city: row['Address 0 city'] || '',
       // ... etc
     };
   });
   ```

4. **Database fields saved**: id, name, contact_emails, address, lead_time_days

5. **Result**: ✅ 685 vendors synced successfully

## Next Reports to Add

Based on your `.env.local`, you have these reports ready:

1. ✅ **Vendors Report** - DONE
2. ⏳ **Inventory Report** - `FINALE_INVENTORY_REPORT_URL`
3. ⏳ **Reorder Report** - `FINALE_REORDER_REPORT_URL`

Follow this same process for each report!

## Checklist for New Reports

- [ ] Create/configure report in Finale UI
- [ ] Get report URL and modify to use `/pivotTable/`
- [ ] Add URL to `.env.local` and Vercel environment variables
- [ ] Add fetch function in `api/finale-proxy.ts`
- [ ] Deploy and check Vercel logs for CSV column names
- [ ] Map CSV columns to expected field names
- [ ] Verify database schema matches fields being saved
- [ ] Add case to handler switch statement
- [ ] Test sync and verify data appears in app
- [ ] Document column mapping for future reference

## Tips for Success

- **Always check Vercel logs first** - They show the actual CSV structure
- **Start with minimal fields** - Add more fields incrementally
- **Test transformations** - Log the first transformed item to verify mapping
- **Handle missing data** - Use fallbacks and defaults
- **Filter garbage values** - Remove "Various", empty strings, etc.
- **Generate IDs when needed** - If CSV doesn't have them, create from name
- **Match database schema** - Only save fields that exist in the table
