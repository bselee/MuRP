import React, { useEffect, useMemo, useState } from 'react';
import type {
import Button from '@/components/ui/Button';
  InventoryItem,
  PurchaseOrder,
  RequisitionItem,
  RequisitionRequestOptions,
  RequisitionRequestType,
  RequisitionPriority,
  QuickRequestDefaults,
} from '../types';
import { PlusCircleIcon, BellIcon, XCircleIcon } from './icons';
interface QuickRequestDrawerProps {
  isOpen: boolean;
  inventory: InventoryItem[];
  purchaseOrders: PurchaseOrder[];
  defaults?: QuickRequestDefaults | null;
  onClose: () => void;
  onSubmit: (items: RequisitionItem[], options: RequisitionRequestOptions) => Promise<void> | void;
}

const REQUEST_TYPES: { label: string; value: RequisitionRequestType; description: string }[] = [
  { label: 'Consumable / Component', value: 'consumable', description: 'Something we stock regularly (bags, labels, inputs)' },
  { label: 'Product Alert', value: 'product_alert', description: 'Heads up that we need finished goods or expect demand' },
  { label: 'Finished Good', value: 'finished_good', description: 'Need packaged goods for sales/ops' },
  { label: 'Other', value: 'other', description: 'Anything else (tools, services, misc.)' },
];

