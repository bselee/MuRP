# Email Tracking Agent Expansion Plan

## Mission: NEVER BE OUT OF STOCK

This plan expands MuRP's email tracking capabilities to create a proactive, intelligent system that:
- Monitors dedicated purchasing email inbox(es)
- Identifies and correlates email threads to POs
- Extracts tracking info, ETAs, and status updates
- Feeds real-time intelligence back to inventory planning
- Triggers proactive alerts before stockouts occur

---

## Current State Assessment

### What We Have (Building Blocks)

| Component | Location | Status |
|-----------|----------|--------|
| Gmail Webhook | `supabase/functions/gmail-webhook/index.ts` | Active - receives push notifications |
| PO Email Monitoring Service | `services/poEmailMonitoringService.ts` | Active - classifies and routes |
| Shipment Tracking Service | `services/shipmentTrackingService.ts` | Active - carrier validation, events |
| PO Intelligence Agent | `services/poIntelligenceAgent.ts` | Active - ETA predictions, pester alerts |
| Agent Configs Table | `migrations/090_agent_configs.sql` | Active - 3 agents seeded |
| po_vendor_communications | `migrations/047_vendor_email_intelligence.sql` | Active - stores email data |
| App Settings | `services/settingsService.ts` | Active - configurable settings |

### Current Email Flow
```
Gmail Push Notification → Gmail Webhook → Extract Content → AI Parse → Store Communication
                                                                            ↓
                                          PO Email Monitor → Classify → Route to Agent
```

### Gaps to Address

1. **No Dedicated Email Inbox Agent** - No formal agent for email monitoring
2. **Single Inbox Only** - Relies on env vars, no multi-inbox support
3. **Reactive Only** - No proactive polling/sync for missed emails
4. **Limited Thread Intelligence** - Stores thread_id but doesn't reconstruct conversations
5. **No Carrier API Integration** - AfterShip stub exists but not implemented
6. **No Stockout Prevention Loop** - ETA data doesn't feed inventory decisions

---

## Implementation Plan

### Phase 1: Email Tracking Agent Foundation

**Goal:** Establish the Email Tracking Agent as a first-class agent with dedicated inbox monitoring.

#### 1.1 Database: Email Inbox Configuration
**File:** `supabase/migrations/XXX_email_inbox_configs.sql`

```sql
CREATE TABLE email_inbox_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Inbox Identity
    inbox_name TEXT NOT NULL,                    -- "purchasing", "po-inbox", etc.
    email_address TEXT NOT NULL UNIQUE,          -- po@company.com
    display_name TEXT,                           -- "PO Inbox"

    -- Gmail OAuth Credentials (encrypted reference)
    gmail_client_id TEXT,
    gmail_client_secret_ref TEXT,                -- Reference to secret vault
    gmail_refresh_token_ref TEXT,
    gmail_user TEXT DEFAULT 'me',

    -- Monitoring Configuration
    is_active BOOLEAN DEFAULT true,
    poll_interval_minutes INTEGER DEFAULT 5,     -- How often to sync
    last_sync_at TIMESTAMPTZ,
    last_history_id TEXT,                        -- Gmail history ID for incremental sync

    -- Processing Settings
    ai_parsing_enabled BOOLEAN DEFAULT true,
    max_daily_ai_cost_usd DECIMAL(10,2) DEFAULT 5.00,
    keyword_filters TEXT[] DEFAULT ARRAY['tracking', 'shipped', 'invoice', 'confirm', 'PO'],

    -- Vendor Matching
    auto_correlate_vendors BOOLEAN DEFAULT true,
    vendor_email_domains JSONB,                  -- Domain → vendor_id mapping cache

    -- Stats
    total_emails_processed INTEGER DEFAULT 0,
    total_pos_correlated INTEGER DEFAULT 0,
    correlation_success_rate DECIMAL(5,2),

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for active inbox polling
CREATE INDEX idx_email_inbox_active_poll ON email_inbox_configs(is_active, last_sync_at);
```

