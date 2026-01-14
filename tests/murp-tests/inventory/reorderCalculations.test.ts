/**
 * Reorder Calculations Tests
 *
 * Comprehensive tests for:
 * - Reorder Point (ROP) calculations
 * - Safety stock calculations
 * - Economic Order Quantity (EOQ)
 * - Days of coverage / runway
 * - All inventory items from BuildASoil fixtures
 *
 * CLAUDE CODE: These formulas are critical for purchasing decisions.
 * Errors here directly impact stockouts and cash flow.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  products,
  vendors,
  inventoryScenarios,
  seasonalIndices,
  boms,
  expectedResults,
} from '../__fixtures__/buildaSoilData';
import {
  calculateNetAvailable,
  calculateGap,
  roundForOrdering,
  roundTo,
  isCloseTo,
} from '../__helpers__/testUtils';
import {
  BUILDASOIL_TIMEZONE,
  createDenverDate,
  isSpringRush,
  getSeasonalMonth,
} from '../__helpers__/timezoneUtils';

// ============================================================================
// REORDER POINT (ROP) CALCULATIONS
// ============================================================================

describe('Reorder Point (ROP) Calculations', () => {
  /**
   * ROP Formula: ROP = (Daily Usage × Lead Time) + Safety Stock
   *
   * Where:
   * - Daily Usage = Average daily consumption based on historical data
   * - Lead Time = Vendor delivery days
   * - Safety Stock = Buffer for demand variability
   */

  const calculateROP = (
    dailyUsage: number,
    leadTimeDays: number,
    safetyStock: number
  ): number => {
    return dailyUsage * leadTimeDays + safetyStock;
  };

  const calculateDailyUsage = (
    weeklyUsage: number,
    seasonalIndex: number = 1.0
  ): number => {
    return (weeklyUsage / 7) * seasonalIndex;
  };

  describe('basic ROP calculations', () => {
    it('calculates ROP for stable demand item', () => {
      // FM104 Fish Meal: 20 units/week, 14 day lead time, 30 units safety
      const weeklyUsage = 20;
      const leadTime = products.FM104.lead_time_days!;
      const safetyStock = 30;

      const dailyUsage = calculateDailyUsage(weeklyUsage);
      const rop = calculateROP(dailyUsage, leadTime, safetyStock);

      // (20/7) × 14 + 30 = 2.857 × 14 + 30 = 40 + 30 = 70
      expect(roundTo(rop, 0)).toBe(70);
    });

    it('calculates higher ROP for long lead time items', () => {
      // PM101 Peat Moss: 10 units/week, 45 day lead time, 20 units safety
      const weeklyUsage = 10;
      const leadTime = products.PM101.lead_time_days!;
      const safetyStock = 20;

      const dailyUsage = calculateDailyUsage(weeklyUsage);
      const rop = calculateROP(dailyUsage, leadTime, safetyStock);

      // (10/7) × 45 + 20 = 1.43 × 45 + 20 = 64.3 + 20 = 84.3
      expect(roundTo(rop, 0)).toBe(84);
    });

    it('calculates lower ROP for short lead time items', () => {
      // OG106 Gypsum: 5 units/week, 7 day lead time, 10 units safety
      const weeklyUsage = 5;
      const leadTime = products.OG106.lead_time_days!;
      const safetyStock = 10;

      const dailyUsage = calculateDailyUsage(weeklyUsage);
      const rop = calculateROP(dailyUsage, leadTime, safetyStock);

      // (5/7) × 7 + 10 = 0.714 × 7 + 10 = 5 + 10 = 15
      expect(roundTo(rop, 0)).toBe(15);
    });

    it('applies seasonal multiplier to ROP', () => {
      // FM104 during spring rush (1.8× demand)
      const weeklyUsage = 20;
      const leadTime = products.FM104.lead_time_days!;
      const safetyStock = 30;
      const springIndex = 1.8;

      const dailyUsage = calculateDailyUsage(weeklyUsage, springIndex);
      const rop = calculateROP(dailyUsage, leadTime, safetyStock);

      // (20/7 × 1.8) × 14 + 30 = 5.14 × 14 + 30 = 72 + 30 = 102
      expect(roundTo(rop, 0)).toBe(102);
    });
  });

  describe('ROP for all BuildASoil components', () => {
    // Test every component from fixtures
    const componentTestCases = [
      { sku: 'FM104', weeklyUsage: 20, safetyStock: 30 },
      { sku: 'FB110', weeklyUsage: 5, safetyStock: 2 },
      { sku: 'KMAG101', weeklyUsage: 25, safetyStock: 40 },
      { sku: 'OG106', weeklyUsage: 8, safetyStock: 10 },
      { sku: 'ALF04T', weeklyUsage: 3, safetyStock: 2 },
      { sku: 'CM105', weeklyUsage: 2, safetyStock: 1 },
      { sku: 'MB104M', weeklyUsage: 15, safetyStock: 10 },
      { sku: 'PM101', weeklyUsage: 10, safetyStock: 20 },
    ];

    componentTestCases.forEach(({ sku, weeklyUsage, safetyStock }) => {
      it(`calculates ROP for ${sku}`, () => {
        const product = products[sku as keyof typeof products];
        expect(product).toBeDefined();

        const leadTime = product.lead_time_days || 14;
        const dailyUsage = calculateDailyUsage(weeklyUsage);
        const rop = calculateROP(dailyUsage, leadTime, safetyStock);

        expect(rop).toBeGreaterThan(0);
        expect(rop).toBeLessThan(1000); // Sanity check

        // ROP should be at least safety stock
        expect(rop).toBeGreaterThanOrEqual(safetyStock);
      });
    });
  });
});

