import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import type { InventoryItem, BillOfMaterials, Vendor, QuickRequestDefaults } from '../types';
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
  PlusCircleIcon,
  ChartBarIcon,
  AlertCircleIcon,
  TrendingUpIcon,
  CalendarIcon,
  DollarSignIcon,
  UsersIcon
} from '../components/icons';
import ImportExportModal from '../components/ImportExportModal';
import CategoryManagementModal, { type CategoryConfig } from '../components/CategoryManagementModal';
import VendorManagementModal, { type VendorConfig } from '../components/VendorManagementModal';
import FilterPresetManager, { type FilterPreset } from '../components/FilterPresetManager';
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
    onQuickRequest?: (defaults?: QuickRequestDefaults) => void;
    onNavigateToProduct?: (sku: string) => void;
    purchaseOrders?: any[]; // Add purchase orders for vendor performance
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

interface StockoutRisk {
  sku: string;
  name: string;
  daysUntilStockout: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  forecastAccuracy?: number;
  trendDirection: 'up' | 'down' | 'stable';
  seasonalFactor?: number;
}

interface VendorPerformance {
  vendorId: string;
  vendorName: string;
  onTimeDeliveryRate: number;
  averageLeadTimeActual: number;
  averageLeadTimeEstimated: number;
  costStability: number;
  reliabilityScore: number;
}

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
        <th className={`px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider ${className || ''}`}>
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

