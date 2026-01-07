# Compliance Workspace Modernization — Phase 1: Agent Trust Layer

## Overview

**Goal:** Make background compliance data sync activity visible, controllable, and trustworthy.

This phase establishes the foundation for user trust in the compliance system by providing complete transparency into agent-driven regulatory data synchronization, coupled with modern document preview and management workflows.

---

## Key Decisions

### Architecture
- **Activity Feed:** Drawer (toggle-able, collapsible from right edge)
- **Data Freshness Rules:** 
  - 🟢 **Green:** Last synced <24 hours ago
  - 🟡 **Yellow:** Last synced 2-7 days ago
  - 🔴 **Red:** Last synced 8+ days ago OR sync failed
- **PDF Viewer Library:** `@react-pdf-viewer/core` (enterprise-grade text extraction, annotation-ready)
- **Mobile Support:** Desktop-only (skip mobile implementation for Phase 1)

### Brand & UX
- **Typography:** Keep current warm header font; add Inter/Public Sans for UI labels
- **Color System:** Retain cream (#F5F1E8) + terracotta; add sage green (healthy), warm amber (warning), muted red (error)
- **Spacing:** Increase whitespace; subtle shadows for cards
- **Responsiveness:** Desktop-first, tablet-aware (1024px+), mobile read-only fallback

---

## Phase 1 Implementation Tasks

### 1. PDF Viewer Setup
**Files:** `components/compliance/DocumentPreviewModal.tsx`

**Install:**
```bash
npm install @react-pdf-viewer/core @react-pdf-viewer/highlight @react-pdf-viewer/search @react-pdf-viewer/text-layer
```

**Component Structure:**
- Left pane: PDF/DOC preview (scrollable)
- Right pane: Metadata sidebar + AI insights card
- Features: Zoom, page nav, search, text selection, download, delete buttons
- Modal integration with ComplianceDocumentList

### 2. Activity Feed Drawer
**Files:** `components/compliance/ComplianceActivityDrawer.tsx`, `hooks/useComplianceActivity.ts`

**Structure:**
```
┌─────────────────────────────────────────────┐
│ Compliance Activity        [▲ Collapse]    │
├─────────────────────────────────────────────┤
│ [Refresh All Priority States]               │
│ [Filter: Show all | Errors only]            │
├─────────────────────────────────────────────┤
│ CA [●green] Last sync: 2h ago | Next: 6am   │
│    12 sources synced | 2 new requirements   │
│    [Refresh] [View changes]                 │
│                                             │
│ NY [●red] Last sync: 8 days ago | STALE    │
│    Sync failed: MCP timeout                 │
│    [Retry] [View error]                     │
│                                             │
│ TX [●yellow] Last sync: 5 days | Syncing...│
│    87% complete: 8 of 9 sources scraped    │
├─────────────────────────────────────────────┤
│ Recent Changes:                             │
│ 📍 CA — Jan 5: "Heavy metal testing req..."│
│ 📍 NY — Jan 3: "Removed outdated guidance" │
│ 📍 OR — Dec 29: "Registration fee: $500→$600"
└─────────────────────────────────────────────┘
```

**Data Hook:** Query Supabase `state_regulatory_sources` for:
- `last_synced_at`, `next_scheduled_run`, `sync_status`, `error_message`
- Real-time subscription for updates

### 3. Status Badge System
**Files:** `lib/compliance/syncHealthCalculator.ts`

**Implementation:**
- Calculate health color based on `last_synced_at` and `sync_status`
- Return: `{ color: 'green'|'yellow'|'red', tooltip: string }`
- Apply to state buttons (dot indicator + hover tooltip)
- Add to tab count badges: `"State Sources (12) ↻ 2h ago"`

**Visual Indicators:**
- State buttons: Colored dot (●) with animated spinner during sync
- Tab badges: Freshness indicator with timestamp
- All status tied to `last_synced_at` and `sync_status` enum

### 4. Sticky Sync Status Bar
**Files:** `components/compliance/SyncStatusBar.tsx`

**Features:**
- Appears below main header when syncing active
- Shows: "⚙️ Syncing 3 states... 85% complete | Estimated 3 min remaining [Cancel]"
- Progress bar with animated fill
- Collapses when all syncs complete or all states are green

**Data Source:** Query active sync jobs from Supabase function or local state manager

### 5. Notifications & Manual Controls
**Files:** Modifications to toast service integration

**Toast Notifications:**
- "✓ CA regulations synced (2 new requirements found)"
- "⚠️ NY sync stale (8 days). [Refresh Now]"
- "❌ TX sync failed: Timeout. [Retry] [View Error]"

**Drawer Controls per State:**
- `[Refresh]` → Trigger immediate MCP scrape + sync (async)
- `[Retry]` → Retry failed sync with exponential backoff
- `[View changes]` → Modal showing last 3 syncs with diffs
- `[View error]` → Error detail modal if sync failed

### 6. Database & Hooks
**Files:** Extensions to `lib/dataService.ts`, new `hooks/useComplianceSyncStatus.ts`

**New Dataservice Function:**
```typescript
export async function getComplianceSyncStatus(stateId?: string) {
  // Returns: { stateId, lastSyncedAt, nextScheduledRun, status, errorMessage, sourceCount }
  // Query from state_regulatory_sources table
}
```

**New Hook:**
```typescript
export function useComplianceSyncStatus(stateId?: string) {
  // Real-time Supabase subscription to state_regulatory_sources
  // Returns: { data, loading, error, refetch }
}
```

---

## Database Schema Requirements

### Verify Existing Columns in `state_regulatory_sources`

Required columns:
- `last_synced_at` (timestamp, nullable)
- `next_scheduled_run` (timestamp, nullable)
- `sync_status` (enum: 'idle' | 'syncing' | 'success' | 'failed', default: 'idle')
- `error_message` (text, nullable)
- `source_count` (integer) — Number of sources scraped for this state

**If missing, create migration:**
```sql
ALTER TABLE state_regulatory_sources ADD COLUMN last_synced_at TIMESTAMP NULL;
ALTER TABLE state_regulatory_sources ADD COLUMN next_scheduled_run TIMESTAMP NULL;
ALTER TABLE state_regulatory_sources ADD COLUMN sync_status TEXT DEFAULT 'idle';
ALTER TABLE state_regulatory_sources ADD COLUMN error_message TEXT NULL;
```

### Optional: Compliance Audit Log Table

For tracking regulatory changes:
```sql
CREATE TABLE compliance_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID REFERENCES state_regulatory_sources(id),
  change_type TEXT, -- 'added' | 'updated' | 'removed'
  requirement_text TEXT,
  added_at TIMESTAMP DEFAULT now(),
  source_url TEXT,
  ai_summary TEXT
);
```

---

## API Endpoints Needed

### Manual Sync Trigger
**Endpoint:** `POST /api/compliance/refresh-state/{stateId}`

**Request:**
```json
{ "stateId": "uuid" }
```

**Response:**
```json
{ "status": "syncing", "estimatedTime": 300, "jobId": "uuid" }
```

**Implementation:** Edge function wrapper calling MCP scrape service

### Sync Status Poll
**Endpoint:** `GET /api/compliance/sync-status[?stateId=uuid]`

**Response:**
```json
[
  {
    "stateId": "uuid",
    "state": "CA",
    "lastSyncedAt": "2026-01-07T14:32:00Z",
    "nextScheduledRun": "2026-01-08T06:00:00Z",
    "status": "success",
    "errorMessage": null,
    "sourceCount": 12
  }
]
```

**Implementation:** Direct Supabase query via dataService

### Sync Job Details
**Endpoint:** `GET /api/compliance/sync-job/{jobId}`

**Response:**
```json
{
  "jobId": "uuid",
  "stateId": "uuid",
  "status": "syncing",
  "progress": 0.85,
  "completedSources": 8,
  "totalSources": 9,
  "estimatedTimeRemaining": 180
}
```

---

## Component Integration Points

### Compliance Page Header
- Add drawer toggle button (⟩ icon) in top-right
- Insert SyncStatusBar below header (conditional rendering when syncing)
- Update state buttons with health badges

### State Sources Tab
- Status indicators next to each state
- Quick refresh buttons per state

### Documents Tab
- DocumentPreviewModal on document click
- Batch upload trigger with AI tagging

### Overall Architecture
```
Compliance (pages/Compliance.tsx)
├─ SyncStatusBar (conditional, shows during sync)
├─ ComplianceActivityDrawer (right drawer, toggle-able)
│  └─ useComplianceSyncStatus hook (real-time subscription)
├─ RegulatorySourcesPanel
│  └─ Status badges per state
├─ ComplianceDocumentList
│  └─ DocumentPreviewModal (on click)
├─ RegulatoryQAPanel
├─ DocumentAnalysisPanel
└─ StateContactManager
```

---

## File Checklist

### New Files to Create
- [ ] `components/compliance/DocumentPreviewModal.tsx` (~250 lines)
- [ ] `components/compliance/ComplianceActivityDrawer.tsx` (~350 lines)
- [ ] `components/compliance/SyncStatusBar.tsx` (~120 lines)
- [ ] `lib/compliance/syncHealthCalculator.ts` (~40 lines)
- [ ] `hooks/useComplianceActivity.ts` (~80 lines)
- [ ] `hooks/useComplianceSyncStatus.ts` (~70 lines)

### Files to Modify
- [ ] `pages/Compliance.tsx` — Add drawer toggle, status bar, integrate components
- [ ] `lib/dataService.ts` — Add `getComplianceSyncStatus()` function
- [ ] `components/compliance/RegulatorySourcesPanel.tsx` — Add status badges
- [ ] `components/compliance/ComplianceDocumentList.tsx` — Wire to preview modal
- [ ] Supabase migrations — Add missing schema columns (if needed)

---

## Estimated Effort

| Task | Days |
|------|------|
| PDF viewer setup + lazy loading | 1.5 |
| Activity drawer + data hooks | 2 |
| Status badges + sync bar | 1 |
| Sync job queue table + service | 1.5 |
| Retry logic + exponential backoff | 1 |
| Debounce + pause toggle + history | 2 |
| Integration & testing | 2 |
| **Total** | **~11 days** |

**Note:** This timeline accounts for production-grade optimizations (lazy loading, polling vs subscriptions, job queue, retry logic). Skip features 5-6 if timeline critical (they're Phase 1.5 enhancements).

---

## Testing Strategy

### Unit Tests
- `syncHealthCalculator.test.ts` — Color logic for freshness rules
- `useComplianceSyncStatus.test.ts` — Hook subscription behavior

### Integration Tests
- Activity drawer updates on state sync
- Toast notifications fire on sync completion
- Manual refresh button triggers API call + UI update

### E2E Tests
- User opens activity drawer → sees current sync status
- User clicks [Refresh] for a state → status updates in real-time
- User opens document → preview modal renders with text extraction

---

## Performance & Cost Optimizations

### PDF Viewer Bundle Size Management
**Issue:** 225 KB added to bundle is acceptable but can be optimized.

**Solution: Lazy Loading**
```typescript
// components/compliance/DocumentPreviewModal.tsx
const PDFViewer = lazy(() => import('@react-pdf-viewer/core'));

export function DocumentPreviewModal() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <PDFViewer document={file} />
    </Suspense>
  );
}
```
**Impact:** PDF viewer library only loads when modal opens (saves ~225 KB initial load)

### Real-Time Subscription Cost Optimization
**Issue:** Supabase charges per concurrent connection; real-time subscriptions for every state sync is expensive at scale.

**Solution: Hybrid Polling Strategy**
```typescript
// hooks/useComplianceSyncStatus.ts
export function useComplianceSyncStatus(stateId?: string, useRealtime = false) {
  const [data, setData] = useState(null);
  
  // For critical sync-in-progress: use real-time subscription (cost: connection)
  // For stale status checks: use polling every 30-60 seconds (cost: API calls)
  
  if (useRealtime && isSyncingNow) {
    // Real-time for active syncs
    return supabase.from('state_regulatory_sources')
      .on('*', payload => setData(payload.new))
      .subscribe();
  } else {
    // Polling every 60s for background checks (cheaper)
    useEffect(() => {
      const poll = setInterval(() => {
        getComplianceSyncStatus(stateId).then(setData);
      }, 60000);
      return () => clearInterval(poll);
    }, []);
  }
}
```
**Cost:** Polling costs ~1440 API calls/day per user vs continuous connection subscription.

### Sync Job Tracking with Job Queue
**Issue:** Sync job tracking needs durable queue, not just in-memory state.

**Solution: Supabase Edge Function + pg_cron**

**New Table:**
```sql
CREATE TABLE compliance_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID REFERENCES state_regulatory_sources(id),
  status TEXT DEFAULT 'queued', -- 'queued', 'running', 'completed', 'failed'
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  progress_percent INT DEFAULT 0,
  sources_completed INT DEFAULT 0,
  sources_total INT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_sync_jobs_state_status ON compliance_sync_jobs(state_id, status);
CREATE INDEX idx_sync_jobs_created ON compliance_sync_jobs(created_at DESC);
```

**Edge Function Workflow:**
```
1. User clicks [Refresh CA] → POST /api/compliance/refresh-state/CA
2. Function creates row: INSERT INTO compliance_sync_jobs (state_id, status='queued')
3. Function returns jobId + "syncing" status
4. Background job picks up from queue, updates progress + sources_completed
5. Client polls /api/compliance/sync-job/{jobId} every 2 seconds
6. When complete: status='completed', activity_drawer updates UI
```

**Job Archival:**
```sql
-- Archive completed jobs >30 days old (quarterly cleanup)
DELETE FROM compliance_sync_jobs 
WHERE status IN ('completed', 'failed') 
AND created_at < now() - interval '30 days';
```

---

## Retry Logic & Exponential Backoff

### Implementation Strategy
**Problem:** Failed syncs need intelligent retry without overwhelming MCP service.

**Solution: Retry Service with Exponential Backoff**

**New file:** `services/complianceSyncRetryService.ts`
```typescript
export class ComplianceSyncRetryService {
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 1000; // Start at 1 second
  
  async retrySync(jobId: string, currentAttempt = 0): Promise<SyncResult> {
    try {
      return await triggerMCPScrape(jobId);
    } catch (error) {
      if (currentAttempt >= this.maxRetries) {
        // Log final failure to compliance_sync_jobs.error_message
        await logSyncFailure(jobId, error);
        throw new Error(`Sync failed after ${this.maxRetries} retries: ${error.message}`);
      }
      
      const delayMs = this.baseDelayMs * Math.pow(2, currentAttempt); // 1s, 2s, 4s
      const jitter = Math.random() * 1000; // Add randomness to prevent thundering herd
      await delay(delayMs + jitter);
      
      return this.retrySync(jobId, currentAttempt + 1);
    }
  }
}
```

**In ComplianceActivityDrawer:**
```typescript
async function handleRetry(stateId: string, jobId: string) {
  try {
    await complianceSyncRetryService.retrySync(jobId);
    toast.success(`Retry started for ${stateId}`);
  } catch (error) {
    toast.error(`Retry failed: ${error.message}`);
    // Show user "Contact support" option
  }
}
```

---

## Enhanced Features: Debounce, Pause, History

### 1. Bulk Refresh Debounce
**Problem:** User clicking [Refresh] for 6 states simultaneously creates 6 parallel MCP jobs (resource spike).

**Solution: Debounced Batch Queue**

```typescript
// services/complianceSyncBatchService.ts
export class ComplianceSyncBatchService {
  private refreshQueue: Set<string> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;
  
  async queueRefresh(stateId: string) {
    this.refreshQueue.add(stateId);
    
    // Clear previous timer, start new one
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    
    // Wait 500ms for user to finish clicking, then batch process
    this.debounceTimer = setTimeout(() => {
      this.processBatch();
    }, 500);
  }
  
  private async processBatch() {
    const statesToRefresh = Array.from(this.refreshQueue);
    this.refreshQueue.clear();
    
    // Process sequentially (or 2 at a time) with 2-second gaps
    for (let i = 0; i < statesToRefresh.length; i += 2) {
      const batch = statesToRefresh.slice(i, i + 2);
      await Promise.all(batch.map(s => triggerMCPScrape(s)));
      if (i + 2 < statesToRefresh.length) await delay(2000);
    }
  }
}
```

**UI Feedback:**
```
When user clicks [Refresh] multiple times:
- Button shows [Queued] state visually
- Activity drawer shows "2 refreshes queued, will process in 1s"
- All syncs start together after debounce window
```

### 2. Pause Auto-Sync Toggle (Development/Testing)
**Problem:** During development, auto-syncs interfere with testing. Need ability to pause background jobs.

**New Setting in ComplianceActivityDrawer:**

```typescript
// In drawer header
<div className="flex items-center gap-3">
  <span>Compliance Activity</span>
  <label className="flex items-center gap-2">
    <input 
      type="checkbox" 
      checked={!isAutoSyncPaused}
      onChange={() => toggleAutoSync()}
    />
    <span className="text-sm">Auto-sync enabled</span>
  </label>
  <IconButton icon={<Settings />} onClick={() => openSettings()} />
</div>
```

**Implementation:**
```typescript
// services/complianceSyncService.ts
async function startAutoSyncSchedule() {
  if (isAutoSyncPausedInLocalStorage()) {
    console.log('Auto-sync paused by user');
    return;
  }
  
  // Start pg_cron jobs for: Stockout Prevention, Vendor Watchdog, etc.
  // Also call MCP scrape scheduler per state
}

function toggleAutoSync() {
  const isPaused = localStorage.getItem('compliance.autoSyncPaused') === 'true';
  localStorage.setItem('compliance.autoSyncPaused', String(!isPaused));
  
  if (!isPaused) {
    // User just paused - stop active jobs
    cancelActiveSync();
  } else {
    // User just enabled - restart scheduler
    startAutoSyncSchedule();
  }
}
```

**UI Toast:** "Auto-sync paused for development. Click to resume." (with Undo button)

### 3. Sync History View
**Problem:** Users have no visibility into past sync attempts, causing "When was CA last synced?" questions.

**New Section in ComplianceActivityDrawer:**

```
┌─────────────────────────────────────────────┐
│ Compliance Activity        [▲ Collapse]    │
├─────────────────────────────────────────────┤
│ [Refresh All] | Auto-sync: [Toggle ON/OFF] │
├─────────────────────────────────────────────┤
│ CURRENT STATUS SECTION (as before)          │
├─────────────────────────────────────────────┤
│ Sync History (Last 30 Days)                │
│ [Show CA only] [Show NY only] [All states] │
│                                             │
│ Jan 7, 2:14 PM — CA — ✓ Success           │
│   12 sources, 2 new requirements, 124 sec  │
│   [View changes]                            │
│                                             │
│ Jan 7, 9:30 AM — CA — ❌ Failed (timeout)  │
│   Attempt 1 of 3 | [Retry] [View error]   │
│                                             │
│ Jan 6, 6:01 AM — CA — ✓ Success           │
│   12 sources, 0 changes, 97 sec            │
│                                             │
│ Jan 5, 6:00 AM — NY — ✓ Success           │
│   8 sources, 1 new requirement, 156 sec    │
│   [View changes]                            │
└─────────────────────────────────────────────┘
```

**Data Source:**
```typescript
// Query compliance_sync_jobs table, ordered by created_at DESC
const syncHistory = await supabase
  .from('compliance_sync_jobs')
  .select('*')
  .in('state_id', selectedStates)
  .order('created_at', { ascending: false })
  .limit(100);
```

**Features:**
- Filter by state (default: last 5 syncs across all states)
- Click row → expand to show details (sources scraped, changes found, error message)
- [View changes] link → modal showing regulation additions/removals for that sync
- Exports: "Download sync report (last 30 days)" as CSV

---

## Dependencies

### npm Packages
- `@react-pdf-viewer/core` (~180 KB gzipped) — **Lazy loaded**
- `@react-pdf-viewer/highlight` (~20 KB)
- `@react-pdf-viewer/search` (~15 KB)
- `@react-pdf-viewer/text-layer` (~10 KB)
- **Total added:** ~225 KB (lazy-loaded, not in initial bundle)

### Existing Dependencies
- React, Supabase client, Tailwind CSS (already present)

### New Database Tables
- `compliance_sync_jobs` — Job queue for tracking sync progress + history

---

## Production Considerations

### Database Scaling
- `compliance_sync_jobs` table grows ~200-300 rows/week (6 states × ~7-8 syncs/week)
- Implement 30-day archival cleanup: `DELETE FROM compliance_sync_jobs WHERE created_at < now() - interval '30 days'`
- Add indexes: `state_id, status` for fast lookup during retry/history views

### Supabase Real-Time Cost Management
- **Red flag:** Subscriptions for all users on all states costs ~$1-2/user/month
- **Solution:** Polling (60s interval) costs ~$0.01/user/month (near-free)
- **Recommendation:** Use polling by default, real-time only during active sync (when isSyncingNow = true)

### MCP Service Load Balancing
- Sequential batching (2 states at a time) prevents overwhelming MCP backend
- Backoff times: 1s → 2s → 4s prevent retry storms
- Monitor: Check MCP error logs when retry rates spike

### Error Handling & User Education
- UI should explain "Sync timed out" (MCP backend slow) vs "Failed to connect" (network issue)
- Provide "Contact support" link if retries exhausted after 3 attempts
- Log all failures to Sentry/error tracking for support team visibility

### Browser Storage & Settings
- `localStorage.setItem('compliance.autoSyncPaused', 'true|false')` — persists across sessions
- Consider: "Clear browser data" warning (loses pause setting)
- Alternative: Move setting to Supabase `user_preferences` table for persistence

### Monitoring & Alerts
- **Track:** Sync failure rate by state (watch for < 99% success)
- **Alert:** If any state hasn't synced in 10+ days, alert admins
- **Metric:** Average sync duration per state (watch for degradation)

---

## Success Criteria

✅ **Agent transparency:**
- Users can see last sync time for all priority states
- Status indicators (green/yellow/red) accurately reflect freshness
- Manual refresh works for individual states

✅ **Trust foundation:**
- Toast notifications inform users of significant changes
- Error messages are clear and actionable
- Compliance activity drawer provides at-a-glance health overview

✅ **Performance:**
- Activity drawer opens in <200ms
- PDF preview loads in <500ms
- No unnecessary re-renders (optimize with React.memo)

✅ **Testing:**
- All new components have unit tests (>80% coverage)
- E2E tests cover primary workflows
- All tests passing before merge

---

## Next Phases

### Phase 2: Document Intelligence (Weeks 3-4)
- Batch upload with smart AI tagging
- Document analysis tab enhancements
- Generate product compliance checklist

### Phase 3: Comparison & Research Tools (Weeks 5-6)
- State-to-state requirement comparison drawer
- Regulatory change timeline
- Global compliance search

---

## Rollout Plan

1. **Create feature branch:** `feat/compliance-trust-layer`
2. **Implement Phase 1 components** with tests
3. **Code review** before merge
4. **Run full test suite:** `npm test && npm run e2e`
5. **Merge to main:** Fast-forward merge when all tests pass
6. **Deploy to production** via Vercel
7. **Monitor** for sync job errors and user feedback

---

## References

- PDF.js + react-pdf-viewer: https://react-pdf-viewer.dev/
- Supabase Real-time Subscriptions: https://supabase.com/docs/guides/realtime
- Compliance data models: See `types/compliance.ts` and `lib/schema/index.ts`
- Regulatory data service: See `services/regulatoryDataService.ts`
