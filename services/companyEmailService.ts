import { supabase } from '../lib/supabase/client';

export interface CompanyEmailRequest {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  metadata?: Record<string, unknown>;
}

export const sendCompanyEmail = async (payload: CompanyEmailRequest) => {
  const { data, error } = await supabase.functions.invoke('send-company-email', {
    body: payload,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to send company email');
  }
  return data;
};
