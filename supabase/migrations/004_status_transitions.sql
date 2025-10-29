-- Migration: 004_status_transitions.sql
-- Description: Enforce valid status transitions for workflow integrity
-- Created: 2025-10-28

-- =============================================================================
-- STATUS TRANSITION TABLES
-- =============================================================================

-- Purchase Order Status Transitions
CREATE TABLE po_status_transitions (
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    requires_role TEXT, -- NULL means any role can perform this transition
    PRIMARY KEY (from_status, to_status)
);

INSERT INTO po_status_transitions (from_status, to_status, requires_role) VALUES
    ('Pending', 'Submitted', NULL),
    ('Pending', 'Cancelled', NULL),
    ('Submitted', 'Fulfilled', 'Admin'),
    ('Submitted', 'Cancelled', 'Admin');

COMMENT ON TABLE po_status_transitions IS 'Defines valid status transitions for purchase orders';

-- Requisition Status Transitions
CREATE TABLE requisition_status_transitions (
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    requires_role TEXT,
    PRIMARY KEY (from_status, to_status)
);

INSERT INTO requisition_status_transitions (from_status, to_status, requires_role) VALUES
    ('Pending', 'Approved', 'Manager'),
    ('Pending', 'Rejected', 'Manager'),
    ('Approved', 'Processed', NULL),
    ('Approved', 'Cancelled', 'Admin');

COMMENT ON TABLE requisition_status_transitions IS 'Defines valid status transitions for requisitions';

-- Build Order Status Transitions
CREATE TABLE build_order_status_transitions (
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    requires_role TEXT,
    PRIMARY KEY (from_status, to_status)
);

INSERT INTO build_order_status_transitions (from_status, to_status, requires_role) VALUES
    ('Planned', 'In Progress', NULL),
    ('Planned', 'Cancelled', 'Manager'),
    ('In Progress', 'Completed', NULL),
    ('In Progress', 'Cancelled', 'Manager');

COMMENT ON TABLE build_order_status_transitions IS 'Defines valid status transitions for build orders';

-- =============================================================================
-- VALIDATION FUNCTIONS
-- =============================================================================

-- Validate Purchase Order Status Transition
CREATE OR REPLACE FUNCTION validate_po_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    v_user_role TEXT;
    v_required_role TEXT;
BEGIN
    -- Only validate if status is actually changing
    IF OLD.status IS NOT NULL AND NEW.status != OLD.status THEN
        
        -- Get current user role
        SELECT role INTO v_user_role FROM users WHERE id = auth.uid();
        
        -- Check if transition is valid
        SELECT requires_role INTO v_required_role
        FROM po_status_transitions
        WHERE from_status = OLD.status AND to_status = NEW.status;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid purchase order status transition from % to %', OLD.status, NEW.status;
        END IF;
        
        -- Check role requirement if specified
        IF v_required_role IS NOT NULL AND v_user_role != v_required_role AND v_user_role != 'Admin' THEN
            RAISE EXCEPTION 'Insufficient permissions: % role required to transition from % to %', 
                v_required_role, OLD.status, NEW.status;
        END IF;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Validate Requisition Status Transition
CREATE OR REPLACE FUNCTION validate_requisition_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    v_user_role TEXT;
    v_required_role TEXT;
BEGIN
    IF OLD.status IS NOT NULL AND NEW.status != OLD.status THEN
        
        SELECT role INTO v_user_role FROM users WHERE id = auth.uid();
        
        SELECT requires_role INTO v_required_role
        FROM requisition_status_transitions
        WHERE from_status = OLD.status AND to_status = NEW.status;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid requisition status transition from % to %', OLD.status, NEW.status;
        END IF;
        
        IF v_required_role IS NOT NULL AND v_user_role != v_required_role AND v_user_role != 'Admin' THEN
            RAISE EXCEPTION 'Insufficient permissions: % role required to transition from % to %', 
                v_required_role, OLD.status, NEW.status;
        END IF;
        
        -- Auto-populate approval fields when approving
        IF NEW.status = 'Approved' THEN
            NEW.approved_by = auth.uid();
            NEW.approved_at = NOW();
        END IF;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Validate Build Order Status Transition
CREATE OR REPLACE FUNCTION validate_build_order_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    v_user_role TEXT;
    v_required_role TEXT;
BEGIN
    IF OLD.status IS NOT NULL AND NEW.status != OLD.status THEN
        
        SELECT role INTO v_user_role FROM users WHERE id = auth.uid();
        
        SELECT requires_role INTO v_required_role
        FROM build_order_status_transitions
        WHERE from_status = OLD.status AND to_status = NEW.status;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid build order status transition from % to %', OLD.status, NEW.status;
        END IF;
        
        IF v_required_role IS NOT NULL AND v_user_role != v_required_role AND v_user_role != 'Admin' THEN
            RAISE EXCEPTION 'Insufficient permissions: % role required to transition from % to %', 
                v_required_role, OLD.status, NEW.status;
        END IF;
        
        -- Auto-populate timestamps
        IF NEW.status = 'In Progress' AND OLD.status = 'Planned' THEN
            NEW.started_at = NOW();
        END IF;
        
        IF NEW.status = 'Completed' AND OLD.status = 'In Progress' THEN
            NEW.completed_at = NOW();
        END IF;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- APPLY VALIDATION TRIGGERS
-- =============================================================================

CREATE TRIGGER enforce_po_status_transition
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION validate_po_status_transition();

CREATE TRIGGER enforce_requisition_status_transition
    BEFORE UPDATE ON requisitions
    FOR EACH ROW
    EXECUTE FUNCTION validate_requisition_status_transition();

CREATE TRIGGER enforce_build_order_status_transition
    BEFORE UPDATE ON build_orders
    FOR EACH ROW
    EXECUTE FUNCTION validate_build_order_status_transition();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Get valid next statuses for a given entity
CREATE OR REPLACE FUNCTION get_valid_next_statuses(
    p_table_type TEXT,
    p_current_status TEXT
)
RETURNS TABLE(to_status TEXT, requires_role TEXT) AS $$
BEGIN
    IF p_table_type = 'purchase_order' THEN
        RETURN QUERY
        SELECT pst.to_status, pst.requires_role
        FROM po_status_transitions pst
        WHERE pst.from_status = p_current_status;
        
    ELSIF p_table_type = 'requisition' THEN
        RETURN QUERY
        SELECT rst.to_status, rst.requires_role
        FROM requisition_status_transitions rst
        WHERE rst.from_status = p_current_status;
        
    ELSIF p_table_type = 'build_order' THEN
        RETURN QUERY
        SELECT bst.to_status, bst.requires_role
        FROM build_order_status_transitions bst
        WHERE bst.from_status = p_current_status;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_valid_next_statuses IS 'Get all valid status transitions from current state';
