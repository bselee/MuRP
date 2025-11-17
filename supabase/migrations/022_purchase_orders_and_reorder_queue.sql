-- Migration: Finale-compatible purchase orders, line items, reorder queue, and sync log

-- ============================================================================
-- PURCHASE ORDERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier VARCHAR(255) NOT NULL,
  estimated_receive_date DATE,
  destination VARCHAR(100),
  ship_to_formatted TEXT,
  shipments TEXT,
  total NUMERIC(12,2) NOT NULL,
  taxable_discount_fee_freight NUMERIC(10,2),
  tracking_link TEXT,
  tracking_number VARCHAR(100),
  est_days_of_stock INTEGER,
  date_out_of_stock DATE,
  fulfillment VARCHAR(50),
  allocation VARCHAR(50),
  internal_notes TEXT,
  record_last_updated TIMESTAMPTZ DEFAULT NOW(),

  vendor_id UUID REFERENCES vendors(id) ON DELETE RESTRICT,
  subtotal NUMERIC(12,2) GENERATED ALWAYS AS (
    total - COALESCE(taxable_discount_fee_freight, 0)
  ) STORED,
  tax NUMERIC(10,2) DEFAULT 0,

  requisition_ids UUID[] DEFAULT '{}',
  auto_generated BOOLEAN DEFAULT FALSE,
  generation_reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  vendor_notes TEXT,
  email_draft TEXT,
  email_sent BOOLEAN DEFAULT FALSE,
  email_sent_at TIMESTAMPTZ,
  finale_sync_status VARCHAR(20) DEFAULT 'pending',
  last_synced_at TIMESTAMPTZ,
  finale_record_id VARCHAR(50),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT purchase_orders_status_check CHECK (
    status IN (
      'draft',
      'committed',
      'pending',
      'sent',
      'confirmed',
      'partial',
      'received',
      'cancelled'
    )
  ),
  CONSTRAINT po_positive_total CHECK (total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_id ON purchase_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date ON purchase_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_sync ON purchase_orders(finale_sync_status);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read purchase_orders"
  ON purchase_orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert purchase_orders"
  ON purchase_orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update purchase_orders"
  ON purchase_orders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PURCHASE ORDER LINE ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,

  product_id VARCHAR(50),
  sku VARCHAR(50) REFERENCES inventory_items(sku) ON DELETE RESTRICT,
  description VARCHAR(500) NOT NULL,

  qty_ordered INTEGER NOT NULL CHECK (qty_ordered > 0),
  qty_received INTEGER DEFAULT 0 CHECK (qty_received >= 0),
  qty_cancelled INTEGER DEFAULT 0 CHECK (qty_cancelled >= 0),

  unit_cost NUMERIC(10,4) NOT NULL CHECK (unit_cost >= 0),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),

  finale_metadata JSONB,
  daily_consumption NUMERIC(10,4),
  consumption_30day NUMERIC(10,2),
  consumption_60day NUMERIC(10,2),
  consumption_90day NUMERIC(10,2),
  days_of_stock_when_ordered NUMERIC(5,1),
  supplier_lead_time INTEGER,
  suggested_qty NUMERIC(10,2),

  received_date DATE,
  received_by UUID REFERENCES auth.users(id),
  line_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT po_items_qty_logic CHECK (qty_received + qty_cancelled <= qty_ordered)
);

CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_sku ON purchase_order_items(sku);
CREATE INDEX IF NOT EXISTS idx_po_items_product_id ON purchase_order_items(product_id);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read purchase_order_items"
  ON purchase_order_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert purchase_order_items"
  ON purchase_order_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update purchase_order_items"
  ON purchase_order_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- REORDER QUEUE
-- ============================================================================
CREATE TABLE IF NOT EXISTS reorder_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(50) REFERENCES inventory_items(sku) ON DELETE CASCADE,

  current_stock INTEGER NOT NULL,
  consumption_30day NUMERIC(10,2),
  consumption_60day NUMERIC(10,2),
  consumption_90day NUMERIC(10,2),
  daily_consumption_rate NUMERIC(10,2) GENERATED ALWAYS AS (
    (COALESCE(consumption_30day, 0) * 0.5 + COALESCE(consumption_60day, 0) * 0.3 + COALESCE(consumption_90day, 0) * 0.2) / 30
  ) STORED,

  days_until_stockout NUMERIC(5,1),
  days_until_order_needed NUMERIC(5,1),
  order_trigger_date DATE,
  urgency_level VARCHAR(20),

  suggested_qty INTEGER,
  suggested_order_cost NUMERIC(10,2),

  vendor_id UUID REFERENCES vendors(id),
  vendor_lead_time INTEGER,

  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'po_created',
    'ordered',
    'resolved'
  )),

  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  ai_recommendation TEXT,
  consolidation_opportunity BOOLEAN DEFAULT FALSE,

  CONSTRAINT unique_pending_reorder UNIQUE (sku, status)
    WHERE status IN ('pending', 'po_created')
);

CREATE INDEX IF NOT EXISTS idx_reorder_urgency ON reorder_queue(urgency_level, order_trigger_date);
CREATE INDEX IF NOT EXISTS idx_reorder_vendor ON reorder_queue(vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_reorder_status ON reorder_queue(status);

ALTER TABLE reorder_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read reorder_queue"
  ON reorder_queue FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert reorder_queue"
  ON reorder_queue FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update reorder_queue"
  ON reorder_queue FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- FINALE SYNC LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS finale_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_type VARCHAR(20) NOT NULL,
  records_processed INTEGER,
  records_succeeded INTEGER,
  records_failed INTEGER,
  file_name VARCHAR(255),
  file_path TEXT,
  error_details JSONB,
  initiated_by UUID REFERENCES auth.users(id),
  success BOOLEAN DEFAULT TRUE
);

ALTER TABLE finale_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read finale_sync_log"
  ON finale_sync_log FOR SELECT
  TO authenticated
  USING (true);
