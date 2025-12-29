/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THREE-WAY MATCH SERVICE - PO vs Invoice vs Receipt Verification
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Automated verification of:
 * 1. Purchase Order (what was ordered)
 * 2. Invoice (what vendor charged)
 * 3. Receipt (what was actually received)
 *
 * Key Features:
 * - Quantity variance detection (ordered vs received vs invoiced)
 * - Price variance detection (PO price vs invoice price)
 * - Automatic approval within tolerance thresholds
 * - Flags discrepancies for human review
 * - Enables autonomous backorder detection
 *
 * @module services/threeWayMatchService
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ThreeWayMatchResult {
  poId: string;
  poNumber: string;
  vendorName: string;
  matchStatus: 'matched' | 'partial_match' | 'mismatch' | 'pending_data';
  overallScore: number; // 0-100, 100 = perfect match
  canAutoApprove: boolean;
  lineItems: LineItemMatch[];
  totals: TotalMatch;
  discrepancies: Discrepancy[];
  recommendations: MatchRecommendation[];
  matchedAt: string;
}

export interface LineItemMatch {
  sku: string;
  itemName: string;

  // PO Data
  poQuantity: number;
  poUnitPrice: number;
  poLineTotal: number;

  // Receipt Data
  receivedQuantity: number;
  receivedDate: string | null;

  // Invoice Data
  invoicedQuantity: number | null;
  invoicedUnitPrice: number | null;
  invoicedLineTotal: number | null;

  // Match Results
  quantityMatch: MatchStatus;
  priceMatch: MatchStatus;
  discrepancyType: DiscrepancyType | null;
  varianceAmount: number;
  variancePercentage: number;
}

export interface TotalMatch {
  poSubtotal: number;
  poTax: number;
  poShipping: number;
  poTotal: number;

  invoiceSubtotal: number | null;
  invoiceTax: number | null;
  invoiceShipping: number | null;
  invoiceTotal: number | null;

  totalVariance: number;
  totalVariancePercentage: number;
  isWithinTolerance: boolean;
}

export interface Discrepancy {
  id: string;
  type: DiscrepancyType;
  severity: 'info' | 'warning' | 'critical';
  sku?: string;
  description: string;
  poValue: number;
  actualValue: number;
  varianceAmount: number;
  variancePercentage: number;
  suggestedAction: SuggestedAction;
  requiresHumanReview: boolean;
}

export interface MatchRecommendation {
  action: SuggestedAction;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  autoExecutable: boolean;
}

export type MatchStatus = 'exact' | 'within_tolerance' | 'overage' | 'shortage' | 'missing';

export type DiscrepancyType =
  | 'quantity_shortage'    // Received less than ordered
  | 'quantity_overage'     // Received more than ordered
  | 'price_increase'       // Invoice price higher than PO
  | 'price_decrease'       // Invoice price lower than PO
  | 'invoice_overcharge'   // Invoiced for more than received
  | 'invoice_undercharge'  // Invoiced for less than received
  | 'missing_from_invoice' // Item on PO but not invoiced
  | 'extra_on_invoice'     // Item on invoice but not on PO
  | 'shipping_variance'    // Shipping cost differs
  | 'tax_variance';        // Tax amount differs

export type SuggestedAction =
  | 'approve'              // Everything matches, approve payment
  | 'create_backorder'     // Shortage - create follow-up PO
  | 'request_credit'       // Overage/overcharge - request credit memo
  | 'dispute_invoice'      // Significant variance - dispute with vendor
  | 'update_po_price'      // Minor price change - update PO for records
  | 'manual_review'        // Complex situation - needs human
  | 'return_overage';      // Received too much - return to vendor

export interface MatchThresholds {
  quantityTolerancePercent: number;    // e.g., 2% = allow 2% shortage/overage
  priceTolerancePercent: number;       // e.g., 5% = allow 5% price variance
  priceToleranceAbsolute: number;      // e.g., $10 = ignore price diff under $10
  totalTolerancePercent: number;       // e.g., 3% = allow 3% total variance
  autoApproveMaxVariance: number;      // e.g., $50 = auto-approve if total variance < $50
}

// Default thresholds
const DEFAULT_THRESHOLDS: MatchThresholds = {
  quantityTolerancePercent: 2,
  priceTolerancePercent: 5,
  priceToleranceAbsolute: 10,
  totalTolerancePercent: 3,
  autoApproveMaxVariance: 50,
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Match Function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Perform three-way match for a purchase order
 */
export async function performThreeWayMatch(
  poId: string,
  thresholds?: Partial<MatchThresholds>
): Promise<ThreeWayMatchResult> {
  const mergedThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };

  // 1. Get PO header and line items
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select(`
      id,
      order_id,
      supplier_name,
      subtotal,
      tax_amount,
      shipping_cost,
      total_amount,
      status,
      purchase_order_items (
        id,
        inventory_sku,
        item_name,
        quantity_ordered,
        quantity_received,
        unit_cost,
        line_total,
        line_status
      )
    `)
    .eq('id', poId)
    .single();

  if (poError || !po) {
    throw new Error(`PO not found: ${poId}`);
  }

  // 2. Get invoice data if available
  const { data: invoice } = await supabase
    .from('po_invoice_data')
    .select('*')
    .eq('po_id', poId)
    .order('extracted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 3. Parse invoice line items if available
  const invoiceLineItems: Map<string, { qty: number; price: number; total: number }> = new Map();
  if (invoice?.line_items) {
    for (const item of invoice.line_items as any[]) {
      invoiceLineItems.set(item.sku?.toLowerCase() || item.description?.toLowerCase(), {
        qty: item.quantity,
        price: item.unitPrice || item.unit_price,
        total: item.lineTotal || item.line_total,
      });
    }
  }

  // 4. Match each line item
  const lineItems: LineItemMatch[] = [];
  const discrepancies: Discrepancy[] = [];

  for (const poItem of po.purchase_order_items || []) {
    const sku = poItem.inventory_sku.toLowerCase();
    const invoiceItem = invoiceLineItems.get(sku);

    const lineMatch = matchLineItem(
      poItem,
      invoiceItem || null,
      mergedThresholds
    );

    lineItems.push(lineMatch);

    // Collect discrepancies
    if (lineMatch.discrepancyType) {
      discrepancies.push(createDiscrepancy(lineMatch, poItem));
    }
  }

  // 5. Check for items on invoice but not on PO
  if (invoice?.line_items) {
    const poSkus = new Set(
      (po.purchase_order_items || []).map((i: any) => i.inventory_sku.toLowerCase())
    );

    for (const invItem of invoice.line_items as any[]) {
      const invSku = (invItem.sku || invItem.description || '').toLowerCase();
      if (!poSkus.has(invSku) && invSku) {
        discrepancies.push({
          id: crypto.randomUUID(),
          type: 'extra_on_invoice',
          severity: 'warning',
          sku: invSku,
          description: `Item "${invItem.description || invSku}" appears on invoice but not on PO`,
          poValue: 0,
          actualValue: invItem.lineTotal || invItem.line_total || 0,
          varianceAmount: invItem.lineTotal || invItem.line_total || 0,
          variancePercentage: 100,
          suggestedAction: 'dispute_invoice',
          requiresHumanReview: true,
        });
      }
    }
  }

  // 6. Match totals
  const totals = matchTotals(po, invoice, mergedThresholds);

  // Add total-level discrepancies
  if (Math.abs(totals.totalVariance) > mergedThresholds.autoApproveMaxVariance) {
    if (totals.invoiceTotal && totals.invoiceTotal > totals.poTotal) {
      discrepancies.push({
        id: crypto.randomUUID(),
        type: 'invoice_overcharge',
        severity: totals.totalVariancePercentage > 10 ? 'critical' : 'warning',
        description: `Invoice total $${totals.invoiceTotal?.toFixed(2)} exceeds PO total $${totals.poTotal.toFixed(2)}`,
        poValue: totals.poTotal,
        actualValue: totals.invoiceTotal,
        varianceAmount: totals.totalVariance,
        variancePercentage: totals.totalVariancePercentage,
        suggestedAction: 'dispute_invoice',
        requiresHumanReview: true,
      });
    }
  }

  // 7. Determine overall status and recommendations
  const { matchStatus, overallScore, canAutoApprove, recommendations } =
    evaluateOverallMatch(lineItems, totals, discrepancies, mergedThresholds);

  // 8. Store match result
  const result: ThreeWayMatchResult = {
    poId,
    poNumber: po.order_id,
    vendorName: po.supplier_name,
    matchStatus,
    overallScore,
    canAutoApprove,
    lineItems,
    totals,
    discrepancies,
    recommendations,
    matchedAt: new Date().toISOString(),
  };

  await storeMatchResult(result);

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

function matchLineItem(
  poItem: any,
  invoiceItem: { qty: number; price: number; total: number } | null,
  thresholds: MatchThresholds
): LineItemMatch {
  const poQty = poItem.quantity_ordered;
  const receivedQty = poItem.quantity_received || 0;
  const invoicedQty = invoiceItem?.qty || null;
  const invoicedPrice = invoiceItem?.price || null;

  // Quantity match status
  let quantityMatch: MatchStatus = 'exact';
  if (receivedQty === 0 && poQty > 0) {
    quantityMatch = 'missing';
  } else if (receivedQty < poQty) {
    const shortagePercent = ((poQty - receivedQty) / poQty) * 100;
    quantityMatch = shortagePercent <= thresholds.quantityTolerancePercent
      ? 'within_tolerance'
      : 'shortage';
  } else if (receivedQty > poQty) {
    const overagePercent = ((receivedQty - poQty) / poQty) * 100;
    quantityMatch = overagePercent <= thresholds.quantityTolerancePercent
      ? 'within_tolerance'
      : 'overage';
  }

  // Price match status
  let priceMatch: MatchStatus = 'exact';
  if (invoicedPrice !== null) {
    const priceDiff = invoicedPrice - poItem.unit_cost;
    const priceDiffPercent = (priceDiff / poItem.unit_cost) * 100;

    if (Math.abs(priceDiff) > thresholds.priceToleranceAbsolute ||
        Math.abs(priceDiffPercent) > thresholds.priceTolerancePercent) {
      priceMatch = priceDiff > 0 ? 'overage' : 'shortage';
    } else if (priceDiff !== 0) {
      priceMatch = 'within_tolerance';
    }
  }

  // Determine discrepancy type
  let discrepancyType: DiscrepancyType | null = null;
  let varianceAmount = 0;

  if (quantityMatch === 'shortage') {
    discrepancyType = 'quantity_shortage';
    varianceAmount = (poQty - receivedQty) * poItem.unit_cost;
  } else if (quantityMatch === 'overage') {
    discrepancyType = 'quantity_overage';
    varianceAmount = (receivedQty - poQty) * poItem.unit_cost;
  } else if (priceMatch === 'overage') {
    discrepancyType = 'price_increase';
    varianceAmount = (invoicedPrice! - poItem.unit_cost) * receivedQty;
  } else if (priceMatch === 'shortage') {
    discrepancyType = 'price_decrease';
    varianceAmount = (poItem.unit_cost - invoicedPrice!) * receivedQty;
  }

  const variancePercentage = poItem.line_total > 0
    ? (varianceAmount / poItem.line_total) * 100
    : 0;

  return {
    sku: poItem.inventory_sku,
    itemName: poItem.item_name,
    poQuantity: poQty,
    poUnitPrice: poItem.unit_cost,
    poLineTotal: poItem.line_total,
    receivedQuantity: receivedQty,
    receivedDate: null, // Would come from receipt data
    invoicedQuantity: invoicedQty,
    invoicedUnitPrice: invoicedPrice,
    invoicedLineTotal: invoiceItem?.total || null,
    quantityMatch,
    priceMatch,
    discrepancyType,
    varianceAmount: Math.abs(varianceAmount),
    variancePercentage: Math.abs(variancePercentage),
  };
}

function matchTotals(
  po: any,
  invoice: any | null,
  thresholds: MatchThresholds
): TotalMatch {
  const poTotal = po.total_amount || po.subtotal || 0;
  const invoiceTotal = invoice?.total_amount || null;

  const totalVariance = invoiceTotal !== null ? invoiceTotal - poTotal : 0;
  const totalVariancePercentage = poTotal > 0
    ? (totalVariance / poTotal) * 100
    : 0;

  const isWithinTolerance =
    Math.abs(totalVariance) <= thresholds.autoApproveMaxVariance ||
    Math.abs(totalVariancePercentage) <= thresholds.totalTolerancePercent;

  return {
    poSubtotal: po.subtotal || 0,
    poTax: po.tax_amount || 0,
    poShipping: po.shipping_cost || 0,
    poTotal,
    invoiceSubtotal: invoice?.subtotal || null,
    invoiceTax: invoice?.tax_amount || null,
    invoiceShipping: invoice?.shipping_amount || null,
    invoiceTotal,
    totalVariance,
    totalVariancePercentage,
    isWithinTolerance,
  };
}

function createDiscrepancy(lineMatch: LineItemMatch, poItem: any): Discrepancy {
  let severity: 'info' | 'warning' | 'critical' = 'warning';
  let suggestedAction: SuggestedAction = 'manual_review';

  switch (lineMatch.discrepancyType) {
    case 'quantity_shortage':
      severity = lineMatch.variancePercentage > 20 ? 'critical' : 'warning';
      suggestedAction = 'create_backorder';
      break;
    case 'quantity_overage':
      severity = 'warning';
      suggestedAction = 'return_overage';
      break;
    case 'price_increase':
      severity = lineMatch.variancePercentage > 10 ? 'critical' : 'warning';
      suggestedAction = lineMatch.variancePercentage > 10 ? 'dispute_invoice' : 'update_po_price';
      break;
    case 'price_decrease':
      severity = 'info';
      suggestedAction = 'approve';
      break;
  }

  return {
    id: crypto.randomUUID(),
    type: lineMatch.discrepancyType!,
    severity,
    sku: lineMatch.sku,
    description: getDiscrepancyDescription(lineMatch),
    poValue: lineMatch.poLineTotal,
    actualValue: lineMatch.invoicedLineTotal || (lineMatch.receivedQuantity * lineMatch.poUnitPrice),
    varianceAmount: lineMatch.varianceAmount,
    variancePercentage: lineMatch.variancePercentage,
    suggestedAction,
    requiresHumanReview: severity === 'critical',
  };
}

function getDiscrepancyDescription(lineMatch: LineItemMatch): string {
  switch (lineMatch.discrepancyType) {
    case 'quantity_shortage':
      return `Received ${lineMatch.receivedQuantity} of ${lineMatch.poQuantity} ordered (${lineMatch.poQuantity - lineMatch.receivedQuantity} short)`;
    case 'quantity_overage':
      return `Received ${lineMatch.receivedQuantity} of ${lineMatch.poQuantity} ordered (${lineMatch.receivedQuantity - lineMatch.poQuantity} extra)`;
    case 'price_increase':
      return `Invoice price $${lineMatch.invoicedUnitPrice?.toFixed(2)} vs PO price $${lineMatch.poUnitPrice.toFixed(2)}`;
    case 'price_decrease':
      return `Invoice price $${lineMatch.invoicedUnitPrice?.toFixed(2)} lower than PO price $${lineMatch.poUnitPrice.toFixed(2)}`;
    default:
      return 'Unknown discrepancy';
  }
}

function evaluateOverallMatch(
  lineItems: LineItemMatch[],
  totals: TotalMatch,
  discrepancies: Discrepancy[],
  thresholds: MatchThresholds
): {
  matchStatus: ThreeWayMatchResult['matchStatus'];
  overallScore: number;
  canAutoApprove: boolean;
  recommendations: MatchRecommendation[];
} {
  const recommendations: MatchRecommendation[] = [];

  // Calculate score
  let score = 100;
  const criticalDiscrepancies = discrepancies.filter(d => d.severity === 'critical');
  const warningDiscrepancies = discrepancies.filter(d => d.severity === 'warning');

  score -= criticalDiscrepancies.length * 20;
  score -= warningDiscrepancies.length * 5;

  if (!totals.isWithinTolerance) {
    score -= 15;
  }

  score = Math.max(0, Math.min(100, score));

  // Determine status
  let matchStatus: ThreeWayMatchResult['matchStatus'] = 'matched';
  if (criticalDiscrepancies.length > 0) {
    matchStatus = 'mismatch';
  } else if (warningDiscrepancies.length > 0 || !totals.isWithinTolerance) {
    matchStatus = 'partial_match';
  } else if (totals.invoiceTotal === null) {
    matchStatus = 'pending_data';
  }

  // Can auto-approve?
  const canAutoApprove =
    criticalDiscrepancies.length === 0 &&
    totals.isWithinTolerance &&
    Math.abs(totals.totalVariance) <= thresholds.autoApproveMaxVariance;

  // Generate recommendations
  if (canAutoApprove) {
    recommendations.push({
      action: 'approve',
      reason: 'All items match within tolerance thresholds',
      priority: 'low',
      autoExecutable: true,
    });
  }

  // Check for shortages that need backorders
  const shortages = discrepancies.filter(d => d.type === 'quantity_shortage');
  if (shortages.length > 0) {
    recommendations.push({
      action: 'create_backorder',
      reason: `${shortages.length} item(s) received short - consider creating follow-up PO`,
      priority: 'high',
      autoExecutable: false, // Needs stock impact analysis first
    });
  }

  // Check for price disputes
  const priceIssues = discrepancies.filter(d =>
    d.type === 'price_increase' && d.severity === 'critical'
  );
  if (priceIssues.length > 0) {
    recommendations.push({
      action: 'dispute_invoice',
      reason: `${priceIssues.length} item(s) have significant price increases from PO`,
      priority: 'high',
      autoExecutable: false,
    });
  }

  return { matchStatus, overallScore: score, canAutoApprove, recommendations };
}

async function storeMatchResult(result: ThreeWayMatchResult): Promise<void> {
  // Store in database for audit trail
  await supabase.from('po_three_way_matches').upsert({
    po_id: result.poId,
    match_status: result.matchStatus,
    overall_score: result.overallScore,
    can_auto_approve: result.canAutoApprove,
    line_items: result.lineItems,
    totals: result.totals,
    discrepancies: result.discrepancies,
    recommendations: result.recommendations,
    matched_at: result.matchedAt,
  }, {
    onConflict: 'po_id',
  });

  // Update PO with match status
  await supabase
    .from('purchase_orders')
    .update({
      three_way_match_status: result.matchStatus,
      three_way_match_score: result.overallScore,
      last_three_way_match: result.matchedAt,
    })
    .eq('id', result.poId);
}

// ═══════════════════════════════════════════════════════════════════════════
// Batch Processing
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get POs that need three-way matching
 */
export async function getPOsNeedingMatch(): Promise<string[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id')
    .in('status', ['partial', 'received'])
    .or('three_way_match_status.is.null,three_way_match_status.eq.pending_data')
    .limit(50);

  if (error) throw error;
  return (data || []).map(po => po.id);
}

/**
 * Get match thresholds from app settings
 */
export async function getMatchThresholds(): Promise<MatchThresholds> {
  const { data } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'three_way_match_thresholds')
    .maybeSingle();

  return { ...DEFAULT_THRESHOLDS, ...(data?.setting_value || {}) };
}

/**
 * Update match thresholds
 */
export async function updateMatchThresholds(thresholds: Partial<MatchThresholds>): Promise<void> {
  await supabase.from('app_settings').upsert({
    setting_key: 'three_way_match_thresholds',
    setting_value: { ...DEFAULT_THRESHOLDS, ...thresholds },
    updated_at: new Date().toISOString(),
  });
}

/**
 * Check if shortage would cause stockout
 * Used to determine if backorder is needed
 */
export async function assessShortageImpact(
  sku: string,
  shortageQty: number
): Promise<{
  willCauseStockout: boolean;
  daysUntilStockout: number;
  currentStock: number;
  dailyVelocity: number;
  recommendBackorder: boolean;
}> {
  const { data: item } = await supabase
    .from('inventory_items')
    .select('current_stock, sales_velocity_daily, reorder_point')
    .eq('sku', sku)
    .single();

  if (!item) {
    return {
      willCauseStockout: false,
      daysUntilStockout: 999,
      currentStock: 0,
      dailyVelocity: 0,
      recommendBackorder: false,
    };
  }

  const currentStock = item.current_stock || 0;
  const dailyVelocity = item.sales_velocity_daily || 0;
  const expectedStock = currentStock + shortageQty; // What we should have had
  const actualStock = currentStock; // What we have

  const daysUntilStockout = dailyVelocity > 0
    ? Math.floor(actualStock / dailyVelocity)
    : 999;

  const willCauseStockout = actualStock < (item.reorder_point || 0);
  const recommendBackorder = willCauseStockout || daysUntilStockout < 14;

  return {
    willCauseStockout,
    daysUntilStockout,
    currentStock,
    dailyVelocity,
    recommendBackorder,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

export default {
  performThreeWayMatch,
  getPOsNeedingMatch,
  getMatchThresholds,
  updateMatchThresholds,
  assessShortageImpact,
};
