import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../ThemeProvider';

export interface SubNavItem {
  id: string;
  label: string;
}

interface SettingsSubNavProps {
  items: SubNavItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
}

/**
 * Secondary navigation for Settings sections with multiple subsections.
 * Uses anchor links to scroll to content and highlights active section.
 */
const SettingsSubNav: React.FC<SettingsSubNavProps> = ({ items, activeId, onSelect }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [active, setActive] = useState(activeId || items[0]?.id);
  const navRef = useRef<HTMLDivElement>(null);

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
    <div
      ref={navRef}
      className={`sticky top-0 z-10 mb-6 -mx-6 px-6 py-3 border-b backdrop-blur-sm ${
        isDark
          ? 'bg-gray-900/95 border-gray-800'
          : 'bg-white/95 border-gray-200'
      }`}
    >
      <nav className="flex flex-wrap gap-1">
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleClick(item.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                isActive
                  ? isDark
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'bg-blue-50 text-blue-600'
                  : isDark
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default SettingsSubNav;
