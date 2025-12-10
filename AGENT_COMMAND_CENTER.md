# 🎯 MuRP Agent Command Center

**Status:** ✅ Phase 1 Active | 🚧 Phase 2 In Progress
**Last Updated:** December 10, 2025
**Monthly Cost:** $5-15 (depending on usage)

---

## Overview

MuRP now operates as an **Agentic Workspace** where multiple AI agents work together to automate supply chain operations. This document describes the complete agent architecture, how different systems integrate, and the roadmap for full autonomy.

## Agent Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                          MuRP AGENT SYSTEM                           │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐     ┌──────────────────────┐
│  EXISTING SERVICES   │     │   NEW AGENT LAYER    │
│   (Phase 1 - Main)   │     │  (Phase 2 - Branch)  │
└──────────────────────┘     └──────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ 📊 AI PURCHASING SERVICE (aiPurchasingService.ts)                    │
│ • Anomaly Detection (~$2/mo)                                         │
│ • Email Intelligence (~$1/mo)                                        │
│ • Consolidation Optimizer (~$1/mo)                                   │
│ Cost: $2-5/month | Status: ✅ Production                            │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ 🎭 VENDOR CONFIDENCE SERVICE (vendorConfidenceService.ts)            │
│ • Response latency tracking                                          │
│ • Threading discipline scoring                                       │
│ • Invoice accuracy monitoring                                        │
│ • Lead time adherence                                                │
│ Cost: Included | Status: ✅ Production                               │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ 🤖 AGENTIC TOOL ORCHESTRATION (agentService.ts)                     │
│ • Natural language → Tool routing                                    │
│ • Multi-step reasoning (Vercel AI SDK)                              │
│ • Structured output for UI components                                │
│ Cost: $2-5/month | Status: 🚧 Testing                               │
└──────────────────────────────────────────────────────────────────────┘

┌────────────────────┬─────────────────────┬──────────────────────────┐
│ 👀 VENDOR WATCHDOG │ ✈️ AIR TRAFFIC CTRL │ 📈 TRUST SCORE AGENT    │
│ vendorWatchdogAgent │ airTrafficController│ trustScoreAgent.ts       │
│ • Learn lead times  │ • Prioritize alerts │ • Track autonomy        │
│ • Auto-adjust      │ • Assess PO delays  │ • Measure performance   │
│ • Track promises   │ • Draft emails      │ • Recommend next level  │
│ Cost: $1-2/mo      │ Cost: $1-2/mo       │ Cost: Computational     │
│ Status: 🚧 Testing │ Status: 🚧 Testing  │ Status: 🚧 Testing      │
└────────────────────┴─────────────────────┴──────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ 🔄 INTEGRATION LAYER                                                 │
│ • Nightly reorder scan calls Vendor Watchdog for lead times         │
│ • PO tracking updater calls Air Traffic Controller for delays       │
│ • Trust Score Agent monitors all agent performance                   │
│ • Vendor Confidence feeds into Watchdog trust calculations          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation (✅ Complete - On Main Branch)

### 1.1 AI Purchasing Intelligence

**Service:** `services/aiPurchasingService.ts`
**Migrations:** `011_purchasing_ai_features.sql`
**Cron Job:** `supabase/functions/nightly-ai-purchasing/index.ts`

**Capabilities:**
- **Anomaly Detection**: Analyzes 500 SKUs daily for consumption spikes, stockout risks, data errors
- **Email Intelligence**: Extracts tracking numbers, carriers, delivery dates from vendor emails
- **Consolidation Optimizer**: Finds shipping savings opportunities by bundling orders

**Cost:** $2-5/month
**Runs:** Daily at 6am UTC
**Dashboard:** `components/AIPurchasingDashboard.tsx`

**Tables:**
```sql
ai_anomaly_logs
ai_vendor_email_cache
ai_consolidation_opportunities
ai_purchasing_insights
ai_purchasing_costs
ai_job_logs
```

**Integration Points:**
- ✅ Feeds anomalies to alert system
- ✅ Auto-updates PO tracking from emails
- ✅ Suggests order changes before submission
- 🚧 **NEW**: Feeds data to Vendor Watchdog for performance learning

### 1.2 Vendor Confidence Tracking

**Service:** `services/vendorConfidenceService.ts`
**Dashboard:** `components/VendorConfidenceDashboard.tsx`

**Tracks:**
- Response latency (how fast vendor replies)
- Threading discipline (keeps conversations organized)
- Completeness score (answers all questions)
- Invoice accuracy (billing matches PO)
- Lead time adherence (ships on time)

