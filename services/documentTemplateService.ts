/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📄 UNIVERSAL DOCUMENT TEMPLATE SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Unified document generation for PDFs and print views across the application.
 * Supports purchase orders, invoices, compliance documents, artwork approvals.
 *
 * Features:
 * - Consistent branding across all document types
 * - Professional HTML templates optimized for print/PDF
 * - Customizable headers, footers, and styles
 * - Universal print-to-PDF via browser
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface DocumentBranding {
  companyName: string;
  companyLogo?: string;
  companyLogoText?: string;
  primaryColor: string;
  secondaryColor: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  website?: string;
  defaultTerms?: string;
  showSignatureBlock?: boolean;
  footerText?: string;
}

export type DocumentType = 'purchase_order' | 'invoice' | 'compliance' | 'artwork' | 'packing_list' | 'receipt';

export interface DocumentData {
  type: DocumentType;
  title: string;
  documentNumber: string;
  date: Date | string;
  recipient?: {
    name: string;
    address?: string;
    email?: string;
    phone?: string;
  };
  lineItems?: Array<{
    sku?: string;
    name: string;
    quantity?: number;
    unitPrice?: number;
    total?: number;
    notes?: string;
  }>;
  totals?: {
    subtotal?: number;
    tax?: number;
    shipping?: number;
    discount?: number;
    total: number;
  };
  notes?: string;
  terms?: string;
  customFields?: Record<string, string | number>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Default Branding
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_DOCUMENT_BRANDING: DocumentBranding = {
  companyName: 'MuRP',
  companyLogoText: 'M',
  primaryColor: '#0f172a',
  secondaryColor: '#334155',
  showSignatureBlock: true,
  footerText: 'Thank you for your business',
};

// ═══════════════════════════════════════════════════════════════════════════
// Branding Storage
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get document branding settings from database
 */
export async function getDocumentBranding(): Promise<DocumentBranding> {
  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('document_branding, company_info')
      .single();

    if (error || !data) {
      return DEFAULT_DOCUMENT_BRANDING;
    }

    const docBranding = data.document_branding || {};
    const companyInfo = data.company_info || {};

    return {
      ...DEFAULT_DOCUMENT_BRANDING,
      ...docBranding,
      companyAddress: companyInfo.shippingAddress || docBranding.companyAddress,
      companyName: companyInfo.legalName || docBranding.companyName || DEFAULT_DOCUMENT_BRANDING.companyName,
    };
  } catch (error) {
    console.error('[DocumentTemplateService] Error fetching branding:', error);
    return DEFAULT_DOCUMENT_BRANDING;
  }
}

/**
 * Save document branding settings to database
 */
