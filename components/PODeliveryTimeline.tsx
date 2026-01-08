/**
 * PO Delivery Timeline Component
 *
 * Displays a visual timeline showing the progress of a purchase order
 * from ordering through delivery. Shows key milestones with dates.
 * Clickable to expand for more details.
 */

import React, { useState } from 'react';
import type { POTrackingStatus, POTrackingEvent } from '../types';
import {
  CheckCircleIcon,
  ClockIcon,
  TruckIcon,
  PackageIcon,
  DocumentTextIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  AlertTriangleIcon,
  MailIcon,
  ExternalLinkIcon,
  RefreshIcon,
} from './icons';

interface PODeliveryTimelineProps {
  status: string;
  trackingStatus?: POTrackingStatus;
  orderDate?: string;
  expectedDate?: string;
  shippedDate?: string;
  deliveredDate?: string;
  trackingNumber?: string;
  carrier?: string;
  trackingEvents?: POTrackingEvent[];
  trackingException?: string;
  vendorName?: string;
  poNumber?: string;
  expandable?: boolean;
  isDark?: boolean;
  /** Callback to refresh tracking data manually */
  onRefresh?: () => Promise<void>;
  /** Whether refresh is currently in progress */
  isRefreshing?: boolean;
  /** Last time tracking was updated */
  lastUpdated?: string;
}

interface TimelineStep {
  id: string;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  date?: string;
  isComplete: boolean;
  isCurrent: boolean;
  isException?: boolean;
}

/**
 * Carrier brand colors and info
 */
const CARRIER_INFO: Record<string, { name: string; color: string; bgLight: string; bgDark: string }> = {
  ups: { name: 'UPS', color: '#351C15', bgLight: 'bg-amber-100', bgDark: 'bg-amber-900/40' },
  fedex: { name: 'FedEx', color: '#4D148C', bgLight: 'bg-purple-100', bgDark: 'bg-purple-900/40' },
  usps: { name: 'USPS', color: '#004B87', bgLight: 'bg-blue-100', bgDark: 'bg-blue-900/40' },
  dhl: { name: 'DHL', color: '#D40511', bgLight: 'bg-red-100', bgDark: 'bg-red-900/40' },
  ontrac: { name: 'OnTrac', color: '#00A651', bgLight: 'bg-green-100', bgDark: 'bg-green-900/40' },
  lso: { name: 'LSO', color: '#E31837', bgLight: 'bg-red-100', bgDark: 'bg-red-900/40' },
  unknown: { name: 'Carrier', color: '#6B7280', bgLight: 'bg-gray-100', bgDark: 'bg-gray-800/40' },
};

/**
 * Detect carrier from tracking number pattern or explicit carrier name
 */
function detectCarrier(trackingNumber: string | null | undefined, carrier: string | null | undefined): string {
  const tn = (trackingNumber || '').trim().toUpperCase();
  const cr = (carrier || '').toLowerCase();

  if (cr.includes('ups') || tn.startsWith('1Z')) return 'ups';
  if (cr.includes('fedex') || /^(\d{12,22}|96\d{20})$/.test(tn)) return 'fedex';
  if (cr.includes('usps') || /^(94|93|92|91)\d{20,22}$/.test(tn)) return 'usps';
  if (cr.includes('dhl')) return 'dhl';
  if (cr.includes('ontrac') || tn.startsWith('C')) return 'ontrac';
  if (cr.includes('lso') || cr.includes('lone star')) return 'lso';
  return 'unknown';
}

/**
 * Generate tracking URL for carrier website
 * Allows users to click through to carrier tracking page without needing API credentials
 */
function getTrackingUrl(trackingNumber: string | null | undefined, carrier: string | null | undefined): string | null {
  if (!trackingNumber) return null;
  const tn = trackingNumber.trim();
  const detectedCarrier = detectCarrier(trackingNumber, carrier);

  const urls: Record<string, string> = {
    ups: `https://www.ups.com/track?tracknum=${encodeURIComponent(tn)}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tn)}`,
    usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tn)}`,
    dhl: `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(tn)}`,
    ontrac: `https://www.ontrac.com/tracking/?number=${encodeURIComponent(tn)}`,
    lso: `https://www.lso.com/tracking/${encodeURIComponent(tn)}`,
    unknown: `https://www.google.com/search?q=${encodeURIComponent(tn)}+tracking`,
  };

  return urls[detectedCarrier] || urls.unknown;
}

