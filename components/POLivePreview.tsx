/**
 * PO Live Preview Component
 *
 * Shows a real-time preview of what the PO will look like when printed/sent.
 * Uses the professional template design with DM Sans font and clean styling.
 */

import React, { useMemo, useState, useCallback } from 'react';
import type { Vendor } from '../types';
import { EyeIcon, PrinterIcon, ChevronDownIcon, ChevronUpIcon } from './icons';

interface POPreviewItem {
  sku: string;
  name: string;
  quantity: number;
  unitCost: number;
  unit?: string;
}

interface POPreviewData {
  poNumber?: string;
  vendorId?: string;
  vendorName?: string;
  vendorAddress?: string;
  vendorContact?: string;
  vendorEmail?: string;
  vendorPhone?: string;
  orderDate?: string;
  expectedDate?: string;
  paymentTerms?: string;
  shipVia?: string;
  fob?: string;
  notes?: string;
  items: POPreviewItem[];
  shipTo?: string;
  companyName?: string;
  companyAddress?: string;
  companyEmail?: string;
  companyPhone?: string;
}

interface POLivePreviewProps {
  data: POPreviewData;
  vendor?: Vendor;
  isCollapsible?: boolean;
  defaultExpanded?: boolean;
  onPrint?: () => void;
  className?: string;
}

