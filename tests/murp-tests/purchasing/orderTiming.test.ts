/**
 * Lead Time & Order Timing Tests
 * 
 * Tests for order-by date calculations, urgency scoring,
 * and MOQ/case pack handling in purchase recommendations.
 * 
 * CLAUDE CODE: These tests ensure we order at the right time.
 * Critical for preventing stockouts without over-ordering.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { addDays, subDays, format } from 'date-fns';
import {
  calculateOrderByDate,
  getEffectiveLeadTime,
  roundForOrdering,
  formatDateISO
} from '../__helpers__/testUtils';
import { vendors, products } from '../__fixtures__/buildaSoilData';

describe('Order Timing Calculations', () => {
  
  // ===========================================================================
  // DATE MOCKING
  // ===========================================================================
  
  beforeEach(() => {
    // Fix "today" for deterministic tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15'));
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });
  
  // ===========================================================================
  // ORDER-BY DATE CALCULATION
  // ===========================================================================
  
  describe('calculateOrderByDate', () => {
    
    it('calculates order-by date with lead time buffer', () => {
      const needDate = new Date('2024-04-15'); // Need in 31 days
      const leadTimeDays = 21;
      const safetyBufferDays = 7;
      
      const orderByDate = calculateOrderByDate(needDate, leadTimeDays, safetyBufferDays);
      
      // 2024-04-15 minus 21 minus 7 = 2024-03-18
      expect(formatDateISO(orderByDate)).toBe('2024-03-18');
    });
    
    it('returns PAST date when already late (do not mask the problem)', () => {
      const needDate = new Date('2024-03-20'); // Need in 5 days
      const leadTimeDays = 21;                  // But lead time is 21 days!
      const safetyBufferDays = 7;
      
      const orderByDate = calculateOrderByDate(needDate, leadTimeDays, safetyBufferDays);
      
      // Should be 2024-02-21 - YES this is in the past
      // This is CORRECT - it tells us we're already late
      expect(formatDateISO(orderByDate)).toBe('2024-02-21');
      expect(orderByDate < new Date()).toBe(true);
    });
    
    it('handles vendors with unknown lead time (uses conservative default)', () => {
      const needDate = new Date('2024-04-15');
      const leadTimeDays = null; // Unknown!

      const orderByDate = calculateOrderByDate(needDate, leadTimeDays, 7);

      // Should use conservative default (30 days) not 0
      // 2024-04-15 minus 30 minus 7 = 2024-03-09 (subDays counts from end of day)
      expect(formatDateISO(orderByDate)).toBe('2024-03-09');
    });
    
    it('uses default buffer when not specified', () => {
      const needDate = new Date('2024-04-15');
      const leadTimeDays = 14;
      
      const orderByDate = calculateOrderByDate(needDate, leadTimeDays);
      
      // Default buffer is 7 days
      // 2024-04-15 minus 14 minus 7 = 2024-03-25
      expect(formatDateISO(orderByDate)).toBe('2024-03-25');
    });
    
    it('handles zero lead time (local pickup)', () => {
      const needDate = new Date('2024-03-22');
      const leadTimeDays = 0;
      const safetyBufferDays = 3;
      
      const orderByDate = calculateOrderByDate(needDate, leadTimeDays, safetyBufferDays);
      
      // Just buffer days before need
      expect(formatDateISO(orderByDate)).toBe('2024-03-19');
    });
    
    it('handles zero buffer (risky but valid)', () => {
      const needDate = new Date('2024-04-01');
      const leadTimeDays = 14;
      const safetyBufferDays = 0;
      
      const orderByDate = calculateOrderByDate(needDate, leadTimeDays, safetyBufferDays);
      
      expect(formatDateISO(orderByDate)).toBe('2024-03-18');
    });
  });
  
  // ===========================================================================
  // EFFECTIVE LEAD TIME
  // ===========================================================================
  
  describe('getEffectiveLeadTime', () => {
    
    it('uses vendor-specific lead time when available', () => {
      const vendorLeadTime = 14;
      const categoryDefault = 21;
      
      const effective = getEffectiveLeadTime(vendorLeadTime, categoryDefault);
      
      expect(effective).toBe(14);
    });
    
    it('falls back to category default when vendor lead time is null', () => {
      const vendorLeadTime = null;
      const categoryDefault = 21;
      
      const effective = getEffectiveLeadTime(vendorLeadTime, categoryDefault);
      
      expect(effective).toBe(21);
    });
    
    it('uses vendor lead time of 0 (local pickup)', () => {
      const vendorLeadTime = 0;
      const categoryDefault = 21;
      
      const effective = getEffectiveLeadTime(vendorLeadTime, categoryDefault);
      
      expect(effective).toBe(0);
    });
  });
  
  // ===========================================================================
  // VENDOR-SPECIFIC LEAD TIMES FROM FIXTURES
  // ===========================================================================
  
  describe('vendor lead time validation', () => {
    
    it('Neptune Harvest has 14 day lead time', () => {
      expect(vendors.vendor_neptune.lead_time_days).toBe(14);
    });
    
    it('Premier Tech (peat moss) has longest lead time at 45 days', () => {
      expect(vendors.vendor_premier.lead_time_days).toBe(45);
      
      // This should be the longest
      const allLeadTimes = Object.values(vendors).map(v => v.lead_time_days);
      expect(Math.max(...allLeadTimes)).toBe(45);
    });
    
    it('Diamond K Gypsum has shortest lead time at 7 days', () => {
      expect(vendors.vendor_diamondk.lead_time_days).toBe(7);
    });
    
    it('products have lead times matching their vendors', () => {
      // FM104 from Neptune should have 14 day lead time
      expect(products.FM104.lead_time_days).toBe(14);
      
      // PM101 from Premier Tech should have 45 day lead time
      expect(products.PM101.lead_time_days).toBe(45);
    });
  });
});

describe('Urgency Scoring', () => {
  
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15'));
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });
  
  // ===========================================================================
  // URGENCY SCORE CALCULATION
  // ===========================================================================
  
  const calculateUrgencyScore = (orderByDate: Date): number => {
    const today = new Date();
    const daysUntilDeadline = Math.ceil(
      (orderByDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysUntilDeadline <= 0) return 0;  // OVERDUE
    if (daysUntilDeadline <= 7) return 1;  // THIS WEEK
    if (daysUntilDeadline <= 14) return 2; // NEXT WEEK
    if (daysUntilDeadline <= 30) return 3; // THIS MONTH
    return 4;  // CAN WAIT
  };
  
  describe('urgency score levels', () => {
    
    it('score 0 for overdue orders', () => {
      const orderByDate = new Date('2024-03-10'); // 5 days ago
      expect(calculateUrgencyScore(orderByDate)).toBe(0);
    });
    
    it('score 0 for today deadline', () => {
      const orderByDate = new Date('2024-03-15'); // Today
      expect(calculateUrgencyScore(orderByDate)).toBe(0);
    });
    
    it('score 1 for this week', () => {
      const orderByDate = new Date('2024-03-20'); // 5 days from now
      expect(calculateUrgencyScore(orderByDate)).toBe(1);
    });
    
    it('score 2 for next week', () => {
      const orderByDate = new Date('2024-03-25'); // 10 days from now
      expect(calculateUrgencyScore(orderByDate)).toBe(2);
    });
    
    it('score 3 for this month', () => {
      const orderByDate = new Date('2024-04-05'); // 21 days from now
      expect(calculateUrgencyScore(orderByDate)).toBe(3);
    });
    
    it('score 4 for future orders', () => {
      const orderByDate = new Date('2024-05-15'); // 61 days from now
      expect(calculateUrgencyScore(orderByDate)).toBe(4);
    });
  });
  
  // ===========================================================================
  // PRIORITY LABELS
  // ===========================================================================
  
  const getPriorityLabel = (
    urgencyScore: number,
    blocksCriticalBuilds: boolean
  ): string => {
    if (blocksCriticalBuilds && urgencyScore <= 1) {
      return '🔴 P1 - ORDER TODAY';
    }
    if (urgencyScore === 0) {
      return '🔴 P1 - OVERDUE';
    }
    if (blocksCriticalBuilds) {
      return '🟠 P2 - CRITICAL PATH';
    }
    if (urgencyScore <= 2) {
      return '🟡 P3 - SOON';
    }
    return '🟢 P4 - PLANNED';
  };
  
  describe('priority label assignment', () => {
    
    it('P1 for critical path + urgent', () => {
      const label = getPriorityLabel(1, true);
      expect(label).toBe('🔴 P1 - ORDER TODAY');
    });
    
    it('P1 for overdue regardless of criticality', () => {
      const label = getPriorityLabel(0, false);
      expect(label).toBe('🔴 P1 - OVERDUE');
    });
    
    it('P2 for critical path + not urgent', () => {
      const label = getPriorityLabel(3, true);
      expect(label).toBe('🟠 P2 - CRITICAL PATH');
    });
    
    it('P3 for soon but not critical', () => {
      const label = getPriorityLabel(2, false);
      expect(label).toBe('🟡 P3 - SOON');
    });
    
    it('P4 for planned future orders', () => {
      const label = getPriorityLabel(4, false);
      expect(label).toBe('🟢 P4 - PLANNED');
    });
  });
});

describe('MOQ and Case Pack Handling', () => {
  
  // ===========================================================================
  // MINIMUM ORDER QUANTITY
  // ===========================================================================
  
  describe('MOQ enforcement', () => {
    
    const calculateSuggestedOrderQty = (
      shortage: number,
      moq: number | null,
      casePack: number | null
    ): number => {
      let qty = shortage;
      
      // Apply MOQ
      if (moq && moq > qty) {
        qty = moq;
      }
      
      // Round up to case pack
      if (casePack && casePack > 1) {
        qty = Math.ceil(qty / casePack) * casePack;
      }
      
      return qty;
    };
    
    it('uses shortage when MOQ is lower', () => {
      const suggested = calculateSuggestedOrderQty(100, 50, null);
      expect(suggested).toBe(100);
    });
    
    it('bumps to MOQ when shortage is lower', () => {
      const suggested = calculateSuggestedOrderQty(20, 50, null);
      expect(suggested).toBe(50);
    });
    
    it('ignores null MOQ', () => {
      const suggested = calculateSuggestedOrderQty(20, null, null);
      expect(suggested).toBe(20);
    });
    
    it('applies MOQ from product fixtures', () => {
      // FM104 has MOQ of 20
      const shortage = 15;
      const moq = products.FM104.moq;
      
      const suggested = calculateSuggestedOrderQty(shortage, moq!, null);
      expect(suggested).toBe(20);
    });
    
    it('KMAG101 has MOQ of 40', () => {
      expect(products.KMAG101.moq).toBe(40);
      
      const suggested = calculateSuggestedOrderQty(25, products.KMAG101.moq!, null);
      expect(suggested).toBe(40);
    });
  });
  
  // ===========================================================================
  // CASE PACK ROUNDING
  // ===========================================================================
  
  describe('case pack rounding', () => {
    
    const roundToCasePack = (qty: number, casePack: number): number => {
      if (casePack <= 1) return Math.ceil(qty);
      return Math.ceil(qty / casePack) * casePack;
    };
    
    it('rounds up to case pack multiple', () => {
      // Need 75, case pack is 24
      const result = roundToCasePack(75, 24);
      expect(result).toBe(96); // 4 cases
    });
    
    it('does not change exact multiple', () => {
      const result = roundToCasePack(48, 24);
      expect(result).toBe(48); // 2 cases exactly
    });
    
    it('rounds up even for small overage', () => {
      const result = roundToCasePack(49, 24);
      expect(result).toBe(72); // Must buy 3 cases
    });
    
    it('handles case pack of 1', () => {
      const result = roundToCasePack(7.3, 1);
      expect(result).toBe(8);
    });
    
    it('handles large case packs', () => {
      // Pallet quantity
      const result = roundToCasePack(150, 60);
      expect(result).toBe(180); // 3 pallets
    });
  });
  
  // ===========================================================================
  // COMBINED MOQ + CASE PACK
  // ===========================================================================
  
  describe('MOQ and case pack combined', () => {
    
    const calculateOrderQty = (
      shortage: number,
      moq: number,
      casePack: number
    ): number => {
      // First apply MOQ
      let qty = Math.max(shortage, moq);
      
      // Then round to case pack
      if (casePack > 1) {
        qty = Math.ceil(qty / casePack) * casePack;
      }
      
      return qty;
    };
    
    it('MOQ applied before case pack rounding', () => {
      // Shortage: 10, MOQ: 25, Case Pack: 12
      // Step 1: max(10, 25) = 25
      // Step 2: ceil(25/12) * 12 = 36
      const result = calculateOrderQty(10, 25, 12);
      expect(result).toBe(36);
    });
    
    it('case pack can exceed MOQ after rounding', () => {
      // Shortage: 5, MOQ: 10, Case Pack: 24
      // Step 1: max(5, 10) = 10
      // Step 2: ceil(10/24) * 24 = 24
      const result = calculateOrderQty(5, 10, 24);
      expect(result).toBe(24);
    });
    
    it('handles Peat Moss ordering (realistic scenario)', () => {
      // PM101: MOQ 100 bales, case pack 1
      const shortage = 50;
      const moq = products.PM101.moq!;
      const casePack = products.PM101.case_pack_qty!;
      
      const result = calculateOrderQty(shortage, moq, casePack);
      expect(result).toBe(100); // Must order MOQ
    });
  });
});

describe('Long Lead Time Special Handling', () => {
  
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-02-01')); // Before spring rush
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });
  
  // ===========================================================================
  // PEAT MOSS SCENARIO (45 DAY LEAD TIME)
  // ===========================================================================
  
  describe('long lead time components', () => {
    
    it('identifies components that must be ordered early for spring', () => {
      // Spring rush starts March 15
      const springRushDate = new Date('2024-03-15');
      const peatLeadTime = products.PM101.lead_time_days!;
      const buffer = 7;

      const orderByDate = calculateOrderByDate(
        springRushDate,
        peatLeadTime,
        buffer
      );

      // March 15 - 45 - 7 = January 23 (subDays calculation)
      expect(formatDateISO(orderByDate)).toBe('2024-01-23');

      // On Feb 1, this is ALREADY PAST
      expect(orderByDate < new Date()).toBe(true);
    });
    
    it('short lead time items still have time', () => {
      const springRushDate = new Date('2024-03-15');
      const gypsumLeadTime = products.OG106.lead_time_days!; // 7 days
      const buffer = 7;
      
      const orderByDate = calculateOrderByDate(
        springRushDate,
        gypsumLeadTime,
        buffer
      );
      
      // March 15 - 7 - 7 = March 1
      expect(formatDateISO(orderByDate)).toBe('2024-03-01');
      
      // On Feb 1, we still have 29 days
      expect(orderByDate > new Date()).toBe(true);
    });
  });
  
  // ===========================================================================
  // LEAD TIME CRITICALITY FLAG
  // ===========================================================================
  
  describe('lead time criticality in BOM', () => {
    
    const identifyLeadTimeCritical = (
      components: Array<{ sku: string; leadTime: number }>
    ): string[] => {
      const maxLeadTime = Math.max(...components.map(c => c.leadTime));
      return components
        .filter(c => c.leadTime === maxLeadTime)
        .map(c => c.sku);
    };
    
    it('identifies slowest component as critical path', () => {
      const components = [
        { sku: 'FM104', leadTime: 14 },
        { sku: 'PM101', leadTime: 45 },
        { sku: 'OG106', leadTime: 7 }
      ];
      
      const critical = identifyLeadTimeCritical(components);
      
      expect(critical).toEqual(['PM101']);
    });
    
    it('handles multiple components with same max lead time', () => {
      const components = [
        { sku: 'COMP-A', leadTime: 30 },
        { sku: 'COMP-B', leadTime: 30 },
        { sku: 'COMP-C', leadTime: 14 }
      ];
      
      const critical = identifyLeadTimeCritical(components);
      
      expect(critical).toContain('COMP-A');
      expect(critical).toContain('COMP-B');
      expect(critical).not.toContain('COMP-C');
    });
  });
});
