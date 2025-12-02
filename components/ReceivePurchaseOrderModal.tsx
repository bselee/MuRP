import React, { useState, useMemo } from 'react';
import Button from '@/components/ui/Button';
import Modal from './Modal';
import type { PurchaseOrder, PurchaseOrderItem, InventoryItem } from '@/types';

interface ReceivedItem {
  poItemId: string;
  sku: string;
  name: string;
  quantityOrdered: number;
  quantityReceived: number;
  condition?: 'good' | 'damaged' | 'partial';
  notes?: string;
}

interface ReceivePurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  po: PurchaseOrder;
  inventory: InventoryItem[];
  onReceive: (poId: string, receivedItems: ReceivedItem[], notes?: string) => Promise<void>;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ReceivePurchaseOrderModal: React.FC<ReceivePurchaseOrderModalProps> = ({
  isOpen,
  onClose,
  po,
  inventory,
  onReceive,
  addToast,
}) => {
  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>(() =>
    po.items.map(item => ({
      poItemId: item.id,
      sku: item.sku,
      name: item.name,
      quantityOrdered: item.quantity,
      quantityReceived: item.quantity,
      condition: 'good' as const,
      notes: '',
    }))
  );

  const [receivingNotes, setReceivingNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate totals and backorders
  const totals = useMemo(() => {
    const totalOrdered = receivedItems.reduce((sum, item) => sum + item.quantityOrdered, 0);
    const totalReceived = receivedItems.reduce((sum, item) => sum + item.quantityReceived, 0);
    const totalBackordered = receivedItems.reduce((sum, item) =>
      sum + Math.max(0, item.quantityOrdered - item.quantityReceived), 0
    );
    const hasBackorders = totalBackordered > 0;

    return { totalOrdered, totalReceived, totalBackordered, hasBackorders };
  }, [receivedItems]);

  const handleQuantityChange = (index: number, quantity: number) => {
    const updated = [...receivedItems];
    updated[index] = { ...updated[index], quantityReceived: Math.max(0, quantity) };
    setReceivedItems(updated);
  };

  const handleConditionChange = (index: number, condition: 'good' | 'damaged' | 'partial') => {
    const updated = [...receivedItems];
    updated[index] = { ...updated[index], condition };
    setReceivedItems(updated);
  };

  const handleNotesChange = (index: number, notes: string) => {
    const updated = [...receivedItems];
    updated[index] = { ...updated[index], notes };
    setReceivedItems(updated);
  };

  const handleReceiveAll = () => {
    const updated = receivedItems.map(item => ({
      ...item,
      quantityReceived: item.quantityOrdered,
      condition: 'good' as const,
    }));
    setReceivedItems(updated);
  };

  const handleReceiveNone = () => {
    const updated = receivedItems.map(item => ({
      ...item,
      quantityReceived: 0,
      condition: 'good' as const,
    }));
    setReceivedItems(updated);
  };

  const handleSubmit = async () => {
    if (totals.totalReceived === 0) {
      addToast('Cannot receive zero items. Please enter quantities received.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await onReceive(po.id, receivedItems, receivingNotes);
      addToast(
        totals.hasBackorders
          ? `PO ${po.orderId} partially received. ${totals.totalBackordered} items backordered.`
          : `PO ${po.orderId} fully received.`,
        'success'
      );
      onClose();
    } catch (error) {
      addToast(`Failed to receive PO: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Receive PO ${po.orderId}`}
      size="xl"
    >
      <div className="space-y-6">
        {/* PO Summary */}
        <div className="bg-gray-900/40 border border-gray-700 rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-400">Vendor</div>
              <div className="font-medium">{po.supplier}</div>
            </div>
            <div>
              <div className="text-gray-400">Order Date</div>
              <div className="font-medium">{new Date(po.orderDate).toLocaleDateString()}</div>
            </div>
            <div>
              <div className="text-gray-400">Total Items</div>
              <div className="font-medium">{totals.totalOrdered}</div>
            </div>
            <div>
              <div className="text-gray-400">Total Value</div>
              <div className="font-medium">${po.total.toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-3">
          <Button
            onClick={handleReceiveAll}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-md"
          >
            Receive All
          </Button>
          <Button
            onClick={handleReceiveNone}
            className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-md"
          >
            Clear All
          </Button>
        </div>

        {/* Items Table */}
        <div className="border border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-800 px-4 py-3 border-b border-gray-700">
            <h3 className="font-medium">Items to Receive</h3>
          </div>
          <div className="divide-y divide-gray-700">
            {receivedItems.map((item, index) => (
              <div key={item.poItemId} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-sm text-gray-400">SKU: {item.sku}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-gray-400">Ordered: {item.quantityOrdered}</div>
                    {item.quantityReceived < item.quantityOrdered && (
                      <div className="text-amber-400">
                        Backorder: {item.quantityOrdered - item.quantityReceived}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
                      Quantity Received
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={item.quantityOrdered}
                      value={item.quantityReceived}
                      onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 0)}
                      className="w-full bg-gray-900/60 border border-gray-700 rounded-md p-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
                      Condition
                    </label>
                    <select
                      value={item.condition}
                      onChange={(e) => handleConditionChange(index, e.target.value as 'good' | 'damaged' | 'partial')}
                      className="w-full bg-gray-900/60 border border-gray-700 rounded-md p-2 text-sm"
                    >
                      <option value="good">Good</option>
                      <option value="damaged">Damaged</option>
                      <option value="partial">Partial</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
                      Notes
                    </label>
                    <input
                      type="text"
                      placeholder="Optional notes"
                      value={item.notes}
                      onChange={(e) => handleNotesChange(index, e.target.value)}
                      className="w-full bg-gray-900/60 border border-gray-700 rounded-md p-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-gray-900/40 border border-gray-700 rounded-lg p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-emerald-400">{totals.totalReceived}</div>
              <div className="text-sm text-gray-400">Received</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-400">{totals.totalBackordered}</div>
              <div className="text-sm text-gray-400">Backordered</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-400">
                {totals.totalOrdered > 0 ? Math.round((totals.totalReceived / totals.totalOrdered) * 100) : 0}%
              </div>
              <div className="text-sm text-gray-400">Complete</div>
            </div>
          </div>
        </div>

        {/* Receiving Notes */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
            Receiving Notes
          </label>
          <textarea
            value={receivingNotes}
            onChange={(e) => setReceivingNotes(e.target.value)}
            placeholder="General notes about this receiving (optional)"
            rows={3}
            className="w-full bg-gray-900/60 border border-gray-700 rounded-md p-3 text-sm"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
          <Button
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || totals.totalReceived === 0}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 text-white px-6 py-2 rounded-md"
          >
            {isSubmitting ? 'Receiving...' : totals.hasBackorders ? 'Receive & Backorder' : 'Receive All'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ReceivePurchaseOrderModal;