**Score Ranges:**
- 8-10: Fully automatic communication
- 6-7: Automatic with review
- 4-5: Needs review
- 2-3: Needs full review
- 0-1: Suspended (manual only)

**Integration Points:**
- ✅ Controls email automation level
- 🚧 **NEW**: Feeds into Vendor Watchdog trust calculations
- 🚧 **NEW**: Influences Air Traffic Controller priority levels

---

## Phase 2: Autonomous Agents (🚧 In Progress - Current Branch)

### 2.1 Agentic Tool Orchestration

**Service:** `services/agentService.ts`
**API Route:** `api/agent.ts`
**Framework:** Vercel AI SDK with tool() definitions

**What Changed:**
- ❌ **Old**: Manual `if/else` keyword routing in `mcpService.ts`
- ✅ **New**: AI decides which tools to call based on intent

**Example:**
```typescript
// User types: "Check if Product X complies with CA and CO cannabis laws"
// AI automatically:
// 1. Understands this is a compliance question
// 2. Calls check_label_compliance tool with correct parameters
// 3. Calls get_regulation_changes to check for recent updates
// 4. Synthesizes results into structured JSON
// 5. Returns both natural language summary + structured data for UI
```

**Tools Available:**
- `check_label_compliance` - Verify product labels against state regulations
- `detect_inventory_anomalies` - Find unusual stock patterns
- `find_consolidation_opportunities` - Identify shipping savings
- `parse_vendor_email` - Extract tracking and delivery info
- `analyze_bom_buildability` - Check if BOM can be built with current stock

**Cost:** $2-5/month (replaces manual routing overhead)
**Status:** 🚧 Testing in branch `claude/code-review-feedback-01L3HaFjNe34iu9PkUubk7ZS`

### 2.2 Vendor Watchdog Agent 👀

**Service:** `services/vendorWatchdogAgent.ts`
**Migrations:** `086_vendor_intelligence.sql`

**Purpose:** Learn from vendor behavior and silently adjust planning

**How It Works:**
```typescript
// Vendor promises: 14 day lead time
// Reality: Actually ships in 18-20 days consistently

// Watchdog learns this pattern and:
// 1. Calculates "effective lead time" = 19 days
// 2. Auto-adjusts reorder points to use 19 days instead of 14
// 3. Prevents stockouts without human intervention
// 4. Silently fixes the problem
```

**Key Functions:**
- `recordPODelivery()` - Tracks promised vs actual lead times
- `assessVendorTrust()` - Calculates vendor reliability score
- Database automatically calculates `effective_lead_time_days` from history

**Database Tables:**
```sql
vendor_performance_metrics (
  effective_lead_time_days,  -- What agent uses (learned)
  trust_score,               -- 0-100 based on delivery history
  on_time_rate,              -- % of POs delivered on time
  quality_rate               -- % without issues
)

po_delivery_performance (
  actual_lead_time_days,     -- How long it really took
  delivery_status,           -- early | on_time | late_minor | late_major
  was_critical,              -- Did this cause a stockout?
)
```

**Integration with Existing Systems:**
- 🚧 `nightly-reorder-scan/index.ts` should query `effective_lead_time_days` when calculating reorder points
- 🚧 Vendor Confidence scores feed into `trust_score` calculation
- ✅ Automatically updates without human intervention

**Cost:** $1-2/month (lightweight calculations)
**Status:** 🚧 Needs hookup to nightly-reorder-scan

### 2.3 Air Traffic Controller Agent ✈️

**Service:** `services/airTrafficControllerAgent.ts`
**Migrations:** `086_vendor_intelligence.sql`

**Purpose:** Intelligently prioritize alerts based on actual impact

**The Problem It Solves:**
```
Current System:
  PO delayed 3 days → ⚠️ ALERT (annoying, low value)
  PO delayed 3 days → ⚠️ ALERT (actually critical, lost in noise)

With Air Traffic Controller:
  PO delayed 3 days + 45 days stock remaining → 🔇 Silent update (no alert)
  PO delayed 3 days + 2 days stock remaining → 🚨 CRITICAL (with draft email)
```

**Key Functions:**
- `assessPODelay(poId, delayDays, newExpectedDate)` - Determines if delay matters
- Database function `assess_po_delay_impact()` - Calculates stock impact

**Decision Logic:**
```sql
-- Critical if:
current_stock / daily_consumption < po_delay_days + 7  -- Will run out before arrival
OR urgency = 'critical'

-- High priority if:
current_stock / daily_consumption < po_delay_days + 14

-- Medium if:
Stock will be low but not out

-- Low/Silent if:
Plenty of stock remaining (>30 days)
```

