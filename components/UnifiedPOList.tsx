import React, { useMemo, useState } from 'react';
import { useTheme } from './ThemeProvider';
import Button from '@/components/ui/Button';
import type { PurchaseOrder, FinalePurchaseOrderRecord, POTrackingStatus } from '../types';
import { TruckIcon, MailIcon, ChevronDownIcon, ExternalLinkIcon, CheckCircleIcon, ClockIcon, AlertTriangleIcon, PackageIcon, RefreshIcon } from './icons';

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
  trackingSource: string | null;
  total: number;
  lineCount: number;
  // Email intelligence fields
  hasEmailThread: boolean;
  emailThreadId: string | null;
  emailMessageCount: number;
  emailLastVendorReply: string | null;
  emailLastSentAt: string | null;
  emailSentiment: 'positive' | 'neutral' | 'negative' | null;
  emailAwaitingResponse: boolean;
  emailHasTrackingInfo: boolean;
  // Vendor response fields
  vendorResponseStatus: string | null;
  vendorLastResponseType: string | null;
  needsFollowup: boolean;
  followupDueAt: string | null;
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

// Progress stages
const PROGRESS_STAGES = ['Ordered', 'Confirmed', 'Shipped', 'Transit', 'Delivered'];

// Map status to progress index
function getProgressIndex(status: string | null): number {
  if (!status) return 0;
  const s = status.toLowerCase();
  if (s === 'delivered' || s === 'received' || s === 'completed') return 4;
  if (s === 'out_for_delivery') return 3;
  if (s === 'in_transit' || s === 'shipped') return 3;
  if (s === 'label_created' || s === 'picked_up') return 2;
  if (s === 'confirmed' || s === 'sent' || s === 'submitted' || s === 'committed') return 1;
  return 0;
}

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
  return `https://www.google.com/search?q=${encodeURIComponent(tn)}+tracking`;
}

// Format relative date
function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 0 && diffDays <= 7) return `${diffDays}d`;
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Format time ago
function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Status Badge Component
const StatusBadge: React.FC<{ status: string; isDark: boolean }> = ({ status, isDark }) => {
  const s = status.toLowerCase();

  const getStyle = () => {
    if (s === 'delivered' || s === 'received' || s === 'completed') {
      return isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700';
    }
    if (s === 'committed' || s === 'confirmed') {
      return isDark ? 'bg-emerald-600 text-white' : 'bg-emerald-500 text-white';
    }
    if (s === 'in_transit' || s === 'shipped') {
      return isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700';
    }
    if (s === 'processing' || s === 'partial' || s === 'partially_received') {
      return isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700';
    }
    if (s === 'exception' || s === 'delayed') {
      return isDark ? 'bg-red-900/40 text-red-300' : 'bg-red-100 text-red-700';
    }
    if (s === 'cancelled') {
      return isDark ? 'bg-red-700 text-white' : 'bg-red-500 text-white';
    }
    if (s === 'draft') {
      return isDark ? 'bg-stone-600 text-white' : 'bg-stone-400 text-white';
    }
    return isDark ? 'bg-stone-700 text-stone-300' : 'bg-stone-100 text-stone-600';
  };

  const formatStatus = (st: string) => {
    return st.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <span className={`px-2.5 py-1 rounded text-xs font-medium ${getStyle()}`}>
      {formatStatus(status)}
    </span>
  );
};

