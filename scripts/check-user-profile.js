#!/usr/bin/env node
/**
 * Check if user profile exists in public.users table
 */

import https from 'https';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://mpuevsmtowyexhsqugkm.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const email = 'bill.selee@buildasoil.com';

console.log('🔍 Checking user profile for:', email);
console.log('━'.repeat(50));

// Query public.users table
const query = `select=*&email=eq.${email}`;

const options = {
  method: 'GET',
  headers: {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }
};

const req = https.request(`${SUPABASE_URL}/rest/v1/users?${query}`, options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    console.log('');
    
    try {
      const users = JSON.parse(data);
      
      if (users.length === 0) {
        console.log('❌ NO USER PROFILE FOUND!');
        console.log('');
        console.log('The user exists in auth.users but NOT in public.users table.');
        console.log('This is why data loading hangs - RLS policies check public.users.');
        console.log('');
        console.log('Solution: Create user profile with:');
        console.log(`  INSERT INTO public.users (id, name, email, role, department)`);
        console.log(`  VALUES (`);
        console.log(`    'USER_ID_FROM_AUTH',`);
        console.log(`    'Bill Selee',`);
        console.log(`    'bill.selee@buildasoil.com',`);
        console.log(`    'Admin',`);
        console.log(`    'Management'`);
        console.log(`  );`);
      } else {
        console.log('✅ USER PROFILE FOUND!');
        console.log('');
        console.log('Profile details:');
        console.log(JSON.stringify(users[0], null, 2));
      }
    } catch (err) {
      console.error('❌ Parse error:', err);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request error:', e.message);
});

req.end();
