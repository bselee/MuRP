-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 024: Document Templates and Company Settings
-- ═══════════════════════════════════════════════════════════════════════════
-- Description: Add customizable document templates for POs and emails
-- Created: 2025-11-17
--
-- Features:
-- - Company information settings (name, address, logo)
-- - Email templates with variable substitution
-- - PDF templates with styling options
-- - Vendor-specific template overrides
-- - AI-generated template suggestions
-- ═══════════════════════════════════════════════════════════════════════════

-- Company Settings Table
CREATE TABLE IF NOT EXISTS company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(255) NOT NULL DEFAULT 'MuRP',
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  postal_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'USA',
  phone VARCHAR(50),
  email VARCHAR(255),
  website VARCHAR(255),
  logo_url TEXT,
  tax_rate DECIMAL(5,4) DEFAULT 0.08,
  currency VARCHAR(10) DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure single row (singleton pattern)
CREATE UNIQUE INDEX idx_company_settings_singleton ON company_settings ((TRUE));

-- Insert default company settings
INSERT INTO company_settings (
  company_name,
  address_line1,
  city,
  state,
  postal_code,
  phone,
  email
) VALUES (
  'MuRP',
  '123 MuRP Lane',
  'Mycelia',
  'CA',
  '90210',
  '(555) 123-4567',
  'contact@murp.app'
) ON CONFLICT DO NOTHING;

-- Email Templates Table
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(100) NOT NULL,
  template_type VARCHAR(50) NOT NULL, -- 'purchase_order', 'vendor_inquiry', etc.
  subject_line TEXT NOT NULL,
  body_template TEXT NOT NULL,
  signature TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  vendor_id VARCHAR(50) REFERENCES vendors(id) ON DELETE CASCADE, -- NULL = company-wide
  ai_generated BOOLEAN DEFAULT FALSE,
  approved_by VARCHAR(255),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PDF Templates Table
CREATE TABLE IF NOT EXISTS pdf_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(100) NOT NULL,
  template_type VARCHAR(50) NOT NULL, -- 'purchase_order', 'invoice', etc.
  header_text TEXT,
  footer_text TEXT DEFAULT 'Thank you for your business!',
  header_color VARCHAR(7) DEFAULT '#2980b9', -- Hex color
  show_logo BOOLEAN DEFAULT TRUE,
  show_company_info BOOLEAN DEFAULT TRUE,
  show_tax BOOLEAN DEFAULT TRUE,
  font_family VARCHAR(50) DEFAULT 'helvetica',
  is_default BOOLEAN DEFAULT FALSE,
  vendor_id VARCHAR(50) REFERENCES vendors(id) ON DELETE CASCADE, -- NULL = company-wide
  ai_generated BOOLEAN DEFAULT FALSE,
  approved_by VARCHAR(255),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Template Variables Reference Table
CREATE TABLE IF NOT EXISTS template_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variable_name VARCHAR(100) NOT NULL,
  variable_key VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  example_value TEXT,
  applies_to VARCHAR(50)[], -- Array: ['email', 'pdf']
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert standard template variables
INSERT INTO template_variables (variable_name, variable_key, description, example_value, applies_to) VALUES
  ('Purchase Order Number', '{{po_number}}', 'The PO number/ID', 'PO-20251117-001', ARRAY['email', 'pdf']),
  ('Vendor Name', '{{vendor_name}}', 'Name of the vendor', 'Acme Supplies', ARRAY['email', 'pdf']),
  ('Order Date', '{{order_date}}', 'Date the PO was created', '11/17/2025', ARRAY['email', 'pdf']),
  ('Expected Date', '{{expected_date}}', 'Expected delivery date', '11/30/2025', ARRAY['email', 'pdf']),
  ('Total Amount', '{{total_amount}}', 'Total PO amount with currency', '$1,234.56', ARRAY['email', 'pdf']),
  ('Item Count', '{{item_count}}', 'Number of line items', '5', ARRAY['email', 'pdf']),
  ('Company Name', '{{company_name}}', 'Your company name', 'MuRP', ARRAY['email', 'pdf']),
  ('Company Phone', '{{company_phone}}', 'Your company phone', '(555) 123-4567', ARRAY['email', 'pdf']),
  ('Company Email', '{{company_email}}', 'Your company email', 'contact@murp.app', ARRAY['email', 'pdf']),
  ('Vendor Contact', '{{vendor_contact}}', 'Vendor primary contact name', 'John Smith', ARRAY['email']),
  ('Signature', '{{signature}}', 'Email signature block', 'Best regards,\nProcurement Team', ARRAY['email'])
