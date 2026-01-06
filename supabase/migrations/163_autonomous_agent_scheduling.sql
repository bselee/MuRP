-- Migration 163: Autonomous Agent Scheduling
--
-- Problem: Agents exist but never run autonomously. Users see "nothing happening".
-- Solution:
--   1. Use Supabase's native pg_cron with net.http_post
--   2. Create a simple stored procedure that runs agents directly
--   3. Log activity so users SEE results
--
-- ============================================================================

-- ============================================================================
-- 1. CREATE FUNCTION TO RUN STOCKOUT PREVENTION AGENT
-- ============================================================================
-- This runs directly in PostgreSQL, no edge function needed

CREATE OR REPLACE FUNCTION run_stockout_scan()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_execution_id UUID;
    v_start_time TIMESTAMPTZ := NOW();
    v_critical_count INT := 0;
    v_high_count INT := 0;
    v_total_scanned INT := 0;
    v_result jsonb;
    v_item RECORD;
BEGIN
    -- Create execution log entry (using columns that exist in the table)
    INSERT INTO agent_execution_log (
        agent_identifier,
        status,
        started_at,
        input
    ) VALUES (
        'stockout-prevention',
        'running',
        v_start_time,
        jsonb_build_object('trigger', 'pg_cron', 'source', 'autonomous')
    )
    RETURNING id INTO v_execution_id;

    -- Log that we're starting
    INSERT INTO agent_activity_log (
        agent_identifier,
        execution_id,
        activity_type,
        title,
        description,
        severity,
        context
    ) VALUES (
        'stockout-prevention',
        v_execution_id,
        'observation',
        'Starting autonomous stock scan',
        'Checking inventory levels against reorder points',
        'info',
        jsonb_build_object('trigger', 'autonomous_cron', 'time', v_start_time)
    );

    -- Scan inventory for items below ROP (simplified query using only inventory_items)
    FOR v_item IN
        SELECT
            ii.sku,
            ii.name as product_name,
            COALESCE(ii.stock, 0) as stock,
            GREATEST(ii.reorder_point, 5) as rop,
            GREATEST(ii.reorder_point / 2, 3) as safety,
            COALESCE(ii.sales_velocity, 0.5) as velocity,
            v.name as vendor_name
        FROM inventory_items ii
        LEFT JOIN vendors v ON ii.vendor_id = v.id
        WHERE ii.status = 'active'
          AND COALESCE(ii.is_dropship, false) = false
          AND ii.category NOT ILIKE '%dropship%'
          AND ii.category NOT ILIKE '%deprecat%'
        ORDER BY
            CASE
                WHEN COALESCE(ii.stock, 0) <= 0 THEN 0
                WHEN COALESCE(ii.stock, 0) < GREATEST(ii.reorder_point / 2, 3) THEN 1
                WHEN COALESCE(ii.stock, 0) < GREATEST(ii.reorder_point, 5) THEN 2
                ELSE 3
            END,
            COALESCE(ii.stock, 0) - GREATEST(ii.reorder_point, 5)
        LIMIT 100
    LOOP
        v_total_scanned := v_total_scanned + 1;

        -- Check if critical (out of stock or below safety)
        IF v_item.stock <= 0 THEN
            v_critical_count := v_critical_count + 1;

            -- Log critical finding
            INSERT INTO agent_activity_log (
                agent_identifier,
                execution_id,
                activity_type,
                title,
                description,
                severity,
                context,
                requires_human_review
            ) VALUES (
                'stockout-prevention',
                v_execution_id,
                'decision',
                'OUT OF STOCK: ' || v_item.sku,
                v_item.product_name || ' has 0 units. Immediate reorder needed.',
                'critical',
                jsonb_build_object(
                    'sku', v_item.sku,
                    'product_name', v_item.product_name,
                    'current_stock', v_item.stock,
                    'reorder_point', v_item.rop,
                    'vendor', v_item.vendor_name,
                    'recommendation', 'Place emergency order immediately'
                ),
                true
            );

        ELSIF v_item.stock < v_item.safety THEN
            v_critical_count := v_critical_count + 1;

            INSERT INTO agent_activity_log (
                agent_identifier,
                execution_id,
                activity_type,
                title,
                description,
                severity,
                context,
                requires_human_review
            ) VALUES (
                'stockout-prevention',
                v_execution_id,
                'decision',
                'CRITICAL LOW: ' || v_item.sku,
                v_item.product_name || ' below safety stock (' || v_item.stock || '/' || v_item.safety || ')',
                'critical',
                jsonb_build_object(
                    'sku', v_item.sku,
                    'product_name', v_item.product_name,
                    'current_stock', v_item.stock,
                    'safety_stock', v_item.safety,
                    'vendor', v_item.vendor_name
                ),
                true
            );

        ELSIF v_item.stock < v_item.rop THEN
            v_high_count := v_high_count + 1;

            -- Only log high priority items if under 5 to avoid noise
            IF v_high_count <= 5 THEN
                INSERT INTO agent_activity_log (
                    agent_identifier,
                    execution_id,
                    activity_type,
                    title,
                    description,
                    severity,
                    context
                ) VALUES (
                    'stockout-prevention',
                    v_execution_id,
                    'analysis',
                    'Below ROP: ' || v_item.sku,
                    v_item.product_name || ' needs reorder (' || v_item.stock || '/' || v_item.rop || ')',
                    'warning',
                    jsonb_build_object(
                        'sku', v_item.sku,
                        'current_stock', v_item.stock,
                        'reorder_point', v_item.rop
                    )
                );
            END IF;
        END IF;
    END LOOP;

    -- Build result
    v_result := jsonb_build_object(
        'success', true,
        'execution_id', v_execution_id,
        'scanned', v_total_scanned,
        'critical', v_critical_count,
        'high', v_high_count,
        'duration_ms', EXTRACT(MILLISECONDS FROM (NOW() - v_start_time))::INT
    );

    -- Log completion
    INSERT INTO agent_activity_log (
        agent_identifier,
        execution_id,
        activity_type,
        title,
        description,
        severity,
        context
    ) VALUES (
        'stockout-prevention',
        v_execution_id,
        'completion',
        'Stock scan completed',
        'Scanned ' || v_total_scanned || ' items. Found ' || v_critical_count || ' critical, ' || v_high_count || ' high priority.',
        CASE WHEN v_critical_count > 0 THEN 'critical' WHEN v_high_count > 0 THEN 'warning' ELSE 'success' END,
        v_result
    );

    -- Update execution log (using columns that exist in the table)
    UPDATE agent_execution_log
    SET
        status = 'completed',
        completed_at = NOW(),
        duration_ms = EXTRACT(MILLISECONDS FROM (NOW() - v_start_time))::INT,
        output = v_result
    WHERE id = v_execution_id;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION run_stockout_scan() IS
