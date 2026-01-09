# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MuRP (Manufacturing Resource Planning) is a production-ready system built with React 19, TypeScript, Vite, and Supabase. It provides inventory management, purchase order tracking, compliance management, and AI-powered insights with tier-based access control.

## Essential Commands

### Development
```bash
npm run dev          # Vite dev server (port 5173 by default)
npm run build        # TypeScript + Vite production build
npm run preview      # Preview production build locally
```

### Testing
```bash
npm test             # Run all tests (transformers + inventory UI)
npm run e2e          # Playwright E2E tests (builds first, then runs tests)
npm run e2e:ui       # Playwright UI mode for debugging
npm run test:transformers      # Schema transformer smoke tests
npm run test:transformers:all  # Comprehensive schema validation
npm run test:inventory-ui      # Inventory display tests
npm run test:invoice           # Invoice extraction unit tests (38 tests)
npm run test:invoice-integration  # Invoice system integration tests

# Type checking only (no emit)
npx tsc --noEmit

# Run a single E2E test file
npx playwright test e2e/vendors.spec.ts

# Run specific test by name
npx playwright test -g "should display vendor list"
```

### Supabase Operations
```bash
supabase status                           # Check local Supabase status
supabase db reset                         # Rebuild local schema from migrations
supabase db lint                          # Validate SQL syntax
supabase db push                          # Apply migrations to remote
supabase migration list                   # Compare local vs remote migrations
supabase gen types typescript --local > types/supabase.ts  # Regenerate types
supabase functions deploy <name>          # Deploy edge function
supabase functions list                   # List deployed functions
```

## Architecture

### 4-Layer Schema System (CRITICAL)

All data transformations follow this strict pattern: **Raw -> Parsed -> Database -> Display**

1. **Raw**: External data (CSV columns, API responses) - unvalidated
2. **Parsed**: Validated with Zod schemas, normalized to TypeScript types
3. **Database**: Supabase table format (snake_case), ready for insert/update
4. **Display**: UI-optimized with computed fields for rendering

**Example transformation flow:**
```typescript
// lib/schema/transformers.ts
const rawVendor = { 'Name': 'ABC Co.', 'Email address 0': 'test@abc.com', ... };
const parsed = transformVendorRawToParsed(rawVendor, 0);  // Raw -> Parsed
const dbData = transformVendorParsedToDatabase(parsed.data);  // Parsed -> Database
await supabase.from('vendors').insert(dbData);
```

All transformers return `ParseResult<T>` with `{ success, data?, errors[], warnings[] }`. See `lib/schema/transformers.ts` for patterns. **Read `SCHEMA_ARCHITECTURE.md` before modifying any data transformations.**

### Service Layer Pattern

Never call external APIs or AI providers directly. Always use service layers:

- **AI Services**: Use `services/aiGatewayService.ts` -> `generateAIResponse()` for tier-based routing
- **Data Access**: Use `lib/dataService.ts` -> `getInventoryData()`, `getVendorData()` for unified access
- **Finale API**: Use `services/finaleIngestion.ts` with circuit breakers, rate limiting, retry logic
- **Google APIs**: Use `services/googleSheetsService.ts`, `services/googleAuthService.ts`
- **Compliance**: Use `services/complianceService.ts` for state regulatory logic

All services return `{ success: boolean, data?, error? }` - never throw exceptions.

### Component Patterns

**Data Fetching** - Use hooks, never query Supabase directly in components:
```typescript
import { useSupabaseInventory, useSupabaseVendors } from './hooks/useSupabaseData';
const { data: inventory, loading, error } = useSupabaseInventory();

import { createPurchaseOrder, updateInventoryStock } from './hooks/useSupabaseMutations';
await createPurchaseOrder({ vendorId, items, ... });
```

**Modal Management** - Use consistent hook:
```typescript
import useModalState from './hooks/useModalState';
const { isOpen, open, close, toggle } = useModalState();
```

