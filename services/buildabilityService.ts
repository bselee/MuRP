import type { BillOfMaterials, InventoryItem } from '../types';

export interface Buildability {
  bom: BillOfMaterials;
  buildableUnits: number;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock';
  limitingComponent: { sku: string; name: string; quantity: number } | null;
  componentStock: { sku: string; stock: number; name: string }[];
}

const calculateBuildableUnitsRecursive = (
    sku: string,
    bomsMap: Map<string, BillOfMaterials>,
    inventoryMap: Map<string, InventoryItem>,
    memo: Map<string, number>
): number => {
    if (memo.has(sku)) {
        return memo.get(sku)!;
    }

    const bom = bomsMap.get(sku);
    // If it's a raw material or a product without a BOM (like a simple purchased item)
    if (!bom) {
        const stock = inventoryMap.get(sku)?.stock ?? 0;
        memo.set(sku, stock);
        return stock;
    }

    // It's an assembly, calculate buildability based on its components
    let minBuildableForAssembly = Infinity;

    for (const component of bom.components) {
        // Recursively find the buildable units of the component itself
        const buildableUnitsOfComponent = calculateBuildableUnitsRecursive(
            component.sku,
            bomsMap,
            inventoryMap,
            memo
        );
        
        if (component.quantity === 0) continue;
        
        const possibleBuildsBasedOnThisComponent = Math.floor(
            buildableUnitsOfComponent / component.quantity
        );

        if (possibleBuildsBasedOnThisComponent < minBuildableForAssembly) {
            minBuildableForAssembly = possibleBuildsBasedOnThisComponent;
        }
    }
    
    // Also consider the stock of the assembly itself, if any exist
    const assemblyStock = inventoryMap.get(sku)?.stock ?? 0;
    const totalBuildable = (minBuildableForAssembly === Infinity ? 0 : minBuildableForAssembly) + assemblyStock;

    memo.set(sku, totalBuildable);
    return totalBuildable;
};

export const calculateAllBuildability = (boms: BillOfMaterials[], inventory: InventoryItem[]): Buildability[] => {
    const bomsMap = new Map(boms.map(b => [b.finishedSku, b]));
    const inventoryMap = new Map(inventory.map(i => [i.sku, i]));
    const memo = new Map<string, number>();

    // First pass: calculate all buildable units with memoization
    inventory.forEach(item => {
        calculateBuildableUnitsRecursive(item.sku, bomsMap, inventoryMap, memo);
    });
    
    // Second pass: construct the final Buildability objects for top-level BOMs
    const topLevelBoms = boms.filter(bom => inventoryMap.has(bom.finishedSku));

    return topLevelBoms.map(bom => {
        let minBuildable = Infinity;
        let limitingComponent: { sku: string; name: string; quantity: number } | null = null;
        
        for (const component of bom.components) {
            const componentBuildable = memo.get(component.sku) ?? 0;
            if (component.quantity === 0) continue;

            const buildableForComponent = Math.floor(componentBuildable / component.quantity);
            if (buildableForComponent < minBuildable) {
                minBuildable = buildableForComponent;
                limitingComponent = component;
            }
        }
        
        const buildableUnits = minBuildable === Infinity ? 0 : minBuildable;

        let status: 'In Stock' | 'Low Stock' | 'Out of Stock';
        if (buildableUnits === 0) {
            status = 'Out of Stock';
        } else if (buildableUnits <= 10) {
            status = 'Low Stock';
        } else {
            status = 'In Stock';
        }
        
        const componentStock = bom.components.map(c => ({
            sku: c.sku,
            stock: memo.get(c.sku) ?? 0,
            name: c.name
        }));

        return { bom, buildableUnits, status, limitingComponent, componentStock };
    });
};