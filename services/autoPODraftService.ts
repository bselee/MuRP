/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🤖 AUTO-PO DRAFT SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Automatically creates DRAFT purchase orders from reorder queue recommendations.
 *
 * Features:
 * - Vendor-level automation control (opt-in)
 * - Urgency threshold filtering (only critical, or high+critical, etc.)
 * - Creates draft POs that require manual review
 * - Tracks auto-generation for audit trail
 * - Groups items by vendor efficiently
 *
 * Automation Levels:
 * - Level 0: Manual only (auto_po_enabled = false)
 * - Level 1: Auto-draft critical items (threshold = 'critical')
 * - Level 2: Auto-draft high+ items (threshold = 'high')
 * - Level 3: Auto-draft all items (threshold = 'low')
 *
 * @module services/autoPODraftService
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface ReorderQueueItem {
  id: string;
  inventory_sku: string;
  item_name: string;
  vendor_id: string | null;
  vendor_name: string | null;
  recommended_quantity: number;
  urgency: 'critical' | 'high' | 'normal' | 'low';
  estimated_cost: number;
  lead_time_days: number;
}

interface VendorAutomationSettings {
  vendor_id: string;
  vendor_name: string;
  auto_po_enabled: boolean;
  auto_po_threshold: 'critical' | 'high' | 'normal' | 'low';
  auto_send_email: boolean;
  lead_time_days: number;
}

interface AutoPOResult {
  pos_created: number;
  items_processed: number;
  vendors_processed: string[];
  po_ids: string[];
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Auto-PO Draft Service
// ═══════════════════════════════════════════════════════════════════════════

export class AutoPODraftService {
  /**
   * Main service function - creates draft POs from reorder queue
   */
  async createDraftPOs(): Promise<AutoPOResult> {
    console.log('🤖 Starting auto-PO draft creation...');

    const result: AutoPOResult = {
      pos_created: 0,
      items_processed: 0,
      vendors_processed: [],
      po_ids: [],
      errors: [],
    };

    try {
      // 1. Fetch reorder queue items
      const queueItems = await this.fetchReorderQueueItems();
      console.log(`📊 Found ${queueItems.length} items in reorder queue`);

      if (queueItems.length === 0) {
        return result;
      }

      // 2. Fetch vendor automation settings
      const vendorSettings = await this.fetchVendorAutomationSettings();
      const settingsMap = new Map(vendorSettings.map(v => [v.vendor_id, v]));

      // 3. Filter items by vendor automation settings
      const eligibleItems = queueItems.filter(item => {
        if (!item.vendor_id) return false;

        const settings = settingsMap.get(item.vendor_id);
        if (!settings || !settings.auto_po_enabled) return false;

        // Check urgency threshold
        return this.meetsUrgencyThreshold(item.urgency, settings.auto_po_threshold);
      });

      console.log(`✅ ${eligibleItems.length} items eligible for auto-PO (after vendor filtering)`);

      if (eligibleItems.length === 0) {
        return result;
      }

      // 4. Group by vendor
      const itemsByVendor = this.groupByVendor(eligibleItems);

      // 5. Create draft PO for each vendor
      for (const [vendorId, items] of itemsByVendor.entries()) {
        try {
          const settings = settingsMap.get(vendorId)!;
          const poId = await this.createDraftPO(vendorId, settings, items);

          result.pos_created++;
          result.items_processed += items.length;
          result.vendors_processed.push(vendorId);
          result.po_ids.push(poId);

          // Update reorder queue items to mark as processed
          await this.markItemsAsProcessed(items.map(i => i.id), poId);

          console.log(`✅ Created draft PO for ${settings.vendor_name}: ${items.length} items`);
        } catch (error: any) {
          console.error(`❌ Failed to create PO for vendor ${vendorId}:`, error);
          result.errors.push(`Vendor ${vendorId}: ${error.message}`);
        }
      }

      console.log(`🎉 Auto-PO draft creation complete: ${result.pos_created} POs created`);

      return result;
    } catch (error: any) {
      console.error('❌ Auto-PO draft creation failed:', error);
      result.errors.push(error.message);
      return result;
    }
  }

  /**
   * Fetch reorder queue items that are pending
   */
  private async fetchReorderQueueItems(): Promise<ReorderQueueItem[]> {
    const { data, error } = await supabase
      .from('reorder_queue')
      .select('*')
      .eq('status', 'pending')
      .not('vendor_id', 'is', null); // Only items with vendors

    if (error) throw error;

    return data || [];
  }

