import React, { useState, useEffect, useMemo } from 'react';
import type { Vendor, InventoryItem, PurchaseOrder } from '../types';
import Modal from './Modal';
import { PlusCircleIcon, TrashIcon } from './icons';

interface CreatePoModalProps {
    isOpen: boolean;
    onClose: () => void;
    vendors: Vendor[];
    inventory: InventoryItem[];
    onCreatePo: (poDetails: Omit<PurchaseOrder, 'id' | 'status' | 'createdAt' | 'items'> & { items: { sku: string; name: string; quantity: number }[] }) => void;
}

type PoItem = {
    sku: string;
    name: string;
    quantity: number;
};

const CreatePoModal: React.FC<CreatePoModalProps> = ({ isOpen, onClose, vendors, inventory, onCreatePo }) => {
    const [selectedVendorId, setSelectedVendorId] = useState<string>('');
    const [poItems, setPoItems] = useState<PoItem[]>([]);
    const [expectedDate, setExpectedDate] = useState('');
    const [notes, setNotes] = useState('');
    const [itemToAdd, setItemToAdd] = useState('');

    const vendorInventory = useMemo(() =>
        inventory.filter(item => item.vendorId === selectedVendorId),
    [inventory, selectedVendorId]);
    
    const inventoryMap = useMemo(() => new Map(inventory.map(i => [i.sku, i])), [inventory]);

    useEffect(() => {
        if (selectedVendorId) {
            // Suggest items that are below reorder point
            const suggestedItems = vendorInventory
                .filter(item => item.stock < item.reorderPoint && item.reorderPoint > 0)
                .map(item => ({
                    sku: item.sku,
                    name: item.name,
                    quantity: item.moq || (item.reorderPoint - item.stock) // Suggest ordering up to reorder point or MOQ
                }));
            setPoItems(suggestedItems);

            // Set default expected date based on lead time
            const vendor = vendors.find(v => v.id === selectedVendorId);
            if (vendor?.leadTimeDays) {
                const date = new Date();
                date.setDate(date.getDate() + vendor.leadTimeDays);
                setExpectedDate(date.toISOString().split('T')[0]);
            }

        } else {
            setPoItems([]);
            setExpectedDate('');
        }
        setItemToAdd('');
    }, [selectedVendorId, vendors, vendorInventory]);

    const handleItemQuantityChange = (sku: string, quantity: number) => {
        setPoItems(prev => prev.map(item => item.sku === sku ? { ...item, quantity } : item));
    };

    const handleRemoveItem = (sku: string) => {
        setPoItems(prev => prev.filter(item => item.sku !== sku));
    };

    const handleAddItem = () => {
        if (itemToAdd && !poItems.some(i => i.sku === itemToAdd)) {
            const item = inventoryMap.get(itemToAdd);
            if (item) {
                setPoItems(prev => [...prev, { sku: item.sku, name: item.name, quantity: item.moq || 1 }]);
            }
        }
        setItemToAdd('');
    };

    const handleSubmit = () => {
        if (!selectedVendorId || poItems.length === 0) {
            // Add some user feedback here
            return;
        }
        onCreatePo({
            vendorId: selectedVendorId,
            items: poItems,
            expectedDate,
            notes
        });
        onClose();
    };
    
    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setSelectedVendorId('');
            setPoItems([]);
            setExpectedDate('');
            setNotes('');
            setItemToAdd('');
        }
    }, [isOpen]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Purchase Order">
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="vendor-select" className="block text-sm font-medium text-gray-300">Vendor</label>
                        <select
                            id="vendor-select"
                            value={selectedVendorId}
                            onChange={(e) => setSelectedVendorId(e.target.value)}
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        >
                            <option value="" disabled>Select a vendor</option>
                            {vendors.map(vendor => (
                                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="expected-date" className="block text-sm font-medium text-gray-300">Expected Delivery Date</label>
                        <input
                            type="date"
                            id="expected-date"
                            value={expectedDate}
                            onChange={e => setExpectedDate(e.target.value)}
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                    </div>
                </div>

                <div className="border-t border-gray-700 pt-4">
                    <h3 className="text-lg font-medium text-gray-200 mb-2">Items</h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                        {poItems.map(item => (
                            <div key={item.sku} className="flex items-center gap-4 bg-gray-900/50 p-2 rounded-md">
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-white">{item.name}</p>
                                    <p className="text-xs text-gray-400">{item.sku}</p>
                                </div>
                                <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => handleItemQuantityChange(item.sku, parseInt(e.target.value, 10) || 0)}
                                    className="w-24 bg-gray-700 text-white rounded-md p-1.5 text-sm"
                                    min="1"
                                />
                                <button onClick={() => handleRemoveItem(item.sku)} className="p-1.5 text-red-500 hover:text-red-400">
                                    <TrashIcon className="w-5 h-5"/>
                                </button>
                            </div>
                        ))}
                    </div>
                     {selectedVendorId && (
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-700/50">
                            <select 
                                value={itemToAdd} 
                                onChange={e => setItemToAdd(e.target.value)}
                                className="flex-1 bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            >
                                <option value="">Add another item...</option>
                                {vendorInventory
                                    .filter(vi => !poItems.some(pi => pi.sku === vi.sku))
                                    .map(item => <option key={item.sku} value={item.sku}>{item.name}</option>
                                )}
                            </select>
                            <button onClick={handleAddItem} className="p-2 text-indigo-400 hover:text-indigo-300 disabled:text-gray-600 disabled:cursor-not-allowed" disabled={!itemToAdd}>
                                <PlusCircleIcon className="w-7 h-7" />
                            </button>
                        </div>
                    )}
                </div>

                <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-300">Notes (Optional)</label>
                    <textarea
                        id="notes"
                        rows={3}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="Add any special instructions for this order..."
                    />
                </div>

                <div className="flex justify-end pt-6 border-t border-gray-700">
                    <button onClick={onClose} className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition-colors mr-3">Cancel</button>
                    <button onClick={handleSubmit} disabled={!selectedVendorId || poItems.length === 0} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
                        Create Purchase Order
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default CreatePoModal;