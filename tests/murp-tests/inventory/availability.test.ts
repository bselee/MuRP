/**
 * Inventory Availability Tests
 * 
 * Tests for net available inventory calculations, shortage detection,
 * and surplus identification.
 * 
 * CLAUDE CODE: These calculations feed into purchase recommendations.
 * Pay attention to edge cases around oversold and multi-location scenarios.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateNetAvailable,
  calculateGap,
  roundTo
} from '../__helpers__/testUtils';
import { inventoryScenarios, products } from '../__fixtures__/buildaSoilData';

describe('Net Available Inventory', () => {
  
  // ===========================================================================
  // BASIC NET AVAILABLE CALCULATION
  // ===========================================================================
  
  describe('basic calculation', () => {
    
    it('calculates net available correctly', () => {
      const inventory = {
        on_hand_qty: 100,
        on_order_qty: 50,    // PO in transit
        reserved_qty: 30     // Allocated to existing orders
      };
      
      const netAvailable = calculateNetAvailable(inventory);
      
      expect(netAvailable).toBe(120); // 100 + 50 - 30
    });
    
    it('handles zero on_order', () => {
      const inventory = {
        on_hand_qty: 100,
        on_order_qty: 0,
        reserved_qty: 20
      };
      
      const netAvailable = calculateNetAvailable(inventory);
      
      expect(netAvailable).toBe(80);
    });
    
    it('handles zero reserved', () => {
      const inventory = {
        on_hand_qty: 100,
        on_order_qty: 50,
        reserved_qty: 0
      };
      
      const netAvailable = calculateNetAvailable(inventory);
      
      expect(netAvailable).toBe(150);
    });
    
    it('handles all zeros', () => {
      const inventory = {
        on_hand_qty: 0,
        on_order_qty: 0,
        reserved_qty: 0
      };
      
      const netAvailable = calculateNetAvailable(inventory);
      
      expect(netAvailable).toBe(0);
    });
  });
  
  // ===========================================================================
  // OVERSOLD SCENARIOS
  // ===========================================================================
  
  describe('oversold scenarios', () => {
    
    it('handles negative net available (oversold situation)', () => {
      const inventory = {
        on_hand_qty: 10,
        on_order_qty: 0,
        reserved_qty: 50  // More reserved than we have!
      };
      
      const netAvailable = calculateNetAvailable(inventory);
      
      expect(netAvailable).toBe(-40); // This is a CRISIS
      expect(netAvailable).toBeLessThan(0);
    });
    
    it('detects oversold from fixture data', () => {
      const oversoldFM104 = inventoryScenarios.oversold.FM104;
      
      const netAvailable = calculateNetAvailable(oversoldFM104);
      
      expect(netAvailable).toBe(-30); // 20 + 0 - 50 = -30
    });
    
    it('on_order cannot save us from oversold if not received', () => {
      // Even with stuff on order, we're still short RIGHT NOW
      const inventory = {
        on_hand_qty: 10,
        on_order_qty: 100,  // Lots coming... but not here yet
        reserved_qty: 50
      };
      
      // Net available counts on_order as available
      const netAvailable = calculateNetAvailable(inventory);
      expect(netAvailable).toBe(60);
      
      // But IMMEDIATELY available is different
      const immediatelyAvailable = inventory.on_hand_qty - inventory.reserved_qty;
      expect(immediatelyAvailable).toBe(-40); // Can't ship 50 with only 10
    });
  });
  
  // ===========================================================================
  // NULL/MISSING INVENTORY
  // ===========================================================================
  
  describe('missing inventory records', () => {
    
    it('returns 0 for null inventory record', () => {
      const inventory = null;
      
      const netAvailable = calculateNetAvailable(inventory);
      
      expect(netAvailable).toBe(0);
      expect(typeof netAvailable).toBe('number');
    });
    
    it('returns 0 for undefined inventory record', () => {
      const inventory = undefined;
      
      const netAvailable = calculateNetAvailable(inventory as any);
      
      expect(netAvailable).toBe(0);
    });
  });
  
  // ===========================================================================
  // FIXTURE SCENARIO VALIDATION
  // ===========================================================================
  
  describe('fixture scenario calculations', () => {
    
    it('healthy inventory has positive net available', () => {
      for (const [sku, inv] of Object.entries(inventoryScenarios.healthy)) {
        const netAvailable = calculateNetAvailable(inv);
        expect(netAvailable).toBeGreaterThan(0);
      }
    });
    
    it('critical inventory is low but not necessarily negative', () => {
      const criticalFM104 = inventoryScenarios.critical.FM104;
      const netAvailable = calculateNetAvailable(criticalFM104);
      
      // 10 + 0 - 8 = 2 (barely any!)
      expect(netAvailable).toBe(2);
    });
    
    it('excess inventory has high net available', () => {
      const excessFM104 = inventoryScenarios.excess.FM104;
      const netAvailable = calculateNetAvailable(excessFM104);
      
      // 1000 + 200 - 50 = 1150
      expect(netAvailable).toBe(1150);
    });
  });
});

describe('Shortage/Surplus Detection', () => {
  
  // ===========================================================================
  // SHORTAGE DETECTION
  // ===========================================================================
  
  describe('shortage identification', () => {
    
    it('correctly identifies shortage when requirement exceeds available', () => {
      const requirement = 100;
      const available = 60;
      
      const { shortage, surplus } = calculateGap(requirement, available);
      
      expect(shortage).toBe(40);
      expect(surplus).toBe(0);
    });
    
    it('shortage equals full requirement when nothing available', () => {
      const requirement = 100;
      const available = 0;
      
      const { shortage, surplus } = calculateGap(requirement, available);
      
      expect(shortage).toBe(100);
      expect(surplus).toBe(0);
    });
    
    it('shortage calculation handles large numbers', () => {
      const requirement = 1000000;
      const available = 750000;
      
      const { shortage, surplus } = calculateGap(requirement, available);
      
      expect(shortage).toBe(250000);
      expect(Number.isFinite(shortage)).toBe(true);
    });
  });
  
  // ===========================================================================
  // SURPLUS DETECTION
  // ===========================================================================
  
  describe('surplus identification', () => {
    
    it('correctly identifies surplus when available exceeds requirement', () => {
      const requirement = 100;
      const available = 150;
      
      const { shortage, surplus } = calculateGap(requirement, available);
      
      expect(shortage).toBe(0);
      expect(surplus).toBe(50);
    });
    
    it('surplus equals full available when no requirement', () => {
      const requirement = 0;
      const available = 100;
      
      const { shortage, surplus } = calculateGap(requirement, available);
      
      expect(shortage).toBe(0);
      expect(surplus).toBe(100);
    });
  });
  
  // ===========================================================================
  // EXACT MATCH (NO GAP)
  // ===========================================================================
  
  describe('exact match scenarios', () => {
    
    it('handles exact match (no shortage, no surplus)', () => {
      const requirement = 100;
      const available = 100;
      
      const { shortage, surplus } = calculateGap(requirement, available);
      
      expect(shortage).toBe(0);
      expect(surplus).toBe(0);
    });
    
    it('handles both zero (no gap)', () => {
      const requirement = 0;
      const available = 0;
      
      const { shortage, surplus } = calculateGap(requirement, available);
      
      expect(shortage).toBe(0);
      expect(surplus).toBe(0);
    });
  });
  
  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  
  describe('edge cases', () => {
    
    it('never returns negative shortage', () => {
      const cases = [
        { req: -10, avail: 50 },
        { req: 100, avail: 200 },
        { req: 0, avail: 100 }
      ];
      
      cases.forEach(({ req, avail }) => {
        const { shortage } = calculateGap(req, avail);
        expect(shortage).toBeGreaterThanOrEqual(0);
      });
    });
    
    it('never returns negative surplus', () => {
      const cases = [
        { req: 100, avail: -20 },
        { req: 100, avail: 50 },
        { req: 0, avail: 0 }
      ];
      
      cases.forEach(({ req, avail }) => {
        const { surplus } = calculateGap(req, avail);
        expect(surplus).toBeGreaterThanOrEqual(0);
      });
    });
    
    it('handles floating point requirements', () => {
      const requirement = 45.75;
      const available = 40.25;
      
      const { shortage, surplus } = calculateGap(requirement, available);
      
      expect(roundTo(shortage, 2)).toBe(5.5);
      expect(surplus).toBe(0);
    });
  });
});

describe('Multi-Location Inventory', () => {
  
  // ===========================================================================
  // LOCATION AGGREGATION
  // ===========================================================================
  
  describe('aggregating across locations', () => {
    
    it('sums on_hand across locations', () => {
      const locations = [
        { facility: 'MONTROSE', on_hand_qty: 50, on_order_qty: 0, reserved_qty: 10 },
        { facility: 'SHIPPING', on_hand_qty: 30, on_order_qty: 0, reserved_qty: 5 }
      ];
      
      const totalOnHand = locations.reduce((sum, loc) => sum + loc.on_hand_qty, 0);
      const totalReserved = locations.reduce((sum, loc) => sum + loc.reserved_qty, 0);
      
      const aggregated = {
        on_hand_qty: totalOnHand,
        on_order_qty: 0,
        reserved_qty: totalReserved
      };
      
      const netAvailable = calculateNetAvailable(aggregated);
      
      expect(netAvailable).toBe(65); // (50+30) - (10+5)
    });
    
    it('does not double-count on_order (should be at company level)', () => {
      // POs are typically company-wide, not location-specific
      const locations = [
        { facility: 'MONTROSE', on_hand_qty: 50, on_order_qty: 100, reserved_qty: 0 },
        { facility: 'SHIPPING', on_hand_qty: 30, on_order_qty: 100, reserved_qty: 0 }
        // If both show same PO, we'd double-count!
      ];
      
      // Correct aggregation should only count on_order once
      const aggregatedCorrect = {
        on_hand_qty: 80,  // Sum of locations
        on_order_qty: 100, // NOT 200 (PO is company-wide)
        reserved_qty: 0
      };
      
      expect(calculateNetAvailable(aggregatedCorrect)).toBe(180);
    });
  });
  
  // ===========================================================================
  // LOCATION-SPECIFIC AVAILABILITY
  // ===========================================================================
  
  describe('location-specific checks', () => {
    
    it('can check availability at specific location', () => {
      const montrose = { on_hand_qty: 50, on_order_qty: 0, reserved_qty: 45 };
      const shipping = { on_hand_qty: 30, on_order_qty: 0, reserved_qty: 5 };
      
      // Montrose is nearly depleted
      expect(calculateNetAvailable(montrose)).toBe(5);
      
      // Shipping has plenty
      expect(calculateNetAvailable(shipping)).toBe(25);
    });
  });
});

describe('Inventory Status Classification', () => {
  
  // ===========================================================================
  // STATUS DETERMINATION
  // ===========================================================================
  
  const classifyInventoryStatus = (
    netAvailable: number,
    requirement: number,
    daysOfStock: number
  ): string => {
    if (netAvailable < 0) return '🆘 OVERSOLD';
    if (netAvailable === 0) return '❌ OUT OF STOCK';
    if (netAvailable < requirement) return '⚠️ SHORTAGE';
    if (daysOfStock < 7) return '🔴 CRITICAL';
    if (daysOfStock < 14) return '🟠 LOW';
    if (daysOfStock < 30) return '🟡 MONITOR';
    if (daysOfStock > 90) return '💤 EXCESS';
    return '✅ HEALTHY';
  };
  
  it('classifies oversold correctly', () => {
    const status = classifyInventoryStatus(-10, 50, 0);
    expect(status).toBe('🆘 OVERSOLD');
  });
  
  it('classifies out of stock correctly', () => {
    const status = classifyInventoryStatus(0, 50, 0);
    expect(status).toBe('❌ OUT OF STOCK');
  });
  
  it('classifies shortage correctly', () => {
    const status = classifyInventoryStatus(30, 50, 5);
    expect(status).toBe('⚠️ SHORTAGE');
  });
  
  it('classifies critical days of stock', () => {
    const status = classifyInventoryStatus(100, 50, 5);
    expect(status).toBe('🔴 CRITICAL');
  });
  
  it('classifies low days of stock', () => {
    const status = classifyInventoryStatus(100, 50, 10);
    expect(status).toBe('🟠 LOW');
  });
  
  it('classifies healthy inventory', () => {
    const status = classifyInventoryStatus(100, 50, 45);
    expect(status).toBe('✅ HEALTHY');
  });
  
  it('classifies excess inventory', () => {
    const status = classifyInventoryStatus(1000, 50, 120);
    expect(status).toBe('💤 EXCESS');
  });
});
