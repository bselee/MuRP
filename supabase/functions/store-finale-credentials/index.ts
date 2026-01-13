/**
 * Supabase Edge Function: store-finale-credentials
 *
 * Persists Finale API credentials inside the secure vault table so that
 * server-side sync jobs can reuse the same source of truth.
 *
 * Also stores the service role key in Supabase Vault extension so that
 * scheduled pg_cron jobs (trigger_auto_sync) can authenticate.
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

    // Store Finale credentials in vault table
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
      console.error('[store-finale-credentials] Failed to persist Finale credentials', upsertError);
      return jsonResponse({ error: 'Failed to store credentials' }, 500);
    }

    // Also store the service role key in Supabase Vault extension
    // This enables scheduled pg_cron jobs (trigger_auto_sync) to work automatically
    let vaultSecretStored = false;
    try {
      // Check if secret already exists
      const { data: existingSecret } = await serviceClient.rpc('check_vault_secret_exists', {
        secret_name: 'supabase_service_role_key'
      }).maybeSingle();

      if (!existingSecret) {
        // Try to create the secret using vault.create_secret
        const { error: vaultError } = await serviceClient.rpc('create_vault_secret_if_not_exists', {
          p_secret: serviceRoleKey,
          p_name: 'supabase_service_role_key',
          p_description: 'Service role key for scheduled sync jobs'
        });

        if (!vaultError) {
          vaultSecretStored = true;
          console.log('[store-finale-credentials] Service role key stored in Vault extension');
        } else {
          console.warn('[store-finale-credentials] Could not store in Vault extension:', vaultError.message);
        }
      } else {
        vaultSecretStored = true;
        console.log('[store-finale-credentials] Service role key already exists in Vault');
      }
    } catch (vaultErr) {
      // Vault extension might not be available or RPC functions don't exist
      // This is not a critical error - manual setup via Dashboard still works
      console.warn('[store-finale-credentials] Vault extension setup skipped:', vaultErr);
    }

    return jsonResponse({
      success: true,
      vaultSecretConfigured: vaultSecretStored,
      message: vaultSecretStored
        ? 'Credentials stored. Scheduled syncs will work automatically.'
        : 'Credentials stored. For scheduled syncs, add service_role_key to Vault via Dashboard.'
    });
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

