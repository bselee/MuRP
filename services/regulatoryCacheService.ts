// Tier 1 AI Enhancement: Compliance Knowledge Base
// Service for caching and retrieving regulatory scan results

import type { RegulatoryScan } from '../types/regulatory';
import type { BOMComponent } from '../types';

// In-memory cache for now (would be replaced with Supabase database queries in production)
let scanCache: RegulatoryScan[] = [];

/**
 * Check if a cached scan exists for similar product/state combination
 * Returns cached result if:
 * - Same state
 * - Same or very similar ingredients (fuzzy match)
 * - Not expired (< 90 days old)
 */
export function getCachedScan(
  productName: string,
  ingredients: BOMComponent[],
  state: string,
  bomId: string
): RegulatoryScan | null {
  const now = new Date();
  
  // Find scans for the same state that haven't expired
  const validScans = scanCache.filter(scan => {
    const expiresAt = new Date(scan.expiresAt);
    return scan.state === state && expiresAt > now;
  });

  if (validScans.length === 0) return null;

  // Check for exact BOM match first
  const exactMatch = validScans.find(scan => scan.bomId === bomId);
  if (exactMatch) return exactMatch;

  // Check for similar ingredients (fuzzy match)
  // A scan is considered similar if it has at least 80% ingredient overlap
  const ingredientNames = ingredients.map(i => i.name.toLowerCase()).sort();
  
  for (const scan of validScans) {
    const scanIngredients = scan.ingredients.map(i => i.name.toLowerCase()).sort();
    const matchCount = ingredientNames.filter(name => 
      scanIngredients.includes(name)
    ).length;
    
    const matchPercentage = matchCount / Math.max(ingredientNames.length, scanIngredients.length);
    
    // If 80% or more ingredients match, consider it similar enough
    if (matchPercentage >= 0.8) {
      return scan;
    }
  }

  return null;
}

/**
 * Save a new regulatory scan to the cache
 */
export function saveScanToCache(
  productName: string,
  ingredients: BOMComponent[],
  state: string,
  results: string,
  sourceUrls: string[],
  bomId: string
): RegulatoryScan {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 90); // Expire in 90 days

  const scan: RegulatoryScan = {
    id: `scan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    productName,
    ingredients: ingredients.map(i => ({ sku: i.sku, name: i.name, quantity: i.quantity })),
    state,
    scanDate: now.toISOString(),
    results,
    sourceUrls,
    expiresAt: expiresAt.toISOString(),
    bomId,
  };

  scanCache.push(scan);
  return scan;
}

/**
 * Get all cached scans (for debugging/admin purposes)
 */
export function getAllCachedScans(): RegulatoryScan[] {
  return scanCache;
}

/**
 * Clear expired scans from cache
 */
export function cleanExpiredScans(): number {
  const now = new Date();
  const initialLength = scanCache.length;
  
  scanCache = scanCache.filter(scan => {
    const expiresAt = new Date(scan.expiresAt);
    return expiresAt > now;
  });

  return initialLength - scanCache.length; // Return number of scans removed
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const now = new Date();
  const validScans = scanCache.filter(scan => {
    const expiresAt = new Date(scan.expiresAt);
    return expiresAt > now;
  });

  const stateBreakdown: Record<string, number> = {};
  validScans.forEach(scan => {
    stateBreakdown[scan.state] = (stateBreakdown[scan.state] || 0) + 1;
  });

  return {
    totalScans: scanCache.length,
    validScans: validScans.length,
    expiredScans: scanCache.length - validScans.length,
    stateBreakdown,
  };
}

/**
 * Get the age of a scan in days
 */
export function getScanAge(scan: RegulatoryScan): number {
  const now = new Date();
  const scanDate = new Date(scan.scanDate);
  const diffMs = now.getTime() - scanDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
