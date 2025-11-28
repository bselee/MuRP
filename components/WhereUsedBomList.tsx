import React, { useState, useEffect } from 'react';
import type { BillOfMaterials } from '../types';
import { CubeIcon, ExclamationTriangleIcon } from './icons';

interface WhereUsedBomListProps {
  sku: string;
}

interface BomUsage {
  bomId: string;
  bomName: string;
  quantity: number;
  unit?: string;
  status: 'active' | 'draft' | 'archived';
}

const WhereUsedBomList: React.FC<WhereUsedBomListProps> = ({ sku }) => {
  const [bomUsages, setBomUsages] = useState<BomUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBomUsages();
  }, [sku]);

  const loadBomUsages = async () => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Replace with actual API call to get BOM usages for SKU
      // For now, using mock data
      const mockUsages: BomUsage[] = [
        {
          bomId: 'bom_110105',
          bomName: 'Premium Potting Mix (1 cu ft)',
          quantity: 5,
          unit: 'lbs',
          status: 'active',
        },
        {
          bomId: 'bom_110106',
          bomName: 'Organic Super Soil (2 cu ft)',
          quantity: 10,
          unit: 'lbs',
          status: 'active',
        },
        {
          bomId: 'bom_110107',
          bomName: 'Biochar Soil Conditioner (4 cu ft)',
          quantity: 8,
          unit: 'lbs',
          status: 'draft',
        },
      ];

      setBomUsages(mockUsages);
    } catch (err) {
      console.error('Failed to load BOM usages:', err);
      setError('Failed to load BOM usage data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-400 bg-green-500/20';
      case 'draft':
        return 'text-yellow-400 bg-yellow-500/20';
      case 'archived':
        return 'text-gray-400 bg-gray-500/20';
      default:
        return 'text-gray-400 bg-gray-500/20';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-400">Loading BOM usage data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        <div className="flex items-center">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-400 mr-2" />
          <span className="text-red-400">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Where Used in BOMs</h3>
        <div className="text-sm text-gray-400">
          {bomUsages.length} BOM{bomUsages.length !== 1 ? 's' : ''} found
        </div>
      </div>

      {bomUsages.length === 0 ? (
        <div className="text-center py-12">
          <CubeIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">This SKU is not used in any BOMs</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bomUsages.map((usage) => (
            <div
              key={usage.bomId}
              className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:bg-gray-800/70 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <CubeIcon className="w-5 h-5 text-gray-400" />
                    <div>
                      <h4 className="text-white font-medium">{usage.bomName}</h4>
                      <p className="text-gray-400 text-sm">BOM ID: {usage.bomId}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-white font-medium">
                      {usage.quantity} {usage.unit || 'units'}
                    </p>
                    <p className="text-gray-400 text-sm">per BOM</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(usage.status)}`}>
                    {usage.status.charAt(0).toUpperCase() + usage.status.slice(1)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
          <div>
            <h4 className="text-blue-400 font-medium mb-1">BOM Impact Analysis</h4>
            <p className="text-gray-300 text-sm">
              Changes to this SKU will affect {bomUsages.filter(b => b.status === 'active').length} active BOMs.
              Consider reviewing dependent products before making changes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export { WhereUsedBomList };