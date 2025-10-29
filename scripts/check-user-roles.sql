-- Check all users and their roles
SELECT 
    id,
    email,
    name,
    role,
    department,
    created_at
FROM public.users
ORDER BY email;

-- Check if bill.selee@buildasoil.com exists and their role
SELECT 
    u.id,
    u.email,
    u.name,
    u.role,
    u.department,
    au.email as auth_email,
    au.created_at as auth_created
FROM public.users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE u.email LIKE '%bill%' OR u.email LIKE '%selee%'
ORDER BY u.email;
