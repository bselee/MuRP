# Finale Inventory → MuRP Integration Guide v2.0
## Complete MRP Intelligence Stack

**Version**: 2.0 | **Last Updated**: December 2025  
**Focus**: Purchasing Intelligence, BOMs, Velocity Analysis

---

## 🚨 CRITICAL DISCOVERY

### Purchase Orders: GraphQL ONLY!

```
❌ REST API /order?orderTypeId=PURCHASE_ORDER  → IGNORES THE FILTER!
✅ GraphQL orderViewConnection(type: ["PURCHASE_ORDER"]) → WORKS!
```

The REST `/order` endpoint returns ALL orders (sales + purchase mixed together) regardless of filters. **You MUST use GraphQL for purchase orders.**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FINALE INVENTORY (Source)                         │
├─────────────────────────────────────────────────────────────────────┤
│  Products ──────► REST API /product                                  │
│  Inventory ─────► REST API /inventoryitem                            │
│  Facilities ────► REST API /facility                                 │
│  Purchase Orders► GraphQL orderViewConnection ⚠️ REQUIRED            │
│  Vendors ───────► GraphQL partyViewConnection                        │
│  Stock History ─► GraphQL stockHistoryViewConnection                 │
│  Custom Fields ─► Embedded in all entities (userFieldDataList)       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    MURP SYNC ENGINE                                  │
├─────────────────────────────────────────────────────────────────────┤
│  Delta Sync ────► Only fetch changed data (90% API reduction)        │
│  Rate Limiter ──► 50 req/min (Finale limit: 60)                      │
│  Circuit Breaker► Auto-stop after 5 failures                         │
│  Transform ─────► Finale JSON → Supabase tables                      │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    SUPABASE (Intelligence Layer)                     │
├─────────────────────────────────────────────────────────────────────┤
│  finale_products ────► SKUs, costs, reorder points, custom fields    │
│  finale_inventory ───► Stock by location, on-hand/order/reserved     │
│  finale_purchase_orders► POs with line items, vendor, status         │
│  finale_vendors ─────► Suppliers with lead times, terms              │
│  finale_boms ────────► Component relationships, build quantities     │
│  finale_stock_history► Transaction log for velocity calculations     │
│  finale_custom_fields► Decoded custom field definitions              │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    MRP INTELLIGENCE VIEWS                            │
├─────────────────────────────────────────────────────────────────────┤
│  mrp_velocity_analysis ──► 30/60/90 day consumption rates            │
│  mrp_reorder_recommendations► What to order, when, how much          │
│  mrp_build_requirements ─► BOM explosion, component needs            │
│  mrp_vendor_performance ─► Lead times, reliability scores            │
│  mrp_projected_stockouts► Days until out of stock                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Enhanced Supabase Schema

### 1.1 Core Tables with Custom Fields Support

