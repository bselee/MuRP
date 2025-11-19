/**
 * Browser-safe Google Client
 * 
 * Only exports scopes and types - no googleapis imports
 * All actual API calls should go through Supabase Edge Functions
 */

export { GOOGLE_SCOPES, DEFAULT_SCOPES } from './scopes';

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  scope?: string;
  token_type?: string;
}

// Browser stubs - throw errors if called
export function createGoogleOAuthClient(): never {
  throw new Error('createGoogleOAuthClient should only be called server-side. Use Supabase Edge Functions.');
}

export function getAuthUrl(): never {
  throw new Error('getAuthUrl should only be called server-side. Use Supabase Edge Functions.');
}

export function getTokensFromCode(): never {
  throw new Error('getTokensFromCode should only be called server-side. Use Supabase Edge Functions.');
}

export function setCredentials(): never {
  throw new Error('setCredentials should only be called server-side. Use Supabase Edge Functions.');
}

export function refreshAccessToken(): never {
  throw new Error('refreshAccessToken should only be called server-side. Use Supabase Edge Functions.');
}

export function isTokenExpired(tokens: GoogleTokens): boolean {
  if (!tokens.expiry_date) {
    return false;
  }
  const now = Date.now();
  const expiryBuffer = 5 * 60 * 1000;
  return tokens.expiry_date - now < expiryBuffer;
}

export function createSheetsClient(): never {
  throw new Error('createSheetsClient should only be called server-side. Use Supabase Edge Functions.');
}

export function createDriveClient(): never {
  throw new Error('createDriveClient should only be called server-side. Use Supabase Edge Functions.');
}

export function createCalendarClient(): never {
  throw new Error('createCalendarClient should only be called server-side. Use Supabase Edge Functions.');
}
