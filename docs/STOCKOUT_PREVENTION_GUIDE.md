# Stockout Prevention & Reorder Intelligence System

**Complete AI-driven inventory management to prevent stockouts and production blocking**

## 🎯 Overview

This system combines human-readable displays with intelligent AI agents to ensure you **never run out of stock** or **block production**. It continuously monitors purchase history, consumption patterns, lead times, and production requirements to proactively recommend orders before stockouts occur.

---

## 📊 Human-Readable Displays

### 1. Product Reorder Intelligence (Product Detail View)

Located in: **Inventory Item Panel → Reorder Analytics Tab**

**What you see:**
- **Status Banner**: Visual alert showing stock health (Out of Stock → Critical → Reorder Now → Reorder Soon → OK)
- **Key Metrics**:
  - Current Stock (units available)
  - Days Until Stockout (countdown timer)
  - Daily Usage Rate (consumption velocity)
  - Average Lead Time (vendor delivery time)
- **Consumption Trends**: 30-day and 90-day usage patterns
- **AI Recommendations**:
  - Suggested Reorder Point (when to order)
  - Suggested Max Stock (order quantity target)
  - Recommended Order Quantity (specific units to order now)
  - Estimated Cost for recommended order
- **Purchase & Consumption History**: Last 90 days of all transactions

**Color Coding:**
- 🔴 Red/Critical: OUT OF STOCK or 0-3 days remaining
- 🟠 Orange/High: CRITICAL status, 3-7 days remaining
- 🟡 Yellow/Medium: REORDER_NOW, 7-14 days remaining
- 🔵 Blue: REORDER_SOON, 14-30 days remaining
- 🟢 Green: OK, 30+ days remaining

**How to use:**
1. Click on any inventory item
2. Navigate to "Reorder Analytics" tab
3. Review status banner for urgency
4. Check "Recommended Order Quantity" in AI Recommendations
5. Click purchase button (coming soon) or manually create PO

---

### 2. Critical Stockout Widget (Dashboard)

Located in: **Dashboard → Stock Intelligence Tab** (top of page)

**What you see:**
- **Summary Stats**:
  - Critical Alerts (out of stock or <3 days)
  - High Priority (3-7 days)
  - Blocked Builds (production orders waiting for components)
- **Three Main Tabs**:

**Tab 1: Stockout Alerts**
- All products needing attention
- Shows: SKU, current stock, days until stockout, recommended order qty, estimated cost
- Sorted by: Severity → Days remaining
- Displays special warnings:
  - Consumption spikes (usage increased >50%)
  - Lead time variances (delivery delays)

**Tab 2: BOM Blocking**
- Build orders that can't be completed due to missing components
- Shows: Build order name, target quantity, missing components with shortages
- Estimated delay in days if not ordered immediately
- Component availability forecast (when it will arrive if ordered today)

**Tab 3: Purchase Recommendations**
- Auto-generated purchase orders with urgency levels:
  - **IMMEDIATE**: Order today (out of stock or <7 days)
  - **THIS WEEK**: Order within 7 days (<14 days remaining)
  - **THIS MONTH**: Plan order soon (14-30 days)
- Shows: Preferred vendor, lead time, order-by date, estimated cost
- Includes notes like "Stock will run out before delivery"

**How to use:**
1. Go to Dashboard → Stock Intelligence
2. Widget auto-refreshes every 5 minutes
3. Review tabs from left to right:
   - Stockout Alerts → Immediate attention needed
   - BOM Blocking → Production impact
   - Purchase Recommendations → Shopping list
4. Click "Refresh" button to manually reload
5. Use recommendations to create purchase orders

---

## 🤖 Agentic AI Monitoring

### Stockout Prevention Agent

**What it does automatically:**
- **Continuous Monitoring**: Scans all SKUs every 5 minutes
- **Predictive Analysis**: Forecasts stockouts before they happen
- **BOM Analysis**: Checks if any build orders will be blocked
- **Lead Time Intelligence**: Tracks vendor delivery trends
- **Consumption Spike Detection**: Identifies sudden usage increases (>50%)
- **Proactive Alerts**: Generates recommendations without human input

**Intelligent Metrics Analyzed:**

1. **Daily Consumption Rate**
   - Calculates: Total consumed / days in period
   - Weighted: Last 7 days = 60%, last 30 days = 30%, last 90 days = 10%
   - Detects spikes and adjusts recommendations