  /**
   * Fetch vendor automation settings
   */
  private async fetchVendorAutomationSettings(): Promise<VendorAutomationSettings[]> {
    const { data, error } = await supabase
      .from('vendors')
      .select('id, name, auto_po_enabled, auto_po_threshold, auto_send_email, lead_time_days')
      .eq('auto_po_enabled', true); // Only vendors with automation enabled

    if (error) throw error;

    return (data || []).map((v: any) => ({
      vendor_id: v.id,
      vendor_name: v.name,
      auto_po_enabled: v.auto_po_enabled,
      auto_po_threshold: v.auto_po_threshold || 'critical',
      auto_send_email: v.auto_send_email || false,
      lead_time_days: v.lead_time_days || 14,
    }));
  }

  /**
   * Check if item urgency meets vendor's threshold
   */
  private meetsUrgencyThreshold(
    itemUrgency: 'critical' | 'high' | 'normal' | 'low',
    threshold: 'critical' | 'high' | 'normal' | 'low'
  ): boolean {
    const urgencyRank = { critical: 4, high: 3, normal: 2, low: 1 };
    return urgencyRank[itemUrgency] >= urgencyRank[threshold];
  }

  /**
   * Group items by vendor
   */
  private groupByVendor(items: ReorderQueueItem[]): Map<string, ReorderQueueItem[]> {
    const grouped = new Map<string, ReorderQueueItem[]>();

    items.forEach(item => {
      if (!item.vendor_id) return;

      if (!grouped.has(item.vendor_id)) {
        grouped.set(item.vendor_id, []);
      }

      grouped.get(item.vendor_id)!.push(item);
    });

    return grouped;
  }

  /**
   * Create a draft PO for a vendor
   */
  private async createDraftPO(
    vendorId: string,
    settings: VendorAutomationSettings,
    items: ReorderQueueItem[]
  ): Promise<string> {
    // Generate order ID
    const orderId = await this.generateOrderId();

    // Calculate expected date
    const orderDate = new Date().toISOString();
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + settings.lead_time_days);

    // 1. Insert PO header
    const { data: newPO, error: poError } = await supabase
      .from('purchase_orders')
      .insert({
        order_id: orderId,
        vendor_id: vendorId,
        supplier_name: settings.vendor_name,
        status: 'draft',
        order_date: orderDate,
        expected_date: expectedDate.toISOString(),
        internal_notes: `Auto-generated from reorder queue (${items.length} items)`,
        source: 'auto_reorder',
        auto_generated: true,
        auto_approved: false,
        record_created: new Date().toISOString(),
      } as any)
      .select('id')
      .single();

    if (poError) throw poError;

    // 2. Insert line items
    const lineItems = items.map((item, idx) => ({
      po_id: newPO.id,
      inventory_sku: item.inventory_sku,
      item_name: item.item_name,
      quantity_ordered: item.recommended_quantity,
      unit_cost: item.estimated_cost / item.recommended_quantity, // Calculate unit cost
      line_number: idx + 1,
      line_status: 'pending',
    }));

    const { error: itemsError } = await supabase
      .from('purchase_order_items')
      .insert(lineItems);

    if (itemsError) throw itemsError;

    return orderId;
  }

  /**
   * Mark reorder queue items as processed
   */
  private async markItemsAsProcessed(itemIds: string[], poId: string): Promise<void> {
    await supabase
      .from('reorder_queue')
      .update({
        status: 'po_created',
        po_id: poId,
        resolved_at: new Date().toISOString(),
        resolution_type: 'auto_po_created',
      })
      .in('id', itemIds);
  }

  /**
   * Generate unique order ID
   */
  private async generateOrderId(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

    // Find max sequence for today
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('order_id')
      .like('order_id', `PO-${dateStr}-%`)
      .order('order_id', { ascending: false })
      .limit(1);

    let sequence = 1;
    if (data && data.length > 0) {
      const lastId = data[0].order_id;
      const lastSeq = parseInt(lastId.split('-')[2]);
      sequence = lastSeq + 1;
    }

    return `PO-${dateStr}-${sequence.toString().padStart(3, '0')}`;
  }

  /**
   * Get summary of auto-PO performance by vendor
   */
  async getAutomationSummary(): Promise<any[]> {
    const { data, error } = await supabase
      .from('vendor_automation_summary')
      .select('*')
      .order('auto_pos_created', { ascending: false });

    if (error) throw error;

    return data || [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Export singleton instance
// ═══════════════════════════════════════════════════════════════════════════

export const autoPODraftService = new AutoPODraftService();
