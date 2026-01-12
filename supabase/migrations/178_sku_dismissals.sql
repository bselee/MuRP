-- ============================================================================
-- Migration 178: SKU Dismissals and Snooze System
-- ============================================================================
-- Tracks dismissed SKUs (with reasons) and snoozed SKUs (with reminder dates)
-- Used by purchasing guidance to hide items temporarily or with explanation
-- ============================================================================

CREATE TABLE IF NOT EXISTS sku_dismissals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id),

    -- Dismissal info
    dismiss_type TEXT NOT NULL CHECK (dismiss_type IN ('dismiss', 'snooze')),
    dismiss_reason TEXT CHECK (dismiss_reason IN (
        'dropship',           -- Handled by vendor directly
        'bulk_order',         -- Will order in bulk with other items
        'seasonal',           -- Seasonal item, not needed now
        'low_priority',       -- Low priority, can wait
        'discontinued',       -- Being phased out
        'vendor_managed',     -- Vendor manages inventory (VMI)
        'custom'              -- Custom reason (see notes)
    )),
    notes TEXT,               -- Custom reason or additional context

    -- Snooze timing (only for dismiss_type = 'snooze')
    snooze_until TIMESTAMPTZ, -- When to show the SKU again

    -- Tracking
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate active dismissals for same SKU per user
    CONSTRAINT unique_active_dismissal UNIQUE (sku, user_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_sku_dismissals_sku ON sku_dismissals(sku);
CREATE INDEX IF NOT EXISTS idx_sku_dismissals_user ON sku_dismissals(user_id);
CREATE INDEX IF NOT EXISTS idx_sku_dismissals_snooze ON sku_dismissals(snooze_until)
    WHERE dismiss_type = 'snooze';
CREATE INDEX IF NOT EXISTS idx_sku_dismissals_type ON sku_dismissals(dismiss_type);

-- Enable RLS
ALTER TABLE sku_dismissals ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own dismissals
CREATE POLICY "Users can view their own dismissals" ON sku_dismissals
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own dismissals" ON sku_dismissals
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dismissals" ON sku_dismissals
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dismissals" ON sku_dismissals
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- Service role bypass
CREATE POLICY "Service role full access sku_dismissals" ON sku_dismissals
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Function to check if a SKU is currently dismissed/snoozed for a user
CREATE OR REPLACE FUNCTION is_sku_dismissed(p_sku TEXT, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM sku_dismissals
        WHERE sku = p_sku
          AND user_id = p_user_id
          AND (
              dismiss_type = 'dismiss'
              OR (dismiss_type = 'snooze' AND snooze_until > NOW())
          )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get active dismissals for current user
CREATE OR REPLACE FUNCTION get_active_dismissals(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
    sku TEXT,
    dismiss_type TEXT,
    dismiss_reason TEXT,
    notes TEXT,
    snooze_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.sku,
        d.dismiss_type,
        d.dismiss_reason,
        d.notes,
        d.snooze_until,
        d.created_at
    FROM sku_dismissals d
    WHERE d.user_id = p_user_id
      AND (
          d.dismiss_type = 'dismiss'
          OR (d.dismiss_type = 'snooze' AND d.snooze_until > NOW())
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to dismiss or snooze a SKU
CREATE OR REPLACE FUNCTION dismiss_sku(
    p_sku TEXT,
    p_dismiss_type TEXT,
    p_dismiss_reason TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_snooze_until TIMESTAMPTZ DEFAULT NULL,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    -- Upsert: update existing or insert new
    INSERT INTO sku_dismissals (sku, user_id, dismiss_type, dismiss_reason, notes, snooze_until)
    VALUES (p_sku, p_user_id, p_dismiss_type, p_dismiss_reason, p_notes, p_snooze_until)
    ON CONFLICT (sku, user_id)
    DO UPDATE SET
        dismiss_type = EXCLUDED.dismiss_type,
        dismiss_reason = EXCLUDED.dismiss_reason,
        notes = EXCLUDED.notes,
        snooze_until = EXCLUDED.snooze_until,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to un-dismiss a SKU (remove from dismissal list)
CREATE OR REPLACE FUNCTION undismiss_sku(p_sku TEXT, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    DELETE FROM sku_dismissals
    WHERE sku = p_sku AND user_id = p_user_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment
COMMENT ON TABLE sku_dismissals IS 'Tracks SKUs that users have dismissed or snoozed from purchasing guidance';
