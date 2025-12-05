-- =============================================
-- MIGRATION 077: FINALE INTEGRATION SCHEMA
-- Creates all Finale data tables for MRP intelligence
-- =============================================

-- =============================================
-- CUSTOM FIELDS DEFINITION TABLE
-- =============================================
-- Stores the mapping between Finale's internal field names and display names
CREATE TABLE IF NOT EXISTS finale_custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL, -- 'product', 'order', 'party'
  attr_name VARCHAR(100) NOT NULL,  -- e.g., 'user_10000'
  display_name VARCHAR(200),        -- e.g., 'Lead Time Days'
  data_type VARCHAR(50),            -- 'text', 'date', 'picklist', 'number'
  picklist_values JSONB,            -- For picklist types
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_type, attr_name)
);

-- =============================================
-- PRODUCTS TABLE (Enhanced)
-- =============================================
CREATE TABLE IF NOT EXISTS finale_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finale_product_url VARCHAR(500) UNIQUE NOT NULL,
  product_id VARCHAR(100) NOT NULL,
  internal_name TEXT,
  description TEXT,
  product_type VARCHAR(100),
  status VARCHAR(50),
  upc VARCHAR(50),
  sku VARCHAR(100),

  -- Pricing
  unit_cost DECIMAL(12,4),
  unit_price DECIMAL(12,4),

  -- Reorder settings
  reorder_point INTEGER,
  reorder_quantity INTEGER,
  minimum_order_qty INTEGER,

  -- Supplier relationship
  primary_supplier_url VARCHAR(500),
  primary_supplier_id VARCHAR(100),
  lead_time_days INTEGER,

  -- BOM flag (is this a kit/assembly?)
  is_assembly BOOLEAN DEFAULT false,
  bom_url VARCHAR(500),

  -- Custom fields (raw storage)
  user_field_data JSONB DEFAULT '[]',

  -- Decoded custom fields (for easy querying)
  custom_lead_time INTEGER,           -- From custom field
  custom_vendor_sku VARCHAR(200),     -- From custom field
  custom_category VARCHAR(200),       -- From custom field
  custom_department VARCHAR(100),     -- From custom field (SHIPPING, SOIL, MFG)
  custom_min_stock INTEGER,           -- From custom field
  custom_max_stock INTEGER,           -- From custom field

  -- Sync metadata
  finale_last_modified TIMESTAMPTZ,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INVENTORY TABLE (Stock by Location)
-- =============================================
CREATE TABLE IF NOT EXISTS finale_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finale_inventory_url VARCHAR(500),
  product_id UUID REFERENCES finale_products(id) ON DELETE CASCADE,
  finale_product_url VARCHAR(500) NOT NULL,

  -- Location
  facility_url VARCHAR(500),
  facility_id VARCHAR(100),
  facility_name VARCHAR(200),
  parent_facility_url VARCHAR(500),

  -- Stock levels
  quantity_on_hand DECIMAL(12,4) DEFAULT 0,
  quantity_on_order DECIMAL(12,4) DEFAULT 0,
  quantity_reserved DECIMAL(12,4) DEFAULT 0,
  quantity_available DECIMAL(12,4) DEFAULT 0, -- Will be calculated as quantity_on_hand - quantity_reserved  -- Lot tracking
  lot_id VARCHAR(100),
  lot_expiration_date DATE,

  -- Related order (for on-order/reserved)
  order_url VARCHAR(500),
  order_type VARCHAR(50), -- 'purchase' or 'sale'

  -- Packing
  normalized_packing_string VARCHAR(200),

  -- Sync metadata
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(finale_product_url, facility_url)
);

