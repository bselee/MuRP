import React from 'react';
import type { Vendor } from '../types';

interface VendorsProps {
    vendors: Vendor[];
}

const Vendors: React.FC<VendorsProps> = ({ vendors }) => {
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
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Vendor Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Contact Info</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Address</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Lead Time</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {vendors.map((vendor) => (
                                <tr key={vendor.id} className="hover:bg-gray-700/50 transition-colors duration-200">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-white">{vendor.name}</div>
                                        <a href={vendor.website} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:underline">{vendor.website}</a>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                        {vendor.contactEmails.map(email => (
                                            <a key={email} href={`mailto:${email}`} className="block text-indigo-400 hover:underline">{email}</a>
                                        ))}
                                        <div className="text-gray-400 mt-1">{vendor.phone}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{vendor.address}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{vendor.leadTimeDays} days</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Vendors;