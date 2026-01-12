# MuRP KPI Implementation TODO

> Complete roadmap for implementing world-class procurement and inventory KPIs
> 
> Reference: [KPI_METRICS_REFERENCE.md](./KPI_METRICS_REFERENCE.md)

---

## Current State Assessment

### ✅ Already Implemented
- Basic CLTR calculation
- Runway days / days until stockout
- ABC classification (partial)
- Demand mean / std dev / CV
- Basic trend metrics (growth rate, direction)
- Seasonal pattern detection (basic)
- Vendor lead time tracking (planned vs actual)
- Basic anomaly detection
- Reorder point calculations
- Safety stock calculations
- Notification system (email, Slack, in-app)

### 🟡 Partially Implemented
- Vendor performance (OTIF needs receipt tracking)
- Forecast accuracy (structure exists, needs validation job)
- Agent activity logging (basic alerts exist)

### ❌ Not Yet Implemented
- Full ABC/XYZ combined matrix
- Financial metrics (turns, GMROI, carrying cost)
- Service level / fill rate tracking
- Working capital metrics
- Strategic procurement metrics
- Risk/compliance scoring
- Complete vendor scorecard

---

## Phase 1: Database Schema Extensions

**Priority: HIGH | Effort: 2-3 days**

### Migration: `090_kpi_foundation.sql`

