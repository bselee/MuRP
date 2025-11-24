import type { PurchaseOrder, Vendor, InventoryItem } from '../types';
import { templateService } from './templateService';

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
