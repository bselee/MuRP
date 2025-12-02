-- Create autonomous PO settings table
-- Migration: 068_add_autonomous_po_settings.sql

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

-- Add RLS policies
ALTER TABLE autonomous_po_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write autonomous settings
CREATE POLICY "Admins can manage autonomous settings" ON autonomous_po_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('Admin', 'SuperAdmin')
    )
  );

-- Insert default settings
INSERT INTO autonomous_po_settings (
  autonomous_shipping_enabled,
  autonomous_pricing_enabled,
  require_approval_for_shipping,
  require_approval_for_pricing,
  auto_approve_below_threshold
) VALUES (
  false, -- autonomous_shipping_enabled
  false, -- autonomous_pricing_enabled
  true,  -- require_approval_for_shipping
  true,  -- require_approval_for_pricing
  100.00 -- auto_approve_below_threshold
) ON CONFLICT DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE autonomous_po_settings IS 'System-wide settings for autonomous PO updates (shipping status and pricing)';
COMMENT ON COLUMN autonomous_po_settings.autonomous_shipping_enabled IS 'Whether to automatically update PO shipping status from carrier tracking';
COMMENT ON COLUMN autonomous_po_settings.autonomous_pricing_enabled IS 'Whether to automatically update item prices from vendor communications';
COMMENT ON COLUMN autonomous_po_settings.require_approval_for_shipping IS 'Whether shipping updates require manual approval before applying';
COMMENT ON COLUMN autonomous_po_settings.require_approval_for_pricing IS 'Whether pricing updates require manual approval before applying';
COMMENT ON COLUMN autonomous_po_settings.auto_approve_below_threshold IS 'Price changes below this amount are auto-approved (in dollars)';