ON CONFLICT (variable_key) DO NOTHING;

-- Insert default email template
INSERT INTO email_templates (
  template_name,
  template_type,
  subject_line,
  body_template,
  signature,
  is_default
) VALUES (
  'Default Purchase Order Email',
  'purchase_order',
  'Purchase Order #{{po_number}} from {{company_name}}',
  'Hello {{vendor_name}} Team,

Please find attached our Purchase Order #{{po_number}}.

Order Details:
- Order Date: {{order_date}}
- Expected Delivery: {{expected_date}}
- Total Amount: {{total_amount}}
- Items: {{item_count}}

Kindly confirm receipt and provide an estimated shipping date at your earliest convenience.

Thank you,',
  '{{company_name}}
Procurement Team
{{company_email}}
{{company_phone}}',
  TRUE
) ON CONFLICT DO NOTHING;

-- Insert default PDF template
INSERT INTO pdf_templates (
  template_name,
  template_type,
  header_text,
  footer_text,
  header_color,
  is_default
) VALUES (
  'Default Purchase Order PDF',
  'purchase_order',
  'PURCHASE ORDER',
  'Thank you for your business!',
  '#2980b9',
  TRUE
) ON CONFLICT DO NOTHING;

-- Indexes
CREATE INDEX idx_email_templates_type ON email_templates(template_type);
CREATE INDEX idx_email_templates_vendor ON email_templates(vendor_id);
CREATE INDEX idx_email_templates_default ON email_templates(is_default) WHERE is_default = TRUE;

CREATE INDEX idx_pdf_templates_type ON pdf_templates(template_type);
CREATE INDEX idx_pdf_templates_vendor ON pdf_templates(vendor_id);
CREATE INDEX idx_pdf_templates_default ON pdf_templates(is_default) WHERE is_default = TRUE;

-- Comments
COMMENT ON TABLE company_settings IS 'Company information and settings (singleton)';
COMMENT ON TABLE email_templates IS 'Customizable email templates with variable substitution';
COMMENT ON TABLE pdf_templates IS 'Customizable PDF document templates with styling options';
COMMENT ON TABLE template_variables IS 'Available variables for template substitution';

COMMENT ON COLUMN email_templates.vendor_id IS 'NULL for company-wide, or specific vendor ID for override';
COMMENT ON COLUMN pdf_templates.vendor_id IS 'NULL for company-wide, or specific vendor ID for override';
COMMENT ON COLUMN email_templates.ai_generated IS 'True if template was generated by AI';
COMMENT ON COLUMN pdf_templates.ai_generated IS 'True if template was generated by AI';

-- Grants
GRANT SELECT ON company_settings TO authenticated;
GRANT UPDATE ON company_settings TO authenticated;

GRANT SELECT ON email_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON email_templates TO authenticated;

GRANT SELECT ON pdf_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON pdf_templates TO authenticated;

GRANT SELECT ON template_variables TO authenticated;

-- Update trigger
CREATE OR REPLACE FUNCTION update_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_template_updated_at();

CREATE TRIGGER pdf_templates_updated_at
  BEFORE UPDATE ON pdf_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_template_updated_at();

CREATE TRIGGER company_settings_updated_at
  BEFORE UPDATE ON company_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_template_updated_at();
