import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '../components/ThemeProvider';
import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import Table, { type Column } from '@/components/ui/Table';
import type { InventoryItem, BillOfMaterials, Vendor, QuickRequestDefaults, PurchaseOrder } from '../types';
import { useUserPreferences, type RowDensity, type FontScale } from '../components/UserPreferencesProvider';
import {
    SearchIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    ArrowsUpDownIcon,
    AdjustmentsHorizontalIcon,
    EyeIcon,
    EyeSlashIcon,
    BookmarkIcon,
    BellIcon,
    PlusCircleIcon
} from '../components/icons';
import CollapsibleSection from '../components/CollapsibleSection';
import ImportExportModal from '../components/ImportExportModal';
import CategoryManagementModal, { type CategoryConfig } from '../components/CategoryManagementModal';
import VendorManagementModal, { type VendorConfig } from '../components/VendorManagementModal';
import FilterPresetManager, { type FilterPreset } from '../components/FilterPresetManager';
import { exportToCsv, exportToJson, exportToXls } from '../services/exportService';
import { generateInventoryPdf } from '../services/pdfService';
import LoadingOverlay from '../components/LoadingOverlay';
import {
    normalizeCategory,
    buildVendorNameMap,
    buildVendorDetailMap,
    getVendorDisplayName,
    getVendorRecord as resolveVendorRecord,
    buildBomAssociations,
    getBomDetailsForComponent,
} from '../lib/inventory/utils';
import { computeStockoutRisks, computeVendorPerformance } from '@/lib/inventory/stockIntelligence';
import { useGlobalSkuFilter } from '../hooks/useGlobalSkuFilter';

