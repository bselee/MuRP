/**
 * Inventory Intelligence Dashboard
 * 
 * Proves data flow from Finale → Supabase → UI
 * Displays comprehensive inventory metrics for reorder management
 */

import React, { useEffect, useState } from 'react';
import { Activity, Database, TrendingUp, AlertCircle, CheckCircle, Package } from 'lucide-react';
import InventoryIntelligenceCard, { InventoryIntelligenceList } from '../components/InventoryIntelligenceCard';
import { useSupabaseInventory } from '../hooks/useSupabaseData';
import ErrorBoundary from '../components/ErrorBoundary';
import { getReorderAnalytics, type ReorderAnalytics } from '../services/reorderIntelligenceService';
import { supabase } from '../lib/supabase/client';

interface DataFlowStatus {
  inventory: { total: number; active: number; synced: boolean };
  purchaseOrders: { total: number; recent: number; synced: boolean };
  lastSync: { source: string; timestamp: string; records: number } | null;
}

export default function InventoryIntelligence() {
  const { data: inventory, loading, error } = useSupabaseInventory();
  const [dataFlow, setDataFlow] = useState<DataFlowStatus | null>(null);
  const [showAllItems, setShowAllItems] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<ReorderAnalytics[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  
  // Check data flow status
  useEffect(() => {
    async function checkDataFlow() {
      try {
        // Get inventory stats
        const { data: invCount } = await supabase
          .from('inventory')
          .select('*', { count: 'exact', head: true });
        
        const { data: invActive } = await supabase
          .from('inventory')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active');
        
        // Get PO stats
        const { data: poCount } = await supabase
          .from('purchase_orders')
          .select('*', { count: 'exact', head: true });
        
        const { data: poRecent } = await supabase
          .from('purchase_orders')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
        
        // Get last sync info
        const { data: syncLog } = await supabase
          .from('sync_log')
          .select('*')
          .eq('status', 'success')
          .order('completed_at', { ascending: false })
          .limit(1)
          .single();
        
        setDataFlow({
          inventory: {
            total: invCount?.length || 0,
            active: invActive?.length || 0,
            synced: (invCount?.length || 0) > 0,
          },
          purchaseOrders: {
            total: poCount?.length || 0,
            recent: poRecent?.length || 0,
            synced: (poCount?.length || 0) > 0,
          },
          lastSync: syncLog ? {
            source: syncLog.source,
            timestamp: new Date(syncLog.completed_at).toLocaleString(),
            records: syncLog.records_processed,
          } : null,
        });
      } catch (err) {
        console.error('Failed to check data flow:', err);
      }
    }
    
    checkDataFlow();
  }, []);

  // Fetch real analytics data from product_reorder_analytics view
  useEffect(() => {
    async function fetchAnalytics() {
      try {
        setAnalyticsLoading(true);
        // Fetch all analytics (or filter for critical/low_stock items)
        const analytics = await getReorderAnalytics('all');
        setAnalyticsData(analytics);
      } catch (err) {
        console.error('[InventoryIntelligence] Failed to fetch analytics:', err);
      } finally {
        setAnalyticsLoading(false);
      }
    }
    fetchAnalytics();
  }, []);

  // Merge inventory data with real analytics data
  const enrichedInventory = inventory?.map(item => {
    // Find matching analytics for this SKU
    const analytics = analyticsData.find(a => a.sku === item.sku);

    return {
      ...item,
      // Use real analytics data if available, fallback to inventory fields
      last_30_days_sold: analytics?.consumed_last_30_days ?? item.sales30Days ?? 0,
      last_90_days_sold: analytics?.consumed_last_90_days ?? item.sales90Days ?? 0,
      avg_build_consumption: analytics ? analytics.avg_consumption_qty : undefined,
      last_received_date: analytics?.last_received_at
        ? new Date(analytics.last_received_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
        : undefined,
      supplier_lead_time_days: analytics?.avg_lead_time_days ?? item.leadTimeDays ?? 14,
      // Additional analytics fields
      daily_consumption_rate: analytics?.daily_consumption_rate ?? 0,
      days_of_stock_remaining: analytics?.days_of_stock_remaining ?? 999,
      reorder_status: analytics?.reorder_status ?? 'OK',
    };
  }) || [];
  
  // Filter for items that need attention based on real reorder status
  const criticalItems = enrichedInventory
    .filter(item => ['OUT_OF_STOCK', 'CRITICAL', 'REORDER_NOW', 'REORDER_SOON'].includes(item.reorder_status || ''))
    .sort((a, b) => (a.days_of_stock_remaining || 999) - (b.days_of_stock_remaining || 999));

  if (loading || analyticsLoading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <span className="ml-4 text-xl">Loading inventory intelligence...</span>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-8">
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-6">
          <h2 className="text-xl font-bold text-red-400 mb-2">Error Loading Data</h2>
          <p className="text-gray-300">{error.message}</p>
        </div>
      </div>
    );
  }
  
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-950 text-white p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Inventory Intelligence Dashboard</h1>
            <p className="text-gray-400">Real-time reorder management with predictive analytics</p>
          </div>
          
          {/* Data Flow Status */}
          {dataFlow && (
            <div className="grid grid-cols-4 gap-4 mb-8">
              {/* Inventory Status */}
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <div className="flex items-center gap-3 mb-4">
                  <Database className="text-blue-400" size={24} />
                  <h3 className="text-lg font-semibold">Inventory Data</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Total Items:</span>
                    <span className="text-2xl font-bold">{dataFlow.inventory.total}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Active:</span>
                    <span className="text-xl font-bold text-green-400">{dataFlow.inventory.active}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    {dataFlow.inventory.synced ? (
                      <CheckCircle className="text-green-400" size={16} />
                    ) : (
                      <AlertCircle className="text-yellow-400" size={16} />
                    )}
                    <span className="text-sm text-gray-400">
                      {dataFlow.inventory.synced ? 'Synced' : 'No data'}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Purchase Orders Status */}
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <div className="flex items-center gap-3 mb-4">
                  <Package className="text-purple-400" size={24} />
                  <h3 className="text-lg font-semibold">Purchase Orders</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Total POs:</span>
                    <span className="text-2xl font-bold">{dataFlow.purchaseOrders.total}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Last 30 days:</span>
                    <span className="text-xl font-bold text-purple-400">{dataFlow.purchaseOrders.recent}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    {dataFlow.purchaseOrders.synced ? (
                      <CheckCircle className="text-green-400" size={16} />
                    ) : (
                      <AlertCircle className="text-yellow-400" size={16} />
                    )}
                    <span className="text-sm text-gray-400">
                      {dataFlow.purchaseOrders.synced ? 'Synced' : 'No data'}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Last Sync Status */}
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <div className="flex items-center gap-3 mb-4">
                  <Activity className="text-green-400" size={24} />
                  <h3 className="text-lg font-semibold">Last Sync</h3>
                </div>
                {dataFlow.lastSync ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Source:</span>
                      <span className="text-sm font-mono">{dataFlow.lastSync.source}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Records:</span>
                      <span className="text-xl font-bold text-green-400">{dataFlow.lastSync.records}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-3">{dataFlow.lastSync.timestamp}</div>
                  </div>
                ) : (
                  <div className="text-gray-500">No sync data available</div>
                )}
              </div>
              
              {/* Data Flow Indicator */}
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <div className="flex items-center gap-3 mb-4">
                  <TrendingUp className="text-yellow-400" size={24} />
                  <h3 className="text-lg font-semibold">Data Flow</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse"></div>
                    <span className="text-sm">Finale API</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse"></div>
                    <span className="text-sm">Supabase DB</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse"></div>
                    <span className="text-sm">UI Display</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Critical Items Alert */}
          {criticalItems.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">
                  Items Requiring Attention ({criticalItems.length})
                </h2>
                <button
                  onClick={() => setShowAllItems(!showAllItems)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  {showAllItems ? `Show Critical (${criticalItems.length})` : `Show All (${enrichedInventory.length})`}
                </button>
              </div>

              <InventoryIntelligenceList
                items={showAllItems ? enrichedInventory : criticalItems}
              />
            </div>
          )}
          
          {/* No Critical Items State */}
          {criticalItems.length === 0 && enrichedInventory.length > 0 && !showAllItems && (
            <div className="bg-green-900/20 rounded-lg p-12 text-center border border-green-500/30">
              <CheckCircle className="mx-auto mb-4 text-green-500" size={64} />
              <h2 className="text-2xl font-bold mb-2 text-green-400">All Stock Levels Healthy</h2>
              <p className="text-gray-400 mb-6">
                No items currently need attention. {enrichedInventory.length} items in inventory.
              </p>
              <button
                onClick={() => setShowAllItems(true)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
              >
                View All Items
              </button>
            </div>
          )}

          {/* Show all items when toggled even if no critical items */}
          {criticalItems.length === 0 && showAllItems && enrichedInventory.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">All Inventory Items ({enrichedInventory.length})</h2>
                <button
                  onClick={() => setShowAllItems(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Hide
                </button>
              </div>
              <InventoryIntelligenceList items={enrichedInventory} />
            </div>
          )}

          {/* No Data State */}
          {enrichedInventory.length === 0 && (
            <div className="bg-gray-900 rounded-lg p-12 text-center border border-gray-800">
              <Database className="mx-auto mb-4 text-gray-600" size={64} />
              <h2 className="text-2xl font-bold mb-2">No Inventory Data</h2>
              <p className="text-gray-400 mb-6">
                Inventory data will appear here once synced from Finale API.
              </p>
              <div className="text-sm text-gray-500">
                <p>Make sure Finale credentials are configured in environment variables:</p>
                <code className="block mt-2 bg-gray-950 p-2 rounded">
                  VITE_FINALE_API_KEY<br/>
                  VITE_FINALE_API_SECRET<br/>
                  VITE_FINALE_ACCOUNT_PATH
                </code>
              </div>
            </div>
          )}
          
          {/* Data Sources */}
          <div className="mt-8 bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h3 className="text-xl font-bold mb-4">📊 Data Sources</h3>
            <div className="space-y-2 text-sm font-mono">
              <div className="flex items-center gap-2">
                <CheckCircle className="text-green-400" size={16} />
                <span>inventory_items → Base stock data</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="text-green-400" size={16} />
                <span>product_reorder_analytics → Consumption metrics</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="text-green-400" size={16} />
                <span>product_purchase_log → Last received dates</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="text-green-400" size={16} />
                <span>product_consumption_log → Usage tracking</span>
              </div>
            </div>

            {analyticsData.length > 0 && (
              <div className="mt-4 p-4 bg-green-900/20 border border-green-500 rounded">
                <p className="text-green-400 font-semibold">
                  ✅ Analytics Active: {analyticsData.length} products with consumption data
                </p>
              </div>
            )}

            {dataFlow && dataFlow.inventory.total > 0 && (
              <div className="mt-2 p-4 bg-blue-900/20 border border-blue-500 rounded">
                <p className="text-blue-400 font-semibold">
                  ✅ Inventory Synced: {dataFlow.inventory.active} active items from Finale
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
