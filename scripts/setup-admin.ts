#!/usr/bin/env node

/**
 * Quick Admin Setup Utility
 * Updates your user role to Admin via Supabase RPC
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = 'https://mpuevsmtowyexhsqugkm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdWV2c210b3d5ZXhoc3F1Z2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMwMzI0MDUsImV4cCI6MjA0ODYwODQwNX0.6QlYqM3y0GZLhGdY0dHeFG5lrBqSRkDqvJDOxH91IkU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getAuthenticatedClient() {
  // Get stored auth token
  const authFile = path.join(process.env.HOME || '/root', '.murp_auth.json');
  
  if (!fs.existsSync(authFile)) {
    console.error('❌ No auth token found. Please log in first at https://murp.app');
    process.exit(1);
  }
  
  const auth = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
  
  // Create authenticated client
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${auth.access_token}`
      }
    }
  });
  
  return { authClient, userId: auth.user_id };
}

async function listUsers(authClient: any) {
  console.log('\n📋 Fetching all users...');
  
  const { data, error } = await authClient.rpc('get_all_users');
  
  if (error) {
    console.error('❌ Error fetching users:', error.message);
    return null;
  }
  
  console.log('\n👥 Current users:');
  console.log('─'.repeat(100));
  data.forEach((user: any) => {
    console.log(`  ID: ${user.id.slice(0, 8)}...`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Name: ${user.full_name}`);
    console.log(`  Role: ${user.role}`);
    console.log(`  Department: ${user.department}`);
    console.log('─'.repeat(100));
  });
  
  return data;
}

async function updateUserRole(authClient: any, targetUserId: string, newRole: string) {
  console.log(`\n🔐 Updating user role to ${newRole}...`);
  
  const { data, error } = await authClient.rpc('update_user_role', {
    target_user_id: targetUserId,
    new_role: newRole
  });
  
  if (error) {
    console.error('❌ Error updating role:', error.message);
    return false;
  }
  
  if (data && data.length > 0 && data[0].success) {
    console.log(`✅ Success! ${data[0].message}`);
    console.log(`   Email: ${data[0].email}`);
    console.log(`   New Role: ${data[0].role}`);
    return true;
  } else {
    console.error('❌ Update failed:', data?.[0]?.message || 'Unknown error');
    return false;
  }
}

async function main() {
  try {
    console.log('🚀 MuRP Admin Setup Utility\n');
    
    // For development, we'll use a simpler approach
    // Just update the current authenticated user's role directly
    
    const { data: currentUser, error: userError } = await supabase.auth.getUser();
    
    if (userError || !currentUser.user) {
      console.error('❌ You must be logged in to update your role');
      console.error('   Go to https://murp.app and log in first');
      process.exit(1);
    }
    
    console.log(`📧 Current user: ${currentUser.user.email}`);
    
    // Get current profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', currentUser.user.id)
      .single();
    
    if (profileError || !profile) {
      console.error('❌ Error fetching user profile:', profileError?.message);
      process.exit(1);
    }
    
    console.log(`👤 Current role: ${profile.role}`);
    console.log(`🏢 Department: ${profile.department}`);
    
    if (profile.role === 'Admin') {
      console.log('\n✅ You are already an Admin!');
      process.exit(0);
    }
    
    // Update to Admin
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ role: 'Admin', updated_at: new Date().toISOString() })
      .eq('id', currentUser.user.id);
    
    if (updateError) {
      console.error('❌ Error updating role:', updateError.message);
      process.exit(1);
    }
    
    console.log('\n✅ Role updated to Admin!');
    console.log('\n💡 Next steps:');
    console.log('   1. Refresh the page (Cmd+R or Ctrl+R)');
    console.log('   2. You should now see all menu items in the sidebar');
    console.log('   3. Access Settings to manage other users');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