-- =============================================
-- VENDORS/SUPPLIERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS finale_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finale_party_url VARCHAR(500) UNIQUE NOT NULL,
  party_id VARCHAR(100) NOT NULL,
  party_name VARCHAR(200) NOT NULL,

  -- Contact info
  contact_name VARCHAR(200),
  email VARCHAR(200),
  phone VARCHAR(50),

  -- Address
  address_street VARCHAR(200),
  address_city VARCHAR(100),
  address_state VARCHAR(50),
  address_postal_code VARCHAR(20),
  address_country VARCHAR(50),

  -- Terms
  payment_terms VARCHAR(100),
  default_lead_time_days INTEGER,
  minimum_order_amount DECIMAL(12,2),

  -- Custom fields
  user_field_data JSONB DEFAULT '[]',
  custom_vendor_code VARCHAR(100),
  custom_account_number VARCHAR(100),

  -- Performance metrics (calculated)
  avg_lead_time_days DECIMAL(8,2),
  on_time_delivery_pct DECIMAL(5,2),
  total_orders INTEGER DEFAULT 0,
  total_spend DECIMAL(14,2) DEFAULT 0,

  -- Status
  status VARCHAR(50) DEFAULT 'Active',

  -- Sync metadata
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PURCHASE ORDERS TABLE (GraphQL Source)
-- =============================================
CREATE TABLE IF NOT EXISTS finale_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finale_order_url VARCHAR(500) UNIQUE NOT NULL,
  order_id VARCHAR(100) NOT NULL,

  -- Type and status
  order_type VARCHAR(50) DEFAULT 'PURCHASE_ORDER',
  status VARCHAR(50) NOT NULL,

  -- Vendor
  vendor_id UUID REFERENCES finale_vendors(id),
  vendor_url VARCHAR(500),
  vendor_name VARCHAR(200),

  -- Facility
  facility_url VARCHAR(500),
  facility_id VARCHAR(100),

  -- Dates
  order_date DATE,
  expected_date DATE,
  received_date DATE,

  -- Amounts
  subtotal DECIMAL(12,2),
  tax DECIMAL(12,2),
  shipping DECIMAL(12,2),
  total DECIMAL(12,2),

  -- Notes
  public_notes TEXT,
  private_notes TEXT,

  -- Custom fields
  user_field_data JSONB DEFAULT '[]',

  -- Line items stored as JSONB for flexibility
  line_items JSONB DEFAULT '[]',

  -- Calculated fields
  line_count INTEGER DEFAULT 0,
  total_quantity DECIMAL(12,4) DEFAULT 0,

  -- Delivery tracking
  delivery_status VARCHAR(50) DEFAULT 'UNKNOWN', -- Will be calculated as: DELIVERED, OVERDUE, DUE_SOON, ON_TRACK  -- Sync metadata
  finale_last_modified TIMESTAMPTZ,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PURCHASE ORDER LINE ITEMS (Normalized)
