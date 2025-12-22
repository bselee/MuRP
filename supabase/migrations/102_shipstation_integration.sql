-- Migration 102: ShipStation Integration
--
-- Adds ShipStation as a real-time tracking source alongside AfterShip and Email.
-- Provides webhook handling, order/shipment sync, and PO correlation.
--
-- Part of: Email Tracking Agent Expansion
-- Goal: NEVER BE OUT OF STOCK!

-- ============================================================================
-- SHIPSTATION SYNC LOG TABLE
-- ============================================================================
-- Tracks all ShipStation webhook events for deduplication and audit

CREATE TABLE IF NOT EXISTS shipstation_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ShipStation IDs
    shipstation_order_id TEXT,
    shipstation_order_number TEXT,
    shipstation_shipment_id TEXT,

    -- MuRP Correlations
    po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    shipment_data_id UUID REFERENCES po_shipment_data(id) ON DELETE SET NULL,
    thread_id UUID REFERENCES email_threads(id) ON DELETE SET NULL,

    -- Event Info
    event_type TEXT NOT NULL,                      -- ORDER_NOTIFY, SHIP_NOTIFY, ITEM_SHIP_NOTIFY
    resource_url TEXT,
    webhook_id TEXT,

    -- Payload Data
    payload JSONB,
    tracking_number TEXT,
    carrier_code TEXT,
    ship_date DATE,
    estimated_delivery DATE,
    actual_delivery DATE,

    -- Correlation
    correlation_method TEXT CHECK (correlation_method IN (
        'order_number',        -- Matched by order number
        'tracking_number',     -- Matched by tracking number
        'vendor_match',        -- Matched by vendor name/address
        'email_thread',        -- Matched to email thread
        'manual'               -- Manually linked
    )),
    correlation_confidence DECIMAL(3,2),
    correlation_notes TEXT,

    -- Processing
    processed_at TIMESTAMPTZ DEFAULT now(),
    processing_status TEXT DEFAULT 'success' CHECK (processing_status IN (
        'success', 'partial', 'failed', 'skipped', 'duplicate'
    )),
    processing_error TEXT,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for deduplication and queries
