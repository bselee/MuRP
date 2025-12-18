# AGENT-CENTRIC WORKFLOW PROPOSAL

## 🎯 Current State Analysis

### Existing Agent Coverage
1. ✅ **Vendor Watchdog** - Monitors vendor performance
2. ✅ **PO Intelligence** - Tracks PO delays and invoice variances
3. ✅ **Stockout Prevention** - Predicts inventory stockouts
4. ✅ **Inventory Guardian** - Manages reorder points
5. ✅ **Price Hunter** - Detects price changes
6. ✅ **Air Traffic Controller** - Manages production conflicts
7. ✅ **Trust Score** - Validates other agents

### Missing Agent Opportunities

#### 🎨 Artwork Agents (HIGH PRIORITY)
1. **Artwork Approval Agent**
   - Auto-detects when artwork needs approval
   - Routes to correct approver based on customer tier
   - Tracks approval bottlenecks
   - Escalates stuck approvals
   
2. **Compliance Validation Agent**
   - Scans artwork for state-specific compliance issues
   - Flags missing required elements (warnings, ingredients, licenses)
   - Compares against regulatory database
   - Auto-generates compliance checklists

3. **Artwork Quality Agent**
   - Checks resolution/bleed/color mode
   - Validates file formats
   - Detects common errors (missing fonts, low-res images)
   - Suggests fixes

#### 📦 Production Agents
4. **Job Scheduling Agent**
   - Already partially exists as Air Traffic Controller
   - Needs enhancement for artwork dependencies
   
5. **Material Readiness Agent**
   - Checks if all materials are available before job starts
   - Cross-references POs with production schedule
   - Flags material delays that will block jobs

#### 💰 Financial Agents
6. **Billing Accuracy Agent**
   - Compares quoted price to actual production costs
   - Flags margin erosion
   - Detects pricing errors

7. **Payment Follow-up Agent**
   - Tracks overdue invoices
   - Auto-sends payment reminders
   - Escalates collections

## 🔧 Proposed Agent Architecture

### Agent Parameters (Configurable)

```typescript
interface ArtworkApprovalAgentConfig {
  // Escalation rules
  approval_sla_hours: number;        // Default: 24
  escalation_threshold_hours: number; // Default: 48
  
  // Routing rules
  auto_approve_repeat_customers: boolean; // Default: true (if artwork similar)
  require_double_approval_new_customers: boolean; // Default: true
  
  // Notification rules
  notify_after_hours: number;        // Default: 4
  escalate_to_manager_after: number; // Default: 48
}

interface ComplianceValidationAgentConfig {
  // Which states to check
  target_states: string[];           // Default: ['CA', 'CO', 'WA', 'OR']
  
  // Strictness level
  strictness: 'lenient' | 'standard' | 'strict'; // Default: 'standard'
  
  // Auto-actions
  auto_flag_missing_warnings: boolean;  // Default: true
  block_print_if_noncompliant: boolean; // Default: false (warn only)
  
  // MCP integration
  use_mcp_regulatory_scraper: boolean;  // Default: true
  cache_regulations_days: number;       // Default: 30
}

interface MaterialReadinessAgentConfig {
  // Lead time buffers
  material_buffer_days: number;      // Default: 2
  critical_material_buffer_days: number; // Default: 5
  
  // Auto-actions
  auto_create_rush_pos: boolean;     // Default: false (suggest only)
  auto_reschedule_jobs: boolean;     // Default: false (suggest only)
  
  // Alerts
  alert_production_manager: boolean; // Default: true
  alert_customer_if_delay: boolean;  // Default: true (>3 days)
}
```

## 🧪 Agent Testing Framework

### 1. Unit Tests (Per Agent)
Test individual agent logic without database:

```typescript
describe('Artwork Approval Agent', () => {
  test('flags artwork stuck >24 hours', () => {
    const artwork = { submitted: '2025-12-11T10:00:00Z', status: 'pending' };
    const result = artworkApprovalAgent.analyze([artwork]);
    expect(result.alerts).toContain('Artwork stuck >24h');
  });
  
  test('auto-approves repeat customer with similar artwork', () => {
    const artwork = { customerId: 'C123', design: 'label-v2.pdf' };
    const history = [{ customerId: 'C123', design: 'label-v1.pdf', approved: true }];
    const result = artworkApprovalAgent.shouldAutoApprove(artwork, history);
    expect(result).toBe(true);
  });
});
```

### 2. Integration Tests (With Database)
Test agent with real Supabase data:

```typescript
describe('Compliance Validation Agent Integration', () => {
  test('detects missing THC warning for CA', async () => {
    const artwork = await uploadTestArtwork('label-no-warning.pdf');
    const result = await complianceAgent.validate(artwork, ['CA']);
    expect(result.issues).toContain('Missing THC warning required by CA law');
  });
  
  test('passes compliant artwork', async () => {
    const artwork = await uploadTestArtwork('label-compliant.pdf');
    const result = await complianceAgent.validate(artwork, ['CA', 'CO']);
    expect(result.isCompliant).toBe(true);
  });
});
```

### 3. Accuracy Tests (Validate Predictions)
Test if agent predictions match reality:

```typescript
describe('Material Readiness Agent Accuracy', () => {
  test('predicted stockout actually occurred', async () => {
    // Run agent on historical data
    const predictions = await materialAgent.analyze('2025-11-01');
    
    // Check what actually happened
    const actualStockouts = await getActualStockouts('2025-11-01', '2025-11-30');
    
    const accuracy = calculateAccuracy(predictions, actualStockouts);
    expect(accuracy).toBeGreaterThan(0.90); // 90% accuracy target
  });
});
```

