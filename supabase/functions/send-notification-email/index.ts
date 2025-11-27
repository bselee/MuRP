/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📧 SEND NOTIFICATION EMAIL EDGE FUNCTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sends formatted email notifications for critical stock alerts
 * 
 * Called by:
 * - nightly-reorder-scan (critical stockout alerts)
 * - notificationService.ts (manual alert triggers)
 *
 * Environment Variables Required:
 * - RESEND_API_KEY: API key for Resend email service
 * - FROM_EMAIL: Sender email address (e.g., alerts@yourdomain.com)
 *
 * @module supabase/functions/send-notification-email
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface StockoutItem {
  sku: string;
  name: string;
  current_stock: number;
  days_until_stockout: number;
  recommended_quantity: number;
  vendor: string;
}

interface EmailRequest {
  recipients: string[];
  subject: string;
  items: StockoutItem[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Handler
// ═══════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { recipients, subject, items }: EmailRequest = await req.json();

    // Validate inputs
    if (!recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No recipients provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No items provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get environment variables
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'alerts@tgf-mrp.com';

    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate HTML email
    const htmlContent = generateEmailHTML(items);

    // Send email via Resend API
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        subject: subject,
        html: htmlContent,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Resend API error:', result);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: result }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Sent email to ${recipients.length} recipient(s)`);

    return new Response(
      JSON.stringify({
        success: true,
        email_id: result.id,
        recipients_count: recipients.length,
        items_count: items.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('❌ Email sending failed:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HTML Email Template
// ═══════════════════════════════════════════════════════════════════════════

function generateEmailHTML(items: StockoutItem[]): string {
  const criticalCount = items.filter(i => i.days_until_stockout <= 3).length;
  const highCount = items.filter(i => i.days_until_stockout > 3 && i.days_until_stockout <= 7).length;

  const itemRows = items
    .sort((a, b) => a.days_until_stockout - b.days_until_stockout)
    .map(item => {
      const urgencyColor = item.days_until_stockout <= 0 
        ? '#DC2626' // Red
        : item.days_until_stockout <= 3
        ? '#EA580C' // Orange
        : item.days_until_stockout <= 7
        ? '#F59E0B' // Amber
        : '#10B981'; // Green

      const urgencyLabel = item.days_until_stockout <= 0
        ? 'STOCKED OUT'
        : item.days_until_stockout <= 3
        ? 'CRITICAL'
        : item.days_until_stockout <= 7
        ? 'HIGH'
        : 'NORMAL';

      return `
        <tr style="border-bottom: 1px solid #E5E7EB;">
          <td style="padding: 12px 8px;">
            <strong>${item.name}</strong><br>
            <span style="color: #6B7280; font-size: 14px;">${item.sku}</span>
          </td>
          <td style="padding: 12px 8px; text-align: center;">
            <span style="display: inline-block; padding: 4px 8px; border-radius: 4px; background-color: ${urgencyColor}20; color: ${urgencyColor}; font-weight: 600; font-size: 12px;">
              ${urgencyLabel}
            </span>
          </td>
          <td style="padding: 12px 8px; text-align: center;">${item.current_stock}</td>
          <td style="padding: 12px 8px; text-align: center;">${item.days_until_stockout} days</td>
          <td style="padding: 12px 8px; text-align: center; font-weight: 600;">${item.recommended_quantity}</td>
          <td style="padding: 12px 8px;">${item.vendor}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Critical Stock Alert</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1F2937; background-color: #F9FAFB; margin: 0; padding: 0;">
      <div style="max-width: 800px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #DC2626 0%, #EA580C 100%); padding: 24px; color: #FFFFFF;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 700;">
            🚨 Critical Stock Alert
          </h1>
          <p style="margin: 8px 0 0 0; font-size: 16px; opacity: 0.9;">
            ${items.length} item(s) require immediate attention
          </p>
        </div>

        <!-- Summary Stats -->
        <div style="padding: 24px; background-color: #FEF2F2; border-bottom: 1px solid #E5E7EB;">
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
            <div style="text-align: center;">
              <div style="font-size: 32px; font-weight: 700; color: #DC2626;">${criticalCount}</div>
              <div style="font-size: 14px; color: #6B7280;">Critical (≤3 days)</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 32px; font-weight: 700; color: #EA580C;">${highCount}</div>
              <div style="font-size: 14px; color: #6B7280;">High (4-7 days)</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 32px; font-weight: 700; color: #1F2937;">${items.length - criticalCount - highCount}</div>
              <div style="font-size: 14px; color: #6B7280;">Normal (>7 days)</div>
            </div>
          </div>
        </div>

        <!-- Items Table -->
        <div style="padding: 24px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background-color: #F9FAFB; border-bottom: 2px solid #E5E7EB;">
                <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #6B7280;">Item</th>
                <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #6B7280;">Urgency</th>
                <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #6B7280;">Stock</th>
                <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #6B7280;">Days Left</th>
                <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #6B7280;">Order Qty</th>
                <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #6B7280;">Vendor</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>
        </div>

        <!-- Action Button -->
        <div style="padding: 24px; background-color: #F9FAFB; text-align: center;">
          <a href="${Deno.env.get('APP_URL') || 'https://app.tgf-mrp.com'}/reorder-queue" 
             style="display: inline-block; padding: 12px 24px; background-color: #2563EB; color: #FFFFFF; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
            View Reorder Queue →
          </a>
        </div>

        <!-- Footer -->
        <div style="padding: 16px 24px; background-color: #F3F4F6; border-top: 1px solid #E5E7EB; text-align: center; font-size: 12px; color: #6B7280;">
          <p style="margin: 0;">
            This is an automated notification from your MuRP system.<br>
            Generated at ${new Date().toLocaleString('en-US', { 
              timeZone: 'UTC',
              dateStyle: 'full',
              timeStyle: 'short'
            })} UTC
          </p>
        </div>

      </div>
    </body>
    </html>
  `;
}
