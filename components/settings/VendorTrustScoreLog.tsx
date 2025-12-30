/**
 * Vendor Trust Score Log
 * Simple technical log of vendor scoring events and actions
 * Admin-only visibility in Settings - for deeper investigation
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { useTheme } from '../ThemeProvider';
import { RefreshIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from '../icons';
import Button from '../ui/Button';

interface VendorInteractionEvent {
  id: string;
  vendor_id: string;
  vendor_name?: string;
  event_type: string;
  trigger_source: string | null;
  payload: Record<string, unknown> | null;
  delivered_on_time: boolean | null;
  created_at: string;
}

interface VendorConfidenceChange {
  id: string;
  vendor_id: string;
  vendor_name?: string;
  confidence_score: number;
  trend: string;
  communication_status: string;
  updated_at: string;
}

interface VendorTrustScoreLogProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const VendorTrustScoreLog: React.FC<VendorTrustScoreLogProps> = ({ addToast }) => {
  const { isDark } = useTheme();
  const [events, setEvents] = useState<VendorInteractionEvent[]>([]);
  const [profiles, setProfiles] = useState<VendorConfidenceChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'events' | 'scores'>('events');

  const cardClass = isDark
    ? "bg-gray-900/60 border border-gray-700 rounded-lg"
    : "bg-gray-50 border border-gray-200 rounded-lg";

  const headerClass = isDark
    ? "text-xs font-mono text-gray-500 uppercase"
    : "text-xs font-mono text-gray-500 uppercase";

  const rowClass = isDark
    ? "text-sm font-mono text-gray-300"
    : "text-sm font-mono text-gray-700";

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load vendor interaction events (the action log)
      const { data: eventData, error: eventError } = await supabase
        .from('vendor_interaction_events')
        .select(`
          id,
          vendor_id,
          event_type,
          trigger_source,
          payload,
          delivered_on_time,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (eventError) {
        console.error('[VendorTrustScoreLog] Failed to load events:', eventError);
      } else {
        // Fetch vendor names separately
        const vendorIds = [...new Set((eventData || []).map(e => e.vendor_id))];
        if (vendorIds.length > 0) {
          const { data: vendors } = await supabase
            .from('vendors')
            .select('id, name')
            .in('id', vendorIds);

          const vendorMap = new Map((vendors || []).map(v => [v.id, v.name]));

          setEvents((eventData || []).map(e => ({
            ...e,
            vendor_name: vendorMap.get(e.vendor_id) || 'Unknown',
          })));
        } else {
          setEvents([]);
        }
      }

      // Load vendor confidence profiles (current scores)
      const { data: profileData, error: profileError } = await supabase
        .from('vendor_confidence_profiles')
        .select(`
          id,
          vendor_id,
          confidence_score,
          trend,
          communication_status,
          updated_at
        `)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (profileError) {
        console.error('[VendorTrustScoreLog] Failed to load profiles:', profileError);
      } else {
        // Fetch vendor names
        const vendorIds = [...new Set((profileData || []).map(e => e.vendor_id))];
        if (vendorIds.length > 0) {
          const { data: vendors } = await supabase
            .from('vendors')
            .select('id, name')
            .in('id', vendorIds);

          const vendorMap = new Map((vendors || []).map(v => [v.id, v.name]));

          setProfiles((profileData || []).map(p => ({
            ...p,
            vendor_name: vendorMap.get(p.vendor_id) || 'Unknown',
          })));
        } else {
          setProfiles([]);
        }
      }
    } catch (err) {
      console.error('[VendorTrustScoreLog] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const getEventTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'po_delivery': 'PO Delivered',
      'email_response': 'Email Response',
      'followup_sent': 'Followup Sent',
      'email_correlation': 'Email Matched',
      'tracking_update': 'Tracking Update',
      'delay_notice': 'Delay Notice',
      'confirmation': 'Confirmation',
    };
    return labels[type] || type;
  };

  const getEventIcon = (event: VendorInteractionEvent) => {
    if (event.delivered_on_time === true) {
      return <CheckCircleIcon className="w-3 h-3 text-green-500" />;
    }
    if (event.delivered_on_time === false) {
      return <XCircleIcon className="w-3 h-3 text-red-500" />;
    }
    return <ClockIcon className="w-3 h-3 text-gray-500" />;
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'improving': return isDark ? 'text-green-400' : 'text-green-600';
      case 'declining': return isDark ? 'text-red-400' : 'text-red-600';
      default: return isDark ? 'text-gray-400' : 'text-gray-600';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 7) return isDark ? 'text-green-400' : 'text-green-600';
    if (score >= 5) return isDark ? 'text-amber-400' : 'text-amber-600';
    return isDark ? 'text-red-400' : 'text-red-600';
  };

  const tabClass = (tab: string) =>
    `px-3 py-1.5 text-xs font-medium rounded transition-colors ${
      activeTab === tab
        ? isDark
          ? 'bg-gray-700 text-white'
          : 'bg-gray-200 text-gray-900'
        : isDark
          ? 'text-gray-400 hover:text-white hover:bg-gray-800'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
    }`;

  return (
    <div className="space-y-4">
      {/* Header with tabs and refresh */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button className={tabClass('events')} onClick={() => setActiveTab('events')}>
            Activity Log ({events.length})
          </button>
          <button className={tabClass('scores')} onClick={() => setActiveTab('scores')}>
            Current Scores ({profiles.length})
          </button>
        </div>
        <Button
          onClick={loadData}
          variant="ghost"
          size="sm"
          disabled={loading}
          className="flex items-center gap-1"
        >
          <RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Activity Log Tab */}
      {activeTab === 'events' && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-left">
              <thead className={`sticky top-0 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
                <tr>
                  <th className={`px-3 py-2 ${headerClass}`}>Time</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Vendor</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Event</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Source</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={`px-3 py-4 text-center ${rowClass}`}>
                      {loading ? 'Loading...' : 'No vendor activity recorded yet'}
                    </td>
                  </tr>
                ) : (
                  events.map((event) => (
                    <tr key={event.id} className={isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}>
                      <td className={`px-3 py-2 ${rowClass} whitespace-nowrap`}>
                        {formatTimestamp(event.created_at)}
                      </td>
                      <td className={`px-3 py-2 ${rowClass} max-w-[150px] truncate`} title={event.vendor_name}>
                        {event.vendor_name}
                      </td>
                      <td className={`px-3 py-2 ${rowClass}`}>
                        {getEventTypeLabel(event.event_type)}
                      </td>
                      <td className={`px-3 py-2 ${rowClass}`}>
                        <span className="text-gray-500">
                          {event.trigger_source || '-'}
                        </span>
                      </td>
                      <td className={`px-3 py-2 ${rowClass}`}>
                        <div className="flex items-center gap-1">
                          {getEventIcon(event)}
                          {event.delivered_on_time === true && <span className="text-green-400">on-time</span>}
                          {event.delivered_on_time === false && <span className="text-red-400">late</span>}
                          {event.delivered_on_time === null && <span className="text-gray-500">-</span>}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Scores Tab */}
      {activeTab === 'scores' && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-left">
              <thead className={`sticky top-0 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
                <tr>
                  <th className={`px-3 py-2 ${headerClass}`}>Vendor</th>
                  <th className={`px-3 py-2 ${headerClass} text-center`}>Score</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Trend</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Status</th>
                  <th className={`px-3 py-2 ${headerClass}`}>Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {profiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={`px-3 py-4 text-center ${rowClass}`}>
                      {loading ? 'Loading...' : 'No confidence scores recorded yet'}
                    </td>
                  </tr>
                ) : (
                  profiles.map((profile) => (
                    <tr key={profile.id} className={isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}>
                      <td className={`px-3 py-2 ${rowClass} max-w-[180px] truncate`} title={profile.vendor_name}>
                        {profile.vendor_name}
                      </td>
                      <td className={`px-3 py-2 text-center`}>
                        <span className={`font-bold ${getScoreColor(profile.confidence_score)}`}>
                          {profile.confidence_score?.toFixed(1) || '-'}
                        </span>
                        <span className="text-gray-500 text-xs">/10</span>
                      </td>
                      <td className={`px-3 py-2 ${getTrendColor(profile.trend)}`}>
                        {profile.trend === 'improving' && '↑'}
                        {profile.trend === 'declining' && '↓'}
                        {profile.trend === 'stable' && '→'}
                        <span className="ml-1">{profile.trend || '-'}</span>
                      </td>
                      <td className={`px-3 py-2 ${rowClass}`}>
                        {profile.communication_status || '-'}
                      </td>
                      <td className={`px-3 py-2 ${rowClass} whitespace-nowrap`}>
                        {formatTimestamp(profile.updated_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className={`${cardClass} p-3`}>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className={headerClass}>Events (24h)</div>
            <div className={`text-lg font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {events.filter(e => new Date(e.created_at) > new Date(Date.now() - 86400000)).length}
            </div>
          </div>
          <div>
            <div className={headerClass}>On-Time</div>
            <div className={`text-lg font-mono text-green-400`}>
              {events.filter(e => e.delivered_on_time === true).length}
            </div>
          </div>
          <div>
            <div className={headerClass}>Late</div>
            <div className={`text-lg font-mono text-red-400`}>
              {events.filter(e => e.delivered_on_time === false).length}
            </div>
          </div>
          <div>
            <div className={headerClass}>Tracked Vendors</div>
            <div className={`text-lg font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {profiles.length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VendorTrustScoreLog;