const formatCurrency = (amount: number): string => {
  return `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

const formatDate = (dateStr: string | undefined): string => {
  if (!dateStr) return 'TBD';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return dateStr;
  }
};

const POLivePreview: React.FC<POLivePreviewProps> = ({
  data,
  vendor,
  isCollapsible = false,
  defaultExpanded = true,
  onPrint,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Calculate totals
  const { subtotal, total, itemCount } = useMemo(() => {
    const sub = data.items.reduce((sum, item) => sum + (item.unitCost * item.quantity), 0);
    return {
      subtotal: sub,
      total: sub, // Can add tax/freight here
      itemCount: data.items.length,
    };
  }, [data.items]);

  // Derive vendor info from prop or data
  const vendorInfo = useMemo(() => ({
    name: vendor?.name || data.vendorName || 'Select Vendor',
    address: vendor?.address || data.vendorAddress || '',
    city: vendor?.city || '',
    state: vendor?.state || '',
    zip: vendor?.zip || '',
    contact: vendor?.contactName || data.vendorContact || '',
    email: vendor?.email || vendor?.contactEmails?.[0] || data.vendorEmail || '',
    phone: vendor?.phone || data.vendorPhone || '',
  }), [vendor, data]);

  const fullVendorAddress = useMemo(() => {
    const parts = [vendorInfo.address, vendorInfo.city, vendorInfo.state, vendorInfo.zip].filter(Boolean);
    return parts.join(', ') || 'Address not specified';
  }, [vendorInfo]);

  const handlePrint = useCallback(() => {
    if (onPrint) {
      onPrint();
      return;
    }
    // Default print behavior - open print view
    window.print();
  }, [onPrint]);

  const companyName = data.companyName || 'MuRP';
  const companyLogo = companyName.charAt(0).toUpperCase();
  const poNumber = data.poNumber || 'DRAFT';
  const orderDate = formatDate(data.orderDate || new Date().toISOString().split('T')[0]);
  const expectedDate = formatDate(data.expectedDate);

  if (isCollapsible && !isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className={`w-full flex items-center justify-between p-4 bg-gray-800/50 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors ${className}`}
      >
        <div className="flex items-center gap-3">
          <EyeIcon className="w-5 h-5 text-gray-400" />
          <span className="font-medium text-gray-200">Preview Purchase Order</span>
          <span className="text-sm text-gray-400">
            ({itemCount} items • {formatCurrency(total)})
          </span>
        </div>
        <ChevronDownIcon className="w-5 h-5 text-gray-400" />
      </button>
    );
  }

  return (
    <div className={`bg-gray-900 rounded-xl border border-gray-700 overflow-hidden ${className}`}>
      {/* Preview Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800/50 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <EyeIcon className="w-5 h-5 text-accent-400" />
          <span className="font-semibold text-gray-100">Live Preview</span>
          <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
            {itemCount} items • {formatCurrency(total)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
          >
            <PrinterIcon className="w-4 h-4" />
            Print
          </button>
          {isCollapsible && (
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-md transition-colors"
            >
              <ChevronUpIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Preview Document */}
      <div className="p-6 bg-white overflow-auto max-h-[600px]" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        {/* PO Header */}
        <div className="flex justify-between items-start pb-5 border-b-2 border-gray-900 mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
              style={{ background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)' }}
            >
              {companyLogo}
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">{companyName}</div>
              <div className="text-[9px] text-gray-500 uppercase tracking-wider">Multi-use Resource Planning</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900 tracking-tight">Purchase Order</div>
            <div
              className="inline-block mt-1 px-3 py-1 rounded text-sm font-mono font-medium text-gray-600"
              style={{ background: '#f1f5f9' }}
            >
              {poNumber}
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          {/* Vendor */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-[8px] font-semibold uppercase tracking-wider text-gray-400 pb-2 mb-2 border-b border-gray-200">
              Vendor
            </div>
            <div className="text-[11px] font-semibold text-gray-900 mb-1">{vendorInfo.name}</div>
            <div className="text-[9px] text-gray-600 leading-relaxed">
              {fullVendorAddress}
            </div>
            {(vendorInfo.contact || vendorInfo.email || vendorInfo.phone) && (
              <div className="mt-2 pt-2 border-t border-dashed border-gray-200 text-[9px] text-gray-500">
                {vendorInfo.contact && <div>{vendorInfo.contact}</div>}
                {vendorInfo.email && <div>{vendorInfo.email}</div>}
                {vendorInfo.phone && <div>{vendorInfo.phone}</div>}
              </div>
            )}
          </div>

          {/* Ship To */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-[8px] font-semibold uppercase tracking-wider text-gray-400 pb-2 mb-2 border-b border-gray-200">
              Ship To
            </div>
            <div className="text-[11px] font-semibold text-gray-900 mb-1">{companyName} Warehouse</div>
            <div className="text-[9px] text-gray-600 leading-relaxed">
              {data.shipTo || data.companyAddress || 'Shipping address not specified'}
            </div>
          </div>

          {/* Bill To */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-[8px] font-semibold uppercase tracking-wider text-gray-400 pb-2 mb-2 border-b border-gray-200">
              Bill To
            </div>
            <div className="text-[11px] font-semibold text-gray-900 mb-1">{companyName}</div>
            <div className="text-[9px] text-gray-600 leading-relaxed">
              {data.companyAddress || 'Billing address not specified'}
            </div>
          </div>
        </div>

        {/* Meta Row */}
        <div className="flex gap-8 mb-5 px-4 py-3 bg-gray-50 rounded-md">
          <div className="flex flex-col">
            <span className="text-[8px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Order Date</span>
            <span className="text-[10px] font-medium text-gray-900">{orderDate}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[8px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Expected Delivery</span>
            <span className="text-[10px] font-medium text-gray-900">{expectedDate}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[8px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Payment Terms</span>
            <span className="text-[10px] font-medium text-gray-900">{data.paymentTerms || 'Net 30'}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[8px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Ship Via</span>
            <span className="text-[10px] font-medium text-gray-900">{data.shipVia || 'Best Way'}</span>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full border-collapse mb-5">
          <thead>
            <tr className="bg-gray-900 text-white">
              <th className="text-[8px] font-semibold uppercase tracking-wider text-left px-3 py-2.5 rounded-tl-md" style={{ width: '15%' }}>SKU</th>
              <th className="text-[8px] font-semibold uppercase tracking-wider text-left px-3 py-2.5" style={{ width: '40%' }}>Description</th>
              <th className="text-[8px] font-semibold uppercase tracking-wider text-center px-3 py-2.5" style={{ width: '10%' }}>Qty</th>
              <th className="text-[8px] font-semibold uppercase tracking-wider text-center px-3 py-2.5" style={{ width: '10%' }}>Unit</th>
              <th className="text-[8px] font-semibold uppercase tracking-wider text-right px-3 py-2.5" style={{ width: '12%' }}>Unit Price</th>
              <th className="text-[8px] font-semibold uppercase tracking-wider text-right px-3 py-2.5 rounded-tr-md" style={{ width: '13%' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400 text-sm italic border-b border-gray-200">
                  No items added yet
                </td>
              </tr>
            ) : (
              data.items.map((item, index) => {
                const lineTotal = item.unitCost * item.quantity;
                const isEven = index % 2 === 0;
                return (
                  <tr
                    key={item.sku}
                    className={`${isEven ? '' : 'bg-gray-50'} ${index === data.items.length - 1 ? 'border-b-2 border-gray-900' : 'border-b border-gray-200'}`}
                  >
                    <td className="px-3 py-2.5 text-[9px] font-mono font-medium text-gray-600">{item.sku}</td>
                    <td className="px-3 py-2.5 text-[9px] font-medium text-gray-900">{item.name}</td>
                    <td className="px-3 py-2.5 text-[9px] text-center text-gray-600">{item.quantity}</td>
                    <td className="px-3 py-2.5 text-[8px] text-center text-gray-400 uppercase">{item.unit || 'ea'}</td>
                    <td className="px-3 py-2.5 text-[9px] font-mono text-right text-gray-600">{formatCurrency(item.unitCost)}</td>
                    <td className="px-3 py-2.5 text-[9px] font-mono font-semibold text-right text-gray-900">{formatCurrency(lineTotal)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Totals Section */}
        <div className="flex justify-between gap-10">
          {/* Notes */}
          {data.notes && (
            <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="text-[8px] font-semibold uppercase tracking-wider text-amber-700 mb-2">Special Instructions</div>
              <p className="text-[9px] text-amber-800 leading-relaxed">{data.notes}</p>
            </div>
          )}

          {/* Totals Box */}
          <div className="w-64 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex justify-between px-4 py-2.5 border-b border-gray-200">
              <span className="text-[10px] text-gray-500">Subtotal</span>
              <span className="text-[10px] font-mono font-medium text-gray-900">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5 border-b border-gray-200">
              <span className="text-[10px] text-gray-500">Freight</span>
              <span className="text-[10px] font-mono font-medium text-gray-900">$0.00</span>
            </div>
            <div className="flex justify-between px-4 py-2.5 border-b border-gray-200">
              <span className="text-[10px] text-gray-500">Tax</span>
              <span className="text-[10px] font-mono font-medium text-gray-900">$0.00</span>
            </div>
            <div className="flex justify-between px-4 py-3.5 bg-gray-900">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Total Due</span>
              <span className="text-base font-mono font-semibold text-white">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-5 border-t border-gray-200 text-center">
          <p className="text-[8px] text-gray-400">
            <span className="font-semibold text-gray-500">{companyName}</span> • {data.companyAddress || 'Company Address'} • {data.companyEmail || 'email@company.com'}
          </p>
          <p className="text-[8px] text-gray-400 mt-1">
            This Purchase Order constitutes a binding agreement upon acknowledgment by vendor.
          </p>
        </div>
      </div>
    </div>
  );
};

export default POLivePreview;
