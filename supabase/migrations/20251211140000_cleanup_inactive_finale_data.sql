-- =============================================
-- CLEANUP MIGRATION: REMOVE INACTIVE AND DROPSHIPPED ITEMS
-- =============================================
BEGIN;
-- 1. CLEANUP BOMS FIRST (Referential Integrity)
-- Remove BOMs that are explicitly inactive
DELETE FROM finale_boms
WHERE status IS NOT NULL
    AND LOWER(status) != 'active';
-- Remove BOMs that belong to parents we are about to delete (Inactive/Dropshipped)
-- We check the parent product's status and raw_data
DELETE FROM finale_boms
WHERE parent_product_id IN (
        SELECT id
        FROM finale_products
        WHERE (
                status IS NOT NULL
                AND LOWER(status) != 'active'
            )
            OR (raw_data->>'Dropshipped' ILIKE 'yes')
            OR (raw_data->>'dropshipped' ILIKE 'yes')
            OR (raw_data->>'Drop Ship' ILIKE 'yes')
            OR (raw_data->>'DropShip' ILIKE 'yes')
            OR (raw_data->>'custom_dropshipped' ILIKE 'yes')
    );
-- 2. CLEANUP PRODUCTS
-- Remove products that are inactive or dropshipped
DELETE FROM finale_products
WHERE (
        status IS NOT NULL
        AND LOWER(status) != 'active'
    )
    OR (raw_data->>'Dropshipped' ILIKE 'yes')
    OR (raw_data->>'dropshipped' ILIKE 'yes')
    OR (raw_data->>'Drop Ship' ILIKE 'yes')
    OR (raw_data->>'DropShip' ILIKE 'yes')
    OR (raw_data->>'custom_dropshipped' ILIKE 'yes');
-- 3. VERIFICATION (Optional - Log counts if possible, or just commit)
-- We can't easily log in standard SQL script without DO block raising notices
DO $$
DECLARE deleted_boms INTEGER;
deleted_products INTEGER;
BEGIN -- Just a placeholder for notice, actual delete happened above.
-- To get counts we would need to do DELETE ... RETURNING or GET DIAGNOSTICS in the block.
-- But standard simple delete is fine.
RAISE NOTICE 'Cleanup complete. Inactive and Dropshipped items removed.';
END $$;
COMMIT;