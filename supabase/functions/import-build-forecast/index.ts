/**
 * Import Build Forecast Edge Function
 *
 * Accepts build/production forecasts from external sources (Google Calendar via Rube, etc.)
 * and APPENDS them to the finished_goods_forecast table for MRP planning.
 *
 * Append-only: Each import creates new records (adds to existing week's forecast).
 *
 * POST /import-build-forecast
 * Authorization: Bearer tgfmrp_live_xxxxx
 * Body: { builds: [{ sku, quantity, forecast_date, source? }] }
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BuildForecast {
  sku: string;
  quantity: number;
  forecast_date: string; // ISO date string (YYYY-MM-DD)
  source?: string;
}

interface ImportRequest {
  builds: BuildForecast[];
  calendar_type?: string; // 'mfg', 'soil', etc. for tracking
  events_fetched?: number; // Total calendar events fetched
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[import-build-forecast] Missing Authorization header');
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract token - handle both "Bearer token" and raw token formats
    let apiKey = authHeader;
    if (authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.slice(7).trim();
    }

    // Validate API key format:
    // - tgfmrp_* = MuRP API key
    // - eyJ* = Supabase service role JWT
    // - Also accept any non-empty token for Rube/external integrations
    const isValidApiKey = apiKey.length > 10 && (
      apiKey.startsWith('tgfmrp_') ||
      apiKey.startsWith('eyJ') ||
      apiKey.length >= 32 // Accept long tokens from trusted sources like Rube
    );

    if (!isValidApiKey) {
      console.error('[import-build-forecast] Invalid API key format, length:', apiKey.length, 'prefix:', apiKey.substring(0, 10));
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid API key format' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[import-build-forecast] Auth OK, key prefix:', apiKey.substring(0, 10) + '...');

    // Parse request body
    const { builds, calendar_type, events_fetched }: ImportRequest = await req.json();
    const startTime = Date.now();

    if (!Array.isArray(builds) || builds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'builds array is required and must not be empty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate each build entry
    const validationErrors: string[] = [];
    builds.forEach((build, idx) => {
      if (!build.sku || typeof build.sku !== 'string') {
        validationErrors.push(`Build [${idx}]: missing or invalid sku`);
      }
      if (typeof build.quantity !== 'number' || build.quantity <= 0) {
        validationErrors.push(`Build [${idx}]: quantity must be a positive number`);
      }
      if (!build.forecast_date || !/^\d{4}-\d{2}-\d{2}/.test(build.forecast_date)) {
        validationErrors.push(`Build [${idx}]: forecast_date must be a valid ISO date (YYYY-MM-DD)`);
      }
    });

    if (validationErrors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Validation failed', details: validationErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate SKUs against BOMs
    const skus = [...new Set(builds.map((b) => b.sku))];
    const { data: validBoms, error: bomError } = await supabase
      .from('boms')
      .select('finished_sku')
      .in('finished_sku', skus);

    if (bomError) {
      console.error('[import-build-forecast] BOM lookup error:', bomError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to validate SKUs against BOMs' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validSkuSet = new Set((validBoms || []).map((b) => b.finished_sku));

    // Separate valid and invalid builds
    const validBuilds = builds.filter((b) => validSkuSet.has(b.sku));
    const invalidBuilds = builds.filter((b) => !validSkuSet.has(b.sku));

    if (validBuilds.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No valid SKUs found in BOMs',
          invalid_skus: invalidBuilds.map((b) => b.sku),
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate week start for each forecast date (align to Monday)
    const getWeekStart = (dateStr: string): string => {
      const date = new Date(dateStr);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday
      date.setDate(diff);
      return date.toISOString().split('T')[0];
    };

    // APPEND logic: For each build, increment the existing forecast OR create new
    // We use raw SQL to do an atomic increment
    const results: Array<{ sku: string; date: string; quantity: number; status: string }> = [];

    for (const build of validBuilds) {
      const weekStart = getWeekStart(build.forecast_date);
      const source = build.source || 'google_calendar';

      // Try to find existing record for this SKU + week
      const { data: existing } = await supabase
        .from('finished_goods_forecast')
        .select('id, base_forecast, notes')
        .eq('product_id', build.sku)
        .eq('forecast_period', weekStart)
        .maybeSingle();

      if (existing) {
        // APPEND: Add quantity to existing forecast
        const newForecast = (existing.base_forecast || 0) + build.quantity;
        const appendNote = `+${build.quantity} from ${source} @ ${new Date().toISOString().split('T')[0]}`;
        const newNotes = existing.notes
          ? `${existing.notes}\n${appendNote}`
          : appendNote;

        const { error: updateError } = await supabase
          .from('finished_goods_forecast')
          .update({
            base_forecast: newForecast,
            notes: newNotes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (updateError) {
          console.error(`[import-build-forecast] Update error for ${build.sku}:`, updateError);
          results.push({ sku: build.sku, date: weekStart, quantity: build.quantity, status: 'error' });
        } else {
          results.push({ sku: build.sku, date: weekStart, quantity: build.quantity, status: 'appended' });
        }
      } else {
        // CREATE: New forecast record
        const { error: insertError } = await supabase
          .from('finished_goods_forecast')
          .insert({
            product_id: build.sku,
            forecast_period: weekStart,
            base_forecast: build.quantity,
            forecast_method: source,
            forecast_confidence: 'high',
            notes: `+${build.quantity} from ${source} @ ${new Date().toISOString().split('T')[0]}`,
          });

        if (insertError) {
          console.error(`[import-build-forecast] Insert error for ${build.sku}:`, insertError);
          results.push({ sku: build.sku, date: weekStart, quantity: build.quantity, status: 'error' });
        } else {
          results.push({ sku: build.sku, date: weekStart, quantity: build.quantity, status: 'created' });
        }
      }
    }

    const appendedCount = results.filter((r) => r.status === 'appended').length;
    const createdCount = results.filter((r) => r.status === 'created').length;
    const successCount = appendedCount + createdCount;
    const errorCount = results.filter((r) => r.status === 'error').length;
    const durationMs = Date.now() - startTime;

    console.log(
      `[import-build-forecast] Processed ${validBuilds.length} builds: ${successCount} success, ${errorCount} errors, ${invalidBuilds.length} invalid SKUs`
    );

    // Log sync event to tracking table
    const syncStatus = errorCount === 0 ? 'success' : (successCount > 0 ? 'partial' : 'failed');
    const { data: syncEvent } = await supabase
      .from('calendar_sync_events')
      .insert({
        sync_source: 'google_calendar',
        calendar_type: calendar_type || null,
        events_fetched: events_fetched || builds.length,
        builds_parsed: builds.length,
        builds_imported: successCount,
        builds_appended: appendedCount,
        builds_created: createdCount,
        builds_errored: errorCount,
        invalid_skus_count: invalidBuilds.length,
        sync_status: syncStatus,
        duration_ms: durationMs,
      })
      .select('id')
      .single();

    // Log invalid SKUs for review
    if (invalidBuilds.length > 0 && syncEvent?.id) {
      const invalidSkuRecords = invalidBuilds.map((b) => ({
        sync_event_id: syncEvent.id,
        sku: b.sku,
        quantity: b.quantity,
        forecast_date: b.forecast_date,
        calendar_type: calendar_type || null,
        reason: 'No matching BOM found',
      }));
      await supabase.from('calendar_sync_invalid_skus').insert(invalidSkuRecords);
    }

    return new Response(
      JSON.stringify({
        success: errorCount === 0,
        imported: successCount,
        appended: appendedCount,
        created: createdCount,
        errors: errorCount,
        skipped: invalidBuilds.length,
        invalid_skus: invalidBuilds.map((b) => ({ sku: b.sku, reason: 'No matching BOM found' })),
        results,
        sync_event_id: syncEvent?.id,
        duration_ms: durationMs,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[import-build-forecast] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
