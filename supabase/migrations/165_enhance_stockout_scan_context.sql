-- Migration 165: Enhance stockout scan context with velocity data
--
-- Add sales_velocity to the context stored in agent_activity_log
-- This helps users make informed reorder decisions
-- ============================================================================

-- Update the run_stockout_scan function to include velocity in context
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
    -- Create execution log entry
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

    -- Scan inventory for items below ROP
    FOR v_item IN
        SELECT
            ii.sku,
            ii.name as product_name,
            COALESCE(ii.stock, 0) as stock,
            GREATEST(ii.reorder_point, 5) as rop,
            GREATEST(ii.reorder_point / 2, 3) as safety,
            COALESCE(ii.sales_velocity, 0) as velocity,
            v.name as vendor_name,
            ii.last_ordered_at
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

            -- Log critical finding with enhanced context
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
                    'velocity', v_item.velocity,
                    'vendor', v_item.vendor_name,
                    'last_ordered', v_item.last_ordered_at,
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
                    'reorder_point', v_item.rop,
                    'velocity', v_item.velocity,
                    'vendor', v_item.vendor_name,
                    'last_ordered', v_item.last_ordered_at
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
                        'product_name', v_item.product_name,
                        'current_stock', v_item.stock,
                        'reorder_point', v_item.rop,
                        'velocity', v_item.velocity,
                        'vendor', v_item.vendor_name,
                        'last_ordered', v_item.last_ordered_at
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

    -- Update execution log
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
'Autonomous stockout prevention scan with enhanced context including velocity and last_ordered_at';

-- Verify
DO $$
BEGIN
    RAISE NOTICE '✓ Enhanced run_stockout_scan() with velocity and last_ordered context';
END $$;
