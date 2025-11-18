# Supabase Authentication Setup Guide

## Critical Configuration Steps

### 1. Configure Redirect URLs in Supabase Dashboard

To enable email confirmation and password reset flows, you **must** add the following URLs to your Supabase project:

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **URL Configuration**
3. Add the following URLs to **Redirect URLs**:

   ```
   http://localhost:5173/auth/callback
   http://localhost:5173/reset-password
   https://yourdomain.com/auth/callback
   https://yourdomain.com/reset-password
   ```

   Replace `yourdomain.com` with your production domain.

### 2. Email Templates Configuration

Supabase sends authentication emails using templates. The default templates should work, but you can customize them:

1. Go to **Authentication** → **Email Templates**
2. Verify that the **Confirm signup** and **Reset password** templates include the correct redirect URLs

### 3. Environment Variables

Ensure your `.env` file has the following variables set:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Authentication Flows

### Sign Up Flow

1. User fills out the sign-up form on `/` (LoginScreen)
2. `AuthContext.signUp()` is called with user details
3. Supabase sends a confirmation email to the user
4. User clicks the link in the email
5. User is redirected to `/auth/callback` with a code
6. `AuthCallback` component exchanges the code for a session
7. User is redirected to dashboard

### Password Reset Flow

1. User clicks "Forgot password?" on the login screen
2. User enters their email
3. `AuthContext.resetPassword()` sends a reset email
4. User clicks the link in the email
5. User is redirected to `/reset-password` with a recovery session
6. `ResetPassword` component allows user to set a new password
7. User is redirected to login screen

### Sign In Flow

1. User enters email and password on `/` (LoginScreen)
2. `AuthContext.signIn()` authenticates with Supabase
3. If successful, session is established
4. User proceeds to onboarding (if incomplete) or dashboard

## Role-Based Access Control

The system supports three roles with different permission levels:

- **Admin**: Full access to all features
- **Manager**: Department-specific management capabilities
- **Staff**: Read-only access, can submit requisitions

Roles are assigned during user creation and stored in the `user_profiles` table.

## Troubleshooting

### "Invalid or Expired Link" Error

This typically means:
- The email link was already used
- The link has expired (default: 1 hour)
- The redirect URL is not configured in Supabase

**Solution**: Request a new confirmation/reset email

### Email Not Received

Check:
1. Spam/junk folder
2. Email address is correct
3. Supabase email sending is enabled (check project quota)
4. Email templates are properly configured

### "Failed to confirm email" Error

Check:
1. Redirect URLs are configured in Supabase Dashboard
2. Browser console for detailed error messages
3. Network tab to see if the API call is successful

### Login Works but Shows Login Screen Again

This usually means:
- The user profile was not created in `user_profiles` table
- The `onboarding_complete` flag is `false`

**Solution**: Check the `user_profiles` table in Supabase and ensure the user exists

## Development Mode

The app includes a "God Mode" for development:
- Press `Ctrl+Shift+G` to toggle
- Bypasses authentication (development only)
- Not available in production builds

## Security Best Practices

1. **Never commit** `.env` files to version control
2. Use **Row Level Security (RLS)** policies in Supabase
3. Rotate API keys regularly
4. Monitor authentication logs in Supabase Dashboard
5. Enable email rate limiting to prevent abuse

## Related Files

- `/lib/auth/AuthContext.tsx` - Main authentication logic
- `/pages/LoginScreen.tsx` - Login/signup UI
- `/pages/AuthCallback.tsx` - Email confirmation handler
- `/pages/ResetPassword.tsx` - Password reset handler
- `/pages/NewUserSetup.tsx` - Onboarding flow
- `/hooks/usePermissions.ts` - Permission checking
- `/supabase/migrations/025_user_profiles_and_auth.sql` - Database schema