'Autonomous stockout prevention scan. Runs via pg_cron to detect low inventory.';

-- ============================================================================
-- 2. SCHEDULE AUTONOMOUS AGENT RUNS VIA PG_CRON
-- ============================================================================

-- Remove any existing jobs with these names
DO $$
BEGIN
    PERFORM cron.unschedule('autonomous-stockout-scan');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Job autonomous-stockout-scan did not exist';
END $$;

DO $$
BEGIN
    PERFORM cron.unschedule('morning-stock-check');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Job morning-stock-check did not exist';
END $$;

-- Schedule stockout scan every 4 hours
SELECT cron.schedule(
    'autonomous-stockout-scan',
    '0 */4 * * *',  -- Every 4 hours
    $$SELECT run_stockout_scan()$$
);

-- Also run at 6 AM daily (morning check)
SELECT cron.schedule(
    'morning-stock-check',
    '0 6 * * *',  -- 6 AM daily
    $$SELECT run_stockout_scan()$$
);

-- ============================================================================
-- 3. ADD 'LAST RUN' COLUMNS TO AGENT_DEFINITIONS FOR VISIBILITY
-- ============================================================================

-- Add columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agent_definitions' AND column_name = 'last_run_at'
    ) THEN
        ALTER TABLE agent_definitions ADD COLUMN last_run_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agent_definitions' AND column_name = 'last_run_status'
    ) THEN
        ALTER TABLE agent_definitions ADD COLUMN last_run_status TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agent_definitions' AND column_name = 'next_scheduled_run'
    ) THEN
        ALTER TABLE agent_definitions ADD COLUMN next_scheduled_run TIMESTAMPTZ;
    END IF;
END $$;