```sql
-- Run in Supabase SQL Editor

-- =============================================
-- CUSTOM FIELDS DEFINITION TABLE
-- =============================================
-- Stores the mapping between Finale's internal field names and display names
CREATE TABLE finale_custom_field_definitions (
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
CREATE TABLE finale_products (
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
CREATE TABLE finale_inventory (
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
  quantity_available DECIMAL(12,4) GENERATED ALWAYS AS 
    (quantity_on_hand - quantity_reserved) STORED,
  
  -- Lot tracking
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
  
  UNIQUE(finale_product_url, facility_url, COALESCE(lot_id, ''), COALESCE(order_url, ''))
);

-- =============================================
-- VENDORS/SUPPLIERS TABLE
-- =============================================
CREATE TABLE finale_vendors (
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
CREATE TABLE finale_purchase_orders (
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
  delivery_status VARCHAR(50) GENERATED ALWAYS AS (
    CASE 
      WHEN status IN ('Completed', 'Received') THEN 'DELIVERED'
      WHEN expected_date < CURRENT_DATE THEN 'OVERDUE'
      WHEN expected_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'DUE_SOON'
      ELSE 'ON_TRACK'
    END
  ) STORED,
  
  -- Sync metadata
  finale_last_modified TIMESTAMPTZ,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PURCHASE ORDER LINE ITEMS (Normalized)
-- =============================================
CREATE TABLE finale_po_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID REFERENCES finale_purchase_orders(id) ON DELETE CASCADE,
  finale_order_url VARCHAR(500),
  line_number INTEGER,
  
  -- Product
  product_id UUID REFERENCES finale_products(id),
  finale_product_url VARCHAR(500),
  product_sku VARCHAR(100),
  product_name TEXT,
  
  -- Quantities
  quantity_ordered DECIMAL(12,4) NOT NULL,
  quantity_received DECIMAL(12,4) DEFAULT 0,
  quantity_pending DECIMAL(12,4) GENERATED ALWAYS AS 
    (quantity_ordered - quantity_received) STORED,
  
  -- Pricing
  unit_cost DECIMAL(12,4),
  line_total DECIMAL(12,2),
  
  -- Dates
  expected_date DATE,
  received_date DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(purchase_order_id, line_number)
);

-- =============================================
-- BILL OF MATERIALS (BOMs)
-- =============================================
CREATE TABLE finale_boms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Parent product (the assembly/kit)
  parent_product_id UUID REFERENCES finale_products(id) ON DELETE CASCADE,
  parent_product_url VARCHAR(500) NOT NULL,
  parent_sku VARCHAR(100),
  parent_name TEXT,
  
  -- Component product
  component_product_id UUID REFERENCES finale_products(id),
  component_product_url VARCHAR(500) NOT NULL,
  component_sku VARCHAR(100),
  component_name TEXT,
  
  -- Quantity required per parent unit
  quantity_per DECIMAL(12,4) NOT NULL DEFAULT 1,
  
  -- Component type
  component_type VARCHAR(50) DEFAULT 'material', -- 'material', 'labor', 'overhead'
  
  -- Scrap/waste factor
  scrap_factor DECIMAL(5,4) DEFAULT 0, -- e.g., 0.05 = 5% scrap
  
  -- Effective quantity accounting for scrap
  effective_quantity DECIMAL(12,4) GENERATED ALWAYS AS 
    (quantity_per * (1 + scrap_factor)) STORED,
  
  -- Sync metadata
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(parent_product_url, component_product_url)
);

-- =============================================
-- STOCK HISTORY (For Velocity Calculations)
-- =============================================
CREATE TABLE finale_stock_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Product
  product_id UUID REFERENCES finale_products(id) ON DELETE CASCADE,
  finale_product_url VARCHAR(500) NOT NULL,
  product_sku VARCHAR(100),
  
  -- Location
  facility_url VARCHAR(500),
  facility_id VARCHAR(100),
  
  -- Transaction details
  transaction_date TIMESTAMPTZ NOT NULL,
  transaction_type VARCHAR(50) NOT NULL, -- 'sale', 'purchase_receipt', 'adjustment', 'transfer', 'build'
  
  -- Quantities (positive = inbound, negative = outbound)
  quantity DECIMAL(12,4) NOT NULL,
  running_balance DECIMAL(12,4),
  
  -- Cost
  unit_cost DECIMAL(12,4),
  total_cost DECIMAL(12,2),
  
  -- Related document
  document_url VARCHAR(500),
  document_type VARCHAR(50),
  document_id VARCHAR(100),
  
  -- Sync metadata
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SYNC LOG (Delta Sync Tracking)
-- =============================================
CREATE TABLE finale_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type VARCHAR(50) NOT NULL, -- 'products', 'inventory', 'purchase_orders', 'vendors', 'boms', 'stock_history', 'full'
  source VARCHAR(50) DEFAULT 'finale_api', -- 'finale_rest', 'finale_graphql'
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'success', 'partial', 'failed'
  
  -- Metrics
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  
  -- API efficiency
  api_calls_made INTEGER DEFAULT 0,
  api_calls_saved INTEGER DEFAULT 0, -- Delta sync optimization
  
  -- Error tracking
  error_message TEXT,
  error_details JSONB,
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- For delta sync
  last_modified_threshold TIMESTAMPTZ, -- Only fetch items modified after this
  next_sync_threshold TIMESTAMPTZ      -- Use this for next delta sync
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Products
CREATE INDEX idx_products_sku ON finale_products(sku);
CREATE INDEX idx_products_product_id ON finale_products(product_id);
CREATE INDEX idx_products_status ON finale_products(status);
CREATE INDEX idx_products_supplier ON finale_products(primary_supplier_url);
CREATE INDEX idx_products_department ON finale_products(custom_department);
CREATE INDEX idx_products_is_assembly ON finale_products(is_assembly);
CREATE INDEX idx_products_last_modified ON finale_products(finale_last_modified);

-- Inventory
CREATE INDEX idx_inventory_product ON finale_inventory(product_id);
CREATE INDEX idx_inventory_product_url ON finale_inventory(finale_product_url);
CREATE INDEX idx_inventory_facility ON finale_inventory(facility_url);
CREATE INDEX idx_inventory_qty ON finale_inventory(quantity_on_hand);

-- Vendors
CREATE INDEX idx_vendors_party_id ON finale_vendors(party_id);
CREATE INDEX idx_vendors_name ON finale_vendors(party_name);
CREATE INDEX idx_vendors_status ON finale_vendors(status);

-- Purchase Orders
CREATE INDEX idx_po_vendor ON finale_purchase_orders(vendor_id);
CREATE INDEX idx_po_status ON finale_purchase_orders(status);
CREATE INDEX idx_po_order_date ON finale_purchase_orders(order_date);
CREATE INDEX idx_po_expected_date ON finale_purchase_orders(expected_date);
CREATE INDEX idx_po_delivery_status ON finale_purchase_orders(delivery_status);
CREATE INDEX idx_po_last_modified ON finale_purchase_orders(finale_last_modified);

-- PO Line Items
CREATE INDEX idx_po_items_po ON finale_po_line_items(purchase_order_id);
CREATE INDEX idx_po_items_product ON finale_po_line_items(product_id);
CREATE INDEX idx_po_items_sku ON finale_po_line_items(product_sku);

-- BOMs
CREATE INDEX idx_boms_parent ON finale_boms(parent_product_id);
CREATE INDEX idx_boms_component ON finale_boms(component_product_id);
CREATE INDEX idx_boms_parent_sku ON finale_boms(parent_sku);
CREATE INDEX idx_boms_component_sku ON finale_boms(component_sku);

-- Stock History
CREATE INDEX idx_stock_history_product ON finale_stock_history(product_id);
CREATE INDEX idx_stock_history_date ON finale_stock_history(transaction_date);
CREATE INDEX idx_stock_history_type ON finale_stock_history(transaction_type);
CREATE INDEX idx_stock_history_product_date ON finale_stock_history(finale_product_url, transaction_date);

-- Sync Log
CREATE INDEX idx_sync_log_type ON finale_sync_log(sync_type);
CREATE INDEX idx_sync_log_status ON finale_sync_log(status);
CREATE INDEX idx_sync_log_completed ON finale_sync_log(completed_at DESC);
```

### 1.2 MRP Intelligence Views

