import React, { useMemo } from 'react';
import type { InternalRequisition, InventoryItem, Vendor } from '../types';
import Modal from './Modal';

interface GeneratePoModalProps {
    isOpen: boolean;
    onClose: () => void;
    approvedRequisitions: InternalRequisition[];
    inventory: InventoryItem[];
    vendors: Vendor[];
    onGenerate: (posToCreate: { vendorId: string; items: { sku: string; name: string; quantity: number }[]; requisitionIds: string[]; }[]) => void;
}

const GeneratePoModal: React.FC<GeneratePoModalProps> = ({ isOpen, onClose, approvedRequisitions, inventory, vendors, onGenerate }) => {
    
    const inventoryMap = useMemo(() => new Map(inventory.map(i => [i.sku, i])), [inventory]);
    const vendorMap = useMemo(() => new Map(vendors.map(v => [v.id, v.name])), [vendors]);

    const posToGenerate = useMemo(() => {
        if (!isOpen) return []; // Don't compute if not open

        const aggregatedItems = new Map<string, { sku: string; name: string; quantity: number; requisitionIds: Set<string> }>();

        approvedRequisitions.forEach(req => {
            req.items.forEach(item => {
                const existing = aggregatedItems.get(item.sku);
                if (existing) {
                    existing.quantity += item.quantity;
                    existing.requisitionIds.add(req.id);
                } else {
                    aggregatedItems.set(item.sku, {
                        sku: item.sku,
                        name: item.name,
                        quantity: item.quantity,
                        requisitionIds: new Set([req.id])
                    });
                }
            });
        });

        const groupedByVendor = new Map<string, {
            vendorId: string;
            items: { sku: string; name: string; quantity: number }[];
            requisitionIds: string[];
        }>();

        for (const item of aggregatedItems.values()) {
            const inventoryItem = inventoryMap.get(item.sku);
            const vendorId = inventoryItem?.vendorId;
            if (vendorId && vendorId !== 'N/A') {
                const existingVendorGroup = groupedByVendor.get(vendorId);
                if (existingVendorGroup) {
                    existingVendorGroup.items.push({ sku: item.sku, name: item.name, quantity: item.quantity });
                    item.requisitionIds.forEach(id => {
                        if (!existingVendorGroup.requisitionIds.includes(id)) {
                             existingVendorGroup.requisitionIds.push(id);
                        }
                    });
                } else {
                    groupedByVendor.set(vendorId, {
                        vendorId,
                        items: [{ sku: item.sku, name: item.name, quantity: item.quantity }],
                        requisitionIds: Array.from(item.requisitionIds)
                    });
                }
            }
        }
        return Array.from(groupedByVendor.values());
    }, [approvedRequisitions, inventoryMap, isOpen]);
    
    const handleGenerate = () => {
        onGenerate(posToGenerate);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Generate Purchase Orders from Requisitions">
            <div className="space-y-6">
                <div>
                    <p className="text-gray-300">This will generate <span className="font-bold text-white">{posToGenerate.length}</span> purchase order(s) based on all approved requisitions. Please review the summary below.</p>
                </div>

                <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                    {posToGenerate.map(poData => (
                        <div key={poData.vendorId} className="bg-gray-900/50 p-4 rounded-lg">
                            <h3 className="font-semibold text-lg text-indigo-300">{vendorMap.get(poData.vendorId) || 'Unknown Vendor'}</h3>
                            <p className="text-xs text-gray-400 mb-2">Sourced from {poData.requisitionIds.length} requisition(s)</p>
                            <ul className="divide-y divide-gray-700/50">
                                {poData.items.map(item => (
                                    <li key={item.sku} className="flex justify-between py-1.5 text-sm">
                                        <span className="text-gray-300">{item.name}</span>
                                        <span className="font-semibold text-white">{item.quantity} units</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                <div className="flex justify-end pt-6 border-t border-gray-700">
                    <button onClick={onClose} className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition-colors mr-3">Cancel</button>
                    <button onClick={handleGenerate} disabled={posToGenerate.length === 0} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
                        Generate {posToGenerate.length} PO(s)
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default GeneratePoModal;