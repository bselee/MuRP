-- Migration: 005_stored_procedures.sql
-- Description: Complex business logic stored procedures with transaction safety
-- Created: 2025-10-28

-- =============================================================================
-- CREATE PURCHASE ORDER
-- =============================================================================

CREATE OR REPLACE FUNCTION create_purchase_order(
    p_vendor_id UUID,
    p_items JSONB,
    p_requisition_ids UUID[] DEFAULT NULL,
    p_expected_delivery_date DATE DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_po_id UUID;
    v_po_number TEXT;
    v_subtotal NUMERIC(12, 2) := 0;
    v_tax_amount NUMERIC(12, 2) := 0;
    v_total_amount NUMERIC(12, 2) := 0;
    v_item JSONB;
    v_inventory_item RECORD;
    v_result JSONB;
    v_user_id UUID;
BEGIN
    -- Get current user
    v_user_id := auth.uid();
    
    -- Validate vendor exists
    IF NOT EXISTS (SELECT 1 FROM vendors WHERE id = p_vendor_id AND is_deleted = FALSE) THEN
        RAISE EXCEPTION 'Vendor not found: %', p_vendor_id;
    END IF;
    
    -- Generate PO number
    v_po_number := 'PO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
                   LPAD(NEXTVAL('po_number_seq')::TEXT, 6, '0');
    
    -- Process each item and calculate totals
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Validate inventory item exists
        SELECT * INTO v_inventory_item
        FROM inventory_items
        WHERE sku = (v_item->>'sku')
        AND is_deleted = FALSE;
        
        IF v_inventory_item IS NULL THEN
            RAISE EXCEPTION 'Inventory item not found: %', v_item->>'sku';
        END IF;
        
        -- Validate quantity
        IF (v_item->>'quantity')::INTEGER <= 0 THEN
            RAISE EXCEPTION 'Invalid quantity for item %', v_item->>'sku';
        END IF;
        
        -- Calculate line total
        v_subtotal := v_subtotal + (
            (v_item->>'quantity')::INTEGER * (v_item->>'price')::NUMERIC(12, 2)
        );
    END LOOP;
    
    -- Calculate tax (example: 8%)
    v_tax_amount := ROUND(v_subtotal * 0.08, 2);
    v_total_amount := v_subtotal + v_tax_amount;
    
    -- Create the purchase order
    INSERT INTO purchase_orders (
        po_number,
        vendor_id,
        items,
        subtotal,
        tax_amount,
        total_amount,
        requisition_ids,
        expected_delivery_date,
        notes,
        status,
        created_by,
        updated_by
    ) VALUES (
        v_po_number,
        p_vendor_id,
        p_items,
        v_subtotal,
        v_tax_amount,
        v_total_amount,
        COALESCE(p_requisition_ids, '{}'),
        p_expected_delivery_date,
        p_notes,
        'Pending',
        v_user_id,
        v_user_id
    )
    RETURNING id INTO v_po_id;
    
    -- Update on_order quantities for each item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        UPDATE inventory_items
        SET on_order = on_order + (v_item->>'quantity')::INTEGER,
            updated_at = NOW(),
            updated_by = v_user_id
        WHERE sku = (v_item->>'sku');
    END LOOP;
    
    -- Mark requisitions as processed if provided
    IF p_requisition_ids IS NOT NULL AND array_length(p_requisition_ids, 1) > 0 THEN
        UPDATE requisitions
        SET status = 'Processed',
            po_id = v_po_id,
            updated_at = NOW(),
            updated_by = v_user_id
        WHERE id = ANY(p_requisition_ids);
    END IF;
    
    -- Return PO details
    SELECT jsonb_build_object(
        'id', po.id,
        'po_number', po.po_number,
        'vendor_id', po.vendor_id,
        'total_amount', po.total_amount,
        'status', po.status,
        'created_at', po.created_at
    ) INTO v_result
    FROM purchase_orders po
    WHERE po.id = v_po_id;
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Purchase order creation failed: %', SQLERRM;
        RAISE;
END;
$$;

COMMENT ON FUNCTION create_purchase_order IS 'Create PO with automatic inventory.on_order updates and requisition processing';

-- =============================================================================
-- COMPLETE BUILD ORDER
-- =============================================================================

CREATE OR REPLACE FUNCTION complete_build_order(
    p_build_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_build_order RECORD;
    v_bom RECORD;
    v_component JSONB;
    v_inventory_item RECORD;
    v_user_id UUID;
    v_result JSONB;
BEGIN
    -- Get current user
    v_user_id := auth.uid();
    
    -- Get build order with row lock
    SELECT * INTO v_build_order
    FROM build_orders
    WHERE id = p_build_order_id
    AND is_deleted = FALSE
    FOR UPDATE;
    
    IF v_build_order IS NULL THEN
        RAISE EXCEPTION 'Build order not found: %', p_build_order_id;
    END IF;
    
    -- Validate status
    IF v_build_order.status != 'In Progress' THEN
        RAISE EXCEPTION 'Build order must be In Progress to complete. Current status: %', v_build_order.status;
    END IF;
    
    -- Get BOM
    SELECT * INTO v_bom
    FROM boms
    WHERE id = v_build_order.bom_id
    AND is_deleted = FALSE;
    
    IF v_bom IS NULL THEN
        RAISE EXCEPTION 'BOM not found: %', v_build_order.bom_id;
    END IF;
    
    -- Validate and decrement component inventory
    FOR v_component IN SELECT * FROM jsonb_array_elements(v_bom.components)
    LOOP
        -- Get inventory item with row lock
        SELECT * INTO v_inventory_item
        FROM inventory_items
        WHERE sku = (v_component->>'sku')
        AND is_deleted = FALSE
        FOR UPDATE;
        
        IF v_inventory_item IS NULL THEN
            RAISE EXCEPTION 'Component not found: %', v_component->>'sku';
        END IF;
        
        -- Check sufficient stock
        DECLARE
            v_required_qty INTEGER;
        BEGIN
            v_required_qty := (v_component->>'quantity')::INTEGER * v_build_order.quantity;
            
            IF v_inventory_item.stock < v_required_qty THEN
                RAISE EXCEPTION 'Insufficient stock for component %: available %, required %',
                    v_inventory_item.sku, v_inventory_item.stock, v_required_qty;
            END IF;
            
            -- Decrement component stock
            UPDATE inventory_items
            SET stock = stock - v_required_qty,
                updated_at = NOW(),
                updated_by = v_user_id
            WHERE sku = v_inventory_item.sku;
        END;
    END LOOP;
    
    -- Increment finished goods stock
    UPDATE inventory_items
    SET stock = stock + v_build_order.quantity,
        updated_at = NOW(),
        updated_by = v_user_id
    WHERE sku = v_build_order.finished_sku;
    
    -- Update build order status
    UPDATE build_orders
    SET status = 'Completed',
        completed_at = NOW(),
        updated_at = NOW(),
        updated_by = v_user_id
    WHERE id = p_build_order_id;
    
    -- Return result
    SELECT jsonb_build_object(
        'id', bo.id,
        'build_number', bo.build_number,
        'finished_sku', bo.finished_sku,
        'quantity', bo.quantity,
        'status', 'Completed',
        'completed_at', NOW()
    ) INTO v_result
    FROM build_orders bo
    WHERE bo.id = p_build_order_id;
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Build order completion failed: %', SQLERRM;
        RAISE;
END;
$$;

COMMENT ON FUNCTION complete_build_order IS 'Complete build order with atomic inventory transactions';

-- =============================================================================
-- FULFILL PURCHASE ORDER
-- =============================================================================

CREATE OR REPLACE FUNCTION fulfill_purchase_order(
    p_po_id UUID,
    p_actual_delivery_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_po RECORD;
    v_item JSONB;
    v_user_id UUID;
    v_result JSONB;
BEGIN
    -- Get current user
    v_user_id := auth.uid();
    
    -- Get PO with row lock
    SELECT * INTO v_po
    FROM purchase_orders
    WHERE id = p_po_id
    AND is_deleted = FALSE
    FOR UPDATE;
    
    IF v_po IS NULL THEN
        RAISE EXCEPTION 'Purchase order not found: %', p_po_id;
    END IF;
    
    -- Validate status
    IF v_po.status != 'Submitted' THEN
        RAISE EXCEPTION 'PO must be in Submitted status to fulfill. Current status: %', v_po.status;
    END IF;
    
    -- Process each item
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_po.items)
    LOOP
        -- Increment stock and decrement on_order
        UPDATE inventory_items
        SET stock = stock + (v_item->>'quantity')::INTEGER,
            on_order = on_order - (v_item->>'quantity')::INTEGER,
            updated_at = NOW(),
            updated_by = v_user_id
        WHERE sku = (v_item->>'sku');
        
        -- Ensure on_order doesn't go negative
        UPDATE inventory_items
        SET on_order = GREATEST(on_order, 0)
        WHERE sku = (v_item->>'sku');
    END LOOP;
    
    -- Update PO status
    UPDATE purchase_orders
    SET status = 'Fulfilled',
        actual_delivery_date = p_actual_delivery_date,
        updated_at = NOW(),
        updated_by = v_user_id
    WHERE id = p_po_id;
    
    -- Return result
    SELECT jsonb_build_object(
        'id', po.id,
        'po_number', po.po_number,
        'status', 'Fulfilled',
        'actual_delivery_date', p_actual_delivery_date
    ) INTO v_result
    FROM purchase_orders po
    WHERE po.id = p_po_id;
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'PO fulfillment failed: %', SQLERRM;
        RAISE;
END;
$$;

COMMENT ON FUNCTION fulfill_purchase_order IS 'Fulfill PO with automatic inventory stock updates';

-- =============================================================================
-- CALCULATE BUILDABILITY
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_buildability(
    p_finished_sku TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bom RECORD;
    v_component JSONB;
    v_inventory_item RECORD;
    v_max_buildable INTEGER := 999999;
    v_component_buildable INTEGER;
    v_components_status JSONB := '[]'::jsonb;
    v_result JSONB;
BEGIN
    -- Get BOM
    SELECT * INTO v_bom
    FROM boms
    WHERE finished_sku = p_finished_sku
    AND is_deleted = FALSE;
    
    IF v_bom IS NULL THEN
        RAISE EXCEPTION 'BOM not found for SKU: %', p_finished_sku;
    END IF;
    
    -- Check each component
    FOR v_component IN SELECT * FROM jsonb_array_elements(v_bom.components)
    LOOP
        SELECT * INTO v_inventory_item
        FROM inventory_items
        WHERE sku = (v_component->>'sku')
        AND is_deleted = FALSE;
        
        IF v_inventory_item IS NULL THEN
            v_component_buildable := 0;
        ELSE
            v_component_buildable := FLOOR(
                v_inventory_item.stock::NUMERIC / (v_component->>'quantity')::INTEGER
            );
        END IF;
        
        -- Track minimum
        v_max_buildable := LEAST(v_max_buildable, v_component_buildable);
        
        -- Build component status
        v_components_status := v_components_status || jsonb_build_object(
            'sku', v_component->>'sku',
            'required_per_unit', (v_component->>'quantity')::INTEGER,
            'available', COALESCE(v_inventory_item.stock, 0),
            'can_build', v_component_buildable
        );
    END LOOP;
    
    -- Build final result
    v_result := jsonb_build_object(
        'finished_sku', p_finished_sku,
        'max_buildable', v_max_buildable,
        'components', v_components_status,
        'calculated_at', NOW()
    );
    
    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION calculate_buildability IS 'Calculate how many units can be built based on component availability';

-- =============================================================================
-- GENERATE PO FROM REQUISITIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_po_from_requisitions(
    p_vendor_id UUID,
    p_requisition_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_aggregated_items JSONB := '[]'::jsonb;
    v_requisition RECORD;
    v_item JSONB;
    v_result JSONB;
BEGIN
    -- Validate all requisitions are approved
    IF EXISTS (
        SELECT 1 FROM requisitions
        WHERE id = ANY(p_requisition_ids)
        AND status != 'Approved'
    ) THEN
        RAISE EXCEPTION 'All requisitions must be in Approved status';
    END IF;
    
    -- Aggregate items from all requisitions
    FOR v_requisition IN 
        SELECT * FROM requisitions
        WHERE id = ANY(p_requisition_ids)
        AND is_deleted = FALSE
    LOOP
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_requisition.items)
        LOOP
            -- Add or aggregate item quantities
            -- This is a simplified version - in production you'd want to merge duplicate SKUs
            v_aggregated_items := v_aggregated_items || v_item;
        END LOOP;
    END LOOP;
    
    -- Create PO using aggregated items
    v_result := create_purchase_order(
        p_vendor_id,
        v_aggregated_items,
        p_requisition_ids,
        NULL,
        'Auto-generated from requisitions'
    );
    
    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION generate_po_from_requisitions IS 'Generate PO by aggregating approved requisitions';