#### 1.2 Database: Email Thread Intelligence
**File:** `supabase/migrations/XXX_email_thread_intelligence.sql`

```sql
CREATE TABLE email_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Gmail Identity
    gmail_thread_id TEXT UNIQUE NOT NULL,
    inbox_config_id UUID REFERENCES email_inbox_configs(id),

    -- PO Correlation
    po_id UUID REFERENCES purchase_orders(id),
    vendor_id UUID REFERENCES vendors(id),
    correlation_confidence DECIMAL(3,2),
    correlation_method TEXT,                     -- 'subject_match', 'thread_history', 'sender_domain', 'ai_inference'

    -- Thread State
    subject TEXT,
    message_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    first_message_at TIMESTAMPTZ,

    -- Extracted Intelligence (aggregated from all messages)
    tracking_numbers TEXT[],
    carriers TEXT[],
    latest_status TEXT,
    latest_eta DATE,
    has_invoice BOOLEAN DEFAULT false,
    has_pricelist BOOLEAN DEFAULT false,
    requires_response BOOLEAN DEFAULT false,
    urgency_level TEXT CHECK (urgency_level IN ('low', 'medium', 'high', 'critical')),

    -- Conversation Summary (AI-generated)
    thread_summary TEXT,
    key_dates JSONB,                             -- {confirmed: date, shipped: date, eta: date}
    action_items JSONB,                          -- [{action: "respond", reason: "..."}]

    -- Metadata
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_email_threads_po ON email_threads(po_id);
CREATE INDEX idx_email_threads_vendor ON email_threads(vendor_id);
CREATE INDEX idx_email_threads_unresolved ON email_threads(is_resolved) WHERE is_resolved = false;
```

#### 1.3 Agent: Email Tracking Agent Config
**File:** `supabase/migrations/XXX_email_tracking_agent.sql`

```sql
INSERT INTO agent_configs (
    agent_identifier,
    display_name,
    description,
    autonomy_level,
    is_active,
    trust_score,
    parameters,
    system_prompt
) VALUES (
    'email_tracking',
    'Email Tracking Agent',
    'Monitors purchasing email inbox, correlates emails to POs, extracts tracking/ETA info, and feeds intelligence to inventory planning.',
    'assist',
    true,
    0.80,
    '{
        "poll_interval_minutes": 5,
        "ai_confidence_threshold": 0.65,
        "auto_update_po_status": true,
        "pester_overdue_days": 3,
        "escalate_critical_to_human": true
    }'::jsonb,
    'You are the Email Tracking Agent. Your mission is to NEVER LET STOCK RUN OUT. Monitor all vendor emails, extract tracking information, predict ETAs, and proactively alert when delays threaten inventory levels. You operate in assist mode, making recommendations and auto-updating PO tracking when confidence is high.'
) ON CONFLICT (agent_identifier) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    parameters = EXCLUDED.parameters,
    system_prompt = EXCLUDED.system_prompt;
```

#### 1.4 Service: Email Inbox Manager
**File:** `services/emailInboxManager.ts`

Key functions:
- `getActiveInboxes()` - Get all active inbox configs
- `syncInbox(inboxId)` - Full sync via Gmail API
- `pollInboxChanges(inboxId)` - Incremental sync using history ID
- `processNewEmails(emails[])` - Route to existing gmail-webhook logic
- `correlateEmailToThread(email)` - Find or create email_thread record
- `updateThreadIntelligence(threadId)` - Aggregate thread data

#### 1.5 Edge Function: Email Inbox Poller
**File:** `supabase/functions/email-inbox-poller/index.ts`

```typescript
// Scheduled every 5 minutes via pg_cron or external scheduler
// - Fetches all active inbox configs
// - For each inbox, checks for new messages since last_history_id
// - Processes new messages through existing gmail-webhook pipeline
// - Updates thread intelligence
// - Triggers stockout prevention checks
```

