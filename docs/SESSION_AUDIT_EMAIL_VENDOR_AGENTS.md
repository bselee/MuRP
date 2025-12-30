# Email-to-Vendor System Audit
## Session: December 30, 2025

---

## Executive Summary

This audit reviews the complete email-to-vendor data flow, agent functionality, and user visibility in MuRP. The system is **architecturally sound** but has **visibility gaps** that reduce human oversight of automated processes.

---

## 1. What We Built Today (Migrations 141-143)

### Migration 141: Vendor Follow-Up Agent
- Agent definition in `agent_definitions` table
- Scheduled trigger (every 2 hours during business hours)
- SQL execution function `execute_vendor_followup_agent()`
- Capabilities: check_pending_followups, classify_vendor_responses, send_followup_email

### Migration 142: Email Response Integration with Vendor Confidence
- Added `followup_response_score` to vendor_confidence_profiles
- Created `record_vendor_email_response()` function
- Trigger on email_threads to auto-record vendor response events
- Updated `calculate_vendor_confidence_factors()` with 6th factor
- New weights: 20% response latency, 10% threading, 15% completeness, 25% invoice accuracy, 15% lead time, **15% followup response**

### Migration 143: Unified Vendor Scoring
- `calculate_vendor_email_metrics()` - Response time, problem rate
- `calculate_vendor_delivery_metrics()` - On-time delivery rate
- `vendor_ordering_guidance` view - 0-100 score with tier (preferred/standard/caution/avoid)
- `get_vendor_score_with_examples()` - **Simple 1-10 score** with:
  - Score breakdown (response_speed, delivery_reliability, low_followup_needed)
  - Real PO examples with actual lead times
  - Issues summary from email threads
  - Plain text recommendation

### UI Components Added
- **VendorResponseIndicator** - Color-coded badges (green=good, red=problem, amber=awaiting)
- **PendingFollowupsPanel** - Collapsible list of POs needing follow-up
- **Settings > Vendor Management** - Link to Vendors page with vendor count
- Updated POPipelineView with vendor response visibility

---

## 2. Complete Data Flow

```
USER CONNECTS GMAIL
     │
     ▼
┌─────────────────────────────────────┐
│ Settings > Email Monitoring         │
│ - Click "Connect Gmail"             │
│ - OAuth flow via google-auth fn     │
│ - Stores tokens in email_inbox_configs
└─────────────────────────────────────┘
     │
     ▼ (Every 5 minutes)
┌─────────────────────────────────────┐
│ email-inbox-poller Edge Function    │
│ - Fetches emails from PO label first│
│ - Extracts tracking via regex       │
│ - Correlates to PO (4 methods)      │
│ - Classifies vendor response type   │
└─────────────────────────────────────┘
     │
     ▼ (Automatic trigger)
┌─────────────────────────────────────┐
│ tr_classify_vendor_response TRIGGER │
│ - Analyzes email content            │
│ - Sets response_type (9 categories) │
│ - Flags if action required          │
│ - Sets action_due_by date           │
└─────────────────────────────────────┘
     │
     ▼ (Automatic trigger)
┌─────────────────────────────────────┐
│ tr_record_vendor_response_event     │
│ - Calculates response latency       │
│ - Records interaction event         │
│ - Triggers score recalculation      │
└─────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────┐
│ recalculate_vendor_confidence()     │
│ - Updates 6 factor scores           │
│ - Calculates weighted confidence    │
│ - Records in history table          │
│ - Updates vendor_confidence_profiles│
└─────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────┐
│ USER SEES:                          │
│ - VendorResponseIndicator on PO card│
│ - PendingFollowupsPanel (if any)    │
│ - Vendor score in Vendors page      │
└─────────────────────────────────────┘
```

---

## 3. Agent System Status

### Fully Functional Agents
| Agent | Executor | Service | Edge Function |
|-------|----------|---------|---------------|
| Stock Intelligence | ✓ | stockoutPreventionAgent.ts | - |
| Email Tracking | ✓ | emailProcessingService.ts | email-inbox-poller |
| Vendor Watchdog | ✓ | vendorWatchdogAgent.ts | - |
| PO Intelligence | ✓ | poIntelligenceAgent.ts | - |
| Inventory Guardian | ✓ | inventoryGuardianAgent.ts | - |
| Compliance Validator | ✓ | complianceValidationAgent.ts | - |

