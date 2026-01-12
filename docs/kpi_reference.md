# MuRP KPI & Metrics Reference

> Comprehensive metrics for world-class purchasing, inventory management, and MRP operations.

---

## Table of Contents

1. [Coverage & Stockout Risk](#1-coverage--stockout-risk)
2. [Demand & Forecasting](#2-demand--forecasting)
3. [Supplier Performance](#3-supplier-performance)
4. [Financial & Working Capital](#4-financial--working-capital)
5. [Order & Replenishment Efficiency](#5-order--replenishment-efficiency)
6. [Service Level & Availability](#6-service-level--availability)
7. [Production & MRP](#7-production--mrp)
8. [Risk & Compliance](#8-risk--compliance)
9. [Strategic Procurement](#9-strategic-procurement)
10. [Agent Activity & Anomalies](#10-agent-activity--anomalies)
11. [Implementation Priority](#11-implementation-priority)

---

## 1. Coverage & Stockout Risk

Primary metrics for predicting and preventing stockouts.

| Metric | Type | Description | Formula/Logic |
|--------|------|-------------|---------------|
| `cltr` | ratio | Coverage-to-Lead-Time Ratio | `runway_days / lead_time_planned` |
| `cltr_status` | enum | Risk classification | CRITICAL (<0.5), AT_RISK (0.5-1.0), ADEQUATE (1.0-2.0), HEALTHY (>2.0) |
| `runway_days` | days | Days of stock on hand | `qty_on_hand / daily_demand_mean` |
| `projected_stockout_date` | date | When stockout will occur | `today + runway_days` |
| `days_until_stockout` | days | Countdown to zero stock | `projected_stockout_date - today` |
| `reorder_point` | qty | Trigger level for replenishment | `(lead_time_days × daily_demand) + safety_stock` |
| `safety_stock_target` | qty | Buffer stock calculation | `z_score × demand_std_dev × √lead_time` |
| `safety_stock_attainment` | % | Current coverage vs target | `current_safety_stock / safety_stock_target × 100` |
| `effective_coverage` | days | Stock + on-order runway | `(qty_on_hand + qty_on_order) / daily_demand_mean` |

### Classification Systems

**ABC Classification** (by annual spend/volume)
- **A**: Top 80% of value (~20% of SKUs) — tight control, frequent review
- **B**: Next 15% of value (~30% of SKUs) — moderate control
- **C**: Bottom 5% of value (~50% of SKUs) — simplified control

**XYZ Classification** (by demand variability)
- **X**: CV < 0.5 — stable, predictable demand
- **Y**: CV 0.5-1.0 — moderate variability
- **Z**: CV > 1.0 — erratic, unpredictable demand

**Combined Matrix** (9 segments)
| | X (Stable) | Y (Variable) | Z (Erratic) |
|---|---|---|---|
| **A** | AX: Automate, JIT | AY: Safety stock focus | AZ: Strategic buffer, monitor closely |
| **B** | BX: Standard reorder | BY: Periodic review | BZ: Reduce or consolidate |
| **C** | CX: Min attention | CY: Quarterly review | CZ: Candidate for elimination |

---

## 2. Demand & Forecasting

Metrics for understanding and predicting consumption patterns.

| Metric | Type | Description | Formula/Logic |
|--------|------|-------------|---------------|
| `demand_mean` | qty/day | Average daily demand | Rolling 30/60/90-day average |
| `demand_std_dev` | qty | Demand variability | Standard deviation of daily demand |
| `cv` | ratio | Coefficient of Variation | `demand_std_dev / demand_mean` |
| `demand_trend` | slope | Acceleration/deceleration | Linear regression slope of demand |
| `demand_trend_direction` | enum | Simplified trend | INCREASING, STABLE, DECREASING |
| `seasonality_index` | ratio | Period adjustment factor | Month demand / avg month demand |
| `forecast_qty` | qty | Predicted future demand | Algorithm-dependent |
| `forecast_accuracy_mape` | % | Mean Absolute % Error | `avg(|actual - forecast| / actual) × 100` |
| `forecast_bias` | % | Systematic over/under | `avg((forecast - actual) / actual) × 100` |
| `forecast_vs_actual_variance` | qty | Absolute difference | `forecast - actual` |
| `velocity_tier` | enum | Movement classification | FAST (>10/day), MEDIUM (1-10/day), SLOW (<1/day), DEAD (0 in 90d) |

### Demand Signal Sources

| Source | Use Case | Priority |
|--------|----------|----------|
| `point_of_sale` | Retail/DTC, real-time signal | Highest for finished goods |
| `sales_orders` | B2B, committed demand | Primary for wholesale |
| `forecast` | Projected demand | Fill gaps, new products |
| `dependent_demand` | BOM-driven (MRP explosion) | Manufacturing components |
| `min_max` | Simple thresholds | Low-complexity items |

---

## 3. Supplier Performance

Vendor accountability and relationship health metrics.

### Core Performance

| Metric | Type | Description | Target |
|--------|------|-------------|--------|
| `otif_rate` | % | On-Time In-Full delivery | >95% |
| `on_time_rate` | % | Delivered by expected date | >95% |
| `in_full_rate` | % | Ordered qty received complete | >98% |
| `fill_rate` | % | Qty shipped / qty ordered | >98% |
| `quality_reject_rate` | % | Receipts with quality issues | <2% |
| `return_rate` | % | Items returned to vendor | <1% |

### Lead Time Metrics

| Metric | Type | Description | Formula/Logic |
|--------|------|-------------|---------------|
| `lead_time_planned` | days | Expected/quoted lead time | From vendor master |
| `lead_time_actual` | days | Average actual lead time | Rolling avg of PO cycle times |
| `lead_time_bias` | days | Systematic lateness | `lead_time_actual - lead_time_planned` |
| `lead_time_std_dev` | days | Lead time variability | Consistency measure |
| `lead_time_consistency` | % | Reliability score | `1 - (std_dev / mean) × 100` |

### Commercial Performance

| Metric | Type | Description | Formula/Logic |
|--------|------|-------------|---------------|
| `price_variance_ytd` | $ | Actual vs quoted pricing | `Σ(actual_price - quoted_price) × qty` |
| `price_variance_pct` | % | Relative price variance | `price_variance / quoted_spend × 100` |
| `responsiveness_score` | days | Avg response time | Quote turnaround, issue resolution |
| `dispute_rate` | % | Orders with disputes | Invoice, quality, or delivery disputes |

### Vendor Risk Profile

| Metric | Type | Description | Risk Factors |
|--------|------|-------------|--------------|
| `vendor_risk_score` | 1-100 | Composite risk rating | Weighted factors below |
| `financial_stability` | enum | Vendor financial health | Credit rating, payment history |
| `geographic_risk` | enum | Location-based risk | Political, disaster, logistics |
| `single_source_flag` | bool | Sole supplier for any SKU | Critical dependency |
| `spend_concentration` | % | % of category with vendor | >50% = elevated risk |
| `strategic_importance` | enum | Business criticality | CRITICAL, IMPORTANT, STANDARD |

### Vendor Scorecard (Composite)

```
vendor_score = (
  otif_rate × 0.30 +
  quality_score × 0.25 +
  price_competitiveness × 0.20 +
  responsiveness × 0.15 +
  risk_score × 0.10
)
```

---

## 4. Financial & Working Capital

Inventory investment and cash flow impact metrics.

### Inventory Valuation

| Metric | Type | Description | Formula/Logic |
|--------|------|-------------|---------------|
| `inventory_value_total` | $ | Total inventory at cost | `Σ(qty_on_hand × unit_cost)` |
| `inventory_value_by_status` | $ | Breakdown by status | On-hand, in-transit, committed, available |
| `average_inventory_value` | $ | Period average | `(opening + closing) / 2` or rolling avg |
| `inventory_at_retail` | $ | Potential revenue value | `Σ(qty_on_hand × sell_price)` |

### Turnover & Efficiency

| Metric | Type | Description | Formula/Logic | Target |
|--------|------|-------------|---------------|--------|
| `inventory_turns` | ratio | Annual turnover rate | `annual_cogs / avg_inventory_value` | 4-12× depending on industry |
| `days_inventory_outstanding` | days | Avg days to sell | `365 / inventory_turns` | <90 days |
| `gmroi` | ratio | Gross Margin ROI | `gross_margin / avg_inventory_cost` | >2.0 |
| `sell_through_rate` | % | Units sold / units received | Period-based | >80% |

### Working Capital Impact

| Metric | Type | Description | Formula/Logic |
|--------|------|-------------|---------------|
| `carrying_cost_rate` | % | Annual holding cost | Typically 20-30% of inventory value |
| `carrying_cost_annual` | $ | Dollar cost to hold | `avg_inventory_value × carrying_cost_rate` |
| `cash_conversion_cycle` | days | Cash tied up in operations | `DIO + DSO - DPO` |
| `open_po_liability` | $ | Committed but not received | `Σ(open_po_lines × unit_cost)` |

### Inventory Health

| Metric | Type | Description | Formula/Logic |
|--------|------|-------------|---------------|
| `excess_inventory_value` | $ | Above runway threshold | Stock beyond X-day supply (configurable by ABC) |
| `excess_runway_days` | config | Threshold by class | A: 45 days, B: 60 days, C: 90 days |
| `dead_stock_value` | $ | No movement 180+ days | Candidate for write-off |
| `slow_moving_value` | $ | Below velocity threshold | Review for promotion/liquidation |
| `obsolete_reserve` | $ | Accounting reserve | Provision for dead/slow |
| `inventory_accuracy` | % | System vs physical count | `1 - (|system - actual| / system)` |

### Cost Analysis

| Metric | Type | Description | Formula/Logic |
|--------|------|-------------|---------------|
| `purchase_price_variance` | $ | Standard vs actual cost | `(actual_price - standard_cost) × qty` |
| `total_cost_of_ownership` | $ | Full acquisition cost | Price + freight + duty + handling + quality |
| `landed_cost` | $ | Per-unit delivered cost | `(product + freight + duty + fees) / qty` |
| `stockout_cost_estimate` | $ | Impact of stockouts | Lost margin + expedite + customer impact |
| `expedite_cost_ytd` | $ | Rush order premiums | Premium freight + supplier surcharges |

---

## 5. Order & Replenishment Efficiency

Purchasing process performance metrics.

### Cycle Times

| Metric | Type | Description | Target |
|--------|------|-------------|--------|
| `requisition_to_po` | days | Internal processing time | <2 days |
| `po_to_acknowledgment` | days | Vendor confirmation | <1 day |
| `po_to_ship` | days | Vendor fulfillment | Per vendor SLA |
| `ship_to_receipt` | days | Transit time | Per lane |
| `receipt_to_putaway` | days | Warehouse processing | <1 day |
| `purchase_to_pay_cycle` | days | PO to invoice paid | <45 days |

### Order Patterns

| Metric | Type | Description | Formula/Logic |
|--------|------|-------------|---------------|
| `order_frequency_by_vendor` | orders/period | Consolidation efficiency | Lower = better (within reason) |
| `lines_per_po` | avg | Order consolidation | Higher = more efficient |
| `avg_po_value` | $ | Order size | Target: above vendor minimums |
| `orders_below_moq` | count | Sub-minimum orders | Should be zero |
| `moq_utilization` | % | Efficiency vs minimums | `order_qty / moq × 100` |
| `eoq_variance` | % | Actual vs economic order qty | Deviation from optimal |

### Exception Rates

| Metric | Type | Description | Target |
|--------|------|-------------|--------|
| `auto_replenishment_rate` | % | Orders without human touch | >80% |
| `exception_rate` | % | Requiring manual intervention | <20% |
| `expedite_rate` | % | Rush orders | <5% |
| `change_order_rate` | % | POs modified after issue | <10% |
| `cancellation_rate` | % | POs cancelled | <2% |

### Past Due Management

| Metric | Type | Description | Formula/Logic |
|--------|------|-------------|---------------|
| `past_due_lines` | count | Overdue PO lines | Expected date < today, not received |
| `past_due_value` | $ | Dollar exposure | `Σ(past_due_qty × unit_cost)` |
| `past_due_aging` | buckets | Age distribution | 1-7, 8-14, 15-30, 31-60, 60+ days |
| `avg_days_past_due` | days | Average lateness | Weighted by value |

---

## 6. Service Level & Availability

Customer-facing inventory performance.

| Metric | Type | Description | Formula/Logic | Target |
|--------|------|-------------|---------------|--------|
| `service_level_achieved` | % | Demand met from stock | `orders_filled / orders_received × 100` | >95% |
| `fill_rate` | % | Line-level fulfillment | `lines_shipped_complete / lines_ordered × 100` | >98% |
| `fill_rate_by_channel` | % | Channel breakdown | B2B, DTC, wholesale, marketplace | Varies |
| `perfect_order_rate` | % | On-time, in-full, no errors | Composite metric | >90% |
| `backorder_lines` | count | Open unfulfillable demand | Orders waiting for stock |
| `backorder_value` | $ | Revenue delayed | `Σ(backorder_qty × sell_price)` |
| `backorder_age` | days | Customer wait time | Avg days on backorder |
| `lost_sales_estimate` | $ | Demand that walked away | Cancelled orders, no-quotes |
| `substitution_rate` | % | Filled with alternate SKU | `substitutions / stockouts × 100` |
| `availability_rate` | % | SKUs in stock | `skus_available / total_active_skus × 100` |

---

## 7. Production & MRP

Manufacturing and dependent demand metrics.

### Component Availability

| Metric | Type | Description | Formula/Logic |
|--------|------|-------------|---------------|
| `component_availability` | % | Can start work order? | All BOM components in stock |
| `bom_completeness` | % | BOMs ready to build | `complete_boms / total_planned × 100` |
| `shortage_list` | report | Missing components | By work order, by date |
| `kitting_accuracy` | % | Correct components pulled | `correct_kits / total_kits × 100` |

### Production Planning

| Metric | Type | Description | Formula/Logic |
|--------|------|-------------|---------------|
| `dependent_demand_coverage` | % | Components for forecasted builds | MRP explosion coverage |
| `planned_vs_actual_yield` | % | Production efficiency | `actual_output / planned_output × 100` |
| `scrap_rate` | % | Material waste | `scrap_qty / input_qty × 100` |
| `wip_inventory_value` | $ | Capital in production | In-process inventory |
| `production_schedule_adherence` | % | On-time completion | `on_time_wo / total_wo × 100` |

### MRP Specific

| Metric | Type | Description | Formula/Logic |
|--------|------|-------------|---------------|
| `planned_order_releases` | report | Future POs from MRP | By date, by item |
| `firm_planned_orders` | count | Locked orders | Human-confirmed |
| `mrp_exception_messages` | count | Action required | Expedite, defer, cancel |
| `capacity_utilization` | % | Resource loading | `planned_hours / available_hours × 100` |

---

## 8. Risk & Compliance

Supply chain risk and regulatory metrics.

### Supply Risk

| Metric | Type | Description | Risk Level |
|--------|------|-------------|------------|
| `single_source_skus` | count | Only one approved vendor | HIGH — no backup |
| `single_source_spend` | $ | Value at risk | Quantified exposure |
| `dual_source_coverage` | % | SKUs with 2+ vendors | Target: >80% for A items |
| `geographic_concentration` | % | Spend by region | >50% one region = risk |
| `supplier_count_by_category` | count | Vendor diversity | Too few or too many |

### Contract Management

| Metric | Type | Description | Action Trigger |
|--------|------|-------------|----------------|
| `contracts_expiring_30d` | count | Near-term renewals | Initiate negotiation |
| `contracts_expiring_90d` | count | Upcoming renewals | Begin review |
| `spend_under_contract` | % | Negotiated pricing coverage | Target: >70% |
| `contract_utilization` | % | Using contracted terms | `contract_spend / eligible_spend` |
| `price_protection_coverage` | % | Spend with price caps | Inflation hedge |

### Compliance

| Metric | Type | Description | Status |
|--------|------|-------------|--------|
| `vendor_certification_status` | report | Required certs current | By vendor, by cert type |
| `compliance_expiration_alerts` | count | Certs expiring soon | 30/60/90 day warnings |
| `audit_findings_open` | count | Unresolved issues | From vendor audits |
| `tariff_exposure` | $ | Duty cost by origin | Trade risk visibility |

---

## 9. Strategic Procurement

High-level procurement effectiveness metrics.

### Spend Analysis

| Metric | Type | Description | Formula/Logic |
|--------|------|-------------|---------------|
| `total_spend_ytd` | $ | Year-to-date purchases | `Σ(po_value)` |
| `spend_by_category` | $ | Category breakdown | Pareto analysis |
| `spend_by_vendor` | $ | Vendor concentration | Top 10/20 analysis |
| `spend_under_management` | % | With negotiated terms | `managed_spend / total_spend × 100` |
| `maverick_spend` | % | Outside preferred vendors | `non_preferred / total × 100` |

### Savings & Value

| Metric | Type | Description | Formula/Logic |
|--------|------|-------------|---------------|
| `cost_savings_ytd` | $ | Realized reductions | Negotiated savings |
| `cost_avoidance_ytd` | $ | Prevented increases | Price hold, renegotiation |
| `savings_pipeline` | $ | In-progress initiatives | Projected savings |
| `savings_by_category` | $ | Where value created | Category breakdown |

### Process Maturity

| Metric | Type | Description | Target |
|--------|------|-------------|--------|
| `category_strategy_coverage` | % | With defined strategy | >80% of A spend |
| `supplier_rationalization` | trend | Vendor count trajectory | Optimize, not minimize |
| `p2p_touchless_rate` | % | Full automation | Req → Pay without human |
| `procurement_roi` | ratio | Value delivered | `savings / procurement_cost` |

---

## 10. Agent Activity & Anomalies

Autonomous system monitoring and alerts.

### Agent Types

| Agent | Purpose | Key Triggers |
|-------|---------|--------------|
| `stockout-prevention` | Prevent stockouts | CLTR < 1.0, below ROP |
| `vendor-watchdog` | Monitor supplier performance | Late shipments, quality issues |
| `excess-inventory` | Flag overstocks | Above runway threshold |
| `price-monitor` | Track cost changes | Price variance > threshold |
| `demand-anomaly` | Detect unusual demand | Spike/drop > 2 std dev |

### Activity Log Structure

| Field | Type | Description |
|-------|------|-------------|
| `agent_identifier` | string | Which agent |
| `activity_type` | enum | decision, action, completion, alert |
| `title` | string | Alert headline |
| `severity` | enum | critical, warning, info |
| `context` | object | Relevant data snapshot |
| `requires_human_review` | bool | Escalation flag |
| `created_at` | timestamp | When triggered |
| `resolved_at` | timestamp | When addressed |

### Anomaly Detection

| Category | Examples | Response |
|----------|----------|----------|
| `critical` | Out of stock, vendor no-ship | Immediate action |
| `warning` | Below ROP, late shipment | Same-day review |
| `info` | Approaching threshold | Monitoring |

---

## 11. Implementation Priority

### Phase 1: Core Value (MVP)

Essential metrics for basic inventory intelligence.

| Category | Metrics | Rationale |
|----------|---------|-----------|
| Coverage | CLTR, runway_days, safety_stock_attainment | Core stockout prevention |
| Classification | ABC, XYZ, combined | Prioritization framework |
| Supplier | OTIF, lead_time_bias | Vendor accountability |
| Financial | Inventory turns, excess value | ROI proof |
| Service | Service level achieved | Customer impact |

### Phase 2: Differentiation

Metrics that elevate above competitors.

| Category | Metrics | Rationale |
|----------|---------|-----------|
| Forecasting | MAPE, bias, trend | Close the planning loop |
| Inventory Health | Dead stock, slow-moving | Working capital wins |
| Risk | Single-source, vendor risk score | Proactive management |
| Efficiency | Auto-replenishment rate, exception rate | Automation story |
| Cost | TCO, stockout cost estimate | Strategic value |

### Phase 3: Enterprise

Full-featured procurement suite.

| Category | Metrics | Rationale |
|----------|---------|-----------|
| Supplier Scorecard | Full composite scoring | Strategic sourcing |
| Contract Management | Expiration, utilization | Compliance & savings |
| Spend Analytics | Category, savings tracking | Procurement maturity |
| MRP | Full production planning | Manufacturing depth |

---

## Appendix: Calculation Reference

### Common Formulas

```
// Coverage-to-Lead-Time Ratio
cltr = runway_days / lead_time_planned

// Runway Days  
runway_days = qty_on_hand / demand_mean_daily

// Coefficient of Variation
cv = demand_std_dev / demand_mean

// Safety Stock (normal distribution)
safety_stock = z_score × demand_std_dev × √lead_time_days
// z_score: 1.65 (95%), 2.05 (98%), 2.33 (99%)

// Reorder Point
rop = (lead_time_days × daily_demand) + safety_stock

// Economic Order Quantity
eoq = √((2 × annual_demand × order_cost) / carrying_cost_per_unit)

// Inventory Turns
turns = annual_cogs / average_inventory_value

// Days Inventory Outstanding
dio = 365 / inventory_turns

// GMROI
gmroi = gross_margin_dollars / average_inventory_cost

// OTIF
otif = orders_on_time_and_complete / total_orders × 100

// Lead Time Bias
lt_bias = actual_lead_time_avg - planned_lead_time

// Forecast MAPE
mape = (1/n) × Σ(|actual - forecast| / actual) × 100
```

### Service Level to Z-Score

| Service Level | Z-Score | Safety Stock Multiplier |
|---------------|---------|------------------------|
| 90% | 1.28 | Low |
| 95% | 1.65 | Standard |
| 98% | 2.05 | High |
| 99% | 2.33 | Very High |
| 99.9% | 3.09 | Critical items only |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01 | Initial comprehensive reference |

---

*MuRP — Multi-use Resource Planning*
*Making procurement intelligent.*