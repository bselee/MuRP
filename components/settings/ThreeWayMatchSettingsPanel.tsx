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

  const cardClass = isDark
    ? 'bg-gray-800/50 border border-gray-700 rounded-lg p-6'
    : 'bg-white border border-gray-200 rounded-lg p-6 shadow-sm';

  const labelClass = isDark ? 'text-gray-300' : 'text-gray-700';
  const inputClass = isDark
    ? 'bg-gray-700 border-gray-600 text-white focus:ring-blue-500 focus:border-blue-500'
    : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500 focus:border-blue-500';
  const helpTextClass = isDark ? 'text-gray-500' : 'text-gray-400';

  if (loading) {
    return (
      <div className={cardClass}>
        <div className="animate-pulse space-y-4">
          <div className={`h-6 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded w-1/3`} />
          <div className={`h-10 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded`} />
          <div className={`h-10 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded`} />
        </div>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Three-Way Match Settings
          </h3>
          <p className={`text-sm ${helpTextClass}`}>
            Configure tolerance thresholds for PO vs Invoice vs Receipt matching
          </p>
        </div>
        {hasChanges && (
          <span className="text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-500">
            Unsaved changes
          </span>
        )}
      </div>

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
              className={`w-32 px-3 py-2 rounded-md border ${inputClass}`}
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
              className={`w-32 px-3 py-2 rounded-md border ${inputClass}`}
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
                className={`w-32 pl-7 pr-3 py-2 rounded-md border ${inputClass}`}
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
              className={`w-32 px-3 py-2 rounded-md border ${inputClass}`}
            />
            <span className={`text-sm ${helpTextClass}`}>
              Allow ±{thresholds.totalTolerancePercent}% variance on PO total
            </span>
          </div>
        </div>

        {/* Auto-Approve Threshold */}
        <div className={`p-4 rounded-lg ${isDark ? 'bg-emerald-900/20 border border-emerald-800' : 'bg-emerald-50 border border-emerald-200'}`}>
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
                className={`w-32 pl-7 pr-3 py-2 rounded-md border ${inputClass}`}
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
        <div className={`p-4 rounded-lg ${isDark ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200'}`}>
          <h4 className={`text-sm font-medium ${isDark ? 'text-blue-300' : 'text-blue-700'} mb-3`}>
            Score Impact Preview
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className={helpTextClass}>Exact match:</span>
              <span className={`ml-2 font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>100 points</span>
            </div>
            <div>
              <span className={helpTextClass}>Within tolerance:</span>
              <span className={`ml-2 font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>-5 points per item</span>
            </div>
            <div>
              <span className={helpTextClass}>Shortage/overage:</span>
              <span className={`ml-2 font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>-10 points per item</span>
            </div>
            <div>
              <span className={helpTextClass}>Price mismatch:</span>
              <span className={`ml-2 font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>-15 points per item</span>
            </div>
            <div>
              <span className={helpTextClass}>Total out of tolerance:</span>
              <span className={`ml-2 font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>-20 points</span>
            </div>
            <div>
              <span className={helpTextClass}>Auto-approve threshold:</span>
              <span className={`ml-2 font-medium text-emerald-500`}>≥95 points</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className={`flex justify-end gap-3 mt-6 pt-6 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <Button
          onClick={handleReset}
          disabled={!hasChanges || saving}
          className={`px-4 py-2 rounded-md ${
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
          className={`px-4 py-2 rounded-md ${
            hasChanges
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : isDark
                ? 'bg-gray-700 text-gray-500'
                : 'bg-gray-100 text-gray-400'
          }`}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};

export default ThreeWayMatchSettingsPanel;
