import React, { useState } from 'react';
import Modal from './Modal';
import Button from '@/components/ui/Button';
import { upsertVendors } from '../hooks/useSupabaseMutations';
import { Vendor } from '../types';

interface AddVendorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const AddVendorModal: React.FC<AddVendorModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        website: '',
        city: '',
        state: '',
        leadTimeDays: 7,
        autoPoEnabled: false
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const newVendor: Vendor = {
                id: crypto.randomUUID(),
                name: formData.name,
                contactEmails: formData.email ? [formData.email] : [],
                phone: formData.phone,
                address: formData.address,
                city: formData.city,
                state: formData.state,
                website: formData.website,
                leadTimeDays: Number(formData.leadTimeDays),
                autoPoEnabled: Boolean(formData.autoPoEnabled),
                dataSource: 'manual',
                lastSyncAt: new Date().toISOString()
            } as any; // Cast to any to avoid partial match issues if schema evolves

            const { success, error: apiError } = await upsertVendors([newVendor]);

            if (success) {
                onSuccess();
                onClose();
            } else {
                setError(apiError || 'Failed to create vendor');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add New Vendor">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-md text-sm">
                        {error}
                    </div>
                )}
                
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Vendor Name *</label>
                    <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 text-white focus:ring-2 focus:ring-accent-500"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Contact Email</label>
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 text-white focus:ring-2 focus:ring-accent-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Phone</label>
                        <input
                            type="tel"
                            name="phone"
                            value={formData.phone}
                            onChange={handleChange}
                            className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 text-white focus:ring-2 focus:ring-accent-500"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Address</label>
                    <input
                        type="text"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 text-white focus:ring-2 focus:ring-accent-500"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">City</label>
                        <input
                            type="text"
                            name="city"
                            value={formData.city}
                            onChange={handleChange}
                            className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 text-white focus:ring-2 focus:ring-accent-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">State</label>
                        <input
                            type="text"
                            name="state"
                            value={formData.state}
                            onChange={handleChange}
                            className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 text-white focus:ring-2 focus:ring-accent-500"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Lead Time (Days)</label>
                        <input
                            type="number"
                            name="leadTimeDays"
                            value={formData.leadTimeDays}
                            onChange={handleChange}
                            min="0"
                            className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 text-white focus:ring-2 focus:ring-accent-500"
                        />
                    </div>
                    <div className="flex items-center pt-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                name="autoPoEnabled"
                                checked={formData.autoPoEnabled}
                                onChange={handleChange}
                                className="rounded bg-gray-800 border-gray-700 text-accent-500 focus:ring-accent-500"
                            />
                            <span className="text-sm font-medium text-gray-300">Enable Auto-PO</span>
                        </label>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
                    <Button variant="primary" type="submit" loading={loading} className="bg-accent-500 hover:bg-accent-600 text-white">
                        Create Vendor
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default AddVendorModal;
