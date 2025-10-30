-- FIX: Add RLS policy for users to read their own profile
-- Run this in Supabase SQL Editor

-- Enable RLS on users table (if not already enabled)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Users can read their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can read own data" ON public.users;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.users;

-- Create policy: Authenticated users can read their own profile
CREATE POLICY "Users can read their own profile"
ON public.users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Optional: Allow users to read other users (for user management pages)
-- Uncomment if you want all authenticated users to see all user profiles
-- CREATE POLICY "Users can read all profiles"
-- ON public.users
-- FOR SELECT
-- TO authenticated
-- USING (true);

-- Verify the policy was created
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'users' AND schemaname = 'public';
