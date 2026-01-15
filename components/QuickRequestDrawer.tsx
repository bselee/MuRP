import React, { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import type {
  InventoryItem,
  PurchaseOrder,
  RequisitionItem,
  RequisitionRequestOptions,
  RequisitionRequestType,
  RequisitionPriority,
  QuickRequestDefaults,
} from '../types';
import { PlusCircleIcon, BellIcon, XCircleIcon, TrashIcon, ShoppingCartIcon, CheckCircleIcon, ClockIcon, TruckIcon, PackageIcon } from './icons';
import { extractAmazonMetadata, DEFAULT_AMAZON_TRACKING_EMAIL } from '../lib/amazonTracking';

/** Smart answer for common questions */
interface SmartAnswer {
  question: string;
  answer: string;
  status: 'good' | 'warning' | 'info';
  details?: string;
}

interface QuickRequestDrawerProps {
  isOpen: boolean;
  inventory: InventoryItem[];
  purchaseOrders: PurchaseOrder[];
  defaults?: QuickRequestDefaults | null;
  onClose: () => void;
  onSubmit: (items: RequisitionItem[], options: RequisitionRequestOptions) => Promise<void> | void;
}

const REQUEST_TYPES: { label: string; value: RequisitionRequestType }[] = [
  { label: 'Consumable', value: 'consumable' },
  { label: 'Alert', value: 'product_alert' },
  { label: 'Finished Good', value: 'finished_good' },
  { label: 'Other', value: 'other' },
];

const PRIORITY_OPTIONS: { label: string; value: RequisitionPriority; tone: string }[] = [
  { label: 'Low', value: 'low', tone: 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/30' },
  { label: 'Medium', value: 'medium', tone: 'bg-amber-500/10 text-amber-200 border border-amber-500/30' },
  { label: 'High', value: 'high', tone: 'bg-rose-500/10 text-rose-200 border border-rose-500/30' },
];

interface CartItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  isCustomSku: boolean;
  externalUrl?: string;
  vendorId?: string;
  vendorName?: string;
  // Stock info for warnings
  currentStock?: number;
  onOrder?: number;
  reorderPoint?: number;
}

type StockStatus = 'ok' | 'low' | 'sufficient';

const getStockStatus = (item: CartItem, requestedQty: number): { status: StockStatus; message: string } => {
  if (item.isCustomSku || item.currentStock === undefined) {
    return { status: 'ok', message: '' };
  }

  const available = (item.currentStock || 0) + (item.onOrder || 0);
  const rop = item.reorderPoint || 0;

  // If we have plenty of stock (above ROP + requested), warn
  if (item.currentStock > rop + requestedQty) {
    return {
      status: 'sufficient',
      message: `Stock (${item.currentStock}) is above reorder point (${rop})`,
    };
  }

  // If stock is low but still have some
  if (item.currentStock > 0 && item.currentStock <= rop) {
    return {
      status: 'low',
      message: `Low stock: ${item.currentStock} on hand`,
    };
  }

  return { status: 'ok', message: '' };
};

/** Generate smart answers for common questions about a SKU */
const getSmartAnswers = (
  item: InventoryItem | undefined,
  purchaseOrders: PurchaseOrder[]
): SmartAnswer[] => {
  if (!item) return [];

  const answers: SmartAnswer[] = [];

  // Find POs containing this SKU
  const relevantPOs = purchaseOrders.filter(po => {
    if (!po.lineItems) return false;
    return po.lineItems.some(li =>
      li.sku?.toLowerCase() === item.sku.toLowerCase() ||
      li.itemId === item.id
    );
  });

  // Sort by expected date to get the most relevant
  const openPOs = relevantPOs.filter(po =>
    po.status !== 'received' && po.status !== 'cancelled' && po.status !== 'closed'
  ).sort((a, b) => {
    const dateA = a.expectedDate ? new Date(a.expectedDate).getTime() : Infinity;
    const dateB = b.expectedDate ? new Date(b.expectedDate).getTime() : Infinity;
    return dateA - dateB;
  });

  // Q1: Is this on order?
  if (openPOs.length > 0) {
    const totalOnOrder = openPOs.reduce((sum, po) => {
      const lineItem = po.lineItems?.find(li =>
        li.sku?.toLowerCase() === item.sku.toLowerCase() || li.itemId === item.id
      );
      return sum + (lineItem?.quantity || 0);
    }, 0);

    answers.push({
      question: 'Is this on order?',
      answer: `Yes! ${totalOnOrder.toLocaleString()} units across ${openPOs.length} PO${openPOs.length !== 1 ? 's' : ''}`,
      status: 'good',
      details: openPOs.map(po => `PO-${po.poNumber || po.id?.slice(0, 8)}`).join(', '),
    });
  } else {
    // Check if we have stock or need to order
    if (item.stock > (item.reorderPoint || 0)) {
      answers.push({
        question: 'Is this on order?',
        answer: 'No, but stock is currently sufficient',
        status: 'info',
        details: `${item.stock.toLocaleString()} in stock, ROP is ${item.reorderPoint || 0}`,
      });
    } else {
      answers.push({
        question: 'Is this on order?',
        answer: 'No open orders - may need to reorder',
        status: 'warning',
        details: `${item.stock.toLocaleString()} in stock, below ROP of ${item.reorderPoint || 0}`,
      });
    }
  }

  // Q2: When will this be here?
  if (openPOs.length > 0) {
    const nextPO = openPOs[0];
    if (nextPO.expectedDate) {
      const expectedDate = new Date(nextPO.expectedDate);
      const today = new Date();
      const diffDays = Math.ceil((expectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        answers.push({
          question: 'When will this arrive?',
          answer: `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''}`,
          status: 'warning',
          details: `Expected ${expectedDate.toLocaleDateString()} on PO-${nextPO.poNumber || nextPO.id?.slice(0, 8)}`,
        });
      } else if (diffDays === 0) {
        answers.push({
          question: 'When will this arrive?',
          answer: 'Expected today!',
          status: 'good',
          details: `PO-${nextPO.poNumber || nextPO.id?.slice(0, 8)}`,
        });
      } else if (diffDays <= 7) {
        answers.push({
          question: 'When will this arrive?',
          answer: `In ${diffDays} day${diffDays !== 1 ? 's' : ''} (${expectedDate.toLocaleDateString()})`,
          status: 'good',
          details: `PO-${nextPO.poNumber || nextPO.id?.slice(0, 8)}`,
        });
      } else {
        answers.push({
          question: 'When will this arrive?',
          answer: expectedDate.toLocaleDateString(),
          status: 'info',
          details: `${diffDays} days away via PO-${nextPO.poNumber || nextPO.id?.slice(0, 8)}`,
        });
      }
    } else {
      answers.push({
        question: 'When will this arrive?',
        answer: 'On order, but no ETA set',
        status: 'warning',
        details: `PO-${nextPO.poNumber || nextPO.id?.slice(0, 8)} - contact purchasing for update`,
      });
    }
  } else {
    answers.push({
      question: 'When will this arrive?',
      answer: 'Not currently on order',
      status: 'info',
    });
  }

  // Q3: Current stock status
  const rop = item.reorderPoint || 0;
  const daysOfStock = item.dailyUsage && item.dailyUsage > 0
    ? Math.floor(item.stock / item.dailyUsage)
    : null;

  if (item.stock === 0) {
    answers.push({
      question: 'Do we have any in stock?',
      answer: 'Out of stock',
      status: 'warning',
      details: item.onOrder ? `${item.onOrder.toLocaleString()} on order` : 'No quantity on order',
    });
  } else if (item.stock <= rop) {
    answers.push({
      question: 'Do we have any in stock?',
      answer: `${item.stock.toLocaleString()} units (low)`,
      status: 'warning',
      details: daysOfStock !== null ? `~${daysOfStock} days of stock remaining` : `Below reorder point of ${rop}`,
    });
  } else {
    answers.push({
      question: 'Do we have any in stock?',
      answer: `${item.stock.toLocaleString()} units`,
      status: 'good',
      details: daysOfStock !== null ? `~${daysOfStock} days of stock` : undefined,
    });
  }

  return answers;
};

const QuickRequestDrawer: React.FC<QuickRequestDrawerProps> = ({ isOpen, inventory, purchaseOrders, defaults, onClose, onSubmit }) => {
  const inventoryMap = useMemo(() => new Map(inventory.map(item => [item.sku.toLowerCase(), item])), [inventory]);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);

  // Current item being added
  const [sku, setSku] = useState('');
  const [customName, setCustomName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [externalLink, setExternalLink] = useState('');

  // Request options (apply to entire cart)
  const [reason, setReason] = useState('');
  const [requestType, setRequestType] = useState<RequisitionRequestType>('consumable');
  const [priority, setPriority] = useState<RequisitionPriority>('medium');
  const [needByDate, setNeedByDate] = useState('');
  const [alertOnly, setAlertOnly] = useState(false);
  const [autoPo, setAutoPo] = useState(false);
  const [notifyRequester, setNotifyRequester] = useState(true);
  const [actionMode, setActionMode] = useState<'question' | 'requisition'>('requisition');
  const [needsOpsApproval, setNeedsOpsApproval] = useState(false);

  // Reset form when drawer opens
  useEffect(() => {
    if (isOpen) {
      // If defaults provided, add to cart automatically
      if (defaults?.sku) {
        const matchedItem = inventoryMap.get(defaults.sku.toLowerCase());
        if (matchedItem) {
          const newItem: CartItem = {
            id: `cart-${Date.now()}`,
            sku: matchedItem.sku,
            name: matchedItem.name,
            quantity: 1,
            isCustomSku: false,
            vendorId: matchedItem.vendorId,
            vendorName: matchedItem.vendorName,
          };
          setCart([newItem]);
        }
      } else {
        setCart([]);
      }

      setRequestType(defaults?.requestType ?? 'consumable');
      setPriority(defaults?.priority ?? 'medium');
      setAlertOnly(Boolean(defaults?.alertOnly));
      setAutoPo(Boolean(defaults?.autoPo));
      setReason(defaults?.context ?? '');
      setNeedByDate('');
      setSku('');
      setCustomName('');
      setQuantity(1);
      setExternalLink(defaults?.metadata?.externalUrl ?? '');
      setNotifyRequester(true);
      setActionMode(defaults?.alertOnly ? 'question' : 'requisition');
      setNeedsOpsApproval(Boolean(defaults?.metadata?.requiresOpsApproval));
    }
  }, [isOpen, defaults, inventoryMap]);

  const matchedInventory = sku ? inventoryMap.get(sku.trim().toLowerCase()) : undefined;
  const displayName = matchedInventory?.name ?? customName;

  // Smart answers for question mode
  const smartAnswers = useMemo(() => {
    if (!alertOnly || !matchedInventory) return [];
    return getSmartAnswers(matchedInventory, purchaseOrders);
  }, [alertOnly, matchedInventory, purchaseOrders]);

  const amazonMetadata = useMemo(() => extractAmazonMetadata(externalLink), [externalLink]);
  const amazonTrackingEmail = amazonMetadata ? DEFAULT_AMAZON_TRACKING_EMAIL : undefined;

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

  // Can add item if we have a valid SKU/name and quantity
  const canAddToCart = Boolean(
    (matchedInventory || customName.trim().length > 2) &&
    (alertOnly || quantity > 0)
  );

  // Can submit if cart has items
  const canSubmit = cart.length > 0;

  const addToCart = () => {
    if (!canAddToCart) return;

    const itemName = displayName || 'Requested Item';
    const finalSku = matchedInventory ? matchedInventory.sku : sku || `CUSTOM-${Date.now()}`;
    const normalizedLink = externalLink.trim();
    const cleanedLink = normalizedLink ? (normalizedLink.startsWith('http') ? normalizedLink : `https://${normalizedLink}`) : undefined;

    const newItem: CartItem = {
      id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sku: finalSku,
      name: itemName,
      quantity: alertOnly ? 0 : quantity,
      isCustomSku: !matchedInventory,
      externalUrl: cleanedLink,
      vendorId: matchedInventory?.vendorId,
      vendorName: matchedInventory?.vendorName,
      // Stock info for warnings
      currentStock: matchedInventory?.stock,
      onOrder: matchedInventory?.onOrder,
      reorderPoint: matchedInventory?.reorderPoint,
    };

    setCart(prev => [...prev, newItem]);

    // Clear input fields for next item
    setSku('');
    setCustomName('');
    setQuantity(1);
    setExternalLink('');
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  };

  const updateCartItemQuantity = (itemId: string, newQty: number) => {
    setCart(prev => prev.map(item =>
      item.id === itemId ? { ...item, quantity: Math.max(1, newQty) } : item
    ));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const items: RequisitionItem[] = cart.map(cartItem => {
      const amazonMeta = cartItem.externalUrl ? extractAmazonMetadata(cartItem.externalUrl) : null;
      return {
        sku: cartItem.sku,
        name: cartItem.name,
        quantity: alertOnly ? 0 : cartItem.quantity,
        reason: reason || (alertOnly ? 'Alert only' : 'Requested via quick drawer'),
        isCustomSku: cartItem.isCustomSku,
        externalUrl: cartItem.externalUrl,
        externalSource: amazonMeta ? 'amazon' : cartItem.externalUrl ? 'external_link' : undefined,
        metadata: amazonMeta
          ? { amazon: amazonMeta, trackingEmail: amazonTrackingEmail }
          : undefined,
      };
    });

    const optionsMetadata = {
      ...(defaults?.metadata ?? {}),
      quickRequest: true,
      quickCreatedAt: new Date().toISOString(),
      requiresOpsApproval: needsOpsApproval,
      itemCount: cart.length,
      // Group by vendor for later PO generation
      vendorGroups: groupCartByVendor(),
    } as Record<string, any>;

    await onSubmit(items, {
      requestType,
      priority,
      needByDate: needByDate || null,
      alertOnly,
      autoPo,
      notifyRequester,
      context: reason,
      metadata: optionsMetadata,
      opsApprovalRequired: needsOpsApproval,
    });

    setCart([]);
    onClose();
  };

  // Group cart items by vendor for PO generation preview
  const groupCartByVendor = () => {
    const groups: Record<string, { vendorId: string; vendorName: string; items: CartItem[] }> = {};

    cart.forEach(item => {
      const vendorKey = item.vendorId || 'unassigned';
      if (!groups[vendorKey]) {
        groups[vendorKey] = {
          vendorId: item.vendorId || '',
          vendorName: item.vendorName || 'No Vendor Assigned',
          items: [],
        };
      }
      groups[vendorKey].items.push(item);
    });

    return groups;
  };

  const vendorGroups = useMemo(() => groupCartByVendor(), [cart]);
  const vendorCount = Object.keys(vendorGroups).length;

  return (
    <div className={`fixed inset-0 z-[120] transition ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <aside
        className={`absolute top-0 right-0 h-full w-full max-w-lg bg-gray-900 border-l border-gray-800 shadow-2xl transform transition-transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <ShoppingCartIcon className="w-5 h-5" />
              Quick Request
              {cart.length > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs font-bold bg-amber-500 text-black rounded-full">
                  {cart.length}
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-400">Add items to cart, then submit to purchasing</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
            aria-label="Close"
          >
            <XCircleIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto h-[calc(100%-180px)]">
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={activateQuestionMode}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                actionMode === 'question'
                  ? 'bg-gray-700 text-white border border-gray-500'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-750'
              }`}
            >
              Question / Alert
            </button>
            <button
              type="button"
              onClick={activateRequisitionMode}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                actionMode === 'requisition'
                  ? 'bg-gray-700 text-white border border-gray-500'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-750'
              }`}
            >
              Request Items
            </button>
          </div>

          {/* Add Item Section */}
          <div className="p-3 rounded-lg border border-gray-700 bg-gray-800/30 space-y-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Add Item</p>

            <div className="flex gap-2">
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="SKU or item name..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500"
                list="quick-request-skus"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canAddToCart) {
                    e.preventDefault();
                    addToCart();
                  }
                }}
              />
              <datalist id="quick-request-skus">
                {inventory.slice(0, 100).map(item => (
                  <option key={item.sku} value={item.sku}>{item.name}</option>
                ))}
              </datalist>

              {!alertOnly && (
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                  className="w-20 bg-gray-800 border border-gray-700 rounded-md px-2 py-2 text-sm text-white text-center"
                  placeholder="Qty"
                />
              )}

              <button
                type="button"
                onClick={addToCart}
                disabled={!canAddToCart}
                className="px-3 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <PlusCircleIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Custom name if no SKU match */}
            {!matchedInventory && sku && (
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Item description"
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            )}

            {/* Stock info for matched item in requisition mode */}
            {matchedInventory && !alertOnly && (() => {
              const rop = matchedInventory.reorderPoint || 0;
              const stockAboveRop = matchedInventory.stock > rop + quantity;
              return (
                <div className="space-y-1">
                  <div className="flex gap-4 text-xs text-gray-400">
                    <span>Stock: <span className="text-white">{matchedInventory.stock.toLocaleString()}</span></span>
                    <span>ROP: <span className="text-white">{rop}</span></span>
                    <span>On Order: <span className="text-white">{matchedInventory.onOrder || 0}</span></span>
                    {matchedInventory.vendorName && (
                      <span>Vendor: <span className="text-white">{matchedInventory.vendorName}</span></span>
                    )}
                  </div>
                  {stockAboveRop && (
                    <p className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                      ⚠ Stock ({matchedInventory.stock}) is above reorder point ({rop}) - may not need to reorder
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Smart Answers Panel - shows in question mode when SKU selected */}
            {alertOnly && matchedInventory && smartAnswers.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-gray-700">
                <p className="text-xs text-gray-400 font-medium">Quick Answers for {matchedInventory.sku}</p>
                {smartAnswers.map((answer, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded-md text-sm ${
                      answer.status === 'good'
                        ? 'bg-emerald-500/10 border border-emerald-500/30'
                        : answer.status === 'warning'
                        ? 'bg-amber-500/10 border border-amber-500/30'
                        : 'bg-gray-700/50 border border-gray-600'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5">
                        {answer.status === 'good' ? (
                          <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                        ) : answer.status === 'warning' ? (
                          <ClockIcon className="w-4 h-4 text-amber-400" />
                        ) : (
                          <PackageIcon className="w-4 h-4 text-gray-400" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400">{answer.question}</p>
                        <p className={`font-medium ${
                          answer.status === 'good'
                            ? 'text-emerald-300'
                            : answer.status === 'warning'
                            ? 'text-amber-300'
                            : 'text-gray-200'
                        }`}>
                          {answer.answer}
                        </p>
                        {answer.details && (
                          <p className="text-xs text-gray-500 mt-0.5">{answer.details}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-500 italic">
                  Still have a question? Add a message below and send to purchasing.
                </p>
              </div>
            )}
          </div>

          {/* Cart Items */}
          {cart.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Cart ({cart.length} item{cart.length !== 1 ? 's' : ''})
                </p>
                {vendorCount > 1 && (
                  <span className="text-xs text-amber-400">
                    {vendorCount} vendors → {vendorCount} POs
                  </span>
                )}
              </div>

              <div className="space-y-1 max-h-48 overflow-y-auto">
                {cart.map(item => {
                  const stockStatus = getStockStatus(item, item.quantity);
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-2 p-2 rounded bg-gray-800 border ${
                        stockStatus.status === 'sufficient'
                          ? 'border-amber-500/50'
                          : stockStatus.status === 'low'
                          ? 'border-emerald-500/50'
                          : 'border-gray-700'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{item.name}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-gray-400">{item.sku}</p>
                          {stockStatus.status === 'sufficient' && (
                            <span className="text-xs text-amber-400">⚠ {stockStatus.message}</span>
                          )}
                          {stockStatus.status === 'low' && (
                            <span className="text-xs text-emerald-400">✓ {stockStatus.message}</span>
                          )}
                        </div>
                      </div>
                      {!alertOnly && (
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateCartItemQuantity(item.id, parseInt(e.target.value, 10) || 1)}
                          className="w-16 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white text-center"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                        className="p-1 text-gray-400 hover:text-rose-400 transition"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty cart message */}
          {cart.length === 0 && (
            <div className="text-center py-6 text-gray-500 text-sm border border-dashed border-gray-700 rounded-lg">
              Add items above to build your request
            </div>
          )}

          {/* Type + Priority Row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">Type</label>
              <div className="flex flex-wrap gap-1">
                {REQUEST_TYPES.map(opt => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => {
                      setRequestType(opt.value);
                      setAlertOnly(opt.value === 'product_alert');
                    }}
                    className={`px-2 py-1 rounded text-xs transition ${
                      requestType === opt.value
                        ? 'bg-gray-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Priority</label>
              <div className="flex gap-1">
                {PRIORITY_OPTIONS.map(opt => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setPriority(opt.value)}
                    className={`px-2 py-1 rounded text-xs font-medium transition ${
                      priority === opt.value ? opt.tone : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Need By Date (only for requisition mode) */}
          {!alertOnly && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Need By</label>
              <input
                type="date"
                value={needByDate}
                onChange={(e) => setNeedByDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
              />
            </div>
          )}

          {/* Message / Context */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Message to Purchasing</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={alertOnly ? "What's the situation?" : "Why do we need these items?"}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gray-500 resize-none"
            />
          </div>

          {/* Options (collapsible) */}
          <details className="group">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
              + Options
            </summary>
            <div className="mt-2 space-y-2 text-sm text-gray-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoPo}
                  onChange={(e) => setAutoPo(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800"
                />
                Auto-generate POs when approved
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={needsOpsApproval}
                  onChange={(e) => setNeedsOpsApproval(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800"
                />
                Requires Ops approval
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={notifyRequester}
                  onChange={(e) => setNotifyRequester(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800"
                />
                Notify me on updates
              </label>
            </div>
          </details>
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800 bg-gray-900">
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
                <ShoppingCartIcon className="w-5 h-5" aria-hidden="true" />
              )
            }
          >
            {actionMode === 'question'
              ? 'Send Alert'
              : `Submit ${cart.length} Item${cart.length !== 1 ? 's' : ''} to Purchasing`
            }
          </Button>
          {cart.length > 0 && vendorCount > 0 && !alertOnly && (
            <p className="text-xs text-gray-500 text-center mt-2">
              Will create {vendorCount} PO{vendorCount !== 1 ? 's' : ''} after approval
            </p>
          )}
        </div>
      </aside>
    </div>
  );
};

export default QuickRequestDrawer;
