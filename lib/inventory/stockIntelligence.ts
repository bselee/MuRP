import type { InventoryItem, PurchaseOrder, Vendor } from '@/types';

export interface StockoutRisk {
  sku: string;
  name: string;
  daysUntilStockout: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  trendDirection: 'up' | 'down' | 'stable';
  // ABC/XYZ classification (optional, added when KPI data available)
  abcClass?: 'A' | 'B' | 'C';
  xyzClass?: 'X' | 'Y' | 'Z';
}

export interface VendorPerformance {
  vendorId: string | number;
  vendorName: string;
  onTimeDeliveryRate: number;
  averageLeadTimeActual: number;
  averageLeadTimeEstimated: number;
  costStability: number;
  reliabilityScore: number;
}

const toDays = (start?: string | null, end?: string | null): number | null => {
  if (!start || !end) return null;
  const ordered = new Date(start);
  const received = new Date(end);
  const diffMs = received.getTime() - ordered.getTime();
  if (Number.isNaN(diffMs) || diffMs <= 0) return null;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

// Helper to check if item should be excluded from stock intelligence
const isExcludedItem = (item: InventoryItem): boolean => {
  // FILTER 1: Exclude dropship items (explicit flag)
  if (item.isDropship === true) return true;

  // FILTER 2: Exclude dropship items by category
  const category = (item.category || '').toLowerCase().trim();
  if (['dropship', 'drop ship', 'dropshipped', 'drop shipped', 'ds', 'drop-ship'].includes(category)) {
    return true;
  }

  // FILTER 3: Exclude dropship items by name pattern
  const name = (item.name || '').toLowerCase();
  if (name.includes('dropship') || name.includes('drop ship') || name.includes('drop-ship')) {
    return true;
  }

  // FILTER 4: Exclude inactive items
  if (item.status && item.status.toLowerCase().trim() !== 'active') return true;

  // FILTER 5: Exclude Deprecating/Deprecated category items
  if (['deprecating', 'deprecated', 'discontinued'].includes(category)) return true;

  return false;
};

export const computeStockoutRisks = (inventory: InventoryItem[] = []): StockoutRisk[] => {
  const risks: StockoutRisk[] = [];
  const filteredInventory = inventory.filter(item => !isExcludedItem(item));

  filteredInventory.forEach(item => {
    const sales30 = item.salesLast30Days || 0;
    const sales90 = item.salesLast90Days || 0;
    const dailyConsumption = sales30 > 0 ? sales30 / 30 : 0;

    if (dailyConsumption <= 0) {
      return;
    }

    const availableStock = (item.stock || 0) + (item.onOrder || 0);
    const daysUntilStockout = dailyConsumption > 0
      ? Math.floor(availableStock / dailyConsumption)
      : Number.POSITIVE_INFINITY;

    const trend30 = sales30 / 30;
    const trend90 = sales90 > 0 ? sales90 / 90 : 0;
    const trendBaseline = trend90 || trend30;
    const trendChange = trend30 - trend90;
    let trendDirection: StockoutRisk['trendDirection'] = 'stable';

    if (trendBaseline === 0 && trend30 > 0) {
      trendDirection = 'up';
    } else if (trendBaseline > 0) {
      if (trendChange > trendBaseline * 0.15) trendDirection = 'up';
      else if (trendChange < -trendBaseline * 0.15) trendDirection = 'down';
    }

    const leadTime = item.leadTimeDays || 14;
    let riskLevel: StockoutRisk['riskLevel'];
    if (daysUntilStockout <= 0) riskLevel = 'critical';
    else if (daysUntilStockout < leadTime * 0.5) riskLevel = 'critical';
    else if (daysUntilStockout < leadTime) riskLevel = 'high';
    else if (daysUntilStockout < leadTime * 1.5) riskLevel = 'medium';
    else riskLevel = 'low';

    risks.push({
      sku: item.sku,
      name: item.name,
      daysUntilStockout,
      riskLevel,
      trendDirection,
    });
  });

  return risks.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
};

export const computeVendorPerformance = (
  vendors: Vendor[] = [],
  purchaseOrders: PurchaseOrder[] = [],
): VendorPerformance[] => {
  const performances: VendorPerformance[] = [];

  vendors.forEach(vendor => {
    const vendorPOs = purchaseOrders.filter(po => po.vendorId === vendor.id);
    if (vendorPOs.length === 0) return;

    const completedPOs = vendorPOs.filter(po => po.status === 'received' || po.status === 'Fulfilled');
    const onTimePOs = completedPOs.filter(po => {
      if (!po.expectedDate || !po.actualReceiveDate) return false;
      return new Date(po.actualReceiveDate) <= new Date(po.expectedDate);
    });

    const onTimeRate = completedPOs.length > 0
      ? (onTimePOs.length / completedPOs.length) * 100
      : 0;

    const actualLeadTimes = completedPOs
      .map(po => toDays(po.orderDate, po.actualReceiveDate))
      .filter((value): value is number => value !== null);

    const avgActualLeadTime = actualLeadTimes.length > 0
      ? actualLeadTimes.reduce((sum, lt) => sum + lt, 0) / actualLeadTimes.length
      : 0;

    const estimatedLeadTime = vendor.leadTimeDays || 0;
    const leadTimeRatio = avgActualLeadTime > 0 && estimatedLeadTime > 0
      ? Math.min(100, (estimatedLeadTime / avgActualLeadTime) * 100)
      : 0;

    // Calculate cost stability from price variance across POs
    // Collect all unit prices from PO items for this vendor
    const allPrices: Map<string, number[]> = new Map();
    vendorPOs.forEach(po => {
      if (!po.items || !Array.isArray(po.items)) return;
      po.items.forEach((item: any) => {
        const sku = item.sku || item.productSku || item.product_sku;
        const price = Number(item.unitPrice || item.unit_price || item.unitCost || item.unit_cost || 0);
        if (sku && price > 0) {
          const prices = allPrices.get(sku) || [];
          prices.push(price);
          allPrices.set(sku, prices);
        }
      });
    });

    // Calculate coefficient of variation for each SKU, then average
    let totalVariation = 0;
    let skuCount = 0;
    allPrices.forEach((prices) => {
      if (prices.length < 2) return; // Need at least 2 data points
      const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      if (mean === 0) return;
      const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
      const stdDev = Math.sqrt(variance);
      const cv = (stdDev / mean) * 100; // Coefficient of variation as percentage
      totalVariation += cv;
      skuCount++;
    });

    // Cost stability = 100 - average coefficient of variation (capped at 0-100)
    // Higher score = more stable pricing
    const avgVariation = skuCount > 0 ? totalVariation / skuCount : 0;
    const costStability = Math.max(0, Math.min(100, 100 - avgVariation));

    const reliabilityScore = Math.round(onTimeRate * 0.6 + leadTimeRatio * 0.4);

    performances.push({
      vendorId: vendor.id,
      vendorName: vendor.name,
      onTimeDeliveryRate: Number(onTimeRate.toFixed(1)),
      averageLeadTimeActual: Math.round(avgActualLeadTime),
      averageLeadTimeEstimated: estimatedLeadTime,
      costStability: Number(costStability.toFixed(1)),
      reliabilityScore,
    });
  });

  return performances.sort((a, b) => b.reliabilityScore - a.reliabilityScore);
};
