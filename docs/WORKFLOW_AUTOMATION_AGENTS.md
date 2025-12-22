# Workflow Automation Agents

## Vision: "Automate All Dailies"

Transform repetitive daily tasks into **autonomous agent workflows** that run start-to-finish with minimal human intervention.

## Daily Workflows to Automate

### 1. 🌅 Morning Check-In Agent

**Trigger:** Daily at 6 AM or when user opens Dashboard

**Current Manual Process:**
1. Check dashboard for alerts
2. Review stockout risks
3. Check pending requisitions
4. Review open POs
5. Check emails for vendor updates
6. Prioritize day's tasks

**Automated Workflow:**
```
Agent: "morning-briefing"

1. GATHER CONTEXT
   ├─ Query stockout risks from Stock Intelligence
   ├─ Get pending requisitions needing approval
   ├─ Check open POs with no tracking
   ├─ Scan email for overnight vendor responses
   └─ Check compliance alerts

2. ANALYZE & PRIORITIZE
   ├─ Rank issues by urgency
   ├─ Group related items
   └─ Identify blockers

3. PRESENT BRIEFING
   "Good morning! Here's your priority list:

   🔴 URGENT (3 items)
   • Widget-A: 2 days until stockout, no PO created yet
   • PO-2024-0892: Vendor asked about qty change (reply needed)
   • Compliance: OR label update effective Jan 1

   🟡 TODAY (5 items)
   • 3 requisitions pending your approval
   • 2 POs ready to receive
   • Check on late shipment from ABC Supply

   ✅ FYI
   • 4 shipments arriving today
   • Inventory sync completed overnight"

4. OFFER ACTIONS
   "Want me to:
   □ Create PO for Widget-A? (Recommended vendor: ABC Supply)
   □ Draft reply to vendor question?
   □ Approve the 3 requisitions in bulk?"
```

**In-App Trigger:**
- Dashboard loads → Agent runs automatically
- Notification widget shows summary
- Quick action buttons for each item

---

### 2. 📦 Purchase Order Creation Agent

**Trigger:** Low stock alert, or user says "create PO for [vendor/items]"

**Current Manual Process:**
1. Go to Stock Intelligence
2. Review items below reorder point
3. Check vendor for each item
4. Go to Purchase Orders
5. Click Create PO
6. Select vendor, add items, set quantities
7. Review and submit
8. Send email to vendor

**Automated Workflow:**
```
Agent: "purchase-order-creator"

1. ANALYZE REORDER NEEDS
   ├─ Get items below ROP
   ├─ Group by preferred vendor
   ├─ Check vendor lead times
   └─ Calculate optimal order quantities

2. DRAFT PO
   ├─ Create PO with calculated quantities
   ├─ Apply any bulk discounts
   ├─ Set expected delivery based on lead time
   └─ Add notes from last order if relevant

3. PRESENT FOR APPROVAL
   "I've drafted a PO for ABC Supply:

   📋 PO-2024-0923 (Draft)
   • 5 items, $2,340 total
   • Expected delivery: Dec 28

   Items:
   SKU         Qty    Unit Cost
   Widget-A    100    $12.50
   Gadget-B    50     $23.00
   ...

   This covers 45 days of demand."

4. USER CONFIRMS → EXECUTE
   ├─ Create PO in system
   ├─ Send confirmation email to vendor
   ├─ Update expected inventory
   └─ Log action for audit
```

**In-App Trigger:**
- Stock Intelligence → "Auto-Generate POs" button
- Chat: "Create a PO for everything below reorder point"
- Scheduled: Weekly PO batch creation

---

### 3. 📧 Email Processing Agent

**Trigger:** New email arrives, or hourly batch

**Current Manual Process:**
1. Check email inbox
2. Read each message
3. Figure out which PO it relates to
4. Update PO with tracking/status
5. File or respond as needed
6. Repeat for each email

**Automated Workflow:**
```
Agent: "email-processor"

1. INGEST NEW EMAILS
   ├─ Fetch from connected Gmail
   ├─ Filter to PO-related (keywords, sender domain)
   └─ Skip already-processed

2. FOR EACH EMAIL:
   ├─ Extract: PO#, tracking, ETA, carrier, status
   ├─ Detect tone: urgent? question? confirmation?
   ├─ Correlate to PO in system
   └─ Classify action needed

3. AUTO-EXECUTE (High Confidence)
   ├─ Tracking confirmed → Update PO tracking field
   ├─ Shipment confirmation → Change status to "Shipped"
   ├─ Invoice attached → Queue for AP review
   └─ Log all auto-actions

4. QUEUE FOR HUMAN (Low Confidence)
   ├─ Question from vendor → Draft response, await approval
   ├─ Price change notice → Alert purchasing manager
   ├─ Backorder notice → Create stockout alert
   └─ Unclear → Flag for manual review

5. SUMMARIZE
   "Processed 8 emails:
   • 5 auto-updated (tracking, confirmations)
   • 2 need your response (drafts ready)
   • 1 flagged for review"
```

