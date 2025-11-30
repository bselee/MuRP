// Phase 1.5: AI Settings Component - User controls for AI model, usage tracking, and quota management

import React from 'react';
import type { AiSettings } from '../types';
import {
  getUsagePercentage,
  getUsageColorClass,
  formatNumber,
  shouldShowAlert,
} from '../services/tokenCounter';
import { BotIcon, ExclamationCircleIcon, ChartBarIcon, CogIcon } from './icons';

interface AiSettingsPanelProps {
  aiSettings: AiSettings;
  onUpdateSettings: (settings: AiSettings) => void;
}

const AiSettingsPanel: React.FC<AiSettingsPanelProps> = ({ aiSettings, onUpdateSettings }) => {
  const usagePercent = getUsagePercentage(aiSettings);
  const showAlert = shouldShowAlert(aiSettings);
  const colorClass = getUsageColorClass(usagePercent);

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdateSettings({ ...aiSettings, model: e.target.value });
  };

  const handleMaxItemsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    onUpdateSettings({ ...aiSettings, maxContextItems: value });
  };

  const handleAlertThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    onUpdateSettings({ ...aiSettings, alertThreshold: value });
  };

  const handleSmartFilteringToggle = () => {
    onUpdateSettings({ ...aiSettings, enableSmartFiltering: !aiSettings.enableSmartFiltering });
  };

  // Progress bar color classes
  const getProgressBarColor = (percent: number): string => {
    if (percent < 50) return 'bg-green-500';
    if (percent < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Model display names
  const getModelDisplayName = (model: string): string => {
    if (model.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
    if (model.includes('gemini-1.5-flash')) return 'Gemini 1.5 Flash';
    if (model.includes('gemini-1.5-pro')) return 'Gemini 1.5 Pro';
    if (model.includes('gemini-2.5-pro')) return 'Gemini 2.5 Pro';
    return model;
  };

  // Days until reset
  const getDaysUntilReset = (): number => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const diffTime = nextMonth.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
      <div className="flex items-center gap-4 mb-6">
        <BotIcon className="w-8 h-8 text-accent-400" />
        <div>
          <h3 className="text-lg font-semibold text-white">AI Assistant Settings</h3>
          <p className="text-sm text-gray-400 mt-1">
            Manage AI model, usage tracking, and optimization controls for the chat assistant.
          </p>
        </div>
      </div>

      {/* Alert Banner */}
      {showAlert && (
        <div className="mb-6 p-4 bg-yellow-900/30 border border-yellow-600/50 rounded-lg flex items-start gap-3">
          <ExclamationCircleIcon className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-yellow-200">Approaching Usage Limit</p>
            <p className="text-xs text-yellow-300 mt-1">
              You've used {usagePercent}% of your monthly token quota. Consider reducing max context items or waiting {getDaysUntilReset()} days until the quota resets.
            </p>
          </div>
        </div>
      )}

      {/* Usage Dashboard */}
      <div className="mb-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
        <div className="flex items-center gap-2 mb-3">
          <ChartBarIcon className="w-5 h-5 text-accent-400" />
          <h4 className="text-md font-semibold text-gray-200">Monthly Usage</h4>
        </div>

        {/* Usage Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-400">Token Usage</span>
            <span className={`text-sm font-bold ${colorClass}`}>
              {formatNumber(aiSettings.tokensUsedThisMonth)} / {formatNumber(aiSettings.monthlyTokenLimit)}
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${getProgressBarColor(usagePercent)}`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">{usagePercent}% used</p>
        </div>

        {/* Usage Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-gray-800/50 rounded-md">
            <p className="text-xs text-gray-400 mb-1">Queries This Month</p>
            <p className="text-xl font-bold text-white">{formatNumber(aiSettings.queriesThisMonth)}</p>
          </div>
          <div className="p-3 bg-gray-800/50 rounded-md">
            <p className="text-xs text-gray-400 mb-1">Estimated Cost</p>
            <p className="text-xl font-bold text-white">
              {aiSettings.estimatedMonthlyCost === 0 ? (
                <span className="text-green-400">Free</span>
              ) : (
                <span>${aiSettings.estimatedMonthlyCost.toFixed(2)}</span>
              )}
            </p>
          </div>
        </div>

        {/* Reset Info */}
        <p className="text-xs text-gray-500 mt-3 text-center">
          Usage resets in {getDaysUntilReset()} days
        </p>
      </div>

      {/* Model Configuration */}
      <div className="mb-6 pt-4 border-t border-gray-700/50">
        <div className="flex items-center gap-2 mb-3">
          <CogIcon className="w-5 h-5 text-accent-400" />
          <h4 className="text-md font-semibold text-gray-200">Model Configuration</h4>
        </div>

        <label htmlFor="ai-settings-model" className="block text-sm font-medium text-gray-300 mb-2">
          AI Model
        </label>
        <select
          id="ai-settings-model"
          value={aiSettings.model}
          onChange={handleModelChange}
          className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 text-sm"
        >
          <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast, Cost-Effective)</option>
          <option value="gemini-1.5-flash">Gemini 1.5 Flash (Legacy, Fast)</option>
          <option value="gemini-1.5-pro">Gemini 1.5 Pro (Advanced, Higher Cost)</option>
          <option value="gemini-2.5-pro">Gemini 2.5 Pro (Most Advanced)</option>
        </select>
        <p className="text-xs text-gray-500 mt-2">
          Current: {getModelDisplayName(aiSettings.model)}
        </p>
      </div>

      {/* Optimization Controls */}
      <div className="pt-4 border-t border-gray-700/50">
        <h4 className="text-md font-semibold text-gray-200 mb-4">Optimization Controls</h4>

        {/* Max Context Items Slider */}
        <div className="mb-5">
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="max-context-items" className="text-sm font-medium text-gray-300">
              Max Context Items
            </label>
            <span className="text-sm font-bold text-accent-400">{aiSettings.maxContextItems}</span>
          </div>
          <input
            type="range"
            id="max-context-items"
            min="10"
            max="100"
            step="10"
            value={aiSettings.maxContextItems}
            onChange={handleMaxItemsChange}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Limits the number of inventory items, BOMs, etc. sent to AI per query. Lower values reduce token usage.
          </p>
        </div>

        {/* Alert Threshold Slider */}
        <div className="mb-5">
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="alert-threshold" className="text-sm font-medium text-gray-300">
              Alert Threshold
            </label>
            <span className="text-sm font-bold text-yellow-400">{aiSettings.alertThreshold}%</span>
          </div>
          <input
            type="range"
            id="alert-threshold"
            min="50"
            max="100"
            step="5"
            value={aiSettings.alertThreshold}
            onChange={handleAlertThresholdChange}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Show warning when usage exceeds this percentage of monthly quota.
          </p>
        </div>

        {/* Smart Filtering Toggle */}
        <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-md">
          <div>
            <p className="text-sm font-medium text-gray-300">Smart Filtering</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Use keyword-based relevance to filter context data (recommended)
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={aiSettings.enableSmartFiltering}
              onChange={handleSmartFilteringToggle}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-500"></div>
          </label>
        </div>
      </div>

      {/* Links to External Resources */}
      <div className="mt-6 pt-4 border-t border-gray-700/50 flex flex-col gap-2">
        <a
          href="https://ai.google.dev/pricing"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-accent-400 hover:text-accent-300 flex items-center gap-1"
        >
          View Google AI Pricing →
        </a>
        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-accent-400 hover:text-accent-300 flex items-center gap-1"
        >
          Manage API Keys (Google AI Studio) →
        </a>
      </div>
    </div>
  );
};

export default AiSettingsPanel;
