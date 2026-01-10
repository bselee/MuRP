/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PO TIMELINE COMPONENT - Visual PO Lifecycle Tracker
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Displays the complete purchase order lifecycle as a visual timeline:
 * Created → Sent → Acknowledged → Shipped → In Transit → Delivered → Received → Invoiced → Paid
 *
 * Features:
 * - Visual progress indicator with stage icons
 * - Expandable details at each stage
 * - Email thread integration (inline vendor communications)
 * - Real-time carrier tracking status
 * - Three-way match status at receive stage
 *
 * @module components/purchasing/POTimeline
 */

import React, { useState, useEffect } from 'react';
import { useTheme } from '../ThemeProvider';
import { supabase } from '../../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Types
// ═══════════════════════════════════════════════════════════════════════════

export interface TimelineStage {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: 'completed' | 'current' | 'upcoming' | 'error';
  timestamp?: string;
  description?: string;
  details?: Record<string, string | number | null>;
  expandable?: boolean;
}

export interface POTimelineData {
  poId: string;
  poNumber: string;
  vendorName: string;
  createdAt: string;
  sentAt?: string;
  acknowledgedAt?: string;
  shippedAt?: string;
  inTransitAt?: string;
  deliveredAt?: string;
  receivedAt?: string;
  invoicedAt?: string;
  paidAt?: string;
  currentStatus: string;
  trackingNumbers?: string[];
  carrier?: string;
  estimatedDelivery?: string;
  matchStatus?: 'matched' | 'partial_match' | 'mismatch' | 'pending';
  matchScore?: number;
  emailThreadId?: string;
  hasException?: boolean;
  exceptionMessage?: string;
}

interface POTimelineProps {
  poId: string;
  poNumber: string;
  data?: POTimelineData;
  onRefresh?: () => void;
  onViewEmail?: (threadId: string) => void;
  onViewMatch?: () => void;
  compact?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Icons
// ═══════════════════════════════════════════════════════════════════════════

const CreateIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
  </svg>
);

const SendIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const TruckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
  </svg>
);

const TransitIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
  </svg>
);

const DeliveredIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const ReceiveIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const InvoiceIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const PaidIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ExceptionIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════
// 🧩 Timeline Stage Component
// ═══════════════════════════════════════════════════════════════════════════

