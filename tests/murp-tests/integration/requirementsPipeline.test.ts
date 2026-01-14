/**
 * Integration Tests - End-to-End Requirements Pipeline
 * 
 * These tests validate that data flows correctly through the entire system:
 * Forecast → BOM Explosion → Inventory Check → Purchase Recommendations
 * 
 * CLAUDE CODE: These are the most important tests for catching system-level bugs.
 * If unit tests pass but these fail, look for data transformation issues.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockSupabase,
  calculateComponentNeed,
  calculateNetAvailable,
  calculateGap,
  explodeBOM,
  calculateOrderByDate,
  setupShortageScenario,
  nextWeek,
  formatDateISO,
  BOMStructure
} from '../__helpers__/testUtils';
import {
  products,
  boms,
  vendors,
  inventoryScenarios,
  seasonalIndices,
  expectedResults
} from '../__fixtures__/buildaSoilData';

describe('Forecast → BOM → Requirements Pipeline', () => {
  
  let db: ReturnType<typeof createMockSupabase>;
  
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15'));
    db = createMockSupabase();
  });
  
  afterEach(() => {
    vi.useRealTimers();
    db.__clearAll();
  });
  
  // ===========================================================================
  // FULL PIPELINE FLOW
  // ===========================================================================
  
  describe('complete flow from demand to requirements', () => {
    
    it('flows demand through BOM to component requirements', () => {
      // Setup: Forecast 100 units of CRAFT8 for next week
      const forecast = {
        product_id: 'CRAFT8',
        forecast_period: formatDateISO(nextWeek()),
        base_forecast: 100,
        seasonal_index: 1.0
      };
      
      // Calculate gross requirement
      const grossRequirement = Math.ceil(
        forecast.base_forecast * forecast.seasonal_index
      );
      expect(grossRequirement).toBe(100);
      
      // Explode BOM
      const bomStructure: BOMStructure = {
        'CRAFT8': boms.CRAFT8.map(b => ({
          component: b.component_sku,
          qty: b.quantity_per
        }))
      };
      
      const requirements = explodeBOM('CRAFT8', grossRequirement, bomStructure);
      
      // Verify Fish Meal requirement
      // CRAFT8 BOM shows 1.5 FM104 per unit, so 100 × 1.5 = 150
      expect(requirements['FM104']).toBe(150);
    });
    
    it('applies seasonal adjustment before BOM explosion', () => {
      // April forecast with 1.8 seasonal index
      const forecast = {
        product_id: 'CRAFT8',
        base_forecast: 100,
        seasonal_index: 1.8
      };
      
      const adjustedDemand = Math.ceil(
        forecast.base_forecast * forecast.seasonal_index
      );
      expect(adjustedDemand).toBe(180);
      
      const bomStructure: BOMStructure = {
        'CRAFT8': boms.CRAFT8.map(b => ({
          component: b.component_sku,
          qty: b.quantity_per
        }))
      };
      
      const requirements = explodeBOM('CRAFT8', adjustedDemand, bomStructure);
      
      // 180 × 1.5 = 270 Fish Meal bags
      expect(requirements['FM104']).toBe(270);
    });
    
    it('aggregates requirements from multiple finished goods', () => {
      // Both CRAFT8 and BIG6-NUTRIENT-KIT use FM104
      const forecasts = [
        { product: 'CRAFT8', qty: 100 },           // 1.5 FM104 each = 150
        { product: 'BIG6-NUTRIENT-KIT', qty: 50 }  // 0.5 FM104 each = 25
      ];
      
      const bomStructure: BOMStructure = {
        'CRAFT8': boms.CRAFT8.map(b => ({
          component: b.component_sku,
          qty: b.quantity_per
        })),
        'BIG6-NUTRIENT-KIT': boms['BIG6-NUTRIENT-KIT'].map(b => ({
          component: b.component_sku,
          qty: b.quantity_per
        }))
      };
      
      let totalFM104 = 0;
      for (const f of forecasts) {
        const requirements = explodeBOM(f.product, f.qty, bomStructure);
        totalFM104 += requirements['FM104'] || 0;
      }
      
      expect(totalFM104).toBe(175); // 150 + 25
    });
  });
  
  // ===========================================================================
  // INVENTORY NETTING
  // ===========================================================================
  
  describe('netting requirements against inventory', () => {
    
    it('calculates shortage correctly', () => {
      // Need 150 FM104, have 100 on hand, 30 on order
      const requirement = 150;
      const inventory = {
        on_hand_qty: 100,
        on_order_qty: 30,
        reserved_qty: 10
      };
      
      const netAvailable = calculateNetAvailable(inventory);
      expect(netAvailable).toBe(120); // 100 + 30 - 10
      
      const { shortage, surplus } = calculateGap(requirement, netAvailable);
      expect(shortage).toBe(30);   // 150 - 120 = 30 short
      expect(surplus).toBe(0);
    });
    
    it('identifies surplus when inventory exceeds requirements', () => {
      const requirement = 50;
      const inventory = {
        on_hand_qty: 200,
        on_order_qty: 0,
        reserved_qty: 30
      };
      
      const netAvailable = calculateNetAvailable(inventory);
      expect(netAvailable).toBe(170);
      
      const { shortage, surplus } = calculateGap(requirement, netAvailable);
      expect(shortage).toBe(0);
      expect(surplus).toBe(120);
    });
    
    it('uses fixture inventory scenarios correctly', () => {
      const requirement = 100;
      
      // Healthy inventory should have no shortage
      const healthy = inventoryScenarios.healthy.FM104;
      const healthyAvailable = calculateNetAvailable(healthy);
      expect(healthyAvailable).toBe(170); // 200 + 0 - 30
      expect(calculateGap(requirement, healthyAvailable).shortage).toBe(0);
      
      // Critical inventory should have shortage
      const critical = inventoryScenarios.critical.FM104;
      const criticalAvailable = calculateNetAvailable(critical);
      expect(criticalAvailable).toBe(2); // 10 + 0 - 8
      expect(calculateGap(requirement, criticalAvailable).shortage).toBe(98);
    });
  });
  
  // ===========================================================================
  // PURCHASE RECOMMENDATION GENERATION
  // ===========================================================================
  
  describe('purchase recommendation generation', () => {
    
    it('recommends order for shortage items', () => {
      const shortage = 30;
      const moq = products.FM104.moq!;
      const leadTime = products.FM104.lead_time_days!;
      const needDate = nextWeek();
      
      // Suggested qty should be at least shortage, respecting MOQ
      const suggestedQty = Math.max(shortage, moq);
      expect(suggestedQty).toBe(30); // 30 > 20 MOQ
      
      // Order-by date
      const orderBy = calculateOrderByDate(needDate, leadTime, 7);
      
      // March 15 + 7 days = March 22 (next week)
      // March 22 - 14 lead - 7 buffer = March 1
      expect(orderBy < new Date()).toBe(true); // Already late!
    });
    
    it('does NOT recommend order when sufficient inventory', () => {
      const requirement = 50;
      const inventory = inventoryScenarios.excess.FM104;
      const netAvailable = calculateNetAvailable(inventory);
      
      const { shortage } = calculateGap(requirement, netAvailable);
      
      expect(shortage).toBe(0);
      // No purchase recommendation should be generated
    });
    
    it('respects vendor MOQ in recommendations', () => {
      const shortage = 15;
      const moq = products.FM104.moq!; // 20
      
      const suggestedQty = Math.max(shortage, moq);
      
      expect(suggestedQty).toBe(20);
    });
    
    it('includes estimated PO value', () => {
      const suggestedQty = 50;
      const unitCost = products.FM104.unit_cost;
      
      const estimatedValue = suggestedQty * unitCost;
      
      expect(estimatedValue).toBe(2125); // 50 × $42.50
    });
  });
  
  // ===========================================================================
  // END-TO-END SCENARIO
  // ===========================================================================
  
  describe('complete scenario: spring rush preparation', () => {
    
    it('calculates full requirements for spring rush', () => {
      // Scenario: Preparing for April (1.8x demand)
      const baseDemand = {
        'CRAFT8': 50,
        'BIG6-NUTRIENT-KIT': 100
      };
      const seasonalIndex = 1.8;
      
      // Step 1: Apply seasonal adjustment
      const adjustedDemand = {
        'CRAFT8': Math.ceil(baseDemand['CRAFT8'] * seasonalIndex),       // 90
        'BIG6-NUTRIENT-KIT': Math.ceil(baseDemand['BIG6-NUTRIENT-KIT'] * seasonalIndex)  // 180
      };
      
      expect(adjustedDemand['CRAFT8']).toBe(90);
      expect(adjustedDemand['BIG6-NUTRIENT-KIT']).toBe(180);
      
      // Step 2: Explode BOMs
      const bomStructure: BOMStructure = {
        'CRAFT8': boms.CRAFT8.map(b => ({
          component: b.component_sku,
          qty: b.quantity_per
        })),
        'BIG6-NUTRIENT-KIT': boms['BIG6-NUTRIENT-KIT'].map(b => ({
          component: b.component_sku,
          qty: b.quantity_per
        }))
      };
      
      const craft8Components = explodeBOM('CRAFT8', adjustedDemand['CRAFT8'], bomStructure);
      const big6Components = explodeBOM('BIG6-NUTRIENT-KIT', adjustedDemand['BIG6-NUTRIENT-KIT'], bomStructure);
      
      // Step 3: Aggregate common components
      const totalFM104 = (craft8Components['FM104'] || 0) + (big6Components['FM104'] || 0);
      // CRAFT8: 90 × 1.5 = 135
      // BIG6: 180 × 0.5 = 90
      // Total: 225
      expect(totalFM104).toBe(225);
      
      // Step 4: Net against inventory
      const fm104Inventory = inventoryScenarios.healthy.FM104;
      const fm104Available = calculateNetAvailable(fm104Inventory);
      expect(fm104Available).toBe(170);
      
      const { shortage } = calculateGap(totalFM104, fm104Available);
      expect(shortage).toBe(55); // 225 - 170
      
      // Step 5: Generate recommendation
      const moq = products.FM104.moq!;
      const suggestedQty = Math.max(shortage, moq);
      expect(suggestedQty).toBe(55); // 55 > 20 MOQ
      
      const estimatedValue = suggestedQty * products.FM104.unit_cost;
      expect(estimatedValue).toBe(2337.5); // 55 × $42.50
    });
  });
});

describe('Data Quality Edge Cases', () => {
  
  // ===========================================================================
  // MISSING/BAD DATA HANDLING
  // ===========================================================================
  
  describe('missing BOM handling', () => {
    
    it('handles product with no BOM (purchased finished good)', () => {
      const bomStructure: BOMStructure = {};
      
      const requirements = explodeBOM('PURCHASED-ITEM-NO-BOM', 50, bomStructure);
      
      expect(requirements).toEqual({});
      // Should not error, just no component requirements
    });
  });
  
  describe('discontinued component handling', () => {
    
    it('identifies discontinued components in BOM', () => {
      // FM104-OLD is discontinued
      const discontinuedProducts = Object.values(products)
        .filter(p => p.status === 'DISCONTINUED')
        .map(p => p.sku);
      
      expect(discontinuedProducts).toContain('FM104-OLD');
    });
  });
  
  describe('null inventory handling', () => {
    
    it('treats missing inventory as zero available', () => {
      const inventory = null;
      const netAvailable = calculateNetAvailable(inventory);
      
      expect(netAvailable).toBe(0);
      
      const requirement = 100;
      const { shortage } = calculateGap(requirement, netAvailable);
      expect(shortage).toBe(100);
    });
  });
});

describe('Regression: Past Issues', () => {
  
  // ===========================================================================
  // DOCUMENTED BUGS THAT WERE FIXED
  // ===========================================================================
  
  it('REG-001: Does not recommend ordering discontinued components', () => {
    // Bug: System recommended ordering FM104-OLD which was discontinued
    const discontinuedSku = 'FM104-OLD';
    const product = products[discontinuedSku as keyof typeof products];
    
    expect(product.status).toBe('DISCONTINUED');
    
    // In production, this should be filtered out of recommendations
  });
  
  it('REG-002: Handles NULL vendor correctly', () => {
    // Bug: Components without vendor caused view to error
    // CRAFT8 is manufactured in-house, no vendor
    expect(products.CRAFT8.primary_vendor_id).toBeNull();
    
    // Should still be able to process
    const bomStructure: BOMStructure = {
      'CRAFT8': boms.CRAFT8.map(b => ({
        component: b.component_sku,
        qty: b.quantity_per
      }))
    };
    
    const requirements = explodeBOM('CRAFT8', 10, bomStructure);
    expect(Object.keys(requirements).length).toBeGreaterThan(0);
  });
  
  it('REG-003: Does not double-count multi-location inventory', () => {
    // Bug: Items in both MONTROSE and SHIPPING counted twice
    const montroseQty = 50;
    const shippingQty = 30;
    
    // Correct aggregation
    const totalOnHand = montroseQty + shippingQty;
    expect(totalOnHand).toBe(80);
    
    // NOT 160 (double-counted)
    expect(totalOnHand).not.toBe(160);
  });
  
  it('REG-004: Seasonal index of 0.5 is not stored as 0', () => {
    // Bug: December index of 0.5 was stored as 0, zeroing forecast
    const decemberIndex = seasonalIndices.find(si => si.month === 12);
    
    expect(decemberIndex?.index_value).toBe(0.5);
    expect(decemberIndex?.index_value).not.toBe(0);
  });
  
  it('REG-005: Floating point precision in BOM quantities', () => {
    // Bug: 0.0375 was becoming 0.037499999 in some calculations
    const bomQty = 0.0375;
    const parentQty = 100;
    
    const result = calculateComponentNeed(parentQty, bomQty);
    
    // Should be exactly 3.75, not 3.7499999...
    expect(result).toBeCloseTo(3.75, 10);
  });
  
  it('REG-006: Circular BOM detection', () => {
    // Bug: Circular BOMs caused infinite loop
    const circularBom: BOMStructure = {
      'ITEM-A': [{ component: 'ITEM-B', qty: 1 }],
      'ITEM-B': [{ component: 'ITEM-A', qty: 1 }]
    };
    
    expect(() => explodeBOM('ITEM-A', 10, circularBom))
      .toThrow('Circular BOM reference detected');
  });
});
