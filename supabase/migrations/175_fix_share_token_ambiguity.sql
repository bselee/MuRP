-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Ambiguous share_token column reference in create_po_share_link
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The RETURNS TABLE column name 'share_token' conflicts with the table column
-- 'po_share_links.share_token', causing PostgreSQL to report:
-- "column reference 'share_token' is ambiguous"
--
-- Fix: Qualify all table column references with table name/alias.

-- Recreate the function with qualified column references
CREATE OR REPLACE FUNCTION create_po_share_link(
    p_po_id UUID DEFAULT NULL,
    p_finale_po_id UUID DEFAULT NULL,
    p_expires_in_days INT DEFAULT NULL,
    p_show_pricing BOOLEAN DEFAULT TRUE,
    p_show_notes BOOLEAN DEFAULT FALSE,
    p_show_tracking BOOLEAN DEFAULT TRUE,
    p_custom_message TEXT DEFAULT NULL,
    p_max_views INT DEFAULT NULL
)
RETURNS TABLE (
    share_link_id UUID,
    share_token VARCHAR,
    share_url TEXT,
    expires_at TIMESTAMPTZ
) AS $$
DECLARE
    v_token VARCHAR;
    v_link_id UUID;
    v_expires TIMESTAMPTZ;
    v_attempts INT := 0;
BEGIN
    -- Validate input
    IF p_po_id IS NULL AND p_finale_po_id IS NULL THEN
        RAISE EXCEPTION 'Either po_id or finale_po_id must be provided';
    END IF;

    -- Calculate expiration
    IF p_expires_in_days IS NOT NULL THEN
        v_expires := NOW() + (p_expires_in_days || ' days')::INTERVAL;
    END IF;

    -- Generate unique token (retry on collision)
    LOOP
        v_token := generate_share_token(8);
        v_attempts := v_attempts + 1;

        -- Check for collision - QUALIFIED column reference to avoid ambiguity
        IF NOT EXISTS (SELECT 1 FROM po_share_links psl WHERE psl.share_token = v_token) THEN
            EXIT;
        END IF;

        -- Prevent infinite loop
        IF v_attempts > 10 THEN
            RAISE EXCEPTION 'Failed to generate unique share token';
        END IF;
    END LOOP;

    -- Insert the share link
    INSERT INTO po_share_links (
        po_id,
        finale_po_id,
        share_token,
        created_by,
        expires_at,
        show_pricing,
        show_notes,
        show_tracking,
        custom_message,
        max_views
    ) VALUES (
        p_po_id,
        p_finale_po_id,
        v_token,
        auth.uid(),
        v_expires,
        p_show_pricing,
        p_show_notes,
        p_show_tracking,
        p_custom_message,
        p_max_views
    )
    RETURNING id INTO v_link_id;

    -- Return the created link info
    RETURN QUERY SELECT
        v_link_id AS share_link_id,
        v_token AS share_token,
        ('/po/' || v_token)::TEXT AS share_url,
        v_expires AS expires_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also fix the revoke function with qualified references
CREATE OR REPLACE FUNCTION revoke_po_share_link(p_share_token VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE po_share_links psl
    SET is_active = FALSE
    WHERE psl.share_token = p_share_token
      AND (psl.created_by = auth.uid() OR EXISTS (
          SELECT 1 FROM user_profiles up
          WHERE up.id = auth.uid() AND up.role IN ('Admin', 'Manager', 'SuperAdmin')
      ));

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix the analytics function with qualified references
CREATE OR REPLACE FUNCTION get_po_share_analytics(p_share_token VARCHAR)
RETURNS TABLE (
    total_views INT,
    unique_visitors INT,
    first_view TIMESTAMPTZ,
    last_view TIMESTAMPTZ,
    views_by_day JSONB,
    top_referrers JSONB,
    pdf_downloads INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sl.view_count,
        (SELECT COUNT(DISTINCT al.ip_address)::INT FROM po_share_link_access_log al WHERE al.share_link_id = sl.id),
        sl.first_viewed_at,
        sl.last_viewed_at,
        (
            SELECT jsonb_agg(jsonb_build_object('date', daily.day, 'views', daily.count))
            FROM (
                SELECT DATE(al2.accessed_at) as day, COUNT(*) as count
                FROM po_share_link_access_log al2
                WHERE al2.share_link_id = sl.id
                GROUP BY DATE(al2.accessed_at)
                ORDER BY day DESC
                LIMIT 30
            ) daily
        ),
        (
            SELECT jsonb_agg(jsonb_build_object('referrer', refs.referrer, 'count', refs.count))
            FROM (
                SELECT COALESCE(al3.referrer, 'Direct') as referrer, COUNT(*) as count
                FROM po_share_link_access_log al3
                WHERE al3.share_link_id = sl.id
                GROUP BY al3.referrer
                ORDER BY count DESC
                LIMIT 10
            ) refs
        ),
        (SELECT COUNT(*)::INT FROM po_share_link_access_log al4 WHERE al4.share_link_id = sl.id AND al4.pdf_downloaded = TRUE)
    FROM po_share_links sl
    WHERE sl.share_token = p_share_token
      AND (sl.created_by = auth.uid() OR EXISTS (
          SELECT 1 FROM user_profiles up
          WHERE up.id = auth.uid() AND up.role IN ('Admin', 'Manager', 'SuperAdmin')
      ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_po_share_link IS
'Creates a shareable link for a PO. Returns share_link_id, share_token, share_url, and expires_at.
Fixed: Qualified column references to avoid ambiguity with RETURNS TABLE column names.';
