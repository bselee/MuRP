import type { PurchaseOrder, Vendor, InventoryItem } from '../types';
import { templateService } from './templateService';
import { openPoPrintView as openProfessionalPoPrintView } from './poHtmlTemplate';

declare const jspdf: any;

type PdfSectionId =
  | 'branding'
  | 'poMeta'
  | 'company'
  | 'vendor'
  | 'shipTo'
  | 'lineItems'
  | 'totals'
  | 'notes';

const DEFAULT_PDF_SECTION_ORDER: PdfSectionId[] = [
  'branding',
  'poMeta',
  'company',
  'vendor',
  'shipTo',
  'lineItems',
  'totals',
  'notes',
];

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 41, g: 128, b: 185 };
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const inferImageType = (dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' => {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
};

const getSectionOrder = (template: Awaited<ReturnType<typeof templateService.getPDFTemplate>>): PdfSectionId[] => {
  const layoutSections = template.layout_config?.sections ?? [];
  if (!layoutSections.length) {
    return [...DEFAULT_PDF_SECTION_ORDER];
  }
  const order: PdfSectionId[] = layoutSections
    .filter((section) => section.enabled !== false)
    .map((section) => section.id as PdfSectionId);
  DEFAULT_PDF_SECTION_ORDER.forEach((sectionId) => {
    if (!order.includes(sectionId)) {
      order.push(sectionId);
    }
  });
  return order;
};

