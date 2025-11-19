import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';

interface TokenBundle {
  accessToken: string;
  refreshToken: string | null;
  expiresAt?: string | null;
}

interface GoogleContext {
  supabaseClient: any;
  userId: string;
  tokens: TokenBundle;
}

interface SanitizedEvent {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: string | null;
  end: string | null;
  extendedProperties?: Record<string, Record<string, string>>;
}

interface ProductionEvent extends SanitizedEvent {
  finishedSku: string | null;
  quantity: number | null;
  skuSource: 'extended_properties' | 'description' | 'summary' | 'unknown';
  quantitySource: 'extended_properties' | 'description' | 'summary' | 'unknown';
  materials?: Array<Record<string, unknown>> | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const {
      data: { session },
    } = await supabaseClient.auth.getSession();

    if (!session) {
      throw new Error('Unauthorized');
    }

    const body = await req.json();
    const { action, ...params } = body ?? {};

    if (!action) {
      throw new Error('Missing action parameter');
    }

    const tokens = await loadTokenBundle(supabaseClient, user.id, session);
    const googleContext: GoogleContext = {
      supabaseClient,
      userId: user.id,
      tokens,
    };

    switch (action) {
      case 'list_calendars':
        return await handleListCalendars(googleContext);

      case 'list_events':
        return await handleListEvents(googleContext, params);

      case 'list_production_events':
        return await handleListProductionEvents(googleContext, params);

      case 'create_event':
        return await handleCreateEvent(googleContext, params);

      case 'update_event':
        return await handleUpdateEvent(googleContext, params);

      case 'delete_event':
        return await handleDeleteEvent(googleContext, params);

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('[google-calendar] Error:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const status = message === 'Unauthorized' ? 401 : 400;

    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status,
      }
    );
  }
});

async function handleListCalendars(ctx: GoogleContext): Promise<Response> {
  const response = await authorizedGoogleFetch(
    ctx,
    'https://www.googleapis.com/calendar/v3/users/me/calendarList'
  );

  const data = await response.json();
  const calendars = (data.items ?? []).map((cal: any) => ({
    id: cal.id,
    summary: cal.summary,
    description: cal.description,
    timeZone: cal.timeZone,
    primary: Boolean(cal.primary),
  }));

  return jsonResponse({ calendars });
}

async function handleListEvents(ctx: GoogleContext, params: any): Promise<Response> {
  const events = await fetchCalendarEvents(ctx, params);
  return jsonResponse({ events });
}

async function handleListProductionEvents(ctx: GoogleContext, params: any): Promise<Response> {
  const events = await fetchCalendarEvents(ctx, params);
  const productionEvents: ProductionEvent[] = events.map((event) => {
    const metadata = parseProductionMetadata(event);
    return {
      ...event,
      finishedSku: metadata.finishedSku,
      quantity: metadata.quantity,
      skuSource: metadata.skuSource,
      quantitySource: metadata.quantitySource,
      materials: metadata.materials,
    };
  });

  return jsonResponse({ events: productionEvents });
}

