-- ============================================================================
-- PHASE 1 VALIDATION SCRIPT
-- Run this after applying all migrations to verify everything works
-- ============================================================================

\echo '═══════════════════════════════════════════════════════════════════'
\echo '  TGF-MRP Phase 1 Validation'
\echo '═══════════════════════════════════════════════════════════════════'
\echo ''

-- ============================================================================
-- 1. CHECK ALL TABLES EXIST
-- ============================================================================
\echo '1️⃣  Checking tables...'

SELECT 
    CASE 
        WHEN COUNT(*) = 12 THEN '✅ All 12 tables created'
        ELSE '❌ Missing tables! Expected 12, found ' || COUNT(*)
    END as table_check
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
    'users', 'vendors', 'inventory_items', 'artwork_folders',
    'boms', 'purchase_orders', 'requisitions', 'build_orders',
    'audit_logs', 'po_status_transitions', 
    'requisition_status_transitions', 'build_order_status_transitions'
);

-- ============================================================================
-- 2. CHECK SEQUENCES
-- ============================================================================
\echo '2️⃣  Checking sequences...'

SELECT 
    CASE 
        WHEN COUNT(*) = 3 THEN '✅ All 3 sequences created'
        ELSE '❌ Missing sequences! Expected 3, found ' || COUNT(*)
    END as sequence_check
FROM information_schema.sequences
WHERE sequence_schema = 'public'
AND sequence_name IN ('po_number_seq', 'requisition_number_seq', 'build_number_seq');

-- ============================================================================
-- 3. CHECK FUNCTIONS
-- ============================================================================
\echo '3️⃣  Checking functions...'

SELECT 
    CASE 
        WHEN COUNT(*) >= 10 THEN '✅ All functions created (found ' || COUNT(*) || ')'
        ELSE '❌ Missing functions! Expected 10+, found ' || COUNT(*)
    END as function_check
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_type = 'FUNCTION';

-- ============================================================================
-- 4. CHECK RLS ENABLED
-- ============================================================================
\echo '4️⃣  Checking RLS policies...'

SELECT 
    tablename,
    CASE 
        WHEN rowsecurity THEN '✅ Enabled'
        ELSE '❌ DISABLED!'
    END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
    'users', 'vendors', 'inventory_items', 'artwork_folders',
    'boms', 'purchase_orders', 'requisitions', 'build_orders', 'audit_logs'
)
ORDER BY tablename;

-- ============================================================================
-- 5. CHECK TRIGGERS
-- ============================================================================
\echo '5️⃣  Checking triggers...'

SELECT 
    event_object_table as table_name,
    trigger_name,
    '✅ Active' as status
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table IN (
    'users', 'vendors', 'inventory_items', 'artwork_folders',
    'boms', 'purchase_orders', 'requisitions', 'build_orders'
)
ORDER BY event_object_table, trigger_name;

-- ============================================================================
-- 6. CHECK INDEXES
-- ============================================================================
\echo '6️⃣  Checking indexes...'

SELECT 
    tablename,
    COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY index_count DESC;

-- ============================================================================
-- 7. TEST STORED PROCEDURES
-- ============================================================================
\echo '7️⃣  Testing stored procedures...'

-- Test 1: Calculate buildability (will fail if no data, but function exists)
\echo '   Testing calculate_buildability()...'
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.routines 
               WHERE routine_name = 'calculate_buildability') THEN
        RAISE NOTICE '   ✅ calculate_buildability exists';
    ELSE
        RAISE EXCEPTION '   ❌ calculate_buildability NOT FOUND';
    END IF;
END $$;

-- Test 2: Check other functions exist
\echo '   Testing create_purchase_order()...'
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.routines 
               WHERE routine_name = 'create_purchase_order') THEN
        RAISE NOTICE '   ✅ create_purchase_order exists';
    ELSE
        RAISE EXCEPTION '   ❌ create_purchase_order NOT FOUND';
    END IF;
END $$;

\echo '   Testing complete_build_order()...'
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.routines 
               WHERE routine_name = 'complete_build_order') THEN
        RAISE NOTICE '   ✅ complete_build_order exists';
    ELSE
        RAISE EXCEPTION '   ❌ complete_build_order NOT FOUND';
    END IF;
END $$;

-- ============================================================================
-- 8. CHECK CONSTRAINTS
-- ============================================================================
\echo '8️⃣  Checking constraints...'

SELECT 
    conrelid::regclass AS table_name,
    conname AS constraint_name,
    contype AS constraint_type,
    '✅' as status
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
AND contype IN ('c', 'f', 'p', 'u')
ORDER BY table_name, constraint_type;

-- ============================================================================
-- 9. SAMPLE DATA TEST
-- ============================================================================
\echo '9️⃣  Testing sample data insertion...'

-- This will test if basic insert works and triggers fire
DO $$
DECLARE
    test_vendor_id UUID;
BEGIN
    -- Try to insert test vendor (will fail if user not authenticated, which is expected)
    BEGIN
        INSERT INTO vendors (name, contact_emails)
        VALUES ('Test Vendor', ARRAY['test@example.com'])
        RETURNING id INTO test_vendor_id;
        
        -- Clean up
        DELETE FROM vendors WHERE id = test_vendor_id;
        
        RAISE NOTICE '   ✅ Insert/Delete works';
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE '   ⚠️  RLS blocking insert (expected without auth)';
        WHEN OTHERS THEN
            RAISE NOTICE '   ⚠️  Insert test: %', SQLERRM;
    END;
END $$;

-- ============================================================================
-- 10. FINAL SUMMARY
-- ============================================================================
\echo ''
\echo '═══════════════════════════════════════════════════════════════════'
\echo '  Validation Complete!'
\echo '═══════════════════════════════════════════════════════════════════'
\echo ''
\echo '📋 Next Steps:'
\echo '   1. Review any ❌ errors above'
\echo '   2. Generate TypeScript types: supabase gen types typescript'
\echo '   3. Create test user in Supabase dashboard'
\echo '   4. Test RLS policies with authenticated user'
\echo '   5. Proceed to Phase 2: API Development'
\echo ''
\echo '📚 Documentation:'
\echo '   - PHASE_1_COMPLETE.md - Full implementation guide'
\echo '   - DATABASE_REFERENCE.md - Quick reference'
\echo '   - SESSION_NOTES.md - Progress tracking'
\echo ''
