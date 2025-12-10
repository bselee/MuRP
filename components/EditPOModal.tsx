import React, { useState, useEffect } from 'react';
import { XMarkIcon, DocumentTextIcon, MailIcon, PencilIcon, TrashIcon, PlusIcon } from './icons';
import Button from './ui/Button';
import type { PurchaseOrder, Vendor, FinalePurchaseOrderRecord } from '../types';
import { generatePoPdf } from '../services/pdfService';
import { useTheme } from './ThemeProvider';

interface EditPOModalProps {
    po: PurchaseOrder | FinalePurchaseOrderRecord | null;
    vendors: Vendor[];
    isOpen: boolean;
    onClose: () => void;
    onSave: (updatedPO: Partial<PurchaseOrder>) => Promise<void>;
    onSendEmail: (poId: string, pdfBlob: Blob) => Promise<void>;
    addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface LineItem {
    id?: string;
    sku: string;
    name: string;
    quantity: number;
    unitCost: number;
    lineTotal: number;
}

const EditPOModal: React.FC<EditPOModalProps> = ({
    po,
    vendors,
    isOpen,
    onClose,
    onSave,
    onSendEmail,
    addToast,
}) => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme !== 'light';

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    // Form state
    const [vendorId, setVendorId] = useState('');
    const [orderDate, setOrderDate] = useState('');
    const [expectedDate, setExpectedDate] = useState('');
    const [publicNotes, setPublicNotes] = useState('');
    const [privateNotes, setPrivateNotes] = useState('');
    const [lineItems, setLineItems] = useState<LineItem[]>([]);
    const [shipping, setShipping] = useState(0);
    const [tax, setTax] = useState(0);

    // Initialize form when PO changes
    useEffect(() => {
        if (!po || !isOpen) return;

        // Check if this is a Finale PO or Internal PO
        const isFinalePO = 'orderId' in po && 'vendorName' in po;

        if (isFinalePO) {
            // Finale PO
            const fpo = po as FinalePurchaseOrderRecord;
            setVendorId(''); // Finale POs don't have editable vendor
            setOrderDate(fpo.orderDate || '');
            setExpectedDate(fpo.expectedDate || '');
            setPublicNotes(fpo.publicNotes || '');
            setPrivateNotes(fpo.privateNotes || '');
            setShipping(fpo.shipping || 0);
            setTax(fpo.tax || 0);
            setLineItems([]); // Finale line items not editable from here
        } else {
            // Internal PO
            const ipo = po as PurchaseOrder;
            setVendorId(ipo.vendorId || '');
            setOrderDate(ipo.orderDate || '');
            setExpectedDate(ipo.expectedDate || '');
            setPublicNotes(ipo.notes || '');
            setPrivateNotes('');
            setShipping(ipo.shippingCost || 0);
            setTax(ipo.tax || 0);
            setLineItems(
                (ipo.items || []).map(item => ({
                    id: item.id,
                    sku: item.sku || '',
                    name: item.name || '',
                    quantity: item.quantity || 0,
                    unitCost: item.price || 0,
                    lineTotal: item.lineTotal || (item.quantity || 0) * (item.price || 0),
                }))
            );
        }

        setIsEditing(false);
    }, [po, isOpen]);

    if (!isOpen || !po) return null;

    const isFinalePO = 'orderId' in po && 'vendorName' in po;
    const poId = isFinalePO ? (po as FinalePurchaseOrderRecord).orderId : (po as PurchaseOrder).id;
    const poNumber = isFinalePO ? (po as FinalePurchaseOrderRecord).orderId : (po as PurchaseOrder).poNumber;
    const vendorName = isFinalePO 
        ? (po as FinalePurchaseOrderRecord).vendorName 
        : vendors.find(v => v.id === vendorId)?.name || 'Unknown Vendor';
    const status = isFinalePO ? (po as FinalePurchaseOrderRecord).status : (po as PurchaseOrder).status;

    const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const total = subtotal + shipping + tax;

    const handleAddLineItem = () => {
        setLineItems([
            ...lineItems,
            {
                sku: '',
                name: '',
                quantity: 1,
                unitCost: 0,
                lineTotal: 0,
            },
        ]);
    };

    const handleRemoveLineItem = (index: number) => {
        setLineItems(lineItems.filter((_, i) => i !== index));
    };

    const handleLineItemChange = (index: number, field: keyof LineItem, value: any) => {
        const updated = [...lineItems];
        updated[index] = { ...updated[index], [field]: value };

        // Recalculate line total
        if (field === 'quantity' || field === 'unitCost') {
            updated[index].lineTotal = updated[index].quantity * updated[index].unitCost;
        }

        setLineItems(updated);
    };

