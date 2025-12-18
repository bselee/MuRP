# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MuRP (Manufacturing Resource Planning) is a production-ready system built with React 19, TypeScript, Vite, and Supabase. It provides inventory management, purchase order tracking, compliance management, and AI-powered insights with tier-based access control.

## Essential Commands

### Development
```bash
npm run dev          # Vite dev server (port 3000 or APP_PORT env var)
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
/services/           # Business logic (~80 services)
/types/              # TypeScript type definitions
/supabase/
  /functions/        # Edge functions (24 functions for webhooks, sync, automation)
  /migrations/       # Numbered SQL migrations (strict 3-digit numbering)
/e2e/                # Playwright E2E tests
/tests/              # Unit tests
```

## Critical Workflows

### Supabase Migrations (STRICT RULES)

**Three-digit sequential numbering** - never skip or reuse numbers:

```bash
# 1. Find highest migration number
ls supabase/migrations | sort | tail -1  # Example: 091_cleanup_inactive_finale_data.sql

# 2. Create new migration (next number: 092)
supabase migration new feature_name

# 3. Rename to sequential number
mv supabase/migrations/<timestamp>_feature_name.sql supabase/migrations/092_feature_name.sql

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

### Edge Functions (24 functions)
Located in `supabase/functions/`:
- `api-proxy` - Secure backend proxy for external APIs
- `auto-sync-finale` - Automated Finale data sync
- `nightly-ai-purchasing` - AI-powered purchasing automation
- `po-email-monitor` - Purchase order email tracking
- `billing-webhook` - Stripe webhook handler
- `shopify-nightly-sync` - Shopify integration sync
- And 18 more for webhooks, notifications, sync operations

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

## Key Documentation References

- `SCHEMA_ARCHITECTURE.md` - Complete 4-layer schema design (read before modifying data transformations)
- `docs/MIGRATION_CONVENTIONS.md` - Supabase migration numbering rules
- `SUPABASE_DEPLOYMENT_GUIDE.md` - Deployment procedures
- `API_INGESTION_SETUP.md` - API integration setup
- `.github/copilot-instructions.md` - Comprehensive development guidelines
- `README.md` - Quick start and feature overview
