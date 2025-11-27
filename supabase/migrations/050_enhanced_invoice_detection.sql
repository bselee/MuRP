-- 050_enhanced_invoice_detection.sql
-- Enhanced invoice detection with comprehensive data extraction, variance analysis, and AP forwarding

BEGIN;

-- ============================================================================
-- INVOICE DATA TABLE
-- Stores comprehensive invoice information extracted from vendor emails
-- ============================================================================

CREATE TABLE IF NOT EXISTS po_invoice_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links to PO
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,

  -- Invoice identification
  invoice_number VARCHAR(100),
  invoice_date DATE,
  invoice_due_date DATE,

  -- Vendor information (from invoice)
  vendor_name VARCHAR(255),
  vendor_address TEXT,
  vendor_contact VARCHAR(255),

  -- Ship to information
  ship_to_name VARCHAR(255),
  ship_to_address TEXT,

  -- Financial totals
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  shipping_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'USD',

  -- Line items (stored as JSONB array)
  line_items JSONB DEFAULT '[]'::jsonb,

  -- Processing metadata
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  confidence_score DECIMAL(3,2), -- 0.00 to 1.00
  extraction_method VARCHAR(50) DEFAULT 'ai', -- ai, manual, ocr
  raw_extracted_data JSONB, -- Full AI response for debugging

  -- Status
  status VARCHAR(50) DEFAULT 'pending_review', -- pending_review, approved, rejected, forwarded_to_ap
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- AP forwarding
  forwarded_to_ap BOOLEAN DEFAULT FALSE,
  ap_email_address VARCHAR(255),
  forwarded_at TIMESTAMPTZ,
  ap_reference_number VARCHAR(100),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for po_invoice_data
CREATE INDEX IF NOT EXISTS idx_po_invoice_data_po_id ON po_invoice_data(po_id);
CREATE INDEX IF NOT EXISTS idx_po_invoice_data_status ON po_invoice_data(status);
CREATE INDEX IF NOT EXISTS idx_po_invoice_data_invoice_number ON po_invoice_data(invoice_number);
CREATE INDEX IF NOT EXISTS idx_po_invoice_data_extracted_at ON po_invoice_data(extracted_at DESC);

COMMENT ON TABLE po_invoice_data IS 'Comprehensive invoice data extracted from vendor emails with variance analysis';

-- ============================================================================
-- INVOICE VARIANCE TABLE
-- Tracks pricing and shipping variances between PO and invoice
-- ============================================================================

CREATE TABLE IF NOT EXISTS po_invoice_variances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  invoice_data_id UUID REFERENCES po_invoice_data(id) ON DELETE CASCADE,

  -- Variance type
  variance_type VARCHAR(50) NOT NULL, -- shipping, pricing, tax, total
  severity VARCHAR(20) NOT NULL DEFAULT 'info', -- info, warning, critical

  -- Amounts
  po_amount DECIMAL(12,2) DEFAULT 0,
  invoice_amount DECIMAL(12,2) DEFAULT 0,
  variance_amount DECIMAL(12,2) DEFAULT 0,
  variance_percentage DECIMAL(5,2) DEFAULT 0,

  -- Item details (for pricing variances)
  po_item_id UUID REFERENCES purchase_order_items(id),
  invoice_sku VARCHAR(100),
  internal_sku VARCHAR(50),
  item_description VARCHAR(255),

  -- Thresholds and rules
  threshold_percentage DECIMAL(5,2), -- Configured threshold that triggered this variance
  threshold_amount DECIMAL(12,2), -- Absolute threshold amount

  -- Resolution
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, overridden
  resolution_notes TEXT,
  resolved_by VARCHAR(255),
  resolved_at TIMESTAMPTZ,

  -- Auto-approval rules
  auto_approved BOOLEAN DEFAULT FALSE,
  approval_rule VARCHAR(100), -- e.g., "shipping_zero_to_any", "pricing_under_5_percent"

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for po_invoice_variances
CREATE INDEX IF NOT EXISTS idx_po_invoice_variances_po_id ON po_invoice_variances(po_id);
CREATE INDEX IF NOT EXISTS idx_po_invoice_variances_invoice_data_id ON po_invoice_variances(invoice_data_id);
CREATE INDEX IF NOT EXISTS idx_po_invoice_variances_type ON po_invoice_variances(variance_type);
CREATE INDEX IF NOT EXISTS idx_po_invoice_variances_severity ON po_invoice_variances(severity);
CREATE INDEX IF NOT EXISTS idx_po_invoice_variances_status ON po_invoice_variances(status);

