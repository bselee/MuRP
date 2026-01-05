
import React, { useMemo, useState, useEffect } from 'react';
import { useTheme } from '../components/ThemeProvider';
import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Page } from '../App';
import type { BillOfMaterials, InventoryItem, HistoricalSale, Vendor, InternalRequisition, User, AiConfig, RequisitionItem, PurchaseOrder, RequisitionRequestOptions } from '../types';
import CollapsibleSection from '../components/CollapsibleSection';
import ExecutiveSummary from '../components/ExecutiveSummary';
import BuildabilityTable from '../components/BuildabilityTable';
import RenewalAlertsWidget from '../components/RenewalAlertsWidget';
import InventoryIntelligencePanel from '../components/InventoryIntelligencePanel';
import StockoutRiskWidget from '@/components/StockoutRiskWidget';
import POArrivalLeaderboard from '@/components/POArrivalLeaderboard';
import AlertsPanel from '../components/AlertsPanel';
import AgentActivityFeed from '../components/AgentActivityFeed';
import PurchasingGuidanceDashboard from '../components/PurchasingGuidanceDashboard';
import { calculateAllBuildability } from '../services/buildabilityService';
import { LightBulbIcon, ClipboardListIcon, BeakerIcon, ExclamationCircleIcon, BellIcon, CheckCircleIcon, ChartBarIcon, ClipboardDocumentListIcon, AlertCircleIcon, TrendingUpIcon, DollarSignIcon, UsersIcon, HomeIcon } from '../components/icons';

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
interface DashboardProps {
  inventory: InventoryItem[];
  boms: BillOfMaterials[];
  historicalSales: HistoricalSale[];
  vendors: Vendor[];
  requisitions: InternalRequisition[];
  users: User[];
  currentUser: User;
  purchaseOrders: PurchaseOrder[];
  onCreateRequisition: (items: RequisitionItem[], source: 'Manual' | 'System', options?: RequisitionRequestOptions) => void;
  onCreateBuildOrder: (sku: string, name: string, quantity: number, scheduledDate?: string, dueDate?: string) => void;
  setCurrentPage: (page: Page) => void;
  aiConfig: AiConfig;
}

