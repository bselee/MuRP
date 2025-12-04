-- Migration: Fix missing tables causing 404 errors
-- Date: 2025-12-04
-- Purpose: Create autonomous PO tables and get_shipment_alerts function

-- Check if autonomous_po_settings exists, create if not
CREATE TABLE IF NOT EXISTS autonomous_po_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  autonomous_shipping_enabled BOOLEAN NOT NULL DEFAULT false,
  autonomous_pricing_enabled BOOLEAN NOT NULL DEFAULT false,
  require_approval_for_shipping BOOLEAN NOT NULL DEFAULT true,
  require_approval_for_pricing BOOLEAN NOT NULL DEFAULT true,
  auto_approve_below_threshold DECIMAL(10,2) NOT NULL DEFAULT 100.00,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Check if autonomous_update_approvals exists, create if not
CREATE TABLE IF NOT EXISTS autonomous_update_approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  update_type TEXT NOT NULL CHECK (update_type IN ('shipping', 'pricing')),
  changes JSONB NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('email', 'api', 'carrier')),
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_autonomous_approvals_status ON autonomous_update_approvals(status);
CREATE INDEX IF NOT EXISTS idx_autonomous_approvals_po_id ON autonomous_update_approvals(po_id);

-- Enable RLS
ALTER TABLE autonomous_po_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomous_update_approvals ENABLE ROW LEVEL SECURITY;

-- Add RLS policies (drop first if they exist to avoid conflicts)
DROP POLICY IF EXISTS "Admins can manage autonomous settings" ON autonomous_po_settings;
CREATE POLICY "Admins can manage autonomous settings" ON autonomous_po_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('Admin', 'SuperAdmin')
    )
  );

DROP POLICY IF EXISTS "Admins can manage autonomous approvals" ON autonomous_update_approvals;
CREATE POLICY "Admins can manage autonomous approvals" ON autonomous_update_approvals
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('Admin', 'SuperAdmin')
    )
  );

-- Insert default settings if none exist
INSERT INTO autonomous_po_settings (
  autonomous_shipping_enabled,
  autonomous_pricing_enabled,
  require_approval_for_shipping,
  require_approval_for_pricing,
  auto_approve_below_threshold
)
SELECT false, false, true, true, 100.00
WHERE NOT EXISTS (SELECT 1 FROM autonomous_po_settings);

-- Create shipment_alerts table if it doesn't exist (needed for get_shipment_alerts function)
CREATE TABLE IF NOT EXISTS shipment_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'dismissed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Create index for shipment_alerts
CREATE INDEX IF NOT EXISTS idx_shipment_alerts_status ON shipment_alerts(status);
CREATE INDEX IF NOT EXISTS idx_shipment_alerts_po_id ON shipment_alerts(po_id);

-- Enable RLS for shipment_alerts
ALTER TABLE shipment_alerts ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for shipment_alerts
DROP POLICY IF EXISTS "Users can view shipment alerts" ON shipment_alerts;
CREATE POLICY "Users can view shipment alerts" ON shipment_alerts
  FOR SELECT USING (true);

-- Drop and recreate get_shipment_alerts function with correct signature
DROP FUNCTION IF EXISTS get_shipment_alerts();

CREATE FUNCTION get_shipment_alerts()
RETURNS TABLE (
  id UUID,
  po_id UUID,
  alert_type TEXT,
  severity TEXT,
  message TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.id,
    sa.po_id,
    sa.alert_type,
    sa.severity,
    sa.message,
    sa.created_at
  FROM shipment_alerts sa
  WHERE sa.status = 'active'
  ORDER BY sa.created_at DESC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
