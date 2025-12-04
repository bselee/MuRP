-- ================================================================
-- QUICK FIX: Promote Both Users to Admin
-- Run this in Supabase SQL Console
-- ================================================================

-- Step 1: View current users
SELECT 
    id, 
    email, 
    full_name, 
    role, 
    department,
    created_at
FROM public.user_profiles 
ORDER BY created_at ASC;

-- Step 2: Update BOTH users to Admin role
-- This will work regardless of current role
UPDATE public.user_profiles 
SET 
    role = 'Admin',
    updated_at = NOW()
WHERE id IN (
    SELECT id FROM public.user_profiles 
    ORDER BY created_at ASC 
    LIMIT 2
);

-- Step 3: Verify both users are now Admin
SELECT 
    id, 
    email, 
    full_name, 
    role, 
    department
FROM public.user_profiles 
ORDER BY created_at ASC;

-- ================================================================
-- Expected output after Step 3:
-- Both users should show role = 'Admin'
-- ================================================================