-- =============================================
CREATE TABLE IF NOT EXISTS finale_po_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES finale_purchase_orders(id) ON DELETE CASCADE,
  finale_order_url VARCHAR(500) NOT NULL,

  -- Product reference
  product_id UUID REFERENCES finale_products(id),
  finale_product_url VARCHAR(500),
  product_name VARCHAR(200),

  -- Quantities and pricing
  quantity_ordered DECIMAL(12,4),
  quantity_received DECIMAL(12,4) DEFAULT 0,
  quantity_backordered DECIMAL(12,4) DEFAULT 0,
  unit_cost DECIMAL(12,4),
  line_total DECIMAL(12,2),

  -- Line details
  line_number INTEGER,
  description TEXT,

  -- Custom fields
  user_field_data JSONB DEFAULT '[]',

  -- Sync metadata
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- STOCK HISTORY TABLE (Transaction Log)
-- =============================================
CREATE TABLE IF NOT EXISTS finale_stock_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finale_transaction_url VARCHAR(500),
  product_id UUID REFERENCES finale_products(id) ON DELETE CASCADE,
  finale_product_url VARCHAR(500) NOT NULL,

  -- Transaction details
  transaction_date TIMESTAMPTZ NOT NULL,
  transaction_type VARCHAR(50), -- 'SALE', 'RECEIPT', 'ADJUSTMENT', etc.
  quantity DECIMAL(12,4) NOT NULL, -- Positive for inbound, negative for outbound

  -- References
  order_url VARCHAR(500),
  order_type VARCHAR(50),
  facility_url VARCHAR(500),
  facility_name VARCHAR(200),

  -- Lot tracking
  lot_id VARCHAR(100),
  lot_expiration_date DATE,

  -- Additional details
  reference_number VARCHAR(100), -- PO number, invoice, etc.
  notes TEXT,

  -- Custom fields
  user_field_data JSONB DEFAULT '[]',

  -- Sync metadata
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- BOMS TABLE (Bill of Materials)
-- =============================================
CREATE TABLE IF NOT EXISTS finale_boms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finale_bom_url VARCHAR(500) UNIQUE NOT NULL,
  bom_id VARCHAR(100) NOT NULL,

  -- Parent product (what we're building)
  parent_product_id UUID REFERENCES finale_products(id),
  parent_product_url VARCHAR(500),
  parent_name VARCHAR(200), -- MRP views expect this
  parent_sku VARCHAR(100), -- Added for MRP views

  -- Component details
  component_product_id UUID REFERENCES finale_products(id),
  component_product_url VARCHAR(500),
  component_name VARCHAR(200), -- MRP views expect this
  component_sku VARCHAR(100), -- Added for MRP views

  -- BOM quantities
  quantity_per DECIMAL(12,4) NOT NULL, -- MRP views expect this name
  quantity_per_parent DECIMAL(12,4), -- Keep both for compatibility
  component_cost DECIMAL(12,4),
  effective_quantity DECIMAL(12,4), -- Added for MRP views

  -- BOM metadata
  bom_type VARCHAR(50) DEFAULT 'MANUFACTURING',
  status VARCHAR(50) DEFAULT 'Active',

  -- Custom fields
  user_field_data JSONB DEFAULT '[]',

  -- Sync metadata
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- FACILITIES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS finale_facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finale_facility_url VARCHAR(500) UNIQUE NOT NULL,
  facility_id VARCHAR(100) NOT NULL,
  facility_name VARCHAR(200) NOT NULL,

  -- Hierarchy
  parent_facility_url VARCHAR(500),
  facility_type VARCHAR(50), -- 'WAREHOUSE', 'STORE', 'MANUFACTURING'

  -- Address
  address_street VARCHAR(200),
  address_city VARCHAR(100),
  address_state VARCHAR(50),
  address_postal_code VARCHAR(20),
  address_country VARCHAR(50),

  -- Status
  status VARCHAR(50) DEFAULT 'Active',

  -- Custom fields
  user_field_data JSONB DEFAULT '[]',

  -- Sync metadata
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Products
CREATE INDEX IF NOT EXISTS idx_finale_products_url ON finale_products(finale_product_url);
CREATE INDEX IF NOT EXISTS idx_finale_products_sku ON finale_products(sku);
CREATE INDEX IF NOT EXISTS idx_finale_products_supplier ON finale_products(primary_supplier_url);
CREATE INDEX IF NOT EXISTS idx_finale_products_category ON finale_products(custom_category);
CREATE INDEX IF NOT EXISTS idx_finale_products_department ON finale_products(custom_department);
CREATE INDEX IF NOT EXISTS idx_finale_products_synced ON finale_products(synced_at);

-- Inventory
CREATE INDEX IF NOT EXISTS idx_finale_inventory_product ON finale_inventory(finale_product_url);
CREATE INDEX IF NOT EXISTS idx_finale_inventory_facility ON finale_inventory(facility_url);
CREATE INDEX IF NOT EXISTS idx_finale_inventory_available ON finale_inventory(quantity_available);
CREATE INDEX IF NOT EXISTS idx_finale_inventory_synced ON finale_inventory(synced_at);

-- Vendors
CREATE INDEX IF NOT EXISTS idx_finale_vendors_url ON finale_vendors(finale_party_url);
CREATE INDEX IF NOT EXISTS idx_finale_vendors_name ON finale_vendors(party_name);
CREATE INDEX IF NOT EXISTS idx_finale_vendors_synced ON finale_vendors(synced_at);

-- Purchase Orders
CREATE INDEX IF NOT EXISTS idx_finale_pos_url ON finale_purchase_orders(finale_order_url);
CREATE INDEX IF NOT EXISTS idx_finale_pos_vendor ON finale_purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_finale_pos_status ON finale_purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_finale_pos_expected_date ON finale_purchase_orders(expected_date);
CREATE INDEX IF NOT EXISTS idx_finale_pos_delivery_status ON finale_purchase_orders(delivery_status);
CREATE INDEX IF NOT EXISTS idx_finale_pos_synced ON finale_purchase_orders(synced_at);

-- PO Line Items
CREATE INDEX IF NOT EXISTS idx_finale_po_lines_po ON finale_po_line_items(po_id);
CREATE INDEX IF NOT EXISTS idx_finale_po_lines_product ON finale_po_line_items(product_id);

-- Stock History
CREATE INDEX IF NOT EXISTS idx_finale_stock_history_product ON finale_stock_history(finale_product_url);
CREATE INDEX IF NOT EXISTS idx_finale_stock_history_date ON finale_stock_history(transaction_date);
CREATE INDEX IF NOT EXISTS idx_finale_stock_history_type ON finale_stock_history(transaction_type);
CREATE INDEX IF NOT EXISTS idx_finale_stock_history_synced ON finale_stock_history(synced_at);

-- BOMs
CREATE INDEX IF NOT EXISTS idx_finale_boms_url ON finale_boms(finale_bom_url);
CREATE INDEX IF NOT EXISTS idx_finale_boms_parent ON finale_boms(parent_product_id);
CREATE INDEX IF NOT EXISTS idx_finale_boms_component ON finale_boms(component_product_id);
CREATE INDEX IF NOT EXISTS idx_finale_boms_synced ON finale_boms(synced_at);

-- Facilities
CREATE INDEX IF NOT EXISTS idx_finale_facilities_url ON finale_facilities(finale_facility_url);
CREATE INDEX IF NOT EXISTS idx_finale_facilities_synced ON finale_facilities(synced_at);

-- =============================================
-- RLS POLICIES (Row Level Security)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE finale_custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finale_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE finale_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE finale_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE finale_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE finale_po_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE finale_stock_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE finale_boms ENABLE ROW LEVEL SECURITY;
ALTER TABLE finale_facilities ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all Finale data
CREATE POLICY "Allow authenticated read finale_custom_field_definitions" ON finale_custom_field_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read finale_products" ON finale_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read finale_inventory" ON finale_inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read finale_vendors" ON finale_vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read finale_purchase_orders" ON finale_purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read finale_po_line_items" ON finale_po_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read finale_stock_history" ON finale_stock_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read finale_boms" ON finale_boms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read finale_facilities" ON finale_facilities FOR SELECT TO authenticated USING (true);

-- Allow service role full access (for sync operations)
CREATE POLICY "Allow service role full access finale_custom_field_definitions" ON finale_custom_field_definitions FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role full access finale_products" ON finale_products FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role full access finale_inventory" ON finale_inventory FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role full access finale_vendors" ON finale_vendors FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role full access finale_purchase_orders" ON finale_purchase_orders FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role full access finale_po_line_items" ON finale_po_line_items FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role full access finale_stock_history" ON finale_stock_history FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role full access finale_boms" ON finale_boms FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role full access finale_facilities" ON finale_facilities FOR ALL TO service_role USING (true);

-- =============================================
-- SUCCESS MESSAGE
-- =============================================

DO $$
BEGIN
  RAISE NOTICE '🎯 Finale Integration Schema Migration Complete!';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Tables created:';
  RAISE NOTICE '  ✓ finale_custom_field_definitions';
  RAISE NOTICE '  ✓ finale_products';
  RAISE NOTICE '  ✓ finale_inventory';
  RAISE NOTICE '  ✓ finale_vendors';
  RAISE NOTICE '  ✓ finale_purchase_orders';
  RAISE NOTICE '  ✓ finale_po_line_items';
  RAISE NOTICE '  ✓ finale_stock_history';
  RAISE NOTICE '  ✓ finale_boms';
  RAISE NOTICE '  ✓ finale_facilities';
  RAISE NOTICE '';
  RAISE NOTICE '🔧 Indexes and RLS policies configured';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Ready for MRP Intelligence Views (migration 078)';
  RAISE NOTICE '';
END $$;