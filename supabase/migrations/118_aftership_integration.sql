-- ═══════════════════════════════════════════════════════════════════════════
-- AFTERSHIP INTEGRATION - Real-time INBOUND PO Tracking
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Enhances AfterShip polling with webhook support for real-time tracking.
-- AfterShip = INBOUND tracking (POs from vendors) - CRITICAL for stockout prevention!
--
-- Key Features:
-- - Webhook event storage
-- - Tracking history with checkpoints
-- - Email thread correlation
-- - PO correlation functions
-- - Air Traffic Controller integration
--
-- Part of: Email Tracking Agent Expansion
-- Goal: NEVER BE OUT OF STOCK!
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- AFTERSHIP TRACKING TABLE (Enhanced tracking data)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS aftership_trackings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- AfterShip identifiers
  aftership_id TEXT UNIQUE,
  slug TEXT NOT NULL, -- Carrier slug (ups, fedex, etc.)
  tracking_number TEXT NOT NULL,

  -- Correlation with MuRP
  po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES email_threads(id) ON DELETE SET NULL,
  correlation_method TEXT, -- 'order_number', 'tracking_number', 'email_thread', 'manual'
  correlation_confidence NUMERIC(3,2) DEFAULT 0,

  -- Tracking status
  tag TEXT, -- AfterShip tag: Pending, InfoReceived, InTransit, etc.
  subtag TEXT,
  subtag_message TEXT,

  -- Mapped internal status
  internal_status TEXT, -- Our standard status

  -- Dates
  expected_delivery TIMESTAMP WITH TIME ZONE,
  shipment_pickup_date TIMESTAMP WITH TIME ZONE,
  shipment_delivery_date TIMESTAMP WITH TIME ZONE,
  first_attempted_delivery_date TIMESTAMP WITH TIME ZONE,

  -- Origin/Destination
  origin_country_iso3 TEXT,
  origin_state TEXT,
  origin_city TEXT,
  origin_postal_code TEXT,
  destination_country_iso3 TEXT,
  destination_state TEXT,
  destination_city TEXT,
  destination_postal_code TEXT,

  -- Courier info
  courier_destination_country_iso3 TEXT,
  courier_tracking_link TEXT,

  -- Additional info
  title TEXT, -- Order title/reference
  order_id TEXT, -- External order ID
  order_number TEXT, -- Order number for correlation
  customer_name TEXT,
  note TEXT,

  -- Checkpoints (stored as JSONB array)
  checkpoints JSONB DEFAULT '[]'::JSONB,
  latest_checkpoint_message TEXT,
  latest_checkpoint_time TIMESTAMP WITH TIME ZONE,

  -- Metadata
  source TEXT DEFAULT 'webhook', -- 'webhook', 'polling', 'manual'
  custom_fields JSONB DEFAULT '{}'::JSONB,

  -- Sync timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint for carrier + tracking number
  UNIQUE (slug, tracking_number)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_aftership_trackings_po_id ON aftership_trackings(po_id);
CREATE INDEX IF NOT EXISTS idx_aftership_trackings_thread_id ON aftership_trackings(thread_id);
CREATE INDEX IF NOT EXISTS idx_aftership_trackings_tag ON aftership_trackings(tag);
CREATE INDEX IF NOT EXISTS idx_aftership_trackings_tracking ON aftership_trackings(tracking_number);
CREATE INDEX IF NOT EXISTS idx_aftership_trackings_order_number ON aftership_trackings(order_number);
CREATE INDEX IF NOT EXISTS idx_aftership_trackings_expected_delivery ON aftership_trackings(expected_delivery);

