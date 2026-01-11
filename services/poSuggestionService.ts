/**
 * PO Suggestion Service - Agentic Intelligence
 *
 * Generates intelligent purchase order suggestions with real inventory knowledge:
 * - Coverage analysis: Items with <30-60 days of stock need attention
 * - Velocity trends: Detect upticks/acceleration in sales
 * - Lead time awareness: Order early enough to receive before stockout
 * - ABC prioritization: A-items get higher service levels
 * - Seasonal patterns: Historical data drives proactive ordering
 */

import type { InventoryItem } from '../types';
import type { POSuggestion, SuggestionReason } from '../components/POSuggestionCard';

interface SuggestionOptions {
  maxSuggestions?: number;
  includeOptional?: boolean;
  targetCoverageDays?: number;
}

interface VelocityAnalysis {
  daily: number;
  trend: 'accelerating' | 'stable' | 'decelerating';
  trendPercent: number;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Analyze velocity trends across time windows
 * Detects upticks after sales, promotions, or seasonal demand
 */
function analyzeVelocity(item: InventoryItem): VelocityAnalysis {
  const v30 = (item.sales30Days ?? 0) / 30;
  const v60 = (item.sales60Days ?? 0) / 60;
  const v90 = (item.sales90Days ?? 0) / 90;

  // Weighted average for current velocity (recent data weighted more)
  let daily = 0;
  let totalWeight = 0;

  if (v30 > 0) { daily += v30 * 0.5; totalWeight += 0.5; }
  if (v60 > 0) { daily += v60 * 0.3; totalWeight += 0.3; }
  if (v90 > 0) { daily += v90 * 0.2; totalWeight += 0.2; }

  daily = totalWeight > 0 ? daily / totalWeight : (item.salesVelocity ?? 0);

  // Detect trend by comparing recent vs historical
  let trend: VelocityAnalysis['trend'] = 'stable';
  let trendPercent = 0;
  let confidence: VelocityAnalysis['confidence'] = 'low';

  if (v30 > 0 && v90 > 0) {
    const change = ((v30 - v90) / v90) * 100;
    trendPercent = change;
    confidence = v60 > 0 ? 'high' : 'medium';

    if (change > 20) {
      trend = 'accelerating'; // Sales uptick detected
    } else if (change < -20) {
      trend = 'decelerating';
    }
  } else if (v30 > 0 || v60 > 0) {
    confidence = 'medium';
  }

  return { daily, trend, trendPercent, confidence };
}

/**
 * Calculate runway considering lead time
 * Returns days until stockout, accounting for pending orders and lead time
 */
function calculateRunway(item: InventoryItem, velocity: VelocityAnalysis): {
  daysOfCover: number;
  runoutDate: Date | null;
  needsOrderBy: Date | null;
} {
  if (velocity.daily <= 0) {
    return { daysOfCover: Infinity, runoutDate: null, needsOrderBy: null };
  }

  const available = (item.stock ?? 0) + (item.onOrder ?? 0);
  const daysOfCover = available / velocity.daily;

  const runoutDate = daysOfCover < 365
    ? new Date(Date.now() + daysOfCover * 24 * 60 * 60 * 1000)
    : null;

  // Account for lead time - when must we order to avoid stockout?
  const leadTime = item.leadTimeDays ?? 14;
  const daysUntilOrderNeeded = daysOfCover - leadTime;
  const needsOrderBy = daysUntilOrderNeeded > 0 && daysUntilOrderNeeded < 60
    ? new Date(Date.now() + daysUntilOrderNeeded * 24 * 60 * 60 * 1000)
    : null;

  return { daysOfCover, runoutDate, needsOrderBy };
}

/**
 * Get target coverage days based on ABC classification
 * A items: higher service level, more safety stock
 * C items: lean inventory acceptable
 */
function getTargetCoverage(item: InventoryItem): number {
  const abcClass = item.abcClass?.toUpperCase();
  switch (abcClass) {
    case 'A': return 60; // High value, never stockout
    case 'B': return 45; // Standard coverage
    case 'C': return 30; // Lean OK for low-value items
    default: return 45;
  }
}

/**
 * Determine urgency with lead-time awareness
 */
function getUrgencyLevel(
  daysOfCover: number,
  leadTime: number,
  rop: number,
  stock: number,
  abcClass?: string
): POSuggestion['urgencyLevel'] {
  // Critical: Will stockout before lead time completes
  if (daysOfCover < leadTime) return 'critical';

  // Critical: Already below reorder point for A-items
  if (abcClass === 'A' && rop > 0 && stock < rop) return 'critical';

  // High: Less than 2x lead time, or below ROP
  if (daysOfCover < leadTime * 2 || (rop > 0 && stock < rop)) return 'high';

  // Medium: Below 30 days coverage
  if (daysOfCover < 30) return 'medium';

  // Low: Proactive suggestion
  return 'low';
}

/**
 * Calculate recommended order quantity with trend awareness
 */
function calculateOrderQuantity(
  item: InventoryItem,
  velocity: VelocityAnalysis,
  targetDays: number
): number {
  // Adjust for accelerating demand
  let adjustedVelocity = velocity.daily;
  if (velocity.trend === 'accelerating' && velocity.confidence !== 'low') {
    // Increase order size by half the trend increase
    adjustedVelocity *= 1 + (velocity.trendPercent / 200);
  }

  const available = (item.stock ?? 0) + (item.onOrder ?? 0);
  const safetyStock = item.safetyStock ?? 0;
  const moq = item.moq || 1;

  const targetUnits = Math.ceil(adjustedVelocity * targetDays) + safetyStock;
  const shortfall = targetUnits - available;

  if (shortfall <= 0) return 0;

  // Round up to MOQ
  return Math.max(moq, Math.ceil(shortfall / moq) * moq);
}

/**
 * Generate intelligent, data-driven reasoning
 */
function generateReasoning(
  item: InventoryItem,
  reason: SuggestionReason,
  velocity: VelocityAnalysis,
  runway: ReturnType<typeof calculateRunway>
): string {
  const stock = item.stock ?? 0;
  const rop = item.reorderPoint ?? 0;
  const onOrder = item.onOrder ?? 0;
  const leadTime = item.leadTimeDays ?? 14;
  const abcClass = item.abcClass?.toUpperCase() || '';

  // Format dates nicely
  const formatDate = (d: Date | null) =>
    d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'unknown';

  switch (reason) {
    case 'stockout_imminent':
      if (runway.daysOfCover < leadTime) {
        return `URGENT: Only ${runway.daysOfCover.toFixed(0)} days of stock vs ${leadTime}-day lead time. ` +
          `At ${velocity.daily.toFixed(1)}/day, will stockout before new order arrives. Order immediately.`;
      }
      return `${runway.daysOfCover.toFixed(0)} days remaining (runout ~${formatDate(runway.runoutDate)}). ` +
        `At ${velocity.daily.toFixed(1)}/day, order by ${formatDate(runway.needsOrderBy)} to avoid stockout.`;

    case 'below_rop':
      const ropDeficit = ((rop - stock) / rop * 100).toFixed(0);
      return `Stock (${stock}) is ${ropDeficit}% below ROP of ${rop}. ` +
        `${abcClass === 'A' ? 'A-class item - high priority to restore.' : ''} ` +
        `${onOrder > 0 ? `${onOrder} on order.` : 'No pending orders.'}`;

    case 'low_coverage':
      const target = getTargetCoverage(item);
      if (velocity.trend === 'accelerating') {
        return `Coverage is ${runway.daysOfCover.toFixed(0)} days vs ${target}-day target. ` +
          `Sales trending UP ${velocity.trendPercent.toFixed(0)}% - order extra to cover demand increase.`;
      }
      return `${runway.daysOfCover.toFixed(0)} days coverage vs recommended ${target} days. ` +
        `Selling ${velocity.daily.toFixed(1)}/day. Order now to maintain safety buffer.`;

    case 'seasonal_demand':
      return `Sales up ${velocity.trendPercent.toFixed(0)}% vs prior period - seasonal uptick detected. ` +
        `${abcClass === 'A' ? 'Critical A-item: ' : ''}Proactive order recommended before peak demand.`;

    case 'moq_efficiency':
      return `Near reorder point. Ordering MOQ (${item.moq}) optimizes unit economics. ` +
        `Current runway: ${runway.daysOfCover.toFixed(0)} days.`;

    case 'frequently_ordered':
      return `Regularly ordered from this vendor. Adding to PO consolidates freight costs. ` +
        `${runway.daysOfCover.toFixed(0)} days remaining at ${velocity.daily.toFixed(1)}/day.`;

    default:
      return `${runway.daysOfCover.toFixed(0)} days coverage at ${velocity.daily.toFixed(1)}/day. ` +
        `Order recommended to maintain service levels.`;
  }
}

/**
 * Generate suggestions for a specific vendor's items
 * Uses agentic intelligence to prioritize based on real inventory data
 */
export function generateVendorSuggestions(
  vendorItems: InventoryItem[],
  existingSkus: Set<string> = new Set(),
  options: SuggestionOptions = {}
): POSuggestion[] {
  const {
    maxSuggestions = 10,
    includeOptional = true,
  } = options;

  const suggestions: POSuggestion[] = [];

  for (const item of vendorItems) {
    // Skip items already in PO
    if (existingSkus.has(item.sku)) continue;

    // Skip excluded items
    const category = (item.category || '').toLowerCase();
    if (['dropship', 'discontinued', 'deprecated', 'deprecating'].some(c => category.includes(c))) continue;
    if (item.isDropship || item.stockIntelExclude) continue;

    // Analyze velocity and runway
    const velocity = analyzeVelocity(item);
    if (velocity.daily <= 0) continue;

    const runway = calculateRunway(item, velocity);
    const stock = item.stock ?? 0;
    const rop = item.reorderPoint ?? 0;
    const leadTime = item.leadTimeDays ?? 14;
    const targetCoverage = getTargetCoverage(item);

    // Determine suggestion reason with intelligence
    let reason: SuggestionReason | null = null;
    let targetDays = targetCoverage;

    // Priority 1: Imminent stockout (< lead time runway)
    if (runway.daysOfCover < leadTime * 1.5) {
      reason = 'stockout_imminent';
      targetDays = Math.max(30, leadTime * 2);
    }
    // Priority 2: Below reorder point
    else if (rop > 0 && stock < rop) {
      reason = 'below_rop';
      targetDays = targetCoverage;
    }
    // Priority 3: Sales accelerating - seasonal/promotional uptick
    else if (velocity.trend === 'accelerating' && velocity.trendPercent > 25 && runway.daysOfCover < 60) {
      reason = 'seasonal_demand';
      targetDays = 60; // Extra buffer for rising demand
    }
    // Priority 4: Low coverage (< 30 days)
    else if (runway.daysOfCover < 30) {
      reason = 'low_coverage';
      targetDays = targetCoverage;
    }
    // Priority 5: Coverage below target (optional suggestions)
    else if (includeOptional && runway.daysOfCover < targetCoverage) {
      reason = 'low_coverage';
      targetDays = targetCoverage;
    }
    // Priority 6: MOQ efficiency for items near reorder point
    else if (includeOptional && rop > 0 && stock < rop * 1.3 && item.moq && item.moq > 1) {
      reason = 'moq_efficiency';
      targetDays = targetCoverage;
    }

    if (!reason) continue;

    const quantity = calculateOrderQuantity(item, velocity, targetDays);
    if (quantity <= 0) continue;

    const urgencyLevel = getUrgencyLevel(runway.daysOfCover, leadTime, rop, stock, item.abcClass);
    const reasoning = generateReasoning(item, reason, velocity, runway);

    suggestions.push({
      sku: item.sku,
      name: item.name,
      quantity,
      unitCost: item.unitCost ?? 0,
      reason,
      reasoning,
      urgencyLevel,
      details: {
        currentStock: stock,
        onOrder: item.onOrder ?? 0,
        reorderPoint: rop > 0 ? rop : undefined,
        daysOfCover: runway.daysOfCover === Infinity ? 999 : Math.round(runway.daysOfCover),
        dailyVelocity: velocity.daily,
        targetDays,
        abcClass: item.abcClass as 'A' | 'B' | 'C' | undefined,
        xyzClass: item.xyzClass as 'X' | 'Y' | 'Z' | undefined,
      },
    });
  }

  // Sort by urgency and ABC class (A-items first within each urgency)
  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const abcOrder: Record<string, number> = { A: 0, B: 1, C: 2 };

  return suggestions
    .sort((a, b) => {
      const urgencyDiff = urgencyOrder[a.urgencyLevel] - urgencyOrder[b.urgencyLevel];
      if (urgencyDiff !== 0) return urgencyDiff;

      const abcA = abcOrder[a.details.abcClass || 'C'] ?? 2;
      const abcB = abcOrder[b.details.abcClass || 'C'] ?? 2;
      return abcA - abcB;
    })
    .slice(0, maxSuggestions);
}

/**
 * Get the total value of suggestions
 */
export function getSuggestionsTotalValue(suggestions: POSuggestion[]): number {
  return suggestions.reduce((sum, s) => sum + s.quantity * s.unitCost, 0);
}

/**
 * Count suggestions by urgency level
 */
export function getSuggestionsBreakdown(suggestions: POSuggestion[]): Record<string, number> {
  return {
    critical: suggestions.filter(s => s.urgencyLevel === 'critical').length,
    high: suggestions.filter(s => s.urgencyLevel === 'high').length,
    medium: suggestions.filter(s => s.urgencyLevel === 'medium').length,
    low: suggestions.filter(s => s.urgencyLevel === 'low').length,
  };
}
