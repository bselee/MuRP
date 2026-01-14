# MuRP BOM & Purchasing Test Suite

> **"Never Run Out"** - Comprehensive testing for BuildASoil's inventory planning system

## 🎯 Purpose

This test suite validates the core business logic that drives MuRP's purchasing recommendations. A bug here doesn't just cause a 500 error—it causes a $50K over-order or a stockout that kills Q2 revenue.

## 📁 Directory Structure

```
murp-tests/
├── __fixtures__/           # Test data (BuildASoil-specific)
│   └── buildaSoilData.ts   # Products, BOMs, vendors, inventory scenarios
│
├── __helpers__/            # Test utilities
│   └── testUtils.ts        # Calculation helpers, mock DB, date utils
│
├── bom/                    # BOM explosion tests
│   └── bomExplosion.test.ts
│
├── inventory/              # Inventory availability tests
│   └── availability.test.ts
│
├── purchasing/             # Purchase timing tests
│   └── orderTiming.test.ts
│
├── forecasting/            # Seasonal forecasting tests
│   └── seasonal.test.ts
│
├── integration/            # End-to-end pipeline tests
│   └── requirementsPipeline.test.ts
│
├── scenarios/              # Real-world business scenarios
│   └── realWorld.test.ts
│
├── vitest.config.ts        # Test configuration
└── README.md               # This file
```

## 🚀 Quick Start

```bash
# Install dependencies (if not already in MuRP)
npm install -D vitest @vitest/coverage-v8

# Run all tests
npx vitest

# Run with coverage
npx vitest --coverage

# Run specific test file
npx vitest bom/bomExplosion.test.ts

# Run in watch mode
npx vitest --watch

# Run only tests matching pattern
npx vitest -t "CRAFT8"
```

## 🧪 Test Categories

### 1. BOM Explosion (`bom/`)
The foundation of everything. Tests that:
- `quantity_per_parent` multiplication is correct
- Fractional quantities (0.0375 totes) work
- Nested BOMs explode properly
- Circular BOM references are caught
- Component aggregation across parents works

**Run these first if debugging requirements issues.**

### 2. Inventory Availability (`inventory/`)
Tests for:
- Net available = on_hand + on_order - reserved
- Negative net (oversold) detection
- Multi-location aggregation
- Missing inventory records → 0

### 3. Purchase Timing (`purchasing/`)
Tests for:
- Order-by date = need date - lead time - buffer
- Urgency scoring (0=overdue, 4=can wait)
- MOQ enforcement
- Case pack rounding
- Long lead time (45-day peat moss) handling

### 4. Seasonal Forecasting (`forecasting/`)
Tests for:
- Seasonal indices (1.9 peak in May, 0.5 trough in December)
- Demand adjustment application
- Multi-month planning
- Promotional lift overlay

### 5. Integration Tests (`integration/`)
End-to-end validation:
- Forecast → BOM → Inventory → Recommendations
- Data flows correctly through the entire pipeline
- Regression tests for past bugs

### 6. Real-World Scenarios (`scenarios/`)
Business situation simulations:
- Spring rush (2x demand spike)
- Vendor outage (Neptune Harvest unavailable)
- Critical stockout (oversold items)
- Large batch production (30 CRAFT8 totes)

## 📊 Test Fixtures

Located in `__fixtures__/buildaSoilData.ts`:

### Products
Real BuildASoil SKUs:
- `CRAFT8` - Finished good with 7-component BOM
- `FM104` - Fish Meal (50lb bag)
- `PM101` - Peat Moss (45-day lead time)
- And more...

### BOMs
Actual BOM structures matching Finale:
```typescript
CRAFT8: [
  { component: 'FM104', qty: 1.5 },      // Fish Meal
  { component: 'ALF04T', qty: 0.0375 },  // Alfalfa Tote
  // ...
]
```

### Inventory Scenarios
- `healthy` - Normal stock levels
- `critical` - Low stock, near stockout
- `oversold` - Reservations exceed on-hand
- `excess` - Over-stocked items

### Seasonal Indices
```typescript
{ month: 5, index: 1.90 }  // May peak
{ month: 12, index: 0.50 } // December lull
```

## 🔧 Test Helpers

Located in `__helpers__/testUtils.ts`:

### Calculation Functions
```typescript
calculateNetAvailable(inventory)     // on_hand + on_order - reserved
calculateComponentNeed(qty, ratio)   // BOM explosion
calculateGap(requirement, available) // { shortage, surplus }
calculateOrderByDate(need, lead, buffer)
```

### BOM Explosion
```typescript
explodeBOM(parentSku, qty, bomStructure)     // Single product
aggregateComponentNeeds(demands, boms)        // Multiple products
```

### Mock Database
```typescript
const db = createMockSupabase();
db.__setData('products', [...]);
db.__getData('products');
db.__clearAll();
```

## 🔴 Critical Tests (Must Pass)

These tests prevent real money mistakes:

1. **BOM Explosion Math**
   - `bomExplosion.test.ts` > "quantity_per_parent multiplication"
   
2. **Shortage Detection**
   - `availability.test.ts` > "shortage identification"
   
3. **Order Timing**
   - `orderTiming.test.ts` > "returns PAST date when already late"
   
4. **Seasonal Adjustment**
   - `seasonal.test.ts` > "spring rush increases component requirements"

## 📝 Regression Tests

Located in `integration/requirementsPipeline.test.ts`:

| ID | Issue | Test |
|----|-------|------|
| REG-001 | Recommended ordering discontinued SKUs | `Does not recommend ordering discontinued components` |
| REG-002 | NULL vendor caused errors | `Handles NULL vendor correctly` |
| REG-003 | Multi-location inventory double-counted | `Does not double-count multi-location inventory` |
| REG-004 | Seasonal index 0.5 stored as 0 | `Seasonal index of 0.5 is not stored as 0` |
| REG-005 | Floating point precision loss | `Floating point precision in BOM quantities` |
| REG-006 | Circular BOMs caused infinite loop | `Circular BOM detection` |

**Add new regressions when bugs are found!**

## 🤖 Claude Code Integration

This test suite is designed for easy navigation in Claude Code:

1. **Fixtures are self-documenting** - Real product data with comments
2. **Helpers are importable** - Use in any test file
3. **Scenarios are business-readable** - "Spring rush", "Vendor outage"

### Common Claude Code Tasks

```typescript
// Find all tests for a specific product
// Search: "CRAFT8"

// Find tests for a specific calculation
// Search: "calculateNetAvailable"

// Find regression tests
// Search: "REG-"
```

## ✅ UAT Checklist

Before production deployment:

```markdown
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All scenario tests pass
- [ ] Coverage > 80%
- [ ] No regressions reintroduced
- [ ] Spot-check against Finale export:
  - [ ] CRAFT8 BOM matches (7 components)
  - [ ] FM104 qty_per = 1.5
  - [ ] Lead times match vendors
```

## 🔄 Continuous Integration

Add to your CI pipeline:

```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx vitest --coverage
      - uses: codecov/codecov-action@v3
```

## 📈 Adding New Tests

1. **New calculation?** Add to `__helpers__/testUtils.ts`
2. **New product/BOM?** Add to `__fixtures__/buildaSoilData.ts`
3. **New unit test?** Add to appropriate domain folder
4. **New scenario?** Add to `scenarios/realWorld.test.ts`
5. **Bug fix?** Add regression test with `REG-XXX` ID

---

*Last updated: January 2026*
*Maintained by: BuildASoil Purchasing Team*
