# 🚀 MuRP 2.0: Autonomous Supply Chain Agent Blueprint

**Version:** 2.0.0 (Draft)
**Date:** December 9, 2025
**Objective:** Transform MuRP from a passive ERP into a proactive Supply Chain Agent.
**Core Philosophy:** **"Agent Suggests, Human Approves."** The system automates the analysis and drafting of work, but the human maintains final control over physical and financial commitments.

---

## 🏗️ Architecture: The "Agentic Layer"
We are introducing a new reasoning layer on top of your existing services. This layer uses LLM Function Calling (Tools) to decide *when* to use your existing code.

### 1. The Stack Upgrade
* **Current State:** User -> `aiGatewayService` -> LLM (Text Response)
* **New State:** User -> `agentService` -> LLM (Reasoning Loop) -> **Tools** -> UI Components

### 2. Service Map (Non-Destructive)
We will create *new* services to wrap your existing logic, leaving the core stable.

| Existing Service (Stable) | New Agent Wrapper (The "Brain") | Responsibility |
| :--- | :--- | :--- |
| `aiPurchasingService.ts` | `tools/inventoryAgent.ts` | Wraps `detectInventoryAnomalies` as a tool the AI can call. |
| `poTrackingService.ts` | `tools/lifecycleAgent.ts` | Wraps `updatePurchaseOrderTrackingStatus` to react to emails. |
| `complianceService.ts` | `tools/complianceAgent.ts` | Wraps `checkLabelCompliance` to proactively scan new BOMs. |
| `mcp-server/` | `tools/regulatoryAgent.ts` | Connects to MCP for live state regulation scraping. |

---

## 📦 Feature 1: Autonomous Inventory & "Ghost POs"
**Goal:** The user should never have to manually calculate "when to order."

### 1.1 The "Ghost PO" (Draft Layer)
Instead of modifying your live `purchase_orders` table, we introduce a `suggested_orders` table. This acts as a sandbox for the AI.

```sql
-- Migration: 080_suggested_orders.sql
CREATE TABLE suggested_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendors(id),
  confidence_score float, -- e.g., 0.95 if velocity is stable, 0.4 if volatile
  reasoning text, -- "Stock hits 0 in 12 days. Lead time is 10 days."
  line_items jsonb, -- Snapshot of what the AI wants to buy
  status text DEFAULT 'pending_review', -- 'approved', 'rejected', 'merged'
  created_at timestamptz DEFAULT now()
);
```

### 1.2 The "Procurement Pulse" Dashboard
**UI UX:** A timeline view, not a table.

* **Visual:** A horizontal calendar showing "Zero Dates" (when stock runs out).
* **Interaction:**
  1. User sees a "Suggested Order" card on the timeline (e.g., "Order for Uline needed by Friday").
  2. User clicks **"Review"**.
  3. **The "Smart Cart" Sidebar** opens:
     * Shows the AI's suggested items.
     * **Gamification:** "Add $200 more to hit Free Shipping (Savings: $45)."
     * **Consolidation:** "Warning: You are ordering Item A, but Item B (same vendor) expires in 2 weeks. Add it?"
  4. **Action:** User clicks **"Approve & Create PO"**. The system moves data from `suggested_orders` -> `purchase_orders`.

---

## 🏭 Feature 2: The "Build Simulator" (BOM Intelligence)
**Goal:** Prevent production delays by identifying constraints *before* a build starts.

### 2.1 The "What-If" Engine
We utilize your existing `buildabilityService` but expose it via a new UI.

