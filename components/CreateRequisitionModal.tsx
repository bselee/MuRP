import React, { useState, useMemo } from 'react';
import type { InventoryItem, RequisitionItem } from '../types';
import Modal from './Modal';
import { PlusCircleIcon, TrashIcon } from './icons';

interface CreateRequisitionModalProps {
    isOpen: boolean;
    onClose: () => void;
    inventory: InventoryItem[];
    onCreate: (items: RequisitionItem[]) => void;
}

type ReqItemDraft = Omit<RequisitionItem, 'name'>;

const CreateRequisitionModal: React.FC<CreateRequisitionModalProps> = ({ isOpen, onClose, inventory, onCreate }) => {
    const [reqItems, setReqItems] = useState<ReqItemDraft[]>([]);
    const [itemToAdd, setItemToAdd] = useState('');

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

        onCreate(finalItems);
        onClose();
    };

    // Reset state when modal closes
    React.useEffect(() => {
        if (!isOpen) {
            setReqItems([]);
            setItemToAdd('');
        }
    }, [isOpen]);

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
                                        <button onClick={() => handleRemoveItem(item.sku)} className="p-1.5 text-red-500 hover:text-red-400">
                                            <TrashIcon className="w-5 h-5"/>
                                        </button>
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
                    <button onClick={handleAddItem} className="p-2 text-indigo-400 hover:text-indigo-300 disabled:text-gray-600 disabled:cursor-not-allowed" disabled={!itemToAdd}>
                        <PlusCircleIcon className="w-7 h-7" />
                    </button>
                </div>

                <div className="flex justify-end pt-6 border-t border-gray-700">
                    <button onClick={onClose} className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition-colors mr-3">Cancel</button>
                    <button onClick={handleSubmit} disabled={reqItems.length === 0} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
                        Submit Requisition
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default CreateRequisitionModal;