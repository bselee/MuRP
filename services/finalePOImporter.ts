/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📥 FINALE PURCHASE ORDER IMPORTER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Imports purchase orders from Finale Inventory CSV reports into MuRP.
 *
 * Features:
 * - Parses Finale PO CSV format
 * - Maps Finale fields to MuRP schema
 * - Handles internal notes parsing
 * - Tracks sync history
 * - Validates data before import
 *
 * CSV Format (Finale PO Export):
 * - PO Number, Date, Supplier, Status, Items, Totals, Notes, etc.
 *
 * @module services/finalePOImporter
 */

import { supabase } from '../lib/supabase/client';
import type { PurchaseOrder, PurchaseOrderItem } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface FinalePOCSVRow {
  'PO Number': string;
  'Date': string;
  'Supplier Code': string;
  'Supplier Name': string;
  'Status': string;
  'Expected Date': string;
  'Tracking Number': string;
  'Subtotal': string;
  'Tax': string;
  'Shipping': string;
  'Total': string;
  'Internal Notes': string;
  'Vendor Notes': string;
  'Payment Terms': string;
  'Line Items': string; // JSON string of line items
}

export interface FinaleLineItem {
  sku: string;
  description: string;
  quantity: number;
  unitCost: number;
  received: number;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Finale PO Importer Service
// ═══════════════════════════════════════════════════════════════════════════

export class FinalePOImporter {
  /**
   * Import purchase orders from Finale CSV data
   */
  async importFromCSV(csvData: FinalePOCSVRow[]): Promise<ImportResult> {
    const result: ImportResult = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    console.log(`📥 Importing ${csvData.length} POs from Finale...`);

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];

      try {
        // 1. Transform Finale row to MuRP format
        const po = this.transformFinalePOtoMuRP(row);

        // 2. Check if PO already exists
        const { data: existing } = await supabase
          .from('purchase_orders')
          .select('id, status, record_last_updated')
          .eq('order_id', po.order_id)
          .single();

        if (existing) {
          // Update existing PO if Finale version is newer
          const finaleDate = new Date(row.Date);
          const existingDate = new Date(existing.record_last_updated);

          if (finaleDate > existingDate) {
            await this.updatePO(existing.id, po);
            result.updated++;
          } else {
            result.skipped++;
          }
        } else {
          // Insert new PO
          await this.insertPO(po);
          result.imported++;
        }

      } catch (error: any) {
        console.error(`Error importing PO row ${i + 1}:`, error);
        result.errors.push({
          row: i + 1,
          error: error.message
        });
      }
    }

    // Log import to sync log
    await this.logImport(result);

    console.log(`✅ Import complete: ${result.imported} new, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`);

