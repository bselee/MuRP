/**
 * BOM Explosion Tests
 * 
 * These tests validate the most critical calculations in the system:
 * how finished goods demand translates to component requirements.
 * 
 * CLAUDE CODE: If you're debugging requirements issues, start here.
 * The math in these tests must match Finale's BOM structure exactly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateComponentNeed,
  roundForOrdering,
  explodeBOM,
  aggregateComponentNeeds,
  roundTo,
  BOMStructure
} from '../__helpers__/testUtils';
import {
  boms,
  products,
  expectedResults
} from '../__fixtures__/buildaSoilData';

describe('BOM Explosion Logic', () => {
  
  // ===========================================================================
  // QUANTITY PER PARENT MULTIPLICATION
  // ===========================================================================
  
  describe('quantity_per_parent multiplication', () => {
    
    it('correctly calculates component needs for whole number ratios', () => {
      // CRAFT8 needs 1.5 units of FM104 (Fish Meal 50lb) per tote
      const parentQty = 30; // Build 30 totes
      const qtyPerParent = 1.5;
      
      const result = calculateComponentNeed(parentQty, qtyPerParent);
      
      expect(result).toBe(45); // 30 × 1.5 = 45 bags
    });
    
    it('correctly handles fractional tote quantities', () => {
      // CRAFT8 needs 0.0375 of ALF04T (Alfalfa Tote) per unit
      // This means 1 alfalfa tote makes ~26.67 CRAFT8 units
      const parentQty = 30;
      const qtyPerParent = 0.0375;
      
      const result = calculateComponentNeed(parentQty, qtyPerParent);
      
      expect(result).toBeCloseTo(1.125, 4); // 30 × 0.0375 = 1.125 totes
    });
    
    it('correctly handles very small fractional quantities', () => {
      // Edge case: micro-nutrient that's 0.001 per parent
      const parentQty = 10000;
      const qtyPerParent = 0.001;
      
      const result = calculateComponentNeed(parentQty, qtyPerParent);
      
      expect(result).toBe(10);
    });
    
    it('handles zero parent quantity without dividing by zero', () => {
      const parentQty = 0;
      const qtyPerParent = 1.5;
      
      const result = calculateComponentNeed(parentQty, qtyPerParent);
      
      expect(result).toBe(0);
      expect(Number.isFinite(result)).toBe(true);
    });
    
    it('handles null qtyPerParent gracefully', () => {
      const parentQty = 30;
      const qtyPerParent = null;
      
      expect(() => calculateComponentNeed(parentQty, qtyPerParent))
        .toThrow('Invalid BOM: missing quantity_per_parent');
    });
    
    it('handles undefined qtyPerParent gracefully', () => {
      const parentQty = 30;
      const qtyPerParent = undefined;
      
      expect(() => calculateComponentNeed(parentQty, qtyPerParent))
        .toThrow('Invalid BOM: missing quantity_per_parent');
    });
    
    it('handles negative quantities (should still calculate)', () => {
      // Negative could indicate a credit/return scenario
      const parentQty = -10;
      const qtyPerParent = 2;
      
      const result = calculateComponentNeed(parentQty, qtyPerParent);
      
      expect(result).toBe(-20);
    });
  });
  
  // ===========================================================================
  // ROUNDING FOR ORDERING
  // ===========================================================================
  
  describe('rounding for discrete units', () => {
    
    it('rounds UP for discrete units (bags, boxes)', () => {
      // Can't order 1.125 totes - need to round appropriately
      const rawNeed = 1.125;
      const isDiscrete = true;
      
      const orderQty = roundForOrdering(rawNeed, isDiscrete);
      
      expect(orderQty).toBe(2); // Must order 2 full units
    });
    
    it('does not round continuous units (liquids, bulk)', () => {
      const rawNeed = 1.125;
      const isDiscrete = false;
      
      const orderQty = roundForOrdering(rawNeed, isDiscrete);
      
      expect(orderQty).toBe(1.125);
    });
    
    it('rounds up to case pack quantity', () => {
      const rawNeed = 75;
      const isDiscrete = true;
      const casePack = 24;
      
      const orderQty = roundForOrdering(rawNeed, isDiscrete, casePack);
      
      // 75 / 24 = 3.125 → round up to 4 cases → 96 units
      expect(orderQty).toBe(96);
    });
    
    it('handles case pack of 1 (no rounding change)', () => {
      const rawNeed = 7.3;
      const isDiscrete = true;
      const casePack = 1;
      
      const orderQty = roundForOrdering(rawNeed, isDiscrete, casePack);
      
      expect(orderQty).toBe(8); // Just ceiling
    });
    
    it('handles exact case pack multiple', () => {
      const rawNeed = 48; // Exactly 2 cases of 24
      const isDiscrete = true;
      const casePack = 24;
      
      const orderQty = roundForOrdering(rawNeed, isDiscrete, casePack);
      
      expect(orderQty).toBe(48); // No change needed
    });
  });
  
  // ===========================================================================
  // FULL BOM EXPLOSION
  // ===========================================================================
  
  describe('full BOM explosion', () => {
    
    it('explodes CRAFT8 BOM correctly for 30 units', () => {
      // Convert our fixture format to the helper format
      const bomStructure: BOMStructure = {
        'CRAFT8': boms.CRAFT8.map(b => ({
          component: b.component_sku,
          qty: b.quantity_per
        }))
      };
      
      const result = explodeBOM('CRAFT8', 30, bomStructure);
      
      // Validate against expected results
      expect(roundTo(result['FM104'], 2)).toBe(45);        // 30 × 1.5
      expect(roundTo(result['KMAG101'], 2)).toBe(45);      // 30 × 1.5
      expect(roundTo(result['ALF04T'], 4)).toBe(1.125);    // 30 × 0.0375
      expect(roundTo(result['MB104M'], 2)).toBe(40.91);    // 30 × 1.363636
      expect(roundTo(result['CM105'], 4)).toBe(1.125);     // 30 × 0.0375
      expect(roundTo(result['FB110'], 4)).toBe(3.375);     // 30 × 0.1125
      expect(roundTo(result['OG106'], 4)).toBe(1.125);     // 30 × 0.0375
    });
    
    it('returns all 7 components for CRAFT8', () => {
      const bomStructure: BOMStructure = {
        'CRAFT8': boms.CRAFT8.map(b => ({
          component: b.component_sku,
          qty: b.quantity_per
        }))
      };
      
      const result = explodeBOM('CRAFT8', 1, bomStructure);
      
      expect(Object.keys(result).length).toBe(7);
      expect(Object.keys(result).sort()).toEqual([
        'ALF04T', 'CM105', 'FB110', 'FM104', 'KMAG101', 'MB104M', 'OG106'
      ]);
    });
    
    it('returns empty object for product with no BOM', () => {
      const bomStructure: BOMStructure = {};
      
      const result = explodeBOM('UNKNOWN-SKU', 100, bomStructure);
      
      expect(result).toEqual({});
    });
    
    it('handles zero quantity build', () => {
      const bomStructure: BOMStructure = {
        'CRAFT8': boms.CRAFT8.map(b => ({
          component: b.component_sku,
          qty: b.quantity_per
        }))
      };
      
      const result = explodeBOM('CRAFT8', 0, bomStructure);
      
      // All values should be 0
      Object.values(result).forEach(qty => {
        expect(qty).toBe(0);
      });
    });
  });
  
  // ===========================================================================
  // NESTED BOM EXPLOSION (Sub-Assemblies)
  // ===========================================================================
  
  describe('nested BOM explosion', () => {
    
    it('explodes nested BOMs correctly (sub-assemblies)', () => {
      // Scenario: Finished Good A contains Sub-Assembly B
      // Sub-Assembly B contains Raw Material C
      // A needs 2 of B, B needs 3 of C
      // Building 10 of A should require 60 of C
      
      const bomStructure: BOMStructure = {
        'FG-A': [{ component: 'SUB-B', qty: 2 }],
        'SUB-B': [{ component: 'RAW-C', qty: 3 }]
      };
      
      const result = explodeBOM('FG-A', 10, bomStructure);
      
      expect(result['RAW-C']).toBe(60); // 10 × 2 × 3
    });
    
    it('handles 3-level deep nesting', () => {
      const bomStructure: BOMStructure = {
        'LEVEL-1': [{ component: 'LEVEL-2', qty: 2 }],
        'LEVEL-2': [{ component: 'LEVEL-3', qty: 3 }],
        'LEVEL-3': [{ component: 'RAW', qty: 4 }]
      };
      
      const result = explodeBOM('LEVEL-1', 5, bomStructure);
      
      expect(result['RAW']).toBe(120); // 5 × 2 × 3 × 4
    });
    
    it('handles circular BOM references without infinite loop', () => {
      // Bad data: A contains B, B contains A
      const circularBom: BOMStructure = {
        'ITEM-A': [{ component: 'ITEM-B', qty: 1 }],
        'ITEM-B': [{ component: 'ITEM-A', qty: 1 }]
      };
      
      expect(() => explodeBOM('ITEM-A', 10, circularBom))
        .toThrow('Circular BOM reference detected');
    });
    
    it('handles self-referential BOM', () => {
      // Really bad data: A contains A
      const selfRefBom: BOMStructure = {
        'ITEM-A': [{ component: 'ITEM-A', qty: 0.5 }]
      };
      
      expect(() => explodeBOM('ITEM-A', 10, selfRefBom))
        .toThrow('Circular BOM reference detected');
    });
  });
  
  // ===========================================================================
  // COMPONENT AGGREGATION (Multiple Parents)
  // ===========================================================================
  
  describe('component aggregation across parents', () => {
    
    it('aggregates same component from multiple parents', () => {
      // Both CRAFT8 and BIG6-NUTRIENT-KIT use FM104 (Fish Meal)
      const bomStructure: BOMStructure = {
        'CRAFT8': boms.CRAFT8.map(b => ({ component: b.component_sku, qty: b.quantity_per })),
        'BIG6-NUTRIENT-KIT': boms['BIG6-NUTRIENT-KIT'].map(b => ({
          component: b.component_sku,
          qty: b.quantity_per
        }))
      };
      
      const demands = [
        { product: 'CRAFT8', qty: 30 },           // Uses 1.5 FM104 each = 45
        { product: 'BIG6-NUTRIENT-KIT', qty: 20 } // Uses 0.5 FM104 each = 10
      ];
      
      const result = aggregateComponentNeeds(demands, bomStructure);
      
      expect(result['FM104']).toBe(55); // 45 + 10
    });
    
    it('keeps unique components separate', () => {
      const bomStructure: BOMStructure = {
        'PROD-A': [{ component: 'COMP-X', qty: 1 }],
        'PROD-B': [{ component: 'COMP-Y', qty: 1 }]
      };
      
      const demands = [
        { product: 'PROD-A', qty: 10 },
        { product: 'PROD-B', qty: 20 }
      ];
      
      const result = aggregateComponentNeeds(demands, bomStructure);
      
      expect(result['COMP-X']).toBe(10);
      expect(result['COMP-Y']).toBe(20);
    });
    
    it('handles empty demands array', () => {
      const bomStructure: BOMStructure = {
        'CRAFT8': boms.CRAFT8.map(b => ({ component: b.component_sku, qty: b.quantity_per }))
      };
      
      const result = aggregateComponentNeeds([], bomStructure);
      
      expect(result).toEqual({});
    });
  });
  
  // ===========================================================================
  // EDGE CASES & DATA QUALITY
  // ===========================================================================
  
  describe('data quality edge cases', () => {
    
    it('handles extremely large BOM quantities without overflow', () => {
      const bomStructure: BOMStructure = {
        'BULK': [{ component: 'MICRO', qty: 0.0001 }]
      };
      
      const result = explodeBOM('BULK', 1000000, bomStructure);
      
      expect(result['MICRO']).toBe(100);
      expect(Number.isFinite(result['MICRO'])).toBe(true);
    });
    
    it('handles very small quantities without precision loss', () => {
      const bomStructure: BOMStructure = {
        'PARENT': [{ component: 'TRACE', qty: 0.000001 }]
      };
      
      const result = explodeBOM('PARENT', 1000000, bomStructure);
      
      expect(result['TRACE']).toBeCloseTo(1, 6);
    });
    
    it('handles BOM with zero quantity component (should probably be removed)', () => {
      const bomWithZero: BOMStructure = {
        'PARENT': [
          { component: 'COMP-A', qty: 1 },
          { component: 'COMP-ZERO', qty: 0 } // Invalid entry
        ]
      };
      
      const result = explodeBOM('PARENT', 10, bomWithZero);
      
      expect(result['COMP-A']).toBe(10);
      expect(result['COMP-ZERO']).toBe(0); // Still included, but 0
    });
  });
  
  // ===========================================================================
  // COST CALCULATION VALIDATION
  // ===========================================================================
  
  describe('component cost calculations', () => {
    
    it('calculates total component cost per parent unit', () => {
      const craft8Bom = boms.CRAFT8;
      let totalCost = 0;
      
      for (const bomLine of craft8Bom) {
        const component = products[bomLine.component_sku as keyof typeof products];
        if (component) {
          const lineCost = bomLine.quantity_per * component.unit_cost;
          totalCost += lineCost;
        }
      }
      
      // Should be close to our expected value
      expect(roundTo(totalCost, 2)).toBeCloseTo(
        expectedResults.craft8_unitCost.total,
        1
      );
    });
    
    it('calculates individual component cost contributions', () => {
      const fm104Bom = boms.CRAFT8.find(b => b.component_sku === 'FM104')!;
      const fm104Product = products.FM104;
      
      const costContribution = fm104Bom.quantity_per * fm104Product.unit_cost;
      
      expect(roundTo(costContribution, 2)).toBe(
        expectedResults.craft8_unitCost.FM104
      );
    });
  });
});
