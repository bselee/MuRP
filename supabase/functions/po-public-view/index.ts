/**
 * Public PO View Edge Function
 *
 * Serves purchase order details to vendors via shareable links.
 * No authentication required - access controlled via share tokens.
 *
 * Routes:
 * - GET /po-public-view/:token - Get PO data for a share link
 * - GET /po-public-view/:token/email-opened - Track email open (returns 1x1 pixel)
 * - POST /po-public-view/:token/pdf-download - Log PDF download event
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface ShareAccessResult {
  success: boolean;
  po_data: {
    type: 'internal' | 'finale';
    po_id: string;
    order_id: string;
    vendor_name: string;
    order_date: string;
    expected_date: string;
    status: string;
    items: any[];
    subtotal?: number;
    tax?: number;
    shipping?: number;
    total?: number;
    notes?: string;
    tracking_number?: string;
    tracking_status?: string;
    custom_message?: string;
    show_pricing: boolean;
  } | null;
  error_message: string | null;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Expect: /po-public-view/:token or /po-public-view/:token/pdf-download
    if (pathParts.length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: 'Share token required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = pathParts[1];
    const isPdfDownload = pathParts[2] === 'pdf-download';
    const isEmailOpened = pathParts[2] === 'email-opened';

    // Create Supabase client with service role for public access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get request metadata for tracking
    const forwarded = req.headers.get('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0]?.trim() || null;
    const userAgent = req.headers.get('user-agent') || null;
    const referrer = req.headers.get('referer') || null;

    // Generate a session ID for tracking repeated views
    const sessionId = req.headers.get('x-session-id') || crypto.randomUUID();

    // Handle email open tracking (returns 1x1 transparent pixel)
    if (req.method === 'GET' && isEmailOpened) {
      // Find the share link
      const { data: linkData, error: linkError } = await supabase
        .from('po_share_links')
        .select('id')
        .eq('share_token', token)
        .single();

      if (!linkError && linkData) {
        // Check for recent email open from same IP to prevent spam
        // Only log once per IP per hour
        const { data: recentOpen } = await supabase
          .from('po_share_link_access_log')
          .select('id')
          .eq('share_link_id', linkData.id)
          .eq('is_email_open', true)
          .eq('ip_address', ipAddress)
          .gte('accessed_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
          .limit(1)
          .maybeSingle();

        // Only log if no recent open from this IP
        if (!recentOpen) {
          await supabase.from('po_share_link_access_log').insert({
            share_link_id: linkData.id,
            ip_address: ipAddress,
            user_agent: userAgent,
            referrer: 'email_tracking_pixel',
            session_id: `email_open_${Date.now()}`,
            is_email_open: true,
          });

          // Only increment view count for new opens
          await supabase.rpc('increment_share_link_view_count', {
            p_link_id: linkData.id,
          });
        }
      }

      // Return 1x1 transparent PNG
      const pixel = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, // IEND chunk
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82
      ]);

      return new Response(pixel, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'image/png',
          'Content-Length': String(pixel.length),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }

    if (req.method === 'GET') {
      // Log access and get PO data
      const { data, error } = await supabase.rpc('log_po_share_access', {
        p_share_token: token,
        p_ip_address: ipAddress,
        p_user_agent: userAgent,
        p_referrer: referrer,
        p_session_id: sessionId,
      });

      if (error) {
        console.error('[po-public-view] Database error:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to access share link' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const result = data?.[0] as ShareAccessResult | undefined;

      if (!result?.success) {
        return new Response(
          JSON.stringify({
            success: false,
            error: result?.error_message || 'Share link not found or expired'
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Return PO data
      return new Response(
        JSON.stringify({
          success: true,
          data: result.po_data,
          sessionId,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'X-Session-Id': sessionId,
          }
        }
      );
    }

    if (req.method === 'POST' && isPdfDownload) {
      // Log PDF download event
      const { data: linkData, error: linkError } = await supabase
        .from('po_share_links')
        .select('id')
        .eq('share_token', token)
        .eq('is_active', true)
        .single();

      if (linkError || !linkData) {
        return new Response(
          JSON.stringify({ success: false, error: 'Share link not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update the most recent access log entry to mark PDF as downloaded
      const { error: updateError } = await supabase
        .from('po_share_link_access_log')
        .update({ pdf_downloaded: true })
        .eq('share_link_id', linkData.id)
        .eq('session_id', sessionId)
        .order('accessed_at', { ascending: false })
        .limit(1);

      if (updateError) {
        console.error('[po-public-view] Failed to log PDF download:', updateError);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[po-public-view] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
