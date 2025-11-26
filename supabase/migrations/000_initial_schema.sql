-- Migration: Initial Schema
-- Description: Creates base tables that are assumed to exist by later migrations
-- Date: 2025-11-26

-- ============================================================================
-- Vendors Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  contact_emails TEXT[] DEFAULT '{}',
  address TEXT DEFAULT '',
  lead_time_days INTEGER DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Inventory Items Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  vendor_id UUID REFERENCES vendors(id),
  category TEXT,
  reorder_point INTEGER DEFAULT 0,
  moq INTEGER DEFAULT 0,
  stock INTEGER DEFAULT 0,
  on_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- BOMs Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS boms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  finished_sku TEXT,
  barcode TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- BOM Components Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS bom_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id UUID REFERENCES boms(id) ON DELETE CASCADE,
  component_sku TEXT,
  quantity DECIMAL(12, 4) NOT NULL,
  unit TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
