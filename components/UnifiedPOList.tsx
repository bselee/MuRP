import React, { useMemo, useState } from 'react';
import { useTheme } from './ThemeProvider';
import StatusBadge, { formatStatusText } from '@/components/ui/StatusBadge';
import Button from '@/components/ui/Button';
import type { PurchaseOrder, FinalePurchaseOrderRecord, POTrackingStatus } from '../types';
import { TruckIcon, MailIcon, ChevronDownIcon, ExternalLinkIcon, CalendarIcon } from './icons';

interface UnifiedPO {
  id: string;
  orderId: string;
  vendorName: string;
  status: string;
  orderDate: string | null;
  expectedDate: string | null;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  trackingStatus: POTrackingStatus | null;
  trackingUrl: string | null;
  trackingEta: string | null;
  total: number;
  lineCount: number;
  lastEmailUpdate: string | null;
  emailSummary: string | null;
  source: 'internal' | 'finale';
  rawData: PurchaseOrder | FinalePurchaseOrderRecord;
}

interface UnifiedPOListProps {
  internalPOs: PurchaseOrder[];
  finalePOs: FinalePurchaseOrderRecord[];
  onViewDetails?: (po: UnifiedPO) => void;
  onUpdateTracking?: (poId: string, source: 'internal' | 'finale') => void;
  onSendEmail?: (po: UnifiedPO) => void;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// Status priority for sorting (higher = more important)
const STATUS_PRIORITY: Record<string, number> = {
  exception: 10,
  delayed: 9,
  out_for_delivery: 8,
  in_transit: 7,
  shipped: 6,
  pending: 5,
  sent: 5,
  confirmed: 4,
  partial: 4,
  partially_received: 4,
  draft: 3,
  received: 2,
  completed: 1,
  cancelled: 0,
};

// Light mode colors
const STATUS_ROW_COLORS_LIGHT: Record<string, string> = {
  exception: 'bg-red-50 hover:bg-red-100',
  delayed: 'bg-orange-50 hover:bg-orange-100',
  out_for_delivery: 'bg-amber-50 hover:bg-amber-100',
  in_transit: 'bg-purple-50 hover:bg-purple-100',
  shipped: 'bg-cyan-50 hover:bg-cyan-100',
  partial: 'bg-yellow-50 hover:bg-yellow-100',
  partially_received: 'bg-yellow-50 hover:bg-yellow-100',
  received: 'bg-green-50 hover:bg-green-100',
  completed: 'bg-green-50 hover:bg-green-100',
  delivered: 'bg-green-50 hover:bg-green-100',
};

// Dark mode colors
const STATUS_ROW_COLORS_DARK: Record<string, string> = {
  exception: 'bg-red-900/20 hover:bg-red-900/30',
  delayed: 'bg-orange-900/20 hover:bg-orange-900/30',
  out_for_delivery: 'bg-amber-900/20 hover:bg-amber-900/30',
  in_transit: 'bg-purple-900/20 hover:bg-purple-900/30',
  shipped: 'bg-cyan-900/20 hover:bg-cyan-900/30',
  partial: 'bg-yellow-900/20 hover:bg-yellow-900/30',
  partially_received: 'bg-yellow-900/20 hover:bg-yellow-900/30',
  received: 'bg-green-900/20 hover:bg-green-900/30',
  completed: 'bg-green-900/20 hover:bg-green-900/30',
  delivered: 'bg-green-900/20 hover:bg-green-900/30',
};

// Generate tracking URL based on carrier
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
  // Default: Google search
  return `https://www.google.com/search?q=${encodeURIComponent(tn)}+tracking`;
}

