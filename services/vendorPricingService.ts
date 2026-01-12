/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VENDOR PRICING SERVICE - Historical pricing and auto-fill
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Provides historical purchase price data for PO creation:
 * - Last purchase price from finale_po_line_items
 * - Price trend analysis (up/down/stable)
 * - Vendor-specific pricing history
 *
 * @module services/vendorPricingService
 */

import { supabase } from '../lib/supabase/client';

export interface LastPurchasePrice {
  sku: string;
  productId?: string;
  lastPrice: number;
  lastOrderDate: string;
  vendorId?: string;
  vendorName?: string;
  priceHistory?: {
    price: number;
    date: string;
    poNumber?: string;
  }[];
  trend?: 'up' | 'down' | 'stable';
  trendPercent?: number;
}

export interface VendorPricingResult {
  success: boolean;
  data?: Record<string, LastPurchasePrice>;
  error?: string;
}

/**
 * Get last purchase prices for multiple SKUs
 * Queries finale_po_line_items joined with finale_purchase_orders
 */
export async function getLastPurchasePrices(
  skus: string[],
  vendorId?: string
): Promise<VendorPricingResult> {
  if (!skus || skus.length === 0) {
    return { success: true, data: {} };
  }

  try {
    // Build query for each SKU's purchase history
    let query = supabase
      .from('finale_po_line_items')
      .select(`
        id,
        product_name,
        unit_cost,
        quantity_ordered,
        created_at,
        finale_purchase_orders!inner (
          id,
          order_id,
          supplier_name,
          vendor_id,
          order_date,
          status
        )
      `)
      .not('unit_cost', 'is', null)
      .gt('unit_cost', 0)
      .order('created_at', { ascending: false });

    // Filter by vendor if specified
    if (vendorId) {
      query = query.eq('finale_purchase_orders.vendor_id', vendorId);
    }

    const { data: lineItems, error } = await query;

    if (error) {
      console.error('[VendorPricingService] Query error:', error);
      return { success: false, error: error.message };
    }

    if (!lineItems || lineItems.length === 0) {
      return { success: true, data: {} };
    }

    // Build a map of product name to pricing info
    // We use product_name to match with SKUs since that's the common identifier
    const priceMap: Record<string, LastPurchasePrice> = {};
    const productHistoryMap: Record<string, { price: number; date: string; poNumber?: string }[]> = {};

    for (const item of lineItems) {
      // Match by product name (normalized to lowercase for comparison)
      const productName = item.product_name?.toLowerCase().trim() || '';
      const po = item.finale_purchase_orders as any;

      // Check if this product name matches any of our requested SKUs
      const matchedSku = skus.find(
        sku =>
          productName === sku.toLowerCase() ||
          productName.includes(sku.toLowerCase()) ||
          sku.toLowerCase().includes(productName)
      );

      if (!matchedSku) continue;

      const normalizedSku = matchedSku;

      // Build price history
      if (!productHistoryMap[normalizedSku]) {
        productHistoryMap[normalizedSku] = [];
      }

      productHistoryMap[normalizedSku].push({
        price: item.unit_cost!,
        date: item.created_at || po?.order_date || '',
        poNumber: po?.order_id,
      });

      // Only set the first (most recent) entry as the last price
      if (!priceMap[normalizedSku]) {
        priceMap[normalizedSku] = {
          sku: normalizedSku,
          lastPrice: item.unit_cost!,
          lastOrderDate: item.created_at || po?.order_date || '',
          vendorId: po?.vendor_id,
          vendorName: po?.supplier_name,
        };
      }
    }

    // Add price history and calculate trends
    for (const sku of Object.keys(priceMap)) {
      const history = productHistoryMap[sku] || [];
      priceMap[sku].priceHistory = history.slice(0, 5); // Last 5 prices

      // Calculate trend
      if (history.length >= 2) {
        const currentPrice = history[0].price;
        const previousPrice = history[1].price;
        const percentChange = ((currentPrice - previousPrice) / previousPrice) * 100;

        if (Math.abs(percentChange) < 2) {
          priceMap[sku].trend = 'stable';
        } else if (percentChange > 0) {
          priceMap[sku].trend = 'up';
        } else {
          priceMap[sku].trend = 'down';
        }
        priceMap[sku].trendPercent = Math.round(percentChange * 10) / 10;
      } else {
        priceMap[sku].trend = 'stable';
      }
    }

    return { success: true, data: priceMap };
  } catch (err: any) {
    console.error('[VendorPricingService] Unexpected error:', err);
    return { success: false, error: err.message || 'Failed to fetch pricing data' };
  }
}

/**
 * Get price for a single SKU using the RPC function
 * Falls back to finale_po_line_items if RPC not available
 */
export async function getProductPurchaseHistory(
  productId: string,
  monthsBack: number = 12
): Promise<{
  success: boolean;
  data?: {
    unitCost: number;
    vendorName: string;
    orderDate: string;
    quantity: number;
    leadDays: number;
  }[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('get_product_purchase_history', {
      p_product_id: productId,
      p_months_back: monthsBack,
    });

    if (error) {
      console.error('[VendorPricingService] RPC error:', error);
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: true, data: [] };
    }

    return {
      success: true,
      data: data.map((row: any) => ({
        unitCost: row.unit_cost,
        vendorName: row.vendor_name,
        orderDate: row.order_date,
        quantity: row.quantity,
        leadDays: row.lead_days,
      })),
    };
  } catch (err: any) {
    console.error('[VendorPricingService] Unexpected error:', err);
    return { success: false, error: err.message || 'Failed to fetch purchase history' };
  }
}

/**
 * Get suggested price for a PO line item based on:
 * 1. Last purchase price from history
 * 2. Current inventory unit cost
 * 3. Vendor pricelist (if available)
 */
export async function getSuggestedPrice(
  sku: string,
  vendorId?: string,
  fallbackPrice?: number
): Promise<{
  price: number;
  source: 'history' | 'inventory' | 'pricelist' | 'fallback';
  lastOrderDate?: string;
  priceConfidence: 'high' | 'medium' | 'low';
}> {
  // Try to get from purchase history first
  const historyResult = await getLastPurchasePrices([sku], vendorId);

  if (historyResult.success && historyResult.data?.[sku]) {
    const lastPrice = historyResult.data[sku];
    const daysSinceLastOrder = lastPrice.lastOrderDate
      ? Math.floor((Date.now() - new Date(lastPrice.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24))
      : Infinity;

    // High confidence if ordered within last 90 days
    const confidence = daysSinceLastOrder <= 90 ? 'high' : daysSinceLastOrder <= 180 ? 'medium' : 'low';

    return {
      price: lastPrice.lastPrice,
      source: 'history',
      lastOrderDate: lastPrice.lastOrderDate,
      priceConfidence: confidence,
    };
  }

  // Fall back to provided fallback price (usually from inventory)
  if (fallbackPrice && fallbackPrice > 0) {
    return {
      price: fallbackPrice,
      source: 'inventory',
      priceConfidence: 'medium',
    };
  }

  // No price available
  return {
    price: 0,
    source: 'fallback',
    priceConfidence: 'low',
  };
}
