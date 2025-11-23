# AI Coding Agent Instructions - Universal Codespace Workflows

> **Scope**: These instructions apply to ALL codespace instances and development workflows, not just this specific project.

---

## 🤖 Universal Codespace Automation

### 1. Automatic Session Documentation

**Trigger Conditions:**
- End of development session (user indicates wrapping up)
- Significant milestone reached (feature complete, major refactor, deployment)
- User requests "update session docs" or "document changes"
- Daily rollover (if session spans multiple days)

**Documentation Process:**
```bash
# Automatic workflow when triggered:
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

### 4. Milestone Push to GitHub

**Command Trigger:** User says "push to github", "milestone push", or "commit and push"

**Automated Workflow:**
```bash
# Execute in sequence:

1. TFR Cycle (see above)
   └─ npm test && npm run build
   
2. Update Session Documentation
   └─ Append to SESSION_SUMMARY_*_to_CURRENT.md
   
3. Housekeeping Check (quick scan)
   └─ Flag issues but don't block push
   
4. Stage Changes
   └─ git add -A  # Or selective based on context
   
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
   
8. Confirm Success
   └─ Display commit SHA and pushed files count
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

### 5. CLI Diagnostics & Auto-Fix

**Vercel CLI Issues:**
```bash
# Common problems and automatic fixes:

Problem: "vercel: command not found"
Fix: npm install -g vercel

Problem: "Error: No token found"
Fix: vercel login

Problem: "Project not linked"
Fix: vercel link

Problem: "Build failed" in deployment
Diagnose:
  1. vercel logs <deployment-url>
  2. Check build command in vercel.json or package.json
  3. Verify environment variables: vercel env ls
  4. Test build locally: npm run build

Automatic diagnostic workflow:
  → Run: vercel --version
  → Run: vercel whoami
  → Run: vercel env ls (show without values)
  → Check: vercel.json exists and valid
  → Suggest: vercel --prod (for production deploy)
```

