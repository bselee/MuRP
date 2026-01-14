import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
/**
 * BOMs Page - MERGED VERSION
 *
 * Combines:
 * - Inventory integration from main (buildability, stock levels, limiting components)
 * - Compliance features from our branch (dashboard, alerts, data sheets)
 * - MRP Build Intelligence metrics
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { BillOfMaterials, User, InventoryItem, WatchlistItem, Artwork, RequisitionItem, RequisitionRequestOptions, QuickRequestDefaults, ComponentSwapMap, BomRevisionRequestOptions, PurchaseOrder } from '../types';
import type { ComplianceStatus } from '../types/regulatory';
import {
  PencilIcon,
  ChevronDownIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  Squares2X2Icon,
  ListBulletIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  PackageIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon
} from '../components/icons';
import { useBuildReadiness } from '../hooks/useBuildReadiness';
import CollapsibleSection from '../components/CollapsibleSection';
import BomEditModal from '../components/BomEditModal';
import BomDetailModal from '../components/BomDetailModal';
import ComplianceDashboard from '../components/ComplianceDashboard';
import ComplianceDetailModal from '../components/ComplianceDetailModal';
import EnhancedBomCard from '../components/EnhancedBomCard';
import CreateRequisitionModal from '../components/CreateRequisitionModal';
import ScheduleBuildModal from '../components/ScheduleBuildModal';
import { usePermissions } from '../hooks/usePermissions';
import { supabase } from '../lib/supabase/client';
import { fetchComponentSwapRules, mapComponentSwaps } from '../services/componentSwapService';
import CategoryManagementModal, { type CategoryConfig } from '../components/CategoryManagementModal';
import { useLimitingSKUOnOrder } from '../hooks/useLimitingSKUOnOrder';
import { useTheme } from '../components/ThemeProvider';
import { useGlobalSkuFilter } from '../hooks/useGlobalSkuFilter';

type ViewMode = 'card' | 'table';
type SortOption = 'name' | 'sku' | 'inventory' | 'buildability' | 'category' | 'velocity' | 'runway';
type BuildabilityFilter = 'all' | 'buildable' | 'not-buildable' | 'out-of-stock' | 'near-oos';
type GroupByOption = 'none' | 'category' | 'buildability' | 'compliance';

interface BOMsProps {
  boms: BillOfMaterials[];
  inventory: InventoryItem[];
  purchaseOrders: PurchaseOrder[];
  currentUser: User;
  users: User[];
  watchlist: WatchlistItem[];
  onUpdateBom: (updatedBom: BillOfMaterials, options?: BomRevisionRequestOptions) => void | Promise<boolean>;
  onApproveRevision: (bom: BillOfMaterials) => void;
  onRevertToRevision: (bom: BillOfMaterials, revisionNumber: number) => void;
  onNavigateToArtwork: (filter: string) => void;
  onNavigateToInventory?: (sku: string) => void;
  onUploadArtwork?: (bomId: string, artwork: Omit<Artwork, 'id'>) => void;
  onCreateRequisition: (items: RequisitionItem[], options?: RequisitionRequestOptions) => void;
  onCreateBuildOrder: (sku: string, name: string, quantity: number, scheduledDate?: string, dueDate?: string) => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onQuickRequest?: (defaults?: QuickRequestDefaults) => void;
  onNavigateToPurchaseOrders?: (poId?: string) => void;
}

const isBuildabilityFilter = (value: string | null): value is BuildabilityFilter =>
  value === 'all' ||
  value === 'buildable' ||
  value === 'not-buildable' ||
  value === 'out-of-stock' ||
  value === 'near-oos';

const readStoredBuildabilityFilter = (): BuildabilityFilter => {
  if (typeof window === 'undefined') {
    return 'all';
  }
  const stored = localStorage.getItem('bomStatusFilter');
  return isBuildabilityFilter(stored) ? stored : 'all';
};

const readStoredSortOption = (): SortOption => {
  if (typeof window === 'undefined') return 'name';
  const stored = localStorage.getItem('bomSortBy');
  const validOptions: SortOption[] = ['name', 'sku', 'inventory', 'buildability', 'category', 'velocity', 'runway'];
  return validOptions.includes(stored as SortOption) ? (stored as SortOption) : 'name';
};

const readStoredGroupBy = (): GroupByOption => {
  if (typeof window === 'undefined') return 'none';
  const stored = localStorage.getItem('bomGroupBy');
  const validOptions: GroupByOption[] = ['none', 'category', 'buildability', 'compliance'];
  return validOptions.includes(stored as GroupByOption) ? (stored as GroupByOption) : 'none';
};

const readStoredCategoryFilter = (): Set<string> => {
  if (typeof window === 'undefined') return new Set();
  const saved = localStorage.getItem('bom-selected-categories');
  return saved ? new Set(JSON.parse(saved)) : new Set();
};

const readStoredCategoryConfig = (): Record<string, CategoryConfig> => {
  if (typeof window === 'undefined') return {};
  const saved = localStorage.getItem('bom-category-config');
  return saved ? JSON.parse(saved) : {};
};

// Build Metrics Banner - Shows MRP build intelligence summary
const BuildMetricsBanner: React.FC<{
  isDark: boolean;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ isDark, isOpen, onToggle }) => {
  const { data, loading, urgentCount, blockedCount, readyCount } = useBuildReadiness();

  // Get top urgent items for display
  const urgentItems = useMemo(() => {
    if (!data) return [];
    return data
      .filter(d => d.buildAction === 'BUILD_URGENT')
      .slice(0, 8);
  }, [data]);

  const totalBoms = data?.length || 0;

  return (
    <CollapsibleSection
      title="Build Metrics"
      icon={<PackageIcon className={`w-6 h-6 ${urgentCount > 0 ? 'text-amber-400' : 'text-green-400'}`} />}
      variant="card"
      isOpen={isOpen}
      onToggle={onToggle}
      badge={
        <div className="flex items-center gap-3 ml-4">
          {urgentCount > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/20 text-red-400 text-sm font-medium">
              <ExclamationTriangleIcon className="w-4 h-4" />
              {urgentCount} Urgent
            </span>
          )}
          {blockedCount > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 text-sm font-medium">
              <XCircleIcon className="w-4 h-4" />
              {blockedCount} Blocked
            </span>
          )}
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 text-sm font-medium">
            <CheckCircleIcon className="w-4 h-4" />
            {readyCount} Ready
          </span>
        </div>
      }
    >
      {loading ? (
        <div className={`${isDark ? 'bg-gray-800/50' : 'bg-gray-50'} rounded-lg p-4 text-center`}>
          <div className={`animate-pulse ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Loading build metrics...
          </div>
        </div>
      ) : (
        <div className={`${isDark ? 'bg-gray-800/50' : 'bg-white border border-gray-200'} rounded-lg p-4`}>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <MetricCard
              label="Total BOMs"
              value={totalBoms}
              isDark={isDark}
            />
            <MetricCard
              label="Build Urgent"
              value={urgentCount}
              isDark={isDark}
              variant={urgentCount > 0 ? 'danger' : 'default'}
            />
            <MetricCard
              label="Blocked"
              value={blockedCount}
              isDark={isDark}
              variant={blockedCount > 0 ? 'warning' : 'default'}
            />
            <MetricCard
              label="Ready to Build"
              value={readyCount}
              isDark={isDark}
              variant="success"
            />
          </div>

          {/* Urgent Items List */}
          {urgentItems.length > 0 && (
            <div>
              <h4 className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                Urgent Builds (≤7 days coverage)
              </h4>
              <div className="flex flex-wrap gap-2">
                {urgentItems.map(item => (
                  <div
                    key={item.sku}
                    className={`px-3 py-1.5 rounded-md text-sm ${
                      isDark
                        ? 'bg-red-900/30 border border-red-700 text-red-300'
                        : 'bg-red-50 border border-red-200 text-red-700'
                    }`}
                  >
                    <span className="font-mono font-medium">{item.sku}</span>
                    <span className={`ml-2 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                      {item.daysOfCoverage}d
                    </span>
                    {!item.canBuild && (
                      <span className={`ml-1 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                        • blocked
                      </span>
                    )}
                  </div>
                ))}
                {urgentCount > urgentItems.length && (
                  <span className={`px-3 py-1.5 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    +{urgentCount - urgentItems.length} more
                  </span>
                )}
              </div>
            </div>
          )}

          {urgentItems.length === 0 && (
            <div className={`text-center py-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              <CheckCircleIcon className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p className="text-sm">All builds have adequate coverage</p>
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
};

// Metric Card subcomponent
const MetricCard: React.FC<{
  label: string;
  value: number;
  isDark: boolean;
  variant?: 'default' | 'danger' | 'warning' | 'success';
}> = ({ label, value, isDark, variant = 'default' }) => {
  const variantStyles = {
    default: isDark ? 'text-white' : 'text-gray-900',
    danger: 'text-red-500',
    warning: 'text-amber-500',
    success: 'text-green-500',
  };

  return (
    <div className={`p-3 rounded-lg ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
      <p className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase`}>
        {label}
      </p>
      <p className={`text-2xl font-bold ${variantStyles[variant]}`}>
        {value}
      </p>
    </div>
  );
};

const BOMs: React.FC<BOMsProps> = ({
  boms,
  inventory,
  purchaseOrders,
  currentUser,
  users,
  watchlist,
  onUpdateBom,
  onApproveRevision,
  onRevertToRevision,
  onNavigateToArtwork,
  onNavigateToInventory,
  onUploadArtwork,
  onCreateRequisition,
  onCreateBuildOrder,
  addToast,
  onQuickRequest,
  onNavigateToPurchaseOrders
}) => {
  const { isDark } = useTheme();
  const { isExcluded: isSkuGloballyExcluded } = useGlobalSkuFilter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBom, setSelectedBom] = useState<BillOfMaterials | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedDetailBom, setSelectedDetailBom] = useState<BillOfMaterials | null>(null);
  const [isComplianceDetailOpen, setIsComplianceDetailOpen] = useState(false);
  const [selectedComplianceStatus, setSelectedComplianceStatus] = useState<ComplianceStatus | null>(null);
  const [expandedBoms, setExpandedBoms] = useState<Set<string>>(new Set());
  const bomRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [isRequisitionModalOpen, setIsRequisitionModalOpen] = useState(false);
  const [scheduleModalConfig, setScheduleModalConfig] = useState<{ bomId: string; defaultQuantity: number; start: Date } | null>(null);
  const [queueStatusBySku, setQueueStatusBySku] = useState<Record<string, { status: string; poId: string | null }>>({});
  const [componentSwaps, setComponentSwaps] = useState<ComponentSwapMap>({});
  const permissions = usePermissions();
  const canViewBoms = permissions.canViewBoms;
  const canEdit = permissions.canEditBoms;
  const canSubmitRequisitions = permissions.canSubmitRequisition;
  const isOpsApprover = currentUser.role === 'Admin' || currentUser.department === 'Operations';

  // New UI state with persistent storage
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(() => readStoredCategoryFilter());
  const [buildabilityFilter, setBuildabilityFilter] = useState<BuildabilityFilter>(() => readStoredBuildabilityFilter());
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = useState<SortOption>(() => readStoredSortOption());
  const [groupBy, setGroupBy] = useState<GroupByOption>(() => readStoredGroupBy());
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [componentFilter, setComponentFilter] = useState<{ sku: string; componentName?: string } | null>(null);
  const [isCategoryManagementOpen, setIsCategoryManagementOpen] = useState(false);
  const [categoryConfig, setCategoryConfig] = useState<Record<string, CategoryConfig>>(() => readStoredCategoryConfig());
  // Already declared above, remove duplicate declarations
  
  // Persist filter preferences
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bomStatusFilter', buildabilityFilter);
      localStorage.setItem('bomSortBy', sortBy);
      localStorage.setItem('bomGroupBy', groupBy);
      localStorage.setItem('bom-selected-categories', JSON.stringify(Array.from(selectedCategories)));
      localStorage.setItem('bom-category-config', JSON.stringify(categoryConfig));
    }
  }, [buildabilityFilter, sortBy, groupBy, selectedCategories, categoryConfig]);

  const bomLookupBySku = useMemo(() => {
    const map = new Map<string, BillOfMaterials>();
    boms.forEach(bom => map.set(bom.finishedSku, bom));
    return map;
  }, [boms]);

  // Already declared above, remove duplicate declarations
  
  // Collapsible sections state
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isComplianceOpen, setIsComplianceOpen] = useState(false);

  // Page-level data fetching for labels and compliance records to avoid N+1 query problem
  const [allLabelsMap, setAllLabelsMap] = useState<Map<string, any[]>>(new Map());
  const [allComplianceMap, setAllComplianceMap] = useState<Map<string, any[]>>(new Map());

  // Debug inventory integration
  useEffect(() => {
    // Component mounted/updated - no debug logging needed
  }, [boms, inventory]);

  // Load component swap settings so staff can see curated alternates
  useEffect(() => {
    let isMounted = true;

    const loadSwaps = async () => {
      try {
        const { rules } = await fetchComponentSwapRules();
        if (isMounted) {
          setComponentSwaps(mapComponentSwaps(rules));
        }
      } catch (error) {
        console.error('[BOMs] Failed to load component swap settings', error);
        if (isMounted) {
          setComponentSwaps({});
        }
      }
    };

    void loadSwaps();

    const channel = supabase
      .channel('app_settings_bom_swaps')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_settings',
          filter: 'setting_key=eq.bom_component_swaps'
        },
        () => {
          void loadSwaps();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch all labels and compliance records at once to avoid overwhelming the browser
  useEffect(() => {
    if (boms.length === 0) {
      setAllLabelsMap(new Map());
      setAllComplianceMap(new Map());
      return;
    }

    let isMounted = true;
    const bomIds = boms.map(b => b.id);

    const fetchAllData = async () => {
      try {
        // Fetch all labels in one query
        const { data: labelsData, error: labelsError } = await supabase
          .from('labels')
          .select('*')
          .in('bom_id', bomIds)
          .order('created_at', { ascending: false });

        if (labelsError) throw labelsError;

        // Group labels by bom_id
        const labelsMap = new Map<string, any[]>();
        (labelsData || []).forEach((label: any) => {
          const bomId = label.bom_id;
          if (!labelsMap.has(bomId)) {
            labelsMap.set(bomId, []);
          }
          // Transform from snake_case to camelCase
          labelsMap.get(bomId)!.push({
            id: label.id,
            fileName: label.file_name,
            fileUrl: label.file_url,
            fileSize: label.file_size,
            mimeType: label.mime_type,
            barcode: label.barcode,
            productName: label.product_name,
            netWeight: label.net_weight,
            revision: label.revision,
            bomId: label.bom_id,
            scanStatus: label.scan_status,
            scanCompletedAt: label.scan_completed_at,
            scanError: label.scan_error,
            extractedData: label.extracted_data,
            ingredientComparison: label.ingredient_comparison,
            verified: label.verified,
            verifiedBy: label.verified_by,
            verifiedAt: label.verified_at,
            fileType: label.file_type,
            status: label.status,
            approvedBy: label.approved_by,
            approvedDate: label.approved_date,
            notes: label.notes,
            uploadedBy: label.uploaded_by,
            createdAt: label.created_at,
            updatedAt: label.updated_at,
          });
        });

        // Fetch all compliance records in one query
        const { data: complianceData, error: complianceError } = await supabase
          .from('compliance_records')
          .select('*')
          .in('bom_id', bomIds)
          .order('expiration_date', { ascending: true });

        if (complianceError) throw complianceError;

        // Group compliance records by bom_id
        const complianceMap = new Map<string, any[]>();
        (complianceData || []).forEach((record: any) => {
          const bomId = record.bom_id;
          if (!complianceMap.has(bomId)) {
            complianceMap.set(bomId, []);
          }
          // Transform from snake_case to camelCase
          complianceMap.get(bomId)!.push({
            id: record.id,
            bomId: record.bom_id,
            labelId: record.label_id,
            complianceType: record.compliance_type,
            category: record.category,
            issuingAuthority: record.issuing_authority,
            stateCode: record.state_code,
            stateName: record.state_name,
            registrationNumber: record.registration_number,
            licenseNumber: record.license_number,
            registeredDate: record.registered_date,
            effectiveDate: record.effective_date,
            expirationDate: record.expiration_date,
            renewalDate: record.renewal_date,
            lastRenewedDate: record.last_renewed_date,
            status: record.status,
            daysUntilExpiration: record.days_until_expiration,
            registrationFee: record.registration_fee,
            renewalFee: record.renewal_fee,
            lateFee: record.late_fee,
            currency: record.currency,
            paymentStatus: record.payment_status,
            certificateUrl: record.certificate_url,
            certificateFileName: record.certificate_file_name,
            certificateFileSize: record.certificate_file_size,
            additionalDocuments: record.additional_documents,
            dueSoonAlertSent: record.due_soon_alert_sent,
            urgentAlertSent: record.urgent_alert_sent,
            expirationAlertSent: record.expiration_alert_sent,
            alertEmailAddresses: record.alert_email_addresses,
            requirements: record.requirements,
            restrictions: record.restrictions,
            conditions: record.conditions,
            contactPerson: record.contact_person,
            contactEmail: record.contact_email,
            contactPhone: record.contact_phone,
            authorityWebsite: record.authority_website,
            assignedTo: record.assigned_to,
            priority: record.priority,
            notes: record.notes,
            internalNotes: record.internal_notes,
            createdBy: record.created_by,
            createdAt: record.created_at,
            updatedAt: record.updated_at,
            lastVerifiedAt: record.last_verified_at,
            lastVerifiedBy: record.last_verified_by,
          });
        });

        if (isMounted) {
          setAllLabelsMap(labelsMap);
          setAllComplianceMap(complianceMap);
        }
      } catch (error) {
        console.error('[BOMs] Failed to fetch labels/compliance data:', error);
        if (isMounted) {
          setAllLabelsMap(new Map());
          setAllComplianceMap(new Map());
        }
      }
    };

    fetchAllData();

    // Set up real-time subscriptions for labels and compliance records
    const labelsChannel = supabase
      .channel('boms-labels-all')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'labels' },
        () => fetchAllData()
      )
      .subscribe();

    const complianceChannel = supabase
      .channel('boms-compliance-all')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'compliance_records' },
        () => fetchAllData()
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(labelsChannel);
      supabase.removeChannel(complianceChannel);
    };
  }, [boms]);

  // Normalize BOMs - ensure components array exists
  // Filter only by global category/SKU exclusions (database handles is_active)
  const filteredBoms = useMemo(() => {
    const normalized = boms.map((bom) => ({
      ...bom,
      components: Array.isArray(bom.components) ? bom.components : [],
    }));

    // Only filter by global SKU exclusions - database already filtered is_active=true
    const filtered = normalized.filter((bom) => {
      if (!bom.finishedSku) return true;
      return !isSkuGloballyExcluded(bom.finishedSku);
    });

    return filtered;
  }, [boms, isSkuGloballyExcluded]);

  // Create inventory lookup map for O(1) access
  const inventoryMap = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    inventory.forEach(item => map.set(item.sku, item));
    return map;
  }, [inventory]);

  // Calculate buildability for a BOM - CRITICAL MRP FUNCTION
  const calculateBuildability = (bom: BillOfMaterials) => {
    if (!bom.components || bom.components.length === 0) {
      return { maxBuildable: 0, limitingComponents: [] };
    }

    let maxBuildable = Infinity;
    const limitingComponents: Array<{
      sku: string;
      name: string;
      available: number;
      needed: number;
      canBuild: number
    }> = [];

    bom.components.forEach(component => {
      const inventoryItem = inventoryMap.get(component.sku);
      const available = inventoryItem?.stock || 0;
      const needed = component.quantity || 1;
      const canBuild = Math.floor(available / needed);

      if (canBuild < maxBuildable) {
        maxBuildable = canBuild;
        limitingComponents.length = 0; // Clear previous limiting components
        limitingComponents.push({
          sku: component.sku,
          name: component.name,
          available,
          needed,
          canBuild
        });
      } else if (canBuild === maxBuildable && maxBuildable < Infinity) {
        limitingComponents.push({
          sku: component.sku,
          name: component.name,
          available,
          needed,
          canBuild
        });
      }
    });

    return {
      maxBuildable: maxBuildable === Infinity ? 0 : maxBuildable,
      limitingComponents
    };
  };

  const openScheduleModal = (bom: BillOfMaterials) => {
    const buildability = calculateBuildability(bom);
    const suggestedQuantity = Math.max(1, buildability.maxBuildable || 1);
    setScheduleModalConfig({
      bomId: bom.id,
      defaultQuantity: suggestedQuantity,
      start: new Date(),
    });
  };

  useEffect(() => {
    const skuSet = new Set<string>();
    boms.forEach(bom => {
      bom.components?.forEach(component => {
        skuSet.add(component.sku);
      });
    });

    if (skuSet.size === 0) {
      setQueueStatusBySku({});
      return;
    }

    let isMounted = true;
    const skuList = Array.from(skuSet);

    const fetchQueueStatus = async () => {
      try {
        const statusMap: Record<string, { status: string; poId: string | null }> = {};
        const chunkSize = 200;

        for (let i = 0; i < skuList.length; i += chunkSize) {
          const chunk = skuList.slice(i, i + chunkSize);
          const { data, error } = await supabase
            .from('reorder_queue')
            .select('inventory_sku,status,po_id')
            .in('inventory_sku', chunk)
            .in('status', ['pending', 'po_created']);

          if (error) throw error;

          data?.forEach(row => {
            statusMap[row.inventory_sku] = { status: row.status, poId: row.po_id };
          });
        }

        if (isMounted) {
          setQueueStatusBySku(statusMap);
        }
      } catch (error) {
        console.error('[BOMs] Failed to load reorder queue status', error);
      }
    };

    fetchQueueStatus();

    const channel = supabase
      .channel('boms-reorder-queue')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reorder_queue' },
        () => fetchQueueStatus()
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [boms]);

  const toggleBomExpanded = (bomId: string) => {
    const newExpanded = new Set(expandedBoms);
    if (newExpanded.has(bomId)) {
      newExpanded.delete(bomId);
    } else {
      newExpanded.add(bomId);
    }
    setExpandedBoms(newExpanded);
  };

  // Navigation from Inventory page - auto-scroll to BOM
  useEffect(() => {
    const selectedSku = localStorage.getItem('selectedBomSku');
    if (selectedSku) {
      const targetBom = boms.find(b => b.finishedSku === selectedSku);
      if (targetBom) {
        setExpandedBoms(new Set([targetBom.id]));

        setTimeout(() => {
          const element = bomRefs.current.get(targetBom.id);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('ring-2', 'ring-blue-500');
            setTimeout(() => {
              element.classList.remove('ring-2', 'ring-blue-500');
            }, 2000);
          }
        }, 100);
      }

      localStorage.removeItem('selectedBomSku');
    }
  }, [boms]);

  useEffect(() => {
    try {
      const payload = localStorage.getItem('bomComponentFilter');
      if (payload) {
        const parsed = JSON.parse(payload);
        if (parsed?.componentSku) {
          setComponentFilter({ sku: parsed.componentSku, componentName: parsed.componentName });
        }
        localStorage.removeItem('bomComponentFilter');
      }
    } catch (error) {
      console.warn('[BOMs] Failed to load component filter from storage', error);
    }
  }, []);

  useEffect(() => {
    if (!componentFilter) return;
    const matchingBom = boms.find(b => b.components?.some(c => c.sku === componentFilter.sku));
    if (matchingBom) {
      setExpandedBoms(new Set([matchingBom.id]));
      setTimeout(() => {
        const element = bomRefs.current.get(matchingBom.id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('ring-2', 'ring-accent-500');
          setTimeout(() => element.classList.remove('ring-2', 'ring-accent-500'), 2000);
        }
      }, 150);
    }
  }, [componentFilter, boms]);

  const handleViewComplianceDetails = (bom: BillOfMaterials, status: ComplianceStatus) => {
    setSelectedBom(bom);
    setSelectedComplianceStatus(status);
    setIsComplianceDetailOpen(true);
  };

  const handleEditClick = (bom: BillOfMaterials) => {
    setSelectedBom(bom);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedBom(null);
  };

  const handleViewDetails = (bom: BillOfMaterials) => {
    setSelectedDetailBom(bom);
    setIsDetailModalOpen(true);
  };

  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedDetailBom(null);
  };

  // Get unique categories for filter dropdown
  const categories = useMemo(() => {
    const cats = new Set(filteredBoms.map(b => b.category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [filteredBoms]);

  // Category label mapping
  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(categoryConfig).forEach(([key, config]) => {
      if (config.label) {
        map.set(key, config.label);
      }
    });
    return map;
  }, [categoryConfig]);

  // Format category label for display
  const formatCategoryLabel = (category: string) => {
    return categoryLabelMap.get(category) || category;
  };

  // Filtered categories for search
  const filteredCategories = useMemo(() => {
    if (!categorySearchTerm.trim()) return categories;
    const search = categorySearchTerm.toLowerCase();
    return categories.filter(cat => {
      const label = formatCategoryLabel(cat).toLowerCase();
      return label.includes(search) || cat.toLowerCase().includes(search);
    });
  }, [categories, categorySearchTerm, categoryLabelMap]);

  // Category selection handlers
  const toggleCategory = (category: string) => {
    const newSelection = new Set(selectedCategories);
    if (newSelection.has(category)) {
      newSelection.delete(category);
    } else {
      newSelection.add(category);
    }
    setSelectedCategories(newSelection);
  };

  const selectAllCategories = () => {
    setSelectedCategories(new Set(categories));
  };

  const clearAllCategories = () => {
    setSelectedCategories(new Set());
  };

  // Click outside to close category dropdown
  // Already declared above, remove duplicate declarations

  // Apply search, filters, and sorting
  const processedBoms = useMemo(() => {
    let result = [...filteredBoms];

    if (componentFilter?.sku) {
      result = result.filter(bom =>
        bom.components?.some(component => component.sku === componentFilter.sku)
      );
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(bom =>
        bom.name.toLowerCase().includes(query) ||
        bom.finishedSku.toLowerCase().includes(query) ||
        bom.category?.toLowerCase().includes(query) ||
        bom.components.some(c =>
          c.name.toLowerCase().includes(query) ||
          c.sku.toLowerCase().includes(query)
        )
      );
    }

    // Category filter
    if (selectedCategories.size > 0) {
      result = result.filter(bom => bom.category && selectedCategories.has(bom.category));
    }

    // Buildability filter
    if (buildabilityFilter !== 'all') {
      result = result.filter(bom => {
        const { maxBuildable } = calculateBuildability(bom);
        const finished = inventoryMap.get(bom.finishedSku);
        const stock = finished?.stock ?? 0;
        const runwayDays = finished?.daysOfStock ?? null;

        switch (buildabilityFilter) {
          case 'buildable':
            return maxBuildable > 0;
          case 'not-buildable':
            return maxBuildable === 0;
          case 'out-of-stock':
            return stock <= 0;
          case 'near-oos':
            if (runwayDays !== null) {
              return runwayDays <= 10;
            }
            return stock <= (finished?.reorderPoint ?? 0);
          default:
            return true;
        }
      });
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'sku':
          return a.finishedSku.localeCompare(b.finishedSku);
        case 'inventory': {
          const stockA = inventoryMap.get(a.finishedSku)?.stock || 0;
          const stockB = inventoryMap.get(b.finishedSku)?.stock || 0;
          return stockB - stockA;
        }
        case 'buildability': {
          const buildA = calculateBuildability(a).maxBuildable;
          const buildB = calculateBuildability(b).maxBuildable;
          return buildB - buildA;
        }
        case 'category':
          return (a.category || '').localeCompare(b.category || '');
        case 'velocity': {
          const velA = inventoryMap.get(a.finishedSku)?.salesVelocity || 0;
          const velB = inventoryMap.get(b.finishedSku)?.salesVelocity || 0;
          return velB - velA;
        }
        case 'runway': {
          // Calculate runway as stock / velocity (days of stock remaining)
          const itemA = inventoryMap.get(a.finishedSku);
          const itemB = inventoryMap.get(b.finishedSku);
          const runwayA = (itemA?.salesVelocity && itemA.salesVelocity > 0) 
            ? (itemA.stock || 0) / itemA.salesVelocity 
            : (itemA?.stock || 0) > 0 ? 999 : 0; // If no velocity but has stock, put at end
          const runwayB = (itemB?.salesVelocity && itemB.salesVelocity > 0)
            ? (itemB.stock || 0) / itemB.salesVelocity
            : (itemB?.stock || 0) > 0 ? 999 : 0;
          return runwayA - runwayB; // Ascending: shortest runway first
        }
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return result;
  }, [filteredBoms, searchQuery, selectedCategories, buildabilityFilter, sortBy, inventoryMap, componentFilter]);

  // Identify critical alerts
  const criticalBoms = useMemo(() => {
    return processedBoms.filter(bom => {
      const { maxBuildable } = calculateBuildability(bom);
      return maxBuildable === 0 && (inventoryMap.get(bom.finishedSku)?.stock || 0) === 0;
    });
  }, [processedBoms, inventoryMap]);

  // Group BOMs if groupBy is not 'none'
  const groupedBoms = useMemo(() => {
    if (groupBy === 'none') {
      return { 'All BOMs': processedBoms };
    }

    const groups: Record<string, BillOfMaterials[]> = {};

    processedBoms.forEach(bom => {
      let groupKey: string;

      switch (groupBy) {
        case 'category':
          groupKey = bom.category || 'Uncategorized';
          break;
        case 'buildability': {
          const { maxBuildable } = calculateBuildability(bom);
          const stock = inventoryMap.get(bom.finishedSku)?.stock || 0;
          if (maxBuildable === 0 && stock === 0) {
            groupKey = '🔴 Critical (No Stock, Cannot Build)';
          } else if (maxBuildable === 0) {
            groupKey = '🟡 Cannot Build';
          } else if (stock <= 0) {
            groupKey = '🟠 Out of Stock (Can Build)';
          } else {
            groupKey = '🟢 Ready to Build';
          }
          break;
        }
        case 'compliance': {
          // TODO: Add compliance grouping logic when compliance data available
          groupKey = 'Pending Compliance Review';
          break;
        }
        default:
          groupKey = 'Other';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(bom);
    });

    return groups;
  }, [processedBoms, groupBy, inventoryMap]);

  const BomCard: React.FC<{ bom: BillOfMaterials; labels?: any[]; complianceRecords?: any[] }> = ({ bom, labels = [], complianceRecords = [] }) => {
    const isExpanded = expandedBoms.has(bom.id);
    const finishedItem = inventoryMap.get(bom.finishedSku);
    const finishedStock = finishedItem?.stock || 0;
    const buildability = calculateBuildability(bom);

    // Get limiting SKUs and their on-order status
    const limitingSkus = useMemo(() => 
      buildability.limitingComponents.map(lc => lc.sku),
      [buildability]
    );
    
    const { getOnOrderInfo: getOnOrderInfoForSku, getAllOnOrderInfo } = useLimitingSKUOnOrder({
      limitingSkus,
      purchaseOrders
    });

    const queuedComponents = useMemo(() => {
      const map: Record<string, { status: string; poId: string | null }> = {};
      bom.components?.forEach(component => {
        const status = queueStatusBySku[component.sku];
        if (status) {
          map[component.sku] = status;
        }
      });
      return map;
    }, [bom, queueStatusBySku]);

    return (
      <div
        ref={(el) => {
          if (el) bomRefs.current.set(bom.id, el);
        }}
      >
        <EnhancedBomCard
          bom={bom}
          isExpanded={isExpanded}
          finishedStock={finishedStock}
          buildability={buildability}
          inventoryMap={inventoryMap}
          canEdit={canEdit}
          userRole={currentUser.role}
          canApprove={isOpsApprover}
          onApproveRevision={() => onApproveRevision(bom)}
          nestedBomLookup={bomLookupBySku}
          onOpenNestedBom={(nestedBom) => handleViewDetails(nestedBom)}
          labels={labels}
          complianceRecords={complianceRecords}
          componentSwapMap={componentSwaps}
          onToggleExpand={() => toggleBomExpanded(bom.id)}
          onViewDetails={() => handleViewDetails(bom)}
          onEdit={() => handleEditClick(bom)}
          onNavigateToInventory={onNavigateToInventory}
          onQuickBuild={() => openScheduleModal(bom)}
          queueStatus={queuedComponents}
          limitingSKUOnOrderData={getAllOnOrderInfo()}
          onNavigateToPurchaseOrders={onNavigateToPurchaseOrders}
        />
      </div>
    );
  };

  if (!canViewBoms) {
    return (
      <div className="p-8 text-center space-y-3">
        <h1 className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>BOM Access Restricted</h1>
        <p className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-sm`}>
          Your account does not currently have permission to manage bills of materials. Please contact an administrator if you need access.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <PageHeader
        title="Bills of Materials"
        description="Manage product recipes, buildability, and compliance documentation"
        icon={<PackageIcon className="w-6 h-6" />}
        actions={
          canSubmitRequisitions && onQuickRequest ? (
            <Button
              onClick={() => onQuickRequest()}
              className="inline-flex items-center justify-center rounded-md bg-accent-500 px-3 py-2 font-semibold text-white shadow hover:bg-accent-500 transition-colors text-sm"
            >
              Ask About Product
            </Button>
          ) : undefined
        }
      />

      {componentFilter && (
        <div className="bg-accent-900/30 border border-accent-600 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm text-accent-100 font-semibold">
              Filtering to BOMs using component {componentFilter.sku}
            </p>
            <p className="text-xs text-accent-200 mt-0.5">
              {componentFilter.componentName ? `Only BOMs that consume ${componentFilter.componentName} are displayed.` : 'Only BOMs that consume this component are displayed.'}
            </p>
          </div>
          <Button
            onClick={() => {
              setComponentFilter(null);
              try {
                localStorage.removeItem('bomComponentFilter');
              } catch (error) {
                console.warn('[BOMs] Unable to clear stored component filter', error);
              }
            }}
            className="px-4 py-2 rounded-md bg-accent-600/60 hover:bg-accent-500 text-sm font-semibold text-white border border-accent-500"
          >
            Clear Filter
          </Button>
        </div>
      )}

      {scheduleModalConfig && (
        <ScheduleBuildModal
          boms={boms}
          defaultBomId={scheduleModalConfig.bomId}
          defaultQuantity={scheduleModalConfig.defaultQuantity}
          defaultStart={scheduleModalConfig.start}
          lockProductSelection
          onClose={() => setScheduleModalConfig(null)}
          onCreate={(sku, name, quantity, scheduledDate, dueDate) => {
            onCreateBuildOrder(sku, name, quantity, scheduledDate, dueDate);
            addToast(`Scheduled ${quantity}x ${name}`, 'success');
            setScheduleModalConfig(null);
          }}
        />
      )}

      {/* Build Metrics Dashboard */}
      <BuildMetricsBanner isDark={isDark} isOpen={isAlertsOpen} onToggle={() => setIsAlertsOpen(!isAlertsOpen)} />

      {/* Compliance Dashboard - Coming Soon */}
      {/* TODO: Load all compliance records for dashboard view */}

      {/* Search, Filters, and Controls */}
      <CollapsibleSection
        title="Search & Filters"
        icon={<AdjustmentsHorizontalIcon className={`w-6 h-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />}
        variant="card"
        isOpen={isFiltersOpen}
        onToggle={() => setIsFiltersOpen(!isFiltersOpen)}
      >
        <div className={`${isDark ? 'bg-gray-800/50' : 'bg-white'} backdrop-blur-sm rounded-lg p-4 ${!isDark ? 'border border-gray-200 shadow-sm' : ''}`}>
          <div className="flex flex-col lg:flex-row gap-4">
          {/* Search Bar */}
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
              <input
                type="text"
                placeholder="Search by SKU, name, category, or component..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-10 pr-4 py-2.5 ${isDark ? 'bg-gray-900 border-gray-700 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent`}
              />
              {searchQuery && (
                <Button
                  onClick={() => setSearchQuery('')}
                  className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            {/* Buildability Filter */}
            <select
              value={buildabilityFilter}
              onChange={(e) => {
                const next = e.target.value as BuildabilityFilter;
                setBuildabilityFilter(next);
                try {
                  localStorage.setItem('bomStatusFilter', next);
                } catch (error) {
                  console.warn('[BOMs] Unable to store status filter', error);
                }
              }}
              className="min-w-[160px] rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="buildable">✓ Buildable</option>
              <option value="not-buildable">✗ Not Buildable</option>
              <option value="out-of-stock">Out of Stock</option>
              <option value="near-oos">Near OOS (≤10d)</option>
            </select>

            {/* Multi-select Category Filter */}
            <div ref={categoryDropdownRef} className={`relative ${isCategoryDropdownOpen ? 'z-40' : 'z-20'}`}>
              <Button
                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                className={`min-w-[160px] ${isDark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900 border-gray-300'} rounded-xl px-4 py-2.5 focus:ring-accent-500 focus:border-accent-500 border text-left flex justify-between items-center relative ${selectedCategories.size > 0 ? 'ring-2 ring-accent-500/50' : ''}`}
              >
                {selectedCategories.size > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-accent-500 rounded-full"></span>
                )}
                <span className="truncate">
                  {selectedCategories.size === 0
                    ? 'All Categories'
                    : selectedCategories.size === categories.length
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
                      className={`text-xs text-accent-400 hover:text-accent-300 px-2 py-1 ${isDark ? 'bg-gray-600' : 'bg-gray-200'} rounded`}
                    >
                      Select All
                    </Button>
                    <Button
                      onClick={clearAllCategories}
                      className={`text-xs ${isDark ? 'text-gray-400 hover:text-white bg-gray-600' : 'text-gray-600 hover:text-gray-900 bg-gray-200'} px-2 py-1 rounded`}
                    >
                      Clear
                    </Button>
                    <Button
                      onClick={() => {
                        setIsCategoryDropdownOpen(false);
                        setIsCategoryManagementOpen(true);
                      }}
                      className={`ml-auto text-xs text-yellow-400 hover:text-yellow-300 px-2 py-1 ${isDark ? 'bg-gray-600' : 'bg-gray-200'} rounded flex items-center gap-1`}
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

            {/* Sort By */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="min-w-[160px] rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            >
              <option value="name">Sort: Name</option>
              <option value="sku">Sort: SKU</option>
              <option value="inventory">Sort: Inventory</option>
              <option value="buildability">Sort: Buildability</option>
              <option value="category">Sort: Category</option>
              <option value="velocity">Sort: Velocity</option>
              <option value="runway">Sort: Runway</option>
            </select>

            {/* Group By */}
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupByOption)}
              className="min-w-[160px] rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            >
              <option value="none">Group: None</option>
              <option value="category">Group: Category</option>
              <option value="buildability">Group: Buildability</option>
              <option value="compliance">Group: Compliance</option>
            </select>

            {/* View Mode Toggle */}
            <div className={`flex ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'} border rounded-lg overflow-hidden`}>
              <Button
                onClick={() => setViewMode('card')}
                className={`px-3 py-2.5 transition-colors ${
                  viewMode === 'card'
                    ? 'bg-accent-500 text-white'
                    : isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
                title="Card view"
              >
                <Squares2X2Icon className="w-5 h-5" />
              </Button>
              <Button
                onClick={() => setViewMode('table')}
                className={`px-3 py-2.5 transition-colors border-l ${isDark ? 'border-gray-700' : 'border-gray-300'} ${
                  viewMode === 'table'
                    ? 'bg-accent-500 text-white'
                    : isDark ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
                title="Table view"
              >
                <ListBulletIcon className="w-5 h-5" />
              </Button>
            </div>
          </div>
          </div>

        {/* Results Count */}
        <div className={`mt-3 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Showing {processedBoms.length} of {filteredBoms.length} BOMs
          {searchQuery && <span> matching "{searchQuery}"</span>}
        </div>
      </div>
      </CollapsibleSection>

      {/* BOM Cards/Table */}
      {processedBoms.length === 0 ? (
            <div className={`${isDark ? 'bg-gray-800/30 border-gray-700' : 'bg-gray-50 border-gray-300'} rounded-lg border-2 border-dashed p-12 text-center`}>
              <h3 className={`text-lg font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-2`}>No BOMs found</h3>
              <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                Try adjusting your search or filters
              </p>
            </div>
          ) : viewMode === 'card' ? (
            <div className="space-y-6">
              {Object.entries(groupedBoms).map(([groupName, boms]) => (
                <div key={groupName}>
                  {groupBy !== 'none' && (
                    <h3 className="text-lg font-semibold text-white mb-3 px-2 flex items-center gap-2">
                      {groupName}
                      <span className={`text-sm font-normal ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>({boms.length})</span>
                    </h3>
                  )}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {boms.map(bom => (
                      <BomCard
                        key={bom.id}
                        bom={bom}
                        labels={allLabelsMap.get(bom.id) || []}
                        complianceRecords={allComplianceMap.get(bom.id) || []}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={`${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200 shadow-sm'} backdrop-blur-sm rounded-lg border overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className={`table-density min-w-full divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                  <thead className={isDark ? 'bg-gray-900' : 'bg-gray-50'}>
                    <tr>
                      <th className={`px-6 py-2 text-left text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>
                        SKU
                      </th>
                      <th className={`px-6 py-2 text-left text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>
                        Product Name
                      </th>
                      <th className={`px-6 py-2 text-left text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>
                        Category
                      </th>
                      <th className={`px-6 py-2 text-right text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>
                        Inventory
                      </th>
                      <th className={`px-6 py-2 text-right text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>
                        Can Build
                      </th>
                      <th className={`px-6 py-2 text-right text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>
                        Components
                      </th>
                      <th className={`px-6 py-2 text-right text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                    {processedBoms.map(bom => {
                      const finishedStock = inventoryMap.get(bom.finishedSku)?.stock || 0;
                      const buildability = calculateBuildability(bom);

                      return (
                        <tr
                          key={bom.id}
                          ref={(el) => {
                            if (el) bomRefs.current.set(bom.id, el);
                          }}
                          className={`${isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'} transition-colors`}
                        >
                          <td className="px-6 py-1 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => onNavigateToInventory?.(bom.finishedSku)}
                                className={`text-sm font-bold font-mono ${isDark ? 'text-white' : 'text-gray-900'} hover:opacity-70 transition-colors underline decoration-dotted ${isDark ? 'decoration-gray-500' : 'decoration-gray-400'}`}
                              >
                                {bom.finishedSku}
                              </Button>
                            </div>
                          </td>
                          <td className="px-6 py-1">
                            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{bom.name}</div>
                          </td>
                          <td className="px-6 py-1 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded ${isDark ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-100 text-gray-700 border-gray-300'} border`}>
                              {bom.category || 'N/A'}
                            </span>
                          </td>
                          <td className="px-6 py-1 whitespace-nowrap text-right">
                            <span className={`text-sm font-bold ${finishedStock > 0 ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-red-400' : 'text-red-600')}`}>
                              {finishedStock}
                            </span>
                          </td>
                          <td className="px-6 py-1 whitespace-nowrap text-right">
                            <span className={`text-sm font-bold ${buildability.maxBuildable > 0 ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-red-400' : 'text-red-600')}`}>
                              {buildability.maxBuildable}
                            </span>
                          </td>
                          <td className="px-6 py-1 whitespace-nowrap text-right">
                            <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{bom.components.length}</span>
                          </td>
                          <td className="px-6 py-1 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                onClick={() => handleViewDetails(bom)}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
                              >
                                View
                              </Button>
                              {canEdit && (
                                <Button
                                  onClick={() => handleEditClick(bom)}
                                  className="px-3 py-1.5 bg-accent-500 hover:bg-accent-600 text-white text-xs font-medium rounded transition-colors"
                                >
                                  Edit
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

      {/* Edit Modal */}
      {isModalOpen && selectedBom && (
        <BomEditModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          bom={selectedBom}
          onSave={onUpdateBom}
          inventory={inventory}
          reviewers={users}
          currentUser={currentUser}
        />
      )}

      {/* Detail Modal (Labels, Registrations, Data Sheets) */}
      {isDetailModalOpen && selectedDetailBom && (
        <BomDetailModal
          isOpen={isDetailModalOpen}
          onClose={handleCloseDetailModal}
          bom={selectedDetailBom}
          onUploadArtwork={onUploadArtwork}
          onUpdateBom={onUpdateBom}
          currentUser={currentUser}
          onApproveRevision={onApproveRevision}
          onRevertRevision={onRevertToRevision}
          reviewers={users}
        />
      )}

      {/* Compliance Detail Modal */}
      {isComplianceDetailOpen && selectedBom && selectedComplianceStatus && (
        <ComplianceDetailModal
          isOpen={isComplianceDetailOpen}
          onClose={handleCloseComplianceDetail}
          bom={selectedBom}
          complianceStatus={selectedComplianceStatus}
        />
      )}

      <CreateRequisitionModal
        isOpen={isRequisitionModalOpen}
        onClose={() => setIsRequisitionModalOpen(false)}
        inventory={inventory}
        onCreate={(items, options) => onCreateRequisition(items, options)}
      />

      {/* Category Management Modal */}
      {isCategoryManagementOpen && (
        <CategoryManagementModal
          isOpen={isCategoryManagementOpen}
          onClose={() => setIsCategoryManagementOpen(false)}
          categories={categories}
          categoryConfig={categoryConfig}
          onSave={(config) => {
            setCategoryConfig(config);
            setIsCategoryManagementOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default BOMs;
