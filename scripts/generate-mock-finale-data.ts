#!/usr/bin/env tsx
/**
 * Generate Mock Finale Data
 *
 * Creates realistic test data for Finale tables without API calls.
 * Perfect for development and testing with small datasets.
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseKey.includes('service_role')) {
  console.error('❌ Need SERVICE ROLE key for seeding data!');
  console.error('Set VITE_SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateMockData() {
  console.log('🎭 Generating mock Finale data...\n');

  try {
    // Clear existing data
    console.log('🧹 Clearing existing Finale data...');
    await supabase.from('finale_stock_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('finale_po_line_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('finale_purchase_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('finale_inventory').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('finale_boms').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('finale_products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('finale_vendors').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('finale_facilities').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Generate mock vendors
    console.log('🏭 Creating mock vendors...');
    const vendors = [
      {
        finale_party_url: 'https://app.finaleinventory.com/party/ABC001',
        party_id: 'ABC001',
        party_name: 'ABC Supply Co.',
        contact_name: 'John Smith',
        email: 'john@abcsupply.com',
        phone: '555-0101',
        address_street: '123 Main St',
        address_city: 'Portland',
        address_state: 'OR',
        address_postal_code: '97201',
        payment_terms: 'Net 30',
        default_lead_time_days: 7,
        minimum_order_amount: 100.00,
        status: 'Active'
      },
      {
        finale_party_url: 'https://app.finaleinventory.com/party/XYZ002',
        party_id: 'XYZ002',
        party_name: 'XYZ Manufacturing',
        contact_name: 'Jane Doe',
        email: 'jane@xyz.com',
        phone: '555-0202',
        address_street: '456 Oak Ave',
        address_city: 'Seattle',
        address_state: 'WA',
        address_postal_code: '98101',
        payment_terms: 'Net 15',
        default_lead_time_days: 14,
        minimum_order_amount: 250.00,
        status: 'Active'
      }
    ];

    const { data: vendorData, error: vendorError } = await supabase
      .from('finale_vendors')
      .insert(vendors)
      .select();

    if (vendorError) throw vendorError;
    console.log(`✅ Created ${vendorData.length} vendors`);

    // Generate mock facilities
    console.log('🏢 Creating mock facilities...');
    const facilities = [
      {
        finale_facility_url: 'https://app.finaleinventory.com/facility/SHIPPING',
        facility_id: 'SHIPPING',
        facility_name: 'Shipping Warehouse',
        facility_type: 'WAREHOUSE',
        status: 'Active'
      }
    ];

    const { data: facilityData, error: facilityError } = await supabase
      .from('finale_facilities')
      .insert(facilities)
      .select();

    if (facilityError) throw facilityError;
    console.log(`✅ Created ${facilityData.length} facilities`);

    // Generate mock products
    console.log('📦 Creating mock products...');
    const products = [
      {
        finale_product_url: 'https://app.finaleinventory.com/product/PROD001',
        product_id: 'PROD001',
        internal_name: 'Widget A',
        sku: 'WIDGET-A',
        description: 'Standard widget for assembly',
        product_type: 'Finished Good',
        status: 'PRODUCT_ACTIVE',
        unit_cost: 5.50,
        unit_price: 12.99,
        reorder_point: 50,
        reorder_quantity: 100,
        minimum_order_qty: 10,
        primary_supplier_url: vendors[0].finale_party_url,
        primary_supplier_id: vendors[0].party_id,
        lead_time_days: 7,
        custom_department: 'MFG'
      },
      {
        finale_product_url: 'https://app.finaleinventory.com/product/PROD002',
        product_id: 'PROD002',
        internal_name: 'Widget B',
        sku: 'WIDGET-B',
        description: 'Premium widget component',
        product_type: 'Component',
        status: 'PRODUCT_ACTIVE',
        unit_cost: 3.25,
        unit_price: 8.50,
        reorder_point: 75,
        reorder_quantity: 150,
        minimum_order_qty: 25,
        primary_supplier_url: vendors[1].finale_party_url,
        primary_supplier_id: vendors[1].party_id,
        lead_time_days: 14,
        custom_department: 'MFG'
      },
      {
        finale_product_url: 'https://app.finaleinventory.com/product/PROD003',
        product_id: 'PROD003',
        internal_name: 'Assembly Kit',
        sku: 'KIT-001',
        description: 'Complete assembly kit',
        product_type: 'Kit',
        status: 'PRODUCT_ACTIVE',
        unit_cost: 15.75,
        unit_price: 29.99,
        reorder_point: 25,
        reorder_quantity: 50,
        minimum_order_qty: 5,
        primary_supplier_url: vendors[0].finale_party_url,
        primary_supplier_id: vendors[0].party_id,
        lead_time_days: 10,
        is_assembly: true,
        custom_department: 'MFG'
      }
    ];

    const { data: productData, error: productError } = await supabase
      .from('finale_products')
      .insert(products)
      .select();

    if (productError) throw productError;
    console.log(`✅ Created ${productData.length} products`);

    // Generate mock inventory
    console.log('📊 Creating mock inventory...');
    const inventory = [
      {
        finale_product_url: products[0].finale_product_url,
        product_id: productData[0].id,
        facility_url: facilities[0].finale_facility_url,
        facility_id: facilities[0].facility_id,
        facility_name: facilities[0].facility_name,
        quantity_on_hand: 125,
        quantity_on_order: 0,
        quantity_reserved: 15,
        quantity_available: 110
      },
      {
        finale_product_url: products[1].finale_product_url,
        product_id: productData[1].id,
        facility_url: facilities[0].finale_facility_url,
        facility_id: facilities[0].facility_id,
        facility_name: facilities[0].facility_name,
        quantity_on_hand: 200,
        quantity_on_order: 50,
        quantity_reserved: 25,
        quantity_available: 175
      },
      {
        finale_product_url: products[2].finale_product_url,
        product_id: productData[2].id,
        facility_url: facilities[0].finale_facility_url,
        facility_id: facilities[0].facility_id,
        facility_name: facilities[0].facility_name,
        quantity_on_hand: 30,
        quantity_on_order: 0,
        quantity_reserved: 5,
        quantity_available: 25
      }
    ];

    const { data: inventoryData, error: inventoryError } = await supabase
      .from('finale_inventory')
      .insert(inventory)
      .select();

    if (inventoryError) throw inventoryError;
    console.log(`✅ Created ${inventoryData.length} inventory records`);

    // Generate mock BOMs
    console.log('🔧 Creating mock BOMs...');
    const boms = [
      {
        finale_bom_url: 'https://app.finaleinventory.com/bom/BOM001',
        bom_id: 'BOM001',
        parent_product_id: productData[2].id,
        parent_product_url: products[2].finale_product_url,
        parent_name: products[2].internal_name,
        parent_sku: products[2].sku,
        component_product_id: productData[0].id,
        component_product_url: products[0].finale_product_url,
        component_name: products[0].internal_name,
        component_sku: products[0].sku,
        quantity_per: 2,
        effective_quantity: 2,
        bom_type: 'MANUFACTURING',
        status: 'Active'
      },
      {
        finale_bom_url: 'https://app.finaleinventory.com/bom/BOM002',
        bom_id: 'BOM002',
        parent_product_id: productData[2].id,
        parent_product_url: products[2].finale_product_url,
        parent_name: products[2].internal_name,
        parent_sku: products[2].sku,
        component_product_id: productData[1].id,
        component_product_url: products[1].finale_product_url,
        component_name: products[1].internal_name,
        component_sku: products[1].sku,
        quantity_per: 1,
        effective_quantity: 1,
        bom_type: 'MANUFACTURING',
        status: 'Active'
      }
    ];

    const { data: bomData, error: bomError } = await supabase
      .from('finale_boms')
      .insert(boms)
      .select();

    if (bomError) throw bomError;
    console.log(`✅ Created ${bomData.length} BOM records`);

    // Generate mock purchase orders
    console.log('📋 Creating mock purchase orders...');
    const pos = [
      {
        finale_order_url: 'https://app.finaleinventory.com/order/PO001',
        order_id: 'PO001',
        order_type: 'PURCHASE_ORDER',
        status: 'Completed',
        vendor_id: vendorData[0].id,
        vendor_url: vendors[0].finale_party_url,
        vendor_name: vendors[0].party_name,
        facility_url: facilities[0].finale_facility_url,
        facility_id: facilities[0].facility_id,
        order_date: '2025-12-01',
        expected_date: '2025-12-08',
        received_date: '2025-12-07',
        subtotal: 550.00,
        tax: 0.00,
        shipping: 25.00,
        total: 575.00,
        delivery_status: 'DELIVERED'
      },
      {
        finale_order_url: 'https://app.finaleinventory.com/order/PO002',
        order_id: 'PO002',
        order_type: 'PURCHASE_ORDER',
        status: 'Open',
        vendor_id: vendorData[1].id,
        vendor_url: vendors[1].finale_party_url,
        vendor_name: vendors[1].party_name,
        facility_url: facilities[0].finale_facility_url,
        facility_id: facilities[0].facility_id,
        order_date: '2025-12-03',
        expected_date: '2025-12-17',
        subtotal: 325.00,
        tax: 0.00,
        shipping: 15.00,
        total: 340.00,
        delivery_status: 'ON_TRACK'
      }
    ];

    const { data: poData, error: poError } = await supabase
      .from('finale_purchase_orders')
      .insert(pos)
      .select();

    if (poError) throw poError;
    console.log(`✅ Created ${poData.length} purchase orders`);

    // Generate mock PO line items
    console.log('📝 Creating mock PO line items...');
    const lineItems = [
      {
        po_id: poData[0].id,
        finale_order_url: pos[0].finale_order_url,
        product_id: productData[0].id,
        finale_product_url: products[0].finale_product_url,
        product_name: products[0].internal_name,
        quantity_ordered: 100,
        quantity_received: 100,
        unit_cost: 5.50,
        line_total: 550.00
      },
      {
        po_id: poData[1].id,
        finale_order_url: pos[1].finale_order_url,
        product_id: productData[1].id,
        finale_product_url: products[1].finale_product_url,
        product_name: products[1].internal_name,
        quantity_ordered: 100,
        quantity_received: 0,
        unit_cost: 3.25,
        line_total: 325.00
      }
    ];

    const { data: lineItemData, error: lineItemError } = await supabase
      .from('finale_po_line_items')
      .insert(lineItems)
      .select();

    if (lineItemError) throw lineItemError;
    console.log(`✅ Created ${lineItemData.length} PO line items`);

    // Generate mock stock history
    console.log('📈 Creating mock stock history...');
    const now = new Date();
    const stockHistory = [];

    // Generate some transaction history for the last 30 days
    for (let i = 0; i < 30; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      // Add some sales transactions
      stockHistory.push({
        finale_product_url: products[0].finale_product_url,
        product_id: productData[0].id,
        transaction_date: date.toISOString(),
        transaction_type: 'SALE',
        quantity: -Math.floor(Math.random() * 10) - 1, // -1 to -10
        facility_url: facilities[0].finale_facility_url,
        facility_name: facilities[0].facility_name,
        reference_number: `SO${String(1000 + i).padStart(4, '0')}`
      });

      // Add some receipt transactions
      if (i % 7 === 0) { // Weekly receipts
        stockHistory.push({
          finale_product_url: products[0].finale_product_url,
          product_id: productData[0].id,
          transaction_date: date.toISOString(),
          transaction_type: 'RECEIPT',
          quantity: Math.floor(Math.random() * 50) + 25, // 25-75
          facility_url: facilities[0].finale_facility_url,
          facility_name: facilities[0].facility_name,
          reference_number: `PO${String(1000 + i).padStart(4, '0')}`
        });
      }
    }

    const { data: historyData, error: historyError } = await supabase
      .from('finale_stock_history')
      .insert(stockHistory)
      .select();

    if (historyError) throw historyError;
    console.log(`✅ Created ${historyData.length} stock history records`);

    console.log('\n🎉 Mock Finale data generation complete!');
    console.log('📊 Summary:');
    console.log(`   • ${vendorData.length} vendors`);
    console.log(`   • ${facilityData.length} facilities`);
    console.log(`   • ${productData.length} products`);
    console.log(`   • ${inventoryData.length} inventory records`);
    console.log(`   • ${bomData.length} BOM records`);
    console.log(`   • ${poData.length} purchase orders`);
    console.log(`   • ${lineItemData.length} PO line items`);
    console.log(`   • ${historyData.length} stock transactions`);
    console.log('\n🚀 You should now see data in your MuRP application!');

  } catch (error) {
    console.error('❌ Failed to generate mock data:', error);
    process.exit(1);
  }
}

generateMockData();