COMMENT ON TABLE po_invoice_variances IS 'Pricing and shipping variances between purchase orders and invoices';

-- ============================================================================
-- VARIANCE THRESHOLDS CONFIGURATION
-- Configurable thresholds for variance detection
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_variance_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Threshold configuration
  threshold_type VARCHAR(50) NOT NULL, -- shipping, pricing, tax
  severity_level VARCHAR(20) NOT NULL, -- info, warning, critical

  -- Threshold values
  percentage_threshold DECIMAL(5,2), -- e.g., 5.00 for 5%
  absolute_threshold DECIMAL(12,2), -- e.g., 50.00 for $50

  -- Special rules
  special_rules JSONB DEFAULT '{}'::jsonb, -- e.g., {"shipping_zero_to_any": true}

  -- Active status
  is_active BOOLEAN DEFAULT TRUE,

  -- Metadata
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default variance thresholds
INSERT INTO app_variance_thresholds (threshold_type, severity_level, percentage_threshold, absolute_threshold, special_rules) VALUES
  ('shipping', 'info', NULL, 0.01, '{"zero_to_any": true}'::jsonb), -- Any shipping cost when PO has $0
  ('pricing', 'warning', 5.00, NULL, '{}'::jsonb), -- 5% price variance
  ('pricing', 'critical', 10.00, NULL, '{}'::jsonb), -- 10% price variance
  ('tax', 'info', NULL, 0.01, '{}'::jsonb), -- Any tax amount
  ('total', 'warning', 2.00, NULL, '{}'::jsonb), -- 2% total variance
  ('total', 'critical', 5.00, NULL, '{}'::jsonb); -- 5% total variance

COMMENT ON TABLE app_variance_thresholds IS 'Configurable thresholds for invoice variance detection and alerts';

-- ============================================================================
-- UPDATE PURCHASE ORDERS TABLE
-- Add fields for enhanced invoice processing
-- ============================================================================

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS invoice_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS invoice_variance_alerts JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS invoice_forwarded_to_ap BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invoice_ap_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS invoice_ap_reference VARCHAR(100);

-- ============================================================================
-- VIEWS FOR INVOICE ANALYSIS
-- ============================================================================

-- Active invoices needing review
CREATE OR REPLACE VIEW active_invoice_reviews AS
SELECT
  pid.id,
  pid.po_id,
  po.order_id,
  po.supplier_name,
  pid.invoice_number,
  pid.total_amount as invoice_total,
  po.total_amount as po_total,
  pid.extracted_at,
  pid.status,
  pid.confidence_score,
  COUNT(piv.id) as variance_count,
  COUNT(CASE WHEN piv.severity = 'critical' THEN 1 END) as critical_variances,
  COUNT(CASE WHEN piv.severity = 'warning' THEN 1 END) as warning_variances
FROM po_invoice_data pid
JOIN purchase_orders po ON pid.po_id = po.id
LEFT JOIN po_invoice_variances piv ON pid.id = piv.invoice_data_id
WHERE pid.status = 'pending_review'
GROUP BY pid.id, pid.po_id, po.order_id, po.supplier_name, pid.invoice_number,
         pid.total_amount, po.total_amount, pid.extracted_at, pid.status, pid.confidence_score
ORDER BY pid.extracted_at DESC;

COMMENT ON VIEW active_invoice_reviews IS 'Invoices pending review with variance summaries';

