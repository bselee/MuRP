-- ═══════════════════════════════════════════════════════════════════════════
-- PO SHARE LINKS - Shareable public links for Purchase Orders
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Purpose: Allow users to generate shareable links for POs that vendors can
-- view without authentication. Includes access tracking and expiration.
--
-- Features:
-- - Short, memorable share tokens (8 chars base62)
-- - Configurable expiration
-- - Access logging with IP, user agent, referrer
-- - View count tracking
-- - Optional password protection
-- - Revocable at any time

-- Share links table
CREATE TABLE IF NOT EXISTS po_share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to PO (supports both internal and Finale POs)
    po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
    finale_po_id UUID REFERENCES finale_purchase_orders(id) ON DELETE CASCADE,

    -- Share token (short, URL-safe identifier)
    share_token VARCHAR(16) NOT NULL UNIQUE,

    -- Link metadata
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,  -- NULL = never expires

    -- Access control
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    password_hash VARCHAR(255),  -- Optional password protection (bcrypt)
    max_views INT,  -- NULL = unlimited

    -- Tracking
    view_count INT NOT NULL DEFAULT 0,
    last_viewed_at TIMESTAMPTZ,
    first_viewed_at TIMESTAMPTZ,

    -- Display options
    show_pricing BOOLEAN NOT NULL DEFAULT TRUE,
    show_notes BOOLEAN NOT NULL DEFAULT FALSE,
    show_tracking BOOLEAN NOT NULL DEFAULT TRUE,
    custom_message TEXT,  -- Optional message to display

    -- Constraints
    CONSTRAINT po_share_links_po_check CHECK (
        (po_id IS NOT NULL AND finale_po_id IS NULL) OR
        (po_id IS NULL AND finale_po_id IS NOT NULL)
    )
);

-- Access log table
CREATE TABLE IF NOT EXISTS po_share_link_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_link_id UUID NOT NULL REFERENCES po_share_links(id) ON DELETE CASCADE,

    -- Access details
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    referrer TEXT,

    -- Geolocation (optional, populated by edge function)
    country_code VARCHAR(2),
    region VARCHAR(100),
    city VARCHAR(100),

    -- Interaction tracking
    pdf_downloaded BOOLEAN DEFAULT FALSE,
    time_on_page_seconds INT,

    -- Session tracking
    session_id VARCHAR(64)
);

-- Indexes for efficient queries
CREATE INDEX idx_po_share_links_token ON po_share_links(share_token) WHERE is_active = TRUE;
CREATE INDEX idx_po_share_links_po_id ON po_share_links(po_id) WHERE po_id IS NOT NULL;
CREATE INDEX idx_po_share_links_finale_po_id ON po_share_links(finale_po_id) WHERE finale_po_id IS NOT NULL;
CREATE INDEX idx_po_share_links_expires ON po_share_links(expires_at) WHERE expires_at IS NOT NULL AND is_active = TRUE;
CREATE INDEX idx_po_share_link_access_log_link ON po_share_link_access_log(share_link_id);
CREATE INDEX idx_po_share_link_access_log_time ON po_share_link_access_log(accessed_at);

-- Function to generate a short, URL-safe token
CREATE OR REPLACE FUNCTION generate_share_token(length INT DEFAULT 8)
RETURNS VARCHAR AS $$
DECLARE
    chars VARCHAR := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';  -- Avoid ambiguous chars
    result VARCHAR := '';
    i INT;
BEGIN
    FOR i IN 1..length LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to create a share link
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

        -- Check for collision
        IF NOT EXISTS (SELECT 1 FROM po_share_links WHERE share_token = v_token) THEN
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
        v_link_id,
        v_token,
        '/po/' || v_token AS share_url,
        v_expires;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log access and increment view count
CREATE OR REPLACE FUNCTION log_po_share_access(
    p_share_token VARCHAR,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_referrer TEXT DEFAULT NULL,
    p_session_id VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    po_data JSONB,
    error_message TEXT
) AS $$
DECLARE
    v_link RECORD;
    v_po_data JSONB;
