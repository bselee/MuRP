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
supabase gen types typescript --local > types/supabase.ts  # Regenerate types
supabase functions deploy <name>         # Deploy edge function
supabase functions logs <name> --tail    # Stream function logs
```

## Architecture

### 4-Layer Schema System (CRITICAL)

All data transformations follow this strict pattern: **Raw → Parsed → Database → Display**

1. **Raw**: External data (CSV columns, API responses) - unvalidated
2. **Parsed**: Validated with Zod schemas, normalized to TypeScript types
3. **Database**: Supabase table format (snake_case), ready for insert/update
4. **Display**: UI-optimized with computed fields for rendering

**Example transformation flow:**
```typescript
// lib/schema/transformers.ts
const rawVendor = { 'Name': 'ABC Co.', 'Email address 0': 'test@abc.com', ... };
const parsed = transformVendorRawToParsed(rawVendor, 0);  // Raw → Parsed
const dbData = transformVendorParsedToDatabase(parsed.data);  // Parsed → Database
await supabase.from('vendors').insert(dbData);
```

All transformers return `ParseResult<T>` with `{ success, data?, errors[], warnings[] }`. See `lib/schema/transformers.ts` for patterns. **Read `SCHEMA_ARCHITECTURE.md` before modifying any data transformations.**

### Service Layer Pattern

Never call external APIs or AI providers directly. Always use service layers:

- **AI Services**: Use `services/aiGatewayService.ts` → `generateAIResponse()` for tier-based routing
- **Data Access**: Use `lib/dataService.ts` → `getInventoryData()`, `getVendorData()` for unified access
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
/components/          # React components (~100 files)
  /admin/            # Admin-specific components
  /ui/               # Reusable UI components
/hooks/              # Custom React hooks (useSupabaseData, useModalState, etc.)
/lib/                # Core utilities and modules
  /auth/             # Authentication logic
  /finale/           # Finale API client
  /google/           # Google API integrations
  /schema/           # Schema definitions and transformers (CRITICAL)
  /supabase/         # Supabase client configuration
  /sync/             # Data sync orchestration
/pages/              # Page components (Dashboard, Inventory, PurchaseOrders, etc.)
/services/           # Business logic (~109 services)
/types/              # TypeScript type definitions
/supabase/
  /functions/        # Edge functions (28 functions for webhooks, sync, automation)
  /migrations/       # 118+ SQL migrations (strict 3-digit sequential numbering)
/e2e/                # Playwright E2E tests
/tests/              # Unit tests
```

## Critical Workflows

### Supabase Migrations (STRICT RULES)

**Three-digit sequential numbering** - never skip or reuse numbers:

```bash
# 1. Find highest migration number
ls supabase/migrations | sort | tail -1  # Current: 124_add_tracking_to_finale_pos.sql

# 2. Create new migration (next number: 125)
supabase migration new feature_name

# 3. Rename to sequential number
mv supabase/migrations/<timestamp>_feature_name.sql supabase/migrations/125_feature_name.sql

# 4. Test locally
supabase db reset
supabase db lint

# 5. Apply to remote
supabase db push

# 6. Regenerate types
supabase gen types typescript --local > types/supabase.ts
```

**WRONG**: `035_vendors.sql`, `037_inventory.sql` (skipped 036)
**CORRECT**: `035_vendors.sql`, `036_inventory.sql`, `037_tracking.sql`

See `docs/MIGRATION_CONVENTIONS.md` for complete rules. Reviewers will reject misnumbered migrations.

### E2E Testing

All E2E tests use `?e2e=1` query param to bypass authentication:

```typescript
// In e2e/*.spec.ts
await page.goto('/vendors?e2e=1');  // Auto-logs in as DEV_DEFAULT_USER
```

Pattern: `test.describe()` → `test.beforeEach()` → individual `test()` blocks. See `e2e/vendors.spec.ts` for examples.

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

### Stock Intelligence & Forecasting System (CRITICAL)

The Stock Intelligence system provides data-driven purchasing guidance. **All data must be real - no placeholder values.**

**Key Services:**
- `services/purchasingForecastingService.ts` - ROP calculations, purchasing advice
- `services/forecastingService.ts` - Trend analysis, seasonal pattern detection
- `services/stockoutPreventionAgent.ts` - Proactive stockout alerts

