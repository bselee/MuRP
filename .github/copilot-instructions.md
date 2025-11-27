# MuRP - AI Coding Agent Instructions

Manufacturing Resource Planning system with AI-powered compliance, tier-based AI Gateway, and secure API integrations.

## 🚀 Quick Start for New Contributors

**First-time setup:**
```bash
npm install                    # Install dependencies
npm run dev                    # Start dev server (localhost:5173)
```

**Before making any changes:**
1. Read `SCHEMA_ARCHITECTURE.md` - understand the 4-layer data flow
2. Check `docs/MIGRATION_CONVENTIONS.md` - Supabase migration numbering rules
3. Run `npm test` - ensure everything works
4. Use `?e2e=1` in URLs for testing without auth

**Key principle:** Never query databases or call AI providers directly - always use service layers and hooks.

---

## 🏗️ Architecture Overview

### 4-Layer Schema System
**Critical pattern used across all data types.** All data transformations follow: `Raw → Parsed → Database → Display`

- **Raw**: External sources (CSV columns, API responses) - see `lib/schema/index.ts`
- **Parsed**: Validated/normalized with Zod schemas - proper TypeScript types
- **Database**: Supabase table format (snake_case) - use transformers in `lib/schema/transformers.ts`
- **Display**: UI-optimized with computed fields - includes formatters

Example workflow:
```typescript
// Transform Finale API data
const result = transformFinaleData(rawApiResponse); // Raw → Parsed
const dbData = transformVendorParsedToDatabase(result.data); // Parsed → Database
await supabase.from('vendors').insert(dbData);
```

**Read `SCHEMA_ARCHITECTURE.md` before modifying any data transformations.**

### AI Gateway Service Architecture
Tier-based routing with automatic fallbacks (`services/aiGatewayService.ts`):

- **Basic Tier**: Free Gemini (100 msg/month) - `generateAIResponse(messages, featureType, 'basic')`
- **Full AI Tier**: Premium models via Vercel AI Gateway - GPT-4o, Claude, etc.
- **Automatic Fallback**: Falls back to direct Gemini if Gateway fails

**Never** call AI providers directly - always use `generateAIResponse()` from aiGatewayService.

### Unified Data Service Layer
Use `lib/dataService.ts` for all data access - automatically switches between sources:

```typescript
import { getInventoryData, getVendorData } from './lib/dataService';

// Automatically uses: Mock data (dev) → Finale API (live) → Supabase (cached)
const inventory = await getInventoryData();
const vendors = await getVendorData();
```

### Secure API Integration Pattern
All external API calls use this 3-layer security pattern:

1. **Frontend**: `services/secureApiClient.ts` - never exposes API keys
2. **Proxy**: `supabase/functions/api-proxy/index.ts` - authentication, rate limiting, audit logging
3. **External API**: Finale Inventory, Google APIs, etc.

Complete resilience stack in `services/finaleIngestion.ts`:
```typescript
import { retryWithBackoff } from './retryWithBackoff'; // Exponential backoff
import { createCircuitBreaker } from './circuitBreaker'; // Failure detection
import { createRateLimiter } from './rateLimiter'; // Request queuing
```

## 🔑 Critical Developer Workflows

### Build & Test Commands
```bash
npm run dev                    # Vite dev server (port 5173)
npm run build                  # TypeScript + Vite production build
npm test                       # Schema transformers + inventory tests
npm run e2e                    # Playwright E2E (14 tests, ?e2e=1 bypasses auth)
npm run test:transformers:all  # Comprehensive schema validation
```

**Before any commit**: Tests MUST pass. Build MUST succeed. See TFR protocol in existing instructions.

### Supabase Migration Workflow
**Strict three-digit numbering** - never skip or reuse numbers:

```bash
# 1. Find highest migration number
ls supabase/migrations | sort | tail -1  # e.g., 037_po_tracking.sql

# 2. Create new migration (next number: 038)
supabase migration new feature_name
mv supabase/migrations/<timestamp>_feature_name.sql supabase/migrations/038_feature_name.sql

# 3. Test locally
supabase db reset
supabase db lint

# 4. Apply remotely
supabase db push
```

**Migration numbering example:**
```
✅ CORRECT:                    ❌ WRONG:
035_add_vendors.sql           035_add_vendors.sql
036_add_inventory.sql         037_add_inventory.sql  ← skipped 036!
037_add_po_tracking.sql       035_fix_vendors.sql    ← reused 035!
```

**Read `docs/MIGRATION_CONVENTIONS.md`** for full rules. Reviewers will reject misnumbered migrations.

### E2E Testing Pattern
All E2E tests use `?e2e=1` query param to bypass authentication:

```typescript
// In e2e/*.spec.ts
await page.goto('/vendors?e2e=1');

// This triggers isE2ETesting() in lib/auth/guards.ts
// Auto-logs in as DEV_DEFAULT_USER in E2E mode
```

Use `test.describe()` → `test.beforeEach()` → individual `test()` blocks. See `e2e/vendors.spec.ts` for patterns.

## 🎨 Component & State Patterns

### Modal Management
**Always** use `useModalState()` hook for consistent behavior:

```typescript
import useModalState from './hooks/useModalState';

const { isOpen, open, close, toggle } = useModalState();
// Returns: { isOpen: boolean, open: fn, close: fn, toggle: fn }
```

### Data Fetching
Use Supabase data hooks - **never** query Supabase directly in components:

```typescript
// Fetching
import { useSupabaseInventory, useSupabaseVendors } from './hooks/useSupabaseData';
const { data: inventory, loading, error } = useSupabaseInventory();

// Mutations
import { createPurchaseOrder, updateInventoryStock } from './hooks/useSupabaseMutations';
await createPurchaseOrder({ vendorId, items, ... });
```

### Persistent State
Use `usePersistentState()` for localStorage with type safety:

```typescript
import usePersistentState from './hooks/usePersistentState';
const [settings, setSettings] = usePersistentState<UserSettings>('key', defaultValue);
```

### Error Boundaries
**Wrap all page components** in ErrorBoundary:

```typescript
import ErrorBoundary from './components/ErrorBoundary';

<ErrorBoundary>
  <InventoryPage />
</ErrorBoundary>
```

## 📦 Service Layer Conventions

### Feature-Focused Services
Services are organized by **feature**, not data type:

- `complianceService.ts` - State regulatory compliance logic
- `aiGatewayService.ts` - Unified AI provider access (tier-aware)
- `usageTrackingService.ts` - AI usage analytics and cost tracking
- `mcpService.ts` - Model Context Protocol server integration
- `finaleIngestion.ts` - Complete Finale API integration pattern

### Error Handling Pattern
**All services** use this consistent pattern:

```typescript
try {
  const result = await apiCall();
  return { success: true, data: result };
} catch (error) {
  console.error('Operation failed:', error);
  return { success: false, error: error.message };
}
```

Never throw errors from services - return `{ success: false, error }` objects.

## 🔧 Key Integration Points

### Finale Inventory API
- Authentication: Basic auth via secure proxy
- Data sync: CSV reports + REST API
- **Always transform** with `transformFinaleData()` before use
- Complete example: `services/finaleIngestion.ts`

### MCP Server (`mcp-server/`)
Python-based compliance tools with tier support:
- OCR text extraction from label images
- State regulation scraping from .gov sites
- Compliance analysis and checklist generation
- See `docs/MCP_SETUP_GUIDE.md` for admin configuration

### Vercel AI Gateway
Multi-provider AI access through single endpoint:
- Configure in `aiGatewayService.ts` with `createGatewayProvider()`
- Automatic provider selection based on feature type
- Usage tracking for cost monitoring in `usageTrackingService.ts`

### Google Sheets Integration
Two-way sync for inventory and vendor data:
- OAuth2 flow: `services/googleAuthService.ts`
- Sheet operations: `services/googleSheetsService.ts`
- Batch updates for performance - never single-row operations

## 📁 Key Files to Reference

### Architecture & Patterns
- `App.tsx` - Main component structure, routing, global state
- `lib/schema/transformers.ts` - Data transformation examples
- `services/aiGatewayService.ts` - AI integration patterns (tier-aware)
- `components/ErrorBoundary.tsx` - Error handling component

### Database & API
- `supabase/migrations/` - Numbered schema evolution (strict conventions)
- `supabase/functions/api-proxy/index.ts` - Secure backend proxy pattern
- `services/secureApiClient.ts` - Frontend API client (never exposes keys)

### Testing
- `e2e/vendors.spec.ts` - E2E testing patterns (14 tests passing)
- `tests/inventoryDisplay.test.ts` - Unit test patterns
- `playwright.config.ts` - E2E configuration

### Documentation
- `SCHEMA_ARCHITECTURE.md` - Detailed 4-layer schema design
- `docs/MIGRATION_CONVENTIONS.md` - Supabase migration rules
- `SUPABASE_DEPLOYMENT_GUIDE.md` - Deployment procedures
- `API_INGESTION_SETUP.md` - Complete API integration setup

## 🚨 Common Pitfalls

### ❌ Don't Do This
```typescript
// Direct AI provider calls
import { GoogleGenerativeAI } from '@google/genai';
const genAI = new GoogleGenerativeAI(apiKey); // WRONG - bypasses tier system

// Direct Supabase queries in components
const { data } = await supabase.from('vendors').select(); // WRONG - use hooks

// Skipping schema transformation
await supabase.from('vendors').insert(rawCsvData); // WRONG - data loss!

// Hardcoding migration numbers
// 032_feature.sql
// 035_another.sql  // WRONG - skipped 033, 034!
```

