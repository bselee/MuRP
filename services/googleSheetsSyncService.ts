/**
 * Google Sheets Sync Service
 *
 * Handles import/export of inventory data to/from Google Sheets
 * Provides automatic backups and collaborative data entry
 */

import { getGoogleSheetsService } from './googleSheetsService';
import { supabase } from '../lib/supabase/client';
import type { InventoryItem, Vendor, BillOfMaterials } from '../types';

export interface ImportOptions {
  spreadsheetId: string;
  sheetName: string;
  mergeStrategy: 'replace' | 'add_new' | 'update_existing';
  skipFirstRow?: boolean; // Skip header row
  columnMapping?: ColumnMapping;
}

export interface ExportOptions {
  spreadsheetId?: string; // If not provided, creates new spreadsheet
  sheetName?: string;
  includeHeaders?: boolean;
  clearExisting?: boolean;
  formatHeaders?: boolean;
}

export interface ColumnMapping {
  [key: string]: number; // Column index for each field
}

export interface ImportResult {
  success: boolean;
  itemsImported: number;
  itemsSkipped: number;
  errors: string[];
}

export interface ExportResult {
  success: boolean;
  itemsExported: number;
  spreadsheetId: string;
  spreadsheetUrl?: string;
}

export class GoogleSheetsSyncService {
  private _sheetsService: ReturnType<typeof getGoogleSheetsService> | null = null;

  private get sheetsService() {
    if (!this._sheetsService) {
      this._sheetsService = getGoogleSheetsService();
    }
    return this._sheetsService;
  }

  // ============================================================================
  // INVENTORY IMPORT/EXPORT
  // ============================================================================

  /**
   * Import inventory from Google Sheets
   */
  async importInventory(options: ImportOptions): Promise<ImportResult> {
    const startTime = new Date();
    const result: ImportResult = {
      success: false,
      itemsImported: 0,
      itemsSkipped: 0,
      errors: [],
    };

    try {
      console.log(`[GoogleSheetsSyncService] Importing inventory from sheet: ${options.sheetName}`);

      // Read sheet data
      const range = `${options.sheetName}!A:Z`; // Read all columns
      const rows = await this.sheetsService.readSheet(options.spreadsheetId, range);

      if (rows.length === 0) {
        throw new Error('Sheet is empty');
      }

      // Parse header row
      const headerRow = rows[0];
      const dataRows = options.skipFirstRow !== false ? rows.slice(1) : rows;

      console.log(`[GoogleSheetsSyncService] Found ${dataRows.length} rows to import`);

      // Auto-detect column mapping if not provided
      const columnMapping = options.columnMapping || this.autoDetectInventoryColumns(headerRow);

      // Transform rows to inventory items
      const inventoryItems: any[] = [];
      const errors: string[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNum = i + (options.skipFirstRow !== false ? 2 : 1);

        try {
          const item = this.parseInventoryRow(row, columnMapping);
          if (item.sku) {
            inventoryItems.push(item);
          } else {
            errors.push(`Row ${rowNum}: Missing SKU`);
            result.itemsSkipped++;
          }
        } catch (error) {
          errors.push(`Row ${rowNum}: ${error instanceof Error ? error.message : String(error)}`);
          result.itemsSkipped++;
        }
      }

      console.log(`[GoogleSheetsSyncService] Parsed ${inventoryItems.length} valid items`);

      if (inventoryItems.length === 0) {
        throw new Error('No valid inventory items found in sheet');
      }

      // Create backup before importing
      console.log('[GoogleSheetsSyncService] Creating backup before import...');
      const { data: backupData, error: backupError } = await supabase.rpc('backup_inventory_items', {
        p_backup_reason: 'pre-google-sheets-import',
        p_backup_source: 'google-sheets'
      });

      if (backupError) {
        console.warn('[GoogleSheetsSyncService] Warning: Backup failed:', backupError);
      }

      // Apply merge strategy
      let savedCount = 0;

      if (options.mergeStrategy === 'replace') {
        // Delete all existing inventory and insert new
        await supabase.from('inventory_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        const { error } = await supabase.from('inventory_items').insert(inventoryItems as any);
        if (error) throw error;
        savedCount = inventoryItems.length;
      } else if (options.mergeStrategy === 'add_new') {
        // Only insert items that don't exist (by SKU)
        for (const item of inventoryItems) {
          const { data: existing } = await supabase
            .from('inventory_items')
            .select('sku')
            .eq('sku', item.sku)
            .single();

          if (!existing) {
            const { error } = await supabase.from('inventory_items').insert([item] as any);
            if (!error) savedCount++;
          } else {
            result.itemsSkipped++;
          }
        }
      } else if (options.mergeStrategy === 'update_existing') {
        // Upsert all items
        const { error } = await supabase
          .from('inventory_items')
          .upsert(inventoryItems as any, { onConflict: 'sku' });
        if (error) throw error;
        savedCount = inventoryItems.length;
      }

      result.itemsImported = savedCount;
      result.errors = errors;
      result.success = true;

      // Log audit
      await this.logAudit({
        syncType: 'google_sheets',
        operation: 'import',
        tableName: 'inventory_items',
        itemsAffected: savedCount,
        success: true,
        metadata: {
          spreadsheetId: options.spreadsheetId,
          sheetName: options.sheetName,
          mergeStrategy: options.mergeStrategy,
        },
        startedAt: startTime,
      });

      console.log(`[GoogleSheetsSyncService] Successfully imported ${savedCount} inventory items`);

      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : String(error));

      // Log failed audit
      await this.logAudit({
        syncType: 'google_sheets',
        operation: 'import',
        tableName: 'inventory_items',
        itemsAffected: 0,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        startedAt: startTime,
      });

      console.error('[GoogleSheetsSyncService] Import failed:', error);
      return result;
    }
  }

