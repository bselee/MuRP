-- Migration 145: Add invoice tracking columns to finale_purchase_orders
--
-- The invoiceExtractionService.ts needs these columns to track invoice receipt
-- and no-shipping status on POs. This migration adds them.
--
-- Columns added:
-- - invoice_received: Boolean flag that invoice has been matched
-- - invoice_received_at: Timestamp when invoice was received
-- - invoice_number: The invoice number from the matched invoice
-- - no_shipping: Flag indicating PO has confirmed $0 shipping
-- - shipping_cost: Alias for shipping (service uses this name)
-- - tax_amount: Alias for tax (service uses this name)

BEGIN;

-- ============================================================================
-- ADD INVOICE TRACKING COLUMNS TO finale_purchase_orders
-- ============================================================================

-- Invoice received flag
ALTER TABLE finale_purchase_orders
  ADD COLUMN IF NOT EXISTS invoice_received BOOLEAN DEFAULT FALSE;

-- Timestamp when invoice was matched
ALTER TABLE finale_purchase_orders
  ADD COLUMN IF NOT EXISTS invoice_received_at TIMESTAMPTZ;

-- Invoice number from the matched invoice
ALTER TABLE finale_purchase_orders
  ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100);

-- No shipping flag (confirmed $0 shipping from invoice)
ALTER TABLE finale_purchase_orders
  ADD COLUMN IF NOT EXISTS no_shipping BOOLEAN DEFAULT FALSE;

-- Add shipping_cost as alias column for service compatibility
-- The original column is "shipping" but service uses "shipping_cost"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'finale_purchase_orders' AND column_name = 'shipping_cost'
  ) THEN
    ALTER TABLE finale_purchase_orders ADD COLUMN shipping_cost DECIMAL(12,2);
    -- Copy existing shipping values to shipping_cost
    UPDATE finale_purchase_orders SET shipping_cost = shipping WHERE shipping IS NOT NULL;
  END IF;
END $$;

-- Add tax_amount as alias column for service compatibility
-- The original column is "tax" but service uses "tax_amount"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'finale_purchase_orders' AND column_name = 'tax_amount'
  ) THEN
    ALTER TABLE finale_purchase_orders ADD COLUMN tax_amount DECIMAL(12,2);
    -- Copy existing tax values to tax_amount
    UPDATE finale_purchase_orders SET tax_amount = tax WHERE tax IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- SYNC TRIGGER: Keep shipping/shipping_cost and tax/tax_amount in sync
-- ============================================================================

-- When shipping_cost is updated, also update shipping
CREATE OR REPLACE FUNCTION sync_finale_po_shipping()
RETURNS TRIGGER AS $$
BEGIN
  -- If shipping_cost changed, update shipping
  IF TG_OP = 'UPDATE' AND NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost THEN
    NEW.shipping := NEW.shipping_cost;
  -- If shipping changed, update shipping_cost
  ELSIF TG_OP = 'UPDATE' AND NEW.shipping IS DISTINCT FROM OLD.shipping THEN
    NEW.shipping_cost := NEW.shipping;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_finale_po_shipping_trigger ON finale_purchase_orders;
CREATE TRIGGER sync_finale_po_shipping_trigger
  BEFORE UPDATE ON finale_purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION sync_finale_po_shipping();

-- When tax_amount is updated, also update tax
CREATE OR REPLACE FUNCTION sync_finale_po_tax()
RETURNS TRIGGER AS $$
BEGIN
  -- If tax_amount changed, update tax
  IF TG_OP = 'UPDATE' AND NEW.tax_amount IS DISTINCT FROM OLD.tax_amount THEN
    NEW.tax := NEW.tax_amount;
  -- If tax changed, update tax_amount
  ELSIF TG_OP = 'UPDATE' AND NEW.tax IS DISTINCT FROM OLD.tax THEN
    NEW.tax_amount := NEW.tax;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_finale_po_tax_trigger ON finale_purchase_orders;
CREATE TRIGGER sync_finale_po_tax_trigger
  BEFORE UPDATE ON finale_purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION sync_finale_po_tax();