const Dashboard: React.FC<DashboardProps> = (props) => {
  const { inventory, boms, requisitions, users, currentUser, setCurrentPage } = props;
  const isOpsAdmin = currentUser.role === 'Admin' || currentUser.department === 'Operations';
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  const [openSections, setOpenSections] = useState({
    production: false,
    buildability: false,
    shortages: false,
    renewals: false,
    requisitions: false,
    todos: false,
  });

  // Load section order from localStorage or use default
  const defaultOrder = ['production', 'buildability', 'shortages', 'renewals', 'requisitions', 'todos'];
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('dashboardSectionOrder');
    return saved ? JSON.parse(saved) : defaultOrder;
  });

  const [draggedSection, setDraggedSection] = useState<string | null>(null);

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Drag-and-drop handlers
  const handleDragStart = (section: string) => {
    setDraggedSection(section);
  };

  const handleDragOver = (e: React.DragEvent, targetSection: string) => {
    e.preventDefault();
    if (!draggedSection || draggedSection === targetSection) return;

    const newOrder = [...sectionOrder];
    const draggedIndex = newOrder.indexOf(draggedSection);
    const targetIndex = newOrder.indexOf(targetSection);

    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedSection);

    setSectionOrder(newOrder);
  };

  const handleDragEnd = () => {
    setDraggedSection(null);
    localStorage.setItem('dashboardSectionOrder', JSON.stringify(sectionOrder));
  };

  const handleCardClick = (sectionId: keyof typeof openSections) => {
    // FIX: `keyof` can return `string | number | symbol`, but `getElementById` expects a `string`.
    // Using `toString()` safely converts the key to a string for the DOM query.
    const element = document.getElementById(sectionId.toString());
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      // Also expand the section if it's closed
      if (!openSections[sectionId]) {
        toggleSection(sectionId);
      }
    }
  };

  const userMap = useMemo(() => new Map(users.map(u => [u.id, u.name])), [users]);

  const buildabilityData = useMemo(() =>
    calculateAllBuildability(boms, inventory),
    [boms, inventory]
  );

  const criticalShortages = useMemo(() =>
    inventory.filter(item => item.stock < item.reorderPoint && item.reorderPoint > 0),
    [inventory]
  );

  const pendingRequisitions = useMemo(() => {
    const managerQueue = requisitions.filter(r => r.status === 'Pending');
    const opsQueue = requisitions.filter(r => r.status === 'OpsPending');
    const sortByCreated = (list: InternalRequisition[]) =>
      [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (isOpsAdmin) {
      return sortByCreated([...opsQueue, ...managerQueue]);
    }
    if (currentUser.department === 'Operations') {
      return sortByCreated(opsQueue);
    }
    if (currentUser.role === 'Manager') {
      return sortByCreated(managerQueue.filter(r => r.department === currentUser.department));
    }
    return [];
  }, [requisitions, currentUser, isOpsAdmin]);

  const bomsMissingArtwork = useMemo(() => boms.filter(b => b.artwork.length === 0 && b.finishedSku.startsWith('PROD-')), [boms]);
  const artworkMissingDocs = useMemo(() => boms.flatMap(b => b.artwork).filter(a => !a.regulatoryDocLink), [boms]);

  // Stock Intelligence calculations
  const stockoutRisks = useMemo(() => {
    const risks: StockoutRisk[] = [];

    inventory.forEach(item => {
      const consumptionDaily = (item.sales30Days || 0) / 30;

      if (consumptionDaily === 0) return;

      const availableStock = item.stock + (item.onOrder || 0);
      const daysUntilStockout = Math.floor(availableStock / consumptionDaily);

      // Calculate trend (comparing 30-day vs 90-day)
      const trend30 = (item.sales30Days || 0) / 30;
      const trend90 = (item.sales90Days || 0) / 90;
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

    props.vendors.forEach(vendor => {
      const vendorPOs = props.purchaseOrders.filter((po: any) => po.vendorId === vendor.id);

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

      // Calculate cost stability from price variance across POs
      const allPrices: Map<string, number[]> = new Map();
      vendorPOs.forEach((po: any) => {
        if (!po.items || !Array.isArray(po.items)) return;
        po.items.forEach((item: any) => {
          const sku = item.sku || item.productSku || item.product_sku;
          const price = Number(item.unitPrice || item.unit_price || item.unitCost || item.unit_cost || 0);
          if (sku && price > 0) {
            const prices = allPrices.get(sku) || [];
            prices.push(price);
            allPrices.set(sku, prices);
          }
        });
      });

      let totalVariation = 0;
      let skuCount = 0;
      allPrices.forEach((prices) => {
        if (prices.length < 2) return;
        const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        if (mean === 0) return;
        const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
        const stdDev = Math.sqrt(variance);
        const cv = (stdDev / mean) * 100;
        totalVariation += cv;
        skuCount++;
      });

      const avgVariation = skuCount > 0 ? totalVariation / skuCount : 0;
      const costStability = Math.max(0, Math.min(100, 100 - avgVariation));

      performances.push({
        vendorId: vendor.id,
        vendorName: vendor.name,
        onTimeDeliveryRate: onTimeRate,
        averageLeadTimeActual: avgActualLeadTime,
        averageLeadTimeEstimated: vendor.leadTimeDays || 0,
        costStability: Number(costStability.toFixed(1)),
        reliabilityScore,
      });
    });

    return performances.sort((a, b) => b.reliabilityScore - a.reliabilityScore);
  }, [props.vendors, props.purchaseOrders]);

  const criticalShortagesContent = criticalShortages.length > 0 ? (
    <ul className="divide-y divide-gray-700">
      {criticalShortages.map(item => (
        <li key={item.sku} className="py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">{item.name}</p>
              <p className="text-xs text-gray-400">{item.sku}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-red-400">{item.stock} in stock</p>
              <p className="text-xs text-gray-500">Reorder at {item.reorderPoint}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  ) : <p className="text-center text-gray-400 py-8">No critical shortages. Well done!</p>;

  const canViewRequisitionWidget =
    isOpsAdmin ||
    currentUser.role === 'Manager' ||
    currentUser.department === 'Operations';

  const requisitionSectionTitle =
    currentUser.department === 'Operations' ? 'Ops Review Queue' : 'Pending Requisitions';

  const requisitionCtaLabel =
    currentUser.department === 'Operations' ? 'Open Ops Queue →' : 'View Queue →';

  const pendingRequisitionsContent = canViewRequisitionWidget ? (
    pendingRequisitions.length > 0 ? (
      <div className="space-y-3">
        <ul className="divide-y divide-gray-700">
          {pendingRequisitions.slice(0, 5).map(req => (
            <li key={req.id} className="py-2">
              <p className="text-sm font-medium text-white flex items-center justify-between">
                <span>{req.department} — {req.source === 'System' ? 'AI Signal' : (userMap.get(req.requesterId!) || 'Unknown')}</span>
                <span className="text-xs text-amber-300">
                  {req.status === 'OpsPending' ? 'Ops review' : 'Manager review'}
                </span>
              </p>
              <p className="text-xs text-gray-400">
                {req.items.length} item(s) requested on {new Date(req.createdAt).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
        <Button
          onClick={() => setCurrentPage('Purchase Orders')}
          className="text-sm font-semibold text-accent-400 hover:text-accent-300 w-full text-right mt-2"
        >
          {requisitionCtaLabel}
        </Button>
      </div>
    ) : (
      <p className="text-center text-gray-400 py-8">
        {currentUser.department === 'Operations'
          ? 'No requisitions are awaiting Operations review.'
          : 'No requisitions are pending approval.'}
      </p>
    )
  ) : (
    <p className="text-center text-gray-400 py-8">You do not have permission to view requisitions.</p>
  );

  const handleExecutiveCardClick = (status: 'In Stock' | 'Low Stock' | 'Out of Stock') => {
    const statusMap: Record<'In Stock' | 'Low Stock' | 'Out of Stock', 'buildable' | 'near-oos' | 'out-of-stock'> = {
      'In Stock': 'buildable',
      'Low Stock': 'near-oos',
      'Out of Stock': 'out-of-stock',
    };
    const filterValue = statusMap[status];
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('bomStatusFilter', filterValue);
        localStorage.setItem('dashboardBuildabilityFilter', filterValue);
      } catch {
        // no-op
      }
    }
    setCurrentPage('BOMs');
  };

  const todosContent = (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold text-gray-200">BOMs Missing Artwork ({bomsMissingArtwork.length})</h4>
        {bomsMissingArtwork.length > 0 ? (
          <ul className="text-sm text-gray-400 list-disc pl-5 mt-1">
            {bomsMissingArtwork.slice(0, 3).map(b => <li key={b.id}>{b.name}</li>)}
          </ul>
        ) : <p className="text-sm text-gray-500 mt-1">All products have artwork.</p>}
      </div>
      <div>
        <h4 className="font-semibold text-gray-200">Artwork Missing Regulatory Docs ({artworkMissingDocs.length})</h4>
        {artworkMissingDocs.length > 0 ? (
          <ul className="text-sm text-gray-400 list-disc pl-5 mt-1">
            {artworkMissingDocs.slice(0, 3).map(a => <li key={a.id}>{a.fileName}</li>)}
          </ul>
        ) : <p className="text-sm text-gray-500 mt-1">All artwork has documentation links.</p>}
      </div>
      <div className="flex justify-end gap-4 pt-2">
        <Button onClick={() => setCurrentPage('BOMs')} className="text-sm font-semibold text-accent-400 hover:text-accent-300">Manage BOMs &rarr;</Button>
        <Button onClick={() => setCurrentPage('Artwork')} className="text-sm font-semibold text-accent-400 hover:text-accent-300">Manage Artwork &rarr;</Button>
      </div>
    </div>
  );

  // Define all sections with their content
  const sections = useMemo(() => ({
    production: {
      title: 'Master Production & Planning',
      icon: <ChartBarIcon className="w-6 h-6 text-purple-400" />,
      content: (
        <InventoryIntelligencePanel
          boms={props.boms}
          inventory={props.inventory}
          historicalSales={props.historicalSales}
          vendors={props.vendors}
          purchaseOrders={props.purchaseOrders}
          onCreateRequisition={props.onCreateRequisition}
          onCreateBuildOrder={props.onCreateBuildOrder}
          aiConfig={props.aiConfig}
        />
      ),
    },
    buildability: {
      title: 'Buildability Status',
      icon: <CheckCircleIcon className="w-6 h-6 text-green-400" />,
      content: <BuildabilityTable data={buildabilityData} />,
    },
    shortages: {
      title: 'Critical Shortages',
      icon: <ExclamationCircleIcon className="w-6 h-6 text-red-400" />,
      content: criticalShortagesContent,
    },
    renewals: {
      title: 'Registration Renewal Alerts',
      icon: <BellIcon className="w-6 h-6 text-orange-400" />,
      content: (
        <RenewalAlertsWidget
          boms={boms}
          onViewDetails={(bomId) => {
            setCurrentPage('BOMs');
          }}
        />
      ),
    },
    requisitions: {
      title: requisitionSectionTitle,
      icon: <ClipboardListIcon className="w-6 h-6 text-yellow-400" />,
      content: pendingRequisitionsContent,
    },
    todos: {
      title: 'Compliance & Artwork Todos',
      icon: <BeakerIcon className="w-6 h-6 text-blue-400" />,
      content: todosContent,
    },
  }), [props, buildabilityData, criticalShortagesContent, pendingRequisitionsContent, todosContent, boms, setCurrentPage, requisitionSectionTitle]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Overview of production, buildability, and inventory intelligence"
        icon={<HomeIcon />}
        actions={
          <Button
            onClick={() => setCurrentPage('Purchase Orders')}
            size="sm"
            leftIcon={<ClipboardDocumentListIcon className="w-4 h-4" aria-hidden="true" />}
          >
            View Reorder Queue
          </Button>
        }
      />

      {/* Tabs */}
      <div className={`${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-amber-200'} backdrop-blur-sm rounded-lg border overflow-hidden`}>
        <Tabs defaultValue="dashboard">
          <div className={`border-b ${isDark ? 'border-gray-700' : 'border-amber-200'} p-2`}>
            <TabsList className="grid grid-cols-2 w-full sm:w-[400px]">
              <TabsTrigger value="dashboard" className="flex items-center justify-center gap-2">
                <HomeIcon className="w-4 h-4" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="intelligence" className="flex items-center justify-center gap-2">
                <ChartBarIcon className="w-4 h-4" />
                Stock Intelligence
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-6">
            {/* Dashboard Tab */}
            <TabsContent value="dashboard">
              {/* PRIMARY: Purchasing Intelligence - The actionable replenishment view */}
              <div className="mb-6">
                <PurchasingGuidanceDashboard />
              </div>

              {/* Secondary: Three-column layout for alerts, agent activity, arrivals */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                {/* Pending Actions / Alerts */}
                <div className={`${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-amber-200'} backdrop-blur-sm rounded-lg border overflow-hidden`}>
                  <div className={`px-3 py-2 border-b ${isDark ? 'border-gray-700' : 'border-amber-200'} flex items-center gap-2`}>
                    <BellIcon className="w-4 h-4 text-orange-400" />
                    <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Pending Actions</h4>
                  </div>
                  <div className="p-3 max-h-[300px] overflow-y-auto">
                    <AlertsPanel />
                  </div>
                </div>

                {/* Agent Activity */}
                <div className={`${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-amber-200'} backdrop-blur-sm rounded-lg border overflow-hidden`}>
                  <div className={`px-3 py-2 border-b ${isDark ? 'border-gray-700' : 'border-amber-200'} flex items-center gap-2`}>
                    <CheckCircleIcon className="w-4 h-4 text-green-400" />
                    <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Agent Activity</h4>
                  </div>
                  <div className="p-3 max-h-[300px] overflow-y-auto">
                    <AgentActivityFeed />
                  </div>
                </div>

                {/* PO Arrivals - Compact */}
                <div className={`${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-amber-200'} backdrop-blur-sm rounded-lg border overflow-hidden`}>
                  <div className={`px-3 py-2 border-b ${isDark ? 'border-gray-700' : 'border-amber-200'} flex items-center gap-2`}>
                    <ClipboardDocumentListIcon className="w-4 h-4 text-blue-400" />
                    <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Incoming POs</h4>
                  </div>
                  <div className="p-3 max-h-[300px] overflow-y-auto">
                    <POArrivalLeaderboard />
                  </div>
                </div>
              </div>

              {/* Buildability Summary */}
              <ExecutiveSummary
                data={buildabilityData}
                onCardClick={handleExecutiveCardClick}
              />

              <div className="space-y-6 mt-6">
                {sectionOrder.map((sectionId) => {
                  const section = sections[sectionId as keyof typeof sections];
                  if (!section) return null;

                  return (
                    <div
                      key={sectionId}
                      draggable
                      onDragStart={() => handleDragStart(sectionId)}
                      onDragOver={(e) => handleDragOver(e, sectionId)}
                      onDragEnd={handleDragEnd}
                      className={`transition-opacity ${draggedSection === sectionId ? 'opacity-50' : 'opacity-100'}`}
                    >
                      <CollapsibleSection
                        id={sectionId}
                        title={section.title}
                        icon={section.icon}
                        variant="card"
                        isOpen={openSections[sectionId as keyof typeof openSections]}
                        onToggle={() => toggleSection(sectionId as keyof typeof openSections)}
                      >
                        {section.content}
                      </CollapsibleSection>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {/* Stock Intelligence Tab */}
            <TabsContent value="intelligence">
              <div className="space-y-6">
                {/* Header */}
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    <ChartBarIcon className="w-6 h-6 text-accent-400" />
                    Stock Intelligence
                  </h2>
                  <p className={`${isDark ? 'text-gray-400' : 'text-amber-700'} mt-1`}>Advanced analytics and predictive insights for inventory management</p>
                </div>

                {/* Key Metrics Summary */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className={`${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-amber-200'} backdrop-blur-sm rounded-lg border p-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-amber-700'}`}>Critical Risks</p>
                        <p className="text-2xl font-bold text-red-400">{stockoutRisks.filter(r => r.riskLevel === 'critical').length}</p>
                      </div>
                      <AlertCircleIcon className="w-8 h-8 text-red-400/50" />
                    </div>
                  </div>

                  <div className={`${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-amber-200'} backdrop-blur-sm rounded-lg border p-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-amber-700'}`}>High Priority</p>
                        <p className="text-2xl font-bold text-orange-400">{stockoutRisks.filter(r => r.riskLevel === 'high').length}</p>
                      </div>
                      <AlertCircleIcon className="w-8 h-8 text-orange-400/50" />
                    </div>
                  </div>

                  <div className={`${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-amber-200'} backdrop-blur-sm rounded-lg border p-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-amber-700'}`}>Trending Up</p>
                        <p className="text-2xl font-bold text-green-400">
                          {stockoutRisks.filter(r => r.trendDirection === 'up').length}
                        </p>
                      </div>
                      <TrendingUpIcon className="w-8 h-8 text-green-400/50" />
                    </div>
                  </div>

                  <div className={`${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-amber-200'} backdrop-blur-sm rounded-lg border p-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-amber-700'}`}>Active Vendors</p>
                        <p className="text-2xl font-bold text-accent-400">{vendorPerformances.length}</p>
                      </div>
                      <UsersIcon className="w-8 h-8 text-accent-400/50" />
                    </div>
                  </div>
                </div>

                {/* Intelligence Tabs */}
                <div className={`${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-amber-200'} backdrop-blur-sm rounded-lg border overflow-hidden`}>
                  <Tabs defaultValue="risks">
                    <div className="border-b border-gray-700 p-2">
                      <TabsList className="grid grid-cols-3 w-full">
                        <TabsTrigger value="risks" className="flex items-center justify-center gap-2">
                          <AlertCircleIcon className="w-4 h-4" />
                          <span className="hidden md:inline">Risks</span>
                          <span className="md:hidden">Risks</span>
                        </TabsTrigger>
                        <TabsTrigger value="trends" className="flex items-center justify-center gap-2">
                          <TrendingUpIcon className="w-4 h-4" />
                          <span className="hidden md:inline">Trends</span>
                          <span className="md:hidden">Trends</span>
                        </TabsTrigger>
                        <TabsTrigger value="vendors" className="flex items-center justify-center gap-2">
                          <UsersIcon className="w-4 h-4" />
                          <span className="hidden md:inline">Vendors</span>
                          <span className="md:hidden">Vends</span>
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    <div className="p-6">
                      {/* Stockout Risks Tab */}
                      <TabsContent value="risks">
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold text-white">Stockout Risk Analysis</h3>
                          <StockoutRiskWidget risks={stockoutRisks} />
                        </div>
                      </TabsContent>

                      {/* Trends & Patterns Tab */}
                      <TabsContent value="trends">
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold text-white">Consumption Trends & Seasonal Patterns</h3>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="bg-gray-800/30 rounded-lg p-4">
                              <h4 className="text-sm font-semibold text-gray-300 mb-3">Growing Demand (30d vs 90d)</h4>
                              <div className="space-y-2">
                                {inventory
                                  .filter(item => {
                                    const trend30 = (item.sales30Days || 0) / 30;
                                    const trend90 = (item.sales90Days || 0) / 90;
                                    return trend30 > trend90 * 1.15;
                                  })
                                  .slice(0, 10)
                                  .map(item => {
                                    const growth = ((((item.sales30Days || 0) / 30) / ((item.sales90Days || 0) / 90)) - 1) * 100;
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
                                    const trend30 = (item.sales30Days || 0) / 30;
                                    const trend90 = (item.sales90Days || 0) / 90;
                                    return trend30 < trend90 * 0.85 && trend90 > 0;
                                  })
                                  .slice(0, 10)
                                  .map(item => {
                                    const decline = ((((item.sales30Days || 0) / 30) / ((item.sales90Days || 0) / 90)) - 1) * 100;
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
                      </TabsContent>

                      {/* Vendor Performance Tab */}
                      <TabsContent value="vendors">
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
                                      <div className="text-2xl font-bold text-accent-400">{vp.reliabilityScore}</div>
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
                                      className={`h-full rounded-full ${vp.reliabilityScore >= 80 ? 'bg-green-500' :
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
                      </TabsContent>

                      </div>
                  </Tabs>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

// Helper components found in original file (RiskBadge and TrendIndicator) need to be preserved or redefined if they were local.


export default Dashboard;
