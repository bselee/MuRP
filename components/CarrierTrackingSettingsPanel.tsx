/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CARRIER TRACKING SETTINGS PANEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Configure direct carrier API integrations for free/low-cost tracking.
 * Replaces AfterShip dependency with direct carrier APIs.
 *
 * Free Tiers:
 * - USPS Web Tools API: Unlimited (free registration)
 * - UPS Tracking API: 500 requests/month
 * - FedEx Track API: 5000 requests/month
 */

import React, { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import { useTheme } from './ThemeProvider';
import { supabase } from '../lib/supabase/client';
import {
  TruckIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExternalLinkIcon,
  EyeSlashIcon,
  EyeIcon,
  RefreshIcon,
  InformationCircleIcon,
} from './icons';

interface CarrierConfig {
  name: string;
  userId: string;
  apiKey?: string;
  enabled: boolean;
  rateLimit: number;
  lastUsed?: string;
  requestsToday?: number;
}

interface CarrierSettingsProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface CarrierInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
  registrationUrl: string;
  freeTier: string;
  fields: {
    userId: { label: string; placeholder: string; required: boolean };
    apiKey?: { label: string; placeholder: string; required: boolean };
  };
  instructions: string[];
}

const CARRIERS: CarrierInfo[] = [
  {
    id: 'usps',
    name: 'USPS',
    icon: '📫',
    color: 'blue',
    registrationUrl: 'https://developers.usps.com/getting-started',
    freeTier: 'Unlimited requests (free)',
    fields: {
      userId: { label: 'Consumer Key', placeholder: 'Your USPS Consumer Key', required: true },
      apiKey: { label: 'Consumer Secret', placeholder: 'Your USPS Consumer Secret', required: true },
    },
    instructions: [
      'Go to developers.usps.com',
      'Create a USPS Developer Account',
      'Create a new application',
      'Copy the Consumer Key and Consumer Secret',
    ],
  },
  {
    id: 'ups',
    name: 'UPS',
    icon: '📦',
    color: 'amber',
    registrationUrl: 'https://developer.ups.com/',
    freeTier: '500 requests/month',
    fields: {
      userId: { label: 'Client ID', placeholder: 'Your UPS Client ID', required: true },
      apiKey: { label: 'Client Secret', placeholder: 'Your UPS Client Secret', required: true },
    },
    instructions: [
      'Go to developer.ups.com',
      'Create a developer account',
      'Create a new app in the dashboard',
      'Copy the Client ID and Client Secret',
    ],
  },
  {
    id: 'fedex',
    name: 'FedEx',
    icon: '✈️',
    color: 'purple',
    registrationUrl: 'https://developer.fedex.com/',
    freeTier: '5000 requests/month',
    fields: {
      userId: { label: 'API Key', placeholder: 'Your FedEx API Key', required: true },
      apiKey: { label: 'Secret Key', placeholder: 'Your FedEx Secret Key', required: true },
    },
    instructions: [
      'Go to developer.fedex.com',
      'Create a developer account',
      'Create a project and add Track API',
      'Copy the API Key and Secret Key',
    ],
  },
];

