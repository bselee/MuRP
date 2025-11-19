import React, { useState, useMemo } from 'react';
// Corrected import path for the Buildability type from buildabilityService
import type { Buildability } from '../services/buildabilityService';
import { CheckCircleIcon, ChevronDownIcon, ChevronUpIcon, ExclamationCircleIcon, XCircleIcon } from './icons';

interface BuildabilityTableProps {
  data: Buildability[];
}

type SortKey = 'sku' | 'description' | 'buildableUnits' | 'status';
type SortDirection = 'asc' | 'desc';

const StatusBadge: React.FC<{ status: 'In Stock' | 'Low Stock' | 'Out of Stock' }> = ({ status }) => {
  const statusConfig = {
    'In Stock': {
      color: 'bg-green-500/20 text-green-400 border-green-500/30',
      icon: <CheckCircleIcon className="w-4 h-4" />,
    },
    'Low Stock': {
      color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      icon: <ExclamationCircleIcon className="w-4 h-4" />,
    },
    'Out of Stock': {
      color: 'bg-red-500/20 text-red-400 border-red-500/30',
      icon: <XCircleIcon className="w-4 h-4" />,
    },
  };
  const config = statusConfig[status];

  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-full border ${config.color}`}>
      {config.icon}
      {status}
    </span>
  );
};

const BuildabilityTable: React.FC<BuildabilityTableProps> = ({ data }) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('sku');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [hideFinished, setHideFinished] = useState(false);

  const toggleRow = (sku: string) => {
    setExpandedRow(expandedRow === sku ? null : sku);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedAndFilteredData = useMemo(() => {
    let filtered = hideFinished
      ? data.filter(item => item.status !== 'In Stock' || item.buildableUnits === 0)
      : data;

    return [...filtered].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortKey) {
        case 'sku':
          aVal = a.bom.finishedSku;
          bVal = b.bom.finishedSku;
          break;
        case 'description':
          aVal = a.bom.name;
          bVal = b.bom.name;
          break;
        case 'buildableUnits':
          aVal = a.buildableUnits;
          bVal = b.buildableUnits;
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDirection, hideFinished]);

  const SortIcon: React.FC<{ column: SortKey }> = ({ column }) => {
    if (sortKey !== column) return null;
    return sortDirection === 'asc'
      ? <ChevronUpIcon className="w-4 h-4 inline ml-1" />
      : <ChevronDownIcon className="w-4 h-4 inline ml-1" />;
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden border border-gray-700">
      <div className="px-6 py-3 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">Products ({sortedAndFilteredData.length})</h3>
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={hideFinished}
            onChange={(e) => setHideFinished(e.target.checked)}
            className="rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
          />
          Hide fully buildable items
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-800">
            <tr>
              <th
                scope="col"
                className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white"
                onClick={() => handleSort('sku')}
              >
                SKU <SortIcon column="sku" />
              </th>
              <th
                scope="col"
                className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white"
                onClick={() => handleSort('description')}
              >
                Description <SortIcon column="description" />
              </th>
              <th
                scope="col"
                className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white"
                onClick={() => handleSort('buildableUnits')}
              >
                Buildable Units <SortIcon column="buildableUnits" />
              </th>
              <th
                scope="col"
                className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white"
                onClick={() => handleSort('status')}
              >
                Status <SortIcon column="status" />
              </th>
              <th scope="col" className="relative px-6 py-2"><span className="sr-only">Expand</span></th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {sortedAndFilteredData.map((item) => (
              <React.Fragment key={item.bom.finishedSku}>
                <tr className="hover:bg-gray-700/50 transition-colors duration-200">
                  <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-400">{item.bom.finishedSku}</td>
                  <td className="px-6 py-1 whitespace-nowrap text-sm font-medium text-white">{item.bom.name}</td>
                  <td className="px-6 py-1 whitespace-nowrap text-sm font-semibold text-white">{item.buildableUnits}</td>
                  <td className="px-6 py-1 whitespace-nowrap text-sm"><StatusBadge status={item.status} /></td>
                  <td className="px-6 py-1 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => toggleRow(item.bom.finishedSku)} className="text-indigo-400 hover:text-indigo-300">
                      <ChevronDownIcon className={`w-5 h-5 transition-transform duration-200 ${expandedRow === item.bom.finishedSku ? 'rotate-180' : ''}`} />
                    </button>
                  </td>
                </tr>
                {expandedRow === item.bom.finishedSku && (
                  <tr className="bg-gray-900/50">
                    <td colSpan={5} className="p-0">
                      <div className="p-4 md:p-6">
                        <h4 className="text-md font-semibold text-gray-200 mb-3">Component Requirements</h4>
                        <ul className="space-y-2">
                          {item.bom.components.map(c => {
                            const stock = item.componentStock.find(cs => cs.sku === c.sku)?.stock ?? 0;
                            const requiredForOne = c.quantity;
                            const hasEnoughForOne = stock >= requiredForOne;
                            return (
                                <li key={c.sku} className="flex justify-between items-center text-sm p-2 bg-gray-800 rounded-md">
                                    <div className="flex items-center">
                                        <span className={`w-2 h-2 rounded-full mr-3 ${hasEnoughForOne ? 'bg-green-400' : 'bg-red-400'}`}></span>
                                        <div>
                                            <span className="font-medium text-gray-300">{c.name}</span>
                                            <span className="text-gray-500"> ({c.sku})</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-gray-300">Required: {c.quantity}</span>
                                        <span className="text-gray-500 mx-2">|</span>
                                        <span className={stock > 0 ? 'text-gray-300' : 'text-red-400 font-bold'}>In Stock: {stock}</span>
                                    </div>
                                </li>
                            );
                          })}
                        </ul>
                        {item.limitingComponent && <p className="text-xs text-yellow-400 mt-3">Limiting component: {item.limitingComponent.name}</p>}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BuildabilityTable;
