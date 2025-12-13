-- Migration 093: PO Intelligence Agent Tables
-- Add tables for tracking vendor communications and landed costs

-- Vendor communications tracking (for automated "pestering")
CREATE TABLE IF NOT EXISTS po_vendor_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  communication_type text NOT NULL CHECK (communication_type IN ('automated_follow_up', 'manual_inquiry', 'vendor_response', 'tracking_update', 'delivery_confirmation')),
  subject text,
  body text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  response_received_at timestamptz,
  created_by uuid REFERENCES users(id),
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX idx_po_vendor_communications_po_id ON po_vendor_communications(po_id);
CREATE INDEX idx_po_vendor_communications_sent_at ON po_vendor_communications(sent_at DESC);

-- Landed cost calculations (combines invoice + shipping + duties)
CREATE TABLE IF NOT EXISTS po_landed_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid UNIQUE REFERENCES purchase_orders(id) ON DELETE CASCADE,
  original_total numeric(15,2) NOT NULL DEFAULT 0,
  actual_total numeric(15,2) NOT NULL DEFAULT 0,
  shipping_cost numeric(15,2) NOT NULL DEFAULT 0,
  tax_amount numeric(15,2) NOT NULL DEFAULT 0,
  duty_fees numeric(15,2) NOT NULL DEFAULT 0,
  other_fees numeric(15,2) NOT NULL DEFAULT 0,
  landed_cost_total numeric(15,2) GENERATED ALWAYS AS (actual_total + shipping_cost + tax_amount + duty_fees + other_fees) STORED,
  variance_amount numeric(15,2) GENERATED ALWAYS AS ((actual_total + shipping_cost + tax_amount + duty_fees + other_fees) - original_total) STORED,
  variance_percentage numeric(5,2),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX idx_po_landed_costs_po_id ON po_landed_costs(po_id);
CREATE INDEX idx_po_landed_costs_variance ON po_landed_costs(variance_amount DESC NULLS LAST);

-- Update po_invoice_data to include variance flagging timestamp
ALTER TABLE po_invoice_data
  ADD COLUMN IF NOT EXISTS flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS variance_notes text;

-- RLS Policies
ALTER TABLE po_vendor_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_landed_costs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view communications
CREATE POLICY "Allow authenticated users to view communications"
  ON po_vendor_communications
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow admins/purchasing to insert communications
CREATE POLICY "Allow admins/purchasing to insert communications"
  ON po_vendor_communications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('Admin', 'Purchasing'))
  );

-- Allow authenticated users to view landed costs
CREATE POLICY "Allow authenticated users to view landed costs"
  ON po_landed_costs
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow admins/purchasing to manage landed costs
CREATE POLICY "Allow admins/purchasing to manage landed costs"
  ON po_landed_costs
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('Admin', 'Purchasing'))
  )
  WITH CHECK (
    auth.uid() IN (SELECT id FROM users WHERE role IN ('Admin', 'Purchasing'))
  );

-- Trigger to automatically calculate variance percentage
CREATE OR REPLACE FUNCTION calculate_variance_percentage()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.original_total > 0 THEN
    NEW.variance_percentage := ((NEW.landed_cost_total - NEW.original_total) / NEW.original_total) * 100;
  ELSE
    NEW.variance_percentage := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_variance_percentage
  BEFORE INSERT OR UPDATE ON po_landed_costs
  FOR EACH ROW
  EXECUTE FUNCTION calculate_variance_percentage();
