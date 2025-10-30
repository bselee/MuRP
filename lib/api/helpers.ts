/**
 * API Helpers
 * Common utilities for API routes
 */

import { createServerClient } from '../supabase';
import type { User } from '@supabase/supabase-js';

// =============================================================================
// AUTHENTICATION
// =============================================================================

export interface AuthContext {
  user: User;
  token: string;
}

/**
 * Extract and validate authentication from request headers
 */
export async function authenticate(request: Request): Promise<AuthContext | null> {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  
  try {
    // Create client with user token to verify
    const supabase = createServerClient(token);
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      console.error('[Auth] Token verification failed:', error);
      return null;
    }

    return { user, token };
  } catch (error) {
    console.error('[Auth] Authentication error:', error);
    return null;
  }
}

/**
 * Require authentication or return 401
 */
export async function requireAuth(request: Request): Promise<AuthContext> {
  const auth = await authenticate(request);
  
  if (!auth) {
    throw new ApiError('Unauthorized', 401);
  }
  
  return auth;
}

/**
 * Check if user has required role
 */
export async function requireRole(request: Request, role: string): Promise<AuthContext> {
  const auth = await requireAuth(request);
  
  // Fetch user role from database
  const { getSupabaseAdmin } = await import('../supabase');
  const admin = getSupabaseAdmin();
  const { data: userData, error } = await admin
    .from('users')
    .select('role')
    .eq('id', auth.user.id)
    .single();

  if (error || !userData) {
    throw new ApiError('User not found', 404);
  }

  if (userData.role !== role && userData.role !== 'admin') {
    throw new ApiError('Forbidden: insufficient permissions', 403);
  }

  return auth;
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleError(error: unknown): Response {
  console.error('[API Error]', error);

  if (error instanceof ApiError) {
    return new Response(
      JSON.stringify({
        error: error.message,
        code: error.code,
      }),
      {
        status: error.statusCode,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Generic error
  return new Response(
    JSON.stringify({
      error: 'Internal server error',
    }),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

// =============================================================================
// RESPONSE HELPERS
// =============================================================================

export function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}

export function successResponse(data?: any, message?: string): Response {
  return jsonResponse({
    success: true,
    message,
    data,
  });
}

export function errorResponse(message: string, status: number = 400): Response {
  return jsonResponse({
    success: false,
    error: message,
  }, status);
}

// =============================================================================
// REQUEST PARSING
// =============================================================================

export async function parseJsonBody<T = any>(request: Request): Promise<T> {
  try {
    const body = await request.json();
    return body as T;
  } catch (error) {
    throw new ApiError('Invalid JSON body', 400);
  }
}

export function getQueryParam(request: Request, param: string): string | null {
  const url = new URL(request.url);
  return url.searchParams.get(param);
}

export function getRequiredQueryParam(request: Request, param: string): string {
  const value = getQueryParam(request, param);
  
  if (!value) {
    throw new ApiError(`Missing required query parameter: ${param}`, 400);
  }
  
  return value;
}

// =============================================================================
// CORS HELPERS
// =============================================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function corsResponse(response: Response): Response {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export function optionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

// =============================================================================
// VALIDATION
// =============================================================================

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

export function requireField<T>(obj: any, field: string): T {
  if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
    throw new ApiError(`Missing required field: ${field}`, 400);
  }
  return obj[field];
}
