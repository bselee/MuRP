# MuRP Critical Architecture - Complete Technical Overview

**Date:** 2025-12-12
**Status:** Production-Ready MRP System
**Version:** 1.0 (91 Database Migrations Deployed)

---

## Executive Summary

MuRP (Manufacturing Resource Planning) is a production-grade enterprise system featuring:

- **411+ TypeScript/TSX files** with comprehensive service architecture
- **91 database migrations** evolved from MVP to full compliance/AI system
- **85+ microservices** handling specialized domain concerns
- **Multi-tier AI integration** with automatic fallback mechanisms
- **Real-time data synchronization** from multiple external APIs (Finale, Shopify, Gmail)
- **Compliance-first architecture** with multi-state regulatory tracking
- **MCP (Model Context Protocol) server** for AI-powered compliance tools

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Frontend Architecture](#2-frontend-architecture)
3. [Backend Architecture](#3-backend-architecture)
4. [Service Layer Architecture](#4-service-layer-architecture)
5. [Database Schema Architecture](#5-database-schema-architecture)
6. [AI/ML Integration](#6-aiml-integration)
7. [Data Flow & Transformation](#7-data-flow--transformation)
8. [MCP Server Architecture](#8-mcp-server-architecture)
9. [Security & Compliance](#9-security--compliance)
10. [Critical Components Reference](#10-critical-components-reference)

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL SYSTEMS                          │
│  Finale API • Shopify • Gmail • Google Workspace • AI APIs  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                  BACKEND (Supabase)                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Edge Functions (24 serverless endpoints)           │    │
│  │  • api-proxy • sync-finale-data • nightly-reorder   │    │
│  │  • po-email-monitor • shopify-webhook • billing     │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  PostgreSQL Database (91 migrations)                │    │
│  │  • Core: vendors, inventory_items, boms             │    │
│  │  • Extended: purchase_orders, compliance_checks     │    │
│  │  • AI: ai_usage_tracking, ai_suggested_pos          │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────────────┘
                       │ Real-time subscriptions + REST API
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                  FRONTEND (React 19 + Vite)                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Pages (15 major routes)                            │    │
│  │  • Dashboard • Inventory • POs • BOMs • Production  │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Services Layer (85+ services)                      │    │
│  │  • aiGatewayService • complianceService             │    │
│  │  • finaleSyncService • notificationService          │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Components (2000+ files)                           │    │
│  │  • UI primitives • Feature components • Modals      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                       ↕
┌─────────────────────────────────────────────────────────────┐
│              MCP SERVER (Python + stdio)                     │
│  Compliance tools • Regulatory database • AI analysis        │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS |
| **State Management** | React Context, Custom Hooks, LocalStorage |
| **Backend** | Supabase (PostgreSQL + Edge Functions) |
| **Real-time** | Supabase Realtime (WebSocket subscriptions) |
| **AI/ML** | Vercel AI Gateway, Google Gemini, Anthropic Claude |
| **External APIs** | Finale Inventory, Shopify, Gmail, Google Workspace |
| **Schema Validation** | Zod (4-layer schema system) |
| **Testing** | Playwright E2E (14/14 passing), Unit tests (9/9 passing) |
| **MCP Server** | Python + Model Context Protocol |

### 1.3 Key Metrics

- **411+ TypeScript files** (~150,000+ lines of code)
- **91 database migrations** (evolutionary schema design)
- **85+ specialized services** (domain-driven architecture)
- **24 serverless functions** (Edge Functions)
- **15 major UI pages** with real-time data sync
- **2000+ React components** (atomic design pattern)
- **4-layer schema system** (zero data loss transformations)

---

## 2. Frontend Architecture

### 2.1 Application Structure

**Entry Point:** `index.tsx` → `App.tsx` (76,724 bytes)

#### Provider Composition Pattern
```typescript
// Nested context providers for state management
ThemeProvider
  → UserPreferencesProvider
    → SystemAlertProvider
      → AuthProvider
        → AppShell (main application)
```

#### State Management Approaches

| Type | Implementation | Use Case |
|------|---------------|----------|
| **Persistent UI State** | `usePersistentState(key, default)` | User preferences, settings |
| **Real-time Data** | `useSupabaseInventory()` | Live inventory, POs, BOMs |
| **Authentication** | `useAuth()` context | User session, permissions |
| **Modal/Drawer State** | `useState()` hooks | UI component state |
| **System Alerts** | `SystemAlertProvider` context | Notifications, toasts |

### 2.2 Page Architecture (15 Major Routes)

| Page | Purpose | Size | Key Features |
|------|---------|------|--------------|
| `Dashboard.tsx` | Overview & KPIs | 34,552 B | Real-time metrics, charts |
| `Inventory.tsx` | SKU management | 73,528 B | Search, filter, bulk actions |
| `PurchaseOrders.tsx` | PO lifecycle | 129,278 B | Creation, tracking, approval |
| `BOMs.tsx` | Bill of Materials | 55,353 B | BOM editing, revisions, approval |
| `Settings.tsx` | Admin panel | 40,031 B | User management, integrations |
| `Artwork.tsx` | Digital assets | 74,100 B | DAM, label scanning |
| `Production.tsx` | Manufacturing orders | — | Build scheduling, capacity |
| `Vendors.tsx` | Supplier management | — | Vendor profiles, scorecards |
| `StockIntelligence.tsx` | Analytics | — | Demand forecasting, insights |
| `ProjectsPage.tsx` | Project management | 49,589 B | Tasks, timelines, resources |
| `Compliance.tsx` | Regulatory tracking | — | Multi-state compliance |
| `AIUsage.tsx` | AI cost tracking | — | Usage analytics, billing |

### 2.3 Component Architecture

**Component Organization:**
```
components/
├── ui/                    # Primitives (buttons, modals, cards)
├── admin/                 # Admin-only components
├── feature-specific/      # Domain components
│   ├── AIPurchasingDashboard.tsx (24,509 B)
│   ├── ComplianceDashboard.tsx (10,558 B)
│   ├── BomEditModal.tsx (31,639 B)
│   └── CreatePoModal.tsx (workflow modal)
└── shared/                # Reusable components
```

**Key Component Patterns:**

1. **Modal Pattern**
```typescript
<Modal isOpen={isOpen} onClose={close}>
  <ModalHeader title="Edit BOM" />
  <ModalBody>
    <Form fields={...} validation={...} />
  </ModalBody>
  <ModalFooter actions={[save, cancel]} />
</Modal>
```

2. **Data Table Pattern**
```typescript
<DataTable
  data={inventory}
  columns={columns}
  filters={filters}
  sort={sort}
  pagination={pagination}
  actions={bulkActions}
/>
```

3. **Dashboard Card Pattern**
```typescript
<Card>
  <CardHeader metric={value} trend={percentage} />
  <CardBody>
    <Chart data={timeSeries} />
  </CardBody>
  <CardFooter actions={[details, export]} />
</Card>
```

### 2.4 Custom Hooks Architecture

**Data Fetching Hooks** (`hooks/useSupabaseData.ts`):
```typescript
// Real-time Supabase subscriptions
useSupabaseInventory()      // Inventory items with real-time updates
useSupabaseVendors()        // Vendor list with sync status
useSupabaseBOMs()           // BOMs with component details
useSupabasePurchaseOrders() // POs with tracking info
useSupabaseBuildOrders()    // Manufacturing orders
```

**Mutation Hooks** (`hooks/useSupabaseMutations.ts`):
```typescript
createPurchaseOrder(vendor, items)
createBuildOrder(bom, quantity)
updateInventoryStock(sku, quantity)
updateBOM(bomId, components)
approveBomRevision(revisionId)
```

**Feature Hooks**:
```typescript
useLeadTimeTracking()      // Vendor performance analytics
useProjectManagement()     // Project CRUD operations
useContext7()              // Live documentation lookups
useGoogleAuthPrompt()      // OAuth flow management
```

---

## 3. Backend Architecture

### 3.1 Edge Functions (Serverless Endpoints)

**Location:** `/supabase/functions/`

| Function | Type | Purpose | Trigger |
|----------|------|---------|---------|
| `api-proxy` | Proxy | Secure Finale API routing | HTTP request |
| `sync-finale-data` | Job | Scheduled inventory sync | Cron (hourly) |
| `sync-finale-graphql` | Job | Advanced data ingestion | On-demand |
| `auto-sync-finale` | Trigger | Real-time Finale monitoring | DB trigger |
| `nightly-reorder-scan` | Job | Automated PO generation | Cron (daily 2am) |
| `nightly-ai-purchasing` | Job | AI-powered suggestions | Cron (daily 3am) |
| `po-email-monitor` | Webhook | Gmail webhook handler | Gmail push |
| `po-followup-runner` | Job | Automated follow-ups | Cron (daily 9am) |
| `shopify-webhook` | Webhook | Ecommerce integration | Shopify event |
| `shopify-nightly-sync` | Job | Inventory sync | Cron (daily 1am) |
| `gmail-webhook` | Webhook | Email notifications | Gmail push |
| `send-notification-email` | Function | Email delivery | API call |
| `billing-webhook` | Webhook | Stripe integration | Stripe event |
| `po-tracking-updater` | Job | Shipment tracking | Cron (hourly) |

### 3.2 Scheduled Jobs Architecture

```
Cron Schedule:
  01:00 - shopify-nightly-sync       (inventory import)
  02:00 - nightly-reorder-scan       (check reorder points)
  03:00 - nightly-ai-purchasing      (AI recommendations)
  09:00 - po-followup-runner         (vendor follow-ups)
  Every hour - sync-finale-data      (inventory sync)
  Every hour - po-tracking-updater   (shipment updates)
```

### 3.3 Webhook Architecture

**Gmail Webhook Flow:**
```
Gmail → Pub/Sub → Webhook → Parse email → Match PO → Update status → Alert user
```

**Shopify Webhook Flow:**
```
Shopify → Webhook → Validate HMAC → Parse event → Update inventory → Broadcast
```

**Stripe Webhook Flow:**
```
Stripe → Webhook → Verify signature → Process event → Update billing → Send email
```

---

## 4. Service Layer Architecture

### 4.1 Service Organization

**Location:** `/services/` (92 files)

Services are organized by domain:
- **AI Services:** AI Gateway, Gemini, Usage Tracking
- **Integration Services:** Finale, Shopify, Google
- **Compliance Services:** Compliance checking, regulatory scanning
- **Workflow Services:** Automation, approvals, notifications
- **Data Services:** Transformations, sync, validation

### 4.2 Critical Services

#### AI & ML Services

**`aiGatewayService.ts`** (29,302 bytes)
- **Purpose:** Unified AI interface with tier-based routing
- **Architecture:**
  - Basic Tier: Free Gemini API (100 msg/month)
  - Full AI Tier: Vercel Gateway (GPT-4o, Claude 3.5, Gemini 2.0)
  - Fallback: Direct Gemini if Gateway fails
- **Key Functions:**
  ```typescript
  generateAIResponse(messages, tier) // Multi-provider chat
  embedText(text, tier)               // Semantic embeddings
  checkTierAccess(userId)             // Usage quota enforcement
  getModelByFeature(feature)          // Feature→Model routing
  ```

**`usageTrackingService.ts`** (15,239 bytes)
- **Purpose:** AI cost attribution and quota management
- **Tracks:**
  - Per-user token usage
  - Cost calculation (per-model pricing)
  - Monthly quota resets
  - Feature-level aggregation
- **Key Functions:**
  ```typescript
  trackUsage(userId, feature, usage)
  getUserUsageSummary(userId)
  checkAndResetIfNeeded(userId)
  getAggregatedUsage(startDate, endDate)
  ```

**`geminiService.ts`** (14,916 bytes)
- **Purpose:** Google Gemini 2.0 Flash integration
- **Capabilities:**
  - Vision: Label OCR and analysis
  - Text: Inventory Q&A, compliance checks
  - Code: SQL/template generation
- **Key Functions:**
  ```typescript
  askAboutInventory(question)
  analyzeLabel(imageBase64)
  generateTemplate(context)
  ```

**`aiPurchasingService.ts`** (27,626 bytes)
- **Purpose:** Autonomous purchasing recommendations
- **Intelligence:**
  - Lead time analysis
  - Demand forecasting (60-day sales history)
  - Vendor scoring (reliability, cost, quality)
  - Cost optimization (MOQ, consolidation)
- **Output:**
  ```typescript
  {
    suggestedQuantity: number,
    recommendedVendor: Vendor,
    estimatedCost: number,
    confidenceScore: number,
    reasoning: string
  }
  ```

#### Finale Integration Services

**`finaleSyncService.ts`** (56,900 bytes)
- **Multi-phase synchronization:**
  - Phase 1: Vendors (hourly sync)
  - Phase 2: Inventory (5-min critical, 1-hour normal)
  - Phase 3: BOMs (extracted from products)
  - Phase 4: Purchase Orders (15-minute sync)
- **Smart features:**
  - Rate limiter (30 req/min)
  - Circuit breaker (auto-failover)
  - Retry with exponential backoff
  - Deduplication and conflict resolution

**`finaleRestSyncService.ts`** (26,226 bytes)
- REST API-specific sync logic
- Handles products, suppliers, purchase orders endpoints

**`finalePOImporter.ts`** (17,844 bytes)
- Purchase order reconciliation
- Match Finale POs to internal records
- Track shipment status and receipts

**`finaleBasicAuthClient.ts`** (16,523 bytes)
- HTTP client with Basic Auth
- Retry logic and error handling
- Request/response logging

#### Compliance & Regulatory Services

**`complianceService.ts`** (25,157 bytes)
- **Two-tier system:**
  - Basic: Manual source curation (user-provided regulations)
  - Full AI: Automated compliance scanning (AI-powered)
- **Key Functions:**
  ```typescript
  getUserProfile(userId)
  getIndustrySettings(industry)
  addRegulatorySource(userId, source)
  performComplianceCheck(userId, product)
  ```

**`stateRegistrationService.ts`** (11,151 bytes)
- Multi-state registration tracking (all 50 states)
- Certification tracking
- Renewal reminders
- Compliance validation

**`proactiveComplianceScanner.ts`** (11,765 bytes)
- Automated label/BOM scanning workflow:
  1. Extract text from artwork (OCR)
  2. Compare against state regulations
  3. Identify violations
  4. Generate recommendations
  5. Create action items

#### Workflow & Automation Services

**`autoPODraftService.ts`** (10,979 bytes)
- Auto-generate PO drafts based on:
  - Low inventory alerts
  - Reorder point breaches
  - Demand forecasts

**`autonomousPOService.ts`** (10,847 bytes)
- Auto-approve & send POs when conditions met:
  - Small quantities
  - Trusted vendors
  - Within spend limits

**`airTrafficControllerAgent.ts`** (12,258 bytes)
- Orchestrate complex multi-step workflows
- Manage approval chains
- Control rate limiting across services

#### Notification & Email Services

**`notificationService.ts`** (20,247 bytes)
- Multi-channel notifications:
  - In-app alerts (SystemAlertProvider)
  - Email notifications
  - Browser push notifications
- **Notification types:**
  - Order confirmations
  - Shipment alerts
  - Compliance warnings
  - System notifications

**`poEmailMonitoringService.ts`** (22,385 bytes)
- Gmail webhook integration
- **Workflow:**
  1. Listen for incoming emails
  2. Parse vendor responses
  3. Update PO status
  4. Trigger follow-ups
  5. Log communication history

#### Security Services

**`rateLimiter.ts`** (3,355 bytes)
```typescript
interface RateLimitConfig {
  maxRequestsPerMinute: number;
  queueSize: number;
  windowMs: number;
}
```
- Per-user limits
- Per-API limits
- Request queuing
- Backpressure handling

**`circuitBreaker.ts`** (2,591 bytes)
- **States:** Closed → Open → Half-open
- **Triggers:** Error threshold, timeout
- **Recovery:** Exponential backoff

**`secureApiClient.ts`** (3,780 bytes)
- CORS bypass via Edge Functions
- Credential isolation (server-side only)
- Request signing

### 4.3 Service Dependencies Map

```
Frontend
  ↓
aiGatewayService
  ├→ usageTrackingService (track usage)
  ├→ geminiService (fallback)
  └→ Vercel AI Gateway (primary)

finaleSyncService
  ├→ finaleBasicAuthClient (HTTP)
  ├→ rateLimiter (throttle)
  ├→ circuitBreaker (failover)
  ├→ transformers (data validation)
  └→ supabase (database)

complianceService
  ├→ aiGatewayService (AI analysis)
  ├→ stateRegistrationService (state rules)
  └→ proactiveComplianceScanner (automation)

autoPODraftService
  ├→ aiPurchasingService (recommendations)
  ├→ approvalService (workflow)
  └→ autonomousPOService (auto-send)
```

---

## 5. Database Schema Architecture

### 5.1 Schema Evolution (91 Migrations)

**Migration Timeline:**

| Migration | Focus | Key Tables | Impact |
|-----------|-------|-----------|--------|
| **000** | Initial Schema | vendors, inventory_items, boms | MVP foundation |
| **001** | Audit Logging | api_audit_log | Security tracking |
| **002-003** | Enhanced Schema | vendor/inventory details | Data quality |
| **004** | Sales Tracking | sales_60_days | Demand forecasting |
| **005** | Product Sheets | product_data_sheets | Digital asset mgmt |
| **006** | MCP Integration | mcp_compliance_* | AI compliance tools |
| **009-010** | Compliance | state_regulations, compliance_checks | Multi-state rules |
| **012** | AI Features | ai_suggested_pos | ML recommendations |
| **015** | AI Gateway | ai_usage_tracking | Cost monitoring |
| **022** | Purchase Orders | purchase_orders, po_items | Full PO lifecycle |
| **025** | User Auth | user_profiles, auth system | IAM |
| **046** | BOM Revisions | bom_revisions, artwork_assets | Version control |
| **077** | Finale Schema | finale_products, finale_suppliers | External sync |
| **078** | Intelligence Views | vendor_details, inventory_summary | Analytics |
| **091** | Cleanup | Inactive item filtering | Data quality |

### 5.2 Core Tables

#### Vendors Table
```sql
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  contact_emails TEXT[],
  phone TEXT,
  address TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'USA',
  lead_time_days INT DEFAULT 7,
  website TEXT,
  notes TEXT,
  data_source TEXT DEFAULT 'manual',
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vendors_name ON vendors(name);
CREATE INDEX idx_vendors_sync ON vendors(last_sync_at, sync_status);
```

#### Inventory Items Table
```sql
CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  stock INT DEFAULT 0,
  on_order INT DEFAULT 0,
  reserved INT DEFAULT 0,
  available INT GENERATED ALWAYS AS (stock + on_order - reserved) STORED,
  reorder_point INT DEFAULT 0,
  reorder_quantity INT,
  moq INT,
  unit_cost DECIMAL(10,2),
  vendor_id UUID REFERENCES vendors(id),
  custom_fields JSONB,
  is_dropship BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  data_source TEXT DEFAULT 'manual',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inventory_sku ON inventory_items(sku);
CREATE INDEX idx_inventory_vendor ON inventory_items(vendor_id);
CREATE INDEX idx_inventory_reorder ON inventory_items(stock, reorder_point) WHERE is_active = TRUE;
```

#### Purchase Orders Table (Full Lifecycle)
```sql
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id VARCHAR(100) UNIQUE,  -- Finale PO number
  vendor_id UUID REFERENCES vendors(id),
  status TEXT DEFAULT 'draft',  -- draft, sent, confirmed, received, cancelled
  order_date DATE DEFAULT CURRENT_DATE,
  expected_date DATE,
  total_amount DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  quantity INT NOT NULL,
  unit_cost DECIMAL(10,2),
  received_quantity INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE po_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  tracking_number TEXT,
  carrier TEXT,
  estimated_delivery DATE,
  actual_delivery DATE,
  status TEXT,
  last_update TIMESTAMPTZ DEFAULT NOW()
);
```

#### BOMs with Revisions
```sql
CREATE TABLE boms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finished_sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  components JSONB NOT NULL,  -- [{sku, quantity, unit}]
  status TEXT DEFAULT 'active',
  current_revision INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bom_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bom_id UUID REFERENCES boms(id) ON DELETE CASCADE,
  revision_number INT NOT NULL,
  snapshot JSONB NOT NULL,  -- Full BOM data at this revision
  status TEXT DEFAULT 'draft',  -- draft, approved, rejected, superseded
  change_notes TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bom_id, revision_number)
);

CREATE TABLE bom_artwork_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bom_id UUID REFERENCES boms(id) ON DELETE CASCADE,
  artwork_asset_id UUID REFERENCES artwork_assets(id) ON DELETE CASCADE,
  usage_type TEXT,  -- label, bag, box, insert
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Compliance & Regulations
```sql
CREATE TABLE state_regulations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  state TEXT NOT NULL,  -- 2-letter state code
  category TEXT NOT NULL,  -- labeling, ingredients, claims, packaging
  rule_title TEXT NOT NULL,
  rule_text TEXT NOT NULL,
  source_url TEXT,
  agency_name TEXT,
  effective_date DATE,
  confidence_score FLOAT DEFAULT 1.0,  -- AI extraction confidence
  status TEXT DEFAULT 'active',  -- active, superseded, archived
  search_vector tsvector,  -- Full-text search
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_regulations_state ON state_regulations(state);
CREATE INDEX idx_regulations_category ON state_regulations(category);
CREATE INDEX idx_regulations_search ON state_regulations USING gin(search_vector);

CREATE TABLE compliance_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  artwork_id UUID REFERENCES artwork_assets(id),
  bom_id TEXT,
  product_name TEXT,
  states_checked TEXT[],
  overall_status TEXT,  -- pass, warning, fail
  violations JSONB[],
  recommendations TEXT[],
  ai_model_used TEXT,
  compliance_score INT,  -- 0-100
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_compliance_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  compliance_tier TEXT DEFAULT 'basic',  -- basic, full_ai
  target_states TEXT[],
  industry TEXT,
  trial_checks_remaining INT DEFAULT 5,
  checks_this_month INT DEFAULT 0,
  monthly_check_limit INT DEFAULT 50,
  last_reset_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### AI Usage Tracking
```sql
CREATE TABLE ai_usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  feature_type TEXT NOT NULL,  -- chat, compliance, vision, embedding
  model_used TEXT NOT NULL,  -- openai/gpt-4o, anthropic/claude-3.5, google/gemini-2.0
  prompt_tokens INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  estimated_cost DECIMAL(10,6),
  compliance_tier TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_user ON ai_usage_tracking(user_id, created_at);
CREATE INDEX idx_ai_usage_feature ON ai_usage_tracking(feature_type);
```

### 5.3 Database Views (Analytics)

**Migration 078: MRP Intelligence Views**

```sql
CREATE VIEW vendor_details AS
SELECT
  v.*,
  COUNT(DISTINCT po.id) as total_pos,
  AVG(EXTRACT(EPOCH FROM (po.received_at - po.order_date))/86400) as avg_delivery_days,
  COUNT(DISTINCT ii.id) as product_count
FROM vendors v
LEFT JOIN purchase_orders po ON v.id = po.vendor_id
LEFT JOIN inventory_items ii ON v.id = ii.vendor_id
GROUP BY v.id;

CREATE VIEW inventory_summary AS
SELECT
  ii.*,
  v.name as vendor_name,
  v.lead_time_days,
  COALESCE(s60.avg_daily_sales, 0) as avg_daily_sales,
  CASE
    WHEN ii.available <= ii.reorder_point THEN 'reorder_needed'
    WHEN ii.available <= ii.reorder_point * 1.5 THEN 'low_stock'
    ELSE 'ok'
  END as stock_status
FROM inventory_items ii
LEFT JOIN vendors v ON ii.vendor_id = v.id
LEFT JOIN sales_60_days s60 ON ii.sku = s60.sku;

CREATE VIEW reorder_analysis AS
SELECT
  ii.*,
  ii.reorder_point - ii.available as units_needed,
  v.lead_time_days,
  COALESCE(ii.reorder_quantity, ii.moq, 1) as suggested_order_qty
FROM inventory_items ii
JOIN vendors v ON ii.vendor_id = v.id
WHERE ii.available < ii.reorder_point AND ii.is_active = TRUE;
```

---

## 6. AI/ML Integration

### 6.1 AI Gateway Architecture

```
User Request (chat, compliance, vision)
        ↓
[aiGatewayService] - Tier routing
        ├→ Check user tier (basic/full_ai)
        ├→ Check quota (messages/month)
        ├→ Determine model pool
        └→ Rate limit enforcement
        ↓
┌───────────────────┬──────────────────┬──────────────────┐
│   BASIC TIER      │  FULL AI TIER    │ FALLBACK         │
│   (100 msg/mo)    │  (Unlimited)     │ (Emergency)      │
├───────────────────┼──────────────────┼──────────────────┤
│ Gemini 2.0 Flash  │ Vercel Gateway:  │ Direct Gemini    │
│ (Free, fast)      │ • GPT-4o         │ API              │
│                   │ • Claude 3.5     │                  │
│                   │ • Gemini 2.0     │                  │
│                   │ • Cohere         │                  │
└───────────────────┴──────────────────┴──────────────────┘
        ↓
[AI Provider] (generate/streamText/embed)
        ↓
[usageTrackingService] - Cost attribution
        ↓
[Response] + UsageStats
```

### 6.2 Model Selection Strategy

**Feature-Based Routing** (`aiGatewayService.ts:200-400`):
```typescript
function getModelByFeature(feature: string, tier: string) {
  if (tier === 'basic') return 'google/gemini-2.0-flash';

  switch (feature) {
    case 'compliance':
      return 'anthropic/claude-3.5-sonnet'; // Best reasoning
    case 'chat':
      return 'openai/gpt-4o'; // Best general purpose
    case 'vision':
      return 'google/gemini-2.0-flash'; // Best vision
    case 'embedding':
      return 'openai/text-embedding-3-small'; // Best embeddings
    default:
      return 'openai/gpt-4o';
  }
}
```

### 6.3 Usage Tracking & Tier System

**Tier Limits:**

| Feature | Basic (Free) | Full AI |
|---------|---|---|
| Chat Messages/month | 100 | Unlimited |
| Compliance Scans/month | 5 trial | 50+ |
| Vision/OCR | Limited | Full |
| Embeddings | No | Yes |
| Models | Gemini only | All providers |
| Cost | $0 | Usage-based |

**Usage Tracking Implementation** (`usageTrackingService.ts:99-150`):
```typescript
async function trackUsage(
  userId: string,
  featureType: string,
  usage: {
    model: string,
    promptTokens: number,
    completionTokens: number
  }
) {
  const cost = calculateCost(usage.model, usage.promptTokens, usage.completionTokens);

  await supabase.from('ai_usage_tracking').insert({
    user_id: userId,
    feature_type: featureType,
    model_used: usage.model,
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.promptTokens + usage.completionTokens,
    estimated_cost: cost,
    compliance_tier: tier
  });
}
```

### 6.4 AI Features

**Autonomous Purchasing** (`aiPurchasingService.ts`):
- Analyzes inventory levels, demand trends, vendor performance
- Generates PO recommendations with quantity, vendor, cost
- Confidence scoring based on historical data
- Reasoning explanations for transparency

**Compliance Scanning** (`proactiveComplianceScanner.ts`):
- OCR label extraction (Gemini Vision)
- Regulation matching (semantic search)
- Violation detection (Claude reasoning)
- Recommendation generation (GPT-4o)

**Vendor Intelligence** (`vendorResponseService.ts`):
- Email parsing (GPT-4o)
- Status extraction (confirmed, delayed, issue)
- Delivery date extraction
- Action item generation

---

## 7. Data Flow & Transformation

### 7.1 4-Layer Schema System

**Architecture:** Raw → Parsed → Database → Display

```
┌─────────────────────────────────────────────────────────┐
│ LAYER 1: RAW SCHEMA                                     │
│ Data exactly as it arrives (CSV columns, API fields)    │
├─────────────────────────────────────────────────────────┤
│ {                                                       │
│   'Name': 'ABC Supply Co.',                             │
│   'Email address 0': 'sales@abc.com',                   │
│   'Lead time (days)': '7',                              │
│   'Address 0 street address': '123 Main St'             │
│ }                                                       │
└─────────────────────────────────────────────────────────┘
  ↓ transformVendorRawToParsed() [lib/schema/transformers.ts:44]
┌─────────────────────────────────────────────────────────┐
│ LAYER 2: PARSED SCHEMA                                  │
│ Validated, normalized, typed data (Zod schemas)         │
├─────────────────────────────────────────────────────────┤
│ {                                                       │
│   id: 'uuid-...',                                       │
│   name: 'ABC Supply Co.',                               │
│   contactEmails: ['sales@abc.com'],                     │
│   leadTimeDays: 7,                                      │
│   addressLine1: '123 Main St',                          │
│   addressDisplay: '123 Main St, City, ST, 12345'        │
│   rawData: { ... } // Preserved for audit               │
│ }                                                       │
└─────────────────────────────────────────────────────────┘
  ↓ transformVendorParsedToDatabaseEnhanced()
┌─────────────────────────────────────────────────────────┐
│ LAYER 3: DATABASE SCHEMA                                │
│ Fields that exist in PostgreSQL tables                  │
├─────────────────────────────────────────────────────────┤
│ {                                                       │
│   id: 'uuid-...',                                       │
│   name: 'ABC Supply Co.',                               │
│   contact_emails: ['sales@abc.com'],                    │
│   phone: '',                                            │
│   address: '123 Main St, City, ST, 12345',              │
│   address_line1: '123 Main St',                         │
│   city: 'City',                                         │
│   state: 'ST',                                          │
│   postal_code: '12345',                                 │
│   lead_time_days: 7,                                    │
│   data_source: 'csv',                                   │
│   last_sync_at: '2025-12-12T...'                        │
│ }                                                       │
└─────────────────────────────────────────────────────────┘
  ↓ INSERT INTO vendors + Supabase View: vendor_details
┌─────────────────────────────────────────────────────────┐
│ LAYER 4: DISPLAY SCHEMA                                 │
│ UI-optimized data with computed fields                  │
├─────────────────────────────────────────────────────────┤
│ {                                                       │
│   ...parsed fields...,                                  │
│   primaryEmail: 'sales@abc.com',                        │
│   emailCount: 1,                                        │
│   hasCompleteAddress: true,                             │
│   leadTimeFormatted: '7 days',                          │
│   recentPOCount: 3,                                     │
│   averageDeliveryDays: 8                                │
│ }                                                       │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Finale Sync Pipeline

**Location:** `services/finaleSyncService.ts:146-200`

```
Finale API
  ↓
[Edge Function: sync-finale-data]
  ↓
Rate Limiter (30 req/min)
  ↓
Circuit Breaker (failover protection)
  ↓
Raw Data (API Response)
  ↓
[transformers.ts] - 4-layer transformation
  ├─ transformFinaleProductsToInventory()
  ├─ transformFinaleSuppliersToVendors()
  ├─ transformFinalePOsToPurchaseOrders()
  └─ extractBOMsFromFinaleProducts()
  ↓
Parsed Data (Zod validated)
  ↓
[Deduplication]
  ├─ deduplicateInventory() - by SKU
  ├─ deduplicateVendors() - by name
  └─ deduplicateBOMs() - by finished_sku
  ↓
Batch Insert (Supabase)
  ├─ INSERT INTO inventory_items
  ├─ INSERT INTO vendors
  ├─ INSERT INTO boms
  └─ INSERT INTO purchase_orders
  ↓
Real-time Broadcast (Supabase Realtime)
  ↓
Frontend Subscription Update
  ↓
UI Refresh
```

### 7.3 Purchase Order Lifecycle

```
User/AI triggers PO creation
  ↓
[autoPODraftService] - Generate draft
  ├─ Calculate quantity needed
  ├─ Select best vendor (AI scoring)
  └─ Estimate cost
  ↓
[CreatePoModal] - UI confirmation
  ├─ Review details
  ├─ Edit if needed
  └─ Submit approval
  ↓
[approvalService] - Workflow check
  ├─ Check spend limits
  ├─ Check build blockers
  └─ Get required approvals
  ↓
[autonomousPOService] - Auto-approval logic
  ├─ If small quantity & trusted vendor
  └─ Auto-approve & send
  ↓
Send to vendor (email/API)
  ↓
Status: SENT (sent_at timestamp)
  ↓
[poEmailMonitoringService] - Listen for response
  ├─ Await vendor confirmation
  ├─ Track delivery
  └─ Monitor for issues
  ↓
Status: CONFIRMED (confirmed_at timestamp)
  ↓
[po-tracking-updater] - Shipment tracking
  ↓
Status: RECEIVED (received_at timestamp)
  ↓
Update inventory (increase stock)
  ↓
Archive PO

Parallel: [po-followup-runner]
  - Check if confirmed after 48h
  - If not, send follow-up email
  - Escalate if no response after 7 days
```

---

## 8. MCP Server Architecture

### 8.1 MCP Overview

**Location:** `/mcp-server/src/server_python.py`
**Protocol:** Model Context Protocol (stdio-based)
**Purpose:** AI-powered compliance tools for Claude

#### Configuration (`.mcp.json`):
```json
{
  "mcpServers": {
    "tgf-compliance": {
      "command": "python",
      "args": ["-m", "mcp_server.src.server_python"],
      "cwd": "./mcp-server",
      "env": {
        "SUPABASE_URL": "${SUPABASE_URL}",
        "SUPABASE_SERVICE_KEY": "${SUPABASE_SERVICE_KEY}",
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      }
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"],
      "description": "Live documentation lookups"
    }
  }
}
```

### 8.2 MCP Tools

**Tool 1: onboard_user** (server_python.py:37-108)
```python
async def onboard_user(
    user_id: str,
    email: str,
    industry: str,  # 'organic_agriculture' | 'fertilizer_manufacturing' | 'soil_amendments'
    target_states: List[str],  # ['CO', 'CA', 'WA']
    compliance_tier: str = "basic"  # 'basic' | 'full_ai'
) → UserProfile

Creates user compliance profile with industry settings
Initializes trial checks and monthly limits
```

**Tool 2: add_regulatory_source** (Basic Mode)
```python
async def add_regulatory_source(
    user_id: str,
    state_code: str,
    regulation_type: str,
    source_url: str,
    source_title: str,
    key_requirements: str
) → SourceRecord

Stores user's manual regulatory sources for custom compliance checking
```

**Tool 3: basic_compliance_check**
```python
async def basic_compliance_check(
    user_id: str,
    product_name: str,
    product_type: str,
    target_states: List[str]
) → ComplianceReport

Returns:
  - compliance_checklist[]
  - applicable_regulations[]
  - user_sources[]
  - manual_review_required: true
```

**Tool 4: full_ai_compliance_scan** (Full AI tier only)
```python
async def full_ai_compliance_scan(
    user_id: str,
    product_data: Dict,
    label_image: str,  # base64 encoded
    target_states: List[str]
) → DetailedComplianceReport

AI-powered analysis:
  - Extract label content (OCR)
  - Compare vs regulations
  - Identify violations
  - Generate recommendations
  - Create action items
```

**Tool 5: get_suggested_regulations**
```python
async def get_suggested_regulations(
    industry: str,
    target_states: List[str]
) → SuggestedRegulations[]

Returns database-seeded regulations for industry/states
```

### 8.3 MCP Integration Flow

```
Claude (App or Agent)
  ↓
[MCP Client] (stdio communication)
  ↓
[tgf-compliance MCP Server] (Python)
  ├─ Tools: onboard_user, compliance_check, etc.
  └─ Database: Supabase
      ↓
[Integration Points]
  ├─ user_compliance_profiles
  ├─ state_regulations
  ├─ compliance_checks
  └─ user_regulatory_sources
```

---

## 9. Security & Compliance

### 9.1 Security Architecture

**API Key Management:**
```typescript
// ❌ WRONG: Keys in frontend
const apiKey = import.meta.env.VITE_API_KEY;

// ✅ RIGHT: Keys server-side only
// Environment variables in Vercel/Supabase only
// Frontend calls Edge Function which includes key
```

**Multi-layer Rate Limiting:**
```
Layer 1: Per-user limits (100 requests/minute)
Layer 2: Per-API limits (30 requests/minute by endpoint)
Layer 3: Global throttle (max 1000 concurrent connections)
Layer 4: Request queuing (backpressure handling)
```

**Circuit Breaker Pattern** (`circuitBreaker.ts`):
```typescript
interface CircuitBreaker {
  state: 'closed' | 'open' | 'half-open'

  closed → open: Error threshold reached (5 errors in 1 minute)
  open → half-open: After timeout (exponential backoff: 30s, 60s, 120s)
  half-open → closed: Single request succeeds
  half-open → open: Single request fails
}
```

**Audit Logging** (Migration 001):
```sql
CREATE TABLE api_audit_log (
  id UUID PRIMARY KEY,
  user_id UUID,
  action TEXT NOT NULL,  -- 'sync_inventory', 'create_po', 'approve_bom'
  resource TEXT,  -- 'vendor/123', 'po/456'
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  details JSONB,
  ip_address INET,
  session_id TEXT
);
```

### 9.2 Compliance System

**User Tier System:**
```
Basic Tier (Free):
  ├─ Manual regulatory sources (user curated)
  ├─ Basic compliance checklist
  ├─ 5 trial AI scans
  └─ No automated analysis

Full AI Tier (Paid):
  ├─ Unlimited AI messages
  ├─ 50+ auto-generated regulations/month
  ├─ AI-powered label scanning
  ├─ Violation detection
  ├─ Automated recommendations
  └─ Full audit trail
```

**Multi-State Registration Tracking:**
```sql
user_regulatory_sources {
  state_code: 'CA', 'CO', 'WA', ...
  regulation_type: 'labeling' | 'ingredients' | 'claims'
  source_url: Link to official source
  key_requirements: User's summary
  verified_date: Manual verification date
}

state_regulations (Database) {
  All 50 states
  Category taxonomy
  AI-extracted summaries
  Confidence scoring (0.0-1.0)
  Full-text search indexing
}
```

**Compliance Check Workflow:**
```
1. User selects product + target states
2. System extracts label data (OCR or manual)
3. Compare extracted data vs regulations
4. Identify violations
5. Generate recommendations
6. Create action items for user
7. Track resolution
8. Archive for audit trail
```

### 9.3 Data Privacy

**Row-Level Security (RLS):**
```sql
ALTER TABLE compliance_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_see_own_checks"
ON compliance_checks
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_checks"
ON compliance_checks
FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

**Encryption:**
- Data at rest: Supabase default encryption
- Data in transit: TLS 1.3
- Credentials: Never in code, only in .env

---

## 10. Critical Components Reference

### 10.1 File Locations

**Frontend:**
- Entry point: `/index.tsx` (line 1)
- Main app: `/App.tsx` (76,724 bytes)
- Pages: `/pages/*.tsx` (15 major routes)
- Components: `/components/**/*.tsx` (2000+ files)
- Hooks: `/hooks/*.ts`

**Services:**
- AI: `/services/aiGatewayService.ts` (29,302 B)
- Sync: `/services/finaleSyncService.ts` (56,900 B)
- Compliance: `/services/complianceService.ts` (25,157 B)
- All services: `/services/*.ts` (92 files)

**Schema & Transformations:**
- Schemas: `/lib/schema/index.ts`
- Transformers: `/lib/schema/transformers.ts` (31,896 B)

**Backend:**
- Edge Functions: `/supabase/functions/*/index.ts` (24 functions)
- Migrations: `/supabase/migrations/*.sql` (91 migrations)

**MCP Server:**
- Python server: `/mcp-server/src/server_python.py`
- Config: `/.mcp.json`

### 10.2 Key Code References

**AI Gateway Setup** (`aiGatewayService.ts`):
- Lines 1-150: Model configuration
- Lines 200-400: Model routing logic
- Lines 500-600: Fallback mechanisms

**Finale Sync** (`finaleSyncService.ts`):
- Lines 146-200: Sync orchestration
- Lines 300-500: Phase-by-phase sync

**4-Layer Transformers** (`transformers.ts`):
- Lines 44-100: transformVendorRawToParsed()
- Lines 200-400: Batch transformations

**Database Migrations:**
- Migration 000: Initial schema
- Migration 022: Purchase orders (full lifecycle)
- Migration 078: MRP intelligence views
- Migration 091: Cleanup inactive data

**React Hooks** (`hooks/useSupabaseData.ts`):
- Lines 132-170: useSupabaseInventory()
- Lines 113-122: Error handling

**Authentication** (`lib/auth/AuthContext.tsx`):
- Lines 79-115: Profile fetching
- Lines 128-150: Session management

---

## Conclusion

MuRP is a production-ready, enterprise-grade Manufacturing Resource Planning system with:

✅ **Scalable architecture** supporting multiple external data sources
✅ **Enterprise compliance** with multi-state regulatory tracking
✅ **AI-first design** with tiered access and automatic fallbacks
✅ **Real-time synchronization** across all data layers
✅ **Security-first approach** with server-side secrets and multi-layer rate limiting
✅ **Comprehensive audit trail** for regulatory compliance
✅ **Zero data loss** with 4-layer schema validation
✅ **Autonomous workflows** for purchasing and compliance

The system successfully integrates complex manufacturing workflows, regulatory compliance, external API synchronization, and AI-powered insights into a coherent, maintainable codebase.

---

**Maintained by:** MuRP Development Team
**Last Updated:** 2025-12-12
**For Questions:** See individual documentation files in `/docs/`
