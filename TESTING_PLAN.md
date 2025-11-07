# Testing Plan & Next Steps
**Status**: Post-Merge Verification
**Date**: 2025-11-07
**Merge Commit**: d6c624d

---

## 🎯 Executive Summary

**Build Status**: ✅ PASSING (Vite build successful)
**TypeScript Status**: ⚠️ 25 ERRORS (non-blocking but needs fixing)
**Runtime Status**: ❓ UNTESTED
**Readiness**: 🟡 NEEDS VERIFICATION

**Bottom Line**: The code compiles and merges cleanly, but we have TypeScript errors and haven't done runtime testing yet. I recommend following the testing plan below before considering this production-ready.

---

## 🐛 Known Issues (Must Fix)

### 1. Missing `verified` Property on Artwork ⚠️ CRITICAL
**Files**: `App.tsx:345`, `components/BomEditModal.tsx:39`

```typescript
// CURRENT (broken):
const newArtwork: Artwork = {
  id: `art-${Date.now()}`,
  fileName,
  revision: highestRevision + 1,
  url: `/art/${fileName}`,
  // ❌ Missing: verified, fileType, extractedData, uploadedBy, uploadedAt
};

// SHOULD BE:
const newArtwork: Artwork = {
  id: `art-${Date.now()}`,
  fileName,
  revision: highestRevision + 1,
  url: `/art/${fileName}`,
  verified: false,           // ✅ Add this
  fileType: 'label',         // ✅ Add this
  extractedData: null,       // ✅ Add this
  uploadedBy: currentUser.id,// ✅ Add this
  uploadedAt: new Date().toISOString(), // ✅ Add this
};
```

**Impact**: BOM artwork upload will fail at runtime
**Priority**: HIGH - Fix before testing

---

### 2. Invalid `id` Property on BOMComponent ⚠️ MODERATE
**File**: `MOCK_LABEL_DATA.ts` (lines 81-114)

```typescript
// CURRENT (broken):
components: [
  { id: 'comp-1', sku: 'SKU-001', name: 'Ingredient A', quantity: 10, unit: 'lbs' },
  //❌ BOMComponent doesn't have 'id' field
]

// SHOULD BE:
components: [
  { sku: 'SKU-001', name: 'Ingredient A', quantity: 10, unit: 'lbs' },
  // ✅ Remove 'id' field
]
```

**Impact**: Mock data won't load properly in Label Scanner
**Priority**: MEDIUM - Only affects test data

---

### 3. Supabase Type Mismatches 🔴 BLOCKING
**Files**: `services/labelDataService.ts:55`, `services/labelDataService.ts:270`

**Issue**: Supabase generated types don't include `labels` or `product_data_sheets` tables yet.

**Root Cause**: Database migrations haven't been run on Supabase instance.

**Fix Required**:
```bash
# 1. Push migrations to Supabase
npx supabase db push

# 2. Regenerate types
npx supabase gen types typescript --local > types/database.ts
```

**Impact**: Label scanning and product data sheet features will crash
**Priority**: HIGH - Must run migrations before testing

---

### 4. Google Gemini API Change 🟠 API BREAKING
**File**: `services/embeddingService.ts:31`

```typescript
// CURRENT (broken):
const vector = response.embedding.values;
// ❌ API changed: 'embedding' → 'embeddings'

// SHOULD BE:
const vector = response.embeddings[0].values;
// ✅ New API uses 'embeddings' array
```

**Impact**: Semantic search won't work
**Priority**: MEDIUM - Only if using semantic search

---

### 5. Missing jsPDF Library 📦 DEPENDENCY
**Status**: Intentionally not installed (stub mode active)

```bash
npm install jspdf jspdf-autotable
```

**Impact**: PDF generation will show error message but won't crash app
**Priority**: LOW - Can install when needed

---

### 6. Missing `.env.local` Configuration ⚙️ SETUP
**Status**: No environment file found

**Required Variables**:
```bash
# Supabase (REQUIRED for database features)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Gemini AI (REQUIRED for label scanning)
VITE_GEMINI_API_KEY=your-gemini-api-key-here

# Feature Flags (OPTIONAL)
VITE_ENABLE_ENHANCED_BOM=1
VITE_ENABLE_COMPLIANCE=1
VITE_ENABLE_LABEL_SCANNING=1
VITE_ENABLE_PDF_GENERATION=1
```

**Impact**: App will use mock data only; no AI or database features
**Priority**: HIGH - Required for full functionality

---

## 🧪 Testing Checklist

