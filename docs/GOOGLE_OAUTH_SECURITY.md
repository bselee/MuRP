# Google OAuth 2.0 Security Implementation

## Overview

MuRP implements OAuth 2.0 best practices for secure Google API integration across Drive, Sheets, Docs, Calendar, and Gmail.

## Recent Security Enhancements (Nov 2025)

### 1. PKCE (Proof Key for Code Exchange)
**Commit:** `7d5b047` - Security: Implement OAuth 2.0 best practices

- **Code Verifier Generation:** Cryptographically secure random strings via `crypto.getRandomValues()`
- **Code Challenge:** SHA-256 hash of verifier, Base64URL encoded
- **State Parameter:** CSRF protection with random state validation
- **Implementation:** `lib/google/pkce.ts`

### 2. Server-Side Token Management
**API Route:** `/api/google-token.ts`

All token operations now happen server-side only:
- ✅ **Client Secret Protection:** Never exposed to browser
- ✅ **HttpOnly Cookies:** Tokens stored securely (if using cookie strategy)
- ✅ **Refresh Token Rotation:** Automatic rotation on refresh
- ✅ **Retry Logic:** Exponential backoff for transient failures
- ✅ **Token Caching:** 5-minute buffer to avoid unnecessary refreshes

#### Supported Actions
```typescript
POST /api/google-token
{
  "action": "refresh" | "revoke" | "status"
}
```

### 3. Browser-Safe Client Polyfill
**Commit:** `d39a2d8` - Fix googleapis browser import error

- **No Server Code in Browser:** `lib/google/client.browser.ts` exports only types and stubs
- **Vite Aliasing:** Automatic replacement of `googleapis` imports in browser builds
- **Error Guards:** Functions throw clear errors if called client-side
- **Scope Constants:** Shared in `lib/google/scopes.ts` (no imports needed)

```typescript
// vite.config.ts
resolve: {
  alias: {
    'googleapis': path.resolve(__dirname, 'polyfills/googleapis.ts'),
  }
}
```

## Architecture

### Client-Side Flow
```
User clicks "Connect Google"
  ↓
Frontend generates PKCE verifier + challenge
  ↓
Redirects to Google OAuth with challenge
  ↓
User authorizes
  ↓
Google redirects with auth code
  ↓
Frontend sends code + verifier to /api/google-token
  ↓
Server exchanges code for tokens (with client secret)
  ↓
Tokens stored in Supabase user_oauth_tokens table
  ↓
Server returns access token (short-lived)
```

### Token Refresh Flow
```
Client needs access token
  ↓
POST /api/google-token { action: "refresh" }
  ↓
Server checks DB for existing token
  ↓
If expired, refresh with Google (refresh_token)
  ↓
Update DB with new tokens
  ↓
Return fresh access_token to client
```

### Security Benefits
1. **Client Secret Never in Browser:** Only in Vercel environment variables
2. **PKCE Prevents Code Interception:** Even if code is stolen, attacker can't exchange it
3. **State Prevents CSRF:** Random state parameter validated on callback
4. **Automatic Retry:** Network failures don't break auth flow
5. **Minimal Token Exposure:** Tokens only transmitted over HTTPS, short-lived

## Google API Services

### Integrated Services
- **Google Sheets:** Inventory sync, vendor data, BOM exports
- **Google Drive:** File storage, artwork uploads
- **Google Calendar:** Production scheduling, build order planning
- **Google Docs:** Template generation, PO documents
- **Gmail:** Vendor email automation

### Scope Management
All scopes centralized in `lib/google/scopes.ts`:

```typescript
export const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',      // Sheets read/write
  'https://www.googleapis.com/auth/drive.file',        // Drive file access
  'https://www.googleapis.com/auth/calendar',          // Calendar full access
  'https://www.googleapis.com/auth/documents',         // Docs
  'https://www.googleapis.com/auth/gmail.send',        // Gmail send
];
```

## Database Schema

### user_oauth_tokens Table
```sql
CREATE TABLE user_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'google'
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scopes TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);
```

## Environment Variables

### Required (Vercel/Server)
```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Supabase (for token storage)
VITE_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Client-Side (Vite)
```bash
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
# Note: CLIENT_SECRET is NEVER in client env
```

## Service Usage

### Google Auth Service
```typescript
import { getGoogleAuthService } from './services/googleAuthService';

const authService = getGoogleAuthService();

// Start OAuth flow (PKCE + state)
await authService.startOAuthFlow();

// Get access token (auto-refreshes if needed)
const token = await authService.getAccessToken();

// Check auth status
const status = await authService.getAuthStatus();

// Revoke access
await authService.revokeAccess();
```

### Google Sheets Service
```typescript
import { getGoogleSheetsService } from './services/googleSheetsService';

const sheetsService = getGoogleSheetsService();

// Read sheet
const data = await sheetsService.readSheet(spreadsheetId, 'Sheet1!A1:Z100');

// Write sheet
await sheetsService.writeSheet(spreadsheetId, 'Sheet1!A1', [
  ['SKU', 'Name', 'Stock'],
  ['ABC-001', 'Widget', '100'],
]);

// Create spreadsheet
const { spreadsheetId, spreadsheetUrl } = await sheetsService.createSpreadsheet(
  'Inventory Export',
  ['Inventory', 'Vendors']
);
```

## Testing & Verification

### Manual Testing Checklist
1. ✅ OAuth flow completes without exposing client_secret in browser
2. ✅ PKCE verifier/challenge generated correctly
3. ✅ State parameter prevents CSRF
4. ✅ Tokens refresh automatically before expiry
5. ✅ Retry logic handles transient network failures
6. ✅ Token revocation works and clears DB

### Security Audit
```bash
# Verify no client_secret in build
npm run build
grep -r "GOOGLE_CLIENT_SECRET" dist/

# Should return no results ✅
```

### Integration Tests (TODO)
- [ ] Test PKCE flow end-to-end
- [ ] Test token refresh with expired token
- [ ] Test retry logic with mocked failures
- [ ] Test revocation clears all tokens
- [ ] Test concurrent refresh requests (rate limiting)

## Troubleshooting

### "Failed to refresh Google token"
- Check `GOOGLE_CLIENT_SECRET` is set in Vercel environment
- Verify refresh_token exists in `user_oauth_tokens` table
- Check Google Cloud Console for API quota/errors

### "No Google account connected"
- User needs to complete OAuth flow first
- Check `user_oauth_tokens` table for row with `provider='google'`

### "Token expired" loop
- Refresh token may be invalid/revoked
- User needs to reconnect Google account
- Check token rotation settings in Google Cloud Console

## Future Enhancements

### Planned
- [ ] Service account support for background jobs
- [ ] Token encryption at rest in database
- [ ] Webhook-based token revocation notifications
- [ ] Multi-account support per user
- [ ] Granular scope management (optional permissions)

### Under Consideration
- [ ] Browser extension for OAuth (avoid popup blockers)
- [ ] Offline access improvements
- [ ] Token usage analytics and quota monitoring
- [ ] Automatic scope upgrade prompts

## References

- [OAuth 2.0 for Client-side Web Applications](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow)
- [PKCE RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)
- [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
- [Supabase Auth Best Practices](https://supabase.com/docs/guides/auth/server-side/overview)

---

**Last Updated:** November 19, 2025  
**Security Review:** Pending external audit  
**Compliance:** SOC 2 Type II controls implemented