2. **Lead Time Tracking**
   - Historical average per vendor per SKU
   - Recent trend (last 3 orders vs all-time)
   - Variance detection: >30% increase = HIGH risk
   - Adjusts reorder points dynamically

3. **Reorder Point Calculation**
   ```
   Suggested Reorder Point = (Daily Consumption × Lead Time Days) + Safety Buffer
   Safety Buffer = Daily Consumption × 7 days (1 week buffer)
   ```

4. **Order Quantity Recommendation**
   ```
   Optimal Order Qty = Max Stock - Current Available
   Max Stock = Daily Consumption × 90 days (3 months supply)
   ```

5. **Stockout Prediction**
   ```
   Days Until Stockout = Current Available / Daily Consumption Rate
   IF Days < Lead Time: IMMEDIATE ORDER NEEDED
   IF Days < (Lead Time + 7): HIGH PRIORITY
   IF Days < (Lead Time + 14): REORDER NOW
   ```

**Edge Detection:**

The agent gives you an **ordering edge** by:
- **Early Warning**: Alerts 7-14 days BEFORE stockout (not when already out)
- **Consumption Velocity**: Detects 50%+ increases in usage within 7 days
- **Vendor Reliability**: Factors vendor performance into timing
  - If vendor lead time increasing → Order earlier
  - If vendor unreliable → Increase safety buffer
- **Seasonal Patterns** (future): Will learn recurring demand spikes
- **BOM Blocking Prevention**: Prevents production delays by flagging component shortages BEFORE build order approval

---

## 🔄 Data Flow

### Automatic Data Collection

**Purchases (Automatic):**
When a PO is received:
```typescript
// Trigger fires automatically
UPDATE purchase_orders SET status = 'received', received_date = NOW()
→ Trigger: log_purchase_receipt()
→ Creates entries in product_purchase_log
→ Calculates lead_time_days = received_date - order_date
→ Updates product_reorder_analytics view
```

**Consumption (Manual Logging):**
```typescript
import { logConsumption } from './services/reorderIntelligenceService';

// When building products
await logConsumption('SKU-123', 50, 'production', {
  sourceReference: 'BUILD-001',
  sourceType: 'build_order'
});

// When selling
await logConsumption('SKU-456', 10, 'sale', {
  sourceReference: 'SALE-789'
});

// When adjusting (waste, damage, etc.)
await logConsumption('SKU-789', 5, 'adjustment', {
  sourceReference: 'WASTE-001',
  notes: 'Damaged during handling'
});
```

**Analytics (Real-Time View):**
```sql
SELECT * FROM product_reorder_analytics
WHERE sku = 'SKU-123';

-- Returns:
-- daily_consumption_rate, days_of_stock_remaining,
-- suggested_reorder_point, suggested_max_stock,
-- reorder_status (OUT_OF_STOCK/CRITICAL/REORDER_NOW/etc.)
```

---

## 🎮 How to Use the System

### For Buyers/Purchasing

**Morning Routine:**
1. Open Dashboard → Stock Intelligence
2. Check Critical Stockout Widget summary numbers
3. Review "Stockout Alerts" tab → CRITICAL items
4. Review "BOM Blocking" tab → Production blockers
5. Review "Purchase Recommendations" tab → IMMEDIATE orders
6. Create POs for all IMMEDIATE recommendations

**Weekly Planning:**
1. Review "Purchase Recommendations" → THIS WEEK
2. Check vendor lead times and availability
3. Schedule orders by "Order By Date"
4. Monitor "BOM Blocking" for upcoming builds

**Continuous Monitoring:**
- Agent Command Widget shows stockout prevention status
- Red badge = Critical items need attention
- Auto-refreshes every 5 minutes

### For Production/Operations

**Before Creating Build Orders:**
1. Open Build Order form
2. Enter SKU and quantity
3. System checks BOM components automatically
4. If components missing → Warning shows with shortage details
5. Review "Days Until Available" for each missing component
6. Decide: Wait for delivery or expedite order

**When Build Order Blocked:**
1. Go to Dashboard → Stock Intelligence → BOM Blocking tab
2. Find your build order
3. See missing components and shortage quantities
4. Check "Estimated Delay Days"
5. Coordinate with purchasing to expedite missing items

### For Management

**KPIs to Monitor:**
- **Critical Alerts**: Should be 0 (stockouts prevented)
- **Blocked Builds**: Should be 0 (production flowing)
- **Lead Time Variance**: Should be <15% (vendor reliability)
- **Consumption Spikes**: Early indicator of demand changes

