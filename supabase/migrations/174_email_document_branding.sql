-- ============================================================================
-- 174: Email & Document Branding Settings
-- ============================================================================
--
-- Extends the existing company_settings table with email branding and
-- document template settings.
--
-- Features:
-- - Email branding (logo text, colors, footer text)
-- - Document template settings (PDF headers, footers)
-- - Extensible JSONB structure for future settings
-- ============================================================================

-- Add email_branding column if not exists
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS email_branding JSONB DEFAULT '{
    "companyLogoText": "",
    "primaryColor": "#0f172a",
    "secondaryColor": "#334155",
    "accentColor": "#0f172a",
    "footerText": ""
}'::jsonb;

-- Add document_branding column if not exists
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS document_branding JSONB DEFAULT '{
    "headerLogoUrl": "",
    "headerText": "",
    "footerText": "",
    "primaryColor": "#0f172a",
    "showTermsAndConditions": true,
    "defaultTerms": "",
    "showSignatureBlock": true
}'::jsonb;

-- Add company_info JSONB column if not exists (for additional structured data)
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS company_info JSONB DEFAULT '{
    "legalName": "",
    "taxId": "",
    "billingAddress": "",
    "shippingAddress": "",
    "defaultPaymentTerms": "Net 30"
}'::jsonb;

-- Update comments
COMMENT ON COLUMN company_settings.email_branding IS 'Email template branding settings (logo text, colors, footer)';
COMMENT ON COLUMN company_settings.document_branding IS 'PDF/document template settings';
COMMENT ON COLUMN company_settings.company_info IS 'Additional structured company information for documents';
