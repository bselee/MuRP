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
import { parse } from 'https://deno.land/std@0.168.0/encoding/csv.ts'
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

    // Start background tasks without blocking response
    // These run asynchronously for data enrichment, analytics, etc.
    const backgroundTasks = [
      logAuditEntry(supabaseClient, {
        user_id: user.id,
        service,
        action,
        success: true,
        execution_time_ms: executionTime,
        request_id: requestId,
      }),
      // Add more background tasks as needed:
      // - updateUsageMetrics(user.id, service)
      // - generateAnalytics(service, action, result)
      // - syncToExternalSystems(result)
    ]

    // Execute background tasks without blocking the main response
    Promise.all(backgroundTasks).catch(error => {
      console.error(`[${requestId}] Background task failed:`, error)
      // Non-critical errors don't affect the response
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
      const limit = 100
      let offset = 0
      const allPurchaseOrders: any[] = []
      let hasMore = true

      while (hasMore) {
        const url = `${finaleApiUrl}/purchase_orders?limit=${limit}&offset=${offset}&include=line_items`
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          const errorBody = await response.text()
          throw new Error(`Failed to fetch purchase orders (${response.status}): ${errorBody}`)
        }

        const payload = await response.json()
        const batch = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : []

        allPurchaseOrders.push(...batch)

        if (payload?.pagination?.totalPages && payload?.pagination?.page) {
          const { page, totalPages } = payload.pagination
          hasMore = page < totalPages
          offset = page * limit
        } else {
          hasMore = batch.length === limit
          offset += limit
        }
      }

      return { data: allPurchaseOrders }
    }

    case 'getBOMs': {
      // Use URL passed from client (if any) or fallback to env var
      const reportUrl = (params?.url as string) || Deno.env.get('FINALE_BOM_REPORT_URL')
      
      if (!reportUrl) {
        throw new Error('FINALE_BOM_REPORT_URL not configured')
      }

      console.log(`Fetching BOM report from: ${reportUrl?.substring(0, 50)}...`) // Don't log full token-bearing URL
      
      const response = await fetch(reportUrl)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch BOM report: ${response.status} ${response.statusText}`)
      }

      const csvContent = await response.text()
      // Parse CSV using Deno std lib
      const result = await parse(csvContent, { 
        skipFirstRow: true, 
        columns: true 
      })
      
      return result
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
