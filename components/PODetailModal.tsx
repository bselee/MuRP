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
  ArrowTopRightOnSquareIcon,
} from './icons';
import type { PurchaseOrder, FinalePurchaseOrderRecord, Vendor, InventoryItem } from '../types';

interface PODetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  po: PurchaseOrder | FinalePurchaseOrderRecord | null;
  vendors?: Vendor[];
  inventory?: InventoryItem[];
  onSendEmail?: (poId: string) => void;
  onUpdateTracking?: (poId: string) => void;
  onReceive?: (poId: string) => void;
  onOpenInventoryDetail?: (sku: string) => void;
}

const PODetailModal: React.FC<PODetailModalProps> = ({
  isOpen,
  onClose,
  po,
  vendors = [],
  inventory = [],
  onSendEmail,
  onUpdateTracking,
  onReceive,
  onOpenInventoryDetail,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'financial' | 'timeline'>('overview');
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
  const vendorId = (po as any).vendorId || (po as any).vendor_id;
  const vendorData = vendors.find(v => v.id === vendorId);
  const vendorName = (po as any).vendorName || (po as any).vendor_name || vendorData?.name || 'Unknown Vendor';
  const vendorEmail = vendorData?.email || (po as any).vendor_email || '';
  const vendorPhone = vendorData?.phone || (po as any).vendor_phone || '';
  const vendorAddress = vendorData?.address || (po as any).vendor_address || '';
  
  const orderDate = (po as any).orderDate || (po as any).order_date || (po as any).createdAt;
  const expectedDate = (po as any).expectedDate || (po as any).expected_date || (po as any).expectedDelivery;
  const status = (po as any).status || 'pending';
  const total = Number((po as any).total || (po as any).totalAmount || 0);
  const subtotal = Number((po as any).subtotal || total);
  const tax = Number((po as any).tax || 0);
  const shipping = Number((po as any).shipping || 0);
  const notes = (po as any).notes || (po as any).internalNotes || '';

  // Calculate PO age
  const poAge = orderDate ? Math.floor((Date.now() - new Date(orderDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const isOverdue = poAge > 90;

  // Get items - handle all possible field names from different PO sources
  const items = (po as any).items || (po as any).line_items || (po as any).lineItems || (po as any).purchase_order_items || [];
  
  console.log('[PODetailModal] PO items debug:', {
    poId: poNumber,
    hasItems: (po as any).items !== undefined,
    hasLineItems: (po as any).line_items !== undefined,
    hasLineItemsCamel: (po as any).lineItems !== undefined,
    hasPurchaseOrderItems: (po as any).purchase_order_items !== undefined,
    itemsCount: items.length,
    firstItem: items[0]
  });

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
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'overview'
                  ? 'bg-accent-500/20 text-accent-300 border border-accent-500/50'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('financial')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'financial'
                  ? 'bg-accent-500/20 text-accent-300 border border-accent-500/50'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              Financial & Ancillary
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
        <div className="space-y-6">
          {/* Overview Tab - Shows items, basic info, and actions */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Vendor & Shipping Info Row */}
              <div className="grid grid-cols-2 gap-6">
                {/* Vendor Information */}
                <div className="bg-gray-800/30 rounded-lg border border-gray-700 p-4">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Vendor Information
                  </h3>
                  <div className="space-y-2">
                    <div className="text-white font-semibold text-lg">{vendorName}</div>
                    {vendorEmail && (
                      <div className="text-sm text-gray-300">
                        <a href={`mailto:${vendorEmail}`} className="hover:text-accent-400 transition-colors">
                          {vendorEmail}
                        </a>
                      </div>
                    )}
                    {vendorPhone && (
                      <div className="text-sm text-gray-300">
                        <a href={`tel:${vendorPhone}`} className="hover:text-accent-400 transition-colors">
                          {vendorPhone}
                        </a>
                      </div>
                    )}
                    {vendorAddress && (
                      <div className="text-sm text-gray-400 mt-2">
                        {vendorAddress}
                      </div>
                    )}
                  </div>
                </div>

                {/* Ship To Address */}
                <div className="bg-gray-800/30 rounded-lg border border-gray-700 p-4">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Ship To
                  </h3>
                  <div className="space-y-1 text-sm text-gray-300">
                    {(po as any).ship_to_address ? (
                      <>
                        {(po as any).ship_to_address.split('\n').map((line: string, idx: number) => (
                          <div key={idx} className={idx === 0 ? 'font-semibold text-white' : ''}>
                            {line}
                          </div>
                        ))}
                      </>
                    ) : (po as any).shipping_address ? (
                      <>
                        {typeof (po as any).shipping_address === 'string' ? (
                          (po as any).shipping_address.split('\n').map((line: string, idx: number) => (
                            <div key={idx} className={idx === 0 ? 'font-semibold text-white' : ''}>
                              {line}
                            </div>
                          ))
                        ) : (
                          <>
                            <div className="font-semibold text-white">
                              {((po as any).shipping_address as any).name || 'The Gatherers Factory'}
                            </div>
                            <div>{((po as any).shipping_address as any).street || '815 Capitola Ave'}</div>
                            <div>
                              {((po as any).shipping_address as any).city || 'Capitola'}, {((po as any).shipping_address as any).state || 'CA'} {((po as any).shipping_address as any).zip || '95010'}
                            </div>
                            <div>{((po as any).shipping_address as any).country || 'United States'}</div>
                          </>
                        )}
                      </>
                    ) : (
                      /* Fallback to default address only if no data available */
                      <>
                        <div className="font-semibold text-white">The Gatherers Factory</div>
                        <div>815 Capitola Ave</div>
                        <div>Capitola, CA 95010</div>
                        <div>United States</div>
                        <div className="text-xs text-yellow-400 mt-2">⚠️ Default address - no ship-to data on PO</div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Items List - Primary Focus */}
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <PackageIcon className="w-5 h-5 text-blue-400" />
                  Items Ordered ({items.length})
                </h3>
                
                {items.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    No items found for this purchase order.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-gray-700 bg-gray-800/50">
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            #
                          </th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            Item / SKU
                          </th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            Inventory Status
                          </th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            Qty
                          </th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            Unit Price
                          </th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            Line Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {items.map((item: any, idx: number) => {
                          // Extract SKU from various field names (Finale uses productUrl, internal uses sku)
                          const sku = item.sku || item.product_id || item.productUrl || item.product_url || '';
                          
                          // Extract product name - use SKU if no name available
                          const rawProductName = item.productName || item.product_name || item.description || item.name || '';
                          const productName = rawProductName || sku || `Item ${idx + 1}`;
                          
                          // Find matching inventory item
                          const invItem = inventory.find(i => 
                            i.sku === sku || 
                            i.product_name === productName ||
                            i.name === productName
                          );
                          
                          // Handle different quantity field names
                          const quantity = Number(item.quantity || item.qty || item.quantityOrdered || item.quantity_ordered || item.qty_ordered || 0);
                          // Handle different price field names
                          const unitPrice = Number(item.unitPrice || item.unitCost || item.price || item.unit_price || item.unit_cost || 0);
                          const lineTotal = Number(item.lineTotal || item.line_total || (quantity * unitPrice));

                          const stockLevel = invItem?.available_quantity || 0;
                          const onHand = invItem?.quantity_on_hand || 0;

                          return (
                            <tr 
                              key={idx} 
                              className="hover:bg-gray-800/30 transition-colors"
                            >
                              {/* Line Number */}
                              <td className="py-4 px-4 text-base text-gray-500 font-mono">
                                {idx + 1}
                              </td>
                              
                              {/* Item & SKU */}
                              <td className="py-4 px-4">
                                <div className="flex flex-col gap-2">
                                  {sku && (
                                    <button
                                      onClick={() => onOpenInventoryDetail?.(sku)}
                                      className="group inline-flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300 font-mono w-fit"
                                    >
                                      <span className="bg-gray-800 px-3 py-1 rounded-md border border-accent-500/30 group-hover:border-accent-500/70 transition-all font-semibold">
                                        {sku}
                                      </span>
                                      <ArrowTopRightOnSquareIcon className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                                    </button>
                                  )}
                                  {rawProductName && (
                                    <div className="text-gray-300 text-sm">
                                      {rawProductName}
                                    </div>
                                  )}
                                  {item.notes && (
                                    <p className="text-xs text-gray-500 italic mt-1">{item.notes}</p>
                                  )}
                                </div>
                              </td>

                              {/* Inventory Status */}
                              <td className="py-4 px-4">
                                {invItem ? (
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2.5 py-1 rounded text-sm font-medium ${
                                        stockLevel > 0
                                          ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                                          : 'bg-red-500/20 text-red-300 border border-red-500/30'
                                      }`}>
                                        {stockLevel > 0 ? `${stockLevel} in stock` : 'Out of stock'}
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      On Hand: <span className="font-mono">{onHand}</span>
                                      {invItem.reorder_point && (
                                        <> • Reorder: <span className="font-mono">{invItem.reorder_point}</span></>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-sm text-gray-600">-</span>
                                )}
                              </td>

                              {/* Quantity */}
                              <td className="py-4 px-4 text-right">
                                <div className="flex flex-col items-end gap-1">
                                  <span className="text-white font-mono font-bold text-lg">
                                    {quantity}
                                  </span>
                                  {item.quantityReceived && item.quantityReceived > 0 && (
                                    <div className="text-xs text-green-400 flex items-center gap-1">
                                      <CheckCircleIcon className="w-3 h-3" />
                                      {item.quantityReceived} received
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Unit Price */}
                              <td className="py-4 px-4 text-right">
                                <span className="text-white font-mono text-base">
                                  ${unitPrice.toFixed(2)}
                                </span>
                              </td>

                              {/* Line Total */}
                              <td className="py-4 px-4 text-right">
                                <span className="text-accent-400 font-mono font-bold text-xl">
                                  ${lineTotal.toFixed(2)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Notes & Totals Section */}
              <div className="grid grid-cols-3 gap-6">
                {/* Notes */}
                <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Notes
                  </h3>
                  {notes ? (
                    <p className="text-sm text-gray-300 leading-relaxed">{notes}</p>
                  ) : (
                    <p className="text-sm text-gray-600 italic">No notes for this order</p>
                  )}
                </div>

                {/* Totals Breakdown */}
                <div className="col-span-2 bg-gray-800/50 rounded-lg border border-gray-700 p-6">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                    Order Totals
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center pb-3 border-b border-gray-700">
                      <span className="text-gray-300">Subtotal</span>
                      <span className="text-white font-mono text-lg font-semibold">
                        ${subtotal.toFixed(2)}
                      </span>
                    </div>
                    {shipping > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-300">Shipping</span>
                        <span className="text-white font-mono">
                          ${shipping.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {tax > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-300">Tax</span>
                        <span className="text-white font-mono">
                          ${tax.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-3 border-t border-gray-700">
                      <span className="text-white font-semibold text-lg">Total</span>
                      <span className="text-accent-400 font-mono text-2xl font-bold">
                        ${total.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Historical Pricing Comparison */}
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Price History & Trends
                </h3>
                <div className="space-y-4">
                  {items.map((item: any, idx: number) => {
                    const sku = item.sku || item.product_id || item.productUrl || item.product_url || '';
                    const currentPrice = Number(item.unitPrice || item.unitCost || item.price || item.unit_price || item.unit_cost || 0);
                    
                    // Mock historical data - in production, this would come from purchase_order_items history
                    const previousPrice = currentPrice * 0.95; // Simulate 5% increase
                    const priceChange = currentPrice - previousPrice;
                    const priceChangePercent = ((priceChange / previousPrice) * 100).toFixed(1);
                    const isIncrease = priceChange > 0;
                    
                    return (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                        <div className="flex-1">
                          <div className="text-white font-mono text-sm">{sku || `Item ${idx + 1}`}</div>
                          <div className="text-xs text-gray-500 mt-1">Current: ${currentPrice.toFixed(2)}</div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-semibold ${isIncrease ? 'text-red-400' : 'text-green-400'}`}>
                            {isIncrease ? '↑' : '↓'} {Math.abs(Number(priceChangePercent))}%
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            vs ${previousPrice.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Notes - Old Format - Remove */}
              {false && notes && (
                <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <DocumentTextIcon className="w-5 h-5 text-blue-400" />
                    Notes
                  </h3>
                  <p className="text-gray-300 text-sm whitespace-pre-wrap">{notes}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
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

          {/* Financial & Ancillary Tab */}
          {activeTab === 'financial' && (
            <div className="space-y-4">
              {/* Detailed Financial Breakdown */}
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <CurrencyDollarIcon className="w-5 h-5 text-green-400" />
                  Complete Financial Breakdown
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

              {/* Payment & Vendor Info */}
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Ancillary Information</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Payment Terms:</span>
                    <span className="text-white">{(po as any).paymentTerms || 'Net 30'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Vendor:</span>
                    <span className="text-white">{vendorName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Order ID:</span>
                    <span className="text-white font-mono">{poNumber}</span>
                  </div>
                  {(po as any).vendorOrderNumber && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Vendor Ref:</span>
                      <span className="text-white font-mono">{(po as any).vendorOrderNumber}</span>
                    </div>
                  )}
                </div>
              </div>
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
