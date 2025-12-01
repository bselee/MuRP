/**
 * PO Import Panel
 *
 * Allows bulk import of purchase orders from:
 * 1. CSV file upload (Finale format)
 * 2. Direct Finale API pull (read-only, no sync back)
 *
 * Imported POs are persisted to Supabase and appear in the PO list.
 */

import React, { useState, useRef } from 'react';
import Button from '@/components/ui/Button';
import {
  CloudUploadIcon,
  RefreshIcon,
  CheckCircleIcon,
  XCircleIcon,
  DocumentTextIcon,
  ServerStackIcon,
} from './icons';
import { finalePOImporter, type FinalePOCSVRow, type ImportResult } from '../services/finalePOImporter';
import { getFinaleClient, updateFinaleClient } from '../lib/finale/client';
import { supabase } from '../lib/supabase/client';
import type { FinaleConnectionConfig, FinalePurchaseOrder } from '../lib/finale/types';

interface POImportPanelProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onImportComplete?: () => void;
}

interface ImportStats {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
}

const POImportPanel: React.FC<POImportPanelProps> = ({ addToast, onImportComplete }) => {
  const [isImportingCSV, setIsImportingCSV] = useState(false);
  const [isPullingFinale, setIsPullingFinale] = useState(false);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if Finale is configured
  const finaleClient = getFinaleClient();
  const isFinaleConfigured = !!finaleClient;

  /**
   * Parse CSV text into rows
   */
  const parseCSV = (text: string): FinalePOCSVRow[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows: FinalePOCSVRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: any = {};

      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });

      rows.push(row as FinalePOCSVRow);
    }

    return rows;
  };

  /**
   * Handle CSV file selection
   */
  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      addToast('Please select a CSV file', 'error');
      return;
    }

    setIsImportingCSV(true);
    setImportStats(null);

    try {
      const text = await file.text();
      const csvRows = parseCSV(text);

      if (csvRows.length === 0) {
        addToast('No valid data found in CSV file', 'error');
        setIsImportingCSV(false);
        return;
      }

      // Import using the finalePOImporter service
      const result: ImportResult = await finalePOImporter.importFromCSV(csvRows);

      setImportStats({
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors.length,
      });

      if (result.errors.length === 0) {
        addToast(
          `Successfully imported ${result.imported} new POs, updated ${result.updated}`,
          'success'
        );
      } else {
        addToast(
          `Imported ${result.imported} POs with ${result.errors.length} errors. Check console.`,
          'info'
        );
        console.error('Import errors:', result.errors);
      }

      onImportComplete?.();
    } catch (error) {
      console.error('CSV import failed:', error);
      addToast(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setIsImportingCSV(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  /**
   * Handle drag and drop
   */
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  /**
   * Pull POs from Finale API and persist to Supabase (read-only, no sync back)
   */
  const handlePullFromFinale = async () => {
    if (!finaleClient) {
      addToast('Finale is not configured. Go to Settings → API Integrations.', 'error');
      return;
    }

    setIsPullingFinale(true);
    setImportStats(null);

    try {
      // Test connection first
      const connectionTest = await finaleClient.testConnection();
      if (!connectionTest.success) {
        throw new Error(`Connection failed: ${connectionTest.message}`);
      }

      addToast('Connected to Finale successfully. Fetching purchase orders...', 'info');

      // Fetch POs from Finale (paginated)
      const allPOs: FinalePurchaseOrder[] = [];
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      addToast('Fetching purchase orders from Finale...', 'info');

      while (hasMore) {
        try {
          const batch = await finaleClient.fetchPurchaseOrders({ limit, offset });
          allPOs.push(...batch);
          offset += limit;
          hasMore = batch.length === limit;

          if (batch.length > 0) {
            addToast(`Fetched ${allPOs.length} POs so far...`, 'info');
          }
        } catch (fetchError) {
          console.error('Error fetching batch:', fetchError);
          throw new Error(`Failed to fetch POs at offset ${offset}: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
        }
      }

      if (allPOs.length === 0) {
        addToast('No purchase orders found in Finale', 'info');
        setIsPullingFinale(false);
        return;
      }

      // Persist to Supabase
      let imported = 0;
      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const finalePO of allPOs) {
        try {
          // Transform Finale PO to MuRP format
          const poData = {
            order_id: finalePO.orderNumber,
            vendor_id: null, // Will be resolved below
            supplier_name: typeof finalePO.supplier === 'string' 
              ? finalePO.supplier.split('/').pop() || 'Unknown'
              : 'Unknown',
            status: mapFinaleStatus(finalePO.status),
            order_date: finalePO.orderDate,
            expected_date: finalePO.expectedDate || null,
            subtotal: finalePO.subtotal,
            tax_amount: finalePO.tax || 0,
            shipping_cost: finalePO.shipping || 0,
            total_amount: finalePO.total,
            internal_notes: finalePO.internalNotes || null,
            vendor_notes: finalePO.notes || null,
            source: 'finale_import',
            finale_po_id: String(finalePO.id),
            last_finale_sync: new Date().toISOString(),
          };

          // Try to resolve vendor by name
          const supplierName = poData.supplier_name;
          if (supplierName && supplierName !== 'Unknown') {
            const { data: vendor } = await supabase
              .from('vendors')
              .select('id')
              .ilike('name', `%${supplierName}%`)
              .limit(1)
              .maybeSingle();

            if (vendor) {
              poData.vendor_id = vendor.id;
            }
          }

          // Check if PO exists
          const { data: existing } = await supabase
            .from('purchase_orders')
            .select('id, record_last_updated')
            .eq('order_id', finalePO.orderNumber)
            .maybeSingle();

          if (existing) {
            // Update only if Finale has newer data
            const finaleDate = new Date(finalePO.lastModified);
            const existingDate = existing.record_last_updated 
              ? new Date(existing.record_last_updated) 
              : new Date(0);

            if (finaleDate > existingDate) {
              const { error } = await supabase
                .from('purchase_orders')
                .update({
                  ...poData,
                  record_last_updated: new Date().toISOString(),
                })
                .eq('id', existing.id);

              if (error) throw error;

              // Update line items
              await updateLineItems(existing.id, finalePO.lineItems);
              updated++;
            } else {
              skipped++;
            }
          } else {
            // Insert new PO
            const { data: newPO, error: poError } = await supabase
              .from('purchase_orders')
              .insert(poData)
              .select('id')
              .single();

            if (poError) throw poError;

            // Insert line items
            if (newPO && finalePO.lineItems && finalePO.lineItems.length > 0) {
              await insertLineItems(newPO.id, finalePO.lineItems);
            }
            imported++;
          }
        } catch (err) {
          errors.push(`PO ${finalePO.orderNumber}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      setImportStats({ imported, updated, skipped, errors: errors.length });

      // Log to sync log
      await supabase.from('finale_sync_log').insert({
        sync_type: 'import_po',
        entity_type: 'purchase_order',
        operation: 'pull',
        direction: 'import',
        status: errors.length > 0 ? 'partial' : 'success',
        records_processed: allPOs.length,
        error_message: errors.length > 0 ? `${errors.length} errors` : null,
        error_details: errors.length > 0 ? { errors } : null,
        completed_at: new Date().toISOString(),
        triggered_by: 'manual',
        sync_source: 'finale_api',
      });

      if (errors.length === 0) {
        addToast(
          `Pulled ${imported} new POs, updated ${updated} from Finale`,
          'success'
        );
      } else {
        addToast(
          `Pulled ${imported} POs with ${errors.length} errors. Check console.`,
          'info'
        );
        console.error('Finale import errors:', errors);
      }

      onImportComplete?.();
    } catch (error) {
      console.error('Finale pull failed:', error);
      addToast(
        `Failed to pull from Finale: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    } finally {
      setIsPullingFinale(false);
    }
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4">
      <div className="flex items-center gap-3 mb-4">
        <DocumentTextIcon className="w-5 h-5 text-accent-400" />
        <h3 className="text-lg font-semibold text-white">Import Purchase Orders</h3>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* CSV Upload */}
        <div
          className={`relative border-2 border-dashed rounded-lg p-6 transition-colors ${
            dragActive
              ? 'border-accent-400 bg-accent-500/10'
              : 'border-gray-600 hover:border-gray-500'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isImportingCSV}
          />
          <div className="text-center">
            <CloudUploadIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-200 mb-1">
              {isImportingCSV ? 'Importing...' : 'Upload CSV File'}
            </p>
            <p className="text-xs text-gray-400">
              Drag & drop or click to select Finale PO export
            </p>
          </div>
          {isImportingCSV && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 rounded-lg">
              <RefreshIcon className="w-8 h-8 text-accent-400 animate-spin" />
            </div>
          )}
        </div>

        {/* Finale API Pull */}
        <div className="border border-gray-600 rounded-lg p-6">
          <div className="text-center">
            <ServerStackIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-200 mb-1">Pull from Finale</p>
            <p className="text-xs text-gray-400 mb-4">
              {isFinaleConfigured
                ? 'Import POs directly from Finale API'
                : 'Configure Finale in Settings first'}
            </p>
            <Button
              onClick={handlePullFromFinale}
              disabled={!isFinaleConfigured || isPullingFinale}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-md hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPullingFinale ? (
                <>
                  <RefreshIcon className="w-4 h-4 animate-spin" />
                  Pulling...
                </>
              ) : (
                <>
                  <RefreshIcon className="w-4 h-4" />
                  Pull POs
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Import Results */}
      {importStats && (
        <div className="mt-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
          <p className="text-sm font-medium text-gray-200 mb-2">Import Results</p>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-xl font-bold text-green-400">{importStats.imported}</p>
              <p className="text-xs text-gray-400">New</p>
            </div>
            <div>
              <p className="text-xl font-bold text-blue-400">{importStats.updated}</p>
              <p className="text-xs text-gray-400">Updated</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-400">{importStats.skipped}</p>
              <p className="text-xs text-gray-400">Skipped</p>
            </div>
            <div>
              <p className="text-xl font-bold text-red-400">{importStats.errors}</p>
              <p className="text-xs text-gray-400">Errors</p>
            </div>
          </div>
        </div>
      )}

      {/* Help text */}
      <div className="mt-4 text-xs text-gray-500">
        <p>
          <strong>CSV Format:</strong> PO Number, Date, Supplier Code, Supplier Name, Status, Expected Date, 
          Tracking Number, Subtotal, Tax, Shipping, Total, Internal Notes, Vendor Notes, Payment Terms, Line Items
        </p>
        <p className="mt-1">
          <strong>Note:</strong> Import is read-only — POs are pulled into MuRP but NOT synced back to Finale.
        </p>
      </div>
    </div>
  );
};

// =============================================================================
// Helper Functions
// =============================================================================

function mapFinaleStatus(finaleStatus: string): string {
  const statusMap: Record<string, string> = {
    'DRAFT': 'draft',
    'SUBMITTED': 'sent',
    'PARTIALLY_RECEIVED': 'partial',
    'RECEIVED': 'received',
    'CANCELLED': 'cancelled',
  };
  return statusMap[finaleStatus] || 'pending';
}

async function insertLineItems(poId: string, lineItems: any[]): Promise<void> {
  if (!lineItems || lineItems.length === 0) return;

  const items = lineItems.map((item, idx) => ({
    po_id: poId,
    inventory_sku: item.sku || '',
    item_name: item.name || item.sku || 'Unknown Item',
    quantity_ordered: item.quantity || 0,
    quantity_received: item.received || 0,
    unit_cost: item.unitPrice || 0,
    line_number: idx + 1,
    line_status: (item.received || 0) >= (item.quantity || 0) ? 'received' : 'pending',
  }));

  const { error } = await supabase.from('purchase_order_items').insert(items);
  if (error) {
    console.error('Failed to insert line items:', error);
  }
}

async function updateLineItems(poId: string, lineItems: any[]): Promise<void> {
  if (!lineItems || lineItems.length === 0) return;

  // Delete existing and re-insert
  await supabase.from('purchase_order_items').delete().eq('po_id', poId);
  await insertLineItems(poId, lineItems);
}

export default POImportPanel;