async function handleCreateEvent(ctx: GoogleContext, params: any): Promise<Response> {
  const calendarId = params.calendarId || 'primary';
  const eventPayload = buildGoogleEventPayload(params.event, params.timeZone);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

  const response = await authorizedGoogleFetch(ctx, url, {
    method: 'POST',
    body: JSON.stringify(eventPayload),
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await response.json();
  return jsonResponse({ eventId: data.id, event: data });
}

async function handleUpdateEvent(ctx: GoogleContext, params: any): Promise<Response> {
  const calendarId = params.calendarId || 'primary';
  const eventId = params.eventId;

  if (!eventId) {
    throw new Error('Missing eventId');
  }

  const eventPayload = buildGoogleEventPayload(params.event, params.timeZone);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`;

  await authorizedGoogleFetch(ctx, url, {
    method: 'PUT',
    body: JSON.stringify(eventPayload),
    headers: { 'Content-Type': 'application/json' },
  });

  return jsonResponse({ success: true });
}

async function handleDeleteEvent(ctx: GoogleContext, params: any): Promise<Response> {
  const calendarId = params.calendarId || 'primary';
  const eventId = params.eventId;

  if (!eventId) {
    throw new Error('Missing eventId');
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`;

  await authorizedGoogleFetch(ctx, url, {
    method: 'DELETE',
  });

  return jsonResponse({ success: true });
}

async function fetchCalendarEvents(ctx: GoogleContext, params: any): Promise<SanitizedEvent[]> {
  const calendarId = params.calendarId || 'primary';
  const maxResults = Math.min(params.maxResults ?? 250, 250);
  const windowDays = params.windowDays ?? null;

  let { timeMin, timeMax } = params;

  if (!timeMin || !timeMax) {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + (windowDays ?? 90));
    timeMin = timeMin || now.toISOString();
    timeMax = timeMax || end.toISOString();
  }

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  if (timeMin) url.searchParams.set('timeMin', timeMin);
  if (timeMax) url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', String(maxResults));

  const response = await authorizedGoogleFetch(ctx, url.toString());
  const data = await response.json();

  return (data.items ?? []).map((item: any) => sanitizeEvent(item));
}

function sanitizeEvent(item: any): SanitizedEvent {
  return {
    id: item.id,
    summary: item.summary ?? '',
    description: item.description ?? '',
    location: item.location ?? '',
    start: item.start?.dateTime || item.start?.date || null,
    end: item.end?.dateTime || item.end?.date || null,
    extendedProperties: item.extendedProperties,
  };
}

function buildGoogleEventPayload(event: any, timeZone?: string) {
  if (!event) {
    throw new Error('Missing event payload');
  }

  const tz = timeZone || 'America/Los_Angeles';
  const payload: Record<string, unknown> = {
    summary: event.title,
    description: event.description || '',
    location: event.location || '',
    start: buildDateTimePayload(event.start, tz),
    end: buildDateTimePayload(event.end, tz),
  };

  const privateProps: Record<string, string> = {};

  if (event.finishedSku) {
    privateProps.finishedSku = String(event.finishedSku);
  }

  if (typeof event.quantity !== 'undefined' && event.quantity !== null) {
    privateProps.quantity = String(event.quantity);
  }

  if (event.materials) {
    privateProps.materials = JSON.stringify(event.materials);
  }

  if (Object.keys(privateProps).length > 0) {
    payload.extendedProperties = { private: privateProps };
  }

  if (event.reminders) {
    payload.reminders = event.reminders;
  }

  return payload;
}

function buildDateTimePayload(value: string | undefined, timeZone: string) {
  if (!value) {
    return undefined;
  }

  // If value is a date string without time, treat it as all-day event
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (isDateOnly) {
    return { date: value };
  }

  return {
    dateTime: value,
    timeZone,
  };
}

function parseProductionMetadata(event: SanitizedEvent) {
  const privateProps = event.extendedProperties?.private ?? {};
  const sharedProps = event.extendedProperties?.shared ?? {};

  const finishedSkuProp =
    privateProps.finishedSku ||
    privateProps.finished_sku ||
    sharedProps.finishedSku ||
    sharedProps.finished_sku ||
    null;

  const quantityProp =
    privateProps.quantity ||
    privateProps.qty ||
    sharedProps.quantity ||
    sharedProps.qty ||
    null;

  const materialsProp = privateProps.materials || sharedProps.materials || null;

  let skuSource: ProductionEvent['skuSource'] = 'unknown';
  let quantitySource: ProductionEvent['quantitySource'] = 'unknown';
  let finishedSku = finishedSkuProp ? String(finishedSkuProp).trim() : null;
  let quantity = quantityProp ? Number(quantityProp) : null;
  let materials: Array<Record<string, unknown>> | null = null;

  if (materialsProp) {
    const parsed = safeJsonParse(materialsProp);
    if (Array.isArray(parsed)) {
      materials = parsed as Array<Record<string, unknown>>;
    }
  }

  if (finishedSku) {
    skuSource = 'extended_properties';
    finishedSku = finishedSku.toUpperCase();
  }

  if (typeof quantity === 'number' && !Number.isFinite(quantity)) {
    quantity = null;
  }

  if (!finishedSku) {
    const summarySku = extractSkuFromText(event.summary);
    const descriptionSku = extractSkuFromText(event.description);
    finishedSku = summarySku || descriptionSku;
    if (finishedSku) {
      skuSource = summarySku ? 'summary' : 'description';
    }
  }

  if (!quantity) {
    const descriptionQty = extractQuantityFromText(event.description);
    const summaryQty = descriptionQty ? null : extractQuantityFromText(event.summary);
    quantity = descriptionQty ?? summaryQty;
    if (quantity) {
      quantitySource = descriptionQty ? 'description' : 'summary';
    }
  } else {
    quantitySource = 'extended_properties';
  }

  return {
    finishedSku,
    quantity,
    skuSource,
    quantitySource,
    materials,
  };
}

function extractSkuFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const patterns = [
    /(?:Finished\s*Sku|Finished\s*Good|SKU|FG)\s*(?:#|:|=)?\s*([A-Za-z0-9._-]+)/i,
    /\b([A-Z]{2,}-[A-Z0-9]{2,})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
  }

  return null;
}

function extractQuantityFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const patterns = [
    /(?:Qty|Quantity|Units|Batches)\s*(?:#|:|=)?\s*([0-9,.]+)/i,
    /([0-9,.]+)\s*(?:units|bags|cases|batches|ea|pcs)\b/i,
    /([0-9,.]+)x\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const value = Number(match[1].replace(/,/g, ''));
      if (!Number.isNaN(value)) {
        return value;
      }
    }
  }

  return null;
}

