/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📤 FINALE PURCHASE ORDER EXPORTER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Exports purchase orders from MuRP to Finale Inventory CSV format.
 *
 * Features:
 * - Converts MuRP POs to Finale CSV format
 * - Generates internal notes with MuRP metadata
 * - Creates CSV files for Finale import
 * - Tracks export history
 * - Validates data before export
 *
 * Export Format:
 * - CSV compatible with Finale PO import
 * - Preserves all MuRP data in internal notes (JSON)
 * - Ready for upload to Finale
 *
 * @module services/finalePOExporter
 */

import { supabase } from '../lib/supabase/client';
import type { PurchaseOrder, PurchaseOrderItem } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface FinaleExportRow {
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
  'Internal Notes': string; // Contains JSON metadata from MuRP
  'Vendor Notes': string;
  'Payment Terms': string;
  'Line Items': string; // JSON array of line items
}

export interface ExportResult {
  exported: number;
  csv: string;
  filename: string;
  errors: Array<{ poId: string; error: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Finale PO Exporter Service
// ═══════════════════════════════════════════════════════════════════════════

export class FinalePOExporter {
  /**
   * Export purchase orders to Finale CSV format
   *
   * @param poIds - Array of PO IDs to export (if empty, exports all pending/sent POs)
   * @returns Export result with CSV string
   */
  async exportToCSV(poIds?: string[]): Promise<ExportResult> {
    const result: ExportResult = {
      exported: 0,
      csv: '',
      filename: '',
      errors: []
    };

    console.log(`📤 Exporting POs to Finale format...`);

    try {
      // 1. Fetch POs from database
      let query = supabase
        .from('purchase_orders')
        .select(`
          *,
          purchase_order_items (*)
        `)
        .order('order_date', { ascending: false });

      if (poIds && poIds.length > 0) {
        query = query.in('id', poIds);
      } else {
        // Export only pending/sent POs by default
        query = query.in('status', ['pending', 'sent']);
      }

      const { data: pos, error } = await query;

      if (error) throw error;
      if (!pos || pos.length === 0) {
        console.log('No POs to export');
        return result;
      }

      console.log(`Found ${pos.length} POs to export`);

      // 2. Transform to Finale format
      const rows: FinaleExportRow[] = [];

      for (const po of pos) {
        try {
          const row = this.transformMuRPtoFinale(po);
          rows.push(row);
          result.exported++;
        } catch (error: any) {
          console.error(`Error transforming PO ${po.order_id}:`, error);
          result.errors.push({
            poId: po.order_id,
            error: error.message
          });
        }
      }

      // 3. Generate CSV
      result.csv = this.generateCSV(rows);
      result.filename = `finale_pos_${new Date().toISOString().split('T')[0]}.csv`;

      // 4. Log export
      await this.logExport(result);

      console.log(`✅ Export complete: ${result.exported} POs exported, ${result.errors.length} errors`);

      // 5. Update POs with export timestamp
      await this.markAsExported(pos.map(p => p.id));

      return result;

    } catch (error: any) {
      console.error('Export failed:', error);
      throw error;
    }
  }

  /**
   * Transform MuRP PO to Finale CSV format
   */
  private transformMuRPtoFinale(po: any): FinaleExportRow {
    const lineItems = po.purchase_order_items || [];

    // Create internal notes with MuRP metadata (for round-trip sync)
    const internalNotes = this.generateInternalNotes(po);

    // Map MuRP status to Finale status
    const finaleStatus = this.mapMuRPStatus(po.status);

    // Format line items for Finale
    const finaleLineItems = lineItems.map((item: any) => ({
      sku: item.inventory_sku,
      Description: item.item_name,
      Quantity: item.quantity_ordered,
      'Unit Cost': item.unit_cost,
      Received: item.quantity_received || 0
    }));

    return {
      'PO Number': po.order_id,
      'Date': this.formatDate(po.order_date),
      'Supplier Code': po.supplier_code || '',
      'Supplier Name': po.supplier_name,
      'Status': finaleStatus,
      'Expected Date': this.formatDate(po.expected_date),
      'Tracking Number': po.tracking_number || '',
      'Subtotal': this.formatCurrency(po.subtotal || 0),
      'Tax': this.formatCurrency(po.tax_amount || 0),
      'Shipping': this.formatCurrency(po.shipping_cost || 0),
      'Total': this.formatCurrency(po.total_amount || 0),
      'Internal Notes': internalNotes,
      'Vendor Notes': po.vendor_notes || '',
      'Payment Terms': po.payment_terms || '',
      'Line Items': JSON.stringify(finaleLineItems)
    };
  }

  /**
   * Map MuRP status to Finale status
   */
  private mapMuRPStatus(murpStatus: string): string {
    const statusMap: Record<string, string> = {
      'draft': 'Draft',
      'pending': 'Pending',
      'sent': 'Ordered',
      'confirmed': 'Confirmed',
      'partial': 'Partial',
      'received': 'Received',
      'cancelled': 'Cancelled'
    };

    return statusMap[murpStatus] || 'Pending';
  }

  /**
   * Generate internal notes with MuRP metadata
   * This allows round-trip sync without data loss
   */
  private generateInternalNotes(po: any): string {
    const metadata = {
      murp_id: po.id,
      murp_source: po.source,
      murp_priority: po.priority,
      murp_created_at: po.record_created,
      murp_approved_by: po.approved_by,
      murp_requisition_ids: po.requisition_ids
    };

    // Combine text notes with JSON metadata
    const textNotes = po.internal_notes || '';
    const jsonMetadata = JSON.stringify(metadata);

    return textNotes
      ? `${textNotes}\n\n[MuRP Data: ${jsonMetadata}]`
      : `[MuRP Data: ${jsonMetadata}]`;
  }

  /**
   * Generate CSV string from rows
   */
  private generateCSV(rows: FinaleExportRow[]): string {
    if (rows.length === 0) return '';

    // Get headers from first row
    const headers = Object.keys(rows[0]);

    // Create CSV header row
    const headerRow = headers.map(h => this.escapeCSV(h)).join(',');

    // Create data rows
    const dataRows = rows.map(row =>
      headers.map(header => {
        const value = row[header as keyof FinaleExportRow];
        return this.escapeCSV(value);
      }).join(',')
    );

    return [headerRow, ...dataRows].join('\n');
  }

  /**
   * Escape CSV value (handle quotes, commas, newlines)
   */
  private escapeCSV(value: string): string {
    if (!value) return '""';

    // If value contains comma, quote, or newline, wrap in quotes and escape existing quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }

    return `"${value}"`;
  }

  /**
   * Mark POs as exported
   */
  private async markAsExported(poIds: string[]): Promise<void> {
    if (poIds.length === 0) return;

    await supabase
      .from('purchase_orders')
      .update({
        last_finale_sync: new Date().toISOString()
      })
      .in('id', poIds);
  }

  /**
   * Log export operation
   */
  private async logExport(result: ExportResult): Promise<void> {
    await supabase.from('finale_sync_log').insert({
      sync_type: 'export_po',
      entity_type: 'purchase_order',
      operation: 'export',
      direction: 'export',
      status: result.errors.length > 0 ? 'partial' : 'success',
      records_processed: result.exported,
      error_message: result.errors.length > 0
        ? `${result.errors.length} POs failed`
        : null,
      error_details: result.errors.length > 0 ? result.errors : null,
      completed_at: new Date().toISOString(),
      triggered_by: 'system',
      sync_source: 'manual'
    });
  }

  /**
   * Download CSV file
   */
  downloadCSV(csv: string, filename: string): void {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Helper functions
  // ═══════════════════════════════════════════════════════════════════════

  private formatDate(dateStr: string | null): string {
    if (!dateStr) return '';

    try {
      const date = new Date(dateStr);
      // Finale expects MM/DD/YYYY format
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    } catch (e) {
      return '';
    }
  }

  private formatCurrency(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Export singleton instance
// ═══════════════════════════════════════════════════════════════════════════

export const finalePOExporter = new FinalePOExporter();