const Inventory: React.FC<InventoryProps> = ({ inventory, vendors, boms, onNavigateToBom, onQuickRequest, onNavigateToProduct, purchaseOrders = [] }) => {
    const { rowDensity, fontScale } = useUserPreferences();
    const [activeTab, setActiveTab] = useState<'inventory' | 'intelligence'>('inventory');
// const [activeSubTab, setActiveSubTab] = useState<'risks' | 'forecasts' | 'trends' | 'vendors' | 'budget'>('risks');
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
    const stockoutRisks = useMemo(() => {
        const risks: StockoutRisk[] = [];

        inventory.forEach(item => {
            const consumptionDaily = (item.salesLast30Days || 0) / 30;
            
            if (consumptionDaily === 0) return;

            const availableStock = item.stock + (item.onOrder || 0);
            const daysUntilStockout = Math.floor(availableStock / consumptionDaily);

            // Calculate trend (comparing 30-day vs 90-day)
            const trend30 = (item.salesLast30Days || 0) / 30;
            const trend90 = (item.salesLast90Days || 0) / 90;
            const trendChange = trend30 - trend90;
            
            let trendDirection: 'up' | 'down' | 'stable' = 'stable';
            if (trendChange > trend90 * 0.15) trendDirection = 'up';
            else if (trendChange < -trend90 * 0.15) trendDirection = 'down';

            // Determine risk level
            const leadTime = item.leadTimeDays || 14;
            let riskLevel: 'critical' | 'high' | 'medium' | 'low';
            
            if (daysUntilStockout <= 0) riskLevel = 'critical';
            else if (daysUntilStockout < leadTime * 0.5) riskLevel = 'critical';
            else if (daysUntilStockout < leadTime) riskLevel = 'high';
            else if (daysUntilStockout < leadTime * 1.5) riskLevel = 'medium';
            else riskLevel = 'low';

            risks.push({
                sku: item.sku,
                name: item.name,
                daysUntilStockout,
                riskLevel,
                trendDirection,
            });
        });

        return risks.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
    }, [inventory]);

    const vendorPerformances = useMemo(() => {
        const performances: VendorPerformance[] = [];

        vendors.forEach(vendor => {
            const vendorPOs = purchaseOrders.filter((po: any) => po.vendorId === vendor.id);
            
            if (vendorPOs.length === 0) return;

            // On-time delivery rate
            const completedPOs = vendorPOs.filter((po: any) => po.status === 'received' || po.status === 'Fulfilled');
            const onTimePOs = completedPOs.filter((po: any) => {
                if (!po.expectedDate || !po.actualReceiveDate) return false;
                return new Date(po.actualReceiveDate) <= new Date(po.expectedDate);
            });
            const onTimeRate = completedPOs.length > 0 ? (onTimePOs.length / completedPOs.length) * 100 : 0;

            // Lead time accuracy
            const leadTimes = completedPOs
                .filter((po: any) => po.orderDate && po.actualReceiveDate)
                .map((po: any) => {
                    const ordered = new Date(po.orderDate);
                    const received = new Date(po.actualReceiveDate!);
                    return Math.floor((received.getTime() - ordered.getTime()) / (1000 * 60 * 60 * 24));
                });
            
            const avgActualLeadTime = leadTimes.length > 0
                ? leadTimes.reduce((sum, lt) => sum + lt, 0) / leadTimes.length
                : 0;

            // Reliability score (composite)
            const reliabilityScore = Math.round(
                onTimeRate * 0.6 + // 60% weight on on-time delivery
                (avgActualLeadTime > 0 && vendor.leadTimeDays ? Math.min(100, (vendor.leadTimeDays / avgActualLeadTime) * 100) * 0.4 : 0)
            );

            performances.push({
                vendorId: vendor.id,
                vendorName: vendor.name,
                onTimeDeliveryRate: onTimeRate,
                averageLeadTimeActual: avgActualLeadTime,
                averageLeadTimeEstimated: vendor.leadTimeDays || 0,
                costStability: 0,
                reliabilityScore,
            });
        });

        return performances.sort((a, b) => b.reliabilityScore - a.reliabilityScore);
    }, [vendors, purchaseOrders]);

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
        
        // Filter categories based on visibility config
        const categories = allCategories.filter(cat => {
            const config = getCategoryConfig(cat);
            return config.visible !== false; // Show by default if not configured
        });
        
        // Filter vendors based on visibility config
        const vendors = allVendorIds.filter(vendorId => {
            const vendorName = getVendorName(vendorId);
            const config = getVendorConfig(vendorName);
            return config.visible !== false; // Show by default if not configured
        });
        
        const statuses = ['In Stock', 'Low Stock', 'Out of Stock'];
        return { categories, vendors, statuses };
    }, [inventory, getVendorName, categoryConfig, vendorConfig]);

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

        // Multi-select category filter with exclusion support
        if (selectedCategories.size > 0) {
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
        categoryConfig,
        vendorConfig,
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
        <div>
            <div className="space-y-6">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Inventory</h1>
                        <p className="text-gray-400 mt-1">Search, filter, and manage all your stock items.</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0 flex-wrap">
                        <Button
                            onClick={() => setIsPresetManagerOpen(true)}
                            className={`flex items-center gap-2 font-semibold py-2 px-4 rounded-md transition-colors ${
                                activePresetId 
                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                                    : 'bg-gray-700 text-white hover:bg-gray-600'
                            }`}
                            title="Manage filter presets"
                        >
                            <BookmarkIcon className="w-5 h-5" />
                            <span className="hidden sm:inline">
                                {activePresetId 
                                    ? filterPresets.find(p => p.id === activePresetId)?.name || 'Presets'
                                    : 'Filter Presets'}
                            </span>
                        </Button>
                        <Button
                            onClick={() => setIsColumnModalOpen(true)}
                            className="flex items-center gap-2 bg-gray-700 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-600 transition-colors"
                            title="Manage columns"
                        >
                            <AdjustmentsHorizontalIcon className="w-5 h-5" />
                            <span className="hidden sm:inline">Columns</span>
                        </Button>
                        <Button
                            onClick={() => setIsImportExportModalOpen(true)}
                            className="flex items-center gap-2 bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
                        >
                            <ArrowsUpDownIcon className="w-5 h-5" />
                            <span className="hidden sm:inline">Import / Export</span>
                        </Button>
                    </div>
                </header>

                {/* Tabs */}
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
                    <div className="flex border-b border-gray-700">
                        {[
                            { id: 'inventory', label: 'Inventory', icon: PackageIcon },
                            { id: 'intelligence', label: 'Stock Intelligence', icon: ChartBarIcon },
                        ].map(tab => {
                            const Icon = tab.icon;
                            return (
                                <Button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                        activeTab === tab.id
                                            ? 'bg-indigo-600 text-white'
                                            : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'
                                    }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                </Button>
                            );
                        })}
                    </div>

                        {/* Inventory Tab */}
                        <div hidden={activeTab !== 'inventory'} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
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
                            <Button
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
                            </Button>
                            {isCategoryDropdownOpen && (
                                <div className="absolute z-[100] w-full mt-1 border-2 border-gray-500 rounded-md shadow-2xl max-h-80 overflow-hidden bg-gray-900">
                                    <div className="sticky top-0 p-2 border-b border-gray-600 flex gap-2 bg-gray-900">
                                        <Button
                                            onClick={selectAllCategories}
                                            className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 bg-gray-600 rounded"
                                        >
                                            Select All
                                        </Button>
                                        <Button
                                            onClick={clearAllCategories}
                                            className="text-xs text-gray-400 hover:text-white px-2 py-1 bg-gray-600 rounded"
                                        >
                                            Clear
                                        </Button>
                                        <Button
                                            onClick={() => {
                                                setIsCategoryDropdownOpen(false);
                                                setIsCategoryManagementOpen(true);
                                            }}
                                            className="ml-auto text-xs text-yellow-400 hover:text-yellow-300 px-2 py-1 bg-gray-600 rounded flex items-center gap-1"
                                        >
                                            <AdjustmentsHorizontalIcon className="w-3 h-3" />
                                            Manage
                                        </Button>
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
                            <Button
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
                            </Button>
                            {isVendorDropdownOpen && (
                                <div className="absolute z-[100] w-full mt-1 bg-gray-900 border-2 border-gray-500 rounded-md shadow-2xl max-h-80 overflow-hidden">
                                    <div className="sticky top-0 bg-gray-900 p-2 border-b border-gray-600 flex gap-2">
                                        <Button
                                            onClick={selectAllVendors}
                                            className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 bg-gray-600 rounded"
                                        >
                                            Select All
                                        </Button>
                                        <Button
                                            onClick={clearAllVendors}
                                            className="text-xs text-gray-400 hover:text-white px-2 py-1 bg-gray-600 rounded"
                                        >
                                            Clear
                                        </Button>
                                        <Button
                                            onClick={() => {
                                                setIsVendorDropdownOpen(false);
                                                setIsVendorManagementOpen(true);
                                            }}
                                            className="ml-auto text-xs text-yellow-400 hover:text-yellow-300 px-2 py-1 bg-gray-600 rounded flex items-center gap-1"
                                        >
                                            <AdjustmentsHorizontalIcon className="w-3 h-3" />
                                            Manage
                                        </Button>
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
                            <select id="filter-bom" value={bomFilter} onChange={(e) => setBomFilter(e.target.value)} className={`w-full bg-gray-700 text-white rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500 border-gray-600 ${bomFilter !== 'all' ? 'ring-2 ring-indigo-500/50' : ''}`}>
                                <option value="all">All Items</option>
                                <option value="with-bom">Has Constituents (BOM)</option>
                                <option value="without-bom">No BOM</option>
                            </select>
                            {bomFilter !== 'all' && (
                                <span className="absolute top-6 right-2 w-3 h-3 bg-indigo-500 rounded-full pointer-events-none"></span>
                            )}
                        </div>
                    </div>
                    {false && <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Button
                            onClick={handleNeedsOrderToggle}
                            className={`px-4 py-2 text-sm font-semibold rounded-md border transition-colors ${
                                riskFilter === 'needs-order'
                                    ? 'bg-red-500/20 border-red-400/60 text-red-200 shadow-lg shadow-red-900/40'
                                    : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
                            }`}
                        >
                            Needs Order ({needsOrderCount})
                        </Button>
                        <span className="text-xs text-gray-400">
                            Flags SKUs when runway &lt; vendor lead time or stock is at/below the reorder point. Daily demand uses the most conservative rate across sales velocity and 30/60/90-day averages.
                        </span>
                    </div>}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-gray-400">
                            Showing <span className="font-semibold text-white">{processedInventory.length}</span> of <span className="font-semibold text-white">{inventory.length}</span> items
                        </p>
                        {onQuickRequest && (
                            <Button
                                onClick={() => onQuickRequest?.()}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600/80 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
                            >
                                Ask About Product
                            </Button>
                        )}
                    </div>
                    <div className="relative z-0 bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="table-density w-full divide-y divide-gray-700 table-auto">
                            <thead className="bg-gray-900/50">
                                <tr>
                                    {visibleColumns.map(col => {
                                        const widthClass = COLUMN_WIDTH_CLASSES[col.key] || '';
                                        if (!col.sortable) {
                                            return (
                                                <th key={col.key} className={`px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider ${widthClass}`}>
                                                    {col.label}
                                                </th>
                                            );
                                        }
                                        const sortKey = col.key === 'vendor' ? 'vendor' : col.key as SortKeys;
                                        return <SortableHeader key={col.key} title={col.label} sortKey={sortKey} sortConfig={sortConfig} requestSort={requestSort} className={widthClass} />;
                                    })}
                                    <th className="px-6 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider w-36">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {processedInventory.map((item, index) => {
                                    const stockStatus = getStockStatus(item);
                                    const vendor = getVendorName(item.vendorId);
                                    const bomDetails = getBomDetailsForComponent(item.sku, bomUsageMap);
                                    const bomCount = bomDetails.length;
                                    const insight = demandInsights.get(item.sku);
                                    const zebraClass = index % 2 === 0 ? 'inventory-row-even' : 'inventory-row-odd';

                                    return (
                                        <tr 
                                            key={item.sku} 
                                            ref={(el) => {
                                                if (el) inventoryRowRefs.current.set(item.sku, el);
                                            }}
                                            className={`inventory-row ${zebraClass} transition-colors`}
                                        >
                                            {visibleColumns.map(col => {
                                                const widthClass = COLUMN_WIDTH_CLASSES[col.key] || '';
                                                switch (col.key) {
                                                    case 'sku':
                                                        return (
                                                            <td key={col.key} className={`px-6 ${cellDensityClass} whitespace-nowrap font-mono ${widthClass}`}>
                                                                <div className="flex items-center gap-2">
                                                                    <Button
                                                                        onClick={() => onNavigateToProduct?.(item.sku)}
                                                                        className="text-white font-bold hover:text-indigo-400 transition-colors cursor-pointer"
                                                                        title="Click to view product details"
                                                                    >
                                                                        {item.sku}
                                                                    </Button>
                                                                    {bomCount > 0 && (
                                                                        <div className="relative group flex-shrink-0">
                                                                            <Button
                                                                                onClick={() => handleBomClick(item)}
                                                                                className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full text-xs hover:bg-blue-500/30 transition-colors"
                                                                                title={`Used in ${bomCount} BOM${bomCount > 1 ? 's' : ''}`}
                                                                            >
                                                                                BOM {bomCount > 1 ? `(${bomCount})` : ''}
                                                                            </Button>
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
                                                            <td key={col.key} className={`px-4 ${cellDensityClass} whitespace-nowrap ${widthClass}`}>
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
                                                            <td key={col.key} className={`px-4 ${cellDensityClass} text-white max-w-xs group relative ${widthClass}`}>
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
                                                            <td key={col.key} className={`px-4 ${cellDensityClass} whitespace-nowrap text-gray-300 truncate ${widthClass}`} title={normalizedCategory}>
                                                                {prettyCategory}
                                                            </td>
                                                        );
                                                    }
                                                    case 'stock':
                                                        return (
                                                            <td key={col.key} className={`px-6 ${cellDensityClass} whitespace-nowrap text-white ${widthClass}`}>
                                                                <div className="mb-0.5 font-semibold">{item.stock.toLocaleString()}</div>
                                                                <StockIndicator item={item} />
                                                            </td>
                                                        );
                                                    case 'onOrder':
                                                        return <td key={col.key} className={`px-6 ${cellDensityClass} whitespace-nowrap text-gray-300 ${widthClass}`}>{item.onOrder.toLocaleString()}</td>;
                                                    case 'reorderPoint':
                                                        return <td key={col.key} className={`px-6 ${cellDensityClass} whitespace-nowrap text-gray-300 ${widthClass}`}>{item.reorderPoint.toLocaleString()}</td>;
                                                    case 'vendor':
                                                        return <td key={col.key} className={`px-6 ${cellDensityClass} whitespace-nowrap text-gray-300 truncate ${widthClass}`} title={vendor || 'N/A'}>{vendor || 'N/A'}</td>;
                                                    case 'status':
                                                        return (
                                                            <td key={col.key} className={`px-6 ${cellDensityClass} whitespace-nowrap ${widthClass}`}>
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
                                                            <td key={col.key} className={`px-6 ${cellDensityClass} whitespace-nowrap ${widthClass}`}>
                                                                <div className="relative group">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className={`font-semibold ${insight?.needsOrder ? 'text-red-300' : 'text-emerald-300'}`}>
                                                                            {runwayValue}
                                                                        </span>
                                                                        <span className="text-xs text-gray-400">vs {leadValue || '—'}d lead</span>
                                                                        <div className="w-8 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                                                            <div
                                                                                className={`${insight?.needsOrder ? 'bg-red-500' : 'bg-emerald-500'} h-full`}
                                                                                style={{ width: `${progressRatio}%` }}
                                                                            ></div>
                                                                        </div>
                                                                    </div>
                                                                    {/* Hover popup with detailed info */}
                                                                    <div className="hidden group-hover:block absolute left-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-50 p-4 text-left">
                                                                        <div className="text-sm font-semibold text-white mb-3">Runway Details</div>
                                                                        <div className="space-y-2">
                                                                            <div className="flex justify-between items-center">
                                                                                <span className="text-xs text-gray-400">Runway:</span>
                                                                                <span className={`font-semibold ${insight?.needsOrder ? 'text-red-300' : 'text-emerald-300'}`}>
                                                                                    {runwayValue}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex justify-between items-center">
                                                                                <span className="text-xs text-gray-400">Lead Time:</span>
                                                                                <span className="text-gray-300">{leadValue || '—'} days</span>
                                                                            </div>
                                                                            <div className="flex justify-between items-center">
                                                                                <span className="text-xs text-gray-400">Source:</span>
                                                                                <span className="text-gray-300">{insight ? demandSourceLabels[insight.demandSource] : 'N/A'}</span>
                                                                            </div>
                                                                            {insight && insight.dailyDemand > 0 && (
                                                                                <div className="flex justify-between items-center">
                                                                                    <span className="text-xs text-gray-400">Daily Demand:</span>
                                                                                    <span className="text-gray-300">≈ {insight.dailyDemand.toFixed(1)} units/day</span>
                                                                                </div>
                                                                            )}
                                                                            {breakdown && (
                                                                                <div className="mt-3 pt-3 border-t border-gray-700">
                                                                                    <div className="text-xs text-gray-400 mb-2">Demand Breakdown:</div>
                                                                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                                                                        <div className="flex justify-between">
                                                                                            <span className="text-gray-500">30d avg:</span>
                                                                                            <span className="text-gray-300">{formatDemandRate(breakdown.avg30)}</span>
                                                                                        </div>
                                                                                        <div className="flex justify-between">
                                                                                            <span className="text-gray-500">60d avg:</span>
                                                                                            <span className="text-gray-300">{formatDemandRate(breakdown.avg60)}</span>
                                                                                        </div>
                                                                                        <div className="flex justify-between">
                                                                                            <span className="text-gray-500">90d avg:</span>
                                                                                            <span className="text-gray-300">{formatDemandRate(breakdown.avg90)}</span>
                                                                                        </div>
                                                                                        <div className="flex justify-between">
                                                                                            <span className="text-gray-500">Velocity:</span>
                                                                                            <span className="text-gray-300">{formatDemandRate(breakdown.salesVelocity)}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        );
                                                    }
                                                    case 'salesVelocity':
                                                        return <td key={col.key} className={`px-6 ${cellDensityClass} whitespace-nowrap text-gray-300 text-right ${widthClass}`}>{item.salesVelocity?.toFixed(2) || '0.00'}</td>;
                                                    case 'sales30Days':
                                                        return <td key={col.key} className={`px-6 ${cellDensityClass} whitespace-nowrap text-gray-300 text-right ${widthClass}`}>{item.sales30Days || 0}</td>;
                                                    case 'sales60Days':
                                                        return <td key={col.key} className={`px-6 ${cellDensityClass} whitespace-nowrap text-gray-300 text-right ${widthClass}`}>{item.sales60Days || 0}</td>;
                                                    case 'sales90Days':
                                                        return <td key={col.key} className={`px-6 ${cellDensityClass} whitespace-nowrap text-gray-300 text-right ${widthClass}`}>{item.sales90Days || 0}</td>;
                                                    case 'unitCost':
                                                        return <td key={col.key} className={`px-6 ${cellDensityClass} whitespace-nowrap text-gray-300 text-right ${widthClass}`}>${item.unitCost?.toFixed(2) || '0.00'}</td>;
                                                    default:
                                                        return null;
                                                }
                                            })}
                                            <td className={`px-6 ${cellDensityClass} text-right whitespace-nowrap`}>
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        onClick={() => onQuickRequest?.({ sku: item.sku, requestType: 'product_alert', alertOnly: true })}
                                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md bg-gray-700/80 hover:bg-gray-600 text-white transition disabled:opacity-40"
                                                        disabled={!onQuickRequest}
                                                    >
                                                        Ask
                                                    </Button>
                                                    <Button
                                                        onClick={() => onQuickRequest?.({ sku: item.sku, requestType: 'consumable' })}
                                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md bg-indigo-600/80 hover:bg-indigo-500 text-white transition disabled:opacity-40"
                                                        disabled={!onQuickRequest}
                                                    >
                                                        <PlusCircleIcon className="w-4 h-4" />
                                                        Requisition
                                                    </Button>
                                                    <Button
                                                        onClick={() => onQuickRequest?.({ sku: item.sku, requestType: 'product_alert', alertOnly: true, priority: 'high' })}
                                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 transition disabled:opacity-40"
                                                        disabled={!onQuickRequest}
                                                    >
                                                        <BellIcon className="w-4 h-4" />
                                                        Alert
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            {/* Stock Intelligence Tab */}
            <div hidden={activeTab !== 'intelligence'} className="space-y-6">
                    {/* Header */}
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                            <ChartBarIcon className="w-6 h-6 text-indigo-400" />
                            Stock Intelligence
                        </h2>
                        <p className="text-gray-400 mt-1">Advanced analytics and predictive insights for inventory management</p>
                    </div>

                    {/* Key Metrics Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-400">Critical Risks</p>
                                    <p className="text-2xl font-bold text-red-400">{stockoutRisks.filter(r => r.riskLevel === 'critical').length}</p>
                                </div>
                                <AlertCircleIcon className="w-8 h-8 text-red-400/50" />
                            </div>
                        </div>

                        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-400">High Priority</p>
                                    <p className="text-2xl font-bold text-orange-400">{stockoutRisks.filter(r => r.riskLevel === 'high').length}</p>
                                </div>
                                <AlertCircleIcon className="w-8 h-8 text-orange-400/50" />
                            </div>
                        </div>

                        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-400">Trending Up</p>
                                    <p className="text-2xl font-bold text-green-400">
                                        {stockoutRisks.filter(r => r.trendDirection === 'up').length}
                                    </p>
                                </div>
                                <TrendingUpIcon className="w-8 h-8 text-green-400/50" />
                            </div>
                        </div>

                        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-400">Active Vendors</p>
                                    <p className="text-2xl font-bold text-indigo-400">{vendorPerformances.length}</p>
                                </div>
                                <UsersIcon className="w-8 h-8 text-indigo-400/50" />
                            </div>
                        </div>
                    </div>

                    {/* Intelligence Tabs */}
                    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
                        <div className="flex border-b border-gray-700">
                            {[
                                { id: 'risks', label: 'Stockout Risks', icon: AlertCircleIcon },
                                { id: 'forecasts', label: 'Forecast Accuracy', icon: ChartBarIcon },
                                { id: 'trends', label: 'Trends & Patterns', icon: TrendingUpIcon },
                                { id: 'vendors', label: 'Vendor Performance', icon: UsersIcon },
                                { id: 'budget', label: 'Budget Analysis', icon: DollarSignIcon },
                            ].map(tab => {
                                const Icon = tab.icon;
                                return (
                                    <Button
                                        key={tab.id}
                                        onClick={() => {}}
                                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                            'risks' === tab.id
                                                ? 'bg-indigo-600 text-white'
                                                : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'
                                        }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        {tab.label}
                                    </Button>
                                );
                            })}
                        </div>

                        <div className="p-6">
                            {/* Stockout Risks Tab */}
                            {'risks' === 'risks' && (
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold text-white">Stockout Risk Analysis</h3>
                                    
                                    {stockoutRisks.length === 0 ? (
                                        <p className="text-gray-400 text-center py-8">No stockout risks detected</p>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="table-density min-w-full divide-y divide-gray-700">
                                                <thead className="bg-gray-800/50">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">SKU</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Item</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Days Left</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Risk Level</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Trend</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-gray-800 divide-y divide-gray-700">
                                                    {stockoutRisks.slice(0, 50).map(risk => (
                                                        <tr key={risk.sku} className="hover:bg-gray-700/50">
                                                            <td className="px-4 py-1 text-sm text-gray-300">{risk.sku}</td>
                                                            <td className="px-4 py-1 text-sm text-white font-medium">{risk.name}</td>
                                                            <td className="px-4 py-1 text-sm">
                                                                <span className={`font-semibold ${
                                                                    risk.daysUntilStockout <= 0 ? 'text-red-400' :
                                                                    risk.daysUntilStockout < 7 ? 'text-orange-400' :
                                                                    'text-gray-300'
                                                                }`}>
                                                                    {risk.daysUntilStockout <= 0 ? 'OUT OF STOCK' : `${risk.daysUntilStockout} days`}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-1">
                                                                <RiskBadge level={risk.riskLevel} />
                                                            </td>
                                                            <td className="px-4 py-1">
                                                                <TrendIndicator direction={risk.trendDirection} />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Forecast Accuracy Tab */}
                            {'risks' === 'forecasts' && (
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold text-white">Forecast Accuracy Tracking</h3>
                                    <p className="text-gray-400 text-sm">
                                        Historical forecast performance to improve future predictions
                                    </p>
                                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                                        <p className="text-yellow-400 text-sm">
                                            📊 Forecast accuracy tracking requires historical data. This feature will populate over time as forecasts are validated against actual sales.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Trends & Patterns Tab */}
                            {'risks' === 'trends' && (
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold text-white">Consumption Trends & Seasonal Patterns</h3>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        <div className="bg-gray-800/30 rounded-lg p-4">
                                            <h4 className="text-sm font-semibold text-gray-300 mb-3">Growing Demand (30d vs 90d)</h4>
                                            <div className="space-y-2">
                                                {inventory
                                                    .filter(item => {
                                                        const trend30 = (item.salesLast30Days || 0) / 30;
                                                        const trend90 = (item.salesLast90Days || 0) / 90;
                                                        return trend30 > trend90 * 1.15;
                                                    })
                                                    .slice(0, 10)
                                                    .map(item => {
                                                        const growth = ((((item.salesLast30Days || 0) / 30) / ((item.salesLast90Days || 0) / 90)) - 1) * 100;
                                                        return (
                                                            <div key={item.sku} className="flex justify-between items-center">
                                                                <span className="text-sm text-gray-300">{item.name}</span>
                                                                <span className="text-sm font-semibold text-green-400">+{growth.toFixed(0)}%</span>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>

                                        <div className="bg-gray-800/30 rounded-lg p-4">
                                            <h4 className="text-sm font-semibold text-gray-300 mb-3">Declining Demand (30d vs 90d)</h4>
                                            <div className="space-y-2">
                                                {inventory
                                                    .filter(item => {
                                                        const trend30 = (item.salesLast30Days || 0) / 30;
                                                        const trend90 = (item.salesLast90Days || 0) / 90;
                                                        return trend30 < trend90 * 0.85 && trend90 > 0;
                                                    })
                                                    .slice(0, 10)
                                                    .map(item => {
                                                        const decline = ((((item.salesLast30Days || 0) / 30) / ((item.salesLast90Days || 0) / 90)) - 1) * 100;
                                                        return (
                                                            <div key={item.sku} className="flex justify-between items-center">
                                                                <span className="text-sm text-gray-300">{item.name}</span>
                                                                <span className="text-sm font-semibold text-red-400">{decline.toFixed(0)}%</span>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Vendor Performance Tab */}
                            {'risks' === 'vendors' && (
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold text-white">Vendor Performance Scoring</h3>
                                    
                                    {vendorPerformances.length === 0 ? (
                                        <p className="text-gray-400 text-center py-8">No vendor performance data available yet</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {vendorPerformances.map(vp => (
                                                <div key={vp.vendorId} className="bg-gray-800/30 rounded-lg p-4">
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div>
                                                            <h4 className="text-lg font-semibold text-white">{vp.vendorName}</h4>
                                                            <p className="text-sm text-gray-400">Reliability Score</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-2xl font-bold text-indigo-400">{vp.reliabilityScore}</div>
                                                            <div className="text-xs text-gray-400">/ 100</div>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <p className="text-xs text-gray-400">On-Time Delivery</p>
                                                            <p className="text-lg font-semibold text-white">{vp.onTimeDeliveryRate.toFixed(0)}%</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-gray-400">Avg Lead Time</p>
                                                            <p className="text-lg font-semibold text-white">
                                                                {vp.averageLeadTimeActual.toFixed(0)} days
                                                                {vp.averageLeadTimeEstimated > 0 && (
                                                                    <span className="text-sm text-gray-400 ml-1">
                                                                        (est: {vp.averageLeadTimeEstimated})
                                                                    </span>
                                                                )}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Reliability bar */}
                                                    <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${
                                                                vp.reliabilityScore >= 80 ? 'bg-green-500' :
                                                                vp.reliabilityScore >= 60 ? 'bg-yellow-500' :
                                                                'bg-red-500'
                                                            }`}
                                                            style={{ width: `${vp.reliabilityScore}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Budget Analysis Tab */}
                            {'risks' === 'budget' && (
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold text-white">Budget & Cost Analysis</h3>
                                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                                        <p className="text-yellow-400 text-sm">
                                            📊 Budget analysis feature coming soon. Will track spending trends, forecast future costs, and identify optimization opportunities.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
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
                                        <Button
                                            onClick={() => moveColumn(index, 'up')}
                                            disabled={index === 0}
                                            className="p-1 hover:bg-gray-600 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <ChevronUpIcon className="w-4 h-4 text-gray-300" />
                                        </Button>
                                        <Button
                                            onClick={() => moveColumn(index, 'down')}
                                            disabled={index === columns.length - 1}
                                            className="p-1 hover:bg-gray-600 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <ChevronDownIcon className="w-4 h-4 text-gray-300" />
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
                                        <span className={`text-sm font-medium ${col.visible ? 'text-white' : 'text-gray-500'}`}>
                                            {col.label}
                                        </span>
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <div className="p-6 border-t border-gray-700">
                            <Button
                                onClick={() => setIsColumnModalOpen(false)}
                                className="w-full bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
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
                onSavePreset={handleSavePreset}
                onDeletePreset={handleDeletePreset}
                onApplyPreset={handleApplyPreset}
            />
        </div>
    );
};

export default Inventory;

// Helper Components
const RiskBadge: React.FC<{ level: 'critical' | 'high' | 'medium' | 'low' }> = ({ level }) => {
    const config = {
        critical: 'bg-red-500/20 text-red-400 border-red-500/30',
        high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };

    return (
        <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full border ${config[level]}`}>
            {level.toUpperCase()}
        </span>
    );
};

const TrendIndicator: React.FC<{ direction: 'up' | 'down' | 'stable' }> = ({ direction }) => {
    if (direction === 'up') {
        return <span className="text-green-400 font-semibold">↗ Growing</span>;
    } else if (direction === 'down') {
        return <span className="text-red-400 font-semibold">↘ Declining</span>;
    }
    return <span className="text-gray-400">→ Stable</span>;
};
