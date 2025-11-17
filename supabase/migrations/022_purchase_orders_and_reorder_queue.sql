-- ============================================================================
-- Migration 022: Purchase Orders and Reorder Queue
-- Finale-compatible schema for purchase order management and automated reordering
-- ============================================================================

-- ============================================================================
-- PURCHASE ORDERS TABLE
-- Stores purchase order headers with Finale compatibility
-- ============================================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Order identification
  order_id VARCHAR(50) UNIQUE NOT NULL, -- Finale PO number format: PO-YYYYMMDD-XXX
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Vendor information
  vendor_id UUID REFERENCES vendors(id),
  supplier_code VARCHAR(50), -- Finale supplier code
  supplier_name VARCHAR(255) NOT NULL,
  supplier_contact VARCHAR(255),
  supplier_email VARCHAR(255),
  supplier_phone VARCHAR(50),

  -- Order details
  status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, pending, sent, confirmed, partial, received, cancelled
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent

  -- Fulfillment tracking
  expected_date DATE,
  actual_receive_date DATE,
  tracking_number VARCHAR(100),
  tracking_link TEXT,
  carrier VARCHAR(50),
  shipments TEXT, -- Finale shipment notes

  -- Financial
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  shipping_cost DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'USD',
  payment_terms VARCHAR(100),

  -- Workflow
  approved_by VARCHAR(255),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,

  -- Notes and attachments
  internal_notes TEXT,
  vendor_notes TEXT,
  special_instructions TEXT,

  -- Finale sync
  finale_po_id VARCHAR(50), -- Finale internal ID
  finale_status VARCHAR(50), -- Finale status mapping
  last_finale_sync TIMESTAMPTZ,

  -- Source tracking
  source VARCHAR(50) DEFAULT 'manual', -- manual, auto_reorder, requisition, forecast
  requisition_ids UUID[], -- Links to internal requisitions
  auto_generated BOOLEAN DEFAULT FALSE,
  generation_reason TEXT,

  -- Metadata
  record_created TIMESTAMPTZ DEFAULT NOW(),
  record_last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),
  updated_by VARCHAR(255)
);