**Data Filtering Rules (CRITICAL - Never Show Dropship Items):**
Stock Intelligence should NEVER show dropship items to avoid confusing humans. Use layered filtering:

1. **Database-level filtering** (most reliable after migration 102):
   - `is_dropship = false` column on `inventory_items`
   - `stock_intelligence_items` view pre-filters all excluded items

2. **Application-level filtering** (belt and suspenders):
```typescript
// 5-layer filter applied in all Stock Intelligence views
const isExcludedItem = (item: InventoryItem): boolean => {
  // FILTER 1: Explicit dropship flag
  if (item.isDropship === true) return true;

  // FILTER 2: Dropship category (ds, drop ship, dropshipped, etc.)
  const category = (item.category || '').toLowerCase().trim();
  if (['dropship', 'drop ship', 'dropshipped', 'ds', 'drop-ship'].includes(category)) return true;

  // FILTER 3: Dropship in name pattern
  const name = (item.name || '').toLowerCase();
  if (name.includes('dropship') || name.includes('drop ship')) return true;

  // FILTER 4: Inactive items
  if (item.status && item.status.toLowerCase() !== 'active') return true;

  // FILTER 5: Deprecating/Deprecated/Discontinued categories
  if (['deprecating', 'deprecated', 'discontinued'].includes(category)) return true;

  return false;
};
```

**Supabase Query Pattern:**
```typescript
const { data } = await supabase
  .from('inventory_items')
  .select('sku, name, stock, on_order, category, is_dropship, ...')
  .eq('status', 'active')
  .eq('is_dropship', false)  // Migration 102 adds this column
  .not('category', 'ilike', '%deprecat%');
```

**Real-Time Metrics (NO PLACEHOLDERS):**
- **Vendor Reliability**: Calculated from `purchase_orders` on-time delivery rate
- **Forecast Accuracy**: Calculated from `forecasts` table (1 - MAPE)
- **Inventory Turnover**: Calculated from `inventory_velocity_summary` view

**Trend Calculation:**
```typescript
// 30-day vs 90-day velocity comparison
const trend30 = (item.sales30Days || 0) / 30;
const trend90 = (item.sales90Days || 0) / 90;
const trendDirection = trend30 > trend90 * 1.15 ? 'up' :
                       trend30 < trend90 * 0.85 ? 'down' : 'stable';
```

**Data Sources:**
- Sales velocity: `finale_stock_history` → `inventory_velocity_summary`
- ROP/Safety Stock: `sku_purchasing_parameters` table (Z-score methodology)
- Forecast accuracy: `forecasts` table (predicted vs actual)

**Key Components:**
- `pages/StockIntelligence.tsx` - Main dashboard with 6 tabs
- `components/PurchasingGuidanceDashboard.tsx` - KPI cards and replenishment advice
- `components/StockoutRiskWidget.tsx` - Risk visualization

### Compliance System

Dedicated Compliance page (`/compliance`) for regulatory management with 5 tabs:

**Key Components:**
- `pages/Compliance.tsx` - Main compliance hub
- `components/compliance/RegulatorySourcesPanel.tsx` - State regulatory agencies
- `components/compliance/StateContactManager.tsx` - Agency contact info management
- `components/compliance/RegulatoryQAPanel.tsx` - AI-powered regulatory Q&A
- `components/compliance/DocumentAnalysisPanel.tsx` - Analyze letters from states
- `components/compliance/ComplianceDocumentList.tsx` - Document library

**Services:**
- `services/regulatoryDataService.ts` - State sources, contact search, Q&A, document analysis
- `services/complianceDocumentService.ts` - Document CRUD operations

**Priority States:** CA, OR, WA, NY, TX, NM (configurable per user)

### Ingredient Compliance System

BOM ingredients are checked against state regulatory databases for compliance:

**Key Tables** (migrations 121-122):
- `ingredient_compliance_rules` - State-specific ingredient rules
- `ingredient_compliance_checks` - Per-ingredient compliance status
- `bom_compliance_summary` - Aggregated BOM compliance status

**Key Components:**
- `components/compliance/BOMIngredientCompliance.tsx` - Compliance checker UI
- `services/ingredientComplianceService.ts` - Compliance validation logic

### Theme System (Light/Dark Mode)

All components must support both themes using the `useTheme()` hook:

