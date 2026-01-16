/**
 * Three-Way Match Settings Panel
 *
 * Admin panel for configuring three-way match thresholds and auto-approval rules.
 */

import React, { useState, useEffect } from 'react';
import { useTheme } from '../ThemeProvider';
import Button from '../ui/Button';
import {
  getMatchThresholds,
  updateMatchThresholds,
  type MatchThresholds,
} from '../../services/threeWayMatchService';
import {
  SettingsCard,
  SettingsInput,
  SettingsLoading,
  SettingsAlert,
  SettingsStatusBadge,
  SettingsButtonGroup,
} from './ui';

interface ThreeWayMatchSettingsPanelProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ThreeWayMatchSettingsPanel: React.FC<ThreeWayMatchSettingsPanelProps> = ({ addToast }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  const [thresholds, setThresholds] = useState<MatchThresholds>({
    quantityTolerancePercent: 2,
    priceTolerancePercent: 5,
    priceToleranceAbsolute: 10,
    totalTolerancePercent: 3,
    autoApproveMaxVariance: 50,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalThresholds, setOriginalThresholds] = useState<MatchThresholds | null>(null);

  useEffect(() => {
    loadThresholds();
  }, []);

  const loadThresholds = async () => {
    setLoading(true);
    try {
      const data = await getMatchThresholds();
      setThresholds(data);
      setOriginalThresholds(data);
    } catch (err) {
      console.error('Failed to load thresholds:', err);
      addToast?.('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof MatchThresholds, value: number) => {
    setThresholds(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMatchThresholds(thresholds);
      setOriginalThresholds(thresholds);
      setHasChanges(false);
      addToast?.('Settings saved successfully', 'success');
    } catch (err) {
      console.error('Failed to save thresholds:', err);
      addToast?.('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (originalThresholds) {
      setThresholds(originalThresholds);
      setHasChanges(false);
    }
  };

  const labelClass = isDark ? 'text-gray-300' : 'text-gray-700';
  const inputClass = isDark
    ? 'bg-gray-900 border-gray-700 text-white focus:ring-accent-500 focus:border-accent-500'
    : 'bg-white border-gray-300 text-gray-900 focus:ring-accent-500 focus:border-accent-500';
  const helpTextClass = isDark ? 'text-gray-500' : 'text-gray-400';

  if (loading) {
    return (
      <SettingsCard>
        <SettingsLoading variant="skeleton" />
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      title="Three-Way Match Settings"
      description="Configure tolerance thresholds for PO vs Invoice vs Receipt matching"
    >
      {hasChanges && (
        <div className="flex justify-end -mt-2 mb-4">
          <SettingsStatusBadge variant="warning" icon={false} size="sm">
            Unsaved changes
          </SettingsStatusBadge>
        </div>
      )}

      <div className="space-y-6">
        {/* Quantity Tolerance */}
        <div>
          <label className={`block text-sm font-medium ${labelClass} mb-2`}>
            Quantity Tolerance (%)
          </label>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={thresholds.quantityTolerancePercent}
              onChange={e => handleChange('quantityTolerancePercent', parseFloat(e.target.value) || 0)}
              className={`w-32 px-3 py-2 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500/20 ${inputClass}`}
            />
            <span className={`text-sm ${helpTextClass}`}>
              Allow ±{thresholds.quantityTolerancePercent}% shortage/overage before flagging
            </span>
          </div>
        </div>

        {/* Price Tolerance Percent */}
        <div>
          <label className={`block text-sm font-medium ${labelClass} mb-2`}>
            Price Tolerance (%)
          </label>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={thresholds.priceTolerancePercent}
              onChange={e => handleChange('priceTolerancePercent', parseFloat(e.target.value) || 0)}
              className={`w-32 px-3 py-2 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500/20 ${inputClass}`}
            />
            <span className={`text-sm ${helpTextClass}`}>
              Allow ±{thresholds.priceTolerancePercent}% unit price variance
            </span>
          </div>
        </div>

        {/* Price Tolerance Absolute */}
        <div>
          <label className={`block text-sm font-medium ${labelClass} mb-2`}>
            Price Tolerance (Absolute)
          </label>
          <div className="flex items-center gap-4">
            <div className="relative">
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 ${helpTextClass}`}>$</span>
              <input
                type="number"
                min="0"
                step="1"
                value={thresholds.priceToleranceAbsolute}
                onChange={e => handleChange('priceToleranceAbsolute', parseFloat(e.target.value) || 0)}
                className={`w-32 pl-7 pr-3 py-2 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500/20 ${inputClass}`}
              />
            </div>
            <span className={`text-sm ${helpTextClass}`}>
              Ignore price differences under ${thresholds.priceToleranceAbsolute}
            </span>
          </div>
        </div>

        {/* Total Tolerance */}
        <div>
          <label className={`block text-sm font-medium ${labelClass} mb-2`}>
            Total Variance Tolerance (%)
          </label>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={thresholds.totalTolerancePercent}
              onChange={e => handleChange('totalTolerancePercent', parseFloat(e.target.value) || 0)}
              className={`w-32 px-3 py-2 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500/20 ${inputClass}`}
            />
            <span className={`text-sm ${helpTextClass}`}>
              Allow ±{thresholds.totalTolerancePercent}% variance on PO total
            </span>
          </div>
        </div>

        {/* Auto-Approve Threshold */}
        <div className={`p-4 rounded-xl ${isDark ? 'bg-emerald-900/20 border border-emerald-800' : 'bg-emerald-50 border border-emerald-200'}`}>
          <label className={`block text-sm font-medium ${isDark ? 'text-emerald-300' : 'text-emerald-700'} mb-2`}>
            Auto-Approve Maximum Variance
          </label>
          <div className="flex items-center gap-4">
            <div className="relative">
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 ${helpTextClass}`}>$</span>
              <input
                type="number"
                min="0"
                step="10"
                value={thresholds.autoApproveMaxVariance}
                onChange={e => handleChange('autoApproveMaxVariance', parseFloat(e.target.value) || 0)}
                className={`w-32 pl-7 pr-3 py-2 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500/20 ${inputClass}`}
              />
            </div>
            <span className={`text-sm ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
              Auto-approve matches with variance under ${thresholds.autoApproveMaxVariance}
            </span>
          </div>
          <p className={`mt-2 text-xs ${helpTextClass}`}>
            Matches within tolerance AND under this variance will be automatically approved for payment
          </p>
        </div>

        {/* Current Score Impact Preview */}
        <SettingsAlert variant="info" title="Score Impact Preview">
          <div className="grid grid-cols-2 gap-4 text-sm mt-2">
            <div>
              <span className="opacity-70">Exact match:</span>
              <span className="ml-2 font-medium">100 points</span>
            </div>
            <div>
              <span className="opacity-70">Within tolerance:</span>
              <span className="ml-2 font-medium">-5 points per item</span>
            </div>
            <div>
              <span className="opacity-70">Shortage/overage:</span>
              <span className="ml-2 font-medium">-10 points per item</span>
            </div>
            <div>
              <span className="opacity-70">Price mismatch:</span>
              <span className="ml-2 font-medium">-15 points per item</span>
            </div>
            <div>
              <span className="opacity-70">Total out of tolerance:</span>
              <span className="ml-2 font-medium">-20 points</span>
            </div>
            <div>
              <span className="opacity-70">Auto-approve threshold:</span>
              <span className="ml-2 font-medium text-emerald-400">≥95 points</span>
            </div>
          </div>
        </SettingsAlert>
      </div>

      {/* Actions */}
      <SettingsButtonGroup>
        <Button
          onClick={handleReset}
          disabled={!hasChanges || saving}
          className={`px-4 py-2 rounded-lg ${
            isDark
              ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400'
          }`}
        >
          Reset
        </Button>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className={`px-4 py-2 rounded-lg ${
            hasChanges
              ? 'bg-accent-600 text-white hover:bg-accent-700'
              : isDark
                ? 'bg-gray-700 text-gray-500'
                : 'bg-gray-100 text-gray-400'
          }`}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </SettingsButtonGroup>
    </SettingsCard>
  );
};

export default ThreeWayMatchSettingsPanel;
