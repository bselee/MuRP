#!/bin/bash
# Quick script to promote user to Admin
# Run this in the Supabase SQL editor at: https://supabase.com/dashboard/project/mpuevsmtowyexhsqugkm/sql

# Step 1: List current users
echo "SELECT id, email, full_name, role, department FROM public.user_profiles ORDER BY created_at DESC;"

# After you identify your user ID, run Step 2:

# Step 2: Update your role to Admin
# UPDATE public.user_profiles 
# SET role = 'Admin', updated_at = NOW() 
# WHERE id = 'YOUR_USER_ID_HERE';

# Step 3: Verify
# SELECT id, email, full_name, role FROM public.user_profiles WHERE role = 'Admin';
