# 📖 MuRP Agent Manual - User Guide

**Version:** 2.0
**Last Updated:** December 10, 2025
**Audience:** Operations team, purchasing managers, supply chain coordinators

---

## Quick Start

This manual explains how to use each AI agent in MuRP to automate supply chain operations. Each section covers:
- What the agent does
- How to use it
- How to monitor it
- How to interpret results

---

## Table of Contents

1. [AI Purchasing Service](#1-ai-purchasing-service) - Daily anomaly detection & consolidation
2. [Vendor Confidence System](#2-vendor-confidence-system) - Communication automation levels
3. [Agentic Tool Orchestration](#3-agentic-tool-orchestration) - Natural language queries
4. [Vendor Watchdog Agent](#4-vendor-watchdog-agent) - Learn vendor behavior
5. [Air Traffic Controller Agent](#5-air-traffic-controller-agent) - Intelligent alerts
6. [Trust Score Agent](#6-trust-score-agent) - Track progress to autonomy

---

## 1. AI Purchasing Service

### What It Does
Runs every morning at 6am and analyzes your inventory for:
- **Anomalies**: Unusual consumption patterns, stockout risks, data errors
- **Consolidation**: Opportunities to save on shipping by bundling orders
- **Email Intelligence**: Extracts tracking info from vendor emails automatically

### How to Use It

#### Viewing Daily Anomalies

1. Go to **Dashboard → AI Purchasing**
2. Click **Anomalies** tab
3. Review the three categories:

**🚨 Critical (Red)** - Immediate action needed
```
Example: "SKU-456 consumption dropped 85% last week"
Possible cause: Item out of stock online, causing lost sales
Action: Check website inventory, restock immediately
```

**⚠️ Warning (Yellow)** - Review within 1-2 days
```
Example: "SKU-789 consumption variance 55% above average"
Possible cause: Seasonal demand spike or data entry error
Action: Review recent orders, confirm trend is real
```

**ℹ️ Info (Blue)** - Good to know
```
Example: "SKU-123 sales increased 30% (positive trend)"
Action: Consider increasing reorder point
```

#### Accepting Consolidation Opportunities

1. Go to **AI Purchasing → Consolidation** tab
2. Review recommendations:
```
Vendor: ABC Wholesale
Current order: $245.00
Add these items to reach $300 free shipping:
  • Widget Pro (10 units) - $55.00
  • Gadget Plus (5 units) - $22.00
Potential savings: $28 shipping
Urgency: Low (items have 45+ days stock)
```

3. Click **Accept** to add items to draft PO
4. Click **Dismiss** if not needed right now

#### Viewing Email Intelligence

Vendor emails are automatically parsed when received. Check:

1. Go to **Purchase Orders → [PO Number]**
2. Tracking info auto-populated from email:
   - Tracking number: `1Z999AA10123456784`
   - Carrier: `UPS Ground`
   - Expected delivery: `Nov 22, 2025`
3. No manual entry needed!

### How to Monitor

**Daily:** Check for critical anomalies (red badges)
**Weekly:** Review consolidation opportunities, accept if applicable
**Monthly:** Check cost tracking (should be <$5/month)

---

## 2. Vendor Confidence System

### What It Does
Tracks how well each vendor communicates and automatically adjusts automation levels.

### Confidence Scores

| Score | Status | What It Means | Automation Level |
|-------|--------|---------------|------------------|
| 8-10  | 🟢 Fully Automatic | Perfect communication | AI can send POs automatically |
| 6-7   | 🔵 Automatic w/ Review | Good but occasionally needs followup | AI drafts, you click send |
| 4-5   | 🟡 Needs Review | Sometimes misses info or slow | Review before sending |
| 2-3   | 🟠 Needs Full Review | Often incomplete or very slow | Manual review required |
| 0-1   | 🔴 Suspended | Unreliable communication | Manual only |

### How to Use It

#### Viewing Vendor Scores

1. Go to **Vendors → Confidence Dashboard**
2. See all vendors ranked by confidence score
3. Click vendor for detailed breakdown:

```
Vendor: ABC Wholesale
Confidence Score: 8.5 (Fully Automatic)

Factor Scores:
• Response Latency: 9.2 (replies within 2 hours)
• Threading Discipline: 8.8 (keeps threads organized)
• Completeness: 8.0 (usually answers all questions)
• Invoice Accuracy: 9.0 (billing matches PO 95% of time)
• Lead Time Adherence: 7.8 (ships within promised window)

Trend: 📈 Improving

Recommendation: ✨ Candidate for Level 3 Autonomy
```

#### What Each Factor Means

**Response Latency**
- How fast vendor replies to emails
- 9-10 = Within 2 hours
- 7-8 = Same business day
- 5-6 = Within 24 hours
- <5 = Slow (>48 hours)

**Threading Discipline**
- Does vendor keep conversations organized?
- 9-10 = Always uses "Reply" with PO in subject
- 7-8 = Usually keeps thread, occasionally starts new
- 5-6 = Often starts new threads
- <5 = Never maintains threads (chaos)

**Completeness**
- Does vendor answer all questions?
- 9-10 = Always answers everything first time
- 7-8 = Occasionally needs followup
- 5-6 = Often need to ask twice
- <5 = Regularly misses questions

**Invoice Accuracy**
- Does invoice match PO?
- 9-10 = Perfect match (≤1% variance)
- 7-8 = Minor differences (1-5% variance)
- 5-6 = Frequent mismatches (5-10%)
- <5 = Major billing issues (>10%)

**Lead Time Adherence**
- Ships when they say they will?
- 9-10 = Early or exactly on time
- 7-8 = On time (±2 days)
- 5-6 = Often late (±5 days)
- <5 = Consistently late (>7 days)

#### Changing Automation Levels Manually

1. Go to **Vendor → [Vendor Name] → Settings**
2. Click **Override Automation Level**
3. Choose:
   - **Automatic**: AI sends emails without confirmation
   - **Review**: AI drafts, you click send (recommended)
   - **Manual**: You write all emails yourself
4. System will warn if score doesn't support that level

### How to Monitor

**Weekly:** Review vendors with declining trends
**Monthly:** Celebrate vendors reaching Level 3 candidacy
**Quarterly:** Review and adjust thresholds if needed

---

## 3. Agentic Tool Orchestration

### What It Does
Lets you ask questions in natural language, and AI figures out which tools to use.

### How to Use It

#### Ask Complex Questions

Instead of clicking through menus, just type your question:

**Compliance Questions:**
```
You: "Check if our Cannabis Gummy label complies with California and Colorado laws"

AI:
1. Calls check_label_compliance tool
2. Calls get_regulation_changes to verify latest rules
3. Returns structured report:
   ✅ California: Compliant
   ⚠️ Colorado: Warning - Font size 0.5mm too small
   Action: Increase warning text to 2.5mm minimum
```

**Inventory Questions:**
```
You: "Why did Widget Pro sales drop 80% last week?"

AI:
1. Calls detect_inventory_anomalies
2. Analyzes sales data
3. Returns: "Item shows as out of stock on website. Current stock: 45 units.
   Likely cause: Website inventory sync issue."
```

**BOM Questions:**
```
You: "Can I build 500 units of Product X today?"

AI:
1. Calls analyze_bom_buildability
2. Checks all component stock
3. Returns:
   ⚠️ Can build 320 units (64%)
   Blocking items:
   • Label Stock (SKU-789): Need 500, have 320
   • Bottles (SKU-456): Need 500, have 480
```

**Purchasing Questions:**
```
You: "Should I place this order today or wait?"

AI:
1. Calls find_consolidation_opportunities
2. Analyzes vendor thresholds
3. Returns: "Wait 2-3 days. Adding $55 more will hit $300 free shipping.
   Items below reorder point that can be added: Widget Pro (45 days stock remaining)"
```

#### Using Natural Language

**Works:**
- "Check compliance for Product X in CA and CO"
- "Why did this item's sales drop?"
- "Can I build 100 units?"
- "Should I order now or wait?"

**Also Works:**
- "Is Product X legal in California?"
- "Something's weird with SKU-456 sales"
- "Do I have enough parts for 100 builds?"
- "Best time to submit this PO?"

**AI figures it out!**

### How to Monitor

**Daily:** Use it! Replace manual menu navigation
**Weekly:** Review if AI is choosing correct tools
**Monthly:** Check cost (should be $2-5/month for typical usage)

---

## 4. Vendor Watchdog Agent 👀

### What It Does
**Silently learns** from vendor behavior and auto-adjusts your planning to match reality.

### The Problem It Solves

```
Vendor says: "14 day lead time"
Reality: Ships in 18-20 days every single time

Without Watchdog:
  You plan for 14 days → Run out of stock → Emergency orders

With Watchdog:
  Agent learns "effective lead time" is 19 days
  Auto-adjusts reorder points
  You never run out
  Vendor never knows you don't trust their promise
```

### How It Works

**Automatic Learning:**
1. Every time a PO is delivered, system records:
   - Promised lead time (from vendor)
   - Actual lead time (from order date to delivery)
   - Was it critical? (did it cause stockout?)
2. Database calculates "effective lead time" from history
3. Reorder calculations use effective lead time (not promised)

**You don't do anything - it just learns!**

### How to Use It

#### Viewing Vendor Performance

1. Go to **Vendors → Scorecard** (new component)
2. See each vendor's learned performance:

```
Vendor: ABC Wholesale
Trust Score: 78/100

Lead Time Comparison:
  Promised:  14 days
  Effective: 19 days  ← What we actually plan for
  Buffer:    +5 days added automatically

Delivery Performance:
  On-Time Rate: 65%
  Late (Minor): 25% (within 3 days)
  Late (Major): 10% (>3 days late)

Trend: ➡️ Stable

Recommendation: Continue using 19-day buffer
```

#### Understanding Trust Scores

| Score | Meaning | Action |
|-------|---------|--------|
| 90-100 | Perfect reliability | No changes needed |
| 75-89 | Good with minor delays | Small buffer added |
| 60-74 | Moderately reliable | Significant buffer added |
| 40-59 | Often late | Consider backup vendor |
| 0-39 | Very unreliable | Find alternative |

#### When to Intervene

**Usually: Never!** The agent handles it automatically.

**Exceptions:**
- Trust score drops below 40 → Consider new vendor
- Effective lead time keeps growing → Talk to vendor about issues
- Critical POs repeatedly delayed → Escalate to vendor management

### How to Monitor

**Weekly:** Glance at vendor scorecards, look for declining trends
**Monthly:** Review vendors with trust score <60
**Quarterly:** Meet with vendors whose effective lead time is >50% longer than promised

---

## 5. Air Traffic Controller Agent ✈️

### What It Does
**Intelligently prioritizes** PO delay alerts based on actual stock impact. No more alert fatigue!

### The Problem It Solves

```
Old System (Alert Overload):
  PO #123 delayed 3 days → ⚠️ ALERT (but you have 45 days stock - who cares?)
  PO #456 delayed 3 days → ⚠️ ALERT (you have 2 days stock - CRITICAL!)

  Problem: Both look the same. You ignore both. Actually critical alert missed.

New System (Smart Alerts):
  PO #123 delayed 3 days + 45 days stock → 🔇 Silent update (no alert)
  PO #456 delayed 3 days + 2 days stock → 🚨 CRITICAL + Draft email ready

  You only see what matters. Draft email ready to send.
```

### How It Works

**Automatic Assessment:**
1. PO tracking updates detect delay (from carrier API or vendor email)
2. Air Traffic Controller calculates:
   - Days of stock remaining for affected items
   - Days until new delivery
   - Risk of stockout
3. Assigns priority: **Critical | High | Medium | Low**
4. Only creates alerts for Critical/High
5. Medium/Low silently update expected date

### How to Use It

#### Alert Feed (Coming Soon - `AlertFeedComponent.tsx`)

Will show prioritized alerts:

```
🚨 CRITICAL (3)
────────────────────────────────────────
PO #12345 - ABC Wholesale
Delayed: 3 days (new ETA: Nov 25)
Impact: SKU-456 will stockout in 2 days
Action Required: Contact vendor NOW

Draft Email Ready:
  "Hi [Vendor], PO #12345 is now critical.
   We'll run out of stock on Nov 20.
   Current ETA is Nov 25 - can you expedite?"

[ Send Email ] [ Mark Resolved ] [ Dismiss ]

────────────────────────────────────────
PO #12347 - XYZ Supplies
Delayed: 5 days (new ETA: Nov 27)
Impact: SKU-789 will stockout in 4 days
Action Required: Find backup supplier

[ Send Email ] [ Mark Resolved ] [ Dismiss ]
```

```
⚠️ HIGH (1)
────────────────────────────────────────
PO #12350 - DEF Distributors
Delayed: 2 days (new ETA: Nov 22)
Impact: Stock will be low but won't stockout
Action: Monitor, no immediate action needed

[ Mark Resolved ] [ Dismiss ]
```

```
📌 LOW (Auto-Updated Silently)
────────────────────────────────────────
PO #12352 - GHI Vendors - Updated to Nov 28 (plenty of stock)
PO #12355 - JKL Supplies - Updated to Nov 30 (plenty of stock)
```

#### Priority Levels Explained

**🚨 Critical**
- Will stockout before new delivery arrives
- Immediate action required (contact vendor, find backup)
- Draft email auto-generated
- Slack notification sent (if enabled)

**⚠️ High**
- Won't stockout but stock will be dangerously low
- Review within 24 hours
- May need to contact vendor

**📋 Medium**
- Stock will be low but not critical
- Monitor, no immediate action
- Alert shown but no notification

**🔇 Low**
- Plenty of stock remaining (>30 days)
- Silent update, no alert
- Logged for recordkeeping only

#### Using Draft Emails

When critical alert appears:

1. Review the draft email
2. Edit if needed (add account-specific details)
3. Click **Send Email** (opens your email client with pre-filled message)
4. Or click **Copy to Clipboard** to send via another channel

**Example Draft:**
```
Subject: URGENT: PO #12345 Delayed - Critical Stock Impact

Hi [Vendor Contact],

I'm writing regarding PO #12345 which is now showing an expected delivery
of November 25, 2025 (3 days later than originally planned).

This delay is critical as we will run out of stock on November 20.

Is there any way to expedite this shipment? We're willing to pay
additional shipping fees if necessary.

Alternatively, can you confirm if a partial shipment is possible
for the items we need most urgently (SKU-456, SKU-789)?

Please respond ASAP as we're at risk of stockout.

Thank you,
[Your Name]
```

### How to Monitor

**Daily:** Check alert feed for Critical/High alerts
**Weekly:** Review resolved alerts to see patterns
**Monthly:** Analyze which vendors trigger most alerts

---

## 6. Trust Score Agent 📈

### What It Does
**Tracks progress** toward "No Human Intervention" by measuring four key metrics.

### The Four Pillars of Trust

#### 1. Stockout Prevention (40% of score)
**What:** Did we prevent stockouts through accurate planning?
**Target:** 100% (zero stockouts from planning errors)
**How Measured:**
```
Predicted 3 items would stockout → Reordered in time
Actual stockouts: 0
Prevention Rate: 100%
```

#### 2. Touchless PO Rate (30% of score)
**What:** How many AI-generated POs went through unchanged?
**Target:** >95% (most POs don't need human edits)
**How Measured:**
```
100 POs generated by AI this month
95 approved without changes
5 edited before approval
Touchless Rate: 95%
```

#### 3. ETA Accuracy (20% of score)
**What:** How accurate are our delivery predictions?
**Target:** ±1 day accuracy
**How Measured:**
```
Predicted ETA: Nov 20
Actual Delivery: Nov 21 (1 day off)
ETA Accuracy: 95% (within tolerance)
```

#### 4. Capital Efficiency (10% of score)
**What:** Are we overstocking or holding just enough?
**Target:** DSI (Days Sales Inventory) trending down
**How Measured:**
```
Average inventory value: $50,000
Daily sales: $2,000
DSI = $50,000 / $2,000 = 25 days
Lower is better (less capital tied up)
```

### How to Use It

#### Viewing Trust Score Dashboard

1. Go to **Dashboard → Trust Score**
2. See overall score (0-100):

```
╔══════════════════════════════════════╗
║   Overall Trust Score: 82            ║
║   ████████████████████░░░░ 82%      ║
║                                      ║
║   Progress Toward Full Autonomy:     ║
║   Level 2 → Level 3 (82% complete)   ║
╚══════════════════════════════════════╝
```

3. See four metrics breakdown:

```
📊 Stockout Prevention
Target: 100% | Actual: 95%
████████████████████▓▓ 95%
📈 Improving (+5% from last month)

✅ Touchless PO Rate
Target: >95% | Actual: 89%
██████████████████▓▓▓▓ 89%
📉 Needs Improvement (was 92% last month)

🎯 ETA Accuracy
Target: ±1 day | Actual: 91% within range
███████████████████▓▓ 91%
➡️ Stable

💰 Capital Efficiency
DSI: 23 days (Target: <25)
█████████████████████▓ 92%
📈 Improving (was 26 days last month)
```

4. See recommendations:

```
📋 Recommendations to Improve Trust Score:

1. Touchless PO Rate (Biggest Impact)
   Current: 89% | Target: 95%
   Issue: 11% of POs being edited before approval
   Fix: Review what changes humans are making. If consistent,
        adjust AI logic to incorporate those preferences.

2. Stockout Prevention
   Current: 95% | Target: 100%
   Issue: 2 stockouts this month (SKU-456, SKU-789)
   Fix: Review Vendor Watchdog effective lead times for these vendors.
        May need larger safety buffer.

3. Keep Up The Good Work!
   • ETA Accuracy is excellent
   • Capital Efficiency improving
```

### Autonomy Levels

Your trust score determines your autonomy level:

#### Level 1: AI Suggests (0-60 score)
- AI makes recommendations
- Human decides everything
- High touch, low trust

#### Level 2: AI Drafts → Human Approves (61-90 score) ← **You are here**
- AI creates draft POs
- AI drafts emails
- Human clicks "Send/Approve"
- Medium touch, building trust

#### Level 3: AI Sends → Human Gets FYI (91-97 score)
- AI sends POs directly to vendor
- Human gets notification after
- Spot-check weekly
- Low touch, high trust

#### Level 4: Full Autonomy (98+ score)
- AI handles everything
- Human reviews monthly reports
- Minimal touch, complete trust

### Promoting to Level 3

When trust score reaches **98+** for a specific vendor:

```
🎉 Achievement Unlocked!

ABC Wholesale has reached Trust Score 98
(6 months of perfect performance)

Ready to promote to Level 3 Autonomy?

Level 3 means:
✅ AI automatically sends POs to this vendor
✅ You get FYI notification after PO sent
✅ You can still review/cancel within 2 hours
✅ Can demote back to Level 2 anytime

[ Promote to Level 3 ] [ Stay at Level 2 ]
```

**Recommendation:** Start with 1-2 vendors, prove it works, then expand.

### How to Monitor

**Daily:** Glance at overall trust score
**Weekly:** Review four pillar metrics
**Monthly:** Read recommendations, implement fixes
**Quarterly:** Identify Level 3 candidates

---

## Best Practices

### For Operations Team

**Morning Routine:**
1. Check AI Purchasing Dashboard for critical anomalies
2. Check Alert Feed for PO delays
3. Review any Level 3 candidate vendors

**Weekly:**
1. Review consolidation opportunities (accept if applicable)
2. Check vendor confidence scores for declining trends
3. Review trust score recommendations

**Monthly:**
1. Review total AI costs (should be <$15/month)
2. Analyze stockout prevention rate
3. Celebrate trust score improvements

### For Purchasing Managers

**When to Intervene:**
- Critical alerts in Alert Feed
- Vendor trust score drops below 60
- Touchless PO rate drops below 85%
- AI costs exceed $20/month

**When to Celebrate:**
- First vendor reaches Level 3 candidacy
- Trust score above 85
- Zero stockouts for 30 days
- Consolidation savings >$100/month

### For Supply Chain Coordinators

**Use Agents For:**
- Quick compliance checks
- BOM buildability queries
- Vendor performance lookups
- "Should I order now?" questions

**Don't Use Agents For:**
- Critical emergencies (call vendor directly)
- Vendor relationship issues (need human touch)
- First-time vendor setup (needs manual vetting)

---

## Troubleshooting

### "I'm not seeing any anomalies"

**Possible causes:**
1. Nightly job not running (check `ai_job_logs` table)
2. Not enough inventory data yet (need 30+ days sales history)
3. Everything is actually normal! (no anomalies = good thing)

**Fix:** Check job logs, wait for more data, or manually test with `detectInventoryAnomalies()`

### "Alert feed showing too many alerts"

**Possible causes:**
1. Stock levels too low across the board (systemic issue)
2. Priority thresholds too sensitive
3. Many vendors consistently late

**Fix:** Adjust stock levels, tune alert thresholds in settings, or review vendor performance

### "Trust score not improving"

**Possible causes:**
1. Humans editing most AI-generated POs (touchless rate low)
2. Still getting stockouts (prevention rate low)
3. ETAs consistently off (accuracy low)

**Fix:** Review what humans are changing, adjust AI logic to match preferences, review Vendor Watchdog effective lead times

### "AI costs higher than expected"

**Possible causes:**
1. Too many consolidation analyses running
2. Natural language queries using expensive model
3. Email parsing on high-volume inbox

**Fix:** Reduce analysis frequency, use cheaper model (Haiku), filter emails to reduce parsing volume

---

## FAQ

**Q: Can I turn off specific agents?**
A: Yes. Each agent can be disabled independently in Settings → AI Agents.

**Q: Will agents make purchases without my approval?**
A: Only at Level 3 autonomy, and only for vendors you explicitly promote. Default is Level 2 (AI drafts, you approve).

**Q: What happens if an agent makes a mistake?**
A: All agent actions are logged. You can review, edit, or reject any AI-generated content. Mistakes automatically lower trust score.

**Q: Can I see what the AI is "thinking"?**
A: Yes. Every AI-generated PO includes `ai_reasoning` field explaining why it was created. Every alert includes impact calculation.

**Q: How do I know if agents are working?**
A: Check Trust Score Dashboard daily. Rising scores = agents learning and improving.

**Q: What if I want to go back to manual mode?**
A: Go to Settings → AI Agents → Disable All. System reverts to manual operation instantly.

---

## Getting Help

**Documentation:**
- System Overview: `AGENT_COMMAND_CENTER.md`
- Technical Architecture: `AGENTIC_ARCHITECTURE.md`
- This Manual: `AGENT_MANUAL.md`

**Support:**
- Check logs: `ai_job_logs`, `agent_performance_log`
- Review costs: `ai_purchasing_costs` table
- Contact: Your system administrator

---

**Last Updated:** December 10, 2025
**Version:** 2.0

*Your AI agents are learning. Trust the process. 🤖*
