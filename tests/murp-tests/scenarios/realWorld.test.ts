/**
 * Real-World Scenario Tests
 * 
 * These tests simulate actual business situations:
 * - Spring rush preparation
 * - Vendor outages
 * - Critical stockouts
 * - Large batch production
 * 
 * CLAUDE CODE: These are your "smoke tests" for production readiness.
 * If these pass, the system can handle real BuildASoil scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockSupabase,
  explodeBOM,
  calculateNetAvailable,
  calculateGap,
  calculateOrderByDate,
  aggregateComponentNeeds,
  roundTo,
  formatDateISO,
  BOMStructure
} from '../__helpers__/testUtils';
import {
  products,
  boms,
  vendors,
  inventoryScenarios,
  seasonalIndices
} from '../__fixtures__/buildaSoilData';

describe('Spring Rush Scenario', () => {
  
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-02-15')); // One month before rush
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });
  
  // ===========================================================================
  // PREPARING FOR 2X DEMAND
  // ===========================================================================
  
  describe('handling 2x demand spike', () => {
    
    it('correctly identifies total component needs for spring', () => {
      // April through May is 1.8-1.9x normal demand
      // Calculate 3-month needs (March, April, May)
      
      const monthlyBasedemand = { 'CRAFT8': 50 };
      const springIndices = [1.4, 1.8, 1.9]; // March, April, May
      
      let totalCraft8Demand = 0;
      for (const index of springIndices) {
        totalCraft8Demand += Math.ceil(monthlyBasedemand['CRAFT8'] * index);
      }
      
      // 70 + 90 + 95 = 255 units over 3 months
      expect(totalCraft8Demand).toBe(255);
      
      // Explode to components
      const bomStructure: BOMStructure = {
        'CRAFT8': boms.CRAFT8.map(b => ({
          component: b.component_sku,
          qty: b.quantity_per
        }))
      };
      
      const requirements = explodeBOM('CRAFT8', totalCraft8Demand, bomStructure);
      
      // 255 × 1.5 = 382.5 Fish Meal bags
      expect(requirements['FM104']).toBe(382.5);
    });
    
    it('identifies long lead time items that must be ordered NOW', () => {
      // Peat Moss has 45 day lead time
      // For March 15 need date:
      // Order by: March 15 - 45 - 7 = January 22
      
      const needDate = new Date('2024-03-15');
      const peatLeadTime = vendors.vendor_premier.lead_time_days;
      
      const orderBy = calculateOrderByDate(needDate, peatLeadTime, 7);
      
      // On Feb 15, this is already past!
      expect(orderBy < new Date()).toBe(true);
      
      const daysLate = Math.ceil(
        (new Date().getTime() - orderBy.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysLate).toBeGreaterThan(20);
    });
    
    it('short lead time items still have time', () => {
      // Gypsum has 7 day lead time
      const needDate = new Date('2024-03-15');
      const gypsumLeadTime = vendors.vendor_diamondk.lead_time_days;
      
      const orderBy = calculateOrderByDate(needDate, gypsumLeadTime, 7);
      
      // March 15 - 7 - 7 = March 1
      // On Feb 15, we still have 2 weeks
      expect(orderBy > new Date()).toBe(true);
    });
  });
});

describe('Vendor Outage Scenario', () => {
  
  // ===========================================================================
  // SINGLE SOURCE RISK
  // ===========================================================================
  
  describe('Neptune Harvest outage impact', () => {
    
    it('identifies all components from Neptune Harvest', () => {
      const neptuneComponents = Object.values(products)
        .filter(p => p.primary_vendor_id === 'vendor_neptune')
        .map(p => p.sku);
      
      expect(neptuneComponents).toContain('FM104');  // Fish Meal
      expect(neptuneComponents).toContain('CM105');  // Crustacean Meal
    });
    
    it('identifies finished goods affected by Neptune outage', () => {
      const neptuneComponents = ['FM104', 'CM105'];
      
      // Find all parent SKUs that use these components
      const affectedParents = new Set<string>();
      
      for (const [parentSku, bomLines] of Object.entries(boms)) {
        for (const line of bomLines) {
          if (neptuneComponents.includes(line.component_sku)) {
            affectedParents.add(parentSku);
          }
        }
      }
      
      expect(affectedParents.has('CRAFT8')).toBe(true);
      expect(affectedParents.has('BIG6-NUTRIENT-KIT')).toBe(true);
    });
    
    it('calculates days until stockout without vendor', () => {
      // If Neptune can't ship, how long until we run out of FM104?
      const fm104Inventory = inventoryScenarios.healthy.FM104;
      const netAvailable = calculateNetAvailable(fm104Inventory);
      
      const dailyUsage = 10; // Assume 10 bags per day
      const daysUntilOut = Math.floor(netAvailable / dailyUsage);
      
      expect(daysUntilOut).toBe(17); // 170 / 10 = 17 days
    });
  });
  
  // ===========================================================================
  // ALTERNATE VENDOR SCENARIOS
  // ===========================================================================
  
  describe('alternate vendor identification', () => {
    
    it('identifies components with single source (high risk)', () => {
      // In reality, you'd query for all products per vendor
      // Here we check our fixture data
      
      const singleSourceComponents: string[] = [];
      
      // FM104 only comes from Neptune
      const fm104Vendors = Object.values(products)
        .filter(p => p.sku === 'FM104' || p.sku.startsWith('FM104-ALT'));
      
      if (fm104Vendors.length === 1) {
        singleSourceComponents.push('FM104');
      }
      
      // In our fixture, FM104 is single source
      expect(singleSourceComponents).toContain('FM104');
    });
  });
});

describe('Critical Stockout Scenario', () => {
  
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-04-01')); // Peak season
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });
  
  // ===========================================================================
  // OUT OF STOCK CRISIS
  // ===========================================================================
  
  describe('handling out of stock components', () => {
    
    it('identifies completely out of stock items', () => {
      const critical = inventoryScenarios.critical;
      
      const outOfStock = Object.entries(critical)
        .filter(([_, inv]) => calculateNetAvailable(inv) <= 0)
        .map(([sku]) => sku);
      
      expect(outOfStock).toContain('MB104M'); // Malted Barley is at 0
    });
    
    it('identifies oversold items (worse than out of stock)', () => {
      const oversold = inventoryScenarios.oversold;
      
      const oversoldItems = Object.entries(oversold)
        .filter(([_, inv]) => calculateNetAvailable(inv) < 0)
        .map(([sku, inv]) => ({
          sku,
          shortfall: Math.abs(calculateNetAvailable(inv))
        }));
      
      expect(oversoldItems.length).toBeGreaterThan(0);
      
      const fm104 = oversoldItems.find(i => i.sku === 'FM104');
      expect(fm104?.shortfall).toBe(30);
    });
    
    it('calculates how many finished goods are blocked', () => {
      // If FM104 is out, how many CRAFT8 can't we build?
      const fm104Shortage = 30; // From oversold scenario
      const fm104PerCraft8 = 1.5;
      
      const blockedCraft8 = Math.floor(fm104Shortage / fm104PerCraft8);
      
      expect(blockedCraft8).toBe(20); // Can't build 20 CRAFT8
    });
  });
  
  // ===========================================================================
  // EMERGENCY ORDERING
  // ===========================================================================
  
  describe('emergency order calculations', () => {
    
    it('identifies components that need expedited shipping', () => {
      // When stock is critical and lead time exceeds stock days
      const fm104Inventory = inventoryScenarios.critical.FM104;
      const netAvailable = calculateNetAvailable(fm104Inventory);
      const dailyUsage = 10;
      const daysOfStock = Math.floor(netAvailable / dailyUsage);
      const normalLeadTime = vendors.vendor_neptune.lead_time_days;
      
      const needsExpedite = daysOfStock < normalLeadTime;
      
      expect(daysOfStock).toBeLessThan(normalLeadTime);
      expect(needsExpedite).toBe(true);
    });
    
    it('calculates rush order quantity to cover gap', () => {
      // Current: 2 units available
      // Daily usage: 10
      // Lead time: 14 days
      // Need to cover: 14 days × 10 = 140 units
      // Plus safety: 7 days × 10 = 70 units
      
      const netAvailable = 2;
      const dailyUsage = 10;
      const leadTime = 14;
      const safetyDays = 7;
      
      const coverageDays = leadTime + safetyDays;
      const totalNeed = coverageDays * dailyUsage;
      const orderQty = Math.max(0, totalNeed - netAvailable);
      
      expect(orderQty).toBe(208); // 210 - 2
    });
  });
});

describe('Large Batch Production Scenario', () => {
  
  // ===========================================================================
  // BUILDING 30 TOTES OF CRAFT8
  // ===========================================================================
  
  describe('30 tote CRAFT8 production run', () => {
    
    it('calculates all component requirements for 30 totes', () => {
      const bomStructure: BOMStructure = {
        'CRAFT8': boms.CRAFT8.map(b => ({
          component: b.component_sku,
          qty: b.quantity_per
        }))
      };
      
      const requirements = explodeBOM('CRAFT8', 30, bomStructure);
      
      // Validate against expected results
      expect(requirements['FM104']).toBe(45);              // 30 × 1.5
      expect(requirements['KMAG101']).toBe(45);            // 30 × 1.5
      expect(roundTo(requirements['ALF04T'], 4)).toBe(1.125);   // 30 × 0.0375
      expect(roundTo(requirements['MB104M'], 2)).toBe(40.91);   // 30 × 1.363636
      expect(roundTo(requirements['CM105'], 4)).toBe(1.125);    // 30 × 0.0375
      expect(roundTo(requirements['FB110'], 4)).toBe(3.375);    // 30 × 0.1125
      expect(roundTo(requirements['OG106'], 4)).toBe(1.125);    // 30 × 0.0375
    });
    
    it('identifies which components are short for the build', () => {
      const bomStructure: BOMStructure = {
        'CRAFT8': boms.CRAFT8.map(b => ({
          component: b.component_sku,
          qty: b.quantity_per
        }))
      };
      
      const requirements = explodeBOM('CRAFT8', 30, bomStructure);
      const healthyInventory = inventoryScenarios.healthy;
      
      const shortages: Array<{sku: string, need: number, have: number, short: number}> = [];
      
      for (const [sku, need] of Object.entries(requirements)) {
        const inv = healthyInventory[sku as keyof typeof healthyInventory];
        if (inv) {
          const available = calculateNetAvailable(inv);
          if (need > available) {
            shortages.push({
              sku,
              need,
              have: available,
              short: need - available
            });
          }
        }
      }
      
      // With healthy inventory, most should be covered
      // Check FB110 (Fish Bone Meal) - we need 3.375, healthy has 2
      const fb110 = shortages.find(s => s.sku === 'FB110');
      expect(fb110).toBeDefined();
      expect(fb110!.short).toBeCloseTo(1.375, 2);
    });
    
    it('calculates total material cost for the batch', () => {
      const requirements = {
        FM104: 45,
        KMAG101: 45,
        ALF04T: 1.125,
        MB104M: 40.91,
        CM105: 1.125,
        FB110: 3.375,
        OG106: 1.125
      };
      
      let totalCost = 0;
      
      for (const [sku, qty] of Object.entries(requirements)) {
        const product = products[sku as keyof typeof products];
        if (product) {
          totalCost += qty * product.unit_cost;
        }
      }
      
      // Validate against expected per-unit cost × 30
      expect(totalCost).toBeGreaterThan(15000);
      expect(totalCost).toBeLessThan(20000);
    });
  });
  
  // ===========================================================================
  // BUILD FEASIBILITY CHECK
  // ===========================================================================
  
  describe('build feasibility validation', () => {
    
    it('determines if build is immediately feasible', () => {
      const bomStructure: BOMStructure = {
        'CRAFT8': boms.CRAFT8.map(b => ({
          component: b.component_sku,
          qty: b.quantity_per
        }))
      };
      
      const requirements = explodeBOM('CRAFT8', 30, bomStructure);
      const healthyInventory = inventoryScenarios.healthy;
      
      let isFeasible = true;
      const blockers: string[] = [];
      
      for (const [sku, need] of Object.entries(requirements)) {
        const inv = healthyInventory[sku as keyof typeof healthyInventory];
        if (inv) {
          const available = calculateNetAvailable(inv);
          if (need > available) {
            isFeasible = false;
            blockers.push(sku);
          }
        } else {
          // No inventory record = not feasible
          isFeasible = false;
          blockers.push(sku);
        }
      }
      
      // With healthy inventory, should be mostly feasible except FB110
      expect(blockers).toContain('FB110');
    });
    
    it('calculates maximum buildable quantity', () => {
      const bomStructure: BOMStructure = {
        'CRAFT8': boms.CRAFT8.map(b => ({
          component: b.component_sku,
          qty: b.quantity_per
        }))
      };
      
      const healthyInventory = inventoryScenarios.healthy;
      
      let maxBuildable = Infinity;
      
      for (const bomLine of boms.CRAFT8) {
        const inv = healthyInventory[bomLine.component_sku as keyof typeof healthyInventory];
        if (inv) {
          const available = calculateNetAvailable(inv);
          const canBuild = Math.floor(available / bomLine.quantity_per);
          maxBuildable = Math.min(maxBuildable, canBuild);
        }
      }
      
      // FB110 is the bottleneck: 2 available / 0.1125 per unit = 17.7
      expect(maxBuildable).toBe(17);
    });
  });
});

describe('Multi-Product Aggregation Scenario', () => {
  
  // ===========================================================================
  // WEEKLY PRODUCTION SCHEDULE
  // ===========================================================================
  
  describe('aggregating weekly production needs', () => {
    
    it('consolidates component needs across multiple products', () => {
      const weeklySchedule = [
        { product: 'CRAFT8', qty: 20 },
        { product: 'BIG6-NUTRIENT-KIT', qty: 50 }
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
      
      const aggregated = aggregateComponentNeeds(weeklySchedule, bomStructure);
      
      // FM104: (20 × 1.5) + (50 × 0.5) = 30 + 25 = 55
      expect(aggregated['FM104']).toBe(55);
      
      // KMAG101: (20 × 1.5) + (50 × 0.4) = 30 + 20 = 50
      expect(aggregated['KMAG101']).toBe(50);
    });
    
    it('identifies unique components per product', () => {
      // CRAFT8 has components that BIG6 doesn't use
      const craft8Components = new Set(boms.CRAFT8.map(b => b.component_sku));
      const big6Components = new Set(boms['BIG6-NUTRIENT-KIT'].map(b => b.component_sku));
      
      const craft8Only = [...craft8Components].filter(c => !big6Components.has(c));
      const big6Only = [...big6Components].filter(c => !craft8Components.has(c));
      const shared = [...craft8Components].filter(c => big6Components.has(c));
      
      expect(shared).toContain('FM104');
      expect(shared).toContain('KMAG101');
      expect(craft8Only.length).toBeGreaterThan(0);
    });
  });
});
