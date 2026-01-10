-- ═══════════════════════════════════════════════════════════════════════════
-- PO SHARE LINK STATUS-BASED EXPIRATION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Updates share link access validation to expire based on PO status:
-- 1. Time-based expiration (expires_at)
-- 2. PO status check (closed, cancelled, invoiced)
-- 3. Three-way match approval check
--
-- This ensures vendors can only view POs that are still active/relevant.

-- Update the log_po_share_access function with status-based expiration
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
    v_po_status TEXT;
    v_is_matched BOOLEAN := FALSE;
BEGIN
    -- Find the share link (basic check - active and not max views exceeded)
    SELECT * INTO v_link
    FROM po_share_links
    WHERE share_token = p_share_token
      AND is_active = TRUE
      AND (max_views IS NULL OR view_count < max_views);

    -- Check if link exists
    IF v_link IS NULL THEN
        -- Check why it failed
        IF EXISTS (SELECT 1 FROM po_share_links WHERE share_token = p_share_token AND is_active = FALSE) THEN
            RETURN QUERY SELECT FALSE, NULL::JSONB, 'This link has been deactivated'::TEXT;
        ELSIF EXISTS (SELECT 1 FROM po_share_links WHERE share_token = p_share_token AND max_views IS NOT NULL AND view_count >= max_views) THEN
            RETURN QUERY SELECT FALSE, NULL::JSONB, 'This link has reached its view limit'::TEXT;
        ELSE
            RETURN QUERY SELECT FALSE, NULL::JSONB, 'Share link not found'::TEXT;
        END IF;
        RETURN;
    END IF;

    -- Check time-based expiration
    IF v_link.expires_at IS NOT NULL AND v_link.expires_at <= NOW() THEN
        RETURN QUERY SELECT FALSE, NULL::JSONB, 'This link has expired'::TEXT;
        RETURN;
    END IF;

    -- Check status-based expiration for internal POs
    IF v_link.po_id IS NOT NULL THEN
        SELECT status INTO v_po_status
        FROM purchase_orders
        WHERE id = v_link.po_id;

        -- Check if PO status indicates completion
        IF v_po_status IN ('closed', 'cancelled', 'invoiced', 'completed') THEN
            RETURN QUERY SELECT FALSE, NULL::JSONB,
                ('This purchase order has been ' || v_po_status || ' and is no longer available')::TEXT;
            RETURN;
        END IF;

        -- Check if three-way match has been approved
        SELECT EXISTS (
            SELECT 1 FROM po_three_way_matches
            WHERE po_id = v_link.po_id
              AND match_status = 'approved'
        ) INTO v_is_matched;

        IF v_is_matched THEN
            RETURN QUERY SELECT FALSE, NULL::JSONB,
                'This purchase order has been invoiced and matched. The link is no longer active.'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- Check status-based expiration for Finale POs
    IF v_link.finale_po_id IS NOT NULL THEN
        SELECT status INTO v_po_status
        FROM finale_purchase_orders
        WHERE id = v_link.finale_po_id;

        -- Check if PO status indicates completion
        IF v_po_status IN ('closed', 'cancelled', 'invoiced', 'completed', 'Closed', 'Cancelled', 'Invoiced', 'Completed') THEN
            RETURN QUERY SELECT FALSE, NULL::JSONB,
                ('This purchase order has been ' || LOWER(v_po_status) || ' and is no longer available')::TEXT;
            RETURN;
        END IF;

        -- Check if three-way match has been approved (for Finale POs)
        SELECT EXISTS (
            SELECT 1 FROM po_three_way_matches
            WHERE finale_po_id = v_link.finale_po_id
              AND match_status = 'approved'
        ) INTO v_is_matched;

        IF v_is_matched THEN
            RETURN QUERY SELECT FALSE, NULL::JSONB,
                'This purchase order has been invoiced and matched. The link is no longer active.'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- All checks passed - log the access
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

-- Add comment explaining expiration logic
COMMENT ON FUNCTION log_po_share_access IS
'Logs access to a PO share link and returns PO data.
Expiration checks:
1. Time-based: expires_at timestamp
2. Status-based: PO status is closed, cancelled, invoiced, or completed
3. Match-based: Three-way match has been approved
Returns success=false with error_message if any expiration condition is met.';