```sql
-- KPI Summary snapshots (daily)
CREATE TABLE kpi_daily_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL UNIQUE,
  
  -- Coverage metrics
  items_critical_cltr int DEFAULT 0,
  items_at_risk_cltr int DEFAULT 0,
  avg_cltr numeric(6,2),
  
  -- Variability metrics
  items_high_variability int DEFAULT 0,
  items_medium_variability int DEFAULT 0,
  avg_cv numeric(6,3),
  
  -- Past due metrics
  total_past_due_lines int DEFAULT 0,
  past_due_value numeric(12,2) DEFAULT 0,
  avg_lead_time_bias numeric(6,2),
  
  -- Inventory health
  total_excess_value numeric(12,2) DEFAULT 0,
  safety_stock_shortfall_items int DEFAULT 0,
  avg_safety_stock_attainment numeric(5,2),
  
  -- Classification distribution
  abc_distribution jsonb DEFAULT '{"A":0,"B":0,"C":0}',
  xyz_distribution jsonb DEFAULT '{"X":0,"Y":0,"Z":0}',
  
  -- Financial
  total_inventory_value numeric(14,2),
  dead_stock_value numeric(12,2) DEFAULT 0,
  slow_moving_value numeric(12,2) DEFAULT 0,
  
  created_at timestamptz DEFAULT now()
);

-- Per-item KPI calculations
CREATE TABLE item_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  calculated_at timestamptz DEFAULT now(),
  
  -- Coverage
  cltr numeric(6,2),
  cltr_status text,
  runway_days numeric(8,2),
  projected_stockout_date date,
  days_until_stockout int,
  effective_coverage_days numeric(8,2),
  
  -- Demand
  cv numeric(6,3),
  demand_mean numeric(10,4),
  demand_std_dev numeric(10,4),
  demand_trend text,
  velocity_tier text,
  
  -- Lead time
  lead_time_planned int,
  lead_time_actual numeric(6,2),
  lead_time_bias numeric(6,2),
  lead_time_std_dev numeric(6,2),
  
  -- Safety stock
  safety_stock_target numeric(10,2),
  safety_stock_current numeric(10,2),
  safety_stock_attainment numeric(5,2),
  reorder_point numeric(10,2),
  
  -- Classification
  abc_class char(1),
  xyz_class char(1),
  abc_xyz_combined char(2),
  
  -- Financial
  unit_cost numeric(10,4),
  inventory_value numeric(12,2),
  excess_inventory_qty numeric(10,2),
  excess_inventory_value numeric(12,2),
  
  UNIQUE(sku, calculated_at::date)
);

-- Vendor scorecard
CREATE TABLE vendor_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendors(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  
  -- Delivery performance
  total_orders int DEFAULT 0,
  total_lines int DEFAULT 0,
  on_time_orders int DEFAULT 0,
  on_time_rate numeric(5,2),
  in_full_orders int DEFAULT 0,
  in_full_rate numeric(5,2),
  otif_orders int DEFAULT 0,
  otif_rate numeric(5,2),
  
  -- Lead time
  avg_lead_time_planned numeric(6,2),
  avg_lead_time_actual numeric(6,2),
  lead_time_bias numeric(6,2),
  lead_time_std_dev numeric(6,2),
  lead_time_consistency numeric(5,2),
  
  -- Quality
  total_received_qty numeric(12,2),
  rejected_qty numeric(12,2),
  quality_reject_rate numeric(5,3),
  return_qty numeric(12,2),
  return_rate numeric(5,3),
  
  -- Commercial
  total_spend numeric(14,2),
  price_variance numeric(12,2),
  price_variance_pct numeric(5,2),
  dispute_count int DEFAULT 0,
  dispute_rate numeric(5,3),
  
  -- Response
  avg_quote_response_days numeric(4,2),
  avg_issue_resolution_days numeric(4,2),
  responsiveness_score numeric(5,2),
  
  -- Risk
  single_source_sku_count int DEFAULT 0,
  spend_concentration numeric(5,2),
  
  -- Composite
  overall_score numeric(5,2),
  
  created_at timestamptz DEFAULT now(),
  UNIQUE(vendor_id, period_start, period_end)
);

-- Service level tracking
CREATE TABLE service_level_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  channel text,
  
  orders_received int DEFAULT 0,
  orders_filled int DEFAULT 0,
  orders_partial int DEFAULT 0,
  orders_unfilled int DEFAULT 0,
  
  lines_ordered int DEFAULT 0,
  lines_shipped int DEFAULT 0,
  
  service_level numeric(5,2),
  fill_rate numeric(5,2),
  perfect_order_rate numeric(5,2),
  
  backorder_lines int DEFAULT 0,
  backorder_value numeric(12,2),
  
  created_at timestamptz DEFAULT now(),
  UNIQUE(date, channel)
);

-- Financial metrics
CREATE TABLE inventory_financial_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  
  -- Valuation
  opening_inventory_value numeric(14,2),
  closing_inventory_value numeric(14,2),
  avg_inventory_value numeric(14,2),
  
  -- COGS / Turnover
  cogs numeric(14,2),
  inventory_turns numeric(6,2),
  days_inventory_outstanding numeric(6,2),
  
  -- Profitability
  gross_margin numeric(14,2),
  gmroi numeric(6,2),
  
  -- Carrying cost
  carrying_cost_rate numeric(5,3) DEFAULT 0.25,
  carrying_cost numeric(12,2),
  
  -- Working capital
  open_po_liability numeric(14,2),
  
  -- Health indicators
  dead_stock_value numeric(12,2),
  slow_moving_value numeric(12,2),
  excess_value numeric(12,2),
  
  created_at timestamptz DEFAULT now(),
  UNIQUE(period_type, period_start)
);

-- Order efficiency metrics
CREATE TABLE order_efficiency_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  
  -- Volume
  pos_created int DEFAULT 0,
  po_lines_created int DEFAULT 0,
  avg_lines_per_po numeric(4,2),
  avg_po_value numeric(10,2),
  
  -- Automation
  auto_created_pos int DEFAULT 0,
  auto_replenishment_rate numeric(5,2),
  exception_count int DEFAULT 0,
  exception_rate numeric(5,2),
  
  -- Expedites
  expedite_count int DEFAULT 0,
  expedite_rate numeric(5,2),
  expedite_cost numeric(10,2),
  
  -- Changes
  change_order_count int DEFAULT 0,
  cancellation_count int DEFAULT 0,
  
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_item_kpis_sku ON item_kpis(sku);
CREATE INDEX idx_item_kpis_date ON item_kpis(calculated_at);
CREATE INDEX idx_item_kpis_cltr_status ON item_kpis(cltr_status);
CREATE INDEX idx_vendor_scorecards_vendor ON vendor_scorecards(vendor_id);
CREATE INDEX idx_kpi_snapshots_date ON kpi_daily_snapshots(snapshot_date);
```

### Phase 1 Tasks
- [ ] Create migration file `090_kpi_foundation.sql`
- [ ] Add RLS policies for all new tables
- [ ] Create helper functions for common calculations
- [ ] Test migration in dev environment
- [ ] Document rollback procedure

---

## Phase 2: Core KPI Service

**Priority: HIGH | Effort: 3-4 days**

### File: `services/kpiService.ts`