**Persistent State** - Use type-safe localStorage:
```typescript
import usePersistentState from './hooks/usePersistentState';
const [settings, setSettings] = usePersistentState<Settings>('key', defaultValue);
```

**Error Boundaries** - Wrap all page components:
```typescript
import ErrorBoundary from './components/ErrorBoundary';
<ErrorBoundary><YourPage /></ErrorBoundary>
```

### Directory Structure

```
/components/          # React components (217 total)
  /admin/            # Admin-specific (AgentCommandCenter, WorkflowPanel, EmailTemplateEditor)
  /settings/         # Settings page modules (SettingsLayout, SettingsSidebar, SettingsContent)
  /compliance/       # Compliance UI components
  /ui/               # Reusable UI components
/hooks/              # Custom React hooks (20 hooks)
/lib/                # Core utilities and modules (32 files)
  /auth/             # Authentication logic
  /finale/           # Finale API client
  /google/           # Google API integrations
  /schema/           # Schema definitions and transformers (CRITICAL)
  /supabase/         # Supabase client configuration
  /sync/             # Data sync orchestration
/pages/              # Page components (27 pages)
/services/           # Business logic (119 services, 55K+ lines)
/types/              # TypeScript type definitions (10 files)
/supabase/
  /functions/        # Edge functions (32 functions for webhooks, sync, automation)
  /migrations/       # 168 SQL migrations (strict 3-digit sequential numbering)
/e2e/                # Playwright E2E tests
/tests/              # Unit tests
```

## Critical Workflows

### Supabase Migrations (STRICT RULES)

**Three-digit sequential numbering** - never skip or reuse numbers:

```bash
# 1. Find highest migration number
ls supabase/migrations | sort | tail -1  # Check current highest number

# 2. Create new migration (next sequential number)
supabase migration new feature_name

# 3. Rename to sequential number
mv supabase/migrations/<timestamp>_feature_name.sql supabase/migrations/169_feature_name.sql

# 4. Test locally
supabase db reset
supabase db lint

# 5. Apply to remote
supabase db push

# 6. Regenerate types
supabase gen types typescript --local > types/supabase.ts
```

**WRONG**: `165_vendors.sql`, `167_inventory.sql` (skipped 166)
**CORRECT**: `165_vendors.sql`, `166_inventory.sql`, `167_tracking.sql`

See `docs/MIGRATION_CONVENTIONS.md` for complete rules. Reviewers will reject misnumbered migrations.

### E2E Testing

All E2E tests use `?e2e=1` query param to bypass authentication:

```typescript
// In e2e/*.spec.ts
await page.goto('/vendors?e2e=1');  // Auto-logs in as DEV_DEFAULT_USER
```

Pattern: `test.describe()` -> `test.beforeEach()` -> individual `test()` blocks. See `e2e/vendors.spec.ts` for examples.

### AI Gateway Integration

Tier-based routing with automatic fallbacks:

```typescript
import { generateAIResponse } from './services/aiGatewayService';

// Basic tier: Free Gemini (100 msg/month)
await generateAIResponse(messages, 'chat', 'basic');

// Full AI tier: Premium models via Vercel AI Gateway
await generateAIResponse(messages, 'compliance', 'full-ai');
```

**Never** instantiate `GoogleGenerativeAI` directly - always use `aiGatewayService.ts` to respect tier limits and enable automatic fallbacks.

## Settings Page Architecture

The Settings page uses a modular sidebar-based architecture with hash navigation:

**Key Files:**
- `components/settings/settingsConfig.ts` - Section definitions and permissions
- `components/settings/SettingsLayout.tsx` - Responsive layout wrapper
- `components/settings/SettingsSidebar.tsx` - Navigation sidebar
- `components/settings/SettingsContent.tsx` - Dynamic content rendering

