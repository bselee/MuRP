# UI Refactor Roadmap

This roadmap outlines the plan to address specific user feedback regarding layout clutter ("ai business", "dropdowns") and visual styling ("pills around skus"), while also systematically applying the `UI_FLOW_ANALYSIS.md` findings.

## 🚨 Priority 0: Immediate User Feedback Fixes

### 1. Clean Up Inventory UI ("Pills around SKUs")
**Issue**: The SKU column in `Inventory.tsx` renders as a `<Button>`, giving it a "pill" look that clutters the dense table view.
**Fix**:
- [ ] **Remove Button Wrapper**: Change the SKU render function to use a simple clean link or text with a hover effect.
- [ ] **Styling**: `font-mono text-accent-400 hover:text-accent-300 hover:underline cursor-pointer`. No background, no border.

### 2. De-clutter Purchase Orders ("Mess with dropdowns & AI business")
**Issue**: `PurchaseOrders.tsx` is overloaded (2000+ lines) with "Command Center" widgets, "Autonomous Controls", and multiple filter dropdowns.
**Fix**:
- [ ] **Consolidate AI/Agent Features**: 
    - Move "Agent Command Center", "AutonomousControls", "TrustScoreDashboard", and "AlertFeedComponent" into a single **"Agent Dashboard" tab** or a dedicated modal. They should not block the main PO list view.
- [ ] **Simplify Header**:
    - The "Purchasing Command Center" stats cards (Manager Review, Ops Review, etc.) take up massive vertical space. Convert these to a **compact status bar** or simple metric chips.
- [ ] **Standardize Filters**:
    - Replace the ad-hoc button groups (All/Committed/Pending/Received) with the standard `FilterBar` or `StandardTabs` pattern (once created).

---

## 🏗️ Phase 1: Structural Standardization (Technical Debt)

### 3. Implement Core Layout Components
**Issue**: Every page reimplements headers and containers.
**Task**:
- [ ] **Create `PageHeader` Component**: standardizing title, description, actions, and breadcrumbs.
    - *Already exists but needs adoption by all pages.*
- [ ] **Create `StandardTable` Wrapper**: A higher-order component that enforces the `py-2/py-1` padding from `UI_STANDARDS.md` and standardizes sticky headers.

### 4. Refactor PurchaseOrders.tsx
**Issue**: The file is unmaintainable (~2000 lines).
**Task**:
- [ ] Extract **`PoListTable`** component.
- [ ] Extract **`PoStatsBar`** (the metrics review section).
- [ ] Extract **`FinalePoList`** (remote inventory logic).
- [ ] Ensure all extracted components use `components/ui` primitives (Button, Card, Badge).

---

## 💎 Phase 2: Visual Consistency

### 5. Standardize Badges & Statuses
**Issue**: "pills" inconsistency across pages.
**Task**:
- [ ] **Enforce `StatusBadge.tsx`**: Replace all custom `<span>...</span>` badges with the shared component.
- [ ] **Unified Color Scheme**: Ensure "Draft" is always Gray, "Pending" is Amber, "Approved" is Blue, "Ordered" is Purple, "Received" is Green.

### 6. Modal Consistency
**Issue**: Mixed usage of `Dialog` and `Modal`.
**Task**:
- [ ] Standardize on one Modal pattern (likely separate `components/ui/dialog` for simple alerts and a `StandardModal` for forms).
- [ ] Fix sizes: Standardize widths (`max-w-md`, `max-w-2xl`, `max-w-4xl`).

---

## 📅 Execution Plan

1.  **Step 1 (Today)**: 
    *   Fix Inventory SKU pills.
    *   Hide/Collapse "AI Business" on PO page to clean up the view.
    *   Refactor specific PO dropdowns to be cleaner.
2.  **Step 2 (Tomorrow)**: 
    *   Extract components from `PurchaseOrders.tsx`.
    *   Apply `PageHeader` globally.
3.  **Step 3 (Next)**: 
    *   Full Table standardization.
