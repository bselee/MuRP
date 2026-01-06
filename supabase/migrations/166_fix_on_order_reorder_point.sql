-- Migration 166: Fix On Order and Reorder Point Data
--
-- Problem:
--   1. on_order column in inventory_items shows 0 when there are open POs
--   2. reorder_point column is often 0/NULL, making stock status misleading
--
-- Solution:
--   1. Create a view that calculates on_order from both internal and Finale POs
--   2. Create a function to sync on_order to inventory_items
--   3. Update reorder_point from sku_purchasing_parameters or calculate defaults
--   4. Run initial sync
-- ============================================================================

-- ============================================================================
-- 1. VIEW: Calculate On-Order from All PO Sources
-- ============================================================================

CREATE OR REPLACE VIEW inventory_on_order_summary AS
WITH internal_po_on_order AS (
    -- Sum from internal purchase_order_items
    SELECT
        poi.inventory_sku AS sku,
        COALESCE(SUM(poi.quantity_ordered - COALESCE(poi.quantity_received, 0)), 0) AS qty_on_order,
        COUNT(DISTINCT po.id) AS po_count,
        MIN(po.expected_date) AS earliest_eta
    FROM purchase_order_items poi
    JOIN purchase_orders po ON poi.po_id = po.id
    WHERE po.status IN ('draft', 'sent', 'pending', 'submitted', 'partial', 'partially_received')
      AND (poi.quantity_ordered - COALESCE(poi.quantity_received, 0)) > 0
    GROUP BY poi.inventory_sku
),
finale_po_on_order AS (
    -- Sum from Finale PO line items - join through finale_products to get SKU
    SELECT
        COALESCE(fp.sku, fp.product_id) AS sku,  -- Use sku from finale_products, fallback to product_id string
        COALESCE(SUM(fpli.quantity_ordered - COALESCE(fpli.quantity_received, 0)), 0) AS qty_on_order,
        COUNT(DISTINCT fpo.id) AS po_count,
        MIN(fpo.expected_date::timestamp) AS earliest_eta
    FROM finale_po_line_items fpli
    JOIN finale_purchase_orders fpo ON fpli.po_id = fpo.id
    LEFT JOIN finale_products fp ON fpli.product_id = fp.id
    WHERE fpo.status NOT IN ('RECEIVED', 'CANCELLED', 'COMPLETED', 'received', 'cancelled')
      AND (fpli.quantity_ordered - COALESCE(fpli.quantity_received, 0)) > 0
    GROUP BY COALESCE(fp.sku, fp.product_id)
)
SELECT
    COALESCE(ipo.sku, fpo.sku) AS sku,
    COALESCE(ipo.qty_on_order, 0) + COALESCE(fpo.qty_on_order, 0) AS total_on_order,
    COALESCE(ipo.po_count, 0) + COALESCE(fpo.po_count, 0) AS total_po_count,
    LEAST(ipo.earliest_eta, fpo.earliest_eta) AS earliest_eta
FROM internal_po_on_order ipo
FULL OUTER JOIN finale_po_on_order fpo ON ipo.sku = fpo.sku;

COMMENT ON VIEW inventory_on_order_summary IS
'Aggregates on-order quantities from both internal POs and Finale POs';

-- ============================================================================
-- 2. VIEW: Enhanced Inventory with Calculated ROP
-- ============================================================================

CREATE OR REPLACE VIEW inventory_with_purchasing_data AS
SELECT
    ii.sku,
    ii.name,
    ii.category,
    ii.stock,
    -- On Order: Use calculated value from POs
    COALESCE(oos.total_on_order, 0)::integer AS on_order,
    -- Reorder Point: Priority order
    --   1. sku_purchasing_parameters.calculated_reorder_point (most accurate)
    --   2. inventory_items.reorder_point (user-set)
    --   3. Calculated default: max(5, ceil(velocity * lead_time * 1.5))
    COALESCE(
        spp.calculated_reorder_point,
        NULLIF(ii.reorder_point, 0),
        GREATEST(5, CEIL(COALESCE(ii.sales_velocity, 0.5) * COALESCE(v.lead_time_days, 14) * 1.5))
    )::integer AS reorder_point,
    -- Safety Stock (from sku_purchasing_parameters or calculated)
    COALESCE(spp.calculated_safety_stock,
        GREATEST(3, CEIL(COALESCE(ii.sales_velocity, 0.5) * 7)))::integer AS safety_stock,
    ii.vendor_id,
    v.name AS vendor_name,
    ii.sales_velocity,
    COALESCE(v.lead_time_days, 14) AS lead_time_days,
    ii.status,
    ii.is_dropship,
    -- Open PO info
    oos.total_po_count AS open_po_count,
    oos.earliest_eta AS next_po_eta
FROM inventory_items ii
LEFT JOIN vendors v ON ii.vendor_id = v.id
LEFT JOIN inventory_on_order_summary oos ON ii.sku = oos.sku
LEFT JOIN sku_purchasing_parameters spp ON ii.sku = spp.sku
WHERE ii.status = 'active' OR ii.status IS NULL;

