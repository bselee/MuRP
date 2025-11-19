/**
 * Google OAuth Client Configuration
 *
 * Sets up OAuth 2.0 client for Google APIs (Sheets, Drive)
 * Handles token refresh and authentication flow
 */

import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

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

/**
 * Create OAuth2 client for Google APIs
 */
export function createGoogleOAuthClient(config: GoogleAuthConfig): OAuth2Client {
  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  return oauth2Client;
}

/**
 * Generate authentication URL for user consent
 */
export function getAuthUrl(oauth2Client: OAuth2Client, scopes: string[]): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Request refresh token
    scope: scopes,
    prompt: 'consent', // Force consent screen to get refresh token
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokensFromCode(
  oauth2Client: OAuth2Client,
  code: string
): Promise<GoogleTokens> {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens as GoogleTokens;
}

/**
 * Set credentials on OAuth client
 */
export function setCredentials(oauth2Client: OAuth2Client, tokens: GoogleTokens): void {
  oauth2Client.setCredentials(tokens);
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  oauth2Client: OAuth2Client
): Promise<GoogleTokens> {
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials as GoogleTokens;
}

/**
 * Check if token is expired or will expire soon (within 5 minutes)
 */
export function isTokenExpired(tokens: GoogleTokens): boolean {
  if (!tokens.expiry_date) {
    return false; // No expiry, assume valid
  }

  const now = Date.now();
  const expiryBuffer = 5 * 60 * 1000; // 5 minutes in milliseconds

  return tokens.expiry_date - now < expiryBuffer;
}

/**
 * Scopes required for different Google services
 */
export const GOOGLE_SCOPES = {
  SHEETS_READONLY: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  SHEETS_READWRITE: 'https://www.googleapis.com/auth/spreadsheets',
  DRIVE_READONLY: 'https://www.googleapis.com/auth/drive.readonly',
  DRIVE_FILE: 'https://www.googleapis.com/auth/drive.file', // Access only files created by this app
  DRIVE_APPDATA: 'https://www.googleapis.com/auth/drive.appdata', // Access app-specific data folder
  CALENDAR_READONLY: 'https://www.googleapis.com/auth/calendar.readonly',
  CALENDAR_READWRITE: 'https://www.googleapis.com/auth/calendar', // Full calendar access
  CALENDAR_EVENTS: 'https://www.googleapis.com/auth/calendar.events', // Events only
} as const;

/**
 * Default scopes for TGF MRP application
 */
export const DEFAULT_SCOPES = [
  GOOGLE_SCOPES.SHEETS_READWRITE, // Read/write access to Sheets
  GOOGLE_SCOPES.DRIVE_FILE,       // Create and access files we create
  GOOGLE_SCOPES.CALENDAR_READWRITE, // Calendar integration for production scheduling
] as const;

/**
 * Create Google Sheets API client
 */
export function createSheetsClient(oauth2Client: OAuth2Client) {
  return google.sheets({ version: 'v4', auth: oauth2Client });
}

/**
 * Create Google Drive API client
 */
export function createDriveClient(oauth2Client: OAuth2Client) {
  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Create Google Calendar API client
 */
export function createCalendarClient(oauth2Client: OAuth2Client) {
  return google.calendar({ version: 'v3', auth: oauth2Client });
}
