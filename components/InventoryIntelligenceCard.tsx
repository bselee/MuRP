/**
 * Inventory Intelligence Card
 * 
 * Displays comprehensive inventory metrics similar to BuildASoil's system:
 * - Remaining stock & sales velocity
 * - Reorder recommendations
 * - Lead time tracking
 * - Consumption forecasting
 * - Purchase deadline alerts
 */

import React, { useMemo } from 'react';
import { AlertTriangle, TrendingDown, TrendingUp, Calendar, Clock, Package, ShoppingCart } from 'lucide-react';

interface InventoryItem {
  id?: string;
  sku: string;
  name: string;
  stock: number;
  onOrder?: number;
  on_order?: number; // Legacy snake_case support
  reserved?: number;
  reorderPoint?: number;
  order_point?: number; // Legacy snake_case support
  moq?: number;
  unitCost?: number;
  cost?: number; // Legacy snake_case support
  unitPrice?: number;
  price?: number; // Legacy snake_case support
  vendorId?: string | null;
  default_vendor_id?: string | null; // Legacy snake_case support

  // Historical data from analytics
  last_30_days_sold?: number;
  last_90_days_sold?: number;
  avg_build_consumption?: number;
  last_received_date?: string;
  supplier_lead_time_days?: number;
  // Additional analytics fields
  daily_consumption_rate?: number;
  days_of_stock_remaining?: number;
  reorder_status?: string;
}

interface InventoryMetrics {
  remaining: number;
  last30DaysSold: number;
  last90DaysSold: number;
  dailyVelocity: number;
  daysOfStockLeft: number;
  consumption90Day: number;
  avgBuildConsumption: number | 'Purchased Only';
  onOrder: number;
  recommendedReorderQty: number;
  urgency: 'CRITICAL' | 'SOON' | 'OK' | 'GOOD';
  purchaseAgainBy: string | null;
  supplierLeadTime: number;
  lastReceived: string | null;
}

