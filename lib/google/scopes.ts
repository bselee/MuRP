/**
 * Google OAuth Scopes Configuration
 * 
 * Constants for Google API scopes - no googleapis imports
 * Safe for client-side use
 */

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
  DOCS: 'https://www.googleapis.com/auth/documents',
  GMAIL_SEND: 'https://www.googleapis.com/auth/gmail.send',
  GMAIL_READONLY: 'https://www.googleapis.com/auth/gmail.readonly', // Read emails for PO tracking
  GMAIL_LABELS: 'https://www.googleapis.com/auth/gmail.labels', // Manage labels for organization
  GMAIL_MODIFY: 'https://www.googleapis.com/auth/gmail.modify', // Mark as read, archive, etc.
} as const;

/**
 * Default scopes for MuRP application
 */
export const DEFAULT_SCOPES = [
  GOOGLE_SCOPES.SHEETS_READWRITE, // Read/write access to Sheets
  GOOGLE_SCOPES.DRIVE_FILE,       // Create and access files we create
  GOOGLE_SCOPES.CALENDAR_READWRITE, // Calendar integration for production scheduling
  GOOGLE_SCOPES.DOCS,             // Create/update Google Docs templates
  GOOGLE_SCOPES.GMAIL_SEND,       // Send vendor emails via Gmail
] as const;

/**
 * Scopes for email monitoring (PO tracking)
 * Requires read access to process incoming vendor emails
 */
export const EMAIL_MONITORING_SCOPES = [
  GOOGLE_SCOPES.GMAIL_READONLY,   // Read incoming vendor emails
  GOOGLE_SCOPES.GMAIL_LABELS,     // Organize with labels
  GOOGLE_SCOPES.GMAIL_SEND,       // Send follow-ups and responses
] as const;

/**
 * Full scopes for complete email integration
 * Use when user wants full email automation
 */
export const FULL_EMAIL_SCOPES = [
  GOOGLE_SCOPES.GMAIL_READONLY,
  GOOGLE_SCOPES.GMAIL_MODIFY,     // Mark as read, archive processed emails
  GOOGLE_SCOPES.GMAIL_LABELS,
  GOOGLE_SCOPES.GMAIL_SEND,
] as const;