**Pattern:**
```typescript
// settingsConfig.ts defines 23 sections in 10 groups
export type SettingsSectionId = 'personalization' | 'billing' | 'team' | 'modules' | ...;

// Sections are permission-gated
{ id: 'team', label: 'Team & Permissions', group: 'Team', adminOnly: true }

// URL hash navigation via useSettingsHash hook
const [activeSection, setActiveSection] = useSettingsHash('personalization');
```

## Global Data Filtering System

Persistent global filters applied across all pages (Inventory, Stock Intelligence, POs, BOMs):

**Key Hooks:**
- `hooks/useGlobalCategoryFilter.ts` - Exclude categories (deprecated, discontinued, dropship)
- `hooks/useGlobalSkuFilter.ts` - Exclude specific SKUs

**Storage Keys:**
- `global-excluded-categories` - Array of excluded category names
- `global-excluded-skus` - Array of excluded SKU IDs

**Cross-Component Sync:**
```typescript
// Components listen for filter changes
window.addEventListener('global-category-filter-changed', handleFilterChange);
window.addEventListener('global-sku-filter-changed', handleFilterChange);
```

**Configuration UI:** Settings -> Data -> Global Data Filtering (`GlobalDataFilterPanel.tsx`)

## Stock Intelligence & Forecasting System (CRITICAL)

The Stock Intelligence system provides data-driven purchasing guidance. **All data must be real - no placeholder values.**

**Key Services:**
- `services/purchasingForecastingService.ts` - ROP calculations, purchasing advice
- `services/forecastingService.ts` - Trend analysis, seasonal pattern detection
- `services/stockoutPreventionAgent.ts` - Proactive stockout alerts
- `services/inventoryKPIService.ts` - Comprehensive inventory KPIs (CLTR, CV, ABC/XYZ)
- `services/supplyChainRiskService.ts` - Time-phased PAB analysis with BOM explosion

**Data Filtering Rules (CRITICAL - Never Show Dropship Items):**
Stock Intelligence should NEVER show dropship items. Use layered filtering:

1. **Database-level filtering** (most reliable):
   - `is_dropship = false` column on `inventory_items`
   - `stock_intelligence_items` view pre-filters excluded items

2. **Application-level filtering** (belt and suspenders):
```typescript
const isExcludedItem = (item: InventoryItem): boolean => {
  if (item.isDropship === true) return true;
  const category = (item.category || '').toLowerCase().trim();
  if (['dropship', 'drop ship', 'dropshipped', 'ds', 'drop-ship'].includes(category)) return true;
  if (item.status && item.status.toLowerCase() !== 'active') return true;
  if (['deprecating', 'deprecated', 'discontinued'].includes(category)) return true;
  return false;
};
```

### Inventory KPI Framework

Comprehensive KPIs calculated by `inventoryKPIService.ts`:

| KPI | Formula | Interpretation |
|-----|---------|----------------|
| **CLTR** | runway / (lead_time + review_period) | <0.5 CRITICAL, 0.5-1.0 AT_RISK, 1.0-2.0 ADEQUATE, >2.0 HEALTHY |
| **CV** | std_dev / mean | <0.5 X-class (predictable), 0.5-1.0 Y-class, >1.0 Z-class (erratic) |
| **ABC** | Cumulative $ usage | A=80%, B=next 15%, C=remaining 5% |
| **Safety Stock Attainment** | current_stock / safety_stock x 100 | <50% CRITICAL, 50-100% LOW, 100-150% OPTIMAL |
| **Lead Time Bias** | actual_LT - planned_LT | Positive = vendors deliver late |
| **Excess Inventory** | (stock - 90d runway) x unit_cost | Capital tied up above target |

```typescript
import { getKPISummary, calculateInventoryKPIs } from './services/inventoryKPIService';
const summary = await getKPISummary();  // Returns aggregated KPIs
const itemKPIs = await calculateInventoryKPIs();  // Returns per-SKU KPIs
```

### Supply Chain Risk Analysis (PAB-based)

Time-phased Projected Available Balance analysis with BOM explosion. Located in `services/supplyChainRiskService.ts`.

