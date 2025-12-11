# Dashboard Analysis & Scrutiny

**Date:** December 11, 2025
**Analyst:** Antigravity Agent

## 🧐 Utility Assessment based on Prime Directive
**Prime Directive:** "Purchasing and never running out."

### ✅ What Works
1.  **Stockout Risk Identification:** The logic for calculating "Days Until Stockout" (in `StockIntelligence`) is sound. It uses real consumption rates (30-day avg) vs current stock.
2.  **Visual Alerts:** The red/orange/yellow coding for "Critical/High Risk" provides immediate visual cues.
3.  **Production Planning:** The `InventoryIntelligencePanel` is excellent for the *production* side of the house (building BOMs).

### ❌ Critical Gaps (The "Why it fails purchasing" list)
1.  **Reactive, Not Proactive:** The current dashboard flags items *after* they are low. It doesn't show "Runway vs Lead Time" clearly for *purchasing* decisions. If lead time is 60 days and runway is 45 days, you are **already late**. This distinction is missing.
2.  **Agent Invisibility:** The `vendorWatchdogAgent` has powerful logic (tracking variance, trust scores), but it is completely invisible on the dashboard. You have to "trust" it's running.
3.  **Disconnected Intelligence:** "Stock Intelligence" is buried in a secondary tab. A purchasing manager shouldn't have to click a tab to see that 5 critical items are about to stock out.
4.  **No "Action Center":** There is no single place to say "Here are the 5 things I must buy today".

## 🚀 Proposed "Command Center" Upgrade
To fulfill the directive, we are converting the Dashboard from a "Passive Report" to an "Active Command Center".

### New Features Implementing Now:
1.  **Agent Command Widget:** A prominent panel to visualize active agents (Vendor Watchdog, Inventory Guardian) and trigger them manually.
2.  **Unified Risk View:** Pulling "Critical Stockout Risks" out of the sub-tab and directly onto the main dashboard.
3.  **Watchdog Alerts:** Surfacing "Vendor Drift" alerts (e.g., "Vendor X promised 14d but takes 22d") directly to the user.

## 🛠 Refactoring Plan
1.  **Inject `AgentCommandWidget`:** Top of Dashboard.
2.  **Promote Risks:** Create a "Critical Purchasing Board" on the main tab.
3.  **Visualize Watchdog:** Connect the `vendorWatchdogAgent` outputs to the UI.
