-- Migration 159: System Health Monitoring Infrastructure
--
-- Creates tables and functions to detect, track, and surface system failures
-- to users instead of silently failing.
--
-- Part of: Solid UX Initiative
-- Goal: NEVER let systems fail silently - users must know when action is needed

-- ============================================================================
-- SYSTEM HEALTH ALERTS TABLE
-- ============================================================================
-- Tracks all system health issues that need user attention

CREATE TABLE IF NOT EXISTS system_health_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Alert Classification
    alert_type TEXT NOT NULL CHECK (alert_type IN (
        'sync_failure',           -- Finale/data sync failed
        'oauth_expired',          -- OAuth token expired or invalid
        'email_polling_stopped',  -- Email inbox polling not working
        'cron_job_failed',        -- Scheduled job failed
        'integration_error',      -- External API integration error
        'data_stale',             -- Data hasn't been updated in expected timeframe
        'extraction_failed',      -- Invoice/document extraction failed
        'webhook_dropped'         -- Webhook message couldn't be processed
    )),

    -- Severity (determines UI treatment)
    severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN (
        'info',      -- FYI, no action needed
        'warning',   -- Should look at soon
        'error',     -- Action needed
        'critical'   -- Immediate action required
    )),

    -- Alert Details
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    component TEXT NOT NULL,           -- Which system component (email_poller, finale_sync, etc.)

    -- Context
    context_data JSONB DEFAULT '{}'::jsonb,  -- Additional context (error details, IDs, etc.)

    -- Resolution
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    resolution_notes TEXT,

    -- Auto-resolution
    auto_resolve_after INTERVAL,       -- Auto-resolve after this duration (e.g., '24 hours')
    auto_resolved BOOLEAN DEFAULT false,

    -- Notification tracking
    user_notified BOOLEAN DEFAULT false,
    user_dismissed BOOLEAN DEFAULT false,
    dismissed_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Prevent duplicate alerts for same issue
    fingerprint TEXT  -- Hash of alert_type + component + key context
);

-- Partial unique index to prevent duplicate unresolved alerts with same fingerprint
CREATE UNIQUE INDEX IF NOT EXISTS idx_health_alerts_fingerprint_unique
    ON system_health_alerts(fingerprint)
    WHERE NOT is_resolved AND fingerprint IS NOT NULL;

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_health_alerts_active
    ON system_health_alerts(is_resolved, severity, created_at DESC)
    WHERE NOT is_resolved;

