-- ═══════════════════════════════════════════════════════════════════════════
-- PO SHARE LINK EMAIL TRACKING SUPPORT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds support for email open tracking:
-- 1. Helper function to increment view count
-- 2. Column for tracking email opens specifically
--

-- Function to increment view count (used by edge function for email tracking)
CREATE OR REPLACE FUNCTION increment_share_link_view_count(p_link_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE po_share_links
    SET
        view_count = view_count + 1,
        last_viewed_at = NOW()
    WHERE id = p_link_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow public access for email tracking pixel
GRANT EXECUTE ON FUNCTION increment_share_link_view_count TO anon, authenticated;

-- Add column to track email opens separately from page views
ALTER TABLE po_share_link_access_log
ADD COLUMN IF NOT EXISTS is_email_open BOOLEAN DEFAULT FALSE;

-- Index for email open tracking queries
CREATE INDEX IF NOT EXISTS idx_po_share_link_access_log_email_opens
ON po_share_link_access_log(share_link_id, is_email_open)
WHERE is_email_open = TRUE;

-- Update the access log insertion to mark email opens
COMMENT ON COLUMN po_share_link_access_log.is_email_open IS
'True when this access was from an email tracking pixel rather than direct page view';
