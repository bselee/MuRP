import { supabase } from '../lib/supabase/client';

interface FollowUpRunResult {
  success: boolean;
  sent?: number;
  reason?: string;
  error?: string;
}

export async function runFollowUpAutomation(): Promise<FollowUpRunResult> {
  const { data, error } = await supabase.functions.invoke('po-followup-runner', {
    body: {},
  });

  if (error) {
    console.error('[followUpService] runFollowUpAutomation failed', error);
    throw error;
  }

  return (data as FollowUpRunResult) ?? { success: false };
}
