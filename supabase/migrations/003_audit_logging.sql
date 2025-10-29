-- Migration: 003_audit_logging.sql
-- Description: Implement comprehensive audit logging for all data changes
-- Created: 2025-10-28

-- =============================================================================
-- AUDIT_LOGS TABLE
-- =============================================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    user_id UUID REFERENCES auth.users(id),
    user_email TEXT,
    user_role TEXT,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    
    -- Additional context
    transaction_id TEXT,
    session_id TEXT
);

-- Indexes for efficient querying
CREATE INDEX idx_audit_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_table_name ON audit_logs(table_name);

-- Partition by month for better performance (optional but recommended)
-- This keeps the table manageable as audit logs grow
CREATE INDEX idx_audit_timestamp_brin ON audit_logs USING BRIN(timestamp);

COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail of all data modifications';
COMMENT ON COLUMN audit_logs.old_values IS 'Complete row state before change (UPDATE/DELETE)';
COMMENT ON COLUMN audit_logs.new_values IS 'Complete row state after change (INSERT/UPDATE)';
COMMENT ON COLUMN audit_logs.changed_fields IS 'Array of field names that changed (UPDATE only)';

-- =============================================================================
-- AUDIT TRIGGER FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    old_data JSONB;
    new_data JSONB;
    changed_fields TEXT[];
    current_user_id UUID;
    current_user_email TEXT;
    current_user_role TEXT;
BEGIN
    -- Get current user information from Supabase auth
    current_user_id := auth.uid();
    
    -- Get additional user details if available
    IF current_user_id IS NOT NULL THEN
        SELECT email, role INTO current_user_email, current_user_role
        FROM users
        WHERE id = current_user_id;
    END IF;
    
    -- Capture old and new data based on operation
    IF (TG_OP = 'DELETE') THEN
        old_data = to_jsonb(OLD);
        new_data = NULL;
        
    ELSIF (TG_OP = 'UPDATE') THEN
        old_data = to_jsonb(OLD);
        new_data = to_jsonb(NEW);
        
        -- Identify which fields actually changed
        SELECT array_agg(key)
        INTO changed_fields
        FROM jsonb_each(old_data)
        WHERE old_data->key IS DISTINCT FROM new_data->key;
        
        -- Skip audit log if nothing actually changed
        IF changed_fields IS NULL OR array_length(changed_fields, 1) = 0 THEN
            RETURN NEW;
        END IF;
        
    ELSIF (TG_OP = 'INSERT') THEN
        old_data = NULL;
        new_data = to_jsonb(NEW);
    END IF;
    
    -- Insert audit record
    INSERT INTO audit_logs (
        table_name,
        record_id,
        action,
        old_values,
        new_values,
        changed_fields,
        user_id,
        user_email,
        user_role,
        transaction_id,
        timestamp
    ) VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        old_data,
        new_data,
        changed_fields,
        current_user_id,
        current_user_email,
        current_user_role,
        txid_current()::TEXT,
        NOW()
    );
    
    -- Return appropriate value based on operation
    RETURN COALESCE(NEW, OLD);
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but don't fail the original operation
        RAISE WARNING 'Audit logging failed for table %: %', TG_TABLE_NAME, SQLERRM;
        RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION audit_trigger_function() IS 'Automatically logs all INSERT/UPDATE/DELETE operations with full context';

-- =============================================================================
-- APPLY AUDIT TRIGGERS TO ALL TABLES
-- =============================================================================

-- Users
CREATE TRIGGER audit_users_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Vendors
CREATE TRIGGER audit_vendors_trigger
    AFTER INSERT OR UPDATE OR DELETE ON vendors
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Inventory Items
CREATE TRIGGER audit_inventory_items_trigger
    AFTER INSERT OR UPDATE OR DELETE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Artwork Folders
CREATE TRIGGER audit_artwork_folders_trigger
    AFTER INSERT OR UPDATE OR DELETE ON artwork_folders
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- BOMs
CREATE TRIGGER audit_boms_trigger
    AFTER INSERT OR UPDATE OR DELETE ON boms
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Purchase Orders
CREATE TRIGGER audit_purchase_orders_trigger
    AFTER INSERT OR UPDATE OR DELETE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Requisitions
CREATE TRIGGER audit_requisitions_trigger
    AFTER INSERT OR UPDATE OR DELETE ON requisitions
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Build Orders
CREATE TRIGGER audit_build_orders_trigger
    AFTER INSERT OR UPDATE OR DELETE ON build_orders
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- =============================================================================
-- RLS POLICIES FOR AUDIT LOGS
-- =============================================================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only Admins can view audit logs
CREATE POLICY "Admins can view audit logs"
    ON audit_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'Admin'
        )
    );

-- No one can modify audit logs (insert is handled by trigger)
-- This ensures audit trail integrity

GRANT SELECT ON audit_logs TO authenticated;

-- =============================================================================
-- HELPER FUNCTIONS FOR AUDIT QUERIES
-- =============================================================================

-- Function to get audit history for a specific record
CREATE OR REPLACE FUNCTION get_audit_history(
    p_table_name TEXT,
    p_record_id UUID
)
RETURNS TABLE(
    timestamp TIMESTAMP WITH TIME ZONE,
    action TEXT,
    changed_by TEXT,
    changed_fields TEXT[],
    old_values JSONB,
    new_values JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        al.timestamp,
        al.action,
        COALESCE(al.user_email, 'System') as changed_by,
        al.changed_fields,
        al.old_values,
        al.new_values
    FROM audit_logs al
    WHERE al.table_name = p_table_name
    AND al.record_id = p_record_id
    ORDER BY al.timestamp DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_audit_history IS 'Retrieve complete audit history for a specific record';

-- Function to get recent changes by a user
CREATE OR REPLACE FUNCTION get_user_activity(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
    timestamp TIMESTAMP WITH TIME ZONE,
    table_name TEXT,
    action TEXT,
    record_id UUID,
    changed_fields TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        al.timestamp,
        al.table_name,
        al.action,
        al.record_id,
        al.changed_fields
    FROM audit_logs al
    WHERE al.user_id = p_user_id
    ORDER BY al.timestamp DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_activity IS 'Retrieve recent activity for a specific user';

-- =============================================================================
-- AUDIT LOG CLEANUP FUNCTION (for old entries)
-- =============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(days_to_keep INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit_logs
    WHERE timestamp < NOW() - MAKE_INTERVAL(days => days_to_keep);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_old_audit_logs IS 'Delete audit logs older than specified days (default 365)';
