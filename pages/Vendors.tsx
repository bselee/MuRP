import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTheme } from '../components/ThemeProvider';
import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import SearchBar from '@/components/ui/SearchBar';
import type { Vendor } from '../types';
import VendorAutomationModal from '../components/VendorAutomationModal';
import VendorManagementModal, { type VendorConfig } from '../components/VendorManagementModal';
import { SearchIcon, AdjustmentsHorizontalIcon, UsersIcon } from '../components/icons';
import VendorConfidenceDashboard from '../components/VendorConfidenceDashboard';
import { supabase } from '../lib/supabase/client';

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
    const [searchTerm, setSearchTerm] = useState('');

    // Track dropship vendor status (local state updated from DB)
    const [dropshipVendors, setDropshipVendors] = useState<Set<string>>(new Set());
    const [togglingDropship, setTogglingDropship] = useState<string | null>(null);

    // Initialize dropship vendors from props
    useEffect(() => {
        const dropshipSet = new Set<string>();
        vendors.forEach(v => {
            if (v.isDropshipVendor) dropshipSet.add(v.id);
        });
        setDropshipVendors(dropshipSet);
    }, [vendors]);

    // Toggle dropship status for a vendor
    const handleToggleDropship = async (vendorId: string, currentlyDropship: boolean) => {
        setTogglingDropship(vendorId);
        try {
            const { error } = await supabase
                .from('vendors')
                .update({ is_dropship_vendor: !currentlyDropship })
                .eq('id', vendorId);

            if (error) throw error;

            // Update local state
            setDropshipVendors(prev => {
                const newSet = new Set(prev);
                if (currentlyDropship) {
                    newSet.delete(vendorId);
                } else {
                    newSet.add(vendorId);
                }
                return newSet;
            });

            addToast?.(`Vendor ${currentlyDropship ? 'removed from' : 'marked as'} dropship`, 'success');
        } catch (err) {
            console.error('Failed to toggle dropship status:', err);
            addToast?.('Failed to update dropship status', 'error');
        } finally {
            setTogglingDropship(null);
        }
    };

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
                    <Button className="bg-accent-500 text-white font-semibold py-2 px-3 rounded-md hover:bg-accent-600 transition-colors text-sm">
                        Add New Vendor
                    </Button>
                }
            />

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
                                <th scope="col" role="columnheader" className="px-6 py-2 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Dropship</th>
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
                                    <td className="px-6 py-1 whitespace-nowrap text-center">
                                        <button
                                            onClick={() => handleToggleDropship(vendor.id, dropshipVendors.has(vendor.id))}
                                            disabled={togglingDropship === vendor.id}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 focus:ring-offset-gray-800 ${
                                                dropshipVendors.has(vendor.id)
                                                    ? 'bg-orange-500'
                                                    : 'bg-gray-600'
                                            } ${togglingDropship === vendor.id ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                                            title={dropshipVendors.has(vendor.id) ? 'Click to remove dropship status' : 'Click to mark as dropship vendor'}
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                    dropshipVendors.has(vendor.id) ? 'translate-x-6' : 'translate-x-1'
                                                }`}
                                            />
                                        </button>
                                        {dropshipVendors.has(vendor.id) && (
                                            <div className="text-xs text-orange-400 mt-1">Dropship</div>
                                        )}
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