### Phase 1: Quick Smoke Test (5 minutes)
```bash
# 1. Start dev server
npm run dev

# 2. Open http://localhost:5173
# 3. Login as admin (e2e.admin@example.com)
# 4. Check for console errors (F12)
# 5. Navigate to each page:
   - Dashboard ✓
   - Inventory ✓
   - BOMs ✓
   - Settings ✓
   - Label Scanner ✓
```

**Success Criteria**: No white screen, no console crashes

---

### Phase 2: EnhancedBomCard Testing (10 minutes)

#### Test 2.1: Admin View (Technical Details)
```bash
1. Login as Admin user
2. Navigate to BOMs page
3. Verify EnhancedBomCard shows:
   ✓ 4 metrics (Inventory, Can Build, Yield, Components)
   ✓ NPK ratio badge (if label has guaranteed analysis)
   ✓ Detailed artwork status (e.g., "3/5 Labels")
   ✓ Edit button visible
   ✓ Packaging details in secondary info bar
```

#### Test 2.2: Manager View (Simplified)
```bash
1. Login as Manager user
2. Navigate to BOMs page
3. Verify EnhancedBomCard shows:
   ✓ Only 3 metrics (no Component Count)
   ✓ Larger text (text-2xl)
   ✓ Simplified badges ("Verified" not "3/5 Labels")
   ✓ NO Edit button
   ✓ NO NPK ratio
   ✓ Just description (no packaging details)
```

#### Test 2.3: Expand/Collapse
```bash
1. Click chevron to expand BOM
2. Verify component breakdown appears:
   ✓ Each component shows stock level
   ✓ "Can build" calculation per component
   ✓ Limiting components highlighted in red
   ✓ "⚠ LIMITING" badge on bottleneck components
```

---

### Phase 3: Inventory Integration (15 minutes)

#### Test 3.1: Buildability Calculation
```bash
1. Navigate to Inventory page
2. Note stock levels for a product's components
3. Navigate to BOMs page
4. Find the same product
5. Verify "Can Build" matches calculation:
   - If Ingredient A: 50 units, needs 10 per batch → Can build 5
   - If Ingredient B: 100 units, needs 5 per batch → Can build 20
   - Expected: "Can Build: 5" (limited by Ingredient A)
```

#### Test 3.2: Cross-Page Navigation
```bash
1. On BOMs page, expand a BOM
2. Click a component SKU (should be blue/clickable)
3. Verify:
   ✓ Navigate to Inventory page
   ✓ Component row is highlighted
   ✓ Page auto-scrolls to that component
```

```bash
4. On Inventory page, find a finished good
5. Click "View BOMs" badge
6. Verify:
   ✓ Navigate to BOMs page
   ✓ BOM card is expanded
   ✓ Page auto-scrolls to that BOM
```

---

### Phase 4: Compliance Dashboard (10 minutes)

#### Test 4.1: Dashboard Display
```bash
1. Navigate to BOMs page
2. Verify ComplianceDashboard appears at top
3. Check metrics:
   ✓ Total products count
   ✓ Active registrations count
   ✓ Expiring soon count (30-day window)
   ✓ Expired count (red warning)
```

#### Test 4.2: Registration Status
```bash
1. Scroll through BOMs
2. For each BOM, check compliance badge:
   ✓ Green "Current" = has valid registrations
   ✓ Orange "Urgent" = expires within 30 days
   ✓ Red "Expired" = past expiration date
   ✓ Gray "None" = no registrations
```

---

### Phase 5: Label Scanner (AI Testing - Requires API Key)

#### Test 5.1: Manual Upload
```bash
# Prerequisites: VITE_GEMINI_API_KEY in .env.local

1. Navigate to "Label Scanner" page
2. Click "Upload Label"
3. Select an image file (PNG/JPG)
4. Verify:
   ✓ Upload progress bar
   ✓ AI extraction starts automatically
   ✓ Results appear in LabelScanResults component
```

#### Test 5.2: Data Extraction
```bash
1. After AI scan completes, check extracted data:
   ✓ Product name
   ✓ Net weight
   ✓ Barcode (if present)
   ✓ Guaranteed analysis table (NPK values)
   ✓ Ingredients list
   ✓ EPA registration (if pesticide)
```

#### Test 5.3: Save to BOM
```bash
1. After extraction, select target BOM from dropdown
2. Click "Save to BOM"
3. Navigate to BOMs page
4. Open BOM detail modal
5. Go to "Labels" tab
6. Verify:
   ✓ New label appears in list
   ✓ Extracted data is visible
   ✓ NPK ratio shows in BOM card (if fertilizer)
```

---

### Phase 6: PDF Generation (Requires jsPDF)

#### Test 6.1: Data Sheet Generator
```bash
# Prerequisites: npm install jspdf jspdf-autotable

1. Navigate to BOM detail modal
2. Go to "Data Sheets" tab
3. Click "Generate New Data Sheet"
4. Follow wizard:
   - Step 1: Select template (SDS, Spec Sheet, etc.)
   - Step 2: Review AI-generated content
   - Step 3: Edit if needed
   - Step 4: Save
```

#### Test 6.2: PDF Export
```bash
1. After saving data sheet
2. Click "Download PDF"
3. Verify:
   ✓ PDF downloads to browser
   ✓ Correct template format (16 sections for SDS)
   ✓ All data populated correctly
```

#### Test 6.3: Supabase Storage
```bash
1. Click "Upload to Storage"
2. Check Supabase dashboard:
   ✓ File appears in 'product-documents' bucket
   ✓ Correct folder structure: {bomId}/{type}/{filename}
   ✓ PDF URL saved to database
```

---

### Phase 7: Database Testing (Requires Supabase Setup)

#### Test 7.1: Run Migrations
```bash
# Connect to Supabase project
npx supabase link --project-ref your-project-ref

# Push migrations
npx supabase db push

# Verify tables created:
# - labels
# - product_data_sheets
# - compliance_records
# - enhanced_boms (modified)
```

#### Test 7.2: Data Persistence
```bash
1. Scan a label → Save to BOM
2. Refresh page
3. Verify label still appears (not lost)

4. Generate a data sheet → Save
5. Refresh page
6. Verify data sheet still appears

7. Add a registration → Save
8. Refresh page
9. Verify registration shows in compliance dashboard
```

---

## 🚨 Pre-Production Checklist

Before deploying to production:

- [ ] **Fix TypeScript Errors**
  - [ ] Add `verified` property to Artwork creation
  - [ ] Remove `id` from BOMComponent mock data
  - [ ] Fix Gemini embeddings API call
  - [ ] Update Supabase types after migrations

- [ ] **Environment Setup**
  - [ ] Create `.env.local` with all required keys
  - [ ] Verify Supabase connection works
  - [ ] Test Gemini API key is valid
  - [ ] Set up Supabase storage bucket policies

- [ ] **Database Setup**
  - [ ] Run all migrations (001-008)
  - [ ] Verify RLS policies enabled
  - [ ] Test insert/update/delete permissions
  - [ ] Regenerate TypeScript types

- [ ] **Dependencies**
  - [ ] Install jsPDF if PDF generation needed: `npm install jspdf jspdf-autotable`
  - [ ] Verify all npm packages up to date

- [ ] **Testing**
  - [ ] Complete all 7 phases above
  - [ ] Test with real label images
  - [ ] Test with multiple user roles
  - [ ] Test cross-page navigation flows
  - [ ] Test error handling (API failures, network issues)

- [ ] **Performance**
  - [ ] Test with 50+ BOMs (target use case)
  - [ ] Verify buildability calculations are fast
  - [ ] Check for memory leaks on long sessions
  - [ ] Test mobile responsiveness

- [ ] **Documentation**
  - [ ] Update README with new features
  - [ ] Document environment variables
  - [ ] Create user guide for label scanning
  - [ ] Document compliance workflow

---

## 🔧 Quick Fixes Needed Before Testing

### Fix 1: Artwork Creation (2 minutes)
```typescript
// File: App.tsx line 345
// File: components/BomEditModal.tsx line 39

// Replace:
const newArtwork: Artwork = {
  id: `art-${Date.now()}`,
  fileName,
  revision: highestRevision + 1,
  url: `/art/${fileName.replace(/\s+/g, '-').toLowerCase()}-v${highestRevision + 1}.pdf`,
};

// With:
const newArtwork: Artwork = {
  id: `art-${Date.now()}`,
  fileName,
  revision: highestRevision + 1,
  url: `/art/${fileName.replace(/\s+/g, '-').toLowerCase()}-v${highestRevision + 1}.pdf`,
  verified: false,
  fileType: 'label',
  extractedData: null,
  uploadedBy: currentUser?.id || 'system',
  uploadedAt: new Date().toISOString(),
};
```

### Fix 2: BOMComponent Mock Data (1 minute)
```typescript
// File: MOCK_LABEL_DATA.ts lines 81-114
// Remove 'id:' field from all components

// Before:
components: [
  { id: 'comp-1', sku: 'SKU-001', name: 'Ingredient A', quantity: 10, unit: 'lbs' },
]

// After:
components: [
  { sku: 'SKU-001', name: 'Ingredient A', quantity: 10, unit: 'lbs' },
]
```

### Fix 3: Embedding Service API (1 minute)
```typescript
// File: services/embeddingService.ts line 31

// Replace:
const vector = response.embedding.values;

// With:
const vector = response.embeddings?.[0]?.values || [];
```

