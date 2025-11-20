/**
 * Google OAuth Service
 *
 * Manages OAuth tokens for Google APIs
 * Handles token storage, refresh, and validation
 */

import { supabase } from '../lib/supabase/client';
import { DEFAULT_SCOPES } from '../lib/google/scopes';

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  scope?: string;
  token_type?: string;
}

export interface GoogleAuthStatus {
  isAuthenticated: boolean;
  hasValidToken: boolean;
  scopes: string[];
  expiresAt: Date | null;
  email?: string;
}

export class GoogleAuthService {
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

    if (!clientId) {
      console.warn('[GoogleAuthService] Google OAuth credentials not configured in environment');
      return;
    }

    // Try to load existing tokens
    await this.loadTokensFromDatabase();
  }

  /**
   * Get authentication URL for user consent
   */
  async getAuthUrl(scopes: string[] = DEFAULT_SCOPES): Promise<string> {
    // Prefer hitting the shared API route so scopes stay centralized
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch('/api/google-auth/authorize');
        if (!response.ok) {
          throw new Error(`Failed to fetch authorize URL (${response.status})`);
        }
        const data = await response.json();
        if (data?.authUrl) {
          return data.authUrl as string;
        }
      } catch (error) {
        console.warn('[GoogleAuthService] Failed to fetch authorize URL:', error);
      }
    }

    throw new Error('Unable to start Google OAuth flow');
  }

  async startOAuthFlow(scopes: string[] = DEFAULT_SCOPES): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('OAuth flow can only be initiated in the browser');
    }

    const authUrl = await this.getAuthUrl(scopes);

    await new Promise<void>((resolve, reject) => {
      const popup = window.open(
        authUrl,
        'Google OAuth',
        'width=600,height=700,menubar=no,toolbar=no,status=no'
      );

      const redirectFallback = () => {
        window.location.href = authUrl;
      };

      if (!popup) {
        redirectFallback();
        return;
      }

      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Google OAuth timed out. Please try again.'));
      }, 1000 * 180);

      const cleanup = () => {
        window.removeEventListener('message', handleMessage);
        window.clearTimeout(timeout);
        if (!popup.closed) {
          popup.close();
        }
      };

      const handleMessage = async (event: MessageEvent) => {
        if (!event?.data) return;
        if (event.data.type === 'GOOGLE_AUTH_SUCCESS' && event.data.tokens) {
          try {
            await this.handleAuthCallback(event.data.tokens as GoogleTokens);
            cleanup();
            resolve();
          } catch (error) {
            cleanup();
            reject(error);
          }
        }
      };

      window.addEventListener('message', handleMessage);
    });
  }

  /**
   * Handle OAuth callback with authorization code
   */
  async handleAuthCallback(payload: GoogleTokens): Promise<void> {
    const tokens = payload;
    this.currentTokens = tokens;

    // Save tokens to database
    await this.saveTokensToDatabase(tokens);

    console.log('[GoogleAuthService] Successfully authenticated with Google');
  }

  async getAccessToken(): Promise<string> {
    if (!this.currentTokens) {
      throw new Error('No Google OAuth tokens available. Please authenticate first.');
    }

    if (this.isTokenExpired(this.currentTokens)) {
      await this.refreshTokens();
    }

    if (!this.currentTokens?.access_token) {
      throw new Error('Unable to retrieve Google access token');
    }

    return this.currentTokens.access_token;
  }

  /**
   * Refresh access token via server proxy
   */
  private async refreshTokens(): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No authenticated session');
    }

    const response = await fetch('/api/google-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action: 'refresh' }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to refresh Google token');
    }

    const { access_token, expires_at } = await response.json();
    
    this.currentTokens = {
      access_token,
      expiry_date: new Date(expires_at).getTime(),
    };

    console.log('[GoogleAuthService] Successfully refreshed access token via server proxy');
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
   * Revoke Google OAuth access
   */
  async revokeAccess(): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No authenticated session');
    }

    const response = await fetch('/api/google-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action: 'revoke' }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to revoke Google access');
    }

    this.currentTokens = null;
    console.log('[GoogleAuthService] Google access revoked');
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

    const hasValidToken = !this.isTokenExpired(this.currentTokens);
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

  private isTokenExpired(tokens: GoogleTokens): boolean {
    if (!tokens.expiry_date) {
      return false;
    }
    const buffer = 5 * 60 * 1000;
    return tokens.expiry_date - Date.now() < buffer;
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
