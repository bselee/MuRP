# Incomplete Items & Placeholder Values Roadmap

Generated: 2025-12-19

This document catalogs all incomplete items, placeholder values, TODO comments, and stub implementations found in the MuRP codebase.

---

## CRITICAL PRIORITY (P0) - Metrics & KPIs with Fake Data

These items show fake/hardcoded data to users and must be fixed immediately.

### 1. costStability - Always Shows 0

**Files:**
- `pages/StockIntelligence.tsx:169` - `costStability: 0,`
- `pages/Dashboard.tsx:234` - `costStability: 0,`
- `lib/inventory/stockIntelligence.ts:122` - `costStability: 0,`

**Interface Definition:** `pages/StockIntelligence.tsx:55`, `pages/Dashboard.tsx:36`

**Impact:** Cost stability metric is defined but never calculated. Always shows 0.

**Fix:** Calculate actual cost stability from purchase order price history:
```typescript
// Query price variance over time from purchase_order_items
const costVariance = calculatePriceVariance(purchaseOrders);
const costStability = 100 - (costVariance * 100); // Higher = more stable
```

---

### 2. average_resolution_time_hours - Always 0

**Files:**
- `services/airTrafficControllerAgent.ts:351` - `average_resolution_time_hours: 0,`
- `services/airTrafficControllerAgent.ts:359` - `average_resolution_time_hours: 0, // TODO: Calculate from resolved alerts`
- `services/airTrafficControllerAgent.ts:367` - `average_resolution_time_hours: 0,`

**Impact:** Alert resolution time metric is never calculated.

**Fix:** Calculate from `alert_logs` table:
```typescript
SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)
FROM alert_logs
WHERE resolved_at IS NOT NULL;
```

---

### 3. Data Acquisition Agent Metrics - Hardcoded

**Files:**
- `services/dataAcquisitionAgent.ts:219-220`:
  ```typescript
  errorRate: 0, // TODO: Calculate from audit logs
  avgDuration: 45000, // TODO: Calculate from audit logs
  ```
- `services/dataAcquisitionAgent.ts:233-234`:
  ```typescript
  errorRate: 0, // TODO: Calculate from audit logs
  avgDuration: 15000, // TODO: Calculate from audit logs
  ```

**Impact:** Data source health metrics are fake.

**Fix:** Calculate from `data_acquisition_logs` or similar audit table.

---

### 4. Email Intelligence Agent Metrics - All Zeros

**File:** `services/emailIntelligenceAgent.ts:800-826`

```typescript
totalEmailsProcessed: 0,
totalAttachmentsParsed: 0,
totalDataExtracted: 0,
extractionAccuracy: 0,
draftApprovalRate: 0,
avgResponseTimeMinutes: 0,
// ... more zeros
```

**Impact:** Email agent performance dashboard shows no data.

**Fix:** Track these metrics in database and calculate from `email_inbox` and `email_drafts` tables.

---

### 5. PO Intelligence Agent - Missing Tracking

**File:** `services/poIntelligenceAgent.ts:218-219`
```typescript
last_pestered: null, // TODO: Track in database
pester_count: 0, // TODO: Track in database
```

**Impact:** Vendor follow-up tracking is not persisted.

**Fix:** Add `last_pestered` and `pester_count` columns to `purchase_orders` or create separate tracking table.

---

## HIGH PRIORITY (P1) - Auth Context Missing

These items use 'current_user' or 'admin' strings instead of actual user context.

### Auth Context TODO List

| File | Line | Current Value | Required Fix |
|------|------|---------------|--------------|
| `components/DraftPOReviewSection.tsx` | 138, 162 | `'current_user'` | Get from auth context |
| `components/PricingManagementDashboard.tsx` | 104, 135 | `'current_user'` | Get from auth context |
| `components/VendorSkuMappingManager.tsx` | 140, 195 | `'current_user'` | Get from auth context |
| `components/AutonomousControls.tsx` | 80 | `'current_user'` | Get from auth context |
| `components/SOPSettingsPanel.tsx` | 425, 635, 706 | `'admin'` | Get from auth context |
| `components/AlertFeedComponent.tsx` | 155, 171 | `'current_user'` | Get from auth context |
| `components/InventoryItemPanel.tsx` | 181 | `'current_user'` | Get from auth context |
| `services/externalDocumentService.ts` | 433 | `'admin'` | Get from auth context |