-- Invoice variance summary
CREATE OR REPLACE VIEW invoice_variance_summary AS
SELECT
  piv.id,
  piv.po_id,
  po.order_id,
  po.supplier_name,
  piv.variance_type,
  piv.severity,
  piv.po_amount,
  piv.invoice_amount,
  piv.variance_amount,
  piv.variance_percentage,
  piv.status as variance_status,
  piv.created_at as detected_at,
  pid.invoice_number,
  pid.status as invoice_status
FROM po_invoice_variances piv
JOIN purchase_orders po ON piv.po_id = po.id
LEFT JOIN po_invoice_data pid ON piv.invoice_data_id = pid.id
ORDER BY piv.created_at DESC;

COMMENT ON VIEW invoice_variance_summary IS 'Summary of all invoice variances with PO details';

-- ============================================================================
-- FUNCTIONS FOR VARIANCE DETECTION
-- ============================================================================

-- Function to calculate invoice variances
CREATE OR REPLACE FUNCTION calculate_invoice_variances(
  p_po_id UUID,
  p_invoice_data JSONB
)
RETURNS TABLE (
  variance_type TEXT,
  severity TEXT,
  po_amount DECIMAL,
  invoice_amount DECIMAL,
  variance_amount DECIMAL,
  variance_percentage DECIMAL,
  threshold_percentage DECIMAL,
  threshold_amount DECIMAL
) AS $$
DECLARE
  po_record RECORD;
  threshold_record RECORD;
  shipping_variance DECIMAL := 0;
  total_variance DECIMAL := 0;
  item_variance RECORD;
BEGIN
  -- Get PO data
  SELECT * INTO po_record FROM purchase_orders WHERE id = p_po_id;

  -- Calculate shipping variance (always check if PO has $0 shipping)
  IF po_record.shipping_cost = 0 AND (p_invoice_data->>'shipping_amount')::DECIMAL > 0 THEN
    shipping_variance := (p_invoice_data->>'shipping_amount')::DECIMAL;
    RETURN QUERY SELECT
      'shipping'::TEXT,
      'info'::TEXT,
      po_record.shipping_cost,
      (p_invoice_data->>'shipping_amount')::DECIMAL,
      shipping_variance,
      CASE WHEN po_record.shipping_cost = 0 THEN 100.0 ELSE
        (shipping_variance / po_record.shipping_cost * 100) END,
      NULL::DECIMAL,
      0.01::DECIMAL;
  END IF;

  -- Calculate total variance
  total_variance := (p_invoice_data->>'total_amount')::DECIMAL - po_record.total_amount;
  IF ABS(total_variance) > 0 THEN
    FOR threshold_record IN
      SELECT * FROM app_variance_thresholds
      WHERE threshold_type = 'total' AND is_active = TRUE
      ORDER BY percentage_threshold DESC
    LOOP
      IF threshold_record.percentage_threshold IS NOT NULL AND
         ABS(total_variance / po_record.total_amount * 100) >= threshold_record.percentage_threshold THEN
        RETURN QUERY SELECT
          'total'::TEXT,
          threshold_record.severity_level::TEXT,
          po_record.total_amount,
          (p_invoice_data->>'total_amount')::DECIMAL,
          total_variance,
          (total_variance / po_record.total_amount * 100),
          threshold_record.percentage_threshold,
          threshold_record.absolute_threshold;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- Calculate item-level pricing variances
  FOR item_variance IN
    SELECT
      (item->>'sku') as invoice_sku,
      (item->>'quantity')::INTEGER as quantity,
      (item->>'unit_price')::DECIMAL as unit_price,
      (item->>'line_total')::DECIMAL as line_total,
      item->>'description' as description
    FROM jsonb_array_elements(p_invoice_data->'line_items') as item
  LOOP
    -- Try to match with PO items (by SKU or description)
    DECLARE
      po_item RECORD;
      price_variance DECIMAL := 0;
      variance_pct DECIMAL := 0;
    BEGIN
      -- First try exact SKU match
      SELECT * INTO po_item
      FROM purchase_order_items
      WHERE po_id = p_po_id AND (
        inventory_sku = item_variance.invoice_sku OR
        supplier_sku = item_variance.invoice_sku
      )
      LIMIT 1;

      -- If no SKU match, try fuzzy description match
      IF po_item IS NULL THEN
        SELECT * INTO po_item
        FROM purchase_order_items
        WHERE po_id = p_po_id AND
        similarity(lower(item_description), lower(item_variance.description)) > 0.6
        LIMIT 1;
      END IF;

      IF po_item IS NOT NULL THEN
        price_variance := item_variance.unit_price - po_item.unit_cost;
        variance_pct := (price_variance / po_item.unit_cost) * 100;

        -- Check against pricing thresholds
        FOR threshold_record IN
          SELECT * FROM app_variance_thresholds
          WHERE threshold_type = 'pricing' AND is_active = TRUE
          ORDER BY percentage_threshold DESC
        LOOP
          IF ABS(variance_pct) >= threshold_record.percentage_threshold THEN
            RETURN QUERY SELECT
              'pricing'::TEXT,
              threshold_record.severity_level::TEXT,
              po_item.unit_cost,
              item_variance.unit_price,
              price_variance,
              variance_pct,
              threshold_record.percentage_threshold,
              threshold_record.absolute_threshold;
            EXIT;
          END IF;
        END LOOP;
      END IF;
    END;
  END LOOP;

