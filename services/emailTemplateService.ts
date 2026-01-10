/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📧 EMAIL TEMPLATE SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Professional email template generation with customizable branding.
 * Supports PO confirmations, follow-ups, and other transactional emails.
 *
 * Features:
 * - Customizable company branding (logo, colors, contact info)
 * - Responsive email design (mobile-friendly)
 * - Multiple template types (PO confirmation, follow-up, acknowledgment)
 * - Clean, professional visual design
 */

import { supabase } from '../lib/supabase/client';
import type { PurchaseOrder, Vendor } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface EmailBranding {
  companyName: string;
  companyLogo?: string; // Base64 or URL
  companyLogoText?: string; // Fallback text (e.g., "M" for MuRP)
  primaryColor: string; // Header background gradient start
  secondaryColor: string; // Header background gradient end
  accentColor: string; // Buttons, links
  contactEmail: string;
  contactPhone?: string;
  companyAddress?: string;
  website?: string;
  footerText?: string;
}

export interface POEmailData {
  po: PurchaseOrder;
  vendor?: Vendor;
  buyerName: string;
  buyerEmail: string;
  specialInstructions?: string;
  confirmByDate?: string;
  paymentTerms?: string;
  shippingMethod?: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  plainText: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Default Branding
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_BRANDING: EmailBranding = {
  companyName: 'MuRP',
  companyLogoText: 'M',
  primaryColor: '#0f172a',
  secondaryColor: '#334155',
  accentColor: '#0f172a',
  contactEmail: 'purchasing@company.com',
  footerText: 'This is an automated message from MuRP',
};

// ═══════════════════════════════════════════════════════════════════════════
// Branding Storage
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get email branding settings from database
 */
export async function getEmailBranding(): Promise<EmailBranding> {
  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('email_branding')
      .single();

    if (error || !data?.email_branding) {
      return DEFAULT_BRANDING;
    }

    return { ...DEFAULT_BRANDING, ...data.email_branding };
  } catch (error) {
    console.error('[EmailTemplateService] Error fetching branding:', error);
    return DEFAULT_BRANDING;
  }
}

/**
 * Save email branding settings to database
 */