### ✅ Do This Instead
```typescript
// Tier-aware AI calls
import { generateAIResponse } from './services/aiGatewayService';
const response = await generateAIResponse(messages, 'chat', userTier);

// Use data hooks
import { useSupabaseVendors } from './hooks/useSupabaseData';
const { data: vendors } = useSupabaseVendors();

// Transform data through all layers
const parsed = transformVendorRawToParsed(csvRow);
const dbData = transformVendorParsedToDatabase(parsed.data);

// Sequential migration numbering
ls supabase/migrations | sort | tail -1  # Check highest number first
```

## 🎯 Development Notes

- **Absolute imports**: Use from project root (configured in `vite.config.ts`)
- **TypeScript strict mode**: All types must be explicit - no `any`
- **Zod runtime validation**: Prefer over manual type checking
- **Async error handling**: All async operations need try/catch with `{ success, error }` pattern
- **Accessibility**: Semantic HTML with ARIA labels for all interactive components
- **State management**: React state only - no Redux/MobX/Zustand
- **Finding patterns**: Search `hooks/` and `services/` directories before creating new utilities - likely already exists

## 📚 Quick Command Reference

```bash
# Development
npm run dev                    # Start dev server
npm run build                  # Production build
npm test                       # Run all tests

# Supabase
supabase status                # Check local instance
supabase db reset              # Rebuild local schema
supabase db push               # Apply migrations to remote
supabase gen types typescript --local > types/supabase.ts

# Testing
npm run e2e                    # Run Playwright tests
npm run e2e:ui                 # Playwright UI mode

# Google Sheets Sync
npm run gemini                 # CLI for AI testing
```

---

**For detailed workflows** (TFR protocol, deployment automation, error recovery), see the Universal Codespace Workflows sections that follow below.

**💡 Pro Tip:** When starting a session, simply say "resume" or "catch me up" to trigger automatic session context loading.

---

## 🤖 Universal Codespace Automation

### 1. Automatic Session Resumption (STARTUP)

**When to trigger:** First interaction in a new Copilot session or when user says "resume", "catch me up", "what was I working on?"

**Automatic startup workflow:**
```bash
# 1. Find most recent session document
ls -t docs/SESSION_SUMMARY_*_to_CURRENT.md 2>/dev/null | head -1

# 2. Check recent commits
git log --oneline -5

# 3. Check uncommitted changes
git status --short

# 4. Check recent file modifications
find . -type f -name "*.ts" -o -name "*.tsx" -mtime -1 | grep -v node_modules | head -10
```

**Present to user:**
```markdown
## 📋 Session Context

**Resuming from:** [last session date/time from SESSION_SUMMARY]

**Last session summary:**
- Worked on: [feature/task from last session]
- Files modified: [list from session doc]
- Next steps: [checklist items from session doc]

**Recent commits:**
- [commit hash] [commit message]
- [commit hash] [commit message]

**Uncommitted changes:**
- [file1] - [M/A/D status]
- [file2] - [M/A/D status]

**Ready to continue or start something new?**
```

### 2. Session Documentation During Work

**Trigger Conditions:**
- **60-minute idle** - No user input for 60 minutes, assume session ending (auto-document before hibernation)
- End of development session (user indicates wrapping up, "done for now", "closing")
- Significant milestone reached (feature complete, major refactor, deployment)
- User requests "update session docs" or "document changes"
- Daily rollover (if session spans multiple days)

**Documentation Process:**
```bash
# STARTUP WORKFLOW (First Copilot interaction):
1. Read: docs/SESSION_SUMMARY_*_to_CURRENT.md (last session context)
2. Check: git log -1 (last commit to understand recent work)
3. Check: git status (uncommitted changes from previous session)
4. Summarize for user:
   - "Resuming from: [last session date/time]"
   - "Last worked on: [feature/task from session doc]"
   - "Uncommitted changes: [files listed]"
   - "Next steps from last session: [checklist items]"
5. Ask: "Ready to continue, or new direction?"

# IDLE DETECTION (60 minutes no input):
1. Check: git status --short (any uncommitted work?)
2. If changes exist:
   - Append to SESSION_SUMMARY with timestamp
   - Document: Work in progress, files modified
   - Note: "Session paused - uncommitted changes preserved"
   - DO NOT commit (preserve WIP state)
3. If no changes:
   - Append brief note: "Session idle - no changes since [last-commit-time]"

# MANUAL/MILESTONE DOCUMENTATION:
1. Identify or create: docs/SESSION_SUMMARY_YYYY-MM-DD_to_CURRENT.md
2. Append new section with timestamp
3. Document:
   - Changes made (files modified/created/deleted)
   - Key decisions and rationale
   - Problems encountered and solutions
   - Tests added/fixed
   - Next steps and open questions
4. Auto-commit: "docs: update session summary for YYYY-MM-DD"
```

