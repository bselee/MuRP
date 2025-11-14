import type { PurchaseOrder, Vendor, InventoryItem } from '../types';

// These are globally available from the script tags in index.html
declare const jspdf: any;

export const generatePoPdf = (po: PurchaseOrder, vendor: Vendor) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    
    // --- Header ---
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('PURCHASE ORDER', 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`PO Number: ${po.id}`, 20, 35);
    doc.text(`Date: ${new Date(po.createdAt).toLocaleDateString()}`, 20, 40);
    doc.text(`Expected: ${po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : 'N/A'}`, 20, 45);

    // --- Company Info (From) ---
    doc.setFont('helvetica', 'bold');
    doc.text('FROM:', 20, 60);
    doc.setFont('helvetica', 'normal');
    doc.text('MuRP', 20, 65);
    doc.text('123 Mushroom Lane', 20, 70);
    doc.text('Mycelia, CA, 90210', 20, 75);
    doc.text('contact@murp.app', 20, 80);

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

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 95,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] }
    });
    
    // --- Totals ---
    const finalY = (doc as any).lastAutoTable.finalY;
    const tax = subtotal * 0.08; // 8% tax
    const total = subtotal + tax;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Subtotal: $${subtotal.toFixed(2)}`, 190, finalY + 15, { align: 'right' });
    doc.text(`Tax (8%): $${tax.toFixed(2)}`, 190, finalY + 22, { align: 'right' });
    doc.setFontSize(14);
    doc.text(`TOTAL: $${total.toFixed(2)}`, 190, finalY + 30, { align: 'right' });
    
    // --- Notes ---
    if (po.notes) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Notes:', 20, finalY + 15);
        doc.setFont('helvetica', 'normal');
        const splitNotes = doc.splitTextToSize(po.notes, 170); // 170mm width
        doc.text(splitNotes, 20, finalY + 20);
    }
    
    // --- Footer ---
    doc.setFontSize(10);
    doc.text('Thank you for your business!', 105, 280, { align: 'center' });


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
