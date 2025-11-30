import React, { useMemo } from 'react';
import type { BillOfMaterials, InventoryItem } from '../types';

interface BomExplosionViewProps {
  startSku: string;
  boms: BillOfMaterials[];
  inventory: InventoryItem[];
}

interface TreeNode {
  sku: string;
  name: string;
  quantity: number;
  level: number;
  isRawMaterial: boolean;
  children: TreeNode[];
}

const BomExplosionView: React.FC<BomExplosionViewProps> = ({ startSku, boms, inventory }) => {
  const bomsMap = useMemo(() => new Map(boms.map(b => [b.finishedSku, b])), [boms]);
  const inventoryMap = useMemo(() => new Map(inventory.map(i => [i.sku, i])), [inventory]);

  const buildTree = (sku: string, quantity: number, level: number): TreeNode => {
    const bom = bomsMap.get(sku);
    const item = inventoryMap.get(sku);
    
    return {
      sku,
      name: item?.name || 'Unknown Item',
      quantity,
      level,
      isRawMaterial: !bom,
      children: bom ? bom.components.map(c => buildTree(c.sku, c.quantity, level + 1)) : [],
    };
  };

  const explosionTree = useMemo(() => buildTree(startSku, 1, 0), [startSku, bomsMap, inventoryMap]);

  const getRawMaterials = (node: TreeNode, multiplier: number): { sku: string; name: string; quantity: number }[] => {
    if (node.isRawMaterial) {
      return [{ sku: node.sku, name: node.name, quantity: node.quantity * multiplier }];
    }
    return node.children.flatMap(child => getRawMaterials(child, multiplier * node.quantity));
  };
  
  const aggregatedMaterials = useMemo(() => {
    const allMaterials = explosionTree.children.flatMap(child => getRawMaterials(child, 1));
    const summary = new Map<string, {name: string, quantity: number}>();
    allMaterials.forEach(material => {
      const existing = summary.get(material.sku);
      if(existing) {
        summary.set(material.sku, {...existing, quantity: existing.quantity + material.quantity});
      } else {
        summary.set(material.sku, {name: material.name, quantity: material.quantity});
      }
    });
    return Array.from(summary.entries()).sort((a,b) => a[0].localeCompare(b[0]));
  }, [explosionTree]);


  const renderNode = (node: TreeNode) => (
    <div key={`${node.sku}-${node.level}`} style={{ marginLeft: `${node.level * 20}px` }} className="py-1">
      <div className={`flex items-center p-2 rounded-md ${node.isRawMaterial ? 'bg-gray-700/50' : 'bg-gray-800'}`}>
        <span className="font-mono text-xs text-accent-400 w-8 text-center">{node.quantity}x</span>
        <span className={`ml-2 text-sm ${node.isRawMaterial ? 'text-gray-300' : 'text-white font-semibold'}`}>{node.name}</span>
        <span className="ml-2 text-xs text-gray-500">({node.sku})</span>
      </div>
      {node.children.length > 0 && (
        <div className="border-l-2 border-gray-600 pl-2">
            {node.children.map(renderNode)}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row gap-6 max-h-[70vh]">
        <div className="flex-1 overflow-y-auto pr-2">
            <h4 className="text-lg font-semibold text-white mb-2">Component Hierarchy</h4>
            <div className="space-y-1">{renderNode(explosionTree)}</div>
        </div>
        <div className="md:w-1/3 bg-gray-900/50 p-4 rounded-lg border border-gray-700 overflow-y-auto">
            <h4 className="text-lg font-semibold text-white mb-3">Raw Material Summary</h4>
            <p className="text-xs text-gray-400 mb-4">Total components needed for one unit.</p>
            <ul className="space-y-2">
                {aggregatedMaterials.map(([sku, material]) => (
                    <li key={sku} className="flex justify-between items-center text-sm p-2 bg-gray-800 rounded">
                        <div>
                            <span className="font-medium text-gray-300">{material.name}</span>
                            <span className="text-gray-500"> ({sku})</span>
                        </div>
                        <span className="font-semibold text-white">{material.quantity}</span>
                    </li>
                ))}
            </ul>
        </div>
    </div>
  );
};

export default BomExplosionView;