  /**
   * Export inventory to Google Sheets
   */
  async exportInventory(options: ExportOptions = {}): Promise<ExportResult> {
    const startTime = new Date();

    try {
      console.log('[GoogleSheetsSyncService] Exporting inventory to Google Sheets...');

      // Fetch inventory from database
      const { data: inventory, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('sku');

      if (error) {
        throw new Error(`Failed to fetch inventory: ${error.message}`);
      }

      if (!inventory || inventory.length === 0) {
        throw new Error('No inventory items to export');
      }

      console.log(`[GoogleSheetsSyncService] Exporting ${inventory.length} items`);

      // Prepare sheet data
      const headers = [
        'SKU', 'Name', 'Description', 'Category', 'Quantity On Hand',
        'Reorder Point', 'Reorder Quantity', 'Unit Cost', 'Unit Price',
        'Supplier', 'UPC', 'Location', 'Status', 'Last Synced'
      ];

      const rows = inventory.map(item => [
        item.sku || '',
        item.name || '',
        item.description || '',
        item.category || '',
        item.quantity_on_hand || 0,
        item.reorder_point || 0,
        item.reorder_quantity || 0,
        item.unit_cost || 0,
        item.unit_price || 0,
        item.supplier_name || '',
        item.upc || '',
        item.location || '',
        item.is_active ? 'Active' : 'Inactive',
        item.last_synced_at || item.updated_at || '',
      ]);

      const sheetData = options.includeHeaders !== false
        ? [headers, ...rows]
        : rows;

      // Create or use existing spreadsheet
      let spreadsheetId = options.spreadsheetId;
      let spreadsheetUrl: string | undefined;

      if (!spreadsheetId) {
        // Create new spreadsheet
        const timestamp = new Date().toISOString().split('T')[0];
        const title = `MuRP Inventory Export - ${timestamp}`;
        const result = await this.sheetsService.createSpreadsheet(title, ['Inventory']);
        spreadsheetId = result.spreadsheetId;
        spreadsheetUrl = result.spreadsheetUrl;
      }

      const sheetName = options.sheetName || 'Inventory';
      const range = `${sheetName}!A1`;

      // Write data to sheet
      await this.sheetsService.writeSheet(
        spreadsheetId,
        range,
        sheetData,
        {
          valueInputOption: 'USER_ENTERED',
          clearExisting: options.clearExisting,
        }
      );

      // Format headers if requested
      if (options.formatHeaders !== false && options.includeHeaders !== false) {
        const info = await this.sheetsService.getSpreadsheetInfo(spreadsheetId);
        const sheet = info.sheets.find(s => s.title === sheetName);
        if (sheet) {
          await this.sheetsService.formatHeaders(spreadsheetId, sheet.sheetId, {
            bold: true,
            backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
            freeze: true,
          });
          await this.sheetsService.autoResizeColumns(spreadsheetId, sheet.sheetId);
        }
      }

      // Log audit
      await this.logAudit({
        syncType: 'google_sheets',
        operation: 'export',
        tableName: 'inventory_items',
        itemsAffected: inventory.length,
        success: true,
        metadata: {
          spreadsheetId,
          sheetName,
        },
        startedAt: startTime,
      });

      console.log(`[GoogleSheetsSyncService] Successfully exported ${inventory.length} items to ${spreadsheetId}`);

      return {
        success: true,
        itemsExported: inventory.length,
        spreadsheetId,
        spreadsheetUrl,
      };
    } catch (error) {
      // Log failed audit
      await this.logAudit({
        syncType: 'google_sheets',
        operation: 'export',
        tableName: 'inventory_items',
        itemsAffected: 0,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        startedAt: startTime,
      });

      console.error('[GoogleSheetsSyncService] Export failed:', error);
      throw error;
    }
  }

  /**
   * Create automatic backup to Google Sheets
   */
  async createAutoBackup(): Promise<ExportResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_');
    const title = `MuRP Backup - ${timestamp}`;

    const result = await this.sheetsService.createSpreadsheet(title, ['Inventory', 'Vendors']);

    // Export inventory
    await this.exportInventory({
      spreadsheetId: result.spreadsheetId,
      sheetName: 'Inventory',
      includeHeaders: true,
      formatHeaders: true,
    });

    // Export vendors
    await this.exportVendors({
      spreadsheetId: result.spreadsheetId,
      sheetName: 'Vendors',
      includeHeaders: true,
      formatHeaders: true,
    });

    console.log(`[GoogleSheetsSyncService] Created automatic backup: ${result.spreadsheetUrl}`);

    return {
      success: true,
      itemsExported: 0, // Combined in the spreadsheet
      spreadsheetId: result.spreadsheetId,
      spreadsheetUrl: result.spreadsheetUrl,
    };
  }

