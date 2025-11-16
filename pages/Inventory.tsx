import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
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
import {
    normalizeCategory,
    buildVendorNameMap,
    buildVendorDetailMap,
    getVendorDisplayName,
    getVendorRecord as resolveVendorRecord,
    buildBomAssociations,
    getBomDetailsForComponent,
} from '../lib/inventory/utils';

interface InventoryProps {
    inventory: InventoryItem[];
    vendors: Vendor[];
    boms: BillOfMaterials[];
    onNavigateToBom?: (bomSku?: string) => void;
}

type ColumnKey =
    | 'sku'
    | 'name'
    | 'category'
    | 'stock'
    | 'onOrder'
    | 'reorderPoint'
    | 'vendor'
    | 'status'
    | 'itemType'
    | 'runway'
    | 'salesVelocity'
    | 'sales30Days'
    | 'sales60Days'
    | 'sales90Days'
    | 'unitCost';

interface ColumnConfig {
  key: ColumnKey;
  label: string;
  visible: boolean;
  sortable: boolean;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'sku', label: 'SKU', visible: true, sortable: true },
  { key: 'name', label: 'Description', visible: true, sortable: true },
  { key: 'category', label: 'Category', visible: true, sortable: true },
  { key: 'stock', label: 'Stock', visible: true, sortable: true },
  { key: 'onOrder', label: 'On Order', visible: true, sortable: true },
  { key: 'reorderPoint', label: 'Reorder Point', visible: true, sortable: true },
  { key: 'vendor', label: 'Vendor', visible: true, sortable: true },
  { key: 'status', label: 'Status', visible: true, sortable: false },
    { key: 'itemType', label: 'Item Type', visible: true, sortable: false },
    { key: 'runway', label: 'Runway vs Lead', visible: true, sortable: true },
  { key: 'salesVelocity', label: 'Sales Velocity', visible: false, sortable: true },
  { key: 'sales30Days', label: 'Sales (30d)', visible: false, sortable: true },
  { key: 'sales60Days', label: 'Sales (60d)', visible: false, sortable: true },
  { key: 'sales90Days', label: 'Sales (90d)', visible: false, sortable: true },
  { key: 'unitCost', label: 'Unit Cost', visible: false, sortable: true },
];

const COLUMN_WIDTH_CLASSES: Partial<Record<ColumnKey, string>> = {
    sku: 'w-28 max-w-[7rem]',
    name: 'min-w-[14rem] max-w-[22rem]',
    category: 'max-w-[10rem]',
    stock: 'w-28',
    onOrder: 'w-28',
    reorderPoint: 'w-28',
    vendor: 'max-w-[12rem]',
    status: 'w-32',
    itemType: 'w-32',
    runway: 'max-w-[15rem]',
    salesVelocity: 'w-32 max-w-[8rem]',
    sales30Days: 'w-28 max-w-[7rem]',
    sales60Days: 'w-28 max-w-[7rem]',
    sales90Days: 'w-28 max-w-[7rem]',
    unitCost: 'w-24 max-w-[6.5rem]',
};

type SortKeys = keyof InventoryItem | 'status' | 'vendor' | 'runway';

type ItemType = 'retail' | 'component' | 'hybrid' | 'standalone';

interface DemandInsight {
    itemType: ItemType;
    dailyDemand: number;
    runwayDays: number;
    vendorLeadTime: number;
    needsOrder: boolean;
    demandSource: DemandSource;
    demandBreakdown: {
        salesVelocity?: number;
        avg30?: number;
        avg60?: number;
        avg90?: number;
        blendedRecency?: number;
    };
}
type DemandSource = 'salesVelocity' | 'recencyAverage' | 'avg30' | 'avg60' | 'avg90' | 'none';

const MAX_CATEGORY_WORDS = 3;