**Fix Pattern:**
```typescript
// Before
reviewed_by: 'current_user', // TODO: Get actual user

// After
import { useAuth } from '../hooks/useAuth';
const { user } = useAuth();
reviewed_by: user?.id || 'unknown',
```

---

## MEDIUM PRIORITY (P2) - Simulated/Stubbed Features

### 1. PDF Parsing - Not Implemented

**File:** `services/emailIntelligenceAgent.ts:501-509`
```typescript
* Parse PDF attachment (placeholder - requires PDF parsing library)
// TODO: Integrate PDF parsing library (pdf-parse, pdfjs-dist, etc.)
// For now, mark as needing parsing
```

**Impact:** PDF attachments in emails cannot be parsed for data extraction.

**Fix:** Install and integrate `pdf-parse` or `pdfjs-dist`.

---

### 2. PDF Generation Service - Stubbed

**File:** `services/pdfGenerationService.ts:11-18`
```typescript
* NOTE: Currently stubbed out - install dependencies to enable PDF generation
// Stub types for jsPDF until library is installed
```

**Impact:** PDF export functionality may not work.

**Fix:** Install jsPDF and implement actual PDF generation.

---

### 3. Vendor Pricelist Service - Simulated Extraction

**Files:**
- `services/vendorPricelistService.ts:103-104`:
  ```typescript
  // TODO: Implement Google Docs API integration
  // For now, simulate extraction with mock data
  ```
- `services/vendorPricelistService.ts:143-144`:
  ```typescript
  // TODO: Implement Excel parsing
  // For now, simulate extraction
  ```

**Impact:** Pricelist extraction from Google Docs and Excel files returns mock data.

**Fix:** Implement actual parsing with Google Docs API and xlsx library.

---

### 4. SKU AI Assistant - Simulated Response

**File:** `components/SkuAiAssistant.tsx:73-74`
```typescript
// TODO: Replace with actual AI API call
// For now, simulate AI response
```

**Impact:** SKU AI suggestions are fake.

**Fix:** Integrate with AI gateway service.

---

### 5. Agent Command Widget - Simulated Runs

**File:** `components/AgentCommandWidget.tsx:505`
```typescript
// Simulate agent run
```

**Impact:** Agent execution may not actually run real agents.

**Fix:** Connect to actual agent execution service.

---

### 6. MCP Service Health Check - Not Implemented

**File:** `services/mcpService.ts:99`
```typescript
// TODO: Implement health check when MCP server endpoint is ready
```

**Impact:** MCP server health status is unknown.

---

### 7. Settings Service - Simulated Server Operations

**Files:**
- `services/settingsService.ts:190`: `// TODO: Implement actual server start logic`
- `services/settingsService.ts:209`: `// TODO: Implement actual server stop logic`
- `services/settingsService.ts:223`: `// TODO: Implement actual health check`
- `services/settingsService.ts:348`: `// TODO: Trigger actual scraping via MCP server`

**Impact:** Server management in settings may not actually start/stop servers.

---

## LOW PRIORITY (P3) - Minor TODOs & Enhancements

### Data Service TODOs

| File | Line | TODO |
|------|------|------|
| `lib/dataService.ts` | 187 | Implement Supabase fetch |
| `lib/dataService.ts` | 316 | Implement Supabase fetch |

### Component TODOs

| File | Line | TODO |
|------|------|------|
| `components/ImportExportModal.tsx` | 238 | Handle quoted commas in CSV parsing |
| `components/ImportExportModal.tsx` | 247-249 | Show review modal, column mapping, commit to DB |
| `components/ConsumptionChart.tsx` | 46 | Replace with actual API call |
| `components/WhereUsedBomList.tsx` | 31 | Replace with actual API call |
| `components/PurchaseHistoryTable.tsx` | 51 | Replace with actual API call |
| `components/BomDetailModal.tsx` | 78, 82 | Implement verification update, rescan |
| `components/SOPSettingsPanel.tsx` | 584 | Implement PDF parsing |
| `components/SOPSettingsPanel.tsx` | 796 | Implement applying recommendation |
| `components/SOPSettingsPanel.tsx` | 1154 | Delete template functionality |

### Service TODOs

