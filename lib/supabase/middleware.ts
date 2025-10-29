// lib/supabase/middleware.ts
// Middleware for authentication and session management

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/supabase'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Refresh session if expired
  const { data: { user }, error } = await supabase.auth.getUser()

  // Protect API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    // Skip auth check for public endpoints
    const publicEndpoints = ['/api/health', '/api/auth/login', '/api/auth/signup']
    const isPublicEndpoint = publicEndpoints.some(endpoint => 
      request.nextUrl.pathname.startsWith(endpoint)
    )

    if (!isPublicEndpoint && (!user || error)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
  }

  // Protect dashboard routes
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!user || error) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return response
}
