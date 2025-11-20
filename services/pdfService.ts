import type { PurchaseOrder, Vendor, InventoryItem } from '../types';
import { templateService } from './templateService';

// These are globally available from the script tags in index.html
declare const jspdf: any;

// Helper function to convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 41, g: 128, b: 185 }; // Default blue
}

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
};

const buildPoPdf = async (po: PurchaseOrder, vendor: Vendor) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();

    // Load template and company settings
    const template = await templateService.getPDFTemplate(vendor.id);
    const company = await templateService.getCompanySettings();
    const companyAddress = await templateService.getCompanyAddress();

    // --- Header ---
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');

    // Use template header color
    const headerColor = template.header_color || '#2980b9';
    const rgb = hexToRgb(headerColor);
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.text(template.header_text || 'PURCHASE ORDER', 105, 20, { align: 'center' });
    doc.setTextColor(0, 0, 0); // Reset to black

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const poNumber = po.orderId || po.id;
    const orderDate = po.orderDate || po.createdAt;
    const expected = po.estimatedReceiveDate || po.expectedDate;
    doc.text(`PO Number: ${poNumber}`, 20, 35);
    doc.text(`Date: ${orderDate ? new Date(orderDate).toLocaleDateString() : 'N/A'}`, 20, 40);
    doc.text(`Expected: ${expected ? new Date(expected).toLocaleDateString() : 'N/A'}`, 20, 45);

    // --- Company Info (From) ---
    if (template.show_company_info) {
        doc.setFont('helvetica', 'bold');
        doc.text('FROM:', 20, 60);
        doc.setFont('helvetica', 'normal');
        doc.text(company.company_name, 20, 65);

        const addressLines = companyAddress.split('\n');
        let yPos = 70;
        addressLines.forEach(line => {
            doc.text(line, 20, yPos);
            yPos += 5;
        });

        if (company.email) {
            doc.text(company.email, 20, yPos);
        }
    }

    // --- Vendor Info (To) ---
    doc.setFont('helvetica', 'bold');
    doc.text('TO:', 110, 60);
    doc.setFont('helvetica', 'normal');
    doc.text(vendor.name, 110, 65);
    doc.text(vendor.address, 110, 70);
    doc.text(vendor.phone, 110, 75);
    doc.text(vendor.contactEmails[0], 110, 80);

    // --- Items Table ---
    const tableColumn = ["SKU", "Item Name", "Quantity", "Unit Price", "Total"];
    const tableRows: (string|number)[][] = [];

    let subtotal = 0;
    po.items.forEach(item => {
        const unitPrice = item.unitCost ?? item.price ?? 0;
        const itemTotal = item.lineTotal ?? unitPrice * item.quantity;
        subtotal += itemTotal;
        const itemData = [
            item.sku,
            item.description,
            item.quantity,
            `$${unitPrice.toFixed(2)}`,
            `$${itemTotal.toFixed(2)}`
        ];
        tableRows.push(itemData);
    });

    // Use template header color for table
    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 95,
        theme: 'striped',
        headStyles: { fillColor: [rgb.r, rgb.g, rgb.b] }
    });

    // --- Totals ---
    const finalY = (doc as any).lastAutoTable.finalY;
    const fallbackTax = po.taxableFeeFreight ?? 0;
    const computedTax = template.show_tax ? subtotal * (company.tax_rate ?? 0) : fallbackTax;
    const total = typeof po.total === 'number' ? po.total : subtotal + computedTax;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Subtotal: $${subtotal.toFixed(2)}`, 190, finalY + 15, { align: 'right' });

    if (template.show_tax) {
        doc.text(`Tax (${((company.tax_rate ?? 0) * 100).toFixed(1)}%): $${computedTax.toFixed(2)}`, 190, finalY + 22, { align: 'right' });
        doc.setFontSize(14);
        doc.text(`TOTAL: $${total.toFixed(2)}`, 190, finalY + 30, { align: 'right' });
    } else {
        doc.setFontSize(14);
        doc.text(`TOTAL: $${subtotal.toFixed(2)}`, 190, finalY + 22, { align: 'right' });
    }

    // --- Notes ---
    const notesSource = po.vendorNotes || po.notes;
    if (notesSource) {
        const notesY = template.show_tax ? finalY + 40 : finalY + 30;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Notes:', 20, notesY);
        doc.setFont('helvetica', 'normal');
        const splitNotes = doc.splitTextToSize(notesSource, 170);
        doc.text(splitNotes, 20, notesY + 5);
    }

    // --- Footer ---
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
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