**Output:**
```typescript
{
  po_id: "uuid",
  priority_level: "critical" | "high" | "medium" | "low",
  affected_items: [...],
  impact_summary: "SKU-123 will stockout in 3 days",
  recommended_action: "Contact vendor immediately",
  draft_vendor_email: "Dear Vendor, PO #12345 is now critical..."
}
```

**Database Tables:**
```sql
po_alert_log (
  priority_level,           -- critical | high | medium | low
  stockout_risk_days,       -- Days until stockout
  draft_vendor_email,       -- AI-generated follow-up email
  dismissed_by,             -- If human marks as "not important"
  actioned_at               -- When resolved
)
```

**Integration Points:**
- 🚧 **Needs**: `po-tracking-updater` webhook to call `assessPODelay()` on status changes
- 🚧 UI component: `components/AlertFeedComponent.tsx` (to be created)
- ✅ Uses AI Purchasing Service's email parser
- ✅ Integrates with Vendor Confidence for trust-based decisions

**Cost:** $1-2/month (AI drafts emails only for critical alerts)
**Status:** 🚧 Needs webhook integration

### 2.4 Trust Score Agent 📈

**Service:** `services/trustScoreAgent.ts`
**Migrations:** `086_vendor_intelligence.sql`
**Dashboard:** `components/TrustScoreDashboard.tsx` ✅ Created

**Purpose:** Measure progress toward "No Human Intervention"

**The Four Pillars:**
1. **Stockout Prevention** (40% weight)
   - Target: 100% (zero stockouts from planning errors)
   - Tracks: Predicted vs actual stockouts

2. **Touchless PO Rate** (30% weight)
   - Target: >95% (most POs auto-generated and approved without edits)
   - Tracks: AI-generated POs that go through unchanged

3. **ETA Accuracy** (20% weight)
   - Target: ±1 day (AI learns actual lead times)
   - Tracks: Predicted delivery vs actual delivery variance

4. **Capital Efficiency** (10% weight)
   - Measured by Days Sales Inventory (DSI)
   - Lower is better (not overstocking)

**Trust Score Formula:**
```typescript
Trust Score =
  (stockout_prevention_rate * 0.40) +
  (touchless_po_rate * 0.30) +
  (eta_accuracy_rate * 0.20) +
  (capital_efficiency_score * 0.10)

// Score 0-100
// 98+ = Candidate for Level 3 Autonomy (full auto-send)
```

**Autonomy Levels:**
- **Level 1** (0-60): AI Suggests → Human Decides Everything
- **Level 2** (61-90): AI Drafts → Human Clicks Send (current state)
- **Level 3** (91-97): AI Sends → Human Gets FYI Notification
- **Level 4** (98+): Full Autonomy → Human spot-checks weekly

**Key Functions:**
- `recordAgentPerformance()` - Log daily metrics to `agent_performance_log`
- `getTrustScoreReport(startDate, endDate)` - Generate report with recommendations

**Database Tables:**
```sql
agent_performance_log (
  period_date,                   -- Date
  stockout_prevention_rate,      -- % prevented
  touchless_po_rate,             -- % unchanged
  eta_accuracy_rate,             -- % within ±1 day
  capital_efficiency_score,      -- Based on DSI
  overall_trust_score,           -- Weighted average
  recommendations               -- JSONB array of suggestions
)
```

**Integration Points:**
- ✅ Dashboard created: `TrustScoreDashboard.tsx`
- 🚧 `nightly-reorder-scan` should call `recordAgentPerformance()` daily
- ✅ Tracks all three agents (Watchdog, Air Traffic Controller, Purchasing AI)

**Cost:** Computational only (no AI calls)
**Status:** 🚧 Needs daily logging hookup

---

## Integration Roadmap

### 🔥 Critical Connections Needed

#### 1. Nightly Reorder Scan → Vendor Watchdog
**File:** `supabase/functions/nightly-reorder-scan/index.ts`

**Current State:** ✅ Populates AI fields (`ai_confidence_score`, `ai_reasoning`)

**What's Missing:**
```typescript
// ❌ Currently uses: vendor.lead_time_days (promised, often wrong)
// ✅ Should use: effective_lead_time_days (learned from actual deliveries)

// Add this query:
const { data: vendorPerformance } = await supabase
  .from('vendor_performance_metrics')
  .select('effective_lead_time_days, trust_score')
  .eq('vendor_id', vendor.id)
  .single();

const leadTimeToUse = vendorPerformance?.effective_lead_time_days || vendor.lead_time_days;

// Use leadTimeToUse in reorder calculations instead of vendor.lead_time_days
```