export async function saveEmailBranding(branding: Partial<EmailBranding>): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('company_settings')
      .upsert({
        id: 'default',
        email_branding: branding,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('[EmailTemplateService] Error saving branding:', error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Email CSS Styles (inline-safe)
// ═══════════════════════════════════════════════════════════════════════════

function getEmailStyles(branding: EmailBranding): string {
  return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%);
      min-height: 100vh;
      padding: 40px 20px;
      -webkit-font-smoothing: antialiased;
    }

    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      overflow: hidden;
      box-shadow:
        0 4px 6px -1px rgb(0 0 0 / 0.05),
        0 10px 15px -3px rgb(0 0 0 / 0.05),
        0 20px 25px -5px rgb(0 0 0 / 0.05);
    }

    .header-banner {
      background: linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.secondaryColor} 100%);
      padding: 32px 40px;
      position: relative;
      overflow: hidden;
    }

    .header-banner::before {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      width: 300px;
      height: 300px;
      background: radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%);
      transform: translate(30%, -50%);
    }

    .header-logo {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }

    .logo-icon {
      width: 36px;
      height: 36px;
      background: white;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 16px;
      color: ${branding.primaryColor};
    }

    .logo-text {
      color: white;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.5px;
    }

    .header-content {
      position: relative;
    }

    .po-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      padding: 6px 14px;
      border-radius: 100px;
      margin-bottom: 16px;
    }

    .po-badge-dot {
      width: 8px;
      height: 8px;
      background: #4ade80;
      border-radius: 50%;
    }

    .po-badge-text {
      color: rgba(255,255,255,0.9);
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .header-title {
      color: white;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -1px;
      margin-bottom: 8px;
    }

    .header-po-number {
      font-family: 'IBM Plex Mono', 'Courier New', monospace;
      color: rgba(255,255,255,0.6);
      font-size: 14px;
    }

    .content {
      padding: 32px 40px;
    }

    .greeting {
      font-size: 15px;
      color: #475569;
      line-height: 1.6;
      margin-bottom: 28px;
    }

    .greeting strong {
      color: #0f172a;
    }

    .info-cards {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 28px;
    }

    .info-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
    }

    .info-card-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #94a3b8;
      margin-bottom: 8px;
    }

    .info-card-value {
      font-size: 14px;
      font-weight: 600;
      color: #0f172a;
    }

    .info-card-sub {
      font-size: 12px;
      color: #64748b;
      margin-top: 2px;
    }

    .order-summary {
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 28px;
    }

    .order-summary-header {
      background: #f8fafc;
      padding: 14px 20px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .order-summary-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
    }

    .order-summary-count {
      font-size: 11px;
      color: #94a3b8;
    }

    .order-item {
      padding: 16px 20px;
      border-bottom: 1px solid #f1f5f9;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .order-item:last-child {
      border-bottom: none;
    }

    .order-item-info {
      flex: 1;
    }

    .order-item-name {
      font-size: 14px;
      font-weight: 500;
      color: #0f172a;
      margin-bottom: 4px;
    }

    .order-item-sku {
      font-family: 'IBM Plex Mono', 'Courier New', monospace;
      font-size: 11px;
      color: #94a3b8;
    }

    .order-item-qty {
      text-align: right;
    }

    .order-item-qty-value {
      font-size: 14px;
      font-weight: 600;
      color: #0f172a;
    }

    .order-item-qty-unit {
      font-size: 11px;
      color: #94a3b8;
    }

    .totals {
      background: #fafafa;
      margin: 0 -40px;
      padding: 24px 40px;
      border-top: 1px solid #e2e8f0;
    }

    .total-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 13px;
    }

    .total-row:last-child {
      margin-bottom: 0;
    }

    .total-label {
      color: #64748b;
    }

    .total-value {
      font-family: 'IBM Plex Mono', 'Courier New', monospace;
      color: #0f172a;
      font-weight: 500;
    }

    .total-row.grand {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
    }

    .total-row.grand .total-label {
      font-size: 14px;
      font-weight: 600;
      color: #0f172a;
    }

    .total-row.grand .total-value {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
    }

    .actions {
      margin-top: 28px;
      text-align: center;
    }

    .btn {
      display: inline-block;
      padding: 14px 32px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      text-align: center;
      margin: 0 6px;
    }

    .btn-primary {
      background: ${branding.accentColor};
      color: white;
    }

    .btn-secondary {
      background: white;
      color: #475569;
      border: 1px solid #e2e8f0;
    }

    .notice {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 10px;
      padding: 16px;
      margin-top: 24px;
      display: flex;
      gap: 12px;
    }

    .notice-icon {
      width: 20px;
      height: 20px;
      background: #fbbf24;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 12px;
      color: white;
      font-weight: bold;
    }

    .notice-content {
      font-size: 12px;
      color: #92400e;
      line-height: 1.5;
    }

    .notice-content strong {
      display: block;
      color: #78350f;
      margin-bottom: 2px;
    }

    .footer {
      background: #f8fafc;
      padding: 24px 40px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
    }

    .footer-text {
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.6;
    }

    .footer-link {
      color: #0f172a;
      text-decoration: none;
      font-weight: 500;
    }

    @media (max-width: 640px) {
      body { padding: 20px 16px; }
      .header-banner { padding: 24px; }
      .header-title { font-size: 22px; }
      .content { padding: 24px; }
      .info-cards { grid-template-columns: 1fr; }
      .totals { margin: 0 -24px; padding: 20px 24px; }
      .footer { padding: 20px 24px; }
      .btn { display: block; margin: 8px 0; }
    }
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// PO Confirmation Email Template
// ═══════════════════════════════════════════════════════════════════════════

