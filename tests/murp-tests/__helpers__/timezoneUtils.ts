/**
 * Timezone Utilities for MuRP Tests
 *
 * BuildASoil operates in America/Denver (Mountain Time).
 * These utilities ensure timezone-aware date calculations for:
 * - Order deadlines
 * - Lead time calculations
 * - Seasonal index lookups
 * - Business hour validations
 *
 * CLAUDE CODE: Always use these helpers for timezone-sensitive tests.
 * Raw Date objects default to UTC which can cause off-by-one errors.
 */

import { format, parse, addDays, subDays, startOfDay, endOfDay, isWeekend } from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';

// BuildASoil's operational timezone
export const BUILDASOIL_TIMEZONE = 'America/Denver';

// Business hours (Mountain Time)
export const BUSINESS_HOURS = {
  start: 8,  // 8 AM MT
  end: 17,   // 5 PM MT
  orderCutoff: 14, // 2 PM MT for same-day processing
};

// ============================================================================
// TIMEZONE CONVERSION
// ============================================================================

/**
 * Convert a UTC date to BuildASoil local time
 */
export function toLocalTime(date: Date): Date {
  return toZonedTime(date, BUILDASOIL_TIMEZONE);
}

/**
 * Convert a BuildASoil local time to UTC
 */
export function toUTC(localDate: Date): Date {
  return fromZonedTime(localDate, BUILDASOIL_TIMEZONE);
}

/**
 * Get current time in BuildASoil timezone
 */
export function nowInDenver(): Date {
  return toZonedTime(new Date(), BUILDASOIL_TIMEZONE);
}

/**
 * Format a date in BuildASoil timezone
 */
export function formatDenverDate(date: Date, formatStr: string = 'yyyy-MM-dd'): string {
  return formatInTimeZone(date, BUILDASOIL_TIMEZONE, formatStr);
}

/**
 * Format a date with time in BuildASoil timezone
 */
export function formatDenverDateTime(date: Date): string {
  return formatInTimeZone(date, BUILDASOIL_TIMEZONE, 'yyyy-MM-dd HH:mm:ss zzz');
}

// ============================================================================
// BUSINESS DAY CALCULATIONS
// ============================================================================

/**
 * Check if a date is a business day (Mon-Fri, not weekend)
 * Note: Does not account for holidays
 */
export function isBusinessDay(date: Date): boolean {
  const localDate = toLocalTime(date);
  return !isWeekend(localDate);
}

/**
 * Get next business day from a given date
 */
export function nextBusinessDay(date: Date): Date {
  let nextDay = addDays(date, 1);
  while (!isBusinessDay(nextDay)) {
    nextDay = addDays(nextDay, 1);
  }
  return nextDay;
}

/**
 * Get previous business day from a given date
 */
export function previousBusinessDay(date: Date): Date {
  let prevDay = subDays(date, 1);
  while (!isBusinessDay(prevDay)) {
    prevDay = subDays(prevDay, 1);
  }
  return prevDay;
}

/**
 * Add N business days to a date
 */
export function addBusinessDays(date: Date, days: number): Date {
  let result = date;
  let remaining = days;

  while (remaining > 0) {
    result = addDays(result, 1);
    if (isBusinessDay(result)) {
      remaining--;
    }
  }

  return result;
}

/**
 * Subtract N business days from a date
 */
export function subtractBusinessDays(date: Date, days: number): Date {
  let result = date;
  let remaining = days;

  while (remaining > 0) {
    result = subDays(result, 1);
    if (isBusinessDay(result)) {
      remaining--;
    }
  }

  return result;
}

/**
 * Count business days between two dates
 */
export function countBusinessDays(startDate: Date, endDate: Date): number {
  let count = 0;
  let current = addDays(startDate, 1);

  while (current <= endDate) {
    if (isBusinessDay(current)) {
      count++;
    }
    current = addDays(current, 1);
  }

  return count;
}

// ============================================================================
// ORDER CUTOFF TIME
// ============================================================================

/**
 * Check if current time is before order cutoff (2 PM MT)
 */
export function isBeforeOrderCutoff(date: Date = new Date()): boolean {
  const localTime = toLocalTime(date);
  return localTime.getHours() < BUSINESS_HOURS.orderCutoff;
}

/**
 * Get the effective order date based on cutoff
 * If after cutoff, order ships next business day
 */
