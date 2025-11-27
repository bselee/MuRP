-- ============================================================================
-- Migration: 051_enhanced_shipment_tracking.sql
-- ============================================================================
-- Adds comprehensive shipment tracking from vendor emails with AI extraction
-- Supports multiple tracking numbers per PO, carrier validation, and delivery confirmation
--
-- Tables:
--   - po_shipment_data: Extracted shipment information from emails
--   - po_shipment_items: Line-item level shipment tracking for partial shipments
--   - shipment_tracking_events: Carrier status updates with timestamps
--
-- Author: MuRP Team
-- Date: 2025-11-27
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. PO SHIPMENT DATA TABLE
-- ============================================================================
-- Stores extracted shipment information from vendor emails

CREATE TABLE IF NOT EXISTS po_shipment_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- PO relationship
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,

  -- Email source
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Shipment identification
  shipment_number TEXT, -- Vendor's shipment reference
  tracking_numbers TEXT[] NOT NULL DEFAULT '{}', -- Multiple tracking numbers
  carrier TEXT, -- Detected carrier (ups, fedex, usps, dhl, etc.)
  carrier_confidence NUMERIC(3,2), -- AI confidence in carrier detection

  -- Dates
  ship_date DATE,
  estimated_delivery_date DATE,
  actual_delivery_date DATE,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'shipped', 'in_transit', 'out_for_delivery',
    'delivered', 'exception', 'cancelled'
  )),
  status_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Quantities (for partial shipments)
  total_quantity_shipped INTEGER,
  total_quantity_ordered INTEGER,

  -- AI extraction metadata
  ai_confidence NUMERIC(3,2), -- Overall confidence in extraction
  ai_extraction JSONB NOT NULL DEFAULT '{}', -- Raw AI response
  manual_override BOOLEAN NOT NULL DEFAULT false, -- If manually corrected

  -- Review workflow
  requires_review BOOLEAN NOT NULL DEFAULT false,
  review_reason TEXT, -- Why it needs review
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(po_id, shipment_number)
);

-- ============================================================================
-- 2. PO SHIPMENT ITEMS TABLE
-- ============================================================================
-- Tracks individual line items within shipments (for partial shipments)

CREATE TABLE IF NOT EXISTS po_shipment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  shipment_id UUID NOT NULL REFERENCES po_shipment_data(id) ON DELETE CASCADE,
  po_item_id UUID REFERENCES purchase_order_items(id) ON DELETE SET NULL,

  -- Item details
  vendor_sku TEXT,
  internal_sku TEXT,
  item_description TEXT,

  -- Quantities
  quantity_shipped INTEGER NOT NULL,
  quantity_ordered INTEGER,

  -- Tracking (if different from shipment level)
  tracking_number TEXT,
  carrier TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'shipped', 'in_transit', 'delivered', 'exception'
  )),

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. SHIPMENT TRACKING EVENTS TABLE
-- ============================================================================
-- Audit trail of carrier status updates and delivery confirmations

CREATE TABLE IF NOT EXISTS shipment_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  shipment_id UUID NOT NULL REFERENCES po_shipment_data(id) ON DELETE CASCADE,
  shipment_item_id UUID REFERENCES po_shipment_items(id) ON DELETE CASCADE,

  -- Event details
  event_type TEXT NOT NULL CHECK (event_type IN (
    'status_update', 'delivery_confirmation', 'exception', 'rescheduled',
    'pickup', 'in_transit', 'out_for_delivery', 'delivered'
  )),
  status TEXT NOT NULL,
  description TEXT,

  -- Carrier data
  carrier TEXT,
  tracking_number TEXT,
  carrier_location TEXT,
  carrier_timestamp TIMESTAMPTZ,

  -- Source
  source TEXT NOT NULL DEFAULT 'email' CHECK (source IN (
    'email', 'aftership', 'manual', 'carrier_api'
  )),
  source_id TEXT, -- Gmail message ID, AfterShip tracking ID, etc.

  -- AI extraction (if from email)
  ai_confidence NUMERIC(3,2),
  raw_data JSONB NOT NULL DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_po_shipment_data_po ON po_shipment_data(po_id);
CREATE INDEX IF NOT EXISTS idx_po_shipment_data_status ON po_shipment_data(status);
CREATE INDEX IF NOT EXISTS idx_po_shipment_data_carrier ON po_shipment_data(carrier);
CREATE INDEX IF NOT EXISTS idx_po_shipment_data_tracking ON po_shipment_data USING GIN(tracking_numbers);
CREATE INDEX IF NOT EXISTS idx_po_shipment_data_dates ON po_shipment_data(ship_date, estimated_delivery_date);
CREATE INDEX IF NOT EXISTS idx_po_shipment_data_review ON po_shipment_data(requires_review) WHERE requires_review = true;

