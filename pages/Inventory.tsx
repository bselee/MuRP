import React, { useState, useMemo } from 'react';
import type { InventoryItem, BillOfMaterials } from '../types';
import { SearchIcon } from '../components/icons';

interface InventoryProps {
    inventory: InventoryItem[];
    vendorMap: Map<string, string>;
    boms: BillOfMaterials[];
}

const Inventory: React.FC<InventoryProps> = ({ inventory, vendorMap, boms }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const bomSkuSet = useMemo(() => {
        const skus = new Set<string>();
        boms.forEach(bom => {
            bom.components.forEach(comp => skus.add(comp.sku));
        });
        return skus;
    }, [boms]);
    
    const filteredInventory = useMemo(() =>
        inventory.filter(item =>
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.sku.toLowerCase().includes(searchTerm.toLowerCase())
        ),
        [inventory, searchTerm]
    );

    const StockIndicator: React.FC<{ item: InventoryItem }> = ({ item }) => {
        const percentage = Math.max(0, (item.stock / (item.reorderPoint * 1.5)) * 100);
        let bgColor = 'bg-green-500';
        if (item.stock < item.reorderPoint) bgColor = 'bg-red-500';
        else if (item.stock < item.reorderPoint * 1.2) bgColor = 'bg-yellow-500';

        return (
            <div className="w-full bg-gray-600 rounded-full h-2.5">
                <div className={bgColor + " h-2.5 rounded-full"} style={{ width: `${percentage > 100 ? 100 : percentage}%` }}></div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-3xl font-bold text-white tracking-tight">Inventory</h1>
                <p className="text-gray-400 mt-1">Search, filter, and manage all your stock items.</p>
            </header>
            
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 p-4">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                     <div className="relative w-full sm:max-w-xs">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search by name or SKU..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-gray-700 text-white placeholder-gray-400 rounded-md py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                        />
                    </div>
                    <button className="w-full sm:w-auto bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors">
                        Add New Item
                    </button>
                </div>
            </div>

            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden border border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-800">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Item</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Category</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Stock Level</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">On Order</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Reorder Point</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">MOQ</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Vendor</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {filteredInventory.map((item) => (
                                <tr key={item.sku} className="hover:bg-gray-700/50 transition-colors duration-200">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div>
                                                <div className="text-sm font-medium text-white">{item.name}</div>
                                                <div className="text-xs text-gray-400">{item.sku}</div>
                                            </div>
                                            {bomSkuSet.has(item.sku) && (
                                                <span className="ml-2 text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">BOM</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{item.category}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-white mb-1">{item.stock}</div>
                                        <StockIndicator item={item} />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.onOrder}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{item.reorderPoint}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{item.moq || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{vendorMap.get(item.vendorId) || 'N/A'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Inventory;