import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json',
};

interface CompanyEmailPayload {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  metadata?: Record<string, unknown>;
}

const textToHtml = (text: string): string => {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .split(/\n{2,}/)
    .map(paragraph =>
      `<p>${paragraph
        .split('\n')
        .map(line => line.trim())
        .join('<br/>')}</p>`,
    )
    .join('');
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as CompanyEmailPayload;
    if (!payload.from || !payload.subject || !payload.bodyText) {
      return new Response(
        JSON.stringify({ error: 'Missing required email fields' }),
        { status: 400, headers: corsHeaders },
      );
    }
    if (!Array.isArray(payload.to) || payload.to.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least one recipient (to) is required' }),
        { status: 400, headers: corsHeaders },
      );
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fallBackFrom = Deno.env.get('FROM_EMAIL') || 'notifications@tgf-mrp.com';
    if (!resendApiKey) {
      console.error('[send-company-email] RESEND_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: corsHeaders },
      );
    }

    const html = payload.bodyHtml ?? textToHtml(payload.bodyText);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: payload.from || fallBackFrom,
        to: payload.to,
        cc: payload.cc && payload.cc.length ? payload.cc : undefined,
        subject: payload.subject,
        html,
        text: payload.bodyText,
        tags: [
          { name: 'source', value: 'murp-app' },
          { name: 'category', value: 'company-email' },
        ],
        metadata: payload.metadata,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('[send-company-email] Resend error:', result);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: result }),
        { status: response.status, headers: corsHeaders },
      );
    }

    console.log('[send-company-email] Email sent', result.id);
    return new Response(
      JSON.stringify({ success: true, id: result.id, toCount: payload.to.length }),
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    console.error('[send-company-email] Unexpected error', error);
    return new Response(
      JSON.stringify({ error: 'Unexpected error', details: (error as Error).message }),
      { status: 500, headers: corsHeaders },
    );
  }
});
