/**
 * Vendors Management Panel for Settings
 * Admin-only interface for managing vendor data with export capabilities
 */

import React, { useState, useMemo } from 'react';
import Button from '@/components/ui/Button';
import type { Vendor } from '../types';
import { SearchIcon, CloudDownloadIcon, TableCellsIcon } from './icons';

interface VendorsManagementPanelProps {
  vendors: Vendor[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const VendorsManagementPanel: React.FC<VendorsManagementPanelProps> = ({ vendors, addToast }) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter vendors by search term
  const filteredVendors = useMemo(() => {
    if (!searchTerm) return vendors;
    const term = searchTerm.toLowerCase();
    return vendors.filter(vendor =>
      vendor.name.toLowerCase().includes(term) ||
      vendor.contactEmails.some(email => email.toLowerCase().includes(term)) ||
      vendor.phone?.toLowerCase().includes(term) ||
      vendor.city?.toLowerCase().includes(term)
    );
  }, [vendors, searchTerm]);

  // Calculate vendor metrics (default 5/10 for all)
  const vendorMetrics = useMemo(() => {
    const active = vendors.filter(v => v.contactEmails.length > 0).length;
    const needsInfo = vendors.filter(v => v.contactEmails.length === 0 || !v.addressLine1).length;
    const avgScore = 5.0; // Default seed value as requested
    return { total: vendors.length, active, needsInfo, avgScore };
  }, [vendors]);

  // Export to CSV
  const handleExportCSV = () => {
    try {
      const headers = ['Name', 'Email(s)', 'Phone', 'Address', 'City', 'State', 'Postal Code', 'Country', 'Website', 'Lead Time (days)', 'Notes'];
      const rows = filteredVendors.map(vendor => [
        vendor.name,
        vendor.contactEmails.join('; '),
        vendor.phone || '',
        vendor.addressLine1 || vendor.address || '',
        vendor.city || '',
        vendor.state || '',
        vendor.postalCode || '',
        vendor.country || '',
        vendor.website || '',
        vendor.leadTimeDays?.toString() || '',
        vendor.notes || ''
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `vendors_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();

      addToast('Vendors exported to CSV successfully', 'success');
    } catch (error) {
      console.error('[VendorsManagementPanel] CSV export failed:', error);
      addToast('Failed to export vendors to CSV', 'error');
    }
  };

  // Export to Google Sheets (opens in new tab with CSV data)
  const handleExportGoogleSheets = () => {
    try {
      const headers = ['Name', 'Email(s)', 'Phone', 'Address', 'City', 'State', 'Postal Code', 'Country', 'Website', 'Lead Time (days)', 'Notes'];
      const rows = filteredVendors.map(vendor => [
        vendor.name,
        vendor.contactEmails.join('; '),
        vendor.phone || '',
        vendor.addressLine1 || vendor.address || '',
        vendor.city || '',
        vendor.state || '',
        vendor.postalCode || '',
        vendor.country || '',
        vendor.website || '',
        vendor.leadTimeDays?.toString() || '',
        vendor.notes || ''
      ]);

      const tsvContent = [
        headers.join('\t'),
        ...rows.map(row => row.join('\t'))
      ].join('\n');

      // Copy to clipboard and open Google Sheets
      navigator.clipboard.writeText(tsvContent).then(() => {
        window.open('https://docs.google.com/spreadsheets/create', '_blank');
        addToast('Vendor data copied to clipboard - paste into Google Sheets', 'info');
      }).catch(() => {
        addToast('Failed to copy data to clipboard', 'error');
      });
    } catch (error) {
      console.error('[VendorsManagementPanel] Google Sheets export failed:', error);
      addToast('Failed to export to Google Sheets', 'error');
    }
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold text-white">Vendor Management</h3>
          <p className="text-sm text-gray-400 mt-1">
            Manage vendor contacts, addresses, and export data for admin use
          </p>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4">
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Total Vendors</div>
          <div className="text-2xl font-bold text-white">{vendorMetrics.total}</div>
        </div>
        <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4">
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Active</div>
          <div className="text-2xl font-bold text-emerald-400">{vendorMetrics.active}</div>
          <div className="text-xs text-gray-500 mt-1">With contact info</div>
        </div>
        <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4">
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Needs Info</div>
          <div className="text-2xl font-bold text-amber-400">{vendorMetrics.needsInfo}</div>
          <div className="text-xs text-gray-500 mt-1">Missing details</div>
        </div>
        <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4">
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Avg Score</div>
          <div className="text-2xl font-bold text-accent-400">{vendorMetrics.avgScore.toFixed(1)}/10</div>
          <div className="text-xs text-gray-500 mt-1">Default seed value</div>
        </div>
      </div>

      {/* Search and Export */}
      <div className="flex flex-col lg:flex-row gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <SearchIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search vendors by name, email, phone, city..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-gray-700 text-white placeholder-gray-400 rounded-md py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-accent-500 w-full"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-md transition-colors"
          >
            <CloudDownloadIcon className="w-5 h-5" />
            Export CSV
          </Button>
          <Button
            onClick={handleExportGoogleSheets}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors"
          >
            <TableCellsIcon className="w-5 h-5" />
            Google Sheets
          </Button>
        </div>
      </div>

      {/* Results count */}
      <div className="mb-4 text-sm text-gray-400">
        Showing <span className="font-semibold text-white">{filteredVendors.length}</span> of <span className="font-semibold text-white">{vendors.length}</span> vendors
      </div>

      {/* Vendors Table */}
      <div className="bg-gray-900/40 border border-gray-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Address</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Lead Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    {searchTerm ? 'No vendors found matching your search' : 'No vendors available'}
                  </td>
                </tr>
              ) : (
                filteredVendors.map((vendor) => (
                  <tr key={vendor.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-white">{vendor.name}</div>
                      {vendor.website && (
                        <a href={vendor.website} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-400 hover:underline">
                          {vendor.website}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {vendor.contactEmails.length > 0 ? (
                        <div className="space-y-1">
                          {vendor.contactEmails.map(email => (
                            <a
                              key={email}
                              href={`mailto:${email}`}
                              className="block text-accent-400 hover:underline text-xs"
                            >
                              {email}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-500 italic text-xs">No email</span>
                      )}
                      {vendor.phone && (
                        <div className="text-gray-400 text-xs mt-1">📞 {vendor.phone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {vendor.addressLine1 || vendor.city ? (
                        <div className="text-xs">
                          {vendor.addressLine1 && <div>{vendor.addressLine1}</div>}
                          {(vendor.city || vendor.state) && (
                            <div className="text-gray-400">
                              {vendor.city}{vendor.city && vendor.state ? ', ' : ''}{vendor.state} {vendor.postalCode}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500 italic text-xs">No address</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {vendor.leadTimeDays ? `${vendor.leadTimeDays} days` : <span className="text-gray-500 italic text-xs">Not set</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-accent-400">5.0/10</div>
                        <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-accent-500" style={{ width: '50%' }} />
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Default</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer note */}
      <div className="mt-4 text-xs text-gray-500">
        <p>💡 Vendor data is automatically available for Purchase Order creation and email communications.</p>
        <p className="mt-1">📊 Confidence scores are seeded with default value of 5/10 for all vendors.</p>
      </div>
    </div>
  );
};

export default VendorsManagementPanel;