```typescript
export interface KPISummary {
  // Coverage
  items_critical_cltr: number;
  items_at_risk_cltr: number;
  avg_cltr: number;
  
  // Variability
  items_high_variability: number;
  items_medium_variability: number;
  avg_cv: number;
  
  // Past due
  total_past_due_lines: number;
  past_due_value: number;
  avg_lead_time_bias: number;
  
  // Inventory health
  total_excess_value: number;
  safety_stock_shortfall_items: number;
  avg_safety_stock_attainment: number;
  
  // Classification
  abc_distribution: { A: number; B: number; C: number };
  xyz_distribution: { X: number; Y: number; Z: number };
}

export interface ItemKPI {
  sku: string;
  name?: string;
  vendor_name?: string;
  
  // Coverage
  cltr: number;
  cltr_status: 'CRITICAL' | 'AT_RISK' | 'ADEQUATE' | 'HEALTHY';
  runway_days: number;
  projected_stockout_date: string | null;
  days_until_stockout: number | null;
  
  // Demand
  cv: number;
  demand_mean: number;
  demand_std_dev: number;
  demand_trend: 'INCREASING' | 'STABLE' | 'DECREASING';
  velocity_tier: 'FAST' | 'MEDIUM' | 'SLOW' | 'DEAD';
  
  // Lead time
  lead_time_planned: number;
  lead_time_actual: number;
  lead_time_bias: number;
  
  // Safety stock
  safety_stock_target: number;
  safety_stock_attainment: number;
  
  // Classification
  abc_class: 'A' | 'B' | 'C';
  xyz_class: 'X' | 'Y' | 'Z';
  abc_xyz_combined: string;
  
  // Financial
  excess_inventory_value: number;
}

// Core functions
export async function getKPISummary(): Promise<KPISummary>;
export async function getItemKPIs(filters?: KPIFilters): Promise<ItemKPI[]>;
export async function calculateItemKPI(sku: string): Promise<ItemKPI>;
export async function calculateAllItemKPIs(): Promise<void>;
export async function snapshotDailyKPIs(): Promise<void>;
```

### Phase 2 Tasks
- [ ] Create `services/kpiService.ts`
- [ ] Implement `getKPISummary()`
- [ ] Implement `getItemKPIs()` with filtering/sorting
- [ ] Implement `calculateItemKPI()`
- [ ] Implement `calculateAllItemKPIs()`
- [ ] Implement `snapshotDailyKPIs()`
- [ ] Add caching layer
- [ ] Write unit tests

---

## Phase 3: ABC/XYZ Classification Engine

**Priority: HIGH | Effort: 2 days**

### File: `services/classificationService.ts`

```typescript
export interface ClassificationResult {
  sku: string;
  abc_class: 'A' | 'B' | 'C';
  xyz_class: 'X' | 'Y' | 'Z';
  combined: string;
  annual_spend: number;
  cv: number;
}

export interface ClassificationConfig {
  abc_thresholds: { a: number; b: number }; // cumulative % (default: 80, 95)
  xyz_thresholds: { x: number; y: number }; // CV values (default: 0.5, 1.0)
  lookback_days: number; // default: 365
}

export async function classifyAllItems(
  config?: Partial<ClassificationConfig>
): Promise<ClassificationResult[]>;

export async function getClassificationMatrix(): Promise<{
  matrix: Record<string, number>;
  items: Record<string, string[]>;
}>;

export function getReplenishmentStrategy(combined: string): {
  review_frequency: string;
  safety_stock_policy: string;
  automation_level: string;
  notes: string;
};
```

### Replenishment Strategy Matrix

| Combined | Review | Safety Stock | Automation | Notes |
|----------|--------|--------------|------------|-------|
| AX | Daily | Low (JIT) | Full | High value, predictable |
| AY | Daily | Medium | High | High value, some variability |
| AZ | Daily | High | Medium | High value, unpredictable—watch closely |
| BX | Weekly | Low | Full | Medium value, predictable |
| BY | Weekly | Medium | High | Standard items |
| BZ | Weekly | High | Medium | Consider consolidation |
| CX | Monthly | Minimal | Full | Low value, predictable |
| CY | Quarterly | Low | High | Review for elimination |
| CZ | Quarterly | Minimal | Low | Candidate for elimination |

