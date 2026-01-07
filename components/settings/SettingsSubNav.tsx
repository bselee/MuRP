import React, { useState, useEffect } from 'react';
import { useTheme } from '../ThemeProvider';

export interface SubNavItem {
  id: string;
  label: string;
}

interface SettingsSubNavProps {
  items: SubNavItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  children: React.ReactNode;
}

/**
 * Two-column layout with vertical sidebar navigation for Settings sections
 * with multiple subsections. Eliminates scrolling by providing quick nav.
 */
const SettingsSubNav: React.FC<SettingsSubNavProps> = ({ items, activeId, onSelect, children }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [active, setActive] = useState(activeId || items[0]?.id);

  useEffect(() => {
    if (activeId) setActive(activeId);
  }, [activeId]);

  const handleClick = (id: string) => {
    setActive(id);
    onSelect?.(id);

    // Scroll to the element
    const element = document.getElementById(`subsection-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="flex gap-6">
      {/* Vertical sidebar navigation */}
      <nav
        className={`w-48 flex-shrink-0 sticky top-0 self-start py-2 rounded-lg border ${
          isDark
            ? 'bg-gray-900/50 border-gray-800'
            : 'bg-gray-50 border-gray-200'
        }`}
      >
        <ul className="space-y-0.5 px-2">
          {items.map((item) => {
            const isActive = active === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleClick(item.id)}
                  className={`w-full text-left px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? isDark
                        ? 'bg-blue-500/15 text-blue-400 border-l-2 border-blue-500 -ml-[2px] pl-[10px]'
                        : 'bg-blue-50 text-blue-600 border-l-2 border-blue-500 -ml-[2px] pl-[10px]'
                      : isDark
                        ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Content area */}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
};

export default SettingsSubNav;