### 4. Performance Tests
Ensure agents run fast enough:

```typescript
describe('Agent Performance', () => {
  test('analyzes 1000 artworks in <2 seconds', async () => {
    const start = Date.now();
    await artworkQualityAgent.analyzeBatch(testArtworks);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(2000);
  });
});
```

### 5. End-to-End Tests
Test complete workflows:

```typescript
describe('Artwork Approval Workflow E2E', () => {
  test('customer uploads artwork → compliance check → approval → production', async () => {
    // Upload artwork
    const artwork = await uploadArtwork('customer-label.pdf');
    
    // Compliance agent auto-runs
    await waitForAgent('compliance_validation');
    const complianceResult = await getComplianceCheck(artwork.id);
    expect(complianceResult.status).toBe('passed');
    
    // Approval agent routes to approver
    await waitForAgent('artwork_approval');
    const approval = await getApprovalRequest(artwork.id);
    expect(approval.assignedTo).toBe('design-manager');
    
    // Manager approves
    await approveArtwork(artwork.id);
    
    // Production receives approved artwork
    const job = await getProductionJob(artwork.id);
    expect(job.status).toBe('ready');
  });
});
```

## 📊 Agent Effectiveness Metrics

### How to Measure if Agents are Actually Working

#### 1. **Detection Rate** (Are agents finding real issues?)
```sql
-- Count how many flagged issues were real problems
SELECT 
  agent_name,
  COUNT(*) as total_alerts,
  COUNT(CASE WHEN was_real_issue = true THEN 1 END) as correct_alerts,
  ROUND(100.0 * COUNT(CASE WHEN was_real_issue = true THEN 1 END) / COUNT(*), 1) as accuracy_pct
FROM agent_alerts
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY agent_name;
```

#### 2. **False Positive Rate** (How many false alarms?)
- Target: <10% false positives
- Measure: Alerts marked as "not an issue" by users
- Action: Recalibrate agent if >15% false positives

#### 3. **False Negative Rate** (What did agents miss?)
- Harder to measure - requires manual audits
- Monthly: Sample 100 random items, check if agents should have flagged them
- Target: <5% false negatives

#### 4. **Time Savings** (Are agents actually saving time?)
```sql
-- Compare time to resolution before/after agent
SELECT 
  'Before Agents' as period,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) as avg_hours
FROM issues
WHERE created_at < '2025-11-01'; -- before agents deployed

UNION ALL

SELECT 
  'After Agents' as period,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) as avg_hours
FROM issues
WHERE created_at >= '2025-11-01'; -- after agents deployed
```

#### 5. **Financial Impact** (Are agents saving/making money?)
Track:
- Stockouts prevented (lost revenue avoided)
- Price increases caught (costs saved)
- Compliance issues caught (fines avoided)
- Approval bottlenecks cleared (production time saved)

Example monthly report:
```
Vendor Watchdog: $8,450 saved (caught 3 late deliveries before stockout)
PO Intelligence: $2,100 saved (found invoice overcharges)
Stockout Prevention: $12,300 saved (prevented 4 production delays)
Compliance Agent: $15,000 saved (avoided 2 potential fines)
---
Total Monthly Value: $37,850
```

## 🔧 Implementation Plan

### Week 1: Fix Non-Functioning Buttons
- ✅ Audit all buttons in PO modal
- ✅ Wire up onSendEmail handler
- ✅ Wire up onUpdateTracking handler
- ✅ Wire up onReceive handler
- ✅ Add inventory detail modal

### Week 2: Artwork Approval Agent
- Create agent service
- Define approval routing logic
- Add escalation rules
- Create approval dashboard
- Write tests

### Week 3: Compliance Validation Agent
- Integrate with MCP compliance scraper
- Build state regulation database
- Create auto-scanning logic
- Add compliance dashboard
- Write tests

### Week 4: Material Readiness Agent
- Cross-reference POs with production jobs
- Add lead time calculations
- Create alert system
- Integrate with Air Traffic Controller
- Write tests

### Week 5: Testing & Validation
- Run accuracy tests on all agents
- Collect metrics for 2 weeks
- Calculate ROI
- Adjust parameters
- Create effectiveness report

## 📝 Questions to Answer

1. **Artwork Approval Agent:**
   - Who are the approvers? (Design manager, production manager, customer?)
   - What triggers approval? (New customer, custom design, compliance concerns?)
   - What's the SLA? (4 hours? 24 hours?)

2. **Compliance Validation Agent:**
   - Which states do you ship to most? (prioritize those)
   - Should agent block production or just warn?
   - Who reviews compliance issues?

3. **Material Readiness Agent:**
   - What's acceptable lead time buffer? (2 days? 5 days?)
   - Should agent auto-create rush POs or just suggest?
   - Who gets alerted when materials will be late?

4. **All Agents:**
   - Who can configure agent parameters?
   - Where should agent alerts show? (Dashboard, email, Slack?)
   - What actions should require human approval vs auto-execute?

## 🎯 Success Criteria

Agent is considered "working properly" if:
1. ✅ Accuracy >90% (predictions match reality)
2. ✅ False positives <10% (not crying wolf)
3. ✅ Response time <2 seconds (fast enough)
4. ✅ Demonstrable ROI (saves time or money)
5. ✅ User adoption >80% (people actually use it)

Failure indicators:
- ❌ Users ignore agent alerts
- ❌ False positive rate >20%
- ❌ Can't measure impact
- ❌ Agents slower than manual process