// ============================================================================
// SAFETY STOCK CALCULATIONS
// ============================================================================

describe('Safety Stock Calculations', () => {
  /**
   * Safety Stock Formula: SS = Z × σD × √LT
   *
   * Where:
   * - Z = Service level factor (1.65 for 95%, 2.05 for 98%)
   * - σD = Standard deviation of daily demand
   * - LT = Lead time in days
   */

  const SERVICE_LEVELS = {
    90: 1.28,
    95: 1.65,
    98: 2.05,
    99: 2.33,
  };

  const calculateSafetyStock = (
    demandStdDev: number,
    leadTimeDays: number,
    serviceLevel: 90 | 95 | 98 | 99 = 95
  ): number => {
    const z = SERVICE_LEVELS[serviceLevel];
    return z * demandStdDev * Math.sqrt(leadTimeDays);
  };

  describe('service level impact', () => {
    it('calculates safety stock at 95% service level', () => {
      const stdDev = 5; // Daily demand std dev
      const leadTime = 14;

      const ss = calculateSafetyStock(stdDev, leadTime, 95);

      // 1.65 × 5 × √14 = 1.65 × 5 × 3.74 = 30.9
      expect(roundTo(ss, 0)).toBe(31);
    });

    it('higher service level requires more safety stock', () => {
      const stdDev = 5;
      const leadTime = 14;

      const ss95 = calculateSafetyStock(stdDev, leadTime, 95);
      const ss99 = calculateSafetyStock(stdDev, leadTime, 99);

      expect(ss99).toBeGreaterThan(ss95);
      expect(ss99 / ss95).toBeCloseTo(2.33 / 1.65, 1);
    });

    it('lower service level for non-critical items', () => {
      const stdDev = 5;
      const leadTime = 14;

      const ss90 = calculateSafetyStock(stdDev, leadTime, 90);
      const ss95 = calculateSafetyStock(stdDev, leadTime, 95);

      expect(ss90).toBeLessThan(ss95);
    });
  });

  describe('lead time impact', () => {
    it('longer lead time requires more safety stock', () => {
      const stdDev = 5;

      const ssShort = calculateSafetyStock(stdDev, 7, 95);
      const ssLong = calculateSafetyStock(stdDev, 45, 95);

      // √45/√7 = 6.71/2.65 = 2.53× more
      expect(ssLong / ssShort).toBeCloseTo(Math.sqrt(45 / 7), 1);
    });

    it('PM101 (45 day lead) needs highest safety stock', () => {
      const stdDev = 3;

      const ssPM101 = calculateSafetyStock(stdDev, products.PM101.lead_time_days!, 95);
      const ssOG106 = calculateSafetyStock(stdDev, products.OG106.lead_time_days!, 95);

      expect(ssPM101).toBeGreaterThan(ssOG106);
    });
  });

  describe('demand variability impact', () => {
    it('higher demand variability requires more safety stock', () => {
      const leadTime = 14;

      const ssStable = calculateSafetyStock(2, leadTime, 95);
      const ssVariable = calculateSafetyStock(10, leadTime, 95);

      expect(ssVariable).toBe(ssStable * 5); // Linear with std dev
    });

    it('stable demand items need less buffer', () => {
      const leadTime = 14;

      // X-class item (CV < 0.5) - stable
      const ssXClass = calculateSafetyStock(2, leadTime, 95);
      // Z-class item (CV > 1.0) - erratic
      const ssZClass = calculateSafetyStock(15, leadTime, 95);

      expect(ssZClass / ssXClass).toBeGreaterThan(5);
    });
  });
});

