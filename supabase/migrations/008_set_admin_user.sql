-- ============================================================================
-- SET INITIAL ADMIN USER
-- ============================================================================
-- Run this script to make your first user an Admin
-- Replace the email with your actual admin email
-- ============================================================================

-- Option 1: Set specific user as Admin by email
UPDATE users 
SET role = 'Admin', department = 'Management'
WHERE email = 'bill.selee@buildasoil.com';

-- Option 2: Set the first user as Admin
-- UPDATE users 
-- SET role = 'Admin', department = 'Management'
-- WHERE created_at = (SELECT MIN(created_at) FROM users);

-- Verify the admin user was set
SELECT id, email, name, role, department, created_at 
FROM users 
WHERE role = 'Admin';