**In-App Trigger:**
- Automatic (webhook from Gmail)
- Manual: "Check my emails for updates"
- Settings: Configure confidence threshold

---

### 4. 📋 Requisition Approval Agent

**Trigger:** New requisition created, or user opens approvals

**Current Manual Process:**
1. Go to pending requisitions
2. Review each item and quantity
3. Check budget/justification
4. Check stock levels
5. Approve or reject with notes
6. Repeat for each requisition

**Automated Workflow:**
```
Agent: "requisition-approver"

1. ANALYZE REQUISITIONS
   FOR EACH pending requisition:
   ├─ Check: Is this a repeat order? (compare to history)
   ├─ Check: Is quantity reasonable? (compare to velocity)
   ├─ Check: Is this urgent? (stock level vs lead time)
   ├─ Check: Budget available?
   └─ Calculate approval confidence score

2. AUTO-APPROVE (High Confidence)
   IF confidence > 95% AND:
   ├─ Regular reorder (within 20% of normal qty)
   ├─ Stock below ROP
   ├─ Within budget
   └─ Standard vendor
   THEN: Auto-approve, notify requester

3. RECOMMEND (Medium Confidence)
   IF confidence 70-95%:
   ├─ Present with recommendation
   ├─ Highlight any flags
   └─ One-click approve/reject

4. ESCALATE (Low Confidence)
   IF confidence < 70%:
   ├─ New item or unusual qty
   ├─ Budget concern
   ├─ Requires manager review
   └─ Flag for manual review

5. REPORT
   "Processed 12 requisitions:
   • 8 auto-approved (standard reorders)
   • 3 ready for your approval (recommended: approve)
   • 1 needs review (qty 5x normal)"
```

**In-App Trigger:**
- Automatic on requisition creation
- "Approve all standard requisitions"
- Dashboard widget: "Approvals ready"

---

### 5. 🚚 Receiving & Inventory Agent

**Trigger:** PO marked as delivered, or user initiates receiving

**Current Manual Process:**
1. Find PO in system
2. Open receiving modal
3. Enter received quantities per item
4. Note any discrepancies
5. Update PO status
6. Update inventory
7. File packing slip

**Automated Workflow:**
```
Agent: "receiving-processor"

1. IDENTIFY ARRIVAL
   Triggers:
   ├─ Tracking status → "Delivered"
   ├─ Carrier API confirms delivery
   ├─ User scans packing slip
   └─ Email says "delivered"

2. PREPARE RECEIVING
   ├─ Pull up PO details
   ├─ Show expected quantities
   ├─ Pre-fill with expected (user confirms)
   └─ Flag any discrepancies from prior orders with this vendor

3. USER CONFIRMS QUANTITIES
   Simple interface:
   "PO-2024-0892 from ABC Supply

   Widget-A:  100 expected → [100] received ✓
   Gadget-B:  50 expected  → [48] received ⚠️

   Note: Gadget-B short 2 units"

4. EXECUTE
   ├─ Update inventory (add received qty)
   ├─ Update PO status → "Received" or "Partially Received"
   ├─ Create discrepancy ticket if short
   ├─ Notify AP to expect invoice
   └─ Log for inventory audit

5. FOLLOW-UP
   IF discrepancy:
   ├─ Draft email to vendor about shortage
   ├─ Create credit memo request
   └─ Update vendor reliability score
```

---

### 6. 📊 End-of-Day Summary Agent

**Trigger:** Daily at 5 PM or user says "wrap up"

**Automated Workflow:**
```
Agent: "daily-summary"

1. GATHER ACTIVITY
   ├─ POs created today
   ├─ POs received today
   ├─ Requisitions processed
   ├─ Emails handled
   ├─ Inventory changes
   └─ Any open issues

2. COMPILE SUMMARY
   "Here's your end-of-day summary:

   📦 Purchase Orders
   • 3 POs created ($8,500 total)
   • 2 POs received
   • 1 PO has tracking issue (flagged)

   📋 Requisitions
   • 8 approved
   • 0 rejected
   • 2 pending (carried to tomorrow)

   📧 Emails
   • 12 processed automatically
   • 3 you responded to
   • 1 awaiting vendor reply

   📊 Inventory
   • 127 items updated
   • 5 new stockout risks (see Stock Intelligence)

   ⚠️ Tomorrow's Priority
   • Reply to ABC Supply about backorder
   • Create PO for Widget-A (critical)
   • 3 POs expected to arrive"

3. PREP FOR TOMORROW
   ├─ Queue morning briefing
   ├─ Set reminders for urgent items
   └─ Pre-generate draft POs if authorized
```

---

## Agent Trust & Autonomy Levels

### Level 1: Inform Only
- Agent monitors and reports
- No automatic actions
- User does everything manually
- Good for: New users, learning the system

### Level 2: Recommend
- Agent suggests actions with reasoning
- One-click to approve recommendations
- User reviews before execution
- Good for: Most daily operations

