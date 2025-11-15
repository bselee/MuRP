# TGF-MRP AI Coding Agent Instructions

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