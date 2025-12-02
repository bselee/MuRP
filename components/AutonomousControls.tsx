import React, { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import { supabase } from '../lib/supabase/client';
import { CogIcon as SettingsIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from './icons';

interface AutonomousControlsProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface AutonomousSettings {
  id: string;
  autonomous_shipping_enabled: boolean;
  autonomous_pricing_enabled: boolean;
  require_approval_for_shipping: boolean;
  require_approval_for_pricing: boolean;
  auto_approve_below_threshold: number;
  updated_at: string;
  updated_by: string;
}

const AutonomousControls: React.FC<AutonomousControlsProps> = ({ addToast }) => {
  const [settings, setSettings] = useState<AutonomousSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('autonomous_po_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      if (data) {
        setSettings(data);
      } else {
        // Create default settings if none exist
        const defaultSettings: Omit<AutonomousSettings, 'id' | 'updated_at' | 'updated_by'> = {
          autonomous_shipping_enabled: false,
          autonomous_pricing_enabled: false,
          require_approval_for_shipping: true,
          require_approval_for_pricing: true,
          auto_approve_below_threshold: 100,
        };

        const { data: newSettings, error: insertError } = await supabase
          .from('autonomous_po_settings')
          .insert(defaultSettings)
          .select()
          .single();

        if (insertError) throw insertError;
        setSettings(newSettings);
      }
    } catch (error) {
      console.error('Error loading autonomous settings:', error);
      addToast('Failed to load autonomous settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key: keyof AutonomousSettings, value: any) => {
    if (!settings) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('autonomous_po_settings')
        .update({
          [key]: value,
          updated_at: new Date().toISOString(),
          updated_by: 'current_user', // TODO: Get from auth context
        })
        .eq('id', settings.id);

      if (error) throw error;

      setSettings(prev => prev ? { ...prev, [key]: value } : null);
      addToast('Autonomous settings updated', 'success');
    } catch (error) {
      console.error('Error updating autonomous settings:', error);
      addToast('Failed to update settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center gap-3">
          <ClockIcon className="w-5 h-5 animate-spin text-accent-400" />
          <p className="text-gray-400">Loading autonomous controls...</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <p className="text-red-400">Failed to load autonomous settings</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
      <div className="p-4 bg-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SettingsIcon className="w-5 h-5 text-accent-400" />
          <div>
            <h2 className="text-lg font-semibold text-white">Autonomous PO Controls</h2>
            <p className="text-sm text-gray-400">Configure automatic shipping and pricing updates</p>
          </div>
        </div>
        {saving && (
          <div className="flex items-center gap-2 text-sm text-accent-300">
            <ClockIcon className="w-4 h-4 animate-spin" />
            Saving...
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Shipping Updates Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">Shipping Status Updates</h3>
              <p className="text-sm text-gray-400">Automatically update PO status based on carrier tracking</p>
            </div>
            <Button
              onClick={() => updateSetting('autonomous_shipping_enabled', !settings.autonomous_shipping_enabled)}
              disabled={saving}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                settings.autonomous_shipping_enabled
                  ? 'bg-accent-500 text-white hover:bg-accent-600'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {settings.autonomous_shipping_enabled ? (
                <><CheckCircleIcon className="w-4 h-4 mr-2" /> Enabled</>
              ) : (
                <><XCircleIcon className="w-4 h-4 mr-2" /> Disabled</>
              )}
            </Button>
          </div>

          {settings.autonomous_shipping_enabled && (
            <div className="ml-6 space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings.require_approval_for_shipping}
                  onChange={(e) => updateSetting('require_approval_for_shipping', e.target.checked)}
                  disabled={saving}
                  className="w-4 h-4 text-accent-500 bg-gray-700 border-gray-600 rounded focus:ring-accent-500"
                />
                <span className="text-sm text-gray-300">Require approval for autonomous shipping updates</span>
              </label>
              <p className="text-xs text-gray-500 ml-7">
                When enabled, shipping status changes will create approval requests instead of updating automatically
              </p>
            </div>
          )}
        </div>

        {/* Pricing Updates Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">Pricing Updates</h3>
              <p className="text-sm text-gray-400">Automatically update item prices from vendor communications</p>
            </div>
            <Button
              onClick={() => updateSetting('autonomous_pricing_enabled', !settings.autonomous_pricing_enabled)}
              disabled={saving}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                settings.autonomous_pricing_enabled
                  ? 'bg-accent-500 text-white hover:bg-accent-600'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {settings.autonomous_pricing_enabled ? (
                <><CheckCircleIcon className="w-4 h-4 mr-2" /> Enabled</>
              ) : (
                <><XCircleIcon className="w-4 h-4 mr-2" /> Disabled</>
              )}
            </Button>
          </div>

          {settings.autonomous_pricing_enabled && (
            <div className="ml-6 space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings.require_approval_for_pricing}
                  onChange={(e) => updateSetting('require_approval_for_pricing', e.target.checked)}
                  disabled={saving}
                  className="w-4 h-4 text-accent-500 bg-gray-700 border-gray-600 rounded focus:ring-accent-500"
                />
                <span className="text-sm text-gray-300">Require approval for autonomous pricing updates</span>
              </label>

              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-300">Auto-approve changes below:</label>
                <div className="flex items-center gap-2">
                  <span className="text-accent-400">$</span>
                  <input
                    type="number"
                    value={settings.auto_approve_below_threshold}
                    onChange={(e) => updateSetting('auto_approve_below_threshold', parseFloat(e.target.value) || 0)}
                    disabled={saving}
                    className="w-20 px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              <p className="text-xs text-gray-500 ml-7">
                Price changes below this threshold will be applied automatically without approval
              </p>
            </div>
          )}
        </div>

        {/* Status Summary */}
        <div className="border-t border-gray-700 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <p className="text-gray-400">Shipping Automation</p>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${settings.autonomous_shipping_enabled ? 'bg-green-400' : 'bg-gray-600'}`} />
                <span className={settings.autonomous_shipping_enabled ? 'text-green-300' : 'text-gray-500'}>
                  {settings.autonomous_shipping_enabled ? 'Active' : 'Disabled'}
                </span>
                {settings.autonomous_shipping_enabled && settings.require_approval_for_shipping && (
                  <span className="text-yellow-300">(Approval Required)</span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-gray-400">Pricing Automation</p>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${settings.autonomous_pricing_enabled ? 'bg-green-400' : 'bg-gray-600'}`} />
                <span className={settings.autonomous_pricing_enabled ? 'text-green-300' : 'text-gray-500'}>
                  {settings.autonomous_pricing_enabled ? 'Active' : 'Disabled'}
                </span>
                {settings.autonomous_pricing_enabled && (
                  <span className="text-blue-300">
                    (${settings.auto_approve_below_threshold} threshold)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-500">
            Last updated: {new Date(settings.updated_at).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutonomousControls;