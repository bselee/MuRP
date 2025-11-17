/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔄 REORDER QUEUE SCANNER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Daily automated scanner that analyzes inventory and populates reorder queue.
 *
 * Features:
 * - Scans active inventory items
 * - Calculates consumption rates (30/90 day averages)
 * - Identifies items below reorder point
 * - Calculates recommended order quantities
 * - Assigns urgency scores based on days until stockout
 * - Respects vendor MOQ and lead times
 *
 * Designed to run daily via Supabase Edge Function (cron scheduled).
 *
 * @module services/reorderQueueScanner
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface InventoryForReorder {
  sku: string;
  name: string;
  current_stock: number;
  reorder_point: number;
  safety_stock: number;
  moq: number;
  vendor_id: string | null;
  vendor_name: string | null;
  lead_time_days: number;
  unit_cost: number;
  sales_last_30_days: number;
  sales_last_90_days: number;
  on_order: number;
}

export interface ReorderRecommendation {
  inventory_sku: string;
  item_name: string;
  vendor_id: string | null;
  vendor_name: string | null;
  current_stock: number;
  on_order: number;
  reorder_point: number;
  safety_stock: number;
  moq: number;
  recommended_quantity: number;
  consumption_daily: number;
  consumption_30day: number;
  consumption_90day: number;
  consumption_variance: number;
  lead_time_days: number;
  days_until_stockout: number;
  urgency: 'critical' | 'high' | 'normal' | 'low';
  priority_score: number;
  estimated_cost: number;
  notes: string;
}

export interface ScanResult {
  items_scanned: number;
  items_needing_reorder: number;
  critical_items: number;
  high_priority_items: number;
  total_estimated_cost: number;
  recommendations: ReorderRecommendation[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Reorder Queue Scanner Service
// ═══════════════════════════════════════════════════════════════════════════

export class ReorderQueueScanner {
  /**
   * Main scanner function - analyzes inventory and generates reorder recommendations
   */
  async scanInventory(): Promise<ScanResult> {
    console.log('🔄 Starting reorder queue scan...');

    // 1. Fetch active inventory items with consumption data
    const inventoryItems = await this.fetchInventoryForReorder();

    console.log(`📊 Analyzing ${inventoryItems.length} active inventory items...`);

    // 2. Analyze each item and generate recommendations
    const recommendations: ReorderRecommendation[] = [];

    for (const item of inventoryItems) {
      const recommendation = this.analyzeItem(item);

      if (recommendation) {
        recommendations.push(recommendation);
      }
    }

    // 3. Clear old pending items and insert new recommendations
    await this.updateReorderQueue(recommendations);

    // 4. Calculate summary stats
    const result: ScanResult = {
      items_scanned: inventoryItems.length,
      items_needing_reorder: recommendations.length,
      critical_items: recommendations.filter(r => r.urgency === 'critical').length,
      high_priority_items: recommendations.filter(r => r.urgency === 'high').length,
      total_estimated_cost: recommendations.reduce((sum, r) => sum + r.estimated_cost, 0),
      recommendations
    };

    console.log(`✅ Scan complete: ${result.items_needing_reorder} items need reordering`);
    console.log(`   Critical: ${result.critical_items}, High: ${result.high_priority_items}`);
    console.log(`   Estimated cost: $${result.total_estimated_cost.toFixed(2)}`);

    return result;
  }

  /**
   * Fetch inventory items that might need reordering
   */
  private async fetchInventoryForReorder(): Promise<InventoryForReorder[]> {
    const { data: items, error } = await supabase
      .from('inventory_items')
      .select(`
        sku,
        name,
        current_stock,
        reorder_point,
        safety_stock,
        moq,
        vendor_id,
        lead_time_days,
        unit_cost,
        sales_last_30_days,
        sales_last_90_days,
        vendors (
          id,
          name
        )
      `)
      .eq('status', 'active')
      .gte('reorder_point', 0); // Only items with defined reorder points

    if (error) {
      console.error('Error fetching inventory:', error);
      throw error;
    }

    // Calculate on_order quantities from pending PO items
    const itemsWithOnOrder: InventoryForReorder[] = await Promise.all(
      (items || []).map(async (item: any) => {
        const { data: poItems } = await supabase
          .from('purchase_order_items')
          .select('quantity_pending')
          .eq('inventory_sku', item.sku)
          .in('line_status', ['pending', 'partial']);

        const on_order = poItems?.reduce(
          (sum, poi) => sum + (poi.quantity_pending || 0),
          0
        ) || 0;

        return {
          sku: item.sku,
          name: item.name,
          current_stock: item.current_stock || 0,
          reorder_point: item.reorder_point || 0,
          safety_stock: item.safety_stock || 0,
          moq: item.moq || 1,
          vendor_id: item.vendor_id,
          vendor_name: item.vendors?.name || 'Unknown Vendor',
          lead_time_days: item.lead_time_days || 14,
          unit_cost: item.unit_cost || 0,
          sales_last_30_days: item.sales_last_30_days || 0,
          sales_last_90_days: item.sales_last_90_days || 0,
          on_order
        };
      })
    );

    return itemsWithOnOrder;
  }

  /**
   * Analyze a single item and generate reorder recommendation if needed
   */
  private analyzeItem(item: InventoryForReorder): ReorderRecommendation | null {
    // Calculate available stock (current + on order)
    const availableStock = item.current_stock + item.on_order;

    // Skip if stock is above reorder point
    if (availableStock >= item.reorder_point) {
      return null;
    }

    // Calculate consumption rates
    const consumption30day = item.sales_last_30_days;
    const consumption90day = item.sales_last_90_days;
    const consumptionDaily = consumption30day / 30;

    // Calculate consumption variance (how stable is demand?)
    const avg30 = consumption30day / 30;
    const avg90 = consumption90day / 90;
    const consumptionVariance = avg30 > 0 ? Math.abs(avg30 - avg90) / avg30 : 0;

    // Calculate days until stockout
    const daysUntilStockout = consumptionDaily > 0
      ? Math.floor(availableStock / consumptionDaily)
      : 999;

    // Calculate recommended order quantity
    // Formula: (Lead Time Demand) + (Safety Stock) - (Available Stock)
    const leadTimeDemand = Math.ceil(consumptionDaily * item.lead_time_days);
    const targetStock = leadTimeDemand + item.safety_stock;
    const rawQuantity = Math.max(0, targetStock - availableStock);

    // Round up to MOQ
    const recommendedQuantity = Math.max(
      item.moq,
      Math.ceil(rawQuantity / item.moq) * item.moq
    );

    // Calculate urgency based on days until stockout
    const urgency = this.calculateUrgency(
      daysUntilStockout,
      item.lead_time_days,
      consumptionVariance
    );

    // Calculate priority score (0-100)
    const priorityScore = this.calculatePriorityScore(
      daysUntilStockout,
      item.lead_time_days,
      item.current_stock,
      item.reorder_point,
      consumptionVariance
    );

    // Estimated cost
    const estimatedCost = recommendedQuantity * item.unit_cost;

    // Generate notes
    const notes = this.generateNotes(
      item,
      daysUntilStockout,
      availableStock,
      recommendedQuantity
    );

    return {
      inventory_sku: item.sku,
      item_name: item.name,
      vendor_id: item.vendor_id,
      vendor_name: item.vendor_name,
      current_stock: item.current_stock,
      on_order: item.on_order,
      reorder_point: item.reorder_point,
      safety_stock: item.safety_stock,
      moq: item.moq,
      recommended_quantity: recommendedQuantity,
      consumption_daily: parseFloat(consumptionDaily.toFixed(2)),
      consumption_30day: consumption30day,
      consumption_90day: consumption90day,
      consumption_variance: parseFloat(consumptionVariance.toFixed(2)),
      lead_time_days: item.lead_time_days,
      days_until_stockout: daysUntilStockout,
      urgency,
      priority_score: priorityScore,
      estimated_cost: estimatedCost,
      notes
    };
  }

  /**
   * Calculate urgency level based on days until stockout and lead time
   */
  private calculateUrgency(
    daysUntilStockout: number,
    leadTimeDays: number,
    consumptionVariance: number
  ): 'critical' | 'high' | 'normal' | 'low' {
    // Add buffer for high variance items
    const varianceBuffer = consumptionVariance > 0.3 ? 3 : 0;
    const effectiveLeadTime = leadTimeDays + varianceBuffer;

    if (daysUntilStockout <= 0) {
      return 'critical'; // Already stocked out
    } else if (daysUntilStockout < effectiveLeadTime * 0.5) {
      return 'critical'; // Will stock out before order arrives
    } else if (daysUntilStockout < effectiveLeadTime) {
      return 'high'; // Cutting it close
    } else if (daysUntilStockout < effectiveLeadTime * 1.5) {
      return 'normal'; // Reasonable time to order
    } else {
      return 'low'; // Plenty of time
    }
  }

  /**
   * Calculate priority score (0-100) for queue ordering
   */
  private calculatePriorityScore(
    daysUntilStockout: number,
    leadTimeDays: number,
    currentStock: number,
    reorderPoint: number,
    consumptionVariance: number
  ): number {
    let score = 50; // Start at middle

    // Factor 1: Days until stockout vs lead time (40 points)
    const stockoutRatio = daysUntilStockout / leadTimeDays;
    if (stockoutRatio <= 0) {
      score += 40; // Already stocked out
    } else if (stockoutRatio < 0.5) {
      score += 35; // Very urgent
    } else if (stockoutRatio < 1.0) {
      score += 25; // Urgent
    } else if (stockoutRatio < 1.5) {
      score += 15; // Normal
    } else {
      score += 5; // Low priority
    }

    // Factor 2: How far below reorder point (30 points)
    const belowReorderPoint = reorderPoint - currentStock;
    const percentBelow = belowReorderPoint / reorderPoint;
    score += Math.min(30, percentBelow * 30);

    // Factor 3: Consumption variance (20 points)
    // Higher variance = higher priority (more unpredictable)
    score += Math.min(20, consumptionVariance * 20);

    // Factor 4: Stockout penalty (10 points)
    if (currentStock <= 0) {
      score += 10;
    }

    // Cap at 100
    return Math.min(100, Math.max(0, Math.round(score)));
  }

  /**
   * Generate human-readable notes explaining the recommendation
   */
  private generateNotes(
    item: InventoryForReorder,
    daysUntilStockout: number,
    availableStock: number,
    recommendedQuantity: number
  ): string {
    const notes: string[] = [];

    // Stock status
    if (item.current_stock <= 0) {
      notes.push('⚠️ STOCKED OUT');
    } else if (daysUntilStockout < item.lead_time_days) {
      notes.push(`Will stock out in ${daysUntilStockout} days (lead time: ${item.lead_time_days} days)`);
    } else {
      notes.push(`${daysUntilStockout} days until stockout`);
    }

    // On order status
    if (item.on_order > 0) {
      notes.push(`${item.on_order} units on order`);
    }

    // MOQ adjustment
    if (recommendedQuantity > item.moq && recommendedQuantity % item.moq !== 0) {
      notes.push(`Rounded up to MOQ multiple (${item.moq})`);
    }

    // Consumption pattern
    const dailySales = item.sales_last_30_days / 30;
    if (dailySales > 0) {
      notes.push(`Avg daily sales: ${dailySales.toFixed(1)} units`);
    }

    return notes.join(' • ');
  }

  /**
   * Update reorder queue table with new recommendations
   */
  private async updateReorderQueue(
    recommendations: ReorderRecommendation[]
  ): Promise<void> {
    // 1. Mark old pending items as resolved (they'll be re-added if still needed)
    await supabase
      .from('reorder_queue')
      .update({
        status: 'resolved',
        resolution_type: 'auto_cleanup',
        resolved_at: new Date().toISOString()
      })
      .eq('status', 'pending')
      .lt('identified_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Older than 24h

    // 2. Insert new recommendations
    if (recommendations.length > 0) {
      const { error } = await supabase
        .from('reorder_queue')
        .insert(
          recommendations.map(rec => ({
            inventory_sku: rec.inventory_sku,
            item_name: rec.item_name,
            vendor_id: rec.vendor_id,
            vendor_name: rec.vendor_name,
            current_stock: rec.current_stock,
            on_order: rec.on_order,
            reorder_point: rec.reorder_point,
            safety_stock: rec.safety_stock,
            moq: rec.moq,
            recommended_quantity: rec.recommended_quantity,
            consumption_daily: rec.consumption_daily,
            consumption_30day: rec.consumption_30day,
            consumption_90day: rec.consumption_90day,
            consumption_variance: rec.consumption_variance,
            lead_time_days: rec.lead_time_days,
            days_until_stockout: rec.days_until_stockout,
            urgency: rec.urgency,
            priority_score: rec.priority_score,
            estimated_cost: rec.estimated_cost,
            notes: rec.notes,
            status: 'pending',
            identified_at: new Date().toISOString()
          }))
        );

      if (error) {
        console.error('Error inserting reorder recommendations:', error);
        throw error;
      }
    }
  }

  /**
   * Get summary of current reorder queue
   */
  async getQueueSummary(): Promise<{
    total: number;
    critical: number;
    high: number;
    normal: number;
    low: number;
    total_cost: number;
  }> {
    const { data, error } = await supabase
      .from('reorder_queue')
      .select('urgency, estimated_cost')
      .eq('status', 'pending');

    if (error) throw error;

    const summary = {
      total: data?.length || 0,
      critical: data?.filter(r => r.urgency === 'critical').length || 0,
      high: data?.filter(r => r.urgency === 'high').length || 0,
      normal: data?.filter(r => r.urgency === 'normal').length || 0,
      low: data?.filter(r => r.urgency === 'low').length || 0,
      total_cost: data?.reduce((sum, r) => sum + (r.estimated_cost || 0), 0) || 0
    };

    return summary;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Export singleton instance
// ═══════════════════════════════════════════════════════════════════════════

export const reorderQueueScanner = new ReorderQueueScanner();