### Database-Only Agents (Need Wiring)
| Agent | DB Definition | Executor | Issue |
|-------|---------------|----------|-------|
| Vendor Follow-Up | ✓ | ⚠️ | Calls wrong edge function |
| Artwork Approval | ✓ | ✗ | Not imported into agentExecutor |
| Price Hunter | ✓ | ✗ | Not imported into agentExecutor |
| Trust Score | ✓ | ✗ | Not imported into agentExecutor |

### Critical Gap: Vendor Follow-Up Integration
The vendorFollowUpAgent.ts exists but calls `po-followup-runner` edge function which uses the **campaign-based system** (migrations 033, 043, 128), NOT the **email thread system** (migrations 138-140).

**Fix needed**: Either:
1. Create thread-specific edge function
2. Or integrate with campaign system

---

## 4. User Visibility Audit

### What Users CAN See

| Feature | Location | Visible To |
|---------|----------|-----------|
| Email connection status | Settings > Email Monitoring | All users |
| Sync timestamp + email count | EmailConnectionCard | All users |
| Vendor response status | PO cards (badges) | All users |
| Pending follow-ups | PendingFollowupsPanel | All users |
| Vendor scores | Vendors page | All users |
| Workflow execution | Admin > Workflows | Admin only |
| Agent definitions | Admin > Agent Command Center | Admin only |

### What Users CANNOT See (Hidden)

| Process | What Happens | User Visibility |
|---------|--------------|-----------------|
| pg_cron agent runs | Agents run 6AM-7AM daily | None |
| Email processing details | Which emails, what extracted | None (just count) |
| PO correlation logs | How emails matched to POs | None |
| Tracking extraction | Regex matching results | Only final result |
| Agent decisions | Why agent took action | None |
| Error logs | Sync failures, API errors | None |

---

## 5. Recommendations for Human Oversight

### Priority 1: Email Processing Activity Log
Create component showing:
- Recent emails processed with timestamps
- PO correlation method + confidence
- Tracking numbers extracted
- Classification results
- Errors/warnings

### Priority 2: Agent Execution Dashboard
Show to all users (not just Admin):
- When agents last ran
- What actions they took
- Pending actions awaiting approval
- Decision audit trail

### Priority 3: Workflow History
Add persistent log of:
- Past workflow executions
- Results and errors
- Actions auto-approved vs pending

### Priority 4: Sync Error Notifications
Surface errors to users:
- Gmail API failures
- Token expiration warnings
- Carrier API quota alerts

### Priority 5: Trust Score Transparency
Show users how scores evolve:
- What actions affect scores
- Current vs historical scores
- Score calculation breakdown

---

## 6. Test Results

| Test Suite | Status | Tests |
|------------|--------|-------|
| Schema Transformers | ✓ Pass | 2/2 |
| Inventory UI | ✓ Pass | 3/3 |
| Build | ✓ Pass | No type errors |

---

## 7. Files Modified Today

### Migrations
- `supabase/migrations/141_vendor_followup_agent.sql`
- `supabase/migrations/142_vendor_confidence_from_email_responses.sql`
- `supabase/migrations/143_unified_vendor_scoring.sql`

### Components
- `components/VendorResponseIndicator.tsx` (NEW)
- `components/PendingFollowupsPanel.tsx` (NEW)
- `components/POPipelineView.tsx` (MODIFIED - added vendor response display)
- `components/admin/AgentCommandCenter.tsx` (MODIFIED - icon mapping)
- `pages/Settings.tsx` (MODIFIED - added Vendor Management section)
- `components/Sidebar.tsx` (MODIFIED then reverted - Vendors not in sidebar per user request)

### Services
- `services/vendorConfidenceService.ts` (MODIFIED - added getVendorScoreWithExamples)

### Types
- `types.ts` (MODIFIED - added VendorScoreWithExamples, vendor response fields)

### Hooks
- `hooks/useSupabaseData.ts` (MODIFIED - fetch vendor response fields)

---

## 8. Architecture Summary

The email-to-vendor system is **well-architected** with:
- Clear separation: OAuth → Polling → Processing → Scoring
- Multiple correlation methods with confidence scoring
- Automatic trigger-based scoring (no manual intervention)
- Good UI visibility of RESULTS

But has **visibility gaps** for:
- Background processes (agents, email processing)
- Decision auditing (why agent did X)
- Error surfacing (what failed and why)

---

## 9. Next Steps

1. **Short term**: Add email processing activity log component
2. **Medium term**: Create agent execution dashboard for all users
3. **Long term**: Full audit trail with decision explanations

---

*Generated during session audit - December 30, 2025*
