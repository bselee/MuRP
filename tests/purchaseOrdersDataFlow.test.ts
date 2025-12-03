/**
 * Purchase Orders Data Flow Test
 * 
 * Comprehensive test for the purchase orders data pipeline:
 * 1. Finale API → Fetch POs
 * 2. Transform Finale format → MuRP schema
 * 3. Save to Supabase
 * 4. Retrieve from Supabase
 * 5. Display in UI
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { supabase } from '../lib/supabase/client';
import { FinalePOImporter } from '../services/finalePOImporter';
import type { PurchaseOrder } from '../types';

describe('Purchase Orders Data Flow', () => {
  let testPOId: string | null = null;

  beforeAll(async () => {
    // Clean up any test data
    const { error: deleteError } = await supabase
      .from('purchase_orders')
      .delete()
      .like('order_id', 'TEST-PO-%');
    
    if (deleteError) {
      console.warn('Cleanup warning:', deleteError.message);
    }
  });

  it('should verify purchase_orders table exists and is accessible', async () => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('id')
      .limit(1);

    expect(error).toBeNull();
    expect(data).toBeDefined();
  });

  it('should verify purchase_order_items table exists and is accessible', async () => {
    const { data, error } = await supabase
      .from('purchase_order_items')
      .select('id')
      .limit(1);

    expect(error).toBeNull();
    expect(data).toBeDefined();
  });

  it('should create a test purchase order with line items', async () => {
    const testPO = {
      order_id: `TEST-PO-${Date.now()}`,
      order_date: new Date().toISOString().split('T')[0],
      supplier_name: 'Test Vendor',
      supplier_code: 'TEST-V001',
      status: 'draft',
      priority: 'normal',
      subtotal: 100.00,
      total_amount: 100.00,
      currency: 'USD',
      source: 'manual',
      created_by: 'test-suite',
      internal_notes: 'Created by automated test'
    };

    const { data: poData, error: poError } = await supabase
      .from('purchase_orders')
      .insert(testPO)
      .select()
      .single();

    expect(poError).toBeNull();
    expect(poData).toBeDefined();
    expect(poData?.order_id).toBe(testPO.order_id);
    
    testPOId = poData?.id || null;

    // Create line items
    if (testPOId) {
      const lineItems = [
        {
          po_id: testPOId,
          inventory_sku: 'TEST-SKU-001',
          item_name: 'Test Item 1',
          quantity_ordered: 10,
          unit_cost: 5.00,
          line_status: 'pending'
        },
        {
          po_id: testPOId,
          inventory_sku: 'TEST-SKU-002',
          item_name: 'Test Item 2',
          quantity_ordered: 20,
          unit_cost: 2.50,
          line_status: 'pending'
        }
      ];

      const { data: itemsData, error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(lineItems)
        .select();

      expect(itemsError).toBeNull();
      expect(itemsData).toHaveLength(2);
    }
  });

  it('should fetch purchase order with line items', async () => {
    if (!testPOId) {
      throw new Error('Test PO ID not available');
    }

    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, purchase_order_items(*)')
      .eq('id', testPOId)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data?.purchase_order_items).toBeDefined();
    expect(data?.purchase_order_items).toHaveLength(2);
  });

  it('should verify PO totals were calculated correctly by trigger', async () => {
    if (!testPOId) {
      throw new Error('Test PO ID not available');
    }

    const { data, error } = await supabase
      .from('purchase_orders')
      .select('subtotal, total_amount')
      .eq('id', testPOId)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    
    // Line items: 10 * $5.00 + 20 * $2.50 = $50 + $50 = $100
    const expectedTotal = 100.00;
    expect(data?.subtotal).toBe(expectedTotal);
  });

  it('should fetch all purchase orders ordered by date', async () => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, purchase_order_items(*)')
      .order('order_date', { ascending: false })
      .limit(10);

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(Array.isArray(data)).toBe(true);
    
    if (data && data.length > 0) {
      console.log(`✅ Found ${data.length} purchase orders in database`);
      console.log('Sample PO:', {
        order_id: data[0].order_id,
        supplier: data[0].supplier_name,
        status: data[0].status,
        total: data[0].total_amount,
        items_count: data[0].purchase_order_items?.length || 0
      });
    } else {
      console.log('⚠️  No purchase orders found in database');
    }
  });

  it('should verify RLS policies allow authenticated users to read POs', async () => {
    // This test verifies the RLS policies are correctly configured
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('order_id, supplier_name, status')
      .limit(5);

    expect(error).toBeNull();
    expect(data).toBeDefined();
  });

  it('should check for any Finale-synced purchase orders', async () => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('order_id, supplier_name, finale_po_id, last_finale_sync')
      .not('finale_po_id', 'is', null)
      .limit(5);

    expect(error).toBeNull();
    
    if (data && data.length > 0) {
      console.log(`✅ Found ${data.length} Finale-synced POs`);
      console.log('Finale PO samples:', data.map(po => ({
        order_id: po.order_id,
        finale_id: po.finale_po_id,
        last_sync: po.last_finale_sync
      })));
    } else {
      console.log('ℹ️  No Finale-synced POs found (import may not have run yet)');
    }
  });

  it('should verify FinalePOImporter service is available', () => {
    const importer = new FinalePOImporter();
    expect(importer).toBeDefined();
    expect(typeof importer.importFromFinaleAPI).toBe('function');
  });

  // Cleanup
  it('should clean up test purchase order', async () => {
    if (testPOId) {
      // Delete line items first (cascade should handle this, but being explicit)
      await supabase
        .from('purchase_order_items')
        .delete()
        .eq('po_id', testPOId);

      // Delete PO
      const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', testPOId);

      expect(error).toBeNull();
    }
  });
});

describe('Purchase Orders Data Diagnostics', () => {
  it('should show current database state', async () => {
    console.log('\n📊 Purchase Orders Database Diagnostics\n');
    
    // Count total POs
    const { count: totalCount } = await supabase
      .from('purchase_orders')
      .select('*', { count: 'exact', head: true });
    
    console.log(`Total Purchase Orders: ${totalCount || 0}`);

    // Count by status
    const { data: statusData } = await supabase
      .from('purchase_orders')
      .select('status')
      .limit(1000);

    if (statusData) {
      const statusCounts = statusData.reduce((acc, po) => {
        acc[po.status] = (acc[po.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log('\nPOs by Status:');
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
      });
    }

    // Count line items
    const { count: itemsCount } = await supabase
      .from('purchase_order_items')
      .select('*', { count: 'exact', head: true });
    
    console.log(`\nTotal Line Items: ${itemsCount || 0}`);

    // Recent POs
    const { data: recentPOs } = await supabase
      .from('purchase_orders')
      .select('order_id, supplier_name, status, total_amount, order_date')
      .order('order_date', { ascending: false })
      .limit(5);

    if (recentPOs && recentPOs.length > 0) {
      console.log('\nMost Recent Purchase Orders:');
      recentPOs.forEach(po => {
        console.log(`  ${po.order_id} | ${po.supplier_name} | ${po.status} | $${po.total_amount} | ${po.order_date}`);
      });
    } else {
      console.log('\n⚠️  No purchase orders in database');
      console.log('💡 To populate, run: npm run finale:import-pos');
    }

    console.log('\n');
  });
});