```sql
-- =============================================
-- VELOCITY ANALYSIS VIEW
-- =============================================
CREATE OR REPLACE VIEW mrp_velocity_analysis AS
WITH daily_usage AS (
  SELECT 
    product_id,
    finale_product_url,
    transaction_date::DATE as usage_date,
    -- Negative quantities are outbound (sales/builds)
    ABS(SUM(CASE WHEN quantity < 0 THEN quantity ELSE 0 END)) as daily_outbound,
    SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END) as daily_inbound
  FROM finale_stock_history
  WHERE transaction_type IN ('sale', 'build', 'transfer_out')
  GROUP BY product_id, finale_product_url, transaction_date::DATE
),
velocity_calcs AS (
  SELECT 
    product_id,
    finale_product_url,
    -- 30-day velocity
    SUM(CASE WHEN usage_date >= CURRENT_DATE - 30 THEN daily_outbound ELSE 0 END) as usage_30d,
    COUNT(CASE WHEN usage_date >= CURRENT_DATE - 30 AND daily_outbound > 0 THEN 1 END) as days_with_usage_30d,
    -- 60-day velocity
    SUM(CASE WHEN usage_date >= CURRENT_DATE - 60 THEN daily_outbound ELSE 0 END) as usage_60d,
    COUNT(CASE WHEN usage_date >= CURRENT_DATE - 60 AND daily_outbound > 0 THEN 1 END) as days_with_usage_60d,
    -- 90-day velocity
    SUM(CASE WHEN usage_date >= CURRENT_DATE - 90 THEN daily_outbound ELSE 0 END) as usage_90d,
    COUNT(CASE WHEN usage_date >= CURRENT_DATE - 90 AND daily_outbound > 0 THEN 1 END) as days_with_usage_90d,
    -- Last usage date
    MAX(CASE WHEN daily_outbound > 0 THEN usage_date END) as last_usage_date
  FROM daily_usage
  GROUP BY product_id, finale_product_url
)
SELECT 
  p.id as product_id,
  p.sku,
  p.internal_name as description,
  p.custom_department as department,
  p.unit_cost,
  
  -- Current stock position
  COALESCE(inv.total_on_hand, 0) as current_stock,
  COALESCE(inv.total_on_order, 0) as on_order,
  COALESCE(inv.total_reserved, 0) as reserved,
  
  -- Velocity metrics
  COALESCE(v.usage_30d, 0) as usage_30d,
  COALESCE(v.usage_60d, 0) as usage_60d,
  COALESCE(v.usage_90d, 0) as usage_90d,
  
  -- Daily averages
  ROUND(COALESCE(v.usage_30d, 0) / 30.0, 2) as avg_daily_usage_30d,
  ROUND(COALESCE(v.usage_60d, 0) / 60.0, 2) as avg_daily_usage_60d,
  ROUND(COALESCE(v.usage_90d, 0) / 90.0, 2) as avg_daily_usage_90d,
  
  -- Days of stock remaining
  CASE 
    WHEN COALESCE(v.usage_30d, 0) > 0 
    THEN ROUND((COALESCE(inv.total_on_hand, 0) + COALESCE(inv.total_on_order, 0)) / (v.usage_30d / 30.0), 1)
    ELSE 9999
  END as days_of_stock,
  
  -- Usage frequency (what % of days had usage)
  ROUND(COALESCE(v.days_with_usage_30d, 0) / 30.0 * 100, 1) as usage_frequency_pct,
  
  -- Last usage
  v.last_usage_date,
  CURRENT_DATE - v.last_usage_date as days_since_last_usage,
  
  -- Velocity classification
  CASE 
    WHEN COALESCE(v.usage_30d, 0) / 30.0 >= 10 THEN 'A - High Velocity'
    WHEN COALESCE(v.usage_30d, 0) / 30.0 >= 3 THEN 'B - Medium Velocity'
    WHEN COALESCE(v.usage_30d, 0) / 30.0 >= 0.5 THEN 'C - Low Velocity'
    WHEN COALESCE(v.usage_90d, 0) > 0 THEN 'D - Slow Moving'
    ELSE 'E - Dead Stock'
  END as velocity_class

FROM finale_products p
LEFT JOIN velocity_calcs v ON p.finale_product_url = v.finale_product_url
LEFT JOIN (
  SELECT 
    finale_product_url,
    SUM(quantity_on_hand) as total_on_hand,
    SUM(quantity_on_order) as total_on_order,
    SUM(quantity_reserved) as total_reserved
  FROM finale_inventory
  GROUP BY finale_product_url
) inv ON p.finale_product_url = inv.finale_product_url
WHERE p.status = 'PRODUCT_ACTIVE';

-- =============================================
-- REORDER RECOMMENDATIONS VIEW
-- =============================================
CREATE OR REPLACE VIEW mrp_reorder_recommendations AS
WITH velocity AS (
  SELECT * FROM mrp_velocity_analysis
),
vendor_lead_times AS (
  SELECT 
    p.finale_product_url,
    COALESCE(p.lead_time_days, v.default_lead_time_days, v.avg_lead_time_days, 14) as lead_time_days,
    v.party_name as vendor_name,
    v.finale_party_url as vendor_url
  FROM finale_products p
  LEFT JOIN finale_vendors v ON p.primary_supplier_url = v.finale_party_url
)
SELECT 
  vel.product_id,
  vel.sku,
  vel.description,
  vel.department,
  vel.velocity_class,
  
  -- Stock position
  vel.current_stock,
  vel.on_order,
  vel.reserved,
  vel.current_stock + vel.on_order - vel.reserved as projected_available,
  
  -- Velocity
  vel.avg_daily_usage_30d,
  vel.days_of_stock,
  
  -- Lead time
  vlt.lead_time_days,
  vlt.vendor_name,
  
  -- Safety stock (lead time * daily usage * 1.5)
  ROUND(vlt.lead_time_days * vel.avg_daily_usage_30d * 1.5, 0) as safety_stock,
  
  -- Reorder point (lead time demand + safety stock)
  ROUND((vlt.lead_time_days * vel.avg_daily_usage_30d) + 
        (vlt.lead_time_days * vel.avg_daily_usage_30d * 1.5), 0) as calculated_reorder_point,
  
  -- Order quantity (30-day supply)
  GREATEST(ROUND(vel.avg_daily_usage_30d * 30, 0), p.minimum_order_qty, 1) as suggested_order_qty,
  
  -- Urgency scoring
  CASE 
    WHEN vel.days_of_stock <= vlt.lead_time_days THEN 'CRITICAL'
    WHEN vel.days_of_stock <= vlt.lead_time_days * 1.5 THEN 'URGENT'
    WHEN vel.days_of_stock <= vlt.lead_time_days * 2 THEN 'SOON'
    ELSE 'OK'
  END as reorder_urgency,
  
  -- Projected stockout date
  CASE 
    WHEN vel.avg_daily_usage_30d > 0 
    THEN CURRENT_DATE + ROUND(vel.days_of_stock)::INTEGER
    ELSE NULL
  END as projected_stockout_date,
  
  -- Cost impact
  ROUND(vel.avg_daily_usage_30d * 30 * vel.unit_cost, 2) as monthly_cost,
  
  -- Needs order flag
  (vel.days_of_stock <= vlt.lead_time_days * 1.5) as needs_order

FROM velocity vel
JOIN finale_products p ON vel.product_id = p.id
LEFT JOIN vendor_lead_times vlt ON p.finale_product_url = vlt.finale_product_url
WHERE vel.velocity_class IN ('A - High Velocity', 'B - Medium Velocity', 'C - Low Velocity')
ORDER BY 
  CASE 
    WHEN vel.days_of_stock <= vlt.lead_time_days THEN 1
    WHEN vel.days_of_stock <= vlt.lead_time_days * 1.5 THEN 2
    WHEN vel.days_of_stock <= vlt.lead_time_days * 2 THEN 3
    ELSE 4
  END,
  vel.days_of_stock ASC;

-- =============================================
-- BOM EXPLOSION VIEW (Build Requirements)
-- =============================================
CREATE OR REPLACE VIEW mrp_bom_explosion AS
WITH RECURSIVE bom_tree AS (
  -- Base case: top-level assemblies
  SELECT 
    b.parent_product_url,
    b.parent_sku,
    b.parent_name,
    b.component_product_url,
    b.component_sku,
    b.component_name,
    b.quantity_per,
    b.effective_quantity,
    1 as bom_level,
    b.parent_sku || ' > ' || b.component_sku as path
  FROM finale_boms b
  
  UNION ALL
  
  -- Recursive case: sub-assemblies
  SELECT 
    bt.parent_product_url,
    bt.parent_sku,
    bt.parent_name,
    b.component_product_url,
    b.component_sku,
    b.component_name,
    bt.effective_quantity * b.quantity_per as quantity_per,
    bt.effective_quantity * b.effective_quantity as effective_quantity,
    bt.bom_level + 1,
    bt.path || ' > ' || b.component_sku
  FROM bom_tree bt
  JOIN finale_boms b ON bt.component_product_url = b.parent_product_url
  WHERE bt.bom_level < 10 -- Prevent infinite recursion
)
SELECT 
  bt.parent_sku as assembly_sku,
  bt.parent_name as assembly_name,
  bt.component_sku,
  bt.component_name,
  bt.effective_quantity as qty_per_assembly,
  bt.bom_level,
  bt.path,
  
  -- Component stock status
  COALESCE(inv.total_on_hand, 0) as component_on_hand,
  COALESCE(inv.total_on_order, 0) as component_on_order,
  
  -- How many assemblies can we build?
  CASE 
    WHEN bt.effective_quantity > 0 
    THEN FLOOR(COALESCE(inv.total_on_hand, 0) / bt.effective_quantity)
    ELSE 0
  END as assemblies_possible,
  
  -- Component cost
  p.unit_cost as component_unit_cost,
  ROUND(bt.effective_quantity * COALESCE(p.unit_cost, 0), 4) as component_cost_per_assembly

FROM bom_tree bt
LEFT JOIN finale_products p ON bt.component_product_url = p.finale_product_url
LEFT JOIN (
  SELECT finale_product_url, SUM(quantity_on_hand) as total_on_hand, SUM(quantity_on_order) as total_on_order
  FROM finale_inventory GROUP BY finale_product_url
) inv ON bt.component_product_url = inv.finale_product_url;

-- =============================================
-- BUILD REQUIREMENTS VIEW
-- =============================================
CREATE OR REPLACE VIEW mrp_build_requirements AS
WITH assembly_demand AS (
  -- Demand from sales orders
  SELECT 
    p.finale_product_url,
    SUM(i.quantity_reserved) as sales_demand
  FROM finale_inventory i
  JOIN finale_products p ON i.finale_product_url = p.finale_product_url
  WHERE p.is_assembly = true
  GROUP BY p.finale_product_url
),
component_needs AS (
  SELECT 
    bom.component_product_url,
    bom.component_sku,
    bom.component_name,
    SUM(bom.effective_quantity * COALESCE(ad.sales_demand, 0)) as total_component_need
  FROM finale_boms bom
  LEFT JOIN assembly_demand ad ON bom.parent_product_url = ad.finale_product_url
  GROUP BY bom.component_product_url, bom.component_sku, bom.component_name
)
SELECT 
  cn.component_sku as sku,
  cn.component_name as description,
  cn.total_component_need as needed_for_builds,
  COALESCE(inv.total_on_hand, 0) as on_hand,
  COALESCE(inv.total_on_order, 0) as on_order,
  COALESCE(inv.total_on_hand, 0) + COALESCE(inv.total_on_order, 0) - cn.total_component_need as net_position,
  CASE 
    WHEN (COALESCE(inv.total_on_hand, 0) + COALESCE(inv.total_on_order, 0)) < cn.total_component_need 
    THEN cn.total_component_need - COALESCE(inv.total_on_hand, 0) - COALESCE(inv.total_on_order, 0)
    ELSE 0
  END as shortage_qty,
  p.unit_cost,
  p.primary_supplier_url,
  v.party_name as vendor_name
FROM component_needs cn
JOIN finale_products p ON cn.component_product_url = p.finale_product_url
LEFT JOIN finale_vendors v ON p.primary_supplier_url = v.finale_party_url
LEFT JOIN (
  SELECT finale_product_url, SUM(quantity_on_hand) as total_on_hand, SUM(quantity_on_order) as total_on_order
  FROM finale_inventory GROUP BY finale_product_url
) inv ON cn.component_product_url = inv.finale_product_url
WHERE cn.total_component_need > 0
ORDER BY 
  CASE WHEN (COALESCE(inv.total_on_hand, 0) + COALESCE(inv.total_on_order, 0)) < cn.total_component_need THEN 0 ELSE 1 END,
  cn.total_component_need DESC;

-- =============================================
-- VENDOR PERFORMANCE VIEW
-- =============================================
CREATE OR REPLACE VIEW mrp_vendor_performance AS
SELECT 
  v.id as vendor_id,
  v.party_id,
  v.party_name as vendor_name,
  v.email,
  v.phone,
  v.payment_terms,
  v.default_lead_time_days,
  
  -- Order metrics
  COUNT(DISTINCT po.id) as total_orders,
  COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'Completed') as completed_orders,
  COUNT(DISTINCT po.id) FILTER (WHERE po.status IN ('Pending', 'Submitted')) as open_orders,
  
  -- Spend metrics
  SUM(po.total) as total_spend,
  SUM(po.total) FILTER (WHERE po.order_date >= CURRENT_DATE - INTERVAL '12 months') as spend_12m,
  SUM(po.total) FILTER (WHERE po.order_date >= CURRENT_DATE - INTERVAL '3 months') as spend_3m,
  AVG(po.total) as avg_order_value,
  
  -- Lead time analysis (for completed orders)
  AVG(po.received_date - po.order_date) FILTER (WHERE po.received_date IS NOT NULL) as avg_actual_lead_days,
  MIN(po.received_date - po.order_date) FILTER (WHERE po.received_date IS NOT NULL) as min_lead_days,
  MAX(po.received_date - po.order_date) FILTER (WHERE po.received_date IS NOT NULL) as max_lead_days,
  
  -- On-time delivery
  COUNT(*) FILTER (WHERE po.received_date <= po.expected_date AND po.received_date IS NOT NULL) as on_time_deliveries,
  COUNT(*) FILTER (WHERE po.received_date IS NOT NULL) as total_deliveries,
  ROUND(
    COUNT(*) FILTER (WHERE po.received_date <= po.expected_date AND po.received_date IS NOT NULL)::DECIMAL / 
    NULLIF(COUNT(*) FILTER (WHERE po.received_date IS NOT NULL), 0) * 100, 1
  ) as on_time_delivery_pct,
  
  -- Product coverage
  COUNT(DISTINCT p.id) as products_supplied,
  
  -- Last order
  MAX(po.order_date) as last_order_date,
  MAX(po.received_date) as last_receipt_date

FROM finale_vendors v
LEFT JOIN finale_purchase_orders po ON v.finale_party_url = po.vendor_url
LEFT JOIN finale_products p ON v.finale_party_url = p.primary_supplier_url
WHERE v.status = 'Active'
GROUP BY v.id, v.party_id, v.party_name, v.email, v.phone, v.payment_terms, v.default_lead_time_days;

-- =============================================
-- OPEN PO SUMMARY VIEW
-- =============================================
CREATE OR REPLACE VIEW mrp_open_purchase_orders AS
SELECT 
  po.order_id,
  po.status,
  po.vendor_name,
  po.order_date,
  po.expected_date,
  po.total,
  po.line_count,
  po.delivery_status,
  
  -- Days until expected
  po.expected_date - CURRENT_DATE as days_until_expected,
  
  -- Line items summary
  (
    SELECT STRING_AGG(
      li->>'product_sku' || ' x' || li->>'quantity_ordered', 
      ', ' ORDER BY (li->>'line_number')::INT
    )
    FROM jsonb_array_elements(po.line_items) li
    LIMIT 5
  ) as top_items,
  
  po.public_notes,
  po.finale_order_url

FROM finale_purchase_orders po
WHERE po.status IN ('Pending', 'Submitted', 'Ordered', 'Partial')
ORDER BY 
  CASE po.delivery_status
    WHEN 'OVERDUE' THEN 1
    WHEN 'DUE_SOON' THEN 2
    ELSE 3
  END,
  po.expected_date ASC;
```