// Format relative date
function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`;
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
  return date.toLocaleDateString();
}

const UnifiedPOList: React.FC<UnifiedPOListProps> = ({
  internalPOs,
  finalePOs,
  onViewDetails,
  onUpdateTracking,
  onSendEmail,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  const [sortField, setSortField] = useState<'date' | 'status' | 'vendor' | 'eta'>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const STATUS_ROW_COLORS = isDark ? STATUS_ROW_COLORS_DARK : STATUS_ROW_COLORS_LIGHT;

  // Combine and normalize all POs
  const unifiedPOs = useMemo<UnifiedPO[]>(() => {
    const combined: UnifiedPO[] = [];

    // Add internal POs
    for (const po of internalPOs) {
      combined.push({
        id: po.id,
        orderId: po.orderId || po.id.slice(0, 8),
        vendorName: po.supplierName || 'Unknown',
        status: po.trackingStatus || po.status || 'draft',
        orderDate: po.orderDate || null,
        expectedDate: po.expectedDate || null,
        trackingNumber: po.trackingNumber || null,
        trackingCarrier: po.trackingCarrier || null,
        trackingStatus: po.trackingStatus || null,
        trackingUrl: getTrackingUrl(po.trackingNumber || null, po.trackingCarrier || null),
        trackingEta: po.trackingEstimatedDelivery || null,
        total: po.totalAmount || 0,
        lineCount: po.items?.length || 0,
        lastEmailUpdate: null, // TODO: Connect to email threads
        emailSummary: null,
        source: 'internal',
        rawData: po,
      });
    }

    // Add Finale POs (filter out dropship)
    for (const fpo of finalePOs) {
      if ((fpo.orderId || '').toLowerCase().includes('dropshippo')) continue;

      combined.push({
        id: fpo.id,
        orderId: fpo.orderId || fpo.id.slice(0, 8),
        vendorName: fpo.vendorName || 'Unknown',
        status: fpo.trackingStatus || fpo.status || 'pending',
        orderDate: fpo.orderDate || null,
        expectedDate: fpo.expectedDate || null,
        trackingNumber: fpo.trackingNumber || null,
        trackingCarrier: fpo.trackingCarrier || null,
        trackingStatus: fpo.trackingStatus || null,
        trackingUrl: getTrackingUrl(fpo.trackingNumber || null, fpo.trackingCarrier || null),
        trackingEta: fpo.trackingEstimatedDelivery || fpo.expectedDate || null,
        total: fpo.total || 0,
        lineCount: fpo.lineCount || 0,
        lastEmailUpdate: null, // TODO: Connect to email threads
        emailSummary: null,
        source: 'finale',
        rawData: fpo,
      });
    }

    // Sort
    combined.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'status':
          cmp = (STATUS_PRIORITY[a.status.toLowerCase()] || 5) - (STATUS_PRIORITY[b.status.toLowerCase()] || 5);
          break;
        case 'date':
          cmp = new Date(a.orderDate || 0).getTime() - new Date(b.orderDate || 0).getTime();
          break;
        case 'vendor':
          cmp = a.vendorName.localeCompare(b.vendorName);
          break;
        case 'eta':
          const aEta = a.trackingEta || a.expectedDate;
          const bEta = b.trackingEta || b.expectedDate;
          cmp = new Date(aEta || '9999').getTime() - new Date(bEta || '9999').getTime();
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return combined;
  }, [internalPOs, finalePOs, sortField, sortDir]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ field, label }: { field: typeof sortField; label: string }) => (
    <th
      className={`px-4 py-3 text-left font-semibold cursor-pointer hover:bg-opacity-80 select-none ${
        isDark ? 'text-gray-400' : 'text-gray-600'
      }`}
      onClick={() => toggleSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortField === field && (
          <span className="text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  );

  if (unifiedPOs.length === 0) {
    return (
      <div className={`rounded-xl border p-8 text-center ${
        isDark ? 'bg-gray-800/50 border-gray-700 text-gray-400' : 'bg-white border-gray-200 text-gray-500'
      }`}>
        <TruckIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="text-lg font-medium">No Purchase Orders</p>
        <p className="text-sm">Create a new PO or sync from Finale to get started.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl shadow-sm border overflow-hidden ${
      isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200'
    }`}>
      {/* Summary Stats */}
      <div className={`px-4 py-3 border-b flex items-center justify-between ${
        isDark ? 'bg-gray-900/50 border-gray-700' : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center gap-4">
          <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {unifiedPOs.length} Purchase Orders
          </span>
          <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {unifiedPOs.filter(p => p.trackingNumber).length} with tracking
          </span>
          <span className={`text-sm ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
            {unifiedPOs.filter(p => ['in_transit', 'out_for_delivery', 'shipped'].includes(p.status.toLowerCase())).length} in transit
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className={`min-w-full text-sm ${isDark ? 'divide-y divide-gray-700' : 'divide-y divide-gray-200'}`}>
          <thead className={isDark ? 'bg-gray-900/50' : 'bg-gray-50'}>
            <tr className="text-xs uppercase">
              <SortHeader field="date" label="PO #" />
              <SortHeader field="vendor" label="Vendor" />
              <SortHeader field="status" label="Status" />
              <th className={`px-4 py-3 text-left font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Tracking</th>
              <SortHeader field="eta" label="ETA" />
              <th className={`px-4 py-3 text-left font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Last Update</th>
              <th className={`px-4 py-3 text-left font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Actions</th>
            </tr>
          </thead>
          <tbody className={isDark ? 'divide-y divide-gray-800' : 'divide-y divide-gray-100'}>
            {unifiedPOs.map((po) => {
              const isExpanded = expandedId === po.id;
              const statusKey = po.status.toLowerCase();
              const rowColorClass = STATUS_ROW_COLORS[statusKey] || (isDark ? 'hover:bg-gray-900/40' : 'hover:bg-gray-50');

              return (
                <React.Fragment key={`${po.source}-${po.id}`}>
                  <tr
                    className={`transition-colors cursor-pointer ${rowColorClass} ${
                      isDark ? 'text-gray-200' : 'text-gray-800'
                    }`}
                    onClick={() => setExpandedId(isExpanded ? null : po.id)}
                  >
                    {/* PO # */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className={`font-semibold font-mono ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                          {po.orderId}
                        </span>
                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          {po.orderDate ? new Date(po.orderDate).toLocaleDateString() : '—'}
                        </span>
                      </div>
                    </td>

                    {/* Vendor */}
                    <td className={`px-4 py-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      {po.vendorName}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={po.status} size="sm">
                        {formatStatusText(po.status)}
                      </StatusBadge>
                    </td>

                    {/* Tracking */}
                    <td className="px-4 py-3">
                      {po.trackingNumber ? (
                        <div className="flex flex-col">
                          <a
                            href={po.trackingUrl || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={`font-mono text-sm flex items-center gap-1 ${
                              isDark ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-700 hover:text-cyan-600'
                            }`}
                          >
                            {po.trackingNumber.slice(0, 16)}
                            {po.trackingNumber.length > 16 && '...'}
                            <ExternalLinkIcon className="w-3 h-3" />
                          </a>
                          <span className={`text-xs uppercase ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            {po.trackingCarrier || 'Unknown'}
                          </span>
                        </div>
                      ) : (
                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          No tracking
                        </span>
                      )}
                    </td>

                    {/* ETA */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className={`font-medium ${
                          isDark ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          {formatRelativeDate(po.trackingEta || po.expectedDate)}
                        </span>
                        {(po.trackingEta || po.expectedDate) && (
                          <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            {new Date(po.trackingEta || po.expectedDate || '').toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Last Update */}
                    <td className="px-4 py-3">
                      {po.lastEmailUpdate ? (
                        <div className="flex items-center gap-1">
                          <MailIcon className={`w-3 h-3 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                          <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {formatRelativeDate(po.lastEmailUpdate)}
                          </span>
                        </div>
                      ) : (
                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewDetails?.(po);
                          }}
                          className={`text-xs px-2 py-1 rounded ${
                            isDark
                              ? 'text-blue-300 border border-blue-500/40 hover:bg-blue-500/10'
                              : 'text-blue-700 border border-blue-300 hover:bg-blue-50'
                          }`}
                        >
                          Details
                        </Button>
                        <ChevronDownIcon
                          className={`w-4 h-4 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          } ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
                        />
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Details Row */}
                  {isExpanded && (
                    <tr className={isDark ? 'bg-gray-900/30' : 'bg-gray-50'}>
                      <td colSpan={7} className="px-4 py-4">
                        <div className="grid grid-cols-3 gap-6">
                          {/* Order Details */}
                          <div>
                            <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${
                              isDark ? 'text-gray-500' : 'text-gray-500'
                            }`}>Order Details</h4>
                            <div className={`space-y-1 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                              <p><span className="opacity-60">Source:</span> {po.source === 'finale' ? 'Finale API' : 'Internal'}</p>
                              <p><span className="opacity-60">Lines:</span> {po.lineCount}</p>
                              <p><span className="opacity-60">Total:</span> ${po.total.toFixed(2)}</p>
                              <p><span className="opacity-60">Order Date:</span> {po.orderDate ? new Date(po.orderDate).toLocaleDateString() : '—'}</p>
                              <p><span className="opacity-60">Expected:</span> {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : '—'}</p>
                            </div>
                          </div>

                          {/* Tracking Details */}
                          <div>
                            <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${
                              isDark ? 'text-gray-500' : 'text-gray-500'
                            }`}>Tracking</h4>
                            <div className={`space-y-1 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                              {po.trackingNumber ? (
                                <>
                                  <p><span className="opacity-60">Number:</span> {po.trackingNumber}</p>
                                  <p><span className="opacity-60">Carrier:</span> {po.trackingCarrier || 'Unknown'}</p>
                                  <p><span className="opacity-60">Status:</span> {formatStatusText(po.trackingStatus || 'unknown')}</p>
                                  {po.trackingEta && (
                                    <p><span className="opacity-60">ETA:</span> {new Date(po.trackingEta).toLocaleDateString()}</p>
                                  )}
                                  {po.trackingUrl && (
                                    <a
                                      href={po.trackingUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`inline-flex items-center gap-1 text-sm mt-2 ${
                                        isDark ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-700 hover:text-cyan-600'
                                      }`}
                                    >
                                      <TruckIcon className="w-4 h-4" />
                                      Track Package
                                      <ExternalLinkIcon className="w-3 h-3" />
                                    </a>
                                  )}
                                </>
                              ) : (
                                <p className="opacity-60">No tracking information available</p>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div>
                            <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${
                              isDark ? 'text-gray-500' : 'text-gray-500'
                            }`}>Quick Actions</h4>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateTracking?.(po.id, po.source);
                                }}
                                className={`text-xs px-3 py-1.5 rounded ${
                                  isDark
                                    ? 'text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/10'
                                    : 'text-cyan-700 border border-cyan-300 hover:bg-cyan-50'
                                }`}
                              >
                                <TruckIcon className="w-3 h-3 mr-1 inline" />
                                Update Tracking
                              </Button>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSendEmail?.(po);
                                }}
                                className={`text-xs px-3 py-1.5 rounded ${
                                  isDark
                                    ? 'text-green-300 border border-green-500/40 hover:bg-green-500/10'
                                    : 'text-green-700 border border-green-300 hover:bg-green-50'
                                }`}
                              >
                                <MailIcon className="w-3 h-3 mr-1 inline" />
                                Send Email
                              </Button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UnifiedPOList;