const PODeliveryTimeline: React.FC<PODeliveryTimelineProps> = ({
  status,
  trackingStatus,
  orderDate,
  expectedDate,
  shippedDate,
  deliveredDate,
  trackingNumber,
  carrier,
  trackingEvents = [],
  trackingException,
  vendorName,
  poNumber,
  expandable = true,
  isDark = true,
  onRefresh,
  isRefreshing = false,
  lastUpdated,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localRefreshing, setLocalRefreshing] = useState(false);

  // Handle refresh click
  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRefresh || isRefreshing || localRefreshing) return;

    setLocalRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setLocalRefreshing(false);
    }
  };

  const refreshing = isRefreshing || localRefreshing;

  // Determine which steps are complete based on status
  const getStepStatus = () => {
    const normalizedStatus = (status || '').toLowerCase();
    const normalizedTracking = trackingStatus || 'awaiting_confirmation';

    // Map statuses to step completion
    // IMPORTANT: Keep in sync with UnifiedPOList.tsx getProgressIndex()
    // Steps: 1=Ordered, 2=Confirmed, 3=In Transit, 4=Delivered
    const stepMap: Record<string, number> = {
      // PO statuses
      'draft': 0,
      'pending': 0,
      'submitted': 1,  // Order sent, awaiting vendor confirmation
      'sent': 1,       // Order sent, awaiting vendor confirmation
      'committed': 2,  // Vendor confirmed (committed to order)
      'confirmed': 2,  // Vendor confirmed
      'processing': 2, // Vendor processing (implies confirmed)
      'partially_received': 3,
      'received': 4,
      'cancelled': -1,
      // Tracking statuses
      'awaiting_confirmation': 1,
      'shipped': 3,
      'in_transit': 3,
      'out_for_delivery': 3,
      'delivered': 4,
      'exception': -2,
    };

    // Get highest step from both status types
    const poStep = stepMap[normalizedStatus] ?? 0;
    const trackingStep = stepMap[normalizedTracking] ?? 0;
    return Math.max(poStep, trackingStep);
  };

  const currentStep = getStepStatus();
  const hasException = trackingStatus === 'exception' || !!trackingException;

  const steps: TimelineStep[] = [
    {
      id: 'ordered',
      label: 'Order Placed',
      shortLabel: 'Ordered',
      icon: <DocumentTextIcon className="w-3.5 h-3.5" />,
      date: orderDate ? new Date(orderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : undefined,
      isComplete: currentStep >= 1,
      isCurrent: currentStep === 1,
    },
    {
      id: 'confirmed',
      label: 'Vendor Confirmed',
      shortLabel: 'Confirmed',
      icon: <CheckCircleIcon className="w-3.5 h-3.5" />,
      date: undefined,
      isComplete: currentStep >= 2,
      isCurrent: currentStep === 2,
    },
    {
      id: 'shipped',
      label: 'In Transit',
      shortLabel: 'In Transit',
      icon: <TruckIcon className="w-3.5 h-3.5" />,
      date: shippedDate ? new Date(shippedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : undefined,
      isComplete: currentStep >= 3,
      isCurrent: currentStep === 3,
      isException: hasException && currentStep === 3,
    },
    {
      id: 'delivered',
      label: 'Delivered',
      shortLabel: 'Delivered',
      icon: <PackageIcon className="w-3.5 h-3.5" />,
      date: deliveredDate
        ? new Date(deliveredDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : expectedDate
          ? `ETA ${new Date(expectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : undefined,
      isComplete: currentStep >= 4,
      isCurrent: currentStep === 4,
    },
  ];

  // Handle cancelled status
  if (status?.toLowerCase() === 'cancelled' || trackingStatus === 'cancelled') {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700'}`}>
        <AlertTriangleIcon className="w-4 h-4" />
        <span className="text-xs font-medium">Cancelled</span>
      </div>
    );
  }

  // Get progress percentage for the line
  const progressPercent = Math.max(0, Math.min(100, ((currentStep - 1) / (steps.length - 1)) * 100));

  // Compact clickable timeline bar
  return (
    <div className={`rounded-lg overflow-hidden transition-all ${isDark ? 'bg-gray-800/40' : 'bg-gray-50'}`}>
      {/* Clickable header with inline timeline */}
      <button
        onClick={() => expandable && setIsExpanded(!isExpanded)}
        className={`w-full flex items-center gap-3 px-3 py-2 transition-colors ${
          expandable ? 'cursor-pointer hover:bg-gray-700/30' : 'cursor-default'
        }`}
      >
        {/* Mini progress indicator */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <div
                className={`
                  w-5 h-5 rounded-full flex items-center justify-center transition-all
                  ${step.isException
                    ? 'bg-amber-500 text-white'
                    : step.isComplete
                      ? isDark ? 'bg-green-600 text-white' : 'bg-green-500 text-white'
                      : step.isCurrent
                        ? isDark ? 'bg-cyan-500 text-white' : 'bg-cyan-500 text-white'
                        : isDark ? 'bg-gray-700 text-gray-500' : 'bg-gray-200 text-gray-400'
                  }
                `}
                title={step.label}
              >
                {step.isException ? (
                  <AlertTriangleIcon className="w-3 h-3" />
                ) : (
                  step.icon
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`w-3 h-0.5 transition-colors ${
                    step.isComplete
                      ? isDark ? 'bg-green-600' : 'bg-green-500'
                      : isDark ? 'bg-gray-700' : 'bg-gray-300'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Status text */}
        <div className="flex-1 min-w-0 text-left">
          <span className={`text-xs font-medium ${
            hasException
              ? isDark ? 'text-amber-400' : 'text-amber-600'
              : currentStep >= 4
                ? isDark ? 'text-green-400' : 'text-green-600'
                : isDark ? 'text-gray-300' : 'text-gray-700'
          }`}>
            {hasException ? 'Exception' : steps[Math.min(currentStep, steps.length - 1)]?.label || 'Processing'}
          </span>
          {trackingNumber && (() => {
            const trackingUrl = getTrackingUrl(trackingNumber, carrier);
            const detectedCarrier = detectCarrier(trackingNumber, carrier);
            const carrierInfo = CARRIER_INFO[detectedCarrier] || CARRIER_INFO.unknown;
            return (
              <a
                href={trackingUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!trackingUrl) e.preventDefault();
                }}
                className={`ml-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs transition-all ${
                  isDark
                    ? `${carrierInfo.bgDark} hover:bg-opacity-70`
                    : `${carrierInfo.bgLight} hover:bg-opacity-70`
                }`}
                title={`Track on ${carrierInfo.name}`}
              >
                <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                  {carrierInfo.name}
                </span>
                <span className={`font-mono ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {trackingNumber.length > 16 ? `${trackingNumber.slice(0, 4)}...${trackingNumber.slice(-6)}` : trackingNumber}
                </span>
                <ExternalLinkIcon className={`w-3 h-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
              </a>
            );
          })()}
        </div>

        {/* Expected date */}
        {expectedDate && currentStep < 4 && (
          <span className={`text-xs flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            ETA: {new Date(expectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}

        {/* Expand indicator */}
        {expandable && (
          <div className={`flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {isExpanded ? (
              <ChevronDownIcon className="w-4 h-4" />
            ) : (
              <ChevronRightIcon className="w-4 h-4" />
            )}
          </div>
        )}
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className={`px-3 pb-3 pt-1 border-t ${isDark ? 'border-gray-700/50' : 'border-gray-200'}`}>
          {/* Full timeline visualization */}
          <div className="relative pt-4 pb-2">
            {/* Background line */}
            <div className={`absolute top-8 left-4 right-4 h-1 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
            {/* Progress line */}
            <div
              className={`absolute top-8 left-4 h-1 rounded transition-all duration-500 ${
                hasException
                  ? isDark ? 'bg-amber-500' : 'bg-amber-400'
                  : isDark ? 'bg-green-500' : 'bg-green-400'
              }`}
              style={{ width: `calc(${progressPercent}% - 2rem)` }}
            />

            {/* Step nodes */}
            <div className="relative flex justify-between">
              {steps.map((step, index) => (
                <div key={step.id} className="flex flex-col items-center" style={{ width: '25%' }}>
                  {/* Circle */}
                  <div
                    className={`
                      w-8 h-8 rounded-full flex items-center justify-center border-2 z-10 transition-all
                      ${step.isException
                        ? 'bg-amber-500 border-amber-500 text-white'
                        : step.isComplete
                          ? isDark
                            ? 'bg-green-600 border-green-600 text-white'
                            : 'bg-green-500 border-green-500 text-white'
                          : step.isCurrent
                            ? isDark
                              ? 'bg-cyan-500 border-cyan-500 text-white'
                              : 'bg-cyan-500 border-cyan-500 text-white'
                            : isDark
                              ? 'bg-gray-800 border-gray-600 text-gray-500'
                              : 'bg-white border-gray-300 text-gray-400'
                      }
                    `}
                  >
                    {step.isException ? (
                      <AlertTriangleIcon className="w-4 h-4" />
                    ) : step.isComplete ? (
                      <CheckCircleIcon className="w-4 h-4" />
                    ) : (
                      step.icon
                    )}
                  </div>

                  {/* Label */}
                  <span
                    className={`mt-2 text-xs text-center font-medium ${
                      step.isComplete || step.isCurrent
                        ? isDark ? 'text-white' : 'text-gray-900'
                        : isDark ? 'text-gray-500' : 'text-gray-400'
                    }`}
                  >
                    {step.shortLabel}
                  </span>

                  {/* Date */}
                  {step.date && (
                    <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      {step.date}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Exception alert */}
          {hasException && trackingException && (
            <div className={`mt-3 p-2 rounded-lg flex items-start gap-2 ${isDark ? 'bg-amber-900/30' : 'bg-amber-50'}`}>
              <AlertTriangleIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
              <div>
                <p className={`text-xs font-medium ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>Delivery Exception</p>
                <p className={`text-xs ${isDark ? 'text-amber-300/80' : 'text-amber-600'}`}>{trackingException}</p>
              </div>
            </div>
          )}

          {/* Tracking details - Elegant card with carrier branding */}
          {trackingNumber && (() => {
            const trackingUrl = getTrackingUrl(trackingNumber, carrier);
            const detectedCarrier = detectCarrier(trackingNumber, carrier);
            const carrierInfo = CARRIER_INFO[detectedCarrier] || CARRIER_INFO.unknown;

            return (
              <div className={`mt-4 rounded-xl overflow-hidden border ${
                isDark ? 'bg-gray-900/60 border-gray-700/50' : 'bg-white border-gray-200 shadow-sm'
              }`}>
                {/* Carrier header with brand color accent */}
                <div className={`px-4 py-2 flex items-center gap-3 border-b ${
                  isDark ? 'border-gray-700/50' : 'border-gray-100'
                }`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isDark ? carrierInfo.bgDark : carrierInfo.bgLight
                  }`}>
                    <TruckIcon className={`w-4 h-4 ${isDark ? 'text-white' : 'text-gray-700'}`} />
                  </div>
                  <div className="flex-1">
                    <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {carrierInfo.name}
                    </span>
                    <span className={`ml-2 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      Shipment Tracking
                    </span>
                  </div>
                </div>

                {/* Tracking number display */}
                <div className="px-4 py-3">
                  <div className={`text-xs uppercase tracking-wide mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    Tracking Number
                  </div>
                  <div className={`font-mono text-base tracking-wider select-all ${isDark ? 'text-cyan-400' : 'text-cyan-700'}`}>
                    {trackingNumber}
                  </div>
                </div>

                {/* Action buttons */}
                <div className={`px-4 py-3 border-t ${isDark ? 'border-gray-700/50 bg-gray-800/30' : 'border-gray-100 bg-gray-50'}`}>
                  <div className="flex gap-2">
                    {/* Refresh tracking button */}
                    {onRefresh && (
                      <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
                          refreshing
                            ? isDark
                              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : isDark
                              ? 'bg-gray-700 text-white hover:bg-gray-600'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                        title="Refresh tracking from carrier API"
                      >
                        <RefreshIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        {refreshing ? 'Updating...' : 'Refresh'}
                      </button>
                    )}

                    {/* Track on carrier website button */}
                    {trackingUrl && (
                      <a
                        href={trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
                          isDark
                            ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white hover:from-cyan-500 hover:to-teal-500 shadow-lg shadow-cyan-900/30'
                            : 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white hover:from-cyan-500 hover:to-teal-500 shadow-md shadow-cyan-200'
                        }`}
                      >
                        <TruckIcon className="w-4 h-4" />
                        Track on {carrierInfo.name}
                        <ExternalLinkIcon className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  {/* Last updated timestamp */}
                  {lastUpdated && (
                    <p className={`mt-2 text-xs text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      Last updated: {new Date(lastUpdated).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Recent tracking events */}
          {trackingEvents.length > 0 && (
            <div className="mt-3">
              <p className={`text-xs font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Recent Updates
              </p>
              <div className="space-y-1">
                {trackingEvents.slice(0, 3).map((event, idx) => (
                  <div
                    key={event.id || idx}
                    className={`flex items-start gap-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                      event.status === 'delivered'
                        ? 'bg-green-500'
                        : event.status === 'exception'
                          ? 'bg-amber-500'
                          : 'bg-gray-500'
                    }`} />
                    <span className="flex-1">{event.description || event.status}</span>
                    {event.createdAt && (
                      <span className="flex-shrink-0 text-gray-500">
                        {new Date(event.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PODeliveryTimeline;
