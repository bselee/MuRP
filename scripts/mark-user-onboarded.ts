/**
 * Script to mark a user as onboarded in production
 * Usage: npx tsx scripts/mark-user-onboarded.ts <email>
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function markUserOnboarded(email: string) {
  console.log(`Looking up user with email: ${email}...`);
  
  // Get user by email
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('Error listing users:', listError);
    process.exit(1);
  }
  
  const user = users.users.find(u => u.email === email);
  
  if (!user) {
    console.error(`User with email ${email} not found`);
    process.exit(1);
  }
  
  console.log(`Found user: ${user.id}`);
  
  // Update user profile to mark as onboarded
  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({ onboarding_complete: true })
    .eq('id', user.id);
  
  if (updateError) {
    console.error('Error updating user profile:', updateError);
    process.exit(1);
  }
  
  console.log(`✅ Successfully marked ${email} as onboarded`);
}

const email = process.argv[2];

if (!email) {
  console.error('Usage: npx tsx scripts/mark-user-onboarded.ts <email>');
  process.exit(1);
}

markUserOnboarded(email).catch(console.error);
