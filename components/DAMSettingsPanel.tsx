import React, { useState, useEffect, useMemo } from 'react';
import Button from '@/components/ui/Button';
import { DAM_TIER_LIMITS, DAMTier, type DamSettingsState } from '../types';

interface DAMSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentTier: DAMTier;
  onUpgrade: (tier: DAMTier) => void;
  settings: DamSettingsState;
  onUpdateSettings: (settings: DamSettingsState) => void;
  storageUsedBytes?: number;
  storageLimitBytes?: number;
  normalizedAssetCount?: number;
  legacyAssetCount?: number;
  mode?: 'user' | 'admin';
  onRequestUpgrade?: () => void;
}

export const DAMSettingsPanel: React.FC<DAMSettingsPanelProps> = ({
  isOpen,
  onClose,
  currentTier,
  onUpgrade,
  settings,
  onUpdateSettings,
  storageUsedBytes = 0,
  storageLimitBytes,
  normalizedAssetCount = 0,
  legacyAssetCount = 0,
  mode = 'user',
  onRequestUpgrade,
}) => {
  const [localSettings, setLocalSettings] = useState(settings);
  const [activeTab, setActiveTab] = useState<'general' | 'user' | 'admin'>('general');
  const resolvedStorageLimit = storageLimitBytes ?? DAM_TIER_LIMITS[currentTier].storage;
  const usagePercent = resolvedStorageLimit > 0 ? Math.min(100, Math.round((storageUsedBytes / resolvedStorageLimit) * 100)) : 0;
  const tabs = useMemo(() => (mode === 'admin' ? (['general', 'user', 'admin'] as const) : (['general', 'user'] as const)), [mode]);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdateSettings(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            DAM Settings
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 px-6 flex-shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              {tab} Settings
            </button>
          ))}
        </div>

        <div className="p-6 space-y-8 overflow-y-auto flex-grow">
          {activeTab === 'general' && (
            <>
              {mode === 'admin' && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Subscription Tier</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {(['basic', 'mid', 'full'] as DAMTier[]).map((tier) => (
                      <div
                        key={tier}
                        className={`border rounded-lg p-4 relative ${
                          currentTier === tier
                            ? 'border-indigo-500 bg-indigo-500/10'
                            : 'border-gray-700 bg-gray-800/50 opacity-75'
                        }`}
                      >
                        {currentTier === tier && (
                          <div className="absolute -top-2 -right-2 bg-indigo-500 text-white text-xs px-2 py-0.5 rounded-full">
                            Current
                          </div>
                        )}
                        <h4 className="font-bold text-white capitalize">{tier} Tier</h4>
                        <ul className="mt-2 space-y-1 text-xs text-gray-400">
                          <li>Storage: {DAM_TIER_LIMITS[tier].storage / (1024 * 1024)} MB</li>
                          <li>Editing: {DAM_TIER_LIMITS[tier].editing ? '✅' : '❌'}</li>
                          <li>Compliance: {DAM_TIER_LIMITS[tier].compliance ? '✅' : '❌'}</li>
                        </ul>
                        {currentTier !== tier && (
                          <Button
                            onClick={() => onUpgrade(tier)}
                            className="mt-3 w-full text-xs bg-gray-700 hover:bg-gray-600"
                          >
                            {tier === 'basic' ? 'Downgrade' : 'Upgrade'}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {mode === 'user' && (
                <section className="bg-indigo-900/20 border border-indigo-800/60 rounded-lg p-4 flex flex-col gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-indigo-100 uppercase tracking-wider mb-1">Creative Playground</h3>
                    <p className="text-xs text-indigo-200">Drag in vector art, print-ready PDFs, or moodboards—MuRP will keep them tidy.</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start text-indigo-200 hover:text-white"
                    onClick={onRequestUpgrade}
                  >
                    Need more storage? Tap here to nudge Ops.
                  </Button>
                </section>
              )}

              <section className="bg-gray-900/30 border border-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Storage Usage</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{(storageUsedBytes / (1024 * 1024)).toFixed(2)} MB used</span>
                    <span>{(resolvedStorageLimit / (1024 * 1024)).toFixed(0)} MB limit</span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-yellow-500' : 'bg-indigo-500'}`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm text-gray-300">
                    <div>
                      <p className="text-xs uppercase text-gray-500">Normalized Assets</p>
                      <p className="font-semibold text-white">{normalizedAssetCount}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-gray-500">Legacy JSON</p>
                      <p className="font-semibold text-white">{legacyAssetCount}</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Download Settings */}
              <section>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Download Preferences</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Default Print Size</label>
                    <select
                      value={localSettings.defaultPrintSize}
                      onChange={(e) => setLocalSettings({ ...localSettings, defaultPrintSize: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="4x6">4" x 6" (Standard Label)</option>
                      <option value="5x8">5" x 8" (Large Label)</option>
                      <option value="8.5x11">8.5" x 11" (Document)</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium text-gray-300">Print Ready Warnings</label>
                      <p className="text-xs text-gray-500">Warn when downloading files not marked as Print Ready (PR)</p>
                    </div>
                    <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                      <input
                        type="checkbox"
                        name="toggle"
                        id="toggle"
                        checked={localSettings.showPrintReadyWarning}
                        onChange={(e) => setLocalSettings({ ...localSettings, showPrintReadyWarning: e.target.checked })}
                        className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer transition-transform duration-200 ease-in-out checked:translate-x-6 checked:border-indigo-600"
                      />
                      <label
                        htmlFor="toggle"
                        className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${
                          localSettings.showPrintReadyWarning ? 'bg-indigo-600' : 'bg-gray-700'
                        }`}
                      ></label>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {activeTab === 'user' && (
            <section className="space-y-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">User Preferences</h3>
              
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-300">Email Notifications</label>
                  <p className="text-xs text-gray-500">Receive emails when artwork is shared with you</p>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.emailNotifications}
                  onChange={(e) => setLocalSettings({ ...localSettings, emailNotifications: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Default CC Address</label>
                <input
                  type="email"
                  value={localSettings.defaultShareCc}
                  onChange={(e) => setLocalSettings({ ...localSettings, defaultShareCc: e.target.value })}
                  placeholder="manager@example.com"
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">Automatically CC this email on all shares</p>
              </div>
            </section>
          )}

          {activeTab === 'admin' && mode === 'admin' && (
            <section className="space-y-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Admin Controls</h3>
              
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-300">Require Approval for Sharing</label>
                  <p className="text-xs text-gray-500">Draft artwork must be approved before sharing</p>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.requireApproval}
                  onChange={(e) => setLocalSettings({ ...localSettings, requireApproval: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Allowed Sharing Domains</label>
                <textarea
                  value={localSettings.allowedDomains}
                  onChange={(e) => setLocalSettings({ ...localSettings, allowedDomains: e.target.value })}
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">Comma-separated list of allowed email domains</p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                <div>
                  <label className="text-sm font-medium text-gray-300">Auto-Archive Old Artwork</label>
                  <p className="text-xs text-gray-500">Archive files not accessed in 1 year</p>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.autoArchive}
                  onChange={(e) => setLocalSettings({ ...localSettings, autoArchive: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
                />
              </div>
            </section>
          )}
        </div>

        <div className="p-6 border-t border-gray-700 flex justify-end gap-3 flex-shrink-0">
          <Button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white">
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
};