**Supabase CLI Issues:**
```bash
# Common problems and automatic fixes:

Problem: "supabase: command not found"
Fix: npm install -g supabase

Problem: "Not linked to any project"
Fix: supabase link --project-ref <ref>

Problem: "Database connection failed"
Diagnose:
  1. supabase status (check local instance)
  2. Check .env for SUPABASE_URL and SUPABASE_ANON_KEY
  3. Verify network/firewall not blocking

Problem: "Migration failed"
Fix:
  1. supabase db reset (local dev only!)
  2. Review migration SQL syntax
  3. Check migration order (numbered files)
  4. supabase migration repair (if needed)

Problem: "Edge Function deployment failed"
Diagnose:
  1. supabase functions serve <name> (test locally)
  2. Check Deno imports (use full URLs)
  3. Verify environment variables: supabase secrets list
  4. Review function logs: supabase functions logs <name>

Automatic diagnostic workflow:
  → Run: supabase --version
  → Run: supabase projects list
  → Run: supabase status
  → Check: supabase/config.toml exists
  → Suggest: supabase db push (to sync migrations)
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

### 6. Error Recovery & Rollback

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

---

## 📦 TGF-MRP Project-Specific Instructions

A production-ready Manufacturing Resource Planning system with AI-powered compliance, tier-based AI Gateway integration, and secure API ingestion.

## Architecture Overview

### Core Data Flow: 4-Layer Schema System
All data follows **Raw → Parsed → Database → Display** transformation pattern:
- Raw schemas match external sources (CSV columns, API responses)
- Parsed schemas are validated/normalized with proper types
- Database schemas optimize for storage/queries
- Display schemas format for UI presentation

Example: `lib/schema/` contains Zod schemas. Use `transformFinaleData()` for Finale API responses.

### AI Gateway Service (`services/aiGatewayService.ts`)
Tier-based routing to multiple AI providers:
- **Basic Tier**: Free Gemini access (100 messages/month)
- **Full AI Tier**: Premium models via Vercel AI Gateway (GPT-4o, Claude, etc.)
- **Automatic Fallback**: Falls back to direct Gemini if Gateway fails

Key function: `generateAIResponse(messages, featureType, userTier)` handles all AI interactions.

### Data Service Layer (`lib/dataService.ts`)
Unified data access with automatic source switching:
- Mock data (development)
- Finale Inventory API (live data via secure proxy)
- Supabase (cached/persisted data)

Use `getInventoryData()`, `getVendorData()`, `getPurchaseOrderData()` for consistent data access.

## Critical Developer Workflows

### Build & Test Commands
```bash
npm run dev                    # Start development server
npm run build                  # Production build
npm test                      # Run schema transformers tests
npm run e2e                   # Playwright E2E tests (14/14 passing)
npm run test:transformers:all # Test all data transformations
```

### API Integration Patterns
All external API calls use:
1. **Secure Proxy Pattern**: Frontend → `supabase/functions/api-proxy/index.ts` → External API
2. **Rate Limiting**: `services/rateLimiter.ts` with request queuing
3. **Circuit Breaker**: `services/circuitBreaker.ts` for failure detection
4. **Retry Logic**: `services/retryWithBackoff.ts` with exponential backoff

Example: `services/finaleIngestion.ts` shows complete integration pattern.

### Component Patterns
- **Modal Management**: Use `useModalState()` hook for consistent modal behavior
- **Data Hooks**: `useSupabaseData.ts` for data fetching, `useSupabaseMutations.ts` for updates
- **Error Boundaries**: Wrap all pages in `<ErrorBoundary>` component
- **Persistent State**: Use `usePersistentState()` for localStorage persistence

### Testing Patterns
- E2E tests use `?e2e=1` query param to bypass authentication
- Mock data in `types.ts` provides consistent test fixtures
- Use `await page.waitForSelector()` for dynamic content
- Test structure: `test.describe()` → `test.beforeEach()` → individual `test()` blocks

## Project-Specific Conventions

### Service Layer Organization
Services are feature-focused, not data-focused:
- `complianceService.ts` - State regulatory compliance logic
- `aiProviderService.ts` - Direct AI provider access (non-Gateway)
- `usageTrackingService.ts` - AI usage analytics and cost tracking
- `mcpService.ts` - Model Context Protocol server integration

### Supabase Integration
- Database schema: `supabase/migrations/` for version-controlled changes
- Edge Functions: `supabase/functions/` for serverless API endpoints
- Real-time subscriptions: Use `useSupabaseData` hooks for live updates

### State Management
React state only - no external state management library:
- Local component state for UI interactions
- `usePersistentState()` for user preferences
- Supabase real-time for shared application state

### Error Handling
Consistent error patterns across services:
```typescript
try {
  const result = await apiCall();
  return { success: true, data: result };
} catch (error) {
  console.error('Operation failed:', error);
  return { success: false, error: error.message };
}
```

## Integration Points

### Finale Inventory API
- Authentication: Basic auth via secure proxy
- Data sync: CSV reports + REST API for real-time updates
- Transform with `transformFinaleData()` before use

### MCP Server (`mcp-server/`)
Python-based compliance tools with Basic/Full AI tiers:
- OCR text extraction from label images
- State regulation scraping from .gov sites
- Compliance analysis and checklist generation

### Vercel AI Gateway
Multi-provider AI access through single API:
- Configure in `aiGatewayService.ts` with `createGatewayProvider()`
- Automatic provider selection based on feature type
- Usage tracking for cost monitoring

### Google Sheets Integration
Two-way sync for inventory and vendor data:
- OAuth2 flow in `services/googleAuthService.ts`
- Sheet operations in `services/googleSheetsService.ts`
- Batch updates for performance

## Key Files to Reference

- `App.tsx` - Main component structure and routing
- `lib/schema/transformers.ts` - Data transformation examples
- `services/aiGatewayService.ts` - AI integration patterns
- `components/ErrorBoundary.tsx` - Error handling component
- `supabase/migrations/` - Database schema evolution
- `e2e/vendors.spec.ts` - E2E testing patterns
- `docs/SCHEMA_ARCHITECTURE.md` - Detailed schema documentation

## Development Notes

- Use absolute imports from project root
- TypeScript strict mode enabled - all types must be explicit
- Zod schemas provide runtime validation - prefer over manual type checking
- All async operations should include proper error handling
- UI components use semantic HTML with ARIA labels for accessibility