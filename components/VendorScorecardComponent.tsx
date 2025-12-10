'use client';

import React, { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface VendorPerformance {
  vendor_id: string;
  vendor_name: string;
  promised_lead_time_days: number;
  effective_lead_time_days: number;
  trust_score: number;
  on_time_rate: number;
  quality_rate: number;
  total_pos: number;
  trend: 'improving' | 'stable' | 'declining';
  recommendation?: string;
}

interface VendorScorecardProps {
  vendorId?: string; // If provided, show single vendor. Otherwise show all.
  limit?: number;
}

export default function VendorScorecardComponent({ vendorId, limit = 10 }: VendorScorecardProps) {
  const [vendors, setVendors] = useState<VendorPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadVendorPerformance();
  }, [vendorId]);

  const loadVendorPerformance = async () => {
    setLoading(true);

    let query = supabase
      .from('vendor_performance_metrics')
      .select(`
        vendor_id,
        effective_lead_time_days,
        trust_score,
        on_time_rate,
        quality_rate,
        vendors (
          id,
          name,
          lead_time_days
        )
      `)
      .order('trust_score', { ascending: false });

    if (vendorId) {
      query = query.eq('vendor_id', vendorId);
    } else {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error loading vendor performance:', error);
      setLoading(false);
      return;
    }

    // Get historical data to determine trend
    const enriched = await Promise.all(
      (data || []).map(async (v: any) => {
        const { data: history } = await supabase
          .from('vendor_performance_metrics')
          .select('trust_score, updated_at')
          .eq('vendor_id', v.vendor_id)
          .order('updated_at', { ascending: false })
          .limit(3);

        let trend: 'improving' | 'stable' | 'declining' = 'stable';
        if (history && history.length >= 2) {
          const scoreDiff = history[0].trust_score - history[history.length - 1].trust_score;
          if (scoreDiff > 5) trend = 'improving';
          else if (scoreDiff < -5) trend = 'declining';
        }

        // Count total POs
        const { count } = await supabase
          .from('purchase_orders')
          .select('*', { count: 'exact', head: true })
          .eq('vendor_id', v.vendor_id);

        // Generate recommendation
        let recommendation: string | undefined;
        if (v.trust_score < 60) {
          recommendation = 'Consider alternative suppliers for critical items';
        } else if (v.effective_lead_time_days > v.vendors.lead_time_days * 1.5) {
          recommendation = 'Consistent delays detected. Adjust planning lead time.';
        } else if (v.trust_score >= 95 && trend === 'improving') {
          recommendation = '✨ Candidate for Level 3 Autonomy (Auto-send POs)';
        }

        return {
          vendor_id: v.vendor_id,
          vendor_name: v.vendors.name,
          promised_lead_time_days: v.vendors.lead_time_days,
          effective_lead_time_days: v.effective_lead_time_days,
          trust_score: v.trust_score,
          on_time_rate: v.on_time_rate || 0,
          quality_rate: v.quality_rate || 100,
          total_pos: count || 0,
          trend,
          recommendation,
        };
      })
    );

    setVendors(enriched);
    setLoading(false);
  };

  const getTrustScoreColor = (score: number): string => {
    if (score >= 90) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 75) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getTrendIcon = (trend: string): string => {
    if (trend === 'improving') return '📈';
    if (trend === 'declining') return '📉';
    return '➡️';
  };

  if (loading) {
    return <div className="p-4 text-gray-500">Loading vendor performance...</div>;
  }

  if (vendors.length === 0) {
    return <div className="p-4 text-gray-500">No vendor performance data available yet.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Vendor Scorecards</h2>
        <div className="text-sm text-gray-500">
          {vendors.length} vendor{vendors.length !== 1 ? 's' : ''} tracked
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {vendors.map((vendor) => (
          <div
            key={vendor.vendor_id}
            className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-lg text-gray-900">{vendor.vendor_name}</h3>
                <div className="text-xs text-gray-500 mt-1">{vendor.total_pos} POs placed</div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-2xl">{getTrendIcon(vendor.trend)}</span>
              </div>
            </div>

            {/* Trust Score */}
            <div className={`rounded-lg border p-3 mb-3 ${getTrustScoreColor(vendor.trust_score)}`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Trust Score</div>
                <div className="text-3xl font-bold">{vendor.trust_score}</div>
              </div>
              <div className="text-xs mt-1 opacity-75">{vendor.trend}</div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-gray-50 rounded p-2">
                <div className="text-xs text-gray-600">On-Time Rate</div>
                <div className="text-lg font-semibold text-gray-900">
                  {vendor.on_time_rate.toFixed(1)}%
                </div>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <div className="text-xs text-gray-600">Quality Rate</div>
                <div className="text-lg font-semibold text-gray-900">
                  {vendor.quality_rate.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Lead Time Comparison */}
            <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
              <div className="text-xs font-medium text-blue-900 mb-2">Lead Time</div>
              <div className="flex items-center justify-between text-sm">
                <div>
                  <div className="text-xs text-blue-600">Promised</div>
                  <div className="font-semibold text-blue-900">
                    {vendor.promised_lead_time_days} days
                  </div>
                </div>
                <div className="text-blue-400">→</div>
                <div>
                  <div className="text-xs text-blue-600">Effective</div>
                  <div className="font-semibold text-blue-900">
                    {vendor.effective_lead_time_days} days
                  </div>
                </div>
              </div>
              {vendor.effective_lead_time_days > vendor.promised_lead_time_days && (
                <div className="mt-2 text-xs text-blue-700">
                  +{vendor.effective_lead_time_days - vendor.promised_lead_time_days} day buffer applied
                </div>
              )}
            </div>

            {/* Recommendation */}
            {vendor.recommendation && (
              <div
                className={`text-xs p-2 rounded ${
                  vendor.recommendation.includes('✨')
                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                    : vendor.recommendation.includes('alternative')
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                }`}
              >
                {vendor.recommendation}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
