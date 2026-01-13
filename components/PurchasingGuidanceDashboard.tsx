import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getRigorousPurchasingAdvice, getForecastAccuracyMetrics } from '../services/purchasingForecastingService';
import { detectInventoryAnomalies, type Anomaly } from '../services/aiPurchasingService';
import { getKPISummary, type KPISummary, type InventoryKPIs, type PastDuePOLine } from '../services/inventoryKPIService';
import { analyzeSupplyChainRisks, type SupplyChainRisk } from '../services/supplyChainRiskService';
import { supabase } from '../lib/supabase/client';
import { createPurchaseOrder, batchUpdateInventory } from '../hooks/useSupabaseMutations';
import { useGlobalSkuFilter } from '../hooks/useGlobalSkuFilter';
import { useSkuDismissals, type DismissReason, type SnoozeOptions } from '../hooks/useSkuDismissals';
import { MagicSparklesIcon, ShoppingCartIcon, PlusIcon, CheckCircleIcon, XCircleIcon, ArrowRightIcon, AlertTriangleIcon, TrendingUpIcon, ChevronDownIcon, ChevronUpIcon } from './icons';
import type { CreatePurchaseOrderInput } from '../types';
import SupplyChainRiskPanel from './SupplyChainRiskPanel';
import StockoutContingencyCard, { type StockoutItem } from './StockoutContingencyCard';
import VelocityTrendBadge, { type VelocityTrend, getTrendFromChange } from './VelocityTrendBadge';

// Type for expanded KPI panel
type ExpandedPanel = 'critical' | 'at_risk' | 'past_due' | 'below_ss' | null;

interface AdviceItem {
    sku: string;
    name: string;
    vendor_name: string;
    vendor_id?: string;
    days_remaining: number;
    current_status: {
        stock: number;
        on_order: number;
        total_position?: number;
    };
    linked_po?: {
        po_number: string;
        expected_date: string;
    } | null;
    item_type: string;
    parameters?: {
        rop: number;
        safety_stock: number;
        daily_demand: number;
        lead_time: number;
        service_level: string;
        abc_class: 'A' | 'B' | 'C';
        z_score: number;
    };
    recommendation: {
        action?: string;
        quantity: number;
        reason?: string;
    };
}

interface PurchasingGuidanceDashboardProps {
    onNavigateToPOs?: () => void;
    onNavigateToPO?: (poNumber: string) => void;
    onNavigateToSku?: (sku: string) => void;
    onNavigateToInventoryFilter?: (filter: string) => void;
}

