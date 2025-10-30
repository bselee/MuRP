#!/usr/bin/env node
// Quick test to verify login credentials work

import https from 'https';

const SUPABASE_URL = 'https://mpuevsmtowyexhsqugkm.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdWV2c210b3d5ZXhoc3F1Z2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NDA3MzYsImV4cCI6MjA3NzMxNjczNn0.ewucknfYUMY-unX6tuu-s9iDO6uQykKqM7klOPDE27I';

const email = 'bill.selee@buildasoil.com';
const password = 'TestPassword123!';

console.log('Testing login credentials...');
console.log('Email:', email);
console.log('Password:', '*'.repeat(password.length));
console.log('');

const payload = JSON.stringify({
  email: email,
  password: password
});

const options = {
  method: 'POST',
  headers: {
    'apikey': ANON_KEY,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = https.request(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    console.log('');
    
    try {
      const response = JSON.parse(data);
      
      if (res.statusCode === 200) {
        console.log('✅ LOGIN SUCCESSFUL!');
        console.log('User ID:', response.user?.id);
        console.log('Email:', response.user?.email);
        console.log('Has access token:', !!response.access_token);
      } else {
        console.log('❌ LOGIN FAILED');
        console.log('Error:', response.error || response.msg || 'Unknown error');
        console.log('Full response:', JSON.stringify(response, null, 2));
      }
    } catch (err) {
      console.log('❌ PARSE ERROR');
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ REQUEST ERROR:', e.message);
});

req.write(payload);
req.end();