BEGIN
    -- Find the share link
    SELECT * INTO v_link
    FROM po_share_links
    WHERE share_token = p_share_token
      AND is_active = TRUE
      AND (expires_at IS NULL OR expires_at > NOW())
      AND (max_views IS NULL OR view_count < max_views);

    -- Check if link exists and is valid
    IF v_link IS NULL THEN
        -- Check why it failed
        IF EXISTS (SELECT 1 FROM po_share_links WHERE share_token = p_share_token AND is_active = FALSE) THEN
            RETURN QUERY SELECT FALSE, NULL::JSONB, 'This link has been deactivated'::TEXT;
        ELSIF EXISTS (SELECT 1 FROM po_share_links WHERE share_token = p_share_token AND expires_at <= NOW()) THEN
            RETURN QUERY SELECT FALSE, NULL::JSONB, 'This link has expired'::TEXT;
        ELSIF EXISTS (SELECT 1 FROM po_share_links WHERE share_token = p_share_token AND max_views IS NOT NULL AND view_count >= max_views) THEN
            RETURN QUERY SELECT FALSE, NULL::JSONB, 'This link has reached its view limit'::TEXT;
        ELSE
            RETURN QUERY SELECT FALSE, NULL::JSONB, 'Share link not found'::TEXT;
        END IF;
        RETURN;
    END IF;

    -- Log the access
    INSERT INTO po_share_link_access_log (
        share_link_id,
        ip_address,
        user_agent,
        referrer,
        session_id
    ) VALUES (
        v_link.id,
        p_ip_address,
        p_user_agent,
        p_referrer,
        p_session_id
    );

    -- Update view count and timestamps
    UPDATE po_share_links
    SET
        view_count = view_count + 1,
        last_viewed_at = NOW(),
        first_viewed_at = COALESCE(first_viewed_at, NOW())
    WHERE id = v_link.id;

    -- Get PO data based on type
    IF v_link.po_id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'type', 'internal',
            'po_id', po.id,
            'order_id', po.order_id,
            'vendor_name', po.supplier_name,
            'order_date', po.order_date,
            'expected_date', po.estimated_receive_date,
            'status', po.status,
            'items', po.items,
            'subtotal', po.subtotal,
            'tax', CASE WHEN v_link.show_pricing THEN po.tax_amount ELSE NULL END,
            'shipping', CASE WHEN v_link.show_pricing THEN po.shipping_cost ELSE NULL END,
            'total', CASE WHEN v_link.show_pricing THEN po.total_amount ELSE NULL END,
            'notes', CASE WHEN v_link.show_notes THEN po.internal_notes ELSE NULL END,
            'tracking_number', CASE WHEN v_link.show_tracking THEN po.tracking_number ELSE NULL END,
            'tracking_status', CASE WHEN v_link.show_tracking THEN po.tracking_status ELSE NULL END,
            'custom_message', v_link.custom_message,
            'show_pricing', v_link.show_pricing
        ) INTO v_po_data
        FROM purchase_orders po
        WHERE po.id = v_link.po_id;
    ELSE
        SELECT jsonb_build_object(
            'type', 'finale',
            'po_id', fpo.id,
            'order_id', fpo.order_id,
            'vendor_name', fpo.vendor_name,
            'order_date', fpo.order_date,
            'expected_date', fpo.expected_date,
            'status', fpo.status,
            'items', fpo.line_items,
            'subtotal', CASE WHEN v_link.show_pricing THEN fpo.subtotal ELSE NULL END,
            'tax', CASE WHEN v_link.show_pricing THEN fpo.tax ELSE NULL END,
            'shipping', CASE WHEN v_link.show_pricing THEN fpo.shipping ELSE NULL END,
            'total', CASE WHEN v_link.show_pricing THEN fpo.total ELSE NULL END,
            'notes', CASE WHEN v_link.show_notes THEN fpo.public_notes ELSE NULL END,
            'tracking_number', CASE WHEN v_link.show_tracking THEN fpo.tracking_number ELSE NULL END,
            'tracking_status', CASE WHEN v_link.show_tracking THEN fpo.tracking_status ELSE NULL END,
            'custom_message', v_link.custom_message,
            'show_pricing', v_link.show_pricing
        ) INTO v_po_data
        FROM finale_purchase_orders fpo
        WHERE fpo.id = v_link.finale_po_id;
    END IF;

    RETURN QUERY SELECT TRUE, v_po_data, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revoke a share link
