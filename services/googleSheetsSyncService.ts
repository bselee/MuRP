/**
 * Google Sheets Sync Service
 *
 * Handles import/export of inventory data to/from Google Sheets
 * Provides automatic backups and collaborative data entry
 */

import { getGoogleSheetsService } from './googleSheetsService';
import { supabase } from '../lib/supabase/client';

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

      // Fetch ACTIVE inventory from database only
      const { data: inventory, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('is_active', true)  // CRITICAL: Only export active items
        .order('sku');

      if (error) {
        throw new Error(`Failed to fetch inventory: ${error.message}`);
      }

      if (!inventory || inventory.length === 0) {
        throw new Error('No inventory items to export');
      }

      console.log(`[GoogleSheetsSyncService] Exporting ${inventory.length} items`);

      // Prepare sheet data - ALL fields matching the comprehensive template
      const headers = [
        // Basic Info (A-D)
        'SKU', 'Name', 'Description', 'Category',
        // Pricing (E-G)
        'Unit Cost', 'Unit Price', 'Currency',
        // Stock & Reorder (H-L)
        'Stock Quantity', 'Reorder Point', 'MOQ', 'Reorder Method', 'Status',
        // Supplier (M-O)
        'Supplier SKU', 'UPC',
        // Physical (P-T)
        'Bin Location', 'Warehouse Location', 'Dimensions', 'Weight', 'Weight Unit',
        // Tracking (U-W)
        'Lot Tracking', 'Is Dropship', 'Item Flow Type',
        // Meta
        'Last Synced'
      ];

      const rows = inventory.map(item => [
        // Basic Info
        item.sku || '',
        item.name || '',
        item.description || '',
        item.category || '',
        // Pricing
        item.unit_cost || '',
        item.unit_price || '',
        item.currency || 'USD',
        // Stock & Reorder
        item.stock ?? item.units_in_stock ?? 0,
        item.reorder_point || '',
        item.moq || '',
        item.reorder_method || 'auto',
        item.status || (item.is_active ? 'active' : 'inactive'),
        // Supplier
        item.supplier_sku || '',
        item.upc || '',
        // Physical
        item.bin_location || '',
        item.warehouse_location || '',
        item.dimensions || '',
        item.weight || '',
        item.weight_unit || '',
        // Tracking
        item.lot_tracking ? 'TRUE' : 'FALSE',
        item.is_dropship ? 'TRUE' : 'FALSE',
        item.item_flow_type || 'standard',
        // Meta
        item.last_sync_at || item.updated_at || '',
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

  /**
   * Create comprehensive inventory template with ALL fields and detailed instructions
   * User requested: "all info available for user to fill in"
   */
  async createInventoryTemplate(options: {
    title: string;
    includeInstructions?: boolean;
    includeSampleData?: boolean;
  }): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
    try {
      console.log(`[GoogleSheetsSyncService] Creating comprehensive inventory template: ${options.title}`);

      // Create spreadsheet with multiple sheets
      const sheetTitles = ['Inventory', 'Instructions', 'Field Reference', 'Categories', 'Import Log'];
      const result = await this.sheetsService.createSpreadsheet(options.title, sheetTitles);

      // Sheet 1: Inventory Data - ALL FIELDS
      // Grouped logically: Basic Info | Pricing | Stock & Reorder | Supplier | Physical | Tracking
      const inventoryData = [
        // Instructions row
        ['COMPREHENSIVE INVENTORY TEMPLATE - All fields available. Required fields marked with *. Fill in what you need, leave others blank.'],
        ['Delete rows 1-2 before importing. Fields are grouped: Basic Info | Pricing | Stock & Reorder | Supplier | Physical | Tracking'],
        [''],
        // Main header - ALL USER-FILLABLE FIELDS
        [
          // Basic Info (A-D)
          'SKU *', 'Name *', 'Description', 'Category',
          // Pricing (E-G)
          'Unit Cost', 'Unit Price', 'Currency',
          // Stock & Reorder (H-L)
          'Stock Quantity', 'Reorder Point', 'MOQ', 'Reorder Method', 'Status',
          // Supplier (M-O)
          'Supplier Name', 'Supplier SKU', 'UPC',
          // Physical (P-T)
          'Bin Location', 'Warehouse Location', 'Dimensions', 'Weight', 'Weight Unit',
          // Tracking (U-W)
          'Lot Tracking', 'Is Dropship', 'Item Flow Type',
        ],
        // Sample data showing all fields
        [
          'ELEC-001', 'Arduino Uno R3', 'Microcontroller board for prototyping', 'Electronics',
          '18.50', '29.99', 'USD',
          '25', '5', '1', 'auto', 'active',
          'Adafruit', 'ADA-UNO-R3', '123456789012',
          'A1-01', 'Main Warehouse', '68x53x10mm', '25', 'g',
          'FALSE', 'FALSE', 'standard',
        ],
        [
          'ELEC-002', 'Raspberry Pi 4 Model B', 'Single-board computer with WiFi', 'Electronics',
          '35.00', '59.99', 'USD',
          '12', '3', '1', 'auto', 'active',
          'Raspberry Pi Foundation', 'RPI4-4GB', '123456789013',
          'A1-02', 'Main Warehouse', '85x56x17mm', '46', 'g',
          'FALSE', 'FALSE', 'standard',
        ],
        [
          'HW-001', 'M3 Machine Screws (100pk)', 'Stainless steel M3x10mm screws', 'Hardware',
          '4.50', '8.99', 'USD',
          '45', '10', '5', 'manual', 'active',
          'McMaster-Carr', '91292A113', '123456789016',
          'H1-05', 'Hardware Room', '10x10x5cm', '100', 'g',
          'TRUE', 'FALSE', 'standard',
        ],
        [
          'MAT-001', 'PLA Filament 1.75mm White', '3D printing filament, 1kg spool', 'Raw Materials',
          '22.99', '39.99', 'USD',
          '18', '3', '1', 'auto', 'active',
          'Prusa Research', 'PLA-175-WH-1KG', '123456789020',
          'F1-01', 'Filament Storage', '200x200x80mm', '1000', 'g',
          'TRUE', 'FALSE', 'standard',
        ],
        [
          'DROP-001', 'Premium Widget Pro', 'Drop-shipped premium product', 'Dropship',
          '45.00', '89.99', 'USD',
          '0', '0', '1', 'dropship', 'active',
          'Widget Supplier Co', 'WGT-PRO-001', '123456789030',
          '', '', '15x10x5cm', '250', 'g',
          'FALSE', 'TRUE', 'dropship',
        ],
        // Empty rows for user input (20 rows)
        ...Array(20).fill(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']),
      ];

      await this.sheetsService.writeSheet(result.spreadsheetId, 'Inventory!A1', inventoryData, {
        valueInputOption: 'USER_ENTERED',
      });

      // Sheet 2: Instructions
      const instructionsData = [
        ['📖 MuRP Comprehensive Inventory Import Guide'],
        [''],
        ['🎯 QUICK START'],
        ['1. Go to the "Inventory" sheet and fill in your products'],
        ['2. Only SKU and Name are required - fill other fields as needed'],
        ['3. Delete the instruction rows (rows 1-2) before importing'],
        ['4. Save your spreadsheet (Ctrl+S or Cmd+S)'],
        ['5. In MuRP: Settings → Google Sheets → Import Inventory'],
        ['6. Select this spreadsheet and click Import'],
        [''],
        ['📋 FIELD GROUPS'],
        [''],
        ['BASIC INFO (Columns A-D)'],
        ['• SKU *: Unique identifier for each product (required)'],
        ['• Name *: Product name (required)'],
        ['• Description: Detailed product description'],
        ['• Category: Product category for organization'],
        [''],
        ['PRICING (Columns E-G)'],
        ['• Unit Cost: Your purchase cost per unit'],
        ['• Unit Price: Your selling price per unit'],
        ['• Currency: Currency code (USD, EUR, GBP, etc.)'],
        [''],
        ['STOCK & REORDER (Columns H-L)'],
        ['• Stock Quantity: Current quantity on hand'],
        ['• Reorder Point: Stock level that triggers reorder alert'],
        ['• MOQ: Minimum Order Quantity from supplier'],
        ['• Reorder Method: "auto" (system suggests) or "manual"'],
        ['• Status: "active", "inactive", "discontinued", "deprecating"'],
        [''],
        ['SUPPLIER (Columns M-O)'],
        ['• Supplier Name: Primary vendor/supplier name'],
        ['• Supplier SKU: Vendor\'s product code/SKU'],
        ['• UPC: Universal Product Code (barcode)'],
        [''],
        ['PHYSICAL (Columns P-T)'],
        ['• Bin Location: Specific bin/shelf location (e.g., A1-01)'],
        ['• Warehouse Location: Warehouse/building name'],
        ['• Dimensions: Product dimensions (e.g., 10x5x3cm)'],
        ['• Weight: Product weight (number only)'],
        ['• Weight Unit: g, kg, oz, lb'],
        [''],
        ['TRACKING (Columns U-W)'],
        ['• Lot Tracking: TRUE/FALSE - track by lot/batch number'],
        ['• Is Dropship: TRUE/FALSE - shipped directly by supplier'],
        ['• Item Flow Type: standard, dropship, special_order, consignment'],
        [''],
        ['⚠️  IMPORTANT NOTES'],
        ['• Delete instruction rows before importing'],
        ['• SKU must be unique for each product'],
        ['• Numbers should be plain numbers (no $ or , symbols)'],
        ['• TRUE/FALSE values are case-insensitive'],
        ['• Empty cells are OK - they\'ll use defaults'],
        ['• Dropship items should have Is Dropship = TRUE'],
        [''],
        ['🔧 TROUBLESHOOTING'],
        ['• "Missing SKU": Every row needs a unique SKU'],
        ['• "Invalid number": Remove currency symbols from prices'],
        ['• "Duplicate SKU": Each SKU must be unique'],
        [''],
        ['📞 SUPPORT'],
        ['Questions? Settings → Help & Support in MuRP'],
      ];

      await this.sheetsService.writeSheet(result.spreadsheetId, 'Instructions!A1', instructionsData, {
        valueInputOption: 'USER_ENTERED',
      });

      // Sheet 3: Field Reference - detailed field documentation
      const fieldReferenceData = [
        ['📚 Complete Field Reference'],
        [''],
        ['Column', 'Field Name', 'Required', 'Type', 'Example', 'Notes'],
        ['A', 'SKU', 'Yes', 'Text', 'ELEC-001', 'Unique product identifier. Use consistent patterns.'],
        ['B', 'Name', 'Yes', 'Text', 'Arduino Uno R3', 'Product display name.'],
        ['C', 'Description', 'No', 'Text', 'Microcontroller board...', 'Detailed description for reference.'],
        ['D', 'Category', 'No', 'Text', 'Electronics', 'Product category. See Categories sheet.'],
        ['E', 'Unit Cost', 'No', 'Number', '18.50', 'Your purchase cost per unit. No currency symbol.'],
        ['F', 'Unit Price', 'No', 'Number', '29.99', 'Your selling price per unit. No currency symbol.'],
        ['G', 'Currency', 'No', 'Text', 'USD', 'Currency code: USD, EUR, GBP, CAD, etc.'],
        ['H', 'Stock Quantity', 'No', 'Number', '25', 'Current units in stock. Default: 0.'],
        ['I', 'Reorder Point', 'No', 'Number', '5', 'Stock level that triggers low-stock alert.'],
        ['J', 'MOQ', 'No', 'Number', '1', 'Minimum Order Quantity from supplier.'],
        ['K', 'Reorder Method', 'No', 'Text', 'auto', 'auto = system suggests, manual = you decide'],
        ['L', 'Status', 'No', 'Text', 'active', 'active, inactive, discontinued, deprecating'],
        ['M', 'Supplier Name', 'No', 'Text', 'Adafruit', 'Primary vendor/supplier name.'],
        ['N', 'Supplier SKU', 'No', 'Text', 'ADA-UNO-R3', 'Vendor\'s product code for ordering.'],
        ['O', 'UPC', 'No', 'Text', '123456789012', 'Universal Product Code (barcode).'],
        ['P', 'Bin Location', 'No', 'Text', 'A1-01', 'Specific shelf/bin location.'],
        ['Q', 'Warehouse Location', 'No', 'Text', 'Main Warehouse', 'Building/area name.'],
        ['R', 'Dimensions', 'No', 'Text', '68x53x10mm', 'Product dimensions (LxWxH).'],
        ['S', 'Weight', 'No', 'Number', '25', 'Product weight (number only).'],
        ['T', 'Weight Unit', 'No', 'Text', 'g', 'g, kg, oz, lb'],
        ['U', 'Lot Tracking', 'No', 'Boolean', 'FALSE', 'TRUE = track by lot/batch number.'],
        ['V', 'Is Dropship', 'No', 'Boolean', 'FALSE', 'TRUE = shipped directly by supplier.'],
        ['W', 'Item Flow Type', 'No', 'Text', 'standard', 'standard, dropship, special_order, consignment, made_to_order'],
        [''],
        ['💡 PRO TIPS'],
        ['• Start with just SKU, Name, and Stock Quantity'],
        ['• Add other fields gradually as needed'],
        ['• Use consistent SKU patterns (ELEC-001, HW-001)'],
        ['• Set Reorder Points for automatic low-stock alerts'],
        ['• Mark dropship items properly for Stock Intelligence'],
      ];

      await this.sheetsService.writeSheet(result.spreadsheetId, 'Field Reference!A1', fieldReferenceData, {
        valueInputOption: 'USER_ENTERED',
      });

      // Sheet 4: Categories
      const categoriesData = [
        ['📂 Suggested Inventory Categories'],
        [''],
        ['Category', 'Description', 'Example Items'],
        [''],
        ['Electronics', 'Electronic components and devices', 'Microcontrollers, sensors, displays'],
        ['Hardware', 'Mechanical parts and fasteners', 'Screws, bolts, brackets, tools'],
        ['Raw Materials', 'Base materials for production', 'Plastic, metal, fabric, chemicals'],
        ['Consumables', 'Items used up in production', 'Glue, solder, cleaning supplies'],
        ['Packaging', 'Shipping and packaging materials', 'Boxes, labels, bubble wrap'],
        ['Finished Goods', 'Completed products for sale', 'Assembled products, retail items'],
        ['Work in Progress', 'Partially assembled items', 'Sub-assemblies, in-production items'],
        ['Spare Parts', 'Replacement components', 'Repair parts, warranty stock'],
        ['Safety Equipment', 'PPE and safety gear', 'Gloves, goggles, first aid'],
        ['Office Supplies', 'General office items', 'Paper, pens, labels'],
        ['Dropship', 'Items shipped directly by supplier', 'Third-party fulfilled products'],
        ['Discontinued', 'Items being phased out', 'End-of-life products'],
        [''],
        ['💡 CUSTOM CATEGORIES'],
        ['Create categories that match your business:'],
        ['• By product line: Widgets, Gadgets, Premium'],
        ['• By department: Engineering, Production, QA'],
        ['• By supplier: Vendor A products, Vendor B products'],
      ];

      await this.sheetsService.writeSheet(result.spreadsheetId, 'Categories!A1', categoriesData, {
        valueInputOption: 'USER_ENTERED',
      });

      // Sheet 5: Import Log (empty for now)
      const logData = [
        ['📊 Import History Log'],
        [''],
        ['Date', 'Status', 'Items Imported', 'Items Skipped', 'Errors', 'Notes'],
        // Will be populated by import operations
      ];

      await this.sheetsService.writeSheet(result.spreadsheetId, 'Import Log!A1', logData, {
        valueInputOption: 'USER_ENTERED',
      });

      // Format all sheets
      const info = await this.sheetsService.getSpreadsheetInfo(result.spreadsheetId);

      for (const sheet of info.sheets) {
        await this.sheetsService.formatHeaders(result.spreadsheetId, sheet.sheetId, {
          bold: true,
          backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
          freeze: true,
        });
        await this.sheetsService.autoResizeColumns(result.spreadsheetId, sheet.sheetId);
      }

      // Note: Data validation (dropdowns) not currently supported by GoogleSheetsService
      // Users can still enter values manually - the Field Reference sheet documents valid options

      console.log(`[GoogleSheetsSyncService] Created comprehensive template: ${result.spreadsheetUrl}`);

      return {
        spreadsheetId: result.spreadsheetId,
        spreadsheetUrl: result.spreadsheetUrl,
      };
    } catch (error) {
      console.error('[GoogleSheetsSyncService] Failed to create comprehensive template:', error);
      throw error;
    }
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
        'Name', 'Contact Emails', 'Phone', 'Address',
        'City', 'State', 'Postal Code', 'Country', 'Website',
        'Lead Time (Days)', 'Notes', 'Status'
      ];

      const rows = vendors.map(v => [
        v.name || '',
        (v.contact_emails || []).join(', '),
        v.phone || '',
        v.address || v.address_line1 || '',
        v.city || '',
        v.state || '',
        v.postal_code || '',
        v.country || '',
        v.website || '',
        v.lead_time_days || '',
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
   * Auto-detect column mapping for inventory - supports ALL fields
   */
  private autoDetectInventoryColumns(headerRow: string[]): ColumnMapping {
    const mapping: ColumnMapping = {};

    // Comprehensive field patterns matching the new template structure
    const fieldPatterns: Record<string, RegExp[]> = {
      // Basic Info (A-D)
      sku: [/^sku\s*\*?$/i, /^product\s*code$/i, /^item\s*code$/i, /^item\s*id$/i],
      name: [/^name\s*\*?$/i, /^product\s*name$/i, /^item\s*name$/i, /^title$/i],
      description: [/^description$/i, /^details$/i, /^desc$/i],
      category: [/^category$/i, /^type$/i, /^product\s*type$/i],

      // Pricing (E-G)
      unit_cost: [/^unit\s*cost$/i, /^cost$/i, /^purchase\s*price$/i, /^buy\s*price$/i],
      unit_price: [/^unit\s*price$/i, /^price$/i, /^sell\s*price$/i, /^retail\s*price$/i],
      currency: [/^currency$/i, /^curr$/i],

      // Stock & Reorder (H-L)
      stock: [/^stock\s*quantity$/i, /^quantity$/i, /^qty$/i, /^stock$/i, /^on\s*hand$/i, /^units\s*in\s*stock$/i],
      reorder_point: [/^reorder\s*point$/i, /^min\s*qty$/i, /^min\s*stock$/i, /^rop$/i],
      moq: [/^moq$/i, /^minimum\s*order$/i, /^min\s*order\s*qty$/i],
      reorder_method: [/^reorder\s*method$/i, /^reorder\s*type$/i],
      status: [/^status$/i, /^item\s*status$/i, /^active$/i],

      // Supplier (M-O)
      supplier_name: [/^supplier\s*name$/i, /^supplier$/i, /^vendor$/i, /^vendor\s*name$/i],
      supplier_sku: [/^supplier\s*sku$/i, /^vendor\s*sku$/i, /^mfr\s*part$/i, /^manufacturer\s*sku$/i],
      upc: [/^upc$/i, /^barcode$/i, /^ean$/i, /^gtin$/i],

      // Physical (P-T)
      bin_location: [/^bin\s*location$/i, /^bin$/i, /^shelf$/i, /^location$/i],
      warehouse_location: [/^warehouse\s*location$/i, /^warehouse$/i, /^building$/i],
      dimensions: [/^dimensions$/i, /^size$/i, /^dim$/i],
      weight: [/^weight$/i, /^wt$/i],
      weight_unit: [/^weight\s*unit$/i, /^wt\s*unit$/i],

      // Tracking (U-W)
      lot_tracking: [/^lot\s*tracking$/i, /^lot$/i, /^batch\s*tracking$/i],
      is_dropship: [/^is\s*dropship$/i, /^dropship$/i, /^drop\s*ship$/i],
      item_flow_type: [/^item\s*flow\s*type$/i, /^flow\s*type$/i, /^order\s*type$/i],
    };

    headerRow.forEach((header, index) => {
      const normalizedHeader = header.trim().replace(/\*$/, '').trim(); // Remove trailing asterisks

      for (const [field, patterns] of Object.entries(fieldPatterns)) {
        if (patterns.some(pattern => pattern.test(normalizedHeader))) {
          mapping[field] = index;
        }
      }
    });

    return mapping;
  }

  /**
   * Parse inventory row from spreadsheet - handles ALL fields from comprehensive template
   */
  private parseInventoryRow(row: any[], mapping: ColumnMapping): any {
    // Helper to safely get value at index
    const getValue = (field: string): string => {
      const idx = mapping[field];
      return idx !== undefined && row[idx] !== undefined ? String(row[idx]).trim() : '';
    };

    // Helper to parse number
    const getNumber = (field: string): number | null => {
      const val = getValue(field);
      if (!val) return null;
      const num = parseFloat(val.replace(/[,$]/g, '')); // Remove currency symbols
      return isNaN(num) ? null : num;
    };

    // Helper to parse boolean
    const getBoolean = (field: string): boolean | null => {
      const val = getValue(field).toLowerCase();
      if (!val) return null;
      if (['true', 'yes', '1', 'y'].includes(val)) return true;
      if (['false', 'no', '0', 'n'].includes(val)) return false;
      return null;
    };

    // Build inventory item with all fields
    const item: Record<string, any> = {
      // Required fields
      sku: getValue('sku'),
      name: getValue('name') || getValue('sku'), // Fallback to SKU if no name

      // Basic info
      description: getValue('description') || null,
      category: getValue('category') || null,

      // Pricing
      unit_cost: getNumber('unit_cost'),
      unit_price: getNumber('unit_price'),
      currency: getValue('currency') || null,

      // Stock & Reorder
      stock: getNumber('stock') ?? 0,
      reorder_point: getNumber('reorder_point'),
      moq: getNumber('moq'),
      reorder_method: getValue('reorder_method') || null,
      status: getValue('status') || 'active',

      // Supplier
      supplier_sku: getValue('supplier_sku') || null,
      upc: getValue('upc') || null,

      // Physical
      bin_location: getValue('bin_location') || null,
      warehouse_location: getValue('warehouse_location') || null,
      dimensions: getValue('dimensions') || null,
      weight: getNumber('weight'),
      weight_unit: getValue('weight_unit') || null,

      // Tracking
      lot_tracking: getBoolean('lot_tracking'),
      is_dropship: getBoolean('is_dropship'),
      item_flow_type: getValue('item_flow_type') || null,

      // System fields
      is_active: true,
      data_source: 'google-sheets',
      last_sync_at: new Date().toISOString(),
    };

    // Clean up null/undefined values to use database defaults
    Object.keys(item).forEach(key => {
      if (item[key] === null || item[key] === undefined || item[key] === '') {
        delete item[key];
      }
    });

    // Always keep required fields
    item.sku = item.sku || '';
    item.name = item.name || item.sku || '';
    item.is_active = true;
    item.data_source = 'google-sheets';
    item.last_sync_at = new Date().toISOString();

    return item;
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