```typescript
import { useTheme } from './components/ThemeProvider';

const { isDark, theme, setTheme } = useTheme();

// Theme-aware styling pattern
const cardClass = isDark
  ? "bg-gray-800/50 border-gray-700 text-white"
  : "bg-white border-gray-200 text-gray-900 shadow-sm";
```

**Key files:**
- `components/ThemeProvider.tsx` - Context provider with `isDark` helper
- Theme preference stored in localStorage as `murp-ui-theme`
- Supports: `'light' | 'dark' | 'system'`

## Key Integrations

### Finale Inventory API
- Complete integration in `services/finaleIngestion.ts`
- Uses 3-layer security: Frontend (`services/secureApiClient.ts`) → Proxy (`supabase/functions/api-proxy/`) → Finale API
- All data must be transformed through 4-layer schema system before use
- Includes circuit breakers, rate limiting, exponential backoff

### MCP Server (`mcp-server/`)
- Python-based compliance tools with tier support
- OCR text extraction, state regulation scraping, compliance analysis
- See `docs/MCP_SETUP_GUIDE.md` for configuration

### Google APIs
- OAuth2 flow: `services/googleAuthService.ts`
- Sheets: `services/googleSheetsService.ts` (batch updates only, never single-row)
- Calendar: `services/googleCalendarService.ts`
- Gmail: `services/googleGmailService.ts`

### Edge Functions (28 deployed)
Located in `supabase/functions/`:
- `api-proxy` - Secure backend proxy for external APIs
- `auto-sync-finale` - Automated Finale data sync
- `nightly-ai-purchasing` - AI-powered purchasing automation
- `po-email-monitor` - Purchase order email tracking
- `billing-webhook` - Stripe webhook handler
- `shopify-nightly-sync` - Shopify integration sync
- `google-auth` - Google OAuth flow for Gmail, Sheets, Calendar
- `email-inbox-poller` - Proactive email monitoring for PO tracking
- `gmail-webhook` - Push notifications for new emails
- `aftership-webhook` - Real-time tracking updates from AfterShip
- `scheduled-agent-runner` - pg_cron triggered agent execution
- And more for webhooks, notifications, sync operations

### Email Monitoring & PO Tracking

**Email Connection Flow:**
Users can connect Gmail accounts through Settings → Email Monitoring. Supports multiple inboxes:
- **Purchasing Email**: For vendor communications, PO updates, tracking numbers
- **Accounting Email**: For invoices, payment confirmations, financial docs

**OAuth Architecture:**
```
User clicks "Connect" → Frontend calls google-auth/authorize
→ User completes Google OAuth consent
→ Callback stores tokens in email_inbox_configs + user_oauth_tokens
→ email-inbox-poller runs every 5 mins to check for new emails
→ Emails are parsed, correlated to POs, tracking extracted
```

**Key Tables:**
- `email_inbox_configs` - Per-user inbox settings with OAuth tokens
- `email_threads` - Conversation threads linked to POs
- `email_thread_messages` - Individual messages with extracted data
- `email_tracking_alerts` - Alerts for delays, backorders, exceptions

**Key Components:**
- `components/settings/EmailConnectionCard.tsx` - OAuth connection UI
- `supabase/functions/google-auth/index.ts` - OAuth flow handler
- `supabase/functions/email-inbox-poller/index.ts` - Email sync engine

### AfterShip Tracking Integration

**Autonomous Tracking Flow** (CRITICAL - tracking should be autonomous, manual entry is last resort):

```
EMAIL ARRIVES → email-inbox-poller (5 min) → REGEX EXTRACTION →
CORRELATE TO PO → REGISTER WITH AFTERSHIP → WEBHOOKS UPDATE STATUS →
PODeliveryTimeline DISPLAYS AUTOMATICALLY
```

**Tracking Extraction Patterns** (`services/emailProcessingService.ts`):
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

**Key Tables:**
- `aftership_trackings` - Tracking records with PO correlation
- `aftership_checkpoints` - Detailed checkpoint history
- `finale_purchase_orders.tracking_*` - Finale PO tracking columns (migration 124)
- `po_tracking_events` - Tracking event timeline

**Key Services:**
- `services/afterShipService.ts` - AfterShip API client, correlation, sync
- `services/emailProcessingService.ts` - Email parsing, tracking extraction
- `supabase/functions/aftership-webhook/index.ts` - Real-time webhook handler

