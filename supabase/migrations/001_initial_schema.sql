-- Migration: 001_initial_schema.sql
-- Description: Create all core tables for TGF MRP system
-- Created: 2025-10-28

-- =============================================================================
-- EXTENSIONS
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable encryption functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- USERS TABLE
-- =============================================================================
-- Extends Supabase auth.users with application-specific fields

CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Staff' CHECK (role IN ('Admin', 'Manager', 'Staff')),
    department TEXT CHECK (department IN ('Production', 'Purchasing', 'Quality', 'Warehouse', 'Management')),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1 NOT NULL
);

-- Indexes
CREATE INDEX idx_users_email ON users(email) WHERE is_deleted = FALSE;
CREATE INDEX idx_users_role ON users(role) WHERE is_deleted = FALSE;
CREATE INDEX idx_users_department ON users(department) WHERE is_deleted = FALSE;

-- Trigger
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE users IS 'Application users with role-based access control';

-- =============================================================================
-- VENDORS TABLE
-- =============================================================================

CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    contact_emails TEXT[] NOT NULL DEFAULT '{}',
    contact_phone TEXT,
    address TEXT,
    payment_terms TEXT,
    lead_time_days INTEGER CHECK (lead_time_days >= 0),
    notes TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1 NOT NULL
);

-- Indexes
CREATE INDEX idx_vendors_name ON vendors(name) WHERE is_deleted = FALSE;
CREATE INDEX idx_vendors_created_at ON vendors(created_at DESC);

-- Trigger
CREATE TRIGGER update_vendors_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vendors IS 'Supplier/vendor information for procurement';

-- =============================================================================
-- INVENTORY_ITEMS TABLE
-- =============================================================================

CREATE TABLE inventory_items (
    sku TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    on_order INTEGER NOT NULL DEFAULT 0 CHECK (on_order >= 0),
    reorder_point INTEGER NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
    vendor_id UUID REFERENCES vendors(id),
    moq INTEGER NOT NULL DEFAULT 1 CHECK (moq > 0),
    unit_price NUMERIC(12, 2) CHECK (unit_price >= 0),
    unit_of_measure TEXT DEFAULT 'EA',
    location TEXT,
    notes TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1 NOT NULL
);

-- Indexes
CREATE INDEX idx_inventory_sku ON inventory_items(sku) WHERE is_deleted = FALSE;
CREATE INDEX idx_inventory_category ON inventory_items(category) WHERE is_deleted = FALSE;
CREATE INDEX idx_inventory_vendor ON inventory_items(vendor_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_inventory_low_stock ON inventory_items(stock) WHERE stock <= reorder_point AND is_deleted = FALSE;

-- Trigger
CREATE TRIGGER update_inventory_items_updated_at
    BEFORE UPDATE ON inventory_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE inventory_items IS 'Raw materials, components, and finished goods inventory';
COMMENT ON COLUMN inventory_items.stock IS 'Current quantity on hand';
COMMENT ON COLUMN inventory_items.on_order IS 'Quantity currently on order from vendors';
COMMENT ON COLUMN inventory_items.reorder_point IS 'Minimum stock level before reordering';
COMMENT ON COLUMN inventory_items.moq IS 'Minimum order quantity';

-- =============================================================================
-- ARTWORK_FOLDERS TABLE
-- =============================================================================

CREATE TABLE artwork_folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1 NOT NULL
);

-- Indexes
CREATE INDEX idx_artwork_folders_name ON artwork_folders(name) WHERE is_deleted = FALSE;

-- Trigger
CREATE TRIGGER update_artwork_folders_updated_at
    BEFORE UPDATE ON artwork_folders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE artwork_folders IS 'Organizational folders for product artwork files';

-- =============================================================================
-- BILLS_OF_MATERIALS (BOMS) TABLE
-- =============================================================================

CREATE TABLE boms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    finished_sku TEXT UNIQUE NOT NULL REFERENCES inventory_items(sku) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    
    -- Components: [{"sku": "RAW-001", "quantity": 2}, {"sku": "PKG-001", "quantity": 1}]
    components JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Artwork: [{"id": "uuid", "fileName": "label.pdf", "revision": 1, "url": "...", "folderId": "uuid"}]
    artwork JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Packaging: {"bagType": "poly", "labelType": "thermal", "boxType": "corrugated"}
    packaging JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    barcode TEXT,
    production_notes TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1 NOT NULL,
    
    -- Constraints
    CONSTRAINT bom_components_valid CHECK (jsonb_typeof(components) = 'array'),
    CONSTRAINT bom_artwork_valid CHECK (jsonb_typeof(artwork) = 'array'),
    CONSTRAINT bom_packaging_valid CHECK (jsonb_typeof(packaging) = 'object')
);

-- Indexes
CREATE INDEX idx_boms_finished_sku ON boms(finished_sku) WHERE is_deleted = FALSE;
CREATE INDEX idx_boms_name ON boms(name) WHERE is_deleted = FALSE;
CREATE INDEX idx_boms_components ON boms USING GIN(components);

