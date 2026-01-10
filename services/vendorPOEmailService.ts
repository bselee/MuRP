/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VENDOR PO EMAIL SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Professional HTML email templates for vendor PO notifications with:
 * - Modern, responsive design matching company branding
 * - Email open tracking via tracking pixel
 * - Share link integration for "View Full PO" button
 * - PDF attachment support
 *
 * Template Variables:
 * - {{po_number}} - PO order ID
 * - {{vendor_name}} - Vendor company name
 * - {{order_date}} - Formatted order date
 * - {{expected_date}} - Expected delivery date
 * - {{total_amount}} - Order total
 * - {{item_count}} - Number of items
 * - {{share_link_url}} - Public PO view URL
 * - {{tracking_pixel_url}} - Email open tracking pixel
 * - {{company_name}} - Your company name
 * - {{company_email}} - Your company email
 * - {{company_phone}} - Your company phone
 */

import { supabase } from '../lib/supabase/client';

interface POEmailData {
  poId: string;
  orderId: string;
  vendorName: string;
  vendorEmail: string;
  orderDate: string;
  expectedDate?: string;
  total: number;
  itemCount: number;
  items: Array<{
    sku: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  specialInstructions?: string;
  shareToken?: string;
}

interface CompanySettings {
  company_name: string;
  email?: string;
  phone?: string;
  website?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  logo_url?: string | null;
}

interface EmailResult {
  success: boolean;
  subject: string;
  htmlBody: string;
  trackingPixelUrl: string;
  shareUrl: string;
  error?: string;
}

/**
 * Generate the professional HTML email template for PO notification
 */
export function generatePOEmailHTML(
  data: POEmailData,
  company: CompanySettings,
  baseUrl: string
): EmailResult {
  const shareUrl = data.shareToken
    ? `${baseUrl}/po/${data.shareToken}`
    : '';

  // Edge function URL for email tracking pixel
  // Uses the Supabase URL from Vite env (available in browser)
  const supabaseProjectUrl = typeof import.meta !== 'undefined'
    ? (import.meta as any).env?.VITE_SUPABASE_URL || ''
    : '';
  const trackingPixelUrl = data.shareToken && supabaseProjectUrl
    ? `${supabaseProjectUrl}/functions/v1/po-public-view/${data.shareToken}/email-opened`
    : '';

  const subject = `Purchase Order #${data.orderId} from ${company.company_name}`;

  // Build items summary (max 5 for email preview)
  const displayItems = data.items.slice(0, 5);
  const hasMoreItems = data.items.length > 5;
  const remainingItemsCount = data.items.length - 5;

  const itemsTableRows = displayItems.map(item => `
    <tr>
      <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
        <div style="font-weight: 500; color: #1a1a2e;">${item.sku}</div>
        <div style="font-size: 13px; color: #6b7280; margin-top: 2px;">${item.description}</div>
      </td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0; text-align: center; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; color: #374151;">
        ${item.quantity}
      </td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0; text-align: right; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; color: #374151;">
        $${item.unitPrice.toFixed(2)}
      </td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0; text-align: right; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 600; color: #1a1a2e;">
        $${item.total.toFixed(2)}
      </td>
    </tr>
  `).join('');

  const moreItemsRow = hasMoreItems ? `
    <tr>
      <td colspan="4" style="padding: 12px 16px; text-align: center; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; color: #6b7280; font-style: italic;">
        + ${remainingItemsCount} more item${remainingItemsCount > 1 ? 's' : ''} (view full PO for complete list)
      </td>
    </tr>
  ` : '';

  const specialInstructionsSection = data.specialInstructions ? `
    <div style="margin-top: 24px; padding: 16px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
      <div style="font-weight: 600; color: #92400e; font-size: 14px; margin-bottom: 4px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
        Special Instructions
      </div>
      <div style="color: #92400e; font-size: 14px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
        ${data.specialInstructions}
      </div>
    </div>
  ` : '';

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Purchase Order #${data.orderId}</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Main Container -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">

          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                Purchase Order
              </h1>
              <div style="margin-top: 8px; color: #a5b4fc; font-size: 18px; font-weight: 500; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                #${data.orderId}
              </div>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 40px;">

              <!-- Greeting -->
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #374151; line-height: 1.6; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                Hello <strong>${data.vendorName}</strong> Team,
              </p>
              <p style="margin: 0 0 32px 0; font-size: 16px; color: #374151; line-height: 1.6; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                Please find below our purchase order. We kindly request you to acknowledge receipt and provide an estimated shipping date.
              </p>

              <!-- Info Cards -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td width="48%" style="padding: 20px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 8px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                      Order Date
                    </div>
                    <div style="font-size: 18px; font-weight: 600; color: #1a1a2e; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                      ${data.orderDate}
                    </div>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="padding: 20px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 8px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                      Expected Delivery
                    </div>
                    <div style="font-size: 18px; font-weight: 600; color: #1a1a2e; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                      ${data.expectedDate || 'TBD'}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Order Summary -->
              <div style="margin-bottom: 32px;">
                <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1a1a2e; text-transform: uppercase; letter-spacing: 0.5px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                  Order Summary
                </h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                  <thead>
                    <tr style="background: #1a1a2e;">
                      <th style="padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #ffffff; font-weight: 600; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                        Item
                      </th>
                      <th style="padding: 12px 16px; text-align: center; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #ffffff; font-weight: 600; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                        Qty
                      </th>
                      <th style="padding: 12px 16px; text-align: right; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #ffffff; font-weight: 600; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                        Unit Price
                      </th>
                      <th style="padding: 12px 16px; text-align: right; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #ffffff; font-weight: 600; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsTableRows}
                    ${moreItemsRow}
                  </tbody>
                </table>
              </div>

              <!-- Total -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td></td>
                  <td width="200" style="padding: 20px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 8px; text-align: center;">
                    <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #a5b4fc; margin-bottom: 4px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                      Order Total
                    </div>
                    <div style="font-size: 28px; font-weight: 700; color: #ffffff; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                      $${data.total.toFixed(2)}
                    </div>
                  </td>
                </tr>
              </table>

              ${specialInstructionsSection}

              <!-- Action Buttons -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 32px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding-right: 12px;">
                          <a href="mailto:${company.email}?subject=RE: PO ${data.orderId} - Order Acknowledged&body=We acknowledge receipt of PO ${data.orderId}.%0D%0A%0D%0AEstimated ship date: [ENTER DATE]%0D%0ATracking will be provided when available."
                             style="display: inline-block; padding: 14px 28px; background: #10b981; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                            Acknowledge Order
                          </a>
                        </td>
                        ${shareUrl ? `
                        <td>
                          <a href="${shareUrl}"
                             style="display: inline-block; padding: 14px 28px; background: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                            View Full PO
                          </a>
                        </td>
                        ` : ''}
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Response Instructions -->
              <div style="margin-top: 32px; padding: 16px; background: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe;">
                <p style="margin: 0; font-size: 14px; color: #1e40af; line-height: 1.6; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                  <strong>How to respond:</strong> Please reply directly to this email with the carrier and tracking number when available, so our system can automatically track your shipment.
                </p>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-weight: 600; color: #1a1a2e; font-size: 14px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                      ${company.company_name}
                    </div>
                    ${company.address_line1 ? `
                    <div style="color: #6b7280; font-size: 13px; margin-top: 4px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                      ${company.address_line1}${company.city ? `, ${company.city}` : ''}${company.state ? `, ${company.state}` : ''} ${company.postal_code || ''}
                    </div>
                    ` : ''}
                    <div style="color: #6b7280; font-size: 13px; margin-top: 4px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                      ${company.email || ''} ${company.phone ? `| ${company.phone}` : ''}
                    </div>
                  </td>
                  <td align="right" style="color: #9ca3af; font-size: 12px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
                    Sent via MuRP
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- Tracking Pixel -->
        ${trackingPixelUrl ? `<img src="${trackingPixelUrl}" width="1" height="1" style="display: none;" alt="" />` : ''}

      </td>
    </tr>
  </table>
</body>
</html>
`;

  return {
    success: true,
    subject,
    htmlBody,
    trackingPixelUrl,
    shareUrl,
  };
}

/**
 * Create a share link for the PO and generate email content
 */
export async function preparePOEmail(
  poId: string,
  poType: 'internal' | 'finale' = 'finale',
  baseUrl: string = typeof window !== 'undefined' ? window.location.origin : ''
): Promise<EmailResult> {
  try {
    // Get PO data
    const { data: poData, error: poError } = poType === 'finale'
      ? await supabase
          .from('finale_purchase_orders')
          .select('*')
          .eq('id', poId)
          .single()
      : await supabase
          .from('purchase_orders')
          .select('*')
          .eq('id', poId)
          .single();

    if (poError || !poData) {
      return {
        success: false,
        subject: '',
        htmlBody: '',
        trackingPixelUrl: '',
        shareUrl: '',
        error: `Failed to load PO: ${poError?.message || 'Not found'}`,
      };
    }

    // Get company settings
    const { data: companyData } = await supabase
      .from('company_settings')
      .select('*')
      .single();

    const company: CompanySettings = {
      company_name: companyData?.company_name || 'MuRP',
      email: companyData?.email || '',
      phone: companyData?.phone || '',
      website: companyData?.website || '',
      address_line1: companyData?.address_line1 || '',
      city: companyData?.city || '',
      state: companyData?.state || '',
      postal_code: companyData?.postal_code || '',
      logo_url: companyData?.logo_url || null,
    };

    // Create share link
    const { data: shareLinkData, error: shareError } = await supabase.rpc(
      'create_po_share_link',
      poType === 'finale'
        ? {
            p_finale_po_id: poId,
            p_expires_in_days: 90,
            p_show_pricing: true,
            p_show_notes: false,
            p_show_tracking: true,
          }
        : {
            p_po_id: poId,
            p_expires_in_days: 90,
            p_show_pricing: true,
            p_show_notes: false,
            p_show_tracking: true,
          }
    );

    if (shareError) {
      console.error('[vendorPOEmailService] Failed to create share link:', shareError);
    }

    const shareToken = shareLinkData?.[0]?.share_token;

    // Parse items from PO
    const items = (poType === 'finale' ? poData.line_items : poData.items) || [];
    const parsedItems = Array.isArray(items)
      ? items.map((item: any) => ({
          sku: item.sku || item.product_id || 'N/A',
          description: item.description || item.product_name || item.name || '',
          quantity: item.quantity || 0,
          unitPrice: item.unit_price || item.unitPrice || item.price || 0,
          total: (item.quantity || 0) * (item.unit_price || item.unitPrice || item.price || 0),
        }))
      : [];

    // Build email data
    const emailData: POEmailData = {
      poId,
      orderId: poData.order_id || poId,
      vendorName: poData.vendor_name || poData.supplier_name || 'Vendor',
      vendorEmail: '', // Would be provided by caller
      orderDate: poData.order_date
        ? new Date(poData.order_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
      expectedDate: poData.expected_date || poData.estimated_receive_date
        ? new Date(poData.expected_date || poData.estimated_receive_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : undefined,
      total: poData.total || poData.total_amount || 0,
      itemCount: parsedItems.length,
      items: parsedItems,
      specialInstructions: poData.notes || poData.internal_notes || undefined,
      shareToken,
    };

    return generatePOEmailHTML(emailData, company, baseUrl);
  } catch (error) {
    console.error('[vendorPOEmailService] Error preparing PO email:', error);
    return {
      success: false,
      subject: '',
      htmlBody: '',
      trackingPixelUrl: '',
      shareUrl: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Log email open event
 */
export async function logEmailOpen(shareToken: string, metadata?: {
  ipAddress?: string;
  userAgent?: string;
  referrer?: string;
}): Promise<{ success: boolean }> {
  try {
    // Find the share link
    const { data: linkData, error: linkError } = await supabase
      .from('po_share_links')
      .select('id')
      .eq('share_token', shareToken)
      .single();

    if (linkError || !linkData) {
      return { success: false };
    }

    // Log the email open event
    await supabase.from('po_share_link_access_log').insert({
      share_link_id: linkData.id,
      ip_address: metadata?.ipAddress || null,
      user_agent: metadata?.userAgent || null,
      referrer: 'email_open',
      session_id: `email_${Date.now()}`,
    });

    return { success: true };
  } catch (error) {
    console.error('[vendorPOEmailService] Error logging email open:', error);
    return { success: false };
  }
}
