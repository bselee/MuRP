/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 💰 PRICE HUNTER AGENT - Vendor Pricing Intelligence
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This agent tracks pricing trends and identifies cost-saving opportunities.
 *
 * Key Behaviors:
 * 1. Tracks vendor pricing across purchase orders
 * 2. Detects price increases and anomalies
 * 3. Flags favorable buying opportunities
 * 4. Compares vendor pricing for the same SKU
 *
 * Example:
 * - SKU BOTTLE-16OZ usually costs $0.45 from Vendor A
 * - Latest PO shows $0.52 (+15.5% increase)
 * - Agent flags: "Price increase detected - verify with vendor"
 * - Agent also shows: "Vendor B offers same item at $0.42"
 *
 * @module services/priceHunterAgent
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Types
// ═══════════════════════════════════════════════════════════════════════════

export interface PriceHunterConfig {
  variance_threshold: number; // % change to flag (e.g., 10 = 10%)
  compare_window: number; // Days to look back for comparison
  track_all_vendors: boolean; // Compare across vendors
  alert_on_decrease: boolean; // Also alert on price decreases (opportunity)
}

export interface PriceAlert {
  severity: 'CRITICAL' | 'WARNING' | 'OPPORTUNITY';
  sku: string;
  product_name: string;
  vendor_name: string;
  current_price: number;
  previous_price: number;
  price_change: number;
  change_percent: number;
  trend: 'INCREASING' | 'STABLE' | 'DECREASING';
  message: string;
  recommended_action: string;
  po_number: string | null;
  detected_at: Date;
}

export interface VendorPriceComparison {
  sku: string;
  product_name: string;
  vendors: Array<{
    vendor_name: string;
    vendor_id: string;
    last_price: number;
    avg_price: number;
    min_price: number;
    max_price: number;
    last_ordered: string;
    order_count: number;
  }>;
  best_price_vendor: string;
  potential_savings: number;
}

export interface PriceTrendAnalysis {
  sku: string;
  product_name: string;
  avg_price_90d: number;
  avg_price_30d: number;
  avg_price_7d: number;
  trend: 'RISING' | 'STABLE' | 'FALLING';
  trend_percent: number;
  forecast_next_30d: number;
  recommendation: string;
}

export interface PriceHunterSummary {
  total_skus_analyzed: number;
  price_increases: number;
  price_decreases: number;
  opportunities_found: number;
  total_potential_savings: number;
  alerts: PriceAlert[];
  vendor_comparisons: VendorPriceComparison[];
  trends: PriceTrendAnalysis[];
}

