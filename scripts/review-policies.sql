-- ============================================================================
-- REVIEW CURRENT RLS POLICIES
-- ============================================================================
-- Run this in Supabase SQL Editor to see all current policies
-- ============================================================================

-- View all RLS policies with their details
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check which tables have RLS enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check if users table exists and has role column
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'users'
ORDER BY ordinal_position;

-- Check existing users and their roles
SELECT id, email, name, role, department, created_at
FROM users
ORDER BY created_at;