COMMENT ON VIEW inventory_with_purchasing_data IS
'Inventory items with calculated on_order from POs and calculated reorder points';

-- ============================================================================
-- 3. FUNCTION: Sync On-Order and Reorder Point to inventory_items
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_inventory_purchasing_data()
RETURNS TABLE (
    skus_updated INTEGER,
    on_order_updates INTEGER,
    reorder_point_updates INTEGER
) AS $$
DECLARE
    v_on_order_count INTEGER := 0;
    v_rop_count INTEGER := 0;
    v_total INTEGER := 0;
BEGIN
    -- Update on_order from PO data
    WITH po_data AS (
        SELECT sku, total_on_order FROM inventory_on_order_summary
    )
    UPDATE inventory_items ii
    SET on_order = COALESCE(pd.total_on_order, 0)::integer,
        updated_at = NOW()
    FROM po_data pd
    WHERE ii.sku = pd.sku
      AND COALESCE(ii.on_order, 0) != COALESCE(pd.total_on_order, 0);

    GET DIAGNOSTICS v_on_order_count = ROW_COUNT;

    -- Also set on_order to 0 for items not in the summary (no open POs)
    UPDATE inventory_items ii
    SET on_order = 0,
        updated_at = NOW()
    WHERE ii.on_order > 0
      AND NOT EXISTS (
          SELECT 1 FROM inventory_on_order_summary oos WHERE oos.sku = ii.sku
      );

    v_on_order_count := v_on_order_count + (SELECT COALESCE(COUNT(*), 0) FROM inventory_items WHERE on_order = 0);

    -- Update reorder_point where it's 0 or NULL, using sku_purchasing_parameters or calculated default
    UPDATE inventory_items ii
    SET reorder_point = COALESCE(
            spp.calculated_reorder_point,
            GREATEST(5, CEIL(COALESCE(ii.sales_velocity, 0.5) * COALESCE(v.lead_time_days, 14) * 1.5))
        )::integer,
        updated_at = NOW()
    FROM (SELECT sku, calculated_reorder_point FROM sku_purchasing_parameters) spp
    LEFT JOIN vendors v ON ii.vendor_id = v.id
    WHERE ii.sku = spp.sku
      AND (ii.reorder_point IS NULL OR ii.reorder_point = 0)
      AND ii.status = 'active';

    GET DIAGNOSTICS v_rop_count = ROW_COUNT;

    -- Set default ROP for items without sku_purchasing_parameters entry
    UPDATE inventory_items ii
    SET reorder_point = GREATEST(5, CEIL(COALESCE(ii.sales_velocity, 0.5) * COALESCE(v.lead_time_days, 14) * 1.5))::integer,
        updated_at = NOW()
    FROM vendors v
    WHERE ii.vendor_id = v.id
      AND (ii.reorder_point IS NULL OR ii.reorder_point = 0)
      AND ii.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM sku_purchasing_parameters spp WHERE spp.sku = ii.sku);

    v_rop_count := v_rop_count + (SELECT COUNT(*) FROM inventory_items WHERE reorder_point > 0);

    v_total := v_on_order_count + v_rop_count;

    RETURN QUERY SELECT v_total, v_on_order_count, v_rop_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_inventory_purchasing_data() IS
'Syncs on_order from PO data and ensures reorder_point has sensible values';

-- ============================================================================
-- 4. TRIGGER: Auto-sync on_order when PO status changes
-- ============================================================================

CREATE OR REPLACE FUNCTION update_inventory_on_order_from_po()
RETURNS TRIGGER AS $$
DECLARE
    v_sku TEXT;
    v_new_on_order INTEGER;
BEGIN
    -- Determine which SKU was affected
    IF TG_TABLE_NAME = 'purchase_orders' THEN
        -- For PO header changes, update all items on that PO
        FOR v_sku IN
            SELECT DISTINCT inventory_sku FROM purchase_order_items WHERE po_id = COALESCE(NEW.id, OLD.id)
        LOOP
            SELECT COALESCE(total_on_order, 0)::integer INTO v_new_on_order
            FROM inventory_on_order_summary WHERE sku = v_sku;

            UPDATE inventory_items
            SET on_order = COALESCE(v_new_on_order, 0),
                updated_at = NOW()
            WHERE sku = v_sku;
        END LOOP;
    ELSIF TG_TABLE_NAME = 'purchase_order_items' THEN
        v_sku := COALESCE(NEW.inventory_sku, OLD.inventory_sku);

        SELECT COALESCE(total_on_order, 0)::integer INTO v_new_on_order
        FROM inventory_on_order_summary WHERE sku = v_sku;

        UPDATE inventory_items
        SET on_order = COALESCE(v_new_on_order, 0),
            updated_at = NOW()
        WHERE sku = v_sku;
    ELSIF TG_TABLE_NAME = 'finale_purchase_orders' THEN
        -- For Finale PO changes, update all items on that PO
        -- Join through finale_products to get actual SKU
        FOR v_sku IN
            SELECT DISTINCT COALESCE(fp.sku, fp.product_id)
            FROM finale_po_line_items fpli
            LEFT JOIN finale_products fp ON fpli.product_id = fp.id
            WHERE fpli.po_id = COALESCE(NEW.id, OLD.id)
        LOOP
            SELECT COALESCE(total_on_order, 0)::integer INTO v_new_on_order
            FROM inventory_on_order_summary WHERE sku = v_sku;

            UPDATE inventory_items
            SET on_order = COALESCE(v_new_on_order, 0),
                updated_at = NOW()
            WHERE sku = v_sku;
        END LOOP;
    ELSIF TG_TABLE_NAME = 'finale_po_line_items' THEN
        -- Get SKU from finale_products using the product_id UUID
        SELECT COALESCE(fp.sku, fp.product_id) INTO v_sku
        FROM finale_products fp
        WHERE fp.id = COALESCE(NEW.product_id, OLD.product_id);

        IF v_sku IS NOT NULL THEN
            SELECT COALESCE(total_on_order, 0)::integer INTO v_new_on_order
            FROM inventory_on_order_summary WHERE sku = v_sku;

            UPDATE inventory_items
            SET on_order = COALESCE(v_new_on_order, 0),
                updated_at = NOW()
            WHERE sku = v_sku;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trg_sync_on_order_po ON purchase_orders;