### Phase 3 Tasks
- [ ] Create `services/classificationService.ts`
- [ ] Implement ABC classification (Pareto on spend)
- [ ] Implement XYZ classification (CV-based)
- [ ] Implement combined matrix generation
- [ ] Add strategy recommendations
- [ ] Create monthly reclassification job
- [ ] Write unit tests

---

## Phase 4: Vendor Scorecard System

**Priority: HIGH | Effort: 3-4 days**

### File: `services/vendorScorecardService.ts`

```typescript
export interface VendorScorecard {
  vendor_id: string;
  vendor_name: string;
  period: { start: string; end: string };
  
  // Delivery
  otif_rate: number;
  on_time_rate: number;
  in_full_rate: number;
  
  // Lead time
  lead_time_consistency: number;
  lead_time_bias: number;
  
  // Quality
  quality_reject_rate: number;
  return_rate: number;
  
  // Commercial
  price_variance_pct: number;
  dispute_rate: number;
  
  // Response
  responsiveness_score: number;
  
  // Risk
  single_source_exposure: number;
  spend_concentration: number;
  
  // Composite
  overall_score: number;
  trend: 'improving' | 'stable' | 'declining';
}

export async function calculateVendorScorecard(
  vendorId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<VendorScorecard>;

export async function calculateAllVendorScorecards(
  periodStart: Date,
  periodEnd: Date
): Promise<VendorScorecard[]>;

export async function getVendorScoreHistory(
  vendorId: string,
  periods: number
): Promise<VendorScorecard[]>;
```

### Composite Score Formula

```typescript
overall_score = (
  otif_rate × 0.30 +
  quality_score × 0.25 +
  price_competitiveness × 0.20 +
  responsiveness × 0.15 +
  risk_score × 0.10
)
```

### Prerequisites
- [ ] Add `delivered_date` to `purchase_order_items`
- [ ] Add `delivered_on_time` boolean to `purchase_order_items`
- [ ] Add `actual_lead_time_days` to `purchase_order_items`
- [ ] Add `reject_qty` and `reject_reason` to receiving workflow
- [ ] Backfill historical data

### Phase 4 Tasks
- [ ] Create `services/vendorScorecardService.ts`
- [ ] Implement OTIF calculation
- [ ] Implement lead time consistency
- [ ] Implement quality metrics
- [ ] Implement price variance tracking
- [ ] Implement composite score
- [ ] Create monthly scorecard job
- [ ] Build comparison view
- [ ] Write unit tests

---

## Phase 5: Financial Metrics Engine

**Priority: MEDIUM | Effort: 3 days**

### File: `services/inventoryFinancialService.ts`

```typescript
export interface InventoryFinancials {
  // Valuation
  total_inventory_value: number;
  avg_inventory_value: number;
  
  // Turnover
  inventory_turns: number;
  days_inventory_outstanding: number;
  
  // Profitability
  gmroi: number;
  
  // Carrying cost
  carrying_cost_annual: number;
  carrying_cost_rate: number;
  
  // Health
  dead_stock_value: number;
  slow_moving_value: number;
  excess_value: number;
  
  // Working capital
  open_po_liability: number;
  cash_conversion_estimate: number;
}

export interface InventoryHealthItem {
  sku: string;
  name: string;
  category: 'dead' | 'slow_moving' | 'excess' | 'healthy';
  qty_on_hand: number;
  inventory_value: number;
  days_since_movement: number;
  recommended_action: string;
}

export async function calculateInventoryFinancials(
  periodStart: Date,
  periodEnd: Date
): Promise<InventoryFinancials>;

export async function getInventoryHealthReport(): Promise<InventoryHealthItem[]>;

export async function calculateStockoutCost(
  sku: string,
  stockoutDays: number
): Promise<{
  lost_margin: number;
  expedite_estimate: number;
  customer_impact: string;
  total_estimate: number;
}>;
```

### Key Formulas

```typescript
// Inventory Turns
turns = annual_cogs / avg_inventory_value

// Days Inventory Outstanding
dio = 365 / inventory_turns

// GMROI (Gross Margin Return on Inventory)
gmroi = gross_margin_dollars / avg_inventory_cost

// Carrying Cost (annual)
carrying_cost = avg_inventory_value × 0.25  // 25% default rate

// Dead Stock
dead_stock = items with zero movement in 180+ days

// Slow Moving
slow_moving = items below velocity threshold (not dead)

// Excess (by ABC class)
excess_runway = { A: 45, B: 60, C: 90 }  // days
excess_value = stock_value above runway threshold
```

