import React from 'react';
import type { Page } from '../App';
import { HomeIcon, PackageIcon, DocumentTextIcon, CogIcon, PhotoIcon, BeakerIcon, CpuChipIcon } from './icons';

interface MobileNavProps {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  visiblePages?: Page[];
}

const defaultVisiblePages: Page[] = ['Dashboard', 'Inventory', 'Purchase Orders', 'Agent Command Center', 'Settings'];

const pageIcons: Record<string, React.FC<{ className?: string }>> = {
  Dashboard: HomeIcon,
  Inventory: PackageIcon,
  'Purchase Orders': DocumentTextIcon,
  BOMs: BeakerIcon,
  Artwork: PhotoIcon,
  Settings: CogIcon,
  'Agent Command Center': CpuChipIcon,
};

const MobileNav: React.FC<MobileNavProps> = ({
  currentPage,
  setCurrentPage,
  visiblePages = defaultVisiblePages,
}) => {
  // Only show first 5 items for mobile nav bar
  const navItems = visiblePages.slice(0, 5);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900/95 backdrop-blur-lg border-t border-gray-700 md:hidden"
      aria-label="Mobile navigation"
    >
      <ul className="flex items-center justify-around h-16 px-2">
        {navItems.map((page) => {
          const Icon = pageIcons[page] || HomeIcon;
          const isActive = currentPage === page;

          return (
            <li key={page} className="flex-1">
              <button
                onClick={() => setCurrentPage(page)}
                aria-label={`Navigate to ${page}`}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full h-full flex flex-col items-center justify-center gap-1 transition-colors min-h-[44px] min-w-[44px] ${isActive
                    ? 'text-accent-400'
                    : 'text-gray-400 hover:text-gray-200 active:text-accent-300'
                  }`}
              >
                <Icon className="w-6 h-6" aria-hidden="true" />
                <span className={`text-[10px] font-medium truncate max-w-full px-1 ${isActive ? 'text-accent-400' : 'text-gray-500'
                  }`}>
                  {/* Shorten long labels for mobile */}
                  {page === 'Purchase Orders' ? 'POs' : page === 'Agent Command Center' ? 'Agents' : page}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {/* Safe area padding for devices with home indicator */}
      <div className="h-safe-area-inset-bottom bg-gray-900/95" />
    </nav>
  );
};

export default MobileNav;
