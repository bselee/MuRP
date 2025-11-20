import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GMAIL_CLIENT_ID = Deno.env.get('GMAIL_WEBHOOK_CLIENT_ID')!;
const GMAIL_CLIENT_SECRET = Deno.env.get('GMAIL_WEBHOOK_CLIENT_SECRET')!;
const GMAIL_REFRESH_TOKEN = Deno.env.get('GMAIL_WEBHOOK_REFRESH_TOKEN')!;
const GMAIL_WEBHOOK_USER = Deno.env.get('GMAIL_WEBHOOK_USER') || 'me';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DEFAULT_INSTRUCTIONS =
  'Please reply directly to this email thread with the carrier and tracking number only so our system records it automatically.';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  try {
    const summary = await runFollowUps();
    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[po-followup-runner] unexpected error', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function runFollowUps() {
  const { data: rules, error: ruleError } = await supabase
    .from('po_followup_rules')
    .select('*')
    .eq('active', true)
    .order('stage', { ascending: true });

  if (ruleError) throw ruleError;
  if (!rules || rules.length === 0) {
    return { success: true, sent: 0, reason: 'no_rules' };
  }

  const candidateStatuses = ['draft', 'sent', 'confirmed'];
  const { data: purchaseOrders, error: poError } = await supabase
    .from('purchase_orders')
    .select(
      'id, order_id, vendor_id, vendor_name, supplier, status, sent_at, last_follow_up_stage, last_follow_up_sent_at, follow_up_required, tracking_status, total, created_at',
    )
    .in('status', candidateStatuses)
    .eq('follow_up_required', true);

  if (poError) throw poError;
  if (!purchaseOrders || purchaseOrders.length === 0) {
    return { success: true, sent: 0, reason: 'no_candidates' };
  }

  const now = new Date();
  let sentCount = 0;

  for (const po of purchaseOrders) {
    const currentStage = po.last_follow_up_stage ?? 0;
    const nextStage = currentStage + 1;
    const rule = rules.find((r) => r.stage === nextStage);
    if (!rule) continue;

    const baseline = po.last_follow_up_stage ? po.last_follow_up_sent_at : po.sent_at;
    if (!baseline) continue;

    const elapsedMs = now.getTime() - new Date(baseline).getTime();
    const waitMs = rule.wait_hours * 60 * 60 * 1000;
    if (elapsedMs < waitMs) continue;

    const vendor = await fetchVendor(po.vendor_id);
    const contactEmail = vendor?.contact_emails?.[0] || vendor?.email || vendor?.billing_email;
    if (!contactEmail) continue;

    const threadMeta = await fetchThreadMetadata(po.id);
    const threadId = threadMeta?.gmail_thread_id ?? null;
    if (!threadId) continue; // ensure we keep thread continuity

    const context = buildTemplateContext(po, vendor);
    const subject = compileTemplate(rule.subject_template, context);
    const body = buildFollowUpBody(rule.body_template, rule.instructions ?? DEFAULT_INSTRUCTIONS, context);

    try {
      const gmail = await sendGmailMessage({
        to: contactEmail,
        subject,
        body,
        threadId,
      });

      const sentAt = new Date().toISOString();
      await supabase
        .from('po_email_tracking')
        .insert({
          po_id: po.id,
          vendor_email: contactEmail,
          gmail_message_id: gmail.id,
          gmail_thread_id: gmail.threadId,
          metadata: {
            followUpStage: rule.stage,
            auto: true,
            template: 'follow_up',
          },
          sent_at: sentAt,
        });

      await supabase
        .from('vendor_followup_events')
        .insert({
          po_id: po.id,
          vendor_id: vendor?.id ?? null,
          stage: rule.stage,
          sent_at: sentAt,
          metadata: {
            tracking_status: po.tracking_status,
          },
        });

      await supabase
        .from('purchase_orders')
        .update({
          last_follow_up_stage: rule.stage,
          last_follow_up_sent_at: sentAt,
          follow_up_status: 'awaiting_vendor',
        })
        .eq('id', po.id);

      sentCount++;
    } catch (error) {
      console.error(`[po-followup-runner] failed to send follow-up for PO ${po.order_id}`, error);
    }
  }

  return { success: true, sent: sentCount };
}

async function fetchVendor(id?: string | null) {
  if (!id) return null;
  const { data } = await supabase
    .from('vendors')
    .select('id, name, contact_emails, primary_contact_email, billing_email')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    contact_emails: data.contact_emails || (data.primary_contact_email ? [data.primary_contact_email] : []),
    email: data.primary_contact_email,
    billing_email: data.billing_email,
  };
}

async function fetchThreadMetadata(poId: string) {
  const { data } = await supabase
    .from('po_email_tracking')
    .select('gmail_thread_id')
    .eq('po_id', poId)
    .not('gmail_thread_id', 'is', null)
    .order('sent_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}

function buildTemplateContext(po: any, vendor: any) {
  const orderDate = po.sent_at ?? po.created_at;
  const ageDays =
    orderDate ? Math.max(1, Math.round((Date.now() - new Date(orderDate).getTime()) / (1000 * 60 * 60 * 24))) : 0;

  return {
    po_number: po.order_id ?? po.id,
    vendor_name: vendor?.name ?? po.vendor_name ?? po.supplier,
    order_date: orderDate ? new Date(orderDate).toLocaleDateString() : 'N/A',
    total_amount: `$${Number(po.total ?? 0).toFixed(2)}`,
    item_count: 'your order',
    order_age_days: String(ageDays),
  };
}

function compileTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key.trim()] ?? '');
}

function buildFollowUpBody(bodyTemplate: string, instructions: string, context: Record<string, string>): string {
  const body = compileTemplate(bodyTemplate, context).trim();
  return `${body}\n\n${instructions}\n\n— MuRP Purchasing`;
}

async function sendGmailMessage(options: { to: string; subject: string; body: string; threadId: string | null }) {
  const accessToken = await getGmailAccessToken();
  const rawMessage = buildGmailMime({
    to: options.to,
    subject: options.subject,
    body: options.body,
    threadId: options.threadId ?? undefined,
  });

  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(GMAIL_WEBHOOK_USER)}/messages/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: rawMessage,
        threadId: options.threadId ?? undefined,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gmail send failed: ${response.status} ${text}`);
  }

  return await response.json();
}

async function getGmailAccessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!response.ok) {
    throw new Error(`Failed to refresh Gmail token (${response.status})`);
  }
  const data = await response.json();
  return data.access_token;
}

function buildGmailMime({
  to,
  subject,
  body,
  threadId,
}: {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}) {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
  ];
  const message = `${headers.join('\n')}${body}`;
  const encoded = btoa(unescape(encodeURIComponent(message))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return encoded;
}