-- ============================================================================
-- 4. TRIGGER TO AUTO-UPDATE AGENT LAST RUN STATUS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_agent_last_run()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the agent_definitions table with last run info
    UPDATE agent_definitions
    SET
        last_run_at = NEW.completed_at,
        last_run_status = NEW.status,
        total_runs = COALESCE(total_runs, 0) + 1,
        successful_runs = CASE
            WHEN NEW.status = 'completed' THEN COALESCE(successful_runs, 0) + 1
            ELSE successful_runs
        END,
        updated_at = NOW()
    WHERE identifier = NEW.agent_identifier;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_update_agent_last_run ON agent_execution_log;

-- Create trigger
CREATE TRIGGER trg_update_agent_last_run
    AFTER INSERT OR UPDATE ON agent_execution_log
    FOR EACH ROW
    WHEN (NEW.status IN ('completed', 'failed'))
    EXECUTE FUNCTION update_agent_last_run();

-- ============================================================================
-- 5. VIEW FOR DASHBOARD - SIMPLE AGENT STATUS
-- ============================================================================

CREATE OR REPLACE VIEW agent_dashboard_status AS
SELECT
    ad.identifier,
    ad.name,
    ad.is_active,
    ad.autonomy_level,
    ad.last_run_at,
    ad.last_run_status,
    ad.total_runs,
    ad.successful_runs,
    ad.trust_score,
    -- Calculate next run from cron schedule
    CASE
        WHEN et.cron_expression = '0 */4 * * *' THEN
            date_trunc('hour', NOW()) + interval '4 hours' - (EXTRACT(HOUR FROM NOW())::INT % 4) * interval '1 hour'
        WHEN et.cron_expression = '0 6 * * *' THEN
            CASE
                WHEN EXTRACT(HOUR FROM NOW()) < 6 THEN date_trunc('day', NOW()) + interval '6 hours'
                ELSE date_trunc('day', NOW()) + interval '30 hours'
            END
        WHEN et.cron_expression LIKE '*/% * * * *' THEN
            NOW() + interval '15 minutes'
        ELSE NULL
    END as next_scheduled_run,
    -- Recent activity count (last 24h)
    (
        SELECT COUNT(*)
        FROM agent_activity_log aal
        WHERE aal.agent_identifier = ad.identifier
        AND aal.created_at > NOW() - interval '24 hours'
    ) as activity_count_24h,
    -- Pending reviews count
    (
        SELECT COUNT(*)
        FROM agent_activity_log aal
        WHERE aal.agent_identifier = ad.identifier
        AND aal.requires_human_review = true
        AND aal.human_reviewed_at IS NULL
    ) as pending_reviews
FROM agent_definitions ad
LEFT JOIN event_triggers et ON et.agent_id = ad.id AND et.cron_expression IS NOT NULL
WHERE ad.is_active = true
ORDER BY ad.last_run_at DESC NULLS LAST;

COMMENT ON VIEW agent_dashboard_status IS
'Simplified view for Dashboard showing agent status and next run times';

-- ============================================================================
-- 6. RUN INITIAL SCAN TO POPULATE DATA
-- ============================================================================

-- Run the stockout scan immediately to populate activity data
SELECT run_stockout_scan();

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_job_count INT;
    v_activity_count INT;
BEGIN
    -- Check cron jobs
    SELECT COUNT(*) INTO v_job_count
    FROM cron.job
    WHERE jobname IN ('autonomous-stockout-scan', 'morning-stock-check');

    IF v_job_count = 2 THEN
        RAISE NOTICE '✓ Both autonomous cron jobs scheduled';
    ELSE
        RAISE WARNING '⚠ Expected 2 cron jobs, found %', v_job_count;
    END IF;

    -- Check activity was logged
    SELECT COUNT(*) INTO v_activity_count
    FROM agent_activity_log
    WHERE agent_identifier = 'stockout-prevention'
    AND created_at > NOW() - interval '1 minute';

    IF v_activity_count > 0 THEN
        RAISE NOTICE '✓ Initial scan generated % activity entries', v_activity_count;
    ELSE
        RAISE WARNING '⚠ No activity entries generated';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE 'Autonomous agent scheduling configured:';
    RAISE NOTICE '  - autonomous-stockout-scan: Every 4 hours';
    RAISE NOTICE '  - morning-stock-check: Daily at 6 AM';
    RAISE NOTICE '';
    RAISE NOTICE 'Users will now see agent activity on Dashboard!';
END $$;