**Impact:** Prevents stockouts by using realistic lead times instead of promises

#### 2. PO Tracking Updater → Air Traffic Controller
**File:** `supabase/functions/po-tracking-updater/index.ts` (or wherever tracking updates happen)

**What's Missing:**
```typescript
// When PO status changes to "Delayed" or "Exception":
import { assessPODelay } from '@/services/airTrafficControllerAgent';

// Calculate delay
const originalETA = po.expected_date;
const newETA = trackingData.estimated_delivery;
const delayDays = Math.ceil((new Date(newETA) - new Date(originalETA)) / (1000 * 60 * 60 * 24));

if (delayDays > 0) {
  const alert = await assessPODelay(po.id, delayDays, newETA);

  if (alert?.priority_level === 'critical') {
    // Show alert to user
    // Draft email available in alert.draft_vendor_email
  } else {
    // Silent update - no alert needed
    await supabase
      .from('purchase_orders')
      .update({ expected_date: newETA })
      .eq('id', po.id);
  }
}
```

**Impact:** Reduces alert fatigue, surfaces only critical delays

#### 3. All Agents → Trust Score Tracker
**File:** `supabase/functions/nightly-reorder-scan/index.ts`

**What's Missing:**
```typescript
import { recordAgentPerformance } from '@/services/trustScoreAgent';

// At end of nightly scan:
await recordAgentPerformance(supabase, {
  period_date: new Date().toISOString().split('T')[0],
  pos_generated: totalPOs,
  pos_approved_unchanged: touchlessPOs,
  stockouts_predicted: predictedStockouts,
  stockouts_actual: actualStockouts,
  // Agent calculates scores automatically
});
```

**Impact:** Tracks progress toward autonomy, recommends next level

---

## Database Schema Summary

### Existing Tables (Main Branch)
```sql
ai_anomaly_logs              -- Daily anomaly detection results
ai_vendor_email_cache        -- Parsed vendor emails
ai_consolidation_opportunities -- Shipping savings
ai_purchasing_insights       -- General AI insights
ai_purchasing_costs          -- Cost tracking
vendor_confidence_profiles   -- Vendor communication scoring
vendor_confidence_history    -- Confidence trends
vendor_interaction_events    -- Email/call logs
```

### New Tables (Current Branch - Migration 086)
```sql
vendor_performance_metrics   -- Vendor Watchdog learned data
po_delivery_performance      -- Delivery tracking for learning
po_alert_log                 -- Air Traffic Controller alerts
agent_performance_log        -- Trust Score daily metrics
regulatory_context           -- Compliance tracking (Migration 085)
```

### Extended Tables (Migration 084)
```sql
ALTER TABLE purchase_orders ADD:
  ai_confidence_score float
  ai_reasoning text
  ai_model_used text
  ai_consolidation_opportunities jsonb
  urgency text  -- 'low' | 'medium' | 'high' | 'critical'
  ai_priority_score float
```

---

## Cost Breakdown

### Current Costs (Phase 1 - Main Branch)
```
AI Purchasing Service:  $2-5/month
  - Anomaly detection: $1.80/mo (daily runs)
  - Email parsing: $0.60/mo (20 emails/day)
  - Consolidation: $0.16/mo (twice weekly)
  - Overhead: $0.20/mo

Vendor Confidence: $0/month (computational only)

TOTAL PHASE 1: $3-5/month
```

### Additional Costs (Phase 2 - Current Branch)
```
Agentic Tool Orchestration: $2-5/month
  - Natural language routing
  - Multi-step reasoning
  - Complex queries

Vendor Watchdog: $1-2/month
  - Performance analysis
  - Trust calculations

Air Traffic Controller: $1-2/month
  - Impact assessment
  - Email drafting (critical only)

Trust Score Agent: $0/month (computational)

TOTAL PHASE 2: $4-9/month
```

### Combined System Cost
```
TOTAL: $7-14/month for fully autonomous supply chain management

ROI: Preventing ONE stockout or saving on ONE bulk order typically
     saves $500-5000, paying for the entire system 50-500x over.
```

---

## Monitoring & Observability

### Key Metrics to Track

**Daily:**
- [ ] Anomaly count (critical/warning/info)
- [ ] PO alert count by priority
- [ ] Trust Score trend