---

### Phase 2: Thread Intelligence & Correlation

**Goal:** Build deep thread understanding and reliable PO correlation.

#### 2.1 Enhanced PO Correlation Logic
**File:** Update `services/poEmailMonitoringService.ts`

Multi-stage correlation:
1. **Thread History** (highest confidence: 0.95)
   - If thread already linked to PO, inherit correlation

2. **Subject Line Match** (confidence: 0.85)
   - Pattern: `/PO[-\s#]*(\d{4,})/i`

3. **Sender Domain Match** (confidence: 0.75)
   - Match sender email domain to vendor's known domains

4. **Body Content Search** (confidence: 0.70)
   - Look for PO numbers in email body

5. **AI Inference** (confidence: varies)
   - Use AI to analyze content and suggest PO match

#### 2.2 Thread Reconstruction
**File:** `services/emailThreadService.ts`

```typescript
interface ThreadReconstruction {
  threadId: string;
  messages: Array<{
    messageId: string;
    direction: 'inbound' | 'outbound';
    timestamp: string;
    subject: string;
    bodyPreview: string;
    extractedData: any;
  }>;
  timeline: Array<{
    event: 'po_sent' | 'confirmed' | 'shipped' | 'tracking_provided' | 'eta_updated' | 'delivered';
    timestamp: string;
    details: any;
  }>;
  currentStatus: string;
  nextExpectedAction: string;
}

async function reconstructThread(gmailThreadId: string): Promise<ThreadReconstruction>
async function generateThreadSummary(reconstruction: ThreadReconstruction): Promise<string>
async function extractActionItems(reconstruction: ThreadReconstruction): Promise<ActionItem[]>
```

#### 2.3 Vendor Email Domain Learning
Auto-build domain → vendor mapping as emails are processed:

```typescript
// When we correlate an email to a PO, learn the sender domain
async function learnVendorDomain(senderEmail: string, vendorId: string) {
  const domain = senderEmail.split('@')[1];
  await supabase
    .from('vendor_email_domains')
    .upsert({ domain, vendor_id: vendorId, confidence: 0.9 })
    .onConflict('domain');
}
```

---

### Phase 3: Carrier Tracking Integration

**Goal:** Get real-time tracking updates from carriers to improve ETA accuracy.

#### 3.1 Carrier API Integration Service
**File:** `services/carrierTrackingService.ts`

```typescript
interface CarrierTrackingResult {
  carrier: string;
  trackingNumber: string;
  status: 'pre_transit' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';
  estimatedDelivery: string | null;
  lastUpdate: {
    timestamp: string;
    location: string;
    description: string;
  };
  history: TrackingEvent[];
}

// Option A: AfterShip Integration (recommended - multi-carrier)
async function trackWithAfterShip(trackingNumber: string, carrier?: string): Promise<CarrierTrackingResult>

// Option B: Direct Carrier APIs (backup)
async function trackWithUPS(trackingNumber: string): Promise<CarrierTrackingResult>
async function trackWithFedEx(trackingNumber: string): Promise<CarrierTrackingResult>
async function trackWithUSPS(trackingNumber: string): Promise<CarrierTrackingResult>
```

#### 3.2 Database: Carrier Tracking Cache
**File:** `supabase/migrations/XXX_carrier_tracking_cache.sql`

```sql
CREATE TABLE carrier_tracking_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_number TEXT NOT NULL,
    carrier TEXT NOT NULL,

    -- Current Status
    current_status TEXT,
    estimated_delivery DATE,
    actual_delivery DATE,

    -- Last Update
    last_event_timestamp TIMESTAMPTZ,
    last_event_location TEXT,
    last_event_description TEXT,

    -- Full History
    tracking_history JSONB,

    -- Cache Management
    fetched_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '1 hour',
    fetch_count INTEGER DEFAULT 1,

    UNIQUE(tracking_number, carrier)
);
```

