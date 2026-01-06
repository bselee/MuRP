-- Migration 164: Add RLS policy for agent_activity_log
--
-- Allow authenticated users to read agent activity so Dashboard can display it
-- ============================================================================

-- Add policy for authenticated users to read agent activity
CREATE POLICY agent_activity_log_read_authenticated ON agent_activity_log
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Also add policy for anon key to read (for dashboard access without login in dev)
CREATE POLICY agent_activity_log_read_anon ON agent_activity_log
    FOR SELECT
    USING (true);  -- Anyone can read agent activity - it's not sensitive

-- Same for agent_execution_log
CREATE POLICY agent_execution_log_read_anon ON agent_execution_log
    FOR SELECT
    USING (true);  -- Public read access for dashboard visibility

-- Verify
DO $$
BEGIN
    RAISE NOTICE '✓ RLS policies added for agent activity visibility';
    RAISE NOTICE '  - agent_activity_log: readable by all';
    RAISE NOTICE '  - agent_execution_log: readable by all';
END $$;
