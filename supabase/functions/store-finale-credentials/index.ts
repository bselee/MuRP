/**
 * Supabase Edge Function: store-finale-credentials
 *
 * Persists Finale API credentials inside the secure vault table so that
 * server-side sync jobs can reuse the same source of truth.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: 'Supabase environment not configured' }, 500);
    }

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const accessToken = authHeader.replace('Bearer ', '');

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const payload = await req.json();
    const apiKey: string = payload?.apiKey ?? '';
    const apiSecret: string = payload?.apiSecret ?? '';
    const accountPath: string = payload?.accountPath ?? '';
    const baseUrl: string = payload?.baseUrl ?? 'https://app.finaleinventory.com';

    if (!apiKey || !apiSecret || !accountPath) {
      return jsonResponse({ error: 'Missing required Finale credentials' }, 400);
    }

    const vaultPayload = {
      apiKey,
      apiSecret,
      accountPath,
      baseUrl,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    };

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: upsertError } = await serviceClient.from('vault').upsert(
      {
        name: 'finale_credentials',
        secret: JSON.stringify(vaultPayload),
        description: 'Finale Inventory API credentials',
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'name' },
    );

    if (upsertError) {
      console.error('[store-finale-credentials] Failed to persist secret', upsertError);
      return jsonResponse({ error: 'Failed to store credentials' }, 500);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('[store-finale-credentials] Unexpected error', error);
    return jsonResponse({ error: 'Unexpected error' }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