#### 3.3 Edge Function: Tracking Updater
**File:** Update `supabase/functions/po-tracking-updater/index.ts`

```typescript
// Scheduled every 15 minutes
// - Find all shipments with status = 'in_transit'
// - Check tracking cache, refresh if expired
// - Update shipment status
// - If delivered → update PO status → notify inventory
// - If exception → escalate to Air Traffic Controller
```

---

### Phase 4: Stockout Prevention Loop

**Goal:** Connect ETA intelligence to inventory planning for proactive alerts.

#### 4.1 Enhanced PO Intelligence Agent
**File:** Update `services/poIntelligenceAgent.ts`

```typescript
interface StockoutRiskAssessment {
  poId: string;
  poNumber: string;
  items: Array<{
    sku: string;
    productName: string;
    currentStock: number;
    dailyUsageRate: number;
    daysOfStockRemaining: number;
    quantityOnPO: number;
    expectedETA: string;
    etaConfidence: 'high' | 'medium' | 'low';
    stockoutRisk: 'none' | 'low' | 'medium' | 'high' | 'critical';
    stockoutDate: string | null;  // Projected date we'll run out
    daysUntilStockout: number | null;
    action: 'none' | 'monitor' | 'pester_vendor' | 'expedite' | 'emergency_reorder';
  }>;
  overallRisk: 'none' | 'low' | 'medium' | 'high' | 'critical';
  recommendedActions: string[];
}

async function assessStockoutRisk(poId: string): Promise<StockoutRiskAssessment>
async function getAtRiskPOs(): Promise<StockoutRiskAssessment[]>
```

#### 4.2 Database: Stockout Risk Tracking
**File:** `supabase/migrations/XXX_stockout_risk_tracking.sql`

```sql
CREATE TABLE stockout_risk_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    po_id UUID REFERENCES purchase_orders(id),
    sku TEXT NOT NULL,

    -- Current State
    current_stock INTEGER,
    daily_usage_rate DECIMAL(10,2),
    days_of_stock_remaining DECIMAL(10,2),

    -- PO ETA
    quantity_on_order INTEGER,
    expected_eta DATE,
    eta_confidence TEXT,
    eta_source TEXT,                             -- 'vendor_email', 'carrier_tracking', 'historical_avg'

    -- Risk Calculation
    projected_stockout_date DATE,
    days_until_stockout INTEGER,
    risk_level TEXT CHECK (risk_level IN ('none', 'low', 'medium', 'high', 'critical')),

    -- Actions
    recommended_action TEXT,
    action_taken TEXT,
    action_taken_at TIMESTAMPTZ,
    action_taken_by UUID,

    -- Audit
    assessed_at TIMESTAMPTZ DEFAULT now(),
    assessed_by TEXT DEFAULT 'email_tracking_agent'
);

CREATE INDEX idx_stockout_risk_level ON stockout_risk_assessments(risk_level, assessed_at);
CREATE INDEX idx_stockout_sku ON stockout_risk_assessments(sku);
```

#### 4.3 Stockout Prevention Workflow

```
Email Received (tracking update)
        ↓
Email Tracking Agent extracts ETA
        ↓
Update PO expected delivery
        ↓
Trigger Stockout Risk Assessment
        ↓
Compare: ETA vs Days of Stock Remaining
        ↓
┌─────────────────────────────────────────────────────┐
│ If ETA > Stockout Date:                             │
│   → Calculate days at risk                          │
│   → Determine severity (critical if < 3 days)       │
│   → Route to appropriate action:                    │
│      - Pester vendor for expedite                   │
│      - Alert purchasing for emergency reorder       │
│      - Notify Air Traffic Controller                │
└─────────────────────────────────────────────────────┘
```

---

### Phase 5: Agent Integration & Dashboard

**Goal:** Unified visibility and agent coordination.

#### 5.1 Agent Coordination
The Email Tracking Agent coordinates with existing agents:

| Agent | Trigger | Action |
|-------|---------|--------|
| Air Traffic Controller | Delay detected | Assess stock impact, prioritize alert |
| Vendor Watchdog | Delivery performance | Update vendor lead time learning |
| PO Intelligence | New ETA | Recalculate stockout risk |
| Stockout Prevention | Critical risk | Trigger emergency protocols |

#### 5.2 Email Tracking Dashboard Component
**File:** `components/admin/EmailTrackingDashboard.tsx`

Features:
- Active inbox status and health
- Recent emails with correlation status
- Unmatched emails queue (needs manual PO assignment)
- Thread timeline view per PO
- Stockout risk heatmap
- Agent activity log

#### 5.3 PO Detail Enhancement
**File:** Update `components/PODetailModal.tsx`

Add new tab: "Email Intelligence"
- Full email thread timeline
- Tracking status with carrier updates
- ETA history (how it changed over time)
- Stockout risk assessment
- Recommended actions

---

## Implementation Phases & Order

### Phase 1: Foundation (Essential)
1. `XXX_email_inbox_configs.sql` - Database
2. `XXX_email_thread_intelligence.sql` - Database
3. `XXX_email_tracking_agent.sql` - Seed agent
4. `services/emailInboxManager.ts` - Core service
5. `supabase/functions/email-inbox-poller/index.ts` - Scheduled polling

### Phase 2: Thread Intelligence (High Value)
1. Update `services/poEmailMonitoringService.ts` - Enhanced correlation
2. `services/emailThreadService.ts` - Thread reconstruction
3. Database migration for vendor email domains

### Phase 3: Carrier Tracking (Medium Value)
1. `services/carrierTrackingService.ts` - AfterShip integration
2. `XXX_carrier_tracking_cache.sql` - Database
3. Update `supabase/functions/po-tracking-updater/index.ts`

### Phase 4: Stockout Prevention (Critical Value)
1. Update `services/poIntelligenceAgent.ts` - Risk assessment
2. `XXX_stockout_risk_tracking.sql` - Database
3. Integration with existing alert system

### Phase 5: Dashboard & UI (Polish)
1. `components/admin/EmailTrackingDashboard.tsx`
2. Update `PODetailModal.tsx`
3. Update `AgentCommandCenter.tsx` - Show email tracking agent

---

## Configuration Required

### Environment Variables (Existing)
```
GMAIL_WEBHOOK_CLIENT_ID=...
GMAIL_WEBHOOK_CLIENT_SECRET=...
GMAIL_WEBHOOK_REFRESH_TOKEN=...
GMAIL_WEBHOOK_USER=me
ANTHROPIC_API_KEY=...
```

### New App Settings
```
email_tracking_enabled: true
email_tracking_poll_interval: 5
email_tracking_ai_enabled: true
email_tracking_max_daily_cost: 5.00
carrier_tracking_provider: 'aftership'
aftership_api_key: '...'
stockout_risk_threshold_days: 3
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Email → PO correlation rate | > 95% | Automated matches / Total vendor emails |
| Tracking extraction accuracy | > 90% | Correct tracking # / Total extractions |
| ETA prediction accuracy | Within 2 days | Predicted vs actual delivery |
| Stockout prevention rate | > 99% | Prevented / (Prevented + Occurred) |
| Time to alert | < 15 minutes | Email received → Alert generated |

---

## Risk Mitigation

1. **Gmail API Rate Limits**: Use history-based incremental sync, cache aggressively
2. **AI Cost Overruns**: Daily budget limits per inbox, keyword pre-filtering
3. **False Correlations**: Require confidence > 0.7, queue uncertain for human review
4. **Carrier API Failures**: Cache results, graceful degradation to email-only ETAs
5. **Alert Fatigue**: Use Air Traffic Controller to prioritize only impactful alerts

---

## Next Steps

Ready to implement? Start with Phase 1 database migrations and the email inbox manager service. This provides the foundation for all subsequent phases while immediately enabling multi-inbox monitoring.