### Prerequisites
- [ ] Ensure `unit_cost` populated on inventory items
- [ ] Add `gross_margin` calculation
- [ ] Define COGS source
- [ ] Set carrying cost rate in app_settings

### Phase 5 Tasks
- [ ] Create `services/inventoryFinancialService.ts`
- [ ] Implement inventory valuation
- [ ] Implement turns calculation
- [ ] Implement GMROI
- [ ] Implement dead/slow identification
- [ ] Implement excess calculation by ABC class
- [ ] Implement stockout cost estimator
- [ ] Create monthly financial snapshot job
- [ ] Write unit tests

---

## Phase 6: Service Level Tracking

**Priority: MEDIUM | Effort: 2-3 days**

### File: `services/serviceLevelService.ts`

```typescript
export interface ServiceLevelMetrics {
  period: { start: string; end: string };
  channel?: string;
  
  service_level: number;      // % orders filled from stock
  fill_rate: number;          // % lines shipped complete
  perfect_order_rate: number; // on-time ∩ in-full ∩ no-errors
  
  backorder_lines: number;
  backorder_value: number;
  avg_backorder_age: number;
  
  availability_rate: number;  // % SKUs in stock
}

export async function calculateServiceLevel(
  periodStart: Date,
  periodEnd: Date,
  channel?: string
): Promise<ServiceLevelMetrics>;

export async function getBackorderReport(): Promise<{
  sku: string;
  name: string;
  backorder_qty: number;
  backorder_value: number;
  days_on_backorder: number;
  expected_resolution: string | null;
}[]>;
```

### Key Formulas

```typescript
service_level = orders_filled / orders_received × 100
fill_rate = lines_shipped / lines_ordered × 100
perfect_order_rate = perfect_orders / total_orders × 100
availability_rate = skus_in_stock / total_active_skus × 100
```

### Prerequisites
- [ ] Integrate with Shopify/order source
- [ ] Define "order filled" criteria
- [ ] Track partial shipments
- [ ] Define backorder workflow

### Phase 6 Tasks
- [ ] Create `services/serviceLevelService.ts`
- [ ] Implement fulfillment tracking hook
- [ ] Implement service level calculation
- [ ] Implement fill rate calculation
- [ ] Implement backorder aging
- [ ] Create daily snapshot job
- [ ] Build dashboard component
- [ ] Write unit tests

---

## Phase 7: Order Efficiency Metrics

**Priority: MEDIUM | Effort: 2 days**

### File: `services/orderEfficiencyService.ts`

```typescript
export interface OrderEfficiencyMetrics {
  period: { start: string; end: string };
  
  // Volume
  pos_created: number;
  po_lines_created: number;
  avg_lines_per_po: number;
  avg_po_value: number;
  
  // Automation
  auto_replenishment_rate: number;
  exception_rate: number;
  
  // Expedites
  expedite_rate: number;
  expedite_cost: number;
  
  // Changes
  change_order_rate: number;
  cancellation_rate: number;
  
  // Cycle times
  avg_requisition_to_po: number;
  avg_po_to_receipt: number;
}

export async function calculateOrderEfficiency(
  periodStart: Date,
  periodEnd: Date
): Promise<OrderEfficiencyMetrics>;

export async function getExpediteReport(): Promise<{
  po_number: string;
  vendor: string;
  expedite_reason: string;
  expedite_cost: number;
  date: string;
}[]>;
```

### Key Formulas

```typescript
auto_replenishment_rate = auto_pos / total_pos × 100
exception_rate = exceptions / total_pos × 100
expedite_rate = expedited_orders / total_orders × 100
avg_lines_per_po = total_lines / total_pos
```

### Prerequisites
- [ ] Track PO creation source (auto vs manual)
- [ ] Add expedite flag and cost to POs
- [ ] Track PO modifications

### Phase 7 Tasks
- [ ] Create `services/orderEfficiencyService.ts`
- [ ] Implement consolidation metrics
- [ ] Implement automation rate tracking
- [ ] Implement expedite tracking
- [ ] Implement cycle time calculations
- [ ] Create daily snapshot job
- [ ] Write unit tests

---

## Phase 8: Purchasing Advice Engine

**Priority: HIGH | Effort: 2-3 days**

### File: `services/purchasingAdviceService.ts`