CREATE INDEX IF NOT EXISTS idx_health_alerts_type
    ON system_health_alerts(alert_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_health_alerts_component
    ON system_health_alerts(component, created_at DESC);

-- ============================================================================
-- SYNC HEALTH STATUS VIEW
-- ============================================================================
-- Quick view of all sync health metrics

CREATE OR REPLACE VIEW sync_health_status AS
SELECT
    -- Finale Sync (column names match finale_sync_state table from migration 081)
    fss.last_full_sync_at as last_full_sync,
    fss.last_po_sync_at as last_po_sync,
    fss.last_stock_sync_at as last_inventory_sync,
    CASE
        WHEN fss.last_full_sync_at IS NULL OR fss.last_full_sync_at < NOW() - INTERVAL '24 hours' THEN 'stale'
        WHEN fss.last_full_sync_at < NOW() - INTERVAL '12 hours' THEN 'warning'
        ELSE 'healthy'
    END as finale_sync_status,
    COALESCE(EXTRACT(EPOCH FROM (NOW() - fss.last_full_sync_at)) / 3600, 999) as hours_since_full_sync,

    -- Email Polling
    (SELECT COUNT(*) FROM email_inbox_configs WHERE is_active = true) as active_inboxes,
    (SELECT COUNT(*) FROM email_inbox_configs WHERE status = 'error') as error_inboxes,
    (SELECT MIN(last_poll_at) FROM email_inbox_configs WHERE is_active = true) as oldest_poll,
    CASE
        WHEN (SELECT MIN(last_poll_at) FROM email_inbox_configs WHERE is_active = true) < NOW() - INTERVAL '2 hours' THEN 'stale'
        WHEN (SELECT MIN(last_poll_at) FROM email_inbox_configs WHERE is_active = true) < NOW() - INTERVAL '30 minutes' THEN 'warning'
        WHEN (SELECT COUNT(*) FROM email_inbox_configs WHERE is_active = true) = 0 THEN 'not_configured'
        ELSE 'healthy'
    END as email_polling_status,

    -- Active Alerts
    (SELECT COUNT(*) FROM system_health_alerts WHERE NOT is_resolved AND severity = 'critical') as critical_alerts,
    (SELECT COUNT(*) FROM system_health_alerts WHERE NOT is_resolved AND severity = 'error') as error_alerts,
    (SELECT COUNT(*) FROM system_health_alerts WHERE NOT is_resolved AND severity = 'warning') as warning_alerts,

    -- Overall Status
    CASE
        WHEN (SELECT COUNT(*) FROM system_health_alerts WHERE NOT is_resolved AND severity = 'critical') > 0 THEN 'critical'
        WHEN (SELECT COUNT(*) FROM system_health_alerts WHERE NOT is_resolved AND severity = 'error') > 0 THEN 'error'
        WHEN fss.last_full_sync_at IS NULL OR fss.last_full_sync_at < NOW() - INTERVAL '24 hours' THEN 'warning'
        WHEN (SELECT MIN(last_poll_at) FROM email_inbox_configs WHERE is_active = true) < NOW() - INTERVAL '2 hours' THEN 'warning'
        ELSE 'healthy'
    END as overall_status
FROM finale_sync_state fss
WHERE fss.id = 'main'
LIMIT 1;

-- ============================================================================
-- FUNCTION: Create Health Alert
-- ============================================================================

CREATE OR REPLACE FUNCTION create_health_alert(
    p_alert_type TEXT,
    p_severity TEXT,
    p_title TEXT,
    p_message TEXT,
    p_component TEXT,
    p_context JSONB DEFAULT '{}'::jsonb,
    p_auto_resolve_after INTERVAL DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_fingerprint TEXT;
    v_existing_id UUID;
    v_new_id UUID;
BEGIN
    -- Generate fingerprint to prevent duplicates
    v_fingerprint := md5(p_alert_type || '::' || p_component || '::' || COALESCE(p_context->>'key', ''));

    -- Check for existing unresolved alert with same fingerprint
    SELECT id INTO v_existing_id
    FROM system_health_alerts
    WHERE fingerprint = v_fingerprint AND NOT is_resolved
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        -- Update existing alert
        UPDATE system_health_alerts
        SET
            message = p_message,
            context_data = p_context,
            updated_at = NOW(),
            severity = CASE
                WHEN p_severity = 'critical' THEN 'critical'
                WHEN severity = 'critical' THEN 'critical'  -- Don't downgrade critical
                ELSE p_severity
            END
        WHERE id = v_existing_id;
        RETURN v_existing_id;
    END IF;

    -- Create new alert
    INSERT INTO system_health_alerts (
        alert_type, severity, title, message, component,
        context_data, auto_resolve_after, fingerprint
    ) VALUES (
        p_alert_type, p_severity, p_title, p_message, p_component,
        p_context, p_auto_resolve_after, v_fingerprint
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Resolve Health Alert
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_health_alert(
    p_alert_id UUID,
    p_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE system_health_alerts
    SET
        is_resolved = true,
        resolved_at = NOW(),
        resolved_by = p_user_id,
        resolution_notes = p_notes,
        updated_at = NOW()
    WHERE id = p_alert_id AND NOT is_resolved;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Auto-resolve stale alerts
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_resolve_stale_alerts()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE system_health_alerts
    SET
        is_resolved = true,
        resolved_at = NOW(),
        auto_resolved = true,
        resolution_notes = 'Auto-resolved after ' || auto_resolve_after::text
    WHERE
        NOT is_resolved
        AND auto_resolve_after IS NOT NULL
        AND created_at + auto_resolve_after < NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Check and Alert on Stale Data
-- ============================================================================

CREATE OR REPLACE FUNCTION check_data_freshness()
RETURNS void AS $$
DECLARE
    v_last_sync TIMESTAMPTZ;
    v_last_poll TIMESTAMPTZ;
    v_inbox_record RECORD;
BEGIN
    -- Check Finale sync freshness (column is last_full_sync_at per migration 081)
    SELECT last_full_sync_at INTO v_last_sync FROM finale_sync_state WHERE id = 'main' LIMIT 1;

    IF v_last_sync IS NOT NULL AND v_last_sync < NOW() - INTERVAL '24 hours' THEN
        PERFORM create_health_alert(
            'data_stale',
            CASE WHEN v_last_sync < NOW() - INTERVAL '48 hours' THEN 'error' ELSE 'warning' END,
            'Finale Sync Overdue',
            'Last successful sync was ' ||
                ROUND(EXTRACT(EPOCH FROM (NOW() - v_last_sync)) / 3600) ||
                ' hours ago. Inventory data may be outdated.',
            'finale_sync',
            jsonb_build_object('last_sync', v_last_sync, 'key', 'finale_sync'),
            INTERVAL '24 hours'
        );
    END IF;

    -- Check email inbox polling
    FOR v_inbox_record IN
        SELECT id, email_address, last_poll_at, status, consecutive_errors
        FROM email_inbox_configs
        WHERE is_active = true
    LOOP
        -- Check if polling stopped
        IF v_inbox_record.last_poll_at < NOW() - INTERVAL '1 hour' THEN
            PERFORM create_health_alert(
                'email_polling_stopped',
                CASE WHEN v_inbox_record.last_poll_at < NOW() - INTERVAL '6 hours' THEN 'error' ELSE 'warning' END,
                'Email Polling Stopped',
                'Inbox ' || v_inbox_record.email_address || ' hasn''t been polled in ' ||
                    ROUND(EXTRACT(EPOCH FROM (NOW() - v_inbox_record.last_poll_at)) / 3600) ||
                    ' hours. PO tracking updates may be delayed.',
                'email_poller',
                jsonb_build_object(
                    'inbox_id', v_inbox_record.id,
                    'email', v_inbox_record.email_address,
                    'last_poll', v_inbox_record.last_poll_at,
                    'key', 'email_' || v_inbox_record.id
                ),
                INTERVAL '6 hours'
            );
        END IF;

        -- Check for OAuth errors
        IF v_inbox_record.status = 'error' THEN
            PERFORM create_health_alert(
                'oauth_expired',
                'error',
                'Email Connection Error',
                'Inbox ' || v_inbox_record.email_address || ' has an error. ' ||
                    CASE WHEN v_inbox_record.consecutive_errors >= 5
                        THEN 'Gmail authentication may have expired. Please reconnect.'
                        ELSE 'Check the inbox configuration.'
                    END,
                'email_oauth',
                jsonb_build_object(
                    'inbox_id', v_inbox_record.id,
                    'email', v_inbox_record.email_address,
                    'consecutive_errors', v_inbox_record.consecutive_errors,
                    'key', 'oauth_' || v_inbox_record.id
                ),
                NULL  -- Don't auto-resolve OAuth errors
            );
        END IF;
    END LOOP;

    -- Auto-resolve any stale alerts
    PERFORM auto_resolve_stale_alerts();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- CRON JOB: Health Check Every 15 Minutes
-- ============================================================================

DO $$
BEGIN
    -- Remove existing job if present
    PERFORM cron.unschedule('system-health-check');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'system-health-check',
    '*/15 * * * *',  -- Every 15 minutes
    $$SELECT check_data_freshness()$$
);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE system_health_alerts ENABLE ROW LEVEL SECURITY;

-- Admins can see all alerts
DROP POLICY IF EXISTS "Admins can view all health alerts" ON system_health_alerts;
CREATE POLICY "Admins can view all health alerts"
    ON system_health_alerts FOR SELECT TO authenticated
    USING (true);  -- All authenticated users can see alerts (they affect everyone)

-- Admins can manage alerts
DROP POLICY IF EXISTS "Admins can manage health alerts" ON system_health_alerts;
CREATE POLICY "Admins can manage health alerts"
    ON system_health_alerts FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE system_health_alerts IS
    'Tracks system health issues that need user attention. Prevents silent failures.';

COMMENT ON FUNCTION create_health_alert IS
    'Creates or updates a health alert. Uses fingerprinting to prevent duplicate alerts.';

COMMENT ON FUNCTION check_data_freshness IS
    'Checks all data sources for staleness and creates alerts. Run by cron every 15 minutes.';

COMMENT ON VIEW sync_health_status IS
    'Quick overview of all sync health metrics for dashboard display.';
