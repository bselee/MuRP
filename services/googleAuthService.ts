/**
 * Google OAuth Service
 *
 * Manages OAuth tokens for Google APIs
 * Handles token storage, refresh, and validation
 */

import { supabase } from '../lib/supabase/client';
import {
  createGoogleOAuthClient,
  getAuthUrl,
  getTokensFromCode,
  setCredentials,
  refreshAccessToken,
  isTokenExpired,
  DEFAULT_SCOPES,
  type GoogleTokens,
} from '../lib/google/client';
import type { OAuth2Client } from 'google-auth-library';

export interface GoogleAuthStatus {
  isAuthenticated: boolean;
  hasValidToken: boolean;
  scopes: string[];
  expiresAt: Date | null;
  email?: string;
}

export class GoogleAuthService {
  private oauth2Client: OAuth2Client | null = null;
  private currentTokens: GoogleTokens | null = null;
  private userId: string | null = null;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize OAuth client with environment variables
   */
  private async initialize() {
    // Get Google OAuth credentials from environment
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
    const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI || `${window.location.origin}/auth/google/callback`;

    if (!clientId || !clientSecret) {
      console.warn('[GoogleAuthService] Google OAuth credentials not configured in environment');
      return;
    }

    this.oauth2Client = createGoogleOAuthClient({
      clientId,
      clientSecret,
      redirectUri,
    });

    // Try to load existing tokens
    await this.loadTokensFromDatabase();
  }

  /**
   * Get authentication URL for user consent
   */
  async getAuthUrl(scopes: string[] = DEFAULT_SCOPES): Promise<string> {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth client not initialized. Check environment variables.');
    }

    return getAuthUrl(this.oauth2Client, scopes);
  }

  /**
   * Handle OAuth callback with authorization code
   */
  async handleAuthCallback(code: string): Promise<void> {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth client not initialized');
    }

    // Exchange code for tokens
    const tokens = await getTokensFromCode(this.oauth2Client, code);
    this.currentTokens = tokens;

    // Set credentials on client
    setCredentials(this.oauth2Client, tokens);

    // Save tokens to database
    await this.saveTokensToDatabase(tokens);

    console.log('[GoogleAuthService] Successfully authenticated with Google');
  }

  /**
   * Get current OAuth client (with valid tokens)
   */
  async getAuthenticatedClient(): Promise<OAuth2Client> {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth client not initialized');
    }

    if (!this.currentTokens) {
      throw new Error('No Google OAuth tokens available. Please authenticate first.');
    }

    // Check if token is expired and refresh if needed
    if (isTokenExpired(this.currentTokens)) {
      console.log('[GoogleAuthService] Access token expired, refreshing...');
      await this.refreshTokens();
    }

    return this.oauth2Client;
  }

  /**
   * Refresh access token
   */
  private async refreshTokens(): Promise<void> {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth client not initialized');
    }

    if (!this.currentTokens?.refresh_token) {
      throw new Error('No refresh token available. Please re-authenticate.');
    }

    // Set current tokens (including refresh token)
    setCredentials(this.oauth2Client, this.currentTokens);

    // Refresh access token
    const newTokens = await refreshAccessToken(this.oauth2Client);

    // Preserve refresh token if not included in response
    if (!newTokens.refresh_token && this.currentTokens.refresh_token) {
      newTokens.refresh_token = this.currentTokens.refresh_token;
    }

    this.currentTokens = newTokens;

    // Update database
    await this.saveTokensToDatabase(newTokens);

    console.log('[GoogleAuthService] Successfully refreshed access token');
  }

  /**
   * Load tokens from database
   */
  private async loadTokensFromDatabase(): Promise<void> {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        console.log('[GoogleAuthService] No authenticated user, skipping token load');
        return;
      }

      this.userId = user.id;

      // Fetch tokens from database
      const { data, error } = await supabase
        .from('user_oauth_tokens')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .single();

      if (error || !data) {
        console.log('[GoogleAuthService] No existing Google tokens found');
        return;
      }

      // Reconstruct tokens object
      this.currentTokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || undefined,
        expiry_date: data.expires_at ? new Date(data.expires_at).getTime() : undefined,
        scope: data.scopes?.join(' '),
      };

      // Set credentials on OAuth client
      if (this.oauth2Client) {
        setCredentials(this.oauth2Client, this.currentTokens);
      }

      console.log('[GoogleAuthService] Loaded existing Google tokens');
    } catch (error) {
      console.error('[GoogleAuthService] Error loading tokens:', error);
    }
  }

  /**
   * Save tokens to database
   */
  private async saveTokensToDatabase(tokens: GoogleTokens): Promise<void> {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('No authenticated user');
      }

      this.userId = user.id;

      // Prepare token data
      const tokenData = {
        user_id: user.id,
        provider: 'google',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        scopes: tokens.scope?.split(' ') || [],
        updated_at: new Date().toISOString(),
      };

      // Upsert tokens (update if exists, insert if not)
      const { error } = await supabase
        .from('user_oauth_tokens')
        .upsert(tokenData, {
          onConflict: 'user_id,provider',
        });

      if (error) {
        throw error;
      }

      console.log('[GoogleAuthService] Saved Google tokens to database');
    } catch (error) {
      console.error('[GoogleAuthService] Error saving tokens:', error);
      throw error;
    }
  }

  /**
   * Revoke access and delete tokens
   */
  async revokeAccess(): Promise<void> {
    try {
      if (this.oauth2Client && this.currentTokens?.access_token) {
        // Revoke token with Google
        await this.oauth2Client.revokeToken(this.currentTokens.access_token);
      }

      // Delete from database
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        await supabase
          .from('user_oauth_tokens')
          .delete()
          .eq('user_id', user.id)
          .eq('provider', 'google');
      }

      // Clear local state
      this.currentTokens = null;

      console.log('[GoogleAuthService] Successfully revoked Google access');
    } catch (error) {
      console.error('[GoogleAuthService] Error revoking access:', error);
      throw error;
    }
  }

  /**
   * Get current authentication status
   */
  async getAuthStatus(): Promise<GoogleAuthStatus> {
    if (!this.currentTokens) {
      return {
        isAuthenticated: false,
        hasValidToken: false,
        scopes: [],
        expiresAt: null,
      };
    }

    const hasValidToken = !isTokenExpired(this.currentTokens);
    const expiresAt = this.currentTokens.expiry_date
      ? new Date(this.currentTokens.expiry_date)
      : null;

    return {
      isAuthenticated: true,
      hasValidToken,
      scopes: this.currentTokens.scope?.split(' ') || [],
      expiresAt,
    };
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const status = await this.getAuthStatus();
    return status.isAuthenticated && status.hasValidToken;
  }
}

// Singleton instance
let googleAuthServiceInstance: GoogleAuthService | null = null;

export function getGoogleAuthService(): GoogleAuthService {
  if (!googleAuthServiceInstance) {
    googleAuthServiceInstance = new GoogleAuthService();
  }
  return googleAuthServiceInstance;
}