// Progress Dots Component
const ProgressDots: React.FC<{
  currentStage: number;
  isDark: boolean;
  hasException: boolean;
}> = ({ currentStage, isDark, hasException }) => {
  return (
    <div className="flex items-center gap-1">
      {PROGRESS_STAGES.map((_, idx) => {
        const isComplete = idx < currentStage;
        const isCurrent = idx === currentStage;
        const isException = hasException && isCurrent;

        return (
          <React.Fragment key={idx}>
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                isException
                  ? 'bg-red-500 text-white'
                  : isComplete
                    ? 'bg-emerald-500 text-white'
                    : isCurrent
                      ? isDark ? 'bg-amber-500 text-white' : 'bg-amber-500 text-white'
                      : isDark ? 'bg-gray-700 text-gray-400' : 'bg-stone-200 text-stone-400'
              }`}
            >
              {isComplete ? <CheckCircleIcon className="w-3 h-3" /> : null}
            </div>
            {idx < PROGRESS_STAGES.length - 1 && (
              <div
                className={`w-3 h-0.5 ${
                  idx < currentStage
                    ? 'bg-emerald-500'
                    : isDark ? 'bg-gray-700' : 'bg-stone-200'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// Email Intel Component
const EmailIntel: React.FC<{
  po: UnifiedPO;
  isDark: boolean;
}> = ({ po, isDark }) => {
  if (!po.hasEmailThread && !po.emailLastSentAt && po.emailMessageCount === 0) {
    return (
      <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-stone-400'}`}>—</span>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <MailIcon className={`w-3.5 h-3.5 ${isDark ? 'text-gray-400' : 'text-stone-400'}`} />
        <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-stone-600'}`}>
          {po.emailMessageCount || 0}
        </span>
      </div>
      {po.emailLastVendorReply && (
        <div className={`flex items-center gap-1 text-xs ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
          <CheckCircleIcon className="w-2.5 h-2.5" />
          <span>Replied {formatTimeAgo(po.emailLastVendorReply)}</span>
        </div>
      )}
      {po.emailAwaitingResponse && !po.emailLastVendorReply && (
        <div className={`flex items-center gap-1 text-xs ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
          <ClockIcon className="w-2.5 h-2.5" />
          <span>Awaiting reply</span>
        </div>
      )}
    </div>
  );
};

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
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'needs_attention'>('active');

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
        trackingSource: null,
        total: po.totalAmount || 0,
        lineCount: po.items?.length || 0,
        hasEmailThread: false,
        emailThreadId: null,
        emailMessageCount: 0,
        emailLastVendorReply: null,
        emailLastSentAt: null,
        emailSentiment: null,
        emailAwaitingResponse: false,
        emailHasTrackingInfo: false,
        vendorResponseStatus: null,
        vendorLastResponseType: null,
        needsFollowup: false,
        followupDueAt: null,
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
        trackingSource: fpo.trackingSource || null,
        total: fpo.total || 0,
        lineCount: fpo.lineCount || 0,
        hasEmailThread: fpo.hasEmailThread || false,
        emailThreadId: fpo.emailThreadId || null,
        emailMessageCount: fpo.emailMessageCount || 0,
        emailLastVendorReply: fpo.emailLastVendorReply || null,
        emailLastSentAt: fpo.emailLastSentAt || null,
        emailSentiment: fpo.emailSentiment || null,
        emailAwaitingResponse: fpo.emailAwaitingResponse || false,
        emailHasTrackingInfo: fpo.emailHasTrackingInfo || false,
        vendorResponseStatus: fpo.vendorResponseStatus || null,
        vendorLastResponseType: fpo.vendorLastResponseType || null,
        needsFollowup: fpo.needsFollowup || false,
        followupDueAt: fpo.vendorFollowupDueAt || null,
        source: 'finale',
        rawData: fpo,
      });
    }

    // Filter
    let filtered = combined;
    if (filterStatus === 'active') {
      filtered = combined.filter(po =>
        !['received', 'completed', 'delivered', 'cancelled'].includes(po.status.toLowerCase())
      );
    } else if (filterStatus === 'needs_attention') {
      filtered = combined.filter(po =>
        po.emailAwaitingResponse ||
        po.needsFollowup ||
        po.status.toLowerCase() === 'exception' ||
        po.status.toLowerCase() === 'delayed'
      );
    }

    // Sort
    filtered.sort((a, b) => {
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

    return filtered;
  }, [internalPOs, finalePOs, sortField, sortDir, filterStatus]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Summary stats
  const stats = useMemo(() => {
    const all = [...internalPOs, ...finalePOs.filter(fpo => !(fpo.orderId || '').toLowerCase().includes('dropshippo'))];
    return {
      total: all.length,
      atRisk: all.filter(p => {
        const status = (('trackingStatus' in p && p.trackingStatus) || ('status' in p && p.status) || '').toLowerCase();
        return status === 'exception' || status === 'delayed';
      }).length,
      outForDelivery: all.filter(p => {
        const status = (('trackingStatus' in p && p.trackingStatus) || ('status' in p && p.status) || '').toLowerCase();
        return status === 'out_for_delivery';
      }).length,
      deliveredToday: all.filter(p => {
        const status = (('trackingStatus' in p && p.trackingStatus) || ('status' in p && p.status) || '').toLowerCase();
        if (status !== 'delivered' && status !== 'received') return false;
        const deliveryDate = ('trackingDeliveredDate' in p && p.trackingDeliveredDate) || ('receivedDate' in p && p.receivedDate);
        if (!deliveryDate) return false;
        const d = new Date(deliveryDate);
        const now = new Date();
        return d.toDateString() === now.toDateString();
      }).length,
      needsFollowup: all.filter(p => {
        const hasEmail = 'emailAwaitingResponse' in p && p.emailAwaitingResponse;
        const needsFollow = 'needsFollowup' in p && p.needsFollowup;
        return hasEmail || needsFollow;
      }).length,
    };
  }, [internalPOs, finalePOs]);

  const SortHeader = ({ field, label }: { field: typeof sortField; label: string }) => (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer hover:bg-opacity-80 select-none ${
        isDark ? 'text-gray-400' : 'text-stone-500'
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
        isDark ? 'bg-gray-800/50 border-gray-700 text-gray-400' : 'bg-white border-stone-200 text-stone-500'
      }`}>
        <TruckIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="text-lg font-medium">No Purchase Orders</p>
        <p className="text-sm">
          {filterStatus === 'needs_attention'
            ? 'No POs need attention right now.'
            : filterStatus === 'active'
              ? 'No active POs. Try showing all POs.'
              : 'Create a new PO or sync from Finale to get started.'}
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border overflow-hidden ${
      isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-stone-200'
    }`}>
      {/* Status Cards */}
      <div className={`grid grid-cols-4 gap-4 p-5 border-b ${isDark ? 'border-gray-700' : 'border-stone-100'}`}>
        <div className={`p-4 rounded-xl ${isDark ? 'bg-red-900/20 border border-red-800/30' : 'bg-red-50 border border-red-100'}`}>
          <div className={`text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-stone-500'}`}>At Risk</div>
          <div className={`text-2xl font-bold ${isDark ? 'text-red-400' : 'text-red-500'}`}>{stats.atRisk}</div>
        </div>
        <div className={`p-4 rounded-xl ${isDark ? 'bg-amber-900/20 border border-amber-800/30' : 'bg-amber-50 border border-amber-100'}`}>
          <div className={`text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-stone-500'}`}>Out for Delivery</div>
          <div className={`text-2xl font-bold ${isDark ? 'text-amber-400' : 'text-amber-500'}`}>{stats.outForDelivery}</div>
        </div>
        <div className={`p-4 rounded-xl ${isDark ? 'bg-emerald-900/20 border border-emerald-800/30' : 'bg-emerald-50 border border-emerald-100'}`}>
          <div className={`text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-stone-500'}`}>Delivered Today</div>
          <div className={`text-2xl font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-500'}`}>{stats.deliveredToday}</div>
        </div>
        <div className={`p-4 rounded-xl ${isDark ? 'bg-yellow-900/20 border border-yellow-800/30' : 'bg-yellow-50 border border-yellow-100'}`}>
          <div className={`flex items-center gap-1 text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-stone-500'}`}>
            <AlertTriangleIcon className={`w-3 h-3 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
            Needs Follow-up
          </div>
          <div className={`text-2xl font-bold ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>{stats.needsFollowup}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className={`px-5 py-3 border-b flex items-center justify-between ${
        isDark ? 'bg-gray-900/30 border-gray-700' : 'bg-stone-50/50 border-stone-100'
      }`}>
        <div className="flex items-center gap-3">
          <span className={`font-semibold ${isDark ? 'text-white' : 'text-stone-800'}`}>
            {unifiedPOs.length} of {stats.total} POs
          </span>
        </div>

        <div className={`flex rounded-lg overflow-hidden border ${isDark ? 'border-gray-600 bg-gray-800' : 'border-stone-200 bg-white'}`}>
          {[
            { key: 'all', label: 'All' },
            { key: 'active', label: 'Active' },
            { key: 'needs_attention', label: 'Attention' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key as typeof filterStatus)}
              className={`px-4 py-1.5 text-sm font-medium transition-all ${
                filterStatus === tab.key
                  ? isDark
                    ? 'bg-gray-700 text-white'
                    : 'bg-stone-800 text-white'
                  : isDark
                    ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50'
                    : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className={isDark ? 'bg-gray-900/50' : 'bg-stone-50/50'}>
            <tr className={`border-b ${isDark ? 'border-gray-700' : 'border-stone-200'}`}>
              <SortHeader field="date" label="PO" />
              <SortHeader field="vendor" label="Vendor" />
              <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-stone-500'}`}>Tracking</th>
              <SortHeader field="status" label="Status" />
              <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-stone-500'}`}>Progress</th>
              <SortHeader field="eta" label="ETA" />
              <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-stone-500'}`}>Email Intel</th>
              <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-stone-500'}`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {unifiedPOs.map((po) => {
              const isExpanded = expandedId === po.id;
              const statusKey = po.status.toLowerCase();
              const hasException = statusKey === 'exception' || statusKey === 'delayed';
              const progressIndex = getProgressIndex(po.trackingStatus || po.status);

              return (
                <React.Fragment key={`${po.source}-${po.id}`}>
                  <tr
                    className={`border-b transition-colors cursor-pointer group ${
                      isDark
                        ? 'border-gray-800 hover:bg-gray-900/40 text-gray-200'
                        : 'border-stone-100 hover:bg-stone-50/50 text-stone-800'
                    }`}
                    onClick={() => setExpandedId(isExpanded ? null : po.id)}
                  >
                    {/* PO # */}
                    <td className="px-4 py-4">
                      <a
                        href="#"
                        onClick={(e) => { e.stopPropagation(); onViewDetails?.(po); }}
                        className={`font-semibold hover:underline ${isDark ? 'text-amber-400' : 'text-amber-700'}`}
                      >
                        {po.orderId}
                      </a>
                      <div className={`flex items-center gap-1 mt-0.5 ${isDark ? 'text-gray-500' : 'text-stone-300'}`}>
                        <PackageIcon className="w-3 h-3" />
                        <span className="text-xs">{po.source === 'finale' ? 'Finale' : 'Internal'}</span>
                      </div>
                    </td>

                    {/* Vendor */}
                    <td className={`px-4 py-4 text-sm ${isDark ? 'text-gray-300' : 'text-stone-700'}`}>
                      <div className="max-w-[180px] truncate" title={po.vendorName}>
                        {po.vendorName}
                      </div>
                    </td>

                    {/* Tracking */}
                    <td className="px-4 py-4 text-sm">
                      {po.trackingNumber ? (
                        <a
                          href={po.trackingUrl || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className={`font-mono text-xs inline-flex items-center gap-1 ${
                            isDark ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-700 hover:text-cyan-600'
                          }`}
                        >
                          {po.trackingNumber.slice(0, 10)}...
                          <ExternalLinkIcon className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className={`${isDark ? 'text-gray-500' : 'text-stone-400'}`}>
                          {statusKey === 'unknown' ? (
                            <span className={`${isDark ? 'text-amber-400' : 'text-amber-600'}`}>UNKNOWN</span>
                          ) : '—'}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-4">
                      <StatusBadge status={po.status} isDark={isDark} />
                    </td>

                    {/* Progress */}
                    <td className="px-4 py-4">
                      <ProgressDots
                        currentStage={progressIndex}
                        isDark={isDark}
                        hasException={hasException}
                      />
                    </td>

                    {/* ETA */}
                    <td className={`px-4 py-4 text-sm ${isDark ? 'text-gray-300' : 'text-stone-500'}`}>
                      {formatRelativeDate(po.trackingEta || po.expectedDate)}
                    </td>

                    {/* Email Intel */}
                    <td className="px-4 py-4">
                      <EmailIntel po={po} isDark={isDark} />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); onViewDetails?.(po); }}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                          isDark
                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                            : 'bg-stone-100 hover:bg-stone-200 text-stone-600'
                        }`}
                      >
                        Timeline
                      </button>
                    </td>
                  </tr>

                  {/* Expanded Row */}
                  {isExpanded && (
                    <tr className={isDark ? 'bg-gray-900/20' : 'bg-stone-50/80'}>
                      <td colSpan={8} className="px-4 py-5">
                        <div className="grid grid-cols-4 gap-6">
                          {/* Progress Timeline */}
                          <div className="col-span-2">
                            <h4 className={`text-xs font-semibold uppercase tracking-wide mb-4 ${
                              isDark ? 'text-gray-500' : 'text-stone-500'
                            }`}>Delivery Progress</h4>
                            <div className="flex items-center gap-2">
                              {PROGRESS_STAGES.map((stage, idx) => {
                                const isComplete = idx < progressIndex;
                                const isCurrent = idx === progressIndex;
                                const isException = hasException && isCurrent;

                                return (
                                  <React.Fragment key={idx}>
                                    <div className="flex flex-col items-center">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                        isException
                                          ? 'bg-red-500 text-white'
                                          : isComplete
                                            ? 'bg-emerald-500 text-white'
                                            : isCurrent
                                              ? 'bg-amber-500 text-white'
                                              : isDark ? 'bg-gray-700 text-gray-400' : 'bg-stone-200 text-stone-400'
                                      }`}>
                                        {isComplete ? <CheckCircleIcon className="w-4 h-4" /> : idx + 1}
                                      </div>
                                      <span className={`text-[10px] mt-1 ${
                                        isComplete || isCurrent
                                          ? isDark ? 'text-gray-300' : 'text-stone-600'
                                          : isDark ? 'text-gray-500' : 'text-stone-400'
                                      }`}>
                                        {stage}
                                      </span>
                                    </div>
                                    {idx < PROGRESS_STAGES.length - 1 && (
                                      <div className={`flex-1 h-1 rounded ${
                                        idx < progressIndex
                                          ? 'bg-emerald-500'
                                          : isDark ? 'bg-gray-700' : 'bg-stone-200'
                                      }`} />
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          </div>

                          {/* Order Details */}
                          <div>
                            <h4 className={`text-xs font-semibold uppercase tracking-wide mb-3 ${
                              isDark ? 'text-gray-500' : 'text-stone-500'
                            }`}>Order Details</h4>
                            <div className={`space-y-2 text-sm ${isDark ? 'text-gray-300' : 'text-stone-700'}`}>
                              <p><span className="opacity-60">Lines:</span> {po.lineCount}</p>
                              <p><span className="opacity-60">Total:</span> ${po.total.toFixed(2)}</p>
                              <p><span className="opacity-60">Order Date:</span> {po.orderDate ? new Date(po.orderDate).toLocaleDateString() : '—'}</p>
                              <p><span className="opacity-60">Expected:</span> {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : '—'}</p>
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div>
                            <h4 className={`text-xs font-semibold uppercase tracking-wide mb-3 ${
                              isDark ? 'text-gray-500' : 'text-stone-500'
                            }`}>Quick Actions</h4>
                            <div className="flex flex-col gap-2">
                              {po.trackingUrl && (
                                <a
                                  href={po.trackingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                                    isDark
                                      ? 'bg-cyan-900/30 text-cyan-300 hover:bg-cyan-900/50'
                                      : 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
                                  }`}
                                >
                                  <TruckIcon className="w-4 h-4" />
                                  Track Package
                                </a>
                              )}
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateTracking?.(po.id, po.source);
                                }}
                                className={`text-sm px-3 py-2 rounded-lg ${
                                  isDark
                                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                                }`}
                              >
                                <RefreshIcon className="w-3.5 h-3.5 mr-1.5 inline" />
                                Refresh
                              </Button>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSendEmail?.(po);
                                }}
                                className={`text-sm px-3 py-2 rounded-lg ${
                                  isDark
                                    ? 'bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/50'
                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                }`}
                              >
                                <MailIcon className="w-3.5 h-3.5 mr-1.5 inline" />
                                Email
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
