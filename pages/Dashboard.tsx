import React, { useMemo } from 'react';
import type { BillOfMaterials, InventoryItem } from '../types';
import ExecutiveSummary from '../components/ExecutiveSummary';
import BuildabilityTable from '../components/BuildabilityTable';
import { calculateAllBuildability } from '../services/buildabilityService';
import type { Buildability } from '../services/buildabilityService';

interface DashboardProps {
  inventory: InventoryItem[];
  boms: BillOfMaterials[];
}

const Dashboard: React.FC<DashboardProps> = ({ inventory, boms }) => {
  
  const buildabilityData = useMemo(() =>
    calculateAllBuildability(boms, inventory),
    [boms, inventory]
  );
  
  const criticalShortages = useMemo(() => 
    inventory.filter(item => item.stock < item.reorderPoint && item.reorderPoint > 0),
    [inventory]
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-gray-400 mt-1">Welcome back, here's your inventory snapshot.</p>
      </header>
      
      <section>
        <h2 className="text-xl font-semibold mb-4 text-gray-300">Executive Summary</h2>
        <ExecutiveSummary data={buildabilityData} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2">
            <h2 className="text-xl font-semibold mb-4 text-gray-300">Buildability Status</h2>
            <BuildabilityTable data={buildabilityData} />
        </section>

        <section>
            <h2 className="text-xl font-semibold mb-4 text-gray-300">Critical Shortages</h2>
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg p-4 border border-gray-700 max-h-[600px] overflow-y-auto">
                {criticalShortages.length > 0 ? (
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
                ) : (
                    <p className="text-center text-gray-400 py-8">No critical shortages. Well done!</p>
                )}
            </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;