// ============================================================================
// ECONOMIC ORDER QUANTITY (EOQ)
// ============================================================================

describe('Economic Order Quantity (EOQ)', () => {
  /**
   * EOQ Formula: √(2DS/H)
   *
   * Where:
   * - D = Annual demand
   * - S = Ordering cost per order
   * - H = Holding cost per unit per year
   */

  const calculateEOQ = (
    annualDemand: number,
    orderingCost: number,
    holdingCostPerUnit: number
  ): number => {
    return Math.sqrt((2 * annualDemand * orderingCost) / holdingCostPerUnit);
  };

  const calculateHoldingCost = (
    unitCost: number,
    holdingCostPercent: number = 0.25
  ): number => {
    return unitCost * holdingCostPercent;
  };

  describe('basic EOQ calculations', () => {
    it('calculates EOQ for FM104 Fish Meal', () => {
      const annualDemand = 52 * 20; // 20 units/week × 52 weeks
      const orderingCost = 50; // Cost per PO
      const unitCost = products.FM104.unit_cost;
      const holdingCost = calculateHoldingCost(unitCost);

      const eoq = calculateEOQ(annualDemand, orderingCost, holdingCost);

      // √(2 × 1040 × 50 / 10.625) = √(104000/10.625) = √9788 = 99
      expect(roundTo(eoq, 0)).toBeGreaterThan(50);
      expect(roundTo(eoq, 0)).toBeLessThan(200);
    });

    it('high unit cost items have smaller EOQ', () => {
      const annualDemand = 500;
      const orderingCost = 50;

      // Low cost item
      const eoqLow = calculateEOQ(
        annualDemand,
        orderingCost,
        calculateHoldingCost(10)
      );

      // High cost item (CM105 Crustacean Meal at $2200)
      const eoqHigh = calculateEOQ(
        annualDemand,
        orderingCost,
        calculateHoldingCost(products.CM105.unit_cost)
      );

      expect(eoqHigh).toBeLessThan(eoqLow);
    });

    it('high demand items have larger EOQ', () => {
      const orderingCost = 50;
      const holdingCost = 10;

      const eoqLowDemand = calculateEOQ(100, orderingCost, holdingCost);
      const eoqHighDemand = calculateEOQ(1000, orderingCost, holdingCost);

      // EOQ scales with √D
      expect(eoqHighDemand / eoqLowDemand).toBeCloseTo(Math.sqrt(10), 1);
    });
  });

  describe('EOQ with constraints', () => {
    const applyMOQConstraint = (eoq: number, moq: number | null): number => {
      if (!moq) return Math.ceil(eoq);
      return Math.max(Math.ceil(eoq), moq);
    };

    const applyCasePackConstraint = (qty: number, casePack: number): number => {
      if (casePack <= 1) return qty;
      return Math.ceil(qty / casePack) * casePack;
    };

    it('EOQ adjusted to meet MOQ', () => {
      const eoq = 35;
      const moq = products.FM104.moq!; // 20

      const adjustedQty = applyMOQConstraint(eoq, moq);

      expect(adjustedQty).toBe(35); // EOQ > MOQ, use EOQ
    });

    it('MOQ used when EOQ is smaller', () => {
      const eoq = 15;
      const moq = products.KMAG101.moq!; // 40

      const adjustedQty = applyMOQConstraint(eoq, moq);

      expect(adjustedQty).toBe(40); // MOQ > EOQ, use MOQ
    });

    it('case pack rounding applied after MOQ', () => {
      const eoq = 35;
      const moq = 20;
      const casePack = 24;

      let qty = applyMOQConstraint(eoq, moq);
      qty = applyCasePackConstraint(qty, casePack);

      expect(qty).toBe(48); // 35 → ceil(35/24)*24 = 48
    });
  });
});

