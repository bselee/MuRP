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
            {/* Group header - subtle uppercase label */}
            <h3
              className={`text-[11px] font-semibold uppercase tracking-wider mb-2 px-3 ${
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
                            ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500 -ml-[2px] pl-[14px]'
                            : 'bg-blue-50 text-blue-600 border-l-2 border-blue-500 -ml-[2px] pl-[14px]'
                          : isDark
                            ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
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
