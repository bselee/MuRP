import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Button from '@/components/ui/Button';
import type {
    Vendor,
    InventoryItem,
    CreatePurchaseOrderInput,
    CreatePurchaseOrderItemInput,
} from '../types';
import Modal from './Modal';
import { PlusCircleIcon, TrashIcon, BotIcon, EyeIcon, LightBulbIcon, ChevronDownIcon, ChevronUpIcon } from './icons';
import POLivePreview from './POLivePreview';
import POSuggestionCard, { type POSuggestion } from './POSuggestionCard';
import { generateVendorSuggestions, getSuggestionsBreakdown } from '../services/poSuggestionService';

interface CreatePoModalProps {
    isOpen: boolean;
    onClose: () => void;
    vendors: Vendor[];
    inventory: InventoryItem[];
    onCreatePo: (poDetails: CreatePurchaseOrderInput) => Promise<void> | void;
    initialData?: {
        vendorId?: string;
        vendorLocked?: boolean;
        items?: CreatePurchaseOrderItemInput[];
        expectedDate?: string;
        notes?: string;
        requisitionIds?: string[];
        sourceLabel?: string;
        trackingNumber?: string;
        trackingCarrier?: string;
    };
}

type PoItem = {
    sku: string;
    name: string;
    quantity: number;
    unitCost: number;
};

type SuggestionMeta = {
    label: string;
    detail: string;
};

type SuggestionCandidate = {
    sku: string;
    name: string;
    quantity: number;
    unitCost: number;
    label: string;
    detail: string;
    urgencyScore: number;
};

