-- Migration 146: Create invoices storage bucket
--
-- Creates a Supabase Storage bucket for storing invoice attachments.
-- Invoices are stored after extraction for audit trail and re-processing.
--
-- Bucket: invoices
-- - Private bucket (authenticated access only)
-- - Organized by invoice_id/filename
-- - Supports PDF, images, and common document formats

BEGIN;

-- ============================================================================
-- CREATE INVOICES STORAGE BUCKET
-- ============================================================================

-- Note: Supabase Storage buckets are created via the API, not SQL.
-- However, we can set up the policies that will apply once the bucket exists.
-- The bucket should be created via the Supabase Dashboard or CLI:
--   supabase storage create bucket invoices --public false

-- ============================================================================
-- STORAGE POLICIES FOR INVOICES BUCKET
-- ============================================================================

-- Allow authenticated users to read invoices
DROP POLICY IF EXISTS "Authenticated users can read invoices" ON storage.objects;
CREATE POLICY "Authenticated users can read invoices"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'invoices');

-- Allow service role to insert/update invoices
DROP POLICY IF EXISTS "Service role can manage invoices" ON storage.objects;
CREATE POLICY "Service role can manage invoices"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'invoices')
  WITH CHECK (bucket_id = 'invoices');

-- Allow authenticated users to upload invoices
DROP POLICY IF EXISTS "Authenticated users can upload invoices" ON storage.objects;
CREATE POLICY "Authenticated users can upload invoices"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'invoices');

-- ============================================================================
-- ADD STORAGE PATH TO email_attachments IF NOT EXISTS
-- ============================================================================

ALTER TABLE email_attachments
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

ALTER TABLE email_attachments
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT DEFAULT 'invoices';

-- ============================================================================
-- ADD STORAGE PATH TO vendor_invoice_documents
-- ============================================================================

ALTER TABLE vendor_invoice_documents
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Index for finding attachments by storage path
CREATE INDEX IF NOT EXISTS idx_email_attachments_storage
  ON email_attachments(storage_path) WHERE storage_path IS NOT NULL;

-- ============================================================================
-- FUNCTION: Get signed URL for invoice download
-- ============================================================================

-- Note: This is a helper function. Actual signed URL generation
-- should be done via Supabase client in the application.
-- This function records download attempts for audit purposes.

CREATE TABLE IF NOT EXISTS invoice_download_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES vendor_invoice_documents(id) ON DELETE CASCADE,
  user_id UUID,
  downloaded_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoice_download_log_invoice
  ON invoice_download_log(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_download_log_time
  ON invoice_download_log(downloaded_at DESC);

ALTER TABLE invoice_download_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage download log" ON invoice_download_log;
CREATE POLICY "Service role can manage download log"
  ON invoice_download_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own downloads" ON invoice_download_log;
CREATE POLICY "Users can view own downloads"
  ON invoice_download_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN email_attachments.storage_path IS
  'Path in Supabase Storage bucket where attachment is stored';

COMMENT ON COLUMN email_attachments.storage_bucket IS
  'Storage bucket name (default: invoices)';

COMMENT ON COLUMN vendor_invoice_documents.storage_path IS
  'Direct path to stored invoice in Supabase Storage';

COMMENT ON TABLE invoice_download_log IS
  'Audit log of invoice document downloads for compliance';

-- ============================================================================
-- BUCKET CREATION INSTRUCTIONS
-- ============================================================================

-- Run this command to create the storage bucket:
--
--   supabase storage create bucket invoices
--
-- Or via the Supabase Dashboard:
--   1. Go to Storage
--   2. Click "New Bucket"
--   3. Name: invoices
--   4. Public: No (uncheck)
--   5. File size limit: 10MB
--   6. Allowed MIME types: application/pdf, image/*, application/vnd.*, text/csv

COMMIT;
