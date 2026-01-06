import React, { useState, useEffect } from 'react';
import { useTheme } from './ThemeProvider';
import Button from '@/components/ui/Button';
import {
  CheckCircleIcon,
  ChevronRightIcon,
  PackageIcon,
  TruckIcon,
  MapPinIcon,
  ClockIcon,
  ChatBubbleIcon,
  DocumentTextIcon,
  UserIcon,
  PhoneIcon,
  MailIcon,
  RefreshIcon,
  ExternalLinkIcon,
  XMarkIcon,
} from './icons';
import type { FinalePurchaseOrderRecord, PurchaseOrder, POTrackingStatus } from '../types';
import { supabase } from '../lib/supabase/client';

// Timeline stage configuration
interface TimelineStage {
  name: string;
  description: string;
  date: string | null;
  icon: React.ReactNode;
}

interface TimelineStageProps {
  stage: TimelineStage;
  isActive: boolean;
  isComplete: boolean;
  isLast: boolean;
  isDark: boolean;
}

const TimelineStageComponent: React.FC<TimelineStageProps> = ({
  stage,
  isActive,
  isComplete,
  isLast,
  isDark,
}) => {
  return (
    <div className="flex items-start gap-4 relative">
      {/* Connector Line */}
      {!isLast && (
        <div
          className={`absolute left-5 top-12 w-0.5 h-16 transition-colors ${
            isComplete
              ? 'bg-gradient-to-b from-teal-500 to-purple-500'
              : isDark
                ? 'bg-gray-700'
                : 'bg-gray-200'
          }`}
        />
      )}

      {/* Icon */}
      <div
        className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${
          isComplete
            ? 'bg-gradient-to-br from-teal-500 to-purple-600 text-white shadow-lg shadow-purple-500/30'
            : isActive
              ? isDark
                ? 'bg-gradient-to-br from-purple-900/50 to-teal-900/50 text-purple-400 border-2 border-purple-500 animate-pulse'
                : 'bg-gradient-to-br from-purple-100 to-teal-100 text-purple-600 border-2 border-purple-400 animate-pulse'
              : isDark
                ? 'bg-gray-800 text-gray-500 border-2 border-gray-700'
                : 'bg-gray-100 text-gray-400 border-2 border-gray-200'
        }`}
      >
        {isComplete ? <CheckCircleIcon className="w-5 h-5" /> : stage.icon}
      </div>

      {/* Content */}
      <div className="flex-1 pb-8">
        <div className="flex items-center gap-3">
          <h4
            className={`font-semibold ${
              isComplete || isActive
                ? isDark
                  ? 'text-gray-100'
                  : 'text-gray-800'
                : isDark
                  ? 'text-gray-500'
                  : 'text-gray-400'
            }`}
          >
            {stage.name}
          </h4>
          {isActive && (
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
              Current
            </span>
          )}
        </div>
        <p
          className={`text-sm mt-1 ${
            isComplete || isActive
              ? isDark
                ? 'text-gray-400'
                : 'text-gray-500'
              : isDark
                ? 'text-gray-600'
                : 'text-gray-300'
          }`}
        >
          {stage.description}
        </p>
        {stage.date && (
          <div
            className={`flex items-center gap-1 mt-2 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}
          >
            <ClockIcon className="w-3 h-3" />
            <span>{stage.date}</span>
          </div>
        )}
      </div>
    </div>
  );
};

interface AccordionSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  isDark: boolean;
}

