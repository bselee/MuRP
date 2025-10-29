# Supabase Password Reset Email Template Fix

## Problem
Password reset emails are redirecting to login screen instead of password reset form.

## Root Cause
The Supabase email template might not be using the correct URL format with `#type=recovery` in the hash.

## Fix Instructions

### 1. Go to Supabase Dashboard
- Navigate to: **Authentication** → **Email Templates**
- Select: **Reset Password** template

### 2. Update the Template
Replace the entire template with this:

```html
<h2>Reset Password</h2>
<p>Follow this link to reset the password for your user:</p>
<p><a href="{{ .SiteURL }}/#type=recovery&access_token={{ .TokenHash }}&refresh_token={{ .RefreshTokenHash }}">Reset Password</a></p>
<p>Or copy and paste this URL into your browser:</p>
<p>{{ .SiteURL }}/#type=recovery&access_token={{ .TokenHash }}&refresh_token={{ .RefreshTokenHash }}</p>
```

### 3. Verify Settings
- **Site URL** should be: `https://tgf-mrp.vercel.app`
- **Redirect URLs** should include: `https://tgf-mrp.vercel.app/**`

### Key Points:
- Must use `{{ .SiteURL }}/#type=recovery` (with `#` for hash routing)
- Must include `{{ .TokenHash }}` for access_token
- Must include `{{ .RefreshTokenHash }}` for refresh_token
- The `#` is critical - it tells the app to use client-side routing

### Alternative (Simpler)
If the above doesn't work, try this simpler version:

```html
<h2>Reset Password</h2>
<p>Follow this link to reset your password:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
```

Then ensure your **Redirect URL** is set to: `https://tgf-mrp.vercel.app`