// ============================================================================
// DAYS OF COVERAGE / RUNWAY
// ============================================================================

describe('Days of Coverage (Runway) Calculations', () => {
  /**
   * Runway Formula: Runway = Available Inventory / Daily Usage
   *
   * Critical thresholds:
   * - < 7 days: CRITICAL
   * - 7-14 days: WARNING
   * - 14-30 days: MONITOR
   * - > 30 days: OK
   */

  const calculateRunway = (
    availableQty: number,
    dailyUsage: number
  ): number => {
    if (dailyUsage <= 0) return Infinity;
    return availableQty / dailyUsage;
  };

  const getRunwayStatus = (
    runwayDays: number,
    leadTimeDays: number
  ): 'CRITICAL' | 'WARNING' | 'MONITOR' | 'OK' => {
    if (runwayDays < 7) return 'CRITICAL';
    if (runwayDays < leadTimeDays) return 'WARNING';
    if (runwayDays < leadTimeDays * 2) return 'MONITOR';
    return 'OK';
  };

  describe('runway calculations with fixture data', () => {
    it('calculates runway for healthy inventory', () => {
      const inventory = inventoryScenarios.healthy;
      const dailyUsage = 20 / 7; // 20 units/week

      // FM104: 200 on hand, 0 on order, 30 reserved = 170 available
      const available = calculateNetAvailable(inventory.FM104);
      const runway = calculateRunway(available, dailyUsage);

      expect(available).toBe(170);
      expect(roundTo(runway, 0)).toBe(60); // ~60 days
    });

    it('calculates runway for critical inventory', () => {
      const inventory = inventoryScenarios.critical;
      const dailyUsage = 20 / 7;

      // FM104: 10 on hand, 0 on order, 8 reserved = 2 available
      const available = calculateNetAvailable(inventory.FM104);
      const runway = calculateRunway(available, dailyUsage);

      expect(available).toBe(2);
      expect(roundTo(runway, 0)).toBe(1); // ~1 day - CRITICAL!
    });

    it('handles oversold inventory (negative available)', () => {
      const inventory = inventoryScenarios.oversold;
      const dailyUsage = 20 / 7;

      // FM104: 20 on hand, 0 on order, 50 reserved = -30 available
      const available = calculateNetAvailable(inventory.FM104);
      const runway = calculateRunway(available, dailyUsage);

      expect(available).toBe(-30);
      expect(runway).toBeLessThan(0); // Negative runway = backorder
    });

    it('identifies status for each runway scenario', () => {
      const leadTime = 14;

      expect(getRunwayStatus(3, leadTime)).toBe('CRITICAL');
      expect(getRunwayStatus(10, leadTime)).toBe('WARNING');
      expect(getRunwayStatus(20, leadTime)).toBe('MONITOR');
      expect(getRunwayStatus(45, leadTime)).toBe('OK');
    });
  });

  describe('runway across all components', () => {
    Object.entries(inventoryScenarios.healthy).forEach(([sku, inventory]) => {
      it(`calculates runway for ${sku}`, () => {
        const available = calculateNetAvailable(inventory);
        const weeklyUsage = 10; // Assume 10/week for test
        const dailyUsage = weeklyUsage / 7;
        const runway = calculateRunway(available, dailyUsage);

        // Runway should be calculable (>= 0)
        expect(runway).toBeGreaterThanOrEqual(0);
        // Available should be positive in healthy scenario
        expect(available).toBeGreaterThanOrEqual(0);
      });
    });

    Object.entries(inventoryScenarios.critical).forEach(([sku, inventory]) => {
      it(`identifies critical status for ${sku}`, () => {
        const available = calculateNetAvailable(inventory);
        const weeklyUsage = 10;
        const dailyUsage = weeklyUsage / 7;
        const runway = calculateRunway(available, dailyUsage);

        // Critical scenario should have low runway
        if (available > 0) {
          expect(runway).toBeLessThan(30);
        }
      });
    });
  });
});

