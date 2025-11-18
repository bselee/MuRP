import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    const { email, role = 'Staff', department = 'Purchasing' } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required.' }), { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Missing service configuration.' }), { status: 500, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        role,
        department,
      },
    });

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ data }), { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('[admin-invite] error:', error);
    const message = error?.message ?? 'Unexpected error';
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: corsHeaders });
  }
});
