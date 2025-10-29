-- Update bill.selee@buildasoil.com to Admin role
-- Run this in Supabase SQL Editor

UPDATE public.users 
SET 
    role = 'Admin',
    updated_at = NOW()
WHERE email = 'bill.selee@buildasoil.com';

-- Verify the update
SELECT id, email, name, role, department 
FROM public.users 
WHERE email = 'bill.selee@buildasoil.com';
