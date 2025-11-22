-- Migration: Set Admin Users and Auto-Complete Onboarding for Confirmed Users
-- Date: 2025-11-19
-- Purpose: Set specific users as Admin and mark confirmed users as onboarded

-- Function to safely update user profiles
CREATE OR REPLACE FUNCTION set_user_as_admin(user_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.user_profiles
  SET 
    role = 'Admin',
    onboarding_complete = true
  WHERE email = user_email;
  
  RAISE NOTICE 'Updated user % to Admin', user_email;
END;
$$;

-- Set specific users as Admin
SELECT set_user_as_admin('bselee@gmail.com');
SELECT set_user_as_admin('bill.selee@buildasoil.com');

-- Auto-complete onboarding for all users who have confirmed their email
-- (email_confirmed_at exists in auth.users)
UPDATE public.user_profiles up
SET onboarding_complete = true
FROM auth.users au
WHERE up.id = au.id
  AND au.email_confirmed_at IS NOT NULL
  AND up.onboarding_complete = false;

-- Drop the temporary function
DROP FUNCTION IF EXISTS set_user_as_admin(TEXT);

COMMENT ON TABLE public.user_profiles IS 'User profiles with role-based access. Admin users have full access to all features.';