**Key Concepts:**
- **PAB**: Projected Available Balance = Beginning + Receipts - Demand
- **BOM Explosion**: Converts finished goods demand to component requirements (dependent demand)
- **Runout Detection**: First day PAB goes negative
- **SS Breach**: First day PAB drops below safety stock

**Risk Types:**
- `STOCKOUT`: PAB goes negative within horizon
- `SS_BREACH`: PAB drops below safety stock
- `COMPONENT_SHORT`: Component needed for BOMs running low
- `PO_LATE`: Expected PO not yet received

**Usage:**
```typescript
import { analyzeSupplyChainRisks, formatRiskSummaryForAgent } from './services/supplyChainRiskService';

const risks = await analyzeSupplyChainRisks({
  horizon_days: 60,
  include_bom_explosion: true,
});

// Each risk has two-sentence output format:
// risk.risk_statement: "SKU X will breach safety stock on DATE (Y days)"
// risk.action_statement: "ACTION: Order N units by DATE to prevent stockout"
```

### Classification Context Service

Centralized item classification for agents (`services/classificationContextService.ts`):

```typescript
// Every agent checks classification before acting
const classification = await getItemClassification(sku);
// Returns: flow_type, sop_rules, automation_level, allowed_actions

// Flow types: standard, dropship, special_order, consignment, made_to_order, discontinued
// Prevents agents from acting on excluded items
```

## AI Agent System

### Agent Command Center (`pages/Admin.tsx` -> Agent Command Center tab)

View and configure 10+ AI agents with unified configuration:

**Agent Services** (in `services/`):
- `inventoryGuardianAgent.ts` - Stock level monitoring with runway-based logic
- `stockoutPreventionAgent.ts` - Proactive stockout alerts
- `vendorWatchdogAgent.ts` - Learns vendor behavior, adjusts lead times
- `priceHunterAgent.ts` - Price trend tracking
- `complianceValidationAgent.ts` - Regulatory compliance
- `artworkApprovalAgent.ts` - Artwork workflow management
- `trustScoreAgent.ts` - Agent performance tracking
- `airTrafficControllerAgent.ts` - PO delay detection
- `emailIntelligenceAgent.ts` - Email analysis
- `poIntelligenceAgent.ts` - Purchase order intelligence

**Autonomy Levels:**
- `monitor` - Observe and report only
- `assist` - Recommend actions for human approval
- `autonomous` - Auto-execute within defined bounds

**Configuration:** All agent config stored in `agent_definitions` table (runtime adjustable)

### Workflow Orchestrator (`services/workflowOrchestrator.ts`)

Chains multiple agents for end-to-end automation:
```typescript
const result = await runMorningBriefing(userId);
// Runs: Inventory Guardian -> PO Intelligence -> Email Tracking -> Air Traffic Controller
// Returns: { success, summary, pendingActions, autoExecutedActions, errors }
```

**Key Tables:**
- `agent_definitions` - Unified agent configuration (autonomy, trust score, parameters)
- `workflow_executions` - Workflow run logs for audit
- `pending_actions_queue` - Actions proposed by agents awaiting approval
- `agent_run_history` - Execution logs

### pg_cron Scheduled Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `finale-full-sync` | 1 AM, 1 PM UTC | Full Finale data sync |
| `finale-po-sync` | :30 every hour | Hourly PO-only sync |
| Stockout Prevention | 6:00 AM daily | Morning stockout check |
| Vendor Watchdog | 7:00 AM daily | Vendor performance review |
| Inventory Guardian | 2:00 AM nightly | Stock level monitoring |
| PO Intelligence | Hourly 8AM-6PM Mon-Fri | Order status updates |
| Invoice Extraction | Every 10 minutes | Process pending invoices |
| Three-Way Match | Every 15 minutes | PO vs Invoice vs Receipt |

## Email Monitoring & PO Tracking