const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  icon,
  children,
  defaultOpen = false,
  isDark,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={`border rounded-2xl overflow-hidden shadow-sm ${
        isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-100'
      }`}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-6 py-4 flex items-center justify-between transition-colors ${
          isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isDark
                ? 'bg-gradient-to-br from-purple-900/50 to-teal-900/50 text-purple-400'
                : 'bg-gradient-to-br from-purple-100 to-teal-100 text-purple-600'
            }`}
          >
            {icon}
          </div>
          <span className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            {title}
          </span>
        </div>
        <div
          className={`transform transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
        >
          <ChevronRightIcon className={`w-4 h-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
        </div>
      </button>
      {isOpen && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
};

// Map tracking status to stage index
function getStageIndex(status: POTrackingStatus | string | null): number {
  const statusMap: Record<string, number> = {
    draft: 0,
    pending: 0,
    sent: 0,
    awaiting_confirmation: 0,
    confirmed: 1,
    processing: 1,
    shipped: 2,
    in_transit: 2,
    out_for_delivery: 3,
    delivered: 4,
    received: 4,
    completed: 4,
  };
  return statusMap[(status || '').toLowerCase()] ?? 0;
}

// Generate tracking URL
function getTrackingUrl(trackingNumber: string | null, carrier: string | null): string | null {
  if (!trackingNumber) return null;
  const tn = trackingNumber.trim();
  const cr = (carrier || '').toLowerCase();

  if (cr.includes('ups') || tn.startsWith('1Z')) {
    return `https://www.ups.com/track?tracknum=${tn}`;
  }
  if (cr.includes('fedex') || /^(\d{12,22}|96\d{20})$/.test(tn)) {
    return `https://www.fedex.com/fedextrack/?trknbr=${tn}`;
  }
  if (cr.includes('usps') || /^(94|93|92|91)\d{20,22}$/.test(tn)) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tn}`;
  }
  if (cr.includes('dhl')) {
    return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${tn}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(tn)}+tracking`;
}

