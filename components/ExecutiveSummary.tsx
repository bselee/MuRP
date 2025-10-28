import React from 'react';
// Corrected import path for the Buildability type from buildabilityService
import type { Buildability } from '../services/buildabilityService';
import { BoxIcon, CheckCircleIcon, ExclamationCircleIcon, XCircleIcon } from './icons';

interface ExecutiveSummaryProps {
  data: Buildability[];
}

interface SummaryCardProps {
    icon: React.ReactNode;
    title: string;
    value: number | string;
    color: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ icon, title, value, color }) => (
  <div className={`bg-gray-800 p-6 rounded-lg shadow-lg border-l-4 ${color}`}>
    <div className="flex items-center">
      <div className="mr-4">{icon}</div>
      <div>
        <p className="text-sm text-gray-400 font-medium">{title}</p>
        <p className="text-3xl font-bold text-white">{value}</p>
      </div>
    </div>
  </div>
);

const ExecutiveSummary: React.FC<ExecutiveSummaryProps> = ({ data }) => {
    const totalBOMs = data.length;
    const inStockCount = data.filter(item => item.status === 'In Stock').length;
    const lowStockCount = data.filter(item => item.status === 'Low Stock').length;
    const outOfStockCount = data.filter(item => item.status === 'Out of Stock').length;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <SummaryCard 
                icon={<BoxIcon className="w-10 h-10 text-blue-400" />}
                title="Finished Products (BOMs)"
                value={totalBOMs}
                color="border-blue-400"
            />
            <SummaryCard 
                icon={<CheckCircleIcon className="w-10 h-10 text-green-400" />}
                title="Buildable & In Stock"
                value={inStockCount}
                color="border-green-400"
            />
            <SummaryCard 
                icon={<ExclamationCircleIcon className="w-10 h-10 text-yellow-400" />}
                title="Buildable with Low Stock"
                value={lowStockCount}
                color="border-yellow-400"
            />
            <SummaryCard 
                icon={<XCircleIcon className="w-10 h-10 text-red-400" />}
                title="Unbuildable (Out of Stock)"
                value={outOfStockCount}
                color="border-red-400"
            />
        </div>
    );
};

export default ExecutiveSummary;