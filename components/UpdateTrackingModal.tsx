import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import Button from '@/components/ui/Button';
import type { PurchaseOrder, POTrackingStatus } from '../types';

interface UpdateTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseOrder: PurchaseOrder | null;
  onSave: (updates: {
    trackingNumber?: string | null;
    trackingCarrier?: string | null;
    trackingStatus: POTrackingStatus;
    trackingEstimatedDelivery?: string | null;
    trackingLastException?: string | null;
  }) => Promise<void>;
}

const TRACKING_STATUS_OPTIONS: { value: POTrackingStatus; label: string }[] = [
  { value: 'awaiting_confirmation', label: 'Awaiting Confirmation' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'exception', label: 'Exception' },
  { value: 'cancelled', label: 'Cancelled' },
];

const UpdateTrackingModal: React.FC<UpdateTrackingModalProps> = ({
  isOpen,
  onClose,
  purchaseOrder,
  onSave,
}) => {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingCarrier, setTrackingCarrier] = useState('');
  const [trackingStatus, setTrackingStatus] = useState<POTrackingStatus>('awaiting_confirmation');
  const [estimatedDelivery, setEstimatedDelivery] = useState('');
  const [lastException, setLastException] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !purchaseOrder) return;
    setTrackingNumber(purchaseOrder.trackingNumber ?? '');
    setTrackingCarrier(purchaseOrder.trackingCarrier ?? '');
    setTrackingStatus(purchaseOrder.trackingStatus ?? 'awaiting_confirmation');
    setEstimatedDelivery(purchaseOrder.trackingEstimatedDelivery?.split('T')[0] ?? '');
    setLastException(purchaseOrder.trackingLastException ?? '');
  }, [isOpen, purchaseOrder]);

  const handleSubmit = async () => {
    if (!purchaseOrder || isSaving) return;
    setIsSaving(true);
    try {
      await onSave({
        trackingNumber: trackingNumber || null,
        trackingCarrier: trackingCarrier || null,
        trackingStatus,
        trackingEstimatedDelivery: estimatedDelivery || null,
        trackingLastException: lastException || null,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Update Tracking${purchaseOrder ? ` · ${purchaseOrder.orderId || purchaseOrder.id}` : ''}`}
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="tracking-number-input" className="block text-sm font-medium text-gray-300">
            Tracking Number
          </label>
          <input
            id="tracking-number-input"
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm"
            placeholder="e.g. 1Z999AA10123456784"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="tracking-carrier-input" className="block text-sm font-medium text-gray-300">
              Carrier
            </label>
            <select
              id="tracking-carrier-input"
              value={trackingCarrier}
              onChange={(e) => setTrackingCarrier(e.target.value)}
              className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm"
            >
              <option value="">Select carrier...</option>
              <option value="ups">UPS</option>
              <option value="fedex">FedEx</option>
              <option value="usps">USPS</option>
              <option value="dhl">DHL</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="tracking-status-input" className="block text-sm font-medium text-gray-300">
              Status
            </label>
            <select
              id="tracking-status-input"
              value={trackingStatus}
              onChange={(e) => setTrackingStatus(e.target.value as POTrackingStatus)}
              className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm"
            >
              {TRACKING_STATUS_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="eta-input" className="block text-sm font-medium text-gray-300">
              Estimated Delivery
            </label>
            <input
              id="eta-input"
              type="date"
              value={estimatedDelivery}
              onChange={(e) => setEstimatedDelivery(e.target.value)}
              className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="exception-input" className="block text-sm font-medium text-gray-300">
              Last Exception (optional)
            </label>
            <input
              id="exception-input"
              type="text"
              value={lastException}
              onChange={(e) => setLastException(e.target.value)}
              placeholder="e.g. Weather delay"
              className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
          <Button
            onClick={onClose}
            className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition-colors"
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            className="bg-accent-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-accent-500 transition-colors disabled:opacity-50"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default UpdateTrackingModal;
