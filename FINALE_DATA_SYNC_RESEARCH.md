# Finale Data Sync Research & Google Drive Integration

**Date:** November 14, 2025
**Status:** Critical Issues Identified + Integration Opportunities

---

## Executive Summary

**Critical Finding:** Your Finale sync system has NO backup mechanism before overwriting data. When CSV report URLs expire or return empty data, the sync continues and can wipe all inventory from the database.

**Root Cause of Yesterday's Data Loss:**
1. Finale CSV report URLs likely expired
2. Sync fetched empty CSV (no error thrown)
3. Empty array passed to database upsert operation
4. All inventory overwritten with empty data
5. No backup existed to restore from

**Good News:** This is fixable! Solutions below will prevent future data loss and add Google Drive/Sheets as a resilient alternative data source.

---

## Part 1: Finale Sync Issues

### Current Architecture

```
Finale Inventory → CSV Reports → API Proxy → Sync Service → Supabase (PostgreSQL)
```

**Key Files:**
- `services/finaleSyncService.ts:1-1330` - Main sync orchestrator
- `services/finaleBasicAuthClient.ts:1-422` - API client
- `api/finale-proxy.ts:1-650` - Server-side proxy
- `hooks/useSupabaseData.ts:59-162` - Data fetching

### Critical Vulnerabilities

#### 1. **NO BACKUP BEFORE OVERWRITE** (Lines 1141-1146)

```typescript
const { error } = await supabase
  .from('inventory_items')
  .upsert(dbItems as any, {
    onConflict: 'sku',
    ignoreDuplicates: false,  // ⚠️ OVERWRITES WITHOUT BACKUP
  });
```

**Impact:** If sync receives bad data, it permanently destroys existing data with no way to recover.

#### 2. **INSUFFICIENT EMPTY CSV PROTECTION** (Lines 493-501)

```typescript
if (rawInventory.length === 0) {
  console.warn(`⚠️ WARNING: No inventory items returned from CSV!`);
  // ⚠️ WARNING ONLY - SYNC CONTINUES!
}
```

**Impact:** Empty CSV returns warning but sync proceeds, wiping all data.

#### 3. **CSV URL EXPIRATION** (api/finale-proxy.ts:341-350)

Finale CSV report URLs expire periodically. When expired:
- Returns empty response (not an error)
- Sync interprets as "0 items"
- Database gets cleared

#### 4. **NO TRANSACTION SAFETY** (Lines 1067-1089)

Vendors and inventory updated separately. If one fails midway, database left in inconsistent state with no rollback.

#### 5. **NO DATA VERSIONING**

No audit trail of changes. Cannot see:
- What data looked like before sync
- What changed during sync
- Who/what triggered destructive operation

---

## Part 2: Immediate Fixes (Prevent Further Data Loss)

### Fix 1: Add Pre-Sync Validation (CRITICAL)

**File:** `services/finaleSyncService.ts`

Add validation before ANY database writes:

```typescript
private validateSyncData(newData: any[], existingCount: number): boolean {
  // Abort if new data is suspiciously small
  if (newData.length < existingCount * 0.1) {
    throw new Error(
      `⛔ SYNC ABORTED: New data (${newData.length} items) is ${
        existingCount - newData.length
      } items smaller than existing (${existingCount}). ` +
      `This suggests CSV expired or data corruption. ` +
      `Please verify Finale CSV URLs are valid.`
    );
  }

  // Minimum item threshold
  if (newData.length < 10 && existingCount > 10) {
    throw new Error(
      `⛔ SYNC ABORTED: Received only ${newData.length} items ` +
      `when expecting ${existingCount}+. CSV likely expired.`
    );
  }

  return true;
}
```

**Usage:** Call before EVERY upsert operation.

### Fix 2: Snapshot Backup Before Sync (CRITICAL)

**File:** `services/finaleSyncService.ts`

```typescript
private async createBackup(table: string): Promise<string> {
  const backupTable = `${table}_backup`;
  const timestamp = new Date().toISOString();

  // Copy entire table to backup
  const { error } = await supabase.rpc('backup_table', {
    source_table: table,
    backup_table: backupTable,
    backup_timestamp: timestamp
  });

  if (error) throw new Error(`Backup failed: ${error.message}`);

  console.log(`✅ Created backup: ${backupTable} at ${timestamp}`);
  return backupTable;
}
```