const TimelineStageNode: React.FC<{
  stage: TimelineStage;
  isLast: boolean;
  isDark: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ stage, isLast, isDark, isExpanded, onToggle }) => {
  const getStatusStyles = () => {
    switch (stage.status) {
      case 'completed':
        return {
          node: isDark
            ? 'bg-emerald-600 text-white ring-2 ring-emerald-500/30'
            : 'bg-emerald-500 text-white ring-2 ring-emerald-300',
          line: isDark ? 'bg-emerald-600' : 'bg-emerald-400',
          label: isDark ? 'text-emerald-400' : 'text-emerald-600',
        };
      case 'current':
        return {
          node: isDark
            ? 'bg-blue-600 text-white ring-4 ring-blue-500/30 animate-pulse'
            : 'bg-blue-500 text-white ring-4 ring-blue-300 animate-pulse',
          line: isDark ? 'bg-gray-700' : 'bg-gray-300',
          label: isDark ? 'text-blue-400 font-semibold' : 'text-blue-600 font-semibold',
        };
      case 'error':
        return {
          node: isDark
            ? 'bg-red-600 text-white ring-4 ring-red-500/30'
            : 'bg-red-500 text-white ring-4 ring-red-300',
          line: isDark ? 'bg-gray-700' : 'bg-gray-300',
          label: isDark ? 'text-red-400 font-semibold' : 'text-red-600 font-semibold',
        };
      default:
        return {
          node: isDark
            ? 'bg-gray-700 text-gray-500 ring-2 ring-gray-600'
            : 'bg-gray-200 text-gray-400 ring-2 ring-gray-300',
          line: isDark ? 'bg-gray-700' : 'bg-gray-300',
          label: isDark ? 'text-gray-500' : 'text-gray-400',
        };
    }
  };

  const styles = getStatusStyles();

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex items-start gap-3">
      {/* Node and line */}
      <div className="flex flex-col items-center">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${styles.node}`}
        >
          {stage.icon}
        </div>
        {!isLast && (
          <div className={`w-0.5 h-8 ${styles.line}`} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div
          className={`flex items-center gap-2 cursor-pointer ${stage.expandable ? 'hover:opacity-80' : ''}`}
          onClick={() => stage.expandable && onToggle()}
        >
          <span className={`text-sm ${styles.label}`}>{stage.label}</span>
          {stage.timestamp && (
            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {formatDate(stage.timestamp)}
            </span>
          )}
          {stage.expandable && (
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''} ${
                isDark ? 'text-gray-500' : 'text-gray-400'
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>

        {stage.description && (
          <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {stage.description}
          </p>
        )}

        {/* Expanded details */}
        {isExpanded && stage.details && (
          <div
            className={`mt-2 p-3 rounded-lg text-xs ${
              isDark ? 'bg-gray-800/50' : 'bg-gray-50'
            }`}
          >
            <dl className="space-y-1">
              {Object.entries(stage.details).map(([key, value]) => (
                value != null && (
                  <div key={key} className="flex justify-between">
                    <dt className={isDark ? 'text-gray-500' : 'text-gray-400'}>{key}</dt>
                    <dd className={isDark ? 'text-gray-300' : 'text-gray-700'}>{value}</dd>
                  </div>
                )
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 🧩 Main POTimeline Component
// ═══════════════════════════════════════════════════════════════════════════

const POTimeline: React.FC<POTimelineProps> = ({
  poId,
  poNumber,
  data: propData,
  onRefresh,
  onViewEmail,
  onViewMatch,
  compact = false,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  const [data, setData] = useState<POTimelineData | null>(propData || null);
  const [loading, setLoading] = useState(!propData);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  // Fetch timeline data if not provided
  useEffect(() => {
    if (propData) {
      setData(propData);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch PO details
        const { data: po, error } = await supabase
          .from('finale_purchase_orders')
          .select('*')
          .eq('id', poId)
          .single();

        if (error) throw error;

        // Fetch shipment data
        const { data: shipments } = await supabase
          .from('po_shipment_data')
          .select('*')
          .eq('po_id', poId)
          .order('created_at', { ascending: false })
          .limit(1);

        // Fetch three-way match data
        const { data: matchData } = await supabase
          .from('po_three_way_matches')
          .select('*')
          .eq('po_id', poId)
          .order('created_at', { ascending: false })
          .limit(1);

        // Fetch invoice data
        const { data: invoiceData } = await supabase
          .from('vendor_invoice_documents')
          .select('*')
          .eq('matched_po_id', poId)
          .order('created_at', { ascending: false })
          .limit(1);

        const shipment = shipments?.[0];
        const match = matchData?.[0];
        const invoice = invoiceData?.[0];

        setData({
          poId: po.id,
          poNumber: po.order_id,
          vendorName: po.supplier_name,
          createdAt: po.created_at,
          sentAt: po.email_last_sent_at || po.status === 'Committed' ? po.order_date : undefined,
          acknowledgedAt: po.vendor_acknowledged_at,
          shippedAt: shipment?.ship_date,
          inTransitAt: shipment?.status === 'in_transit' ? shipment.updated_at : undefined,
          deliveredAt: shipment?.actual_delivery_date,
          receivedAt: po.status === 'Received' ? po.updated_at : undefined,
          invoicedAt: invoice?.created_at,
          paidAt: invoice?.payment_date,
          currentStatus: po.status,
          trackingNumbers: shipment?.tracking_numbers,
          carrier: shipment?.carrier,
          estimatedDelivery: shipment?.estimated_delivery_date,
          matchStatus: match?.match_status,
          matchScore: match?.match_score,
          emailThreadId: po.email_thread_id,
          hasException: shipment?.status === 'exception',
          exceptionMessage: shipment?.notes,
        });
      } catch (err) {
        console.error('Failed to fetch timeline data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [poId, propData]);

  // Build timeline stages
  const buildStages = (): TimelineStage[] => {
    if (!data) return [];

    const determineStatus = (
      isComplete: boolean,
      isCurrent: boolean,
      hasError: boolean
    ): TimelineStage['status'] => {
      if (hasError) return 'error';
      if (isComplete) return 'completed';
      if (isCurrent) return 'current';
      return 'upcoming';
    };

    // Determine current stage based on data
    const stages: { key: string; completed: boolean }[] = [
      { key: 'created', completed: !!data.createdAt },
      { key: 'sent', completed: !!data.sentAt },
      { key: 'acknowledged', completed: !!data.acknowledgedAt },
      { key: 'shipped', completed: !!data.shippedAt },
      { key: 'in_transit', completed: !!data.inTransitAt || !!data.deliveredAt },
      { key: 'delivered', completed: !!data.deliveredAt },
      { key: 'received', completed: !!data.receivedAt },
      { key: 'invoiced', completed: !!data.invoicedAt },
      { key: 'paid', completed: !!data.paidAt },
    ];

    // Find current stage
    const currentIdx = stages.findIndex((s, i) =>
      s.completed && (i === stages.length - 1 || !stages[i + 1].completed)
    );

    return [
      {
        id: 'created',
        label: 'PO Created',
        icon: <CreateIcon />,
        status: determineStatus(!!data.createdAt, currentIdx === 0, false),
        timestamp: data.createdAt,
        description: `Order created for ${data.vendorName}`,
        expandable: true,
        details: {
          'PO Number': data.poNumber,
          'Vendor': data.vendorName,
        },
      },
      {
        id: 'sent',
        label: 'Sent to Vendor',
        icon: <SendIcon />,
        status: determineStatus(!!data.sentAt, currentIdx === 1, false),
        timestamp: data.sentAt,
        description: data.sentAt ? 'PO transmitted to vendor' : 'Awaiting submission',
        expandable: !!data.emailThreadId,
        details: data.emailThreadId ? {
          'Email Thread': 'View conversation →',
        } : undefined,
      },
      {
        id: 'acknowledged',
        label: 'Vendor Acknowledged',
        icon: <CheckIcon />,
        status: determineStatus(!!data.acknowledgedAt, currentIdx === 2, false),
        timestamp: data.acknowledgedAt,
        description: data.acknowledgedAt ? 'Vendor confirmed order' : 'Awaiting confirmation',
      },
      {
        id: 'shipped',
        label: 'Shipped',
        icon: <TruckIcon />,
        status: determineStatus(!!data.shippedAt, currentIdx === 3, false),
        timestamp: data.shippedAt,
        description: data.shippedAt
          ? `Shipped via ${data.carrier || 'carrier'}`
          : 'Awaiting shipment',
        expandable: !!data.trackingNumbers?.length,
        details: data.trackingNumbers?.length ? {
          'Carrier': data.carrier || 'Unknown',
          'Tracking': data.trackingNumbers.join(', '),
          'Est. Delivery': data.estimatedDelivery || 'Not available',
        } : undefined,
      },
      {
        id: 'in_transit',
        label: 'In Transit',
        icon: <TransitIcon />,
        status: determineStatus(
          !!data.inTransitAt || !!data.deliveredAt,
          currentIdx === 4,
          data.hasException || false
        ),
        timestamp: data.inTransitAt,
        description: data.hasException
          ? data.exceptionMessage || 'Delivery exception'
          : data.inTransitAt
            ? 'Package in transit'
            : 'Awaiting pickup',
      },
      {
        id: 'delivered',
        label: 'Delivered',
        icon: <DeliveredIcon />,
        status: determineStatus(!!data.deliveredAt, currentIdx === 5, false),
        timestamp: data.deliveredAt,
        description: data.deliveredAt ? 'Package delivered' : 'Awaiting delivery',
      },
      {
        id: 'received',
        label: 'Received & Verified',
        icon: <ReceiveIcon />,
        status: determineStatus(!!data.receivedAt, currentIdx === 6, false),
        timestamp: data.receivedAt,
        description: data.receivedAt
          ? data.matchStatus === 'matched'
            ? 'Received - quantities verified'
            : data.matchStatus === 'mismatch'
              ? 'Received - discrepancies found'
              : 'Received - pending verification'
          : 'Awaiting receipt',
        expandable: !!data.matchStatus,
        details: data.matchStatus ? {
          'Match Status': data.matchStatus.replace('_', ' '),
          'Match Score': data.matchScore ? `${data.matchScore}%` : 'N/A',
        } : undefined,
      },
      {
        id: 'invoiced',
        label: 'Invoice Received',
        icon: <InvoiceIcon />,
        status: determineStatus(!!data.invoicedAt, currentIdx === 7, false),
        timestamp: data.invoicedAt,
        description: data.invoicedAt ? 'Invoice processed' : 'Awaiting invoice',
      },
      {
        id: 'paid',
        label: 'Payment Complete',
        icon: <PaidIcon />,
        status: determineStatus(!!data.paidAt, currentIdx === 8, false),
        timestamp: data.paidAt,
        description: data.paidAt ? 'Order complete' : 'Awaiting payment',
      },
    ];
  };

  const stages = buildStages();

  if (loading) {
    return (
      <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
              <div className={`h-4 w-24 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`p-4 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
        Unable to load timeline data
      </div>
    );
  }

  // Compact view - just the progress bar
  if (compact) {
    const completedCount = stages.filter(s => s.status === 'completed').length;
    const currentStage = stages.find(s => s.status === 'current');
    const progress = (completedCount / stages.length) * 100;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {currentStage?.label || 'Complete'}
          </span>
          <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {completedCount}/{stages.length}
          </span>
        </div>
        <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              stages.some(s => s.status === 'error')
                ? 'bg-red-500'
                : progress === 100
                  ? 'bg-emerald-500'
                  : 'bg-blue-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  // Full timeline view
  return (
    <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-800/50' : 'bg-white'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
          Order Timeline
        </h3>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className={`text-xs px-2 py-1 rounded ${
              isDark
                ? 'text-blue-400 hover:bg-blue-900/30'
                : 'text-blue-600 hover:bg-blue-50'
            }`}
          >
            Refresh
          </button>
        )}
      </div>

      <div className="space-y-0">
        {stages.map((stage, idx) => (
          <TimelineStageNode
            key={stage.id}
            stage={stage}
            isLast={idx === stages.length - 1}
            isDark={isDark}
            isExpanded={expandedStage === stage.id}
            onToggle={() => setExpandedStage(expandedStage === stage.id ? null : stage.id)}
          />
        ))}
      </div>

      {/* Quick actions */}
      <div className={`mt-4 pt-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} flex gap-2`}>
        {data.emailThreadId && onViewEmail && (
          <button
            onClick={() => onViewEmail(data.emailThreadId!)}
            className={`text-xs px-3 py-1.5 rounded-lg ${
              isDark
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            View Emails
          </button>
        )}
        {data.matchStatus && onViewMatch && (
          <button
            onClick={onViewMatch}
            className={`text-xs px-3 py-1.5 rounded-lg ${
              isDark
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            View Match Details
          </button>
        )}
      </div>
    </div>
  );
};

export default POTimeline;