-- ═══════════════════════════════════════════════════════════════════════════
-- AFTERSHIP WEBHOOK LOG (All received webhooks)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS aftership_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Webhook metadata
  event_type TEXT NOT NULL, -- 'tracking_update', 'tracking_created', 'tracking_expired'
  event_id TEXT, -- AfterShip event ID for deduplication

  -- Tracking info
  aftership_id TEXT,
  tracking_number TEXT,
  slug TEXT,

  -- Status info
  old_tag TEXT,
  new_tag TEXT,
  old_subtag TEXT,
  new_subtag TEXT,

  -- Correlation
  po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES email_threads(id) ON DELETE SET NULL,
  correlation_method TEXT,
  correlation_confidence NUMERIC(3,2) DEFAULT 0,

  -- Processing status
  processing_status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'success', 'failed', 'skipped'
  processing_error TEXT,
  processing_notes TEXT,

  -- Air Traffic Controller integration
  triggered_alert BOOLEAN DEFAULT FALSE,
  alert_id UUID,
  alert_priority TEXT,

  -- Raw payload
  payload JSONB,

  -- Timestamps
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,

  -- Deduplication
  UNIQUE (event_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_aftership_webhook_log_tracking ON aftership_webhook_log(tracking_number);
CREATE INDEX IF NOT EXISTS idx_aftership_webhook_log_po ON aftership_webhook_log(po_id);
CREATE INDEX IF NOT EXISTS idx_aftership_webhook_log_status ON aftership_webhook_log(processing_status);
CREATE INDEX IF NOT EXISTS idx_aftership_webhook_log_event_type ON aftership_webhook_log(event_type);
CREATE INDEX IF NOT EXISTS idx_aftership_webhook_log_received ON aftership_webhook_log(received_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- AFTERSHIP CHECKPOINTS (Detailed tracking history)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS aftership_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to tracking
  tracking_id UUID NOT NULL REFERENCES aftership_trackings(id) ON DELETE CASCADE,
  aftership_id TEXT,

  -- Checkpoint data
  checkpoint_time TIMESTAMP WITH TIME ZONE,
  tag TEXT,
  subtag TEXT,
  subtag_message TEXT,
  message TEXT,
  location TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country_name TEXT,
  country_iso3 TEXT,

  -- Raw data
  raw_tag TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_aftership_checkpoints_tracking ON aftership_checkpoints(tracking_id);
CREATE INDEX IF NOT EXISTS idx_aftership_checkpoints_time ON aftership_checkpoints(checkpoint_time DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- CORRELATION FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Find PO by tracking number (enhanced for AfterShip)
CREATE OR REPLACE FUNCTION find_po_by_aftership_tracking(p_tracking_number TEXT)
RETURNS UUID AS $$
DECLARE
  v_po_id UUID;
BEGIN
  -- First check purchase_orders.tracking_number
  SELECT id INTO v_po_id
  FROM purchase_orders
  WHERE tracking_number = p_tracking_number
    OR tracking_number ILIKE '%' || p_tracking_number || '%'
  LIMIT 1;

  IF v_po_id IS NOT NULL THEN
    RETURN v_po_id;
  END IF;

  -- Check aftership_trackings correlation
  SELECT po_id INTO v_po_id
  FROM aftership_trackings
  WHERE tracking_number = p_tracking_number
    AND po_id IS NOT NULL
  LIMIT 1;

  IF v_po_id IS NOT NULL THEN
    RETURN v_po_id;
  END IF;

  -- Check email_threads for tracking
  SELECT po_id INTO v_po_id
  FROM email_threads
  WHERE p_tracking_number = ANY(tracking_numbers)
    AND po_id IS NOT NULL
  LIMIT 1;

  RETURN v_po_id;
END;
$$ LANGUAGE plpgsql;

-- Update PO tracking from AfterShip webhook
CREATE OR REPLACE FUNCTION update_po_tracking_from_aftership(
  p_po_id UUID,
  p_tracking_number TEXT,
  p_carrier TEXT,
  p_tag TEXT,
  p_expected_delivery TIMESTAMP WITH TIME ZONE,
  p_latest_checkpoint TEXT
) RETURNS VOID AS $$
DECLARE
  v_internal_status TEXT;
BEGIN
  -- Map AfterShip tag to internal status
  v_internal_status := CASE LOWER(p_tag)
    WHEN 'pending' THEN 'processing'
    WHEN 'inforeceived' THEN 'processing'
    WHEN 'intransit' THEN 'in_transit'
    WHEN 'outfordelivery' THEN 'out_for_delivery'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'exception' THEN 'exception'
    WHEN 'attemptfail' THEN 'exception'
    WHEN 'expired' THEN 'exception'
    WHEN 'availableforpickup' THEN 'in_transit'
    ELSE 'in_transit'
  END;

  -- Update PO
  UPDATE purchase_orders
  SET
    tracking_number = COALESCE(tracking_number, p_tracking_number),
    tracking_carrier = COALESCE(tracking_carrier, p_carrier),
    tracking_status = v_internal_status,
    tracking_estimated_delivery = p_expected_delivery,
    tracking_last_checked_at = NOW(),
    tracking_last_exception = CASE WHEN p_tag IN ('Exception', 'AttemptFail', 'Expired') THEN p_latest_checkpoint END,
    updated_at = NOW()
  WHERE id = p_po_id;

  -- Log tracking event
  INSERT INTO po_tracking_events (po_id, status, carrier, tracking_number, description)
  VALUES (
    p_po_id,
    v_internal_status,
    p_carrier,
    p_tracking_number,
    COALESCE(p_latest_checkpoint, 'AfterShip webhook update: ' || p_tag)
  );
END;
$$ LANGUAGE plpgsql;

-- Find email thread by tracking number
CREATE OR REPLACE FUNCTION find_email_thread_by_aftership_tracking(p_tracking_number TEXT)
RETURNS UUID AS $$
DECLARE
  v_thread_id UUID;
BEGIN
  -- Check email_threads tracking_numbers array
  SELECT id INTO v_thread_id
  FROM email_threads
  WHERE p_tracking_number = ANY(tracking_numbers)
  ORDER BY last_message_at DESC
  LIMIT 1;

  IF v_thread_id IS NOT NULL THEN
    RETURN v_thread_id;
  END IF;

  -- Check aftership_trackings correlation
  SELECT thread_id INTO v_thread_id
  FROM aftership_trackings
  WHERE tracking_number = p_tracking_number
    AND thread_id IS NOT NULL
  LIMIT 1;

  RETURN v_thread_id;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- AIR TRAFFIC CONTROLLER INTEGRATION
-- ═══════════════════════════════════════════════════════════════════════════

-- Assess delivery impact and create alerts
CREATE OR REPLACE FUNCTION assess_aftership_delivery_impact(
  p_po_id UUID,
  p_new_expected_delivery TIMESTAMP WITH TIME ZONE,
  p_tag TEXT,
  p_tracking_number TEXT
) RETURNS UUID AS $$
DECLARE
  v_po RECORD;
  v_delay_days INTEGER;
  v_alert_id UUID;
  v_priority TEXT;
  v_affected_items JSONB;
  v_critical_count INTEGER := 0;
  v_item RECORD;
BEGIN
  -- Get PO with original ETA
  SELECT
    p.id,
    p.order_id,
    p.vendor_id,
    p.supplier_name as vendor_name,
    p.expected_date
  INTO v_po
  FROM purchase_orders p
  WHERE p.id = p_po_id;

  IF v_po IS NULL THEN
    RETURN NULL;
  END IF;

  -- Calculate delay
  v_delay_days := EXTRACT(DAY FROM (p_new_expected_delivery - v_po.expected_date::timestamp with time zone));

  -- If no delay or early delivery, no alert needed
  IF v_delay_days <= 0 AND p_tag NOT IN ('Exception', 'AttemptFail', 'Expired') THEN
    RETURN NULL;
  END IF;

  -- Build affected items list
  v_affected_items := '[]'::JSONB;

  FOR v_item IN
    SELECT
      poi.inventory_sku,
      poi.item_name,
      poi.quantity_ordered,
      COALESCE(ii.current_stock, 0) as current_stock,
      COALESCE(ii.sales_last_30_days, 0) / 30.0 as daily_sales
    FROM purchase_order_items poi
    LEFT JOIN inventory_items ii ON ii.sku = poi.inventory_sku
    WHERE poi.po_id = p_po_id
  LOOP
    IF v_item.daily_sales > 0 THEN
      DECLARE
        v_days_of_stock NUMERIC;
        v_impact_level TEXT;
      BEGIN
        v_days_of_stock := v_item.current_stock / v_item.daily_sales;

        -- Determine impact level
        IF v_days_of_stock < GREATEST(v_delay_days, 0) THEN
          v_impact_level := 'critical';
          v_critical_count := v_critical_count + 1;
        ELSIF v_days_of_stock < GREATEST(v_delay_days, 0) + 7 THEN
          v_impact_level := 'high';
        ELSIF v_days_of_stock < GREATEST(v_delay_days, 0) + 14 THEN
          v_impact_level := 'medium';
        ELSE
          v_impact_level := 'low';
        END IF;

        IF v_impact_level != 'low' THEN
          v_affected_items := v_affected_items || jsonb_build_object(
            'sku', v_item.inventory_sku,
            'name', v_item.item_name,
            'current_stock', v_item.current_stock,
            'days_until_stockout', FLOOR(v_days_of_stock),
            'impact_level', v_impact_level
          );
        END IF;
      END;
    END IF;
  END LOOP;

  -- Determine priority
  IF p_tag IN ('Exception', 'AttemptFail', 'Expired') THEN
    v_priority := 'critical';
  ELSIF v_critical_count > 0 THEN
    v_priority := 'critical';
  ELSIF jsonb_array_length(v_affected_items) > 0 THEN
    v_priority := 'high';
  ELSIF v_delay_days > 7 THEN
    v_priority := 'medium';
  ELSE
    v_priority := 'low';
  END IF;

  -- Only create alert if not low priority
  IF v_priority = 'low' THEN
    RETURN NULL;
  END IF;

  -- Create alert
  INSERT INTO po_alert_log (
    po_id,
    po_number,
    vendor_id,
    vendor_name,
    alert_type,
    priority_level,
    delay_days,
    original_eta,
    new_eta,
    affected_items,
    impact_summary,
    recommended_action,
    source
  ) VALUES (
    p_po_id,
    v_po.order_id,
    v_po.vendor_id,
    v_po.vendor_name,
    CASE
      WHEN p_tag IN ('Exception', 'AttemptFail', 'Expired') THEN 'delivery_exception'
      ELSE 'delay'
    END,
    v_priority,
    v_delay_days,
    v_po.expected_date,
    p_new_expected_delivery::DATE,
    v_affected_items,
    CASE
      WHEN p_tag = 'Exception' THEN 'Delivery exception reported by carrier'
      WHEN p_tag = 'AttemptFail' THEN 'Delivery attempt failed'
      WHEN p_tag = 'Expired' THEN 'Tracking expired - may be lost'
      WHEN v_critical_count > 0 THEN v_critical_count || ' item(s) will stockout before delivery'
      ELSE jsonb_array_length(v_affected_items) || ' item(s) may be impacted'
    END,
    CASE
      WHEN p_tag IN ('Exception', 'AttemptFail', 'Expired') THEN 'Contact carrier immediately - tracking: ' || p_tracking_number
      WHEN v_priority = 'critical' THEN 'Contact vendor immediately - expedite or find backup supplier'
      WHEN v_priority = 'high' THEN 'Review with vendor within 24 hours'
      ELSE 'Monitor - no immediate action required'
    END,
    'aftership_webhook'
  )
  RETURNING id INTO v_alert_id;

  RETURN v_alert_id;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEWS FOR REPORTING
-- ═══════════════════════════════════════════════════════════════════════════

-- Active trackings with PO info
CREATE OR REPLACE VIEW aftership_active_trackings AS
SELECT
  at.*,
  po.order_id as po_number,
  po.supplier_name as vendor_name,
  po.expected_date as po_expected_date,
  po.status as po_status,
  et.subject as thread_subject,
  et.last_message_at as thread_last_message
FROM aftership_trackings at
LEFT JOIN purchase_orders po ON at.po_id = po.id
LEFT JOIN email_threads et ON at.thread_id = et.id
WHERE at.tag NOT IN ('Delivered', 'Expired')
ORDER BY at.expected_delivery ASC NULLS LAST;

-- Tracking status summary
CREATE OR REPLACE VIEW aftership_tracking_summary AS
SELECT
  tag,
  COUNT(*) as count,
  COUNT(DISTINCT po_id) FILTER (WHERE po_id IS NOT NULL) as correlated_pos,
  COUNT(*) FILTER (WHERE po_id IS NULL) as uncorrelated,
  MIN(expected_delivery) as earliest_delivery,
  MAX(expected_delivery) as latest_delivery
FROM aftership_trackings
WHERE tag NOT IN ('Delivered', 'Expired')
  OR updated_at > NOW() - INTERVAL '7 days'
GROUP BY tag
ORDER BY
  CASE tag
    WHEN 'Exception' THEN 1
    WHEN 'AttemptFail' THEN 2
    WHEN 'OutForDelivery' THEN 3
    WHEN 'InTransit' THEN 4
    WHEN 'InfoReceived' THEN 5
    WHEN 'Pending' THEN 6
    ELSE 7
  END;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE aftership_trackings ENABLE ROW LEVEL SECURITY;
ALTER TABLE aftership_webhook_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE aftership_checkpoints ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view
CREATE POLICY "aftership_trackings_select" ON aftership_trackings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "aftership_webhook_log_select" ON aftership_webhook_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "aftership_checkpoints_select" ON aftership_checkpoints
  FOR SELECT TO authenticated USING (true);

-- Allow service role full access
CREATE POLICY "aftership_trackings_service" ON aftership_trackings
  FOR ALL TO service_role USING (true);

CREATE POLICY "aftership_webhook_log_service" ON aftership_webhook_log
  FOR ALL TO service_role USING (true);

CREATE POLICY "aftership_checkpoints_service" ON aftership_checkpoints
  FOR ALL TO service_role USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- INITIALIZE AFTERSHIP CONFIG
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO app_settings (setting_key, setting_category, setting_value)
VALUES ('aftership_config', 'integrations', '{
  "enabled": false,
  "apiKey": null,
  "webhookSecret": null,
  "webhookUrl": null,
  "defaultSlug": "ups",
  "autoCreateTracking": true,
  "autoCorrelate": true,
  "correlateWithEmail": true,
  "pollInterval": 3600,
  "enableWebhooks": true,
  "lastPollAt": null,
  "stats": {
    "totalTrackings": 0,
    "activeTrackings": 0,
    "correlatedPOs": 0,
    "webhooksReceived": 0,
    "lastWebhookAt": null
  }
}'::JSONB)
ON CONFLICT (setting_key) DO NOTHING;

COMMENT ON TABLE aftership_trackings IS 'AfterShip tracking data for INBOUND PO shipments - critical for stockout prevention';
COMMENT ON TABLE aftership_webhook_log IS 'Log of all AfterShip webhook events for auditing and debugging';
COMMENT ON TABLE aftership_checkpoints IS 'Detailed checkpoint history for each tracking';