**Database Function Needed:**

```sql
-- Add to Supabase migration
CREATE OR REPLACE FUNCTION backup_table(
  source_table TEXT,
  backup_table TEXT,
  backup_timestamp TIMESTAMP
)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I AS TABLE %I', backup_table, source_table);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS backup_at TIMESTAMP DEFAULT %L', backup_table, backup_timestamp);
END;
$$ LANGUAGE plpgsql;
```

### Fix 3: Add Rollback UI

**File:** `components/FinaleSetupPanel.tsx`

Add button to restore from latest backup:

```typescript
const handleRollback = async () => {
  if (!confirm('Restore inventory from last backup? This will overwrite current data.')) {
    return;
  }

  const { data, error } = await supabase.rpc('rollback_from_backup', {
    target_table: 'inventory_items',
    backup_table: 'inventory_items_backup'
  });

  if (error) {
    addToast(`Rollback failed: ${error.message}`, 'error');
  } else {
    addToast(`✅ Restored ${data.rows_restored} items from backup`, 'success');
  }
};
```

### Fix 4: CSV URL Health Check

**File:** `services/finaleSyncService.ts`

Before syncing, verify CSV URLs are reachable:

```typescript
private async checkCSVHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });

    if (!response.ok) {
      throw new Error(`CSV URL returned ${response.status}`);
    }

    // Check content length
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    if (contentLength < 100) {
      throw new Error(`CSV appears empty (${contentLength} bytes)`);
    }

    return true;
  } catch (error) {
    console.error(`❌ CSV health check failed for ${url}:`, error);
    return false;
  }
}
```

---

## Part 3: Google Drive/Sheets Integration

### Why Add Google Integration?

1. **Resilience:** Multiple data sources prevent single point of failure
2. **Collaboration:** Team can edit forecasts, BOMs, vendors in Google Sheets
3. **User-Friendly:** Most users already familiar with Google Sheets
4. **Backup Strategy:** Export Finale data to Sheets as automatic backup
5. **Flexibility:** Import manual data, forecasts, vendor lists

### Recommended Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Supabase DB                      │
│              (Single Source of Truth)               │
└──────────────┬──────────────────────┬───────────────┘
               │                      │
       ┌───────▼────────┐    ┌───────▼────────┐
       │ Finale Sync    │    │ Google Sync    │
       │ (Real-time)    │    │ (On-demand)    │
       └───────┬────────┘    └───────┬────────┘
               │                      │
       ┌───────▼────────┐    ┌───────▼────────┐
       │ Finale API     │    │ Google Sheets  │
       │ (CSV Reports)  │    │ (Collaborative)│
       └────────────────┘    └────────────────┘
```

### Integration Approach

#### Phase 1: OAuth Authentication (Week 1)

**NPM Packages:**
```bash
npm install googleapis @google-cloud/local-auth
```

**Files to Create:**
- `/api/google-auth.ts` - OAuth callback handler
- `/api/google-proxy.ts` - API proxy (follows Finale pattern)
- `/services/googleAuthService.ts` - OAuth management
- `/lib/google/client.ts` - OAuth client setup

**Environment Variables:**
```bash
GOOGLE_CLIENT_ID=your-oauth-client-id
GOOGLE_CLIENT_SECRET=your-oauth-client-secret
GOOGLE_REDIRECT_URI=https://murp.app/api/google-auth/callback
```

**Database Migration:**
```sql
-- Store OAuth tokens (encrypted, server-side only)
CREATE TABLE user_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  provider TEXT NOT NULL,  -- 'google'
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP,
  scopes TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE user_oauth_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own tokens"
  ON user_oauth_tokens FOR ALL
  USING (auth.uid() = user_id);
