import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { InventoryItem, BillOfMaterials, Vendor } from '../types';
import { 
  SearchIcon, 
  ChevronUpIcon, 
  ChevronDownIcon, 
  ArrowsUpDownIcon,
  AdjustmentsHorizontalIcon,
  EyeIcon,
  EyeSlashIcon
} from '../components/icons';
import ImportExportModal from '../components/ImportExportModal';
import { exportToCsv, exportToJson, exportToXls } from '../services/exportService';
import { generateInventoryPdf } from '../services/pdfService';

interface InventoryProps {
    inventory: InventoryItem[];
    vendors: Vendor[];
    boms: BillOfMaterials[];
    onNavigateToBom?: (bomSku: string) => void;
}

type ColumnKey = 'sku' | 'name' | 'category' | 'stock' | 'onOrder' | 'reorderPoint' | 'vendor' | 'status' | 'salesVelocity' | 'sales30Days' | 'sales60Days' | 'sales90Days' | 'unitCost';

interface ColumnConfig {
  key: ColumnKey;
  label: string;
  visible: boolean;
  sortable: boolean;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'sku', label: 'SKU', visible: true, sortable: true },
  { key: 'name', label: 'Name', visible: true, sortable: true },
  { key: 'category', label: 'Category', visible: true, sortable: true },
  { key: 'stock', label: 'Stock', visible: true, sortable: true },
  { key: 'onOrder', label: 'On Order', visible: true, sortable: true },
  { key: 'reorderPoint', label: 'Reorder Point', visible: true, sortable: true },
  { key: 'vendor', label: 'Vendor', visible: true, sortable: true },
  { key: 'status', label: 'Status', visible: true, sortable: false },
  { key: 'salesVelocity', label: 'Sales Velocity', visible: false, sortable: true },
  { key: 'sales30Days', label: 'Sales (30d)', visible: false, sortable: true },
  { key: 'sales60Days', label: 'Sales (60d)', visible: false, sortable: true },
  { key: 'sales90Days', label: 'Sales (90d)', visible: false, sortable: true },
  { key: 'unitCost', label: 'Unit Cost', visible: false, sortable: true },
];

