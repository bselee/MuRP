/**
 * Public PO View Page
 *
 * A vendor-facing view of a Purchase Order accessed via a shareable link.
 * Professional print-ready design matching the PO template.
 * Does not require authentication - access controlled via share tokens.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { generatePoPdf } from '../services/pdfService';
import type { PurchaseOrder } from '../types';

interface POData {
  type: 'internal' | 'finale';
  po_id: string;
  order_id: string;
  vendor_name: string;
  order_date: string;
  expected_date: string;
  status: string;
  items: Array<{
    product_id?: string;
    sku?: string;
    name?: string;
    quantity_ordered?: number;
    quantity?: number;
    unit_price?: number;
    unitCost?: number;
    line_total?: number;
  }>;
  subtotal?: number;
  tax?: number;
  shipping?: number;
  total?: number;
  notes?: string;
  tracking_number?: string;
  tracking_status?: string;
  custom_message?: string;
  show_pricing: boolean;
  // Extended fields for print template
  ship_to?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    attention?: string;
  };
  bill_to?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  payment_terms?: string;
  ship_via?: string;
}

const PublicPOView: React.FC = () => {
  // Extract token from URL path (e.g., /po/abc123 -> abc123)
  const token = useMemo(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/po\/([^/]+)/);
    return match ? match[1] : null;
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [poData, setPoData] = useState<POData | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const fetchPOData = async () => {
      if (!token) {
        setError('Invalid share link');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/po-public-view/${token}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const result = await response.json();

        if (!result.success) {
          setError(result.error || 'Failed to load purchase order');
          setLoading(false);
          return;
        }

        setPoData(result.data);
        setSessionId(result.sessionId);
      } catch (err) {
        console.error('[PublicPOView] Fetch error:', err);
        setError('Unable to connect. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchPOData();
  }, [token]);

  const handleDownloadPdf = async () => {
    if (!poData) return;

    const poForPdf: PurchaseOrder = {
      id: poData.po_id,
      orderId: poData.order_id,
      vendorId: '',
      status: poData.status?.toLowerCase() || 'pending',
      orderDate: poData.order_date,
      expectedDate: poData.expected_date,
      items: poData.items?.map((item) => ({
        sku: item.product_id || item.sku || '',
        name: item.name || item.product_id || '',
        quantity: item.quantity_ordered || item.quantity || 0,
        unitCost: item.unit_price || item.unitCost || 0,
      })) || [],
      total: poData.total || 0,
      notes: poData.notes || '',
    };

    const vendor = {
      id: '',
      name: poData.vendor_name || 'Vendor',
      email: '',
      phone: '',
      address: '',
    };

    generatePoPdf(poForPdf, vendor as any);

    // Log PDF download
    if (token && sessionId) {
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/po-public-view/${token}/pdf-download`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Id': sessionId,
          },
        });
      } catch (err) {
        console.error('[PublicPOView] Failed to log PDF download:', err);
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading purchase order...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Unable to Load</h1>
          <p className="text-slate-600 mb-6">{error}</p>
          <p className="text-sm text-slate-400">
            If you believe this is an error, please contact the sender.
          </p>
        </div>
      </div>
    );
  }

  if (!poData) {
    return null;
  }

  // Calculate line totals
  const lineItems = poData.items?.map((item) => {
    const qty = item.quantity_ordered || item.quantity || 0;
    const price = item.unit_price || item.unitCost || 0;
    const lineTotal = item.line_total || (qty * price);
    return { ...item, qty, price, lineTotal };
  }) || [];

  const calculatedSubtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const subtotal = poData.subtotal || calculatedSubtotal;

  return (
    <>
      {/* Print Styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

        @page {
          size: letter;
          margin: 0.5in;
        }

        @media print {
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          .print-page {
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      {/* Action Bar (hidden in print) */}
      <div className="no-print fixed top-0 left-0 right-0 bg-slate-900 text-white py-3 px-4 z-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <span className="text-slate-900 font-bold text-sm">M</span>
          </div>
          <span className="font-semibold">Purchase Order</span>
          <span className="font-mono text-slate-400">{poData.order_id}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
          <button
            onClick={handleDownloadPdf}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download PDF
          </button>
        </div>
      </div>

      {/* Print-Ready PO Document */}
      <div className="min-h-screen bg-slate-100 pt-16 pb-8 px-4 no-print:pt-20">
        <div className="print-page max-w-[8.5in] mx-auto bg-white shadow-xl" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10pt', lineHeight: 1.5, color: '#1e293b' }}>
          <div className="p-8">
            {/* Header */}
            <header className="flex justify-between items-start pb-6 border-b-2 border-slate-900 mb-6">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                  style={{ background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)' }}
                >
                  M
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900" style={{ letterSpacing: '-0.5px' }}>MuRP</div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-widest">Multi-use Resource Planning</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-slate-900" style={{ letterSpacing: '-1px' }}>Purchase Order</div>
                <div
                  className="inline-block mt-1 px-3 py-1 bg-slate-100 rounded text-slate-600 font-mono text-sm font-medium"
                >
                  {poData.order_id}
                </div>
              </div>
            </header>

            {/* Info Grid */}
            <div className="grid grid-cols-3 gap-5 mb-6">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="text-[8px] font-semibold uppercase tracking-widest text-slate-400 mb-2 pb-2 border-b border-slate-200">Vendor</div>
                <h4 className="text-[11px] font-semibold text-slate-900 mb-1">{poData.vendor_name}</h4>
                <p className="text-[9px] text-slate-600 leading-relaxed">
                  {poData.ship_to?.address || 'Address on file'}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="text-[8px] font-semibold uppercase tracking-widest text-slate-400 mb-2 pb-2 border-b border-slate-200">Ship To</div>
                <h4 className="text-[11px] font-semibold text-slate-900 mb-1">
                  {poData.ship_to?.name || 'Warehouse'}
                </h4>
                <p className="text-[9px] text-slate-600 leading-relaxed">
                  {poData.ship_to?.address || '742 Commerce Way'}<br />
                  {poData.ship_to?.city || 'Montrose'}, {poData.ship_to?.state || 'CO'} {poData.ship_to?.zip || '81401'}
                </p>
                {poData.ship_to?.attention && (
                  <div className="mt-2 pt-2 border-t border-dashed border-slate-200 text-[9px] text-slate-500">
                    Attn: {poData.ship_to.attention}
                  </div>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="text-[8px] font-semibold uppercase tracking-widest text-slate-400 mb-2 pb-2 border-b border-slate-200">Bill To</div>
                <h4 className="text-[11px] font-semibold text-slate-900 mb-1">
                  {poData.bill_to?.name || 'BuildASoil LLC'}
                </h4>
                <p className="text-[9px] text-slate-600 leading-relaxed">
                  {poData.bill_to?.address || '742 Commerce Way'}<br />
                  {poData.bill_to?.city || 'Montrose'}, {poData.bill_to?.state || 'CO'} {poData.bill_to?.zip || '81401'}
                </p>
              </div>
            </div>

            {/* Meta Row */}
            <div className="flex gap-8 mb-6 px-4 py-3 bg-slate-50 rounded-lg">
              <div>
                <div className="text-[8px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Order Date</div>
                <div className="text-[10px] font-medium text-slate-800">{formatDate(poData.order_date)}</div>
              </div>
              <div>
                <div className="text-[8px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Expected Delivery</div>
                <div className="text-[10px] font-medium text-slate-800">{formatDate(poData.expected_date)}</div>
              </div>
              <div>
                <div className="text-[8px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Payment Terms</div>
                <div className="text-[10px] font-medium text-slate-800">{poData.payment_terms || 'Net 30'}</div>
              </div>
              <div>
                <div className="text-[8px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Ship Via</div>
                <div className="text-[10px] font-medium text-slate-800">{poData.ship_via || 'Best Way'}</div>
              </div>
              {poData.tracking_number && (
                <div>
                  <div className="text-[8px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Tracking</div>
                  <div className="text-[10px] font-medium font-mono text-blue-600">{poData.tracking_number}</div>
                </div>
              )}
            </div>

            {/* Items Table */}
            <table className="w-full mb-6" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="text-left py-2.5 px-3 text-[8px] font-semibold uppercase tracking-wide rounded-tl-md" style={{ width: '12%' }}>SKU</th>
                  <th className="text-left py-2.5 px-3 text-[8px] font-semibold uppercase tracking-wide" style={{ width: '40%' }}>Description</th>
                  <th className="text-center py-2.5 px-3 text-[8px] font-semibold uppercase tracking-wide" style={{ width: '10%' }}>Qty</th>
                  {poData.show_pricing && (
                    <>
                      <th className="text-right py-2.5 px-3 text-[8px] font-semibold uppercase tracking-wide" style={{ width: '14%' }}>Unit Price</th>
                      <th className="text-right py-2.5 px-3 text-[8px] font-semibold uppercase tracking-wide rounded-tr-md" style={{ width: '14%' }}>Amount</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, idx) => (
                  <tr
                    key={idx}
                    className={idx % 2 === 1 ? 'bg-slate-50' : ''}
                    style={{ borderBottom: idx === lineItems.length - 1 ? '2px solid #0f172a' : '1px solid #e2e8f0' }}
                  >
                    <td className="py-3 px-3 font-mono text-[9px] font-medium text-slate-600">
                      {item.product_id || item.sku}
                    </td>
                    <td className="py-3 px-3 text-[9px] font-medium text-slate-800">
                      {item.name || item.product_id || 'Item'}
                    </td>
                    <td className="py-3 px-3 text-center text-[9px] text-slate-600">
                      {item.qty}
                    </td>
                    {poData.show_pricing && (
                      <>
                        <td className="py-3 px-3 text-right font-mono text-[9px] text-slate-600">
                          {formatCurrency(item.price)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-[9px] font-semibold text-slate-900">
                          {formatCurrency(item.lineTotal)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals Section */}
            <div className="flex justify-between gap-10 mb-6">
              {/* Special Instructions */}
              {poData.notes && (
                <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h4 className="text-[8px] font-semibold uppercase tracking-wide text-amber-700 mb-2">Special Instructions</h4>
                  <p className="text-[9px] text-amber-800 leading-relaxed whitespace-pre-wrap">{poData.notes}</p>
                </div>
              )}

              {/* Totals Box */}
              {poData.show_pricing && (
                <div className="w-64 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                  <div className="flex justify-between px-4 py-2.5 border-b border-slate-200 text-[10px]">
                    <span className="text-slate-500">Subtotal</span>
                    <span className="font-mono font-medium text-slate-800">{formatCurrency(subtotal)}</span>
                  </div>
                  {(poData.shipping !== undefined && poData.shipping !== null) && (
                    <div className="flex justify-between px-4 py-2.5 border-b border-slate-200 text-[10px]">
                      <span className="text-slate-500">Freight</span>
                      <span className="font-mono font-medium text-slate-800">{formatCurrency(poData.shipping)}</span>
                    </div>
                  )}
                  {(poData.tax !== undefined && poData.tax !== null) && (
                    <div className="flex justify-between px-4 py-2.5 border-b border-slate-200 text-[10px]">
                      <span className="text-slate-500">Tax</span>
                      <span className="font-mono font-medium text-slate-800">{formatCurrency(poData.tax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between px-4 py-3.5 bg-slate-900 text-white">
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Total Due</span>
                    <span className="font-mono text-base font-semibold">{formatCurrency(poData.total)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Terms Section */}
            <div className="grid grid-cols-2 gap-5 pt-6 border-t border-slate-200 mb-8">
              <div>
                <h4 className="text-[8px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Terms & Conditions</h4>
                <p className="text-[8px] text-slate-500 leading-relaxed">
                  1. Prices are firm for 30 days from PO date. 2. All goods remain property of buyer upon shipment.
                  3. Vendor agrees to replace defective merchandise at no additional cost. 4. Invoices must reference
                  PO number. 5. Shortages must be reported within 48 hours of receipt.
                </p>
              </div>
              <div>
                <h4 className="text-[8px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Quality Requirements</h4>
                <p className="text-[8px] text-slate-500 leading-relaxed">
                  All products must meet specifications as outlined in our Vendor Quality Agreement.
                  Certificate of Analysis (COA) required for organic materials. Non-conforming materials
                  subject to return at vendor's expense.
                </p>
              </div>
            </div>

            {/* Signature Section */}
            <div className="grid grid-cols-2 gap-16 pt-6 border-t border-slate-200">
              <div className="pt-10">
                <div className="border-b border-slate-900 mb-1.5"></div>
                <div className="flex justify-between text-[8px] text-slate-400">
                  <span>Authorized Signature (Buyer)</span>
                  <span>Date</span>
                </div>
              </div>
              <div className="pt-10">
                <div className="border-b border-slate-900 mb-1.5"></div>
                <div className="flex justify-between text-[8px] text-slate-400">
                  <span>Authorized Signature (Vendor)</span>
                  <span>Date</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <footer className="mt-6 pt-6 border-t border-slate-200 text-center text-[8px] text-slate-400">
              <p>
                <strong className="text-slate-500">BuildASoil LLC</strong> · 742 Commerce Way, Montrose, CO 81401 ·
                (970) 555-0100 · purchasing@buildasoil.com
              </p>
              <p className="mt-1">
                This Purchase Order constitutes a binding agreement upon acknowledgment by vendor.
              </p>
            </footer>
          </div>
        </div>
      </div>

      {/* Custom Message Banner (if any) */}
      {poData.custom_message && (
        <div className="no-print fixed bottom-0 left-0 right-0 bg-amber-50 border-t border-amber-200 py-3 px-4">
          <div className="max-w-[8.5in] mx-auto flex items-start gap-3">
            <div className="w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center flex-shrink-0 text-amber-900 text-xs font-bold">!</div>
            <p className="text-sm text-amber-800">{poData.custom_message}</p>
          </div>
        </div>
      )}
    </>
  );
};

export default PublicPOView;