CREATE INDEX IF NOT EXISTS idx_shipstation_sync_order ON shipstation_sync_log(shipstation_order_id);
CREATE INDEX IF NOT EXISTS idx_shipstation_sync_shipment ON shipstation_sync_log(shipstation_shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipstation_sync_tracking ON shipstation_sync_log(tracking_number);
CREATE INDEX IF NOT EXISTS idx_shipstation_sync_po ON shipstation_sync_log(po_id) WHERE po_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipstation_sync_thread ON shipstation_sync_log(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipstation_sync_event ON shipstation_sync_log(event_type, created_at);

-- Unique constraint to prevent duplicate event processing
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipstation_sync_unique_event
    ON shipstation_sync_log(shipstation_shipment_id, event_type)
    WHERE shipstation_shipment_id IS NOT NULL;

-- ============================================================================
-- SHIPSTATION ORDERS TABLE (Optional - for full order sync)
-- ============================================================================
-- Caches ShipStation order data for correlation and reporting

CREATE TABLE IF NOT EXISTS shipstation_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ShipStation IDs
    shipstation_order_id TEXT UNIQUE NOT NULL,
    order_number TEXT NOT NULL,
    order_key TEXT,

    -- Order Status
    order_status TEXT,                             -- awaiting_payment, awaiting_shipment, shipped, etc.
    order_date TIMESTAMPTZ,
    ship_date DATE,
    payment_date TIMESTAMPTZ,

    -- Customer Info (for matching)
    customer_email TEXT,
    customer_name TEXT,

    -- Ship To Address
    ship_to_name TEXT,
    ship_to_company TEXT,
    ship_to_address TEXT,
    ship_to_city TEXT,
    ship_to_state TEXT,
    ship_to_postal_code TEXT,
    ship_to_country TEXT,

    -- Order Totals
    order_total DECIMAL(10,2),
    shipping_amount DECIMAL(10,2),
    tax_amount DECIMAL(10,2),

    -- Items (JSONB for flexibility)
    items JSONB,                                   -- [{sku, name, quantity, unitPrice}]

    -- Shipments
    shipments JSONB,                               -- [{shipmentId, trackingNumber, carrier, shipDate}]

    -- MuRP Correlation
    po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    correlation_status TEXT DEFAULT 'pending' CHECK (correlation_status IN (
        'pending', 'matched', 'unmatched', 'manual', 'ignored'
    )),

    -- Sync Status
    last_synced_at TIMESTAMPTZ DEFAULT now(),
    sync_source TEXT DEFAULT 'webhook',            -- webhook, manual, scheduled

    -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipstation_orders_number ON shipstation_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_shipstation_orders_status ON shipstation_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_shipstation_orders_po ON shipstation_orders(po_id) WHERE po_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipstation_orders_pending ON shipstation_orders(correlation_status)
    WHERE correlation_status = 'pending';

-- ============================================================================
-- SHIPSTATION CONFIGURATION IN APP_SETTINGS
-- ============================================================================

INSERT INTO app_settings (setting_key, setting_value, description)
VALUES (
    'shipstation_config',
    '{
        "enabled": false,
        "apiKey": null,
        "apiSecret": null,
        "webhookSecret": null,
        "webhookUrl": null,
        "syncOrders": true,
        "syncShipments": true,
        "autoCorrelate": true,
        "correlateWithEmail": true,
        "syncHistoricalDays": 30,
        "lastSyncAt": null,
        "stats": {
            "totalOrders": 0,
            "totalShipments": 0,
            "matchedPOs": 0,
            "unmatchedOrders": 0
        }
    }'::jsonb,
    'ShipStation API integration configuration'
)
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================================
-- ADD SHIPSTATION SOURCE TO TRACKING EVENTS
-- ============================================================================

-- Add 'shipstation' as valid source for tracking events
ALTER TABLE shipment_tracking_events
    DROP CONSTRAINT IF EXISTS shipment_tracking_events_source_check;

ALTER TABLE shipment_tracking_events
    ADD CONSTRAINT shipment_tracking_events_source_check
    CHECK (source IN ('email', 'aftership', 'manual', 'carrier_api', 'shipstation'));

-- ============================================================================
-- FUNCTIONS FOR SHIPSTATION CORRELATION
-- ============================================================================

-- Function to find PO by order number (supports various formats)
CREATE OR REPLACE FUNCTION find_po_by_order_number(p_order_number TEXT)
RETURNS UUID AS $$
DECLARE
    v_po_id UUID;
BEGIN
    -- Exact match
    SELECT id INTO v_po_id
    FROM purchase_orders
    WHERE order_id = p_order_number
    LIMIT 1;

    IF v_po_id IS NOT NULL THEN
        RETURN v_po_id;
    END IF;

    -- Try with PO- prefix
    SELECT id INTO v_po_id
    FROM purchase_orders
    WHERE order_id = 'PO-' || p_order_number
       OR order_id = 'PO' || p_order_number
    LIMIT 1;

    IF v_po_id IS NOT NULL THEN
        RETURN v_po_id;
    END IF;

    -- Try partial match (order number contains)
    SELECT id INTO v_po_id
    FROM purchase_orders
    WHERE order_id ILIKE '%' || p_order_number || '%'
    ORDER BY created_at DESC
    LIMIT 1;

    RETURN v_po_id;
END;
$$ LANGUAGE plpgsql;

-- Function to find PO by tracking number
CREATE OR REPLACE FUNCTION find_po_by_tracking_number(p_tracking_number TEXT)
RETURNS UUID AS $$
DECLARE
    v_po_id UUID;
BEGIN
    -- Check po_shipment_data
    SELECT po_id INTO v_po_id
    FROM po_shipment_data
    WHERE tracking_numbers @> ARRAY[p_tracking_number]
       OR p_tracking_number = ANY(tracking_numbers)
    LIMIT 1;

    IF v_po_id IS NOT NULL THEN
        RETURN v_po_id;
    END IF;

    -- Check legacy tracking_number column
    SELECT id INTO v_po_id
    FROM purchase_orders
    WHERE tracking_number = p_tracking_number
    LIMIT 1;

    RETURN v_po_id;
END;
$$ LANGUAGE plpgsql;

-- Function to find email thread by tracking number
CREATE OR REPLACE FUNCTION find_email_thread_by_tracking(p_tracking_number TEXT)
RETURNS UUID AS $$
DECLARE
    v_thread_id UUID;
BEGIN
    -- Check email_threads.tracking_numbers
    SELECT id INTO v_thread_id
    FROM email_threads
    WHERE tracking_numbers @> ARRAY[p_tracking_number]
       OR p_tracking_number = ANY(tracking_numbers)
    ORDER BY last_message_at DESC
    LIMIT 1;

    IF v_thread_id IS NOT NULL THEN
        RETURN v_thread_id;
    END IF;

    -- Check email_thread_messages.extracted_tracking_number
    SELECT thread_id INTO v_thread_id
    FROM email_thread_messages
    WHERE extracted_tracking_number = p_tracking_number
    ORDER BY sent_at DESC
    LIMIT 1;

    RETURN v_thread_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update tracking from ShipStation
CREATE OR REPLACE FUNCTION update_tracking_from_shipstation(
    p_po_id UUID,
    p_tracking_number TEXT,
    p_carrier TEXT,
    p_ship_date DATE,
    p_estimated_delivery DATE,
    p_status TEXT DEFAULT 'shipped'
) RETURNS VOID AS $$
DECLARE
    v_shipment_id UUID;
BEGIN
    -- Check if shipment exists for this PO with this tracking
    SELECT id INTO v_shipment_id
    FROM po_shipment_data
    WHERE po_id = p_po_id
      AND (tracking_numbers @> ARRAY[p_tracking_number] OR tracking_numbers = '{}')
    LIMIT 1;

    IF v_shipment_id IS NOT NULL THEN
        -- Update existing shipment
        UPDATE po_shipment_data SET
            tracking_numbers = CASE
                WHEN NOT (tracking_numbers @> ARRAY[p_tracking_number])
                THEN array_append(COALESCE(tracking_numbers, ARRAY[]::TEXT[]), p_tracking_number)
                ELSE tracking_numbers
            END,
            carrier = COALESCE(p_carrier, carrier),
            ship_date = COALESCE(p_ship_date::TEXT, ship_date),
            estimated_delivery_date = COALESCE(p_estimated_delivery::TEXT, estimated_delivery_date),
            status = CASE
                WHEN p_status IN ('shipped', 'in_transit', 'out_for_delivery', 'delivered')
                THEN p_status
                ELSE status
            END,
            updated_at = now()
        WHERE id = v_shipment_id;
    ELSE
        -- Create new shipment
        INSERT INTO po_shipment_data (
            po_id,
            tracking_numbers,
            carrier,
            ship_date,
            estimated_delivery_date,
            status,
            extracted_at,
            created_at,
            updated_at
        ) VALUES (
            p_po_id,
            ARRAY[p_tracking_number],
            p_carrier,
            p_ship_date::TEXT,
            p_estimated_delivery::TEXT,
            p_status,
            now(),
            now(),
            now()
        )
        RETURNING id INTO v_shipment_id;
    END IF;

    -- Also update legacy PO columns for backward compatibility
    UPDATE purchase_orders SET
        tracking_number = COALESCE(tracking_number, p_tracking_number),
        tracking_carrier = COALESCE(tracking_carrier, p_carrier),
        tracking_status = COALESCE(
            CASE p_status
                WHEN 'shipped' THEN 'shipped'
                WHEN 'in_transit' THEN 'in_transit'
                WHEN 'delivered' THEN 'delivered'
                ELSE tracking_status
            END,
            tracking_status
        ),
        tracking_estimated_delivery = COALESCE(p_estimated_delivery::TEXT, tracking_estimated_delivery),
        tracking_last_updated = now()
    WHERE id = p_po_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: ShipStation correlation status
CREATE OR REPLACE VIEW shipstation_correlation_summary AS
SELECT
    ss.id,
    ss.order_number,
    ss.shipstation_order_id,
    ss.order_status,
    ss.correlation_status,
    ss.po_id,
    po.order_id as po_number,
    po.vendor_name,
    ss.shipments,
    ss.created_at,
    ss.last_synced_at
FROM shipstation_orders ss
LEFT JOIN purchase_orders po ON po.id = ss.po_id
ORDER BY ss.created_at DESC;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE shipstation_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipstation_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read shipstation_sync_log" ON shipstation_sync_log;
DROP POLICY IF EXISTS "Allow authenticated users to manage shipstation_sync_log" ON shipstation_sync_log;
DROP POLICY IF EXISTS "Allow authenticated users to read shipstation_orders" ON shipstation_orders;
DROP POLICY IF EXISTS "Allow authenticated users to manage shipstation_orders" ON shipstation_orders;

CREATE POLICY "Allow authenticated users to read shipstation_sync_log"
    ON shipstation_sync_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage shipstation_sync_log"
    ON shipstation_sync_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read shipstation_orders"
    ON shipstation_orders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage shipstation_orders"
    ON shipstation_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_shipstation_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shipstation_orders_updated_at ON shipstation_orders;
CREATE TRIGGER shipstation_orders_updated_at
    BEFORE UPDATE ON shipstation_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_shipstation_orders_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE shipstation_sync_log IS
    'Audit log of all ShipStation webhook events and API syncs for deduplication and debugging.';

COMMENT ON TABLE shipstation_orders IS
    'Cached ShipStation orders for correlation with MuRP purchase orders.';

COMMENT ON FUNCTION find_po_by_order_number IS
    'Finds a MuRP PO by order number with fuzzy matching support.';

COMMENT ON FUNCTION find_po_by_tracking_number IS
    'Finds a MuRP PO by tracking number across shipment data and legacy columns.';

COMMENT ON FUNCTION find_email_thread_by_tracking IS
    'Finds an email thread that contains a specific tracking number.';

COMMENT ON FUNCTION update_tracking_from_shipstation IS
    'Updates tracking data from ShipStation, creating shipment records if needed.';
