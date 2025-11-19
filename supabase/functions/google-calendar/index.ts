import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CalendarConfig {
  calendarId: string;
  timeZone?: string;
}

interface BuildEvent {
  id?: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  materials?: Array<{
    component_name: string;
    quantity: number;
    unit: string;
    vendor: string;
    cost: number;
  }>;
}

serve(async (req) => {
  // Handle CORS preflight requests
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const { action, calendarId, timeZone, event, eventId, daysAhead } = await req.json();

    // Get user's Google access token from session
    const { data: session } = await supabaseClient.auth.getSession();
    const accessToken = session?.session?.provider_token;

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'No Google access token found. Please reconnect Google account.' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    const calendarApiBase = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId || 'primary')}`;

    switch (action) {
      case 'list': {
        // List upcoming events
        const now = new Date();
        const futureDate = new Date();
        futureDate.setDate(now.getDate() + (daysAhead || 90));

        const params = new URLSearchParams({
          timeMin: now.toISOString(),
          timeMax: futureDate.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
        });

        const response = await fetch(`${calendarApiBase}/events?${params}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Google Calendar API error: ${response.statusText}`);
        }

        const data = await response.json();
        const events = data.items?.map((item: any) => ({
          id: item.id,
          title: item.summary,
          start: new Date(item.start.dateTime || item.start.date),
          end: new Date(item.end.dateTime || item.end.date),
          description: item.description,
          location: item.location,
        })) || [];

        return new Response(JSON.stringify({ events }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'create': {
        // Create new event
        const googleEvent = {
          summary: event.title,
          description: event.description || '',
          location: event.location || '',
          start: {
            dateTime: event.start,
            timeZone: timeZone || 'America/Los_Angeles',
          },
          end: {
            dateTime: event.end,
            timeZone: timeZone || 'America/Los_Angeles',
          },
          extendedProperties: {
            private: {
              materials: event.materials ? JSON.stringify(event.materials) : undefined,
            },
          },
        };

        const response = await fetch(`${calendarApiBase}/events`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(googleEvent),
        });

        if (!response.ok) {
          throw new Error(`Failed to create event: ${response.statusText}`);
        }

        const createdEvent = await response.json();
        return new Response(JSON.stringify({ eventId: createdEvent.id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'update': {
        // Update existing event
        const googleEvent = {
          summary: event.title,
          description: event.description || '',
          location: event.location || '',
          start: {
            dateTime: event.start,
            timeZone: timeZone || 'America/Los_Angeles',
          },
          end: {
            dateTime: event.end,
            timeZone: timeZone || 'America/Los_Angeles',
          },
          extendedProperties: {
            private: {
              materials: event.materials ? JSON.stringify(event.materials) : undefined,
            },
          },
        };

        const response = await fetch(`${calendarApiBase}/events/${eventId}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(googleEvent),
        });

        if (!response.ok) {
          throw new Error(`Failed to update event: ${response.statusText}`);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'delete': {
        // Delete event
        const response = await fetch(`${calendarApiBase}/events/${eventId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok && response.status !== 404) {
          throw new Error(`Failed to delete event: ${response.statusText}`);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'listCalendars': {
        // List available calendars
        const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to list calendars: ${response.statusText}`);
        }

        const data = await response.json();
        const calendars = data.items?.map((cal: any) => ({
          id: cal.id,
          summary: cal.summary,
          description: cal.description,
          timeZone: cal.timeZone,
          primary: cal.primary || false,
        })) || [];

        return new Response(JSON.stringify({ calendars }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
    }
  } catch (error) {
    console.error('Error in google-calendar function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
