import React, { useState } from 'react';
import type { Vendor } from '../types';
import VendorAutomationModal from '../components/VendorAutomationModal';

interface VendorsProps {
    vendors: Vendor[];
    addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const Vendors: React.FC<VendorsProps> = ({ vendors, addToast }) => {
    const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
    const [automationModalOpen, setAutomationModalOpen] = useState(false);

    const handleOpenAutomation = (vendor: Vendor) => {
        setSelectedVendor(vendor);
        setAutomationModalOpen(true);
    };

    const handleCloseAutomation = () => {
        setAutomationModalOpen(false);
        setSelectedVendor(null);
    };

    return (
        <div className="space-y-6">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Vendors</h1>
                    <p className="text-gray-400 mt-1">Manage your supplier information.</p>
                </div>
                <button className="w-full sm:w-auto bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors">
                    Add New Vendor
                </button>
            </header>

            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden border border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-800">
                            <tr>
                                <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Vendor Name</th>
                                <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Contact Info</th>
                                <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Address</th>
                                <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Lead Time</th>
                                <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Source</th>
                                <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Auto-PO</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {vendors.map((vendor) => (
                                <tr key={vendor.id} className="hover:bg-gray-700/50 transition-colors duration-200">
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-medium text-white">{vendor.name}</div>
                                        {vendor.website && (
                                            <a href={vendor.website} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:underline">{vendor.website}</a>
                                        )}
                                        {vendor.notes && (
                                            <div className="text-xs text-gray-500 mt-1 max-w-xs truncate" title={vendor.notes}>
                                                📝 {vendor.notes}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-300">
                                        {vendor.contactEmails.length > 0 ? (
                                            vendor.contactEmails.map(email => (
                                                <a 
                                                    key={email} 
                                                    href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="block text-indigo-400 hover:underline hover:text-indigo-300"
                                                    title={`Compose email to ${email} in Gmail`}
                                                >
                                                    {email}
                                                </a>
                                            ))
                                        ) : (
                                            <span className="text-gray-500 italic">No email</span>
                                        )}
                                        {vendor.phone && (
                                            <div className="text-gray-400 mt-1">📞 {vendor.phone}</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-300">
                                        {vendor.addressLine1 || vendor.city ? (
                                            <div className="space-y-1">
                                                {vendor.addressLine1 && <div>{vendor.addressLine1}</div>}
                                                {vendor.addressLine2 && <div>{vendor.addressLine2}</div>}
                                                {(vendor.city || vendor.state || vendor.postalCode) && (
                                                    <div className="text-gray-400">
                                                        {vendor.city}{vendor.city && (vendor.state || vendor.postalCode) ? ', ' : ''}
                                                        {vendor.state} {vendor.postalCode}
                                                    </div>
                                                )}
                                                {vendor.country && <div className="text-gray-500 text-xs">{vendor.country}</div>}
                                            </div>
                                        ) : vendor.address ? (
                                            <div className="text-gray-400">{vendor.address}</div>
                                        ) : (
                                            <span className="text-gray-500 italic">No address</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                        {vendor.leadTimeDays} days
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs">
                                        {vendor.dataSource === 'csv' && (
                                            <span className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded-full">CSV</span>
                                        )}
                                        {vendor.dataSource === 'api' && (
                                            <span className="px-2 py-1 bg-green-900/50 text-green-300 rounded-full">API</span>
                                        )}
                                        {vendor.dataSource === 'manual' && (
                                            <span className="px-2 py-1 bg-gray-700 text-gray-400 rounded-full">Manual</span>
                                        )}
                                        {vendor.lastSyncAt && (
                                            <div className="text-gray-500 mt-1">
                                                {new Date(vendor.lastSyncAt).toLocaleDateString()}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <div className="flex items-center gap-2">
                                            {vendor.autoPoEnabled ? (
                                                <span className="px-2 py-1 bg-green-900/50 text-green-300 rounded-full text-xs font-medium border border-green-700">
                                                    ✓ {vendor.autoPoThreshold || 'critical'}
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 bg-gray-700 text-gray-400 rounded-full text-xs">
                                                    Off
                                                </span>
                                            )}
                                            <button
                                                onClick={() => handleOpenAutomation(vendor)}
                                                className="text-indigo-400 hover:text-indigo-300 transition-colors"
                                                title="Configure auto-PO settings"
                                            >
                                                ⚙️
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Automation Modal */}
            <VendorAutomationModal
                isOpen={automationModalOpen}
                onClose={handleCloseAutomation}
                vendor={selectedVendor}
                onSave={handleCloseAutomation}
                addToast={addToast}
            />
        </div>
    );
};

export default Vendors;