**Session Doc Template:**
```markdown
### Session: YYYY-MM-DD HH:MM - HH:MM

**Changes Made:**
- Created: `path/to/file.ts` - Purpose
- Modified: `existing/file.tsx` - What changed and why
- Deleted: `old/file.js` - Reason for removal

**Key Decisions:**
- Decision: Use X instead of Y for Z feature
- Rationale: Performance/maintainability/compatibility reasons

**Tests:**
- Added: `e2e/feature.spec.ts` - Coverage for new feature
- Fixed: `tests/service.test.ts` - Resolved flaky timeout issue

**Problems & Solutions:**
- Problem: API integration failing with 403
- Solution: Added authorization header, updated env vars

**Next Steps:**
- [ ] Complete unit tests for service layer
- [ ] Document API endpoints
- [ ] Deploy to staging for QA review

**Open Questions:**
- Should we refactor X before adding Y feature?
- Need clarification on edge case handling for Z
```

---

### 2. TFR Protocol (Test-Fix-Refactor)

**Mandatory workflow before ANY commit or push:**

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: TEST                                                 │
│ - Run full test suite: npm test                             │
│ - Run E2E tests if applicable: npm run e2e                  │
│ - Check TypeScript compilation: npm run build               │
│ - Verify no console errors in critical paths                │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: FIX (if tests fail)                                 │
│ - Analyze failure output                                    │
│ - Identify root cause (not just symptoms)                   │
│ - Fix code OR update tests if requirements changed          │
│ - Re-run tests until ALL pass                               │
│ - NEVER skip failing tests - always resolve                 │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: REFACTOR (code quality check)                       │
│ - Remove console.log() debug statements                     │
│ - Extract duplicated code into functions                    │
│ - Add JSDoc comments for complex logic                      │
│ - Check for TypeScript 'any' types - make explicit          │
│ - Verify error handling in async functions                  │
│ - Run linter if available: npm run lint                     │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: RE-TEST (verify refactoring didn't break anything)  │
│ - Run tests again: npm test                                 │
│ - Confirm build still succeeds                              │
│ - Only proceed if ALL tests pass                            │
└─────────────────────────────────────────────────────────────┘
                         ↓
                  ✅ READY TO COMMIT
```

**Test Hierarchy:**
- **Unit Tests**: Run frequently during development (fast feedback)
- **Integration Tests**: Run before commits (moderate speed)
- **E2E Tests**: Run before pushes to GitHub (comprehensive but slow)

**Failure Handling:**
```typescript
// When tests fail, follow this diagnostic process:
1. Read error message completely - don't skim
2. Check stack trace for exact file/line
3. Verify test expectations match current requirements
4. Run individual failing test in isolation
5. Add console.log() strategically to trace execution
6. Fix root cause, not symptoms
7. Remove debug logging after fix
8. Run full suite to ensure no regression
```

---

### 3. Project Housekeeping Automation

**Trigger Conditions:**
- User requests "housekeeping", "organize files", or "clean up project"
- Before milestone pushes to GitHub
- Weekly automatic scan (if enabled in workflow)

**Housekeeping Checklist:**

```bash
# 1. Documentation Organization
- Move orphaned docs to /docs/archive/YYYY-MM/
- Archive session docs older than 30 days (unless named CURRENT)
- Update /docs/README.md or index if exists
- Consolidate duplicate README files
- Ensure all .md files have descriptive names

# 2. Test File Organization
- E2E tests → /e2e/ directory
- Unit tests → /tests/ or colocated with source
- Test fixtures → /tests/fixtures/ or __fixtures__/
- Remove .skip() from tests (fix or delete instead)

# 3. Code Cleanup
- Remove commented-out code blocks (use git history instead)
- Delete unused imports (run linter auto-fix)
- Remove unused files (verify with grep before deletion)
- Clean /dist/, /build/, /.next/ if not in .gitignore

# 4. Configuration Files
- Root level: package.json, tsconfig.json, vite.config.ts, etc.
- Environment: .env.example up-to-date (never .env itself)
- Docker/DevContainer: .devcontainer/ directory

# 5. Temporary Files
- Remove .DS_Store, Thumbs.db
- Clean editor swap files (*.swp, *~)
- Remove test-*.js or debug-*.ts temp files
```

**File Organization Rules:**
```
/docs/                          # All documentation
  /archive/YYYY-MM/             # Archived session docs
  SESSION_SUMMARY_*_to_CURRENT.md  # Active session tracking
  FEATURE_NAME.md               # Feature-specific docs
  
/tests/                         # Unit/integration tests
  /fixtures/                    # Test data
  
/e2e/                           # End-to-end tests
  *.spec.ts                     # Playwright/Cypress tests
  
/services/                      # Business logic
/components/                    # UI components
/lib/                           # Utilities, shared code
/types/                         # TypeScript type definitions

Root level:                     # Only essential configs
  package.json, tsconfig.json, README.md, .gitignore
```

---

### 4. Milestone Push to GitHub (Fully Autonomous)

**Command Trigger:** User says "push to github", "milestone push", or "commit and push"

**Fully Automated Workflow:**
```bash
# Execute autonomously without user confirmation:

1. TFR Cycle (automatic error fixing)
   └─ npm test
   └─ IF FAILS: Analyze errors, apply fixes, re-test automatically
   └─ npm run build
   └─ IF FAILS: Fix TypeScript/build errors, rebuild automatically
   └─ Loop until all tests pass and build succeeds
   
2. Update Session Documentation
   └─ Append to SESSION_SUMMARY_*_to_CURRENT.md
   └─ Document all changes, decisions, fixes applied
   
3. Housekeeping Check (quick scan)
   └─ Flag issues but don't block push
   └─ Auto-fix: Remove console.logs, clean temp files
   
4. Stage Changes
   └─ git add -A
   
5. Generate Commit Message (Conventional Commits format)
   Format: <type>(<scope>): <description>
   
   Types:
   - feat: New feature
   - fix: Bug fix
   - docs: Documentation only
   - refactor: Code restructuring
   - test: Adding/updating tests
   - chore: Maintenance, deps, config
   - perf: Performance improvement
   
   Scope Detection:
   - services/* → scope: services
   - components/* → scope: ui
   - docs/* → scope: docs
   - supabase/migrations/* → scope: db
   - e2e/* or tests/* → scope: tests
   
   Example: "feat(services): add PO tracking automation"
   
6. Commit
   └─ git commit -m "<generated message>"
   
7. Push to Origin
   └─ git push origin <current-branch>
   
8. Full Report with Deployment Verification
   └─ Display:
      ✅ Commit SHA and pushed files count
      ✅ Test results summary (X/Y passing)
      ✅ Build success confirmation
      ✅ Session docs updated
      ✅ Files staged and committed
      ✅ Ready for Vercel deployment
      
9. Automatic Vercel Deployment (if configured)
   └─ Proceed to Section 5 workflow automatically
```

**Pre-Push Verification Checklist:**
```
✅ All tests passing (npm test)
✅ TypeScript compilation clean (npm run build)
✅ No console.error() in production code
✅ Session docs updated
✅ Sensitive data not staged (.env, API keys, credentials)
✅ Large files excluded (check for >10MB files)
✅ Commit message follows conventions
```

---

### 5. Vercel Deployment Loop (Fully Autonomous)

**Command Trigger:** User says "deploy to vercel", "fix vercel errors", or "redeploy until clean"
**Auto-Trigger:** After successful GitHub push (if Vercel configured)

**Fully Autonomous Deployment Workflow:**
```bash
# Executes automatically without user commands until error-free:

┌─────────────────────────────────────────────────────────────┐
│ STEP 1: PRE-DEPLOYMENT CHECKS                                │
│ - Verify vercel CLI installed: vercel --version              │
│ - Check authentication: vercel whoami                        │
│ - Verify project linked: vercel ls (shows current project)   │
│ - Run local build test: npm run build                        │
│ - Check environment variables: vercel env ls                 │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: DEPLOY TO PREVIEW/PRODUCTION                         │
│ - Preview: vercel (auto preview URL)                         │
│ - Production: vercel --prod                                  │
│ - Capture deployment URL from output                         │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: CHECK DEPLOYMENT STATUS                              │
│ - Wait for build completion (vercel shows progress)          │
│ - Fetch logs: vercel logs <deployment-url>                   │
│ - Check for errors in build output                           │
│ - Verify deployment state: Success | Error | Ready           │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: ERROR ANALYSIS (if deployment failed)                │
│ - Parse error messages from logs                             │
│ - Common error patterns:                                     │
│   • TypeScript errors → Fix types, recompile                 │
│   • Missing env vars → vercel env add KEY                    │
│   • Build command failed → Check package.json scripts        │
│   • Import errors → Verify module resolution                 │
│   • Out of memory → Adjust build config                      │
│ - Identify root cause, not symptoms                          │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: FIX ERRORS                                           │
│ - Apply fixes to source code                                 │
│ - Update vercel.json if configuration issue                  │
│ - Add missing environment variables                          │
│ - Test fix locally: npm run build                            │
│ - Commit fix: git commit -m "fix(deploy): resolve X error"   │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 6: REDEPLOY                                             │
│ - Push to GitHub: git push origin main                       │
│ - Redeploy: vercel --prod (or wait for auto-deploy)          │
│ - Return to STEP 3 (check status again)                      │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 7: DEPLOYMENT CONFIRMATION (automatic, no commands)     │
│ - Extract deployment URL from vercel output                  │
│ - Calculate build duration from logs                         │
│ - Verify deployment status: vercel inspect <url>             │
│ - Check for runtime errors: vercel logs <url>                │
│ - Display full deployment report (see template below)        │
│ - Mark session as successfully deployed                      │
└─────────────────────────────────────────────────────────────┘
                         ↓
                  ✅ DEPLOYMENT COMPLETE
                  
NOTE: Entire workflow runs autonomously. No user commands required.
Agent handles all error detection, fixing, retries, and verification.
```

**Vercel Error Patterns & Fixes:**
```typescript
// TypeScript compilation errors
Error: "TS2307: Cannot find module 'X'"
Fix: 
  1. Check import path is correct
  2. Verify module is in package.json dependencies
  3. Run: npm install
  4. Check tsconfig.json paths configuration

// Environment variable errors  
Error: "process.env.VITE_X is undefined"
Fix:
  1. vercel env add VITE_X
  2. Enter value when prompted
  3. Select environments (production, preview, development)
  4. Redeploy to pick up new env var

// Build command errors
Error: "Command 'vite build' exited with 1"
Fix:
  1. Run locally: npm run build
  2. Fix any errors shown
  3. Verify vercel.json has correct buildCommand
  4. Check package.json "build" script

// Memory/timeout errors
Error: "Build exceeded maximum duration"
Fix:
  1. Add to vercel.json: { "builds": [{ "maxDuration": 60 }] }
  2. Optimize bundle size (code splitting)
  3. Check for infinite loops in build scripts

// Import resolution errors
Error: "Module not found: Can't resolve '@/components/X'"
Fix:
  1. Check tsconfig.json paths match vite.config.ts alias
  2. Verify case sensitivity (Linux is case-sensitive)
  3. Ensure file exists at import path
```

**Quick Diagnostic Commands:**
```bash
# Check deployment status
vercel ls

# View recent deployments
vercel list

# Inspect specific deployment
vercel inspect <deployment-url>

# Stream logs in real-time
vercel logs --follow

# Check environment variables (safe, no values shown)
vercel env ls

# Pull env vars to local .env (for testing)
vercel env pull .env.local
```

**Full Deployment Report Template:**
```markdown
## 🚀 Deployment Report - YYYY-MM-DD HH:MM

### GitHub Push
✅ Commit: abc1234
✅ Branch: main → main
✅ Files Changed: 5 (+234, -12)
✅ Tests: 15/15 passing
✅ Build: TypeScript compilation clean
✅ Session Docs: Updated

### Vercel Deployment
✅ Deployment URL: https://your-project-abc123.vercel.app
✅ Environment: Production
✅ Build Duration: 45.2s
✅ Build Status: Success
✅ Runtime Status: Healthy
✅ Deployment Logs: No errors

### Verification
✅ Deployment accessible (200 OK)
✅ No runtime errors in logs
✅ Environment variables loaded
✅ All routes responding

### Summary
Deployment completed successfully with zero errors.
All automated fixes applied and verified.
System ready for production traffic.

---
**Total Time:** 2m 34s (tests + build + deploy + verification)
**Errors Fixed:** 0 (no issues detected)
**Status:** ✅ PRODUCTION READY
```

### 6. Supabase Error Correction & Sync

**Command Trigger:** User says "fix supabase errors", "sync supabase", or "deploy edge functions"

**Automated Supabase Workflow:**
```bash
# Check → Diagnose → Fix → Verify

┌─────────────────────────────────────────────────────────────┐
│ STEP 1: HEALTH CHECK                                         │
│ - Check CLI installed: supabase --version                    │
│ - Verify authentication: supabase projects list              │
│ - Check project link: supabase status                        │
│ - Verify config: cat supabase/config.toml                    │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: DATABASE MIGRATION CHECK                             │
│ - Check pending migrations: supabase migration list          │
│ - Validate SQL syntax: supabase db lint                      │
│ - Check migration order: Follow sequential numbering         │
│   Format: XXX_descriptive_name.sql (e.g., 041_feature.sql)  │
│   Find next number: ls -1 supabase/migrations/ | tail -1     │
│   Increment from last migration number                       │
│ - Detect conflicts: supabase db diff                         │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: APPLY MIGRATIONS (if needed)                         │
│ - Local: supabase db reset (WARNING: destructive!)           │
│ - Remote: supabase db push                                   │
│ - Verify: supabase db diff (should show no changes)          │
│ - Check RLS policies: Query pg_policies table                │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: EDGE FUNCTION CHECK                                  │
│ - List functions: ls supabase/functions/                     │
│ - Test locally: supabase functions serve <name>              │
│ - Check Deno imports (must use full HTTPS URLs)              │
│ - Verify environment: supabase secrets list                  │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: DEPLOY EDGE FUNCTIONS                                │
│ - Deploy: supabase functions deploy <name>                   │
│ - Check logs: supabase functions logs <name>                 │
│ - Test endpoint: curl <function-url>                         │
│ - Verify no errors in logs                                   │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 6: ERROR ANALYSIS & FIX                                 │
│ - Parse error messages                                       │
│ - Fix and redeploy until error-free                          │
│ - Update documentation if schema changed                     │
└─────────────────────────────────────────────────────────────┘
```

**Supabase Error Patterns & Fixes:**
```sql
-- Migration syntax errors
Error: "syntax error at or near 'X'"
Fix:
  1. Review SQL in migration file
  2. Test query in Supabase SQL Editor
  3. Check for missing semicolons, typos
  4. Validate against PostgreSQL 15 syntax

-- Constraint violation errors
Error: "violates foreign key constraint"
Fix:
  1. Check referenced table exists
  2. Verify ON DELETE CASCADE if needed
  3. Ensure parent records exist before insert
  4. Review migration order (dependencies first)

-- Permission/RLS errors
Error: "new row violates row-level security policy"
Fix:
  1. Check RLS policies: supabase db diff
  2. Verify user authentication in request
  3. Review policy conditions (USING/WITH CHECK)
  4. Test with service_role key (bypasses RLS)

-- Type mismatch errors
Error: "column 'X' is of type Y but expression is of type Z"
Fix:
  1. Add explicit cast: ::type
  2. Use ALTER TABLE to change column type
  3. Update INSERT values to match schema

-- Edge Function errors
Error: "error: Uncaught (in promise) TypeError"
Fix:
  1. Check Deno imports use full URLs: https://esm.sh/...
  2. Verify env vars: supabase secrets list
  3. Add error handling: try/catch blocks
  4. Test locally: supabase functions serve
  5. Check function logs: supabase functions logs <name> --tail

-- Connection errors
Error: "Could not connect to local database"
Fix:
  1. Start local Supabase: supabase start
  2. Check Docker is running: docker ps
  3. Verify ports not in use: lsof -i :54322
  4. Reset if needed: supabase stop && supabase start
```

**Supabase Diagnostic Commands:**
```bash
# Project status overview
supabase status

# Database diff (local vs remote)
supabase db diff --schema public

# Generate TypeScript types from database
supabase gen types typescript --local > types/supabase.ts

# List all migrations
supabase migration list

# Squash migrations (combine multiple into one)
supabase migration squash

# Check function logs (tail recent entries)
supabase functions logs <name> --tail

# Test edge function locally
supabase functions serve <name> --env-file .env.local

# Inspect database tables
supabase db dump --data-only --schema public
```

**Migration Safety Checklist:**
```bash
# Before applying migrations:
✅ Backup production: supabase db dump > backup.sql
✅ Test locally first: supabase db reset
✅ Review diff: supabase db diff
✅ Check RLS policies won't lock out users
✅ Verify foreign key cascade behavior
✅ Test rollback plan if migration fails

# After applying migrations:
✅ Verify tables created: \dt in psql
✅ Check data integrity: SELECT count(*) FROM...
✅ Test RLS with non-admin user
✅ Update TypeScript types: supabase gen types
✅ Document schema changes in /docs/
```

**General CLI Fix Protocol:**
```bash
# When user reports CLI errors:

1. Request exact error message
2. Check command is installed: which <command>
3. Verify version compatibility: <command> --version
4. Check authentication/login status
5. Review configuration files
6. Test with verbose flag: <command> --debug or -v
7. Check environment variables required
8. Suggest reinstall only as last resort

Always explain what each diagnostic command does
Never run destructive commands without user confirmation
```

---

### 7. Advanced Project Housekeeping

**Command Trigger:** User says "deep clean", "organize workspace", or "audit project files"

**Comprehensive Housekeeping Workflow:**
```bash
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: DOCUMENTATION AUDIT                                 │
│ - Scan /docs/ for files older than 30 days                   │
│ - Archive to /docs/archive/YYYY-MM/                          │
│ - Keep *_to_CURRENT.md files (active sessions)               │
│ - Consolidate duplicate READMEs                              │
│ - Generate /docs/README.md index if missing                  │
│ - Check for TODO.md, NOTES.md → archive or delete           │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: CODE CLEANUP                                        │
│ - Find commented code blocks: grep -r "^\s*//.*" --include   │
│ - Remove console.log(): grep -r "console\.log" src/          │
│ - Find unused imports: Run linter auto-fix                   │
│ - Delete empty files: find . -type f -empty                  │
│ - Remove .only() from tests: grep -r "\.only(" e2e/ tests/   │
│ - Check for debugger statements: grep -r "debugger"          │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ PHASE 3: DEPENDENCY AUDIT                                    │
│ - Check outdated packages: npm outdated                      │
│ - Find unused dependencies: npx depcheck                     │
│ - Security audit: npm audit                                  │
│ - Fix vulnerabilities: npm audit fix                         │
│ - Check bundle size: npm run build (note warnings)           │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ PHASE 4: FILE ORGANIZATION                                   │
│ - Move misplaced files to correct directories               │
│ - Tests: *.test.ts → /tests/ or colocated                   │
│ - E2E: *.spec.ts → /e2e/                                     │
│ - Types: *Types.ts → /types/                                 │
│ - Services: *Service.ts → /services/                         │
│ - Check for duplicate files (same content, different name)   │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ PHASE 5: BUILD ARTIFACTS CLEANUP                             │
│ - Remove: /dist/, /build/, /.next/, /.vite/                 │
│ - Check .gitignore includes these                            │
│ - Clean node_modules cache: npm cache clean --force          │
│ - Remove lock file conflicts: delete and regenerate          │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ PHASE 6: ENVIRONMENT & CONFIG AUDIT                          │
│ - Verify .env.example matches required vars                  │
│ - Check for hardcoded secrets: grep -r "sk_" "pk_"           │
│ - Validate JSON configs: prettier --check *.json             │
│ - Review tsconfig.json for unused paths                      │
│ - Check vercel.json and supabase/config.toml                 │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ PHASE 7: GIT REPOSITORY CLEANUP                              │
│ - Check for large files: git rev-list --objects --all |      │
│   git cat-file --batch-check | sort -k3 -n | tail -10       │
│ - Find untracked files: git status --short                   │
│ - Remove .DS_Store: find . -name .DS_Store -delete           │
│ - Clean git history: git gc --aggressive --prune=now         │
└─────────────────────────────────────────────────────────────┘
                         ↓
                  ✅ WORKSPACE ORGANIZED
```

**Automated File Organization Rules:**
```bash
# Root level (only essentials)
✅ package.json, tsconfig.json, vite.config.ts
✅ README.md, .gitignore, .env.example
✅ vercel.json, playwright.config.ts
❌ test-*.js, debug-*.ts, scratch-*.tsx (move or delete)
❌ Multiple README files (consolidate)
❌ Orphaned config files (audit and remove)

# Documentation structure
/docs/
  README.md                    # Index of all documentation
  ARCHITECTURE.md              # System architecture
  FEATURE_NAME.md              # Feature-specific docs
  /archive/
    /2025-11/                  # Archived by month
      old-session-summary.md
  SESSION_SUMMARY_*_to_CURRENT.md  # Active session tracking

# Test structure
/tests/
  /unit/                       # Unit tests
  /integration/                # Integration tests
  /fixtures/                   # Test data
  *.test.ts                    # Test files

/e2e/
  *.spec.ts                    # Playwright E2E tests
  /screenshots/                # Test artifacts

# Source structure
/components/                   # React components
/pages/                        # Page components
/services/                     # Business logic
/lib/                          # Utilities
/types/                        # TypeScript types
/hooks/                        # Custom React hooks
```

**Housekeeping Report Template:**
```markdown
## Housekeeping Report - YYYY-MM-DD

**Files Archived:** X docs → /docs/archive/YYYY-MM/
**Files Deleted:** Y temp files, Z empty files
**Code Cleanup:** Removed N console.logs, M commented blocks
**Dependencies:** Updated X packages, removed Y unused
**Security:** Fixed Z vulnerabilities
**Disk Space Freed:** ~XMB

**Action Items:**
- [ ] Review archived docs for permanent deletion
- [ ] Update .env.example with new variables
- [ ] Consider updating major dependencies (breaking changes)

**Notes:**
- Found duplicate files: [list]
- Large files detected: [list with sizes]
- Potential unused code: [files to review]
```

---

### 8. Error Recovery & Rollback

**If push fails or tests break after refactoring:**
```bash
# Automatic rollback procedure:

1. Identify last known good commit:
   git log --oneline -n 5
   
2. Create safety branch:
   git branch backup-YYYYMMDD-HHMM
   
3. Options (present to user):
   a) Soft reset (keep changes): git reset --soft HEAD~1
   b) Hard reset (discard changes): git reset --hard HEAD~1
   c) Revert commit (safe for shared branches): git revert HEAD
   
4. Re-run TFR cycle from clean state

5. If all else fails:
   git stash
   git checkout -b recovery-branch
   # Debug in isolation
```