### Level 3: Auto-Execute (Low Risk)
- Agent auto-executes routine tasks
- Tracking updates, status changes
- User sees summary after the fact
- Good for: High-volume repetitive tasks

### Level 4: Fully Autonomous
- Agent handles entire workflows
- Only escalates exceptions
- User sets policies, agent executes
- Good for: Trusted processes, vacation mode

### User Controls
```typescript
// Settings per workflow
interface WorkflowAutonomy {
  workflow: string;
  level: 1 | 2 | 3 | 4;
  maxAutoApprovalAmount?: number;  // e.g., $5,000
  requireConfirmationFor?: string[];  // e.g., ['new_vendor', 'rush_order']
  notifyOn?: ('auto_action' | 'escalation' | 'summary')[];
}
```

---

## Implementation Architecture

### Agent Registry

```typescript
// services/agentRegistry.ts
export const WORKFLOW_AGENTS = {
  'morning-briefing': {
    name: 'Morning Briefing',
    schedule: '0 6 * * *',  // 6 AM daily
    triggers: ['app_open', 'manual'],
    autonomyLevel: 2,
    tools: ['stockout_check', 'po_status', 'email_scan', 'requisition_list']
  },
  'po-creator': {
    name: 'PO Creator',
    schedule: null,  // On-demand
    triggers: ['low_stock_alert', 'manual', 'batch_weekly'],
    autonomyLevel: 3,
    tools: ['inventory_analysis', 'vendor_lookup', 'po_create', 'email_send']
  },
  'email-processor': {
    name: 'Email Processor',
    schedule: '*/15 * * * *',  // Every 15 min
    triggers: ['email_webhook', 'manual'],
    autonomyLevel: 3,
    tools: ['email_fetch', 'po_correlate', 'tracking_extract', 'po_update']
  },
  // ... etc
};
```

### In-App Agent UI

```tsx
// components/AgentControl.tsx
function AgentControl({ agent }: { agent: WorkflowAgent }) {
  const { autonomyLevel, setAutonomyLevel } = useAgentSettings(agent.id);
  const { lastRun, status, results } = useAgentStatus(agent.id);

  return (
    <Card>
      <CardHeader>
        <BotIcon />
        <h3>{agent.name}</h3>
        <Badge>{status}</Badge>
      </CardHeader>

      <CardContent>
        {/* Last run summary */}
        {results && <AgentResultsSummary results={results} />}

        {/* Pending actions needing approval */}
        {results?.pendingActions && (
          <PendingActions
            actions={results.pendingActions}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        )}

        {/* Autonomy slider */}
        <div className="mt-4">
          <label>Autonomy Level</label>
          <Slider
            min={1}
            max={4}
            value={autonomyLevel}
            onChange={setAutonomyLevel}
            labels={['Inform', 'Recommend', 'Auto (Low Risk)', 'Full Auto']}
          />
        </div>
      </CardContent>

      <CardFooter>
        <Button onClick={() => runAgent(agent.id)}>
          Run Now
        </Button>
      </CardFooter>
    </Card>
  );
}
```

---

## The Millions Path 💰

### Value Proposition

**Before (Manual):**
- 2-3 hours/day on routine tasks
- Errors from manual data entry
- Delayed responses to vendors
- Stockouts from missed reorders
- Compliance violations from oversight

**After (Automated):**
- 15 min/day reviewing agent summaries
- Zero data entry errors
- Sub-minute response to emails
- Zero stockouts (predictive ordering)
- 100% compliance (automated monitoring)

### Target Users

1. **Small Mfg Operations** (1-5 people)
   - Can't afford dedicated purchasing staff
   - Owner wears many hats
   - Agents = virtual employee

2. **Mid-Size Operations** (5-20 people)
   - Staff doing repetitive work
   - High turnover, training costs
   - Agents = force multiplier

3. **Multi-Location Operations**
   - Coordination complexity
   - Consistency challenges
   - Agents = standardization

### Pricing Tiers

| Tier | Agents | Autonomy | Price |
|------|--------|----------|-------|
| Free | Morning briefing only | Level 1 | $0 |
| Pro | All agents | Level 1-2 | $99/mo |
| Business | All agents + email | Level 1-3 | $299/mo |
| Enterprise | All agents + custom | Level 1-4 | $599/mo |

---

## Next Steps

### Phase 1: Foundation (Now)
- [x] Create agent/skill directory structure
- [ ] Build AgentOrchestrator service
- [ ] Create useAgent hook
- [ ] Add Agent Control UI to Settings

### Phase 2: First Agent (Next)
- [ ] Implement morning-briefing agent
- [ ] Dashboard integration
- [ ] Notification system

### Phase 3: Email Integration
- [ ] Gmail OAuth flow
- [ ] Email processor agent
- [ ] PO correlation logic

### Phase 4: Full Automation
- [ ] PO creation agent
- [ ] Requisition approval agent
- [ ] Receiving agent
- [ ] Trust/autonomy system

### Phase 5: Scale
- [ ] Multi-user support
- [ ] Team workflows
- [ ] Custom agent builder
- [ ] API for third-party agents
