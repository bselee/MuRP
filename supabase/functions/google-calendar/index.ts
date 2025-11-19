import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verify user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { action, ...params } = await req.json();

    // Get user's Google OAuth token from Supabase session
    const { data: session } = await supabaseClient.auth.getSession();
    const providerToken = session?.session?.provider_token;

    if (!providerToken) {
      throw new Error('Google OAuth token not found. Please reconnect your Google account.');
    }

    switch (action) {
      case 'list_calendars':
        return await listCalendars(providerToken);
      
      case 'create_event':
        return await createEvent(providerToken, params);
      
      case 'update_event':
        return await updateEvent(providerToken, params);
      
      case 'delete_event':
        return await deleteEvent(providerToken, params);
      
      case 'list_events':
        return await listEvents(providerToken, params);
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

async function listCalendars(accessToken: string) {
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to list calendars: ${response.statusText}`);
  }

  const data = await response.json();
  const calendars = data.items.map((cal: any) => ({
    id: cal.id,
    summary: cal.summary,
    description: cal.description,
    timeZone: cal.timeZone,
    primary: cal.primary,
  }));

  return new Response(
    JSON.stringify({ calendars }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

async function createEvent(accessToken: string, params: any) {
  const { calendarId, event } = params;
  
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to create event: ${response.statusText}`);
  }

  const data = await response.json();
  
  return new Response(
    JSON.stringify({ eventId: data.id, event: data }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

async function updateEvent(accessToken: string, params: any) {
  const { calendarId, eventId, event } = params;
  
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to update event: ${response.statusText}`);
  }

  const data = await response.json();
  
  return new Response(
    JSON.stringify({ success: true, event: data }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

async function deleteEvent(accessToken: string, params: any) {
  const { calendarId, eventId } = params;
  
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete event: ${response.statusText}`);
  }
  
  return new Response(
    JSON.stringify({ success: true }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

async function listEvents(accessToken: string, params: any) {
  const { calendarId, timeMin, timeMax, maxResults = 100 } = params;
  
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`);
  if (timeMin) url.searchParams.set('timeMin', timeMin);
  if (timeMax) url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('maxResults', maxResults.toString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list events: ${response.statusText}`);
  }

  const data = await response.json();
  
  return new Response(
    JSON.stringify({ events: data.items || [] }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}