**Reports Available:**
1. Product Reorder Analytics (per SKU)
2. Consumption Trends (30d vs 90d)
3. Purchase History (cost analysis)
4. Vendor Performance (lead time accuracy)

---

## 📈 Advanced Features

### Lead Time Intelligence

Tracks vendor performance to adjust reorder timing:
```
Historical Avg: 14 days
Recent Avg (last 3 orders): 18 days
Variance: +29%
Trend: DEGRADING
Risk Level: MEDIUM
Recommendation: "Lead times increasing - adjust reorder point buffer"
```

**How it helps:**
- If vendor slowing down → Order earlier to compensate
- If vendor improving → Can reduce safety stock
- If variance >30% → Flag as HIGH risk, seek alternate vendor

### Consumption Spike Detection

Identifies sudden demand changes:
```
Historical Daily Rate: 10 units/day
Recent Daily Rate (last 7 days): 18 units/day
Change: +80%
Alert: "Consumption increased by 80% in last 7 days"
Recommended Action: "Review cause and consider expedited order"
```

**How it helps:**
- Catches marketing campaigns increasing sales
- Detects production ramp-ups
- Prevents stockouts from unexpected demand
- Adjusts order quantities dynamically

### BOM Blocking Prevention

Pre-checks build orders before approval:
```
Build Order: "Deluxe Widget" × 100 units
Components Required:
  - SKU-A: Need 200, Have 150 → SHORT 50 units
  - SKU-B: Need 100, Have 100 → OK
  - SKU-C: Need 50, Have 20 → SHORT 30 units

Blocked: YES
Estimated Delay: 12 days (longest lead time of missing items)
```

**How it helps:**
- Prevents scheduling builds that can't be completed
- Identifies component shortages BEFORE production starts
- Calculates realistic completion dates
- Allows proactive ordering to meet deadlines

---

## ⚡ Quick Reference

**Status Levels:**
- **OUT_OF_STOCK**: 0 units → Order immediately
- **CRITICAL**: <3 days → Emergency order
- **REORDER_NOW**: 7-14 days → Place order this week
- **REORDER_SOON**: 14-30 days → Plan order
- **OK**: 30+ days → No action needed

**Urgency Levels (Purchase Recommendations):**
- **IMMEDIATE**: <7 days or out of stock
- **THIS_WEEK**: <14 days
- **THIS_MONTH**: <30 days

**Alert Severities:**
- **CRITICAL**: Production-blocking, out of stock
- **HIGH**: <7 days remaining
- **MEDIUM**: Lead time variance, consumption spike

**Agent Refresh Rates:**
- Critical Stockout Widget: Every 5 minutes
- Agent Command Widget: Every 5 minutes
- Product Reorder Intelligence: On page load (or manual refresh)

---

## 🔗 Integration Points

**Inventory Management:**
- Product detail panels show reorder analytics
- Inventory list can filter by reorder status

**Purchase Orders:**
- Recommendations include preferred vendor
- Estimated costs help with budgeting
- Order-by dates prevent stockouts

**Build Orders:**
- Pre-checks components before approval
- Blocks creation if components unavailable
- Shows estimated delay from missing items

**Dashboard:**
- Centralized command center for all stockout prevention
- Agent Command Widget shows system health
- Stock Intelligence tab provides deep analytics

---

## 🛠️ Troubleshooting

**No recommendations showing:**
- Check that POs have been received (triggers purchase logging)
- Ensure consumption is being logged manually
- Verify SKU matches between inventory and logs

**Inaccurate consumption rate:**
- Review consumption_log for data quality
- Ensure regular consumption logging (daily is ideal)
- Check for outliers or data entry errors

**BOM blocking false positives:**
- Verify BOM components are correctly linked
- Check inventory_items.units_available is accurate
- Review reorder_point settings (may be too high)

**Lead time trends wrong:**
- Need at least 3 completed POs for trends
- Verify PO dates (order_date and received_date) are correct
- Check vendor_name consistency across POs

---

## 📚 See Also

- **PURCHASE_CONSUMPTION_TRACKING.md**: Detailed database schema and queries
- **services/stockoutPreventionAgent.ts**: Agent implementation code
- **services/reorderIntelligenceService.ts**: Analytics functions
- **components/ProductReorderIntelligence.tsx**: UI component
- **components/CriticalStockoutWidget.tsx**: Dashboard widget

---

**Last Updated:** December 13, 2025  
**System Version:** 1.0 (Initial Release)