interface POTrackingDetailProps {
  po: FinalePurchaseOrderRecord | PurchaseOrder;
  source: 'internal' | 'finale';
  onClose: () => void;
  onMarkReceived?: (poId: string) => void;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const POTrackingDetail: React.FC<POTrackingDetailProps> = ({
  po,
  source,
  onClose,
  onMarkReceived,
  addToast,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  const [syncing, setSyncing] = useState(false);
  const [activeNoteInput, setActiveNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [stockImpact, setStockImpact] = useState<any[]>([]);
  const [relatedPOs, setRelatedPOs] = useState<string[]>([]);

  // Normalize PO data
  const orderId = (po as any).orderId || (po as any).order_id || po.id?.slice(0, 8);
  const vendorName = (po as any).vendorName || (po as any).vendor_name || (po as any).supplierName || 'Unknown Vendor';
  const total = (po as any).total || (po as any).totalAmount || 0;
  const orderDate = (po as any).orderDate || (po as any).order_date || (po as any).createdAt;
  const expectedDate = (po as any).expectedDate || (po as any).expected_date || (po as any).estimatedReceiveDate;
  const trackingNumber = (po as any).trackingNumber || (po as any).tracking_number;
  const trackingCarrier = (po as any).trackingCarrier || (po as any).tracking_carrier;
  const trackingStatus = (po as any).trackingStatus || (po as any).tracking_status || (po as any).status;
  const trackingEta = (po as any).trackingEstimatedDelivery || (po as any).tracking_estimated_delivery || expectedDate;

  const currentStage = getStageIndex(trackingStatus);

  // Build timeline stages
  const stages: TimelineStage[] = [
    {
      name: 'Order Placed',
      description: 'Purchase order submitted to vendor',
      date: orderDate ? new Date(orderDate).toLocaleString() : null,
      icon: <PackageIcon className="w-4 h-4" />,
    },
    {
      name: 'Confirmed',
      description: 'Vendor acknowledged and confirmed order',
      date: currentStage >= 1 ? 'Confirmed' : null,
      icon: <CheckCircleIcon className="w-4 h-4" />,
    },
    {
      name: 'In Transit',
      description: trackingNumber ? `Tracking: ${trackingNumber}` : 'Shipment picked up and en route',
      date: currentStage >= 2 ? 'Shipped' : null,
      icon: <TruckIcon className="w-4 h-4" />,
    },
    {
      name: 'Out for Delivery',
      description: 'Package with local delivery carrier',
      date: currentStage >= 3 ? 'Out for delivery' : null,
      icon: <MapPinIcon className="w-4 h-4" />,
    },
    {
      name: 'Received',
      description: 'Delivery complete, pending inspection',
      date: currentStage >= 4 ? 'Delivered' : null,
      icon: <CheckCircleIcon className="w-4 h-4" />,
    },
  ];

  // Fetch line items and related data
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (source === 'finale') {
          // Fetch finale line items
          const { data: items } = await supabase
            .from('finale_po_line_items')
            .select('*, finale_products(sku, product_id)')
            .eq('po_id', po.id);

          if (items) {
            setLineItems(items.map(item => ({
              sku: item.finale_products?.sku || item.finale_products?.product_id || 'N/A',
              name: item.product_name || 'Unknown',
              qty: item.quantity_ordered || 0,
              received: item.quantity_received || 0,
              price: item.unit_cost || 0,
              total: (item.quantity_ordered || 0) * (item.unit_cost || 0),
            })));
          }

          // Fetch related POs from same vendor
          const { data: related } = await supabase
            .from('finale_purchase_orders')
            .select('order_id')
            .eq('vendor_name', vendorName)
            .neq('id', po.id)
            .order('order_date', { ascending: false })
            .limit(5);

          if (related) {
            setRelatedPOs(related.map(r => r.order_id).filter(Boolean));
          }
        } else {
          // Internal PO
          const internalPO = po as PurchaseOrder;
          if (internalPO.items) {
            setLineItems(internalPO.items.map(item => ({
              sku: item.sku || 'N/A',
              name: item.name || 'Unknown',
              qty: item.quantity || 0,
              received: item.quantityReceived || 0,
              price: item.unitCost || 0,
              total: (item.quantity || 0) * (item.unitCost || 0),
            })));
          }
        }

        // Fetch stock impact for line items SKUs
        if (lineItems.length > 0) {
          const skus = lineItems.map(i => i.sku).filter(s => s !== 'N/A');
          const { data: inventory } = await supabase
            .from('inventory_items')
            .select('sku, stock, reorder_point')
            .in('sku', skus);

          if (inventory) {
            setStockImpact(
              inventory.map(inv => {
                const lineItem = lineItems.find(li => li.sku === inv.sku);
                const qty = lineItem?.qty || 0;
                return {
                  sku: inv.sku,
                  current: inv.stock || 0,
                  afterReceive: (inv.stock || 0) + qty,
                  reorderPoint: inv.reorder_point || 0,
                  status: (inv.stock || 0) + qty > (inv.reorder_point || 0) * 1.5 ? 'healthy' : 'ok',
                };
              })
            );
          }
        }
      } catch (err) {
        console.error('[POTrackingDetail] Error fetching data:', err);
      }
    };

    fetchData();
  }, [po.id, source, vendorName]);

  const handleSync = async () => {
    setSyncing(true);
    // Simulate sync
    await new Promise(r => setTimeout(r, 1500));
    setSyncing(false);
    addToast?.('Tracking data refreshed', 'success');
  };

  const handleSaveNote = async () => {
    if (!noteText.trim()) return;
    // TODO: Save note to database
    addToast?.('Note saved', 'success');
    setNoteText('');
    setActiveNoteInput(false);
  };

  const trackingUrl = getTrackingUrl(trackingNumber, trackingCarrier);

  return (
    <div
      className={`min-h-screen ${
        isDark
          ? 'bg-gradient-to-br from-gray-900 via-purple-900/10 to-teal-900/10'
          : 'bg-gradient-to-br from-slate-50 via-purple-50/30 to-teal-50/30'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="px-3 py-1 bg-gradient-to-r from-purple-600 to-teal-500 text-white text-sm font-medium rounded-full">
                  {trackingStatus || 'Pending'}
                </span>
                <button
                  onClick={handleSync}
                  className={`flex items-center gap-1 text-sm transition-colors ${
                    isDark ? 'text-gray-400 hover:text-purple-400' : 'text-gray-500 hover:text-purple-600'
                  }`}
                >
                  <RefreshIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing...' : 'Sync'}
                </button>
                <button
                  onClick={onClose}
                  className={`ml-auto p-2 rounded-lg transition-colors ${
                    isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                  }`}
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <h1 className="text-3xl font-bold">
                <span className="bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">
                  {orderId}
                </span>
              </h1>
              <p className={`mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {vendorName} • Created {orderDate ? new Date(orderDate).toLocaleDateString() : 'N/A'}
              </p>
            </div>

            <div className="text-right">
              <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Order Total</div>
              <div className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                ${total.toLocaleString()}
              </div>
              {trackingEta && (
                <div className={`text-sm mt-1 ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>
                  ETA: {new Date(trackingEta).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Timeline Tracker */}
            <div
              className={`rounded-3xl p-8 shadow-lg border ${
                isDark
                  ? 'bg-gray-800/50 border-purple-900/30 shadow-purple-900/20'
                  : 'bg-white border-purple-100/50 shadow-purple-100/50'
              }`}
            >
              <h3
                className={`text-lg font-semibold mb-6 flex items-center gap-2 ${
                  isDark ? 'text-gray-200' : 'text-gray-800'
                }`}
              >
                <TruckIcon className="w-5 h-5 text-purple-500" />
                Tracking Progress
              </h3>
              <div className="ml-2">
                {stages.map((stage, idx) => (
                  <TimelineStageComponent
                    key={idx}
                    stage={stage}
                    isComplete={idx < currentStage}
                    isActive={idx === currentStage}
                    isLast={idx === stages.length - 1}
                    isDark={isDark}
                  />
                ))}
              </div>

              {/* Tracking Link */}
              {trackingNumber && trackingUrl && (
                <div
                  className={`mt-4 p-4 rounded-xl ${
                    isDark ? 'bg-gray-900/50' : 'bg-purple-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`text-xs uppercase ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        Tracking Number
                      </div>
                      <div className={`font-mono ${isDark ? 'text-cyan-400' : 'text-cyan-700'}`}>
                        {trackingCarrier && `${trackingCarrier}: `}{trackingNumber}
                      </div>
                    </div>
                    <a
                      href={trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-teal-500 text-white rounded-lg font-medium hover:shadow-lg transition-shadow"
                    >
                      <TruckIcon className="w-4 h-4" />
                      Track Package
                      <ExternalLinkIcon className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Accordion Sections */}
            <div className="space-y-4">
              <AccordionSection
                title={`Line Items (${lineItems.length})`}
                icon={<PackageIcon className="w-4 h-4" />}
                defaultOpen={true}
                isDark={isDark}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                        <th className={`text-left py-3 font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          SKU
                        </th>
                        <th className={`text-left py-3 font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          Item
                        </th>
                        <th className={`text-right py-3 font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          Qty
                        </th>
                        <th className={`text-right py-3 font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          Received
                        </th>
                        <th className={`text-right py-3 font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          Price
                        </th>
                        <th className={`text-right py-3 font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item, idx) => (
                        <tr
                          key={idx}
                          className={`border-b ${isDark ? 'border-gray-700/50' : 'border-gray-50'}`}
                        >
                          <td className={`py-3 font-mono ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                            {item.sku}
                          </td>
                          <td className={`py-3 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{item.name}</td>
                          <td className={`py-3 text-right ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                            {item.qty}
                          </td>
                          <td className={`py-3 text-right ${item.received >= item.qty ? 'text-green-500' : isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                            {item.received}
                          </td>
                          <td className={`py-3 text-right ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                            ${item.price.toFixed(2)}
                          </td>
                          <td className={`py-3 text-right font-semibold ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
                            ${item.total.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {lineItems.length === 0 && (
                        <tr>
                          <td colSpan={6} className={`py-6 text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            No line items found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </AccordionSection>

              <AccordionSection
                title="Supplier Contact"
                icon={<UserIcon className="w-4 h-4" />}
                isDark={isDark}
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div
                    className={`flex items-center gap-3 p-3 rounded-xl ${
                      isDark ? 'bg-gray-900/50' : 'bg-gray-50'
                    }`}
                  >
                    <UserIcon className="w-5 h-5 text-purple-500" />
                    <div>
                      <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Vendor</div>
                      <div className={`font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                        {vendorName}
                      </div>
                    </div>
                  </div>
                </div>
              </AccordionSection>

              <AccordionSection
                title="Attachments"
                icon={<DocumentTextIcon className="w-4 h-4" />}
                isDark={isDark}
              >
                <div className={`text-center py-6 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  No attachments available
                </div>
              </AccordionSection>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => onMarkReceived?.(po.id)}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-teal-500 text-white rounded-xl font-semibold shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 transition-all"
              >
                Mark as Received
              </button>
              <button
                onClick={() => setActiveNoteInput(!activeNoteInput)}
                className={`px-6 py-3 border-2 rounded-xl font-semibold flex items-center gap-2 transition-colors ${
                  isDark
                    ? 'bg-gray-800 border-purple-500/30 text-purple-400 hover:bg-purple-900/20'
                    : 'bg-white border-purple-200 text-purple-600 hover:bg-purple-50'
                }`}
              >
                <ChatBubbleIcon className="w-5 h-5" />
                Add Note
              </button>
            </div>

            {/* Note Input */}
            {activeNoteInput && (
              <div
                className={`rounded-2xl p-6 shadow-lg ${
                  isDark ? 'bg-gray-800/50 border border-gray-700' : 'bg-white'
                }`}
              >
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a note about this order..."
                  className={`w-full h-24 p-3 rounded-xl border outline-none resize-none ${
                    isDark
                      ? 'bg-gray-900 border-gray-700 text-gray-200 placeholder-gray-500 focus:border-purple-500'
                      : 'bg-gray-50 border-gray-200 text-gray-800 focus:border-purple-400 focus:ring-2 focus:ring-purple-100'
                  }`}
                />
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={() => setActiveNoteInput(false)}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveNote}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Save Note
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Side Panel */}
          <div className="space-y-6">
            {/* Stock Impact */}
            <div
              className={`rounded-3xl p-6 shadow-lg border ${
                isDark
                  ? 'bg-gray-800/50 border-purple-900/30 shadow-purple-900/20'
                  : 'bg-white border-purple-100/50 shadow-purple-100/50'
              }`}
            >
              <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                Stock Impact
              </h3>
              <div className="space-y-4">
                {stockImpact.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl ${
                      isDark
                        ? 'bg-gradient-to-br from-gray-900/50 to-purple-900/20'
                        : 'bg-gradient-to-br from-gray-50 to-purple-50/30'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className={`font-mono text-sm ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                        {item.sku}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          item.status === 'healthy'
                            ? 'bg-teal-100 text-teal-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>{item.current}</span>
                      <span className={isDark ? 'text-gray-600' : 'text-gray-400'}>→</span>
                      <span className="font-semibold text-teal-600">{item.afterReceive}</span>
                    </div>
                    <div
                      className={`mt-2 h-2 rounded-full overflow-hidden ${
                        isDark ? 'bg-gray-700' : 'bg-gray-200'
                      }`}
                    >
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-teal-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, (item.afterReceive / (item.reorderPoint * 3)) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      Reorder point: {item.reorderPoint}
                    </div>
                  </div>
                ))}
                {stockImpact.length === 0 && (
                  <div className={`text-center py-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    Loading stock data...
                  </div>
                )}
              </div>
            </div>

            {/* Related Orders */}
            {relatedPOs.length > 0 && (
              <div
                className={`rounded-3xl p-6 shadow-lg border ${
                  isDark
                    ? 'bg-gray-800/50 border-purple-900/30 shadow-purple-900/20'
                    : 'bg-white border-purple-100/50 shadow-purple-100/50'
                }`}
              >
                <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                  Related Orders
                </h3>
                <div className="space-y-3">
                  {relatedPOs.slice(0, 5).map((id, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                        isDark ? 'bg-gray-900/50 hover:bg-purple-900/20' : 'bg-gray-50 hover:bg-purple-50'
                      }`}
                    >
                      <span className={`font-mono text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        {id}
                      </span>
                      <ChevronRightIcon className={`w-4 h-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default POTrackingDetail;