| File | Line | TODO |
|------|------|------|
| `services/poIntelligenceAgent.ts` | 417 | Integrate with email service |
| `services/googleSheetsService.ts` | 318 | Convert gid to sheet name |
| `services/dataAcquisitionAgent.ts` | 318 | Get spreadsheet URL from context |
| `services/dataAcquisitionAgent.ts` | 359 | Implement CSV upload logic |
| `services/artworkApprovalAgent.ts` | 115 | Track approver assignments |
| `services/aiPurchasingService.ts` | 783 | Integrate with email service |

### Page TODOs

| File | Line | TODO |
|------|------|------|
| `pages/BOMs.tsx` | 820 | Add compliance grouping logic |
| `pages/BOMs.tsx` | 1006 | Load all compliance records |
| `pages/api/email-webhook.ts` | 271 | Implement signature verification |
| `pages/StockIntelligence.tsx` | 427 | Budget analysis feature (shows "coming soon") |

---

## UI "Coming Soon" Placeholders

These are intentional placeholders but should be tracked for implementation:

1. **Budget Analysis Tab** - `pages/StockIntelligence.tsx:427`
   - Shows: "Budget analysis feature coming soon"
   - Status: Not implemented

2. **Pro Features** - `pages/EnhancedNewUserSetup.tsx:577`
   - Shows: "Pro Features Coming Soon"
   - Status: Marketing placeholder

3. **Manual Label Scanner** - `pages/Artwork.tsx:720`
   - Shows: "Manual label scanner component coming soon"
   - Status: Not implemented

---

## Mock Data Still in Production Code

**File:** `types.ts` (lines 1485-2370)

The following mock data exports are used in E2E testing but may accidentally be used in production:
- `mockWatchlist`
- `mockArtworkFolders`
- `mockUsers`
- `mockVendors`
- `mockInventory`
- `mockBOMs`
- `mockBuildOrders`
- `mockInternalRequisitions`
- `mockHistoricalSales`
- `mockProjects`
- `mockTickets`

**Usage in App.tsx:**
- Lines 71-77: Imports mock data
- Lines 242-245: Uses mock data when `isE2ETestMode` is true

**Recommendation:** Move mock data to a separate `__mocks__/` directory and ensure it's only imported in test files.

---

## Simulated Email Functionality

**Files:**
- `App.tsx:1544` - `addToast('Simulated email send for ${poId}.', 'info');`
- `components/EmailComposerModal.tsx:134` - `simulated: true`
- `components/ShareArtworkModal.tsx:317` - Simulates when Gmail not connected

**Status:** This is intentional fallback behavior when Gmail is not connected, but should be clearly indicated to users.

---

## Roadmap Summary

### Immediate (This Week)
1. Fix `costStability` hardcoded to 0
2. Fix `average_resolution_time_hours` calculation
3. Fix Data Acquisition Agent metrics

### Short-term (Next 2 Sprints)
1. Replace all 'current_user'/'admin' strings with actual auth context
2. Implement PDF parsing for email attachments
3. Fix Email Intelligence Agent metrics

### Medium-term (Next Quarter)
1. Implement Budget Analysis tab
2. Complete vendor pricelist parsing
3. Implement all component API calls (ConsumptionChart, WhereUsedBomList, etc.)

### Long-term (Backlog)
1. Move mock data to test directory
2. Implement Manual Label Scanner
3. Complete all service integrations (email, MCP, etc.)

---

## Implementation Checklist

- [ ] P0: Fix costStability calculation
- [ ] P0: Fix average_resolution_time_hours calculation
- [ ] P0: Fix Data Acquisition Agent metrics
- [ ] P0: Fix Email Intelligence Agent metrics
- [ ] P0: Track PO Intelligence pester_count in database
- [ ] P1: Replace all 'current_user' placeholders with auth context
- [ ] P1: Replace all 'admin' placeholders with auth context
- [ ] P2: Implement PDF parsing (emailIntelligenceAgent)
- [ ] P2: Implement PDF generation (pdfGenerationService)
- [ ] P2: Implement vendor pricelist parsing
- [ ] P2: Connect SKU AI Assistant to real AI
- [ ] P2: Implement MCP health check
- [ ] P2: Implement Settings Service server operations
- [ ] P3: Complete all component TODOs
- [ ] P3: Complete all service TODOs
- [ ] P3: Implement Budget Analysis feature
- [ ] P3: Move mock data to test directory
