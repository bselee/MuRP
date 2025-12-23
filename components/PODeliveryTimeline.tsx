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
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Determine which steps are complete based on status
  const getStepStatus = () => {
    const normalizedStatus = (status || '').toLowerCase();
    const normalizedTracking = trackingStatus || 'awaiting_confirmation';

    // Map statuses to step completion
    const stepMap: Record<string, number> = {
      // PO statuses
      'draft': 0,
      'pending': 0,
      'submitted': 1,
      'sent': 1,
      'committed': 1,
      'confirmed': 2,
      'partially_received': 3,
      'received': 4,
      'cancelled': -1,
      // Tracking statuses
      'awaiting_confirmation': 1,
      'processing': 2,
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
          {trackingNumber && (
            <span className={`ml-2 text-xs font-mono ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {carrier ? `${carrier}: ` : ''}{trackingNumber.length > 12 ? `...${trackingNumber.slice(-8)}` : trackingNumber}
            </span>
          )}
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

          {/* Tracking details */}
          {trackingNumber && (
            <div className={`mt-3 p-2 rounded-lg ${isDark ? 'bg-gray-900/50' : 'bg-white border border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TruckIcon className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                  <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {carrier || 'Tracking'}
                  </span>
                </div>
                <span className={`text-xs font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  {trackingNumber}
                </span>
              </div>
            </div>
          )}

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
