import React, { useState, useMemo } from 'react';
import Button from '@/components/ui/Button';
import type { InventoryItem, BillOfMaterials, Vendor } from '../types';
import { SearchIcon, ChevronUpIcon, ChevronDownIcon, ArrowsUpDownIcon } from '../components/icons';
import ImportExportModal from '../components/ImportExportModal';
import { exportToCsv, exportToJson, exportToXls } from '../services/exportService';
import { generateInventoryPdf } from '../services/pdfService';

interface InventoryProps {
    inventory: InventoryItem[];
    vendors: Vendor[];
    boms: BillOfMaterials[];
    onNavigateToBom?: (bomSku?: string) => void;
}

type SortKeys = keyof InventoryItem | 'status';

const getStockStatus = (item: InventoryItem): 'In Stock' | 'Low Stock' | 'Out of Stock' => {
    if (item.stock <= 0) return 'Out of Stock';
    if (item.stock < item.reorderPoint) return 'Low Stock';
    return 'In Stock';
};

const SortableHeader: React.FC<{
    title: string;
    sortKey: SortKeys;
    sortConfig: { key: SortKeys; direction: 'ascending' | 'descending' } | null;
    requestSort: (key: SortKeys) => void;
}> = ({ title, sortKey, sortConfig, requestSort }) => {
    const isSorted = sortConfig?.key === sortKey;
    const direction = isSorted ? sortConfig?.direction : undefined;

    return (
        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
            <Button className="flex items-center gap-2 group" onClick={() => requestSort(sortKey)}>
                {title}
                <span className={`transition-opacity ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {isSorted ? (
                        direction === 'ascending' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />
                    ) : (
                        <ChevronDownIcon className="w-4 h-4 text-gray-500" />
                    )}
                </span>
            </Button>
        </th>
    );
};


const Inventory: React.FC<InventoryProps> = ({ inventory, vendors, boms, onNavigateToBom }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({ category: '', status: '', vendor: '' });
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'name', direction: 'ascending' });
    const [suggestions, setSuggestions] = useState<InventoryItem[]>([]);
    const [isSuggestionsVisible, setIsSuggestionsVisible] = useState(false);
    const [isImportExportModalOpen, setIsImportExportModalOpen] = useState(false);

    // Debug inventory data
    useMemo(() => {
        console.log('=== INVENTORY PAGE DEBUG ===');
        console.log('[Inventory] Total items:', inventory.length);
        const withStock = inventory.filter(i => i.stock > 0);
        console.log('[Inventory] Items with stock > 0:', withStock.length);
        console.log('[Inventory] Sample items:', inventory.slice(0, 5).map(i => ({ sku: i.sku, stock: i.stock, name: i.name })));
        console.log('===========================');
    }, [inventory]);

    // Create vendor lookup maps
    const vendorMap = useMemo(() => new Map(vendors.map(v => [v.id, v.name])), [vendors]);
    const vendorById = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);

    const bomSkuSet = useMemo(() => {
        const skus = new Set<string>();
        boms.forEach(bom => {
            bom.components.forEach(comp => skus.add(comp.sku));
        });
        return skus;
    }, [boms]);

    const filterOptions = useMemo(() => {
        const categories = [...new Set(inventory.map(item => item.category))].sort();
        const vendorIds = [...new Set(inventory.map(item => item.vendorId).filter(id => id && id !== 'N/A'))];
        const statuses = ['In Stock', 'Low Stock', 'Out of Stock'];
        return { categories, vendors: vendorIds, statuses };
    }, [inventory]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchTerm(value);
        if (value.length > 1) {
            const newSuggestions = inventory.filter(item =>
                item.name.toLowerCase().includes(value.toLowerCase()) ||
                item.sku.toLowerCase().includes(value.toLowerCase())
            ).slice(0, 5);
            setSuggestions(newSuggestions);
            setIsSuggestionsVisible(true);
        } else {
            setSuggestions([]);
            setIsSuggestionsVisible(false);
        }
    };

    const handleSuggestionClick = (item: InventoryItem) => {
        setSearchTerm(item.name);
        setIsSuggestionsVisible(false);
    };

    const handleFilterChange = (filterType: keyof typeof filters, value: string) => {
        setFilters(prev => ({ ...prev, [filterType]: value }));
    };

    const requestSort = (key: SortKeys) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const processedInventory = useMemo(() => {
        let filteredItems = [...inventory];

        if (filters.category) {
            filteredItems = filteredItems.filter(item => item.category === filters.category);
        }
        if (filters.status) {
            filteredItems = filteredItems.filter(item => getStockStatus(item) === filters.status);
        }
        if (filters.vendor) {
            filteredItems = filteredItems.filter(item => item.vendorId === filters.vendor);
        }

        if (searchTerm) {
             filteredItems = filteredItems.filter(item =>
                item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.sku.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        if (sortConfig !== null) {
            filteredItems.sort((a, b) => {
                const aVal = sortConfig.key === 'status' ? getStockStatus(a) : a[sortConfig.key as keyof InventoryItem];
                const bVal = sortConfig.key === 'status' ? getStockStatus(b) : b[sortConfig.key as keyof InventoryItem];

                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return filteredItems;
    }, [inventory, filters, searchTerm, sortConfig]);

    const handleExportCsv = () => {
        exportToCsv(processedInventory, `inventory-export-${new Date().toISOString().split('T')[0]}.csv`);
    };

    const handleExportPdf = () => {
        generateInventoryPdf(processedInventory, vendorMap);
    };

    const handleExportJson = () => {
        exportToJson(processedInventory, `inventory-export-${new Date().toISOString().split('T')[0]}.json`);
    };

    const handleExportXls = () => {
        exportToXls(processedInventory, `inventory-export-${new Date().toISOString().split('T')[0]}.xls`);
    };

    const StockIndicator: React.FC<{ item: InventoryItem }> = ({ item }) => {
        const percentage = Math.max(0, (item.stock / (item.reorderPoint * 1.5)) * 100);
        let bgColor = 'bg-green-500';
        if (item.stock <= 0) bgColor = 'bg-red-500/50';
        else if (item.stock < item.reorderPoint) bgColor = 'bg-red-500';
        else if (item.stock < item.reorderPoint * 1.2) bgColor = 'bg-yellow-500';

        return (
            <div className="w-full bg-gray-600 rounded-full h-2.5">
                <div className={`${bgColor} h-2.5 rounded-full`} style={{ width: `${Math.min(100, percentage)}%` }}></div>
            </div>
        );
    };

    return (
        <>
            <div className="space-y-6">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Inventory</h1>
                        <p className="text-gray-400 mt-1">Search, filter, and manage all your stock items.</p>
                    </div>
                    <div className="flex-shrink-0">
                        <Button
                            onClick={() => setIsImportExportModalOpen(true)}
                            className="flex items-center gap-2 bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
                        >
                            <ArrowsUpDownIcon className="w-5 h-5" />
                            <span>Import / Export</span>
                        </Button>
                    </div>
                </header>
                
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                        <div className="relative lg:col-span-1">
                            <label htmlFor="search-inventory" className="block text-sm font-medium text-gray-300 mb-1">Search by name or SKU</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <SearchIcon className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    id="search-inventory"
                                    type="text"
                                    placeholder="Worm Castings..."
                                    value={searchTerm}
                                    onChange={handleSearchChange}
                                    onBlur={() => setTimeout(() => setIsSuggestionsVisible(false), 200)}
                                    onFocus={handleSearchChange}
                                    autoComplete="off"
                                    className="bg-gray-700 text-white placeholder-gray-400 rounded-md py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                                />
                                {isSuggestionsVisible && suggestions.length > 0 && (
                                    <ul className="absolute z-10 w-full bg-gray-700 border border-gray-600 rounded-md mt-1 max-h-60 overflow-auto shadow-lg">
                                        {suggestions.map(item => (
                                            <li key={item.sku} onMouseDown={() => handleSuggestionClick(item)} className="p-2 text-sm text-white hover:bg-indigo-600 cursor-pointer">
                                                {item.name} <span className="text-gray-400">({item.sku})</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                        <div>
                            <label htmlFor="filter-category" className="block text-sm font-medium text-gray-300 mb-1">Category</label>
                            <select id="filter-category" value={filters.category} onChange={(e) => handleFilterChange('category', e.target.value)} className="w-full bg-gray-700 text-white rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500 border-gray-600">
                                <option value="">All Categories</option>
                                {filterOptions.categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="filter-status" className="block text-sm font-medium text-gray-300 mb-1">Stock Status</label>
                            <select id="filter-status" value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)} className="w-full bg-gray-700 text-white rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500 border-gray-600">
                                <option value="">All Statuses</option>
                                {filterOptions.statuses.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="filter-vendor" className="block text-sm font-medium text-gray-300 mb-1">Vendor</label>
                            <select id="filter-vendor" value={filters.vendor} onChange={(e) => handleFilterChange('vendor', e.target.value)} className="w-full bg-gray-700 text-white rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500 border-gray-600">
                                <option value="">All Vendors</option>
                                {filterOptions.vendors.map(vId => <option key={vId} value={vId}>{vendorMap.get(vId) || vId}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden border border-gray-700">
                    <div className="overflow-x-auto">
                        <table className="table-density min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-800">
                                <tr>
                                    <SortableHeader title="SKU" sortKey="sku" sortConfig={sortConfig} requestSort={requestSort} />
                                    <SortableHeader title="Name" sortKey="name" sortConfig={sortConfig} requestSort={requestSort} />
                                    <SortableHeader title="Category" sortKey="category" sortConfig={sortConfig} requestSort={requestSort} />
                                    <SortableHeader title="Stock" sortKey="stock" sortConfig={sortConfig} requestSort={requestSort} />
                                    <SortableHeader title="On Order" sortKey="onOrder" sortConfig={sortConfig} requestSort={requestSort} />
                                    <SortableHeader title="Reorder Pt" sortKey="reorderPoint" sortConfig={sortConfig} requestSort={requestSort} />
                                    <SortableHeader title="Location" sortKey="warehouseLocation" sortConfig={sortConfig} requestSort={requestSort} />
                                    <SortableHeader title="Unit Cost" sortKey="unitCost" sortConfig={sortConfig} requestSort={requestSort} />
                                    <SortableHeader title="Unit Price" sortKey="unitPrice" sortConfig={sortConfig} requestSort={requestSort} />
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Vendor</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="bg-gray-800 divide-y divide-gray-700">
                                {processedInventory.map((item) => (
                                    <tr key={item.sku} className="hover:bg-gray-700/50 transition-colors duration-200">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <div className="text-sm font-mono font-medium text-white">{item.sku}</div>
                                                <div className="flex gap-1">
                                                    {bomSkuSet.has(item.sku) && (
                                                        <Button
                                                            onClick={() => onNavigateToBom?.(item.sku)}
                                                            className="text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full hover:bg-blue-500/30 hover:border-blue-400/50 transition-colors cursor-pointer"
                                                            title="View BOM"
                                                        >
                                                            BOM
                                                        </Button>
                                                    )}
                                                    {item.dataSource && (
                                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                                            item.dataSource === 'csv' ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
                                                            item.dataSource === 'api' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                                                            'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                                                        }`}>
                                                            {item.dataSource === 'csv' ? 'CSV' : item.dataSource === 'api' ? 'API' : 'Manual'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-medium text-white max-w-xs truncate" title={item.name}>
                                                {item.name}
                                            </div>
                                            {item.description && (
                                                <div className="text-xs text-gray-400 max-w-xs truncate" title={item.description}>
                                                    {item.description}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{item.category}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-white mb-1">{item.stock}</div>
                                            <StockIndicator item={item} />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.onOrder}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{item.reorderPoint}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                            {item.warehouseLocation || '-'}
                                            {item.binLocation && <div className="text-xs text-gray-500">Bin: {item.binLocation}</div>}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">
                                            {item.unitCost ? `$${item.unitCost.toFixed(2)}` : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">
                                            {item.unitPrice ? `$${item.unitPrice.toFixed(2)}` : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {(() => {
                                                const vendor = vendorById.get(item.vendorId);
                                                if (!vendor) {
                                                    return <span className="text-sm text-gray-400">N/A</span>;
                                                }

                                                const primaryEmail = vendor.contactEmails?.[0];

                                                return (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-sm text-gray-300">{vendor.name}</span>
                                                        {primaryEmail && (
                                                            <a
                                                                href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(primaryEmail)}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-xs text-indigo-400 hover:underline hover:text-indigo-300"
                                                                title={`Compose email to ${primaryEmail} in Gmail`}
                                                            >
                                                                {primaryEmail}
                                                            </a>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                                                item.status === 'active' ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
                                                item.status === 'inactive' ? 'bg-gray-500/20 text-gray-300 border border-gray-500/30' :
                                                item.status === 'discontinued' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                                                'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                                            }`}>
                                                {item.status || 'Unknown'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <ImportExportModal
                isOpen={isImportExportModalOpen}
                onClose={() => setIsImportExportModalOpen(false)}
                onExportCsv={handleExportCsv}
                onExportPdf={handleExportPdf}
                onExportJson={handleExportJson}
                onExportXls={handleExportXls}
            />
        </>
    );
};

export default Inventory;
