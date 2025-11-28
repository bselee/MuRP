-- Migration: 060_inventory_audit_log.sql
-- Description: Add inventory audit log table to track stock changes and movements
-- Created: 2025-11-28

-- Create inventory_audit_log table
CREATE TABLE IF NOT EXISTS inventory_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sku TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('stock_in', 'stock_out', 'adjustment', 'transfer', 'count')),
    quantity_change INTEGER NOT NULL,
    previous_stock INTEGER,
    new_stock INTEGER,
    reference_type TEXT CHECK (reference_type IN ('purchase_order', 'build_order', 'requisition', 'manual', 'system')),
    reference_id TEXT,
    notes TEXT,
    performed_by UUID REFERENCES auth.users(id),
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_inventory_audit_log_sku ON inventory_audit_log(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_log_action ON inventory_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_log_performed_at ON inventory_audit_log(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_log_reference ON inventory_audit_log(reference_type, reference_id);

-- Add RLS policies
ALTER TABLE inventory_audit_log ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read audit logs
CREATE POLICY "inventory_audit_log_read_policy" ON inventory_audit_log
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert audit logs
CREATE POLICY "inventory_audit_log_insert_policy" ON inventory_audit_log
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Add comments
COMMENT ON TABLE inventory_audit_log IS 'Audit log for all inventory stock movements and changes';
COMMENT ON COLUMN inventory_audit_log.action IS 'Type of inventory action: stock_in, stock_out, adjustment, transfer, count';
COMMENT ON COLUMN inventory_audit_log.reference_type IS 'Source of the change: purchase_order, build_order, requisition, manual, system';
COMMENT ON COLUMN inventory_audit_log.reference_id IS 'ID of the reference entity (PO ID, build order ID, etc.)';