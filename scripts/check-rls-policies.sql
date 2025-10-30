-- Check RLS policies on users table
-- Run this in Supabase SQL Editor

-- 1. Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'users';

-- 2. List all policies on users table
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
WHERE schemaname = 'public' AND tablename = 'users';

-- 3. Quick test: Can authenticated user read their own profile?
-- (This simulates what happens after login)
SELECT * FROM public.users WHERE id = auth.uid() LIMIT 1;