DROP TRIGGER IF EXISTS trg_sync_on_order_po_items ON purchase_order_items;
DROP TRIGGER IF EXISTS trg_sync_on_order_finale_po ON finale_purchase_orders;
DROP TRIGGER IF EXISTS trg_sync_on_order_finale_items ON finale_po_line_items;

-- Create triggers
CREATE TRIGGER trg_sync_on_order_po
    AFTER INSERT OR UPDATE OF status ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_on_order_from_po();

CREATE TRIGGER trg_sync_on_order_po_items
    AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_on_order_from_po();

CREATE TRIGGER trg_sync_on_order_finale_po
    AFTER INSERT OR UPDATE OF status ON finale_purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_on_order_from_po();

CREATE TRIGGER trg_sync_on_order_finale_items
    AFTER INSERT OR UPDATE OR DELETE ON finale_po_line_items
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_on_order_from_po();

-- ============================================================================
-- 5. INITIAL DATA SYNC
-- ============================================================================

-- Sync on_order from PO data
UPDATE inventory_items ii
SET on_order = COALESCE(oos.total_on_order, 0)::integer
FROM inventory_on_order_summary oos
WHERE ii.sku = oos.sku;

-- Set on_order to 0 for items with no open POs
UPDATE inventory_items
SET on_order = 0
WHERE on_order IS NULL OR (
    on_order > 0
    AND NOT EXISTS (
        SELECT 1 FROM inventory_on_order_summary oos WHERE oos.sku = inventory_items.sku
    )
);

-- Update reorder_point for items with calculated values in sku_purchasing_parameters
UPDATE inventory_items ii
SET reorder_point = spp.calculated_reorder_point::integer
FROM sku_purchasing_parameters spp
WHERE ii.sku = spp.sku
  AND spp.calculated_reorder_point IS NOT NULL
  AND spp.calculated_reorder_point > 0
  AND (ii.reorder_point IS NULL OR ii.reorder_point = 0);

-- Set default reorder_point for remaining active items without one
-- Formula: max(5, velocity * lead_time * 1.5)
UPDATE inventory_items ii
SET reorder_point = GREATEST(
    5,
    CEIL(COALESCE(ii.sales_velocity, 0.5) * COALESCE(v.lead_time_days, 14) * 1.5)
)::integer
FROM vendors v
WHERE ii.vendor_id = v.id
  AND ii.status = 'active'
  AND (ii.reorder_point IS NULL OR ii.reorder_point = 0);

-- Also set default ROP for items without a vendor (use 14 days default)
UPDATE inventory_items ii
SET reorder_point = GREATEST(
    5,
    CEIL(COALESCE(ii.sales_velocity, 0.5) * 14 * 1.5)
)::integer
WHERE ii.vendor_id IS NULL
  AND ii.status = 'active'
  AND (ii.reorder_point IS NULL OR ii.reorder_point = 0);

-- ============================================================================
-- 6. VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_with_on_order INTEGER;
    v_with_rop INTEGER;
    v_total_active INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_with_on_order
    FROM inventory_items WHERE on_order > 0;

    SELECT COUNT(*) INTO v_with_rop
    FROM inventory_items WHERE reorder_point > 0 AND status = 'active';

    SELECT COUNT(*) INTO v_total_active
    FROM inventory_items WHERE status = 'active';

    RAISE NOTICE '✅ Migration 166 complete:';
    RAISE NOTICE '   - Items with on_order > 0: %', v_with_on_order;
    RAISE NOTICE '   - Active items with reorder_point > 0: % / %', v_with_rop, v_total_active;
    RAISE NOTICE '   - Views created: inventory_on_order_summary, inventory_with_purchasing_data';
    RAISE NOTICE '   - Triggers active: auto-sync on_order on PO changes';
END $$;
