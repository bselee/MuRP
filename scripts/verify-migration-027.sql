-- Verification queries for Migration 027
-- Run these to confirm the migration was successful

-- ============================================================================
-- 1. CHECK TABLE EXISTENCE
-- ============================================================================

SELECT 
  'build_order_material_requirements' as table_name,
  CASE WHEN EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'build_order_material_requirements'
  ) THEN '✓ EXISTS' ELSE '✗ MISSING' END as status
UNION ALL
SELECT 
  'production_calendar_settings',
  CASE WHEN EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'production_calendar_settings'
  ) THEN '✓ EXISTS' ELSE '✗ MISSING' END
ORDER BY table_name;

-- ============================================================================
-- 2. CHECK BUILD_ORDERS COLUMNS ADDED
-- ============================================================================

SELECT 
  column_name,
  data_type,
  CASE WHEN is_nullable = 'YES' THEN 'nullable' ELSE 'not null' END as nullable
FROM information_schema.columns
WHERE table_name = 'build_orders'
  AND column_name IN (
    'scheduled_date',
    'due_date',
    'calendar_event_id',
    'notes',
    'estimated_duration_hours',
    'assigned_user_id'
  )
ORDER BY column_name;

-- ============================================================================
-- 3. CHECK FOREIGN KEY CONSTRAINTS
-- ============================================================================

SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('build_order_material_requirements', 'production_calendar_settings')
ORDER BY tc.table_name, tc.constraint_name;

-- ============================================================================
-- 4. CHECK RLS POLICIES
-- ============================================================================

SELECT 
  schemaname,
  tablename,
  policyname,
  cmd as command,
  CASE WHEN qual IS NOT NULL THEN 'has USING clause' ELSE 'no USING' END as using_clause,
  CASE WHEN with_check IS NOT NULL THEN 'has WITH CHECK clause' ELSE 'no WITH CHECK' END as with_check_clause
FROM pg_policies
WHERE tablename IN ('build_order_material_requirements', 'production_calendar_settings')
ORDER BY tablename, policyname;

-- ============================================================================
-- 5. CHECK INDEXES
-- ============================================================================

SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('build_orders', 'build_order_material_requirements', 'production_calendar_settings')
  AND schemaname = 'public'
ORDER BY tablename, indexname;

-- ============================================================================
-- 6. CHECK TRIGGERS
-- ============================================================================

SELECT
  event_object_table as table_name,
  trigger_name,
  event_manipulation as event,
  action_timing as timing
FROM information_schema.triggers
WHERE event_object_table IN ('build_orders', 'build_order_material_requirements')
  AND trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ============================================================================
-- 7. CHECK FUNCTIONS
-- ============================================================================

SELECT
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'calculate_material_requirements',
    'auto_populate_material_requirements',
    'update_material_requirements_timestamp'
  )
ORDER BY routine_name;

-- ============================================================================
-- 8. TEST DATA COUNT
-- ============================================================================

SELECT 
  (SELECT COUNT(*) FROM build_orders) as build_orders_count,
  (SELECT COUNT(*) FROM build_order_material_requirements) as material_requirements_count,
  (SELECT COUNT(*) FROM production_calendar_settings) as calendar_settings_count;

-- ============================================================================
-- SUMMARY
-- ============================================================================

SELECT 
  '✓ Migration 027 verification complete!' as status,
  NOW() as verified_at;
