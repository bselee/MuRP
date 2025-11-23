-- Shopify Integration Database Schema
-- Migration: 20251123000001_shopify_integration.sql
-- Purpose: Add tables for Shopify sales data sync and inventory verification

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Shopify OAuth credentials (encrypted storage)
CREATE TABLE IF NOT EXISTS shopify_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_domain TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL, -- Encrypted via Supabase Vault
  scope TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shopify sales orders (source of truth for sales)
CREATE TABLE IF NOT EXISTS shopify_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopify_order_id TEXT UNIQUE NOT NULL,
  order_number TEXT NOT NULL,
  customer_email TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  total_amount NUMERIC(10, 2) NOT NULL,
  subtotal_amount NUMERIC(10, 2) NOT NULL,
  tax_amount NUMERIC(10, 2) DEFAULT 0,
  shipping_amount NUMERIC(10, 2) DEFAULT 0,
  discount_amount NUMERIC(10, 2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  financial_status TEXT CHECK (financial_status IN ('pending', 'authorized', 'paid', 'partially_paid', 'refunded', 'voided', 'partially_refunded')),
  fulfillment_status TEXT CHECK (fulfillment_status IN ('fulfilled', 'partial', 'unfulfilled', 'cancelled')),
  line_items JSONB NOT NULL,
  shipping_address JSONB,
  billing_address JSONB,
  order_date TIMESTAMPTZ NOT NULL,
  updated_date TIMESTAMPTZ,
  cancelled_date TIMESTAMPTZ,
  sync_source TEXT DEFAULT 'shopify',
  raw_data JSONB, -- Full Shopify API response
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_shopify_orders_order_number ON shopify_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_order_date ON shopify_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_financial_status ON shopify_orders(financial_status);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_customer_email ON shopify_orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_line_items ON shopify_orders USING GIN(line_items);

-- Shopify inventory verification logs
CREATE TABLE IF NOT EXISTS shopify_inventory_verification (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT NOT NULL,
  shopify_qty INTEGER NOT NULL,
  internal_qty INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  issue_type TEXT CHECK (issue_type IN ('quantity_mismatch', 'missing_in_shopify', 'missing_in_internal', 'low_stock')),
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected', 'auto_resolved')) DEFAULT 'pending',
  resolution_action TEXT, -- 'trust_shopify', 'trust_internal', 'manual_adjustment'
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopify_inventory_verification_sku ON shopify_inventory_verification(sku);
CREATE INDEX IF NOT EXISTS idx_shopify_inventory_verification_status ON shopify_inventory_verification(status);
CREATE INDEX IF NOT EXISTS idx_shopify_inventory_verification_verified_at ON shopify_inventory_verification(verified_at DESC);

-- Shopify sync logs (health monitoring)
CREATE TABLE IF NOT EXISTS shopify_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_type TEXT CHECK (sync_type IN ('webhook', 'nightly', 'manual', 'initial')) NOT NULL,
  orders_inserted INTEGER DEFAULT 0,
  orders_updated INTEGER DEFAULT 0,
  orders_skipped INTEGER DEFAULT 0,
  products_synced INTEGER DEFAULT 0,
  inventory_checked INTEGER DEFAULT 0,
  errors JSONB,
  duration_ms INTEGER,
  status TEXT CHECK (status IN ('success', 'partial', 'failed')) DEFAULT 'success',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopify_sync_log_type ON shopify_sync_log(sync_type);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_log_started_at ON shopify_sync_log(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_log_status ON shopify_sync_log(status);

-- Shopify webhook delivery log (debugging)
CREATE TABLE IF NOT EXISTS shopify_webhook_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic TEXT NOT NULL,
  shop_domain TEXT NOT NULL,
  webhook_id TEXT,
  payload JSONB NOT NULL,
  headers JSONB,
  signature_valid BOOLEAN,
  processed BOOLEAN DEFAULT false,
  processing_error TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shopify_webhook_log_topic ON shopify_webhook_log(topic);
CREATE INDEX IF NOT EXISTS idx_shopify_webhook_log_received_at ON shopify_webhook_log(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopify_webhook_log_processed ON shopify_webhook_log(processed);

-- RLS Policies: Admin/Ops/Purchasing Only

-- Enable RLS on all tables
ALTER TABLE shopify_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_inventory_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_webhook_log ENABLE ROW LEVEL SECURITY;

-- Shopify credentials: Admin only
CREATE POLICY "shopify_credentials_admin_only" ON shopify_credentials
  FOR ALL
  USING (
    COALESCE((auth.jwt() ->> 'role'), '') = 'admin'
  );

-- Shopify orders: Admin/Ops/Purchasing
CREATE POLICY "shopify_orders_admin_ops_purchasing" ON shopify_orders
  FOR ALL
  USING (
    COALESCE((auth.jwt() ->> 'role'), '') IN ('admin', 'ops', 'purchasing')
  );

-- Inventory verification: Admin/Ops/Purchasing read, Admin/Ops approve
CREATE POLICY "shopify_inventory_verification_read" ON shopify_inventory_verification
  FOR SELECT
  USING (
    COALESCE((auth.jwt() ->> 'role'), '') IN ('admin', 'ops', 'purchasing')
  );

CREATE POLICY "shopify_inventory_verification_approve" ON shopify_inventory_verification
  FOR UPDATE
  USING (
    COALESCE((auth.jwt() ->> 'role'), '') IN ('admin', 'ops')
  );

CREATE POLICY "shopify_inventory_verification_insert" ON shopify_inventory_verification
  FOR INSERT
  WITH CHECK (
    COALESCE((auth.jwt() ->> 'role'), '') IN ('admin', 'ops', 'purchasing')
  );

-- Sync logs: Admin/Ops/Purchasing read
CREATE POLICY "shopify_sync_log_read" ON shopify_sync_log
  FOR SELECT
  USING (
    COALESCE((auth.jwt() ->> 'role'), '') IN ('admin', 'ops', 'purchasing')
  );

-- Webhook logs: Admin/Ops only
CREATE POLICY "shopify_webhook_log_admin_ops" ON shopify_webhook_log
  FOR ALL
  USING (
    COALESCE((auth.jwt() ->> 'role'), '') IN ('admin', 'ops')
  );

-- Functions for data integrity

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply timestamp triggers
DROP TRIGGER IF EXISTS update_shopify_credentials_updated_at ON shopify_credentials;
CREATE TRIGGER update_shopify_credentials_updated_at
  BEFORE UPDATE ON shopify_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shopify_orders_updated_at ON shopify_orders;
CREATE TRIGGER update_shopify_orders_updated_at
  BEFORE UPDATE ON shopify_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Materialized view for sales analytics (performance optimization)
CREATE MATERIALIZED VIEW IF NOT EXISTS shopify_sales_summary AS
SELECT
  DATE_TRUNC('day', order_date) AS sale_date,
  COUNT(*) AS total_orders,
  SUM(total_amount) AS total_revenue,
  SUM(tax_amount) AS total_tax,
  AVG(total_amount) AS avg_order_value,
  COUNT(DISTINCT customer_email) AS unique_customers,
  financial_status,
  fulfillment_status
FROM shopify_orders
WHERE order_date IS NOT NULL
GROUP BY DATE_TRUNC('day', order_date), financial_status, fulfillment_status
ORDER BY sale_date DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shopify_sales_summary_date_status 
  ON shopify_sales_summary(sale_date, financial_status, fulfillment_status);

-- Function to refresh sales summary (call from cron or after sync)
CREATE OR REPLACE FUNCTION refresh_shopify_sales_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY shopify_sales_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions for service role (Edge Functions)
GRANT ALL ON shopify_credentials TO service_role;
GRANT ALL ON shopify_orders TO service_role;
GRANT ALL ON shopify_inventory_verification TO service_role;
GRANT ALL ON shopify_sync_log TO service_role;
GRANT ALL ON shopify_webhook_log TO service_role;
GRANT SELECT ON shopify_sales_summary TO service_role;

-- Comments for documentation
COMMENT ON TABLE shopify_credentials IS 'Encrypted Shopify OAuth tokens and shop configuration';
COMMENT ON TABLE shopify_orders IS 'Source of truth for sales orders synced from Shopify';
COMMENT ON TABLE shopify_inventory_verification IS 'Inventory discrepancy tracking between Shopify and internal systems';
COMMENT ON TABLE shopify_sync_log IS 'Health monitoring and sync history for Shopify integration';
COMMENT ON TABLE shopify_webhook_log IS 'Webhook delivery log for debugging failed syncs';
COMMENT ON MATERIALIZED VIEW shopify_sales_summary IS 'Pre-aggregated sales data for fast analytics queries';