    const handleSave = async () => {
        if (!po || isFinalePO) {
            addToast('Finale POs cannot be edited from this interface', 'error');
            return;
        }

        setIsSaving(true);
        try {
            const ipo = po as PurchaseOrder;
            const updatedPO: Partial<PurchaseOrder> = {
                id: ipo.id,
                vendorId,
                orderDate,
                expectedDate,
                notes: publicNotes,
                shippingCost: shipping,
                tax,
                items: lineItems.map(item => ({
                    id: item.id,
                    sku: item.sku,
                    name: item.name,
                    quantity: item.quantity,
                    price: item.unitCost,
                    lineTotal: item.lineTotal,
                })),
                total,
            };

            await onSave(updatedPO);
            addToast('Purchase Order updated successfully', 'success');
            setIsEditing(false);
        } catch (error) {
            console.error('[EditPOModal] Save failed:', error);
            addToast('Failed to update Purchase Order', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleGeneratePdf = async () => {
        setIsGeneratingPdf(true);
        try {
            // Convert to format expected by pdfService
            const poPdf = isFinalePO ? (po as FinalePurchaseOrderRecord) : (po as PurchaseOrder);
            const vendor = vendors.find(v => v.id === vendorId);

            await generatePoPdf(poPdf as any, vendor as any, [] as any);
            addToast('PDF generated successfully', 'success');
        } catch (error) {
            console.error('[EditPOModal] PDF generation failed:', error);
            addToast('Failed to generate PDF', 'error');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const handleSendEmail = async () => {
        if (!po) return;

        setIsSendingEmail(true);
        try {
            // Generate PDF
            const poPdf = isFinalePO ? (po as FinalePurchaseOrderRecord) : (po as PurchaseOrder);
            const vendor = vendors.find(v => v.id === vendorId);

            // This would need to be updated to actually generate and return a Blob
            // For now, showing the structure
            const pdfBlob = new Blob([], { type: 'application/pdf' }); // Placeholder

            await onSendEmail(poId, pdfBlob);

            // Record the send timestamp - this triggers agentic workflows
            addToast(`PO #${poNumber} sent successfully! Tracking initiated.`, 'success');
        } catch (error) {
            console.error('[EditPOModal] Email send failed:', error);
            addToast('Failed to send email', 'error');
        } finally {
            setIsSendingEmail(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div 
                className={`relative w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl ${
                    isDark
                        ? 'bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800'
                        : 'bg-gradient-to-br from-white via-stone-50/95 to-white border border-stone-300'
                }`}
            >
                {/* Header */}
                <div className={`sticky top-0 z-10 flex items-center justify-between p-6 border-b backdrop-blur-xl ${
                    isDark ? 'border-slate-800 bg-slate-900/90' : 'border-stone-300 bg-white/90'
                }`}>
                    <div>
                        <h2 className={`text-2xl font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                            PO #{poNumber}
                        </h2>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            {vendorName} • {status}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {!isFinalePO && !isEditing && (
                            <Button
                                onClick={() => setIsEditing(true)}
                                variant="ghost"
                                className={isDark ? 'text-amber-400 hover:bg-amber-500/10' : 'text-amber-700 hover:bg-amber-100'}
                            >
                                <PencilIcon className="w-4 h-4 mr-2" />
                                Edit
                            </Button>
                        )}
                        <Button
                            onClick={handleGeneratePdf}
                            disabled={isGeneratingPdf}
                            variant="ghost"
                            className={isDark ? 'text-blue-400 hover:bg-blue-500/10' : 'text-blue-700 hover:bg-blue-100'}
                        >
                            <DocumentTextIcon className="w-4 h-4 mr-2" />
                            {isGeneratingPdf ? 'Generating...' : 'PDF'}
                        </Button>
                        <Button
                            onClick={handleSendEmail}
                            disabled={isSendingEmail}
                            variant="primary"
                            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700"
                        >
                            <MailIcon className="w-4 h-4 mr-2" />
                            {isSendingEmail ? 'Sending...' : 'Send Email'}
                        </Button>
                        <button
                            onClick={onClose}
                            className={`p-2 rounded-lg transition-colors ${
                                isDark ? 'hover:bg-slate-800' : 'hover:bg-stone-200'
                            }`}
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Metadata Section */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className={`p-4 rounded-xl border ${
                            isDark ? 'border-slate-800 bg-slate-900/50' : 'border-stone-300 bg-stone-50'
                        }`}>
                            <label className={`block text-xs font-medium mb-2 ${
                                isDark ? 'text-gray-400' : 'text-gray-600'
                            }`}>
                                Vendor
                            </label>
                            {isEditing && !isFinalePO ? (
                                <select
                                    value={vendorId}
                                    onChange={(e) => setVendorId(e.target.value)}
                                    className={`w-full px-3 py-2 rounded-lg border ${
                                        isDark
                                            ? 'bg-slate-950 border-slate-700 text-white'
                                            : 'bg-white border-stone-300 text-gray-900'
                                    }`}
                                >
                                    <option value="">Select Vendor</option>
                                    {vendors.map(v => (
                                        <option key={v.id} value={v.id}>{v.name}</option>
                                    ))}
                                </select>
                            ) : (
                                <p className={isDark ? 'text-white' : 'text-gray-900'}>{vendorName}</p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={`block text-xs font-medium mb-2 ${
                                    isDark ? 'text-gray-400' : 'text-gray-600'
                                }`}>
                                    Order Date
                                </label>
                                {isEditing && !isFinalePO ? (
                                    <input
                                        type="date"
                                        value={orderDate}
                                        onChange={(e) => setOrderDate(e.target.value)}
                                        className={`w-full px-3 py-2 rounded-lg border ${
                                            isDark
                                                ? 'bg-slate-950 border-slate-700 text-white'
                                                : 'bg-white border-stone-300 text-gray-900'
                                        }`}
                                    />
                                ) : (
                                    <p className={isDark ? 'text-white' : 'text-gray-900'}>
                                        {orderDate ? new Date(orderDate).toLocaleDateString() : 'N/A'}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className={`block text-xs font-medium mb-2 ${
                                    isDark ? 'text-gray-400' : 'text-gray-600'
                                }`}>
                                    Expected Delivery
                                </label>
                                {isEditing && !isFinalePO ? (
                                    <input
                                        type="date"
                                        value={expectedDate}
                                        onChange={(e) => setExpectedDate(e.target.value)}
                                        className={`w-full px-3 py-2 rounded-lg border ${
                                            isDark
                                                ? 'bg-slate-950 border-slate-700 text-white'
                                                : 'bg-white border-stone-300 text-gray-900'
                                        }`}
                                    />
                                ) : (
                                    <p className={isDark ? 'text-white' : 'text-gray-900'}>
                                        {expectedDate ? new Date(expectedDate).toLocaleDateString() : 'TBD'}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Line Items */}
                    {!isFinalePO && (
                        <div className={`p-4 rounded-xl border ${
                            isDark ? 'border-slate-800 bg-slate-900/50' : 'border-stone-300 bg-stone-50'
                        }`}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    Line Items
                                </h3>
                                {isEditing && (
                                    <Button onClick={handleAddLineItem} variant="ghost" size="sm">
                                        <PlusIcon className="w-4 h-4 mr-1" />
                                        Add Item
                                    </Button>
                                )}
                            </div>

                            <div className="space-y-3">
                                {lineItems.map((item, index) => (
                                    <div 
                                        key={index} 
                                        className={`grid grid-cols-12 gap-3 p-3 rounded-lg ${
                                            isDark ? 'bg-slate-950/50' : 'bg-white'
                                        }`}
                                    >
                                        {isEditing ? (
                                            <>
                                                <input
                                                    type="text"
                                                    placeholder="SKU"
                                                    value={item.sku}
                                                    onChange={(e) => handleLineItemChange(index, 'sku', e.target.value)}
                                                    className={`col-span-2 px-2 py-1 rounded border text-sm ${
                                                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-stone-300'
                                                    }`}
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Item Name"
                                                    value={item.name}
                                                    onChange={(e) => handleLineItemChange(index, 'name', e.target.value)}
                                                    className={`col-span-4 px-2 py-1 rounded border text-sm ${
                                                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-stone-300'
                                                    }`}
                                                />
                                                <input
                                                    type="number"
                                                    placeholder="Qty"
                                                    value={item.quantity}
                                                    onChange={(e) => handleLineItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                                                    className={`col-span-2 px-2 py-1 rounded border text-sm ${
                                                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-stone-300'
                                                    }`}
                                                />
                                                <input
                                                    type="number"
                                                    placeholder="Unit Cost"
                                                    value={item.unitCost}
                                                    onChange={(e) => handleLineItemChange(index, 'unitCost', parseFloat(e.target.value) || 0)}
                                                    className={`col-span-2 px-2 py-1 rounded border text-sm ${
                                                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-stone-300'
                                                    }`}
                                                />
                                                <div className={`col-span-1 flex items-center justify-end font-mono text-sm ${
                                                    isDark ? 'text-amber-400' : 'text-amber-700'
                                                }`}>
                                                    ${item.lineTotal.toFixed(2)}
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveLineItem(index)}
                                                    className="col-span-1 flex items-center justify-center text-red-500 hover:text-red-600"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <div className="col-span-2 text-sm font-mono">{item.sku}</div>
                                                <div className="col-span-5 text-sm">{item.name}</div>
                                                <div className="col-span-2 text-sm text-right">{item.quantity}</div>
                                                <div className="col-span-2 text-sm text-right font-mono">${item.unitCost.toFixed(2)}</div>
                                                <div className={`col-span-1 text-sm text-right font-mono ${
                                                    isDark ? 'text-amber-400' : 'text-amber-700'
                                                }`}>
                                                    ${item.lineTotal.toFixed(2)}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Financial Summary */}
                    <div className={`p-4 rounded-xl border ${
                        isDark ? 'border-slate-800 bg-slate-900/50' : 'border-stone-300 bg-stone-50'
                    }`}>
                        <h3 className={`font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            Financial Summary
                        </h3>
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Subtotal:</span>
                                <span className={`font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    ${subtotal.toFixed(2)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Shipping:</span>
                                {isEditing && !isFinalePO ? (
                                    <input
                                        type="number"
                                        value={shipping}
                                        onChange={(e) => setShipping(parseFloat(e.target.value) || 0)}
                                        className={`w-32 px-2 py-1 rounded border text-right font-mono ${
                                            isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-stone-300'
                                        }`}
                                    />
                                ) : (
                                    <span className={`font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                        ${shipping.toFixed(2)}
                                    </span>
                                )}
                            </div>
                            <div className="flex justify-between items-center">
                                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Tax:</span>
                                {isEditing && !isFinalePO ? (
                                    <input
                                        type="number"
                                        value={tax}
                                        onChange={(e) => setTax(parseFloat(e.target.value) || 0)}
                                        className={`w-32 px-2 py-1 rounded border text-right font-mono ${
                                            isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-stone-300'
                                        }`}
                                    />
                                ) : (
                                    <span className={`font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                        ${tax.toFixed(2)}
                                    </span>
                                )}
                            </div>
                            <div className={`flex justify-between pt-3 border-t ${
                                isDark ? 'border-slate-800' : 'border-stone-300'
                            }`}>
                                <span className={`font-semibold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                                    Total:
                                </span>
                                <span className={`font-mono font-bold text-lg ${
                                    isDark ? 'text-amber-400' : 'text-amber-700'
                                }`}>
                                    ${total.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className={`block text-xs font-medium mb-2 ${
                                isDark ? 'text-gray-400' : 'text-gray-600'
                            }`}>
                                Public Notes (visible to vendor)
                            </label>
                            {isEditing && !isFinalePO ? (
                                <textarea
                                    value={publicNotes}
                                    onChange={(e) => setPublicNotes(e.target.value)}
                                    rows={4}
                                    className={`w-full px-3 py-2 rounded-lg border ${
                                        isDark
                                            ? 'bg-slate-950 border-slate-700 text-white'
                                            : 'bg-white border-stone-300 text-gray-900'
                                    }`}
                                />
                            ) : (
                                <div className={`p-3 rounded-lg border ${
                                    isDark ? 'border-slate-800 bg-slate-950/50' : 'border-stone-300 bg-stone-50'
                                }`}>
                                    <p className={`text-sm whitespace-pre-wrap ${
                                        isDark ? 'text-gray-300' : 'text-gray-700'
                                    }`}>
                                        {publicNotes || 'No notes'}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className={`block text-xs font-medium mb-2 ${
                                isDark ? 'text-gray-400' : 'text-gray-600'
                            }`}>
                                Private Notes (internal only)
                            </label>
                            {isEditing && !isFinalePO ? (
                                <textarea
                                    value={privateNotes}
                                    onChange={(e) => setPrivateNotes(e.target.value)}
                                    rows={4}
                                    className={`w-full px-3 py-2 rounded-lg border ${
                                        isDark
                                            ? 'bg-slate-950 border-slate-700 text-white'
                                            : 'bg-white border-stone-300 text-gray-900'
                                    }`}
                                />
                            ) : (
                                <div className={`p-3 rounded-lg border ${
                                    isDark ? 'border-slate-800 bg-slate-950/50' : 'border-stone-300 bg-stone-50'
                                }`}>
                                    <p className={`text-sm whitespace-pre-wrap ${
                                        isDark ? 'text-gray-300' : 'text-gray-700'
                                    }`}>
                                        {privateNotes || 'No notes'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    {isEditing && !isFinalePO && (
                        <div className="flex justify-end gap-3 pt-4 border-t">
                            <Button
                                onClick={() => setIsEditing(false)}
                                variant="ghost"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={isSaving}
                                variant="primary"
                                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700"
                            >
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EditPOModal;
