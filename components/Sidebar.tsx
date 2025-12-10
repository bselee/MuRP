

import React from 'react';
import Button from '@/components/ui/Button';
import type { Page } from '../App';
import type { User } from '../types';
import { HomeIcon, PackageIcon, DocumentTextIcon, CogIcon, MuRPLogo, ChevronDoubleLeftIcon, WrenchScrewdriverIcon, BeakerIcon, PhotoIcon, RobotIcon, Squares2X2Icon, UsersIcon, ChartBarIcon, CpuChipIcon } from './icons';
import { usePermissions } from '../hooks/usePermissions';
import { useTheme } from './ThemeProvider';
import UserSettingsDropdown from './UserSettingsDropdown';
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
    activeClass: string;
    inactiveClass: string;
    tooltipClass: string;
}> = ({ page, currentPage, setCurrentPage, icon, isCollapsed, notificationCount, activeClass, inactiveClass, tooltipClass }) => (
    <li>
        <a
            href="#"
            onClick={(e) => { e.preventDefault(); setCurrentPage(page); }}
            aria-label={`Navigate to ${page}${notificationCount ? `, ${notificationCount} pending items` : ''}`}
            aria-current={currentPage === page ? 'page' : undefined}
            className={`relative flex items-center p-2 text-base font-normal rounded-lg transition-colors duration-150 group border border-transparent ${currentPage === page ? activeClass : inactiveClass
                } ${isCollapsed ? 'justify-center' : ''}`}
        >
            {icon}
            <span className={`ml-3 whitespace-nowrap transition-opacity duration-200 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>{page}</span>
            {typeof notificationCount === 'number' && notificationCount > 0 && (
                <span className={`absolute top-1 right-1 flex items-center justify-center text-xs font-bold text-white bg-red-500 rounded-full h-5 ${isCollapsed ? 'w-5' : 'px-1.5'}`}>
                    {isCollapsed ? '' : notificationCount}
                    {isCollapsed && <span className="absolute w-2 h-2 bg-red-500 rounded-full"></span>}
                </span>
            )}
            {isCollapsed && (
                <span className={`pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 whitespace-nowrap rounded-lg px-3 py-1 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 ${tooltipClass}`}>
                    {page}
                </span>
            )}
        </a>
    </li>
);

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage, isCollapsed, onToggle, currentUser, pendingRequisitionCount, onOpenAiAssistant, onSignOut, onOpenSettings, systemAlerts = [] }) => {

    const permissions = usePermissions();
    const { resolvedTheme } = useTheme();
    const isLight = resolvedTheme === 'light';

    const asideClasses = isLight
        ? 'bg-white/90 border-amber-900/10 text-amber-900 shadow-[0_20px_60px_rgba(15,23,42,0.12)]'
        : 'bg-gray-800 border-gray-700 text-gray-100';

    const sectionBorder = isLight ? 'border-amber-900/10' : 'border-gray-700';
    const navActiveClass = isLight
        ? 'bg-amber-100 text-amber-900 shadow-inner border-amber-200'
        : 'bg-gray-700 text-white border-white/10';
    const navInactiveClass = isLight
        ? 'text-amber-900/70 hover:bg-amber-50 hover:text-amber-900'
        : 'text-gray-400 hover:bg-gray-700 hover:text-white';
    const aiLinkClass = isLight
        ? 'text-amber-900/70 hover:bg-amber-50 hover:text-amber-900'
        : 'text-gray-400 hover:bg-gray-700 hover:text-white';
    const toggleButtonClass = isLight
        ? 'bg-amber-200 hover:bg-amber-300 text-amber-900 border-amber-300'
        : 'bg-gray-600 hover:bg-accent-500 text-white border-gray-800';
    const tooltipClass = isLight
        ? 'bg-amber-900 text-amber-50 border border-amber-200 shadow-lg shadow-amber-900/20'
        : 'bg-gray-900 text-white border border-gray-600 shadow-xl shadow-black/40';

    type NavItemConfig = { page: Page; icon: React.ReactNode; notificationKey?: 'pendingRequisitions'; adminOnly?: boolean; managerAndUp?: boolean; isVisible?: (input: { user: User }) => boolean };

    const navItems: NavItemConfig[] = [
        { page: 'Dashboard', icon: <HomeIcon className="w-6 h-6" /> },
        { page: 'Projects', icon: <Squares2X2Icon className="w-6 h-6" /> },
        {
            page: 'Purchase Orders',
            icon: <DocumentTextIcon className="w-6 h-6" />,
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
        { page: 'Production', icon: <WrenchScrewdriverIcon className="w-6 h-6" />, managerAndUp: true },
        {
            page: 'BOMs',
            icon: <BeakerIcon className="w-6 h-6" />,
            managerAndUp: true,
            isVisible: () => permissions.canViewBoms
        },
        { page: 'Artwork', icon: <PhotoIcon className="w-6 h-6" />, managerAndUp: true },
        { page: 'Inventory', icon: <PackageIcon className="w-6 h-6" />, managerAndUp: true },
        { page: 'Inventory Intelligence', icon: <ChartBarIcon className="w-6 h-6" />, managerAndUp: true },
        { page: 'Agent Command Center', icon: <CpuChipIcon className="w-6 h-6" />, adminOnly: true },
        { page: 'Settings', icon: <CogIcon className="w-6 h-6" />, adminOnly: true },
    ];

    const getVisibleNavItems = () => {
        if (!currentUser) return [];
        const adminLike = currentUser.role === 'Admin' || currentUser.department === 'Operations';
        return navItems.filter(item => {
            if (adminLike) {
                return true;
            }
            if (currentUser.role === 'Manager') {
                if (item.adminOnly) return false;
            }
            if (currentUser.role === 'Staff') {
                if (item.adminOnly) return false;
                if (item.managerAndUp && !item.isVisible) {
                    return false;
                }
                if (item.managerAndUp && item.isVisible) {
                    return item.isVisible({ user: currentUser });
                }
            }
            if (item.isVisible) {
                return item.isVisible({ user: currentUser });
            }
            if (currentUser.role === 'Staff' && item.managerAndUp) {
                return false;
            }
            return true;
        });
    };

    const visibleNavItems = getVisibleNavItems();

    const notificationCounts = {
        pendingRequisitions: pendingRequisitionCount
    };

    return (
        <aside className={`${asideClasses} border-r flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}>
            <div className={`h-16 flex items-center border-b ${sectionBorder} relative ${isCollapsed ? 'justify-center' : 'px-4'}`}>
                {!isCollapsed && (
                    <>
                        <MuRPLogo className={`w-16 h-8 mr-3 ${isLight ? 'text-amber-700' : 'text-accent-200'}`} />
                        <div className={`text-2xl font-bold tracking-tight whitespace-nowrap ${isLight ? 'text-amber-900' : 'text-white'}`}>MuRP</div>
                    </>
                )}
                <Button
                    onClick={onToggle}
                    aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    aria-expanded={!isCollapsed}
                    className={`absolute -right-3 top-1/2 -translate-y-1/2 rounded-full p-1 border-2 transition-transform z-10 ${toggleButtonClass}`}
                >
                    <ChevronDoubleLeftIcon className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : 'rotate-0'}`} />
                </Button>
            </div>
            <nav aria-label="Main navigation" className="flex-1 px-2 py-4 space-y-2 overflow-y-auto">
                <ul role="list">
                    {visibleNavItems.map(item => (
                        <NavItem
                            key={item.page}
                            page={item.page}
                            currentPage={currentPage}
                            setCurrentPage={setCurrentPage}
                            icon={item.icon}
                            isCollapsed={isCollapsed}
                            notificationCount={item.notificationKey ? notificationCounts[item.notificationKey as keyof typeof notificationCounts] : undefined}
                            activeClass={navActiveClass}
                            inactiveClass={navInactiveClass}
                            tooltipClass={tooltipClass}
                        />
                    ))}
                </ul>
            </nav>
            <div className={`px-2 py-4 mt-auto border-t ${sectionBorder}`}>
                <UserSettingsDropdown
                    user={currentUser}
                    onSignOut={onSignOut}
                    onOpenSettings={onOpenSettings}
                    isCollapsed={isCollapsed}
                    systemAlerts={systemAlerts}
                />
                <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); onOpenAiAssistant(); }}
                    aria-label="Open MuRPBot AI Assistant"
                    className={`relative flex items-center space-x-2 p-2 text-base font-normal rounded-lg group ${aiLinkClass} ${isCollapsed ? 'justify-center' : ''}`}
                >
                    <div className="flex items-center justify-center">
                        <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 via-accent-500 to-purple-600 shadow-lg">
                            <RobotIcon className="w-5 h-5 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.65)]" />
                        </div>
                    </div>
                    <span className={`whitespace-nowrap transition-opacity duration-200 font-semibold ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-indigo-200 to-purple-200 uppercase tracking-widest">MB</span>
                        <span className="ml-1 text-sm text-inherit opacity-0 group-hover:opacity-100 transition-opacity duration-200">MuRPBot</span>
                    </span>
                    {isCollapsed && (
                        <span className={`pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 whitespace-nowrap rounded-lg px-3 py-1 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 ${tooltipClass}`}>
                            MB MuRPBot
                        </span>
                    )}
                </a>
            </div>
        </aside>
    );
};

export default Sidebar;
