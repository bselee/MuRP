-- Migration: 061_new_product_alerts.sql
-- Description: Add new product alerts system for notifying users about new SKUs
-- Created: 2025-11-28

-- Create new_product_alerts table
CREATE TABLE IF NOT EXISTS new_product_alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sku TEXT NOT NULL,
    product_name TEXT NOT NULL,
    category TEXT NOT NULL,
    vendor_id TEXT,
    vendor_name TEXT,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('new_sku', 'price_change', 'availability_change', 'specification_change')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    read_by UUID REFERENCES auth.users(id),
    read_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_new_product_alerts_sku ON new_product_alerts(sku);
CREATE INDEX IF NOT EXISTS idx_new_product_alerts_type ON new_product_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_new_product_alerts_priority ON new_product_alerts(priority);
CREATE INDEX IF NOT EXISTS idx_new_product_alerts_created_at ON new_product_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_new_product_alerts_expires_at ON new_product_alerts(expires_at);
CREATE INDEX IF NOT EXISTS idx_new_product_alerts_read ON new_product_alerts(is_read);

-- Add RLS policies
ALTER TABLE new_product_alerts ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read alerts
CREATE POLICY "new_product_alerts_read_policy" ON new_product_alerts
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to update read status
CREATE POLICY "new_product_alerts_update_policy" ON new_product_alerts
    FOR UPDATE USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Allow system/service role to insert alerts
CREATE POLICY "new_product_alerts_insert_policy" ON new_product_alerts
    FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_new_product_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_new_product_alerts_updated_at
    BEFORE UPDATE ON new_product_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_new_product_alerts_updated_at();

-- Add comments
COMMENT ON TABLE new_product_alerts IS 'System for alerting users about new products, price changes, and other SKU-related notifications';
COMMENT ON COLUMN new_product_alerts.alert_type IS 'Type of alert: new_sku, price_change, availability_change, specification_change';
COMMENT ON COLUMN new_product_alerts.priority IS 'Alert priority level affecting notification urgency';
COMMENT ON COLUMN new_product_alerts.details IS 'Additional structured data about the alert (JSON format)';
COMMENT ON COLUMN new_product_alerts.expires_at IS 'When the alert should no longer be shown/active';