const PRIORITY_OPTIONS: { label: string; value: RequisitionPriority; tone: string }[] = [
  { label: 'Low', value: 'low', tone: 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/30' },
  { label: 'Medium', value: 'medium', tone: 'bg-indigo-500/10 text-indigo-200 border border-indigo-500/30' },
  { label: 'High', value: 'high', tone: 'bg-rose-500/10 text-rose-200 border border-rose-500/30' },
];

interface PurchaseOrderSnapshot {
  id: string;
  displayId: string;
  vendor: string;
  status: string;
  quantity: number;
  orderDate?: string;
  expectedDate?: string | null;
  trackingNumber?: string | null;
  trackingCarrier?: string | null;
  trackingStatus?: string | null;
}

const QuickRequestDrawer: React.FC<QuickRequestDrawerProps> = ({ isOpen, inventory, purchaseOrders, defaults, onClose, onSubmit }) => {
  const inventoryMap = useMemo(() => new Map(inventory.map(item => [item.sku.toLowerCase(), item])), [inventory]);
  const [sku, setSku] = useState('');
  const [customName, setCustomName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [requestType, setRequestType] = useState<RequisitionRequestType>('consumable');
  const [priority, setPriority] = useState<RequisitionPriority>('medium');
  const [needByDate, setNeedByDate] = useState('');
  const [alertOnly, setAlertOnly] = useState(false);
  const [autoPo, setAutoPo] = useState(false);
  const [notifyRequester, setNotifyRequester] = useState(true);
  const [actionMode, setActionMode] = useState<'question' | 'requisition'>('question');
  const [needsOpsApproval, setNeedsOpsApproval] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSku(defaults?.sku ?? '');
      setRequestType(defaults?.requestType ?? 'consumable');
      setPriority(defaults?.priority ?? 'medium');
      setAlertOnly(Boolean(defaults?.alertOnly));
      setAutoPo(Boolean(defaults?.autoPo));
      setReason(defaults?.context ?? '');
      setNeedByDate('');
      setCustomName('');
      setQuantity(1);
      setNotifyRequester(true);
      setActionMode(defaults?.alertOnly ? 'question' : 'requisition');
      setNeedsOpsApproval(Boolean(defaults?.metadata?.requiresOpsApproval));
    }
  }, [isOpen, defaults]);

  const matchedInventory = sku ? inventoryMap.get(sku.trim().toLowerCase()) : undefined;
  const displayName = matchedInventory?.name ?? customName;
  const normalizedSku = (matchedInventory?.sku || sku || '').trim().toLowerCase();

  const poSnapshots = useMemo<PurchaseOrderSnapshot[]>(() => {
    if (!normalizedSku) return [];
    return purchaseOrders
      .map((po) => {
        const line = po.items.find((item) => item.sku?.toLowerCase() === normalizedSku);
        if (!line) return null;
        return {
          id: po.id,
          displayId: po.orderId ?? po.id,
          vendor: po.supplier || 'Unknown Vendor',
          status: po.status,
          quantity: line.quantity,
          orderDate: po.orderDate,
          expectedDate: po.trackingEstimatedDelivery || po.estimatedReceiveDate || po.expectedDate || null,
          trackingNumber: po.trackingNumber,
          trackingCarrier: po.trackingCarrier,
          trackingStatus: po.trackingStatus,
        } satisfies PurchaseOrderSnapshot;
      })
      .filter((entry): entry is PurchaseOrderSnapshot => Boolean(entry))
      .sort((a, b) => {
        const aDate = a.expectedDate || a.orderDate || '';
        const bDate = b.expectedDate || b.orderDate || '';
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      });
  }, [purchaseOrders, normalizedSku]);

  const inboundQuantity = poSnapshots.reduce((sum, po) => sum + (po.quantity || 0), 0);
  const nextInboundDate = poSnapshots[0]?.expectedDate || null;

  const canSubmit = Boolean((matchedInventory || customName.trim().length > 2) && (alertOnly || quantity > 0));

  useEffect(() => {
    setActionMode(alertOnly ? 'question' : 'requisition');
  }, [alertOnly]);

  const activateQuestionMode = () => {
    setAlertOnly(true);
    setRequestType('product_alert');
    setActionMode('question');
  };

  const activateRequisitionMode = () => {
    setAlertOnly(false);
    setRequestType('consumable');
    setActionMode('requisition');
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const itemName = displayName || 'Requested Item';
    const finalSku = matchedInventory ? matchedInventory.sku : sku || `CUSTOM-${Date.now()}`;

    const item: RequisitionItem = {
      sku: finalSku,
      name: itemName,
      quantity: alertOnly ? 0 : quantity,
      reason: reason || (alertOnly ? 'Alert only' : 'Requested via quick drawer'),
      isCustomSku: !matchedInventory,
      notes: defaults?.context,
    };

    await onSubmit([item], {
      requestType,
      priority,
      needByDate: needByDate || null,
      alertOnly,
      autoPo,
      notifyRequester,
      context: reason,
      metadata: {
        quickRequest: true,
        sourceSku: defaults?.sku ?? sku,
        quickCreatedAt: new Date().toISOString(),
        requiresOpsApproval: needsOpsApproval,
      },
      opsApprovalRequired: needsOpsApproval,
    });
    onClose();
  };

  return (
    <div className={`fixed inset-0 z-[120] transition ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <aside
        className={`absolute top-0 right-0 h-full w-full max-w-md bg-gray-900 border-l border-gray-800 shadow-2xl transform transition-transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Ask About Product</p>
            <h2 className="text-xl font-semibold text-white">Where is it?</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Enter a SKU to see live inventory, inbound PO status, and kick off a question or requisition.
            </p>
          </div>
          <Button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
            aria-label="Close quick request drawer"
          >
            <XCircleIcon className="w-6 h-6" />
          </Button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto h-[calc(100%-64px)]">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">What do you want to do?</label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={activateQuestionMode}
                className={`p-3 rounded-lg border text-left transition ${
                  actionMode === 'question'
                    ? 'border-sky-500/60 bg-sky-500/10 text-white'
                    : 'border-gray-700 text-gray-300 hover:border-gray-600'
                }`}
              >
                <p className="font-semibold">Ask a Question</p>
                <p className="text-xs text-gray-400">Send a heads-up / status ping without ordering.</p>
              </Button>
              <Button
                onClick={activateRequisitionMode}
                className={`p-3 rounded-lg border text-left transition ${
                  actionMode === 'requisition'
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-white'
                    : 'border-gray-700 text-gray-300 hover:border-gray-600'
                }`}
              >
                <p className="font-semibold">Create Requisition</p>
                <p className="text-xs text-gray-400">Kick off an internal PO with quantities.</p>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Request Type</label>
            <div className="grid grid-cols-2 gap-2">
              {REQUEST_TYPES.map(option => (
                <Button
                  key={option.value}
                  onClick={() => {
                    setRequestType(option.value);
                    setAlertOnly(option.value === 'product_alert');
                  }}
                  className={`p-3 rounded-lg text-left border text-sm transition ${
                    requestType === option.value
                      ? 'border-indigo-500/70 bg-indigo-500/10 text-white'
                      : 'border-gray-700 hover:border-gray-600 text-gray-300'
                  }`}
                >
                  <p className="font-semibold">{option.label}</p>
                  <p className="text-xs text-gray-400">{option.description}</p>
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Priority</label>
            <div className="flex flex-wrap gap-2">
              {PRIORITY_OPTIONS.map(option => (
                <Button
                  key={option.value}
                  onClick={() => setPriority(option.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    priority === option.value ? option.tone : 'bg-gray-800 text-gray-400 border border-gray-700'
                  }`}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Which item?</label>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Search SKU..."
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              list="quick-request-skus"
            />
            <datalist id="quick-request-skus">
              {inventory.slice(0, 100).map(item => (
                <option key={item.sku} value={item.sku}>{item.name}</option>
              ))}
            </datalist>
            {!matchedInventory && (
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Item name / description"
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            )}
          </div>

          {normalizedSku ? (
            <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/40 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="p-3 rounded-lg bg-gray-800/60 border border-gray-700">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Inventory</p>
                  <p className="text-2xl font-semibold text-white mt-1">
                    {matchedInventory ? matchedInventory.stock.toLocaleString() : '—'}
                  </p>
                  <p className="text-xs text-gray-400">
                    Reorder point {matchedInventory?.reorderPoint ?? '—'} • On order {matchedInventory?.onOrder ?? 0}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-800/60 border border-gray-700">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Inbound</p>
                  <p className="text-2xl font-semibold text-white mt-1">
                    {inboundQuantity > 0 ? inboundQuantity.toLocaleString() : 'No POs'}
                  </p>
                  <p className="text-xs text-gray-400">
                    Next arrival {nextInboundDate ? new Date(nextInboundDate).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Open Purchase Orders</p>
                  {poSnapshots.length > 3 && (
                    <span className="text-xs text-gray-400">
                      Showing first 3 of {poSnapshots.length}
                    </span>
                  )}
                </div>
                {poSnapshots.length > 0 ? (
                  <div className="space-y-2">
                    {poSnapshots.slice(0, 3).map((po) => (
                      <div key={po.id} className="border border-gray-700 rounded-lg p-3 bg-gray-900/30">
                        <div className="flex items-center justify-between text-sm text-white">
                          <span className="font-semibold">{po.displayId}</span>
                          <span className="text-xs uppercase tracking-wide text-gray-400">{po.status}</span>
                        </div>
                        <div className="grid gap-1 text-xs text-gray-300 mt-2">
                          <div>Vendor: {po.vendor}</div>
                          <div>Ordered: {po.orderDate ? new Date(po.orderDate).toLocaleDateString() : '—'}</div>
                          <div>Expected: {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : '—'}</div>
                          {po.trackingNumber && (
                            <div>Tracking: {po.trackingNumber} ({po.trackingCarrier || 'Carrier TBD'})</div>
                          )}
                          {po.trackingStatus && (
                            <div>Status: {po.trackingStatus}</div>
                          )}
                          <div>Qty on PO: {po.quantity.toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">
                    No purchase orders found for this SKU. Use the requisition flow below to request more stock.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 bg-gray-900/50 border border-dashed border-gray-700 rounded-lg p-3">
              Start by entering a SKU to pull live inventory and PO status.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
                {alertOnly ? 'Alert Only' : 'Quantity'}
              </label>
              <input
                type="number"
                min={alertOnly ? 0 : 1}
                disabled={alertOnly}
                value={alertOnly ? '' : quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Need By</label>
              <input
                type="date"
                value={needByDate}
                onChange={(e) => setNeedByDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Context</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Add details (where the need came from, urgency, customer, etc.)"
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Options</label>
            <div className="flex flex-col gap-2 text-sm text-gray-300">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={alertOnly}
                  onChange={(e) => setAlertOnly(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
                />
                This is just an alert (no quantity to order yet)
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoPo}
                  onChange={(e) => setAutoPo(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
                />
                Auto-generate PO draft when approved
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={notifyRequester}
                  onChange={(e) => setNotifyRequester(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
                />
                Notify me when someone acknowledges this
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={needsOpsApproval}
                  onChange={(e) => setNeedsOpsApproval(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
                />
                Requires Operations approval (large/strategic buy)
              </label>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-800 bg-gray-900/80">
          <Button
            fullWidth
            size="lg"
            variant="primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
            leftIcon={
              actionMode === 'question' ? (
                <BellIcon className="w-5 h-5" aria-hidden="true" />
              ) : (
                <PlusCircleIcon className="w-5 h-5" aria-hidden="true" />
              )
            }
          >
            {actionMode === 'question' ? 'Send Question' : 'Submit Requisition'}
          </Button>
          <p className="text-xs text-gray-500 text-center mt-2">
            Routes to purchasing with your department + priority so nothing slips through the cracks.
          </p>
        </div>
      </aside>
    </div>
  );
};

export default QuickRequestDrawer;
