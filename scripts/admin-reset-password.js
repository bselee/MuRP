#!/usr/bin/env node
/**
 * Admin Password Reset Script
 * 
 * Directly resets a user's password via Supabase Admin API
 * Bypasses the broken browser-based password reset flow
 * 
 * Usage:
 *   node scripts/admin-reset-password.js <email> <new-password>
 * 
 * Example:
 *   node scripts/admin-reset-password.js bill.selee@buildasoil.com MyNewPassword123
 */

import https from 'https';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://mpuevsmtowyexhsqugkm.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Parse command line arguments
const [,, email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.error('❌ Usage: node admin-reset-password.js <email> <new-password>');
  console.error('   Example: node admin-reset-password.js user@example.com NewPass123');
  process.exit(1);
}

if (!SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  console.error('   Set it in your .env file or run:');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=your_key node admin-reset-password.js ...');
  process.exit(1);
}

if (newPassword.length < 6) {
  console.error('❌ Password must be at least 6 characters long');
  process.exit(1);
}

console.log('🔧 Admin Password Reset Tool');
console.log('━'.repeat(50));
console.log(`📧 Email: ${email}`);
console.log(`🔒 New Password: ${'*'.repeat(newPassword.length)}`);
console.log('━'.repeat(50));

// Step 1: Find user by email
function findUserByEmail(email) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/auth/v1/admin/users`);
    
    const options = {
      method: 'GET',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      }
    };

    console.log('🔍 Step 1: Finding user...');
    
    const req = https.request(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }
        
        try {
          const response = JSON.parse(data);
          const user = response.users?.find(u => u.email === email);
          
          if (!user) {
            reject(new Error(`User with email ${email} not found`));
            return;
          }
          
          console.log(`✅ Found user: ${user.email} (ID: ${user.id})`);
          resolve(user);
        } catch (err) {
          reject(err);
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

// Step 2: Update user password
function updateUserPassword(userId, newPassword) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`);
    
    const payload = JSON.stringify({
      password: newPassword
    });
    
    const options = {
      method: 'PUT',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      }
    };

    console.log('🔐 Step 2: Updating password...');
    
    const req = https.request(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }
        
        try {
          const response = JSON.parse(data);
          console.log(`✅ Password updated successfully!`);
          resolve(response);
        } catch (err) {
          reject(err);
        }
      });
    });
    
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Main execution
(async () => {
  try {
    const user = await findUserByEmail(email);
    await updateUserPassword(user.id, newPassword);
    
    console.log('━'.repeat(50));
    console.log('🎉 SUCCESS!');
    console.log('━'.repeat(50));
    console.log(`✓ Password has been reset for ${email}`);
    console.log(`✓ You can now log in at: https://tgf-mrp.vercel.app`);
    console.log('━'.repeat(50));
    
  } catch (error) {
    console.error('━'.repeat(50));
    console.error('❌ ERROR:', error.message);
    console.error('━'.repeat(50));
    process.exit(1);
  }
})();
