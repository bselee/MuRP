import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  XMarkIcon,
  TruckIcon,
  DocumentTextIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  CurrencyDollarIcon,
  PackageIcon,
  CalendarIcon,
  InboxIcon,
} from './icons';
import type { PurchaseOrder, FinalePurchaseOrderRecord, Vendor } from '../types';

interface PODetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  po: PurchaseOrder | FinalePurchaseOrderRecord | null;
  vendors?: Vendor[];
  onSendEmail?: (poId: string) => void;
  onUpdateTracking?: (poId: string) => void;
  onReceive?: (poId: string) => void;
}

const PODetailModal: React.FC<PODetailModalProps> = ({
  isOpen,
  onClose,
  po,
  vendors = [],
  onSendEmail,
  onUpdateTracking,
  onReceive,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'items' | 'timeline'>('details');
  const [shipments, setShipments] = useState<any[]>([]);

  useEffect(() => {
    if (!po) return;
    
    // Load shipments for this PO
    // For now, we'll simulate shipment data
    // In production, this would come from po_shipment_data table
    const mockShipments = [];
    if ('trackingNumber' in po && po.trackingNumber) {
      mockShipments.push({
        id: '1',
        trackingNumber: po.trackingNumber,
        carrier: po.trackingCarrier || 'Unknown',
        status: po.trackingStatus,
        estimatedDelivery: po.trackingEstimatedDelivery,
        actualDelivery: po.status === 'received' ? po.receivedDate : null,
      });
    }
    setShipments(mockShipments);
  }, [po]);

  if (!po) return null;

  // Determine if this is a Finale PO or internal PO
  const isInternalPO = 'orderId' in po && !('vendor_name' in po);
  const isFinalePO = 'vendor_name' in po || 'vendorName' in po;

  // Extract common fields with fallbacks
  const poNumber = (po as any).orderId || (po as any).order_id || 'N/A';
  const vendorName = (po as any).vendorName || (po as any).vendor_name || 
    vendors.find(v => v.id === (po as any).vendorId)?.name || 'Unknown Vendor';
  const orderDate = (po as any).orderDate || (po as any).order_date || (po as any).createdAt;
  const expectedDate = (po as any).expectedDate || (po as any).expected_date || (po as any).expectedDelivery;
  const status = (po as any).status || 'pending';
  const total = (po as any).total || (po as any).totalAmount || 0;
  const subtotal = (po as any).subtotal || total;
  const tax = (po as any).tax || 0;
  const shipping = (po as any).shipping || 0;
  const notes = (po as any).notes || (po as any).internalNotes || '';

  // Calculate PO age
  const poAge = orderDate ? Math.floor((Date.now() - new Date(orderDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const isOverdue = poAge > 90;

  // Get items
  const items = (po as any).items || (po as any).line_items || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="xl"
    >
      <div className="max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-700 pb-4 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-white font-mono">
                  PO #{poNumber}
                </h2>
                <StatusBadge status={status} />
                {isOverdue && (
                  <span className="px-2 py-1 text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/30 rounded-full flex items-center gap-1">
                    <ExclamationTriangleIcon className="w-3 h-3" />
                    {poAge} days old
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-4 text-sm text-gray-400">
                <span className="flex items-center gap-1">
                  <PackageIcon className="w-4 h-4" />
                  {vendorName}
                </span>
                {orderDate && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="w-4 h-4" />
                    Ordered: {new Date(orderDate).toLocaleDateString()}
                  </span>
                )}
                {expectedDate && (
                  <span className="flex items-center gap-1">
                    <ClockIcon className="w-4 h-4" />
                    Expected: {new Date(expectedDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setActiveTab('details')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'details'
                  ? 'bg-accent-500/20 text-accent-300 border border-accent-500/50'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('items')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'items'
                  ? 'bg-accent-500/20 text-accent-300 border border-accent-500/50'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              Items ({items.length})
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'timeline'
                  ? 'bg-accent-500/20 text-accent-300 border border-accent-500/50'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              Timeline & Shipments
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="space-y-4">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* Financial Summary */}
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <CurrencyDollarIcon className="w-5 h-5 text-green-400" />
                  Financial Summary
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-gray-300">
                    <span>Subtotal:</span>
                    <span className="font-mono">${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {tax > 0 && (
                    <div className="flex justify-between text-gray-300">
                      <span>Tax:</span>
                      <span className="font-mono">${tax.toFixed(2)}</span>
                    </div>
                  )}
                  {shipping > 0 && (
                    <div className="flex justify-between text-gray-300">
                      <span>Shipping:</span>
                      <span className="font-mono">${shipping.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-white text-lg font-bold pt-3 border-t border-gray-700">
                    <span>Total:</span>
                    <span className="font-mono">${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {notes && (
                <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <DocumentTextIcon className="w-5 h-5 text-blue-400" />
                    Notes
                  </h3>
                  <p className="text-gray-300 text-sm whitespace-pre-wrap">{notes}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                {onSendEmail && (
                  <Button
                    onClick={() => onSendEmail(po.id)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <DocumentTextIcon className="w-4 h-4" />
                    Send Email
                  </Button>
                )}
                {onUpdateTracking && (
                  <Button
                    onClick={() => onUpdateTracking(po.id)}
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <TruckIcon className="w-4 h-4" />
                    Update Tracking
                  </Button>
                )}
                {onReceive && status !== 'received' && (
                  <Button
                    onClick={() => onReceive(po.id)}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <InboxIcon className="w-4 h-4" />
                    Receive PO
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Items Tab */}
          {activeTab === 'items' && (
            <div className="space-y-3">
              {items.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  No items found for this purchase order.
                </div>
              ) : (
                items.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="bg-gray-800/50 rounded-lg border border-gray-700 p-4 hover:border-gray-600 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="text-white font-medium">
                          {item.productName || item.product_name || item.description || 'Unknown Product'}
                        </h4>
                        {item.productUrl && (
                          <p className="text-xs text-gray-500 font-mono mt-1">{item.productUrl}</p>
                        )}
                        {item.notes && (
                          <p className="text-sm text-gray-400 mt-2">{item.notes}</p>
                        )}
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-white font-mono">
                          {item.quantity || item.quantityOrdered || 0} × ${(item.unitPrice || item.price || 0).toFixed(2)}
                        </div>
                        <div className="text-lg font-bold text-accent-400 font-mono">
                          ${((item.quantity || item.quantityOrdered || 0) * (item.unitPrice || item.price || 0)).toFixed(2)}
                        </div>
                        {item.quantityReceived && item.quantityReceived > 0 && (
                          <div className="text-xs text-green-400 mt-1">
                            <CheckCircleIcon className="w-3 h-3 inline mr-1" />
                            {item.quantityReceived} received
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Timeline & Shipments Tab */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              {/* Shipments */}
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <TruckIcon className="w-5 h-5 text-blue-400" />
                  Shipments ({shipments.length})
                </h3>
                
                {shipments.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <TruckIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No shipment information available yet.</p>
                    <p className="text-sm mt-1">Tracking will appear here once the vendor ships the order.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {shipments.map((shipment, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-900/60 rounded-lg border border-gray-700 p-4"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="text-white font-medium">Shipment #{idx + 1}</div>
                            <div className="text-sm text-gray-400 mt-1">
                              Carrier: {shipment.carrier}
                            </div>
                            <div className="text-sm text-gray-400 font-mono">
                              Tracking: {shipment.trackingNumber}
                            </div>
                          </div>
                          <StatusBadge status={shipment.status} />
                        </div>
                        
                        {shipment.estimatedDelivery && (
                          <div className="text-sm text-gray-400 flex items-center gap-2">
                            <ClockIcon className="w-4 h-4" />
                            Estimated Delivery: {new Date(shipment.estimatedDelivery).toLocaleDateString()}
                          </div>
                        )}
                        
                        {shipment.actualDelivery && (
                          <div className="text-sm text-green-400 flex items-center gap-2 mt-2">
                            <CheckCircleIcon className="w-4 h-4" />
                            Delivered: {new Date(shipment.actualDelivery).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Order Timeline</h3>
                
                <div className="space-y-4">
                  {orderDate && (
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 border-2 border-blue-500 flex items-center justify-center">
                          <DocumentTextIcon className="w-4 h-4 text-blue-400" />
                        </div>
                        <div className="w-0.5 h-full bg-gray-700 mt-2" />
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="text-white font-medium">Order Created</div>
                        <div className="text-sm text-gray-400">
                          {new Date(orderDate).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {expectedDate && (
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center">
                          <ClockIcon className="w-4 h-4 text-amber-400" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-medium">Expected Delivery</div>
                        <div className="text-sm text-gray-400">
                          {new Date(expectedDate).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default PODetailModal;