CREATE OR REPLACE FUNCTION revoke_po_share_link(p_share_token VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE po_share_links
    SET is_active = FALSE
    WHERE share_token = p_share_token
      AND (created_by = auth.uid() OR EXISTS (
          SELECT 1 FROM user_profiles
          WHERE id = auth.uid() AND role IN ('Admin', 'Manager', 'SuperAdmin')
      ));

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get share link analytics
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
        (SELECT COUNT(DISTINCT ip_address)::INT FROM po_share_link_access_log WHERE share_link_id = sl.id),
        sl.first_viewed_at,
        sl.last_viewed_at,
        (
            SELECT jsonb_agg(jsonb_build_object('date', day, 'views', count))
            FROM (
                SELECT DATE(accessed_at) as day, COUNT(*) as count
                FROM po_share_link_access_log
                WHERE share_link_id = sl.id
                GROUP BY DATE(accessed_at)
                ORDER BY day DESC
                LIMIT 30
            ) daily
        ),
        (
            SELECT jsonb_agg(jsonb_build_object('referrer', referrer, 'count', count))
            FROM (
                SELECT COALESCE(referrer, 'Direct') as referrer, COUNT(*) as count
                FROM po_share_link_access_log
                WHERE share_link_id = sl.id
                GROUP BY referrer
                ORDER BY count DESC
                LIMIT 10
            ) refs
        ),
        (SELECT COUNT(*)::INT FROM po_share_link_access_log WHERE share_link_id = sl.id AND pdf_downloaded = TRUE)
    FROM po_share_links sl
    WHERE sl.share_token = p_share_token
      AND (sl.created_by = auth.uid() OR EXISTS (
          SELECT 1 FROM user_profiles
          WHERE id = auth.uid() AND role IN ('Admin', 'Manager', 'SuperAdmin')
      ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS policies
ALTER TABLE po_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_share_link_access_log ENABLE ROW LEVEL SECURITY;

-- Users can see links they created or are admin
CREATE POLICY po_share_links_select ON po_share_links
    FOR SELECT USING (
        created_by = auth.uid() OR
        EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('Admin', 'Manager', 'SuperAdmin'))
    );

-- Users can create links for POs they have access to
CREATE POLICY po_share_links_insert ON po_share_links
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
    );

-- Users can update their own links
CREATE POLICY po_share_links_update ON po_share_links
    FOR UPDATE USING (
        created_by = auth.uid() OR
        EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('Admin', 'Manager', 'SuperAdmin'))
    );

-- Access logs viewable by link creators
CREATE POLICY po_share_link_access_log_select ON po_share_link_access_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM po_share_links sl
            WHERE sl.id = share_link_id
              AND (sl.created_by = auth.uid() OR EXISTS (
                  SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('Admin', 'Manager', 'SuperAdmin')
              ))
        )
    );

-- Allow public access logging (for edge function)
CREATE POLICY po_share_link_access_log_insert ON po_share_link_access_log
    FOR INSERT WITH CHECK (TRUE);

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION create_po_share_link TO authenticated;
GRANT EXECUTE ON FUNCTION log_po_share_access TO anon, authenticated;
GRANT EXECUTE ON FUNCTION revoke_po_share_link TO authenticated;
GRANT EXECUTE ON FUNCTION get_po_share_analytics TO authenticated;

COMMENT ON TABLE po_share_links IS 'Shareable public links for Purchase Orders with access tracking';
COMMENT ON TABLE po_share_link_access_log IS 'Access log for PO share links - tracks views, downloads, etc.';
