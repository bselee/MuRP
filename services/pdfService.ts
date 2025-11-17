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

export const generatePoPdf = async (po: PurchaseOrder, vendor: Vendor) => {
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
    doc.text(`PO Number: ${po.id}`, 20, 35);
    doc.text(`Date: ${new Date(po.createdAt).toLocaleDateString()}`, 20, 40);
    doc.text(`Expected: ${po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : 'N/A'}`, 20, 45);

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
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        const itemData = [
            item.sku,
            item.name,
            item.quantity,
            `$${item.price.toFixed(2)}`,
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
    const tax = template.show_tax ? subtotal * company.tax_rate : 0;
    const total = subtotal + tax;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Subtotal: $${subtotal.toFixed(2)}`, 190, finalY + 15, { align: 'right' });

    if (template.show_tax) {
        doc.text(`Tax (${(company.tax_rate * 100).toFixed(1)}%): $${tax.toFixed(2)}`, 190, finalY + 22, { align: 'right' });
        doc.setFontSize(14);
        doc.text(`TOTAL: $${total.toFixed(2)}`, 190, finalY + 30, { align: 'right' });
    } else {
        doc.setFontSize(14);
        doc.text(`TOTAL: $${subtotal.toFixed(2)}`, 190, finalY + 22, { align: 'right' });
    }

    // --- Notes ---
    if (po.notes) {
        const notesY = template.show_tax ? finalY + 40 : finalY + 30;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Notes:', 20, notesY);
        doc.setFont('helvetica', 'normal');
        const splitNotes = doc.splitTextToSize(po.notes, 170); // 170mm width
        doc.text(splitNotes, 20, notesY + 5);
    }

    // --- Footer ---
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(template.footer_text || 'Thank you for your business!', 105, 280, { align: 'center' });

    // --- Save File ---
    doc.save(`${po.id}.pdf`);
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
