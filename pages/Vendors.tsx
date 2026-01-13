import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTheme } from '../components/ThemeProvider';
import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import SearchBar from '@/components/ui/SearchBar';
import type { Vendor } from '../types';
import VendorAutomationModal from '../components/VendorAutomationModal';
import VendorManagementModal, { type VendorConfig } from '../components/VendorManagementModal';
import { AdjustmentsHorizontalIcon, UsersIcon, PlusCircleIcon } from '../components/icons';
import { UploadCloud } from 'lucide-react';
import VendorConfidenceDashboard from '../components/VendorConfidenceDashboard';
import VendorEmptyState from '../components/VendorEmptyState';
import VendorSetupWizard from '../components/VendorSetupWizard';
import AddVendorModal from '../components/AddVendorModal';

interface VendorsProps {
    vendors: Vendor[];
    addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const Vendors: React.FC<VendorsProps> = ({ vendors, addToast }) => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme !== 'light';
    const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
    const [automationModalOpen, setAutomationModalOpen] = useState(false);
    const [isVendorManagementOpen, setIsVendorManagementOpen] = useState(false);
    const [isSetupWizardOpen, setIsSetupWizardOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Vendor visibility config (same as Inventory page)
    const [vendorConfig, setVendorConfig] = useState<Record<string, VendorConfig>>(() => {
        const saved = localStorage.getItem('vendors-page-vendor-config');
        return saved ? JSON.parse(saved) : {};
    });

    // Save config to localStorage
    useEffect(() => {
        localStorage.setItem('vendors-page-vendor-config', JSON.stringify(vendorConfig));
    }, [vendorConfig]);

    const getVendorConfig = useCallback(
        (vendorName: string): VendorConfig => {
            const existing = vendorConfig[vendorName];
            if (existing) return existing;
            return {
                name: vendorName,
                visible: true,
                excluded: false,
                order: 999,
            };
        },
        [vendorConfig]
    );

    const handleOpenAutomation = (vendor: Vendor) => {
        setSelectedVendor(vendor);
        setAutomationModalOpen(true);
    };

    const handleCloseAutomation = () => {
        setAutomationModalOpen(false);
        setSelectedVendor(null);
    };

    const handleSaveVendorConfig = useCallback((config: Record<string, VendorConfig>) => {
        setVendorConfig(config);
    }, []);

    // Filter vendors based on visibility and search
    const filteredVendors = useMemo(() => {
        let filtered = vendors;

        // Filter by visibility config
        filtered = filtered.filter(vendor => {
            const config = getVendorConfig(vendor.name);
            return config.visible !== false; // Show by default if not configured
        });

        // Filter by search term
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(vendor =>
                vendor.name.toLowerCase().includes(term) ||
                vendor.contactEmails.some(email => email.toLowerCase().includes(term)) ||
                vendor.phone?.toLowerCase().includes(term) ||
                vendor.city?.toLowerCase().includes(term)
            );
        }

        return filtered;
    }, [vendors, vendorConfig, searchTerm, getVendorConfig]);

