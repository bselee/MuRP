// lib/errors.ts
// Standardized error handling for API responses

export class APIError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message)
    this.name = 'APIError'
  }
}

export class UnauthorizedError extends APIError {
  constructor(message: string = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message)
  }
}

export class ForbiddenError extends APIError {
  constructor(message: string = 'Forbidden') {
    super(403, 'FORBIDDEN', message)
  }
}

export class NotFoundError extends APIError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`)
  }
}

export class BadRequestError extends APIError {
  constructor(message: string, details?: any) {
    super(400, 'BAD_REQUEST', message, details)
  }
}

export class ConflictError extends APIError {
  constructor(message: string) {
    super(409, 'CONFLICT', message)
  }
}

export class InternalServerError extends APIError {
  constructor(message: string = 'Internal server error') {
    super(500, 'INTERNAL_ERROR', message)
  }
}

/**
 * Format error response for API
 */
export function formatErrorResponse(error: unknown) {
  if (error instanceof APIError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      statusCode: error.statusCode,
    }
  }
  
  // Handle Supabase errors
  if (error && typeof error === 'object' && 'code' in error) {
    const dbError = error as any
    return {
      error: {
        code: dbError.code || 'DATABASE_ERROR',
        message: dbError.message || 'Database error occurred',
        details: dbError.details,
      },
      statusCode: 500,
    }
  }
  
  // Generic error
  const message = error instanceof Error ? error.message : 'An unexpected error occurred'
  return {
    error: {
      code: 'UNKNOWN_ERROR',
      message,
    },
    statusCode: 500,
  }
}

/**
 * Log error with context
 */
export function logError(context: string, error: unknown, metadata?: any) {
  const errorData = {
    context,
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : error,
    metadata,
    timestamp: new Date().toISOString(),
  }
  
  console.error('[ERROR]', JSON.stringify(errorData, null, 2))
}