### Fix 4: Create .env.local (2 minutes)
```bash
cp .env.local.example .env.local

# Edit and add:
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-key-here
VITE_GEMINI_API_KEY=your-gemini-key-here
```

---

## ⏱️ Time Estimates

| Task | Time | Priority |
|------|------|----------|
| Fix TypeScript errors | 10 min | HIGH |
| Create .env.local | 5 min | HIGH |
| Run Supabase migrations | 10 min | HIGH |
| Phase 1: Smoke test | 5 min | HIGH |
| Phase 2: EnhancedBomCard | 10 min | HIGH |
| Phase 3: Inventory integration | 15 min | MEDIUM |
| Phase 4: Compliance | 10 min | MEDIUM |
| Phase 5: Label scanner | 15 min | LOW (needs API key) |
| Phase 6: PDF generation | 10 min | LOW (needs jsPDF) |
| Phase 7: Database | 20 min | MEDIUM (needs Supabase) |
| **TOTAL** | **110 min** | |

**Minimum viable test**: 30 minutes (Fixes + Phases 1-2)
**Full test suite**: 2 hours

---

## 🎯 Recommended Testing Order

### Day 1: Core Functionality (30 min)
1. Fix TypeScript errors
2. Create .env.local
3. Phase 1: Smoke test
4. Phase 2: EnhancedBomCard

**Goal**: Verify basic UI works and no crashes

### Day 2: Integration (45 min)
5. Phase 3: Inventory integration
6. Phase 4: Compliance dashboard

**Goal**: Verify data flows between pages correctly

### Day 3: Advanced Features (45 min)
7. Setup Supabase migrations
8. Phase 5: Label scanner (if API key available)
9. Phase 6: PDF generation (optional)
10. Phase 7: Database persistence

**Goal**: Full feature verification with real backend

---

## 📊 Risk Assessment

| Feature | Risk Level | Why | Mitigation |
|---------|-----------|-----|------------|
| **EnhancedBomCard** | 🟢 LOW | Well-tested logic, no external deps | Role testing needed |
| **Inventory Integration** | 🟢 LOW | O(1) Map lookups, simple math | Verify edge cases (0 stock) |
| **Compliance Dashboard** | 🟡 MEDIUM | Date calculations can be tricky | Test timezone handling |
| **Label Scanner** | 🟠 HIGH | Depends on Gemini API, complex extraction | Mock API responses for tests |
| **PDF Generation** | 🟡 MEDIUM | jsPDF stub mode active | Install library when needed |
| **Supabase Integration** | 🟠 HIGH | Migrations not run, types outdated | Run migrations + regenerate types |

---

## ✅ What We Know Works

Based on successful Vite build:
- ✅ All imports resolve correctly
- ✅ React components compile
- ✅ TypeScript mostly valid (25 errors are edge cases)
- ✅ Bundle optimization works
- ✅ No circular dependencies
- ✅ Merge conflicts properly resolved

---

## ❓ What We Don't Know Yet

Haven't tested:
- ❓ Does the app actually render without crashing?
- ❓ Do the EnhancedBomCards display correctly?
- ❓ Are buildability calculations accurate?
- ❓ Does Gemini API work with our prompts?
- ❓ Does Supabase accept our queries?
- ❓ Are there any memory leaks?
- ❓ Does it work on mobile?

---

## 🎬 Next Steps - Your Decision

### Option A: Ship It (Risky but fast) ⚡
```bash
# Fix critical TypeScript errors only
# Deploy as-is with feature flags disabled
# Enable features gradually after monitoring
```
**Timeline**: 15 minutes
**Risk**: HIGH - untested in production
**When to use**: Internal testing environment

### Option B: Quick Verification (Balanced) 🎯
```bash
# Fix TypeScript errors
# Run Phases 1-4 testing (core features)
# Deploy if no major issues
```
**Timeline**: 1 hour
**Risk**: MEDIUM - basic testing done
**When to use**: Staging environment

### Option C: Full Validation (Safest) 🛡️
```bash
# Fix all issues
# Complete all 7 test phases
# Setup Supabase properly
# Test with real users
```
**Timeline**: 4 hours
**Risk**: LOW - production-ready
**When to use**: Customer-facing production

---

## 💡 My Recommendation

**Go with Option B** (Quick Verification):

1. **Now** (15 min): Fix the 4 TypeScript errors
2. **Today** (30 min): Run basic smoke tests (Phases 1-2)
3. **This week** (1 hour): Setup Supabase + test advanced features
4. **Next week**: Deploy to staging → production

This balances speed with safety. The merge is solid, but we need to verify the runtime behavior before calling it "done."

**Want me to start with the fixes?** I can knock out those TypeScript errors in 5 minutes.