function calculateInventoryMetrics(item: InventoryItem): InventoryMetrics {
  const remaining = item.stock;
  const last30DaysSold = item.last_30_days_sold || 0;
  const last90DaysSold = item.last_90_days_sold || 0;
  const consumption90Day = last90DaysSold;

  // Use pre-calculated daily rate if available, otherwise calculate from 30-day sales
  const dailyVelocity = item.daily_consumption_rate ?? (last30DaysSold / 30);

  // Use pre-calculated days remaining if available, otherwise calculate
  const daysOfStockLeft = item.days_of_stock_remaining ?? (dailyVelocity > 0
    ? Math.floor(remaining / dailyVelocity)
    : 999);

  // Get on_order from either camelCase or snake_case
  const onOrder = item.onOrder ?? item.on_order ?? 0;
  
  // Supplier lead time
  const supplierLeadTime = item.supplier_lead_time_days || 26; // Default from image
  
  // Purchase deadline (days left - lead time)
  const purchaseDeadlineDays = daysOfStockLeft - supplierLeadTime;
  const purchaseAgainBy = purchaseDeadlineDays > 0
    ? new Date(Date.now() + purchaseDeadlineDays * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    : null;
  
  // Map reorder_status from analytics to urgency, or calculate from deadline
  let urgency: 'CRITICAL' | 'SOON' | 'OK' | 'GOOD';
  if (item.reorder_status) {
    // Use pre-calculated status from analytics
    switch (item.reorder_status) {
      case 'OUT_OF_STOCK':
      case 'CRITICAL':
        urgency = 'CRITICAL';
        break;
      case 'REORDER_NOW':
        urgency = 'SOON';
        break;
      case 'REORDER_SOON':
        urgency = 'OK';
        break;
      default:
        urgency = 'GOOD';
    }
  } else {
    // Calculate from deadline
    if (purchaseDeadlineDays <= 0) {
      urgency = 'CRITICAL';
    } else if (purchaseDeadlineDays <= 7) {
      urgency = 'SOON';
    } else if (purchaseDeadlineDays <= 30) {
      urgency = 'OK';
    } else {
      urgency = 'GOOD';
    }
  }

  // Recommended reorder quantity (cover lead time + buffer)
  const recommendedReorderQty = Math.max(
    item.moq || 0,
    Math.ceil(dailyVelocity * (supplierLeadTime + 14)) // Lead time + 2 week buffer
  );

  return {
    remaining,
    last30DaysSold,
    last90DaysSold,
    dailyVelocity,
    daysOfStockLeft,
    consumption90Day,
    avgBuildConsumption: item.avg_build_consumption !== undefined ? item.avg_build_consumption : 'Purchased Only',
    onOrder,
    recommendedReorderQty,
    urgency,
    purchaseAgainBy,
    supplierLeadTime,
    lastReceived: item.last_received_date || null,
  };
}

interface Props {
  item: InventoryItem;
  className?: string;
}

export default function InventoryIntelligenceCard({ item, className = '' }: Props) {
  const metrics = useMemo(() => calculateInventoryMetrics(item), [item]);
  
  const urgencyColors = {
    CRITICAL: 'bg-red-500 text-white',
    SOON: 'bg-yellow-400 text-black',
    OK: 'bg-blue-500 text-white',
    GOOD: 'bg-green-500 text-white',
  };
  
  const urgencyBorderColors = {
    CRITICAL: 'border-red-500',
    SOON: 'border-yellow-400',
    OK: 'border-blue-500',
    GOOD: 'border-green-500',
  };
  
  return (
    <div className={`bg-gray-900 rounded-lg p-6 border-2 ${urgencyBorderColors[metrics.urgency]} ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-white">{item.sku}</h3>
          <p className="text-gray-400 text-sm">{item.name}</p>
        </div>
        {metrics.purchaseAgainBy && (
          <div className="text-right">
            <div className="text-xs text-gray-400 mb-1">📅 PURCHASE AGAIN BY:</div>
            <div className="text-lg font-bold text-white">{metrics.purchaseAgainBy}</div>
          </div>
        )}
      </div>
      
      {/* Metrics Grid - Top Row */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {/* Remaining */}
        <div className="bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">REMAINING</div>
          <div className="text-2xl font-bold text-white">{metrics.remaining}</div>
        </div>
        
        {/* Last 30 Days Sold */}
        <div className="bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">LAST 30 DAYS SOLD</div>
          <div className="text-2xl font-bold text-white">{metrics.last30DaysSold}</div>
        </div>
        
        {/* Last 90 Days Sold */}
        <div className="bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">LAST 90 DAYS SOLD</div>
          <div className="text-2xl font-bold text-white">{metrics.last90DaysSold}</div>
        </div>
        
        {/* Daily Velocity */}
        <div className="bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">DAILY VELOCITY</div>
          <div className="text-2xl font-bold text-white">{metrics.dailyVelocity.toFixed(2)}</div>
        </div>
      </div>
      
      {/* Metrics Grid - Middle Row */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {/* 90 Day Consumed */}
        <div className="bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">90 DAY CONSUMED</div>
          <div className="text-2xl font-bold text-white">{metrics.consumption90Day}</div>
        </div>
        
        {/* Avg Build Consumption */}
        <div className="bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">AVG BUILD CONSUMPTION</div>
          <div className="text-lg font-bold text-white">
            {typeof metrics.avgBuildConsumption === 'number' 
              ? metrics.avgBuildConsumption 
              : metrics.avgBuildConsumption}
          </div>
        </div>
        
        {/* Days/Builds Left */}
        <div className="bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">DAYS/BUILDS LEFT</div>
          <div className="text-2xl font-bold text-white">{metrics.daysOfStockLeft}</div>
        </div>
        
        {/* Last Received */}
        <div className="bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">LAST RECEIVED</div>
          <div className="text-lg font-bold text-white">
            {metrics.lastReceived || 'N/A'}
          </div>
        </div>
      </div>
      
      {/* Metrics Grid - Bottom Row */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {/* Supplier Lead Time */}
        <div className="bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">SUPPLIER LEAD TIME</div>
          <div className="text-2xl font-bold text-white">{metrics.supplierLeadTime} days</div>
        </div>
        
        {/* On Order */}
        <div className="bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">ON ORDER</div>
          <div className="text-2xl font-bold text-white">{metrics.onOrder}</div>
        </div>
        
        {/* Rec. Reorder Qty */}
        <div className="bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">REC. REORDER QTY</div>
          <div className="text-2xl font-bold text-white">{metrics.recommendedReorderQty}</div>
        </div>
        
        {/* Urgency */}
        <div className="bg-gray-800 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">URGENCY</div>
          <div className={`text-lg font-bold px-2 py-1 rounded ${urgencyColors[metrics.urgency]}`}>
            {metrics.urgency}
          </div>
        </div>
      </div>
      
      {/* Alert Banner */}
      {metrics.urgency === 'CRITICAL' || metrics.urgency === 'SOON' ? (
        <div className={`flex items-center gap-2 p-3 rounded ${
          metrics.urgency === 'CRITICAL' ? 'bg-red-900/50 border border-red-500' : 'bg-yellow-900/50 border border-yellow-500'
        }`}>
          <AlertTriangle className={metrics.urgency === 'CRITICAL' ? 'text-red-400' : 'text-yellow-400'} />
          <span className="text-white font-semibold">
            {metrics.urgency === 'CRITICAL' 
              ? `CRITICAL: Order immediately! Only ${metrics.daysOfStockLeft} days of stock left.`
              : `Order soon: ${metrics.daysOfStockLeft} days until recommended reorder.`
            }
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Inventory Intelligence List View
 * Shows multiple items with intelligence metrics
 */
interface ListProps {
  items: InventoryItem[];
  className?: string;
}

export function InventoryIntelligenceList({ items, className = '' }: ListProps) {
  // Sort by urgency (most critical first)
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const metricsA = calculateInventoryMetrics(a);
      const metricsB = calculateInventoryMetrics(b);
      
      const urgencyOrder = { CRITICAL: 0, SOON: 1, OK: 2, GOOD: 3 };
      return urgencyOrder[metricsA.urgency] - urgencyOrder[metricsB.urgency];
    });
  }, [items]);
  
  return (
    <div className={`space-y-4 ${className}`}>
      {sortedItems.map(item => (
        <InventoryIntelligenceCard key={item.id} item={item} />
      ))}
    </div>
  );
}
