import type { InventoryItem, PurchaseOrder, Vendor } from '@/types';

export interface StockoutRisk {
  sku: string;
  name: string;
  daysUntilStockout: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  trendDirection: 'up' | 'down' | 'stable';
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

export const computeStockoutRisks = (inventory: InventoryItem[] = []): StockoutRisk[] => {
  const risks: StockoutRisk[] = [];
  const filteredInventory = inventory.filter(item => !item.isDropship);

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

    const reliabilityScore = Math.round(onTimeRate * 0.6 + leadTimeRatio * 0.4);

    performances.push({
      vendorId: vendor.id,
      vendorName: vendor.name,
      onTimeDeliveryRate: Number(onTimeRate.toFixed(1)),
      averageLeadTimeActual: Math.round(avgActualLeadTime),
      averageLeadTimeEstimated: estimatedLeadTime,
      costStability: 0,
      reliabilityScore,
    });
  });

  return performances.sort((a, b) => b.reliabilityScore - a.reliabilityScore);
};
