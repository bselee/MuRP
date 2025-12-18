/**
 * Vercel Cron API Route: Trigger Finale Data Sync
 * 
 * Called by Vercel Cron (configured in vercel.json)
 * Triggers the Supabase Edge Function to sync Finale data
 * 
 * Schedule: 2am, 8am, 2pm, 8pm daily (every 6 hours)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST requests (Vercel Cron sends POST)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret for security (optional but recommended)
  const cronSecret = req.headers['authorization'];
  const expectedSecret = process.env.CRON_SECRET;
  
  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    console.log('[Cron] Unauthorized request - invalid or missing secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[Cron] Triggering Finale data sync...');
    
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[Cron] Missing Supabase credentials');
      return res.status(500).json({ 
        error: 'Missing Supabase credentials',
        details: {
          url: !!supabaseUrl,
          key: !!supabaseAnonKey,
        }
      });
    }

    const headers = {
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    };

    const startTime = Date.now();

    const restUrl = `${supabaseUrl}/functions/v1/sync-finale-data`;
    const poUrl = `${supabaseUrl}/functions/v1/sync-finale-graphql`;

    console.log('[Cron] Calling edge functions:', { restUrl, poUrl });

    const [restResponse, poResponse] = await Promise.all([
      fetch(restUrl, { method: 'POST', headers }),
      fetch(poUrl, { method: 'POST', headers }),
    ]);

    const duration = Date.now() - startTime;

    const restText = await restResponse.text();
    const poText = await poResponse.text();

    if (!restResponse.ok || !poResponse.ok) {
      console.error('[Cron] One or more edge functions failed:', {
        rest: { status: restResponse.status, body: restText },
        purchaseOrders: { status: poResponse.status, body: poText },
      });
      return res.status(500).json({
        error: 'One or more edge functions failed',
        duration,
        rest: { status: restResponse.status, body: restText },
        purchaseOrders: { status: poResponse.status, body: poText },
      });
    }

    const restResult = safeJsonParse(restText);
    const poResult = safeJsonParse(poText);

    console.log('[Cron] ✅ Sync completed:', {
      rest: restResult,
      purchaseOrders: poResult,
    });

    return res.status(200).json({
      success: true,
      message: 'Finale sync triggered successfully',
      duration,
      timestamp: new Date().toISOString(),
      results: {
        rest: restResult,
        purchaseOrders: poResult,
      },
    });

  } catch (error) {
    console.error('[Cron] Fatal error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
}

function safeJsonParse(input: string): any {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}
