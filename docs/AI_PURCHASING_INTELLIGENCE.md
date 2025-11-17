# AI Purchasing Intelligence System

**Cost-Effective AI Integration for TGF-MRP**

> Maximum value, minimum cost: $5-15/month for comprehensive purchasing intelligence

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Features & Costs](#features--costs)
3. [Architecture](#architecture)
4. [Setup Guide](#setup-guide)
5. [Usage Examples](#usage-examples)
6. [Cost Optimization](#cost-optimization)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)

---

## Overview

This system integrates cost-effective AI purchasing intelligence into your existing TGF-MRP platform, leveraging your current AI Gateway infrastructure to provide:

- **Smart Anomaly Detection** - Catch inventory issues before they cost money
- **Vendor Email Intelligence** - Automatic tracking number extraction
- **Consolidation Optimizer** - Save on shipping costs
- **Budget Optimization** - Smarter cash flow management
- **Seasonal Pattern Recognition** - Better forecasting

### Real-World ROI

```
Scenario: 100 Active SKUs, 5 Vendors, $50K/month purchasing volume

Monthly AI Cost: ~$8
Monthly Savings:
  - Prevented stockouts: $500-1000
  - Shipping optimization: $150-300
  - Data error prevention: $200-500
  - Time saved: 10-15 hours/month

Total ROI: 100x+
```

---

## Features & Costs

### Phase 1: Essential Features (Implemented ✅)

#### 1. **Anomaly Detection** 💰 $2/month

Runs daily to identify:
- Consumption spikes/drops (>80% variance)
- Items below reorder point
- Possible data entry errors
- Inventory shrinkage indicators

**Cost Breakdown:**
```
Daily run: 500 items analyzed
Model: Claude Haiku ($0.80/1M input tokens)
Cost per run: ~$0.06
Monthly cost: $0.06 × 30 = $1.80
```

#### 2. **Vendor Email Intelligence** 💰 $1/month

Automatically extracts:
- Tracking numbers (any carrier format)
- Expected delivery dates
- Backorder information
- Status updates

**Cost Breakdown:**
```
Per email: ~$0.001
Emails per day: 20-30
Monthly cost: $0.001 × 25 × 30 = $0.75
```

#### 3. **Consolidation Optimizer** 💰 $1/month

Identifies opportunities to:
- Reach free shipping thresholds
- Combine vendor orders
- Optimize order timing

**Cost Breakdown:**
```
Per analysis: ~$0.02
Frequency: 1-2 times/week
Monthly cost: $0.02 × 6 = $0.12
```

### Phase 2: Enhanced Intelligence (Optional)

#### 4. **Seasonal Pattern Recognition** 💰 $2/month
#### 5. **Budget Optimization** 💰 $2/month
#### 6. **Vendor Performance Analysis** 💰 $1/month

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     TGF-MRP Application                         │
├─────────────────────────────────────────────────────────────────┤
│  Dashboard  │  Inventory  │  PO Management  │  Vendor Portal    │
└──────┬──────┴──────┬──────┴───────┬─────────┴──────┬───────────┘
       │             │              │                │
       └─────────────┴──────────────┴────────────────┘
                          │
            ┌─────────────▼──────────────┐
            │  AI Purchasing Service     │
            │  (aiPurchasingService.ts)  │
            └─────────────┬──────────────┘
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
   ┌───▼────┐      ┌─────▼──────┐    ┌─────▼──────┐
   │Anomaly │      │  Vendor    │    │Consolidation│
   │Detection│      │   Email    │    │  Optimizer  │
   └────────┘      └────────────┘    └─────────────┘
       │                  │                  │
       └──────────────────┴──────────────────┘
                          │
            ┌─────────────▼──────────────┐
            │   AI Gateway Service       │
            │ (Existing Infrastructure)  │
            └─────────────┬──────────────┘
                          │
                  ┌───────┴────────┐
                  │   Anthropic    │
                  │ Claude Haiku   │
                  │ Claude Sonnet  │
                  └────────────────┘
```

### Database Schema

The system adds 6 new tables:

1. **`ai_anomaly_logs`** - Stores detected anomalies
2. **`ai_vendor_email_cache`** - Cached email extractions
3. **`ai_consolidation_opportunities`** - Consolidation suggestions
4. **`ai_purchasing_insights`** - General AI insights
5. **`ai_purchasing_costs`** - Cost tracking
6. **`ai_job_logs`** - Job execution logs

Plus 3 views for reporting:
- `ai_purchasing_daily_costs`
- `ai_purchasing_monthly_costs`
- `ai_active_insights`

---

## Setup Guide

### Prerequisites

- ✅ Existing TGF-MRP installation
- ✅ Supabase project configured
- ✅ Anthropic API key
- ✅ Node.js 18+ and npm

### Step 1: Database Migration

Run the migration to create AI purchasing tables:

```bash
# If using Supabase CLI
supabase migration up

# Or run SQL directly in Supabase Dashboard
# Navigate to: SQL Editor > New Query
# Copy contents of: supabase/migrations/011_purchasing_ai_features.sql
```

Verify tables created:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'ai_%';
```

### Step 2: Configure Environment Variables

Add to your `.env` file:

```bash
# Anthropic API Key (required)
VITE_ANTHROPIC_API_KEY=sk-ant-api03-...

# AI Budget Settings (optional)
VITE_AI_MONTHLY_BUDGET=20.00
VITE_AI_ALERT_THRESHOLD=0.80  # Alert at 80% budget
```

Get your Anthropic API key: https://console.anthropic.com/

### Step 3: Deploy Supabase Edge Function

Deploy the nightly AI jobs function:

```bash
# Navigate to project root
cd /path/to/TGF-MRP

# Deploy function
supabase functions deploy nightly-ai-purchasing

# Set secrets
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
```

### Step 4: Configure Cron Job

Set up daily execution in Supabase Dashboard:

1. Go to: Database > Cron Jobs
2. Create new job:
   ```sql
   SELECT cron.schedule(
     'nightly-ai-purchasing',
     '0 6 * * *',  -- 6:00 AM UTC daily
     $$
     SELECT net.http_post(
       url := 'https://your-project.supabase.co/functions/v1/nightly-ai-purchasing',
       headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
     );
     $$
   );
   ```

### Step 5: Verify Installation

Test the service manually:

```typescript
import { detectInventoryAnomalies } from './services/aiPurchasingService';

// Run anomaly detection
const result = await detectInventoryAnomalies();

console.log('Critical anomalies:', result.critical.length);
console.log('Cost:', result.cost);
console.log('Tokens used:', result.tokensUsed);
```

---

## Usage Examples

### Example 1: Daily Anomaly Detection

```typescript
import { detectInventoryAnomalies, sendAnomalyAlerts } from './services/aiPurchasingService';

// Run daily (or via Supabase Edge Function)
async function runDailyAnomalyCheck() {
  const anomalies = await detectInventoryAnomalies();

  if (anomalies.critical.length > 0) {
    await sendAnomalyAlerts(anomalies);
  }

  console.log(`
    Anomaly Detection Results:
    - Critical: ${anomalies.critical.length}
    - Warning: ${anomalies.warning.length}
    - Info: ${anomalies.info.length}
    - Cost: $${anomalies.cost.toFixed(4)}
  `);
}
```

### Example 2: Vendor Email Processing

```typescript
import { parseVendorEmail } from './services/aiPurchasingService';
import { supabase } from './lib/supabase/client';

// Process incoming vendor email
async function processVendorEmail(email: {
  from: string;
  subject: string;
  body: string;
}) {
  // Extract data using AI
  const extracted = await parseVendorEmail(email.body);

  if (extracted.extracted && extracted.tracking_number) {
    // Find matching PO (you'd implement PO number extraction)
    const poNumber = extractPONumber(email.subject);

    if (poNumber) {
      // Update PO with tracking info
      await supabase
        .from('purchase_orders')
        .update({
          tracking_number: extracted.tracking_number,
          carrier: extracted.carrier,
          expected_delivery: extracted.expected_delivery,
          status: 'shipped'
        })
        .eq('order_id', poNumber);

      console.log(`✅ Updated PO ${poNumber} with tracking: ${extracted.tracking_number}`);
    }
  }

  console.log(`Email parsing cost: $${extracted.cost.toFixed(4)}`);
}
```

### Example 3: Consolidation Opportunities

```typescript
import { findConsolidationOpportunities } from './services/aiPurchasingService';

// Find savings opportunities
async function findSavings() {
  const opportunities = await findConsolidationOpportunities();

  opportunities.forEach(opp => {
    console.log(`
      💡 CONSOLIDATION OPPORTUNITY
      Vendor: ${opp.vendor_name}
      Current order: $${opp.current_order_total}
      Potential savings: $${opp.potential_savings}

      Recommended items to add:
      ${opp.recommended_items.map(item =>
        `  - ${item.sku}: ${item.qty} units @ $${item.unit_cost} = $${item.total_cost}`
      ).join('\n')}

      Reasoning: ${opp.reasoning}
    `);
  });
}
```

### Example 4: Budget Monitoring

```typescript
import { getAIBudgetStatus } from './services/aiPurchasingService';

// Check monthly budget status
async function checkBudget() {
  const budget = await getAIBudgetStatus(20.00); // $20 budget

  if (budget) {
    console.log(`
      💰 AI BUDGET STATUS (${budget.month})

      Spent: $${budget.total_spent} / $${budget.budget_limit}
      Remaining: $${budget.remaining}
      Usage: ${budget.percent_used}%

      ${budget.over_budget ? '⚠️  OVER BUDGET!' : '✅ Within budget'}

      Breakdown:
      ${JSON.stringify(budget.service_breakdown, null, 2)}
    `);

    if (budget.percent_used >= 80) {
      console.warn('⚠️  Approaching budget limit!');
    }
  }
}
```

---

## Cost Optimization

### Strategy 1: Prompt Caching

**Current Implementation:**
- System context is included in every call
- Opportunity: Cache inventory data for reuse

**Optimization:**
```typescript
// TODO: Implement prompt caching
// Anthropic supports caching system prompts
// Can reduce costs by 90% for repeated calls
```

### Strategy 2: Batch Processing

**Best Practice:**
- Run expensive analysis overnight (already implemented)
- Process emails in batches (not one-by-one)
- Consolidate multiple API calls into single request

### Strategy 3: Smart Triggering

**Current Implementation:**
```typescript
// Only run anomaly detection if:
// - 24 hours since last run
// - OR critical items count > threshold
// - OR new POs created > threshold
```

### Strategy 4: Model Selection

**Rule of Thumb:**
- **Claude Haiku** ($0.80/1M) - Classification, extraction, simple analysis
- **Claude Sonnet** ($3.00/1M) - Complex reasoning, strategic decisions
- **Claude Opus** ($15.00/1M) - Rarely needed, critical decisions only

**Current Usage:**
- Anomaly Detection: Haiku ✅
- Email Parsing: Haiku ✅
- Consolidation: Haiku ✅

### Strategy 5: Result Caching

**Implementation:**
```typescript
// Cache AI results for 24 hours
// If input data hasn't changed, return cached result
// Saves 100% of cost for repeated queries
```

---

## Monitoring & Maintenance

### Daily Monitoring

Check Supabase Dashboard:

1. **Job Logs** - View execution status
   ```sql
   SELECT * FROM ai_job_logs
   ORDER BY started_at DESC
   LIMIT 10;
   ```

2. **Cost Tracking** - Monitor spending
   ```sql
   SELECT * FROM ai_purchasing_daily_costs
   WHERE date >= CURRENT_DATE - INTERVAL '7 days'
   ORDER BY date DESC;
   ```

3. **Active Anomalies** - Review issues
   ```sql
   SELECT * FROM ai_anomaly_logs
   WHERE critical_count > 0
   ORDER BY detected_at DESC
   LIMIT 5;
   ```

### Weekly Review

1. **Budget Status**
   ```sql
   SELECT * FROM get_ai_budget_status(20.00);
   ```

2. **Consolidation Savings**
   ```sql
   SELECT
     SUM(potential_savings) as total_savings,
     COUNT(*) as opportunity_count
   FROM ai_consolidation_opportunities
   WHERE status = 'pending';
   ```

3. **Anomaly Trends**
   ```sql
   SELECT
     DATE(detected_at) as date,
     AVG(critical_count) as avg_critical,
     AVG(warning_count) as avg_warning
   FROM ai_anomaly_logs
   WHERE detected_at >= CURRENT_DATE - INTERVAL '30 days'
   GROUP BY DATE(detected_at)
   ORDER BY date DESC;
   ```

### Monthly Maintenance

1. **Cost Analysis**
   ```sql
   SELECT * FROM ai_purchasing_monthly_costs
   ORDER BY month DESC, total_cost DESC;
   ```

2. **Cleanup Stale Data** (automatic via Edge Function)
   - Consolidation opportunities >30 days old
   - Anomaly logs >90 days old
   - Stale insights

3. **Review Model Performance**
   - Are anomalies accurate?
   - Are consolidation suggestions useful?
   - Is email extraction reliable?

---

## Troubleshooting

### Issue: High AI Costs

**Symptoms:**
- Monthly costs exceeding $20
- Budget alerts triggering frequently

**Solutions:**
1. Check job frequency:
   ```sql
   SELECT
     job_name,
     COUNT(*) as runs,
     SUM(total_cost_usd) as total_cost
   FROM ai_job_logs
   WHERE started_at >= CURRENT_DATE - INTERVAL '7 days'
   GROUP BY job_name;
   ```

2. Review service costs:
   ```sql
   SELECT service_name, SUM(cost_usd) as total
   FROM ai_purchasing_costs
   WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
   GROUP BY service_name
   ORDER BY total DESC;
   ```

3. Implement caching (see Cost Optimization)

### Issue: Anomaly Detection Not Running

**Symptoms:**
- No new records in `ai_anomaly_logs`
- Cron job not executing

**Solutions:**
1. Check cron job status:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'nightly-ai-purchasing';
   ```

2. Check Edge Function logs in Supabase Dashboard

3. Manually trigger function:
   ```bash
   curl -X POST https://your-project.supabase.co/functions/v1/nightly-ai-purchasing \
     -H "Authorization: Bearer YOUR_ANON_KEY"
   ```

### Issue: Anthropic API Errors

**Symptoms:**
- `401 Unauthorized` errors
- `429 Rate Limit` errors

**Solutions:**
1. Verify API key:
   ```bash
   supabase secrets list
   ```

2. Check API key validity at: https://console.anthropic.com/

3. For rate limits, implement retry logic with exponential backoff

### Issue: Inaccurate Anomaly Detection

**Symptoms:**
- False positives (items flagged incorrectly)
- Missing real issues

**Solutions:**
1. Review prompt engineering in `aiPurchasingService.ts`
2. Adjust thresholds (currently 80% for critical, 50% for warning)
3. Add more context to system prompt (vendor lead times, etc.)

---

## Next Steps

### Immediate (Week 1)
- ✅ Database migration complete
- ✅ Core services implemented
- ✅ Edge Function deployed
- ⏳ Set up cron job
- ⏳ Test anomaly detection manually
- ⏳ Monitor first week of costs

### Short-term (Month 1)
- [ ] Build dashboard component to display insights
- [ ] Add email webhook integration for vendor emails
- [ ] Implement consolidation opportunity alerts
- [ ] Create weekly summary report

### Long-term (Months 2-3)
- [ ] Add seasonal pattern recognition
- [ ] Implement vendor performance analysis
- [ ] Build natural language PO creation
- [ ] Add prompt caching for 90% cost reduction

---

## Support

### Documentation
- [AI Gateway Service](../services/aiGatewayService.ts)
- [AI Purchasing Service](../services/aiPurchasingService.ts)
- [Database Schema](../supabase/migrations/011_purchasing_ai_features.sql)

### Community
- File issues: https://github.com/your-org/TGF-MRP/issues
- Discussions: https://github.com/your-org/TGF-MRP/discussions

### External Resources
- Anthropic API Docs: https://docs.anthropic.com/
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Cost Calculator: https://docs.anthropic.com/en/pricing

---

## License

Same as TGF-MRP main project.

---

**Built with ❤️ by the TGF-MRP team**

*Saving you money, one API call at a time* 💰