**OAuth Flow:**
```
User connects Gmail -> google-auth/authorize -> OAuth consent
-> Tokens stored in email_inbox_configs + user_oauth_tokens
-> email-inbox-poller runs every 5 mins -> Parse & correlate to POs
```

**Key Tables:**
- `email_inbox_configs` - Per-user inbox settings with OAuth tokens
- `email_threads` - Conversation threads linked to POs
- `email_thread_messages` - Individual messages with extracted data
- `email_tracking_alerts` - Alerts for delays, backorders, exceptions

**Tracking Extraction Patterns:**
```typescript
// UPS: 1Z followed by 16 alphanumeric
/\b1Z[A-Z0-9]{16}\b/gi

// FedEx: 96-prefix with 20 digits, or 12-22 digits
/\b(?:96\d{20}|\d{12,22})\b/g

// USPS: 91-94 prefix + 20-22 digits
/\b(?:94|93|92|91)\d{20,22}\b/g

// DHL: 10-11 digits OR 3 letters + 7-10 digits
/\b(?:\d{10,11}|[A-Z]{3}\d{7,10})\b/gi
```

### Email Template Editor

Admin UI for editing PO follow-up email templates:
- **Location**: Settings -> Email -> Email Templates
- **Component**: `components/admin/EmailTemplateEditor.tsx`
- **Data**: `po_followup_campaigns` and `po_followup_rules` tables
- **Placeholders**: `{{po_number}}`, `{{vendor_name}}`, `{{order_date}}`, `{{order_age_days}}`, `{{expected_date}}`, `{{total_amount}}`

## Invoice & Three-Way Match System

**Flow:**
```
Email Arrives -> email-inbox-poller -> Attachment Classification ->
Invoice Extraction (Claude Vision) -> PO Matching -> Three-Way Match ->
Auto-Approve (95%+) OR Queue for Review (discrepancies)
```

**Key Tables:**
- `vendor_invoice_documents` - Extracted invoice data with match status
- `po_three_way_matches` - Match results comparing PO vs Invoice vs Receipt
- `po_receipt_events` - GRN events with timestamps
- `po_backorders` - Shortage tracking

**Auto-Approval Thresholds:**
```typescript
const DEFAULT_THRESHOLDS = {
  quantityTolerancePercent: 2,
  priceToleranceDollars: 0.50,
  totalTolerancePercent: 1,
  minMatchScoreForApproval: 95,
  autoApproveMaxVariance: 50,
};
```

## Internal Requisitions System

Internal POs with approval workflows:
- **Location**: Purchase Orders page -> Internal Requisitions section
- **Pattern**: Card-based view with approval modal
- **Badge**: "Internal" badge distinguishes from vendor POs
- **Workflow**: Create -> Approve -> Convert to PO (via GeneratePoModal)

## Key Integrations

### Finale Inventory API
- Complete integration in `services/finaleIngestion.ts`
- 3-layer security: Frontend -> Proxy -> Finale API
- Includes circuit breakers, rate limiting, exponential backoff

### Edge Functions (32 deployed)

Located in `supabase/functions/`:
- `api-proxy` - Secure backend proxy for external APIs
- `auto-sync-finale` - Automated Finale data sync orchestrator
- `sync-finale-graphql` - Direct Finale GraphQL sync
- `email-inbox-poller` - Email monitoring (5 min interval)
- `invoice-extractor` - Claude Vision AI extraction
- `three-way-match-runner` - Batch matching
- `po-followup-runner` - Automated vendor follow-ups
- `scheduled-agent-runner` - pg_cron triggered agent execution
- And 24 more...

### Google APIs
- OAuth2 flow: `services/googleAuthService.ts`
- Sheets: `services/googleSheetsService.ts` (batch updates only)
- Calendar: `services/googleCalendarService.ts`
- Gmail: `services/googleGmailService.ts`

## Theme System (Light/Dark Mode)

All components must support both themes:

