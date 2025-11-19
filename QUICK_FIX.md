# Quick Fix for Google OAuth "No verification code" Error

## The Problem
Google OAuth redirects back to your app, but Supabase isn't configured to allow that redirect URL, so the `code` parameter is missing.

## The Fix (Takes 2 minutes)

### 1. Go to Supabase Dashboard
Open: https://app.supabase.com/project/YOUR-PROJECT/auth/url-configuration

(Replace YOUR-PROJECT with your actual project ID)

### 2. Add Redirect URLs
In the **Redirect URLs** section, add:

**For localhost testing:**
```
http://localhost:5173/auth/callback
```

**For production (replace with your actual domain):**
```
https://your-domain.com/auth/callback
```

Click **Save**

### 3. Verify Google Provider is Enabled
Go to: **Authentication → Providers → Google**

Make sure:
- ✅ Enable Sign in with Google is ON
- ✅ Client ID is filled in
- ✅ Client Secret is filled in

### 4. Test Again
- Use incognito window
- Click "Sign in with Google"
- Should work now!

---

## Still not working?

### Check Google Cloud Console
The authorized redirect URI in Google Cloud Console should be your **Supabase callback URL**, NOT your app's URL:

```
https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
```

To find YOUR-PROJECT-REF:
- Look at your Supabase project URL
- Example: `https://abcdefgh.supabase.co` → project ref is `abcdefgh`

### Where to add it:
1. Go to https://console.cloud.google.com/
2. APIs & Services → Credentials
3. Click your OAuth 2.0 Client ID
4. Under **Authorized redirect URIs**, add:
   ```
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
   ```

That's it! The OAuth flow should work now.