const buildPoPdf = async (po: PurchaseOrder, vendor: Vendor) => {
  const { jsPDF } = jspdf;
  const doc = new jsPDF();

  const template = await templateService.getPDFTemplate(vendor.id);
  const company = await templateService.getCompanySettings();
  const companyAddress = await templateService.getCompanyAddress();

  const fontFamily = template.font_family ?? 'helvetica';
  doc.setFont(fontFamily, 'normal');

  const headerColor = template.header_color || '#2980b9';
  const rgb = hexToRgb(headerColor);
  const poNumber = po.orderId || po.id;
  const orderDate = po.orderDate || po.createdAt;
  const expected = po.estimatedReceiveDate || po.expectedDate;
  const vendorAddress = vendor.address || vendor.city || vendor.state ? `${vendor.address ?? ''}` : 'N/A';
  const vendorEmail = vendor.contactEmails?.[0] ?? vendor.email ?? '';
  const shipTo = po.shipToFormatted || po.destination || 'N/A';

  const addLogoIfPresent = () => {
    if (!template.show_logo || !company.logo_url) return;
    try {
      const imageType = inferImageType(company.logo_url);
      doc.addImage(company.logo_url, imageType, 20, 10, 40, 18, undefined, 'FAST');
    } catch (error) {
      console.warn('[pdfService] Failed to render logo image', error);
    }
  };

  const sectionRenderers: Record<
    PdfSectionId,
    (startY: number) => number
  > = {
    branding: () => {
      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(22);
      doc.setTextColor(rgb.r, rgb.g, rgb.b);
      doc.text(template.header_text || 'PURCHASE ORDER', 105, 20, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      addLogoIfPresent();
      return 35;
    },
    poMeta: (startY) => {
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(10);
      doc.text(`PO Number: ${poNumber}`, 20, startY);
      doc.text(`Date: ${orderDate ? new Date(orderDate).toLocaleDateString() : 'N/A'}`, 20, startY + 5);
      doc.text(`Expected: ${expected ? new Date(expected).toLocaleDateString() : 'N/A'}`, 20, startY + 10);
      return startY + 20;
    },
    company: (startY) => {
      if (!template.show_company_info) return startY;
      doc.setFont(fontFamily, 'bold');
      doc.text('FROM:', 20, Math.max(startY, 60));
      doc.setFont(fontFamily, 'normal');
      doc.text(company.company_name, 20, Math.max(startY, 60) + 5);
      const addressLines = companyAddress.split('\n');
      let yPos = Math.max(startY, 60) + 10;
      addressLines.forEach((line) => {
        doc.text(line, 20, yPos);
        yPos += 5;
      });
      if (company.email) {
        doc.text(company.email, 20, yPos);
        yPos += 5;
      }
      if (company.phone) {
        doc.text(company.phone, 20, yPos);
        yPos += 5;
      }
      return yPos + 5;
    },
    vendor: (startY) => {
      doc.setFont(fontFamily, 'bold');
      doc.text('TO:', 110, Math.max(startY, 60));
      doc.setFont(fontFamily, 'normal');
      doc.text(vendor.name, 110, Math.max(startY, 60) + 5);
      if (vendorAddress) doc.text(vendorAddress, 110, Math.max(startY, 60) + 10);
      if (vendor.phone) doc.text(vendor.phone, 110, Math.max(startY, 60) + 15);
      if (vendorEmail) doc.text(vendorEmail, 110, Math.max(startY, 60) + 20);
      return Math.max(startY, 60) + 30;
    },
    shipTo: (startY) => {
      if (!shipTo || shipTo === 'N/A') return startY;
      doc.setFont(fontFamily, 'bold');
      doc.text('SHIP TO:', 20, startY);
      doc.setFont(fontFamily, 'normal');
      const lines = doc.splitTextToSize(shipTo, 80);
      doc.text(lines, 20, startY + 5);
      return startY + 5 + lines.length * 5;
    },
    lineItems: (startY) => {
      const tableColumn = ['SKU', 'Item Name', 'Quantity', 'Unit Price', 'Total'];
      const tableRows: (string | number)[][] = [];
      po.items.forEach((item) => {
        const unitPrice = item.unitCost ?? item.price ?? 0;
        const itemTotal = item.lineTotal ?? unitPrice * item.quantity;
        tableRows.push([
          item.sku,
          item.description,
          item.quantity,
          `$${unitPrice.toFixed(2)}`,
          `$${itemTotal.toFixed(2)}`,
        ]);
      });

      doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: Math.max(startY, 95),
        theme: 'striped',
        headStyles: { fillColor: [rgb.r, rgb.g, rgb.b] },
        styles: { font: fontFamily },
      });
      return (doc as any).lastAutoTable.finalY;
    },
    totals: (startY) => {
      const subtotal = po.items.reduce((sum, item) => sum + (item.lineTotal ?? (item.unitCost ?? item.price ?? 0) * item.quantity), 0);
      const fallbackTax = po.taxableFeeFreight ?? 0;
      const computedTax = template.show_tax ? subtotal * (company.tax_rate ?? 0) : fallbackTax;
      const total = typeof po.total === 'number' ? po.total : subtotal + computedTax;

      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(12);
      doc.text(`Subtotal: $${subtotal.toFixed(2)}`, 190, startY + 15, { align: 'right' });
      if (template.show_tax) {
        doc.text(
          `Tax (${((company.tax_rate ?? 0) * 100).toFixed(1)}%): $${computedTax.toFixed(2)}`,
          190,
          startY + 22,
          { align: 'right' },
        );
        doc.setFontSize(14);
        doc.text(`TOTAL: $${total.toFixed(2)}`, 190, startY + 30, { align: 'right' });
        doc.setFontSize(10);
        return startY + 40;
      }
      doc.setFontSize(14);
      doc.text(`TOTAL: $${subtotal.toFixed(2)}`, 190, startY + 22, { align: 'right' });
      doc.setFontSize(10);
      return startY + 32;
    },
    notes: (startY) => {
      const notesSource = po.vendorNotes || po.notes;
      if (!notesSource) return startY;
      doc.setFont(fontFamily, 'bold');
      doc.text('Notes:', 20, startY + 10);
      doc.setFont(fontFamily, 'normal');
      const splitNotes = doc.splitTextToSize(notesSource, 170);
      doc.text(splitNotes, 20, startY + 15);
      return startY + 15 + splitNotes.length * 5;
    },
  };

  const sectionOrder = getSectionOrder(template);
  let cursorY = 20;

  for (const section of sectionOrder) {
    if (section === 'company' && !template.show_company_info) continue;
    if (!sectionRenderers[section]) continue;
    cursorY = sectionRenderers[section](cursorY);
  }

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(10);
  doc.text(template.footer_text || 'Thank you for your business!', 105, 280, { align: 'center' });

  return { doc, fileName: `${poNumber}.pdf` };
};

export const generatePoPdf = async (po: PurchaseOrder, vendor: Vendor) => {
    const { doc, fileName } = await buildPoPdf(po, vendor);
    doc.save(fileName);
};

/**
 * Open the professional HTML template in a new window for printing.
 * This is the preferred method for generating PO PDFs - uses the
 * professional template design with DM Sans font and clean styling.
 */
export const openPoPrintView = async (po: PurchaseOrder, vendor: Vendor) => {
    return openProfessionalPoPrintView(po, vendor);
};