// ============================================================================
// COVERAGE LEAD TIME RATIO (CLTR)
// ============================================================================

describe('Coverage Lead Time Ratio (CLTR)', () => {
  /**
   * CLTR = Runway Days / (Lead Time + Review Period)
   *
   * Interpretation:
   * - < 0.5: CRITICAL - may stockout before order arrives
   * - 0.5 - 1.0: AT_RISK - cutting it close
   * - 1.0 - 2.0: ADEQUATE - healthy buffer
   * - > 2.0: HEALTHY - plenty of coverage
   */

  const calculateCLTR = (
    runwayDays: number,
    leadTimeDays: number,
    reviewPeriodDays: number = 7
  ): number => {
    const denominator = leadTimeDays + reviewPeriodDays;
    if (denominator <= 0) return Infinity;
    return runwayDays / denominator;
  };

  const getCLTRStatus = (
    cltr: number
  ): 'CRITICAL' | 'AT_RISK' | 'ADEQUATE' | 'HEALTHY' => {
    if (cltr < 0.5) return 'CRITICAL';
    if (cltr < 1.0) return 'AT_RISK';
    if (cltr < 2.0) return 'ADEQUATE';
    return 'HEALTHY';
  };

  describe('CLTR calculations', () => {
    it('calculates CLTR for healthy inventory', () => {
      // 60 days runway, 14 day lead time, 7 day review
      const cltr = calculateCLTR(60, 14, 7);

      // 60 / (14 + 7) = 60 / 21 = 2.86
      expect(roundTo(cltr, 2)).toBe(2.86);
      expect(getCLTRStatus(cltr)).toBe('HEALTHY');
    });

    it('calculates CLTR for critical inventory', () => {
      // 7 days runway, 14 day lead time
      const cltr = calculateCLTR(7, 14, 7);

      // 7 / 21 = 0.33
      expect(roundTo(cltr, 2)).toBe(0.33);
      expect(getCLTRStatus(cltr)).toBe('CRITICAL');
    });

    it('long lead time items need more runway for same CLTR', () => {
      const runwayNeededForAdequate = (leadTime: number): number => {
        // CLTR = 1.5 (middle of ADEQUATE range)
        return 1.5 * (leadTime + 7);
      };

      // FM104: 14 day lead time
      const fm104Runway = runwayNeededForAdequate(14);
      // PM101: 45 day lead time
      const pm101Runway = runwayNeededForAdequate(45);

      expect(fm104Runway).toBe(31.5); // Need 31.5 days
      expect(pm101Runway).toBe(78); // Need 78 days!
    });
  });

  describe('CLTR for all products', () => {
    const productLeadTimes = [
      { sku: 'FM104', leadTime: 14 },
      { sku: 'FB110', leadTime: 21 },
      { sku: 'KMAG101', leadTime: 14 },
      { sku: 'OG106', leadTime: 7 },
      { sku: 'ALF04T', leadTime: 30 },
      { sku: 'CM105', leadTime: 21 },
      { sku: 'MB104M', leadTime: 10 },
      { sku: 'PM101', leadTime: 45 },
    ];

    productLeadTimes.forEach(({ sku, leadTime }) => {
      it(`calculates minimum runway for CLTR > 1 for ${sku}`, () => {
        const minRunway = leadTime + 7; // CLTR = 1 when runway = LT + RP

        expect(calculateCLTR(minRunway, leadTime)).toBe(1);
        expect(calculateCLTR(minRunway - 1, leadTime)).toBeLessThan(1);
        expect(calculateCLTR(minRunway + 1, leadTime)).toBeGreaterThan(1);
      });
    });
  });
});

