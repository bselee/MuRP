-- =============================================
-- MIGRATION 124: Add Tracking Columns to Finale POs
-- =============================================
-- Adds tracking information columns to finale_purchase_orders
-- so agents can store extracted tracking data from emails/AfterShip
-- =============================================

-- Add tracking columns to finale_purchase_orders
ALTER TABLE finale_purchase_orders
ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS tracking_carrier VARCHAR(50),
ADD COLUMN IF NOT EXISTS tracking_status VARCHAR(50) DEFAULT 'awaiting_confirmation',
ADD COLUMN IF NOT EXISTS tracking_estimated_delivery DATE,
ADD COLUMN IF NOT EXISTS tracking_shipped_date DATE,
ADD COLUMN IF NOT EXISTS tracking_delivered_date DATE,
ADD COLUMN IF NOT EXISTS tracking_last_exception TEXT,
ADD COLUMN IF NOT EXISTS tracking_last_checked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tracking_source VARCHAR(50); -- 'email', 'aftership', 'manual'

-- Create index for tracking lookups
CREATE INDEX IF NOT EXISTS idx_finale_po_tracking_number
ON finale_purchase_orders(tracking_number)
WHERE tracking_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_finale_po_tracking_status
ON finale_purchase_orders(tracking_status);

-- Add tracking events table for Finale POs (stores history of tracking updates)
CREATE TABLE IF NOT EXISTS finale_po_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finale_po_id UUID NOT NULL REFERENCES finale_purchase_orders(id) ON DELETE CASCADE,
  tracking_number VARCHAR(100),
  carrier VARCHAR(50),
  status VARCHAR(50) NOT NULL,
  location TEXT,
  description TEXT,
  event_time TIMESTAMPTZ,
  raw_payload JSONB,
  source VARCHAR(50), -- 'aftership', 'email', 'manual'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finale_po_tracking_events_po
ON finale_po_tracking_events(finale_po_id);

-- Function to update Finale PO tracking from email extraction
CREATE OR REPLACE FUNCTION update_finale_po_tracking(
  p_order_id VARCHAR,
  p_tracking_number VARCHAR,
  p_carrier VARCHAR DEFAULT NULL,
  p_estimated_delivery DATE DEFAULT NULL,
  p_source VARCHAR DEFAULT 'email'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_po_id UUID;
  v_result JSONB;
BEGIN
  -- Find the Finale PO by order_id
  SELECT id INTO v_po_id
  FROM finale_purchase_orders
  WHERE order_id = p_order_id
  LIMIT 1;

  IF v_po_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'PO not found: ' || p_order_id
    );
  END IF;

  -- Update the PO with tracking info
  UPDATE finale_purchase_orders
  SET
    tracking_number = COALESCE(p_tracking_number, tracking_number),
    tracking_carrier = COALESCE(p_carrier, tracking_carrier),
    tracking_estimated_delivery = COALESCE(p_estimated_delivery, tracking_estimated_delivery),
    tracking_status = CASE
      WHEN p_tracking_number IS NOT NULL AND tracking_status = 'awaiting_confirmation'
      THEN 'shipped'
      ELSE tracking_status
    END,
    tracking_shipped_date = CASE
      WHEN p_tracking_number IS NOT NULL AND tracking_shipped_date IS NULL
      THEN CURRENT_DATE
      ELSE tracking_shipped_date
    END,
    tracking_source = p_source,
    tracking_last_checked_at = NOW(),
    updated_at = NOW()
  WHERE id = v_po_id;

  -- Log the tracking event
  INSERT INTO finale_po_tracking_events (
    finale_po_id,
    tracking_number,
    carrier,
    status,
    description,
    source
  ) VALUES (
    v_po_id,
    p_tracking_number,
    p_carrier,
    'shipped',
    'Tracking number added from ' || p_source,
    p_source
  );

  RETURN jsonb_build_object(
    'success', true,
    'po_id', v_po_id,
    'tracking_number', p_tracking_number
  );
END;
$$;

-- Function for AfterShip webhook updates
CREATE OR REPLACE FUNCTION update_finale_po_from_aftership(
  p_tracking_number VARCHAR,
  p_status VARCHAR,
  p_carrier VARCHAR DEFAULT NULL,
  p_estimated_delivery DATE DEFAULT NULL,
  p_delivered_date DATE DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_raw_payload JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_po_id UUID;
  v_result JSONB;
BEGIN
  -- Find the Finale PO by tracking number
  SELECT id INTO v_po_id
  FROM finale_purchase_orders
  WHERE tracking_number = p_tracking_number
  LIMIT 1;

  IF v_po_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No PO found with tracking: ' || p_tracking_number
    );
  END IF;

  -- Update the PO with new status
  UPDATE finale_purchase_orders
  SET
    tracking_status = p_status,
    tracking_carrier = COALESCE(p_carrier, tracking_carrier),
    tracking_estimated_delivery = COALESCE(p_estimated_delivery, tracking_estimated_delivery),
    tracking_delivered_date = COALESCE(p_delivered_date, tracking_delivered_date),
    tracking_last_checked_at = NOW(),
    tracking_source = 'aftership',
    -- Update delivery_status based on tracking
    delivery_status = CASE p_status
      WHEN 'delivered' THEN 'DELIVERED'
      WHEN 'in_transit' THEN 'ON_TRACK'
      WHEN 'out_for_delivery' THEN 'ON_TRACK'
      WHEN 'exception' THEN 'DELAYED'
      ELSE delivery_status
    END,
    updated_at = NOW()
  WHERE id = v_po_id;

  -- Log the tracking event
  INSERT INTO finale_po_tracking_events (
    finale_po_id,
    tracking_number,
    carrier,
    status,
    location,
    description,
    raw_payload,
    source,
    event_time
  ) VALUES (
    v_po_id,
    p_tracking_number,
    p_carrier,
    p_status,
    p_location,
    p_description,
    p_raw_payload,
    'aftership',
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'po_id', v_po_id,
    'status', p_status
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION update_finale_po_tracking TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_finale_po_from_aftership TO authenticated, service_role;

COMMENT ON COLUMN finale_purchase_orders.tracking_number IS 'Carrier tracking number (UPS, FedEx, USPS, etc.)';
COMMENT ON COLUMN finale_purchase_orders.tracking_carrier IS 'Shipping carrier name';
COMMENT ON COLUMN finale_purchase_orders.tracking_status IS 'Current tracking status: awaiting_confirmation, shipped, in_transit, out_for_delivery, delivered, exception';
COMMENT ON COLUMN finale_purchase_orders.tracking_source IS 'Where tracking was obtained: email, aftership, manual';
COMMENT ON TABLE finale_po_tracking_events IS 'History of tracking events for Finale POs';