```typescript
export interface PurchasingAdvice {
  sku: string;
  name: string;
  vendor_name: string;
  vendor_id: string;
  
  // Current state
  current_stock: number;
  on_order: number;
  linked_po?: { number: string; expected_date: string };
  
  // Timing
  days_remaining: number;
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  order_by_date: string;
  
  // Recommendation
  recommended_qty: number;
  order_cost_estimate: number;
  
  // Context
  item_type: 'manufactured' | 'purchased';
  abc_class: string;
  reasoning: string;
}

export async function getRigorousPurchasingAdvice(
  filters?: {
    urgency?: string[];
    vendor_id?: string;
    abc_class?: string[];
  }
): Promise<PurchasingAdvice[]>;

export async function getConsolidationOpportunities(): Promise<{
  vendor_id: string;
  vendor_name: string;
  current_order_value: number;
  free_shipping_threshold: number;
  gap_to_threshold: number;
  suggested_additions: PurchasingAdvice[];
  potential_savings: number;
}[]>;
```

### Urgency Classification

| Urgency | CLTR | Days Remaining | Action |
|---------|------|----------------|--------|
| CRITICAL | < 0.5 | < lead time | Order immediately |
| HIGH | 0.5-1.0 | < 2× lead time | Order this week |
| MEDIUM | 1.0-2.0 | 2-4× lead time | Schedule order |
| LOW | > 2.0 | > 4× lead time | Monitor |

### Phase 8 Tasks
- [ ] Create `services/purchasingAdviceService.ts`
- [ ] Implement advice generation with full context
- [ ] Implement urgency scoring
- [ ] Integrate with `suggested_orders` table
- [ ] Implement consolidation detection
- [ ] Add MOQ/EOQ considerations
- [ ] Write unit tests

---

## Phase 9: Agent Integration

**Priority: HIGH | Effort: 2 days**

### File: `services/kpiAgentService.ts`

```typescript
export interface AgentAlert {
  agent_identifier: string;
  activity_type: 'decision' | 'action' | 'completion' | 'alert';
  title: string;
  severity: 'critical' | 'warning' | 'info';
  context: Record<string, any>;
  requires_human_review: boolean;
  suggested_action?: string;
}

export const KPI_ALERT_THRESHOLDS = {
  cltr_critical: 0.5,
  cltr_at_risk: 1.0,
  cv_high: 1.0,
  otif_warning: 0.90,
  safety_stock_warning: 0.80,
  excess_value_warning: 10000,
};

export async function runKPIAlertScan(): Promise<AgentAlert[]>;
export async function logAgentActivity(alert: AgentAlert): Promise<void>;
```

### Agent Tools to Add

| Tool | Description |
|------|-------------|
| `get_kpi_summary` | Retrieve current KPI dashboard data |
| `get_items_at_risk` | List items with CLTR < 1.0 |
| `get_vendor_performance` | Vendor scorecard for given vendor |
| `get_purchasing_advice` | Prioritized reorder recommendations |
| `get_consolidation_opportunities` | Shipping savings opportunities |

### Phase 9 Tasks
- [ ] Create `services/kpiAgentService.ts`
- [ ] Implement threshold-based alert generation
- [ ] Integrate with `agent_activity_log` table
- [ ] Create agent tools for KPI queries
- [ ] Add KPI context to stockout-prevention agent
- [ ] Add KPI context to vendor-watchdog agent
- [ ] Write unit tests

---

## Phase 10: Dashboard Components

**Priority: MEDIUM | Effort: 4-5 days**

### Components to Build

| Component | Description |
|-----------|-------------|
| `KPISummaryCards.tsx` | 8 headline KPI cards |
| `CLTRDistribution.tsx` | CLTR histogram/distribution chart |
| `ABCXYZMatrix.tsx` | Interactive 9-cell matrix |
| `VendorScorecard.tsx` | Radar chart + metrics for single vendor |
| `VendorComparison.tsx` | Side-by-side vendor comparison |
| `InventoryHealthChart.tsx` | Dead/slow/excess donut chart |
| `ServiceLevelTrend.tsx` | Service level line chart over time |
| `TurnsTrendChart.tsx` | Inventory turns monthly trend |
| `PurchasingAdviceTable.tsx` | Enhanced prioritized reorder list |
| `StockoutRiskTimeline.tsx` | Calendar/timeline of projected stockouts |