-- Indexes for purchase_orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_id ON purchase_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor_id ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date ON purchase_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_expected_date ON purchase_orders(expected_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_finale_sync ON purchase_orders(last_finale_sync);

COMMENT ON TABLE purchase_orders IS 'Purchase order headers with Finale compatibility';

-- ============================================================================
-- PURCHASE ORDER ITEMS (LINE ITEMS)
-- Individual line items for each purchase order
-- ============================================================================
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  inventory_sku VARCHAR(50) NOT NULL,

  -- Item details
  item_name VARCHAR(255) NOT NULL,
  item_description TEXT,
  supplier_sku VARCHAR(100), -- Vendor's SKU for this item

  -- Quantities
  quantity_ordered INTEGER NOT NULL,
  quantity_received INTEGER DEFAULT 0,
  quantity_pending INTEGER GENERATED ALWAYS AS (quantity_ordered - quantity_received) STORED,
  unit_of_measure VARCHAR(20) DEFAULT 'EA',

  -- Pricing
  unit_cost DECIMAL(10,2) NOT NULL,
  line_total DECIMAL(12,2) GENERATED ALWAYS AS (quantity_ordered * unit_cost) STORED,
  discount_percent DECIMAL(5,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,

  -- Fulfillment
  line_status VARCHAR(50) DEFAULT 'pending', -- pending, partial, received, cancelled
  expected_delivery DATE,
  actual_delivery DATE,

  -- Reorder context (why was this ordered?)
  reorder_reason VARCHAR(100), -- low_stock, stockout, forecast, seasonal, manual
  safety_stock_target INTEGER,
  consumption_30day INTEGER,
  consumption_90day INTEGER,
  days_of_stock_at_order INTEGER,

  -- Notes
  line_notes TEXT,

  -- Metadata
  line_number INTEGER, -- Order of items in PO
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for purchase_order_items
CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_inventory_sku ON purchase_order_items(inventory_sku);
CREATE INDEX IF NOT EXISTS idx_po_items_line_status ON purchase_order_items(line_status);

COMMENT ON TABLE purchase_order_items IS 'Line items for purchase orders with consumption tracking';

-- ============================================================================
-- REORDER QUEUE
-- Automated reorder recommendations and tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS reorder_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Item identification
  inventory_sku VARCHAR(50) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  vendor_id UUID REFERENCES vendors(id),
  vendor_name VARCHAR(255),

  -- Current state
  current_stock INTEGER NOT NULL,
  on_order INTEGER DEFAULT 0,
  available_stock INTEGER GENERATED ALWAYS AS (current_stock + on_order) STORED,

  -- Reorder calculations
  reorder_point INTEGER NOT NULL,
  safety_stock INTEGER DEFAULT 0,
  moq INTEGER DEFAULT 1, -- Minimum order quantity
  recommended_quantity INTEGER NOT NULL,

  -- Consumption metrics
  consumption_daily DECIMAL(10,2),
  consumption_30day INTEGER,
  consumption_90day INTEGER,
  consumption_variance DECIMAL(5,2), -- Variability in consumption

  -- Lead time
  lead_time_days INTEGER DEFAULT 14,
  days_until_stockout INTEGER, -- Calculated field

  -- Urgency
  urgency VARCHAR(20) NOT NULL DEFAULT 'normal', -- critical, high, normal, low
  priority_score INTEGER DEFAULT 50, -- 0-100 scoring for queue ordering

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, po_created, ordered, resolved, cancelled

  -- Workflow tracking
  identified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  po_id UUID REFERENCES purchase_orders(id),
  po_created_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_type VARCHAR(50), -- ordered, manual_adjustment, inventory_correction, cancelled

  -- Cost impact
  resolution_type VARCHAR(50), -- ordered, manual_adjustment, inventory_correction, cancelled

  -- Cost impact
  estimated_cost DECIMAL(10,2),
  estimated_stockout_risk_usd DECIMAL(10,2), -- Potential lost sales if not ordered

  -- AI insights
  ai_recommendation TEXT,
  ai_confidence DECIMAL(3,2), -- 0.00 to 1.00
  seasonal_factor DECIMAL(3,2), -- Adjustment for seasonality

  -- Notes
  notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for reorder_queue
CREATE INDEX IF NOT EXISTS idx_reorder_queue_sku ON reorder_queue(inventory_sku);
CREATE INDEX IF NOT EXISTS idx_reorder_queue_vendor ON reorder_queue(vendor_id);
CREATE INDEX IF NOT EXISTS idx_reorder_queue_status ON reorder_queue(status);
CREATE INDEX IF NOT EXISTS idx_reorder_queue_urgency ON reorder_queue(urgency);
CREATE INDEX IF NOT EXISTS idx_reorder_queue_priority ON reorder_queue(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_reorder_queue_identified ON reorder_queue(identified_at DESC);
CREATE INDEX IF NOT EXISTS idx_reorder_queue_active ON reorder_queue(status)
  WHERE status IN ('pending', 'po_created');

COMMENT ON TABLE reorder_queue IS 'Automated reorder queue with AI recommendations and urgency scoring';

-- ============================================================================
-- FINALE SYNC LOG
-- Tracks synchronization with Finale Inventory system
-- ============================================================================
CREATE TABLE IF NOT EXISTS finale_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sync details
  sync_type VARCHAR(50) NOT NULL, -- import_po, export_po, status_update
  entity_type VARCHAR(50) NOT NULL, -- purchase_order, inventory, vendor
  entity_id VARCHAR(100), -- PO number or SKU

  -- Operation
  operation VARCHAR(20) NOT NULL, -- create, update, delete
  direction VARCHAR(10) NOT NULL, -- import, export

  -- Result
  status VARCHAR(20) NOT NULL, -- success, error, partial
  records_processed INTEGER DEFAULT 1,
  error_message TEXT,
  error_details JSONB,

  -- Payload
  request_data JSONB,
  response_data JSONB,

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Metadata
  triggered_by VARCHAR(100), -- user email or 'system'
  sync_source VARCHAR(50) -- manual, cron, webhook, api
);

-- Indexes for finale_sync_log
CREATE INDEX IF NOT EXISTS idx_finale_sync_log_entity ON finale_sync_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_finale_sync_log_started ON finale_sync_log(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_finale_sync_log_status ON finale_sync_log(status);

COMMENT ON TABLE finale_sync_log IS 'Audit log for Finale Inventory synchronization';

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active POs needing attention
CREATE OR REPLACE VIEW active_purchase_orders AS
SELECT
  po.id,
  po.order_id,
  po.order_date,
  po.supplier_name,
  po.status,
  po.total_amount,
  po.expected_date,
  COUNT(poi.id) as line_item_count,
  SUM(CASE WHEN poi.line_status = 'pending' THEN 1 ELSE 0 END) as pending_items,
  SUM(CASE WHEN poi.line_status = 'received' THEN 1 ELSE 0 END) as received_items
FROM purchase_orders po
LEFT JOIN purchase_order_items poi ON po.id = poi.po_id
WHERE po.status NOT IN ('received', 'cancelled')
GROUP BY po.id, po.order_id, po.order_date, po.supplier_name, po.status, po.total_amount, po.expected_date
ORDER BY po.expected_date NULLS LAST, po.order_date DESC;

COMMENT ON VIEW active_purchase_orders IS 'Active purchase orders with item counts';

-- Urgent reorder queue items
CREATE OR REPLACE VIEW urgent_reorders AS
SELECT
  rq.id,
  rq.inventory_sku,
  rq.item_name,
  rq.vendor_name,
  rq.current_stock,
  rq.recommended_quantity,
  rq.days_until_stockout,
  rq.urgency,
  rq.priority_score,
  rq.estimated_cost,
  rq.identified_at
FROM reorder_queue rq
WHERE rq.status = 'pending'
  AND rq.urgency IN ('critical', 'high')
ORDER BY rq.priority_score DESC, rq.days_until_stockout ASC;

COMMENT ON VIEW urgent_reorders IS 'Critical and high priority items in reorder queue';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update PO totals
CREATE OR REPLACE FUNCTION update_po_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE purchase_orders
  SET
    subtotal = (
      SELECT COALESCE(SUM(line_total), 0)
      FROM purchase_order_items
      WHERE po_id = NEW.po_id
    ),
    record_last_updated = NOW()
  WHERE id = NEW.po_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update PO totals when line items change
DROP TRIGGER IF EXISTS trigger_update_po_totals ON purchase_order_items;
CREATE TRIGGER trigger_update_po_totals
  AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_po_totals();

-- Function to calculate days until stockout
CREATE OR REPLACE FUNCTION calculate_days_until_stockout(
  p_current_stock INTEGER,
  p_consumption_daily DECIMAL
)
RETURNS INTEGER AS $$
BEGIN
  IF p_consumption_daily IS NULL OR p_consumption_daily <= 0 THEN
    RETURN 999; -- No consumption data, return high value
  END IF;

  RETURN FLOOR(p_current_stock / p_consumption_daily);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_days_until_stockout IS 'Calculate days until item will stock out based on daily consumption';

-- Function to get reorder queue summary
CREATE OR REPLACE FUNCTION get_reorder_queue_summary()
RETURNS TABLE (
  total_items BIGINT,
  critical_items BIGINT,
  high_priority_items BIGINT,
  total_estimated_cost DECIMAL,
  avg_days_to_stockout DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_items,
    COUNT(*) FILTER (WHERE urgency = 'critical')::BIGINT as critical_items,
    COUNT(*) FILTER (WHERE urgency = 'high')::BIGINT as high_priority_items,
    COALESCE(SUM(estimated_cost), 0) as total_estimated_cost,
    COALESCE(AVG(days_until_stockout), 0) as avg_days_to_stockout
  FROM reorder_queue
  WHERE status = 'pending';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_reorder_queue_summary IS 'Get summary statistics for reorder queue';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reorder_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE finale_sync_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all records
CREATE POLICY "Allow authenticated read purchase_orders"
  ON purchase_orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read purchase_order_items"
  ON purchase_order_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read reorder_queue"
  ON reorder_queue FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read finale_sync_log"
  ON finale_sync_log FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert/update purchase orders
CREATE POLICY "Allow authenticated write purchase_orders"
  ON purchase_orders FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated write purchase_order_items"
  ON purchase_order_items FOR ALL
  TO authenticated
  USING (true);

-- Service role has full access to reorder_queue
CREATE POLICY "Allow service role full access reorder_queue"
  ON reorder_queue FOR ALL
  TO service_role
  USING (true);

-- Service role has full access to sync log
CREATE POLICY "Allow service role full access finale_sync_log"
  ON finale_sync_log FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON purchase_orders TO authenticated;
GRANT SELECT ON purchase_order_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON purchase_orders TO authenticated;
GRANT INSERT, UPDATE, DELETE ON purchase_order_items TO authenticated;
GRANT SELECT ON reorder_queue TO authenticated;
GRANT SELECT ON finale_sync_log TO authenticated;

GRANT SELECT ON active_purchase_orders TO authenticated;
GRANT SELECT ON urgent_reorders TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON SCHEMA public IS 'Purchase Orders and Reorder Queue - Migration 022 Complete';