// ============================================================================
// ORDERING DECISION TESTS
// ============================================================================

describe('Order Decision Logic', () => {
  interface ReorderDecision {
    shouldOrder: boolean;
    reason: string;
    suggestedQty: number;
    urgency: 'CRITICAL' | 'SOON' | 'PLANNED' | 'NONE';
  }

  const makeReorderDecision = (params: {
    currentStock: number;
    onOrder: number;
    reserved: number;
    dailyUsage: number;
    leadTimeDays: number;
    rop: number;
    eoq: number;
    moq: number;
  }): ReorderDecision => {
    const available = params.currentStock + params.onOrder - params.reserved;
    const runway = params.dailyUsage > 0 ? available / params.dailyUsage : Infinity;
    const cltr = runway / (params.leadTimeDays + 7);

    // Decision logic
    if (available <= 0) {
      return {
        shouldOrder: true,
        reason: 'OUT_OF_STOCK',
        suggestedQty: Math.max(params.eoq, params.moq),
        urgency: 'CRITICAL',
      };
    }

    if (available < params.rop) {
      return {
        shouldOrder: true,
        reason: 'BELOW_ROP',
        suggestedQty: Math.max(params.rop - available + params.eoq, params.moq),
        urgency: cltr < 0.5 ? 'CRITICAL' : 'SOON',
      };
    }

    if (cltr < 1.0) {
      return {
        shouldOrder: true,
        reason: 'LOW_CLTR',
        suggestedQty: Math.max(params.eoq, params.moq),
        urgency: 'PLANNED',
      };
    }

    return {
      shouldOrder: false,
      reason: 'ADEQUATE_STOCK',
      suggestedQty: 0,
      urgency: 'NONE',
    };
  };

  describe('order decision scenarios', () => {
    it('orders when out of stock', () => {
      const decision = makeReorderDecision({
        currentStock: 0,
        onOrder: 0,
        reserved: 0,
        dailyUsage: 3,
        leadTimeDays: 14,
        rop: 50,
        eoq: 100,
        moq: 20,
      });

      expect(decision.shouldOrder).toBe(true);
      expect(decision.urgency).toBe('CRITICAL');
      expect(decision.reason).toBe('OUT_OF_STOCK');
    });

    it('orders when below ROP', () => {
      const decision = makeReorderDecision({
        currentStock: 30,
        onOrder: 0,
        reserved: 0,
        dailyUsage: 3,
        leadTimeDays: 14,
        rop: 50,
        eoq: 100,
        moq: 20,
      });

      expect(decision.shouldOrder).toBe(true);
      expect(decision.reason).toBe('BELOW_ROP');
    });

    it('does not order when adequately stocked', () => {
      const decision = makeReorderDecision({
        currentStock: 200,
        onOrder: 0,
        reserved: 0,
        dailyUsage: 3,
        leadTimeDays: 14,
        rop: 50,
        eoq: 100,
        moq: 20,
      });

      expect(decision.shouldOrder).toBe(false);
      expect(decision.urgency).toBe('NONE');
    });

    it('considers on-order quantity', () => {
      // Current 20 + 80 on order = 100 available
      const decision = makeReorderDecision({
        currentStock: 20,
        onOrder: 80,
        reserved: 0,
        dailyUsage: 3,
        leadTimeDays: 14,
        rop: 50,
        eoq: 100,
        moq: 20,
      });

      expect(decision.shouldOrder).toBe(false);
    });

    it('accounts for reserved quantity', () => {
      // Current 100 - 60 reserved = 40 available (below ROP of 50)
      const decision = makeReorderDecision({
        currentStock: 100,
        onOrder: 0,
        reserved: 60,
        dailyUsage: 3,
        leadTimeDays: 14,
        rop: 50,
        eoq: 100,
        moq: 20,
      });

      expect(decision.shouldOrder).toBe(true);
      expect(decision.reason).toBe('BELOW_ROP');
    });
  });

  describe('order quantity suggestions', () => {
    it('suggests at least MOQ', () => {
      const decision = makeReorderDecision({
        currentStock: 0,
        onOrder: 0,
        reserved: 0,
        dailyUsage: 1,
        leadTimeDays: 7,
        rop: 10,
        eoq: 15,
        moq: 50,
      });

      expect(decision.suggestedQty).toBeGreaterThanOrEqual(50);
    });

    it('suggests EOQ when above MOQ', () => {
      const decision = makeReorderDecision({
        currentStock: 0,
        onOrder: 0,
        reserved: 0,
        dailyUsage: 3,
        leadTimeDays: 14,
        rop: 50,
        eoq: 100,
        moq: 20,
      });

      expect(decision.suggestedQty).toBeGreaterThanOrEqual(100);
    });
  });
});