export function getEffectiveOrderDate(orderTime: Date = new Date()): Date {
  const localTime = toLocalTime(orderTime);

  if (!isBusinessDay(orderTime)) {
    return nextBusinessDay(orderTime);
  }

  if (localTime.getHours() >= BUSINESS_HOURS.orderCutoff) {
    return nextBusinessDay(orderTime);
  }

  // Return the same date (ships today) - use the input date directly
  // since we just want to confirm it ships on this calendar day
  return orderTime;
}

// ============================================================================
// LEAD TIME CALCULATIONS (Timezone-Aware)
// ============================================================================

/**
 * Calculate arrival date based on lead time
 * Uses calendar days (vendors ship any day)
 */
export function calculateArrivalDate(
  orderDate: Date,
  leadTimeDays: number
): Date {
  return addDays(orderDate, leadTimeDays);
}

/**
 * Calculate order-by date for a target need date
 * Accounts for timezone and ensures sufficient lead time
 */
export function calculateOrderByDateTZ(
  needDate: Date,
  leadTimeDays: number,
  safetyBufferDays: number = 7
): Date {
  // Convert need date to Denver time for consistent calculation
  const needDateLocal = toLocalTime(needDate);

  // Subtract lead time and buffer
  const orderByDate = subDays(needDateLocal, leadTimeDays + safetyBufferDays);

  // If order-by falls on weekend, move to previous Friday
  if (!isBusinessDay(orderByDate)) {
    return previousBusinessDay(orderByDate);
  }

  return orderByDate;
}

/**
 * Check if we have enough lead time to meet a need date
 */
export function hasAdequateLeadTime(
  needDate: Date,
  leadTimeDays: number,
  today: Date = new Date()
): boolean {
  const daysAvailable = Math.ceil(
    (needDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysAvailable >= leadTimeDays;
}

// ============================================================================
// SEASONAL DATE HELPERS
// ============================================================================

/**
 * Get month name for seasonal index lookup
 */
export function getSeasonalMonth(date: Date): number {
  const localDate = toLocalTime(date);
  return localDate.getMonth() + 1; // 1-12
}

/**
 * Check if date is in spring rush (March-May)
 */
export function isSpringRush(date: Date): boolean {
  const month = getSeasonalMonth(date);
  return month >= 3 && month <= 5;
}

/**
 * Check if date is in winter lull (Dec-Jan)
 */
export function isWinterLull(date: Date): boolean {
  const month = getSeasonalMonth(date);
  return month === 12 || month === 1;
}

/**
 * Get the seasonal period name
 */
export function getSeasonalPeriod(date: Date): string {
  const month = getSeasonalMonth(date);

  if (month >= 3 && month <= 5) return 'spring_rush';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}

// ============================================================================
// WEEK CALCULATIONS (ISO Week in Mountain Time)
// ============================================================================

/**
 * Get ISO week number in Denver timezone
 */
export function getDenverWeekNumber(date: Date): number {
  const localDate = toLocalTime(date);
  const startOfYear = new Date(localDate.getFullYear(), 0, 1);
  const days = Math.floor((localDate.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + startOfYear.getDay() + 1) / 7);
}

/**
 * Get ISO week string (YYYY-WW) in Denver timezone
 */
export function getDenverWeekString(date: Date): string {
  const localDate = toLocalTime(date);
  const year = localDate.getFullYear();
  const week = getDenverWeekNumber(date);
  return `${year}-${week.toString().padStart(2, '0')}`;
}

/**
 * Get start of week in Denver timezone (Monday)
 */
export function getDenverWeekStart(date: Date): Date {
  const localDate = toLocalTime(date);
  const day = localDate.getDay();
  const diff = localDate.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(localDate.setDate(diff));
}

// ============================================================================
// TEST SCENARIO DATES
// ============================================================================

/**
 * Create a deterministic date in Denver timezone for testing
 */
export function createDenverDate(
  year: number,
  month: number,
  day: number,
  hour: number = 12,
  minute: number = 0
): Date {
  // Create date string in ISO format
  const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;

  // Parse as Denver time and convert to UTC for storage
  return fromZonedTime(new Date(dateStr), BUILDASOIL_TIMEZONE);
}

/**
 * Spring rush start date (March 15) for a given year
 */
export function springRushStart(year: number): Date {
  return createDenverDate(year, 3, 15);
}

/**
 * Peak season date (April 15) for a given year
 */
export function peakSeasonDate(year: number): Date {
  return createDenverDate(year, 4, 15);
}

/**
 * Winter lull date (January 15) for a given year
 */
export function winterLullDate(year: number): Date {
  return createDenverDate(year, 1, 15);
}
