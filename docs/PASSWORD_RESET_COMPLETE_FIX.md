# Complete Password Reset Fix - Session Document

## Current State Analysis

### Problem
Password reset gets stuck on "Verifying reset link..." because:
1. Supabase sends the reset link to their own verify endpoint first
2. That endpoint redirects to our app with query params
3. Our app tries to establish a session but `setSession()` is hanging
4. The `getCurrentUser()` calls timeout after 5 seconds
5. Session never fully establishes

### Root Cause
The Supabase password reset flow uses a **server-side redirect** from:
```
https://mpuevsmtowyexhsqugkm.supabase.co/auth/v1/verify?token=...&type=recovery
```
to:
```
https://tgf-mrp.vercel.app?type=recovery&...
```

This doesn't include the actual access tokens we need. We need to handle this differently.

## Complete Solution

### Option 1: Use Supabase's Built-in Flow (RECOMMENDED)

Instead of manually handling tokens, let Supabase's client auto-detect the session from the URL.

### Option 2: Simplify the Password Reset Component

Remove manual session establishment and rely on Supabase's automatic detection.

## Implementation Steps

### Step 1: Update Supabase Client Configuration
Already done - `detectSessionInUrl: true` is set.

### Step 2: Simplify ResetPassword Component
- Remove manual `setSession()` call
- Let Supabase handle it automatically via `detectSessionInUrl`
- Check for session after a brief delay

### Step 3: Improve Error Handling
- Add better timeout handling
- Show clearer error messages
- Provide "Request new link" button

## Files to Update
1. `/pages/ResetPassword.tsx` - Simplify session handling
2. `/App.tsx` - Ensure proper routing (already done)
3. `/lib/supabase/client.ts` - Verify configuration (already done)

## Testing Plan
1. Request password reset
2. Click email link
3. Should show reset form within 2 seconds
4. Enter new password
5. Should redirect to login
6. Login with new password