const DEFAULT_CONFIG: PriceHunterConfig = {
  variance_threshold: 10,
  compare_window: 90,
  track_all_vendors: true,
  alert_on_decrease: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// 📊 Core Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze recent PO prices vs historical averages
 * Detects price increases/decreases
 */
export async function detectPriceChanges(
  config: Partial<PriceHunterConfig> = {}
): Promise<PriceAlert[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const alerts: PriceAlert[] = [];

  try {
    const compareDate = new Date();
    compareDate.setDate(compareDate.getDate() - cfg.compare_window);

    // Get recent purchase data grouped by SKU and vendor
    const { data: recentPurchases, error } = await supabase
      .from('product_purchase_log')
      .select(`
        sku,
        product_name,
        unit_cost,
        vendor_name,
        po_number,
        received_at,
        ordered_at
      `)
      .gte('received_at', compareDate.toISOString())
      .order('received_at', { ascending: false });

    if (error) throw error;
    if (!recentPurchases || recentPurchases.length === 0) return [];

    // Group purchases by SKU
    const skuPurchases = new Map<string, typeof recentPurchases>();
    for (const purchase of recentPurchases) {
      const key = purchase.sku;
      const existing = skuPurchases.get(key) || [];
      existing.push(purchase);
      skuPurchases.set(key, existing);
    }

    // Analyze each SKU
    for (const [sku, purchases] of skuPurchases) {
      if (purchases.length < 2) continue; // Need at least 2 data points

      // Sort by date (newest first)
      purchases.sort((a, b) => 
        new Date(b.received_at || b.ordered_at || 0).getTime() - 
        new Date(a.received_at || a.ordered_at || 0).getTime()
      );

      const latestPurchase = purchases[0];
      const latestPrice = latestPurchase.unit_cost || 0;

      // Calculate average of previous purchases
      const previousPrices = purchases.slice(1).map(p => p.unit_cost || 0).filter(p => p > 0);
      if (previousPrices.length === 0) continue;

      const avgPreviousPrice = previousPrices.reduce((a, b) => a + b, 0) / previousPrices.length;
      const priceChange = latestPrice - avgPreviousPrice;
      const changePct = (priceChange / avgPreviousPrice) * 100;

      // Check if change exceeds threshold
      if (Math.abs(changePct) >= cfg.variance_threshold) {
        const isIncrease = priceChange > 0;
        
        if (isIncrease) {
          alerts.push({
            severity: changePct > 25 ? 'CRITICAL' : 'WARNING',
            sku,
            product_name: latestPurchase.product_name || sku,
            vendor_name: latestPurchase.vendor_name || 'Unknown',
            current_price: latestPrice,
            previous_price: avgPreviousPrice,
            price_change: priceChange,
            change_percent: changePct,
            trend: 'INCREASING',
            message: `Price increased ${changePct.toFixed(1)}% ($${avgPreviousPrice.toFixed(2)} → $${latestPrice.toFixed(2)})`,
            recommended_action: changePct > 25 
              ? 'URGENT: Contact vendor to negotiate or find alternative supplier'
              : 'Review pricing with vendor on next order',
            po_number: latestPurchase.po_number,
            detected_at: new Date(),
          });
        } else if (cfg.alert_on_decrease) {
          alerts.push({
            severity: 'OPPORTUNITY',
            sku,
            product_name: latestPurchase.product_name || sku,
            vendor_name: latestPurchase.vendor_name || 'Unknown',
            current_price: latestPrice,
            previous_price: avgPreviousPrice,
            price_change: priceChange,
            change_percent: changePct,
            trend: 'DECREASING',
            message: `Price decreased ${Math.abs(changePct).toFixed(1)}% - good time to stock up`,
            recommended_action: 'Consider increasing order quantity to lock in lower price',
            po_number: latestPurchase.po_number,
            detected_at: new Date(),
          });
        }
      }
    }

    return alerts.sort((a, b) => {
      const severityOrder = { CRITICAL: 0, WARNING: 1, OPPORTUNITY: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  } catch (error) {
    console.error('[PriceHunter] Price change detection failed:', error);
    return [];
  }
}

/**
 * Compare prices across vendors for the same SKU
 * Identifies potential savings by switching vendors
 */
export async function compareVendorPrices(
  config: Partial<PriceHunterConfig> = {}
): Promise<VendorPriceComparison[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const comparisons: VendorPriceComparison[] = [];

  try {
    const compareDate = new Date();
    compareDate.setDate(compareDate.getDate() - cfg.compare_window);

    // Get all purchase data
    const { data: purchases, error } = await supabase
      .from('sku_purchase_log')
      .select(`
        sku,
        product_name,
        unit_cost,
        vendor_id,
        vendor_name,
        received_at
      `)
      .gte('received_at', compareDate.toISOString())
      .not('vendor_id', 'is', null);

    if (error) throw error;
    if (!purchases) return [];

    // Group by SKU
    const skuVendors = new Map<string, Map<string, { prices: number[]; lastOrdered: Date; vendorId: string; vendorName: string }>>();

    for (const p of purchases) {
      if (!p.vendor_id || !p.unit_cost) continue;

      const skuData = skuVendors.get(p.sku) || new Map();
      const vendorData = skuData.get(p.vendor_id) || {
        prices: [],
        lastOrdered: new Date(0),
        vendorId: p.vendor_id,
        vendorName: p.vendor_name || 'Unknown',
      };

      vendorData.prices.push(p.unit_cost);
      const orderDate = new Date(p.received_at);
      if (orderDate > vendorData.lastOrdered) {
        vendorData.lastOrdered = orderDate;
      }

      skuData.set(p.vendor_id, vendorData);
      skuVendors.set(p.sku, skuData);
    }

    // Analyze SKUs with multiple vendors
    for (const [sku, vendors] of skuVendors) {
      if (vendors.size < 2) continue; // Need multiple vendors to compare

      const vendorPrices: VendorPriceComparison['vendors'] = [];
      let bestPrice = Infinity;
      let bestVendor = '';
      let highestAvgPrice = 0;

      for (const [vendorId, data] of vendors) {
        const prices = data.prices;
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        const lastPrice = prices[0]; // Most recent

        if (avgPrice < bestPrice) {
          bestPrice = avgPrice;
          bestVendor = data.vendorName;
        }
        if (avgPrice > highestAvgPrice) {
          highestAvgPrice = avgPrice;
        }

        vendorPrices.push({
          vendor_name: data.vendorName,
          vendor_id: vendorId,
          last_price: lastPrice,
          avg_price: avgPrice,
          min_price: Math.min(...prices),
          max_price: Math.max(...prices),
          last_ordered: data.lastOrdered.toISOString(),
          order_count: prices.length,
        });
      }

      // Calculate potential savings
      const potentialSavings = highestAvgPrice - bestPrice;

      if (potentialSavings > 0.01) { // Only include if there's meaningful savings
        const firstPurchase = purchases.find(p => p.sku === sku);
        comparisons.push({
          sku,
          product_name: firstPurchase?.product_name || sku,
          vendors: vendorPrices.sort((a, b) => a.avg_price - b.avg_price),
          best_price_vendor: bestVendor,
          potential_savings: potentialSavings,
        });
      }
    }

    return comparisons.sort((a, b) => b.potential_savings - a.potential_savings);
  } catch (error) {
    console.error('[PriceHunter] Vendor comparison failed:', error);
    return [];
  }
}

/**
 * Analyze price trends over time
 */
export async function analyzePriceTrends(
  config: Partial<PriceHunterConfig> = {}
): Promise<PriceTrendAnalysis[]> {
  const trends: PriceTrendAnalysis[] = [];

  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get purchase data
    const { data: purchases, error } = await supabase
      .from('sku_purchase_log')
      .select('sku, product_name, unit_cost, received_at')
      .gte('received_at', ninetyDaysAgo.toISOString())
      .not('unit_cost', 'is', null);

    if (error) throw error;
    if (!purchases) return [];

    // Group by SKU and time period
    const skuPrices = new Map<string, { 
      prices90d: number[]; 
      prices30d: number[]; 
      prices7d: number[]; 
      productName: string 
    }>();

    for (const p of purchases) {
      const data = skuPrices.get(p.sku) || {
        prices90d: [],
        prices30d: [],
        prices7d: [],
        productName: p.product_name || p.sku,
      };

      const orderDate = new Date(p.received_at);
      data.prices90d.push(p.unit_cost);

      if (orderDate >= thirtyDaysAgo) {
        data.prices30d.push(p.unit_cost);
      }
      if (orderDate >= sevenDaysAgo) {
        data.prices7d.push(p.unit_cost);
      }

      skuPrices.set(p.sku, data);
    }

    // Analyze trends
    for (const [sku, data] of skuPrices) {
      if (data.prices90d.length < 3) continue; // Need enough data points

      const avg90d = data.prices90d.reduce((a, b) => a + b, 0) / data.prices90d.length;
      const avg30d = data.prices30d.length > 0 
        ? data.prices30d.reduce((a, b) => a + b, 0) / data.prices30d.length 
        : avg90d;
      const avg7d = data.prices7d.length > 0 
        ? data.prices7d.reduce((a, b) => a + b, 0) / data.prices7d.length 
        : avg30d;

      // Calculate trend
      const trendPct = ((avg30d - avg90d) / avg90d) * 100;
      let trend: 'RISING' | 'STABLE' | 'FALLING';
      let recommendation: string;

      if (trendPct > 5) {
        trend = 'RISING';
        recommendation = 'Consider locking in current prices or finding alternative suppliers';
      } else if (trendPct < -5) {
        trend = 'FALLING';
        recommendation = 'Wait for further price drops before placing large orders';
      } else {
        trend = 'STABLE';
        recommendation = 'Prices stable - continue with normal ordering patterns';
      }

      // Simple forecast (linear projection)
      const forecast = avg30d + (avg30d - avg90d) * 0.33;

      trends.push({
        sku,
        product_name: data.productName,
        avg_price_90d: avg90d,
        avg_price_30d: avg30d,
        avg_price_7d: avg7d,
        trend,
        trend_percent: trendPct,
        forecast_next_30d: Math.max(0, forecast),
        recommendation,
      });
    }

    return trends.sort((a, b) => Math.abs(b.trend_percent) - Math.abs(a.trend_percent));
  } catch (error) {
    console.error('[PriceHunter] Trend analysis failed:', error);
    return [];
  }
}

/**
 * Main agent run function - called by UI and scheduler
 */
export async function runPriceHunterAgent(
  config: Partial<PriceHunterConfig> = {}
): Promise<{
  success: boolean;
  summary: PriceHunterSummary;
  output: string[];
}> {
  const output: string[] = [];
  output.push(`[${new Date().toISOString()}] Price Hunter starting analysis...`);

  // Detect price changes
  const alerts = await detectPriceChanges(config);
  output.push(`✓ Analyzed recent purchase prices`);

  const priceIncreases = alerts.filter(a => a.trend === 'INCREASING').length;
  const priceDecreases = alerts.filter(a => a.trend === 'DECREASING').length;

  if (priceIncreases > 0) {
    output.push(`⚠ ${priceIncreases} price increase(s) detected`);
  }
  if (priceDecreases > 0) {
    output.push(`💰 ${priceDecreases} price decrease(s) found (opportunities)`);
  }

  // Compare vendor prices
  const comparisons = await compareVendorPrices(config);
  const totalSavings = comparisons.reduce((sum, c) => sum + c.potential_savings, 0);
  output.push(`✓ Compared ${comparisons.length} SKUs across vendors`);
  
  if (totalSavings > 0) {
    output.push(`💡 Potential savings identified: $${totalSavings.toFixed(2)} by switching vendors`);
  }

  // Analyze trends
  const trends = await analyzePriceTrends(config);
  const risingTrends = trends.filter(t => t.trend === 'RISING').length;
  output.push(`✓ Analyzed ${trends.length} price trends`);
  
  if (risingTrends > 0) {
    output.push(`📈 ${risingTrends} SKUs with rising price trends`);
  }

  output.push(`[${new Date().toISOString()}] Price Hunter complete`);

  return {
    success: true,
    summary: {
      total_skus_analyzed: trends.length,
      price_increases: priceIncreases,
      price_decreases: priceDecreases,
      opportunities_found: comparisons.length,
      total_potential_savings: totalSavings,
      alerts,
      vendor_comparisons: comparisons,
      trends,
    },
    output,
  };
}

export default {
  detectPriceChanges,
  compareVendorPrices,
  analyzePriceTrends,
  runPriceHunterAgent,
};