CREATE INDEX IF NOT EXISTS idx_po_shipment_items_shipment ON po_shipment_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_po_shipment_items_po_item ON po_shipment_items(po_item_id);
CREATE INDEX IF NOT EXISTS idx_po_shipment_items_tracking ON po_shipment_items(tracking_number);

CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment ON shipment_tracking_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_events_type ON shipment_tracking_events(event_type);
CREATE INDEX IF NOT EXISTS idx_shipment_events_created ON shipment_tracking_events(created_at DESC);

-- ============================================================================
-- 5. CARRIER REGEX PATTERNS CONFIGURATION
-- ============================================================================
-- Add carrier tracking number validation patterns to app_settings

INSERT INTO app_settings (setting_key, setting_category, setting_value, display_name, description)
VALUES (
  'carrier_patterns',
  'tracking',
  '{
    "ups": "\\b1Z[A-Z0-9]{16}\\b",
    "fedex": "\\b(\\d{12}|\\d{15}|\\d{20,22})\\b",
    "usps": "\\b(9[0-9]{21}|[A-Z]{2}[0-9]{9}US)\\b",
    "dhl": "\\b[0-9]{10,11}\\b",
    "lasership": "\\b1LS[0-9]{16}\\b",
    "ontrac": "\\bC[0-9]{14}\\b"
  }'::jsonb,
  'Carrier Tracking Patterns',
  'Regex patterns for validating tracking numbers by carrier'
) ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description,
  updated_at = now();

INSERT INTO app_settings (setting_key, setting_category, setting_value, display_name, description)
VALUES (
  'carrier_domains',
  'tracking',
  '{
    "ups.com": "ups",
    "fedex.com": "fedex",
    "usps.com": "usps",
    "dhl.com": "dhl",
    "lasership.com": "lasership",
    "ontrac.com": "ontrac"
  }'::jsonb,
  'Carrier Email Domains',
  'Email domain to carrier mapping for auto-detection'
) ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description,
  updated_at = now();

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE po_shipment_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_shipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_tracking_events ENABLE ROW LEVEL SECURITY;

-- Shipment data: Authenticated users can read, service role can write
DROP POLICY IF EXISTS po_shipment_data_select ON po_shipment_data;
CREATE POLICY po_shipment_data_select ON po_shipment_data
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS po_shipment_data_insert ON po_shipment_data;
CREATE POLICY po_shipment_data_insert ON po_shipment_data
  FOR INSERT TO authenticated
  WITH CHECK (true); -- Allow system/service inserts

DROP POLICY IF EXISTS po_shipment_data_update ON po_shipment_data;
CREATE POLICY po_shipment_data_update ON po_shipment_data
  FOR UPDATE TO authenticated
  USING (true); -- Allow updates for review workflow

-- Shipment items: Same as shipment data
DROP POLICY IF EXISTS po_shipment_items_select ON po_shipment_items;
CREATE POLICY po_shipment_items_select ON po_shipment_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS po_shipment_items_insert ON po_shipment_items;
CREATE POLICY po_shipment_items_insert ON po_shipment_items
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS po_shipment_items_update ON po_shipment_items;
CREATE POLICY po_shipment_items_update ON po_shipment_items
  FOR UPDATE TO authenticated
  USING (true);