export async function generatePOConfirmationEmail(data: POEmailData): Promise<EmailTemplate> {
  const branding = await getEmailBranding();

  const po = data.po;
  const items = (po as any).items || (po as any).purchase_order_items || [];
  const vendorName = data.vendor?.name || (po as any).supplierName || (po as any).supplier_name || 'Vendor';
  const vendorContact = data.vendor?.contactName || vendorName.split(' ')[0] || 'Team';

  // Calculate totals
  const subtotal = items.reduce((sum: number, item: any) => {
    const qty = item.quantityOrdered || item.quantity_ordered || 0;
    const cost = item.unitCost || item.unit_cost || 0;
    return sum + (qty * cost);
  }, 0);

  const total = (po as any).totalCost || (po as any).total_cost || subtotal;
  const poNumber = (po as any).orderId || (po as any).order_id || po.id;
  const orderDate = new Date((po as any).orderDate || (po as any).order_date || new Date());
  const expectedDate = (po as any).expectedDate || (po as any).expected_date;

  // Format dates
  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'TBD';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const confirmByDate = data.confirmByDate || formatDate(new Date(orderDate.getTime() + 3 * 24 * 60 * 60 * 1000));

  // Generate items HTML
  const itemsHtml = items.slice(0, 10).map((item: any) => {
    const name = item.itemName || item.item_name || 'Item';
    const sku = item.inventorySku || item.inventory_sku || '';
    const qty = item.quantityOrdered || item.quantity_ordered || 0;
    return `
      <div class="order-item">
        <div class="order-item-info">
          <div class="order-item-name">${escapeHtml(name)}</div>
          <div class="order-item-sku">SKU: ${escapeHtml(sku)}</div>
        </div>
        <div class="order-item-qty">
          <div class="order-item-qty-value">${qty.toLocaleString()}</div>
          <div class="order-item-qty-unit">units</div>
        </div>
      </div>
    `;
  }).join('');

  const moreItemsNote = items.length > 10
    ? `<div style="padding: 12px 20px; text-align: center; color: #64748b; font-size: 12px;">+ ${items.length - 10} more items (see attached PDF)</div>`
    : '';

  // Logo HTML
  const logoHtml = branding.companyLogo
    ? `<img src="${branding.companyLogo}" alt="${branding.companyName}" style="height: 36px; width: auto;">`
    : `<div class="logo-icon">${branding.companyLogoText || branding.companyName.charAt(0)}</div>`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PO Confirmation - ${poNumber}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>${getEmailStyles(branding)}</style>
</head>
<body>
  <div class="email-container">
    <!-- Header -->
    <div class="header-banner">
      <div class="header-logo">
        ${logoHtml}
        <span class="logo-text">${escapeHtml(branding.companyName)}</span>
      </div>
      <div class="header-content">
        <div class="po-badge">
          <span class="po-badge-dot"></span>
          <span class="po-badge-text">New Order</span>
        </div>
        <h1 class="header-title">Purchase Order Confirmed</h1>
        <p class="header-po-number">${escapeHtml(poNumber)}</p>
      </div>
    </div>

    <!-- Content -->
    <div class="content">
      <p class="greeting">
        Hi <strong>${escapeHtml(vendorContact)}</strong>,<br><br>
        ${escapeHtml(branding.companyName)} has submitted a new purchase order. Please review the details below and confirm your ability to fulfill by <strong>${confirmByDate}</strong>.
      </p>

      <!-- Info Cards -->
      <div class="info-cards">
        <div class="info-card">
          <div class="info-card-label">Expected Delivery</div>
          <div class="info-card-value">${formatDate(expectedDate)}</div>
          <div class="info-card-sub">${escapeHtml(data.shippingMethod || 'Standard Shipping')}</div>
        </div>
        <div class="info-card">
          <div class="info-card-label">Ship To</div>
          <div class="info-card-value">${escapeHtml(branding.companyAddress?.split(',')[0] || 'Main Warehouse')}</div>
          <div class="info-card-sub">${escapeHtml(branding.companyName)} Warehouse</div>
        </div>
        <div class="info-card">
          <div class="info-card-label">Payment Terms</div>
          <div class="info-card-value">${escapeHtml(data.paymentTerms || 'Net 30')}</div>
          <div class="info-card-sub">Due ${formatDate(new Date(orderDate.getTime() + 30 * 24 * 60 * 60 * 1000))}</div>
        </div>
        <div class="info-card">
          <div class="info-card-label">Buyer Contact</div>
          <div class="info-card-value">${escapeHtml(data.buyerName)}</div>
          <div class="info-card-sub">${escapeHtml(data.buyerEmail)}</div>
        </div>
      </div>

      <!-- Order Summary -->
      <div class="order-summary">
        <div class="order-summary-header">
          <span class="order-summary-title">Order Summary</span>
          <span class="order-summary-count">${items.length} line item${items.length !== 1 ? 's' : ''}</span>
        </div>
        ${itemsHtml}
        ${moreItemsNote}
      </div>

      <!-- Totals -->
      <div class="totals">
        <div class="total-row">
          <span class="total-label">Subtotal</span>
          <span class="total-value">$${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div class="total-row">
          <span class="total-label">Freight (Est.)</span>
          <span class="total-value">TBD</span>
        </div>
        <div class="total-row grand">
          <span class="total-label">Order Total</span>
          <span class="total-value">$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="actions">
        <a href="mailto:${data.buyerEmail}?subject=RE: ${poNumber} - Order Acknowledged" class="btn btn-primary">Acknowledge Order</a>
        <a href="#" class="btn btn-secondary">View Full PO</a>
      </div>

      ${data.specialInstructions ? `
      <!-- Notice -->
      <div class="notice">
        <div class="notice-icon">!</div>
        <div class="notice-content">
          <strong>Special Instructions</strong>
          ${escapeHtml(data.specialInstructions)}
        </div>
      </div>
      ` : ''}
    </div>

    <!-- Footer -->
    <div class="footer">
      <p class="footer-text">
        Questions? Contact the buyer directly at <a href="mailto:${data.buyerEmail}" class="footer-link">${data.buyerEmail}</a><br>
        or reply to this email.
      </p>
      <p class="footer-text" style="margin-top: 12px; opacity: 0.7;">
        ${escapeHtml(branding.footerText || `This is an automated message from ${branding.companyName}`)}
      </p>
    </div>
  </div>
</body>
</html>
  `;

  // Generate plain text version
  const plainText = `
${branding.companyName} - Purchase Order Confirmation
=====================================================

PO Number: ${poNumber}
Date: ${formatDate(orderDate)}

Hi ${vendorContact},

${branding.companyName} has submitted a new purchase order. Please review the details below and confirm your ability to fulfill by ${confirmByDate}.

ORDER DETAILS
-------------
Expected Delivery: ${formatDate(expectedDate)}
Payment Terms: ${data.paymentTerms || 'Net 30'}
Buyer: ${data.buyerName} (${data.buyerEmail})

LINE ITEMS
----------
${items.map((item: any) => {
  const name = item.itemName || item.item_name || 'Item';
  const sku = item.inventorySku || item.inventory_sku || '';
  const qty = item.quantityOrdered || item.quantity_ordered || 0;
  return `- ${name} (SKU: ${sku}) - Qty: ${qty}`;
}).join('\n')}

TOTALS
------
Subtotal: $${subtotal.toFixed(2)}
Order Total: $${total.toFixed(2)}

${data.specialInstructions ? `SPECIAL INSTRUCTIONS\n--------------------\n${data.specialInstructions}\n` : ''}
To acknowledge this order, please reply to this email or contact ${data.buyerEmail}.

---
${branding.footerText || `This is an automated message from ${branding.companyName}`}
  `.trim();

  return {
    subject: `Purchase Order ${poNumber} - ${branding.companyName}`,
    html,
    plainText,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PO Follow-Up Email Template
// ═══════════════════════════════════════════════════════════════════════════

export async function generatePOFollowUpEmail(data: POEmailData, followUpType: 'acknowledgment' | 'status' | 'shipping' = 'status'): Promise<EmailTemplate> {
  const branding = await getEmailBranding();

  const po = data.po;
  const poNumber = (po as any).orderId || (po as any).order_id || po.id;
  const vendorName = data.vendor?.name || (po as any).supplierName || (po as any).supplier_name || 'Vendor';
  const vendorContact = data.vendor?.contactName || vendorName.split(' ')[0] || 'Team';
  const orderDate = new Date((po as any).orderDate || (po as any).order_date || new Date());

  // Calculate days since order
  const daysSinceOrder = Math.floor((Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24));

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'TBD';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  // Determine message based on follow-up type
  let titleText = 'Order Status Request';
  let messageText = `We're following up on PO ${poNumber} placed ${daysSinceOrder} days ago. Could you please provide an update on the order status?`;
  let badgeText = 'Follow-Up';
  let badgeColor = '#f59e0b';

  if (followUpType === 'acknowledgment') {
    titleText = 'Order Acknowledgment Needed';
    messageText = `We haven't received acknowledgment for PO ${poNumber}. Please confirm receipt and your ability to fulfill this order.`;
    badgeText = 'Action Required';
    badgeColor = '#ef4444';
  } else if (followUpType === 'shipping') {
    titleText = 'Shipping Update Request';
    messageText = `PO ${poNumber} is approaching its expected delivery date. Could you please provide tracking information or an updated delivery ETA?`;
    badgeText = 'Shipping Update';
    badgeColor = '#3b82f6';
  }

  const logoHtml = branding.companyLogo
    ? `<img src="${branding.companyLogo}" alt="${branding.companyName}" style="height: 36px; width: auto;">`
    : `<div class="logo-icon">${branding.companyLogoText || branding.companyName.charAt(0)}</div>`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titleText} - ${poNumber}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>${getEmailStyles(branding)}</style>
</head>
<body>
  <div class="email-container">
    <!-- Header -->
    <div class="header-banner">
      <div class="header-logo">
        ${logoHtml}
        <span class="logo-text">${escapeHtml(branding.companyName)}</span>
      </div>
      <div class="header-content">
        <div class="po-badge" style="border-color: ${badgeColor}40;">
          <span class="po-badge-dot" style="background: ${badgeColor};"></span>
          <span class="po-badge-text">${badgeText}</span>
        </div>
        <h1 class="header-title">${escapeHtml(titleText)}</h1>
        <p class="header-po-number">${escapeHtml(poNumber)}</p>
      </div>
    </div>

    <!-- Content -->
    <div class="content">
      <p class="greeting">
        Hi <strong>${escapeHtml(vendorContact)}</strong>,<br><br>
        ${escapeHtml(messageText)}
      </p>

      <!-- Info Cards -->
      <div class="info-cards">
        <div class="info-card">
          <div class="info-card-label">Order Date</div>
          <div class="info-card-value">${formatDate(orderDate)}</div>
          <div class="info-card-sub">${daysSinceOrder} days ago</div>
        </div>
        <div class="info-card">
          <div class="info-card-label">PO Number</div>
          <div class="info-card-value">${escapeHtml(poNumber)}</div>
          <div class="info-card-sub">Reference</div>
        </div>
      </div>

      <!-- Actions -->
      <div class="actions">
        <a href="mailto:${data.buyerEmail}?subject=RE: ${poNumber} - Status Update" class="btn btn-primary">Reply with Update</a>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p class="footer-text">
        Questions? Contact <a href="mailto:${data.buyerEmail}" class="footer-link">${data.buyerName}</a> directly.
      </p>
      <p class="footer-text" style="margin-top: 12px; opacity: 0.7;">
        ${escapeHtml(branding.footerText || `This is an automated message from ${branding.companyName}`)}
      </p>
    </div>
  </div>
</body>
</html>
  `;

  const plainText = `
${branding.companyName} - ${titleText}
=====================================================

PO Number: ${poNumber}
Order Date: ${formatDate(orderDate)} (${daysSinceOrder} days ago)

Hi ${vendorContact},

${messageText}

Please reply to this email with your update, or contact ${data.buyerName} at ${data.buyerEmail}.

---
${branding.footerText || `This is an automated message from ${branding.companyName}`}
  `.trim();

  return {
    subject: `${titleText}: ${poNumber} - ${branding.companyName}`,
    html,
    plainText,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

function escapeHtml(text: string): string {
  const div = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (div) {
    div.textContent = text;
    return div.innerHTML;
  }
  // Fallback for server-side
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Preview email in new window (for testing)
 */
export function previewEmail(template: EmailTemplate): void {
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(template.html);
    win.document.close();
  }
}

export default {
  getEmailBranding,
  saveEmailBranding,
  generatePOConfirmationEmail,
  generatePOFollowUpEmail,
  previewEmail,
};
