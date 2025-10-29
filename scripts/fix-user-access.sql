-- ============================================================================
-- QUICK FIX: Ensure your user can access data
-- ============================================================================
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Step 1: Check if you exist in the users table
SELECT id, email, name, role, department
FROM users 
WHERE email = 'bill.selee@buildasoil.com';

-- Step 2: If you don't exist, create yourself as Admin
-- (Replace with your actual Supabase auth user ID if needed)
INSERT INTO users (id, email, name, role, department)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'name', 'Bill Selee'),
  'Admin',
  'Management'
FROM auth.users
WHERE email = 'bill.selee@buildasoil.com'
ON CONFLICT (id) DO UPDATE
SET role = 'Admin', department = 'Management';

-- Step 3: Also set the other test users
INSERT INTO users (id, email, name, role, department)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)),
  CASE 
    WHEN email LIKE '%admin%' THEN 'Admin'
    WHEN email LIKE '%production%' THEN 'Manager'
    ELSE 'Staff'
  END,
  CASE 
    WHEN email LIKE '%production%' THEN 'Production'
    ELSE 'General'
  END
FROM auth.users
WHERE email IN ('admin@tgfmrp.com', 'production@tgfmrp.com')
ON CONFLICT (id) DO UPDATE
SET 
  role = CASE 
    WHEN excluded.email LIKE '%admin%' THEN 'Admin'
    WHEN excluded.email LIKE '%production%' THEN 'Manager'
    ELSE 'Staff'
  END,
  department = CASE 
    WHEN excluded.email LIKE '%production%' THEN 'Production'
    ELSE 'General'
  END;

-- Step 4: Verify all users now have roles
SELECT id, email, name, role, department
FROM users
ORDER BY created_at;

-- Step 5: Check if RLS policies exist and allow your role
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    qual LIKE '%role%' OR 
    qual LIKE '%Admin%' OR
    with_check LIKE '%role%' OR
    with_check LIKE '%Admin%'
  )
ORDER BY tablename;
