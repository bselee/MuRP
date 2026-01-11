/**
 * PO Suggestion Service
 *
 * Generates intelligent purchase order suggestions based on:
 * - Stockout risk and days of cover
 * - Reorder point breaches
 * - Sales velocity and trends
 * - ABC/XYZ classification
 * - MOQ efficiency
 */

import type { InventoryItem } from '../types';
import type { POSuggestion, SuggestionReason } from '../components/POSuggestionCard';

interface SuggestionOptions {
  maxSuggestions?: number;
  includeOptional?: boolean;
  targetCoverageDays?: number;
}

/**
 * Calculate daily consumption using weighted average of multiple time windows
 */
function getDailyConsumption(item: InventoryItem): number {
  const windows = [
    { value: item.sales30Days ?? 0, days: 30, weight: 0.5 },
    { value: item.sales60Days ?? 0, days: 60, weight: 0.3 },
    { value: item.sales90Days ?? 0, days: 90, weight: 0.2 },
  ];

  const weightedSum = windows.reduce((sum, entry) => {
    if (!entry.value || entry.value <= 0) return sum;
    return sum + (entry.value / entry.days) * entry.weight;
  }, 0);

  const totalWeight = windows.reduce((sum, entry) => {
    if (!entry.value || entry.value <= 0) return sum;
    return sum + entry.weight;
  }, 0);

  if (weightedSum > 0 && totalWeight > 0) {
    return weightedSum / totalWeight;
  }

  return item.salesVelocity ?? 0;
}

/**
 * Calculate days of cover based on available stock and consumption
 */
function getDaysOfCover(item: InventoryItem): number {
  const dailyConsumption = getDailyConsumption(item);
  if (dailyConsumption <= 0) return Infinity;

  const available = (item.stock ?? 0) + (item.onOrder ?? 0);
  return available / dailyConsumption;
}

/**
 * Determine urgency level based on days of cover
 */
function getUrgencyLevel(daysOfCover: number, rop: number, stock: number): POSuggestion['urgencyLevel'] {
  if (daysOfCover < 7 || (rop > 0 && stock < rop * 0.5)) return 'critical';
  if (daysOfCover < 14 || (rop > 0 && stock < rop)) return 'high';
  if (daysOfCover < 30) return 'medium';
  return 'low';
}

/**
 * Calculate recommended order quantity
 */
function calculateOrderQuantity(
  item: InventoryItem,
  targetDays: number
): number {
  const dailyConsumption = getDailyConsumption(item);
  const available = (item.stock ?? 0) + (item.onOrder ?? 0);
  const safetyStock = item.safetyStock ?? 0;
  const moq = item.moq || 1;

  // Target: enough for targetDays + safety stock
  const targetUnits = Math.ceil(dailyConsumption * targetDays) + safetyStock;
  const shortfall = targetUnits - available;

  if (shortfall <= 0) return 0;

  // Round up to MOQ
  const roundedQuantity = Math.ceil(shortfall / moq) * moq;
  return Math.max(moq, roundedQuantity);
}

/**
 * Generate human-readable reasoning for the suggestion
 */
function generateReasoning(
  item: InventoryItem,
  reason: SuggestionReason,
  daysOfCover: number,
  dailyVelocity: number
): string {
  const stock = item.stock ?? 0;
  const rop = item.reorderPoint ?? 0;
  const onOrder = item.onOrder ?? 0;

  switch (reason) {
    case 'stockout_imminent':
      return `Only ${daysOfCover.toFixed(0)} days of stock remaining at current sales rate (${dailyVelocity.toFixed(1)}/day). Without reorder, stockout expected ${daysOfCover < 7 ? 'within a week' : 'soon'}.`;

    case 'below_rop':
      return `Current stock (${stock}) is ${((rop - stock) / rop * 100).toFixed(0)}% below reorder point of ${rop}. ${onOrder > 0 ? `${onOrder} already on order.` : 'No orders pending.'}`;

    case 'low_coverage':
      return `Coverage is ${daysOfCover.toFixed(0)} days vs recommended 30-60 day target. At ${dailyVelocity.toFixed(1)} units/day, recommend ordering to maintain adequate safety stock.`;

    case 'seasonal_demand':
      return `Historical data suggests increased demand in upcoming period. Proactive ordering recommended to avoid shortages during peak season.`;

    case 'price_opportunity':
      return `Current vendor pricing is favorable. Consider ordering ahead to lock in pricing before potential increases.`;

    case 'moq_efficiency':
      return `Ordering MOQ (${item.moq}) provides better unit economics. Small top-up order to optimize inventory levels.`;

    case 'frequently_ordered':
      return `This item is frequently ordered from this vendor. Including it in this PO consolidates shipments and may reduce freight costs.`;

    default:
      return `Inventory levels suggest reorder is advisable to maintain service levels.`;
  }
}

/**
 * Generate suggestions for a specific vendor's items
 */
export function generateVendorSuggestions(
  vendorItems: InventoryItem[],
  existingSkus: Set<string> = new Set(),
  options: SuggestionOptions = {}
): POSuggestion[] {
  const {
    maxSuggestions = 10,
    includeOptional = true,
    targetCoverageDays = 45,
  } = options;

  const suggestions: POSuggestion[] = [];

  for (const item of vendorItems) {
    // Skip items already in the PO
    if (existingSkus.has(item.sku)) continue;

    // Skip dropship/discontinued items
    const category = (item.category || '').toLowerCase();
    if (['dropship', 'discontinued', 'deprecated'].some(c => category.includes(c))) continue;

    const dailyVelocity = getDailyConsumption(item);
    if (dailyVelocity <= 0) continue;

    const daysOfCover = getDaysOfCover(item);
    const stock = item.stock ?? 0;
    const rop = item.reorderPoint ?? 0;

    // Determine reason and if we should suggest
    let reason: SuggestionReason | null = null;
    let targetDays = targetCoverageDays;

    if (daysOfCover < 7) {
      reason = 'stockout_imminent';
      targetDays = 30;
    } else if (rop > 0 && stock < rop) {
      reason = 'below_rop';
      targetDays = 45;
    } else if (daysOfCover < 30) {
      reason = 'low_coverage';
      targetDays = 45;
    } else if (daysOfCover < 60 && includeOptional) {
      reason = 'low_coverage';
      targetDays = 60;
    }

    if (!reason) continue;

    const quantity = calculateOrderQuantity(item, targetDays);
    if (quantity <= 0) continue;

    const urgencyLevel = getUrgencyLevel(daysOfCover, rop, stock);
    const reasoning = generateReasoning(item, reason, daysOfCover, dailyVelocity);

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
        daysOfCover: daysOfCover === Infinity ? 999 : daysOfCover,
        dailyVelocity,
        targetDays,
        abcClass: item.abcClass as 'A' | 'B' | 'C' | undefined,
        xyzClass: item.xyzClass as 'X' | 'Y' | 'Z' | undefined,
      },
    });

    if (suggestions.length >= maxSuggestions) break;
  }

  // Sort by urgency (critical first, then high, etc.)
  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return suggestions.sort((a, b) => urgencyOrder[a.urgencyLevel] - urgencyOrder[b.urgencyLevel]);
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