export default function PurchasingGuidanceDashboard({ 
    onNavigateToPOs, 
    onNavigateToPO, 
    onNavigateToSku,
    onNavigateToInventoryFilter 
}: PurchasingGuidanceDashboardProps = {}) {
    const [advice, setAdvice] = useState<AdviceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [kpiSummary, setKpiSummary] = useState<KPISummary | null>(null);
    const [metrics, setMetrics] = useState<any>({
        accuracy: null,
        riskItems: 0,
        criticalItems: 0,
        atRiskItems: 0,
        vendorReliability: null,
        inventoryTurnover: null,
        excessValue: 0,
        avgCltr: null,
        pastDueLines: 0,
        leadTimeBias: null,
        safetyStockShortfall: 0,
    });

    const [agentInsights, setAgentInsights] = useState<{
        critical: Anomaly[];
        warning: Anomaly[];
    }>({ critical: [], warning: [] });

    // KPI detail panel state
    const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null);

    // Selection state for batch actions (main replenishment table)
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [isCreatingPO, setIsCreatingPO] = useState(false);

    // Selection state for KPI panel items
    const [selectedKPIItems, setSelectedKPIItems] = useState<Set<string>>(new Set());

    // Toast notifications
    const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([]);

    // Supply chain risks (from PAB analysis)
    const [supplyChainRisks, setSupplyChainRisks] = useState<SupplyChainRisk[]>([]);
    const [risksLoading, setRisksLoading] = useState(false);

    // Out of stock items
    const [stockoutItems, setStockoutItems] = useState<StockoutItem[]>([]);

    // Global SKU filter - exclude SKUs marked as "do not reorder"
    const { isExcluded: isSkuExcluded } = useGlobalSkuFilter();

    // SKU dismissals - dismiss with reason or snooze for later
    const { isDismissed, dismissSku, snoozeSku, refresh: refreshDismissals } = useSkuDismissals();

    // Ref for scrolling to replenishment section
    const replenishmentRef = useRef<HTMLDivElement>(null);

    const scrollToReplenishment = () => {
        replenishmentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // Add a toast notification
    const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        const id = crypto.randomUUID();
        setToasts(prev => [...prev, { id, message, type }]);
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
    }, []);

    // Generate unique PO ID
    const generateOrderId = useCallback(() => {
        const now = new Date();
        const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const randomSegment = crypto.randomUUID().split('-')[0].toUpperCase();
        return `PO-${datePart}-${randomSegment}`;
    }, []);

    useEffect(() => {
        loadData();

        const intervalId = setInterval(() => {
            loadData(true); // Silent refresh
        }, 5 * 60 * 1000); // Refresh every 5 minutes

        return () => clearInterval(intervalId);
    }, []);

    // Initial agent run
    useEffect(() => {
        runAgentAnalysis();
    }, []);

    async function runAgentAnalysis() {
        try {
            console.log('🤖 Running Agent Analysis...');
            const result = await detectInventoryAnomalies();
            setAgentInsights({
                critical: result.critical || [],
                warning: result.warning || []
            });
        } catch (err) {
            console.error('Agent analysis failed', err);
        }
    }

    async function loadData(silent = false) {
        if (!silent) setLoading(true);
        try {
            // 1. Get Purchasing Advice
            const adviceData = await getRigorousPurchasingAdvice();
            setAdvice(adviceData);

            // 2. Get comprehensive KPI Summary from inventoryKPIService
            let kpis: KPISummary | null = null;
            try {
                kpis = await getKPISummary();
                setKpiSummary(kpis);
                console.log('📊 KPI Summary loaded:', kpis);
            } catch (err) {
                console.error('Failed to load KPI summary:', err);
            }

            // 2b. Get Supply Chain Risks (PAB-based analysis)
            setRisksLoading(true);
            try {
                const riskResult = await analyzeSupplyChainRisks({
                    horizon_days: 60,
                    include_bom_explosion: true,
                    min_daily_demand: 0.1,
                    safety_stock_days: 14,
                });
                setSupplyChainRisks(riskResult.all_risks || []);
                console.log('⚠️ Supply Chain Risks loaded:', riskResult.all_risks?.length || 0);
            } catch (err) {
                console.error('Failed to load supply chain risks:', err);
                setSupplyChainRisks([]);
            } finally {
                setRisksLoading(false);
            }

            // 2c. Identify out-of-stock items from advice data
            const stockouts: StockoutItem[] = adviceData
                .filter((item: AdviceItem) => item.current_status.stock === 0)
                .map((item: AdviceItem) => ({
                    sku: item.sku,
                    product_name: item.name,
                    pending_demand: Math.round((item.parameters?.daily_demand || 0) * 7), // 7-day demand
                    restock_eta: item.linked_po?.expected_date ? new Date(item.linked_po.expected_date) : null,
                    restock_po_number: item.linked_po?.po_number || null,
                    restock_quantity: item.recommendation?.quantity || 0,
                }));
            setStockoutItems(stockouts);

            // 3. Get Forecast Accuracy (if available)
            let accuracy: number | null = null;
            try {
                const forecasts = await getForecastAccuracyMetrics();
                accuracy = forecasts.length > 0
                    ? forecasts.reduce((acc: number, f: any) => acc + (f.error_pct || 0), 0) / forecasts.length
                    : null;
            } catch (err) {
                console.debug('Forecast metrics not available:', err);
            }

            // 4. Calculate Vendor Reliability from lead time bias
            // If avg_lead_time_bias is near 0 or negative = reliable (on-time or early)
            let vendorReliability: number | null = null;
            if (kpis && kpis.avg_lead_time_bias !== undefined) {
                // Convert bias to reliability: bias of 0 = 100%, bias of 7+ = ~50%
                const biasImpact = Math.max(0, Math.min(50, kpis.avg_lead_time_bias * 7));
                vendorReliability = 100 - biasImpact;
            }

            // 5. Calculate Inventory Turnover from actual inventory data
            let inventoryTurnover: number | null = null;
            try {
                const { data: inventoryData, error: invError } = await supabase
                    .from('inventory_items')
                    .select('sales_last_30_days, stock')
                    .eq('status', 'active')
                    .gt('stock', 0);

                if (!invError && inventoryData && inventoryData.length > 0) {
                    // Calculate daily velocity from 30-day sales
                    const totalDailyVelocity = inventoryData.reduce((sum: number, item: { sales_last_30_days: number | null }) =>
                        sum + ((item.sales_last_30_days || 0) / 30), 0);
                    const totalStock = inventoryData.reduce((sum: number, item: { stock: number | null }) =>
                        sum + (item.stock || 0), 0);

                    if (totalStock > 0) {
                        // Annual turnover = (daily velocity * 365) / avg stock
                        inventoryTurnover = (totalDailyVelocity * 365) / totalStock;
                    }
                }
            } catch (err) {
                console.debug('Inventory data not available for turnover:', err);
            }

            // Build metrics object with KPI data
            setMetrics({
                accuracy: accuracy ? (100 - accuracy).toFixed(1) : 'N/A',
                riskItems: adviceData.length,
                criticalItems: kpis?.items_critical_cltr || 0,
                atRiskItems: kpis?.items_at_risk_cltr || 0,
                avgCltr: kpis ? kpis.avg_cltr.toFixed(2) : 'N/A',
                vendorReliability: vendorReliability !== null ? vendorReliability.toFixed(0) : 'N/A',
                inventoryTurnover: inventoryTurnover !== null ? inventoryTurnover.toFixed(1) : 'N/A',
                excessValue: kpis?.total_excess_value || 0,
                pastDueLines: kpis?.total_past_due_lines || 0,
                leadTimeBias: kpis ? kpis.avg_lead_time_bias.toFixed(1) : null,
                safetyStockShortfall: kpis?.safety_stock_shortfall_items || 0,
            });

        } catch (err) {
            console.error('Failed to load purchasing guidance', err);
        } finally {
            if (!silent) setLoading(false);
        }
    }

    // Toggle single item selection
    const toggleSelect = (sku: string) => {
        setSelectedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sku)) {
                newSet.delete(sku);
            } else {
                newSet.add(sku);
            }
            return newSet;
        });
    };

    // Toggle all items (only items needing orders, not ones already on PO, excluding globally excluded SKUs)
    const toggleSelectAll = () => {
        const needsOrderSkus = advice
            .filter(item => !item.linked_po && !isSkuExcluded(item.sku))
            .map(item => item.sku);
        if (selectedItems.size === needsOrderSkus.length && needsOrderSkus.length > 0) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(needsOrderSkus));
        }
    };

    // Group selected items by vendor for PO creation
    const getSelectedByVendor = () => {
        const byVendor: Record<string, AdviceItem[]> = {};
        advice.filter(item => selectedItems.has(item.sku)).forEach(item => {
            const vendor = item.vendor_name || 'Unknown';
            if (!byVendor[vendor]) byVendor[vendor] = [];
            byVendor[vendor].push(item);
        });
        return byVendor;
    };

    // Create draft PO for selected items
    const handleCreatePO = async () => {
        if (selectedItems.size === 0) return;

        setIsCreatingPO(true);
        const byVendor = getSelectedByVendor();
        const vendorNames = Object.keys(byVendor);
        let successCount = 0;
        let errorCount = 0;
        const createdPOs: string[] = [];

        try {
            // Create one PO per vendor
            for (const vendorName of vendorNames) {
                const vendorItems = byVendor[vendorName];
                const vendorId = vendorItems[0]?.vendor_id;

                if (!vendorId) {
                    // Try to look up vendor by name
                    const { data: vendorData } = await supabase
                        .from('vendors')
                        .select('id')
                        .ilike('name', vendorName)
                        .limit(1)
                        .maybeSingle();

                    if (!vendorData?.id) {
                        console.warn(`[handleCreatePO] Could not find vendor ID for ${vendorName}`);
                        errorCount++;
                        addToast(`Could not find vendor: ${vendorName}`, 'error');
                        continue;
                    }

                    const orderId = generateOrderId();
                    const poInput: CreatePurchaseOrderInput = {
                        vendorId: vendorData.id,
                        items: vendorItems.map(item => ({
                            sku: item.sku,
                            name: item.name,
                            quantity: item.recommendation.quantity,
                            unitCost: 0, // Will be filled in by user when editing
                        })),
                        notes: `Auto-generated from Purchasing Intelligence dashboard`,
                    };

                    const result = await createPurchaseOrder({
                        ...poInput,
                        orderId,
                        supplier: vendorName,
                        status: 'Pending',
                        orderDate: new Date().toISOString().split('T')[0],
                    });

                    if (result.success) {
                        createdPOs.push(orderId);
                        successCount++;

                        // Update on_order quantities
                        await batchUpdateInventory(
                            vendorItems.map(item => ({
                                sku: item.sku,
                                stockDelta: 0,
                                onOrderDelta: item.recommendation.quantity,
                            }))
                        );
                    } else {
                        errorCount++;
                        console.error(`[handleCreatePO] Failed to create PO for ${vendorName}:`, result.error);
                    }
                } else {
                    const orderId = generateOrderId();
                    const poInput: CreatePurchaseOrderInput = {
                        vendorId,
                        items: vendorItems.map(item => ({
                            sku: item.sku,
                            name: item.name,
                            quantity: item.recommendation.quantity,
                            unitCost: 0,
                        })),
                        notes: `Auto-generated from Purchasing Intelligence dashboard`,
                    };

                    const result = await createPurchaseOrder({
                        ...poInput,
                        orderId,
                        supplier: vendorName,
                        status: 'Pending',
                        orderDate: new Date().toISOString().split('T')[0],
                    });

                    if (result.success) {
                        createdPOs.push(orderId);
                        successCount++;

                        // Update on_order quantities
                        await batchUpdateInventory(
                            vendorItems.map(item => ({
                                sku: item.sku,
                                stockDelta: 0,
                                onOrderDelta: item.recommendation.quantity,
                            }))
                        );
                    } else {
                        errorCount++;
                        console.error(`[handleCreatePO] Failed to create PO for ${vendorName}:`, result.error);
                    }
                }
            }

            // Show results
            if (successCount > 0) {
                addToast(
                    `Created ${successCount} PO${successCount > 1 ? 's' : ''}: ${createdPOs.join(', ')}`,
                    'success'
                );
                // Clear selection after successful creation
                setSelectedItems(new Set());
                // Reload data to reflect new on_order quantities
                loadData(true);
            }

            if (errorCount > 0) {
                addToast(`Failed to create ${errorCount} PO${errorCount > 1 ? 's' : ''}`, 'error');
            }
        } catch (err) {
            console.error('Failed to create PO:', err);
            addToast('Unexpected error creating PO', 'error');
        } finally {
            setIsCreatingPO(false);
        }
    };

    // Quick action for single item - creates a single-item PO
    const handleQuickOrder = async (item: AdviceItem) => {
        setIsCreatingPO(true);
        try {
            // Look up vendor ID
            let vendorId = item.vendor_id;
            if (!vendorId && item.vendor_name) {
                const { data: vendorData } = await supabase
                    .from('vendors')
                    .select('id')
                    .ilike('name', item.vendor_name)
                    .limit(1)
                    .maybeSingle();
                vendorId = vendorData?.id;
            }

            if (!vendorId) {
                addToast(`Could not find vendor: ${item.vendor_name}`, 'error');
                return;
            }

            const orderId = generateOrderId();
            const result = await createPurchaseOrder({
                vendorId,
                items: [{
                    sku: item.sku,
                    name: item.name,
                    quantity: item.recommendation.quantity,
                    unitCost: 0,
                }],
                notes: `Quick order from Purchasing Intelligence for ${item.sku}`,
                orderId,
                supplier: item.vendor_name,
                status: 'Pending',
                orderDate: new Date().toISOString().split('T')[0],
            });

            if (result.success) {
                // Update on_order quantity
                await batchUpdateInventory([{
                    sku: item.sku,
                    stockDelta: 0,
                    onOrderDelta: item.recommendation.quantity,
                }]);

                addToast(`Created ${orderId} for ${item.sku} (${item.recommendation.quantity} units)`, 'success');
                // Reload data to reflect new on_order quantities
                loadData(true);
            } else {
                addToast(`Failed to create PO: ${result.error}`, 'error');
            }
        } catch (err) {
            console.error('Failed to create quick order:', err);
            addToast('Unexpected error creating quick order', 'error');
        } finally {
            setIsCreatingPO(false);
        }
    };

    // Create PO for a KPI item (requires vendor lookup)
    const handleKPIQuickOrder = async (item: InventoryKPIs) => {
        setIsCreatingPO(true);
        try {
            // Look up vendor for this SKU from inventory_items
            const { data: invItem, error: invError } = await supabase
                .from('inventory_items')
                .select('vendor_id, vendors!inventory_items_vendor_id_fkey(id, name)')
                .eq('sku', item.sku)
                .maybeSingle();

            if (invError) {
                console.error('[handleKPIQuickOrder] Error looking up vendor:', invError);
                addToast(`Error looking up vendor for ${item.sku}`, 'error');
                return;
            }

            const vendorId = invItem?.vendor_id;
            const vendorName = (invItem?.vendors as any)?.name || 'Unknown Vendor';

            if (!vendorId) {
                addToast(`No vendor assigned to ${item.sku}. Please assign a vendor first.`, 'error');
                return;
            }

            // Calculate suggested order quantity based on runway and lead time
            const dailyDemand = item.demand_mean || 1;
            const targetDays = 60; // 60 days of coverage
            const currentCoverage = item.runway_days;
            const suggestedQty = Math.max(1, Math.ceil((targetDays - currentCoverage) * dailyDemand));

            const orderId = generateOrderId();
            const result = await createPurchaseOrder({
                vendorId,
                items: [{
                    sku: item.sku,
                    name: item.product_name,
                    quantity: suggestedQty,
                    unitCost: item.unit_cost || 0,
                }],
                notes: `Quick order from Stock Intelligence - CLTR: ${item.cltr.toFixed(2)} (${item.cltr_status})`,
                orderId,
                supplier: vendorName,
                status: 'Pending',
                orderDate: new Date().toISOString().split('T')[0],
            });

            if (result.success) {
                // Update on_order quantity
                await batchUpdateInventory([{
                    sku: item.sku,
                    stockDelta: 0,
                    onOrderDelta: suggestedQty,
                }]);

                addToast(`Created ${orderId} for ${item.sku} (${suggestedQty} units)`, 'success');
                // Reload data to reflect new on_order quantities
                loadData(true);
                // Clear from KPI selection
                setSelectedKPIItems(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(item.sku);
                    return newSet;
                });
            } else {
                addToast(`Failed to create PO: ${result.error}`, 'error');
            }
        } catch (err) {
            console.error('Failed to create quick order from KPI:', err);
            addToast('Unexpected error creating quick order', 'error');
        } finally {
            setIsCreatingPO(false);
        }
    };

    // Create POs for all selected KPI items (batch)
    const handleCreatePOFromKPIItems = async () => {
        if (selectedKPIItems.size === 0) return;

        setIsCreatingPO(true);
        let successCount = 0;
        let errorCount = 0;
        const createdPOs: string[] = [];

        try {
            // Get all items that need ordering
            const allItems = [
                ...(kpiSummary?.critical_cltr_items || []),
                ...(kpiSummary?.at_risk_cltr_items || []),
                ...(kpiSummary?.below_safety_stock_items || []),
            ];

            const itemsToOrder = allItems.filter(item => selectedKPIItems.has(item.sku));

            // Look up vendors for all SKUs
            const skus = itemsToOrder.map(item => item.sku);
            const { data: invItems, error: invError } = await supabase
                .from('inventory_items')
                .select('sku, vendor_id, vendors!inventory_items_vendor_id_fkey(id, name)')
                .in('sku', skus);

            if (invError) {
                addToast('Error looking up vendors', 'error');
                setIsCreatingPO(false);
                return;
            }

            // Create map of SKU -> vendor info
            const vendorMap = new Map<string, { vendorId: string; vendorName: string }>();
            (invItems || []).forEach(inv => {
                if (inv.vendor_id) {
                    vendorMap.set(inv.sku, {
                        vendorId: inv.vendor_id,
                        vendorName: (inv.vendors as any)?.name || 'Unknown',
                    });
                }
            });

            // Group items by vendor
            const byVendor = new Map<string, { vendorId: string; vendorName: string; items: InventoryKPIs[] }>();
            for (const item of itemsToOrder) {
                const vendor = vendorMap.get(item.sku);
                if (!vendor) {
                    errorCount++;
                    addToast(`No vendor for ${item.sku}`, 'error');
                    continue;
                }

                if (!byVendor.has(vendor.vendorId)) {
                    byVendor.set(vendor.vendorId, { vendorId: vendor.vendorId, vendorName: vendor.vendorName, items: [] });
                }
                byVendor.get(vendor.vendorId)!.items.push(item);
            }

            // Create one PO per vendor
            for (const [vendorId, vendorData] of byVendor) {
                const orderId = generateOrderId();
                const poItems = vendorData.items.map(item => {
                    const dailyDemand = item.demand_mean || 1;
                    const targetDays = 60;
                    const suggestedQty = Math.max(1, Math.ceil((targetDays - item.runway_days) * dailyDemand));
                    return {
                        sku: item.sku,
                        name: item.product_name,
                        quantity: suggestedQty,
                        unitCost: item.unit_cost || 0,
                    };
                });

                const result = await createPurchaseOrder({
                    vendorId,
                    items: poItems,
                    notes: `Batch order from Stock Intelligence dashboard`,
                    orderId,
                    supplier: vendorData.vendorName,
                    status: 'Pending',
                    orderDate: new Date().toISOString().split('T')[0],
                });

                if (result.success) {
                    createdPOs.push(orderId);
                    successCount++;

                    // Update on_order quantities
                    await batchUpdateInventory(
                        poItems.map(pi => ({
                            sku: pi.sku,
                            stockDelta: 0,
                            onOrderDelta: pi.quantity,
                        }))
                    );
                } else {
                    errorCount++;
                    console.error(`Failed to create PO for ${vendorData.vendorName}:`, result.error);
                }
            }

            if (successCount > 0) {
                addToast(
                    `Created ${successCount} PO${successCount > 1 ? 's' : ''}: ${createdPOs.join(', ')}`,
                    'success'
                );
                setSelectedKPIItems(new Set());
                loadData(true);
            }

            if (errorCount > 0) {
                addToast(`Failed to process ${errorCount} item${errorCount > 1 ? 's' : ''}`, 'error');
            }
        } catch (err) {
            console.error('Failed to create batch PO from KPI:', err);
            addToast('Unexpected error creating POs', 'error');
        } finally {
            setIsCreatingPO(false);
        }
    };

    // Create PO from a supply chain risk item
    const handleCreatePOFromRisk = async (sku: string, qty: number) => {
        setIsCreatingPO(true);
        try {
            // Look up vendor for this SKU
            const { data: invItem, error: invError } = await supabase
                .from('inventory_items')
                .select('sku, name, vendor_id, unit_cost, vendors!inventory_items_vendor_id_fkey(id, name)')
                .eq('sku', sku)
                .single();

            if (invError || !invItem) {
                addToast(`Item ${sku} not found`, 'error');
                setIsCreatingPO(false);
                return;
            }

            if (!invItem.vendor_id) {
                // If no vendor ID, try to find vendor ID via name match if vendor name exists in vendors object
                // If still fail...
                addToast(`No vendor assigned to ${sku}`, 'error');
                setIsCreatingPO(false);
                return;
            }

            const orderId = generateOrderId();
            
            // Fix: Construct supplier name safely
            // @ts-ignore - Supabase type for joined relation might be tricky
            const supplierName = invItem.vendors?.name || 'Unknown Supplier';

            const result = await createPurchaseOrder({
                vendorId: invItem.vendor_id,
                items: [{
                    sku: invItem.sku,
                    name: invItem.name || sku,
                    quantity: qty,
                    unitCost: invItem.unit_cost || 0,
                }],
                notes: `Created from Supply Chain Risk Alert`,
                orderId,
                supplier: supplierName
            });

            if (result.success) {
                addToast(`PO ${orderId} created for ${sku} (${qty} units)`, 'success');
                loadData(true); // Refresh data
            } else {
                addToast(`Failed to create PO: ${result.error}`, 'error');
            }
        } catch (err) {
            console.error('Failed to create PO from risk:', err);
            addToast('Unexpected error creating PO from risk', 'error');
        } finally {
            setIsCreatingPO(false);
        }
    };

    // Toggle KPI item selection
    const toggleKPISelect = (sku: string) => {
        setSelectedKPIItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sku)) {
                newSet.delete(sku);
            } else {
                newSet.add(sku);
            }
            return newSet;
        });
    };

    // Filter out globally excluded SKUs first
    // Filter out globally excluded and dismissed/snoozed SKUs
    const isHiddenSku = useCallback((sku: string) => isSkuExcluded(sku) || isDismissed(sku), [isSkuExcluded, isDismissed]);
    const filteredAdvice = advice.filter(item => !isHiddenSku(item.sku));
    const filteredStockouts = stockoutItems.filter(item => !isHiddenSku(item.sku));
    const filteredRisks = supplyChainRisks.filter(risk => !isHiddenSku(risk.sku));

    // Handlers for dismiss and snooze actions
    const handleDismiss = useCallback(async (sku: string, reason: DismissReason, notes?: string) => {
        const success = await dismissSku(sku, { reason, notes });
        if (success) {
            addToast(`${sku} dismissed (${reason})`, 'success');
        } else {
            addToast(`Failed to dismiss ${sku}`, 'error');
        }
    }, [dismissSku, addToast]);

    const handleSnooze = useCallback(async (sku: string, duration: SnoozeOptions['duration'], notes?: string) => {
        const success = await snoozeSku(sku, { duration, notes });
        if (success) {
            const durationLabel = duration === 'tomorrow' ? 'tomorrow' :
                duration === '3days' ? '3 days' :
                duration === '1week' ? '1 week' :
                duration === '2weeks' ? '2 weeks' :
                duration === '1month' ? '1 month' : duration;
            addToast(`${sku} snoozed for ${durationLabel}`, 'success');
        } else {
            addToast(`Failed to snooze ${sku}`, 'error');
        }
    }, [snoozeSku, addToast]);

    // Split advice into items needing action vs items already on order
    const needsOrder = filteredAdvice.filter(item => !item.linked_po);
    const onOrder = filteredAdvice.filter(item => !!item.linked_po);

    const selectedCount = selectedItems.size;
    const allSelected = selectedCount === needsOrder.length && needsOrder.length > 0;

    return (
        <div className="space-y-6 relative">
            {/* Toast notifications */}
            {toasts.length > 0 && (
                <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
                    {toasts.map(toast => (
                        <div
                            key={toast.id}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border animate-in slide-in-from-right duration-300 ${
                                toast.type === 'success' ? 'bg-green-900/50 border-green-500/30 text-green-300' :
                                toast.type === 'error' ? 'bg-red-900/50 border-red-500/30 text-red-300' :
                                'bg-blue-900/50 border-blue-500/30 text-blue-300'
                            }`}
                        >
                            {toast.type === 'success' && <CheckCircleIcon className="w-5 h-5 text-green-400 flex-shrink-0" />}
                            {toast.type === 'error' && <XCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0" />}
                            {toast.type === 'info' && <MagicSparklesIcon className="w-5 h-5 text-blue-400 flex-shrink-0" />}
                            <span className="text-sm font-medium">{toast.message}</span>
                            <button
                                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                                className="ml-auto text-slate-400 hover:text-slate-200"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* 1. Header & Context */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">Stock Intelligence</h2>
                    <p className="text-sm text-slate-400 mt-1">Stock levels and reorder guidance</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    <span className="text-xs text-slate-500">Agents Live</span>
                </div>
            </div>

            {/* 2. KPI Cards - "The Control Panel" */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <KPICard
                    title="Stockout Imminent"
                    value={metrics.criticalItems}
                    unit="SKUs"
                    trend={metrics.criticalItems > 0 ? 'critical' : 'positive'}
                    desc={metrics.criticalItems > 0 ? "Order now - will run out before delivery" : "All items have adequate stock"}
                    onClick={metrics.criticalItems > 0 && onNavigateToInventoryFilter ? () => onNavigateToInventoryFilter('critical') : undefined}
                    clickHint={metrics.criticalItems > 0 ? "Click to view in Inventory" : undefined}
                />
                <KPICard
                    title="Low Stock"
                    value={metrics.atRiskItems}
                    unit="SKUs"
                    trend={metrics.atRiskItems > 5 ? 'critical' : metrics.atRiskItems > 0 ? 'neutral' : 'positive'}
                    desc={metrics.atRiskItems > 0 ? "Order soon to prevent stockout" : "No items running low"}
                    onClick={metrics.atRiskItems > 0 && onNavigateToInventoryFilter ? () => onNavigateToInventoryFilter('at_risk') : undefined}
                    clickHint={metrics.atRiskItems > 0 ? "Click to view in Inventory" : undefined}
                />
                <KPICard
                    title="Past Due POs"
                    value={metrics.pastDueLines}
                    unit="Lines"
                    trend={metrics.pastDueLines > 0 ? 'critical' : 'positive'}
                    desc={metrics.pastDueLines > 0 ? "Expected deliveries not received" : "All POs on schedule"}
                    onClick={metrics.pastDueLines > 0 && onNavigateToPOs ? onNavigateToPOs : undefined}
                    clickHint={metrics.pastDueLines > 0 ? "Click to view Purchase Orders" : undefined}
                />
                <KPICard
                    title="Below Safety Stock"
                    value={metrics.safetyStockShortfall}
                    unit="SKUs"
                    trend={metrics.safetyStockShortfall > 5 ? 'critical' : metrics.safetyStockShortfall > 0 ? 'neutral' : 'positive'}
                    desc={metrics.safetyStockShortfall > 0 ? "Stock below buffer target" : "All items meet safety targets"}
                    onClick={metrics.safetyStockShortfall > 0 && onNavigateToInventoryFilter ? () => onNavigateToInventoryFilter('needs_order') : undefined}
                    clickHint={metrics.safetyStockShortfall > 0 ? "Click to view & order" : undefined}
                />
            </div>

            {/* Expanded KPI Item Panel */}
            {expandedPanel && kpiSummary && (
                <KPIItemPanel
                    panelType={expandedPanel}
                    kpiSummary={kpiSummary}
                    onClose={() => {
                        setExpandedPanel(null);
                        setSelectedKPIItems(new Set());
                    }}
                    onNavigateToPOs={onNavigateToPOs}
                    onNavigateToPO={onNavigateToPO}
                    onNavigateToSku={onNavigateToSku}
                    selectedItems={selectedKPIItems}
                    onToggleSelect={toggleKPISelect}
                    onQuickOrder={handleKPIQuickOrder}
                    onCreatePOForSelected={handleCreatePOFromKPIItems}
                    isCreatingPO={isCreatingPO}
                    scrollToReplenishment={scrollToReplenishment}
                />
            )}

            {/* 2.5 Secondary metrics row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <KPICard
                    title="Avg CLTR"
                    value={metrics.avgCltr}
                    unit=""
                    trend={metrics.avgCltr === 'N/A' ? 'neutral' : parseFloat(metrics.avgCltr) >= 1.0 ? 'positive' : 'critical'}
                    desc="Coverage-to-Lead-Time Ratio"
                />
                <KPICard
                    title="Forecast Accuracy"
                    value={metrics.accuracy}
                    unit="%"
                    trend={metrics.accuracy === 'N/A' ? 'neutral' : 'positive'}
                    desc={metrics.accuracy === 'N/A' ? "No forecast data yet" : "1 - MAPE (Last 90 Days)"}
                />
                <KPICard
                    title="Vendor Reliability"
                    value={metrics.vendorReliability}
                    unit="%"
                    trend={metrics.vendorReliability === 'N/A' ? 'neutral' : (parseFloat(metrics.vendorReliability) >= 80 ? 'positive' : 'critical')}
                    desc={metrics.vendorReliability === 'N/A' ? "No lead time data" : "Based on lead time bias"}
                />
                <KPICard
                    title="Excess Inventory"
                    value={metrics.excessValue > 1000 ? `$${(metrics.excessValue / 1000).toFixed(0)}K` : `$${metrics.excessValue.toFixed(0)}`}
                    unit=""
                    trend={metrics.excessValue > 10000 ? 'critical' : 'neutral'}
                    desc="Capital above 90-day runway"
                    onClick={metrics.excessValue > 0 && onNavigateToInventoryFilter ? () => onNavigateToInventoryFilter('overstock') : undefined}
                    clickHint={metrics.excessValue > 0 ? "Click to view in Inventory" : undefined}
                />
            </div>

            {/* 2.5 Agent Insights Section */}
            {(agentInsights.critical.length > 0 || agentInsights.warning.length > 0) && (
                <div className="bg-gradient-to-br from-purple-900/20 to-slate-800/50 rounded-xl border border-purple-500/20 p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <MagicSparklesIcon className="w-24 h-24 text-purple-400" />
                    </div>

                    <h3 className="font-semibold text-purple-300 flex items-center gap-2 mb-4">
                        <MagicSparklesIcon className="w-5 h-5 text-purple-400" />
                        Agent Insights & Anomalies
                    </h3>

                    <div className="grid gap-3">
                        {agentInsights.critical.map((insight, idx) => (
                            <div key={`crit-${idx}`} className="bg-slate-800/50 border-l-4 border-red-500 rounded-r-lg p-3 flex items-start gap-3 group hover:bg-slate-800 transition-colors">
                                <div className="text-red-400 mt-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <div className="font-medium text-white text-sm">{insight.description}</div>
                                        <button 
                                            onClick={() => onNavigateToSku?.(insight.sku)}
                                            className="text-xs text-purple-400 hover:text-purple-300 underline"
                                        >
                                            ({insight.sku})
                                        </button>
                                    </div>
                                    <div className="text-slate-400 text-xs mt-1">{insight.issue}</div>
                                    <div className="text-slate-500 text-xs mt-1 italic">Suggested: {insight.action}</div>
                                </div>
                            </div>
                        ))}
                        {agentInsights.warning.map((insight, idx) => (
                            <div key={`warn-${idx}`} className="bg-slate-800/50 border-l-4 border-amber-500 rounded-r-lg p-3 flex items-start gap-3 group hover:bg-slate-800 transition-colors">
                                <div className="text-amber-400 mt-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <div className="font-medium text-white text-sm">{insight.description}</div>
                                        <button 
                                            onClick={() => onNavigateToSku?.(insight.sku)}
                                            className="text-xs text-purple-400 hover:text-purple-300 underline"
                                        >
                                            ({insight.sku})
                                        </button>
                                    </div>
                                    <div className="text-slate-400 text-xs mt-1">{insight.issue}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Supply Chain Risk Panel - Two-sentence format with action menu */}
            {(filteredRisks.length > 0 || risksLoading) && (
                <SupplyChainRiskPanel
                    risks={filteredRisks}
                    loading={risksLoading}
                    maxItems={5}
                    onCreatePO={handleCreatePOFromRisk}
                    onAdjustROP={(sku) => addToast(`Adjust ROP for ${sku} - feature coming soon`, 'info')}
                    onMarkForReview={(sku) => addToast(`${sku} marked for review`, 'success')}
                    onViewHistory={onNavigateToSku}
                    onNavigateToSku={onNavigateToSku}
                    onDismiss={handleDismiss}
                    onSnooze={handleSnooze}
                />
            )}

            {/* Out of Stock Contingency Card */}
            {filteredStockouts.length > 0 && (
                <StockoutContingencyCard
                    items={filteredStockouts}
                    onNavigateToSku={onNavigateToSku}
                    onNavigateToPO={onNavigateToPO}
                    onCreatePO={handleCreatePOFromRisk}
                    onAdjustROP={(sku) => addToast(`Adjust ROP for ${sku} - feature coming soon`, 'info')}
                    onMarkForReview={(sku) => addToast(`${sku} marked for review`, 'success')}
                    onDismiss={handleDismiss}
                    onSnooze={handleSnooze}
                />
            )}

            {/* 3. ACTION REQUIRED - Items needing POs */}
            <div ref={replenishmentRef} className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h3 className="font-semibold text-white flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                            Action Required: Order Now
                            {needsOrder.length > 0 && (
                                <span className="text-xs font-medium text-red-400 bg-red-900/30 px-2 py-1 rounded-full ml-2">
                                    {needsOrder.length} items
                                </span>
                            )}
                        </h3>
                        {selectedCount > 0 && (
                            <span className="text-xs font-medium text-blue-400 bg-blue-900/30 px-2 py-1 rounded-full">
                                {selectedCount} selected
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {selectedCount > 0 && (
                            <button
                                onClick={handleCreatePO}
                                disabled={isCreatingPO}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                                <ShoppingCartIcon className="w-4 h-4" />
                                {isCreatingPO ? 'Creating...' : `Create PO (${selectedCount})`}
                            </button>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-slate-500">Loading analysis...</div>
                ) : needsOrder.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                        <div className="mb-2 text-2xl font-bold text-green-400">OK</div>
                        No items need ordering right now.<br />
                        <span className="text-sm opacity-75">All at-risk items already have POs placed.</span>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-900/50 text-slate-400 font-medium">
                                <tr>
                                    <th className="px-4 py-3 w-10">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                                            title="Select all items"
                                        />
                                    </th>
                                    <th className="px-4 py-3">SKU / Product</th>
                                    <th className="px-4 py-3">Vendor</th>
                                    <th className="px-4 py-3 text-center">ABC</th>
                                    <th className="px-4 py-3 text-right">Stock</th>
                                    <th className="px-4 py-3 text-right">On Order</th>
                                    <th className="px-4 py-3 text-right">Days Left</th>
                                    <th className="px-4 py-3 text-right">Order Qty</th>
                                    <th className="px-4 py-3 w-24"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {needsOrder.map((item, idx) => {
                                    const daysRemaining = item.days_remaining ?? 999;
                                    const isSelected = selectedItems.has(item.sku);
                                    const rowClass = daysRemaining <= 0 ? 'bg-red-900/20' :
                                        daysRemaining < 7 ? 'bg-red-900/10' :
                                        daysRemaining < 14 ? 'bg-yellow-900/10' : '';

                                    return (
                                        <tr
                                            key={idx}
                                            className={`${rowClass} ${isSelected ? 'ring-2 ring-inset ring-blue-500/30 bg-blue-900/20' : ''} hover:bg-slate-700/30 transition-colors cursor-pointer`}
                                            onClick={(e) => {
                                                if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'BUTTON') {
                                                    toggleSelect(item.sku);
                                                }
                                            }}
                                        >
                                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelect(item.sku)}
                                                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                                                />
                                            </td>
                                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                {onNavigateToSku ? (
                                                    <button
                                                        onClick={() => onNavigateToSku(item.sku)}
                                                        className="font-medium text-blue-400 hover:text-blue-300 hover:underline font-mono text-xs cursor-pointer text-left"
                                                    >
                                                        {item.sku}
                                                    </button>
                                                ) : (
                                                    <div className="font-medium text-white font-mono text-xs">{item.sku}</div>
                                                )}
                                                <div className="text-slate-400 text-xs max-w-[300px] truncate" title={item.name}>{item.name}</div>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-400 max-w-[120px] truncate">
                                                {item.vendor_name || 'Unknown'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {item.parameters?.abc_class && (
                                                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${
                                                        item.parameters.abc_class === 'A' ? 'bg-purple-500/30 text-purple-300 ring-1 ring-purple-500/50' :
                                                        item.parameters.abc_class === 'B' ? 'bg-blue-500/30 text-blue-300 ring-1 ring-blue-500/50' :
                                                        'bg-slate-500/30 text-slate-400'
                                                    }`} title={`ABC Class: ${item.parameters.abc_class} - ${item.parameters.abc_class === 'A' ? 'High value (80%)' : item.parameters.abc_class === 'B' ? 'Medium (15%)' : 'Low (5%)'}`}>
                                                        {item.parameters.abc_class}
                                                    </span>
                                                )}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-medium ${item.current_status.stock === 0 ? 'text-red-400' : 'text-slate-300'}`}>
                                                {item.current_status.stock}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {item.current_status.on_order > 0 ? (
                                                    <span className="text-green-400 font-medium" title={item.linked_po ? `PO: ${item.linked_po.po_number}` : undefined}>
                                                        {item.current_status.on_order}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-500">—</span>
                                                )}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-bold ${
                                                daysRemaining <= 0 ? 'text-red-400' :
                                                daysRemaining < 7 ? 'text-red-400' :
                                                daysRemaining < 14 ? 'text-yellow-400' :
                                                'text-slate-400'
                                            }`}>
                                                {daysRemaining <= 0 ? 'OUT' : daysRemaining}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                    item.recommendation.action === 'URGENT' ? 'bg-red-900/50 text-red-300 ring-1 ring-red-500/50' :
                                                    item.recommendation.action === 'Order Now' ? 'bg-amber-900/30 text-amber-300' :
                                                    'bg-blue-900/30 text-blue-300'
                                                }`} title={item.recommendation.reason}>
                                                    +{item.recommendation.quantity}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleQuickOrder(item)}
                                                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-400 hover:text-white hover:bg-blue-600 border border-blue-500/30 hover:border-blue-500 rounded transition-colors"
                                                    title={`Quick order ${item.recommendation.quantity} units`}
                                                >
                                                    <PlusIcon className="w-3 h-3" />
                                                    Order
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Batch action footer when items selected */}
                {selectedCount > 0 && (
                    <div className="px-6 py-3 bg-blue-900/20 border-t border-slate-700 flex items-center justify-between">
                        <div className="text-sm text-blue-300">
                            <strong>{selectedCount}</strong> item{selectedCount !== 1 ? 's' : ''} selected
                            {Object.keys(getSelectedByVendor()).length > 1 && (
                                <span className="ml-2 text-blue-400">
                                    ({Object.keys(getSelectedByVendor()).length} vendors)
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setSelectedItems(new Set())}
                                className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
                            >
                                Clear
                            </button>
                            <button
                                onClick={handleCreatePO}
                                disabled={isCreatingPO}
                                className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                                <ShoppingCartIcon className="w-4 h-4" />
                                Create Purchase Order{Object.keys(getSelectedByVendor()).length > 1 ? 's' : ''}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Info card for items already on order */}
            {onOrder.length > 0 && (
                <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <CheckCircleIcon className="w-5 h-5 text-green-400" />
                        <div>
                            <span className="text-sm font-medium text-green-300">
                                {onOrder.length} item{onOrder.length !== 1 ? 's' : ''} already on order
                            </span>
                            <span className="text-xs text-green-400 ml-2">
                                Track delivery status in Purchase Orders
                            </span>
                        </div>
                    </div>
                    {onNavigateToPOs && (
                        <button
                            onClick={onNavigateToPOs}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-green-400 hover:text-green-300 hover:bg-green-900/30 rounded-lg transition-colors"
                        >
                            View POs
                            <ArrowRightIcon className="w-4 h-4" />
                        </button>
                    )}
                </div>
            )}

        </div>
    );
}

interface KPICardProps {
    title: string;
    value: string | number;
    unit: string;
    trend: 'critical' | 'positive' | 'neutral';
    desc: string;
    onClick?: () => void;
    clickHint?: string;
    isExpanded?: boolean;
}

function KPICard({ title, value, unit, trend, desc, onClick, clickHint, isExpanded }: KPICardProps) {
    const isCritical = trend === 'critical';
    const isClickable = !!onClick;

    return (
        <div
            className={`p-4 rounded-xl border ${
                isExpanded
                    ? 'bg-blue-900/30 border-blue-500 ring-2 ring-blue-500/30'
                    : isCritical
                        ? 'bg-red-900/20 border-red-500/30'
                        : 'bg-slate-800/50 border-slate-700'
            } ${
                isClickable ? 'cursor-pointer hover:bg-slate-700/50 hover:border-slate-600 transition-all duration-200 group' : ''
            }`}
            onClick={onClick}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={isClickable ? (e) => e.key === 'Enter' && onClick?.() : undefined}
        >
            <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</div>
                {isExpanded && <ChevronUpIcon className="w-4 h-4 text-blue-400" />}
                {!isExpanded && isClickable && <ChevronDownIcon className="w-4 h-4 text-slate-500 opacity-0 group-hover:opacity-100" />}
            </div>
            <div className="flex items-baseline gap-1 mt-1">
                <span className={`text-2xl font-bold ${isCritical && !isExpanded ? 'text-red-400' : 'text-white'}`}>{value}</span>
                <span className="text-sm text-slate-500 font-medium">{unit}</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 truncate">
                {desc}
            </div>
            {isClickable && clickHint && !isExpanded && (
                <div className="mt-2 text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    {clickHint}
                </div>
            )}
        </div>
    );
}

// KPI Item Panel - Shows actionable items when a KPI card is clicked
interface KPIItemPanelProps {
    panelType: ExpandedPanel;
    kpiSummary: KPISummary;
    onClose: () => void;
    onNavigateToPOs?: () => void;
    onNavigateToPO?: (poNumber: string) => void;
    onNavigateToSku?: (sku: string) => void;
    selectedItems: Set<string>;
    onToggleSelect: (sku: string) => void;
    onQuickOrder: (item: InventoryKPIs) => void;
    onCreatePOForSelected: () => void;
    isCreatingPO: boolean;
    scrollToReplenishment: () => void;
}

function KPIItemPanel({ panelType, kpiSummary, onClose, onNavigateToPOs, onNavigateToPO, onNavigateToSku, selectedItems, onToggleSelect, onQuickOrder, onCreatePOForSelected, isCreatingPO, scrollToReplenishment }: KPIItemPanelProps) {
    const getPanelConfig = () => {
        switch (panelType) {
            case 'critical':
                return {
                    title: 'Stockout Imminent - Order Now',
                    subtitle: 'Stock will run out before replenishment can arrive at current demand rate',
                    items: kpiSummary.critical_cltr_items,
                    bgClass: 'bg-red-900/20 border-red-500/30',
                    headerClass: 'text-red-400',
                    totalCount: kpiSummary.items_critical_cltr,
                };
            case 'at_risk':
                return {
                    title: 'Low Stock - Order Soon',
                    subtitle: 'Running low on stock - order within the week to avoid stockout',
                    items: kpiSummary.at_risk_cltr_items,
                    bgClass: 'bg-amber-900/20 border-amber-500/30',
                    headerClass: 'text-amber-400',
                    totalCount: kpiSummary.items_at_risk_cltr,
                };
            case 'past_due':
                return {
                    title: 'Past Due PO Lines',
                    subtitle: 'Purchase order lines that have not arrived by expected date',
                    items: null,
                    pastDueLines: kpiSummary.past_due_lines,
                    bgClass: 'bg-orange-900/20 border-orange-500/30',
                    headerClass: 'text-orange-400',
                    totalCount: kpiSummary.total_past_due_lines,
                };
            case 'below_ss':
                return {
                    title: 'Below Safety Stock',
                    subtitle: 'Current stock is below the safety buffer target',
                    items: kpiSummary.below_safety_stock_items,
                    bgClass: 'bg-yellow-900/20 border-yellow-500/30',
                    headerClass: 'text-yellow-400',
                    totalCount: kpiSummary.safety_stock_shortfall_items,
                };
            default:
                return null;
        }
    };

    const config = getPanelConfig();
    if (!config) return null;

    return (
        <div className={`rounded-xl border ${config.bgClass} overflow-hidden animate-in slide-in-from-top duration-300`}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                <div>
                    <h3 className={`font-semibold ${config.headerClass}`}>
                        {config.title}
                        {config.totalCount > 50 && (
                            <span className="ml-2 text-xs font-normal text-slate-500">
                                (showing top 50 of {config.totalCount})
                            </span>
                        )}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">{config.subtitle}</p>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-slate-200"
                >
                    <XCircleIcon className="w-5 h-5" />
                </button>
            </div>

            {/* Items Table */}
            <div className="max-h-[400px] overflow-y-auto">
                {panelType === 'past_due' && config.pastDueLines ? (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-800/50 sticky top-0">
                            <tr className="text-left text-xs text-slate-400 uppercase">
                                <th className="px-6 py-2">PO Number</th>
                                <th className="px-4 py-2">SKU</th>
                                <th className="px-4 py-2">Vendor</th>
                                <th className="px-4 py-2 text-right">Days Late</th>
                                <th className="px-4 py-2 text-right">Qty</th>
                                <th className="px-6 py-2"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {config.pastDueLines.map((line, idx) => (
                                <tr key={idx} className="hover:bg-slate-700/30 text-slate-300">
                                    <td className="px-6 py-3 font-mono text-xs font-medium">
                                        {onNavigateToPO ? (
                                            <button
                                                onClick={() => onNavigateToPO(line.po_number)}
                                                className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                                            >
                                                {line.po_number}
                                            </button>
                                        ) : (
                                            <span className="text-white">{line.po_number}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs">
                                        {onNavigateToSku ? (
                                            <button
                                                onClick={() => onNavigateToSku(line.sku)}
                                                className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                                            >
                                                {line.sku}
                                            </button>
                                        ) : (
                                            <span className="text-slate-300">{line.sku}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-400 max-w-[150px] truncate">{line.vendor_name}</td>
                                    <td className="px-4 py-3 text-right font-medium text-red-400">{line.days_overdue}</td>
                                    <td className="px-4 py-3 text-right text-slate-300">{line.quantity}</td>
                                    <td className="px-6 py-3">
                                        {onNavigateToPO && (
                                            <button
                                                onClick={() => onNavigateToPO(line.po_number)}
                                                className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                                            >
                                                View PO
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : config.items && config.items.length > 0 ? (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-800/50 sticky top-0">
                            <tr className="text-left text-xs text-slate-400 uppercase">
                                <th className="px-3 py-2 w-10">
                                    <input
                                        type="checkbox"
                                        checked={config.items.every(item => selectedItems.has(item.sku))}
                                        onChange={() => {
                                            const allSelected = config.items!.every(item => selectedItems.has(item.sku));
                                            config.items!.forEach(item => {
                                                if (allSelected) {
                                                    onToggleSelect(item.sku);
                                                } else if (!selectedItems.has(item.sku)) {
                                                    onToggleSelect(item.sku);
                                                }
                                            });
                                        }}
                                        className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                                        title="Select all"
                                    />
                                </th>
                                <th className="px-4 py-2">SKU</th>
                                <th className="px-4 py-2">Product</th>
                                <th className="px-4 py-2 text-right">Stock</th>
                                <th className="px-4 py-2 text-right">Runway</th>
                                <th className="px-4 py-2 text-center">Class</th>
                                <th className="px-4 py-2 text-right">CLTR</th>
                                <th className="px-4 py-2 text-right">Safety %</th>
                                <th className="px-4 py-2 w-24"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {config.items.map((item, idx) => {
                                const isSelected = selectedItems.has(item.sku);
                                return (
                                    <tr
                                        key={idx}
                                        className={`hover:bg-slate-700/30 cursor-pointer transition-colors text-slate-300 ${isSelected ? 'bg-blue-900/20 ring-1 ring-inset ring-blue-500/30' : ''}`}
                                        onClick={() => onToggleSelect(item.sku)}
                                    >
                                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => onToggleSelect(item.sku)}
                                                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                                            />
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs font-medium" onClick={(e) => e.stopPropagation()}>
                                            {onNavigateToSku ? (
                                                <button
                                                    onClick={() => onNavigateToSku(item.sku)}
                                                    className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                                                >
                                                    {item.sku}
                                                </button>
                                            ) : (
                                                <span className="text-white">{item.sku}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-400 max-w-[180px] truncate" title={item.product_name}>
                                            {item.product_name}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-medium ${item.current_stock === 0 ? 'text-red-400' : 'text-slate-300'}`}>
                                            {item.current_stock}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-medium ${
                                            item.runway_days <= 7 ? 'text-red-400' :
                                            item.runway_days <= 14 ? 'text-amber-400' : 'text-slate-300'
                                        }`}>
                                            {item.runway_days > 365 ? '365+' : item.runway_days}d
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                item.abc_class === 'A' ? 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/30' :
                                                item.abc_class === 'B' ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30' :
                                                'bg-slate-500/20 text-slate-400 ring-1 ring-slate-500/30'
                                            }`} title={`ABC: ${item.abc_class} (${item.abc_class === 'A' ? '80% of value' : item.abc_class === 'B' ? '15% of value' : '5% of value'})`}>
                                                {item.abc_class}
                                            </span>
                                            <span className={`ml-0.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                item.xyz_class === 'X' ? 'bg-green-500/20 text-green-300 ring-1 ring-green-500/30' :
                                                item.xyz_class === 'Y' ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30' :
                                                'bg-red-500/20 text-red-300 ring-1 ring-red-500/30'
                                            }`} title={`XYZ: ${item.xyz_class} (${item.xyz_class === 'X' ? 'Predictable' : item.xyz_class === 'Y' ? 'Variable' : 'Erratic'} demand)`}>
                                                {item.xyz_class}
                                            </span>
                                        </td>
                                        <td className={`px-4 py-3 text-right font-bold ${
                                            item.cltr < 0.5 ? 'text-red-400' :
                                            item.cltr < 1.0 ? 'text-amber-400' : 'text-green-400'
                                        }`}>
                                            {item.cltr.toFixed(2)}
                                        </td>
                                        <td className={`px-4 py-3 text-right ${
                                            item.safety_stock_attainment < 50 ? 'text-red-400' :
                                            item.safety_stock_attainment < 100 ? 'text-amber-400' : 'text-green-400'
                                        }`}>
                                            {Math.round(item.safety_stock_attainment)}%
                                        </td>
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => onQuickOrder(item)}
                                                disabled={isCreatingPO}
                                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-400 hover:text-white hover:bg-blue-600 border border-blue-500/30 hover:border-blue-500 rounded transition-colors disabled:opacity-50"
                                                title="Create PO for this item"
                                            >
                                                <PlusIcon className="w-3 h-3" />
                                                Order
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <div className="p-8 text-center text-slate-500">
                        No items to display
                    </div>
                )}
            </div>

            {/* Footer with actions */}
            {panelType !== 'past_due' && config.items && config.items.length > 0 && (
                <div className="px-6 py-3 border-t border-slate-700 bg-slate-800/30">
                    {/* Selection info and batch action */}
                    {selectedItems.size > 0 ? (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-blue-400">
                                    {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                                </span>
                                <button
                                    onClick={() => {
                                        config.items!.forEach(item => {
                                            if (selectedItems.has(item.sku)) {
                                                onToggleSelect(item.sku);
                                            }
                                        });
                                    }}
                                    className="text-xs text-slate-500 hover:text-slate-300"
                                >
                                    Clear
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={scrollToReplenishment}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    View Full Workflow
                                    <ArrowRightIcon className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={onCreatePOForSelected}
                                    disabled={isCreatingPO}
                                    className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                                >
                                    <ShoppingCartIcon className="w-4 h-4" />
                                    {isCreatingPO ? 'Creating...' : `Create PO (${selectedItems.size})`}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">
                                {config.items.length} item{config.items.length !== 1 ? 's' : ''} shown
                                <span className="ml-2 text-slate-600">- Select items to create PO</span>
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={scrollToReplenishment}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    View Full Workflow
                                    <ArrowRightIcon className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={onClose}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
