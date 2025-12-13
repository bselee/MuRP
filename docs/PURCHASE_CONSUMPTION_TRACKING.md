# Purchase & Consumption Tracking System

## Overview

The system automatically tracks purchase and consumption data for every product to enable intelligent, data-driven reorder calculations.

## Database Schema

### Tables

**`product_purchase_log`** - Incoming inventory from POs
- Auto-populated when PO status changes to 'received'
- Tracks: SKU, quantity, cost, vendor, PO reference, dates
- Calculates lead time automatically (received_at - ordered_at)

**`product_consumption_log`** - Outgoing inventory usage
- Manual logging when products are used
- Types: production, sale, waste, adjustment, transfer
- Links to source (build order ID, sales order ID, etc.)

**`product_reorder_analytics`** (VIEW) - Intelligent analytics
- Combines purchase + consumption data
- Calculates real-time metrics for reorder decisions

## Automatic Data Collection

### Purchase Data (Automatic)
```sql
-- Trigger fires when PO marked as received
UPDATE purchase_orders SET status = 'received' WHERE id = 'po-123';

-- Automatically creates entries in product_purchase_log for each line item
-- No manual action required!
```

### Consumption Data (Manual Logging)
```typescript
import { logConsumption } from './services/reorderIntelligenceService';

// Log when building a product (BOM consumption)
await logConsumption('SKU-123', 50, 'production', {
  productName: 'Widget Component',
  sourceReference: 'BUILD-001',
  sourceType: 'build_order',
  notes: 'Used in Widget Assembly'
});

// Log a sale
await logConsumption('SKU-456', 10, 'sale', {
  sourceReference: 'SALE-789',
  sourceType: 'sales_order'
});

// Log waste/damage
await logConsumption('SKU-789', 5, 'waste', {
  notes: 'Damaged during production'
});
```

## Getting Reorder Analytics

### View All Products Needing Reorder
```typescript
import { getProductsNeedingReorder } from './services/reorderIntelligenceService';

const criticalProducts = await getProductsNeedingReorder();
// Returns products with status: OUT_OF_STOCK, CRITICAL, or REORDER_NOW
```

### Get Analytics for Specific SKU
```typescript
import { getProductReorderAnalytics } from './services/reorderIntelligenceService';

const analytics = await getProductReorderAnalytics('SKU-123');

console.log({
  // Current inventory
  available_quantity: analytics.available_quantity,
  reorder_point: analytics.reorder_point,
  
  // Purchase history
  avg_lead_time_days: analytics.avg_lead_time_days,
  avg_unit_cost: analytics.avg_unit_cost,
  last_received_at: analytics.last_received_at,
  
  // Consumption patterns
  consumed_last_30_days: analytics.consumed_last_30_days,
  consumed_last_90_days: analytics.consumed_last_90_days,
  daily_consumption_rate: analytics.daily_consumption_rate,
  
  // Intelligent calculations
  days_of_stock_remaining: analytics.days_of_stock_remaining,
  suggested_reorder_point: analytics.suggested_reorder_point,
  suggested_max_stock: analytics.suggested_max_stock,
  reorder_status: analytics.reorder_status
});
```

### Calculate Optimal Order Quantity
```typescript
import { calculateOptimalOrderQuantity } from './services/reorderIntelligenceService';

const analytics = await getProductReorderAnalytics('SKU-123');
const optimalQty = calculateOptimalOrderQuantity(analytics);

console.log(`Order ${optimalQty} units to reach optimal stock level`);
```

## Reorder Status Levels

| Status | Meaning | Action |
|--------|---------|--------|
| `OUT_OF_STOCK` | Available quantity = 0 | **URGENT** - Create emergency PO |
| `CRITICAL` | Below 50% of reorder point | **HIGH PRIORITY** - Order immediately |
| `REORDER_NOW` | At or below reorder point | Order now (normal priority) |
| `REORDER_SOON` | Within 150% of reorder point | Review and plan order |
| `OK` | Above reorder threshold | No action needed |

## Smart Reorder Calculations

### Suggested Reorder Point
```
Calculation: (Daily Consumption Rate) × (Lead Time + 7 days buffer)

Example:
- Daily consumption: 5.2 units/day
- Avg lead time: 14 days
- Buffer: 7 days
- Suggested reorder point: 5.2 × (14 + 7) = 109 units
```

### Suggested Max Stock
```
Calculation: (Daily Consumption Rate) × 90 days

Example:
- Daily consumption: 5.2 units/day
- Suggested max stock: 5.2 × 90 = 468 units
```

### Days of Stock Remaining
```
Calculation: Available Quantity ÷ Daily Consumption Rate

Example:
- Available: 78 units
- Daily rate: 5.2 units/day
- Days remaining: 78 ÷ 5.2 = 15 days
```

## Query Purchase/Consumption History