  // ============================================================================
  // VENDOR IMPORT/EXPORT
  // ============================================================================

  /**
   * Export vendors to Google Sheets
   */
  async exportVendors(options: ExportOptions = {}): Promise<ExportResult> {
    const startTime = new Date();

    try {
      const { data: vendors, error } = await supabase
        .from('vendors')
        .select('*')
        .order('name');

      if (error) throw error;
      if (!vendors || vendors.length === 0) {
        throw new Error('No vendors to export');
      }

      const headers = [
        'Name', 'Contact Name', 'Email', 'Phone', 'Address',
        'City', 'State', 'ZIP', 'Country', 'Website',
        'Payment Terms', 'Lead Time (Days)', 'Minimum Order', 'Notes', 'Status'
      ];

      const rows = vendors.map(v => [
        v.name || '',
        v.contact_name || '',
        v.email || '',
        v.phone || '',
        v.address || '',
        v.city || '',
        v.state || '',
        v.zip_code || '',
        v.country || '',
        v.website || '',
        v.payment_terms || '',
        v.lead_time_days || 0,
        v.minimum_order_value || 0,
        v.notes || '',
        v.is_active ? 'Active' : 'Inactive',
      ]);

      const sheetData = options.includeHeaders !== false ? [headers, ...rows] : rows;

      let spreadsheetId = options.spreadsheetId;
      let spreadsheetUrl: string | undefined;

      if (!spreadsheetId) {
        const timestamp = new Date().toISOString().split('T')[0];
        const result = await this.sheetsService.createSpreadsheet(`MuRP Vendors - ${timestamp}`, ['Vendors']);
        spreadsheetId = result.spreadsheetId;
        spreadsheetUrl = result.spreadsheetUrl;
      }

      const sheetName = options.sheetName || 'Vendors';
      await this.sheetsService.writeSheet(spreadsheetId, `${sheetName}!A1`, sheetData, {
        valueInputOption: 'USER_ENTERED',
        clearExisting: options.clearExisting,
      });

      if (options.formatHeaders !== false) {
        const info = await this.sheetsService.getSpreadsheetInfo(spreadsheetId);
        const sheet = info.sheets.find(s => s.title === sheetName);
        if (sheet) {
          await this.sheetsService.formatHeaders(spreadsheetId, sheet.sheetId);
          await this.sheetsService.autoResizeColumns(spreadsheetId, sheet.sheetId);
        }
      }

      await this.logAudit({
        syncType: 'google_sheets',
        operation: 'export',
        tableName: 'vendors',
        itemsAffected: vendors.length,
        success: true,
        metadata: { spreadsheetId, sheetName },
        startedAt: startTime,
      });

      return {
        success: true,
        itemsExported: vendors.length,
        spreadsheetId,
        spreadsheetUrl,
      };
    } catch (error) {
      await this.logAudit({
        syncType: 'google_sheets',
        operation: 'export',
        tableName: 'vendors',
        itemsAffected: 0,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        startedAt: startTime,
      });
      throw error;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Auto-detect column mapping for inventory
   */
  private autoDetectInventoryColumns(headerRow: string[]): ColumnMapping {
    const mapping: ColumnMapping = {};

    const fieldPatterns: Record<string, RegExp[]> = {
      sku: [/^sku$/i, /^product\s*code$/i, /^item\s*code$/i],
      name: [/^name$/i, /^product\s*name$/i, /^item\s*name$/i, /^description$/i],
      description: [/^description$/i, /^details$/i],
      category: [/^category$/i, /^type$/i],
      quantity_on_hand: [/^quantity$/i, /^qty$/i, /^stock$/i, /^on\s*hand$/i],
      reorder_point: [/^reorder\s*point$/i, /^min\s*qty$/i],
      unit_cost: [/^cost$/i, /^unit\s*cost$/i, /^price$/i],
      unit_price: [/^price$/i, /^unit\s*price$/i, /^sell\s*price$/i],
      supplier_name: [/^supplier$/i, /^vendor$/i],
      upc: [/^upc$/i, /^barcode$/i, /^ean$/i],
    };

    headerRow.forEach((header, index) => {
      const normalizedHeader = header.trim();

      for (const [field, patterns] of Object.entries(fieldPatterns)) {
        if (patterns.some(pattern => pattern.test(normalizedHeader))) {
          mapping[field] = index;
        }
      }
    });

    return mapping;
  }

  /**
   * Parse inventory row from spreadsheet
   */
  private parseInventoryRow(row: any[], mapping: ColumnMapping): any {
    return {
      sku: row[mapping.sku] || '',
      name: row[mapping.name] || '',
      description: row[mapping.description] || '',
      category: row[mapping.category] || 'Uncategorized',
      quantity_on_hand: parseFloat(row[mapping.quantity_on_hand]) || 0,
      reorder_point: parseFloat(row[mapping.reorder_point]) || 0,
      reorder_quantity: parseFloat(row[mapping.reorder_quantity]) || 0,
      unit_cost: parseFloat(row[mapping.unit_cost]) || 0,
      unit_price: parseFloat(row[mapping.unit_price]) || 0,
      supplier_name: row[mapping.supplier_name] || '',
      upc: row[mapping.upc] || '',
      is_active: true,
      data_source: 'google-sheets',
      last_synced_at: new Date().toISOString(),
    };
  }

  /**
   * Log sync audit
   */
  private async logAudit(params: {
    syncType: 'google_sheets';
    operation: 'import' | 'export' | 'backup';
    tableName: string;
    itemsAffected: number;
    success: boolean;
    errorMessage?: string;
    metadata?: Record<string, any>;
    startedAt: Date;
  }): Promise<void> {
    try {
      const duration = Date.now() - params.startedAt.getTime();

      await supabase.from('sync_audit_log').insert({
        sync_type: params.syncType,
        operation: params.operation,
        table_name: params.tableName,
        items_affected: params.itemsAffected,
        success: params.success,
        error_message: params.errorMessage,
        sync_metadata: params.metadata || {},
        started_at: params.startedAt.toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: duration,
      });
    } catch (error) {
      console.warn('[GoogleSheetsSyncService] Failed to log audit:', error);
    }
  }
}

// Singleton instance
let googleSheetsSyncServiceInstance: GoogleSheetsSyncService | null = null;

export function getGoogleSheetsSyncService(): GoogleSheetsSyncService {
  if (!googleSheetsSyncServiceInstance) {
    googleSheetsSyncServiceInstance = new GoogleSheetsSyncService();
  }
  return googleSheetsSyncServiceInstance;
}
