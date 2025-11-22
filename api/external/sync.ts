/**
 * External Sync API Endpoint
 * Triggers synchronization for all enabled external data sources
 * GET /api/external/sync
 */

// Helper functions for API endpoints
class ApiError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'ApiError';
  }
}

function handleError(error: any): Response {
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';
  return new Response(JSON.stringify({ error: message }), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json' },
  });
}

function successResponse(data: any): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getQueryParam(request: Request, param: string): string | null {
  const url = new URL(request.url);
  return url.searchParams.get(param);
}

async function requireRole(request: Request, role: string): Promise<{ user: any }> {
  // Simplified auth check for Vercel deployment
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError('Unauthorized', 401);
  }
  // Return mock user for now - in production, validate JWT token
  return { user: { id: 'system', role } };
}

export default async function handler(request: Request): Promise<Response> {
  // Handle OPTIONS for CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return handleError(new ApiError('Unauthorized', 401));
  }

  try {
    // CRITICAL: Perform auth check first and ensure any auth failures return 401
    // This must happen before any admin client or connector imports
    let auth;
    try {
      auth = await requireRole(request, 'admin');
    } catch (authError: any) {
      // If auth fails for ANY reason (missing token, invalid token, missing env vars, etc.),
      // always return 401 instead of 500
      console.error('[Sync] Auth failed:', authError.message);
      if (authError instanceof ApiError && authError.statusCode === 401) {
        throw authError; // Preserve 401 errors
      }
      // Convert any other auth-related errors to 401
      throw new ApiError('Unauthorized', 401);
    }

    // Optional: sync specific source by ID
    const sourceId = getQueryParam(request, 'source_id');

    console.log(`[Sync] Triggered by user ${auth.user.id}${sourceId ? ` for source ${sourceId}` : ''}`);

    // For now, return success - actual sync logic would use Supabase functions
    // This endpoint is a placeholder for external sync triggers
    
    return successResponse({
      success: true,
      message: 'Sync endpoint called successfully',
      sourceId: sourceId || 'all',
      note: 'This is a placeholder - actual sync logic runs via Supabase functions'
    });
  } catch (error) {
    return handleError(error);
  }
}

export const config = {
  runtime: 'nodejs',
  maxDuration: 300, // 5 minutes for long sync operations
};
