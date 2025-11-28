import React, { useState, useEffect } from 'react';
import type { HistoricalSale } from '../types';
import {
  ChartBarIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  CalendarIcon,
  CubeIcon,
} from './icons';

interface ConsumptionChartProps {
  sku: string;
}

interface ConsumptionData {
  date: string;
  quantity: number;
  cumulative: number;
}

interface AnalyticsSummary {
  totalConsumed: number;
  averageDaily: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  trendPercentage: number;
  daysOfStock: number;
  forecastedShortage: string | null;
}

const ConsumptionChart: React.FC<ConsumptionChartProps> = ({ sku }) => {
  const [consumptionData, setConsumptionData] = useState<ConsumptionData[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'30' | '60' | '90'>('30');

  useEffect(() => {
    loadConsumptionData();
  }, [sku, timeRange]);

  const loadConsumptionData = async () => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Replace with actual API call to get consumption data for SKU
      // For now, using mock data
      const days = parseInt(timeRange);
      const mockData: ConsumptionData[] = [];
      let cumulative = 1000; // Starting stock

      for (let i = days; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const quantity = Math.floor(Math.random() * 20) + 5; // Random consumption 5-25
        cumulative -= quantity;

        mockData.push({
          date: date.toISOString().split('T')[0],
          quantity,
          cumulative: Math.max(0, cumulative),
        });
      }

      setConsumptionData(mockData);
      calculateAnalytics(mockData);
    } catch (err) {
      console.error('Failed to load consumption data:', err);
      setError('Failed to load consumption analytics');
    } finally {
      setLoading(false);
    }
  };

  const calculateAnalytics = (data: ConsumptionData[]) => {
    if (data.length === 0) {
      setAnalytics(null);
      return;
    }

    const totalConsumed = data.reduce((sum, item) => sum + item.quantity, 0);
    const averageDaily = totalConsumed / data.length;

    // Calculate trend (compare first half vs second half)
    const midpoint = Math.floor(data.length / 2);
    const firstHalf = data.slice(0, midpoint);
    const secondHalf = data.slice(midpoint);

    const firstHalfAvg = firstHalf.reduce((sum, item) => sum + item.quantity, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, item) => sum + item.quantity, 0) / secondHalf.length;

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    let trendPercentage = 0;

    if (secondHalfAvg > firstHalfAvg * 1.1) {
      trend = 'increasing';
      trendPercentage = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
    } else if (secondHalfAvg < firstHalfAvg * 0.9) {
      trend = 'decreasing';
      trendPercentage = ((firstHalfAvg - secondHalfAvg) / firstHalfAvg) * 100;
    }

    // Mock current stock and reorder calculations
    const currentStock = 150;
    const reorderPoint = 100;
    const daysOfStock = currentStock / averageDaily;

    let forecastedShortage = null;
    if (daysOfStock < 30) {
      const shortageDate = new Date();
      shortageDate.setDate(shortageDate.getDate() + Math.floor(daysOfStock));
      forecastedShortage = shortageDate.toLocaleDateString();
    }

    setAnalytics({
      totalConsumed,
      averageDaily,
      trend,
      trendPercentage,
      daysOfStock,
      forecastedShortage,
    });
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUpIcon className="w-5 h-5 text-red-400" />;
      case 'decreasing':
        return <TrendingDownIcon className="w-5 h-5 text-green-400" />;
      default:
        return <TrendingUpIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return 'text-red-400';
      case 'decreasing':
        return 'text-green-400';
      default:
        return 'text-gray-400';
    }
  };

  // Simple bar chart representation
  const maxQuantity = Math.max(...consumptionData.map(d => d.quantity));
  const chartHeight = 200;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-400">Loading consumption analytics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        <div className="flex items-center">
          <div className="text-red-400">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Consumption Analytics</h3>
        <div className="flex items-center space-x-2">
          <span className="text-gray-400 text-sm">Time Range:</span>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as '30' | '60' | '90')}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-white text-sm"
          >
            <option value="30">30 Days</option>
            <option value="60">60 Days</option>
            <option value="90">90 Days</option>
          </select>
        </div>
      </div>

      {/* Analytics Summary Cards */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-400 text-sm">Total Consumed</div>
                <div className="text-white text-2xl font-bold">{analytics.totalConsumed.toLocaleString()}</div>
              </div>
              <CubeIcon className="w-8 h-8 text-blue-400" />
            </div>
          </div>

          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-400 text-sm">Daily Average</div>
                <div className="text-white text-2xl font-bold">{analytics.averageDaily.toFixed(1)}</div>
              </div>
              <ChartBarIcon className="w-8 h-8 text-green-400" />
            </div>
          </div>

          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-400 text-sm">Trend</div>
                <div className={`text-xl font-bold flex items-center space-x-1 ${getTrendColor(analytics.trend)}`}>
                  {getTrendIcon(analytics.trend)}
                  <span>{analytics.trend.charAt(0).toUpperCase() + analytics.trend.slice(1)}</span>
                </div>
                <div className="text-xs text-gray-400">
                  {analytics.trendPercentage > 0 ? `${analytics.trendPercentage.toFixed(1)}%` : 'Stable'}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-400 text-sm">Days of Stock</div>
                <div className={`text-2xl font-bold ${analytics.daysOfStock < 30 ? 'text-red-400' : 'text-green-400'}`}>
                  {analytics.daysOfStock.toFixed(0)}
                </div>
                {analytics.forecastedShortage && (
                  <div className="text-xs text-red-400">
                    Shortage: {analytics.forecastedShortage}
                  </div>
                )}
              </div>
              <CalendarIcon className="w-8 h-8 text-yellow-400" />
            </div>
          </div>
        </div>
      )}

      {/* Consumption Chart */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <h4 className="text-white font-medium mb-4">Daily Consumption</h4>
        <div className="relative" style={{ height: chartHeight + 40 }}>
          <div className="flex items-end space-x-1 h-full">
            {consumptionData.slice(-20).map((data, index) => {
              const height = (data.quantity / maxQuantity) * chartHeight;
              return (
                <div key={data.date} className="flex-1 flex flex-col items-center">
                  <div
                    className="bg-blue-500 rounded-t w-full min-w-[8px] transition-all hover:bg-blue-400"
                    style={{ height: `${height}px` }}
                    title={`${data.date}: ${data.quantity} units`}
                  />
                  <span className="text-xs text-gray-400 mt-2 transform -rotate-45 origin-top-left whitespace-nowrap">
                    {new Date(data.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cumulative Stock Chart */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <h4 className="text-white font-medium mb-4">Stock Level Trend</h4>
        <div className="relative" style={{ height: chartHeight + 40 }}>
          <div className="flex items-end space-x-1 h-full">
            {consumptionData.slice(-20).map((data, index) => {
              const maxStock = Math.max(...consumptionData.map(d => d.cumulative));
              const height = (data.cumulative / maxStock) * chartHeight;
              return (
                <div key={data.date} className="flex-1 flex flex-col items-center">
                  <div
                    className="bg-green-500 rounded-t w-full min-w-[8px] transition-all hover:bg-green-400"
                    style={{ height: `${height}px` }}
                    title={`${data.date}: ${data.cumulative} units remaining`}
                  />
                  <span className="text-xs text-gray-400 mt-2 transform -rotate-45 origin-top-left whitespace-nowrap">
                    {new Date(data.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Reorder point line */}
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed border-red-400"
            style={{ bottom: `${(100 / Math.max(...consumptionData.map(d => d.cumulative))) * chartHeight}px` }}
          >
            <span className="absolute -top-6 left-2 text-xs text-red-400">Reorder Point</span>
          </div>
        </div>
      </div>

      {/* Insights */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <h4 className="text-blue-400 font-medium mb-2">AI Insights</h4>
        <ul className="text-gray-300 text-sm space-y-1">
          <li>• Consumption shows {analytics?.trend} trend over the last {timeRange} days</li>
          <li>• Average daily usage: {analytics?.averageDaily.toFixed(1)} units</li>
          {analytics?.forecastedShortage && (
            <li className="text-red-400">• ⚠️ Potential stock shortage forecasted for {analytics.forecastedShortage}</li>
          )}
          <li>• Consider adjusting reorder point based on consumption patterns</li>
        </ul>
      </div>
    </div>
  );
};

export { ConsumptionChart };