async function authorizedGoogleFetch(ctx: GoogleContext, url: string, init: RequestInit = {}) {
  if (!ctx.tokens.accessToken) {
    throw new Error('Google OAuth token not found. Please reconnect your Google account.');
  }

  const makeRequest = async (token: string) => {
    const headers = new Headers(init.headers ?? {});
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    return await fetch(url, {
      ...init,
      headers,
    });
  };

  let response = await makeRequest(ctx.tokens.accessToken);

  if (response.status === 401 && ctx.tokens.refreshToken) {
    const refreshed = await refreshGoogleAccessToken(ctx.tokens.refreshToken, ctx.supabaseClient, ctx.userId);
    ctx.tokens.accessToken = refreshed.accessToken;
    ctx.tokens.expiresAt = refreshed.expiresAt ?? null;
    response = await makeRequest(ctx.tokens.accessToken);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google API error (${response.status}): ${errorText || response.statusText}`);
  }

  return response;
}

async function loadTokenBundle(supabaseClient: any, userId: string, session: any): Promise<TokenBundle> {
  let accessToken: string | null = session?.provider_token ?? null;
  let refreshToken: string | null = session?.provider_refresh_token ?? null;
  let expiresAt: string | null = null;

  const { data: storedTokens } = await supabaseClient
    .from('user_oauth_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle();

  if (storedTokens) {
    if (!accessToken && storedTokens.access_token) {
      accessToken = storedTokens.access_token;
    }
    if (!refreshToken && storedTokens.refresh_token) {
      refreshToken = storedTokens.refresh_token;
    }
    expiresAt = storedTokens.expires_at;
  }

  const isExpired = expiresAt ? Date.parse(expiresAt) - 60_000 < Date.now() : false;

  if ((isExpired || !accessToken) && refreshToken) {
    const refreshed = await refreshGoogleAccessToken(refreshToken, supabaseClient, userId);
    accessToken = refreshed.accessToken;
    expiresAt = refreshed.expiresAt ?? null;
  }

  if (!accessToken) {
    throw new Error('Google OAuth token not found. Please reconnect your Google account.');
  }

  return {
    accessToken,
    refreshToken,
    expiresAt,
  };
}

async function refreshGoogleAccessToken(
  refreshToken: string,
  supabaseClient: any,
  userId: string
): Promise<{ accessToken: string; expiresAt?: string | null }> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Server is missing Google OAuth credentials. Set GOOGLE_CLIENT_ID/SECRET.');
  }

  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to refresh Google token: ${text || response.statusText}`);
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('Google token refresh response missing access_token');
  }

  const expiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
    : null;

  await persistTokens(supabaseClient, userId, {
    access_token: data.access_token,
    refresh_token: refreshToken,
    expires_at: expiresAt,
  });

  return { accessToken: data.access_token, expiresAt };
}

async function persistTokens(
  supabaseClient: any,
  userId: string,
  tokens: { access_token: string; refresh_token: string | null; expires_at: string | null }
) {
  try {
    const { error } = await supabaseClient
      .from('user_oauth_tokens')
      .upsert(
        {
          user_id: userId,
          provider: 'google',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_at,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      );

    if (error) {
      console.warn('[google-calendar] Failed to persist tokens:', error.message);
    }
  } catch (err) {
    console.warn('[google-calendar] Error persisting tokens:', err);
  }
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch (_err) {
    return null;
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(
    JSON.stringify(body),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    }
  );
}