-- Trigger
CREATE TRIGGER update_boms_updated_at
    BEFORE UPDATE ON boms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE boms IS 'Bill of materials - defines components needed to build finished goods';
COMMENT ON COLUMN boms.components IS 'JSON array of components with SKU and quantity';
COMMENT ON COLUMN boms.artwork IS 'JSON array of artwork files with metadata';
COMMENT ON COLUMN boms.packaging IS 'JSON object describing packaging specifications';

-- =============================================================================
-- PURCHASE_ORDERS TABLE
-- =============================================================================

CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_number TEXT UNIQUE NOT NULL,
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Submitted', 'Fulfilled', 'Cancelled')),
    
    -- Items: [{"sku": "RAW-001", "quantity": 100, "price": 10.50, "lineTotal": 1050.00}]
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    shipping_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    
    requisition_ids UUID[] DEFAULT '{}',
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    notes TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1 NOT NULL,
    
    -- Constraints
    CONSTRAINT po_items_valid CHECK (jsonb_typeof(items) = 'array'),
    CONSTRAINT po_totals_match CHECK (total_amount = subtotal + tax_amount + shipping_cost)
);

-- Indexes
CREATE INDEX idx_po_number ON purchase_orders(po_number) WHERE is_deleted = FALSE;
CREATE INDEX idx_po_vendor ON purchase_orders(vendor_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_po_status ON purchase_orders(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_po_created_at ON purchase_orders(created_at DESC);
CREATE INDEX idx_po_items ON purchase_orders USING GIN(items);

-- Trigger
CREATE TRIGGER update_purchase_orders_updated_at
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE purchase_orders IS 'Purchase orders to vendors for inventory procurement';
COMMENT ON COLUMN purchase_orders.items IS 'JSON array of order line items';

-- =============================================================================
-- REQUISITIONS TABLE
-- =============================================================================

CREATE TABLE requisitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requisition_number TEXT UNIQUE NOT NULL,
    requester_id UUID NOT NULL REFERENCES users(id),
    department TEXT,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Processed')),
    
    -- Items: [{"sku": "RAW-001", "quantity": 50, "reason": "Production shortage"}]
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    reason TEXT,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    po_id UUID REFERENCES purchase_orders(id),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1 NOT NULL,
    
    -- Constraints
    CONSTRAINT req_items_valid CHECK (jsonb_typeof(items) = 'array')
);

-- Indexes
CREATE INDEX idx_req_number ON requisitions(requisition_number) WHERE is_deleted = FALSE;
CREATE INDEX idx_req_requester ON requisitions(requester_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_req_status ON requisitions(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_req_department ON requisitions(department) WHERE is_deleted = FALSE;
CREATE INDEX idx_req_created_at ON requisitions(created_at DESC);

-- Trigger
CREATE TRIGGER update_requisitions_updated_at
    BEFORE UPDATE ON requisitions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE requisitions IS 'Internal material requisitions requiring approval';

-- =============================================================================
-- BUILD_ORDERS TABLE
-- =============================================================================

CREATE TABLE build_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    build_number TEXT UNIQUE NOT NULL,
    bom_id UUID NOT NULL REFERENCES boms(id),
    finished_sku TEXT NOT NULL REFERENCES inventory_items(sku),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status TEXT NOT NULL DEFAULT 'Planned' CHECK (status IN ('Planned', 'In Progress', 'Completed', 'Cancelled')),
    
    scheduled_date DATE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    assigned_to UUID REFERENCES users(id),
    notes TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1 NOT NULL
);

-- Indexes
CREATE INDEX idx_build_number ON build_orders(build_number) WHERE is_deleted = FALSE;
CREATE INDEX idx_build_bom ON build_orders(bom_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_build_sku ON build_orders(finished_sku) WHERE is_deleted = FALSE;
CREATE INDEX idx_build_status ON build_orders(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_build_assigned ON build_orders(assigned_to) WHERE is_deleted = FALSE;
CREATE INDEX idx_build_created_at ON build_orders(created_at DESC);

-- Trigger
CREATE TRIGGER update_build_orders_updated_at
    BEFORE UPDATE ON build_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE build_orders IS 'Production orders to build finished goods from components';

-- =============================================================================
-- SEQUENCES FOR NUMBER GENERATION
-- =============================================================================

CREATE SEQUENCE po_number_seq START 1000;
CREATE SEQUENCE requisition_number_seq START 1000;
CREATE SEQUENCE build_number_seq START 1000;

COMMENT ON SEQUENCE po_number_seq IS 'Auto-incrementing sequence for PO numbers';
COMMENT ON SEQUENCE requisition_number_seq IS 'Auto-incrementing sequence for requisition numbers';
COMMENT ON SEQUENCE build_number_seq IS 'Auto-incrementing sequence for build order numbers';

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

-- Grant usage on sequences to authenticated users
GRANT USAGE ON SEQUENCE po_number_seq TO authenticated;
GRANT USAGE ON SEQUENCE requisition_number_seq TO authenticated;
GRANT USAGE ON SEQUENCE build_number_seq TO authenticated;