### Phase 10 Tasks
- [ ] Create `KPISummaryCards`
- [ ] Create `CLTRDistribution`
- [ ] Create `ABCXYZMatrix`
- [ ] Create `VendorScorecard`
- [ ] Create `VendorComparison`
- [ ] Create `InventoryHealthChart`
- [ ] Create `ServiceLevelTrend`
- [ ] Create `TurnsTrendChart`
- [ ] Create `PurchasingAdviceTable`
- [ ] Create `StockoutRiskTimeline`
- [ ] Add drill-down capabilities
- [ ] Ensure mobile responsiveness

---

## Phase 11: Scheduled Jobs

**Priority: HIGH | Effort: 2 days**

### Jobs to Create/Update

| Job Name | Schedule | Function |
|----------|----------|----------|
| `nightly-kpi-calculation` | 2:00 AM | Calculate all item KPIs |
| `nightly-kpi-snapshot` | 3:00 AM | Snapshot daily summary |
| `weekly-classification` | Sunday 4:00 AM | Recalculate ABC/XYZ |
| `monthly-vendor-scorecard` | 1st of month 5:00 AM | Generate vendor scorecards |
| `monthly-financial-snapshot` | 1st of month 6:00 AM | Financial metrics snapshot |
| `hourly-alert-scan` | Every hour | Check KPI thresholds |

### Phase 11 Tasks
- [ ] Create/update Edge Functions for each job
- [ ] Set up cron schedules in Supabase
- [ ] Add job logging and monitoring
- [ ] Implement failure notifications
- [ ] Add retry logic
- [ ] Document job dependencies

---

## Phase 12: API Endpoints

**Priority: MEDIUM | Effort: 2 days**

### Endpoints to Create

```
GET  /api/kpi/summary              # KPI summary
GET  /api/kpi/items                # Item KPIs with filters
GET  /api/kpi/items/:sku           # Single item KPI
GET  /api/kpi/classification       # ABC/XYZ matrix
GET  /api/kpi/vendors              # All vendor scorecards
GET  /api/kpi/vendors/:id          # Single vendor scorecard
GET  /api/kpi/financial            # Financial metrics
GET  /api/kpi/service-level        # Service level metrics
GET  /api/kpi/purchasing-advice    # Purchasing recommendations
GET  /api/kpi/history/:metric      # Historical trend data
POST /api/kpi/recalculate          # Force recalculation
```

### Phase 12 Tasks
- [ ] Create API routes
- [ ] Add authentication/authorization
- [ ] Implement caching
- [ ] Add rate limiting
- [ ] Document API with OpenAPI/Swagger
- [ ] Write integration tests

---

## Implementation Schedule

### Sprint 1 (Week 1-2): Foundation
| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | Database migrations | 2-3 days |
| 2 | Core KPI service | 3-4 days |
| 3 | ABC/XYZ classification | 2 days |
| 9 | Agent integration | 2 days |

### Sprint 2 (Week 3-4): Vendor & Financial
| Phase | Description | Effort |
|-------|-------------|--------|
| 4 | Vendor scorecard system | 3-4 days |
| 5 | Financial metrics engine | 3 days |
| 8 | Purchasing advice engine | 2-3 days |
| 11 | Scheduled jobs | 2 days |

### Sprint 3 (Week 5-6): Service & Efficiency
| Phase | Description | Effort |
|-------|-------------|--------|
| 6 | Service level tracking | 2-3 days |
| 7 | Order efficiency metrics | 2 days |
| 12 | API endpoints | 2 days |

### Sprint 4 (Week 7-8): UI & Polish
| Phase | Description | Effort |
|-------|-------------|--------|
| 10 | Dashboard components | 4-5 days |
| - | Integration testing | 2 days |
| - | Performance optimization | 1 day |
| - | Documentation | 1 day |

---

## Success Criteria

After implementation, MuRP should answer these questions:

| Question | Source |
|----------|--------|
| "What should I order today?" | Purchasing advice with full context |
| "Which vendors are underperforming?" | Vendor scorecards with trends |
| "How much cash is tied up in excess?" | Financial metrics |
| "What's my service level this month?" | Service level dashboard |
| "Which items need attention?" | CLTR-based risk prioritization |
| "How efficient is my purchasing?" | Automation rate, consolidation |
| "What's the ROI of my inventory?" | GMROI, turns, carrying costs |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01 | Initial implementation roadmap |
