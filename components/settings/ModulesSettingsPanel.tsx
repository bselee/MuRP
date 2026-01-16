import React from 'react';
import { useTheme } from '../ThemeProvider';
import useModuleVisibility, { type ModuleConfig } from '../../hooks/useModuleVisibility';
import type { Page } from '../../App';
import {
  SettingsCard,
  SettingsToggle,
  SettingsAlert,
  SettingsStatusBadge,
} from './ui';

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
      {/* Module toggles */}
      <SettingsCard
        title="Modules"
        description="Enable or disable modules in the sidebar navigation. Disabled modules can still be accessed here."
      >
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
      </SettingsCard>

      {/* Info */}
      <SettingsAlert variant="info">
        Disabled modules are hidden from the sidebar but remain accessible through this settings page.
        Click "Open" to access any module directly.
      </SettingsAlert>
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
      className={`flex items-center justify-between p-4 rounded-xl border ${
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
            <SettingsStatusBadge variant="neutral" icon={false} size="sm">
              Hidden
            </SettingsStatusBadge>
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
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            isDark
              ? 'text-accent-400 hover:text-accent-300 hover:bg-accent-900/30'
              : 'text-accent-600 hover:text-accent-700 hover:bg-accent-50'
          }`}
        >
          Open
        </button>

        {/* Toggle switch */}
        <SettingsToggle
          checked={module.enabled}
          onChange={onToggle}
          size="md"
        />
      </div>
    </div>
  );
};

export default ModulesSettingsPanel;