**Required Secrets for Autonomous Operation:**
```bash
supabase secrets set GOOGLE_CLIENT_ID="..."      # Gmail OAuth
supabase secrets set GOOGLE_CLIENT_SECRET="..."  # Gmail OAuth
supabase secrets set AFTERSHIP_API_KEY="..."     # AfterShip API
supabase secrets set AFTERSHIP_WEBHOOK_SECRET="..." # Webhook verification
```

**UI Components:**
- `components/PODeliveryTimeline.tsx` - Visual tracking timeline
- `components/AfterShipSettingsPanel.tsx` - AfterShip configuration

### AI Agent System

**Agent Command Center** (`pages/Admin.tsx` → Agent Command Center tab):
- View and configure 10+ AI agents
- Set autonomy levels: `monitor` | `assist` | `autonomous`
- Track trust scores that evolve based on agent performance

**Agent Services** (in `services/`):
- `vendorWatchdogAgent.ts` - Learns vendor behavior, adjusts lead times
- `stockoutPreventionAgent.ts` - Proactive stockout alerts
- `inventoryGuardianAgent.ts` - Stock level monitoring
- `priceHunterAgent.ts` - Price trend tracking
- `complianceValidationAgent.ts` - Regulatory compliance
- `artworkApprovalAgent.ts` - Artwork workflow management
- `trustScoreAgent.ts` - Agent performance tracking

**Workflow Orchestrator** (`services/workflowOrchestrator.ts`):
Chains multiple agents together for end-to-end automation:
```typescript
// Example: Morning Briefing Workflow
const result = await runMorningBriefing(userId);
// Runs: Inventory Guardian → PO Intelligence → Email Tracking → Air Traffic Controller
// Returns: { success, summary, pendingActions, autoExecutedActions, errors }
```

**Workflows Panel** (`components/admin/WorkflowPanel.tsx`):
- Morning Briefing - Daily priority list
- Process Vendor Emails - Auto-update POs from emails
- Generate Purchase Orders - Create POs for items below ROP

**Key Tables:**

- `agent_definitions` - Unified agent configuration (autonomy, trust score, parameters, usage tracking)
- `workflow_executions` - Workflow run logs for audit
- `pending_actions_queue` - Actions proposed by agents awaiting approval/execution
- `event_triggers` - Event-to-agent mappings for automated execution
- `oauth_states` - CSRF protection for OAuth flows

**Agent Execution Architecture:**

```text
Event/Trigger → eventBus.ts → agentExecutor.ts → agent_definitions (config)
                     ↓                ↓
              executeAgentByIdentifier()    →    capabilityExecutors (actions)
                                                        ↓
                                            actionExecutors.ts → pending_actions_queue
```

## Common Pitfalls

### ❌ Don't Do This

```typescript
// Direct AI provider calls (bypasses tier system)
import { GoogleGenerativeAI } from '@google/genai';
const genAI = new GoogleGenerativeAI(apiKey);  // WRONG

// Direct Supabase queries in components
const { data } = await supabase.from('vendors').select();  // WRONG - use hooks

// Skipping schema transformation (data loss!)
await supabase.from('vendors').insert(rawCsvData);  // WRONG - transform first

// Breaking migration numbering
// 090_feature.sql, 093_another.sql  // WRONG - skipped 091, 092
```

### ✅ Do This Instead

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
- **Session tracking**: Log notable changes to `docs/SESSION_SUMMARY_2025-11-29_to_CURRENT.md` before ending sessions

## Key Documentation References

- `SCHEMA_ARCHITECTURE.md` - Complete 4-layer schema design (read before modifying data transformations)
- `docs/MIGRATION_CONVENTIONS.md` - Supabase migration numbering rules
- `docs/CRITICAL_ARCHITECTURE.md` - Complete system architecture overview
- `docs/AGENT_SKILL_MCP_ARCHITECTURE.md` - Claude agents, skills, and MCP server setup
- `docs/USER_AI_ASSISTANT_DESIGN.md` - Design vision for AI-powered workflows
- `docs/WORKFLOW_AUTOMATION_AGENTS.md` - Agent orchestration patterns
- `SUPABASE_DEPLOYMENT_GUIDE.md` - Deployment procedures
- `API_INGESTION_SETUP.md` - API integration setup
- `.github/copilot-instructions.md` - Comprehensive development guidelines including TFR protocol, Vercel deployment, and session management

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
