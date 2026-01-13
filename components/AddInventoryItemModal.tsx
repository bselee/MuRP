import React, { useState } from 'react';
import Modal from './Modal';
import Button from '@/components/ui/Button';
import { createInventoryItem } from '../hooks/useSupabaseMutations';
import { Vendor } from '../types';

interface AddInventoryItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    vendors: Vendor[];
    categories: string[];
}

const AddInventoryItemModal: React.FC<AddInventoryItemModalProps> = ({ isOpen, onClose, onSuccess, vendors, categories }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        sku: '',
        name: '',
        category: '',
        stock: 0,
        reorderPoint: 0,
        vendorId: '',
        unitCost: 0,
        unitPrice: 0,
        description: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'stock' || name === 'reorderPoint' || name === 'unitCost' || name === 'unitPrice' 
                ? parseFloat(value) || 0 
                : value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (!formData.sku || !formData.name) {
            setError('SKU and Name are required');
            setLoading(false);
            return;
        }

        try {
            const result = await createInventoryItem({
                sku: formData.sku,
                name: formData.name,
                category: formData.category,
                stock: formData.stock,
                reorderPoint: formData.reorderPoint,
                vendorId: formData.vendorId || undefined,
                unitCost: formData.unitCost,
                unitPrice: formData.unitPrice,
                description: formData.description,
                status: 'active',
            });

            if (result.success) {
                onSuccess();
                onClose();
                // Reset form
                setFormData({
                    sku: '',
                    name: '',
                    category: '',
                    stock: 0,
                    reorderPoint: 0,
                    vendorId: '',
                    unitCost: 0,
                    unitPrice: 0,
                    description: '',
                });
            } else {
                setError(result.error || 'Failed to create item');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Inventory Item" maxWidth="2xl">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-md text-sm">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">SKU *</label>
                        <input
                            type="text"
                            name="sku"
                            value={formData.sku}
                            onChange={handleChange}
                            className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-white focus:ring-accent-500 focus:border-accent-500"
                            placeholder="e.g. WORM-001"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Name *</label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-white focus:ring-accent-500 focus:border-accent-500"
                            placeholder="e.g. Worm Castings 1lb"
                            required
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                    <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-white focus:ring-accent-500 focus:border-accent-500 h-20"
                        placeholder="Product description..."
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
                        <input
                            list="categories-list"
                            name="category"
                            value={formData.category}
                            onChange={handleChange}
                            className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-white focus:ring-accent-500 focus:border-accent-500"
                            placeholder="Select or type..."
                        />
                        <datalist id="categories-list">
                            {categories.map(cat => (
                                <option key={cat} value={cat} />
                            ))}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Vendor</label>
                        <select
                            name="vendorId"
                            value={formData.vendorId}
                            onChange={handleChange}
                            className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-white focus:ring-accent-500 focus:border-accent-500"
                        >
                            <option value="">Select Vendor...</option>
                            {vendors.map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Stock</label>
                        <input
                            type="number"
                            name="stock"
                            value={formData.stock}
                            onChange={handleChange}
                            className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-white focus:ring-accent-500 focus:border-accent-500"
                            min="0"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Reorder Point</label>
                        <input
                            type="number"
                            name="reorderPoint"
                            value={formData.reorderPoint}
                            onChange={handleChange}
                            className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-white focus:ring-accent-500 focus:border-accent-500"
                            min="0"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Unit Cost ($)</label>
                        <input
                            type="number"
                            name="unitCost"
                            value={formData.unitCost}
                            onChange={handleChange}
                            className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-white focus:ring-accent-500 focus:border-accent-500"
                            min="0"
                            step="0.01"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Unit Price ($)</label>
                        <input
                            type="number"
                            name="unitPrice"
                            value={formData.unitPrice}
                            onChange={handleChange}
                            className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-white focus:ring-accent-500 focus:border-accent-500"
                            min="0"
                            step="0.01"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-700 mt-4">
                    <Button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-300 hover:text-white"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={loading}
                        className="bg-accent-500 hover:bg-accent-600 text-white px-6 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Creating...' : 'Create Item'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default AddInventoryItemModal;