    return result;
  }

  /**
   * Transform Finale PO CSV row to MuRP purchase order format
   */
  private transformFinalePOtoMuRP(row: FinalePOCSVRow): any {
    // Parse internal notes (may contain MuRP-specific data)
    const internalNotes = this.parseInternalNotes(row['Internal Notes']);

    // Map Finale status to MuRP status
    const status = this.mapFinaleStatus(row.Status);

    // Parse line items
    const lineItems = this.parseLineItems(row['Line Items']);

    return {
      // Order identification
      order_id: row['PO Number'],
      order_date: this.parseDate(row.Date),

      // Vendor information
      supplier_code: row['Supplier Code'],
      supplier_name: row['Supplier Name'],

      // Order details
      status,
      finale_status: row.Status,

      // Fulfillment tracking
      expected_date: this.parseDate(row['Expected Date']),
      tracking_number: row['Tracking Number'] || null,

      // Financial
      subtotal: this.parseDecimal(row.Subtotal),
      tax_amount: this.parseDecimal(row.Tax),
      shipping_cost: this.parseDecimal(row.Shipping),
      total_amount: this.parseDecimal(row.Total),

      // Notes
      internal_notes: row['Internal Notes'],
      vendor_notes: row['Vendor Notes'],
      payment_terms: row['Payment Terms'],

      // Finale sync metadata
      finale_po_id: row['PO Number'],
      last_finale_sync: new Date().toISOString(),
      source: 'finale_import',

      // Line items (will be inserted separately)
      _line_items: lineItems
    };
  }

  /**
   * Map Finale PO status to MuRP status
   */
  private mapFinaleStatus(finaleStatus: string): string {
    const statusMap: Record<string, string> = {
      'Draft': 'draft',
      'Pending': 'pending',
      'Ordered': 'sent',
      'Confirmed': 'confirmed',
      'Partial': 'partial',
      'Received': 'received',
      'Cancelled': 'cancelled',
      'Closed': 'received'
    };

    return statusMap[finaleStatus] || 'pending';
  }

  /**
   * Parse internal notes field (may contain JSON data from MuRP)
   */
  private parseInternalNotes(notes: string): any {
    if (!notes) return {};

    try {
      // Check if notes contain JSON metadata (e.g., {\"murp_data\": {...}})
      const jsonMatch = notes.match(/\{.*\}/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // Not JSON, just plain text notes
    }

    return { text: notes };
  }

  /**
   * Parse line items from Finale format
   */
  private parseLineItems(lineItemsStr: string): FinaleLineItem[] {
    if (!lineItemsStr) return [];

    try {
      // Finale exports line items as JSON string
      const items = JSON.parse(lineItemsStr);

      return items.map((item: any) => ({
        sku: item.sku || item.SKU || '',
        description: item.description || item.Description || '',
        quantity: parseInt(item.quantity || item.Quantity || '0'),
        unitCost: parseFloat(item.unitCost || item['Unit Cost'] || '0'),
        received: parseInt(item.received || item.Received || '0')
      }));
    } catch (e) {
      console.warn('Failed to parse line items:', e);
      return [];
    }
  }

  /**
   * Insert new PO with line items
   */
  private async insertPO(po: any): Promise<void> {
    const lineItems = po._line_items || [];
    delete po._line_items;

    // 1. Look up vendor by supplier code or name
    const { data: vendor } = await supabase
      .from('vendors')
      .select('id')
      .or(`id.eq.${po.supplier_code},name.eq.${po.supplier_name}`)
      .limit(1)
      .single();

    if (vendor) {
      po.vendor_id = vendor.id;
    }

    // 2. Insert PO
    const { data: newPO, error: poError } = await supabase
      .from('purchase_orders')
      .insert(po)
      .select('id')
      .single();

    if (poError) throw poError;

    // 3. Insert line items
    if (newPO && lineItems.length > 0) {
      const poItems = lineItems.map((item: FinaleLineItem, idx: number) => ({
        po_id: newPO.id,
        inventory_sku: item.sku,
        item_name: item.description,
        quantity_ordered: item.quantity,
        quantity_received: item.received,
        unit_cost: item.unitCost,
        line_number: idx + 1,
        line_status: item.received >= item.quantity ? 'received' : 'pending'
      }));

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(poItems);

      if (itemsError) throw itemsError;
    }
  }

  /**
   * Update existing PO
   */
  private async updatePO(poId: string, updates: any): Promise<void> {
    const lineItems = updates._line_items || [];
    delete updates._line_items;

    // Update PO header
    const { error: poError } = await supabase
      .from('purchase_orders')
      .update({
        ...updates,
        record_last_updated: new Date().toISOString()
      })
      .eq('id', poId);

    if (poError) throw poError;

    // Update line items (delete and re-insert for simplicity)
    if (lineItems.length > 0) {
      // Delete existing items
      await supabase
        .from('purchase_order_items')
        .delete()
        .eq('po_id', poId);

      // Insert updated items
      const poItems = lineItems.map((item: FinaleLineItem, idx: number) => ({
        po_id: poId,
        inventory_sku: item.sku,
        item_name: item.description,
        quantity_ordered: item.quantity,
        quantity_received: item.received,
        unit_cost: item.unitCost,
        line_number: idx + 1,
        line_status: item.received >= item.quantity ? 'received' : 'pending'
      }));

      await supabase
        .from('purchase_order_items')
        .insert(poItems);
    }
  }

  /**
   * Log import operation to Finale sync log
   */
  private async logImport(result: ImportResult): Promise<void> {
    await supabase.from('finale_sync_log').insert({
      sync_type: 'import_po',
      entity_type: 'purchase_order',
      operation: 'import',
      direction: 'import',
      status: result.errors.length > 0 ? 'partial' : 'success',
      records_processed: result.imported + result.updated + result.skipped,
      error_message: result.errors.length > 0
        ? `${result.errors.length} rows failed`
        : null,
      error_details: result.errors.length > 0 ? result.errors : null,
      completed_at: new Date().toISOString(),
      triggered_by: 'system',
      sync_source: 'manual'
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Helper functions
  // ═══════════════════════════════════════════════════════════════════════

  private parseDate(dateStr: string): string | null {
    if (!dateStr) return null;

    try {
      const date = new Date(dateStr);
      return date.toISOString().split('T')[0]; // YYYY-MM-DD
    } catch (e) {
      return null;
    }
  }

  private parseDecimal(numStr: string): number {
    if (!numStr) return 0;

    // Remove currency symbols and commas
    const cleaned = numStr.replace(/[$,]/g, '');
    return parseFloat(cleaned) || 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Export singleton instance
// ═══════════════════════════════════════════════════════════════════════════

export const finalePOImporter = new FinalePOImporter();