const CreatePoModal: React.FC<CreatePoModalProps> = ({
    isOpen,
    onClose,
    vendors,
    inventory,
    onCreatePo,
    initialData,
}) => {
    const [selectedVendorId, setSelectedVendorId] = useState<string>('');
    const [poItems, setPoItems] = useState<PoItem[]>([]);
    const [expectedDate, setExpectedDate] = useState('');
    const [notes, setNotes] = useState('');
    const [itemToAdd, setItemToAdd] = useState('');
    const [requisitionIds, setRequisitionIds] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [suggestedMeta, setSuggestedMeta] = useState<Record<string, SuggestionMeta>>({});
    const [trackingNumber, setTrackingNumber] = useState('');
    const [trackingCarrier, setTrackingCarrier] = useState('');
    const [showPreview, setShowPreview] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(true);
    const [aiSuggestions, setAiSuggestions] = useState<POSuggestion[]>([]);
    const [dismissedSkus, setDismissedSkus] = useState<Set<string>>(new Set());

    const initializedVendorRef = useRef<string | null>(null);

    const vendorInventory = useMemo(() =>
        inventory.filter(item => item.vendorId === selectedVendorId),
    [inventory, selectedVendorId]);
    
    const inventoryMap = useMemo(() => new Map(inventory.map(i => [i.sku, i])), [inventory]);

    const normalizeInitialItems = useCallback(
        (items?: CreatePurchaseOrderItemInput[] | null): PoItem[] =>
            (items ?? []).map(item => ({
                sku: item.sku,
                name: item.name,
                quantity: item.quantity,
                unitCost: item.unitCost ?? 0,
            })),
        []
    );

    const getDailyConsumption = useCallback((item: InventoryItem): number => {
        const windows = [
            { value: item.sales30Days ?? 0, days: 30, weight: 0.5 },
            { value: item.sales60Days ?? 0, days: 60, weight: 0.3 },
            { value: item.sales90Days ?? 0, days: 90, weight: 0.2 },
        ];
        const weightedSum = windows.reduce((sum, entry) => {
            if (!entry.value || entry.value <= 0) return sum;
            return sum + (entry.value / entry.days) * entry.weight;
        }, 0);
        const totalWeight = windows.reduce((sum, entry) => {
            if (!entry.value || entry.value <= 0) return sum;
            return sum + entry.weight;
        }, 0);
        if (weightedSum > 0 && totalWeight > 0) {
            return weightedSum / totalWeight;
        }
        return item.salesVelocity ?? 0;
    }, []);

    const buildSuggestionForItem = useCallback(
        (item: InventoryItem): SuggestionCandidate | null => {
            const daily = getDailyConsumption(item);
            if (!daily || daily <= 0) return null;

            const available = (item.stock ?? 0) + (item.onOrder ?? 0);
            const coverageDays = daily > 0 ? available / daily : Infinity;

            let windowLabel = '';
            let targetWindow = 0;
            if (coverageDays < 30) {
                windowLabel = '30-day need';
                targetWindow = 30;
            } else if (coverageDays < 60) {
                windowLabel = '60-day lookahead';
                targetWindow = 60;
            } else if (coverageDays < 90) {
                windowLabel = '90-day outlook';
                targetWindow = 90;
            } else {
                return null;
            }

            const targetUnits = Math.ceil(daily * targetWindow) + (item.safetyStock ?? 0);
            const shortfall = targetUnits - available;
            if (shortfall <= 0) return null;

            const moq = item.moq || 1;
            const roundedShortfall = Math.ceil(shortfall / moq) * moq;
            const recommendedQuantity = Math.max(moq, roundedShortfall);

            if (recommendedQuantity <= 0) {
                return null;
            }

            return {
                sku: item.sku,
                name: item.name,
                quantity: recommendedQuantity,
                unitCost: item.unitCost ?? 0,
                label: windowLabel,
                detail: `Only ${(coverageDays).toFixed(1)} days of cover vs ${targetWindow} day target (≈${daily.toFixed(1)} units/day)`,
                urgencyScore: targetWindow - coverageDays,
            };
        },
        [getDailyConsumption]
    );

    const computeVendorSuggestions = useCallback((existingSkus: Set<string>) => {
        const MAX_SUGGESTIONS = 5;
        const suggestions: SuggestionCandidate[] = [];
        for (const item of vendorInventory) {
            if (!item || existingSkus.has(item.sku)) continue;
            const suggestion = buildSuggestionForItem(item);
            if (suggestion) {
                suggestions.push(suggestion);
            }
            if (suggestions.length >= MAX_SUGGESTIONS) {
                break;
            }
        }
        return suggestions.sort((a, b) => b.urgencyScore - a.urgencyScore);
    }, [vendorInventory, buildSuggestionForItem]);

    // Apply initial data when modal opens
    useEffect(() => {
        if (!isOpen) return;

        setSelectedVendorId(initialData?.vendorId ?? '');
        setPoItems(normalizeInitialItems(initialData?.items));
        setExpectedDate(initialData?.expectedDate ?? '');
        setNotes(initialData?.notes ?? '');
        setRequisitionIds(initialData?.requisitionIds ?? []);
        setItemToAdd('');
        setSuggestedMeta({});
        setTrackingNumber(initialData?.trackingNumber ?? '');
        setTrackingCarrier(initialData?.trackingCarrier ?? '');
        initializedVendorRef.current = null;
    }, [isOpen, initialData, normalizeInitialItems]);

    useEffect(() => {
        if (!isOpen) return;

        if (!selectedVendorId) {
            initializedVendorRef.current = null;
            setPoItems([]);
            setSuggestedMeta({});
            setExpectedDate('');
            return;
        }

        if (initializedVendorRef.current === selectedVendorId) {
            return;
        }

        const baseItems =
            initialData?.vendorId === selectedVendorId
                ? normalizeInitialItems(initialData?.items)
                : [];

        const existingSkus = new Set(baseItems.map(item => item.sku));
        const suggestions = computeVendorSuggestions(existingSkus);

        const combinedItems = [...baseItems];
        const meta: Record<string, SuggestionMeta> = {};

        suggestions.forEach(suggestion => {
            combinedItems.push({
                sku: suggestion.sku,
                name: suggestion.name,
                quantity: suggestion.quantity,
                unitCost: suggestion.unitCost,
            });
            meta[suggestion.sku] = {
                label: suggestion.label,
                detail: suggestion.detail,
            };
        });

        if (!baseItems.length && !suggestions.length) {
            // Fall back to empty list if no data available
            setPoItems([]);
        } else {
            setPoItems(combinedItems);
        }

        setSuggestedMeta(meta);

        // Set default expected date based on vendor lead time if not already provided
        if (!initialData?.expectedDate) {
            const vendor = vendors.find(v => v.id === selectedVendorId);
            if (vendor?.leadTimeDays) {
                const date = new Date();
                date.setDate(date.getDate() + vendor.leadTimeDays);
                setExpectedDate(date.toISOString().split('T')[0]);
            }
        }

        initializedVendorRef.current = selectedVendorId;
    }, [
        selectedVendorId,
        isOpen,
        initialData,
        vendors,
        normalizeInitialItems,
        computeVendorSuggestions,
    ]);

    const handleItemQuantityChange = (sku: string, quantity: number) => {
        setPoItems(prev => prev.map(item => item.sku === sku ? { ...item, quantity } : item));
    };

    const handleRemoveItem = (sku: string) => {
        setPoItems(prev => prev.filter(item => item.sku !== sku));
        setSuggestedMeta(prev => {
            if (!prev[sku]) return prev;
            const updated = { ...prev };
            delete updated[sku];
            return updated;
        });
    };

    const handleAddItem = () => {
        if (itemToAdd && !poItems.some(i => i.sku === itemToAdd)) {
            const item = inventoryMap.get(itemToAdd);
            if (item) {
                setPoItems(prev => [...prev, { sku: item.sku, name: item.name, quantity: item.moq || 1, unitCost: item.unitCost ?? 0 }]);
            }
        }
        setItemToAdd('');
    };

    const handleSubmit = async () => {
        if (!selectedVendorId || poItems.length === 0) {
            return;
        }

        const sanitizedItems = poItems
            .filter(item => item.quantity > 0)
            .map(item => ({
                sku: item.sku,
                name: item.name,
                quantity: item.quantity,
                unitCost: item.unitCost ?? 0,
            }));

        if (sanitizedItems.length === 0) {
            return;
        }

        setIsSubmitting(true);
        try {
            await onCreatePo({
                vendorId: selectedVendorId,
                items: sanitizedItems,
                expectedDate,
                notes,
                requisitionIds: requisitionIds.length ? requisitionIds : undefined,
                trackingNumber: trackingNumber || undefined,
                trackingCarrier: trackingCarrier || undefined,
            });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setSelectedVendorId('');
            setPoItems([]);
            setExpectedDate('');
            setNotes('');
            setItemToAdd('');
            setRequisitionIds([]);
            setSuggestedMeta({});
            setTrackingNumber('');
            setTrackingCarrier('');
            initializedVendorRef.current = null;
            setAiSuggestions([]);
            setDismissedSkus(new Set());
            setShowSuggestions(true);
        }
    }, [isOpen]);

    // Generate AI suggestions when vendor changes
    useEffect(() => {
        if (!selectedVendorId || !isOpen) {
            setAiSuggestions([]);
            return;
        }

        const existingSkus = new Set(poItems.map(item => item.sku));
        const allDismissed = new Set([...existingSkus, ...dismissedSkus]);
        const suggestions = generateVendorSuggestions(vendorInventory, allDismissed, {
            maxSuggestions: 8,
            includeOptional: true,
        });
        setAiSuggestions(suggestions);
    }, [selectedVendorId, vendorInventory, poItems, dismissedSkus, isOpen]);

    // Handle accepting a suggestion (add to PO items)
    const handleAcceptSuggestion = useCallback((suggestion: POSuggestion) => {
        setPoItems(prev => [
            ...prev,
            {
                sku: suggestion.sku,
                name: suggestion.name,
                quantity: suggestion.quantity,
                unitCost: suggestion.unitCost,
            },
        ]);
        setSuggestedMeta(prev => ({
            ...prev,
            [suggestion.sku]: {
                label: suggestion.reason.replace(/_/g, ' '),
                detail: suggestion.reasoning,
            },
        }));
    }, []);

    // Handle dismissing a suggestion
    const handleDismissSuggestion = useCallback((sku: string) => {
        setDismissedSkus(prev => new Set([...prev, sku]));
    }, []);

    // Suggestion counts for header
    const suggestionBreakdown = useMemo(() => getSuggestionsBreakdown(aiSuggestions), [aiSuggestions]);

    const sourceLabel = initialData?.sourceLabel;
    const vendorLocked = initialData?.vendorLocked;

    // Get selected vendor for preview
    const selectedVendor = useMemo(() =>
        vendors.find(v => v.id === selectedVendorId),
    [vendors, selectedVendorId]);

    // Preview data for live preview component
    const previewData = useMemo(() => ({
        poNumber: 'DRAFT',
        vendorId: selectedVendorId,
        vendorName: selectedVendor?.name,
        orderDate: new Date().toISOString().split('T')[0],
        expectedDate,
        paymentTerms: selectedVendor?.paymentTerms || 'Net 30',
        notes,
        items: poItems.map(item => ({
            sku: item.sku,
            name: item.name,
            quantity: item.quantity,
            unitCost: item.unitCost,
            unit: 'ea',
        })),
    }), [selectedVendorId, selectedVendor, expectedDate, notes, poItems]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Purchase Order">
            <div className="space-y-6">
                {sourceLabel && (
                    <div className="flex items-center gap-2 text-sm text-accent-200 bg-accent-800/40 border border-accent-600/40 rounded-md px-3 py-2">
                        <BotIcon className="w-4 h-4" />
                        <span>{sourceLabel}</span>
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="vendor-select" className="block text-sm font-medium text-gray-300">Vendor</label>
                        <select
                            id="vendor-select"
                            value={selectedVendorId}
                            onChange={(e) => setSelectedVendorId(e.target.value)}
                            disabled={vendorLocked}
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <option value="" disabled>Select a vendor</option>
                            {vendors.map(vendor => (
                                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="expected-date" className="block text-sm font-medium text-gray-300">Expected Delivery Date</label>
                        <input
                            type="date"
                            id="expected-date"
                            value={expectedDate}
                            onChange={e => setExpectedDate(e.target.value)}
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm"
                        />
                    </div>
                </div>

                {/* AI Suggestions Panel */}
                {selectedVendorId && aiSuggestions.length > 0 && (
                    <div className="border border-accent-500/30 bg-accent-900/20 rounded-lg overflow-hidden">
                        {/* Suggestions Header */}
                        <button
                            onClick={() => setShowSuggestions(!showSuggestions)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent-800/20 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 bg-accent-600/30 rounded-lg">
                                    <LightBulbIcon className="w-5 h-5 text-accent-400" />
                                </div>
                                <div className="text-left">
                                    <h3 className="font-semibold text-white text-sm">AI Recommendations</h3>
                                    <p className="text-xs text-gray-400">
                                        {aiSuggestions.length} items suggested based on stock levels
                                        {suggestionBreakdown.critical > 0 && (
                                            <span className="ml-2 text-red-400">• {suggestionBreakdown.critical} critical</span>
                                        )}
                                        {suggestionBreakdown.high > 0 && (
                                            <span className="ml-2 text-orange-400">• {suggestionBreakdown.high} high priority</span>
                                        )}
                                    </p>
                                </div>
                            </div>
                            {showSuggestions ? (
                                <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                            ) : (
                                <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                            )}
                        </button>

                        {/* Suggestions List */}
                        {showSuggestions && (
                            <div className="p-4 pt-0 space-y-3 max-h-[400px] overflow-y-auto">
                                {aiSuggestions.map(suggestion => (
                                    <POSuggestionCard
                                        key={suggestion.sku}
                                        suggestion={suggestion}
                                        onAccept={handleAcceptSuggestion}
                                        onDismiss={handleDismissSuggestion}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="tracking-number" className="block text-sm font-medium text-gray-300">Tracking Number (optional)</label>
                        <input
                            type="text"
                            id="tracking-number"
                            value={trackingNumber}
                            onChange={e => setTrackingNumber(e.target.value)}
                            placeholder="1Z999AA10123456784"
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm"
                        />
                    </div>
                    <div>
                        <label htmlFor="tracking-carrier" className="block text-sm font-medium text-gray-300">Carrier</label>
                        <select
                            id="tracking-carrier"
                            value={trackingCarrier}
                            onChange={e => setTrackingCarrier(e.target.value)}
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm"
                        >
                            <option value="">Select carrier...</option>
                            <option value="ups">UPS</option>
                            <option value="fedex">FedEx</option>
                            <option value="usps">USPS</option>
                            <option value="dhl">DHL</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                </div>

                <div className="border-t border-gray-700 pt-4">
                    <h3 className="text-lg font-medium text-gray-200 mb-2">Items</h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                        {poItems.map(item => (
                            <div key={item.sku} className="flex items-center gap-4 bg-gray-900/50 p-2 rounded-md">
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-white">{item.name}</p>
                                    <p className="text-xs text-gray-400">{item.sku} • Unit Cost: ${item.unitCost.toFixed(2)}</p>
                                    {suggestedMeta[item.sku] && (
                                        <p className="text-xs text-accent-300 flex items-center gap-1 mt-1">
                                            <BotIcon className="w-3.5 h-3.5" />
                                            <span className="font-semibold">{suggestedMeta[item.sku].label}</span>
                                            <span className="text-accent-200/80">· {suggestedMeta[item.sku].detail}</span>
                                        </p>
                                    )}
                                </div>
                                <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => handleItemQuantityChange(item.sku, parseInt(e.target.value, 10) || 0)}
                                    className="w-24 bg-gray-700 text-white rounded-md p-1.5 text-sm"
                                    min="1"
                                />
                                <Button onClick={() => handleRemoveItem(item.sku)} className="p-1.5 text-red-500 hover:text-red-400">
                                    <TrashIcon className="w-5 h-5"/>
                                </Button>
                            </div>
                        ))}
                    </div>
                     {selectedVendorId && (
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-700/50">
                            <select 
                                value={itemToAdd} 
                                onChange={e => setItemToAdd(e.target.value)}
                                className="flex-1 bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm"
                            >
                                <option value="">Add another item...</option>
                                {vendorInventory
                                    .filter(vi => !poItems.some(pi => pi.sku === vi.sku))
                                    .map(item => <option key={item.sku} value={item.sku}>{item.name}</option>
                                )}
                            </select>
                            <Button onClick={handleAddItem} className="p-2 text-accent-400 hover:text-accent-300 disabled:text-gray-600 disabled:cursor-not-allowed" disabled={!itemToAdd}>
                                <PlusCircleIcon className="w-7 h-7" />
                            </Button>
                        </div>
                    )}
                </div>

                <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-300">Notes (Optional)</label>
                    <textarea
                        id="notes"
                        rows={3}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm"
                        placeholder="Add any special instructions for this order..."
                    />
                </div>

                {/* Live Preview Section */}
                {selectedVendorId && poItems.length > 0 && (
                    <div className="border-t border-gray-700 pt-4">
                        <button
                            onClick={() => setShowPreview(!showPreview)}
                            className="flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300 transition-colors"
                        >
                            <EyeIcon className="w-4 h-4" />
                            {showPreview ? 'Hide Preview' : 'Preview Purchase Order'}
                        </button>
                        {showPreview && (
                            <div className="mt-4">
                                <POLivePreview
                                    data={previewData}
                                    vendor={selectedVendor}
                                />
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-end pt-6 border-t border-gray-700">
                    <Button onClick={onClose} className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition-colors mr-3">Cancel</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!selectedVendorId || poItems.length === 0 || isSubmitting}
                        className="bg-accent-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-accent-600 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                        Create Purchase Order
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default CreatePoModal;