const formatCategoryLabel = (value?: string | null): string => {
    const normalized = normalizeCategory(value);
    const firstSegment = normalized.split(',')[0]?.trim() || 'Uncategorized';
    const cleaned = firstSegment.replace(/[()\[\]]/g, '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return 'Uncategorized';
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length <= MAX_CATEGORY_WORDS) {
        return cleaned;
    }
    return `${tokens.slice(0, MAX_CATEGORY_WORDS).join(' ')}…`;
};

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
    className?: string;
}> = ({ title, sortKey, sortConfig, requestSort, className }) => {
    const isSorted = sortConfig?.key === sortKey;
    const direction = isSorted ? sortConfig?.direction : undefined;

    return (
        <th className={`px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider ${className || ''}`}>
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
    const [selectedCategories, setSelectedCategories] = useState<Set<string>>(() => {
        const saved = localStorage.getItem('inventory-selected-categories');
        return saved ? new Set(JSON.parse(saved)) : new Set();
    });
    const [selectedVendors, setSelectedVendors] = useState<Set<string>>(() => {
        const saved = localStorage.getItem('inventory-selected-vendors');
        return saved ? new Set(JSON.parse(saved)) : new Set();
    });
    const [bomFilter, setBomFilter] = useState<'all' | 'with-bom' | 'without-bom'>(() => {
        return (localStorage.getItem('inventory-bom-filter') as any) || 'all';
    });
    const [filters, setFilters] = useState({ status: '' });
    const [riskFilter, setRiskFilter] = useState<'all' | 'needs-order'>('all');
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'name', direction: 'ascending' });
    const [suggestions, setSuggestions] = useState<InventoryItem[]>([]);
    const [isSuggestionsVisible, setIsSuggestionsVisible] = useState(false);
    const [isImportExportModalOpen, setIsImportExportModalOpen] = useState(false);
    const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
    const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
    const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);
    const [categorySearchTerm, setCategorySearchTerm] = useState('');
    const [vendorSearchTerm, setVendorSearchTerm] = useState('');
    const [columns, setColumns] = useState<ColumnConfig[]>(() => {
        const saved = localStorage.getItem('inventory-columns');
        if (saved) {
            try {
                const parsed: ColumnConfig[] = JSON.parse(saved);
                const savedKeys = new Set(parsed.map(col => col.key));
                const missing = DEFAULT_COLUMNS.filter(col => !savedKeys.has(col.key));
                return [...parsed, ...missing];
            } catch (error) {
                console.warn('[Inventory] Failed to parse saved columns, using defaults:', error);
            }
        }
        return DEFAULT_COLUMNS;
    });
    
    const categoryDropdownRef = useRef<HTMLDivElement>(null);
    const vendorDropdownRef = useRef<HTMLDivElement>(null);
    const inventoryRowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
    const previousSortConfigRef = useRef<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>(null);


    // Navigation from BOM page - auto-scroll to inventory item
    useEffect(() => {
        const selectedSku = localStorage.getItem('selectedInventorySku');
        if (selectedSku) {
            setTimeout(() => {
                const element = inventoryRowRefs.current.get(selectedSku);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.classList.add('ring-2', 'ring-indigo-500', 'bg-indigo-900/20');
                    setTimeout(() => {
                        element.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-900/20');
                    }, 3000);
                }
            }, 100);
            localStorage.removeItem('selectedInventorySku');
        }
    }, [inventory]);

    // Save preferences to localStorage
    useEffect(() => {
        localStorage.setItem('inventory-columns', JSON.stringify(columns));
    }, [columns]);

    useEffect(() => {
        localStorage.setItem('inventory-selected-categories', JSON.stringify(Array.from(selectedCategories)));
    }, [selectedCategories]);

    useEffect(() => {
        localStorage.setItem('inventory-selected-vendors', JSON.stringify(Array.from(selectedVendors)));
    }, [selectedVendors]);

    useEffect(() => {
        localStorage.setItem('inventory-bom-filter', bomFilter);
    }, [bomFilter]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
                setIsCategoryDropdownOpen(false);
            }
            if (vendorDropdownRef.current && !vendorDropdownRef.current.contains(event.target as Node)) {
                setIsVendorDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Create vendor lookup maps
    const vendorNameMap = useMemo(() => buildVendorNameMap(vendors), [vendors]);

    const vendorDetailMap = useMemo(() => buildVendorDetailMap(vendors), [vendors]);

    const getVendorRecord = useCallback(
        (identifier?: string) => resolveVendorRecord(identifier, vendorDetailMap),
        [vendorDetailMap],
    );

    const getVendorName = useCallback(
        (identifier?: string) => getVendorDisplayName(identifier, vendorNameMap),
        [vendorNameMap],
    );

    // Track BOM usage for components and finished goods metadata
    const { usageMap: bomUsageMap, finishedSkuSet: bomFinishedSkuSet } = useMemo(
        () => buildBomAssociations(boms),
        [boms],
    );

    const demandInsights = useMemo(() => {
        const insights = new Map<string, DemandInsight>();
        const componentSkus = new Set(bomUsageMap.keys());

        inventory.forEach(item => {
            const vendor = getVendorRecord(item.vendorId);
            const leadTimeDays = vendor?.leadTimeDays ?? 7;

            const salesVelocity = item.salesVelocity && item.salesVelocity > 0 ? Number(item.salesVelocity.toFixed(2)) : undefined;
            const avg30 = item.sales30Days && item.sales30Days > 0 ? Number((item.sales30Days / 30).toFixed(2)) : undefined;
            const avg60 = item.sales60Days && item.sales60Days > 0 ? Number((item.sales60Days / 60).toFixed(2)) : undefined;
            const avg90 = item.sales90Days && item.sales90Days > 0 ? Number((item.sales90Days / 90).toFixed(2)) : undefined;

            const recencyWeights: Array<{ value: number; weight: number }> = [];
            if (avg30) recencyWeights.push({ value: avg30, weight: 0.5 });
            if (avg60) recencyWeights.push({ value: avg60, weight: 0.3 });
            if (avg90) recencyWeights.push({ value: avg90, weight: 0.2 });

            const totalWeight = recencyWeights.reduce((sum, entry) => sum + entry.weight, 0);
            const weightedSum = recencyWeights.reduce((sum, entry) => sum + entry.value * entry.weight, 0);
            const blendedRecency = totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(2)) : undefined;

            const demandCandidates: Array<{ value: number; source: DemandSource }> = [];
            if (salesVelocity) demandCandidates.push({ value: salesVelocity, source: 'salesVelocity' });
            if (blendedRecency) demandCandidates.push({ value: blendedRecency, source: 'recencyAverage' });
            if (avg30) demandCandidates.push({ value: avg30, source: 'avg30' });
            if (avg60) demandCandidates.push({ value: avg60, source: 'avg60' });
            if (avg90) demandCandidates.push({ value: avg90, source: 'avg90' });

            let dailyDemand = 0;
            let demandSource: DemandSource = 'none';
            if (demandCandidates.length > 0) {
                const maxCandidate = demandCandidates.reduce((prev, current) =>
                    current.value > prev.value ? current : prev
                );
                dailyDemand = Number(maxCandidate.value.toFixed(2));
                demandSource = maxCandidate.source;
            }

            const runwayDays = dailyDemand > 0 ? item.stock / dailyDemand : Number.POSITIVE_INFINITY;
            const needsOrder = (dailyDemand > 0 && runwayDays < leadTimeDays) || item.stock <= item.reorderPoint;

            const isFinished = bomFinishedSkuSet.has(item.sku);
            const isComponent = componentSkus.has(item.sku);
            let itemType: ItemType = 'standalone';
            if (isFinished && isComponent) itemType = 'hybrid';
            else if (isFinished) itemType = 'retail';
            else if (isComponent) itemType = 'component';

            insights.set(item.sku, {
                itemType,
                dailyDemand,
                runwayDays,
                vendorLeadTime: leadTimeDays,
                needsOrder,
                demandSource,
                demandBreakdown: {
                    salesVelocity,
                    avg30,
                    avg60,
                    avg90,
                    blendedRecency,
                },
            });
        });

        return insights;
    }, [inventory, getVendorRecord, bomUsageMap, bomFinishedSkuSet]);

    const needsOrderCount = useMemo(() => {
        let count = 0;
        demandInsights.forEach(info => {
            if (info.needsOrder) count += 1;
        });
        return count;
    }, [demandInsights]);

    const categoryLabelMap = useMemo(() => {
        const map = new Map<string, string>();
        inventory.forEach(item => {
            const normalized = normalizeCategory(item.category);
            if (!map.has(normalized)) {
                map.set(normalized, formatCategoryLabel(normalized));
            }
        });
        return map;
    }, [inventory]);

    const filterOptions = useMemo(() => {
        const categories = [...new Set(inventory.map(item => normalizeCategory(item.category)))].sort();
        const vendorIds = [...new Set(
            inventory
                .map(item => item.vendorId?.trim())
                .filter(id => id && id !== 'N/A')
        )].sort((a, b) => getVendorName(a).localeCompare(getVendorName(b)));
        const statuses = ['In Stock', 'Low Stock', 'Out of Stock'];
        return { categories, vendors: vendorIds, statuses };
    }, [inventory, getVendorName]);

    // Filter categories based on search term
    const filteredCategories = useMemo(() => {
        if (!categorySearchTerm) return filterOptions.categories;
        const term = categorySearchTerm.toLowerCase();
        return filterOptions.categories.filter(cat => {
            const label = categoryLabelMap.get(cat) || formatCategoryLabel(cat);
            return label.toLowerCase().includes(term) || cat.toLowerCase().includes(term);
        });
    }, [filterOptions.categories, categorySearchTerm, categoryLabelMap]);

    // Filter vendors based on search term
    const filteredVendors = useMemo(() => {
        if (!vendorSearchTerm) return filterOptions.vendors;
        const term = vendorSearchTerm.toLowerCase();
        return filterOptions.vendors.filter(vendorId => {
            const vendorName = getVendorName(vendorId).toLowerCase();
            return vendorName.includes(term) || vendorId.toLowerCase().includes(term);
        });
    }, [filterOptions.vendors, vendorSearchTerm, getVendorName]);

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

    const handleBomClick = (component: InventoryItem) => {
        const componentSku = component.sku;
        const bomDetails = getBomDetailsForComponent(componentSku, bomUsageMap);
        const bomSkus = bomDetails.map(detail => detail.finishedSku);
        if (bomSkus.length === 0) return;
        try {
            localStorage.setItem(
                'bomComponentFilter',
                JSON.stringify({
                    componentSku,
                    componentName: component.name,
                    timestamp: Date.now(),
                })
            );
        } catch (error) {
            console.warn('[Inventory] Failed to persist BOM component filter', error);
        }
        
        if (onNavigateToBom) {
            if (bomSkus.length === 1) {
                onNavigateToBom(bomSkus[0]);
            } else {
                onNavigateToBom(undefined);
            }
        }
    };

    const toggleCategory = (category: string) => {
        const newSet = new Set(selectedCategories);
        if (newSet.has(category)) {
            newSet.delete(category);
        } else {
            newSet.add(category);
        }
        setSelectedCategories(newSet);
    };

    const selectAllCategories = () => {
        setSelectedCategories(new Set(filterOptions.categories));
    };

    const clearAllCategories = () => {
        setSelectedCategories(new Set());
    };

    const toggleVendor = (vendorId: string) => {
        const newSet = new Set(selectedVendors);
        if (newSet.has(vendorId)) {
            newSet.delete(vendorId);
        } else {
            newSet.add(vendorId);
        }
        setSelectedVendors(newSet);
    };

    const selectAllVendors = () => {
        setSelectedVendors(new Set(filterOptions.vendors));
    };

    const clearAllVendors = () => {
        setSelectedVendors(new Set());
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

    const handleNeedsOrderToggle = () => {
        setRiskFilter(prev => {
            if (prev === 'needs-order') {
                const fallback = previousSortConfigRef.current
                    ? { ...previousSortConfigRef.current }
                    : { key: 'name' as SortKeys, direction: 'ascending' as const };
                previousSortConfigRef.current = null;
                setSortConfig(fallback);
                return 'all';
            }
            previousSortConfigRef.current = sortConfig ? { ...sortConfig } : null;
            setSortConfig({ key: 'runway', direction: 'ascending' });
            return 'needs-order';
        });
    };

    const processedInventory = useMemo(() => {
        let filteredItems = [...inventory];

        // Multi-select category filter
        if (selectedCategories.size > 0) {
            filteredItems = filteredItems.filter(item => selectedCategories.has(normalizeCategory(item.category)));
        }

        if (filters.status) {
            filteredItems = filteredItems.filter(item => getStockStatus(item) === filters.status);
        }
        if (riskFilter === 'needs-order') {
            filteredItems = filteredItems.filter(item => demandInsights.get(item.sku)?.needsOrder);
        }
        // Vendor filter
        if (selectedVendors.size > 0) {
            filteredItems = filteredItems.filter(item => selectedVendors.has(item.vendorId));
        }

        // BOM filter
        if (bomFilter !== 'all') {
            filteredItems = filteredItems.filter(item => {
                const isFinishedProduct = bomFinishedSkuSet.has(item.sku);
                return bomFilter === 'with-bom' ? isFinishedProduct : !isFinishedProduct;
            });
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
                    aVal = getVendorName(a.vendorId) || '';
                    bVal = getVendorName(b.vendorId) || '';
                } else if (sortConfig.key === 'runway') {
                    aVal = demandInsights.get(a.sku)?.runwayDays ?? Number.POSITIVE_INFINITY;
                    bVal = demandInsights.get(b.sku)?.runwayDays ?? Number.POSITIVE_INFINITY;
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
    }, [
        inventory,
        selectedCategories,
        selectedVendors,
        bomFilter,
        bomFinishedSkuSet,
        filters,
        searchTerm,
        sortConfig,
        getVendorName,
        demandInsights,
        riskFilter,
        normalizeCategory,
    ]);

    const handleExportCsv = () => {
        exportToCsv(processedInventory, `inventory-export-${new Date().toISOString().split('T')[0]}.csv`);
    };

    const handleExportPdf = () => {
        generateInventoryPdf(processedInventory, vendorNameMap);
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

    const itemTypeStyles: Record<ItemType, { label: string; className: string }> = {
        retail: { label: 'Retail', className: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' },
        component: { label: 'BOM Component', className: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' },
        hybrid: { label: 'Hybrid', className: 'bg-pink-500/20 text-pink-200 border border-pink-500/30' },
        standalone: { label: 'Standalone', className: 'bg-gray-600/40 text-gray-200 border border-gray-500/40' },
    };
    const demandSourceLabels: Record<DemandSource, string> = {
        salesVelocity: 'Sales Velocity',
        recencyAverage: 'Recency Blend',
        avg30: '30d Avg',
        avg60: '60d Avg',
        avg90: '90d Avg',
        none: 'No Trend Data',
    };
    const formatDemandRate = (value?: number) => (value !== undefined ? value.toFixed(1) : '—');

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
                
                <div className="relative z-10 bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 p-4 overflow-visible">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
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
                                    <ul className="absolute z-50 w-full bg-gray-700 border border-gray-600 rounded-md mt-1 max-h-60 overflow-auto shadow-lg">
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
                        <div ref={categoryDropdownRef} className={`relative ${isCategoryDropdownOpen ? 'z-40' : 'z-20'}`}>
                            <label htmlFor="filter-category" className="block text-sm font-medium text-gray-300 mb-1">
                                Categories {selectedCategories.size > 0 && <span className="text-indigo-400">({selectedCategories.size})</span>}
                            </label>
                            <button
                                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                                className={`w-full bg-gray-700 text-white rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500 border-gray-600 text-left flex justify-between items-center relative ${selectedCategories.size > 0 ? 'ring-2 ring-indigo-500/50' : ''}`}
                            >
                                {selectedCategories.size > 0 && (
                                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full"></span>
                                )}
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
                                <div className="absolute z-[100] w-full mt-1 border-2 border-gray-500 rounded-md shadow-2xl max-h-80 overflow-hidden bg-gray-900">
                                    <div className="sticky top-0 p-2 border-b border-gray-600 flex gap-2 bg-gray-900">
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
                                    <div className="sticky top-[52px] p-2 border-b border-gray-600 bg-gray-900">
                                        <input
                                            type="text"
                                            value={categorySearchTerm}
                                            onChange={(e) => setCategorySearchTerm(e.target.value)}
                                            placeholder="Search categories..."
                                            className="w-full bg-gray-800 text-white text-sm rounded px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none border border-gray-600"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                    <div className="max-h-60 overflow-auto">
                                        {filteredCategories.length === 0 ? (
                                            <div className="p-3 text-center text-gray-400 text-sm">No categories found</div>
                                        ) : (
                                            filteredCategories.map(category => {
                                                const label = categoryLabelMap.get(category) || formatCategoryLabel(category);
                                                return (
                                                    <label 
                                                        key={category} 
                                                        className="flex items-center p-2 hover:bg-gray-700 cursor-pointer bg-gray-900"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedCategories.has(category)}
                                                            onChange={() => toggleCategory(category)}
                                                            className="w-4 h-4 mr-2 rounded border-gray-500 text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        <span className="text-sm text-white" title={category}>{label}</span>
                                                    </label>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Multi-select Vendor Filter */}
                        <div ref={vendorDropdownRef} className={`relative ${isVendorDropdownOpen ? 'z-40' : 'z-20'}`}>
                            <label htmlFor="filter-vendor" className="block text-sm font-medium text-gray-300 mb-1">
                                Vendors {selectedVendors.size > 0 && <span className="text-indigo-400">({selectedVendors.size})</span>}
                            </label>
                            <button
                                onClick={() => setIsVendorDropdownOpen(!isVendorDropdownOpen)}
                                className={`w-full bg-gray-700 text-white rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500 border-gray-600 text-left flex justify-between items-center relative ${selectedVendors.size > 0 ? 'ring-2 ring-indigo-500/50' : ''}`}
                            >
                                {selectedVendors.size > 0 && (
                                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full"></span>
                                )}
                                <span className="truncate">
                                    {selectedVendors.size === 0 
                                        ? 'All Vendors' 
                                        : selectedVendors.size === filterOptions.vendors.length
                                        ? 'All Vendors'
                                        : `${selectedVendors.size} selected`}
                                </span>
                                <ChevronDownIcon className="w-4 h-4 ml-2" />
                            </button>
                            {isVendorDropdownOpen && (
                                <div className="absolute z-[100] w-full mt-1 bg-gray-900 border-2 border-gray-500 rounded-md shadow-2xl max-h-80 overflow-hidden">
                                    <div className="sticky top-0 bg-gray-900 p-2 border-b border-gray-600 flex gap-2">
                                        <button
                                            onClick={selectAllVendors}
                                            className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 bg-gray-600 rounded"
                                        >
                                            Select All
                                        </button>
                                        <button
                                            onClick={clearAllVendors}
                                            className="text-xs text-gray-400 hover:text-white px-2 py-1 bg-gray-600 rounded"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    <div className="sticky top-[52px] p-2 border-b border-gray-600 bg-gray-900">
                                        <input
                                            type="text"
                                            value={vendorSearchTerm}
                                            onChange={(e) => setVendorSearchTerm(e.target.value)}
                                            placeholder="Search vendors..."
                                            className="w-full bg-gray-800 text-white text-sm rounded px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none border border-gray-600"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                    <div className="max-h-60 overflow-auto">
                                        {filteredVendors.length === 0 ? (
                                            <div className="p-3 text-center text-gray-400 text-sm">No vendors found</div>
                                        ) : (
                                            filteredVendors.map(vendorId => (
                                                <label 
                                                    key={vendorId} 
                                                    className="flex items-center p-2 hover:bg-gray-700 cursor-pointer bg-gray-900"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedVendors.has(vendorId)}
                                                        onChange={() => toggleVendor(vendorId)}
                                                        className="w-4 h-4 mr-2 rounded border-gray-500 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <span className="text-sm text-white">{getVendorName(vendorId)}</span>
                                                </label>
                                            ))
                                        )}
                                    </div>
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
                        
                        <div className="relative">
                            <label htmlFor="filter-bom" className="block text-sm font-medium text-gray-300 mb-1">BOM Status</label>
                            <select id="filter-bom" value={bomFilter} onChange={(e) => setBomFilter(e.target.value as any)} className={`w-full bg-gray-700 text-white rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500 border-gray-600 ${bomFilter !== 'all' ? 'ring-2 ring-indigo-500/50' : ''}`}>
                                <option value="all">All Items</option>
                                <option value="with-bom">Has Constituents (BOM)</option>
                                <option value="without-bom">No BOM</option>
                            </select>
                            {bomFilter !== 'all' && (
                                <span className="absolute top-6 right-2 w-3 h-3 bg-indigo-500 rounded-full pointer-events-none"></span>
                            )}
                        </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleNeedsOrderToggle}
                            className={`px-4 py-2 text-sm font-semibold rounded-md border transition-colors ${
                                riskFilter === 'needs-order'
                                    ? 'bg-red-500/20 border-red-400/60 text-red-200 shadow-lg shadow-red-900/40'
                                    : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
                            }`}
                        >
                            Needs Order ({needsOrderCount})
                        </button>
                        <span className="text-xs text-gray-400">
                            Flags SKUs when runway &lt; vendor lead time or stock is at/below the reorder point. Daily demand uses the most conservative rate across sales velocity and 30/60/90-day averages.
                        </span>
                    </div>
                    <div className="mt-4 text-sm text-gray-400">
                        Showing <span className="font-semibold text-white">{processedInventory.length}</span> of <span className="font-semibold text-white">{inventory.length}</span> items
                    </div>
                </div>

                <div className="relative z-0 bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full divide-y divide-gray-700 table-auto">
                            <thead className="bg-gray-900/50">
                                <tr>
                                    {visibleColumns.map(col => {
                                        const widthClass = COLUMN_WIDTH_CLASSES[col.key] || '';
                                        if (!col.sortable) {
                                            return (
                                                <th key={col.key} className={`px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider ${widthClass}`}>
                                                    {col.label}
                                                </th>
                                            );
                                        }
                                        const sortKey = col.key === 'vendor' ? 'vendor' : col.key as SortKeys;
                                        return <SortableHeader key={col.key} title={col.label} sortKey={sortKey} sortConfig={sortConfig} requestSort={requestSort} className={widthClass} />;
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {processedInventory.map(item => {
                                    const stockStatus = getStockStatus(item);
                                    const vendor = getVendorName(item.vendorId);
                                    const bomDetails = getBomDetailsForComponent(item.sku, bomUsageMap);
                                    const bomCount = bomDetails.length;
                                    const insight = demandInsights.get(item.sku);

                                    return (
                                        <tr 
                                            key={item.sku} 
                                            ref={(el) => {
                                                if (el) inventoryRowRefs.current.set(item.sku, el);
                                            }}
                                            className="hover:bg-gray-700/50 transition-colors"
                                        >
                                            {visibleColumns.map(col => {
                                                const widthClass = COLUMN_WIDTH_CLASSES[col.key] || '';
                                                switch (col.key) {
                                                    case 'sku':
                                                        return (
                                                            <td key={col.key} className={`px-6 py-3 whitespace-nowrap text-sm font-mono ${widthClass}`}>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-white font-bold">{item.sku}</span>
                                                                    {bomCount > 0 && (
                                                                        <div className="relative group flex-shrink-0">
                                                                            <button
                                                                                onClick={() => handleBomClick(item)}
                                                                                className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full text-xs hover:bg-blue-500/30 transition-colors"
                                                                                title={`Used in ${bomCount} BOM${bomCount > 1 ? 's' : ''}`}
                                                                            >
                                                                                BOM {bomCount > 1 ? `(${bomCount})` : ''}
                                                                            </button>
                                                                            <div className="hidden group-hover:block absolute left-0 top-full mt-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-50 p-3 text-left">
                                                                                <p className="text-xs text-gray-400 mb-1">Used in:</p>
                                                                                <ul className="space-y-1 max-h-48 overflow-auto pr-1">
                                                                                    {bomDetails.map(detail => (
                                                                                        <li key={detail.finishedSku} className="text-xs text-white truncate">
                                                                                            <span className="font-semibold">{detail.finishedName}</span>
                                                                                            <span className="text-gray-400 ml-1">({detail.finishedSku})</span>
                                                                                        </li>
                                                                                    ))}
                                                                                </ul>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        );
                                                    case 'itemType':
                                                        return (
                                                            <td key={col.key} className={`px-4 py-3 whitespace-nowrap text-sm ${widthClass}`}>
                                                                {insight ? (
                                                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${itemTypeStyles[insight.itemType].className}`}>
                                                                        {itemTypeStyles[insight.itemType].label}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-gray-500">—</span>
                                                                )}
                                                            </td>
                                                        );
                                                    case 'name':
                                                        return (
                                                            <td key={col.key} className={`px-4 py-3 text-sm text-white max-w-xs group relative ${widthClass}`}>
                                                                <span className="font-medium truncate block">
                                                                    {item.name}
                                                                </span>
                                                                <div className="hidden group-hover:block absolute left-0 top-full mt-1 bg-gray-800 text-white p-3 rounded-lg shadow-xl z-50 border border-gray-600 max-w-md whitespace-normal">
                                                                    {item.name}
                                                                </div>
                                                            </td>
                                                        );
                                                    case 'category': {
                                                        const normalizedCategory = normalizeCategory(item.category);
                                                        const prettyCategory = categoryLabelMap.get(normalizedCategory) || formatCategoryLabel(normalizedCategory);
                                                        return (
                                                            <td key={col.key} className={`px-4 py-3 whitespace-nowrap text-sm text-gray-300 truncate ${widthClass}`} title={normalizedCategory}>
                                                                {prettyCategory}
                                                            </td>
                                                        );
                                                    }
                                                    case 'stock':
                                                        return (
                                                            <td key={col.key} className={`px-6 py-3 whitespace-nowrap text-sm text-white ${widthClass}`}>
                                                                <div className="mb-1 font-semibold">{item.stock.toLocaleString()}</div>
                                                                <StockIndicator item={item} />
                                                            </td>
                                                        );
                                                    case 'onOrder':
                                                        return <td key={col.key} className={`px-6 py-3 whitespace-nowrap text-sm text-gray-300 ${widthClass}`}>{item.onOrder.toLocaleString()}</td>;
                                                    case 'reorderPoint':
                                                        return <td key={col.key} className={`px-6 py-3 whitespace-nowrap text-sm text-gray-300 ${widthClass}`}>{item.reorderPoint.toLocaleString()}</td>;
                                                    case 'vendor':
                                                        return <td key={col.key} className={`px-6 py-3 whitespace-nowrap text-sm text-gray-300 truncate ${widthClass}`} title={vendor || 'N/A'}>{vendor || 'N/A'}</td>;
                                                    case 'status':
                                                        return (
                                                            <td key={col.key} className={`px-6 py-3 whitespace-nowrap text-sm ${widthClass}`}>
                                                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                                    stockStatus === 'In Stock' ? 'bg-green-500/20 text-green-400' :
                                                                    stockStatus === 'Low Stock' ? 'bg-yellow-500/20 text-yellow-400' :
                                                                    'bg-red-500/20 text-red-400'
                                                                }`}>
                                                                    {stockStatus}
                                                                </span>
                                                            </td>
                                                        );
                                                    case 'runway': {
                                                        const runwayValue = insight && Number.isFinite(insight.runwayDays)
                                                            ? `${Math.max(0, Math.round(insight.runwayDays))}d`
                                                            : 'No demand';
                                                        const leadValue = insight?.vendorLeadTime ?? 0;
                                                        const progressRatio = insight && Number.isFinite(insight.runwayDays) && leadValue > 0
                                                            ? Math.min(100, (insight.runwayDays / leadValue) * 100)
                                                            : 100;
                                                        const breakdown = insight?.demandBreakdown;
                                                        return (
                                                            <td key={col.key} className={`px-6 py-3 whitespace-nowrap text-sm ${widthClass}`}>
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`font-semibold ${insight?.needsOrder ? 'text-red-300' : 'text-emerald-300'}`}>
                                                                        {runwayValue}
                                                                    </span>
                                                                    <span className="text-xs text-gray-400">vs {leadValue || '—'}d lead</span>
                                                                </div>
                                                                {insight && (
                                                                    <div className="text-[11px] text-gray-500 mt-0.5">
                                                                        Source: {demandSourceLabels[insight.demandSource]}
                                                                    </div>
                                                                )}
                                                                <div className="mt-1 w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                                                                    <div
                                                                        className={`${insight?.needsOrder ? 'bg-red-500' : 'bg-emerald-500'} h-full`}
                                                                        style={{ width: `${progressRatio}%` }}
                                                                    ></div>
                                                                </div>
                                                                {insight && insight.dailyDemand > 0 && (
                                                                    <div className="text-xs text-gray-500 mt-1">
                                                                        ≈ {insight.dailyDemand.toFixed(1)} units/day
                                                                    </div>
                                                                )}
                                                                {breakdown && (
                                                                    <div className="text-[11px] text-gray-600 mt-0.5 space-x-2">
                                                                        <span>30d {formatDemandRate(breakdown.avg30)}</span>
                                                                        <span>60d {formatDemandRate(breakdown.avg60)}</span>
                                                                        <span>90d {formatDemandRate(breakdown.avg90)}</span>
                                                                        <span>Vel {formatDemandRate(breakdown.salesVelocity)}</span>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        );
                                                    }
                                                    case 'salesVelocity':
                                                        return <td key={col.key} className={`px-6 py-3 whitespace-nowrap text-sm text-gray-300 text-right ${widthClass}`}>{item.salesVelocity?.toFixed(2) || '0.00'}</td>;
                                                    case 'sales30Days':
                                                        return <td key={col.key} className={`px-6 py-3 whitespace-nowrap text-sm text-gray-300 text-right ${widthClass}`}>{item.sales30Days || 0}</td>;
                                                    case 'sales60Days':
                                                        return <td key={col.key} className={`px-6 py-3 whitespace-nowrap text-sm text-gray-300 text-right ${widthClass}`}>{item.sales60Days || 0}</td>;
                                                    case 'sales90Days':
                                                        return <td key={col.key} className={`px-6 py-3 whitespace-nowrap text-sm text-gray-300 text-right ${widthClass}`}>{item.sales90Days || 0}</td>;
                                                    case 'unitCost':
                                                        return <td key={col.key} className={`px-6 py-3 whitespace-nowrap text-sm text-gray-300 text-right ${widthClass}`}>${item.unitCost?.toFixed(2) || '0.00'}</td>;
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