    // Get all vendor names for management modal
    const allVendorNames = useMemo(() => {
        return vendors.map(v => v.name).sort();
    }, [vendors]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Vendors"
                description="Manage vendor contacts, lead times, and automation settings"
                icon={<UsersIcon className="w-6 h-6" />}
                actions={
                    <div className="flex gap-2">
                        <Button
                            onClick={() => setIsSetupWizardOpen(true)}
                            className="flex items-center gap-2 bg-gray-700 text-white font-semibold py-2 px-3 rounded-md hover:bg-gray-600 transition-colors text-sm"
                        >
                            <UploadCloud className="w-4 h-4" />
                            <span className="hidden sm:inline">Import</span>
                        </Button>
                        <Button
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex items-center gap-2 bg-accent-500 text-white font-semibold py-2 px-3 rounded-md hover:bg-accent-600 transition-colors text-sm"
                        >
                            <PlusCircleIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">Add Vendor</span>
                        </Button>
                    </div>
                }
            />

            {vendors.length === 0 ? (
                <VendorEmptyState
                    onAddManual={() => setIsAddModalOpen(true)}
                    onImport={() => setIsSetupWizardOpen(true)}
                />
            ) : (
                <>
                    <VendorConfidenceDashboard />

                    {/* Filter Bar */}
                    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 p-4">
                        <div className="flex gap-4 items-end">
                            <div className="flex-1">
                                <label htmlFor="search-vendors" className="block text-sm font-medium text-gray-300 mb-1">
                                    Search Vendors
                                </label>
                                <SearchBar
                                    value={searchTerm}
                                    onChange={setSearchTerm}
                                    placeholder="Search by name, email, phone, city..."
                                />
                            </div>
                            <Button
                                onClick={() => setIsVendorManagementOpen(true)}
                                className="flex items-center gap-2 bg-gray-700 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-600 transition-colors"
                                title="Show/hide vendors"
                            >
                                <AdjustmentsHorizontalIcon className="w-5 h-5" />
                                <span className="hidden sm:inline">Manage Vendors</span>
                            </Button>
                        </div>
                        <div className="mt-3 text-sm text-gray-400">
                            Showing <span className="font-semibold text-white">{filteredVendors.length}</span> of <span className="font-semibold text-white">{vendors.length}</span> vendors
                        </div>
                    </div>

                    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden border border-gray-700">
                        <div className="overflow-x-auto">
                            <table className="table-density min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-800">
                                    <tr>
                                        <th scope="col" role="columnheader" className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Vendor Name</th>
                                        <th scope="col" role="columnheader" className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Contact Info</th>
                                        <th scope="col" role="columnheader" className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Address</th>
                                        <th scope="col" role="columnheader" className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Lead Time</th>
                                        <th scope="col" role="columnheader" className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Source</th>
                                        <th scope="col" role="columnheader" className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Auto-PO</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-gray-800 divide-y divide-gray-700">
                                    {filteredVendors.map((vendor) => (
                                        <tr key={vendor.id} className="hover:bg-gray-700/50 transition-colors duration-200">
                                            <td className="px-6 py-1">
                                                <div className="text-sm font-medium text-white">{vendor.name}</div>
                                                {vendor.website && (
                                                    <a href={vendor.website} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-400 hover:underline">{vendor.website}</a>
                                                )}
                                                {vendor.notes && (
                                                    <div className="text-xs text-gray-500 mt-1 max-w-xs truncate" title={vendor.notes}>
                                                        📝 {vendor.notes}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-1 text-sm text-gray-300">
                                                {vendor.contactEmails.length > 0 ? (
                                                    vendor.contactEmails.map(email => (
                                                        <a 
                                                            key={email} 
                                                            href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="block text-accent-400 hover:underline hover:text-accent-300"
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
                                            <td className="px-6 py-1 text-sm text-gray-300">
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
                                            <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-300">
                                                {vendor.leadTimeDays} days
                                            </td>
                                            <td className="px-6 py-1 whitespace-nowrap text-xs">
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
                                            <td className="px-6 py-1 whitespace-nowrap text-sm">
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
                                                    <Button
                                                        onClick={() => handleOpenAutomation(vendor)}
                                                        className="text-accent-400 hover:text-accent-300 transition-colors"
                                                        title="Configure auto-PO settings"
                                                    >
                                                        ⚙️
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {isSetupWizardOpen && (
                <VendorSetupWizard
                    onClose={() => setIsSetupWizardOpen(false)}
                    onComplete={() => {
                        setIsSetupWizardOpen(false);
                        // Refresh happens automatically via parent prop updates usually
                    }}
                    onManualEntry={() => {
                        setIsSetupWizardOpen(false);
                        setIsAddModalOpen(true);
                    }}
                />
            )}

            {isAddModalOpen && (
                <AddVendorModal
                    isOpen={isAddModalOpen}
                    onClose={() => setIsAddModalOpen(false)}
                    onSuccess={() => {
                        // Success toast handled inside or by parent refreshing
                        if (addToast) addToast("Vendor added successfully", "success");
                    }}
                />
            )}


            {/* Automation Modal */}
            <VendorAutomationModal
                isOpen={automationModalOpen}
                onClose={handleCloseAutomation}
                vendor={selectedVendor}
                onSave={handleCloseAutomation}
                addToast={addToast}
            />

            {/* Vendor Management Modal (Show/Hide) */}
            <VendorManagementModal
                isOpen={isVendorManagementOpen}
                onClose={() => setIsVendorManagementOpen(false)}
                vendors={allVendorNames}
                config={vendorConfig}
                onSave={handleSaveVendorConfig}
            />
        </div>
    );
};

export default Vendors;
