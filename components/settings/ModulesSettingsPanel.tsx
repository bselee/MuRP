import React from 'react';
import { useTheme } from '../ThemeProvider';
import useModuleVisibility, { type ModuleConfig } from '../../hooks/useModuleVisibility';
import type { Page } from '../../App';

interface ModulesSettingsPanelProps {
  setCurrentPage: (page: Page) => void;
}

const ModulesSettingsPanel: React.FC<ModulesSettingsPanelProps> = ({ setCurrentPage }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { getModuleConfigs, toggleModule } = useModuleVisibility();

  const modules = getModuleConfigs();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Modules
        </h2>
        <p className={`mt-1 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Enable or disable modules in the sidebar navigation. Disabled modules can still be accessed here.
        </p>
      </div>

      {/* Module toggles */}
      <div className="space-y-3">
        {modules.map((module) => (
          <ModuleToggleCard
            key={module.id}
            module={module}
            onToggle={() => toggleModule(module.id)}
            onNavigate={() => setCurrentPage(module.id as Page)}
            isDark={isDark}
          />
        ))}
      </div>

      {/* Info */}
      <div
        className={`rounded-lg p-4 ${
          isDark ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-100'
        }`}
      >
        <p className={`text-sm ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
          Disabled modules are hidden from the sidebar but remain accessible through this settings page.
          Click "Open" to access any module directly.
        </p>
      </div>
    </div>
  );
};

interface ModuleToggleCardProps {
  module: ModuleConfig;
  onToggle: () => void;
  onNavigate: () => void;
  isDark: boolean;
}

const ModuleToggleCard: React.FC<ModuleToggleCardProps> = ({
  module,
  onToggle,
  onNavigate,
  isDark,
}) => {
  return (
    <div
      className={`flex items-center justify-between p-4 rounded-lg border ${
        isDark
          ? 'bg-gray-800/50 border-gray-700'
          : 'bg-white border-gray-200 shadow-sm'
      }`}
    >
      <div className="flex-1 min-w-0 mr-4">
        <div className="flex items-center gap-3">
          <h3 className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {module.label}
          </h3>
          {!module.enabled && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
              }`}
            >
              Hidden
            </span>
          )}
        </div>
        <p className={`mt-1 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {module.description}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Open button */}
        <button
          type="button"
          onClick={onNavigate}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            isDark
              ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-900/30'
              : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
          }`}
        >
          Open
        </button>

        {/* Toggle switch */}
        <button
          type="button"
          role="switch"
          aria-checked={module.enabled}
          onClick={onToggle}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            module.enabled
              ? 'bg-blue-600'
              : isDark
                ? 'bg-gray-600'
                : 'bg-gray-200'
          }`}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              module.enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
};

export default ModulesSettingsPanel;