**Weekly:**
- [ ] Agent-generated POs vs manual
- [ ] Touchless PO approval rate
- [ ] Vendor performance changes
- [ ] Cost actuals vs budget

**Monthly:**
- [ ] Total AI costs
- [ ] Stockout prevention rate
- [ ] ETA accuracy
- [ ] Capital efficiency (DSI)
- [ ] ROI calculation

### Dashboards

1. **AI Purchasing Dashboard** (`AIPurchasingDashboard.tsx`)
   - Anomalies tab
   - Consolidation opportunities
   - Cost tracking

2. **Vendor Confidence Dashboard** (`VendorConfidenceDashboard.tsx`)
   - Vendor scorecards
   - Communication trends
   - Response strategies

3. **Trust Score Dashboard** (`TrustScoreDashboard.tsx`) ✅
   - Overall trust score (0-100)
   - Four pillar metrics
   - Progress toward autonomy
   - Recommendations

4. **Vendor Scorecard** (`VendorScorecardComponent.tsx`) ✅
   - Individual vendor performance
   - Promised vs effective lead times
   - Trust score trends
   - Level 3 candidates

5. **Alert Feed** (`AlertFeedComponent.tsx`) 🚧 TODO
   - Prioritized PO delay alerts
   - Draft vendor emails
   - Resolve actions

---

## Next Steps

### Immediate (This Week)
- [ ] Complete merge of main into feature branch
- [ ] Create `AlertFeedComponent.tsx` for Air Traffic Controller
- [ ] Hook up Vendor Watchdog to `nightly-reorder-scan`
- [ ] Hook up Air Traffic Controller to PO tracking webhook
- [ ] Add `recordAgentPerformance()` call to nightly scan
- [ ] Test Trust Score Dashboard with real data

### Short Term (Next 2 Weeks)
- [ ] Deploy agent services to production
- [ ] Run migrations 084-086 in production
- [ ] Monitor agent performance for 1 week
- [ ] Collect feedback on alert prioritization
- [ ] Tune AI confidence thresholds

### Medium Term (Next Month)
- [ ] Achieve Trust Score >75 consistently
- [ ] Identify first Level 3 candidates (98+ score vendors)
- [ ] Build "Autonomy Slider" UI for Level 2 → Level 3 promotion
- [ ] Add agent performance reports to weekly standup

### Long Term (Next Quarter)
- [ ] Full Level 3 autonomy for top 3 vendors
- [ ] Seasonal pattern recognition (Phase 3)
- [ ] Natural language PO creation
- [ ] Predictive ETA using ML + historical data

---

## Troubleshooting

### Issue: Vendor Watchdog not learning lead times

**Check:**
```sql
SELECT * FROM po_delivery_performance
ORDER BY delivery_date DESC LIMIT 10;

-- Should show recent deliveries
```

**Fix:** Ensure `recordPODelivery()` is called when POs are marked as "Delivered"

### Issue: Air Traffic Controller alerting too much

**Check:**
```sql
SELECT priority_level, COUNT(*) as count
FROM po_alert_log
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY priority_level;

-- Should see mostly low/medium, few critical
```

**Fix:** Adjust stock threshold multipliers in `assess_po_delay_impact()` function

### Issue: Trust Score not updating

**Check:**
```sql
SELECT * FROM agent_performance_log
ORDER BY period_date DESC LIMIT 7;

-- Should show daily records
```

**Fix:** Add `recordAgentPerformance()` call to nightly-reorder-scan

### Issue: AI costs higher than expected

**Check:**
```sql
SELECT
  service_name,
  SUM(cost_usd) as total_cost,
  SUM(calls_count) as total_calls
FROM ai_purchasing_costs
WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY service_name;
```

**Fix:** Review which services are being called most frequently, adjust frequency or limits

---

## Documentation Links

- **This Document:** `AGENT_COMMAND_CENTER.md` - System overview and integration
- **Usage Manual:** `AGENT_MANUAL.md` - How to use each agent
- **Architecture:** `AGENTIC_ARCHITECTURE.md` - Technical deep dive
- **AI Purchasing:** `AI_PURCHASING_IMPLEMENTATION_SUMMARY.md` - Phase 1 details
- **PO Tracking:** `docs/PO_TRACKING_ROADMAP.md` - Tracking integration

---

## Version History

- **v1.0** (Dec 10, 2025) - Initial documentation
  - Merged Phase 1 (main) with Phase 2 (branch)
  - Documented all integration points
  - Created roadmap for full autonomy

---

**Built with ❤️ for MuRP**
*Smart agents, tiny costs, massive autonomy* 🤖
