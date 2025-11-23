-- Migration: Requisition approval workflow additions
-- Adds manager/operations approval metadata and purchasing handoff tracking

ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS manager_approved_by UUID,
  ADD COLUMN IF NOT EXISTS manager_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ops_approval_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ops_approved_by UUID,
  ADD COLUMN IF NOT EXISTS ops_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS forwarded_to_purchasing_at TIMESTAMPTZ;

UPDATE requisitions
SET ops_approval_required = COALESCE(ops_approval_required, false)
WHERE ops_approval_required IS NULL;

COMMENT ON COLUMN requisitions.manager_approved_by IS 'User ID of the manager who approved the requisition';
COMMENT ON COLUMN requisitions.manager_approved_at IS 'Timestamp when the manager approved the requisition';
COMMENT ON COLUMN requisitions.ops_approval_required IS 'True when Operations must approve before Purchasing';
COMMENT ON COLUMN requisitions.ops_approved_by IS 'User ID of the operations approver';
COMMENT ON COLUMN requisitions.ops_approved_at IS 'Timestamp when Operations approved the requisition';
COMMENT ON COLUMN requisitions.forwarded_to_purchasing_at IS 'Timestamp when the requisition was handed to Purchasing';
