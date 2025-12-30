-- Migration 133: Add finale_po_id to email_threads
-- Allows linking email threads to finale_purchase_orders (where actual PO data lives)
-- The existing po_id column references purchase_orders which is used for custom/draft POs
-- finale_po_id references the synced Finale PO data

-- Add finale_po_id column
ALTER TABLE email_threads
ADD COLUMN IF NOT EXISTS finale_po_id UUID REFERENCES finale_purchase_orders(id) ON DELETE SET NULL;

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_email_threads_finale_po
ON email_threads(finale_po_id)
WHERE finale_po_id IS NOT NULL;

-- Update the correlate_thread_to_po function to handle both PO sources
CREATE OR REPLACE FUNCTION correlate_thread_to_po(
    p_thread_id UUID,
    p_po_id UUID,
    p_confidence FLOAT,
    p_method TEXT
) RETURNS VOID AS $$
DECLARE
    v_is_finale_po BOOLEAN := FALSE;
BEGIN
    -- Check if this PO ID exists in finale_purchase_orders
    SELECT EXISTS(SELECT 1 FROM finale_purchase_orders WHERE id = p_po_id) INTO v_is_finale_po;

    IF v_is_finale_po THEN
        -- Update finale_po_id
        UPDATE email_threads SET
            finale_po_id = p_po_id,
            correlation_confidence = p_confidence,
            correlation_method = p_method,
            correlation_details = jsonb_build_object(
                'correlated_at', NOW(),
                'method', p_method,
                'confidence', p_confidence,
                'po_source', 'finale'
            ),
            updated_at = NOW()
        WHERE id = p_thread_id;
    ELSE
        -- Update po_id (legacy/custom POs)
        UPDATE email_threads SET
            po_id = p_po_id,
            correlation_confidence = p_confidence,
            correlation_method = p_method,
            correlation_details = jsonb_build_object(
                'correlated_at', NOW(),
                'method', p_method,
                'confidence', p_confidence,
                'po_source', 'custom'
            ),
            updated_at = NOW()
        WHERE id = p_thread_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create a view that shows threads with their linked PO data from either source
CREATE OR REPLACE VIEW email_threads_with_po AS
SELECT
    et.*,
    COALESCE(fpo.order_id, po.order_id) AS linked_po_number,
    COALESCE(fpo.vendor_name, v.name) AS linked_vendor_name,
    COALESCE(fpo.status, po.status) AS linked_po_status,
    COALESCE(fpo.tracking_number, po.tracking_number) AS linked_tracking_number,
    COALESCE(fpo.tracking_status, po.tracking_status) AS linked_tracking_status,
    CASE
        WHEN et.finale_po_id IS NOT NULL THEN 'finale'
        WHEN et.po_id IS NOT NULL THEN 'custom'
        ELSE NULL
    END AS po_source
FROM email_threads et
LEFT JOIN finale_purchase_orders fpo ON fpo.id = et.finale_po_id
LEFT JOIN purchase_orders po ON po.id = et.po_id
LEFT JOIN vendors v ON v.id = po.vendor_id;

COMMENT ON COLUMN email_threads.finale_po_id IS 'Reference to finale_purchase_orders for synced Finale POs';
COMMENT ON VIEW email_threads_with_po IS 'Email threads with linked PO data from either Finale or custom sources';
