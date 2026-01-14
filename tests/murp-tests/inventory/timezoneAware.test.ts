/**
 * Timezone-Aware Date Tests
 *
 * BuildASoil operates in America/Denver (Mountain Time).
 * These tests ensure all date calculations respect timezone:
 * - Order deadlines
 * - Lead time calculations
 * - Business day handling
 * - Seasonal period detection
 *
 * CLAUDE CODE: Timezone bugs cause off-by-one errors that lead to
 * missed orders or unnecessary rush orders. Always test in MT.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BUILDASOIL_TIMEZONE,
  toLocalTime,
  toUTC,
  nowInDenver,
  formatDenverDate,
  formatDenverDateTime,
  isBusinessDay,
  nextBusinessDay,
  previousBusinessDay,
  addBusinessDays,
  subtractBusinessDays,
  countBusinessDays,
  isBeforeOrderCutoff,
  getEffectiveOrderDate,
  calculateArrivalDate,
  calculateOrderByDateTZ,
  hasAdequateLeadTime,
  getSeasonalMonth,
  isSpringRush,
  isWinterLull,
  getSeasonalPeriod,
  getDenverWeekNumber,
  getDenverWeekString,
  getDenverWeekStart,
  createDenverDate,
  springRushStart,
  peakSeasonDate,
  winterLullDate,
} from '../__helpers__/timezoneUtils';
import { seasonalIndices, vendors, products } from '../__fixtures__/buildaSoilData';

// ============================================================================
// TIMEZONE CONVERSION
// ============================================================================

describe('Timezone Conversion', () => {
  describe('toLocalTime', () => {
    it('converts UTC to Denver time (MST -7 in winter)', () => {
      // January 15, 2024 at noon UTC
      const utcDate = new Date('2024-01-15T12:00:00Z');
      const denverTime = toLocalTime(utcDate);

      // MST is UTC-7 in winter
      expect(denverTime.getHours()).toBe(5); // 12 - 7 = 5 AM
    });

    it('converts UTC to Denver time (MDT -6 in summer)', () => {
      // June 15, 2024 at noon UTC
      const utcDate = new Date('2024-06-15T12:00:00Z');
      const denverTime = toLocalTime(utcDate);

      // MDT is UTC-6 in summer (DST)
      expect(denverTime.getHours()).toBe(6); // 12 - 6 = 6 AM
    });
  });

  describe('toUTC', () => {
    it('converts Denver time to UTC', () => {
      // Create a date representing 10 AM in Denver
      const denverTime = createDenverDate(2024, 6, 15, 10, 0);
      // This should be 4 PM UTC (10 + 6 for MDT)
      expect(denverTime.getUTCHours()).toBe(16);
    });
  });

  describe('formatDenverDate', () => {
    it('formats date in Denver timezone', () => {
      // Late evening UTC on Jan 14 = still Jan 14 in Denver (or early Jan 15 UTC)
      const date = createDenverDate(2024, 1, 15, 12, 0);
      const formatted = formatDenverDate(date);

      expect(formatted).toBe('2024-01-15');
    });

    it('handles day boundary correctly', () => {
      // 11 PM Denver time on Jan 15 = 6 AM UTC on Jan 16 (MST = -7)
      const denverDate = createDenverDate(2024, 1, 15, 23, 0);
      const formatted = formatDenverDate(denverDate);

      expect(formatted).toBe('2024-01-15');
    });
  });
});

// ============================================================================
// BUSINESS DAY CALCULATIONS
// ============================================================================

describe('Business Day Calculations', () => {
  describe('isBusinessDay', () => {
    it('Monday is a business day', () => {
      const monday = createDenverDate(2024, 3, 18, 12, 0); // March 18, 2024 is Monday
      expect(isBusinessDay(monday)).toBe(true);
    });

    it('Saturday is not a business day', () => {
      const saturday = createDenverDate(2024, 3, 16, 12, 0); // March 16, 2024 is Saturday
      expect(isBusinessDay(saturday)).toBe(false);
    });

    it('Sunday is not a business day', () => {
      const sunday = createDenverDate(2024, 3, 17, 12, 0); // March 17, 2024 is Sunday
      expect(isBusinessDay(sunday)).toBe(false);
    });
  });

  describe('nextBusinessDay', () => {
    it('Friday advances to Monday', () => {
      const friday = createDenverDate(2024, 3, 15, 12, 0); // Friday
      const next = nextBusinessDay(friday);

      expect(formatDenverDate(next)).toBe('2024-03-18'); // Monday
    });

    it('Saturday advances to Monday', () => {
      const saturday = createDenverDate(2024, 3, 16, 12, 0); // Saturday
      const next = nextBusinessDay(saturday);

      expect(formatDenverDate(next)).toBe('2024-03-18'); // Monday
    });

    it('Wednesday advances to Thursday', () => {
      const wednesday = createDenverDate(2024, 3, 13, 12, 0); // Wednesday
      const next = nextBusinessDay(wednesday);

      expect(formatDenverDate(next)).toBe('2024-03-14'); // Thursday
    });
  });

  describe('previousBusinessDay', () => {
    it('Monday goes back to Friday', () => {
      const monday = createDenverDate(2024, 3, 18, 12, 0); // Monday
      const prev = previousBusinessDay(monday);

      expect(formatDenverDate(prev)).toBe('2024-03-15'); // Friday
    });

    it('Sunday goes back to Friday', () => {
      const sunday = createDenverDate(2024, 3, 17, 12, 0); // Sunday
      const prev = previousBusinessDay(sunday);

      expect(formatDenverDate(prev)).toBe('2024-03-15'); // Friday
    });
  });

  describe('addBusinessDays', () => {
    it('adds 5 business days crossing weekend', () => {
      const wednesday = createDenverDate(2024, 3, 13, 12, 0); // Wednesday
      const result = addBusinessDays(wednesday, 5);

      // Wed + 5 business days = next Wednesday (skipping Sat/Sun)
      expect(formatDenverDate(result)).toBe('2024-03-20');
    });

    it('adds 10 business days (two weeks)', () => {
      const monday = createDenverDate(2024, 3, 11, 12, 0); // Monday
      const result = addBusinessDays(monday, 10);

      // 10 business days = 2 weeks
      expect(formatDenverDate(result)).toBe('2024-03-25'); // Monday two weeks later
    });
  });

  describe('subtractBusinessDays', () => {
    it('subtracts 5 business days crossing weekend', () => {
      const wednesday = createDenverDate(2024, 3, 20, 12, 0); // Wednesday
      const result = subtractBusinessDays(wednesday, 5);

      expect(formatDenverDate(result)).toBe('2024-03-13'); // Previous Wednesday
    });
  });

  describe('countBusinessDays', () => {
    it('counts business days in a week', () => {
      const monday = createDenverDate(2024, 3, 11, 12, 0);
      const friday = createDenverDate(2024, 3, 15, 12, 0);

      const count = countBusinessDays(monday, friday);

      expect(count).toBe(4); // Tue, Wed, Thu, Fri
    });

    it('counts business days across two weeks', () => {
      const monday = createDenverDate(2024, 3, 11, 12, 0);
      const nextFriday = createDenverDate(2024, 3, 22, 12, 0);

      const count = countBusinessDays(monday, nextFriday);

      expect(count).toBe(9); // 4 + 5 (skipping weekend)
    });
  });
});

// ============================================================================
// ORDER CUTOFF TIME
// ============================================================================

describe('Order Cutoff Time (2 PM MT)', () => {
  describe('isBeforeOrderCutoff', () => {
    it('10 AM is before cutoff', () => {
      const morning = createDenverDate(2024, 3, 15, 10, 0);
      expect(isBeforeOrderCutoff(morning)).toBe(true);
    });

    it('1 PM is before cutoff', () => {
      const earlyAfternoon = createDenverDate(2024, 3, 15, 13, 0);
      expect(isBeforeOrderCutoff(earlyAfternoon)).toBe(true);
    });

    it('2 PM is at cutoff (not before)', () => {
      const cutoff = createDenverDate(2024, 3, 15, 14, 0);
      expect(isBeforeOrderCutoff(cutoff)).toBe(false);
    });

    it('5 PM is after cutoff', () => {
      const evening = createDenverDate(2024, 3, 15, 17, 0);
      expect(isBeforeOrderCutoff(evening)).toBe(false);
    });
  });

  describe('getEffectiveOrderDate', () => {
    it('morning order ships same day', () => {
      const morning = createDenverDate(2024, 3, 15, 10, 0); // Friday 10 AM
      const effective = getEffectiveOrderDate(morning);

      expect(formatDenverDate(effective)).toBe('2024-03-15');
    });

    it('afternoon order ships next business day', () => {
      const afternoon = createDenverDate(2024, 3, 15, 15, 0); // Friday 3 PM
      const effective = getEffectiveOrderDate(afternoon);

      expect(formatDenverDate(effective)).toBe('2024-03-18'); // Monday
    });

    it('Saturday order ships Monday', () => {
      const saturday = createDenverDate(2024, 3, 16, 10, 0);
      const effective = getEffectiveOrderDate(saturday);

      expect(formatDenverDate(effective)).toBe('2024-03-18'); // Monday
    });

    it('Friday after cutoff ships Monday', () => {
      const fridayEvening = createDenverDate(2024, 3, 15, 17, 0);
      const effective = getEffectiveOrderDate(fridayEvening);

      expect(formatDenverDate(effective)).toBe('2024-03-18');
    });
  });
});

// ============================================================================
// LEAD TIME CALCULATIONS
// ============================================================================

describe('Lead Time Calculations (Timezone-Aware)', () => {
  describe('calculateArrivalDate', () => {
    it('calculates arrival for Neptune (14 day lead time)', () => {
      const orderDate = createDenverDate(2024, 3, 15, 10, 0);
      const leadTime = vendors.vendor_neptune.lead_time_days;
      const arrival = calculateArrivalDate(orderDate, leadTime);

      expect(formatDenverDate(arrival)).toBe('2024-03-29'); // 14 days later
    });

    it('calculates arrival for Premier (45 day lead time)', () => {
      const orderDate = createDenverDate(2024, 3, 15, 10, 0);
      const leadTime = vendors.vendor_premier.lead_time_days;
      const arrival = calculateArrivalDate(orderDate, leadTime);

      expect(formatDenverDate(arrival)).toBe('2024-04-29'); // 45 days later
    });

    it('calculates arrival for Diamond K (7 day lead time)', () => {
      const orderDate = createDenverDate(2024, 3, 15, 10, 0);
      const leadTime = vendors.vendor_diamondk.lead_time_days;
      const arrival = calculateArrivalDate(orderDate, leadTime);

      expect(formatDenverDate(arrival)).toBe('2024-03-22'); // 7 days later
    });
  });

  describe('calculateOrderByDateTZ', () => {
    it('calculates order-by for Neptune with buffer', () => {
      const needDate = createDenverDate(2024, 4, 15, 12, 0);
      const leadTime = vendors.vendor_neptune.lead_time_days; // 14 days
      const buffer = 7;

      const orderBy = calculateOrderByDateTZ(needDate, leadTime, buffer);

      // April 15 - 14 - 7 = March 25
      expect(formatDenverDate(orderBy)).toBe('2024-03-25');
    });

    it('moves order-by to Friday if falls on weekend', () => {
      // Need date: April 14, 2024 (Sunday)
      // Lead time 14 + buffer 7 = 21 days back
      // April 14 - 21 = March 24 (Sunday) → should be March 22 (Friday)
      const needDate = createDenverDate(2024, 4, 14, 12, 0);
      const leadTime = 14;
      const buffer = 7;

      const orderBy = calculateOrderByDateTZ(needDate, leadTime, buffer);
      const dayOfWeek = toLocalTime(orderBy).getDay();

      // Should not be Saturday (6) or Sunday (0)
      expect(dayOfWeek).not.toBe(0);
      expect(dayOfWeek).not.toBe(6);
    });
  });

  describe('hasAdequateLeadTime', () => {
    it('returns true when enough time', () => {
      const needDate = createDenverDate(2024, 4, 15, 12, 0);
      const today = createDenverDate(2024, 3, 15, 12, 0);
      const leadTime = 14;

      // 31 days until need, 14 day lead time = plenty of time
      expect(hasAdequateLeadTime(needDate, leadTime, today)).toBe(true);
    });

    it('returns false when not enough time', () => {
      const needDate = createDenverDate(2024, 3, 25, 12, 0);
      const today = createDenverDate(2024, 3, 15, 12, 0);
      const leadTime = 14;

      // 10 days until need, 14 day lead time = NOT enough
      expect(hasAdequateLeadTime(needDate, leadTime, today)).toBe(false);
    });

    it('returns false for PM101 (45 day lead) when less than 45 days', () => {
      const needDate = createDenverDate(2024, 4, 15, 12, 0);
      const today = createDenverDate(2024, 3, 15, 12, 0);
      const leadTime = products.PM101.lead_time_days!; // 45 days

      // 31 days until need, 45 day lead time = NOT enough
      expect(hasAdequateLeadTime(needDate, leadTime, today)).toBe(false);
    });
  });
});

// ============================================================================
// SEASONAL DATE HELPERS
// ============================================================================

describe('Seasonal Date Helpers', () => {
  describe('getSeasonalMonth', () => {
    it('returns correct month for Denver date', () => {
      const january = createDenverDate(2024, 1, 15, 12, 0);
      const april = createDenverDate(2024, 4, 15, 12, 0);
      const december = createDenverDate(2024, 12, 15, 12, 0);

      expect(getSeasonalMonth(january)).toBe(1);
      expect(getSeasonalMonth(april)).toBe(4);
      expect(getSeasonalMonth(december)).toBe(12);
    });
  });

  describe('isSpringRush', () => {
    it('March-May are spring rush months', () => {
      const march = createDenverDate(2024, 3, 15, 12, 0);
      const april = createDenverDate(2024, 4, 15, 12, 0);
      const may = createDenverDate(2024, 5, 15, 12, 0);

      expect(isSpringRush(march)).toBe(true);
      expect(isSpringRush(april)).toBe(true);
      expect(isSpringRush(may)).toBe(true);
    });

    it('June is not spring rush', () => {
      const june = createDenverDate(2024, 6, 15, 12, 0);
      expect(isSpringRush(june)).toBe(false);
    });

    it('February is not spring rush', () => {
      const february = createDenverDate(2024, 2, 15, 12, 0);
      expect(isSpringRush(february)).toBe(false);
    });
  });

  describe('isWinterLull', () => {
    it('December and January are winter lull', () => {
      const december = createDenverDate(2024, 12, 15, 12, 0);
      const january = createDenverDate(2024, 1, 15, 12, 0);

      expect(isWinterLull(december)).toBe(true);
      expect(isWinterLull(january)).toBe(true);
    });

    it('February is not winter lull', () => {
      const february = createDenverDate(2024, 2, 15, 12, 0);
      expect(isWinterLull(february)).toBe(false);
    });
  });

  describe('getSeasonalPeriod', () => {
    it('correctly identifies all periods', () => {
      expect(getSeasonalPeriod(createDenverDate(2024, 1, 15, 12, 0))).toBe('winter');
      expect(getSeasonalPeriod(createDenverDate(2024, 4, 15, 12, 0))).toBe('spring_rush');
      expect(getSeasonalPeriod(createDenverDate(2024, 7, 15, 12, 0))).toBe('summer');
      expect(getSeasonalPeriod(createDenverDate(2024, 10, 15, 12, 0))).toBe('fall');
      expect(getSeasonalPeriod(createDenverDate(2024, 12, 15, 12, 0))).toBe('winter');
    });
  });

  describe('seasonal index lookup', () => {
    it('April has highest seasonal index (1.80)', () => {
      const aprilIndex = seasonalIndices.find(s => s.month === 4);
      expect(aprilIndex?.index_value).toBe(1.80);
    });

    it('December has lowest seasonal index (0.50)', () => {
      const decIndex = seasonalIndices.find(s => s.month === 12);
      expect(decIndex?.index_value).toBe(0.50);
    });

    it('can lookup index by date', () => {
      const date = createDenverDate(2024, 4, 15, 12, 0);
      const month = getSeasonalMonth(date);
      const index = seasonalIndices.find(s => s.month === month);

      expect(index?.index_value).toBe(1.80);
    });
  });
});

// ============================================================================
// WEEK CALCULATIONS
// ============================================================================

describe('Week Calculations (Denver Timezone)', () => {
  describe('getDenverWeekNumber', () => {
    it('calculates week number correctly', () => {
      const jan1 = createDenverDate(2024, 1, 1, 12, 0);
      const jan8 = createDenverDate(2024, 1, 8, 12, 0);

      const week1 = getDenverWeekNumber(jan1);
      const week2 = getDenverWeekNumber(jan8);

      expect(week2).toBe(week1 + 1);
    });

    it('week numbers increase through the year', () => {
      const weeks = [1, 4, 7, 10].map(month =>
        getDenverWeekNumber(createDenverDate(2024, month, 15, 12, 0))
      );

      // Each quarter should have higher week number
      expect(weeks[1]).toBeGreaterThan(weeks[0]);
      expect(weeks[2]).toBeGreaterThan(weeks[1]);
      expect(weeks[3]).toBeGreaterThan(weeks[2]);
    });
  });

  describe('getDenverWeekString', () => {
    it('formats week string correctly', () => {
      const date = createDenverDate(2024, 3, 15, 12, 0);
      const weekString = getDenverWeekString(date);

      expect(weekString).toMatch(/^2024-\d{2}$/);
    });

    it('pads single-digit weeks with zero', () => {
      const earlyJan = createDenverDate(2024, 1, 5, 12, 0);
      const weekString = getDenverWeekString(earlyJan);

      expect(weekString).toMatch(/^2024-0\d$/);
    });
  });

  describe('getDenverWeekStart', () => {
    it('returns Monday for mid-week date', () => {
      const wednesday = createDenverDate(2024, 3, 13, 12, 0); // Wednesday
      const weekStart = getDenverWeekStart(wednesday);
      const localStart = toLocalTime(weekStart);

      expect(localStart.getDay()).toBe(1); // Monday
      expect(formatDenverDate(weekStart)).toBe('2024-03-11');
    });

    it('returns same Monday for Monday date', () => {
      const monday = createDenverDate(2024, 3, 11, 12, 0);
      const weekStart = getDenverWeekStart(monday);

      expect(formatDenverDate(weekStart)).toBe('2024-03-11');
    });
  });
});

// ============================================================================
// SCENARIO DATE HELPERS
// ============================================================================

describe('Test Scenario Date Helpers', () => {
  describe('createDenverDate', () => {
    it('creates date in Denver timezone', () => {
      const date = createDenverDate(2024, 3, 15, 10, 30);

      expect(formatDenverDate(date)).toBe('2024-03-15');
      // Hour check needs to account for DST
      const local = toLocalTime(date);
      expect(local.getHours()).toBe(10);
      expect(local.getMinutes()).toBe(30);
    });

    it('handles year boundary correctly', () => {
      const newYearsEve = createDenverDate(2024, 12, 31, 23, 59);
      const newYearsDay = createDenverDate(2025, 1, 1, 0, 0);

      expect(formatDenverDate(newYearsEve)).toBe('2024-12-31');
      expect(formatDenverDate(newYearsDay)).toBe('2025-01-01');
    });
  });

  describe('springRushStart', () => {
    it('returns March 15 for given year', () => {
      const spring2024 = springRushStart(2024);
      const spring2025 = springRushStart(2025);

      expect(formatDenverDate(spring2024)).toBe('2024-03-15');
      expect(formatDenverDate(spring2025)).toBe('2025-03-15');
    });

    it('is in spring rush period', () => {
      const spring2024 = springRushStart(2024);
      expect(isSpringRush(spring2024)).toBe(true);
    });
  });

  describe('peakSeasonDate', () => {
    it('returns April 15 for given year', () => {
      const peak2024 = peakSeasonDate(2024);
      expect(formatDenverDate(peak2024)).toBe('2024-04-15');
    });

    it('has highest seasonal index', () => {
      const peak2024 = peakSeasonDate(2024);
      const month = getSeasonalMonth(peak2024);
      const index = seasonalIndices.find(s => s.month === month);

      expect(index?.index_value).toBe(1.80);
    });
  });

  describe('winterLullDate', () => {
    it('returns January 15 for given year', () => {
      const winter2024 = winterLullDate(2024);
      expect(formatDenverDate(winter2024)).toBe('2024-01-15');
    });

    it('is in winter lull period', () => {
      const winter2024 = winterLullDate(2024);
      expect(isWinterLull(winter2024)).toBe(true);
    });

    it('has low seasonal index', () => {
      const winter2024 = winterLullDate(2024);
      const month = getSeasonalMonth(winter2024);
      const index = seasonalIndices.find(s => s.month === month);

      expect(index?.index_value).toBe(0.60);
    });
  });
});

// ============================================================================
// CROSS-TIMEZONE EDGE CASES
// ============================================================================

describe('Cross-Timezone Edge Cases', () => {
  describe('midnight boundary handling', () => {
    it('late night UTC is same day in Denver', () => {
      // 11 PM Denver = 5 AM or 6 AM UTC next day
      const lateNight = createDenverDate(2024, 3, 15, 23, 0);
      expect(formatDenverDate(lateNight)).toBe('2024-03-15');
    });

    it('early morning UTC is previous day in Denver', () => {
      // If UTC shows March 16 at 5 AM, Denver might still be March 15
      const earlyUTC = new Date('2024-03-16T05:00:00Z');
      // In MST (-7), this is March 15 at 10 PM
      expect(formatDenverDate(earlyUTC)).toBe('2024-03-15');
    });
  });

  describe('DST transition handling', () => {
    // DST in US: Second Sunday in March, First Sunday in November

    it('handles spring forward (March)', () => {
      // 2024 DST starts March 10
      const beforeDST = createDenverDate(2024, 3, 9, 12, 0);
      const afterDST = createDenverDate(2024, 3, 11, 12, 0);

      // Both should format correctly regardless of DST
      expect(formatDenverDate(beforeDST)).toBe('2024-03-09');
      expect(formatDenverDate(afterDST)).toBe('2024-03-11');
    });

    it('handles fall back (November)', () => {
      // 2024 DST ends November 3
      const beforeFallback = createDenverDate(2024, 11, 2, 12, 0);
      const afterFallback = createDenverDate(2024, 11, 4, 12, 0);

      expect(formatDenverDate(beforeFallback)).toBe('2024-11-02');
      expect(formatDenverDate(afterFallback)).toBe('2024-11-04');
    });

    it('lead time calculation spans DST boundary', () => {
      // Order before DST, arrival after
      const orderDate = createDenverDate(2024, 3, 1, 10, 0);
      const arrival = calculateArrivalDate(orderDate, 21);

      // Should be 21 days later regardless of DST
      expect(formatDenverDate(arrival)).toBe('2024-03-22');
    });
  });

  describe('year boundary handling', () => {
    it('lead time spanning year boundary', () => {
      const orderDate = createDenverDate(2024, 12, 20, 10, 0);
      const arrival = calculateArrivalDate(orderDate, 45);

      // 45 days from Dec 20 = Feb 3 next year
      expect(formatDenverDate(arrival)).toBe('2025-02-03');
    });

    it('order-by calculation spanning year boundary', () => {
      const needDate = createDenverDate(2025, 1, 15, 12, 0);
      const orderBy = calculateOrderByDateTZ(needDate, 45, 7);

      // Jan 15 - 52 days = Nov 24 previous year
      const formattedDate = formatDenverDate(orderBy);
      expect(formattedDate.startsWith('2024-11')).toBe(true);
    });
  });
});