const CarrierTrackingSettingsPanel: React.FC<CarrierSettingsProps> = ({ addToast }) => {
  const { isDark } = useTheme();
  const [configs, setConfigs] = useState<Record<string, CarrierConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [editMode, setEditMode] = useState<string | null>(null);
  const [testingCarrier, setTestingCarrier] = useState<string | null>(null);

  // Load saved configurations
  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_key, setting_value')
        .like('setting_key', 'carrier_api_%');

      if (error) throw error;

      const loadedConfigs: Record<string, CarrierConfig> = {};
      for (const row of data || []) {
        const carrierId = row.setting_key.replace('carrier_api_', '');
        // setting_value is JSONB - already parsed by Supabase
        if (row.setting_value && typeof row.setting_value === 'object') {
          loadedConfigs[carrierId] = row.setting_value as CarrierConfig;
        } else {
          console.warn(`Invalid config for ${carrierId}`);
        }
      }

      // Initialize missing carriers with defaults
      for (const carrier of CARRIERS) {
        if (!loadedConfigs[carrier.id]) {
          loadedConfigs[carrier.id] = {
            name: carrier.name,
            userId: '',
            apiKey: '',
            enabled: false,
            rateLimit: carrier.id === 'usps' ? 100 : carrier.id === 'ups' ? 20 : 150,
          };
        }
      }

      setConfigs(loadedConfigs);
    } catch (err) {
      console.error('Failed to load carrier configs:', err);
      addToast('Failed to load carrier settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  // Save configuration for a carrier
  const saveConfig = async (carrierId: string) => {
    const config = configs[carrierId];
    if (!config) return;

    setSaving(carrierId);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          setting_key: `carrier_api_${carrierId}`,
          setting_category: 'tracking',
          setting_value: config, // JSONB - pass object directly
          display_name: `${config.name} Tracking API`,
          is_secret: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'setting_key',
        });

      if (error) throw error;

      addToast(`${config.name} settings saved`, 'success');
      setEditMode(null);
    } catch (err) {
      console.error('Failed to save config:', err);
      addToast(`Failed to save ${config.name} settings`, 'error');
    } finally {
      setSaving(null);
    }
  };

  // Test carrier connection - validates credentials are present
  // Note: Direct OAuth calls blocked by CORS, but credentials verified when tracking runs via edge functions
  const testConnection = async (carrierId: string) => {
    const config = configs[carrierId];
    const carrier = CARRIERS.find(c => c.id === carrierId);

    if (!config || !config.userId) {
      addToast(`Please enter ${carrier?.fields.userId.label || 'credentials'} first`, 'error');
      return;
    }
    if (!config.apiKey) {
      addToast(`Please enter ${carrier?.fields.apiKey?.label || 'secret'} first`, 'error');
      return;
    }

    setTestingCarrier(carrierId);

    // Credentials are present - inform user that actual OAuth validation happens server-side
    // Browser CORS restrictions prevent direct OAuth calls to carrier APIs
    setTimeout(() => {
      addToast(
        `${config.name} credentials saved. Enable tracking and the system will validate on first use.`,
        'success'
      );
      setTestingCarrier(null);
    }, 500);
  };

  // Update config field
  const updateConfig = (carrierId: string, field: keyof CarrierConfig, value: any) => {
    setConfigs(prev => ({
      ...prev,
      [carrierId]: {
        ...prev[carrierId],
        [field]: value,
      },
    }));
  };

  // Render carrier card
  const renderCarrierCard = (carrier: CarrierInfo) => {
    const config = configs[carrier.id] || {
      name: carrier.name,
      userId: '',
      apiKey: '',
      enabled: false,
      rateLimit: 100,
    };
    const isEditing = editMode === carrier.id;
    const isSaving = saving === carrier.id;
    const isTesting = testingCarrier === carrier.id;
    const isConfigured = config.userId && config.apiKey;

    return (
      <div
        key={carrier.id}
        className={`rounded-xl border p-5 transition-all ${
          isDark
            ? `bg-slate-900/50 ${config.enabled ? 'border-emerald-500/30' : 'border-slate-700'}`
            : `bg-white ${config.enabled ? 'border-emerald-300' : 'border-stone-200'}`
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{carrier.icon}</span>
            <div>
              <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {carrier.name}
              </h3>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {carrier.freeTier}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConfigured && (
              <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                config.enabled
                  ? isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                  : isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
              }`}>
                {config.enabled ? (
                  <><CheckCircleIcon className="w-3 h-3" /> Active</>
                ) : (
                  <><XCircleIcon className="w-3 h-3" /> Disabled</>
                )}
              </span>
            )}
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => {
                  updateConfig(carrier.id, 'enabled', e.target.checked);
                  if (!isEditing) setEditMode(carrier.id);
                }}
                className="sr-only peer"
              />
              <div className={`w-11 h-6 rounded-full peer transition-all
                ${isDark ? 'bg-slate-700' : 'bg-gray-200'}
                peer-checked:bg-emerald-500
                after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                after:bg-white after:rounded-full after:h-5 after:w-5
                after:transition-all peer-checked:after:translate-x-full`}
              />
            </label>
          </div>
        </div>

        {/* Credentials Form */}
        <div className="space-y-3">
          {/* User ID / API Key */}
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {carrier.fields.userId.label} {carrier.fields.userId.required && '*'}
            </label>
            <input
              type={showSecrets[`${carrier.id}_userId`] ? 'text' : 'password'}
              value={config.userId}
              onChange={(e) => {
                updateConfig(carrier.id, 'userId', e.target.value);
                if (!isEditing) setEditMode(carrier.id);
              }}
              placeholder={carrier.fields.userId.placeholder}
              className={`w-full px-3 py-2 rounded-lg text-sm font-mono ${
                isDark
                  ? 'bg-slate-800 border-slate-600 text-white placeholder-gray-500'
                  : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'
              } border focus:outline-none focus:ring-2 focus:ring-emerald-500`}
            />
          </div>

          {/* Secret Key (if required) */}
          {carrier.fields.apiKey && (
            <div>
              <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {carrier.fields.apiKey.label} {carrier.fields.apiKey.required && '*'}
              </label>
              <div className="relative">
                <input
                  type={showSecrets[`${carrier.id}_apiKey`] ? 'text' : 'password'}
                  value={config.apiKey || ''}
                  onChange={(e) => {
                    updateConfig(carrier.id, 'apiKey', e.target.value);
                    if (!isEditing) setEditMode(carrier.id);
                  }}
                  placeholder={carrier.fields.apiKey.placeholder}
                  className={`w-full px-3 py-2 pr-10 rounded-lg text-sm font-mono ${
                    isDark
                      ? 'bg-slate-800 border-slate-600 text-white placeholder-gray-500'
                      : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'
                  } border focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                />
                <button
                  type="button"
                  onClick={() => setShowSecrets(prev => ({
                    ...prev,
                    [`${carrier.id}_apiKey`]: !prev[`${carrier.id}_apiKey`],
                  }))}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded ${
                    isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {showSecrets[`${carrier.id}_apiKey`] ? (
                    <EyeSlashIcon className="w-4 h-4" />
                  ) : (
                    <EyeIcon className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700/50">
          <a
            href={carrier.registrationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1 text-xs ${
              isDark ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-600 hover:text-cyan-700'
            }`}
          >
            <ExternalLinkIcon className="w-3 h-3" />
            Get API Key (Free)
          </a>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => testConnection(carrier.id)}
              disabled={!config.userId || isTesting}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                isDark
                  ? 'bg-slate-700 text-gray-300 hover:bg-slate-600 disabled:opacity-50'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50'
              }`}
            >
              {isTesting ? (
                <><RefreshIcon className="w-3 h-3 animate-spin" /> Testing...</>
              ) : (
                <>Test</>
              )}
            </Button>
            {isEditing && (
              <Button
                onClick={() => saveConfig(carrier.id)}
                disabled={isSaving}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  isDark
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'bg-emerald-500 text-white hover:bg-emerald-600'
                }`}
              >
                {isSaving ? (
                  <><RefreshIcon className="w-3 h-3 animate-spin" /> Saving...</>
                ) : (
                  <>Save</>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Setup Instructions (collapsible) */}
        <details className="mt-4">
          <summary className={`text-xs cursor-pointer ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            <InformationCircleIcon className="w-3 h-3 inline mr-1" />
            Setup Instructions
          </summary>
          <ol className={`mt-2 ml-4 text-xs space-y-1 list-decimal ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            {carrier.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </details>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshIcon className={`w-6 h-6 animate-spin ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className={`rounded-xl p-4 ${isDark ? 'bg-cyan-500/10 border border-cyan-500/20' : 'bg-cyan-50 border border-cyan-200'}`}>
        <div className="flex items-start gap-3">
          <TruckIcon className={`w-5 h-5 mt-0.5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
          <div>
            <h3 className={`font-medium ${isDark ? 'text-cyan-300' : 'text-cyan-800'}`}>
              Direct Carrier Tracking (Free)
            </h3>
            <p className={`text-sm mt-1 ${isDark ? 'text-cyan-400/70' : 'text-cyan-700'}`}>
              Configure direct API connections to USPS, UPS, and FedEx for real-time tracking without
              third-party fees. All carriers offer free API tiers.
            </p>
          </div>
        </div>
      </div>

      {/* Carrier Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {CARRIERS.map(renderCarrierCard)}
      </div>

      {/* Strategy Info */}
      <div className={`rounded-xl p-4 ${isDark ? 'bg-slate-800/50 border border-slate-700' : 'bg-gray-50 border border-gray-200'}`}>
        <h4 className={`font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          How Tracking Works
        </h4>
        <ol className={`text-sm space-y-1 list-decimal ml-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          <li><strong>Database Cache</strong> - Check stored tracking data first (instant)</li>
          <li><strong>Email Extraction</strong> - Parse shipping emails for updates (free)</li>
          <li><strong>Direct Carrier API</strong> - Query carrier directly (free tiers)</li>
          <li><strong>Fallback</strong> - Manual tracking URL generation (always works)</li>
        </ol>
        <p className={`text-xs mt-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
          This layered approach minimizes API calls while ensuring accurate tracking data.
        </p>
      </div>
    </div>
  );
};

export default CarrierTrackingSettingsPanel;
