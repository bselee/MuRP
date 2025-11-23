

import React from 'react';
import Button from '@/components/ui/Button';
import type { Page } from '../App';
import type { User } from '../types';
import { HomeIcon, PackageIcon, DocumentTextIcon, UsersIcon, LightBulbIcon, CogIcon, MushroomLogo, MagicSparklesIcon, ChevronDoubleLeftIcon, WrenchScrewdriverIcon, BeakerIcon, ClipboardListIcon, BotIcon, PhotoIcon, QrCodeIcon, ChartBarIcon } from './icons';
import { usePermissions } from '../hooks/usePermissions';
import { useTheme } from './ThemeProvider';

interface SidebarProps {
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
    isCollapsed: boolean;
    onToggle: () => void;
    currentUser: User;
    pendingRequisitionCount: number;
    onOpenAiAssistant: () => void;
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
}> = ({ page, currentPage, setCurrentPage, icon, isCollapsed, notificationCount, activeClass, inactiveClass }) => (
    <li>
        <a
            href="#"
            onClick={(e) => { e.preventDefault(); setCurrentPage(page); }}
            className={`relative flex items-center p-2 text-base font-normal rounded-lg transition-colors duration-150 group border border-transparent ${
                currentPage === page ? activeClass : inactiveClass
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
        </a>
    </li>
);

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage, isCollapsed, onToggle, currentUser, pendingRequisitionCount, onOpenAiAssistant }) => {
    
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
        : 'bg-gray-600 hover:bg-indigo-600 text-white border-gray-800';
    
    type NavItemConfig = { page: Page; icon: React.ReactNode; notificationKey?: 'pendingRequisitions'; adminOnly?: boolean; managerAndUp?: boolean; isVisible?: (input: { user: User }) => boolean };

    const navItems: NavItemConfig[] = [
        { page: 'Dashboard', icon: <HomeIcon className="w-6 h-6" /> },
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
                        <MushroomLogo className={`w-11 h-11 mr-3 ${isLight ? 'text-amber-700' : 'text-indigo-200'}`} />
                        <div className={`text-2xl font-bold tracking-tight whitespace-nowrap ${isLight ? 'text-amber-900' : 'text-white'}`}>MuRP</div>
                    </>
                )}
                <Button 
                    onClick={onToggle} 
                    className={`absolute -right-3 top-1/2 -translate-y-1/2 rounded-full p-1 border-2 transition-transform z-10 ${toggleButtonClass}`}
                >
                    <ChevronDoubleLeftIcon className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : 'rotate-0'}`} />
                </Button>
            </div>
            <nav className="flex-1 px-2 py-4 space-y-2 overflow-y-auto">
                <ul>
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
                        />
                    ))}
                </ul>
            </nav>
            <div className={`px-2 py-4 mt-auto border-t ${sectionBorder}`}>
                <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); onOpenAiAssistant(); }}
                    className={`flex items-center p-2 text-base font-normal rounded-lg group ${aiLinkClass} ${isCollapsed ? 'justify-center' : ''}`}
                >
                    <MagicSparklesIcon className="w-6 h-6" />
                    <span className={`ml-3 whitespace-nowrap transition-opacity duration-200 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>AI Assistant</span>
                </a>
            </div>
        </aside>
    );
};

export default Sidebar;