```

#### Phase 2: Google Sheets Import (Week 2-3)

**Files to Create:**
- `/services/googleSheetsService.ts` - Sheets API wrapper
- `/services/googleSyncService.ts` - Sync orchestration
- `/components/GoogleSheetsImportModal.tsx` - Import wizard
- `/lib/google/transformers.ts` - Sheet → Database transformers

**User Flow:**
```
1. User clicks "Connect Google Sheets"
2. OAuth flow → Grant permission
3. User pastes Google Sheets URL
4. Preview data with column mapping
5. Confirm import
6. Data merged with existing inventory
```

**Example Import:**

```typescript
// services/googleSheetsService.ts
async importInventorySheet(spreadsheetId: string, range: string) {
  // 1. Fetch sheet data via API
  const sheetData = await this.readSheet(spreadsheetId, range);

  // 2. Transform to internal schema
  const inventory = await transformGoogleSheetToInventory(sheetData);

  // 3. Validate data quality
  if (inventory.length === 0) {
    throw new Error('No valid inventory items found in sheet');
  }

  // 4. Merge strategy (user chooses):
  //    - Replace all
  //    - Add new only
  //    - Update existing

  // 5. Save to Supabase (with backup first!)
  await this.saveInventory(inventory, { mergeStrategy: 'addNew' });
}
```

#### Phase 3: Automatic Backup to Sheets (Week 4)

**Feature:** Automatically export Finale inventory to Google Sheets after every sync

**Benefits:**
- Instant backup in familiar format
- Team can view/analyze without database access
- Restore source if database corrupted

```typescript
// In finaleSyncService.ts
async syncInventory() {
  // 1. Sync from Finale to database
  const inventory = await this.fetchAndSaveInventory();

  // 2. Automatically backup to Google Sheets
  if (googleSheetsEnabled) {
    await googleSheetsService.exportBackup(inventory, {
      spreadsheetId: BACKUP_SHEET_ID,
      sheetName: `Backup ${new Date().toISOString()}`
    });
  }

  return inventory;
}
```

### Google Sheets Use Cases

1. **Forecasting:** Import sales forecasts from collaborative Sheets
2. **Manual Overrides:** Quick inventory adjustments without database access
3. **BOM Management:** Engineers maintain BOMs in Sheets, import periodically
4. **Vendor Lists:** Collaborative vendor directory with contacts
5. **Reporting:** Export inventory for analysis, sharing with stakeholders
6. **Backup/Recovery:** Automatic backups after every Finale sync

---

## Part 4: Implementation Recommendations

### Immediate Actions (Do Today)

1. **Add Pre-Sync Validation** (Fix 1 above)
   - Prevents empty CSV from wiping data
   - 30 minutes to implement

2. **Check Finale CSV URLs**
   - Log into Finale admin
   - Verify CSV report URLs in `.env.local`:
     - `FINALE_VENDORS_REPORT_URL`
     - `FINALE_INVENTORY_REPORT_URL`
     - `FINALE_BOM_REPORT_URL`
   - Regenerate if expired

3. **Manual Backup**
   - Export current inventory to CSV immediately
   - Store safely outside application

### Short Term (This Week)

4. **Implement Backup System** (Fix 2 above)
   - Add database backup function
   - Snapshot before every sync
   - 2-3 hours to implement

5. **Add Rollback UI** (Fix 3 above)
   - Button to restore from backup
   - 1 hour to implement

6. **CSV Health Checks** (Fix 4 above)
   - Verify URLs before syncing
   - 1 hour to implement

### Medium Term (Next 2 Weeks)

7. **Google OAuth Setup**
   - Create Google Cloud project
   - Configure OAuth credentials
   - Implement auth flow
   - 1 day

8. **Google Sheets Import**
   - Build import wizard
   - Add data transformers
   - Test with sample sheets
   - 2-3 days

9. **Automatic Backup to Sheets**
   - Export after Finale syncs
   - Version history in Sheets
   - 1 day

### Long Term (Next Month)

10. **Data Versioning System**
    - Track all changes
    - Audit trail
    - 3-5 days

11. **Conflict Resolution**
    - When Finale and Sheets differ
    - User chooses source
    - 2-3 days

12. **Real-time Sync Status**
    - WebSocket notifications
    - Progress indicators
    - 2-3 days

---

## Part 5: Security & Best Practices

### Data Safety Rules

1. **ALWAYS backup before overwrites**
2. **ALWAYS validate data before saving**
3. **NEVER skip validation for "convenience"**
4. **ALWAYS use transactions for multi-table updates**
5. **ALWAYS log destructive operations**

### OAuth Security

1. **Store tokens server-side only** (Supabase, encrypted)
2. **Never expose tokens to frontend**
3. **Request minimal scopes** (read-only when possible)
4. **Auto-refresh tokens** before expiry
5. **Handle revoked permissions** gracefully

### User Experience

1. **Preview before import** - Show what will change
2. **Confirm destructive ops** - Require explicit user confirmation
3. **Progress indicators** - Show sync status in real-time
4. **Error recovery** - Clear instructions when things fail
5. **Undo capability** - Easy rollback for mistakes

---

## Part 6: Cost & Complexity Analysis

### Finale Fixes (Immediate)

**Effort:** 1-2 days
**Cost:** $0 (no new services)
**Risk:** Low (defensive code only)
**Impact:** HIGH - Prevents data loss

### Google Sheets Integration

**Effort:** 1-2 weeks
**Cost:**
- Google Cloud: Free tier (10,000 API calls/day)
- After free tier: $0.0025 per API call
- Typical usage: <1,000 calls/day = ~$2.50/month

**Complexity:** Medium
- OAuth: Well-documented
- Google APIs: Mature, stable
- Integration: Follows existing patterns

**Risk:** Low
- OAuth is standard pattern
- APIs are reliable
- No breaking changes expected

**Impact:** HIGH
- Collaborative data entry
- Automatic backups
- User-friendly import/export

---

## Part 7: Alternative Approaches

### Option A: Finale Only (Current + Fixes)

**Pros:**
- Simple, single source
- Fast sync (5 min intervals)
- No user training needed

**Cons:**
- Single point of failure
- No collaborative editing
- Rigid schema

**Verdict:** ⚠️ High risk without backups

### Option B: Google Sheets Only

**Pros:**
- Familiar to users
- Collaborative
- Free

**Cons:**
- No real-time inventory
- Manual updates required
- API rate limits

**Verdict:** ❌ Too manual for inventory system

### Option C: Dual Source (Finale + Google) ✅ RECOMMENDED

**Pros:**
- Resilient (redundancy)
- Collaborative + real-time
- Automatic backups
- Flexibility

**Cons:**
- More complex
- Potential sync conflicts
- Higher maintenance

**Verdict:** ✅ Best balance of reliability and usability

---

## Part 8: Next Steps

### Decision Points

1. **Do you want to implement Finale fixes immediately?**
   - YES → Start with Fix 1 (validation) today
   - NO → Risk another data loss event

2. **Do you want Google Sheets integration?**
   - YES → Start OAuth setup this week
   - NO → Consider other backup strategies

3. **Priority: Data safety or new features?**
   - Safety first → Implement all 4 fixes before other work
   - Features first → At minimum, add validation (Fix 1)

### Recommended Path Forward

**Week 1:**
- ✅ Implement all 4 Finale fixes
- ✅ Manually backup current data to CSV
- ✅ Verify/regenerate Finale CSV URLs
- ✅ Test backup/restore flow

**Week 2:**
- ✅ Set up Google OAuth
- ✅ Create token storage in Supabase
- ✅ Build basic Sheets import

**Week 3:**
- ✅ Add import wizard UI
- ✅ Implement automatic backup to Sheets
- ✅ Test end-to-end flow

**Week 4:**
- ✅ User testing
- ✅ Documentation
- ✅ Deploy to production

---

## Conclusion

**Critical Takeaway:** Your data loss was preventable and is fixable. The current Finale sync has no safety net - it will overwrite data without question, without backup, without recovery.

**Immediate Action Required:** Implement validation and backups TODAY to prevent another incident.

**Long-term Solution:** Dual-source architecture (Finale + Google Sheets) provides resilience, collaboration, and user-friendly backup strategy.

**Effort vs. Impact:**
- Finale fixes: 1-2 days → Prevents catastrophic data loss
- Google integration: 2-3 weeks → Adds resilience + collaboration

**This is the better way.** Users won't have to fiddle - OAuth is one-click, import is drag-and-drop, backups are automatic. Seamless, safe, and user-friendly.

---

## Questions?

1. Should I start implementing Finale fixes now?
2. Do you want me to set up Google OAuth this week?
3. Any specific Google Sheets use cases I didn't cover?
4. Want to see code examples for any specific part?

Let me know what you'd like to tackle first!