export async function saveDocumentBranding(branding: Partial<DocumentBranding>): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('company_settings')
      .upsert({
        id: 'default',
        document_branding: branding,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('[DocumentTemplateService] Error saving branding:', error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Document Styles
// ═══════════════════════════════════════════════════════════════════════════

function getDocumentStyles(branding: DocumentBranding): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    @page {
      size: letter;
      margin: 0.5in;
    }

    body {
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #1e293b;
      line-height: 1.5;
      background: white;
    }

    .document {
      max-width: 8.5in;
      margin: 0 auto;
      padding: 0.5in;
      background: white;
    }

    /* Header */
    .document-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 2px solid ${branding.primaryColor};
    }

    .company-info {
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }

    .company-logo {
      width: 48px;
      height: 48px;
      background: ${branding.primaryColor};
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 20px;
    }

    .company-logo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .company-details {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .company-name {
      font-size: 20px;
      font-weight: 700;
      color: ${branding.primaryColor};
    }

    .company-contact {
      font-size: 11px;
      color: #64748b;
    }

    .document-meta {
      text-align: right;
    }

    .document-type {
      font-size: 24px;
      font-weight: 700;
      color: ${branding.primaryColor};
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .document-number {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 600;
      color: #1e293b;
    }

    .document-date {
      font-size: 12px;
      color: #64748b;
      margin-top: 4px;
    }

    /* Info Grid */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 32px;
    }

    .info-section {
      padding: 16px;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .info-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #94a3b8;
      margin-bottom: 8px;
    }

    .info-value {
      font-size: 14px;
      font-weight: 600;
      color: #1e293b;
    }

    .info-detail {
      font-size: 12px;
      color: #64748b;
      margin-top: 2px;
    }

    /* Line Items Table */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }

    .items-table thead {
      background: ${branding.primaryColor};
    }

    .items-table th {
      padding: 12px 16px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: white;
      text-align: left;
    }

    .items-table th:last-child {
      text-align: right;
    }

    .items-table tbody tr {
      border-bottom: 1px solid #e2e8f0;
    }

    .items-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }

    .items-table td {
      padding: 12px 16px;
      font-size: 13px;
      vertical-align: top;
    }

    .items-table td:last-child {
      text-align: right;
    }

    .item-sku {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: #64748b;
      display: block;
      margin-top: 2px;
    }

    .item-qty {
      font-weight: 600;
      text-align: center;
    }

    .item-price,
    .item-total {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
    }

    /* Totals */
    .totals-section {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 32px;
    }

    .totals-table {
      width: 280px;
    }

    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 13px;
      border-bottom: 1px solid #e2e8f0;
    }

    .total-label {
      color: #64748b;
    }

    .total-value {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
    }

    .total-row.grand {
      border-bottom: none;
      border-top: 2px solid ${branding.primaryColor};
      padding-top: 12px;
      margin-top: 8px;
    }

    .total-row.grand .total-label {
      font-size: 14px;
      font-weight: 700;
      color: #1e293b;
    }

    .total-row.grand .total-value {
      font-size: 18px;
      font-weight: 700;
      color: ${branding.primaryColor};
    }

    /* Notes & Terms */
    .notes-section {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }

    .notes-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #92400e;
      margin-bottom: 8px;
    }

    .notes-content {
      font-size: 12px;
      color: #78350f;
      line-height: 1.6;
    }

    .terms-section {
      margin-bottom: 32px;
    }

    .terms-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      margin-bottom: 8px;
    }

    .terms-content {
      font-size: 11px;
      color: #64748b;
      line-height: 1.6;
    }

    /* Signature Block */
    .signature-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 48px;
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid #e2e8f0;
    }

    .signature-block {
      display: flex;
      flex-direction: column;
    }

    .signature-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #94a3b8;
      margin-bottom: 32px;
    }

    .signature-line {
      border-top: 1px solid #1e293b;
      padding-top: 8px;
    }

    .signature-name {
      font-size: 12px;
      font-weight: 500;
      color: #1e293b;
    }

    .signature-date {
      font-size: 11px;
      color: #64748b;
    }

    /* Footer */
    .document-footer {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
    }

    .footer-text {
      font-size: 11px;
      color: #94a3b8;
    }

    /* Print Button */
    .print-controls {
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      gap: 8px;
      z-index: 1000;
    }

    .print-btn {
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 600;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .print-btn-primary {
      background: ${branding.primaryColor};
      color: white;
    }

    .print-btn-primary:hover {
      opacity: 0.9;
    }

    .print-btn-secondary {
      background: #f1f5f9;
      color: #475569;
    }

    .print-btn-secondary:hover {
      background: #e2e8f0;
    }

    @media print {
      .print-controls {
        display: none;
      }

      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .document {
        padding: 0;
      }
    }
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// Document Generation
// ═══════════════════════════════════════════════════════════════════════════

function formatCurrency(amount: number | undefined): string {
  if (amount === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function escapeHtml(text: string | undefined): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getDocumentTypeLabel(type: DocumentType): string {
  const labels: Record<DocumentType, string> = {
    purchase_order: 'Purchase Order',
    invoice: 'Invoice',
    compliance: 'Compliance Document',
    artwork: 'Artwork Approval',
    packing_list: 'Packing List',
    receipt: 'Receipt',
  };
  return labels[type] || type;
}

/**
 * Generate universal document HTML
 */
export async function generateDocumentHtml(data: DocumentData): Promise<string> {
  const branding = await getDocumentBranding();

  // Logo HTML
  const logoHtml = branding.companyLogo
    ? `<img src="${branding.companyLogo}" alt="${escapeHtml(branding.companyName)}">`
    : escapeHtml(branding.companyLogoText || branding.companyName.charAt(0));

  // Line items HTML
  const itemsHtml = data.lineItems?.map(item => `
    <tr>
      <td>
        ${escapeHtml(item.name)}
        ${item.sku ? `<span class="item-sku">${escapeHtml(item.sku)}</span>` : ''}
      </td>
      <td class="item-qty">${item.quantity ?? '—'}</td>
      <td class="item-price">${formatCurrency(item.unitPrice)}</td>
      <td class="item-total">${formatCurrency(item.total ?? (item.quantity && item.unitPrice ? item.quantity * item.unitPrice : undefined))}</td>
    </tr>
  `).join('') || '';

  // Custom fields HTML
  const customFieldsHtml = data.customFields
    ? Object.entries(data.customFields).map(([key, value]) => `
        <div class="info-section">
          <div class="info-label">${escapeHtml(key)}</div>
          <div class="info-value">${escapeHtml(String(value))}</div>
        </div>
      `).join('')
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.title)} - ${escapeHtml(data.documentNumber)}</title>
  <style>${getDocumentStyles(branding)}</style>
</head>
<body>
  <div class="print-controls">
    <button class="print-btn print-btn-secondary" onclick="window.close()">Close</button>
    <button class="print-btn print-btn-primary" onclick="window.print()">Print / Save PDF</button>
  </div>

  <div class="document">
    <!-- Header -->
    <div class="document-header">
      <div class="company-info">
        <div class="company-logo">${logoHtml}</div>
        <div class="company-details">
          <div class="company-name">${escapeHtml(branding.companyName)}</div>
          ${branding.companyAddress ? `<div class="company-contact">${escapeHtml(branding.companyAddress)}</div>` : ''}
          ${branding.companyPhone ? `<div class="company-contact">${escapeHtml(branding.companyPhone)}</div>` : ''}
          ${branding.companyEmail ? `<div class="company-contact">${escapeHtml(branding.companyEmail)}</div>` : ''}
          ${branding.website ? `<div class="company-contact">${escapeHtml(branding.website)}</div>` : ''}
        </div>
      </div>
      <div class="document-meta">
        <div class="document-type">${escapeHtml(getDocumentTypeLabel(data.type))}</div>
        <div class="document-number">${escapeHtml(data.documentNumber)}</div>
        <div class="document-date">${formatDate(data.date)}</div>
      </div>
    </div>

    <!-- Info Grid -->
    ${data.recipient || customFieldsHtml ? `
    <div class="info-grid">
      ${data.recipient ? `
      <div class="info-section">
        <div class="info-label">${data.type === 'purchase_order' ? 'Vendor' : 'Recipient'}</div>
        <div class="info-value">${escapeHtml(data.recipient.name)}</div>
        ${data.recipient.address ? `<div class="info-detail">${escapeHtml(data.recipient.address)}</div>` : ''}
        ${data.recipient.email ? `<div class="info-detail">${escapeHtml(data.recipient.email)}</div>` : ''}
        ${data.recipient.phone ? `<div class="info-detail">${escapeHtml(data.recipient.phone)}</div>` : ''}
      </div>
      ` : ''}
      ${customFieldsHtml}
    </div>
    ` : ''}

    <!-- Line Items -->
    ${data.lineItems && data.lineItems.length > 0 ? `
    <table class="items-table">
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Unit Price</th>
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>
    ` : ''}

    <!-- Totals -->
    ${data.totals ? `
    <div class="totals-section">
      <div class="totals-table">
        ${data.totals.subtotal !== undefined ? `
        <div class="total-row">
          <span class="total-label">Subtotal</span>
          <span class="total-value">${formatCurrency(data.totals.subtotal)}</span>
        </div>
        ` : ''}
        ${data.totals.tax ? `
        <div class="total-row">
          <span class="total-label">Tax</span>
          <span class="total-value">${formatCurrency(data.totals.tax)}</span>
        </div>
        ` : ''}
        ${data.totals.shipping ? `
        <div class="total-row">
          <span class="total-label">Shipping</span>
          <span class="total-value">${formatCurrency(data.totals.shipping)}</span>
        </div>
        ` : ''}
        ${data.totals.discount ? `
        <div class="total-row">
          <span class="total-label">Discount</span>
          <span class="total-value">-${formatCurrency(data.totals.discount)}</span>
        </div>
        ` : ''}
        <div class="total-row grand">
          <span class="total-label">Total</span>
          <span class="total-value">${formatCurrency(data.totals.total)}</span>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Notes -->
    ${data.notes ? `
    <div class="notes-section">
      <div class="notes-title">Notes / Special Instructions</div>
      <div class="notes-content">${escapeHtml(data.notes)}</div>
    </div>
    ` : ''}

    <!-- Terms -->
    ${data.terms || branding.defaultTerms ? `
    <div class="terms-section">
      <div class="terms-title">Terms & Conditions</div>
      <div class="terms-content">${escapeHtml(data.terms || branding.defaultTerms || '')}</div>
    </div>
    ` : ''}

    <!-- Signature Block -->
    ${branding.showSignatureBlock ? `
    <div class="signature-section">
      <div class="signature-block">
        <div class="signature-label">Authorized By</div>
        <div class="signature-line">
          <div class="signature-name">_________________________</div>
          <div class="signature-date">Date: _______________</div>
        </div>
      </div>
      <div class="signature-block">
        <div class="signature-label">Received By</div>
        <div class="signature-line">
          <div class="signature-name">_________________________</div>
          <div class="signature-date">Date: _______________</div>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Footer -->
    ${branding.footerText ? `
    <div class="document-footer">
      <div class="footer-text">${escapeHtml(branding.footerText)}</div>
    </div>
    ` : ''}
  </div>
</body>
</html>
  `;
}

/**
 * Open document in new window for print/PDF
 */
export async function openDocumentPrintView(data: DocumentData): Promise<void> {
  const html = await generateDocumentHtml(data);
  const win = window.open('', '_blank', 'width=900,height=700');

  if (!win) {
    throw new Error('Popup blocked - please allow popups for this site');
  }

  win.document.write(html);
  win.document.close();
}

/**
 * Download document as HTML file
 */
export async function downloadDocumentHtml(data: DocumentData): Promise<void> {
  const html = await generateDocumentHtml(data);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.documentNumber.replace(/[^a-zA-Z0-9-]/g, '_')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default {
  getDocumentBranding,
  saveDocumentBranding,
  generateDocumentHtml,
  openDocumentPrintView,
  downloadDocumentHtml,
};
