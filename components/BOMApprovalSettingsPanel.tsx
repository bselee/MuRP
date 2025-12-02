import React, { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import type { BOMApprovalSettings } from '../types';
import { defaultBOMApprovalSettings } from '../types';
import {
  InformationCircleIcon,
  CheckIcon,
  XIcon,
  SparklesIcon,
} from './icons';
import { supabase } from '../lib/supabase/client';

interface BOMApprovalSettingsPanelProps {
  currentSettings?: BOMApprovalSettings;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const BOMApprovalSettingsPanel: React.FC<BOMApprovalSettingsPanelProps> = ({
  currentSettings,
  addToast,
}) => {
  const [settings, setSettings] = useState<BOMApprovalSettings>(
    currentSettings || defaultBOMApprovalSettings
  );
  const [loading, setLoading] = useState(!currentSettings);
  const [saving, setSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    if (!currentSettings) {
      loadSettings();
    } else {
      setLastUpdated(currentSettings.updatedAt);
    }
  }, [currentSettings]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value, updated_at')
        .eq('setting_key', 'bom_approval_settings')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data?.setting_value) {
        setSettings(data.setting_value);
        setLastUpdated(data.updated_at);
      } else {
        setSettings(defaultBOMApprovalSettings);
      }
    } catch (error) {
      console.error('[BOMApprovalSettings] load error', error);
      addToast('Failed to load BOM approval settings.', 'error');
      setSettings(defaultBOMApprovalSettings);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = <K extends keyof BOMApprovalSettings>(
    key: K,
    value: BOMApprovalSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const toggleTeamMember = (
    team: 'bomRevisionApproversTeam' | 'artworkApproversTeam',
    department: 'Operations' | 'Design' | 'Quality'
  ) => {
    setSettings(prev => {
      const current = prev[team];
      const updated = current.includes(department)
        ? current.filter(d => d !== department)
        : [...current, department];
      return { ...prev, [team]: updated };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const updatedSettings = {
        ...settings,
        updatedAt: now,
      };

      const { error } = await supabase.from('app_settings').upsert(
        {
          setting_key: 'bom_approval_settings',
          setting_category: 'bom',
          setting_value: updatedSettings,
          display_name: 'BOM Approval Settings',
          description: 'Configure BOM revision blocking and artwork approval workflows',
        },
        { onConflict: 'setting_key' }
      );

      if (error) throw error;

      setSettings(updatedSettings);
      setLastUpdated(now);
      addToast('BOM approval settings saved successfully.', 'success');
    } catch (error) {
      console.error('[BOMApprovalSettings] save error', error);
      addToast('Failed to save BOM approval settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Not saved yet';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-400">Loading settings...</div>
      </div>
    );
  }

  const departments: Array<'Operations' | 'Design' | 'Quality'> = [
    'Operations',
    'Design',
    'Quality',
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-100 flex gap-3">
        <SparklesIcon className="w-5 h-5 flex-shrink-0 text-blue-300" />
        <div>
          <p className="font-semibold text-white">BOM Approval Workflow</p>
          <p className="text-blue-100/80">
            Configure whether BOM revisions block builds and whether artwork requires approval before
            becoming print-ready. Both workflows can be toggled on/off independently.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* BOM Revision Blocking */}
        <div className="border border-gray-700 rounded-lg p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-white">BOM Revision Blocking</h3>
              <p className="text-sm text-gray-400 mt-1">
                Controls whether pending BOM revisions prevent build orders from being created
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
              <div>
                <p className="font-medium text-white">Enable Revision Blocking</p>
                <p className="text-sm text-gray-400">
                  When enabled, pending revisions will block build creation
                </p>
              </div>
              <button
                onClick={() => updateSetting('enableBOMRevisionBlocking', !settings.enableBOMRevisionBlocking)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  settings.enableBOMRevisionBlocking ? 'bg-green-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    settings.enableBOMRevisionBlocking ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Blocking Message */}
            {settings.enableBOMRevisionBlocking && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Blocking Message (shown to users)
                </label>
                <textarea
                  value={settings.bomRevisionBlockingMessage || ''}
                  onChange={e =>
                    updateSetting('bomRevisionBlockingMessage', e.target.value)
                  }
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 text-sm"
                  rows={2}
                  placeholder="Enter the message to show when builds are blocked..."
                />
              </div>
            )}

            {/* Approvers Team */}
            {settings.enableBOMRevisionBlocking && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Approvers (who can approve BOM revisions)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {departments.map(dept => (
                    <button
                      key={dept}
                      onClick={() => toggleTeamMember('bomRevisionApproversTeam', dept)}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        settings.bomRevisionApproversTeam.includes(dept)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <span className="flex items-center justify-center gap-2">
                        {settings.bomRevisionApproversTeam.includes(dept) && (
                          <CheckIcon className="w-4 h-4" />
                        )}
                        {dept}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Enforcement Options */}
            {settings.enableBOMRevisionBlocking && (
              <div className="bg-gray-800 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">Enforce for All Products</p>
                    <p className="text-sm text-gray-400">Apply blocking to every product BOM</p>
                  </div>
                  <button
                    onClick={() => updateSetting('enforceForAllProducts', !settings.enforceForAllProducts)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.enforceForAllProducts ? 'bg-green-600' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.enforceForAllProducts ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">Enforce for High-Value BOMs</p>
                    <p className="text-sm text-gray-400">Only apply blocking to complex BOMs</p>
                  </div>
                  <button
                    onClick={() =>
                      updateSetting('enforceForHighValueBOMs', !settings.enforceForHighValueBOMs)
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.enforceForHighValueBOMs ? 'bg-green-600' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.enforceForHighValueBOMs ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {settings.enforceForHighValueBOMs && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Component Count Threshold (minimum components to trigger blocking)
                    </label>
                    <input
                      type="number"
                      value={settings.highValueThreshold || ''}
                      onChange={e =>
                        updateSetting('highValueThreshold', e.target.value ? parseInt(e.target.value) : undefined)
                      }
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100"
                      placeholder="e.g., 20"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Artwork Approval Workflow */}
        <div className="border border-gray-700 rounded-lg p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-white">Artwork Approval Workflow</h3>
              <p className="text-sm text-gray-400 mt-1">
                Artwork approval is a separate workflow - it does NOT block builds, but staff must approve
                artwork before it can become print-ready
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
              <div>
                <p className="font-medium text-white">Enable Artwork Approval Workflow</p>
                <p className="text-sm text-gray-400">
                  When enabled, artwork requires approval before becoming print-ready
                </p>
              </div>
              <button
                onClick={() =>
                  updateSetting('enableArtworkApprovalWorkflow', !settings.enableArtworkApprovalWorkflow)
                }
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  settings.enableArtworkApprovalWorkflow ? 'bg-green-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    settings.enableArtworkApprovalWorkflow ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Require Before Print Ready */}
            {settings.enableArtworkApprovalWorkflow && (
              <>
                <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
                  <div>
                    <p className="font-medium text-white">Require Approval Before Print Ready</p>
                    <p className="text-sm text-gray-400">
                      Staff must get approval from designated team before marking artwork as print-ready
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      updateSetting(
                        'requireArtworkApprovalBeforePrintReady',
                        !settings.requireArtworkApprovalBeforePrintReady
                      )
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.requireArtworkApprovalBeforePrintReady ? 'bg-green-600' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.requireArtworkApprovalBeforePrintReady ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Approval Message */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Approval Message (shown to users)
                  </label>
                  <textarea
                    value={settings.artworkApprovalMessage || ''}
                    onChange={e =>
                      updateSetting('artworkApprovalMessage', e.target.value)
                    }
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 text-sm"
                    rows={2}
                    placeholder="Enter the message to show when artwork needs approval..."
                  />
                </div>

                {/* Approvers Team */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Approvers (who can approve artwork for print-ready)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {departments.map(dept => (
                      <button
                        key={dept}
                        onClick={() => toggleTeamMember('artworkApproversTeam', dept)}
                        className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          settings.artworkApproversTeam.includes(dept)
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        <span className="flex items-center justify-center gap-2">
                          {settings.artworkApproversTeam.includes(dept) && (
                            <CheckIcon className="w-4 h-4" />
                          )}
                          {dept}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex gap-3">
          <InformationCircleIcon className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-300">
            <p className="font-medium mb-1">How These Settings Work Together</p>
            <ul className="list-disc list-inside space-y-1 text-xs text-gray-400">
              <li>
                <strong>BOM Revision Blocking:</strong> When enabled, pending BOM revisions BLOCK builds from being created
              </li>
              <li>
                <strong>Artwork Approval:</strong> Does NOT block builds - it's a separate workflow for quality control
              </li>
              <li>
                Staff can create artwork anytime, but must get approval before marking it print-ready
              </li>
              <li>
                Each setting can be toggled on/off and approver teams configured independently
              </li>
            </ul>
          </div>
        </div>

        {/* Last Updated */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-4 border-t border-gray-700">
          <span>Last updated: {formatTimestamp(lastUpdated)}</span>
          {lastUpdated && <span>System managed</span>}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
};

export default BOMApprovalSettingsPanel;
