import React, { useState, useMemo } from 'react';
import type { InventoryItem, RequisitionItem, RequisitionRequestOptions, RequisitionRequestType, RequisitionPriority } from '../types';
import Modal from './Modal';
import { PlusCircleIcon, TrashIcon } from './icons';

import Button from '@/components/ui/Button';
interface CreateRequisitionModalProps {
    isOpen: boolean;
    onClose: () => void;
    inventory: InventoryItem[];
    onCreate: (items: RequisitionItem[], options: RequisitionRequestOptions) => void;
    defaultOptions?: RequisitionRequestOptions;
}

type ReqItemDraft = Omit<RequisitionItem, 'name'>;

const CreateRequisitionModal: React.FC<CreateRequisitionModalProps> = ({ isOpen, onClose, inventory, onCreate, defaultOptions }) => {
    const [reqItems, setReqItems] = useState<ReqItemDraft[]>([]);
    const [itemToAdd, setItemToAdd] = useState('');
    const [requestType, setRequestType] = useState<RequisitionRequestType>(defaultOptions?.requestType ?? 'consumable');
    const [priority, setPriority] = useState<RequisitionPriority>(defaultOptions?.priority ?? 'medium');
    const [needByDate, setNeedByDate] = useState(defaultOptions?.needByDate ?? '');
    const [alertOnly, setAlertOnly] = useState(defaultOptions?.alertOnly ?? false);
    const [autoPo, setAutoPo] = useState(defaultOptions?.autoPo ?? false);
    const [notes, setNotes] = useState(defaultOptions?.context ?? '');
    const [notifyRequester, setNotifyRequester] = useState(defaultOptions?.notifyRequester ?? true);

    const inventoryMap = useMemo(() => new Map(inventory.map(i => [i.sku, i])), [inventory]);

    const handleItemChange = (sku: string, field: 'quantity' | 'reason', value: string | number) => {
        setReqItems(prev => prev.map(item => item.sku === sku ? { ...item, [field]: value } : item));
    };
    
    const handleRemoveItem = (sku: string) => {
        setReqItems(prev => prev.filter(item => item.sku !== sku));
    };

    const handleAddItem = () => {
        if (itemToAdd && !reqItems.some(i => i.sku === itemToAdd)) {
            setReqItems(prev => [...prev, { sku: itemToAdd, quantity: 1, reason: '' }]);
        }
        setItemToAdd('');
    };

    const handleSubmit = () => {
        const finalItems: RequisitionItem[] = reqItems
            .filter(item => item.quantity > 0)
            .map(item => ({
                ...item,
                name: inventoryMap.get(item.sku)?.name || 'Unknown Item'
            }));
        
        if (finalItems.length === 0) return;

        onCreate(finalItems, {
            requestType,
            priority,
            needByDate: needByDate || null,
            alertOnly,
            autoPo,
            notifyRequester,
            context: notes,
            notes,
        });
        onClose();
    };

    // Reset state when modal closes
    React.useEffect(() => {
        if (!isOpen) {
            setReqItems([]);
            setItemToAdd('');
            setRequestType(defaultOptions?.requestType ?? 'consumable');
            setPriority(defaultOptions?.priority ?? 'medium');
            setNeedByDate(defaultOptions?.needByDate ?? '');
            setAlertOnly(defaultOptions?.alertOnly ?? false);
            setAutoPo(defaultOptions?.autoPo ?? false);
            setNotes(defaultOptions?.context ?? '');
            setNotifyRequester(defaultOptions?.notifyRequester ?? true);
        }
    }, [isOpen, defaultOptions]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Purchase Requisition">
             <div className="space-y-6">
                <div>
                    <h3 className="text-lg font-medium text-gray-200 mb-2">Requested Items</h3>
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                        {reqItems.length === 0 ? (
                            <p className="text-center text-gray-400 py-8">No items added yet. Use the dropdown below to add items to your request.</p>
                        ) : reqItems.map(item => {
                            const inventoryItem = inventoryMap.get(item.sku);
                            return (
                                <div key={item.sku} className="p-3 bg-gray-900/50 rounded-md">
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-white">{inventoryItem?.name}</p>
                                            <p className="text-xs text-gray-400">{item.sku}</p>
                                        </div>
                                        <input
                                            type="number"
                                            value={item.quantity}
                                            onChange={(e) => handleItemChange(item.sku, 'quantity', parseInt(e.target.value, 10) || 0)}
                                            className="w-24 bg-gray-700 text-white rounded-md p-1.5 text-sm"
                                            min="1"
                                            placeholder="Qty"
                                        />
                                        <Button onClick={() => handleRemoveItem(item.sku)} className="p-1.5 text-red-500 hover:text-red-400">
                                            <TrashIcon className="w-5 h-5"/>
                                        </Button>
                                    </div>
                                    <input
                                        type="text"
                                        value={item.reason}
                                        onChange={(e) => handleItemChange(item.sku, 'reason', e.target.value)}
                                        className="w-full bg-gray-700/80 text-white rounded-md p-1.5 text-sm mt-2"
                                        placeholder="Reason for request (optional)"
                                    />
                                </div>
                            )
                        })}
                    </div>
                </div>
                
                <div className="flex items-center gap-2 pt-4 border-t border-gray-700/50">
                    <select 
                        value={itemToAdd} 
                        onChange={e => setItemToAdd(e.target.value)}
                        className="flex-1 bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                        <option value="">Select an item to add...</option>
                        {inventory
                            .filter(inv => !reqItems.some(ri => ri.sku === inv.sku))
                            .map(item => <option key={item.sku} value={item.sku}>{item.name}</option>
                        )}
                    </select>
                    <Button onClick={handleAddItem} className="p-2 text-indigo-400 hover:text-indigo-300 disabled:text-gray-600 disabled:cursor-not-allowed" disabled={!itemToAdd}>
                        <PlusCircleIcon className="w-7 h-7" />
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-gray-700/50">
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Request Type</label>
                        <select
                            value={requestType}
                            onChange={e => setRequestType(e.target.value as RequisitionRequestType)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-indigo-500"
                        >
                            <option value="consumable">Consumable / Component</option>
                            <option value="product_alert">Product Alert</option>
                            <option value="finished_good">Finished Good</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Priority</label>
                        <select
                            value={priority}
                            onChange={e => setPriority(e.target.value as RequisitionPriority)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-indigo-500"
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Need By</label>
                        <input
                            type="date"
                            value={needByDate}
                            onChange={e => setNeedByDate(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-indigo-500"
                        />
                    </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-gray-700/50">
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Notes / Context</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        className="w-full bg-gray-700/80 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-indigo-500"
                        placeholder="Customer, job, urgency, or anything else we should know…"
                    />
                </div>

                <div className="flex flex-col gap-2 text-sm text-gray-300 pt-2">
                    <label className="inline-flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={alertOnly}
                            onChange={(e) => setAlertOnly(e.target.checked)}
                            className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
                        />
                        Alert only (no PO yet)
                    </label>
                    <label className="inline-flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={autoPo}
                            onChange={(e) => setAutoPo(e.target.checked)}
                            className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
                        />
                        Auto-create PO draft after approval
                    </label>
                    <label className="inline-flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={notifyRequester}
                            onChange={(e) => setNotifyRequester(e.target.checked)}
                            className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
                        />
                        Notify me when someone picks this up
                    </label>
                </div>

                <div className="flex justify-end pt-6 border-t border-gray-700">
                    <Button onClick={onClose} className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition-colors mr-3">Cancel</Button>
                    <Button onClick={handleSubmit} disabled={reqItems.length === 0} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
                        Submit Requisition
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default CreateRequisitionModal;
