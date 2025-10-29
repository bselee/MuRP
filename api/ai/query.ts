/**
 * AI Query API Endpoint
 * Secure server-side wrapper for Gemini API
 * POST /api/ai/query
 */

import { GoogleGenAI } from '@google/genai';
import { requireAuth, handleError, successResponse, parseJsonBody, ApiError } from '../../lib/api/helpers';

interface QueryRequest {
  query: string;
  context?: any;
}

export default async function handler(request: Request): Promise<Response> {
  // Handle OPTIONS for CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Require authentication
    const auth = await requireAuth(request);

    // Parse request body
    const body = await parseJsonBody<QueryRequest>(request);

    if (!body.query || typeof body.query !== 'string') {
      throw new ApiError('Missing or invalid query parameter', 400);
    }

    // Initialize Gemini AI (server-side only)
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      throw new ApiError('Gemini API key not configured', 500, 'GEMINI_NOT_CONFIGURED');
    }

    const genAI = new GoogleGenAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    // Build prompt with context if provided
    let prompt = body.query;
    if (body.context) {
      prompt = `Context: ${JSON.stringify(body.context)}\n\nQuery: ${body.query}`;
    }

    // Generate response
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Log for auditing
    console.log(`[AI Query] User ${auth.user.id} asked: ${body.query.substring(0, 100)}...`);

    return successResponse({
      response: text,
      model: 'gemini-pro',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return handleError(error);
  }
}

// Vercel serverless function export
export const config = {
  runtime: 'edge',
};
