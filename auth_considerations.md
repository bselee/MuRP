Plan: Full User Roles & Permissions with Supabase Auth
Complete authentication and authorization system using native Supabase Auth for credential storage while maintaining your existing role-based permissions.

Steps
Create User Profile Schema & Migration

Add supabase/migrations/025_user_profiles_and_auth.sql to create user_profiles table linked to auth.users
Store role (Admin | Manager | Staff), department, onboarding status, and agreements
Add RLS policies so users can only view/edit their own profile (admins can view all)
Create trigger to auto-create profile when new auth user signs up
Add indexes on user_id, role, department for fast lookups
Implement Supabase Auth Login Flow

Replace LoginScreen.tsx mock user selection with real email/password login using supabase.auth.signInWithPassword()
Add signup flow with supabase.auth.signUp() and email confirmation
Add password reset via supabase.auth.resetPasswordForEmail()
Store auth session in Supabase client (already configured with persistSession: true)
Remove usePersistentState('currentUser') - get user from auth.getSession() instead
Create Auth Context Provider

Add lib/auth/AuthContext.tsx with React Context for user state
Subscribe to supabase.auth.onAuthStateChange() for real-time session updates
Fetch user profile from user_profiles table when session changes
Provide user, loading, signIn, signOut, signUp methods to app
Wrap App.tsx in <AuthProvider>
Update RLS Policies Across All Tables

Modify existing policies in migrations 001-024 to use auth.uid() instead of blanket authenticated
Staff: can read inventory/vendors/boms, create requisitions for their department
Manager: Staff permissions + approve requisitions for their department, view department POs
Admin: Full access to all tables
Update policies on: inventory_items, vendors, boms, purchase_orders, requisitions, build_orders, compliance_records
Add Role-Based UI Permissions

Create hooks/usePermissions.ts hook that returns what current user can do
Check permissions in components before showing/hiding buttons (Create PO, Approve Req, etc.)
Use rolePermissions from database user_profiles.role instead of localStorage
Disable actions server-side via RLS (UI is just UX, security is in database)
Implement Invite User Flow

Admin creates invite via supabase.auth.admin.inviteUserByEmail() (requires service role key on backend)
Add Edge Function index.ts to handle invites
Set user metadata (role, department) in invite
User receives email, clicks link, sets password, auto-creates profile via trigger
Admin can pre-assign role/department in user_profiles or set via metadata
Add User Management Dashboard

Update UserManagementPanel.tsx to fetch from user_profiles table
Show users filtered by department for Managers, all users for Admins
Implement edit user role/department (admins only)
Implement deactivate user (set deleted_at or is_active: false in profile)
Add search/filter by name, email, role, department
Handle Onboarding & Agreements

Move regulatory agreements from localStorage to user_profiles.agreements JSONB column
Track agreement acceptance timestamp and version
Show NewUserSetup component after first login if onboarding_complete: false
Update profile after onboarding completion
Add Session Management & Security

Implement auto-logout on session expiry (Supabase handles this)
Add "Remember Me" option using Supabase session persistence
Implement RBAC middleware for sensitive routes
Add audit log for role changes and permission grants
Migration & Data Backfill

Create migration script to convert existing mock users to real auth users
Generate temporary passwords or invite links for existing users
Backfill user_profiles with existing user data from localStorage
Remove mock user data after migration complete
Further Considerations
Multi-tenancy (Future): Add organization_id to user_profiles and filter all queries by org? Current single-tenant or separate per customer?
OAuth/SSO: Add Google/Microsoft SSO via supabase.auth.signInWithOAuth() for enterprise customers?
Granular Permissions: Switch from role-based to permission-based (e.g., can_approve_po, can_create_vendor) stored in user_permissions table?
Edge Function Auth: All existing Edge Functions need to verify auth.getUser() and check role from profile
API Key Auth: Keep existing API key system for programmatic access or migrate to Supabase service role keys?
Comprehensive redesign of the login experience with Supabase Auth integration, modern UI/UX patterns, and smooth developer access without compromising production security.

Steps
Redesign LoginScreen.tsx with modern auth UI - Replace user picker with email/password form using glassmorphism design, gradient accents, animated transitions, social login buttons (Google/Microsoft), "Remember me" checkbox, password reset link, and error/success toast integration. Add tabbed interface (Login/Signup) with validation feedback.

Create dev god mode system in App.tsx - Implement URL parameter ?dev=1 with import.meta.env.DEV guard, localStorage flag murp::devGodMode, and keyboard shortcut (Ctrl+Shift+G). Add dev tools indicator in header when god mode active. Ensure E2E bypass (?e2e=1) remains separate for tests.

Build AuthContext.tsx provider - Create context with signIn(), signUp(), signOut(), resetPassword() methods wrapping Supabase Auth SDK. Subscribe to onAuthStateChange(), fetch user_profiles table on session change, expose loading states and auth errors. Provide currentUser state to replace localStorage approach.

Update NewUserSetup.tsx for real password creation - Integrate with Supabase updateUser() to set password on first login (magic link flow). Move agreement acceptance to database via user_profiles.agreements JSONB column. Add profile completion (name, department) before accessing app.

Add production safety guards - Wrap all bypass mechanisms in if (import.meta.env.DEV) checks. Create lib/auth/guards.ts with isDevelopment(), isE2ETesting(), canBypassAuth() utilities. Add warning banner when god mode active (dev only).

Create dev tools panel in Settings - Admin-only section showing active bypass modes, quick user switching (dev only), localStorage inspection, feature flag toggles, and "Reset to Clean State" button. Document keyboard shortcuts and URL parameters.

Further Considerations
Social login integration - Use Supabase OAuth for Google/Microsoft? Requires configuring providers in Supabase dashboard and updating redirect URLs. May need separate Edge Function for user profile auto-creation on first OAuth login.

Password strength requirements - Enforce minimum 12 characters, special chars, numbers? Add zxcvbn password strength meter with visual feedback? Store policy in app_settings table for admin configuration?

Session persistence strategy - Keep current persistSession: true or implement sliding session with activity tracking? Add "Keep me signed in" checkbox that extends session TTL? Consider security vs UX trade-offs for production users.

Dev mode discoverability - Add /docs/DEV_MODE.md with all bypass methods? Show tooltip on login screen in dev builds? Add CLI command npm run dev:godmode that auto-opens broser