### Purchase History
```typescript
import { getPurchaseHistory } from './services/reorderIntelligenceService';

const purchases = await getPurchaseHistory('SKU-123', 365); // Last year

purchases.forEach(p => {
  console.log(`${p.received_at}: Received ${p.quantity_purchased} units from ${p.vendor_name}`);
  console.log(`Lead time: ${p.lead_time_days} days, Cost: $${p.unit_cost}`);
});
```

### Consumption History
```typescript
import { getConsumptionHistory } from './services/reorderIntelligenceService';

const consumption = await getConsumptionHistory('SKU-123', 90); // Last 90 days

consumption.forEach(c => {
  console.log(`${c.consumed_at}: Used ${c.quantity_consumed} units for ${c.consumption_type}`);
  console.log(`Source: ${c.source_type} ${c.source_reference}`);
});
```

## Direct SQL Access

### Query the Analytics View
```sql
-- Get all products needing reorder
SELECT * FROM product_reorder_analytics
WHERE reorder_status IN ('OUT_OF_STOCK', 'CRITICAL', 'REORDER_NOW')
ORDER BY days_of_stock_remaining ASC;

-- Get fastest-moving products
SELECT * FROM product_reorder_analytics
WHERE daily_consumption_rate > 0
ORDER BY daily_consumption_rate DESC
LIMIT 20;

-- Get products with highest cost exposure
SELECT 
  sku,
  product_name,
  avg_unit_cost,
  daily_consumption_rate,
  (avg_unit_cost * daily_consumption_rate * 30) as monthly_cost_exposure
FROM product_reorder_analytics
WHERE daily_consumption_rate > 0
ORDER BY monthly_cost_exposure DESC;
```

### Query Raw Logs
```sql
-- Purchase history for a SKU
SELECT * FROM product_purchase_log
WHERE sku = 'SKU-123'
ORDER BY received_at DESC;

-- Consumption history for a SKU
SELECT * FROM product_consumption_log
WHERE sku = 'SKU-123'
ORDER BY consumed_at DESC;

-- Total consumption by type
SELECT 
  consumption_type,
  COUNT(*) as transaction_count,
  SUM(quantity_consumed) as total_consumed
FROM product_consumption_log
WHERE consumed_at >= NOW() - INTERVAL '30 days'
GROUP BY consumption_type;
```

## Integration Points

### When Building Products (BOM Consumption)
```typescript
// In your build order completion handler
async function completeBuildOrder(buildOrderId: string) {
  // 1. Update build order status
  await updateBuildOrder(buildOrderId, { status: 'completed' });
  
  // 2. Log component consumption
  const components = await getBuildOrderComponents(buildOrderId);
  for (const component of components) {
    await logConsumption(component.sku, component.quantity_used, 'production', {
      sourceReference: buildOrderId,
      sourceType: 'build_order'
    });
  }
}
```

### When Receiving POs
```typescript
// Automatic - trigger handles this!
// Just update PO status:
await updatePurchaseOrder(poId, { status: 'received', received_date: new Date() });

// Trigger automatically creates product_purchase_log entries
```

### When Adjusting Inventory
```typescript
// For inventory adjustments (cycle counts, corrections)
await logConsumption(sku, adjustmentQty, 'adjustment', {
  notes: 'Cycle count correction: found less than expected'
});
```

## Best Practices

1. **Log consumption immediately** - Don't batch, log as events happen
2. **Include source references** - Always link to build order, sales order, etc.
3. **Review suggested reorder points monthly** - Consumption patterns change
4. **Monitor lead time variance** - If max_lead_time >> avg_lead_time, increase buffer
5. **Check reorder_status daily** - Automate alerts for CRITICAL and OUT_OF_STOCK

## Dashboard Integration Example

```typescript
// In your Dashboard component
import { getReorderAnalytics } from './services/reorderIntelligenceService';

function ReorderDashboard() {
  const [analytics, setAnalytics] = useState([]);
  
  useEffect(() => {
    async function loadData() {
      const data = await getReorderAnalytics('critical');
      setAnalytics(data);
    }
    loadData();
  }, []);
  
  return (
    <div>
      <h2>Critical Inventory ({analytics.length})</h2>
      {analytics.map(item => (
        <div key={item.sku}>
          <strong>{item.product_name}</strong>
          <p>Stock: {item.available_quantity} units</p>
          <p>Days remaining: {item.days_of_stock_remaining}</p>
          <p>Daily usage: {item.daily_consumption_rate} units/day</p>
          <button onClick={() => createPO(item.sku)}>
            Order {calculateOptimalOrderQuantity(item)} units
          </button>
        </div>
      ))}
    </div>
  );
}
```

## Future Enhancements

- [ ] Automatic consumption logging from build order completion
- [ ] Seasonal adjustment factors (holidays, production cycles)
- [ ] Lead time variance alerts
- [ ] Cost trend analysis
- [ ] Multi-warehouse consumption tracking
- [ ] Demand forecasting with ML
