-- Run this in Supabase SQL Editor to set admin users and complete onboarding

-- Set specific users as Admin with completed onboarding
UPDATE public.user_profiles
SET 
  role = 'Admin',
  onboarding_complete = true
WHERE email IN ('bselee@gmail.com', 'bill.selee@buildasoil.com');

-- Auto-complete onboarding for all users who have confirmed their email
UPDATE public.user_profiles up
SET onboarding_complete = true
FROM auth.users au
WHERE up.id = au.id
  AND au.email_confirmed_at IS NOT NULL
  AND up.onboarding_complete = false;

-- Verify the changes
SELECT email, role, onboarding_complete 
FROM public.user_profiles 
WHERE email IN ('bselee@gmail.com', 'bill.selee@buildasoil.com');