// ============================================================================
// SEASONAL DEMAND ADJUSTMENTS
// ============================================================================

describe('Seasonal Demand Adjustments', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('seasonal index application', () => {
    it('applies spring index (1.8x) correctly', () => {
      const baseWeeklyUsage = 20;
      const springIndex = seasonalIndices.find(s => s.month === 4)!.index_value;

      const adjustedUsage = baseWeeklyUsage * springIndex;

      expect(adjustedUsage).toBe(36); // 20 × 1.8 = 36
    });

    it('applies winter index (0.6x) correctly', () => {
      const baseWeeklyUsage = 20;
      const winterIndex = seasonalIndices.find(s => s.month === 1)!.index_value;

      const adjustedUsage = baseWeeklyUsage * winterIndex;

      expect(adjustedUsage).toBe(12); // 20 × 0.6 = 12
    });

    it('November has Black Friday spike (0.65x, not full lull)', () => {
      const novIndex = seasonalIndices.find(s => s.month === 11)!;

      expect(novIndex.index_value).toBe(0.65);
      expect(novIndex.notes).toContain('Black Friday');
    });
  });

  describe('seasonal ROP adjustments', () => {
    const calculateSeasonalROP = (
      baseWeeklyUsage: number,
      leadTimeDays: number,
      safetyStock: number,
      seasonalIndex: number
    ): number => {
      const adjustedDailyUsage = (baseWeeklyUsage * seasonalIndex) / 7;
      return adjustedDailyUsage * leadTimeDays + safetyStock;
    };

    it('ROP increases during spring rush', () => {
      const baseUsage = 20;
      const leadTime = 14;
      const safety = 30;

      const normalROP = calculateSeasonalROP(baseUsage, leadTime, safety, 1.0);
      const springROP = calculateSeasonalROP(baseUsage, leadTime, safety, 1.8);

      expect(springROP).toBeGreaterThan(normalROP);
      // ROP demand component should increase by 1.8x
      expect(springROP - safety).toBeCloseTo((normalROP - safety) * 1.8, 1);
    });

    it('ROP decreases during winter lull', () => {
      const baseUsage = 20;
      const leadTime = 14;
      const safety = 30;

      const normalROP = calculateSeasonalROP(baseUsage, leadTime, safety, 1.0);
      const winterROP = calculateSeasonalROP(baseUsage, leadTime, safety, 0.6);

      expect(winterROP).toBeLessThan(normalROP);
    });
  });
});