-- Tracking events: Read-only for authenticated users
DROP POLICY IF EXISTS shipment_tracking_events_select ON shipment_tracking_events;
CREATE POLICY shipment_tracking_events_select ON shipment_tracking_events
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS shipment_tracking_events_insert ON shipment_tracking_events;
CREATE POLICY shipment_tracking_events_insert ON shipment_tracking_events
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Get shipment data for a PO with item details
CREATE OR REPLACE FUNCTION get_po_shipment_data(po_id UUID)
RETURNS TABLE (
  shipment_id UUID,
  shipment_number TEXT,
  tracking_numbers TEXT[],
  carrier TEXT,
  status TEXT,
  ship_date DATE,
  estimated_delivery DATE,
  actual_delivery DATE,
  total_quantity_shipped INTEGER,
  total_quantity_ordered INTEGER,
  requires_review BOOLEAN,
  ai_confidence NUMERIC,
  item_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    psd.id,
    psd.shipment_number,
    psd.tracking_numbers,
    psd.carrier,
    psd.status,
    psd.ship_date,
    psd.estimated_delivery_date,
    psd.actual_delivery_date,
    psd.total_quantity_shipped,
    psd.total_quantity_ordered,
    psd.requires_review,
    psd.ai_confidence,
    COUNT(psi.id) as item_count
  FROM po_shipment_data psd
  LEFT JOIN po_shipment_items psi ON psi.shipment_id = psd.id
  WHERE psd.po_id = po_id
  GROUP BY psd.id, psd.shipment_number, psd.tracking_numbers, psd.carrier,
           psd.status, psd.ship_date, psd.estimated_delivery_date,
           psd.actual_delivery_date, psd.total_quantity_shipped,
           psd.total_quantity_ordered, psd.requires_review, psd.ai_confidence
  ORDER BY psd.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get shipment alerts (delayed, exceptions, etc.)
CREATE OR REPLACE FUNCTION get_shipment_alerts()
RETURNS TABLE (
  po_id UUID,
  po_number TEXT,
  shipment_id UUID,
  alert_type TEXT,
  alert_message TEXT,
  severity TEXT,
  days_overdue INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    po.id as po_id,
    po.po_number,
    psd.id as shipment_id,
    CASE
      WHEN psd.status = 'exception' THEN 'exception'
      WHEN psd.actual_delivery_date IS NOT NULL AND psd.actual_delivery_date > psd.estimated_delivery_date THEN 'delayed_delivery'
      WHEN psd.estimated_delivery_date < CURRENT_DATE AND psd.status NOT IN ('delivered', 'cancelled') THEN 'overdue'
      WHEN psd.requires_review THEN 'requires_review'
      ELSE 'info'
    END as alert_type,
    CASE
      WHEN psd.status = 'exception' THEN 'Shipment exception reported'
      WHEN psd.actual_delivery_date IS NOT NULL AND psd.actual_delivery_date > psd.estimated_delivery_date THEN
        'Delivered ' || (psd.actual_delivery_date - psd.estimated_delivery_date) || ' days late'
      WHEN psd.estimated_delivery_date < CURRENT_DATE AND psd.status NOT IN ('delivered', 'cancelled') THEN
        'Overdue by ' || (CURRENT_DATE - psd.estimated_delivery_date) || ' days'
      WHEN psd.requires_review THEN 'Shipment data requires review'
      ELSE 'Shipment update available'
    END as alert_message,
    CASE
      WHEN psd.status = 'exception' THEN 'high'
      WHEN psd.estimated_delivery_date < CURRENT_DATE AND psd.status NOT IN ('delivered', 'cancelled') THEN 'high'
      WHEN psd.actual_delivery_date IS NOT NULL AND psd.actual_delivery_date > psd.estimated_delivery_date THEN 'medium'
      WHEN psd.requires_review THEN 'medium'
      ELSE 'low'
    END as severity,
    CASE
      WHEN psd.estimated_delivery_date < CURRENT_DATE AND psd.status NOT IN ('delivered', 'cancelled')
        THEN CURRENT_DATE - psd.estimated_delivery_date
      ELSE 0
    END as days_overdue
  FROM po_shipment_data psd
  JOIN purchase_orders po ON po.id = psd.po_id
  WHERE
    psd.status NOT IN ('delivered', 'cancelled')
    OR psd.requires_review = true
    OR psd.status = 'exception'
  ORDER BY
    CASE severity
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 3
    END,
    days_overdue DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. TRIGGER FOR UPDATED_AT
-- ============================================================================

DO $$ BEGIN
  CREATE TRIGGER update_po_shipment_data_updated_at
    BEFORE UPDATE ON po_shipment_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_po_shipment_items_updated_at
    BEFORE UPDATE ON po_shipment_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 9. BACKFILL EXISTING TRACKING DATA
-- ============================================================================
-- Migrate existing tracking data from PO columns to new shipment tables

INSERT INTO po_shipment_data (
  po_id,
  tracking_numbers,
  carrier,
  status,
  estimated_delivery_date,
  notes,
  ai_confidence,
  manual_override
)
SELECT
  id as po_id,
  CASE WHEN tracking_number IS NOT NULL THEN ARRAY[tracking_number] ELSE '{}' END as tracking_numbers,
  tracking_carrier as carrier,
  CASE
    WHEN tracking_status = 'delivered' THEN 'delivered'
    WHEN tracking_status = 'shipped' THEN 'shipped'
    WHEN tracking_status = 'in_transit' THEN 'in_transit'
    WHEN tracking_status = 'exception' THEN 'exception'
    ELSE 'pending'
  END as status,
  tracking_estimated_delivery as estimated_delivery_date,
  CASE WHEN tracking_last_exception IS NOT NULL THEN 'Exception: ' || tracking_last_exception ELSE NULL END as notes,
  1.0 as ai_confidence, -- Assume high confidence for existing data
  true as manual_override -- Mark as manually entered
FROM purchase_orders
WHERE tracking_number IS NOT NULL
  OR tracking_carrier IS NOT NULL
  OR tracking_status IS NOT NULL
ON CONFLICT (po_id, shipment_number) DO NOTHING;

COMMIT;