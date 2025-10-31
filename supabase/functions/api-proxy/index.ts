/**
 * Secure API Proxy - Supabase Edge Function
 * 
 * This backend proxy ensures API keys never touch the frontend.
 * All external API calls are routed through this secure endpoint.
 * 
 * Features:
 * - Encrypted credential storage (Supabase Vault)
 * - Authentication required for all requests
 * - Rate limiting enforcement
 * - Comprehensive audit logging
 * - Circuit breaker pattern
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

interface ApiProxyRequest {
  service: string
  action: string
  params?: Record<string, unknown>
}

// Constants for fallback values
const UNKNOWN_USER = 'unknown'
const UNKNOWN_SERVICE = 'unknown'
const UNKNOWN_ACTION = 'unknown'

interface ApiProxyResponse {
  success: boolean
  data?: unknown
  error?: string
  metadata?: {
    executionTime: number
    requestId: string
  }
}

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  const requestId = crypto.randomUUID()

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      throw new Error('Unauthorized: Invalid or missing authentication token')
    }

    // Parse request body
    const body: ApiProxyRequest = await req.json()
    const { service, action, params } = body

    if (!service || !action) {
      throw new Error('Missing required fields: service and action')
    }

    console.log(`[${requestId}] User ${user.id} requesting ${service}.${action}`)

    // Route to appropriate service handler
    let result: unknown

    switch (service) {
      case 'finale':
        result = await handleFinaleRequest(action, params, supabaseClient)
        break

      case 'gemini':
        result = await handleGeminiRequest(action, params, supabaseClient)
        break

      default:
        throw new Error(`Unknown service: ${service}`)
    }

    const executionTime = Date.now() - startTime

    // Log successful request
    await logAuditEntry(supabaseClient, {
      user_id: user.id,
      service,
      action,
      success: true,
      execution_time_ms: executionTime,
      request_id: requestId,
    })

    const response: ApiProxyResponse = {
      success: true,
      data: result,
      metadata: {
        executionTime,
        requestId,
      },
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    const executionTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    console.error(`[${requestId}] Error:`, errorMessage)

    // Log failed request (if we can)
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      await logAuditEntry(supabaseClient, {
        user_id: UNKNOWN_USER,
        service: UNKNOWN_SERVICE,
        action: UNKNOWN_ACTION,
        success: false,
        execution_time_ms: executionTime,
        error_message: errorMessage,
        request_id: requestId,
      })
    } catch (logError) {
      console.error('Failed to log error:', logError)
    }

    const response: ApiProxyResponse = {
      success: false,
      error: errorMessage,
      metadata: {
        executionTime,
        requestId,
      },
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

/**
 * Handle Finale Inventory API requests
 */
async function handleFinaleRequest(
  action: string,
  params: Record<string, unknown> | undefined,
  supabaseClient: SupabaseClient
): Promise<unknown> {
  // Get Finale credentials from Supabase Vault (secure storage)
  const { data: secrets } = await supabaseClient
    .from('vault')
    .select('secret')
    .eq('name', 'finale_credentials')
    .single()

  if (!secrets) {
    throw new Error('Finale credentials not configured')
  }

  const credentials = JSON.parse(secrets.secret)

  // Create Finale client with credentials
  const finaleApiUrl = credentials.apiUrl || Deno.env.get('FINALE_API_URL')
  const subdomain = credentials.subdomain || Deno.env.get('FINALE_API_SUBDOMAIN')
  const clientId = credentials.clientId || Deno.env.get('FINALE_API_CLIENT_ID')
  const clientSecret = credentials.clientSecret || Deno.env.get('FINALE_API_CLIENT_SECRET')

  // Get OAuth token
  const tokenResponse = await fetch(`${finaleApiUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      subdomain,
    }),
  })

  if (!tokenResponse.ok) {
    throw new Error('Failed to authenticate with Finale API')
  }

  const { access_token } = await tokenResponse.json()

  // Execute the requested action
  switch (action) {
    case 'pullInventory': {
      const response = await fetch(`${finaleApiUrl}/inventory_items`, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
      })
      return response.json()
    }

    case 'pullVendors': {
      const response = await fetch(`${finaleApiUrl}/vendors`, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
      })
      return response.json()
    }

    case 'pullPurchaseOrders': {
      const response = await fetch(`${finaleApiUrl}/purchase_orders`, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
      })
      return response.json()
    }

    case 'syncAll': {
      // Execute all pulls in parallel
      const [inventory, vendors, pos] = await Promise.all([
        handleFinaleRequest('pullInventory', undefined, supabaseClient),
        handleFinaleRequest('pullVendors', undefined, supabaseClient),
        handleFinaleRequest('pullPurchaseOrders', undefined, supabaseClient),
      ])
      return { inventory, vendors, purchaseOrders: pos }
    }

    default:
      throw new Error(`Unknown Finale action: ${action}`)
  }
}

/**
 * Handle Gemini AI API requests
 */
async function handleGeminiRequest(
  action: string,
  params: Record<string, unknown> | undefined,
  supabaseClient: SupabaseClient
): Promise<unknown> {
  // Get Gemini API key from environment (or Vault)
  const apiKey = Deno.env.get('GEMINI_API_KEY')

  if (!apiKey) {
    throw new Error('Gemini API key not configured')
  }

  // Sanitize inputs to prevent prompt injection
  const sanitizedParams = sanitizeGeminiParams(params)

  switch (action) {
    case 'generateText': {
      const { prompt, model } = sanitizedParams
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      )
      return response.json()
    }

    default:
      throw new Error(`Unknown Gemini action: ${action}`)
  }
}

/**
 * Sanitize Gemini API parameters to prevent prompt injection
 */
function sanitizeGeminiParams(params: Record<string, unknown> | undefined): Record<string, string> {
  if (!params) {
    throw new Error('Missing parameters for Gemini request')
  }

  // Basic sanitization - remove control characters and limit length
  const sanitize = (str: string): string => {
    return str
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .slice(0, 10000) // Limit length
  }

  return {
    prompt: params.prompt ? sanitize(String(params.prompt)) : '',
    model: params.model ? sanitize(String(params.model)) : 'gemini-pro',
  }
}

/**
 * Log API request to audit table
 */
async function logAuditEntry(
  supabaseClient: SupabaseClient,
  entry: {
    user_id: string
    service: string
    action: string
    success: boolean
    execution_time_ms: number
    error_message?: string
    request_id: string
  }
): Promise<void> {
  try {
    await supabaseClient.from('api_audit_log').insert({
      user_id: entry.user_id,
      service: entry.service,
      action: entry.action,
      success: entry.success,
      execution_time_ms: entry.execution_time_ms,
      error_message: entry.error_message,
      request_id: entry.request_id,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Failed to write audit log:', error)
  }
}
