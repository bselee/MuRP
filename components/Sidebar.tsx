import React from 'react';
import Button from '@/components/ui/Button';
import type { Page } from '../App';
import type { User } from '../types';
import { HomeIcon, PackageIcon, DocumentTextIcon, CogIcon, ChevronDoubleLeftIcon, WrenchScrewdriverIcon, BeakerIcon, PhotoIcon, RobotIcon, Squares2X2Icon, CpuChipIcon, ShieldCheckIcon } from './icons';
import { usePermissions } from '../hooks/usePermissions';
import { useTheme } from './ThemeProvider';
import useModuleVisibility from '../hooks/useModuleVisibility';
import UserSettingsDropdown from './UserSettingsDropdown';
import MuRPLogo from './MuRPLogo';
import type { SystemAlert } from '../lib/systemAlerts/SystemAlertContext';

interface SidebarProps {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  currentUser: User;
  pendingRequisitionCount: number;
  onOpenAiAssistant: () => void;
  onSignOut: () => void;
  onOpenSettings: () => void;
  systemAlerts?: SystemAlert[];
}

const NavItem: React.FC<{
  page: Page;
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  icon: React.ReactNode;
  isCollapsed: boolean;
  notificationCount?: number;
  isDark: boolean;
}> = ({ page, currentPage, setCurrentPage, icon, isCollapsed, notificationCount, isDark }) => {
  const isActive = currentPage === page;

  return (
    <li>
      <a
        href="#"
        onClick={(e) => { e.preventDefault(); setCurrentPage(page); }}
        aria-label={`Navigate to ${page}${notificationCount ? `, ${notificationCount} pending items` : ''}`}
        aria-current={isActive ? 'page' : undefined}
        className={`relative flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors group ${
          isActive
            ? isDark
              ? 'bg-gray-800 text-white border-l-2 border-accent-400 -ml-[2px] pl-[14px]'
              : 'bg-gray-100 text-gray-900 border-l-2 border-accent-500 -ml-[2px] pl-[14px]'
            : isDark
              ? 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        } ${isCollapsed ? 'justify-center px-2' : ''}`}
      >
        <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>{icon}</span>
        <span className={`ml-3 whitespace-nowrap transition-opacity duration-200 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>
          {page}
        </span>
        {typeof notificationCount === 'number' && notificationCount > 0 && (
          <span className={`absolute top-1 right-1 flex items-center justify-center text-xs font-bold text-white bg-red-500 rounded-full h-5 ${isCollapsed ? 'w-5' : 'px-1.5'}`}>
            {isCollapsed ? '' : notificationCount}
            {isCollapsed && <span className="absolute w-2 h-2 bg-red-500 rounded-full"></span>}
          </span>
        )}
        {isCollapsed && (
          <span className={`pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 ${
            isDark ? 'bg-gray-800 text-white border border-gray-700' : 'bg-white text-gray-900 border border-gray-200 shadow-sm'
          }`}>
            {page}
          </span>
        )}
      </a>
    </li>
  );
};

const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  setCurrentPage,
  isCollapsed,
  onToggle,
  currentUser,
  pendingRequisitionCount,
  onOpenAiAssistant,
  onSignOut,
  onOpenSettings,
  systemAlerts = []
}) => {
  const permissions = usePermissions();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { isPageVisibleInSidebar } = useModuleVisibility();

  type NavItemConfig = {
    page: Page;
    icon: React.ReactNode;
    notificationKey?: 'pendingRequisitions';
    adminOnly?: boolean;
    managerAndUp?: boolean;
    isVisible?: (input: { user: User }) => boolean;
  };

  const navItems: NavItemConfig[] = [
    { page: 'Dashboard', icon: <HomeIcon className="w-5 h-5" /> },
    { page: 'Projects', icon: <Squares2X2Icon className="w-5 h-5" /> },
    {
      page: 'Purchase Orders',
      icon: <DocumentTextIcon className="w-5 h-5" />,
      managerAndUp: true,
      notificationKey: 'pendingRequisitions',
      isVisible: ({ user }) => {
        if (user.role === 'Admin' || user.department === 'Operations') return true;
        if (user.role === 'Manager') return true;
        if (user.role === 'Staff') {
          return permissions.canSubmitRequisition || permissions.canManagePurchaseOrders;
        }
        return false;
      }
    },
    { page: 'Production', icon: <WrenchScrewdriverIcon className="w-5 h-5" />, managerAndUp: true },
    {
      page: 'BOMs',
      icon: <BeakerIcon className="w-5 h-5" />,
      managerAndUp: true,
      isVisible: () => permissions.canViewBoms
    },
    { page: 'Artwork', icon: <PhotoIcon className="w-5 h-5" />, managerAndUp: true },
    { page: 'Inventory', icon: <PackageIcon className="w-5 h-5" />, managerAndUp: true },
    { page: 'Compliance', icon: <ShieldCheckIcon className="w-5 h-5" />, managerAndUp: true },
    { page: 'Agent Command Center', icon: <CpuChipIcon className="w-5 h-5" />, adminOnly: true },
    { page: 'Settings', icon: <CogIcon className="w-5 h-5" />, adminOnly: true },
  ];

  const getVisibleNavItems = () => {
    if (!currentUser) return [];
    const adminLike = currentUser.role === 'Admin' || currentUser.department === 'Operations';
    return navItems.filter(item => {
      // Check module visibility first (for toggleable modules)
      if (!isPageVisibleInSidebar(item.page)) return false;

      if (adminLike) return true;
      if (currentUser.role === 'Manager') {
        if (item.adminOnly) return false;
      }
      if (currentUser.role === 'Staff') {
        if (item.adminOnly) return false;
        if (item.managerAndUp && !item.isVisible) return false;
        if (item.managerAndUp && item.isVisible) {
          return item.isVisible({ user: currentUser });
        }
      }
      if (item.isVisible) {
        return item.isVisible({ user: currentUser });
      }
      if (currentUser.role === 'Staff' && item.managerAndUp) return false;
      return true;
    });
  };

  const visibleNavItems = getVisibleNavItems();
  const notificationCounts = { pendingRequisitions: pendingRequisitionCount };

  return (
    <aside
      className={`flex-shrink-0 hidden md:flex flex-col transition-all duration-300 ease-in-out border-r ${
        isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
      } ${isCollapsed ? 'w-20' : 'w-60'}`}
    >
      {/* Header with logo - h-16 (64px) for alignment */}
      <div className={`h-16 flex items-center border-b ${
        isDark ? 'border-gray-800' : 'border-gray-200'
      }`}>
        <MuRPLogo collapsed={isCollapsed} />
      </div>

      {/* Collapse toggle - positioned below logo */}
      <div className="relative">
        <button
          type="button"
          onClick={onToggle}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!isCollapsed}
          className={`absolute -right-3 top-2 rounded-full p-1 border transition-transform z-10 ${
            isDark
              ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700'
              : 'bg-white border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 shadow-sm'
          }`}
        >
          <ChevronDoubleLeftIcon className={`w-3 h-3 transition-transform duration-200 ${isCollapsed ? 'rotate-180' : 'rotate-0'}`} />
        </button>
      </div>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="flex-1 px-3 py-4 overflow-y-auto">
        <ul role="list" className="space-y-0.5">
          {visibleNavItems.map(item => (
            <NavItem
              key={item.page}
              page={item.page}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              icon={item.icon}
              isCollapsed={isCollapsed}
              notificationCount={item.notificationKey ? notificationCounts[item.notificationKey as keyof typeof notificationCounts] : undefined}
              isDark={isDark}
            />
          ))}
        </ul>
      </nav>

      {/* Footer with user and AI assistant */}
      <div className={`px-3 py-3 border-t ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
        <UserSettingsDropdown
          user={currentUser}
          onSignOut={onSignOut}
          onOpenSettings={onOpenSettings}
          isCollapsed={isCollapsed}
          systemAlerts={systemAlerts}
        />

        {/* AI Assistant button */}
        <button
          type="button"
          onClick={onOpenAiAssistant}
          aria-label="Open MuRPBot AI Assistant"
          className={`w-full flex items-center px-3 py-2 mt-2 text-sm font-medium rounded-md transition-colors group ${
            isDark
              ? 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          } ${isCollapsed ? 'justify-center px-2' : ''}`}
        >
          <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
            <RobotIcon className="w-5 h-5" />
          </span>
          <span className={`ml-3 whitespace-nowrap transition-opacity duration-200 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>
            MuRPBot
          </span>
          {isCollapsed && (
            <span className={`pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 ${
              isDark ? 'bg-gray-800 text-white border border-gray-700' : 'bg-white text-gray-900 border border-gray-200 shadow-sm'
            }`}>
              MuRPBot
            </span>
          )}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