interface InventoryProps {
    inventory: InventoryItem[];
    vendors: Vendor[];
    boms: BillOfMaterials[];
    onNavigateToBom?: (bomSku?: string) => void;
    onQuickRequest?: (defaults?: QuickRequestDefaults) => void;
    onNavigateToProduct?: (sku: string) => void;
    purchaseOrders?: PurchaseOrder[];
    loading?: boolean;
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
    { key: 'salesVelocity', label: 'Velocity/Day', visible: true, sortable: true },
    { key: 'sales30Days', label: 'Sales (30d)', visible: true, sortable: true },
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

const CELL_DENSITY_MAP: Record<RowDensity, string> = {
    comfortable: 'leading-relaxed',
    compact: 'leading-snug',
    ultra: 'leading-tight',
};

const FONT_SCALE_MAP: Record<FontScale, string> = {
    small: 'text-[11px]',
    medium: 'text-[12px]',
    large: 'text-sm',
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

    // Map direction to ARIA sort value
    const ariaSortValue = isSorted
        ? (direction === 'ascending' ? 'ascending' : 'descending')
        : undefined;

    return (
        <th
            className={`px-4 py-2 text-left text-xs font-medium text-gray-400 ${className || ''}`}
            aria-sort={ariaSortValue}
        >
            <Button
                className="flex items-center gap-2 group"
                onClick={() => requestSort(sortKey)}
                aria-label={`Sort by ${title}${isSorted ? `, currently sorted ${direction}` : ''}`}
            >
                {title}
                <span className={`transition-opacity ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} aria-hidden="true">
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

const Inventory: React.FC<InventoryProps> = ({ inventory, vendors, boms, onNavigateToBom, onQuickRequest, onNavigateToProduct, purchaseOrders = [], loading = false }) => {
    const { rowDensity, fontScale } = useUserPreferences();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme !== 'light';
    const { isExcluded: isSkuExcluded } = useGlobalSkuFilter();
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
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>(null);
    const [showRecentOnly, setShowRecentOnly] = useState(() => {
        const saved = localStorage.getItem('inventory-show-recent-only');
        // Default to FALSE - showing all items is the expected default behavior
        return saved ? JSON.parse(saved) : false;
    });
    const [suggestions, setSuggestions] = useState<InventoryItem[]>([]);
    const [isSuggestionsVisible, setIsSuggestionsVisible] = useState(false);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [isImportExportModalOpen, setIsImportExportModalOpen] = useState(false);
    const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
    const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
    const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);
    const [categorySearchTerm, setCategorySearchTerm] = useState('');
    const [vendorSearchTerm, setVendorSearchTerm] = useState('');

    // Filter preset system state
    const [categoryConfig, setCategoryConfig] = useState<Record<string, CategoryConfig>>(() => {
        const saved = localStorage.getItem('inventory-category-config');
        return saved ? JSON.parse(saved) : {};
    });
    const [vendorConfig, setVendorConfig] = useState<Record<string, VendorConfig>>(() => {
        const saved = localStorage.getItem('inventory-vendor-config');
        return saved ? JSON.parse(saved) : {};
    });
    const [filterPresets, setFilterPresets] = useState<FilterPreset[]>(() => {
        const saved = localStorage.getItem('inventory-filter-presets');
        return saved ? JSON.parse(saved) : [];
    });
    const [activePresetId, setActivePresetId] = useState<string | null>(() => {
        return localStorage.getItem('inventory-active-preset-id');
    });
    const [isCategoryManagementOpen, setIsCategoryManagementOpen] = useState(false);
    const [isVendorManagementOpen, setIsVendorManagementOpen] = useState(false);
    const [isPresetManagerOpen, setIsPresetManagerOpen] = useState(false);
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
    const cellDensityClass = `${CELL_DENSITY_MAP[rowDensity]} ${FONT_SCALE_MAP[fontScale]}`;


    // Navigation from BOM page - auto-scroll to inventory item
    useEffect(() => {
        const selectedSku = localStorage.getItem('selectedInventorySku');
        if (selectedSku) {
            setTimeout(() => {
                const element = inventoryRowRefs.current.get(selectedSku);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.classList.add('ring-2', 'ring-accent-500', 'bg-accent-900/20');
                    setTimeout(() => {
                        element.classList.remove('ring-2', 'ring-accent-500', 'bg-accent-900/20');
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

    // Save filter preset config to localStorage
    useEffect(() => {
        localStorage.setItem('inventory-category-config', JSON.stringify(categoryConfig));
    }, [categoryConfig]);

    useEffect(() => {
        localStorage.setItem('inventory-vendor-config', JSON.stringify(vendorConfig));
    }, [vendorConfig]);

    useEffect(() => {
        localStorage.setItem('inventory-filter-presets', JSON.stringify(filterPresets));
    }, [filterPresets]);

    useEffect(() => {
        if (activePresetId) {
            localStorage.setItem('inventory-active-preset-id', activePresetId);
        } else {
            localStorage.removeItem('inventory-active-preset-id');
        }
    }, [activePresetId]);

    useEffect(() => {
        localStorage.setItem('inventory-show-recent-only', JSON.stringify(showRecentOnly));
    }, [showRecentOnly]);

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

    // Stock Intelligence calculations
    const stockoutRisks = useMemo(() => computeStockoutRisks(inventory), [inventory]);
    const vendorPerformances = useMemo(
        () => computeVendorPerformance(vendors, purchaseOrders || []),
        [vendors, purchaseOrders],
    );

    const getCategoryConfig = useCallback(
        (category: string): CategoryConfig => {
            const existing = categoryConfig[category];
            if (existing) return existing;
            return {
                name: category,
                visible: true,
                excluded: false,
                order: 999,
            };
        },
        [categoryConfig]
    );

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
        const allCategories = [...new Set(inventory.map(item => normalizeCategory(item.category)))].sort();
        const allVendorIds = [...new Set(
            inventory
                .map(item => item.vendorId?.trim())
                .filter(id => id && id !== 'N/A')
        )].sort((a, b) => getVendorName(a).localeCompare(getVendorName(b)));

        const categories = allCategories.filter(category => {
            const config = getCategoryConfig(category);
            return config.visible !== false;
        });

        const vendors = allVendorIds.filter(vendorId => {
            const vendorName = getVendorName(vendorId);
            const config = getVendorConfig(vendorName);
            return config.visible !== false;
        });

        const statuses = ['In Stock', 'Low Stock', 'Out of Stock'];
        return { categories, vendors, statuses };
    }, [inventory, getVendorName, categoryConfig, vendorConfig, getCategoryConfig, getVendorConfig]);

    const filteredCategories = useMemo(() => {
        if (!categorySearchTerm) return filterOptions.categories;
        const term = categorySearchTerm.toLowerCase();
        return filterOptions.categories.filter(category => {
            const label = categoryLabelMap.get(category) || formatCategoryLabel(category);
            return label.toLowerCase().includes(term) || category.toLowerCase().includes(term);
        });
    }, [filterOptions.categories, categorySearchTerm, categoryLabelMap]);

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
            const term = value.toLowerCase();
            const newSuggestions = inventory
                .filter(item => item.name.toLowerCase().includes(term) || item.sku.toLowerCase().includes(term))
                .slice(0, 5);
            setSuggestions(newSuggestions);
            setIsSuggestionsVisible(newSuggestions.length > 0);
        } else {
            setSuggestions([]);
            setIsSuggestionsVisible(false);
        }
    };

    const handleSuggestionClick = (item: InventoryItem) => {
        setSearchTerm(item.name);
        setIsSuggestionsVisible(false);
    };

    const handleBomClick = (item: InventoryItem) => {
        if (onNavigateToBom) {
            onNavigateToBom(item.sku);
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

    // SAFETY: Auto-clear invalid filters when inventory loads
    useEffect(() => {
        if (inventory.length === 0) return;
        
        // Check if selectedCategories would filter out everything
        if (selectedCategories.size > 0) {
            const inventoryCategories = new Set(inventory.map(i => normalizeCategory(i.category)));
            const hasValidCategory = Array.from(selectedCategories).some(cat => inventoryCategories.has(cat));
            if (!hasValidCategory) {
                console.warn('[Inventory] Selected categories do not match any inventory - clearing filter');
                localStorage.removeItem('inventory-selected-categories');
                setSelectedCategories(new Set());
            }
        }
        // Check if selectedVendors would filter out everything
        if (selectedVendors.size > 0) {
            const inventoryVendors = new Set(inventory.map(i => i.vendorId).filter(Boolean));
            const hasValidVendor = Array.from(selectedVendors).some(v => inventoryVendors.has(v));
            if (!hasValidVendor) {
                console.warn('[Inventory] Selected vendors do not match any inventory - clearing filter');
                localStorage.removeItem('inventory-selected-vendors');
                setSelectedVendors(new Set());
            }
        }
    }, [inventory, selectedCategories, selectedVendors]);

    const processedInventory = useMemo(() => {
        let filteredItems = [...inventory];

        // Global SKU exclusion filter (from Settings > Global Data Filters)
        filteredItems = filteredItems.filter(item => !isSkuExcluded(item.sku));

        // Multi-select category filter with exclusion support
        if (selectedCategories.size > 0) {
            const before = filteredItems.length;
            filteredItems = filteredItems.filter(item => {
                const category = normalizeCategory(item.category);
                const config = getCategoryConfig(category);

                // Always show excluded categories
                if (config.excluded) return true;

                // Filter by selected categories
                return selectedCategories.has(category);
            });
        }

        if (filters.status) {
            filteredItems = filteredItems.filter(item => getStockStatus(item) === filters.status);
        }
        if (riskFilter === 'needs-order') {
            filteredItems = filteredItems.filter(item => demandInsights.get(item.sku)?.needsOrder);
        }

        // Vendor filter with exclusion support
        if (selectedVendors.size > 0) {
            filteredItems = filteredItems.filter(item => {
                const vendorName = getVendorName(item.vendorId);
                const config = getVendorConfig(vendorName);

                // Always show excluded vendors
                if (config.excluded) return true;

                // Filter by selected vendors
                return selectedVendors.has(item.vendorId);
            });
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

        // Recent only filter - show items updated in last 7 days
        if (showRecentOnly) {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            filteredItems = filteredItems.filter(item => {
                if (!item.lastSyncAt) return false;
                const updateTime = new Date(item.lastSyncAt);
                return updateTime >= sevenDaysAgo;
            });
        }

        // Sorting logic
        if (sortConfig !== null) {
            // User has explicitly set a sort
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
        } else {
            // Default sort: Recent updates first (most recent at top)
            filteredItems.sort((a, b) => {
                const aTime = a.lastSyncAt || '1970-01-01';
                const bTime = b.lastSyncAt || '1970-01-01';
                return new Date(bTime).getTime() - new Date(aTime).getTime();
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
        showRecentOnly,
        getCategoryConfig,
        getVendorConfig,
        isSkuExcluded,
    ]);

    // Filter preset handlers
    const handleSaveCategoryConfig = useCallback((config: Record<string, CategoryConfig>) => {
        setCategoryConfig(config);
    }, []);

    const handleSaveVendorConfig = useCallback((config: Record<string, VendorConfig>) => {
        setVendorConfig(config);
    }, []);

    const handleSavePreset = useCallback((preset: Omit<FilterPreset, 'id' | 'createdAt'>) => {
        const newPreset: FilterPreset = {
            ...preset,
            id: `preset-${Date.now()}`,
            createdAt: new Date().toISOString(),
        };
        setFilterPresets(prev => [...prev, newPreset]);
    }, []);

    const handleDeletePreset = useCallback((id: string) => {
        setFilterPresets(prev => prev.filter(p => p.id !== id));
        if (activePresetId === id) {
            setActivePresetId(null);
        }
    }, [activePresetId]);

    const handleApplyPreset = useCallback((preset: FilterPreset) => {
        setSelectedCategories(new Set(preset.filters.categories));
        setSelectedVendors(new Set(preset.filters.vendors));
        setBomFilter(preset.filters.bomFilter);
        setRiskFilter(preset.filters.riskFilter);
        setActivePresetId(preset.id);
    }, []);

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

    const visibleColumns = columns.filter(col => col.visible);

    // Table component columns configuration
    const tableColumns: Column<InventoryItem>[] = visibleColumns.map(col => ({
        key: col.key,
        label: col.label,
        sortable: col.sortable,
        visible: col.visible,
        width: COLUMN_WIDTH_CLASSES[col.key],
        render: (item: InventoryItem) => {
            const stockStatus = getStockStatus(item);
            const vendor = getVendorName(item.vendorId);
            const bomDetails = getBomDetailsForComponent(item.sku, bomUsageMap);
            const bomCount = bomDetails.length;
            const insight = demandInsights.get(item.sku);

            switch (col.key) {
                case 'sku':
                    return (
                        <div
                            onClick={() => onNavigateToProduct?.(item.sku)}
                            className={`font-mono font-bold cursor-pointer transition-colors ${isDark 
                                ? 'text-blue-400 hover:text-blue-300' 
                                : 'text-blue-600 hover:text-gray-500'} hover:underline decoration-dotted`}
                            title="Click to view product details"
                        >
                            {item.sku}
                        </div>
                    );
                case 'itemType':
                    return insight ? (
                        <span
                            className="cursor-pointer hover:text-accent-400 text-xs"
                            onClick={() => {/* Add click handler if needed */ }}
                        >
                            {itemTypeStyles[insight.itemType].label}
                        </span>
                    ) : (
                        <span className="text-gray-500">—</span>
                    );
                case 'name':
                    return (
                        <div className="max-w-xs group relative" >
                            <div>
                                <span className={`font-medium truncate block ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    {item.name}
                                </span>
                                {bomCount > 0 && (
                                    <div className="relative inline-block mt-0.5">
                                        <span
                                            onClick={() => handleBomClick(item)}
                                            className={`cursor-pointer text-xs transition-colors ${isDark 
                                                ? 'text-blue-400 hover:text-blue-300' 
                                                : 'text-gray-500 hover:text-gray-500'}`}
                                            title={`Used in ${bomCount} BOM${bomCount > 1 ? 's' : ''}`}
                                        >
                                            BOM ({bomCount})
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className={`hidden group-hover:block absolute left-0 top-full mt-1 ${isDark ? 'bg-gray-800 text-white border-gray-600' : 'bg-white text-gray-900 border-gray-200'} p-3 rounded-lg shadow-xl z-50 border max-w-md whitespace-normal`}>
                                {item.name}
                                {bomCount > 0 && (
                                    <div className={`mt-2 pt-2 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Used in:</p>
                                        <ul className="space-y-1">
                                            {bomDetails.map(detail => (
                                                <li key={detail.finishedSku} className={`text-xs ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                    <span className="font-semibold">{detail.finishedName}</span>
                                                    <span className={isDark ? 'text-gray-400' : 'text-gray-500'} style={{ marginLeft: '4px' }}>({detail.finishedSku})</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div >
                    );
                case 'category': {
                    const normalizedCategory = normalizeCategory(item.category);
                    const prettyCategory = categoryLabelMap.get(normalizedCategory) || formatCategoryLabel(normalizedCategory);
                    return (
                        <span className={`${isDark ? 'text-gray-300' : 'text-gray-700'} truncate`} title={normalizedCategory}>
                            {prettyCategory}
                        </span>
                    );
                }
                case 'stock':
                    return (
                        <span
                            className={`cursor-pointer hover:text-accent-400 font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}
                            onClick={() => {/* Add click handler if needed */ }}
                        >
                            {item.stock.toLocaleString()}
                        </span>
                    );
                case 'onOrder':
                    return <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{item.onOrder.toLocaleString()}</span>;
                case 'reorderPoint':
                    return <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{item.reorderPoint.toLocaleString()}</span>;
                case 'vendor':
                    return <span className={`${isDark ? 'text-gray-300' : 'text-gray-700'} truncate`} title={vendor || 'N/A'}>{vendor || 'N/A'}</span>;
                case 'status':
                    return (
                        <span
                            className={`cursor-pointer hover:text-accent-400 text-xs ${stockStatus === 'In Stock' ? 'text-green-400' :
                                stockStatus === 'Low Stock' ? 'text-yellow-400' :
                                    'text-red-400'
                                }`}
                            onClick={() => {/* Add click handler if needed */ }}
                        >
                            {stockStatus}
                        </span>
                    );
                case 'runway': {
                    const runwayValue = insight && Number.isFinite(insight.runwayDays)
                        ? `${Math.max(0, Math.round(insight.runwayDays))}d`
                        : 'No demand';
                    const leadValue = insight?.vendorLeadTime ?? 0;
                    const breakdown = insight?.demandBreakdown;
                    return (
                        <div className="relative group">
                            <div className="flex items-center gap-2">
                                <span
                                    className={`font-semibold cursor-pointer hover:text-accent-400 ${insight?.needsOrder ? 'text-red-300' : 'text-emerald-300'}`}
                                    onClick={() => {/* Add click handler if needed */ }}
                                >
                                    {runwayValue}
                                </span>
                                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>vs {leadValue || '—'}d lead</span>
                            </div>
                            <div className={`hidden group-hover:block absolute left-0 top-full mt-2 w-80 ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg shadow-2xl z-50 p-4 text-left`}>
                                <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'} mb-3`}>Runway Details</div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Runway:</span>
                                        <span className={`font-semibold ${insight?.needsOrder ? 'text-red-300' : 'text-emerald-300'}`}>
                                            {runwayValue}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Lead Time:</span>
                                        <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{leadValue || '—'} days</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Source:</span>
                                        <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{insight ? demandSourceLabels[insight.demandSource] : 'N/A'}</span>
                                    </div>
                                    {insight && insight.dailyDemand > 0 && (
                                        <div className="flex justify-between items-center">
                                            <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Daily Demand:</span>
                                            <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>≈ {insight.dailyDemand.toFixed(1)} units/day</span>
                                        </div>
                                    )}
                                    {breakdown && (
                                        <div className={`mt-3 pt-3 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                                            <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-2`}>Demand Breakdown:</div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div className="flex justify-between">
                                                    <span className={isDark ? 'text-gray-500' : 'text-gray-500'}>30d avg:</span>
                                                    <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{formatDemandRate(breakdown.avg30)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className={isDark ? 'text-gray-500' : 'text-gray-500'}>60d avg:</span>
                                                    <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{formatDemandRate(breakdown.avg60)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className={isDark ? 'text-gray-500' : 'text-gray-500'}>90d avg:</span>
                                                    <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{formatDemandRate(breakdown.avg90)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className={isDark ? 'text-gray-500' : 'text-gray-500'}>Velocity:</span>
                                                    <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{formatDemandRate(breakdown.salesVelocity)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                }
                case 'salesVelocity':
                    return <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{item.salesVelocity?.toFixed(2) || '0.00'}</span>;
                case 'sales30Days':
                    return <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{item.sales30Days || 0}</span>;
                case 'sales60Days':
                    return <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{item.sales60Days || 0}</span>;
                case 'sales90Days':
                    return <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{item.sales90Days || 0}</span>;
                case 'unitCost':
                    return <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>${item.unitCost?.toFixed(2) || '0.00'}</span>;
                default:
                    return null;
            }
        },
    }));

    // Add Actions column
    tableColumns.push({
        key: 'actions',
        label: 'Actions',
        sortable: false,
        visible: true,
        width: 'w-36',
        align: 'right',
        render: (item: InventoryItem) => (
            <div className="flex justify-end gap-1 text-xs">
                <span
                    className="cursor-pointer hover:text-accent-400 text-gray-300"
                    onClick={() => onQuickRequest?.({ sku: item.sku, requestType: 'product_alert', alertOnly: true })}
                    title="Ask about this product"
                >
                    Ask
                </span>
                <span
                    className="cursor-pointer hover:text-accent-400 text-accent-300"
                    onClick={() => onQuickRequest?.({ sku: item.sku, requestType: 'consumable' })}
                    title="Create requisition"
                >
                    Req
                </span>
                <span
                    className="cursor-pointer hover:text-accent-400 text-blue-300"
                    onClick={() => onQuickRequest?.({ sku: item.sku, requestType: 'product_alert', alertOnly: true, priority: 'high' })}
                    title="High priority alert"
                >
                    Alert
                </span>
            </div>
        ),
    });

    const itemTypeStyles: Record<ItemType, { label: string; className: string }> = {
        retail: { label: 'Retail', className: 'text-accent-300' },
        component: { label: 'Component', className: 'text-blue-300' },
        hybrid: { label: 'Hybrid', className: 'text-pink-200' },
        standalone: { label: 'Standalone', className: 'text-gray-400' },
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
            {loading && <LoadingOverlay />}
            <div className="space-y-6">
                <PageHeader
                    title="Inventory"
                    description="Manage stock levels, track vendors, and monitor demand"
                    icon={<SearchIcon className="w-6 h-6" />}
                    actions={
                        <div className="flex gap-2 flex-shrink-0 flex-wrap">
                            <Button
                                onClick={() => setIsPresetManagerOpen(true)}
                                className={`flex items-center gap-2 font-semibold py-2 px-3 rounded-md transition-colors text-sm ${activePresetId
                                    ? 'bg-accent-500 text-white hover:bg-accent-600'
                                    : 'bg-gray-700 text-white hover:bg-gray-600'
                                    }`}
                                title="Manage filter presets"
                            >
                                <BookmarkIcon className="w-4 h-4" />
                                <span className="hidden sm:inline">
                                    {activePresetId
                                        ? filterPresets.find(p => p.id === activePresetId)?.name || 'Presets'
                                        : 'Filter Presets'}
                                </span>
                            </Button>
                            <Button
                                onClick={() => setIsColumnModalOpen(true)}
                                className="flex items-center gap-2 bg-gray-700 text-white font-semibold py-2 px-3 rounded-md hover:bg-gray-600 transition-colors text-sm"
                                title="Manage columns"
                            >
                                <AdjustmentsHorizontalIcon className="w-4 h-4" />
                                <span className="hidden sm:inline">Columns</span>
                            </Button>
                            <Button
                                onClick={() => setIsImportExportModalOpen(true)}
                                className="flex items-center gap-2 bg-accent-500 text-white font-semibold py-2 px-3 rounded-md hover:bg-accent-600 transition-colors text-sm"
                            >
                                <ArrowsUpDownIcon className="w-4 h-4" />
                                <span className="hidden sm:inline">Import / Export</span>
                            </Button>
                        </div>
                    }
                />

                <div className="space-y-6">
                    <CollapsibleSection
                        title="Search & Filters"
                        icon={<AdjustmentsHorizontalIcon className={`w-6 h-6 ${isDark ? 'text-blue-400' : 'text-gray-500'}`} />}
                        variant="card"
                        isOpen={isFiltersOpen}
                        onToggle={() => setIsFiltersOpen(!isFiltersOpen)}
                    >
                        <div className={`${isDark ? 'bg-gray-800/50' : 'bg-gray-50/80'} backdrop-blur-sm rounded-lg p-6 space-y-6`}>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                                <div className="relative lg:col-span-1">
                                    <label htmlFor="search-inventory" className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>Search by name or SKU</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <SearchIcon className={`h-5 w-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
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
                                            className={`${isDark ? 'bg-gray-700 text-white placeholder-gray-400' : 'bg-white text-gray-900 placeholder-gray-400 border border-gray-300'} rounded-md py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-accent-500 w-full`}
                                        />
                                        {isSuggestionsVisible && suggestions.length > 0 && (
                                            <ul className={`absolute z-50 w-full ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} border rounded-md mt-1 max-h-60 overflow-auto shadow-lg`}>
                                                {suggestions.map(item => (
                                                    <li key={item.sku} onMouseDown={() => handleSuggestionClick(item)} className={`p-2 text-sm ${isDark ? 'text-white hover:bg-accent-500' : 'text-gray-900 hover:bg-gray-100'} cursor-pointer`}>
                                                        {item.name} <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>({item.sku})</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>

                                {/* Multi-select Category Filter */}
                                <div ref={categoryDropdownRef} className={`relative ${isCategoryDropdownOpen ? 'z-40' : 'z-20'}`}>
                                    <label htmlFor="filter-category" className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                                        Categories {selectedCategories.size > 0 && <span className="text-accent-400">({selectedCategories.size})</span>}
                                    </label>
                                    <Button
                                        onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                                        className={`w-full ${isDark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900 border-gray-300'} rounded-md p-2 focus:ring-accent-500 focus:border-accent-500 border text-left flex justify-between items-center relative`}
                                    >
                                        <span className="truncate">
                                            {selectedCategories.size === 0
                                                ? 'All Categories'
                                                : selectedCategories.size === filterOptions.categories.length
                                                    ? 'All Categories'
                                                    : `${selectedCategories.size} selected`}
                                        </span>
                                        <ChevronDownIcon className="w-4 h-4 ml-2" />
                                    </Button>
                                    {isCategoryDropdownOpen && (
                                        <div className={`absolute z-[100] w-full mt-1 border-2 ${isDark ? 'border-gray-500 bg-gray-900' : 'border-gray-300 bg-white'} rounded-md shadow-2xl max-h-80 overflow-hidden`}>
                                            <div className={`sticky top-0 p-2 border-b ${isDark ? 'border-gray-600 bg-gray-900' : 'border-gray-200 bg-gray-50'} flex gap-2`}>
                                                <Button
                                                    onClick={selectAllCategories}
                                                    className={`text-xs text-accent-400 hover:text-accent-300 px-2 py-1 ${isDark ? 'bg-gray-600' : 'bg-gray-100'} rounded`}
                                                >
                                                    Select All
                                                </Button>
                                                <Button
                                                    onClick={clearAllCategories}
                                                    className={`text-xs ${isDark ? 'text-gray-400 hover:text-white bg-gray-600' : 'text-gray-500 hover:text-gray-700 bg-gray-100'} px-2 py-1 rounded`}
                                                >
                                                    Clear
                                                </Button>
                                                <Button
                                                    onClick={() => {
                                                        setIsCategoryDropdownOpen(false);
                                                        setIsCategoryManagementOpen(true);
                                                    }}
                                                    className={`ml-auto text-xs text-yellow-400 hover:text-yellow-300 px-2 py-1 ${isDark ? 'bg-gray-600' : 'bg-gray-100'} rounded flex items-center gap-1`}
                                                >
                                                    <AdjustmentsHorizontalIcon className="w-3 h-3" />
                                                    Manage
                                                </Button>
                                            </div>
                                            <div className={`sticky top-[52px] p-2 border-b ${isDark ? 'border-gray-600 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
                                                <input
                                                    type="text"
                                                    value={categorySearchTerm}
                                                    onChange={(e) => setCategorySearchTerm(e.target.value)}
                                                    placeholder="Search categories..."
                                                    className={`w-full ${isDark ? 'bg-gray-800 text-white border-gray-600' : 'bg-white text-gray-900 border-gray-300'} text-sm rounded px-3 py-1.5 focus:ring-2 focus:ring-accent-500 focus:outline-none border`}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </div>
                                            <div className="max-h-60 overflow-auto">
                                                {filteredCategories.length === 0 ? (
                                                    <div className={`p-3 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'} text-sm`}>No categories found</div>
                                                ) : (
                                                    filteredCategories.map(category => {
                                                        const label = categoryLabelMap.get(category) || formatCategoryLabel(category);
                                                        return (
                                                            <label
                                                                key={category}
                                                                className={`flex items-center p-2 ${isDark ? 'hover:bg-gray-700 bg-gray-900' : 'hover:bg-gray-100 bg-white'} cursor-pointer`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedCategories.has(category)}
                                                                    onChange={() => toggleCategory(category)}
                                                                    className={`w-4 h-4 mr-2 rounded ${isDark ? 'border-gray-500' : 'border-gray-400'} text-accent-500 focus:ring-accent-500`}
                                                                />
                                                                <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`} title={category}>{label}</span>
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
                                    <label htmlFor="filter-vendor" className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                                        Vendors {selectedVendors.size > 0 && <span className="text-accent-400">({selectedVendors.size})</span>}
                                    </label>
                                    <Button
                                        onClick={() => setIsVendorDropdownOpen(!isVendorDropdownOpen)}
                                        className={`w-full ${isDark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900 border-gray-300'} rounded-md p-2 focus:ring-accent-500 focus:border-accent-500 border text-left flex justify-between items-center relative`}
                                    >
                                        <span className="truncate">
                                            {selectedVendors.size === 0
                                                ? 'All Vendors'
                                                : selectedVendors.size === filterOptions.vendors.length
                                                    ? 'All Vendors'
                                                    : `${selectedVendors.size} selected`}
                                        </span>
                                        <ChevronDownIcon className="w-4 h-4 ml-2" />
                                    </Button>
                                    {isVendorDropdownOpen && (
                                        <div className={`absolute z-[100] w-full mt-1 ${isDark ? 'bg-gray-900 border-gray-500' : 'bg-white border-gray-300'} border-2 rounded-md shadow-2xl max-h-80 overflow-hidden`}>
                                            <div className={`sticky top-0 ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-gray-50 border-gray-200'} p-2 border-b flex gap-2`}>
                                                <Button
                                                    onClick={selectAllVendors}
                                                    className={`text-xs text-accent-400 hover:text-accent-300 px-2 py-1 ${isDark ? 'bg-gray-600' : 'bg-gray-100'} rounded`}
                                                >
                                                    Select All
                                                </Button>
                                                <Button
                                                    onClick={clearAllVendors}
                                                    className={`text-xs ${isDark ? 'text-gray-400 hover:text-white bg-gray-600' : 'text-gray-500 hover:text-gray-700 bg-gray-100'} px-2 py-1 rounded`}
                                                >
                                                    Clear
                                                </Button>
                                                <Button
                                                    onClick={() => {
                                                        setIsVendorDropdownOpen(false);
                                                        setIsVendorManagementOpen(true);
                                                    }}
                                                    className={`ml-auto text-xs text-yellow-400 hover:text-yellow-300 px-2 py-1 ${isDark ? 'bg-gray-600' : 'bg-gray-100'} rounded flex items-center gap-1`}
                                                >
                                                    <AdjustmentsHorizontalIcon className="w-3 h-3" />
                                                    Manage
                                                </Button>
                                            </div>
                                            <div className={`sticky top-[52px] p-2 border-b ${isDark ? 'border-gray-600 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
                                                <input
                                                    type="text"
                                                    value={vendorSearchTerm}
                                                    onChange={(e) => setVendorSearchTerm(e.target.value)}
                                                    placeholder="Search vendors..."
                                                    className={`w-full ${isDark ? 'bg-gray-800 text-white border-gray-600' : 'bg-white text-gray-900 border-gray-300'} text-sm rounded px-3 py-1.5 focus:ring-2 focus:ring-accent-500 focus:outline-none border`}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </div>
                                            <div className="max-h-60 overflow-auto">
                                                {filteredVendors.length === 0 ? (
                                                    <div className={`p-3 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'} text-sm`}>No vendors found</div>
                                                ) : (
                                                    filteredVendors.map(vendorId => (
                                                        <label
                                                            key={vendorId}
                                                            className={`flex items-center p-2 ${isDark ? 'hover:bg-gray-700 bg-gray-900' : 'hover:bg-gray-100 bg-white'} cursor-pointer`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedVendors.has(vendorId)}
                                                                onChange={() => toggleVendor(vendorId)}
                                                                className={`w-4 h-4 mr-2 rounded ${isDark ? 'border-gray-500' : 'border-gray-400'} text-accent-500 focus:ring-accent-500`}
                                                            />
                                                            <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{getVendorName(vendorId)}</span>
                                                        </label>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label htmlFor="filter-status" className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>Stock Status</label>
                                    <select id="filter-status" value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)} className={`w-full ${isDark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900 border-gray-300'} rounded-md p-2 focus:ring-accent-500 focus:border-accent-500 border`}>
                                        <option value="">All Statuses</option>
                                        {filterOptions.statuses.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>

                                <div className="relative">
                                    <label htmlFor="filter-bom" className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>BOM Status</label>
                                    <select id="filter-bom" value={bomFilter} onChange={(e) => setBomFilter(e.target.value)} className={`w-full ${isDark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900 border-gray-300'} rounded-md p-2 focus:ring-accent-500 focus:border-accent-500 border`}>
                                        <option value="all">All Items</option>
                                        <option value="with-bom">Has Constituents (BOM)</option>
                                        <option value="without-bom">No BOM</option>
                                    </select>
                                </div>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <Button
                                    onClick={() => setShowRecentOnly(!showRecentOnly)}
                                    className={`px-4 py-2 text-sm font-semibold rounded-md border transition-colors ${showRecentOnly
                                        ? 'bg-blue-500/20 border-blue-400/60 text-blue-200 shadow-lg shadow-blue-900/40'
                                        : isDark ? 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
                                        }`}
                                    title={showRecentOnly ? 'Showing items updated in last 7 days' : 'Showing all items'}
                                >
                                    {showRecentOnly ? '📅 Recent (7 days)' : '📚 All Data'}
                                </Button>
                                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-blue-600'}`}>
                                    {showRecentOnly
                                        ? 'Showing items synced in the last 7 days'
                                        : 'Showing all items regardless of sync date'}
                                </span>
                            </div>
                            {false && <div className="mt-4 flex flex-wrap items-center gap-3">
                                <Button
                                    onClick={handleNeedsOrderToggle}
                                    className={`px-4 py-2 text-sm font-semibold rounded-md border transition-colors ${riskFilter === 'needs-order'
                                        ? 'bg-red-500/20 border-red-400/60 text-red-200 shadow-lg shadow-red-900/40'
                                        : isDark ? 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    Needs Order ({needsOrderCount})
                                </Button>
                                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-blue-600'}`}>
                                    Flags SKUs when runway &lt; vendor lead time or stock is at/below the reorder point. Daily demand uses the most conservative rate across sales velocity and 30/60/90-day averages.
                                </span>
                            </div>}
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-blue-600'}`}>
                                    Showing <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{processedInventory.length}</span> of <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{inventory.length}</span> items
                                </p>
                                {onQuickRequest && (
                                    <Button
                                        onClick={() => onQuickRequest?.()}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-accent-500/80 hover:bg-accent-500 text-white text-sm font-semibold transition-colors"
                                    >
                                        Ask About Product
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CollapsibleSection>
                    {/* Inventory Table */}
                    <div className={`${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200'} backdrop-blur-sm rounded-lg shadow-lg border overflow-hidden`}>
                        <Table
                            columns={tableColumns}
                            data={processedInventory}
                            getRowKey={(item) => item.sku}
                            stickyHeader
                            hoverable
                            compact={rowDensity === 'compact' || rowDensity === 'ultra'}
                            loading={loading}
                            emptyMessage="No inventory items found"
                        />
                    </div>
                </div>
            </div>

            {isColumnModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-xl max-w-md w-full max-h-[80vh] flex flex-col`}>
                        <div className={`p-6 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                            <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Manage Columns</h2>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-blue-600'} mt-1`}>Show/hide and reorder columns</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-2">
                            {columns.map((col, index) => (
                                <div key={col.key} className={`flex items-center gap-3 p-3 ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-lg`}>
                                    <div className="flex flex-col gap-1">
                                        <Button
                                            onClick={() => moveColumn(index, 'up')}
                                            disabled={index === 0}
                                            className={`p-1 ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-200'} rounded disabled:opacity-30 disabled:cursor-not-allowed`}
                                        >
                                            <ChevronUpIcon className={`w-4 h-4 ${isDark ? 'text-gray-300' : 'text-blue-600'}`} />
                                        </Button>
                                        <Button
                                            onClick={() => moveColumn(index, 'down')}
                                            disabled={index === columns.length - 1}
                                            className={`p-1 ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-200'} rounded disabled:opacity-30 disabled:cursor-not-allowed`}
                                        >
                                            <ChevronDownIcon className={`w-4 h-4 ${isDark ? 'text-gray-300' : 'text-blue-600'}`} />
                                        </Button>
                                    </div>
                                    <Button
                                        onClick={() => toggleColumn(col.key)}
                                        className="flex-1 flex items-center gap-3 text-left"
                                    >
                                        {col.visible ? (
                                            <EyeIcon className="w-5 h-5 text-green-400" />
                                        ) : (
                                            <EyeSlashIcon className="w-5 h-5 text-gray-500" />
                                        )}
                                        <span className={`text-sm font-medium ${col.visible ? (isDark ? 'text-white' : 'text-gray-900') : 'text-gray-500'}`}>
                                            {col.label}
                                        </span>
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <div className={`p-6 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                            <Button
                                onClick={() => setIsColumnModalOpen(false)}
                                className="w-full bg-accent-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-accent-600 transition-colors"
                            >
                                Done
                            </Button>
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

            <CategoryManagementModal
                isOpen={isCategoryManagementOpen}
                onClose={() => setIsCategoryManagementOpen(false)}
                categories={[...new Set(inventory.map(item => normalizeCategory(item.category)))].sort()}
                config={categoryConfig}
                onSave={handleSaveCategoryConfig}
            />

            <VendorManagementModal
                isOpen={isVendorManagementOpen}
                onClose={() => setIsVendorManagementOpen(false)}
                vendors={[...new Set(
                    inventory
                        .map(item => getVendorName(item.vendorId))
                        .filter(name => name && name !== 'N/A')
                )].sort()}
                config={vendorConfig}
                onSave={handleSaveVendorConfig}
            />

            <FilterPresetManager
                isOpen={isPresetManagerOpen}
                onClose={() => setIsPresetManagerOpen(false)}
                presets={filterPresets}
                currentFilters={{
                    categories: selectedCategories,
                    vendors: selectedVendors,
                    bomFilter,
                    riskFilter,
                }}
                availableCategories={filterOptions.categories}
                availableVendors={filterOptions.vendors.map(vendorId => ({
                    id: vendorId,
                    name: getVendorName(vendorId)
                }))}
                onSavePreset={handleSavePreset}
                onDeletePreset={handleDeletePreset}
                onApplyPreset={handleApplyPreset}
            />
        </>
    );
};

export default Inventory;
