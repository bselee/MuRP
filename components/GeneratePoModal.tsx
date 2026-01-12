import React, { useMemo, useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import type { InternalRequisition, InventoryItem, Vendor, CreatePurchaseOrderItemInput } from '../types';
import Modal from './Modal';
import { getLastPurchasePrices, type LastPurchasePrice } from '../services/vendorPricingService';
import { useTheme } from './ThemeProvider';

interface GeneratePoModalProps {
    isOpen: boolean;
    onClose: () => void;
    approvedRequisitions: InternalRequisition[];
    inventory: InventoryItem[];
    vendors: Vendor[];
    onPrepareDrafts: (posToCreate: { vendorId: string; items: CreatePurchaseOrderItemInput[]; requisitionIds: string[]; }[]) => void;
}

// Trend indicator component
const TrendIndicator: React.FC<{
    trend?: 'up' | 'down' | 'stable';
    percent?: number;
    isDark: boolean;
}> = ({ trend, percent, isDark }) => {
    if (!trend || trend === 'stable') return null;

    if (trend === 'up') {
        return (
            <span
                className={`inline-flex items-center text-xs ${isDark ? 'text-red-400' : 'text-red-600'}`}
                title={`Price increased ${percent}% from last order`}
            >
                <svg className="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                {percent ? `+${percent}%` : ''}
            </span>
        );
    }

    return (
        <span
            className={`inline-flex items-center text-xs ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}
            title={`Price decreased ${Math.abs(percent || 0)}% from last order`}
        >
            <svg className="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            {percent ? `${percent}%` : ''}
        </span>
    );
};

// Price badge showing last purchase info
const PriceBadge: React.FC<{
    currentPrice: number;
    priceInfo?: LastPurchasePrice;
    isDark: boolean;
}> = ({ currentPrice, priceInfo, isDark }) => {
    if (!priceInfo) {
        // No historical price - show current only
        if (currentPrice > 0) {
            return (
                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    ${currentPrice.toFixed(2)}
                </span>
            );
        }
        return (
            <span className={`text-xs italic ${isDark ? 'text-amber-500' : 'text-amber-600'}`}>
                No price data
            </span>
        );
    }

    const lastPrice = priceInfo.lastPrice;
    const priceDiff = currentPrice - lastPrice;
    const showDiff = currentPrice > 0 && Math.abs(priceDiff) > 0.01;

    return (
        <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-1.5">
                <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    ${lastPrice.toFixed(2)}
                </span>
                <TrendIndicator trend={priceInfo.trend} percent={priceInfo.trendPercent} isDark={isDark} />
            </div>
            {priceInfo.lastOrderDate && (
                <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    Last: {new Date(priceInfo.lastOrderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
            )}
            {showDiff && (
                <span className={`text-[10px] ${
                    priceDiff > 0
                        ? isDark ? 'text-red-400' : 'text-red-500'
                        : isDark ? 'text-emerald-400' : 'text-emerald-500'
                }`}>
                    vs inv: {priceDiff > 0 ? '+' : ''}${priceDiff.toFixed(2)}
                </span>
            )}
        </div>
    );
};

const GeneratePoModal: React.FC<GeneratePoModalProps> = ({ isOpen, onClose, approvedRequisitions, inventory, vendors, onPrepareDrafts }) => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme !== 'light';

    const [priceData, setPriceData] = useState<Record<string, LastPurchasePrice>>({});
    const [loadingPrices, setLoadingPrices] = useState(false);

    const inventoryMap = useMemo(() => new Map(inventory.map(i => [i.sku, i])), [inventory]);
    const vendorMap = useMemo(() => new Map(vendors.map(v => [v.id, v.name])), [vendors]);

    const posToGenerate = useMemo(() => {
        if (!isOpen) return []; // Don't compute if not open

        const aggregatedItems = new Map<string, { sku: string; name: string; quantity: number; unitCost: number; requisitionIds: Set<string> }>();

        approvedRequisitions.forEach(req => {
            req.items.forEach(item => {
                const existing = aggregatedItems.get(item.sku);
                if (existing) {
                    existing.quantity += item.quantity;
                    existing.requisitionIds.add(req.id);
                } else {
                    // Use historical price if available, otherwise fall back to inventory
                    const historicalPrice = priceData[item.sku]?.lastPrice;
                    const inventoryPrice = inventoryMap.get(item.sku)?.unitCost ?? 0;

                    aggregatedItems.set(item.sku, {
                        sku: item.sku,
                        name: item.name,
                        quantity: item.quantity,
                        unitCost: historicalPrice || inventoryPrice,
                        requisitionIds: new Set([req.id])
                    });
                }
            });
        });

        const groupedByVendor = new Map<string, {
            vendorId: string;
            items: { sku: string; name: string; quantity: number; unitCost: number }[];
            requisitionIds: string[];
        }>();

        for (const item of aggregatedItems.values()) {
            const inventoryItem = inventoryMap.get(item.sku);
            const vendorId = inventoryItem?.vendorId;
            if (vendorId && vendorId !== 'N/A') {
                const existingVendorGroup = groupedByVendor.get(vendorId);
                if (existingVendorGroup) {
                    existingVendorGroup.items.push({ sku: item.sku, name: item.name, quantity: item.quantity, unitCost: item.unitCost });
                    item.requisitionIds.forEach(id => {
                        if (!existingVendorGroup.requisitionIds.includes(id)) {
                             existingVendorGroup.requisitionIds.push(id);
                        }
                    });
                } else {
                    groupedByVendor.set(vendorId, {
                        vendorId,
                        items: [{ sku: item.sku, name: item.name, quantity: item.quantity, unitCost: item.unitCost }],
                        requisitionIds: Array.from(item.requisitionIds)
                    });
                }
            }
        }
        return Array.from(groupedByVendor.values());
    }, [approvedRequisitions, inventoryMap, isOpen, priceData]);

    // Fetch historical prices when modal opens
    useEffect(() => {
        if (!isOpen) return;

        const fetchPrices = async () => {
            // Collect all unique SKUs from approved requisitions
            const allSkus = new Set<string>();
            approvedRequisitions.forEach(req => {
                req.items.forEach(item => allSkus.add(item.sku));
            });

            if (allSkus.size === 0) return;

            setLoadingPrices(true);
            try {
                const result = await getLastPurchasePrices(Array.from(allSkus));
                if (result.success && result.data) {
                    setPriceData(result.data);
                }
            } catch (err) {
                console.error('[GeneratePoModal] Failed to fetch prices:', err);
            } finally {
                setLoadingPrices(false);
            }
        };

        fetchPrices();
    }, [isOpen, approvedRequisitions]);

    // Calculate totals for each PO
    const totals = useMemo(() => {
        const result: Record<string, number> = {};
        for (const po of posToGenerate) {
            result[po.vendorId] = po.items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
        }
        return result;
    }, [posToGenerate]);

    const handleGenerate = () => {
        onPrepareDrafts(posToGenerate);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Generate Purchase Orders from Requisitions">
            <div className="space-y-6">
                <div>
                    <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                        This will generate <span className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{posToGenerate.length}</span> purchase order(s) based on all approved requisitions. Please review the summary below.
                    </p>
                    {loadingPrices && (
                        <p className={`text-xs mt-2 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                            Loading historical prices...
                        </p>
                    )}
                </div>

                <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                    {posToGenerate.map(poData => (
                        <div
                            key={poData.vendorId}
                            className={`p-4 rounded-lg ${isDark ? 'bg-gray-900/50' : 'bg-gray-50 border border-gray-200'}`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className={`font-semibold text-lg ${isDark ? 'text-accent-300' : 'text-blue-700'}`}>
                                        {vendorMap.get(poData.vendorId) || 'Unknown Vendor'}
                                    </h3>
                                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        Sourced from {poData.requisitionIds.length} requisition(s)
                                    </p>
                                </div>
                                <div className={`text-right ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                    <span className="text-lg font-bold">${totals[poData.vendorId]?.toFixed(2) || '0.00'}</span>
                                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Est. Total</p>
                                </div>
                            </div>
                            <ul className={`divide-y ${isDark ? 'divide-gray-700/50' : 'divide-gray-200'}`}>
                                {poData.items.map(item => (
                                    <li key={item.sku} className="flex justify-between items-center py-2 text-sm">
                                        <div className="flex-1 min-w-0 mr-4">
                                            <span className={`block truncate ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                {item.name}
                                            </span>
                                            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                                {item.sku}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <PriceBadge
                                                currentPrice={inventoryMap.get(item.sku)?.unitCost ?? 0}
                                                priceInfo={priceData[item.sku]}
                                                isDark={isDark}
                                            />
                                            <span className={`font-semibold min-w-[80px] text-right ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                {item.quantity} units
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                <div className={`flex justify-end pt-6 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <Button
                        onClick={onClose}
                        className={`font-semibold py-2 px-4 rounded-md transition-colors mr-3 ${
                            isDark
                                ? 'bg-gray-600 text-white hover:bg-gray-500'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleGenerate}
                        disabled={posToGenerate.length === 0}
                        className={`font-semibold py-2 px-4 rounded-md transition-colors disabled:cursor-not-allowed ${
                            isDark
                                ? 'bg-accent-500 text-white hover:bg-accent-600 disabled:bg-gray-500'
                                : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300'
                        }`}
                    >
                        Generate {posToGenerate.length} PO(s)
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default GeneratePoModal;
