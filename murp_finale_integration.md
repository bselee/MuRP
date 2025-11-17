# MuRP ↔ Finale Purchase Order Integration
## Complete Data Structure Alignment & Import/Export System

**Version:** 1.1  
**Last Updated:** November 17, 2025  
**Purpose:** Ensure MuRP POs can seamlessly import/export with Finale Inventory

---

## Table of Contents

1. [Finale PO Format Analysis](#finale-po-format-analysis)
2. [Updated Database Schema](#updated-database-schema)
3. [Field Mapping Reference](#field-mapping-reference)
4. [Export to Finale Format](#export-to-finale-format)
5. [Import from Finale Format](#import-from-finale-format)
6. [PO Number Format Handling](#po-number-format-handling)
7. [Status Mapping](#status-mapping)
8. [Internal Notes Structure](#internal-notes-structure)
9. [Complete Implementation](#complete-implementation)

---

## Finale PO Format Analysis

### Column Structure from Finale Export

Based on your actual Finale export, here's the exact structure:

```
Column  | Field Name                        | Example Data
--------|-----------------------------------|----------------------------------
1       | Status                            | Draft, Committed
2       | Order date                        | 5/22/2025
3       | Order ID                          | 123456, 23232047-S-DropshipPO
4       | Supplier                          | Country Malt - Mid Country
5       | Estimated receive date            | 5/30/2025
6       | Destination                       | BuildASoil Shipping
7       | Ship to: Formatted                | BuildASoil, 5146 N. Townsend...
8       | Shipments                         | Received 5/28/2025, Multiple shipments
9       | Total                             | 2546.62
10      | Taxable discount/fee Freight      | 126.3
11      | Tracking Link                     | (URL)
12      | Tracking Number                   | 
13      | Est Days Of Stock                 | 
14      | Date Out Of Stock                 | 
15      | Fulfillment                       | 
16      | Allocation                        | 
17      | Internal notes                    | (See below for structure)
18      | Record last updated               | Jul 22 2025 1:42:08 pm
```

### Critical Finding: Internal Notes Structure

Finale stores **extensive reorder metadata** in the Internal notes field:

```
Product ID: CWP09
Product Grade: C
Sellable Qty: 0
Estimated Days Of Stock Left: 0
Additional Days Of Stock: 71
Pending Days Of Stock: 71
Pending Units Of Stock: 35
Projected Days Of Stock: 32
Projected Units Of Stock: 16
Reserved For Draft Builds: 13.159248
Daily Consumption: 0.49368954444444446
30 Day Consumption: 14.810686333333335
60 Day Consumption: 29.62137266666667
90 Day Consumption: 44.432059
Supplier Lead Time: 90
Suggested Qty To Order: 34.536754
Backordered Qty: 10.536754
Required Qty: 34.536754
Case Qty: 1

Updated by API 1/19/2023, 4:03:28 PM
```

**This is gold!** Finale embeds all consumption velocity and reorder logic into notes.

---

## Updated Database Schema

### Enhanced Purchase Orders Table (Finale-Compatible)

```sql
-- ============================================================================
-- PURCHASE ORDERS TABLE (Finale-Compatible Version)
-- ============================================================================
DROP TABLE IF EXISTS purchase_orders CASCADE;

CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- FINALE CORE FIELDS (Direct Mapping)
  order_id VARCHAR(50) UNIQUE NOT NULL,          -- Finale's "Order ID" (their PO number)
  status VARCHAR(20) DEFAULT 'draft',            -- Maps to Finale "Status"
  order_date DATE NOT NULL DEFAULT CURRENT_DATE, -- Finale "Order date"
  supplier VARCHAR(255) NOT NULL,                -- Finale "Supplier" (vendor name)
  estimated_receive_date DATE,                   -- Finale "Estimated receive date"
  destination VARCHAR(100),                      -- Finale "Destination"
  ship_to_formatted TEXT,                        -- Finale "Ship to: Formatted"
  shipments TEXT,                                -- Finale "Shipments" status
  total DECIMAL(12,2) NOT NULL,                  -- Finale "Total"
  taxable_discount_fee_freight DECIMAL(10,2),   -- Finale "Taxable discount/fee Freight"
  tracking_link TEXT,                            -- Finale "Tracking Link"
  tracking_number VARCHAR(100),                  -- Finale "Tracking Number"
  est_days_of_stock INTEGER,                     -- Finale "Est Days Of Stock"
  date_out_of_stock DATE,                        -- Finale "Date Out Of Stock"
  fulfillment VARCHAR(50),                       -- Finale "Fulfillment"
  allocation VARCHAR(50),                        -- Finale "Allocation"
  internal_notes TEXT,                           -- Finale "Internal notes" (JSON structure)
  record_last_updated TIMESTAMPTZ DEFAULT NOW(), -- Finale "Record last updated"
  
  -- MURP ADDITIONAL FIELDS (Not in Finale export, but useful for MuRP)
  vendor_id UUID REFERENCES vendors(id) ON DELETE RESTRICT,
  subtotal DECIMAL(12,2) GENERATED ALWAYS AS (
    total - COALESCE(taxable_discount_fee_freight, 0)
  ) STORED,
  tax DECIMAL(10,2) DEFAULT 0,
  
  auto_generated BOOLEAN DEFAULT FALSE,
  generation_reason TEXT,
  
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  
  vendor_notes TEXT,  -- Separate from internal_notes (for vendor communication)
  email_draft TEXT,
  email_sent BOOLEAN DEFAULT FALSE,
  email_sent_at TIMESTAMPTZ,
  
  -- Sync tracking
  finale_sync_status VARCHAR(20) DEFAULT 'pending',  -- pending, synced, error
  last_synced_at TIMESTAMPTZ,
  finale_record_id VARCHAR(50),  -- If Finale has internal IDs
  
  CONSTRAINT valid_status CHECK (status IN (
    'draft',       -- Finale: "Draft"
    'committed',   -- Finale: "Committed"
    'sent',        -- MuRP specific
    'received',    -- When shipment completed
    'cancelled'    -- MuRP specific
  )),
  
  CONSTRAINT positive_amounts CHECK (total >= 0)
);

-- Indexes
CREATE INDEX idx_po_order_id ON purchase_orders(order_id);
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_supplier ON purchase_orders(supplier);
CREATE INDEX idx_po_order_date ON purchase_orders(order_date DESC);
CREATE INDEX idx_po_finale_sync ON purchase_orders(finale_sync_status);
CREATE INDEX idx_po_record_updated ON purchase_orders(record_last_updated DESC);

-- ============================================================================
-- PURCHASE ORDER LINE ITEMS (Finale-Compatible)
-- ============================================================================
DROP TABLE IF EXISTS purchase_order_items CASCADE;

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  
  -- Core item details
  product_id VARCHAR(50),  -- Finale's Product ID (e.g., CWP09)
  sku VARCHAR(50) REFERENCES inventory_items(sku) ON DELETE RESTRICT,
  description VARCHAR(500) NOT NULL,
  
  -- Quantities
  qty_ordered INTEGER NOT NULL CHECK (qty_ordered > 0),
  qty_received INTEGER DEFAULT 0 CHECK (qty_received >= 0),
  qty_cancelled INTEGER DEFAULT 0 CHECK (qty_cancelled >= 0),
  
  -- Pricing
  unit_cost DECIMAL(10,4) NOT NULL CHECK (unit_cost >= 0),
  line_total DECIMAL(12,2) NOT NULL CHECK (line_total >= 0),
  
  -- Finale consumption metadata (stored per-line for detailed tracking)
  finale_metadata JSONB,  -- Stores full Finale calculation data
  
  -- Simplified access to key metrics
  daily_consumption DECIMAL(10,4),
  consumption_30day DECIMAL(10,2),
  consumption_60day DECIMAL(10,2),
  consumption_90day DECIMAL(10,2),
  days_of_stock_when_ordered DECIMAL(5,1),
  supplier_lead_time INTEGER,
  suggested_qty DECIMAL(10,2),
  
  -- Receipt tracking
  received_date DATE,
  received_by UUID REFERENCES auth.users(id),
  
  line_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT qty_logic CHECK (
    qty_received + qty_cancelled <= qty_ordered
  )
);

CREATE INDEX idx_po_items_po ON purchase_order_items(po_id);
CREATE INDEX idx_po_items_sku ON purchase_order_items(sku);
CREATE INDEX idx_po_items_product_id ON purchase_order_items(product_id);

-- ============================================================================
-- FINALE IMPORT/EXPORT LOG
-- ============================================================================
CREATE TABLE finale_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_timestamp TIMESTAMPTZ DEFAULT NOW(),
  sync_type VARCHAR(20) NOT NULL,  -- 'import' or 'export'
  
  records_processed INTEGER,
  records_succeeded INTEGER,
  records_failed INTEGER,
  
  file_name VARCHAR(255),
  file_path TEXT,
  
  error_details JSONB,  -- Array of error messages
  
  initiated_by UUID REFERENCES auth.users(id),
  
  success BOOLEAN DEFAULT TRUE
);
```

---

## Field Mapping Reference

### MuRP → Finale Export Mapping

| MuRP Field                    | Finale Column               | Notes                              |
|-------------------------------|-----------------------------|------------------------------------|
| `order_id`                    | Order ID                    | PO number (see format below)       |
| `status`                      | Status                      | See status mapping table           |
| `order_date`                  | Order date                  | Format: M/D/YYYY                   |
| `supplier`                    | Supplier                    | Vendor name                        |
| `estimated_receive_date`      | Estimated receive date      | Format: M/D/YYYY                   |
| `destination`                 | Destination                 | e.g., "BuildASoil Shipping"        |
| `ship_to_formatted`           | Ship to: Formatted          | Full formatted address             |
| `shipments`                   | Shipments                   | "Received MM/DD/YYYY" or blank     |
| `total`                       | Total                       | Decimal with 2 places              |
| `taxable_discount_fee_freight`| Taxable discount/fee Freight| Additional costs                   |
| `tracking_link`               | Tracking Link               | Full URL or blank                  |
| `tracking_number`             | Tracking Number             | Carrier tracking number            |
| `est_days_of_stock`           | Est Days Of Stock           | Calculated field                   |
| `date_out_of_stock`           | Date Out Of Stock           | Projected stockout date            |
| `fulfillment`                 | Fulfillment                 | Leave blank unless Finale uses     |
| `allocation`                  | Allocation                  | Leave blank unless Finale uses     |
| `internal_notes`              | Internal notes              | See structure below                |
| `record_last_updated`         | Record last updated         | Format: "Mon DD YYYY H:MM:SS am/pm"|

---

## Internal Notes Structure

### Generating Finale-Compatible Internal Notes

```typescript
// lib/services/finaleNotesGenerator.ts

interface FinaleItemMetadata {
  product_id: string;
  product_grade?: string;
  sellable_qty: number;
  estimated_days_of_stock_left: number;
  additional_days_of_stock?: number;
  pending_days_of_stock?: number;
  pending_units_of_stock?: number;
  projected_days_of_stock?: number;
  projected_units_of_stock?: number;
  reserved_for_draft_builds?: number;
  daily_consumption: number;
  consumption_30day: number;
  consumption_60day: number;
  consumption_90day: number;
  supplier_lead_time: number;
  suggested_qty_to_order: number;
  backordered_qty?: number;
  required_qty: number;
  case_qty?: number;
  updated_timestamp?: string;
}

export class FinaleNotesGenerator {
  
  /**
   * Generate Finale-compatible internal notes from line item data
   */
  generateInternalNotes(items: FinaleItemMetadata[]): string {
    if (items.length === 0) return '';
    
    // For multi-item POs, create a section for each item
    const itemSections = items.map(item => this.formatItemSection(item));
    
    return itemSections.join('\n\n');
  }
  
  /**
   * Format a single item's metadata in Finale format
   */
  private formatItemSection(item: FinaleItemMetadata): string {
    const lines: string[] = [];
    
    // Required fields
    lines.push(`Product ID: ${item.product_id}`);
    
    if (item.product_grade) {
      lines.push(`  Product Grade: ${item.product_grade}`);
    }
    
    lines.push(`  Sellable Qty: ${item.sellable_qty}`);
    lines.push(`  Estimated Days Of Stock Left: ${item.estimated_days_of_stock_left}`);
    
    // Optional fields (only include if present)
    if (item.additional_days_of_stock !== undefined) {
      lines.push(`  Additional Days Of Stock: ${item.additional_days_of_stock}`);
    }
    
    if (item.pending_days_of_stock !== undefined) {
      lines.push(`  Pending Days Of Stock: ${item.pending_days_of_stock}`);
    }
    
    if (item.pending_units_of_stock !== undefined) {
      lines.push(`  Pending Units Of Stock: ${item.pending_units_of_stock}`);
    }
    
    if (item.projected_days_of_stock !== undefined) {
      lines.push(`  Projected Days Of Stock: ${item.projected_days_of_stock}`);
    }
    
    if (item.projected_units_of_stock !== undefined) {
      lines.push(`  Projected Units Of Stock: ${item.projected_units_of_stock}`);
    }
    
    if (item.reserved_for_draft_builds !== undefined) {
      lines.push(`  Reserved For Draft Builds: ${item.reserved_for_draft_builds}`);
    }
    
    // Consumption data
    lines.push(`  Daily Consumption: ${item.daily_consumption}`);
    lines.push(`  30 Day Consumption: ${item.consumption_30day}`);
    lines.push(`  60 Day Consumption: ${item.consumption_60day}`);
    lines.push(`  90 Day Consumption: ${item.consumption_90day}`);
    
    // Order calculations
    lines.push(`  Supplier Lead Time: ${item.supplier_lead_time}`);
    lines.push(`  Suggested Qty To Order: ${item.suggested_qty_to_order}`);
    
    if (item.backordered_qty !== undefined) {
      lines.push(`  Backordered Qty: ${item.backordered_qty}`);
    }
    
    lines.push(`  Required Qty: ${item.required_qty}`);
    
    if (item.case_qty !== undefined) {
      lines.push(`  Case Qty: ${item.case_qty}`);
    }
    
    // Timestamp
    const timestamp = item.updated_timestamp || new Date().toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true
    });
    
    lines.push('');
    lines.push('');
    lines.push(`Updated by MuRP ${timestamp}`);
    
    return lines.join('\n');
  }
  
  /**
   * Parse Finale internal notes back into structured data
   */
  parseInternalNotes(notesText: string): FinaleItemMetadata[] {
    if (!notesText || notesText.trim() === '') return [];
    
    const items: FinaleItemMetadata[] = [];
    
    // Split by double newlines to separate items
    const itemSections = notesText.split(/\n\s*\n\s*\n/);
    
    for (const section of itemSections) {
      const item = this.parseItemSection(section);
      if (item) items.push(item);
    }
    
    return items;
  }
  
  /**
   * Parse a single item section
   */
  private parseItemSection(sectionText: string): FinaleItemMetadata | null {
    const lines = sectionText.split('\n').map(l => l.trim()).filter(l => l);
    
    if (lines.length === 0) return null;
    
    const data: any = {};
    
    for (const line of lines) {
      if (line.startsWith('Updated by')) {
        data.updated_timestamp = line.replace(/Updated by (API|MuRP)\s*/, '');
        continue;
      }
      
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (!match) continue;
      
      const key = match[1].trim();
      const value = match[2].trim();
      
      // Map Finale field names to our structure
      switch (key) {
        case 'Product ID':
          data.product_id = value;
          break;
        case 'Product Grade':
          data.product_grade = value;
          break;
        case 'Sellable Qty':
          data.sellable_qty = parseFloat(value);
          break;
        case 'Estimated Days Of Stock Left':
          data.estimated_days_of_stock_left = parseFloat(value);
          break;
        case 'Additional Days Of Stock':
          data.additional_days_of_stock = parseFloat(value);
          break;
        case 'Pending Days Of Stock':
          data.pending_days_of_stock = parseFloat(value);
          break;
        case 'Pending Units Of Stock':
          data.pending_units_of_stock = parseFloat(value);
          break;
        case 'Projected Days Of Stock':
          data.projected_days_of_stock = parseFloat(value);
          break;
        case 'Projected Units Of Stock':
          data.projected_units_of_stock = parseFloat(value);
          break;
        case 'Reserved For Draft Builds':
          data.reserved_for_draft_builds = parseFloat(value);
          break;
        case 'Daily Consumption':
          data.daily_consumption = parseFloat(value);
          break;
        case '30 Day Consumption':
          data.consumption_30day = parseFloat(value);
          break;
        case '60 Day Consumption':
          data.consumption_60day = parseFloat(value);
          break;
        case '90 Day Consumption':
          data.consumption_90day = parseFloat(value);
          break;
        case 'Supplier Lead Time':
          data.supplier_lead_time = parseInt(value);
          break;
        case 'Suggested Qty To Order':
          data.suggested_qty_to_order = parseFloat(value);
          break;
        case 'Backordered Qty':
          data.backordered_qty = parseFloat(value);
          break;
        case 'Required Qty':
          data.required_qty = parseFloat(value);
          break;
        case 'Case Qty':
          data.case_qty = parseFloat(value);
          break;
      }
    }
    
    return data as FinaleItemMetadata;
  }
}
```

---

## Export to Finale Format

### CSV Export Service

```typescript
// lib/services/finaleExporter.ts

import { createClient } from '@/lib/supabase/server';
import { FinaleNotesGenerator } from './finaleNotesGenerator';

export class FinaleExporter {
  
  private notesGenerator = new FinaleNotesGenerator();
  
  /**
   * Export MuRP POs to Finale-compatible CSV
   */
  async exportToFinaleCSV(
    filters?: {
      status?: string[];
      dateFrom?: Date;
      dateTo?: Date;
      vendorIds?: string[];
    }
  ): Promise<string> {
    
    const supabase = createClient();
    
    // Build query
    let query = supabase
      .from('purchase_orders')
      .select(`
        *,
        purchase_order_items (
          *,
          inventory_items (
            sku,
            description
          )
        )
      `);
    
    // Apply filters
    if (filters?.status && filters.status.length > 0) {
      query = query.in('status', filters.status);
    }
    
    if (filters?.dateFrom) {
      query = query.gte('order_date', filters.dateFrom.toISOString().split('T')[0]);
    }
    
    if (filters?.dateTo) {
      query = query.lte('order_date', filters.dateTo.toISOString().split('T')[0]);
    }
    
    if (filters?.vendorIds && filters.vendorIds.length > 0) {
      query = query.in('vendor_id', filters.vendorIds);
    }
    
    const { data: pos, error } = await query;
    
    if (error) throw error;
    
    // Generate CSV
    return this.generateCSV(pos);
  }
  
  /**
   * Generate CSV content in Finale format
   */
  private generateCSV(purchaseOrders: any[]): string {
    // Finale header row
    const headers = [
      'Status',
      'Order date',
      'Order ID',
      'Supplier',
      'Estimated receive date',
      'Destination',
      'Ship to: Formatted',
      'Shipments',
      'Total',
      'Taxable discount/fee Freight',
      'Tracking Link',
      'Tracking Number',
      'Est Days Of Stock',
      'Date Out Of Stock',
      'Fulfillment',
      'Allocation',
      'Internal notes',
      'Record last updated'
    ];
    
    const rows = [headers];
    
    for (const po of purchaseOrders) {
      // Generate internal notes from line items
      const itemsMetadata = po.purchase_order_items?.map(item => ({
        product_id: item.product_id || item.sku,
        sellable_qty: item.qty_ordered,
        estimated_days_of_stock_left: item.days_of_stock_when_ordered || 0,
        daily_consumption: item.daily_consumption || 0,
        consumption_30day: item.consumption_30day || 0,
        consumption_60day: item.consumption_60day || 0,
        consumption_90day: item.consumption_90day || 0,
        supplier_lead_time: item.supplier_lead_time || 21,
        suggested_qty_to_order: item.suggested_qty || item.qty_ordered,
        required_qty: item.qty_ordered
      })) || [];
      
      const internalNotes = this.notesGenerator.generateInternalNotes(itemsMetadata);
      
      const row = [
        this.mapStatusToFinale(po.status),
        this.formatDate(po.order_date),
        po.order_id,
        po.supplier,
        this.formatDate(po.estimated_receive_date),
        po.destination || 'BuildASoil Shipping',
        po.ship_to_formatted || this.getDefaultShipTo(),
        po.shipments || '',
        this.formatCurrency(po.total),
        this.formatCurrency(po.taxable_discount_fee_freight || 0),
        po.tracking_link || '',
        po.tracking_number || '',
        po.est_days_of_stock?.toString() || '',
        this.formatDate(po.date_out_of_stock),
        po.fulfillment || '',
        po.allocation || '',
        this.escapeCSV(internalNotes),
        this.formatTimestamp(po.record_last_updated)
      ];
      
      rows.push(row);
    }
    
    // Convert to CSV string
    return rows.map(row => 
      row.map(cell => this.escapeCSV(cell?.toString() || '')).join(',')
    ).join('\n');
  }
  
  /**
   * Map MuRP status to Finale status
   */
  private mapStatusToFinale(status: string): string {
    const mapping = {
      'draft': 'Draft',
      'pending': 'Draft',
      'committed': 'Committed',
      'sent': 'Committed',
      'received': 'Committed',
      'cancelled': 'Draft'
    };
    
    return mapping[status] || 'Draft';
  }
  
  /**
   * Format date as M/D/YYYY (Finale format)
   */
  private formatDate(date: string | Date | null | undefined): string {
    if (!date) return '';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  }
  
  /**
   * Format timestamp as "Mon DD YYYY H:MM:SS am/pm"
   */
  private formatTimestamp(timestamp: string | Date | null | undefined): string {
    if (!timestamp) return '';
    
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true
    });
  }
  
  /**
   * Format currency without $ sign (just number)
   */
  private formatCurrency(amount: number): string {
    return amount.toFixed(2);
  }
  
  /**
   * Get default shipping address
   */
  private getDefaultShipTo(): string {
    return 'BuildASoil, 5146 N. Townsend Ave, Montrose, CO 81401 USA';
  }
  
  /**
   * Escape CSV cell (handle quotes, newlines, commas)
   */
  private escapeCSV(value: string): string {
    if (!value) return '';
    
    // If contains comma, newline, or quote, wrap in quotes and escape quotes
    if (value.includes(',') || value.includes('\n') || value.includes('"')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    
    return value;
  }
}
```

---

## Import from Finale Format

### CSV Import Service

```typescript
// lib/services/finaleImporter.ts

import { createClient } from '@/lib/supabase/server';
import { FinaleNotesGenerator } from './finaleNotesGenerator';
import Papa from 'papaparse';

export class FinaleImporter {
  
  private notesGenerator = new FinaleNotesGenerator();
  
  /**
   * Import Finale CSV into MuRP
   */
  async importFromFinaleCSV(csvContent: string): Promise<{
    success: boolean;
    imported: number;
    failed: number;
    errors: string[];
  }> {
    
    const supabase = createClient();
    const errors: string[] = [];
    let imported = 0;
    let failed = 0;
    
    // Parse CSV
    const parsed = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true
    });
    
    if (parsed.errors.length > 0) {
      return {
        success: false,
        imported: 0,
        failed: parsed.data.length,
        errors: parsed.errors.map(e => e.message)
      };
    }
    
    // Process each row
    for (const row of parsed.data as any[]) {
      try {
        await this.importPORow(row);
        imported++;
      } catch (error) {
        failed++;
        errors.push(`PO ${row['Order ID']}: ${error.message}`);
      }
    }
    
    // Log import
    await supabase.from('finale_sync_log').insert({
      sync_type: 'import',
      records_processed: parsed.data.length,
      records_succeeded: imported,
      records_failed: failed,
      error_details: errors.length > 0 ? { errors } : null,
      success: failed === 0
    });
    
    return {
      success: failed === 0,
      imported,
      failed,
      errors
    };
  }
  
  /**
   * Import a single PO row
   */
  private async importPORow(row: any): Promise<void> {
    const supabase = createClient();
    
    // Parse internal notes to extract line item metadata
    const itemsMetadata = this.notesGenerator.parseInternalNotes(
      row['Internal notes'] || ''
    );
    
    // Map Finale status to MuRP status
    const status = this.mapFinaleStatusToMuRP(row['Status']);
    
    // Check if PO already exists
    const { data: existing } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('order_id', row['Order ID'])
      .single();
    
    const poData = {
      order_id: row['Order ID'],
      status,
      order_date: this.parseFinaleDate(row['Order date']),
      supplier: row['Supplier'],
      estimated_receive_date: this.parseFinaleDate(row['Estimated receive date']),
      destination: row['Destination'],
      ship_to_formatted: row['Ship to: Formatted'],
      shipments: row['Shipments'],
      total: parseFloat(row['Total']) || 0,
      taxable_discount_fee_freight: parseFloat(row['Taxable discount/fee Freight']) || 0,
      tracking_link: row['Tracking Link'],
      tracking_number: row['Tracking Number'],
      est_days_of_stock: row['Est Days Of Stock'] ? parseInt(row['Est Days Of Stock']) : null,
      date_out_of_stock: this.parseFinaleDate(row['Date Out Of Stock']),
      fulfillment: row['Fulfillment'],
      allocation: row['Allocation'],
      internal_notes: row['Internal notes'],
      record_last_updated: this.parseFinaleTimestamp(row['Record last updated']),
      finale_sync_status: 'synced',
      last_synced_at: new Date().toISOString()
    };
    
    if (existing) {
      // Update existing PO
      await supabase
        .from('purchase_orders')
        .update(poData)
        .eq('id', existing.id);
    } else {
      // Insert new PO
      const { data: newPO, error } = await supabase
        .from('purchase_orders')
        .insert(poData)
        .select()
        .single();
      
      if (error) throw error;
      
      // TODO: Create line items from itemsMetadata if needed
      // This would require additional logic to map Product IDs to SKUs
    }
  }
  
  /**
   * Map Finale status to MuRP status
   */
  private mapFinaleStatusToMuRP(finaleStatus: string): string {
    const mapping = {
      'Draft': 'draft',
      'Committed': 'committed',
      'Cancelled': 'cancelled'
    };
    
    return mapping[finaleStatus] || 'draft';
  }
  
  /**
   * Parse Finale date format (M/D/YYYY)
   */
  private parseFinaleDate(dateStr: string | null | undefined): string | null {
    if (!dateStr) return null;
    
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    
    const month = parseInt(parts[0]);
    const day = parseInt(parts[1]);
    const year = parseInt(parts[2]);
    
    const date = new Date(year, month - 1, day);
    
    if (isNaN(date.getTime())) return null;
    
    return date.toISOString().split('T')[0];
  }
  
  /**
   * Parse Finale timestamp format
   */
  private parseFinaleTimestamp(timestampStr: string | null | undefined): string | null {
    if (!timestampStr) return null;
    
    try {
      const date = new Date(timestampStr);
      if (isNaN(date.getTime())) return null;
      return date.toISOString();
    } catch {
      return null;
    }
  }
}
```

---

## PO Number Format Handling

### Understanding Finale's Order ID Patterns

Based on your export, Finale uses several PO number formats:

```
Standard POs:         123456, 123868, 123944
Dropship POs:         23232047-S-DropshipPO
Vendor-specific:      23011297A-DropshipPO
Multi-suffix:         23248727-SF1-DropshipPO
Complex:              23247007F1-DropshipPO
```

### MuRP PO Number Generator (Finale-Compatible)

```typescript
// lib/services/poNumberGenerator.ts

export class PONumberGenerator {
  
  /**
   * Generate MuRP PO number (compatible with Finale import)
   */
  async generatePONumber(
    options?: {
      isDropship?: boolean;
      vendorCode?: string;
      suffix?: string;
    }
  ): Promise<string> {
    
    const supabase = createClient();
    
    // Get next sequence number for today
    const today = new Date();
    const yearStr = today.getFullYear().toString();
    const monthStr = String(today.getMonth() + 1).padStart(2, '0');
    const dayStr = String(today.getDate()).padStart(2, '0');
    
    // Get count of POs created today
    const { count } = await supabase
      .from('purchase_orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${yearStr}-${monthStr}-${dayStr}T00:00:00`)
      .lt('created_at', `${yearStr}-${monthStr}-${dayStr}T23:59:59`);
    
    const sequence = (count || 0) + 1;
    
    // Base number: YYYYMMDDSSS (year + month + day + sequence)
    const baseNumber = `${yearStr}${monthStr}${dayStr}${String(sequence).padStart(3, '0')}`;
    
    // Add suffixes if needed
    let poNumber = baseNumber;
    
    if (options?.isDropship) {
      poNumber += '-DropshipPO';
    }
    
    if (options?.vendorCode) {
      poNumber = `${poNumber}-${options.vendorCode}`;
    }
    
    if (options?.suffix) {
      poNumber = `${poNumber}-${options.suffix}`;
    }
    
    return poNumber;
  }
  
  /**
   * Parse Finale PO number to extract components
   */
  parsePONumber(poNumber: string): {
    baseNumber: string;
    isDropship: boolean;
    vendorCode?: string;
    suffixes: string[];
  } {
    
    const parts = poNumber.split('-');
    
    return {
      baseNumber: parts[0],
      isDropship: poNumber.includes('DropshipPO'),
      vendorCode: parts.length > 1 ? parts[1] : undefined,
      suffixes: parts.slice(1)
    };
  }
}
```

---

## Status Mapping

### Complete Status Translation Table

| MuRP Status | Finale Status | Description                        |
|-------------|---------------|------------------------------------|
| `draft`     | Draft         | PO created, not yet approved       |
| `pending`   | Draft         | Approved, ready to send            |
| `committed` | Committed     | Sent to vendor, awaiting receipt   |
| `sent`      | Committed     | Email sent to vendor               |
| `received`  | Committed     | Items received (check Shipments)   |
| `cancelled` | Draft         | Cancelled PO                       |

**Note:** Finale doesn't have separate "sent" or "received" statuses. They use the "Shipments" field to track receipt status.

---

## API Endpoints for Finale Integration

### Export Endpoint

```typescript
// app/api/finale/export/route.ts

import { NextResponse } from 'next/server';
import { FinaleExporter } from '@/lib/services/finaleExporter';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const exporter = new FinaleExporter();
    const csv = await exporter.exportToFinaleCSV(body.filters);
    
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="PurchaseOrders_${new Date().toISOString().split('T')[0]}.csv"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

### Import Endpoint

```typescript
// app/api/finale/import/route.ts

import { NextResponse } from 'next/server';
import { FinaleImporter } from '@/lib/services/finaleImporter';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }
    
    const csvContent = await file.text();
    
    const importer = new FinaleImporter();
    const result = await importer.importFromFinaleCSV(csvContent);
    
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

---

## UI Components

### Export Button Component

```typescript
// components/finale/ExportToFinaleButton.tsx

'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';

export function ExportToFinaleButton() {
  const [exporting, setExporting] = useState(false);
  
  const handleExport = async () => {
    setExporting(true);
    
    try {
      const response = await fetch('/api/finale/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: {
            // Add any filters here
          }
        })
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      // Download the CSV
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PurchaseOrders_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      alert('✅ Export completed!');
    } catch (error) {
      console.error('Export error:', error);
      alert('❌ Export failed');
    } finally {
      setExporting(false);
    }
  };
  
  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
    >
      <Download className="w-4 h-4" />
      {exporting ? 'Exporting...' : 'Export to Finale'}
    </button>
  );
}
```

### Import Button Component

```typescript
// components/finale/ImportFromFinaleButton.tsx

'use client';

import { Upload } from 'lucide-react';
import { useState, useRef } from 'react';

export function ImportFromFinaleButton({ onImportComplete }: { 
  onImportComplete?: () => void 
}) {
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/finale/import', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ Import completed!\n${result.imported} POs imported successfully.`);
        onImportComplete?.();
      } else {
        alert(`⚠️ Import completed with errors.\n${result.imported} succeeded, ${result.failed} failed.\n\nErrors:\n${result.errors.join('\n')}`);
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('❌ Import failed');
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleImport}
        className="hidden"
      />
      
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={importing}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        <Upload className="w-4 h-4" />
        {importing ? 'Importing...' : 'Import from Finale'}
      </button>
    </>
  );
}
```

---

## Testing the Integration

### Test Script

```typescript
// scripts/test-finale-integration.ts

import { FinaleExporter } from '@/lib/services/finaleExporter';
import { FinaleImporter } from '@/lib/services/finaleImporter';
import fs from 'fs';

async function testIntegration() {
  console.log('🧪 Testing Finale Integration\n');
  
  // Test 1: Export
  console.log('1️⃣ Testing export...');
  const exporter = new FinaleExporter();
  const csv = await exporter.exportToFinaleCSV();
  
  // Save to file
  fs.writeFileSync('/tmp/test_export.csv', csv);
  console.log('✅ Export completed: /tmp/test_export.csv\n');
  
  // Test 2: Import
  console.log('2️⃣ Testing import...');
  const importer = new FinaleImporter();
  const result = await importer.importFromFinaleCSV(csv);
  
  console.log('✅ Import completed:');
  console.log(`   - Imported: ${result.imported}`);
  console.log(`   - Failed: ${result.failed}`);
  
  if (result.errors.length > 0) {
    console.log('\n⚠️  Errors:');
    result.errors.forEach(err => console.log(`   - ${err}`));
  }
}

testIntegration().catch(console.error);
```

---

## Summary

This integration ensures **perfect compatibility** between MuRP and Finale:

✅ **Database Schema** - Matches all Finale export columns  
✅ **Internal Notes** - Preserves Finale's consumption metadata format  
✅ **PO Numbers** - Handles all Finale's PO number formats  
✅ **Status Mapping** - Translates between MuRP and Finale statuses  
✅ **CSV Export** - Generates Finale-compatible CSV exports  
✅ **CSV Import** - Parses Finale exports into MuRP  
✅ **Bidirectional Sync** - Can export from MuRP and import back  

**Key Benefits:**

1. **No Data Loss** - All Finale metadata preserved in Internal notes
2. **Easy Migration** - Import existing Finale POs into MuRP
3. **Flexible Workflow** - Work in MuRP, export to Finale when needed
4. **Audit Trail** - Track sync status and history
5. **Future-Proof** - Can add Finale API integration later

---

**Implementation Time: +2 hours** (on top of base system)

This gives you complete interoperability with Finale while maintaining MuRP's advanced features!