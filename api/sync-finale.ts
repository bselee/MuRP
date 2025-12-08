/**
 * Vercel Serverless Function: Trigger Finale Data Sync
 *
 * This endpoint triggers a full sync of Finale data to Supabase.
 * It should be called via cron job or manually for testing.
 *
 * Usage:
 *   curl -X POST https://your-app.vercel.app/api/sync-finale \
 *     -H "Authorization: Bearer YOUR_SECRET"
 *
 * Or set up a Vercel cron job in vercel.json:
 *   "crons": [{
 *     "path": "/api/sync-finale",
 *     "schedule": "0 */4 * * *"  // Every 4 hours
 *   }]
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Environment variables
const FINALE_API_KEY = process.env.FINALE_API_KEY || '';
const FINALE_API_SECRET = process.env.FINALE_API_SECRET || '';
const FINALE_ACCOUNT_PATH = process.env.FINALE_ACCOUNT_PATH || '';
const FINALE_BASE_URL = process.env.FINALE_BASE_URL || 'https://app.finaleinventory.com';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const CRON_SECRET = process.env.CRON_SECRET || 'default-secret-change-me';

interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  duration: number;
  errors: number;
  message?: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Verify authorization (cron secret or bearer token)
  const authHeader = req.headers.authorization;
  const cronSecret = req.headers['x-vercel-cron-secret'];

  if (!authHeader && cronSecret !== CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  console.log('[sync-finale] Starting server-side Finale data sync...');

  // Validate credentials
  if (!FINALE_API_KEY || !FINALE_API_SECRET || !FINALE_ACCOUNT_PATH) {
    console.error('[sync-finale] Missing Finale credentials');
    res.status(500).json({
      error: 'Missing Finale credentials',
      details: {
        hasApiKey: !!FINALE_API_KEY,
        hasApiSecret: !!FINALE_API_SECRET,
        hasAccountPath: !!FINALE_ACCOUNT_PATH,
      }
    });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[sync-finale] Missing Supabase credentials');
    res.status(500).json({ error: 'Missing Supabase credentials' });
    return;
  }

  try {
    const startTime = Date.now();

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Call the Supabase Edge Function that does the actual sync
    // This is more reliable than trying to import and run sync services here
    const { data, error } = await supabase.functions.invoke('sync-finale-data', {
      body: {
        fullSync: true,
        source: 'vercel-cron'
      }
    });

    if (error) {
      console.error('[sync-finale] Sync failed:', error);
      res.status(500).json({
        error: 'Sync failed',
        details: error
      });
      return;
    }

    const duration = Date.now() - startTime;

    console.log('[sync-finale] ✅ Sync completed successfully');
    console.log(`[sync-finale] Duration: ${duration}ms`);

    res.status(200).json({
      success: true,
      duration,
      timestamp: new Date().toISOString(),
      data
    });

  } catch (error) {
    console.error('[sync-finale] Unexpected error:', error);
    res.status(500).json({
      error: 'Sync failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
