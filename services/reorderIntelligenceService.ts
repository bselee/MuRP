/**
 * Reorder Intelligence Service
 * Analyzes purchase and consumption patterns to calculate optimal reorder points
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export interface ReorderAnalytics {
  sku: string;
  product_name: string;
  quantity_on_hand: number;
  available_quantity: number;
  reorder_point: number;
  max_stock_level: number;
  
  // Purchase metrics
  purchase_count: number;
  avg_lead_time_days: number;
  min_lead_time_days: number;
  max_lead_time_days: number;
  avg_unit_cost: number;
  last_received_at: string | null;
  total_purchased_qty: number;
  
  // Consumption metrics
  consumption_count: number;
  total_consumed_qty: number;
  avg_consumption_qty: number;
  consumed_last_30_days: number;
  consumed_last_90_days: number;
  last_consumed_at: string | null;
  
  // Calculated metrics
  daily_consumption_rate: number;
  days_of_stock_remaining: number;
  suggested_reorder_point: number;
  suggested_max_stock: number;
  reorder_status: 'OUT_OF_STOCK' | 'CRITICAL' | 'REORDER_NOW' | 'REORDER_SOON' | 'OK';
}

export interface ConsumptionLog {
  id: string;
  sku: string;
  product_name: string | null;
  quantity_consumed: number;
  consumption_type: 'production' | 'sale' | 'waste' | 'adjustment' | 'transfer';
  consumed_at: string;
  source_reference: string | null;
  source_type: string | null;
  notes: string | null;
}

export interface PurchaseLog {
  id: string;
  sku: string;
  product_name: string | null;
  quantity_purchased: number;
  unit_cost: number | null;
  total_cost: number | null;
  po_id: string | null;
  po_number: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  ordered_at: string | null;
  received_at: string | null;
  lead_time_days: number | null;
}

/**
 * Get comprehensive reorder analytics for all products
 */
export async function getReorderAnalytics(
  filter?: 'all' | 'critical' | 'reorder_now' | 'low_stock'
): Promise<ReorderAnalytics[]> {
  try {
    let query = supabase
      .from('product_reorder_analytics')
      .select('*')
      .order('days_of_stock_remaining', { ascending: true });

    // Apply filters
    if (filter === 'critical') {
      query = query.in('reorder_status', ['OUT_OF_STOCK', 'CRITICAL']);
    } else if (filter === 'reorder_now') {
      query = query.eq('reorder_status', 'REORDER_NOW');
    } else if (filter === 'low_stock') {
      query = query.in('reorder_status', ['OUT_OF_STOCK', 'CRITICAL', 'REORDER_NOW']);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[ReorderIntelligence] getReorderAnalytics failed:', error);
    return [];
  }
}

/**
 * Get reorder analytics for a specific SKU
 */
export async function getProductReorderAnalytics(sku: string): Promise<ReorderAnalytics | null> {
  try {
    const { data, error } = await supabase
      .from('product_reorder_analytics')
      .select('*')
      .eq('sku', sku)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('[ReorderIntelligence] getProductReorderAnalytics failed:', error);
    return null;
  }
}

/**
 * Log product consumption (for production, sales, waste, etc.)
 */
export async function logConsumption(
  sku: string,
  quantityConsumed: number,
  consumptionType: 'production' | 'sale' | 'waste' | 'adjustment' | 'transfer',
  options?: {
    productName?: string;
    sourceReference?: string;
    sourceType?: string;
    notes?: string;
  }
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('product_consumption_log')
      .insert({
        sku,
        product_name: options?.productName,
        quantity_consumed: quantityConsumed,
        consumption_type: consumptionType,
        source_reference: options?.sourceReference,
        source_type: options?.sourceType,
        notes: options?.notes,
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[ReorderIntelligence] logConsumption failed:', error);
    return false;
  }
}

/**
 * Get consumption history for a SKU
 */
export async function getConsumptionHistory(
  sku: string,
  days: number = 90
): Promise<ConsumptionLog[]> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
      .from('product_consumption_log')
      .select('*')
      .eq('sku', sku)
      .gte('consumed_at', cutoffDate.toISOString())
      .order('consumed_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[ReorderIntelligence] getConsumptionHistory failed:', error);
    return [];
  }
}

/**
 * Get purchase history for a SKU
 */
export async function getPurchaseHistory(
  sku: string,
  days: number = 365
): Promise<PurchaseLog[]> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
      .from('product_purchase_log')
      .select('*')
      .eq('sku', sku)
      .or(`received_at.gte.${cutoffDate.toISOString()},ordered_at.gte.${cutoffDate.toISOString()}`)
      .order('ordered_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[ReorderIntelligence] getPurchaseHistory failed:', error);
    return [];
  }
}

/**
 * Get products that need reordering based on analytics
 */
export async function getProductsNeedingReorder(): Promise<ReorderAnalytics[]> {
  try {
    const { data, error } = await supabase
      .from('product_reorder_analytics')
      .select('*')
      .in('reorder_status', ['OUT_OF_STOCK', 'CRITICAL', 'REORDER_NOW'])
      .order('days_of_stock_remaining', { ascending: true })
      .limit(50);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[ReorderIntelligence] getProductsNeedingReorder failed:', error);
    return [];
  }
}

/**
 * Calculate optimal order quantity based on consumption patterns
 */
export function calculateOptimalOrderQuantity(analytics: ReorderAnalytics): number {
  const {
    daily_consumption_rate,
    avg_lead_time_days,
    suggested_max_stock,
    available_quantity,
  } = analytics;

  if (daily_consumption_rate === 0) {
    return 0; // No consumption pattern yet
  }

  // Calculate order quantity to reach max stock level
  const targetStock = suggested_max_stock || (daily_consumption_rate * 90); // 90 days supply if no max set
  const orderQuantity = Math.max(0, targetStock - available_quantity);

  return Math.ceil(orderQuantity);
}
