-- Create autonomous update approval and logging tables
-- Migration: 069_add_autonomous_approval_system.sql

-- Table for pending autonomous update approvals
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

-- Table for logging all autonomous updates (both approved and direct)
CREATE TABLE IF NOT EXISTS autonomous_update_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  update_type TEXT NOT NULL CHECK (update_type IN ('shipping', 'pricing')),
  changes JSONB NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('email', 'api', 'carrier')),
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  applied_by TEXT NOT NULL, -- 'autonomous_system' or user ID
  approval_id UUID REFERENCES autonomous_update_approvals(id), -- NULL for direct applications
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_autonomous_approvals_status ON autonomous_update_approvals(status);
CREATE INDEX IF NOT EXISTS idx_autonomous_approvals_po_id ON autonomous_update_approvals(po_id);
CREATE INDEX IF NOT EXISTS idx_autonomous_update_log_po_id ON autonomous_update_log(po_id);
CREATE INDEX IF NOT EXISTS idx_autonomous_update_log_applied_at ON autonomous_update_log(applied_at);

-- Add RLS policies
ALTER TABLE autonomous_update_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomous_update_log ENABLE ROW LEVEL SECURITY;

-- Admins can manage approvals
CREATE POLICY "Admins can manage autonomous approvals" ON autonomous_update_approvals
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('Admin', 'SuperAdmin')
    )
  );

-- All authenticated users can read approval logs for their department's POs
CREATE POLICY "Users can view autonomous update logs" ON autonomous_update_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('Admin', 'SuperAdmin')
    ) OR
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = autonomous_update_log.po_id
      AND po.created_by::text = auth.uid()::text
    )
  );

-- Add comments for documentation
COMMENT ON TABLE autonomous_update_approvals IS 'Pending approvals for autonomous PO updates that require manual review';
COMMENT ON TABLE autonomous_update_log IS 'Audit log of all autonomous updates applied to purchase orders';
COMMENT ON COLUMN autonomous_update_approvals.update_type IS 'Type of update: shipping (status/carrier changes) or pricing (item price changes)';
COMMENT ON COLUMN autonomous_update_approvals.confidence IS 'AI confidence score (0.0-1.0) for the autonomous detection';
COMMENT ON COLUMN autonomous_update_log.applied_by IS 'Who applied the update: autonomous_system or user ID for manual applications';