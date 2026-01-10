/**
 * PO HTML Template Generator
 *
 * Generates professional HTML purchase order documents based on
 * the provided HTML/CSS template design with DM Sans and JetBrains Mono fonts.
 *
 * Usage:
 * - generatePoHtml() returns HTML string for rendering or printing
 * - openPoPrintView() opens a new window with the PO ready for print/PDF
 */

import type { PurchaseOrder, Vendor } from '../types';
import { templateService } from './templateService';

interface PoHtmlOptions {
  showTerms?: boolean;
  showSignature?: boolean;
  showQualityRequirements?: boolean;
}

/**
 * Format a date for display
 */
const formatDate = (dateStr: string | undefined | null): string => {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return 'N/A';
  }
};

/**
 * Format currency
 */
const formatCurrency = (amount: number): string => {
  return `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

/**
 * Generate the full HTML document for a purchase order
 */
export async function generatePoHtml(
  po: PurchaseOrder,
  vendor: Vendor,
  options: PoHtmlOptions = {}
): Promise<string> {
  const { showTerms = true, showSignature = true, showQualityRequirements = true } = options;

  // Get company settings
  const company = await templateService.getCompanySettings();
  const companyAddress = await templateService.getCompanyAddress();

  const poNumber = po.orderId || po.id;
  const orderDate = formatDate(po.orderDate || po.createdAt);
  const expectedDate = formatDate(po.estimatedReceiveDate || po.expectedDate);
  const vendorEmail = vendor.contactEmails?.[0] ?? vendor.email ?? '';
  const vendorPhone = vendor.phone || '';
  const vendorAddress = [vendor.address, vendor.city, vendor.state, vendor.zip]
    .filter(Boolean)
    .join(', ') || 'N/A';

  // Calculate totals
  const subtotal = po.items.reduce((sum, item) => {
    const unitPrice = item.unitCost ?? item.price ?? 0;
    return sum + (item.lineTotal ?? unitPrice * item.quantity);
  }, 0);
  const freight = po.shippingCost ?? 0;
  const tax = po.taxableFeeFreight ?? 0;
  const total = po.total ?? (subtotal + freight + tax);

  // Ship to address
  const shipTo = po.shipToFormatted || po.destination || companyAddress || 'N/A';

  // Generate line items HTML
  const lineItemsHtml = po.items.map(item => {
    const unitPrice = item.unitCost ?? item.price ?? 0;
    const lineTotal = item.lineTotal ?? unitPrice * item.quantity;
    const unit = item.unit || 'each';
    return `
        <tr>
          <td class="sku-cell">${item.sku}</td>
          <td class="desc-cell">${item.description || item.name || item.sku}</td>
          <td class="qty-cell">${item.quantity}</td>
          <td class="unit-cell">${unit}</td>
          <td class="price-cell">${formatCurrency(unitPrice)}</td>
          <td class="total-cell">${formatCurrency(lineTotal)}</td>
        </tr>`;
  }).join('\n');

  // Notes/special instructions
  const notesHtml = (po.vendorNotes || po.notes) ? `
      <div class="notes-box">
        <h4>Special Instructions</h4>
        <p>${po.vendorNotes || po.notes}</p>
      </div>` : '';

  // Terms section
  const termsHtml = showTerms ? `
    <div class="terms-section">
      <div class="terms-box">
        <h4>Terms & Conditions</h4>
        <p>
          1. Prices are firm for 30 days from PO date. 2. All goods remain property of buyer upon shipment.
          3. Vendor agrees to replace defective merchandise at no additional cost. 4. Invoices must reference
          PO number. 5. Shortages must be reported within 48 hours of receipt. 6. This PO is subject to
          buyer's standard terms and conditions available upon request.
        </p>
      </div>
      ${showQualityRequirements ? `
      <div class="terms-box">
        <h4>Quality Requirements</h4>
        <p>
          All products must meet specifications as outlined in our Vendor Quality Agreement.
          Certificate of Analysis (COA) required for organic materials. Material Safety Data Sheets (MSDS)
          must accompany first shipment of any new products. Non-conforming materials subject to return
          at vendor's expense.
        </p>
      </div>` : ''}
    </div>` : '';

  // Signature section
  const signatureHtml = showSignature ? `
    <div class="signature-section">
      <div class="signature-box">
        <div class="signature-line"></div>
        <div class="signature-label">
          <span>Authorized Signature (Buyer)</span>
          <span>Date</span>
        </div>
      </div>
      <div class="signature-box">
        <div class="signature-line"></div>
        <div class="signature-label">
          <span>Authorized Signature (Vendor)</span>
          <span>Date</span>
        </div>
      </div>
    </div>` : '';

  // Company logo mark (first letter of company name)
  const logoMark = (company.company_name || 'M').charAt(0).toUpperCase();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Purchase Order - ${poNumber}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    @page {
      size: letter;
      margin: 0.5in;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'DM Sans', -apple-system, sans-serif;
      font-size: 10pt;
      line-height: 1.5;
      color: #1e293b;
      background: #fff;
    }

    .page {
      max-width: 8.5in;
      min-height: 11in;
      margin: 0 auto;
      padding: 0.5in;
      background: white;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 24px;
      border-bottom: 2px solid #0f172a;
      margin-bottom: 24px;
    }

    .company-logo {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-mark {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #0f172a 0%, #334155 100%);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 18px;
      letter-spacing: -1px;
    }

    .company-name {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.5px;
    }

    .company-tagline {
      font-size: 9px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-top: 2px;
    }

    .po-header {
      text-align: right;
    }

    .po-title {
      font-size: 28px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -1px;
      margin-bottom: 4px;
    }

    .po-number {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 500;
      color: #475569;
      background: #f1f5f9;
      padding: 4px 12px;
      border-radius: 4px;
      display: inline-block;
    }

    /* Info Grid */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }

    .info-box {
      background: #fafafa;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
    }

    .info-box-header {
      font-size: 8px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #94a3b8;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e2e8f0;
    }

    .info-box h4 {
      font-size: 11px;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 4px;
    }

    .info-box p {
      font-size: 9px;
      color: #475569;
      line-height: 1.6;
    }

    .info-box .attention {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #e2e8f0;
      font-size: 9px;
      color: #64748b;
    }

    /* Meta info row */
    .meta-row {
      display: flex;
      gap: 32px;
      margin-bottom: 24px;
      padding: 12px 16px;
      background: #f8fafc;
      border-radius: 6px;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
    }

    .meta-label {
      font-size: 8px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #94a3b8;
      margin-bottom: 2px;
    }

    .meta-value {
      font-size: 10px;
      font-weight: 500;
      color: #1e293b;
    }

    /* Table */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }

    .items-table thead th {
      font-size: 8px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #64748b;
      text-align: left;
      padding: 10px 12px;
      background: #0f172a;
      color: #fff;
    }

    .items-table thead th:first-child {
      border-radius: 6px 0 0 0;
    }

    .items-table thead th:last-child {
      border-radius: 0 6px 0 0;
      text-align: right;
    }

    .items-table thead th.text-center {
      text-align: center;
    }

    .items-table thead th.text-right {
      text-align: right;
    }

    .items-table tbody td {
      padding: 12px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 9px;
    }

    .items-table tbody tr:last-child td {
      border-bottom: 2px solid #0f172a;
    }

    .items-table tbody tr:nth-child(even) {
      background: #fafafa;
    }

    .sku-cell {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      font-weight: 500;
      color: #475569;
    }

    .desc-cell {
      color: #1e293b;
      font-weight: 500;
    }

    .qty-cell {
      text-align: center;
      color: #475569;
    }

    .unit-cell {
      text-align: center;
      color: #94a3b8;
      font-size: 8px;
      text-transform: uppercase;
    }

    .price-cell {
      text-align: right;
      font-family: 'JetBrains Mono', monospace;
      color: #475569;
    }

    .total-cell {
      text-align: right;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      color: #0f172a;
    }

    /* Totals Section */
    .totals-section {
      display: flex;
      justify-content: space-between;
      gap: 40px;
      margin-bottom: 24px;
    }

    .notes-box {
      flex: 1;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 16px;
    }

    .notes-box h4 {
      font-size: 8px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #b45309;
      margin-bottom: 8px;
    }

    .notes-box p {
      font-size: 9px;
      color: #92400e;
      line-height: 1.6;
    }

    .totals-box {
      width: 260px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }

    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 16px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 10px;
    }

    .total-row:last-child {
      border-bottom: none;
    }

    .total-row .label {
      color: #64748b;
    }

    .total-row .value {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
      color: #1e293b;
    }

    .total-row.grand-total {
      background: #0f172a;
      padding: 14px 16px;
    }

    .total-row.grand-total .label {
      color: #94a3b8;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.5px;
    }

    .total-row.grand-total .value {
      color: #fff;
      font-size: 16px;
      font-weight: 600;
    }

    /* Terms Section */
    .terms-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      padding-top: 24px;
      border-top: 1px solid #e2e8f0;
      margin-bottom: 32px;
    }

    .terms-box h4 {
      font-size: 8px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #94a3b8;
      margin-bottom: 8px;
    }

    .terms-box p {
      font-size: 8px;
      color: #64748b;
      line-height: 1.7;
    }

    /* Signature Section */
    .signature-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 60px;
      padding-top: 24px;
      border-top: 1px solid #e2e8f0;
    }

    .signature-box {
      padding-top: 40px;
    }

    .signature-line {
      border-bottom: 1px solid #0f172a;
      margin-bottom: 6px;
    }

    .signature-label {
      display: flex;
      justify-content: space-between;
      font-size: 8px;
      color: #94a3b8;
    }

    /* Footer */
    .footer {
      margin-top: auto;
      padding-top: 24px;
      text-align: center;
      font-size: 8px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
    }

    .footer strong {
      color: #64748b;
    }

    /* Print styles */
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      .page {
        padding: 0;
        min-height: auto;
      }

      .no-print {
        display: none !important;
      }
    }

    /* Print button for screen */
    .print-controls {
      position: fixed;
      top: 20px;
      right: 20px;
      display: flex;
      gap: 10px;
      z-index: 1000;
    }

    .print-btn {
      padding: 12px 24px;
      background: #0f172a;
      color: white;
      border: none;
      border-radius: 8px;
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .print-btn:hover {
      background: #1e293b;
    }

    .close-btn {
      padding: 12px 24px;
      background: #f1f5f9;
      color: #475569;
      border: none;
      border-radius: 8px;
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .close-btn:hover {
      background: #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="print-controls no-print">
    <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
    <button class="close-btn" onclick="window.close()">Close</button>
  </div>

  <div class="page">
    <!-- Header -->
    <header class="header">
      <div class="company-logo">
        <div class="logo-mark">${logoMark}</div>
        <div>
          <div class="company-name">${company.company_name || 'Company Name'}</div>
          <div class="company-tagline">Purchase Order</div>
        </div>
      </div>
      <div class="po-header">
        <div class="po-title">Purchase Order</div>
        <div class="po-number">${poNumber}</div>
      </div>
    </header>

    <!-- Info Grid -->
    <div class="info-grid">
      <div class="info-box">
        <div class="info-box-header">Vendor</div>
        <h4>${vendor.name}</h4>
        <p>${vendorAddress}</p>
        ${vendorPhone || vendorEmail ? `
        <div class="attention">
          ${vendorPhone ? `Phone: ${vendorPhone}<br>` : ''}
          ${vendorEmail ? `Email: ${vendorEmail}` : ''}
        </div>` : ''}
      </div>

      <div class="info-box">
        <div class="info-box-header">Ship To</div>
        <h4>${company.company_name || 'Company'}</h4>
        <p>${shipTo.replace(/\n/g, '<br>')}</p>
      </div>

      <div class="info-box">
        <div class="info-box-header">Bill To</div>
        <h4>${company.company_name || 'Company'}</h4>
        <p>${companyAddress.replace(/\n/g, '<br>')}</p>
        ${company.email ? `
        <div class="attention">
          AP Contact: ${company.email}
        </div>` : ''}
      </div>
    </div>

    <!-- Meta Row -->
    <div class="meta-row">
      <div class="meta-item">
        <span class="meta-label">Order Date</span>
        <span class="meta-value">${orderDate}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Expected Delivery</span>
        <span class="meta-value">${expectedDate}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Payment Terms</span>
        <span class="meta-value">${po.paymentTerms || vendor.paymentTerms || 'Net 30'}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Ship Via</span>
        <span class="meta-value">${po.shippingMethod || 'Standard'}</span>
      </div>
    </div>

    <!-- Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 12%">SKU</th>
          <th style="width: 40%">Description</th>
          <th class="text-center" style="width: 10%">Qty</th>
          <th class="text-center" style="width: 10%">Unit</th>
          <th class="text-right" style="width: 14%">Unit Price</th>
          <th class="text-right" style="width: 14%">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
      </tbody>
    </table>

    <!-- Totals Section -->
    <div class="totals-section">
      ${notesHtml || '<div></div>'}

      <div class="totals-box">
        <div class="total-row">
          <span class="label">Subtotal</span>
          <span class="value">${formatCurrency(subtotal)}</span>
        </div>
        ${freight > 0 ? `
        <div class="total-row">
          <span class="label">Freight</span>
          <span class="value">${formatCurrency(freight)}</span>
        </div>` : ''}
        ${tax > 0 ? `
        <div class="total-row">
          <span class="label">Tax</span>
          <span class="value">${formatCurrency(tax)}</span>
        </div>` : ''}
        <div class="total-row grand-total">
          <span class="label">Total Due</span>
          <span class="value">${formatCurrency(total)}</span>
        </div>
      </div>
    </div>

    ${termsHtml}

    ${signatureHtml}

    <!-- Footer -->
    <footer class="footer">
      <p>
        <strong>${company.company_name || 'Company'}</strong> ·
        ${companyAddress.replace(/\n/g, ' · ')}
        ${company.email ? ` · ${company.email}` : ''}
      </p>
      <p style="margin-top: 4px;">
        This Purchase Order constitutes a binding agreement upon acknowledgment by vendor.
      </p>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Open a new window with the PO HTML for printing/saving as PDF
 */
export async function openPoPrintView(po: PurchaseOrder, vendor: Vendor): Promise<void> {
  const html = await generatePoHtml(po, vendor);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Failed to open print window. Please allow popups for this site.');
  }

  printWindow.document.write(html);
  printWindow.document.close();
}

/**
 * Generate PO HTML and trigger download as HTML file
 * (useful for archiving or email attachment)
 */
export async function downloadPoHtml(po: PurchaseOrder, vendor: Vendor): Promise<void> {
  const html = await generatePoHtml(po, vendor);
  const poNumber = po.orderId || po.id;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${poNumber}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
