-- ============================================================================
-- Create Admin User Profile (Run this in Supabase SQL Editor after signup)
-- ============================================================================

-- 1. First, check if a profile exists for your auth user:
SELECT 
  u.id,
  u.email,
  u.created_at as auth_created,
  p.full_name,
  p.role,
  p.department,
  p.onboarding_complete
FROM auth.users u
LEFT JOIN public.user_profiles p ON p.id = u.id
ORDER BY u.created_at DESC
LIMIT 5;

-- 2. If your user shows NULL for full_name/role/department, run this:
-- (Replace 'your-email@example.com' with your actual email)

INSERT INTO public.user_profiles (
  id,
  email,
  full_name,
  role,
  department,
  onboarding_complete,
  is_active
)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', email),
  'Admin',
  'Purchasing',
  true,
  true
FROM auth.users
WHERE email = 'your-email@example.com'
ON CONFLICT (id) 
DO UPDATE SET
  role = 'Admin',
  department = 'Purchasing',
  onboarding_complete = true,
  is_active = true,
  updated_at = now();

-- 3. Verify the profile was created:
SELECT * FROM public.user_profiles WHERE email = 'your-email@example.com';