type SortKeys = keyof InventoryItem | 'status' | 'vendor';

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
            <button className="flex items-center gap-2 group" onClick={() => requestSort(sortKey)}>
                {title}
                <span className={`transition-opacity ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {isSorted ? (
                        direction === 'ascending' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />
                    ) : (
                        <ChevronDownIcon className="w-4 h-4 text-gray-500" />
                    )}
                </span>
            </button>
        </th>
    );
};

const Inventory: React.FC<InventoryProps> = ({ inventory, vendors, boms, onNavigateToBom }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
    const [filters, setFilters] = useState({ status: '', vendor: '' });
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'name', direction: 'ascending' });
    const [suggestions, setSuggestions] = useState<InventoryItem[]>([]);
    const [isSuggestionsVisible, setIsSuggestionsVisible] = useState(false);
    const [isImportExportModalOpen, setIsImportExportModalOpen] = useState(false);
    const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
    const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
    const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
    
    const categoryDropdownRef = useRef<HTMLDivElement>(null);

    // Close category dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
                setIsCategoryDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Create vendor lookup maps
    const vendorMap = useMemo(() => new Map(vendors.map(v => [v.id, v.name])), [vendors]);

    // Track which BOMs use each component SKU and count how many
    const bomUsageMap = useMemo(() => {
        const usageMap = new Map<string, string[]>();
        boms.forEach(bom => {
            bom.components.forEach(comp => {
                if (!usageMap.has(comp.sku)) {
                    usageMap.set(comp.sku, []);
                }
                usageMap.get(comp.sku)!.push(bom.sku);
            });
        });
        return usageMap;
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

    const handleBomClick = (componentSku: string) => {
        const bomSkus = bomUsageMap.get(componentSku);
        if (!bomSkus || bomSkus.length === 0) return;
        
        // If only one BOM uses this component, navigate directly
        if (bomSkus.length === 1 && onNavigateToBom) {
            onNavigateToBom(bomSkus[0]);
        } else if (bomSkus.length > 1 && onNavigateToBom) {
            // For now, navigate to the first BOM
            // TODO: Could show a modal to select which BOM to view
            onNavigateToBom(bomSkus[0]);
        }
    };

    const toggleCategory = (category: string) => {
        const newSelected = new Set(selectedCategories);
        if (newSelected.has(category)) {
            newSelected.delete(category);
        } else {
            newSelected.add(category);
        }
        setSelectedCategories(newSelected);
    };

    const selectAllCategories = () => {
        setSelectedCategories(new Set(filterOptions.categories));
    };

    const clearAllCategories = () => {
        setSelectedCategories(new Set());
    };

    const handleFilterChange = (filterType: keyof typeof filters, value: string) => {
        setFilters(prev => ({ ...prev, [filterType]: value }));
    };

    const toggleColumn = (key: ColumnKey) => {
        setColumns(prev => prev.map(col => 
            col.key === key ? { ...col, visible: !col.visible } : col
        ));
    };

    const moveColumn = (index: number, direction: 'up' | 'down') => {
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === columns.length - 1)) return;
        
        const newColumns = [...columns];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        [newColumns[index], newColumns[targetIndex]] = [newColumns[targetIndex], newColumns[index]];
        setColumns(newColumns);
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

        // Multi-select category filter
        if (selectedCategories.size > 0) {
            filteredItems = filteredItems.filter(item => selectedCategories.has(item.category));
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
                let aVal: any;
                let bVal: any;

                if (sortConfig.key === 'status') {
                    aVal = getStockStatus(a);
                    bVal = getStockStatus(b);
                } else if (sortConfig.key === 'vendor') {
                    aVal = vendorMap.get(a.vendorId) || '';
                    bVal = vendorMap.get(b.vendorId) || '';
                } else {
                    aVal = a[sortConfig.key as keyof InventoryItem] ?? '';
                    bVal = b[sortConfig.key as keyof InventoryItem] ?? '';
                }

                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return filteredItems;
    }, [inventory, selectedCategories, filters, searchTerm, sortConfig, vendorMap]);

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

    const visibleColumns = columns.filter(col => col.visible);

    return (
        <>
            <div className="space-y-6">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Inventory</h1>
                        <p className="text-gray-400 mt-1">Search, filter, and manage all your stock items.</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                        <button
                            onClick={() => setIsColumnModalOpen(true)}
                            className="flex items-center gap-2 bg-gray-700 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-600 transition-colors"
                            title="Manage columns"
                        >
                            <AdjustmentsHorizontalIcon className="w-5 h-5" />
                            <span className="hidden sm:inline">Columns</span>
                        </button>
                        <button
                            onClick={() => setIsImportExportModalOpen(true)}
                            className="flex items-center gap-2 bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
                        >
                            <ArrowsUpDownIcon className="w-5 h-5" />
                            <span className="hidden sm:inline">Import / Export</span>
                        </button>
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
                        
                        {/* Multi-select Category Filter */}
                        <div ref={categoryDropdownRef} className="relative">
                            <label htmlFor="filter-category" className="block text-sm font-medium text-gray-300 mb-1">
                                Categories {selectedCategories.size > 0 && <span className="text-indigo-400">({selectedCategories.size})</span>}
                            </label>
                            <button
                                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                                className="w-full bg-gray-700 text-white rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500 border-gray-600 text-left flex justify-between items-center"
                            >
                                <span className="truncate">
                                    {selectedCategories.size === 0 
                                        ? 'All Categories' 
                                        : selectedCategories.size === filterOptions.categories.length
                                        ? 'All Categories'
                                        : `${selectedCategories.size} selected`}
                                </span>
                                <ChevronDownIcon className="w-4 h-4 ml-2" />
                            </button>
                            {isCategoryDropdownOpen && (
                                <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-md shadow-lg max-h-80 overflow-auto">
                                    <div className="sticky top-0 bg-gray-700 p-2 border-b border-gray-600 flex gap-2">
                                        <button
                                            onClick={selectAllCategories}
                                            className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 bg-gray-600 rounded"
                                        >
                                            Select All
                                        </button>
                                        <button
                                            onClick={clearAllCategories}
                                            className="text-xs text-gray-400 hover:text-white px-2 py-1 bg-gray-600 rounded"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    {filterOptions.categories.map(category => (
                                        <label 
                                            key={category} 
                                            className="flex items-center p-2 hover:bg-gray-600 cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedCategories.has(category)}
                                                onChange={() => toggleCategory(category)}
                                                className="w-4 h-4 mr-2 rounded border-gray-500 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-sm text-white">{category}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
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
                    <div className="mt-4 text-sm text-gray-400">
                        Showing <span className="font-semibold text-white">{processedInventory.length}</span> of <span className="font-semibold text-white">{inventory.length}</span> items
                    </div>
                </div>

                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-900/50">
                                <tr>
                                    {visibleColumns.map(col => {
                                        if (!col.sortable) {
                                            return (
                                                <th key={col.key} className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                                    {col.label}
                                                </th>
                                            );
                                        }
                                        const sortKey = col.key === 'vendor' ? 'vendor' : col.key as SortKeys;
                                        return <SortableHeader key={col.key} title={col.label} sortKey={sortKey} sortConfig={sortConfig} requestSort={requestSort} />;
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {processedInventory.map(item => {
                                    const stockStatus = getStockStatus(item);
                                    const vendor = vendorMap.get(item.vendorId);
                                    const bomSkus = bomUsageMap.get(item.sku);
                                    const bomCount = bomSkus ? bomSkus.length : 0;

                                    return (
                                        <tr key={item.sku} className="hover:bg-gray-700/50 transition-colors">
                                            {visibleColumns.map(col => {
                                                switch (col.key) {
                                                    case 'sku':
                                                        return <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm font-mono text-indigo-400">{item.sku}</td>;
                                                    case 'name':
                                                        return (
                                                            <td key={col.key} className="px-6 py-4 text-sm text-white">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-medium">{item.name}</span>
                                                                    {bomCount > 0 && (
                                                                        <button
                                                                            onClick={() => handleBomClick(item.sku)}
                                                                            className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full text-xs hover:bg-blue-500/30 transition-colors"
                                                                            title={`Used in ${bomCount} BOM${bomCount > 1 ? 's' : ''}`}
                                                                        >
                                                                            BOM {bomCount > 1 ? `(${bomCount})` : ''}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        );
                                                    case 'category':
                                                        return <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.category}</td>;
                                                    case 'stock':
                                                        return (
                                                            <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-white">
                                                                <div className="mb-1 font-semibold">{item.stock.toLocaleString()}</div>
                                                                <StockIndicator item={item} />
                                                            </td>
                                                        );
                                                    case 'onOrder':
                                                        return <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.onOrder.toLocaleString()}</td>;
                                                    case 'reorderPoint':
                                                        return <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.reorderPoint.toLocaleString()}</td>;
                                                    case 'vendor':
                                                        return <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{vendor || 'N/A'}</td>;
                                                    case 'status':
                                                        return (
                                                            <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm">
                                                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                                    stockStatus === 'In Stock' ? 'bg-green-500/20 text-green-400' :
                                                                    stockStatus === 'Low Stock' ? 'bg-yellow-500/20 text-yellow-400' :
                                                                    'bg-red-500/20 text-red-400'
                                                                }`}>
                                                                    {stockStatus}
                                                                </span>
                                                            </td>
                                                        );
                                                    case 'salesVelocity':
                                                        return <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.salesVelocity?.toFixed(2) || '0.00'}</td>;
                                                    case 'sales30Days':
                                                        return <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.sales30Days || 0}</td>;
                                                    case 'sales60Days':
                                                        return <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.sales60Days || 0}</td>;
                                                    case 'sales90Days':
                                                        return <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.sales90Days || 0}</td>;
                                                    case 'unitCost':
                                                        return <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${item.unitCost?.toFixed(2) || '0.00'}</td>;
                                                    default:
                                                        return null;
                                                }
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Column Management Modal */}
            {isColumnModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[80vh] flex flex-col">
                        <div className="p-6 border-b border-gray-700">
                            <h2 className="text-xl font-bold text-white">Manage Columns</h2>
                            <p className="text-sm text-gray-400 mt-1">Show/hide and reorder columns</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-2">
                            {columns.map((col, index) => (
                                <div key={col.key} className="flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg">
                                    <div className="flex flex-col gap-1">
                                        <button
                                            onClick={() => moveColumn(index, 'up')}
                                            disabled={index === 0}
                                            className="p-1 hover:bg-gray-600 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <ChevronUpIcon className="w-4 h-4 text-gray-300" />
                                        </button>
                                        <button
                                            onClick={() => moveColumn(index, 'down')}
                                            disabled={index === columns.length - 1}
                                            className="p-1 hover:bg-gray-600 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <ChevronDownIcon className="w-4 h-4 text-gray-300" />
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => toggleColumn(col.key)}
                                        className="flex-1 flex items-center gap-3 text-left"
                                    >
                                        {col.visible ? (
                                            <EyeIcon className="w-5 h-5 text-green-400" />
                                        ) : (
                                            <EyeSlashIcon className="w-5 h-5 text-gray-500" />
                                        )}
                                        <span className={`text-sm font-medium ${col.visible ? 'text-white' : 'text-gray-500'}`}>
                                            {col.label}
                                        </span>
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="p-6 border-t border-gray-700">
                            <button
                                onClick={() => setIsColumnModalOpen(false)}
                                className="w-full bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
