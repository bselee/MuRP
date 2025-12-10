import React, { useState } from 'react';
import { ChevronDownIcon, PencilIcon, DocumentArrowDownIcon, EnvelopeIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useTheme } from './ThemeProvider';
import type { FinalePurchaseOrderRecord } from '../types';

interface EditablePOCardProps {
    po: FinalePurchaseOrderRecord;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onSave: (updatedPO: Partial<FinalePurchaseOrderRecord>) => Promise<void>;
    onExportPDF: (po: FinalePurchaseOrderRecord) => Promise<void>;
    onSendEmail: (po: FinalePurchaseOrderRecord) => Promise<void>;
    isDark: boolean;
}

interface EditState {
    publicNotes?: string;
    privateNotes?: string;
    lineItems?: any[];
}

const EditablePOCard: React.FC<EditablePOCardProps> = ({
    po,
    isExpanded,
    onToggleExpand,
    onSave,
    onExportPDF,
    onSendEmail,
    isDark
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editState, setEditState] = useState<EditState>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isSending, setIsSending] = useState(false);

    const handleStartEdit = () => {
        setEditState({
            publicNotes: po.publicNotes || '',
            privateNotes: po.privateNotes || '',
            lineItems: po.lineItems ? JSON.parse(JSON.stringify(po.lineItems)) : []
        });
        setIsEditing(true);
    };

    const handleCancelEdit = () => {
        setEditState({});
        setIsEditing(false);
    };

    const handleSaveEdit = async () => {
        setIsSaving(true);
        try {
            await onSave(editState);
            setIsEditing(false);
            setEditState({});
        } catch (error) {
            console.error('Failed to save PO:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleLineItemChange = (index: number, field: string, value: any) => {
        const newLineItems = [...(editState.lineItems || [])];
        newLineItems[index] = { ...newLineItems[index], [field]: value };
        
        // Recalculate line total if quantity or unit price changed
        if (field === 'quantity_ordered' || field === 'unit_price') {
            const qty = field === 'quantity_ordered' ? parseFloat(value) : newLineItems[index].quantity_ordered;
            const price = field === 'unit_price' ? parseFloat(value) : newLineItems[index].unit_price;
            newLineItems[index].line_total = qty * price;
        }
        
        setEditState({ ...editState, lineItems: newLineItems });
    };

    const handleExportPDF = async () => {
        setIsExporting(true);
        try {
            await onExportPDF(po);
        } finally {
            setIsExporting(false);
        }
    };

    const handleSendEmail = async () => {
        setIsSending(true);
        try {
            await onSendEmail(po);
        } finally {
            setIsSending(false);
        }
    };

    const formatTimestamp = (timestamp: string | null | undefined) => {
        if (!timestamp) return null;
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className={`relative rounded-2xl border backdrop-blur-lg overflow-hidden transition-all duration-300 ${
            isDark
                ? 'border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-800/85 to-slate-900/95 shadow-[0_8px_32px_rgba(0,0,0,0.4)]'
                : 'border-stone-300/30 bg-gradient-to-br from-white/98 via-stone-50/90 to-white/98 shadow-[0_12px_40px_rgba(15,23,42,0.15)]'
        }`}>
            {/* Header */}
            <div
                className="p-6 cursor-pointer select-none"
                onClick={onToggleExpand}
            >
                {/* Status & Actions Row */}
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        {/* Status Badge */}
                        <div className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
                            po.status === 'COMMITTED'
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : po.status === 'RECEIVED'
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : po.status === 'CANCELLED'
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                        }`}>
                            {po.status}
                        </div>

                        {/* Sent Timestamp Badge */}
                        {po.sentAt && (
                            <div className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                                isDark
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                            }`}>
                                <EnvelopeIcon className="w-3.5 h-3.5" />
                                <span>Sent {formatTimestamp(po.sentAt)}</span>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    {isExpanded && (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {!isEditing ? (
                                <>
                                    <button
                                        onClick={handleStartEdit}
                                        className={`p-2 rounded-lg transition-colors ${
                                            isDark
                                                ? 'hover:bg-slate-700/50 text-gray-400 hover:text-amber-400'
                                                : 'hover:bg-stone-200 text-gray-600 hover:text-amber-600'
                                        }`}
                                        title="Edit PO"
                                    >
                                        <PencilIcon className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={handleExportPDF}
                                        disabled={isExporting}
                                        className={`p-2 rounded-lg transition-colors ${
                                            isDark
                                                ? 'hover:bg-slate-700/50 text-gray-400 hover:text-blue-400'
                                                : 'hover:bg-stone-200 text-gray-600 hover:text-blue-600'
                                        } disabled:opacity-50`}
                                        title="Export PDF"
                                    >
                                        <DocumentArrowDownIcon className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={handleSendEmail}
                                        disabled={isSending}
                                        className={`p-2 rounded-lg transition-colors ${
                                            isDark
                                                ? 'hover:bg-slate-700/50 text-gray-400 hover:text-green-400'
                                                : 'hover:bg-stone-200 text-gray-600 hover:text-green-600'
                                        } disabled:opacity-50`}
                                        title="Email PO"
                                    >
                                        <EnvelopeIcon className="w-4 h-4" />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={handleSaveEdit}
                                        disabled={isSaving}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        <CheckIcon className="w-4 h-4" />
                                        {isSaving ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                        onClick={handleCancelEdit}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 ${
                                            isDark
                                                ? 'bg-slate-700 hover:bg-slate-600 text-gray-300'
                                                : 'bg-stone-200 hover:bg-stone-300 text-gray-700'
                                        }`}
                                    >
                                        <XMarkIcon className="w-4 h-4" />
                                        Cancel
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* PO Header Info */}
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-baseline gap-3 mb-2">
                            <h3 className={`text-xl font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                                {po.orderId}
                            </h3>
                            <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                {po.vendorName || 'Unknown Vendor'}
                            </span>
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="text-right">
                                <div className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>Order Date</div>
                                <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    {po.orderDate ? new Date(po.orderDate).toLocaleDateString() : 'N/A'}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>Expected</div>
                                <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : 'TBD'}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className={`text-2xl font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                                    ${po.total?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                                </div>
                                <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                                    {po.lineCount || 0} items • {po.totalQuantity?.toFixed(0) || 0} units
                                </div>
                            </div>
                            <ChevronDownIcon 
                                className={`w-5 h-5 transition-transform ${isDark ? 'text-gray-400' : 'text-gray-600'} ${isExpanded ? 'rotate-180' : ''}`} 
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
                <div className={`relative p-4 space-y-4 border-t backdrop-blur-lg ${
                    isDark
                        ? 'border-white/5 bg-slate-950/70'
                        : 'border-amber-900/15 bg-amber-50/80'
                }`}>
                    {/* Summary Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className={`rounded-xl border backdrop-blur-lg p-4 space-y-3 ${
                            isDark
                                ? 'border-white/10 bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-slate-950/80 shadow-[0_12px_30px_rgba(2,6,23,0.45)]'
                                : 'border-stone-300/25 bg-gradient-to-br from-white/98 via-stone-100/50 to-white/92 shadow-[0_18px_40px_rgba(15,23,42,0.18)]'
                        }`}>
                            <div>
                                <div className={`text-xs uppercase tracking-wider mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Vendor Information
                                </div>
                                <div className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                                    {po.vendorName || 'Unknown'}
                                </div>
                                {po.vendorUrl && (
                                    <div className={`text-xs font-mono mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                                        {po.vendorUrl}
                                    </div>
                                )}
                            </div>
                            {po.facilityId && (
                                <div>
                                    <div className={`text-xs uppercase tracking-wider mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                        Facility
                                    </div>
                                    <div className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                                        {po.facilityId}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className={`rounded-xl border backdrop-blur-lg p-4 ${
                            isDark
                                ? 'border-white/10 bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-slate-950/80 shadow-[0_12px_30px_rgba(2,6,23,0.45)]'
                                : 'border-stone-300/25 bg-gradient-to-br from-white/98 via-stone-100/50 to-white/92 shadow-[0_18px_40px_rgba(15,23,42,0.18)]'
                        }`}>
                            <div className={`text-xs uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                Financial Summary
                            </div>
                            <div className="space-y-1 text-sm">
                                <div className={`flex justify-between ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    <span>Subtotal:</span>
                                    <span className="font-mono">${po.subtotal?.toFixed(2) || '0.00'}</span>
                                </div>
                                {po.tax && po.tax > 0 && (
                                    <div className={`flex justify-between ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                        <span>Tax:</span>
                                        <span className="font-mono">${po.tax.toFixed(2)}</span>
                                    </div>
                                )}
                                {po.shipping && po.shipping > 0 && (
                                    <div className={`flex justify-between ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                        <span>Shipping:</span>
                                        <span className="font-mono">${po.shipping.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className={`flex justify-between font-semibold pt-2 border-t ${
                                    isDark
                                        ? 'text-amber-400 border-white/10'
                                        : 'text-amber-700 border-stone-300'
                                }`}>
                                    <span>Total:</span>
                                    <span className="font-mono">${po.total?.toFixed(2) || '0.00'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        {(isEditing || po.publicNotes) && (
                            <div>
                                <div className={`text-xs uppercase tracking-wider mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Public Notes
                                </div>
                                {isEditing ? (
                                    <textarea
                                        value={editState.publicNotes || ''}
                                        onChange={(e) => setEditState({ ...editState, publicNotes: e.target.value })}
                                        className={`w-full text-sm p-3 rounded-lg border resize-none ${
                                            isDark
                                                ? 'bg-slate-950/50 border-white/5 text-gray-300'
                                                : 'bg-white border-stone-300 text-gray-800'
                                        }`}
                                        rows={3}
                                    />
                                ) : (
                                    <div className={`text-sm p-3 rounded-lg border ${
                                        isDark
                                            ? 'bg-slate-950/50 border-white/5 text-gray-300'
                                            : 'bg-stone-50 border-stone-200 text-gray-700'
                                    }`}>
                                        {po.publicNotes}
                                    </div>
                                )}
                            </div>
                        )}
                        {(isEditing || po.privateNotes) && (
                            <div>
                                <div className={`text-xs uppercase tracking-wider mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Private Notes
                                </div>
                                {isEditing ? (
                                    <textarea
                                        value={editState.privateNotes || ''}
                                        onChange={(e) => setEditState({ ...editState, privateNotes: e.target.value })}
                                        className={`w-full text-sm p-3 rounded-lg border resize-none ${
                                            isDark
                                                ? 'bg-slate-950/50 border-white/5 text-gray-300'
                                                : 'bg-white border-stone-300 text-gray-800'
                                        }`}
                                        rows={3}
                                    />
                                ) : (
                                    <div className={`text-sm p-3 rounded-lg border ${
                                        isDark
                                            ? 'bg-slate-950/50 border-white/5 text-gray-300'
                                            : 'bg-stone-50 border-stone-200 text-gray-700'
                                    }`}>
                                        {po.privateNotes}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Line Items */}
                    {po.lineItems && po.lineItems.length > 0 && (
                        <div>
                            <div className={`text-xs uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                Line Items
                            </div>
                            <div className={`rounded-xl border backdrop-blur-lg overflow-hidden ${
                                isDark
                                    ? 'border-white/10 bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-slate-950/80 shadow-[0_12px_30px_rgba(2,6,23,0.45)]'
                                    : 'border-stone-300/25 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.12)]'
                            }`}>
                                <table className="min-w-full">
                                    <thead className={isDark ? 'bg-slate-900/50' : 'bg-stone-100'}>
                                        <tr>
                                            <th className={`px-3 py-2 text-left text-xs font-medium uppercase ${
                                                isDark ? 'text-gray-400' : 'text-gray-700'
                                            }`}>#</th>
                                            <th className={`px-3 py-2 text-left text-xs font-medium uppercase ${
                                                isDark ? 'text-gray-400' : 'text-gray-700'
                                            }`}>Product</th>
                                            <th className={`px-3 py-2 text-right text-xs font-medium uppercase ${
                                                isDark ? 'text-gray-400' : 'text-gray-700'
                                            }`}>Ordered</th>
                                            <th className={`px-3 py-2 text-right text-xs font-medium uppercase ${
                                                isDark ? 'text-gray-400' : 'text-gray-700'
                                            }`}>Received</th>
                                            <th className={`px-3 py-2 text-right text-xs font-medium uppercase ${
                                                isDark ? 'text-gray-400' : 'text-gray-700'
                                            }`}>Unit Price</th>
                                            <th className={`px-3 py-2 text-right text-xs font-medium uppercase ${
                                                isDark ? 'text-gray-400' : 'text-gray-700'
                                            }`}>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-stone-200'}`}>
                                        {(isEditing ? editState.lineItems : po.lineItems)?.map((item: any, idx: number) => (
                                            <tr key={idx} className={isDark ? 'hover:bg-slate-900/30' : 'hover:bg-stone-50'}>
                                                <td className={`px-3 py-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                    {item.line_number || idx + 1}
                                                </td>
                                                <td className={`px-3 py-2 text-sm font-mono ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>
                                                    {item.product_id || 'N/A'}
                                                </td>
                                                <td className="px-3 py-2 text-sm text-right font-mono">
                                                    {isEditing ? (
                                                        <input
                                                            type="number"
                                                            value={item.quantity_ordered || 0}
                                                            onChange={(e) => handleLineItemChange(idx, 'quantity_ordered', parseFloat(e.target.value))}
                                                            className={`w-20 px-2 py-1 rounded text-right ${
                                                                isDark
                                                                    ? 'bg-slate-800 border-white/10 text-gray-300'
                                                                    : 'bg-white border-stone-300 text-gray-800'
                                                            } border`}
                                                        />
                                                    ) : (
                                                        <span className={isDark ? 'text-gray-300' : 'text-gray-800'}>
                                                            {item.quantity_ordered || 0}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className={`px-3 py-2 text-sm text-right font-mono ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>
                                                    {item.quantity_received || 0}
                                                </td>
                                                <td className="px-3 py-2 text-sm text-right font-mono">
                                                    {isEditing ? (
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={item.unit_price?.toFixed(2) || '0.00'}
                                                            onChange={(e) => handleLineItemChange(idx, 'unit_price', parseFloat(e.target.value))}
                                                            className={`w-24 px-2 py-1 rounded text-right ${
                                                                isDark
                                                                    ? 'bg-slate-800 border-white/10 text-gray-300'
                                                                    : 'bg-white border-stone-300 text-gray-800'
                                                            } border`}
                                                        />
                                                    ) : (
                                                        <span className={isDark ? 'text-gray-300' : 'text-gray-800'}>
                                                            ${item.unit_price?.toFixed(2) || '0.00'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className={`px-3 py-2 text-sm text-right font-mono font-semibold ${
                                                    isDark ? 'text-amber-400' : 'text-amber-700'
                                                }`}>
                                                    ${item.line_total?.toFixed(2) || '0.00'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Metadata */}
                    <div className={`flex items-center justify-between pt-3 border-t text-xs ${
                        isDark
                            ? 'border-white/5 text-gray-500'
                            : 'border-stone-200 text-gray-600'
                    }`}>
                        <div>Finale: <span className={`font-mono ${isDark ? 'text-gray-400' : 'text-gray-700'}`}>{po.finaleOrderUrl}</span></div>
                        {po.sentAt && (
                            <div className="flex items-center gap-2">
                                <EnvelopeIcon className="w-4 h-4" />
                                <span>Sent: {formatTimestamp(po.sentAt)}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default EditablePOCard;
