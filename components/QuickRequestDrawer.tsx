import React, { useEffect, useMemo, useState } from 'react';
import type {
  InventoryItem,
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

const QuickRequestDrawer: React.FC<QuickRequestDrawerProps> = ({ isOpen, inventory, defaults, onClose, onSubmit }) => {
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
    }
  }, [isOpen, defaults]);

  const matchedInventory = sku ? inventoryMap.get(sku.trim().toLowerCase()) : undefined;
  const displayName = matchedInventory?.name ?? customName;

  const canSubmit = Boolean((matchedInventory || customName.trim().length > 2) && (alertOnly || quantity > 0));

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
      },
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
            <p className="text-xs uppercase tracking-wide text-gray-500">Quick request</p>
            <h2 className="text-xl font-semibold text-white">Need something?</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
            aria-label="Close quick request drawer"
          >
            <XCircleIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto h-[calc(100%-64px)]">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Request Type</label>
            <div className="grid grid-cols-2 gap-2">
              {REQUEST_TYPES.map(option => (
                <button
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
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Priority</label>
            <div className="flex flex-wrap gap-2">
              {PRIORITY_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setPriority(option.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    priority === option.value ? option.tone : 'bg-gray-800 text-gray-400 border border-gray-700'
                  }`}
                >
                  {option.label}
                </button>
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
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-800 bg-gray-900/80">
          <button
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-md transition-colors"
          >
            {alertOnly ? <BellIcon className="w-5 h-5" /> : <PlusCircleIcon className="w-5 h-5" />}
            {alertOnly ? 'Send Alert' : 'Submit Request'}
          </button>
          <p className="text-xs text-gray-500 text-center mt-2">
            Routes to purchasing with your department + priority so nothing slips through the cracks.
          </p>
        </div>
      </aside>
    </div>
  );
};

export default QuickRequestDrawer;
