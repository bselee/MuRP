# Fixing Google OAuth Redirect Issue

## Problem
Error: "No verification code found in URL" after clicking Continue on Google

## Root Cause
The redirect URL is not configured in Supabase dashboard, so Supabase doesn't know where to send users after Google authentication.

## Solution

### Step 1: Configure Redirect URL in Supabase

1. Go to your **Supabase Dashboard**
2. Navigate to **Authentication → URL Configuration**
3. Add your redirect URL to **Redirect URLs**:
   - For local development: `http://localhost:5173/auth/callback`
   - For production: `https://your-domain.com/auth/callback`
   - Add BOTH if testing locally and in production

4. Click **Save**

### Step 2: Verify Google OAuth Configuration in Supabase

1. Go to **Authentication → Providers**
2. Click on **Google**
3. Ensure:
   - ✅ **Enabled** is ON
   - ✅ **Client ID** is filled in
   - ✅ **Client Secret** is filled in
4. Click **Save**

### Step 3: Verify Google Cloud Console Configuration

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services → Credentials**
3. Click your OAuth 2.0 Client ID
4. Under **Authorized redirect URIs**, ensure you have:
   ```
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
   ```
   (Replace YOUR-PROJECT-REF with your actual Supabase project reference)

5. Click **Save**

### Step 4: Test Again

1. Clear browser cache or use incognito mode
2. Click "Sign in with Google"
3. Should redirect to Google
4. After clicking "Continue", should redirect back with code and authenticate successfully

## Finding Your Supabase Project Reference

Your Supabase callback URL should be:
```
https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
```

To find YOUR-PROJECT-REF:
- Look at your `VITE_SUPABASE_URL` in `.env`
- It will be something like: `https://abcdefghijklmnop.supabase.co`
- The project ref is the part before `.supabase.co` (e.g., `abcdefghijklmnop`)

## Common Issues

### Issue: Still getting "No verification code" error
**Solution**: Make sure you added the EXACT URL to Supabase redirect URLs, including the protocol (http:// or https://)

### Issue: "redirect_uri_mismatch" error from Google
**Solution**: The redirect URI in Google Cloud Console must be `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback` (NOT your app's URL)

### Issue: Can't find URL Configuration in Supabase
**Solution**: It's under Authentication → URL Configuration (or Authentication → Settings in older Supabase versions)