-- ============================================================================
-- ADD SAME COLUMNS TO purchase_orders TABLE
-- ============================================================================

-- Invoice received flag
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS invoice_received BOOLEAN DEFAULT FALSE;

-- Timestamp when invoice was matched
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS invoice_received_at TIMESTAMPTZ;

-- Invoice number from the matched invoice
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100);

-- No shipping flag
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS no_shipping BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- INDEXES FOR INVOICE QUERIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_finale_po_invoice_received
  ON finale_purchase_orders(invoice_received) WHERE invoice_received = TRUE;

CREATE INDEX IF NOT EXISTS idx_finale_po_invoice_number
  ON finale_purchase_orders(invoice_number) WHERE invoice_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_po_invoice_received
  ON purchase_orders(invoice_received) WHERE invoice_received = TRUE;

CREATE INDEX IF NOT EXISTS idx_po_invoice_number
  ON purchase_orders(invoice_number) WHERE invoice_number IS NOT NULL;

-- ============================================================================
-- VIEW: POs WITH INVOICE STATUS
-- ============================================================================

CREATE OR REPLACE VIEW po_invoice_status AS
SELECT
  fpo.id,
  fpo.order_id,
  fpo.vendor_name,
  fpo.status,
  fpo.total,
  fpo.shipping_cost,
  fpo.tax_amount,
  fpo.invoice_received,
  fpo.invoice_received_at,
  fpo.invoice_number,
  fpo.no_shipping,
  'finale' AS po_source,
  -- Invoice document info if matched
  vid.id AS invoice_doc_id,
  vid.invoice_date,
  vid.total_amount AS invoice_total,
  vid.shipping_amount AS invoice_shipping,
  vid.tax_amount AS invoice_tax,
  vid.status AS invoice_status,
  -- Variance indicators
  CASE
    WHEN vid.total_amount IS NOT NULL AND fpo.total IS NOT NULL
    THEN ABS(vid.total_amount - fpo.total)
    ELSE NULL
  END AS total_variance
FROM finale_purchase_orders fpo
LEFT JOIN vendor_invoice_documents vid ON vid.matched_po_id = fpo.id

UNION ALL

SELECT
  po.id,
  po.order_id,
  po.supplier_name AS vendor_name,
  po.status::VARCHAR,
  po.total_amount AS total,
  po.shipping_cost,
  po.tax_amount,
  po.invoice_received,
  po.invoice_received_at,
  po.invoice_number,
  po.no_shipping,
  'custom' AS po_source,
  vid.id AS invoice_doc_id,
  vid.invoice_date,
  vid.total_amount AS invoice_total,
  vid.shipping_amount AS invoice_shipping,
  vid.tax_amount AS invoice_tax,
  vid.status AS invoice_status,
  CASE
    WHEN vid.total_amount IS NOT NULL AND po.total_amount IS NOT NULL
    THEN ABS(vid.total_amount - po.total_amount)
    ELSE NULL
  END AS total_variance
FROM purchase_orders po
LEFT JOIN vendor_invoice_documents vid ON vid.matched_po_id = po.id;

COMMENT ON VIEW po_invoice_status IS 'Combined view of POs with their invoice matching status';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON po_invoice_status TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN finale_purchase_orders.invoice_received IS
  'Flag indicating an invoice has been matched and data extracted';

COMMENT ON COLUMN finale_purchase_orders.invoice_received_at IS
  'Timestamp when invoice was first matched to this PO';

COMMENT ON COLUMN finale_purchase_orders.invoice_number IS
  'Invoice number from the matched vendor invoice';

COMMENT ON COLUMN finale_purchase_orders.no_shipping IS
  'Flag indicating PO confirmed to have $0 shipping (from invoice)';

COMMENT ON COLUMN finale_purchase_orders.shipping_cost IS
  'Shipping cost (alias for shipping column, kept in sync)';

COMMENT ON COLUMN finale_purchase_orders.tax_amount IS
  'Tax amount (alias for tax column, kept in sync)';

COMMIT;