END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_invoice_variances IS 'Calculate variances between PO and invoice data using configured thresholds';

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE po_invoice_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_invoice_variances ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_variance_thresholds ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read invoice data
DROP POLICY IF EXISTS "Allow authenticated read po_invoice_data" ON po_invoice_data;
CREATE POLICY "Allow authenticated read po_invoice_data"
  ON po_invoice_data FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated read po_invoice_variances" ON po_invoice_variances;
CREATE POLICY "Allow authenticated read po_invoice_variances"
  ON po_invoice_variances FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated read app_variance_thresholds" ON app_variance_thresholds;
CREATE POLICY "Allow authenticated read app_variance_thresholds"
  ON app_variance_thresholds FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to write invoice data
DROP POLICY IF EXISTS "Allow authenticated write po_invoice_data" ON po_invoice_data;
CREATE POLICY "Allow authenticated write po_invoice_data"
  ON po_invoice_data FOR ALL
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated write po_invoice_variances" ON po_invoice_variances;
CREATE POLICY "Allow authenticated write po_invoice_variances"
  ON po_invoice_variances FOR ALL
  TO authenticated
  USING (true);

-- Service role has full access
DROP POLICY IF EXISTS "Allow service role full access po_invoice_data" ON po_invoice_data;
CREATE POLICY "Allow service role full access po_invoice_data"
  ON po_invoice_data FOR ALL
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Allow service role full access po_invoice_variances" ON po_invoice_variances;
CREATE POLICY "Allow service role full access po_invoice_variances"
  ON po_invoice_variances FOR ALL
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Allow service role full access app_variance_thresholds" ON app_variance_thresholds;
CREATE POLICY "Allow service role full access app_variance_thresholds"
  ON app_variance_thresholds FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON po_invoice_data TO authenticated;
GRANT SELECT ON po_invoice_variances TO authenticated;
GRANT SELECT ON app_variance_thresholds TO authenticated;
GRANT SELECT ON active_invoice_reviews TO authenticated;
GRANT SELECT ON invoice_variance_summary TO authenticated;

GRANT INSERT, UPDATE, DELETE ON po_invoice_data TO authenticated;
GRANT INSERT, UPDATE, DELETE ON po_invoice_variances TO authenticated;

GRANT SELECT ON active_invoice_reviews TO authenticated;
GRANT SELECT ON invoice_variance_summary TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMIT;

COMMENT ON SCHEMA public IS 'Enhanced Invoice Detection System - Migration 050 Complete';