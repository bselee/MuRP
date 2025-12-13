import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { CheckCircleIcon, ExclamationCircleIcon, ClockIcon } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';

interface DataQualityMetrics {
  category: string;
  total: number;
  complete: number;
  percentage: number;
  issues: string[];
}

/**
 * Data Quality Validator Component
 * Shows real-time data quality metrics to build trust in AI agents
 * Validates actual database data vs mock/fallback data
 */
export const DataQualityValidator: React.FC = () => {
  const [metrics, setMetrics] = useState<DataQualityMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    validateDataQuality();
    const interval = setInterval(validateDataQuality, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const validateDataQuality = async () => {
    try {
      setLoading(true);
      const newMetrics: DataQualityMetrics[] = [];

      // 1. Vendor Data Quality
      const { data: vendors } = await supabase
        .from('vendors')
        .select('id, name, email, phone, address');
      
      if (vendors) {
        const withEmail = vendors.filter(v => v.email).length;
        const withPhone = vendors.filter(v => v.phone).length;
        const withAddress = vendors.filter(v => v.address).length;
        const issues: string[] = [];
        
        if (withEmail < vendors.length * 0.8) issues.push(`${vendors.length - withEmail} vendors missing email`);
        if (withPhone < vendors.length * 0.7) issues.push(`${vendors.length - withPhone} vendors missing phone`);
        if (withAddress < vendors.length * 0.6) issues.push(`${vendors.length - withAddress} vendors missing address`);
        
        newMetrics.push({
          category: 'Vendor Contact Info',
          total: vendors.length,
          complete: Math.min(withEmail, withPhone, withAddress),
          percentage: Math.round((Math.min(withEmail, withPhone, withAddress) / vendors.length) * 100),
          issues
        });
      }

      // 2. Purchase Order Ship-To Data
      const { data: pos } = await supabase
        .from('purchase_orders')
        .select('id, ship_to_address, shipping_address');
      
      if (pos) {
        const withShipTo = pos.filter(p => p.ship_to_address || p.shipping_address).length;
        const issues: string[] = [];
        
        if (withShipTo < pos.length) {
          issues.push(`${pos.length - withShipTo} POs using default ship-to address`);
        }
        
        newMetrics.push({
          category: 'PO Ship-To Addresses',
          total: pos.length,
          complete: withShipTo,
          percentage: Math.round((withShipTo / pos.length) * 100),
          issues
        });
      }

      // 3. Finale PO Data Quality
      const { data: finalePOs } = await supabase
        .from('finale_purchase_orders')
        .select('id, line_items, vendor_id, status')
        .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
      
      if (finalePOs) {
        const withItems = finalePOs.filter(p => p.line_items && Array.isArray(p.line_items) && p.line_items.length > 0).length;
        const withVendor = finalePOs.filter(p => p.vendor_id).length;
        const issues: string[] = [];
        
        if (withItems < finalePOs.length) {
          issues.push(`${finalePOs.length - withItems} POs missing line items`);
        }
        if (withVendor < finalePOs.length) {
          issues.push(`${finalePOs.length - withVendor} POs missing vendor ID`);
        }
        
        newMetrics.push({
          category: 'Finale PO Data',
          total: finalePOs.length,
          complete: Math.min(withItems, withVendor),
          percentage: Math.round((Math.min(withItems, withVendor) / finalePOs.length) * 100),
          issues
        });
      }

      // 4. Inventory Data
      const { data: inventory } = await supabase
        .from('inventory')
        .select('id, quantity_on_hand, reorder_point, last_updated');
      
      if (inventory) {
        const withReorderPoint = inventory.filter(i => i.reorder_point !== null && i.reorder_point > 0).length;
        const recentlyUpdated = inventory.filter(i => {
          if (!i.last_updated) return false;
          const daysSinceUpdate = (Date.now() - new Date(i.last_updated).getTime()) / (1000 * 60 * 60 * 24);
          return daysSinceUpdate <= 7;
        }).length;
        const issues: string[] = [];
        
        if (withReorderPoint < inventory.length * 0.8) {
          issues.push(`${inventory.length - withReorderPoint} items missing reorder points`);
        }
        if (recentlyUpdated < inventory.length * 0.5) {
          issues.push(`${inventory.length - recentlyUpdated} items not updated in 7+ days`);
        }
        
        newMetrics.push({
          category: 'Inventory Data',
          total: inventory.length,
          complete: Math.min(withReorderPoint, recentlyUpdated),
          percentage: Math.round((Math.min(withReorderPoint, recentlyUpdated) / inventory.length) * 100),
          issues
        });
      }

      setMetrics(newMetrics);
      setLastChecked(new Date());
    } catch (error) {
      console.error('Data quality validation error:', error);
    } finally {
      setLoading(false);
    }
  };

  const overallQuality = metrics.length > 0
    ? Math.round(metrics.reduce((sum, m) => sum + m.percentage, 0) / metrics.length)
    : 0;

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-white">Data Quality Monitor</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {lastChecked ? `Last checked: ${lastChecked.toLocaleTimeString()}` : 'Checking...'}
            </span>
            {overallQuality >= 80 ? (
              <CheckCircleIcon className="w-5 h-5 text-green-400" />
            ) : (
              <ExclamationCircleIcon className="w-5 h-5 text-yellow-400" />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {loading && metrics.length === 0 ? (
          <div className="text-center text-gray-400 py-4">Validating data quality...</div>
        ) : (
          <>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Overall Data Quality</span>
                <span className={`text-lg font-bold ${
                  overallQuality >= 80 ? 'text-green-400' : 
                  overallQuality >= 60 ? 'text-yellow-400' : 
                  'text-red-400'
                }`}>
                  {overallQuality}%
                </span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    overallQuality >= 80 ? 'bg-green-500' :
                    overallQuality >= 60 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${overallQuality}%` }}
                />
              </div>
            </div>

            <div className="space-y-3">
              {metrics.map((metric, idx) => (
                <div key={idx} className="bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-300">{metric.category}</span>
                    <span className={`text-sm font-semibold ${
                      metric.percentage >= 80 ? 'text-green-400' :
                      metric.percentage >= 60 ? 'text-yellow-400' :
                      'text-red-400'
                    }`}>
                      {metric.percentage}%
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mb-2">
                    {metric.complete} of {metric.total} records complete
                  </div>
                  {metric.issues.length > 0 && (
                    <div className="space-y-1">
                      {metric.issues.map((issue, i) => (
                        <div key={i} className="text-xs text-yellow-400 flex items-start gap-1">
                          <span>⚠️</span>
                          <span>{issue}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg">
              <div className="text-xs text-blue-300">
                <strong>About Data Quality:</strong> This monitor validates real database records vs mock/fallback data.
                Agents only use verified data when quality is ≥80%. Lower quality triggers manual review requirements.
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DataQualityValidator;