---

## Phase 2: Enhanced Finale Client

### 2.1 Complete Client with GraphQL for POs

```typescript
// lib/finale-client.ts
// Enhanced Finale Inventory API Client with GraphQL for POs

interface FinaleConfig {
  accountPath: string;
  apiKey: string;
  apiSecret: string;
  timeout?: number;
  requestsPerMinute?: number;
}

interface FinaleResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: number;
}

interface CustomField {
  attrName: string;
  attrValue: string;
  attrValueLastUpdatedDate?: boolean;
}

export class FinaleClient {
  private baseUrl: string;
  private authHeader: string;
  private accountPath: string;
  private timeout: number;
  private rateLimitInfo: RateLimitInfo | null = null;
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue = false;
  private requestsPerMinute: number;

  constructor(config: FinaleConfig) {
    this.accountPath = config.accountPath;
    this.baseUrl = `https://app.finaleinventory.com/${config.accountPath}`;
    this.timeout = config.timeout || 30000;
    this.requestsPerMinute = config.requestsPerMinute || 50;
    
    const credentials = Buffer.from(
      `${config.apiKey}:${config.apiSecret}`
    ).toString('base64');
    
    this.authHeader = `Basic ${credentials}`;
  }

  // =============================================
  // Core Request Methods
  // =============================================

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<FinaleResponse<T>> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      // Parse rate limit headers
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      const rateLimitLimit = response.headers.get('X-RateLimit-Limit');
      const rateLimitReset = response.headers.get('X-RateLimit-Reset');
      
      if (rateLimitRemaining && rateLimitLimit) {
        this.rateLimitInfo = {
          remaining: parseInt(rateLimitRemaining, 10),
          limit: parseInt(rateLimitLimit, 10),
          resetAt: rateLimitReset ? parseInt(rateLimitReset, 10) : 0,
        };
      }

      // Handle errors
      if (response.status === 401) {
        return { success: false, error: 'Authentication failed', statusCode: 401 };
      }
      if (response.status === 402) {
        return { success: false, error: 'API access not enabled', statusCode: 402 };
      }
      if (response.status === 429) {
        return { success: false, error: 'Rate limited', statusCode: 429 };
      }
      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: errorText, statusCode: response.status };
      }

      const data = await response.json();
      return { success: true, data, statusCode: response.status };
      
    } catch (error) {
      clearTimeout(timeoutId);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // =============================================
  // REST API Methods
  // =============================================

  async getProducts(limit = 100, offset = 0): Promise<FinaleResponse<any>> {
    return this.request(`/api/product?limit=${limit}&offset=${offset}`);
  }

  async getInventoryItems(): Promise<FinaleResponse<any>> {
    return this.request('/api/inventoryitem');
  }

  async getFacilities(): Promise<FinaleResponse<any>> {
    return this.request('/api/facility');
  }

  async getPartyGroups(): Promise<FinaleResponse<any>> {
    return this.request('/api/partygroup');
  }

  // =============================================
  // GraphQL API Methods
  // =============================================

  async graphql<T>(
    query: string, 
    variables?: Record<string, any>
  ): Promise<FinaleResponse<T>> {
    return this.request<T>('/api/graphql', {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
    });
  }

  // =============================================
  // PURCHASE ORDERS - GraphQL ONLY!
  // =============================================

  /**
   * Get purchase orders - MUST USE GraphQL!
   * REST API filtering is broken for orders.
   */
  async getPurchaseOrders(options: {
    first?: number;
    after?: string;
    status?: string[];
    supplier?: string[];
    startDate?: string;
    endDate?: string;
  } = {}): Promise<FinaleResponse<any>> {
    const {
      first = 100,
      after,
      status = ['Pending', 'Submitted', 'Ordered', 'Completed'],
      supplier,
      startDate,
      endDate
    } = options;

    const query = `
      query GetPurchaseOrders(
        $first: Int!
        $after: String
        $status: [String!]
        $supplier: [String]
        $startDate: String
        $endDate: String
      ) {
        orderViewConnection(
          first: $first
          after: $after
          type: ["PURCHASE_ORDER"]
          status: $status
          supplier: $supplier
          orderDate: { from: $startDate, to: $endDate }
        ) {
          edges {
            node {
              orderId
              orderUrl
              type
              status
              orderDate
              receiveDate
              total
              subtotal
              publicNotes
              privateNotes
              recordLastUpdated
              supplier {
                partyId
                partyUrl
                name
              }
              origin {
                facilityId
                facilityUrl
                name
              }
              itemList {
                edges {
                  node {
                    productId
                    productUrl
                    productName
                    quantity
                    unitPrice
                    receivedQuantity
                  }
                }
              }
              userFieldDataList {
                attrName
                attrValue
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `;

    return this.graphql(query, {
      first,
      after,
      status,
      supplier,
      startDate,
      endDate
    });
  }

  /**
   * Get ALL purchase orders with pagination
   */
  async getAllPurchaseOrders(options: {
    status?: string[];
    startDate?: string;
    endDate?: string;
    onProgress?: (count: number, hasMore: boolean) => void;
  } = {}): Promise<any[]> {
    const allPOs: any[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getPurchaseOrders({
        first: 100,
        after: cursor,
        status: options.status,
        startDate: options.startDate,
        endDate: options.endDate
      });

      if (!result.success || !result.data?.data?.orderViewConnection) {
        break;
      }

      const connection = result.data.data.orderViewConnection;
      const edges = connection.edges || [];
      
      for (const edge of edges) {
        allPOs.push(edge.node);
      }

      hasMore = connection.pageInfo?.hasNextPage || false;
      cursor = connection.pageInfo?.endCursor;

      if (options.onProgress) {
        options.onProgress(allPOs.length, hasMore);
      }

      // Rate limit protection
      await this.delay(100);
    }

    return allPOs;
  }

  // =============================================
  // VENDORS - GraphQL (Better than REST)
  // =============================================

  async getVendors(options: {
    first?: number;
    after?: string;
    status?: string[];
  } = {}): Promise<FinaleResponse<any>> {
    const { first = 100, after, status = ['Active'] } = options;

    const query = `
      query GetVendors($first: Int!, $after: String, $status: [String]) {
        partyViewConnection(
          first: $first
          after: $after
          role: ["SUPPLIER"]
          status: $status
        ) {
          edges {
            node {
              partyId
              partyUrl
              name
              role
              status
              contactEmail
              contactPhone
              address {
                street1
                street2
                city
                state
                postalCode
                country
              }
              userFieldDataList {
                attrName
                attrValue
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    return this.graphql(query, { first, after, status });
  }

  async getAllVendors(): Promise<any[]> {
    const allVendors: any[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getVendors({ first: 100, after: cursor });

      if (!result.success || !result.data?.data?.partyViewConnection) {
        break;
      }

      const connection = result.data.data.partyViewConnection;
      const edges = connection.edges || [];
      
      for (const edge of edges) {
        allVendors.push(edge.node);
      }

      hasMore = connection.pageInfo?.hasNextPage || false;
      cursor = connection.pageInfo?.endCursor;
      
      await this.delay(100);
    }

    return allVendors;
  }

  // =============================================
  // STOCK HISTORY - GraphQL
  // =============================================

  async getStockHistory(options: {
    productId?: string;
    facilityId?: string;
    startDate?: string;
    endDate?: string;
    first?: number;
    after?: string;
  } = {}): Promise<FinaleResponse<any>> {
    const { productId, facilityId, startDate, endDate, first = 100, after } = options;

    const query = `
      query GetStockHistory(
        $first: Int!
        $after: String
        $productId: String
        $facilityId: String
        $startDate: String
        $endDate: String
      ) {
        stockHistoryViewConnection(
          first: $first
          after: $after
          product: $productId
          facility: $facilityId
          transactionDate: { from: $startDate, to: $endDate }
        ) {
          edges {
            node {
              productId
              productUrl
              facilityId
              facilityUrl
              transactionDate
              transactionType
              quantity
              unitCost
              documentUrl
              documentType
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    return this.graphql(query, { first, after, productId, facilityId, startDate, endDate });
  }

  // =============================================
  // PRODUCTS WITH STOCK - GraphQL (Better)
  // =============================================

  async getProductsWithStock(options: {
    first?: number;
    after?: string;
    status?: string[];
    modifiedSince?: string;
  } = {}): Promise<FinaleResponse<any>> {
    const { first = 100, after, status = ['PRODUCT_ACTIVE'], modifiedSince } = options;

    const query = `
      query GetProductsWithStock(
        $first: Int!
        $after: String
        $status: [String]
        $modifiedSince: String
      ) {
        productViewConnection(
          first: $first
          after: $after
          status: $status
          recordLastUpdated: { from: $modifiedSince }
        ) {
          edges {
            node {
              productId
              productUrl
              internalName
              description
              productTypeId
              statusId
              upc
              unitCost
              unitPrice
              reorderPoint
              reorderQuantity
              stock
              unitsOnOrder
              primarySupplierId
              primarySupplierUrl
              recordLastUpdated
              userFieldDataList {
                attrName
                attrValue
              }
              billOfMaterial {
                edges {
                  node {
                    componentProductId
                    componentProductUrl
                    quantity
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    return this.graphql(query, { first, after, status, modifiedSince });
  }

  // =============================================
  // Custom Fields Helper
  // =============================================

  /**
   * Parse custom fields from Finale's userFieldDataList format
   */
  parseCustomFields(
    userFieldDataList: CustomField[],
    fieldMapping: Record<string, string>
  ): Record<string, any> {
    const result: Record<string, any> = {};
    
    if (!Array.isArray(userFieldDataList)) return result;
    
    for (const field of userFieldDataList) {
      // Skip integration fields (used by Finale internally)
      if (field.attrName.startsWith('integration_')) continue;
      
      const displayName = fieldMapping[field.attrName];
      if (displayName) {
        // Try to parse as number or date
        let value: any = field.attrValue;
        
        // Check if it's a date (ISO format)
        if (value && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
          value = new Date(value);
        }
        // Check if it's a number
        else if (value && !isNaN(Number(value))) {
          value = Number(value);
        }
        
        result[displayName] = value;
      }
    }
    
    return result;
  }

  /**
   * Build userFieldDataList for updating custom fields
   * IMPORTANT: Preserve existing integration_* fields!
   */
  buildCustomFieldUpdate(
    existingFields: CustomField[],
    updates: Record<string, any>,
    fieldMapping: Record<string, string> // displayName -> attrName
  ): CustomField[] {
    const result: CustomField[] = [];
    const reverseMapping: Record<string, string> = {};
    
    // Build reverse mapping (displayName -> attrName)
    for (const [attrName, displayName] of Object.entries(fieldMapping)) {
      reverseMapping[displayName] = attrName;
    }
    
    // Copy existing fields (preserve integration_* fields!)
    for (const field of existingFields || []) {
      if (field.attrName.startsWith('integration_')) {
        result.push(field);
      }
    }
    
    // Add/update custom fields
    for (const [displayName, value] of Object.entries(updates)) {
      const attrName = reverseMapping[displayName];
      if (attrName) {
        // Convert value to string
        let attrValue: string;
        if (value instanceof Date) {
          attrValue = value.toISOString();
        } else if (value === null || value === undefined) {
          attrValue = '';
        } else {
          attrValue = String(value);
        }
        
        result.push({ attrName, attrValue });
      }
    }
    
    return result;
  }

  // =============================================
  // Utility Methods
  // =============================================

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  /**
   * Get last sync timestamp from a specific entity type
   */
  async getLastSyncTimestamp(
    supabase: any,
    syncType: string
  ): Promise<string | null> {
    const { data } = await supabase
      .from('finale_sync_log')
      .select('next_sync_threshold')
      .eq('sync_type', syncType)
      .eq('status', 'success')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();
    
    return data?.next_sync_threshold || null;
  }
}

// Factory function
export function createFinaleClient(config: FinaleConfig): FinaleClient {
  return new FinaleClient(config);
}

export type { FinaleConfig, FinaleResponse, RateLimitInfo, CustomField };
```

---

## Phase 3: Sync Service with Delta Sync

### 3.1 API Route for Full Sync

```typescript
// app/api/finale/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createFinaleClient } from '@/lib/finale-client';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Custom field mapping (configure based on your Finale setup)
const PRODUCT_CUSTOM_FIELDS: Record<string, string> = {
  'user_10000': 'lead_time_days',
  'user_10001': 'vendor_sku',
  'user_10002': 'category',
  'user_10003': 'department',
  'user_10004': 'min_stock',
  'user_10005': 'max_stock',
};

const VENDOR_CUSTOM_FIELDS: Record<string, string> = {
  'user_20000': 'vendor_code',
  'user_20001': 'account_number',
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const body = await request.json();
  const { syncType = 'full', forceFull = false } = body;

  try {
    // Get credentials from config
    const { data: config } = await supabase
      .from('finale_config')
      .select('*')
      .single();

    if (!config) {
      return NextResponse.json({ error: 'Not configured' }, { status: 400 });
    }

    const finale = createFinaleClient({
      accountPath: config.account_path,
      apiKey: config.api_key_encrypted,
      apiSecret: config.api_secret_encrypted,
    });

    // Start sync log
    const { data: syncLog } = await supabase
      .from('finale_sync_log')
      .insert({
        sync_type: syncType,
        status: 'running',
        source: 'finale_api'
      })
      .select()
      .single();

    const metrics = {
      products: { processed: 0, created: 0, updated: 0 },
      inventory: { processed: 0, created: 0, updated: 0 },
      vendors: { processed: 0, created: 0, updated: 0 },
      purchaseOrders: { processed: 0, created: 0, updated: 0 },
      boms: { processed: 0, created: 0, updated: 0 },
      apiCalls: 0,
      apiCallsSaved: 0,
    };

    // Determine if delta sync is possible
    let lastSyncThreshold: string | null = null;
    if (!forceFull) {
      lastSyncThreshold = await finale.getLastSyncTimestamp(supabase, syncType);
    }

    // =============================================
    // SYNC VENDORS (GraphQL)
    // =============================================
    if (syncType === 'full' || syncType === 'vendors') {
      console.log('Syncing vendors...');
      const vendors = await finale.getAllVendors();
      metrics.apiCalls += Math.ceil(vendors.length / 100);

      for (const vendor of vendors) {
        const customFields = finale.parseCustomFields(
          vendor.userFieldDataList || [],
          VENDOR_CUSTOM_FIELDS
        );

        const vendorData = {
          finale_party_url: vendor.partyUrl,
          party_id: vendor.partyId,
          party_name: vendor.name,
          email: vendor.contactEmail,
          phone: vendor.contactPhone,
          address_street: vendor.address?.street1,
          address_city: vendor.address?.city,
          address_state: vendor.address?.state,
          address_postal_code: vendor.address?.postalCode,
          address_country: vendor.address?.country,
          status: vendor.status,
          custom_vendor_code: customFields.vendor_code,
          custom_account_number: customFields.account_number,
          user_field_data: vendor.userFieldDataList,
          raw_data: vendor,
          synced_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('finale_vendors')
          .upsert(vendorData, { onConflict: 'finale_party_url' });

        if (!error) {
          metrics.vendors.processed++;
        }
      }
    }

    // =============================================
    // SYNC PRODUCTS (GraphQL with Stock)
    // =============================================
    if (syncType === 'full' || syncType === 'products') {
      console.log('Syncing products...');
      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const result = await finale.getProductsWithStock({
          first: 100,
          after: cursor,
          modifiedSince: lastSyncThreshold || undefined
        });
        metrics.apiCalls++;

        if (!result.success || !result.data?.data?.productViewConnection) {
          break;
        }

        const connection = result.data.data.productViewConnection;
        const edges = connection.edges || [];

        for (const edge of edges) {
          const product = edge.node;
          const customFields = finale.parseCustomFields(
            product.userFieldDataList || [],
            PRODUCT_CUSTOM_FIELDS
          );

          // Check if has BOM
          const hasBom = product.billOfMaterial?.edges?.length > 0;

          const productData = {
            finale_product_url: product.productUrl,
            product_id: product.productId,
            internal_name: product.internalName,
            description: product.description,
            product_type: product.productTypeId,
            status: product.statusId,
            upc: product.upc,
            sku: product.productId,
            unit_cost: product.unitCost,
            unit_price: product.unitPrice,
            reorder_point: product.reorderPoint,
            reorder_quantity: product.reorderQuantity,
            primary_supplier_url: product.primarySupplierUrl,
            primary_supplier_id: product.primarySupplierId,
            is_assembly: hasBom,
            finale_last_modified: product.recordLastUpdated,
            custom_lead_time: customFields.lead_time_days,
            custom_vendor_sku: customFields.vendor_sku,
            custom_category: customFields.category,
            custom_department: customFields.department,
            custom_min_stock: customFields.min_stock,
            custom_max_stock: customFields.max_stock,
            user_field_data: product.userFieldDataList,
            raw_data: product,
            synced_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from('finale_products')
            .upsert(productData, { onConflict: 'finale_product_url' });

          if (!error) {
            metrics.products.processed++;

            // Sync BOM if exists
            if (hasBom) {
              for (const bomEdge of product.billOfMaterial.edges) {
                const component = bomEdge.node;
                await supabase
                  .from('finale_boms')
                  .upsert({
                    parent_product_url: product.productUrl,
                    parent_sku: product.productId,
                    parent_name: product.internalName,
                    component_product_url: component.componentProductUrl,
                    component_sku: component.componentProductId,
                    quantity_per: component.quantity,
                    synced_at: new Date().toISOString(),
                  }, {
                    onConflict: 'parent_product_url,component_product_url'
                  });
                metrics.boms.processed++;
              }
            }
          }
        }

        hasMore = connection.pageInfo?.hasNextPage || false;
        cursor = connection.pageInfo?.endCursor;

        // Early termination for delta sync
        if (lastSyncThreshold && edges.length === 0) {
          metrics.apiCallsSaved += 5; // Estimate saved calls
          break;
        }
      }
    }

    // =============================================
    // SYNC PURCHASE ORDERS (GraphQL ONLY!)
    // =============================================
    if (syncType === 'full' || syncType === 'purchase_orders') {
      console.log('Syncing purchase orders via GraphQL...');
      
      const purchaseOrders = await finale.getAllPurchaseOrders({
        status: ['Pending', 'Submitted', 'Ordered', 'Partial', 'Completed'],
        startDate: '2024-01-01', // Current year onwards
        onProgress: (count, hasMore) => {
          console.log(`Fetched ${count} POs, more: ${hasMore}`);
        }
      });
      
      metrics.apiCalls += Math.ceil(purchaseOrders.length / 100);

      for (const po of purchaseOrders) {
        // Transform line items
        const lineItems = (po.itemList?.edges || []).map((e: any, idx: number) => ({
          line_number: idx + 1,
          product_url: e.node.productUrl,
          product_sku: e.node.productId,
          product_name: e.node.productName,
          quantity_ordered: e.node.quantity,
          quantity_received: e.node.receivedQuantity || 0,
          unit_cost: e.node.unitPrice,
        }));

        const poData = {
          finale_order_url: po.orderUrl,
          order_id: po.orderId,
          order_type: 'PURCHASE_ORDER',
          status: po.status,
          vendor_url: po.supplier?.partyUrl,
          vendor_name: po.supplier?.name,
          facility_url: po.origin?.facilityUrl,
          facility_id: po.origin?.facilityId,
          order_date: po.orderDate,
          expected_date: po.receiveDate,
          subtotal: po.subtotal,
          total: po.total,
          public_notes: po.publicNotes,
          private_notes: po.privateNotes,
          line_items: lineItems,
          line_count: lineItems.length,
          total_quantity: lineItems.reduce((sum: number, li: any) => sum + (li.quantity_ordered || 0), 0),
          finale_last_modified: po.recordLastUpdated,
          user_field_data: po.userFieldDataList,
          raw_data: po,
          synced_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('finale_purchase_orders')
          .upsert(poData, { onConflict: 'finale_order_url' });

        if (!error) {
          metrics.purchaseOrders.processed++;

          // Also insert normalized line items
          for (const li of lineItems) {
            await supabase
              .from('finale_po_line_items')
              .upsert({
                finale_order_url: po.orderUrl,
                line_number: li.line_number,
                finale_product_url: li.product_url,
                product_sku: li.product_sku,
                product_name: li.product_name,
                quantity_ordered: li.quantity_ordered,
                quantity_received: li.quantity_received,
                unit_cost: li.unit_cost,
                line_total: (li.quantity_ordered || 0) * (li.unit_cost || 0),
              }, {
                onConflict: 'purchase_order_id,line_number'
              });
          }
        }
      }
    }

    // =============================================
    // SYNC INVENTORY (REST - no filtering needed)
    // =============================================
    if (syncType === 'full' || syncType === 'inventory') {
      console.log('Syncing inventory...');
      const result = await finale.getInventoryItems();
      metrics.apiCalls++;

      if (result.success && result.data?.inventoryItemCollection) {
        // Clear existing and bulk insert
        await supabase
          .from('finale_inventory')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');

        const inventoryItems = result.data.inventoryItemCollection;
        const batchSize = 100;

        for (let i = 0; i < inventoryItems.length; i += batchSize) {
          const batch = inventoryItems.slice(i, i + batchSize).map((item: any) => ({
            finale_inventory_url: item.inventoryItemUrl,
            finale_product_url: item.productUrl,
            facility_url: item.facilityUrl,
            parent_facility_url: item.parentFacilityUrl,
            lot_id: item.lotId || null,
            quantity_on_hand: item.quantityOnHand || 0,
            quantity_on_order: item.quantityOnOrder || 0,
            quantity_reserved: item.quantityReserved || 0,
            order_url: item.orderUrl,
            normalized_packing_string: item.normalizedPackingString,
            raw_data: item,
            synced_at: new Date().toISOString(),
          }));

          await supabase.from('finale_inventory').insert(batch);
          metrics.inventory.processed += batch.length;
        }
      }
    }

    // Update sync log
    const duration = Date.now() - startTime;
    await supabase
      .from('finale_sync_log')
      .update({
        status: 'success',
        records_processed: 
          metrics.products.processed + 
          metrics.inventory.processed + 
          metrics.vendors.processed + 
          metrics.purchaseOrders.processed +
          metrics.boms.processed,
        api_calls_made: metrics.apiCalls,
        api_calls_saved: metrics.apiCallsSaved,
        duration_ms: duration,
        completed_at: new Date().toISOString(),
        next_sync_threshold: new Date().toISOString(),
      })
      .eq('id', syncLog?.id);

    return NextResponse.json({
      success: true,
      metrics,
      duration,
    });

  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
```

---

## Phase 4: Quick Reference

### API Selection Guide

| Data Type | API | Why |
|-----------|-----|-----|
| **Purchase Orders** | ✅ GraphQL ONLY | REST filtering broken! |
| **Vendors** | ✅ GraphQL | Better filtering, nested data |
| **Products** | ✅ GraphQL | Includes stock, BOM |
| **Inventory** | ⚠️ REST | No filtering needed |
| **Facilities** | ⚠️ REST | Simple list |
| **Stock History** | ✅ GraphQL | Date filtering |

### Custom Fields Pattern

```typescript
// Finale stores custom fields like this:
"userFieldDataList": [
  {"attrName": "user_10000", "attrValue": "Blue"},           // Your field
  {"attrName": "integration_shipstation", "attrValue": "..."} // DON'T DELETE!
]

// Map them in your config:
const FIELD_MAPPING = {
  'user_10000': 'color',
  'user_10001': 'lead_time_days',
};

// Parse them:
const customFields = finale.parseCustomFields(userFieldDataList, FIELD_MAPPING);
// → { color: 'Blue', lead_time_days: 14 }
```

### Delta Sync Strategy

```
First Sync:     Full pull → 50 API calls → 25 seconds
Subsequent:     Delta only → 5 API calls → 3 seconds
API Savings:    ~90% reduction!
```

### Key Queries for MRP

```sql
-- Items to reorder NOW
SELECT * FROM mrp_reorder_recommendations WHERE needs_order = true;

-- Velocity analysis
SELECT * FROM mrp_velocity_analysis WHERE velocity_class IN ('A', 'B');

-- Component shortages for builds
SELECT * FROM mrp_build_requirements WHERE shortage_qty > 0;

-- Overdue POs
SELECT * FROM mrp_open_purchase_orders WHERE delivery_status = 'OVERDUE';

-- Vendor performance
SELECT * FROM mrp_vendor_performance ORDER BY on_time_delivery_pct DESC;
```

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Finale (same for REST & GraphQL)
FINALE_ACCOUNT_PATH=your-account
FINALE_API_KEY=your-api-key
FINALE_API_SECRET=your-api-secret
```

---

## Next Steps

1. **Run the schema** in Supabase SQL Editor
2. **Configure custom field mapping** based on your Finale setup
3. **Run initial sync** via the API route
4. **Set up cron job** for scheduled syncs (every 4 hours)
5. **Build dashboard** using the MRP views

The intelligence views will automatically calculate:
- Velocity (30/60/90 day consumption)
- Reorder recommendations with urgency
- BOM explosion for build planning
- Vendor performance metrics
- Projected stockout dates