```typescript
import { useTheme } from './components/ThemeProvider';

const { isDark, theme, setTheme, resolvedTheme } = useTheme();

const cardClass = isDark
  ? "bg-gray-800/50 border-gray-700 text-white"
  : "bg-white border-gray-200 text-gray-900 shadow-sm";
```

## Common Pitfalls

### Don't Do This

```typescript
// Direct AI provider calls (bypasses tier system)
import { GoogleGenerativeAI } from '@google/genai';
const genAI = new GoogleGenerativeAI(apiKey);  // WRONG

// Direct Supabase queries in components
const { data } = await supabase.from('vendors').select();  // WRONG - use hooks

// Skipping schema transformation
await supabase.from('vendors').insert(rawCsvData);  // WRONG - transform first

// Breaking migration numbering
// 165_feature.sql, 168_another.sql  // WRONG - skipped 166, 167
```

### Do This Instead

```typescript
// Use tier-aware AI service
import { generateAIResponse } from './services/aiGatewayService';
await generateAIResponse(messages, 'chat', userTier);

// Use data hooks
import { useSupabaseVendors } from './hooks/useSupabaseData';
const { data: vendors } = useSupabaseVendors();

// Transform through all layers
const parsed = transformVendorRawToParsed(csvRow);
const dbData = transformVendorParsedToDatabase(parsed.data);
await supabase.from('vendors').insert(dbData);

// Check highest migration number first
ls supabase/migrations | sort | tail -1
```

## Environment Configuration

- Vite loads env vars with `VITE_` prefix for frontend
- Backend functions use raw env vars (no prefix)
- Path alias: `@/` maps to project root (configured in `vite.config.ts`)
- E2E mode: `?e2e=1` query param bypasses auth for testing

## Development Notes

- **TypeScript strict mode**: All types explicit, no `any`
- **Zod validation**: Runtime validation for all external data
- **Async error handling**: All async operations use try/catch with `{ success, error }` pattern
- **Component wrapping**: All pages wrapped in `ErrorBoundary`
- **State management**: React state only - no Redux/MobX/Zustand
- **Imports**: Absolute imports from project root using `@/` alias
- **Session tracking**: Log notable changes to `docs/SESSION_SUMMARY_2025-11-29_to_CURRENT.md`

## TFR Protocol (Before Commits)

**Test-Fix-Refactor** - mandatory workflow before ANY commit:

1. **Test**: Run `npm test` and `npm run build`
2. **Fix**: If tests fail, fix code and re-run until ALL pass
3. **Refactor**: Remove debug statements, clean up code
4. **Re-test**: Verify refactoring didn't break anything

Only proceed to commit when all tests pass and build succeeds.

## Key Documentation References

- `SCHEMA_ARCHITECTURE.md` - Complete 4-layer schema design
- `docs/MIGRATION_CONVENTIONS.md` - Supabase migration numbering rules
- `docs/CRITICAL_ARCHITECTURE.md` - Complete system architecture overview
- `docs/AGENT_SKILL_MCP_ARCHITECTURE.md` - Claude agents, skills, MCP server
- `docs/WORKFLOW_AUTOMATION_AGENTS.md` - Agent orchestration patterns
- `.github/copilot-instructions.md` - Development guidelines, TFR protocol, deployment

## Claude Code Skills & Agents

### Available Skills (in `.claude/skills/`)
- `/deploy` - Build, commit, and deploy to main via claude/merge-to-main branch
- `/code-review` - Review code for quality, security, and best practices
- `/security-review` - Security audit for vulnerabilities and compliance

### Domain Expert Agents (in `.claude/agents/`)
- `stock-intelligence-analyst.md` - Expert in inventory forecasting and ROP calculations
- `email-tracking-specialist.md` - Expert in PO email monitoring and Gmail integration
- `schema-transformer-expert.md` - Expert in the 4-layer schema system

Agents are automatically loaded by Claude Code and provide specialized context for domain-specific tasks.
