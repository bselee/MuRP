import React from 'react';
import { useTheme } from '../ThemeProvider';
import type { SettingsSectionId, SettingsGroup, SettingsSectionConfig } from './settingsConfig';

interface SettingsSidebarProps {
  sections: Map<SettingsGroup, SettingsSectionConfig[]>;
  activeSection: SettingsSectionId;
  onSelect: (section: SettingsSectionId) => void;
  onClose?: () => void;
}

const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  sections,
  activeSection,
  onSelect,
  onClose,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const handleSelect = (sectionId: SettingsSectionId) => {
    onSelect(sectionId);
    onClose?.();
  };

  return (
    <nav className="h-full overflow-y-auto py-6 px-4">
      <div className="space-y-6">
        {Array.from(sections.entries()).map(([group, groupSections]) => (
          <div key={group}>
            {/* Group header */}
            <h3
              className={`text-xs font-semibold uppercase tracking-wider mb-2 px-3 ${
                isDark ? 'text-gray-500' : 'text-gray-400'
              }`}
            >
              {group}
            </h3>

            {/* Section links */}
            <ul className="space-y-0.5">
              {groupSections.map((section) => {
                const isActive = activeSection === section.id;
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(section.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive
                          ? isDark
                            ? 'bg-gray-800 text-white border-l-2 border-accent-400'
                            : 'bg-gray-100 text-gray-900 border-l-2 border-accent-500'
                          : isDark
                            ? 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      {section.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
};

export default SettingsSidebar;
