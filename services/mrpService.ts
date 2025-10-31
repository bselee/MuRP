import type {
	BillOfMaterials,
	BuildOrder,
	InventoryItem,
	PurchaseOrder,
} from '../types';

export type DemandSource = 'BuildOrder' | 'SalesOrder' | 'Forecast' | 'Manual';

export interface DemandSignal {
	sku: string;
	quantity: number;
	dueDate: string;
	source: DemandSource;
}

export interface MrpRecommendation {
	sku: string;
	availableOnHand: number;
	scheduledReceipts: number;
	grossRequirements: number;
	netRequirements: number;
	shortageDate: string | null;
	suggestedAction: 'ReleaseOrder' | 'Expedite' | 'None';
	demandBreakdown: DemandSignal[];
}

const normalizeDate = (input: string | Date): string => {
	const date = typeof input === 'string' ? new Date(input) : input;
	if (Number.isNaN(date.getTime())) {
		return new Date().toISOString().split('T')[0];
	}
	const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	return normalized.toISOString().split('T')[0];
};

const mapBoms = (boms: BillOfMaterials[]): Map<string, BillOfMaterials> => {
	const bomMap = new Map<string, BillOfMaterials>();
	boms.forEach((bom) => bomMap.set(bom.finishedSku, bom));
	return bomMap;
};

const explodeBomDemand = (
	sku: string,
	quantity: number,
	dueDate: string,
	bomMap: Map<string, BillOfMaterials>,
	accumulator: Map<string, DemandSignal[]>,
	source: DemandSource,
) => {
	const bom = bomMap.get(sku);
	if (!bom) {
		const signals = accumulator.get(sku) ?? [];
		signals.push({ sku, quantity, dueDate, source });
		accumulator.set(sku, signals);
		return;
	}

	bom.components.forEach((component) => {
		const componentDemand = component.quantity * quantity;
		explodeBomDemand(component.sku, componentDemand, dueDate, bomMap, accumulator, source);
	});
};

export const buildComponentDemandFromOrders = (
	buildOrders: BuildOrder[],
	boms: BillOfMaterials[],
): DemandSignal[] => {
	const bomMap = mapBoms(boms);
	const demand = new Map<string, DemandSignal[]>();

	buildOrders
			.filter((order) => order.status !== 'Completed')
			.forEach((order) => {
				const dueDate = normalizeDate(order.createdAt);
			explodeBomDemand(order.finishedSku, order.quantity, dueDate, bomMap, demand, 'BuildOrder');
		});

	return Array.from(demand.values()).flat();
};

const aggregateDemandSignals = (signals: DemandSignal[]): Map<string, DemandSignal[]> => {
	return signals.reduce<Map<string, DemandSignal[]>>((acc, signal) => {
		const existing = acc.get(signal.sku) ?? [];
		existing.push(signal);
		acc.set(signal.sku, existing);
		return acc;
	}, new Map());
};

const deriveScheduledReceipts = (
	sku: string,
	inventoryIndex: Map<string, InventoryItem>,
	purchaseOrders: PurchaseOrder[],
): number => {
	const inventoryItem = inventoryIndex.get(sku);
	const onOrderFromInventory = inventoryItem?.onOrder ?? 0;

	const openPoQuantity = purchaseOrders
		.filter((po) => po.status !== 'Fulfilled')
		.reduce((sum, po) => {
			const poItem = po.items.find((item) => item.sku === sku);
			return sum + (poItem?.quantity ?? 0);
		}, 0);

		if (openPoQuantity > 0) {
			return openPoQuantity;
		}
		return onOrderFromInventory;
};

export const generateMrpPlan = (
	inventory: InventoryItem[],
	purchaseOrders: PurchaseOrder[],
	demandSignals: DemandSignal[],
): MrpRecommendation[] => {
	const inventoryIndex = new Map(inventory.map((item) => [item.sku, item]));
	const demandBySku = aggregateDemandSignals(demandSignals);

	return Array.from(demandBySku.entries()).map(([sku, signals]) => {
		const grossRequirements = signals.reduce((sum, signal) => sum + signal.quantity, 0);
		const onHand = inventoryIndex.get(sku)?.stock ?? 0;
		const scheduledReceipts = deriveScheduledReceipts(sku, inventoryIndex, purchaseOrders);
		const netRequirements = Math.max(grossRequirements - (onHand + scheduledReceipts), 0);

		let shortageDate: string | null = null;
		if (netRequirements > 0) {
			const sorted = [...signals].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
			let runningBalance = onHand + scheduledReceipts;
			sorted.some((signal) => {
				runningBalance -= signal.quantity;
				if (runningBalance < 0) {
					shortageDate = signal.dueDate;
					return true;
				}
				return false;
			});
		}

		const suggestedAction: MrpRecommendation['suggestedAction'] = netRequirements > 0
			? shortageDate && new Date(shortageDate).getTime() < Date.now()
				? 'Expedite'
				: 'ReleaseOrder'
			: 'None';

		return {
			sku,
			availableOnHand: onHand,
			scheduledReceipts,
			grossRequirements,
			netRequirements,
			shortageDate,
			suggestedAction,
			demandBreakdown: signals,
		};
	});
};

export interface MrpRunOptions {
	inventory: InventoryItem[];
	boms: BillOfMaterials[];
	buildOrders: BuildOrder[];
	purchaseOrders: PurchaseOrder[];
	additionalDemand?: DemandSignal[];
}

export const runMrp = ({
	inventory,
	boms,
	buildOrders,
	purchaseOrders,
	additionalDemand = [],
}: MrpRunOptions): MrpRecommendation[] => {
	const buildOrderDemand = buildComponentDemandFromOrders(buildOrders, boms);
	const demandSignals = [...buildOrderDemand, ...additionalDemand];
	if (demandSignals.length === 0) {
		return [];
	}
	return generateMrpPlan(inventory, purchaseOrders, demandSignals);
};