**Workflow:**
1. User enters: *"I want to build 500 units of [Soil Mix A] on Jan 15th."*
2. **Agent Action:** The `analyze_build_feasibility` tool runs.
3. **UI Output:** An interactive "Traffic Light" Tree.
   * 🟢 **Green:** In Stock.
   * 🟡 **Yellow:** On Order (PO #123 arrives Jan 10th).
   * 🔴 **Red:** Constraint (Lead time > Days remaining).

### 2.2 One-Click Resolution
* **Human Control:** The user selects the "Red" items they want to solve.
* **Agent Action:** Clicking **"Resolve Constraints"** triggers the Agent to draft `suggested_orders` for those specific missing items, grouped by vendor.

---

## 📨 Feature 3: The Lifecycle Feed (PO Tracking)
**Goal:** Centralize "Where is my stuff?" into a single timeline.

### 3.1 Unified Timeline Architecture
We enhance `po_tracking_events` to accept *communication* events (email/slack) alongside *logistics* events (shipping).

**Data Sources:**
1. **Logistics:** Your existing `poTrackingService` (EasyPost/Carrier APIs).
2. **Communication:** `gmail-webhook` -> `agentService` -> `parseVendorEmail` tool.

### 3.2 The "Feed" UI
A vertical timeline on the PO Detail page:

* 🕒 **Oct 1, 9:00 AM:** PO Created & Sent to `vendor@example.com` (System).
* 💬 **Oct 1, 2:00 PM:** Vendor Replied: *"Received, will ship Tuesday."* (AI Extracted).
  * *Human Check:* AI asks "Mark status as Confirmed?" -> User clicks ✅.
* 🚚 **Oct 3, 5:00 PM:** Tracking: *In Transit (UPS)*.
* 📄 **Oct 5, 10:00 AM:** Invoice Received. Matches PO Total. (OCR Match).
* 📦 **Oct 6, 11:00 AM:** Received in Warehouse.

---

## ⚖️ Feature 4: The Compliance Atlas
**Goal:** Visual, state-by-state compliance management that scales to any product type.

### 4.1 Flexible Taxonomy
To handle "Agricultural Amendments" vs "Food" vs "Cosmetics", we add context to the regulations.

```sql
-- Migration: 081_regulatory_context.sql
ALTER TABLE state_regulations
ADD COLUMN jurisdiction_type text; -- 'agriculture', 'food_safety', 'packaging'

ALTER TABLE boms
ADD COLUMN regulatory_category text; -- 'soil_amendment', 'dietary_supplement'
```

### 4.2 The "Compliance Guardian"
A background job on the MCP Server (`monitor_regulation_changes`).

* **Automation:** Scrapes state .gov sites weekly.
* **Diffing:** Compares new text vs. stored text.
* **Alert:** If changed, creates a "Compliance Review Task" for the Compliance Officer.
* **UI:** A US Map where states turn "Yellow" when a regulation changes, prompting a human review.

---

## 🗓️ Implementation Roadmap

### Phase 1: The Brain Transplant (Week 1) ✅ COMPLETED
* [x] **Backend:** Create `services/agentService.ts` using Vercel AI SDK `streamText` + `tools`.
* [x] **Integration:** Map `detectInventoryAnomalies` and `checkLabelCompliance` to Agent Tools.
* [x] **Endpoint:** Create `/api/agent` route to handle frontend requests.
* [x] **UI Components:** Create ComplianceRiskCard, BuildShortageTable, ConsolidationOpportunityCard

### Phase 2: Inventory Autonomy (Week 2) 🚧 IN PROGRESS
* [ ] **DB:** Run Migration `080_suggested_orders.sql`.
* [ ] **Cron:** Update `nightly-reorder-scan` to populate `suggested_orders` instead of just logs.
* [ ] **UI:** Build the `<ProcurementPulse />` timeline component.

### Phase 3: The Build Simulator (Week 3)
* [ ] **Tool:** Implement `analyze_build_feasibility` tool (logic exists, needs wrapper). ✅ Already in agent.ts
* [ ] **UI:** Build `<BuildSimulator />` page with the "Traffic Light" tree view.
* [ ] **Action:** Implement "Resolve Constraints" button to generate drafts.

### Phase 4: Lifecycle & Polish (Week 4)
* [ ] **Webhook:** Connect `gmail-webhook` to the new `agentService`.
* [ ] **UI:** Create `<OrderTimeline />` component for PO details.
* [ ] **Map:** Implement the `<ComplianceMap />` visualization using `react-usa-map` or similar.

---

## 🛡️ Summary: Why This Wins

1. **Zero Risk:** We strictly use "Drafts" and "Suggestions." The AI never spends money without a click.
2. **High Visibility:** The "Timeline" and "Map" views make complex data instantly understandable.
3. **Scalable:** The "Tools" architecture means adding a new capability (e.g., "Check Weather for Shipping") is just adding one function, not rewriting the app.
