import React, { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import type { PurchaseOrder, PurchaseOrderItem } from '../types';
import {
  ShoppingBagIcon,
  FunnelIcon,
  CalendarIcon,
  TruckIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
} from './icons';

interface PurchaseHistoryTableProps {
  sku: string;
}

interface PurchaseHistoryItem {
  poId: string;
  orderId: string;
  vendorName: string;
  orderDate: string;
  expectedDate?: string;
  actualDate?: string;
  status: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  trackingNumber?: string;
  trackingStatus?: string;
}

const PurchaseHistoryTable: React.FC<PurchaseHistoryTableProps> = ({ sku }) => {
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterVendor, setFilterVendor] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'quantity' | 'cost'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadPurchaseHistory();
  }, [sku]);

  const loadPurchaseHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Replace with actual API call to get purchase history for SKU
      // For now, using mock data
      const mockHistory: PurchaseHistoryItem[] = [
        {
          poId: 'po-001',
          orderId: 'ORD-2024-001',
          vendorName: 'Soil Solutions Inc.',
          orderDate: '2024-11-01',
          expectedDate: '2024-11-15',
          actualDate: '2024-11-14',
          status: 'received',
          quantity: 100,
          unitCost: 25.50,
          lineTotal: 2550.00,
          trackingNumber: 'TRK123456789',
          trackingStatus: 'delivered',
        },
        {
          poId: 'po-002',
          orderId: 'ORD-2024-002',
          vendorName: 'Garden Supplies Co.',
          orderDate: '2024-10-15',
          expectedDate: '2024-10-30',
          actualDate: '2024-11-02',
          status: 'received',
          quantity: 50,
          unitCost: 28.75,
          lineTotal: 1437.50,
          trackingNumber: 'TRK987654321',
          trackingStatus: 'delivered',
        },
        {
          poId: 'po-003',
          orderId: 'ORD-2024-003',
          vendorName: 'Soil Solutions Inc.',
          orderDate: '2024-09-20',
          expectedDate: '2024-10-05',
          status: 'sent',
          quantity: 75,
          unitCost: 26.00,
          lineTotal: 1950.00,
        },
      ];

      setPurchaseHistory(mockHistory);
    } catch (err) {
      console.error('Failed to load purchase history:', err);
      setError('Failed to load purchase history');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'received':
      case 'fulfilled':
        return <CheckCircleIcon className="w-4 h-4 text-green-400" />;
      case 'sent':
      case 'confirmed':
        return <TruckIcon className="w-4 h-4 text-blue-400" />;
      case 'pending':
        return <ClockIcon className="w-4 h-4 text-yellow-400" />;
      case 'cancelled':
        return <XCircleIcon className="w-4 h-4 text-red-400" />;
      default:
        return <ClockIcon className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'received':
      case 'fulfilled':
        return 'text-green-400';
      case 'sent':
      case 'confirmed':
        return 'text-blue-400';
      case 'pending':
        return 'text-yellow-400';
      case 'cancelled':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const filteredHistory = purchaseHistory
    .filter(item => filterStatus === 'all' || item.status.toLowerCase() === filterStatus.toLowerCase())
    .filter(item => filterVendor === 'all' || item.vendorName === filterVendor)
    .sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'date':
          aValue = new Date(a.orderDate);
          bValue = new Date(b.orderDate);
          break;
        case 'quantity':
          aValue = a.quantity;
          bValue = b.quantity;
          break;
        case 'cost':
          aValue = a.unitCost;
          bValue = b.unitCost;
          break;
        default:
          return 0;
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

  const uniqueVendors = Array.from(new Set(purchaseHistory.map(item => item.vendorName)));
  const uniqueStatuses = Array.from(new Set(purchaseHistory.map(item => item.status.toLowerCase())));

  const totalQuantity = filteredHistory.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = filteredHistory.reduce((sum, item) => sum + item.lineTotal, 0);
  const avgUnitCost = totalQuantity > 0 ? totalValue / totalQuantity : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-400">Loading purchase history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        <div className="flex items-center">
          <XCircleIcon className="w-5 h-5 text-red-400 mr-2" />
          <span className="text-red-400">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Purchase History</h3>
        <div className="text-sm text-gray-400">
          {filteredHistory.length} purchase{filteredHistory.length !== 1 ? 's' : ''} found
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-gray-400 text-sm">Total Quantity</div>
          <div className="text-white text-2xl font-bold">{totalQuantity.toLocaleString()}</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-gray-400 text-sm">Total Value</div>
          <div className="text-white text-2xl font-bold">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-gray-400 text-sm">Avg Unit Cost</div>
          <div className="text-white text-2xl font-bold">${avgUnitCost.toFixed(2)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center space-x-2">
          <FunnelIcon className="w-4 h-4 text-gray-400" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-white text-sm"
          >
            <option value="all">All Statuses</option>
            {uniqueStatuses.map(status => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <ShoppingBagIcon className="w-4 h-4 text-gray-400" />
          <select
            value={filterVendor}
            onChange={(e) => setFilterVendor(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-white text-sm"
          >
            <option value="all">All Vendors</option>
            {uniqueVendors.map(vendor => (
              <option key={vendor} value={vendor}>{vendor}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-gray-400 text-sm">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'quantity' | 'cost')}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-white text-sm"
          >
            <option value="date">Date</option>
            <option value="quantity">Quantity</option>
            <option value="cost">Unit Cost</option>
          </select>
          <Button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            variant="secondary"
            size="sm"
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Order</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Vendor</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Date</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">Quantity</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">Unit Cost</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">Total</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Tracking</th>
            </tr>
          </thead>
          <tbody>
            {filteredHistory.map((item) => (
              <tr key={item.poId} className="border-b border-gray-800 hover:bg-gray-800/50">
                <td className="py-3 px-4">
                  <div>
                    <div className="text-white font-medium">{item.orderId}</div>
                    <div className="text-gray-400 text-xs">{item.poId}</div>
                  </div>
                </td>
                <td className="py-3 px-4 text-white">{item.vendorName}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center space-x-2">
                    <CalendarIcon className="w-4 h-4 text-gray-400" />
                    <span className="text-white">{new Date(item.orderDate).toLocaleDateString()}</span>
                  </div>
                  {item.expectedDate && (
                    <div className="text-gray-400 text-xs">
                      Expected: {new Date(item.expectedDate).toLocaleDateString()}
                    </div>
                  )}
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(item.status)}
                    <span className={getStatusColor(item.status)}>
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4 text-white text-right">{item.quantity.toLocaleString()}</td>
                <td className="py-3 px-4 text-white text-right">${item.unitCost.toFixed(2)}</td>
                <td className="py-3 px-4 text-white text-right font-medium">
                  ${item.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-4">
                  {item.trackingNumber ? (
                    <div>
                      <div className="text-white text-xs">{item.trackingNumber}</div>
                      {item.trackingStatus && (
                        <div className="text-gray-400 text-xs">{item.trackingStatus}</div>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-500 text-xs">No tracking</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredHistory.length === 0 && (
        <div className="text-center py-12">
          <ShoppingBagIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No purchase history found for this SKU</p>
        </div>
      )}
    </div>
  );
};

export { PurchaseHistoryTable };