export const getPoPdfAttachment = async (po: PurchaseOrder, vendor: Vendor) => {
    const { doc, fileName } = await buildPoPdf(po, vendor);
    const buffer = doc.output('arraybuffer');
    const base64 = arrayBufferToBase64(buffer);
    return {
        filename: fileName,
        mimeType: 'application/pdf',
        contentBase64: base64,
    };
};

export const generateInventoryPdf = (inventory: InventoryItem[], vendorMap: Map<string, string>) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Inventory Report', 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 30);

    const tableColumn = ["SKU", "Name", "Category", "Stock", "On Order", "Reorder Pt.", "Vendor"];
    const tableRows: (string|number)[][] = [];

    inventory.forEach(item => {
        tableRows.push([
            item.sku,
            item.name,
            item.category,
            item.stock,
            item.onOrder,
            item.reorderPoint,
            vendorMap.get(item.vendorId) || 'N/A'
        ]);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 40,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] }
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.text(`Page ${i} of ${pageCount}`, 190, 285, { align: 'right' });
    }

    doc.save(`inventory-report-${new Date().toISOString().split('T')[0]}.pdf`);
};

export const generateSkuProductPage = (
  sku: string,
  inventoryItem: InventoryItem | undefined,
  bomUsages: Array<{ bomId: string; bomName: string; quantity: number; unit?: string }>,
  recentPurchases: Array<{
    orderId: string;
    vendorName: string;
    orderDate: string;
    quantity: number;
    unitCost: number;
    status: string;
  }>
) => {
  const { jsPDF } = jspdf;
  const doc = new jsPDF();

  // Title
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('SKU Product Page', 105, 25, { align: 'center' });

  // SKU Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(`SKU: ${sku}`, 20, 45);

  if (inventoryItem) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${inventoryItem.name}`, 20, 55);
    doc.text(`Category: ${inventoryItem.category}`, 20, 62);
    doc.text(`Vendor: ${inventoryItem.vendorId}`, 20, 69);
    doc.text(`Status: ${inventoryItem.status || 'Active'}`, 20, 76);

    // Stock Information
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Stock Information', 20, 90);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Current Stock: ${inventoryItem.stock}`, 20, 100);
    doc.text(`On Order: ${inventoryItem.onOrder}`, 20, 107);
    doc.text(`Reorder Point: ${inventoryItem.reorderPoint}`, 20, 114);

    // Pricing Information
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Pricing Information', 20, 130);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Unit Cost: $${inventoryItem.unitCost?.toFixed(2) || 'N/A'}`, 20, 140);
    doc.text(`Unit Price: $${inventoryItem.unitPrice?.toFixed(2) || 'N/A'}`, 20, 147);
    doc.text(`MOQ: ${inventoryItem.moq || 'N/A'}`, 20, 154);
    doc.text(`Lead Time: ${inventoryItem.leadTimeDays ? `${inventoryItem.leadTimeDays} days` : 'N/A'}`, 20, 161);
  }

  // BOM Usage Section
  if (bomUsages.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('BOM Usage', 20, 180);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    bomUsages.forEach((usage, index) => {
      const yPos = 190 + (index * 10);
      if (yPos > 270) {
        doc.addPage();
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
      }
      doc.text(`${usage.bomName}: ${usage.quantity} ${usage.unit || 'units'}`, 20, yPos);
    });
  }

  // Recent Purchases Section
  if (recentPurchases.length > 0) {
    let yPos = bomUsages.length > 0 ? 200 + (bomUsages.length * 10) : 180;

    if (yPos > 250) {
      doc.addPage();
      yPos = 30;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Recent Purchases', 20, yPos);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const tableColumn = ["Order ID", "Vendor", "Date", "Qty", "Unit Cost", "Status"];
    const tableRows: (string | number)[][] = [];

    recentPurchases.slice(0, 10).forEach(purchase => {
      tableRows.push([
        purchase.orderId,
        purchase.vendorName,
        new Date(purchase.orderDate).toLocaleDateString(),
        purchase.quantity,
        `$${purchase.unitCost.toFixed(2)}`,
        purchase.status
      ]);
    });

    doc.autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: yPos + 10,
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 35 },
        2: { cellWidth: 25 },
        3: { cellWidth: 15 },
        4: { cellWidth: 20 },
        5: { cellWidth: 25 }
      }
    });
  }

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 285);
    doc.text(`Page ${i} of ${pageCount}`, 190, 285, { align: 'right' });
  }

  doc.save(`sku-${sku}-product-page-${new Date().toISOString().split('T')[0]}.pdf`);
};
